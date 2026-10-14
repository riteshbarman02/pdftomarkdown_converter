import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { collapseSpaces } from "./text-normalize";
import { parseListMarker } from "./detect-layout";
import type { Block, OcrEngine, OcrLine, OcrResult, Segment } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tesseract.js-backed OCR. Recognition runs in a worker thread, so it does not
 * block the main thread. Language data is fetched by Tesseract.js from its
 * CDN on first use unless OCR_LANG_PATH points at self-hosted `.traineddata.gz` files.
 */
export class TesseractOcrEngine implements OcrEngine {
  private workers = new Map<string, Promise<any>>();

  private getWorker(language: string): Promise<any> {
    let w = this.workers.get(language);
    if (!w) {
      w = (async () => {
        const { createWorker } = await import("tesseract.js");
        if (typeof window !== "undefined") {
          return createWorker(language);
        }
        const { mkdtempSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const env = getEnv();
        const cachePath = env.OCR_CACHE_PATH ?? mkdtempSync(join(tmpdir(), "p2m-ocr-"));
        return createWorker(language, 1, {
          cachePath,
          ...(env.OCR_LANG_PATH ? { langPath: env.OCR_LANG_PATH } : {}),
          errorHandler: () => {},
        });
      })();
      this.workers.set(language, w);
      w.catch(() => this.workers.delete(language));
    }
    return w;
  }

  async recognize(png: Buffer | Uint8Array, language: string, signal?: AbortSignal): Promise<OcrResult> {
    if (signal?.aborted) throw new AppError("CANCELLED", "The conversion was cancelled.");
    let worker: any;
    try {
      worker = await this.getWorker(language);
    } catch (err) {
      throw new AppError(
        "OCR_UNAVAILABLE",
        "OCR could not be started. The OCR language data may be unreachable.",
        { cause: err },
      );
    }
    try {
      const input =
        typeof Blob !== "undefined" && !(typeof Buffer !== "undefined" && Buffer.isBuffer(png))
          ? new Blob([png as any], { type: "image/png" })
          : png;
      const { data } = await worker.recognize(input, {}, { blocks: true, text: true });
      const lines: OcrLine[] = [];
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            const text = String(line.text ?? "").replace(/\s+/g, " ").trim();
            if (text) {
              lines.push({
                text,
                x0: line.bbox.x0,
                y0: line.bbox.y0,
                x1: line.bbox.x1,
                y1: line.bbox.y1,
              });
            }
          }
        }
      }
      return {
        text: String(data.text ?? ""),
        confidence: Number(data.confidence ?? 0),
        lines: lines.length ? lines : undefined,
      };
    } catch (err) {
      throw new AppError("OCR_UNAVAILABLE", "OCR failed while reading this page.", { cause: err });
    }
  }

  async terminate(): Promise<void> {
    const pending = [...this.workers.values()];
    this.workers.clear();
    await Promise.allSettled(pending.map(async (w) => (await w).terminate()));
  }
}

/** Converts raw OCR text (no geometry) into paragraphs and list items. */
export function ocrTextToBlocks(text: string, page: number, preserveLists: boolean): Block[] {
  const blocks: Block[] = [];
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => collapseSpaces(l))
        .filter(Boolean),
    )
    .filter((lines) => lines.length);

  for (const lines of paragraphs) {
    const markers = preserveLists ? lines.map((l) => parseListMarker(l)) : [];
    if (markers.length && markers.every(Boolean)) {
      lines.forEach((line, i) => {
        const m = markers[i]!;
        const body = line.slice(m.length).trim();
        blocks.push({
          type: "list-item",
          ordered: m.ordered,
          number: m.number,
          depth: 0,
          segments: [{ text: body } as Segment],
          plain: body,
          page,
        });
      });
      continue;
    }
    let joined = "";
    for (const line of lines) {
      joined =
        joined && joined.endsWith("-") && /\p{Ll}/u.test(line[0] ?? "")
          ? joined + line
          : joined
            ? `${joined} ${line}`
            : line;
    }
    blocks.push({ type: "paragraph", segments: [{ text: joined }], plain: joined, page });
  }
  return blocks;
}
