import type { ConversionResult, ProgressEvent } from "@/lib/pdf/types";
import type { ConversionSettings } from "@/lib/validation/conversion-schema";
import { convertPdfToMarkdown } from "@/lib/pdf/convert-to-markdown";
import { PdfJsExtractor } from "@/lib/pdf/extract-text";
import { TesseractOcrEngine } from "@/lib/pdf/ocr";
import { validatePdfUpload } from "@/lib/pdf/validate-pdf";

let sharedOcrEngine: TesseractOcrEngine | null = null;

export async function convertClientSide(
  file: File,
  settings: ConversionSettings,
  limits: { maxUploadMb: number; maxPages: number },
  opts: {
    signal?: AbortSignal;
    onProgress?: (event: { stage: JobStatus; progress: { current: number; total: number } | null }) => void;
  } = {},
): Promise<ConversionResult> {
  const { signal, onProgress } = opts;

  onProgress?.({ stage: "validating", progress: null });
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  validatePdfUpload(file, bytes, { maxBytes: limits.maxUploadMb * 1024 * 1024 });

  if (!sharedOcrEngine && settings.ocrEnabled) {
    sharedOcrEngine = new TesseractOcrEngine();
  }

  const result = await convertPdfToMarkdown(bytes, settings, {
    filename: file.name,
    signal,
    limits: { maxPages: limits.maxPages },
    engines: {
      extractor: new PdfJsExtractor(),
      ocr: settings.ocrEnabled ? sharedOcrEngine : null,
    },
    onProgress: (p: ProgressEvent) => {
      onProgress?.({
        stage: p.stage as JobStatus,
        progress:
          p.current !== undefined && p.total !== undefined
            ? { current: p.current, total: p.total }
            : null,
      });
    },
  });

  return result;
}

export type JobStatus =
  | "queued"
  | "validating"
  | "extracting"
  | "ocr"
  | "formatting"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobSnapshot {
  id: string;
  status: JobStatus;
  progress: { current: number; total: number } | null;
  filename: string;
  error: { code: string; message: string } | null;
  result: ConversionResult | null;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

function parseError(status: number, text: string): ApiError {
  try {
    const body = JSON.parse(text);
    if (body?.error?.message) return new ApiError(body.error.code ?? "INTERNAL", body.error.message, status);
  } catch {
    /* fall through */
  }
  if (status === 413) return new ApiError("FILE_TOO_LARGE", "This file is too large to upload.", status);
  return new ApiError("INTERNAL", "The server returned an unexpected response.", status);
}

/** Uploads the PDF with real upload-progress events (fetch cannot report these). */
export function uploadForConversion(
  file: File,
  settings: ConversionSettings,
  opts: { onUploadProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("settings", JSON.stringify(settings));

    xhr.open("POST", "/api/convert");
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onUploadProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 202) {
        try {
          resolve({ id: JSON.parse(xhr.responseText).id });
        } catch {
          reject(new ApiError("INTERNAL", "The server returned an unexpected response.", 202));
        }
      } else {
        reject(parseError(xhr.status, xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new ApiError("NETWORK", "Could not reach the server. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export async function fetchJob(id: string, signal?: AbortSignal): Promise<JobSnapshot> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store", signal });
  const text = await res.text();
  if (!res.ok) throw parseError(res.status, text);
  return JSON.parse(text) as JobSnapshot;
}

export async function cancelJob(id: string): Promise<void> {
  try {
    await fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  } catch {
    /* best effort */
  }
}

/** Polls until the job reaches a terminal state, reporting each snapshot. */
export async function waitForJob(
  id: string,
  opts: { signal: AbortSignal; onUpdate: (job: JobSnapshot) => void; intervalMs?: number },
): Promise<JobSnapshot> {
  const interval = opts.intervalMs ?? 500;
  for (;;) {
    if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const job = await fetchJob(id, opts.signal);
    opts.onUpdate(job);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, interval);
      opts.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
}

export const STAGE_LABELS: Record<JobStatus, string> = {
  queued: "Waiting for a free worker",
  validating: "Validating the PDF",
  extracting: "Extracting text and layout",
  ocr: "Running OCR on scanned pages",
  formatting: "Building Markdown",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};
