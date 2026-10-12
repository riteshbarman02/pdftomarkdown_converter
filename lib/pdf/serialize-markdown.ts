import { createSlugger, escapeBlockStart, segmentsToMarkdown } from "./markdown";
import type { Block, PageResult, PdfMetadata } from "./types";
import type { ConversionSettings } from "@/lib/validation/conversion-schema";

function yamlString(value: string): string {
  // JSON strings are valid YAML double-quoted scalars.
  return JSON.stringify(value.replace(/[\u0000-\u001f\u007f]/g, " "));
}

function frontMatter(
  settings: ConversionSettings,
  meta: PdfMetadata,
  filename: string | undefined,
): string {
  const lines: string[] = ["---"];
  const title = meta.title ?? filename?.replace(/\.pdf$/i, "");
  if (title) lines.push(`title: ${yamlString(title)}`);
  if (filename) lines.push(`source: ${yamlString(filename)}`);
  lines.push(`pages: ${meta.pageCount}`);
  if (settings.includeMetadata) {
    if (meta.author) lines.push(`author: ${yamlString(meta.author)}`);
    if (meta.subject) lines.push(`subject: ${yamlString(meta.subject)}`);
    if (meta.keywords) lines.push(`keywords: ${yamlString(meta.keywords)}`);
    if (meta.creator) lines.push(`creator: ${yamlString(meta.creator)}`);
    if (meta.producer) lines.push(`producer: ${yamlString(meta.producer)}`);
    if (meta.creationDate) lines.push(`created: ${yamlString(meta.creationDate)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function tableToMarkdown(block: Extract<Block, { type: "table" }>, settings: ConversionSettings) {
  const cell = (segs: Parameters<typeof segmentsToMarkdown>[0], header: boolean) =>
    segmentsToMarkdown(segs, {
      flavor: settings.flavor,
      escapePipes: true,
      plainEmphasis: header, // header cells are already emphasised by the table renderer
    })
      .replace(/\s+/g, " ")
      .trim();
  const rows = block.rows.map((r, i) => r.map((c) => cell(c, i === 0)));
  if (settings.flavor === "gfm") {
    const [header, ...body] = rows;
    const fmt = (r: string[]) => `| ${r.join(" | ")} |`;
    return [fmt(header), fmt(header.map(() => "---")), ...body.map(fmt)].join("\n");
  }
  // Standard Markdown has no tables: keep columns aligned in a code block.
  const plain = block.rows.map((r) =>
    r.map((c) => c.map((s) => s.text).join("").replace(/\s+/g, " ").trim()),
  );
  const widths = plain[0].map((_, c) => Math.max(...plain.map((r) => (r[c] ?? "").length)));
  const lines = plain.map((r) => r.map((t, c) => t.padEnd(widths[c])).join("  ").trimEnd());
  return ["```", ...lines, "```"].join("\n");
}

function blockToMarkdown(block: Block, settings: ConversionSettings): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(1, block.level)))} ${segmentsToMarkdown(block.segments, {
        flavor: settings.flavor,
        plainEmphasis: true,
      })}`;
    case "paragraph":
      return escapeBlockStart(segmentsToMarkdown(block.segments, { flavor: settings.flavor }));
    case "list-item": {
      const marker = block.ordered ? `${block.number ?? 1}.` : "-";
      return `${"    ".repeat(block.depth)}${marker} ${segmentsToMarkdown(block.segments, { flavor: settings.flavor })}`;
    }
    case "table":
      return tableToMarkdown(block, settings);
    case "image":
      return `*[${block.count} image${block.count === 1 ? "" : "s"} on page ${block.page} not extracted]*`;
  }
}

/** Assembles the final Markdown document from per-page blocks. */
export function serializeDocument(
  pages: PageResult[],
  settings: ConversionSettings,
  meta: PdfMetadata,
  filename?: string,
): string {
  const parts: string[] = [];

  if (settings.frontMatter || settings.includeMetadata) {
    parts.push(frontMatter(settings, meta, filename));
  }

  if (settings.tableOfContents) {
    const slug = createSlugger();
    slug("Table of Contents");
    const headings = pages.flatMap((p) => p.blocks).filter((b) => b.type === "heading");
    if (headings.length) {
      const min = Math.min(...headings.map((h) => h.level));
      const items = headings.map(
        (h) => `${"  ".repeat(Math.max(0, h.level - min))}- [${segmentsToMarkdown([{ text: h.plain }], { flavor: settings.flavor, plainEmphasis: true }).replace(/[\[\]]/g, "\\$&")}](#${slug(h.plain)})`,
      );
      parts.push(["## Table of Contents", "", ...items].join("\n"));
    }
  }

  pages.forEach((page, i) => {
    const head: string[] = [];
    if (i > 0 && settings.pageSeparators) head.push("---");
    if (settings.pageComments) head.push(`<!-- Page ${page.pageNumber} -->`);
    if (settings.pageReferences) head.push(`*Page ${page.pageNumber}*`);
    parts.push(...head);

    let prevWasList = false;
    let buffer = "";
    const flushBuffer = () => {
      if (buffer) parts.push(buffer);
      buffer = "";
    };
    for (const block of page.blocks) {
      const md = blockToMarkdown(block, settings);
      if (!md.trim()) continue;
      if (block.type === "list-item") {
        buffer = prevWasList ? `${buffer}\n${md}` : md;
        prevWasList = true;
      } else {
        flushBuffer();
        parts.push(md);
        prevWasList = false;
      }
    }
    flushBuffer();
  });

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\\)\*([^*\n]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\\([\\`*_{}\[\]()#+\-.!|<>~&])/g, "$1")
    .replace(/^\|?\s*-{3,}.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
