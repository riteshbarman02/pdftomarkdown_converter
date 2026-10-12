import { collapseSpaces, isCjk } from "./text-normalize";
import { detectTables } from "./detect-tables";
import { runsToSegments } from "./segments";

export { runsToSegments };
import type { Block, ExtractedPage, Line, Segment, TextRun } from "./types";
import type { ConversionSettings } from "@/lib/validation/conversion-schema";

export interface DocStats {
  bodySize: number;
  lineSpacing: number;
  bodyBold: boolean;
}

// ---------------------------------------------------------------- geometry

/** Groups runs into visual rows by baseline, each sorted left-to-right. */
export function groupRows(runs: TextRun[]): TextRun[][] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { ref: number; size: number; runs: TextRun[] }[] = [];
  for (const run of sorted) {
    const row = rows.find((r) => Math.abs(run.y - r.ref) <= 0.4 * Math.max(run.fontSize, r.size));
    if (row) {
      row.runs.push(run);
      row.size = Math.max(row.size, run.fontSize);
    } else {
      rows.push({ ref: run.y, size: run.fontSize, runs: [run] });
    }
  }
  return rows
    .sort((a, b) => a.ref - b.ref)
    .map((r) => {
      const byX = r.runs.sort((a, b) => a.x - b.x);
      // Drop exact duplicates produced by "fake bold" overprinting.
      return byX.filter(
        (run, i) =>
          !(
            i > 0 &&
            byX[i - 1].text === run.text &&
            Math.abs(byX[i - 1].x - run.x) < 1 &&
            Math.abs(byX[i - 1].y - run.y) < 1
          ),
      );
    });
}

export function buildLine(runs: TextRun[], region: number): Line {
  const segments = runsToSegments(runs);
  const plain = collapseSpaces(segments.map((s) => s.text).join(""));
  const bySize = new Map<number, number>();
  for (const r of runs) {
    const k = Math.round(r.fontSize * 2) / 2;
    bySize.set(k, (bySize.get(k) ?? 0) + r.text.length);
  }
  const fontSize = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return {
    runs,
    segments,
    plain,
    x0: Math.min(...runs.map((r) => r.x)),
    x1: Math.max(...runs.map((r) => r.x + r.width)),
    y: runs[0].y,
    fontSize,
    bold: runs.every((r) => r.bold || !r.text.trim()),
    region,
  };
}

// ---------------------------------------------------------------- doc stats

export function computeDocStats(pages: ExtractedPage[]): DocStats {
  const sizeChars = new Map<number, { chars: number; bold: number }>();
  for (const page of pages) {
    for (const r of page.runs) {
      const k = Math.round(r.fontSize * 2) / 2;
      const e = sizeChars.get(k) ?? { chars: 0, bold: 0 };
      e.chars += r.text.length;
      if (r.bold) e.bold += r.text.length;
      sizeChars.set(k, e);
    }
  }
  let bodySize = 11;
  let best = -1;
  let bodyBold = false;
  for (const [size, e] of sizeChars) {
    if (e.chars > best) {
      best = e.chars;
      bodySize = size;
      bodyBold = e.bold / e.chars > 0.6;
    }
  }

  const diffs: number[] = [];
  for (const page of pages) {
    const rows = groupRows(page.runs);
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i][0].y - rows[i - 1][0].y;
      const sz = rows[i][0].fontSize;
      if (Math.abs(sz - bodySize) < 0.6 && d > 0.9 * bodySize && d < 2.0 * bodySize) diffs.push(d);
    }
  }
  diffs.sort((a, b) => a - b);
  const lineSpacing = diffs.length ? diffs[Math.floor(diffs.length / 2)] : bodySize * 1.2;
  return { bodySize, lineSpacing, bodyBold };
}

// ---------------------------------------------------------------- columns

interface Gutter {
  left: number;
  right: number;
}

/** Finds a clear vertical gutter separating two text columns, if there is one. */
export function findGutter(rows: TextRun[][], pageWidth: number, bodySize: number): Gutter | null {
  if (rows.length < 8) return null;
  const lo = Math.floor(pageWidth * 0.25);
  const hi = Math.ceil(pageWidth * 0.75);
  const allowed = Math.max(1, Math.floor(rows.length * 0.08));

  const free: boolean[] = [];
  for (let x = lo; x <= hi; x++) {
    let crossing = 0;
    for (const row of rows) {
      if (row.some((r) => r.x <= x && r.x + r.width >= x)) crossing++;
    }
    free.push(crossing <= allowed);
  }

  let best: Gutter | null = null;
  let start = -1;
  for (let i = 0; i <= free.length; i++) {
    if (i < free.length && free[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const g = { left: lo + start, right: lo + i - 1 };
      if (!best || g.right - g.left > best.right - best.left) best = g;
      start = -1;
    }
  }
  if (!best || best.right - best.left < Math.max(10, 0.9 * bodySize)) return null;

  const mid = (best.left + best.right) / 2;
  const sideInfo = (leftSide: boolean) => {
    let count = 0;
    let tabular = 0;
    let words = 0;
    let widthSum = 0;
    for (const row of rows) {
      const side = row.filter((r) => (r.x + r.width / 2 < mid) === leftSide);
      if (!side.length) continue;
      count++;
      words += side.map((r) => r.text).join(" ").split(/\s+/).filter(Boolean).length;
      for (let i = 1; i < side.length; i++) {
        if (side[i].x - (side[i - 1].x + side[i - 1].width) > 2.5 * side[i].fontSize) {
          tabular++;
          break;
        }
      }
      widthSum += Math.max(...side.map((r) => r.x + r.width)) - Math.min(...side.map((r) => r.x));
    }
    return { count, tabular, words, widthSum };
  };
  const L = sideInfo(true);
  const R = sideInfo(false);
  if (L.count < 4 || R.count < 4) return null;
  if (L.tabular / L.count > 0.25 || R.tabular / R.count > 0.25) return null;
  if (L.words / L.count < 3 || R.words / R.count < 3) return null;
  const leftWidth = best.left - Math.min(...rows.flat().map((r) => r.x));
  const rightWidth = Math.max(...rows.flat().map((r) => r.x + r.width)) - best.right;
  if (L.widthSum / L.count < 0.45 * leftWidth || R.widthSum / R.count < 0.45 * rightWidth) {
    return null;
  }
  return best;
}

/** Builds lines for a page in reading order (two-column aware). */
export function buildPageLines(page: ExtractedPage, stats: DocStats): Line[] {
  const rows = groupRows(page.runs);
  if (!rows.length) return [];
  const gutter = findGutter(rows, page.width, stats.bodySize);

  const lines: Line[] = [];
  let region = 0;
  if (!gutter) {
    for (const row of rows) lines.push(buildLine(row, region));
    return lines;
  }

  const mid = (gutter.left + gutter.right) / 2;
  let leftRows: TextRun[][] = [];
  let rightRows: TextRun[][] = [];
  let lastWasFull = false;
  const flush = () => {
    if (leftRows.length) {
      region++;
      for (const r of leftRows) lines.push(buildLine(r, region));
    }
    if (rightRows.length) {
      region++;
      for (const r of rightRows) lines.push(buildLine(r, region));
    }
    leftRows = [];
    rightRows = [];
  };
  for (const row of rows) {
    const crosses = row.some((r) => r.x < mid && r.x + r.width > mid);
    if (crosses) {
      flush();
      if (!lastWasFull) region++;
      lines.push(buildLine(row, region));
      lastWasFull = true;
    } else {
      lastWasFull = false;
      const l = row.filter((r) => r.x + r.width / 2 < mid);
      const r = row.filter((r) => r.x + r.width / 2 >= mid);
      if (l.length) leftRows.push(l);
      if (r.length) rightRows.push(r);
    }
  }
  flush();
  return lines;
}

// ---------------------------------------------------------------- headers / footers

const PAGE_NUMBER = /^(page\s+)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?$/i;
const marginKey = (t: string) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

/** Removes running headers/footers and bare page numbers. Returns the number of lines removed. */
export function removeRunningMargins(
  pages: { page: ExtractedPage; lines: Line[] }[],
  bodySize: number,
): number {
  // Running headers/footers are set at body size or smaller; larger text in the top margin
  // (e.g. a heading that starts every page) is content and must be kept.
  const inMargin = (p: ExtractedPage, l: Line) =>
    l.fontSize <= bodySize * 1.1 && (l.y < p.height * 0.1 || l.y > p.height * 0.92);
  const counts = new Map<string, number>();
  for (const { page, lines } of pages) {
    const keys = new Set(lines.filter((l) => inMargin(page, l)).map((l) => marginKey(l.plain)));
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const minCount = Math.max(2, Math.ceil(pages.length * 0.5));
  let removed = 0;
  for (const entry of pages) {
    const kept = entry.lines.filter((l) => {
      if (!inMargin(entry.page, l)) return true;
      const drop =
        PAGE_NUMBER.test(l.plain.trim()) ||
        (pages.length >= 2 && (counts.get(marginKey(l.plain)) ?? 0) >= minCount);
      if (drop) removed++;
      return !drop;
    });
    entry.lines = kept;
  }
  return removed;
}

// ---------------------------------------------------------------- lists

const BULLET = /^([\u2022\u25E6\u25AA\u25AB\u25CF\u25CB\u25A0\u25A1\u2023\u2043\u2219\u00B7\u25C6\u25C7\u25B6\u25BA\u27A2\u2713\u2714\u2013\u2014-]|\*)\s+/u;
const NUMBER = /^(\d{1,3})[.)]\s+/;

export interface ListMarker {
  ordered: boolean;
  number?: number;
  length: number;
}

export function parseListMarker(text: string): ListMarker | null {
  const b = text.match(BULLET);
  if (b && text.slice(b[0].length).trim()) return { ordered: false, length: b[0].length };
  const n = text.match(NUMBER);
  if (n && text.slice(n[0].length).trim()) {
    return { ordered: true, number: parseInt(n[1], 10), length: n[0].length };
  }
  return null;
}

/** Removes the first `count` visible characters (and following spaces) from segments. */
function stripPrefix(segments: Segment[], count: number): Segment[] {
  const out: Segment[] = [];
  let remaining = count;
  let lead = true;
  for (const seg of segments) {
    let text = seg.text;
    if (remaining > 0) {
      const lead0 = text.match(/^\s*/)![0].length;
      if (lead) text = text.slice(lead0);
      const take = Math.min(remaining, text.length);
      text = text.slice(take);
      remaining -= take;
    }
    if (remaining <= 0 && lead) text = text.replace(/^\s+/, "");
    if (!text) continue;
    if (remaining <= 0) lead = false;
    out.push({ ...seg, text });
  }
  return out;
}

function joinSegments(prev: Segment[], next: Segment[]): Segment[] {
  if (!prev.length) return next;
  if (!next.length) return prev;
  const prevText = prev.map((s) => s.text).join("");
  const nextText = next.map((s) => s.text).join("");
  const last = prevText.trimEnd().slice(-1);
  const first = nextText.trimStart()[0];
  const prevPrev = prevText.trimEnd().slice(-2, -1);
  if (last === "-" && /\p{L}/u.test(prevPrev) && /\p{Ll}/u.test(first ?? "")) {
    return [...prev, ...next];
  }
  if (isCjk(last) && isCjk(first)) return [...prev, ...next];
  return [...prev, { text: " " }, ...next];
}

// ---------------------------------------------------------------- blocks

interface Para {
  lines: Line[];
  list?: { marker: ListMarker; markerX: number; textX: number };
}

const TERMINAL = /[.!?:;\u201D"')\]]$/;

export interface LayoutOutcome {
  blocks: Block[];
  tables: number;
  rejectedTables: number;
}

/** Turns ordered lines of one page into structural blocks. */
export function linesToBlocks(
  lines: Line[],
  pageNumber: number,
  stats: DocStats,
  settings: ConversionSettings,
): LayoutOutcome {
  const blocks: Block[] = [];
  let tables = 0;
  let rejectedTables = 0;

  // Process region by region (regions never merge into one paragraph).
  const regions: Line[][] = [];
  for (const line of lines) {
    const last = regions[regions.length - 1];
    if (last && last[0].region === line.region) last.push(line);
    else regions.push([line]);
  }

  for (const region of regions) {
    const detection = settings.detectTables
      ? detectTables(region, stats.bodySize)
      : { tables: [], rejected: 0 };
    rejectedTables += detection.rejected;
    let cursor = 0;
    const flushText = (to: number) => {
      if (to > cursor) blocks.push(...paragraphsFromLines(region.slice(cursor, to), pageNumber, stats, settings));
    };
    for (const t of detection.tables) {
      flushText(t.start);
      blocks.push({
        type: "table",
        rows: t.rows,
        plain: t.plain,
        page: pageNumber,
        columns: t.columns,
      });
      tables++;
      cursor = t.end;
    }
    flushText(region.length);
  }

  return { blocks, tables, rejectedTables };
}

function paragraphsFromLines(
  lines: Line[],
  page: number,
  stats: DocStats,
  settings: ConversionSettings,
): Block[] {
  const regionRight = Math.max(...lines.map((l) => l.x1));
  const regionLeft = Math.min(...lines.map((l) => l.x0));
  const regionWidth = Math.max(1, regionRight - regionLeft);

  const paras: Para[] = [];
  let cur: Para | null = null;

  const continues = (para: Para, line: Line): boolean => {
    const prev = para.lines[para.lines.length - 1];
    if (!settings.preserveParagraphs) return false;
    const scale = Math.max(prev.fontSize, line.fontSize) / stats.bodySize;
    const dy = line.y - prev.y;
    if (dy > stats.lineSpacing * 1.35 * Math.max(1, scale)) return false;
    if (Math.abs(line.fontSize - prev.fontSize) > Math.max(0.8, prev.fontSize * 0.12)) return false;
    if (line.bold !== prev.bold && (line.bold || prev.bold)) return false;
    if (para.list) {
      if (line.x0 >= para.list.textX - 0.5 * line.fontSize) return true;
      // wrapped item whose continuation lines start at the marker column
      return prev.x1 > regionRight - 2.5 * line.fontSize && Math.abs(line.x0 - para.list.markerX) < line.fontSize;
    }
    if (line.x0 - prev.x0 > 1.2 * line.fontSize) return false; // first-line indent
    if (prev.x1 < regionRight - 0.3 * regionWidth && TERMINAL.test(prev.plain)) return false;
    return true;
  };

  for (const line of lines) {
    let marker: ListMarker | null = null;
    if (settings.preserveLists) {
      marker = parseListMarker(line.plain);
      // "1. Introduction" set in a heading size is a heading, not a list item
      if (marker?.ordered && line.fontSize > stats.bodySize * 1.15) marker = null;
    }
    if (marker) {
      const textX = line.runs.length > 1 ? line.runs[1].x : line.x0 + line.fontSize * 1.2;
      cur = { lines: [line], list: { marker, markerX: line.x0, textX: Math.max(textX, line.x0 + 4) } };
      paras.push(cur);
    } else if (cur && continues(cur, line)) {
      cur.lines.push(line);
    } else {
      cur = { lines: [line] };
      paras.push(cur);
    }
  }

  // list depth from marker x-positions
  const listXs = [...new Set(paras.filter((p) => p.list).map((p) => Math.round(p.list!.markerX)))].sort(
    (a, b) => a - b,
  );
  const clusters: number[] = [];
  for (const x of listXs) {
    if (!clusters.length || x - clusters[clusters.length - 1] > 0.8 * stats.bodySize) clusters.push(x);
  }

  const out: Block[] = [];
  for (const para of paras) {
    let segments: Segment[] = [];
    for (const l of para.lines) segments = joinSegments(segments, l.segments);
    const plain = collapseSpaces(segments.map((s) => s.text).join(""));
    if (!plain) continue;

    if (para.list) {
      const stripped = stripPrefix(segments, para.list.marker.length);
      const depth = Math.max(
        0,
        clusters.findLastIndex((c) => Math.round(para.list!.markerX) >= c - 0.8 * stats.bodySize),
      );
      out.push({
        type: "list-item",
        ordered: para.list.marker.ordered,
        number: para.list.marker.number,
        depth,
        segments: stripped,
        plain: collapseSpaces(stripped.map((s) => s.text).join("")),
        page,
      });
      continue;
    }

    if (!settings.preserveParagraphs && para.lines.length > 1) {
      // keep every visual line as its own paragraph
      for (const l of para.lines) {
        out.push({ type: "paragraph", segments: l.segments, plain: l.plain, page });
      }
      continue;
    }

    const first = para.lines[0];
    const size = Math.round(first.fontSize * 2) / 2;
    const allBold = para.lines.every((l) => l.bold);
    const sameSize = para.lines.every((l) => Math.abs(l.fontSize - first.fontSize) < 0.8);
    if (settings.preserveHeadings && para.lines.length <= 2 && sameSize && plain.length <= 160) {
      const bigger = first.fontSize >= stats.bodySize * 1.15;
      const boldOnly =
        !bigger &&
        allBold &&
        !stats.bodyBold &&
        first.fontSize >= stats.bodySize * 0.95 &&
        para.lines.length === 1 &&
        plain.length <= 90 &&
        !/[.,;]$/.test(plain) &&
        /\p{L}/u.test(plain);
      if (bigger || boldOnly) {
        out.push({ type: "heading", level: 0, segments, plain, page, size, boldOnly });
        continue;
      }
    }
    out.push({ type: "paragraph", segments, plain, page });
  }
  return out;
}

/** Assigns heading levels across the whole document, largest font size = level 1. */
export function assignHeadingLevels(pages: Block[][]): void {
  const sizes: number[] = [];
  for (const blocks of pages) {
    for (const b of blocks) {
      if (b.type === "heading" && !b.boldOnly && b.size) sizes.push(b.size);
    }
  }
  const distinct: number[] = [];
  for (const s of [...new Set(sizes)].sort((a, b) => b - a)) {
    if (!distinct.length || distinct[distinct.length - 1] - s > 0.75) distinct.push(s);
  }
  const levelFor = (size: number) => {
    const idx = distinct.findIndex((d) => Math.abs(d - size) <= 0.75);
    return Math.min(6, (idx < 0 ? distinct.length : idx) + 1);
  };
  for (const blocks of pages) {
    for (const b of blocks) {
      if (b.type !== "heading") continue;
      b.level = b.boldOnly
        ? distinct.length === 0
          ? 2
          : Math.min(6, distinct.length + 1)
        : levelFor(b.size ?? 0);
    }
  }
}
