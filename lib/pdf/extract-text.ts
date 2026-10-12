import { AppError, toAppError } from "@/lib/errors";
import { normalizeText } from "./text-normalize";
import type {
  ExtractedPage,
  PdfDocumentHandle,
  PdfExtractor,
  PdfMetadata,
  TextRun,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfjsModule = any;
let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: PdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Run the PDF.js "worker" in-process; importing it here avoids path resolution issues.
      const worker: PdfjsModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (globalThis as any).pdfjsWorker = worker;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? normalizeText(v).trim() : undefined;
}

/**
 * PDF.js-backed extractor. Remote resources are never fetched: URLs embedded in
 * the PDF are ignored, JavaScript/eval is disabled, and system fonts are not used.
 */
export class PdfJsExtractor implements PdfExtractor {
  async open(data: Uint8Array, options: { signal?: AbortSignal } = {}): Promise<PdfDocumentHandle> {
    const pdfjs = await loadPdfjs();
    // PDF.js transfers/detaches the buffer it is given, so hand it its own copy view.
    const task = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      enableXfa: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
      stopAtErrors: false,
    });
    const onAbort = () => void task.destroy();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    let doc: PdfjsModule;
    try {
      doc = await task.promise;
    } catch (err) {
      options.signal?.removeEventListener("abort", onAbort);
      throw toAppError(err);
    }

    let metadata: PdfMetadata = { pageCount: doc.numPages };
    try {
      const meta = await doc.getMetadata();
      const info = meta?.info ?? {};
      metadata = {
        pageCount: doc.numPages,
        title: str(info.Title) ?? str(meta?.metadata?.get?.("dc:title")),
        author: str(info.Author),
        subject: str(info.Subject),
        keywords: str(info.Keywords),
        creator: str(info.Creator),
        producer: str(info.Producer),
        creationDate: str(info.CreationDate),
      };
    } catch {
      /* metadata is optional */
    }

    return new PdfJsDocument(pdfjs, doc, metadata, task, () =>
      options.signal?.removeEventListener("abort", onAbort),
    );
  }
}

class PdfJsDocument implements PdfDocumentHandle {
  readonly numPages: number;
  constructor(
    private pdfjs: PdfjsModule,
    private doc: PdfjsModule,
    readonly metadata: PdfMetadata,
    private task: { destroy: () => Promise<void> },
    private cleanup: () => void,
  ) {
    this.numPages = doc.numPages;
  }

  async getPage(pageNumber: number): Promise<ExtractedPage> {
    const page = await this.doc.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const [content, annotations, ops] = await Promise.all([
        page.getTextContent({ includeMarkedContent: false, disableNormalization: false }),
        page.getAnnotations({ intent: "display" }).catch(() => []),
        // Resolving the operator list loads fonts (style flags) and exposes image usage.
        page.getOperatorList().catch(() => null),
      ]);

      const fontStyle = new Map<string, { bold: boolean; italic: boolean }>();
      const styleOf = (fontName: string) => {
        let s = fontStyle.get(fontName);
        if (!s) {
          s = { bold: false, italic: false };
          try {
            const f = page.commonObjs.get(fontName);
            const nm = String(f?.name ?? f?.fallbackName ?? "");
            s.bold = !!(f?.bold || f?.black || /bold|black|heavy|semibold|demi/i.test(nm));
            s.italic = !!(f?.italic || /italic|oblique/i.test(nm));
          } catch {
            /* font not resolved — treat as regular */
          }
          fontStyle.set(fontName, s);
        }
        return s;
      };

      const links: { rect: number[]; url: string }[] = [];
      for (const a of annotations as any[]) {
        const url: string | undefined = a?.url ?? a?.unsafeUrl;
        if (a?.subtype === "Link" && url && Array.isArray(a.rect)) {
          // Util.applyTransform mutates its point argument in place.
          const p1 = [a.rect[0], a.rect[1]];
          const p2 = [a.rect[2], a.rect[3]];
          this.pdfjs.Util.applyTransform(p1, viewport.transform);
          this.pdfjs.Util.applyTransform(p2, viewport.transform);
          const r = this.pdfjs.Util.normalizeRect([p1[0], p1[1], p2[0], p2[1]]);
          links.push({ rect: r, url });
        }
      }

      const runs: TextRun[] = [];
      let charCount = 0;
      for (const item of content.items as any[]) {
        if (typeof item.str !== "string") continue;
        const text = normalizeText(item.str);
        // Whitespace-only items are dropped; word gaps are re-derived from geometry.
        if (!text.trim()) continue;
        const tx = this.pdfjs.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || item.height || 10;
        const x = tx[4];
        const y = tx[5];
        const width = item.width * viewport.scale;
        const style = styleOf(item.fontName);
        const cx = x + width / 2;
        const cy = y - fontSize * 0.3;
        const link = links.find(
          (l) => cx >= l.rect[0] - 1 && cx <= l.rect[2] + 1 && cy >= l.rect[1] - 1 && cy <= l.rect[3] + 1,
        );
        charCount += text.replace(/\s/g, "").length;
        runs.push({
          text,
          x,
          y,
          width,
          fontSize,
          bold: style.bold,
          italic: style.italic,
          href: link?.url,
        });
      }

      let imageCount = 0;
      if (ops) {
        const { OPS } = this.pdfjs;
        for (const fn of ops.fnArray as number[]) {
          if (
            fn === OPS.paintImageXObject ||
            fn === OPS.paintInlineImageXObject ||
            fn === OPS.paintImageMaskXObject
          ) {
            imageCount++;
          }
        }
      }

      return {
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        runs,
        charCount,
        imageCount,
      };
    } finally {
      page.cleanup();
    }
  }

  async renderPagePng(pageNumber: number, maxDimension = 2600): Promise<Buffer> {
    const page = await this.doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, maxDimension / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const factory = this.doc.canvasFactory;
      const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: target.context,
        canvas: target.canvas,
        viewport,
        background: "white",
      }).promise;
      const png: Buffer = await target.canvas.encode("png");
      factory.destroy(target);
      return png;
    } catch (err) {
      throw new AppError("INTERNAL", "Unable to render the page for OCR.", { cause: err });
    } finally {
      page.cleanup();
    }
  }

  async destroy(): Promise<void> {
    this.cleanup();
    try {
      // In PDF.js the loading task owns the worker-side resources.
      await this.task.destroy();
    } catch {
      /* already destroyed */
    }
  }
}
