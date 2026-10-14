import { AppError, toAppError } from "@/lib/errors";
import { PdfJsExtractor } from "./extract-text";
import {
  assignHeadingLevels,
  buildPageLines,
  computeDocStats,
  linesToBlocks,
  removeRunningMargins,
} from "./detect-layout";
import { ocrTextToBlocks } from "./ocr";
import { serializeDocument } from "./serialize-markdown";
import { countWords } from "./text-normalize";
import type {
  Block,
  ConversionResult,
  ConversionWarning,
  ConvertOptions,
  ExtractedPage,
  Line,
  OcrLine,
  PageResult,
} from "./types";
import type { ConversionSettings } from "@/lib/validation/conversion-schema";

/** Pages with fewer extractable characters than this (and images) are treated as scans. */
const MIN_TEXT_CHARS = 25;
const LOW_OCR_CONFIDENCE = 60;

/** Reads pixel dimensions from a PNG header. */
function pngWidth(png: Buffer | Uint8Array): number {
  if (png.length > 24) {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    return view.getUint32(16, false);
  }
  return 0;
}

/**
 * Turns OCR line boxes into a synthetic text page so that scanned pages go through
 * exactly the same layout analysis (paragraphs, lists, headings) as text pages.
 */
function ocrLinesToPage(base: ExtractedPage, lines: OcrLine[], imageWidth: number): ExtractedPage {
  const scale = imageWidth > 0 ? imageWidth / base.width : 1;
  const runs = lines.map((l) => {
    const h = (l.y1 - l.y0) / scale;
    return {
      text: l.text,
      x: l.x0 / scale,
      y: l.y1 / scale - h * 0.2,
      width: (l.x1 - l.x0) / scale,
      fontSize: Math.max(4, h * 0.8),
      bold: false,
      italic: false,
    };
  });
  return {
    ...base,
    runs,
    charCount: runs.reduce((n, r) => n + r.text.replace(/\s/g, "").length, 0),
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason === "timeout") {
      throw new AppError("TIMEOUT", "The conversion took too long and was stopped.");
    }
    throw new AppError("CANCELLED", "The conversion was cancelled.");
  }
}

/**
 * Full conversion pipeline: validate → extract → (OCR) → layout → serialize → verify.
 * Engines are injectable so each stage can be tested and replaced independently.
 */
export async function convertPdfToMarkdown(
  data: Uint8Array,
  settings: ConversionSettings,
  options: ConvertOptions,
): Promise<ConversionResult> {
  const started = Date.now();
  const { signal, onProgress } = options;
  const extractor = options.engines?.extractor ?? new PdfJsExtractor();
  const ocr = options.engines?.ocr ?? null;
  const warnings: ConversionWarning[] = [];

  onProgress?.({ stage: "validating" });
  throwIfAborted(signal);
  const doc = await extractor.open(data, { signal });

  try {
    if (doc.numPages < 1) {
      throw new AppError("CORRUPT_PDF", "This PDF does not contain any pages.");
    }
    if (doc.numPages > options.limits.maxPages) {
      throw new AppError(
        "TOO_MANY_PAGES",
        `This PDF has ${doc.numPages} pages; the limit is ${options.limits.maxPages}.`,
      );
    }

    // ---- extraction ------------------------------------------------------
    const extracted: ExtractedPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      throwIfAborted(signal);
      onProgress?.({ stage: "extracting", current: p - 1, total: doc.numPages });
      extracted.push(await doc.getPage(p));
    }
    onProgress?.({ stage: "extracting", current: doc.numPages, total: doc.numPages });

    // ---- OCR -------------------------------------------------------------
    const ocrBlocks = new Map<number, { blocks: Block[]; confidence: number }>();
    /** Pages whose text came from OCR line geometry (laid out like text pages). */
    const ocrGeometry = new Map<number, number>();
    const needsOcr = extracted.filter((pg) => {
      const blank = pg.charCount === 0 && pg.imageCount === 0;
      if (blank) return false;
      if (settings.ocrMode === "always") return true;
      return pg.charCount < MIN_TEXT_CHARS && pg.imageCount > 0;
    });
    const unreadable: number[] = [];

    if (needsOcr.length && settings.ocrEnabled && ocr) {
      const lowConfidence: number[] = [];
      let failed: string | null = null;
      for (let i = 0; i < needsOcr.length; i++) {
        const pg = needsOcr[i];
        throwIfAborted(signal);
        onProgress?.({ stage: "ocr", current: i, total: needsOcr.length });
        if (failed) {
          if (pg.charCount < MIN_TEXT_CHARS) unreadable.push(pg.pageNumber);
          continue;
        }
        try {
          const png = await doc.renderPagePng(pg.pageNumber);
          const result = await ocr.recognize(png, settings.ocrLanguage, signal);
          const text = result.text.trim();
          // never replace a real text layer with a shorter OCR result
          if (text && text.replace(/\s/g, "").length >= pg.charCount) {
            if (result.lines?.length) {
              const idx = extracted.findIndex((e) => e.pageNumber === pg.pageNumber);
              extracted[idx] = ocrLinesToPage(pg, result.lines, pngWidth(png));
              ocrGeometry.set(pg.pageNumber, result.confidence);
            } else {
              ocrBlocks.set(pg.pageNumber, {
                blocks: ocrTextToBlocks(text, pg.pageNumber, settings.preserveLists),
                confidence: result.confidence,
              });
            }
            if (result.confidence < LOW_OCR_CONFIDENCE) lowConfidence.push(pg.pageNumber);
          } else if (pg.charCount < MIN_TEXT_CHARS) {
            unreadable.push(pg.pageNumber);
          }
        } catch (err) {
          const appErr = toAppError(err);
          if (appErr.code === "CANCELLED" || appErr.code === "TIMEOUT") throw appErr;
          failed = appErr.message;
          if (pg.charCount < MIN_TEXT_CHARS) unreadable.push(pg.pageNumber);
        }
      }
      onProgress?.({ stage: "ocr", current: needsOcr.length, total: needsOcr.length });
      if (failed) {
        warnings.push({
          code: "ocr_unavailable",
          message: `${failed} Pages that needed OCR were left empty.`,
          pages: unreadable,
        });
      }
      if (lowConfidence.length) {
        warnings.push({
          code: "ocr_low_confidence",
          message: "OCR confidence was low on these pages; please review the text.",
          pages: lowConfidence,
        });
      }
    } else if (needsOcr.length) {
      const scanned = needsOcr.filter((pg) => pg.charCount < MIN_TEXT_CHARS).map((p) => p.pageNumber);
      if (scanned.length) {
        unreadable.push(...scanned);
        warnings.push({
          code: settings.ocrEnabled ? "ocr_unavailable" : "scanned_no_ocr",
          message: settings.ocrEnabled
            ? "OCR is not available on this server, so scanned pages could not be read."
            : "These pages look scanned and contain no text layer. Enable OCR to read them.",
          pages: scanned,
        });
      }
    }

    // ---- layout ------------------------------------------------------------
    onProgress?.({ stage: "formatting" });
    throwIfAborted(signal);

    const textPages = extracted.filter((pg) => !ocrBlocks.has(pg.pageNumber));
    const stats = computeDocStats(textPages.length ? textPages : extracted);

    const lineSets = extracted.map((page) => ({
      page,
      lines: ocrBlocks.has(page.pageNumber) ? ([] as Line[]) : buildPageLines(page, stats),
    }));
    const headersFootersRemoved = removeRunningMargins(lineSets, stats.bodySize);

    let tables = 0;
    let rejectedTables = 0;
    const pageBlocks: Block[][] = [];
    for (const { page, lines } of lineSets) {
      const ocrResult = ocrBlocks.get(page.pageNumber);
      if (ocrResult) {
        pageBlocks.push(ocrResult.blocks);
        continue;
      }
      const outcome = linesToBlocks(lines, page.pageNumber, stats, settings);
      tables += outcome.tables;
      rejectedTables += outcome.rejectedTables;
      pageBlocks.push(outcome.blocks);
    }
    assignHeadingLevels(pageBlocks);

    if (settings.imageHandling === "placeholder") {
      extracted.forEach((pg, i) => {
        if (pg.imageCount > 0 && !ocrBlocks.has(pg.pageNumber) && !ocrGeometry.has(pg.pageNumber)) {
          pageBlocks[i].push({ type: "image", page: pg.pageNumber, count: pg.imageCount, plain: "" });
        }
      });
    }

    const pages: PageResult[] = extracted.map((pg, i) => ({
      pageNumber: pg.pageNumber,
      blocks: pageBlocks[i],
      source: ocrBlocks.has(pg.pageNumber) || ocrGeometry.has(pg.pageNumber) ? "ocr" : "text",
      ocrConfidence: ocrBlocks.get(pg.pageNumber)?.confidence ?? ocrGeometry.get(pg.pageNumber),
    }));

    const allBlocks = pages.flatMap((p) => p.blocks);
    const plainText = allBlocks.map((b) => b.plain).join("\n");
    const characters = plainText.replace(/\s/g, "").length;
    if (characters === 0) {
      if (unreadable.length && !settings.ocrEnabled) {
        throw new AppError(
          "NO_TEXT_FOUND",
          "This PDF appears to be scanned and has no text layer. Enable OCR and try again.",
        );
      }
      if (unreadable.length) {
        throw new AppError(
          "OCR_UNAVAILABLE",
          "This PDF is scanned and OCR could not read it on this server.",
        );
      }
      throw new AppError("NO_TEXT_FOUND", "No extractable text was found in this PDF.");
    }

    const emptyPages = pages
      .filter((p) => p.blocks.every((b) => b.type === "image") && !unreadable.includes(p.pageNumber))
      .map((p) => p.pageNumber);
    if (emptyPages.length) {
      warnings.push({
        code: "page_empty",
        message: "No text was found on these pages.",
        pages: emptyPages,
      });
    }
    if (rejectedTables > 0) {
      warnings.push({
        code: "tables_uncertain",
        message: `${rejectedTables} possible table${rejectedTables === 1 ? " was" : "s were"} not confident enough to reconstruct and ${rejectedTables === 1 ? "was" : "were"} left as text.`,
      });
    }

    // ---- serialize & verify ----------------------------------------------
    const markdown = serializeDocument(pages, settings, doc.metadata, options.filename);
    const replacement = (markdown.match(/\uFFFD/g) ?? []).length;
    if (replacement > 0) {
      warnings.push({
        code: "replacement_chars",
        message: `${replacement} character${replacement === 1 ? "" : "s"} could not be decoded and appear as \uFFFD.`,
      });
    }

    return {
      markdown,
      metadata: doc.metadata,
      warnings,
      stats: {
        pages: pages.length,
        characters,
        words: countWords(plainText),
        tables,
        headings: allBlocks.filter((b) => b.type === "heading").length,
        links: extracted.reduce((n, pg) => n + new Set(pg.runs.filter((r) => r.href).map((r) => r.href)).size, 0),
        pagesOcr: pages.filter((p) => p.source === "ocr").length,
        pagesWithoutText: unreadable.length,
        headersFootersRemoved,
        durationMs: Date.now() - started,
      },
    };
  } finally {
    await doc.destroy();
    // OCR workers are owned by whoever created the engine.
  }
}
