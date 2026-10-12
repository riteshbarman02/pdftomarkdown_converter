import { collapseSpaces } from "./text-normalize";
import { runsToSegments } from "./segments";
import type { Line, Segment, TextRun } from "./types";

export interface TableCandidate {
  /** Index range [start, end) into the region's lines. */
  start: number;
  end: number;
  rows: Segment[][][];
  columns: number;
  plain: string;
}

export interface TableDetection {
  tables: TableCandidate[];
  /** Candidate groups that looked tabular but were not confident enough. */
  rejected: number;
}

const CELL_GAP_EM = 1.5;

/** Splits a line's runs into cells wherever there is a wide horizontal gap. */
export function splitCells(line: Line): TextRun[][] {
  const cells: TextRun[][] = [];
  const threshold = Math.max(CELL_GAP_EM * line.fontSize, 12);
  let cur: TextRun[] = [];
  let prevEnd = -Infinity;
  for (const run of line.runs) {
    if (cur.length && run.x - prevEnd > threshold) {
      cells.push(cur);
      cur = [];
    }
    cur.push(run);
    prevEnd = Math.max(prevEnd, run.x + run.width);
  }
  if (cur.length) cells.push(cur);
  return cells;
}

interface Interval {
  a: number;
  b: number;
}

function unionIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((p, q) => p.a - q.a);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.a <= last.b) last.b = Math.max(last.b, iv.b);
    else out.push({ ...iv });
  }
  return out;
}

/**
 * Finds tables in a region's lines. A table is a run of vertically adjacent lines
 * that each split into several cells and whose cells line up in shared columns.
 * Anything less certain is left as ordinary text.
 */
export function detectTables(lines: Line[], bodySize: number): TableDetection {
  const tables: TableCandidate[] = [];
  let rejected = 0;
  const cellsPerLine = lines.map((l) => splitCells(l));

  let i = 0;
  while (i < lines.length) {
    if (cellsPerLine[i].length < 2) {
      i++;
      continue;
    }
    let j = i + 1;
    while (
      j < lines.length &&
      cellsPerLine[j].length >= 2 &&
      lines[j].y - lines[j - 1].y <= Math.max(3.2 * lines[j].fontSize, 3.2 * bodySize * 0.8)
    ) {
      j++;
    }
    const group = lines.slice(i, j);
    const groupCells = cellsPerLine.slice(i, j);
    if (group.length >= 2) {
      const table = buildTable(group, groupCells);
      if (table) tables.push({ ...table, start: i, end: j });
      else rejected++;
    }
    i = j;
  }
  return { tables, rejected };
}

function buildTable(
  group: Line[],
  groupCells: TextRun[][][],
): Omit<TableCandidate, "start" | "end"> | null {
  const intervals: Interval[] = [];
  for (const cells of groupCells) {
    for (const cell of cells) {
      intervals.push({
        a: Math.min(...cell.map((r) => r.x)),
        b: Math.max(...cell.map((r) => r.x + r.width)),
      });
    }
  }
  const columns = unionIntervals(intervals);
  if (columns.length < 2) return null;

  const rows: Segment[][][] = [];
  let aligned = 0;
  for (let r = 0; r < groupCells.length; r++) {
    const row: Segment[][] = Array.from({ length: columns.length }, () => []);
    const filled = new Set<number>();
    for (const cell of groupCells[r]) {
      const cx =
        (Math.min(...cell.map((c) => c.x)) + Math.max(...cell.map((c) => c.x + c.width))) / 2;
      let idx = columns.findIndex((c) => cx >= c.a && cx <= c.b);
      if (idx < 0) idx = 0;
      const segs = runsToSegments(cell, group[r].fontSize);
      if (row[idx].length) row[idx].push({ text: " " });
      row[idx].push(...segs);
      filled.add(idx);
    }
    if (filled.size === columns.length) aligned++;
    rows.push(row);
  }

  const confidence = aligned / rows.length;
  if (confidence < 0.6) return null;

  // Two-"column" ragged prose is far more likely than a table: require short cells.
  const plainRows = rows.map((row) =>
    row.map((cell) => collapseSpaces(cell.map((s) => s.text).join(""))),
  );
  const cellLengths = plainRows.flat().filter(Boolean).map((t) => t.length);
  const avg = cellLengths.reduce((a, b) => a + b, 0) / Math.max(1, cellLengths.length);
  if (columns.length === 2 && avg > 45) return null;
  if (avg > 80) return null;

  return {
    rows,
    columns: columns.length,
    plain: plainRows.map((r) => r.join(" ")).join("\n"),
  };
}
