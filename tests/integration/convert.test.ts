import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { convertPdfToMarkdown } from "@/lib/pdf/convert-to-markdown";
import { DEFAULT_SETTINGS, type ConversionSettings } from "@/lib/validation/conversion-schema";
import type { OcrEngine, ProgressEvent } from "@/lib/pdf/types";

const load = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "../fixtures", `${name}.pdf`)));

const run = (
  name: string,
  settings: Partial<ConversionSettings> = {},
  extra: { ocr?: OcrEngine | null; maxPages?: number; onProgress?: (e: ProgressEvent) => void } = {},
) =>
  convertPdfToMarkdown(
    load(name),
    { ...DEFAULT_SETTINGS, ...settings },
    {
      filename: `${name}.pdf`,
      limits: { maxPages: extra.maxPages ?? 200 },
      engines: { ocr: extra.ocr ?? null },
      onProgress: extra.onProgress,
    },
  );

describe("text-based PDFs", () => {
  it("reconstructs headings, lists, links and keeps Unicode", async () => {
    const { markdown, stats } = await run("simple");
    expect(markdown).toMatch(/^# Quarterly Field Report$/m);
    expect(markdown).toMatch(/^## Key Findings$/m);
    expect(markdown).toMatch(/^## Next Steps$/m);
    expect(markdown).toMatch(/^- Water quality improved at nine of the twelve sites\.$/m);
    expect(markdown).toMatch(/^1\. Review the raw measurements/m);
    expect(markdown).toMatch(/^3\. Schedule the autumn survey\.$/m);
    expect(markdown).toContain("[Visit the project site](https://example.org/project)");
    expect(markdown).toContain("Café attendance rose — “record” numbers");
    // literal asterisk escaped, snake_case untouched
    expect(markdown).toContain("2 \\* 3 = 6");
    expect(markdown).toContain("snake_case_name");
    expect(stats.headings).toBe(3);
    expect(stats.links).toBe(1);
    expect(stats.pagesOcr).toBe(0);
  });

  it("does not turn body paragraphs into headings", async () => {
    const { markdown } = await run("simple");
    expect(markdown).not.toMatch(/^#+ This report summarises/m);
  });

  it("keeps page order and strips running headers, footers and page numbers", async () => {
    const { markdown, stats } = await run("multipage");
    const i1 = markdown.indexOf("Chapter 1");
    const i2 = markdown.indexOf("Chapter 2");
    const i3 = markdown.indexOf("Chapter 3");
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(markdown).not.toContain("Confidential Draft");
    expect(markdown).not.toMatch(/^Page \d$/m);
    expect(stats.headersFootersRemoved).toBe(6);
    expect(stats.pages).toBe(3);
  });

  it("adds separators, comments, references, front matter and a TOC on request", async () => {
    const { markdown } = await run("multipage", {
      pageSeparators: true,
      pageComments: true,
      pageReferences: true,
      frontMatter: true,
      tableOfContents: true,
      includeMetadata: true,
    });
    expect(markdown.startsWith("---\ntitle: ")).toBe(true);
    expect(markdown).toContain('author: "Fixture Generator"');
    expect(markdown).toContain("## Table of Contents");
    expect(markdown).toContain("- [Chapter 1](#chapter-1)");
    expect(markdown).toContain("<!-- Page 2 -->");
    expect(markdown).toContain("*Page 3*");
    expect((markdown.match(/^---$/gm) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("reconstructs a table in GFM and as a code block in standard Markdown", async () => {
    const gfm = await run("table");
    expect(gfm.stats.tables).toBe(1);
    expect(gfm.markdown).toContain("| Region | Units | Revenue |");
    expect(gfm.markdown).toContain("| --- | --- | --- |");
    expect(gfm.markdown).toContain("| North | 1,200 | $48,000 |");

    const std = await run("table", { flavor: "standard" });
    expect(std.markdown).toContain("```");
    expect(std.markdown).not.toContain("| --- |");
    expect(std.markdown).toMatch(/North\s+1,200\s+\$48,000/);
  });

  it("leaves tabular text alone when table detection is off", async () => {
    const { markdown, stats } = await run("table", { detectTables: false });
    expect(stats.tables).toBe(0);
    expect(markdown).not.toContain("| --- |");
    expect(markdown).toContain("North");
  });

  it("reads two columns in column order rather than interleaving lines", async () => {
    const { markdown } = await run("columns");
    const left = markdown.lastIndexOf("Left column paragraph one");
    const right = markdown.indexOf("Right column paragraph one");
    expect(left).toBeGreaterThan(-1);
    expect(right).toBeGreaterThan(left); // all left-column text precedes the right column
  });

  it("reports honest stats", async () => {
    const { stats } = await run("simple");
    expect(stats.pages).toBe(1);
    expect(stats.words).toBeGreaterThan(50);
    expect(stats.characters).toBeGreaterThan(300);
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("emits staged progress with real page counts", async () => {
    const events: ProgressEvent[] = [];
    await run("multipage", {}, { onProgress: (e) => events.push(e) });
    expect(events[0].stage).toBe("validating");
    expect(events.some((e) => e.stage === "extracting" && e.current === 3 && e.total === 3)).toBe(true);
    expect(events.at(-1)?.stage).toBe("formatting");
  });
});

async function buildPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));
  build(doc);
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

describe("running header detection", () => {
  it("keeps large headings that repeat at the top of every page", async () => {
    const data = await buildPdf((doc) => {
      for (let p = 1; p <= 4; p++) {
        if (p > 1) doc.addPage();
        doc.font("Helvetica-Bold").fontSize(18).text(`Section ${p}`);
        doc.font("Helvetica").fontSize(11).moveDown().text(
          "Body text that fills the page so the body font size dominates the document. ".repeat(6),
        );
      }
    });
    const r = await convertPdfToMarkdown(data, DEFAULT_SETTINGS, { limits: { maxPages: 10 } });
    expect(r.markdown).toMatch(/^# Section 1$/m);
    expect(r.markdown).toMatch(/^# Section 4$/m);
    expect(r.stats.headersFootersRemoved).toBe(0);
  });
});

describe("failure modes", () => {
  it("rejects password-protected PDFs", async () => {
    await expect(run("secret")).rejects.toMatchObject({ code: "PASSWORD_PROTECTED" });
  });
  it("reports empty documents", async () => {
    await expect(run("empty")).rejects.toMatchObject({ code: "NO_TEXT_FOUND" });
  });
  it("rejects garbage that has a PDF header", async () => {
    const data = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf\n%%EOF");
    await expect(
      convertPdfToMarkdown(data, DEFAULT_SETTINGS, { limits: { maxPages: 10 } }),
    ).rejects.toMatchObject({ code: "CORRUPT_PDF" });
  });
  it("enforces the page limit", async () => {
    await expect(run("multipage", {}, { maxPages: 2 })).rejects.toMatchObject({
      code: "TOO_MANY_PAGES",
    });
  });
  it("honours abort signals", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      convertPdfToMarkdown(load("simple"), DEFAULT_SETTINGS, {
        limits: { maxPages: 10 },
        signal: c.signal,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
});

describe("scanned PDFs", () => {
  it("explains that OCR is needed when it is disabled", async () => {
    await expect(run("scanned", { ocrEnabled: false })).rejects.toMatchObject({
      code: "NO_TEXT_FOUND",
      message: expect.stringMatching(/OCR/),
    });
  });

  it("reports OCR as unavailable instead of returning empty Markdown", async () => {
    await expect(run("scanned", { ocrEnabled: true }, { ocr: null })).rejects.toMatchObject({
      code: "OCR_UNAVAILABLE",
    });
  });

  it("uses the OCR engine for pages without text and lays out its lines", async () => {
    const calls: string[] = [];
    const fake: OcrEngine = {
      async recognize(png, language) {
        calls.push(language);
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        return {
          text: "Scanned Invoice\nPayment due",
          confidence: 91,
          lines: [
            { text: "Scanned Invoice", x0: 100, y0: 100, x1: 700, y1: 170 },
            { text: "Payment due", x0: 100, y0: 300, x1: 500, y1: 345 },
          ],
        };
      },
      async terminate() {},
    };
    const result = await run("scanned", { ocrLanguage: "deu" }, { ocr: fake });
    expect(calls).toEqual(["deu"]);
    expect(result.stats.pagesOcr).toBe(1);
    expect(result.markdown).toContain("Scanned Invoice");
    expect(result.markdown).toContain("Payment due");
  });

  it("warns about low OCR confidence", async () => {
    const fake: OcrEngine = {
      async recognize() {
        return { text: "mumble mumble", confidence: 12 };
      },
      async terminate() {},
    };
    const result = await run("scanned", {}, { ocr: fake });
    expect(result.warnings.map((w) => w.code)).toContain("ocr_low_confidence");
    expect(result.warnings.find((w) => w.code === "ocr_low_confidence")?.pages).toEqual([1]);
  });

  it("does not OCR text-based pages in automatic mode", async () => {
    let called = 0;
    const fake: OcrEngine = {
      async recognize() {
        called++;
        return { text: "x", confidence: 99 };
      },
      async terminate() {},
    };
    await run("simple", {}, { ocr: fake });
    expect(called).toBe(0);
  });
});
