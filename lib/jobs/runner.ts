import { getEnv, getLimits } from "@/lib/env";
import { AppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { convertPdfToMarkdown } from "@/lib/pdf/convert-to-markdown";
import { TesseractOcrEngine } from "@/lib/pdf/ocr";
import type { OcrEngine } from "@/lib/pdf/types";
import type { Job } from "./store";

const g = globalThis as unknown as {
  __p2mOcr?: OcrEngine;
  __p2mOcrIdle?: NodeJS.Timeout;
  __p2mRunning?: number;
  __p2mWaiters?: (() => void)[];
};

function sharedOcr(): OcrEngine | null {
  if (!getEnv().OCR_ENABLED) return null;
  clearTimeout(g.__p2mOcrIdle);
  return (g.__p2mOcr ??= new TesseractOcrEngine());
}

function scheduleOcrShutdown() {
  clearTimeout(g.__p2mOcrIdle);
  g.__p2mOcrIdle = setTimeout(() => {
    if ((g.__p2mRunning ?? 0) === 0 && g.__p2mOcr) {
      void g.__p2mOcr.terminate();
      g.__p2mOcr = undefined;
    }
  }, 60_000);
  g.__p2mOcrIdle.unref?.();
}

async function acquireSlot(signal: AbortSignal): Promise<void> {
  const max = getEnv().MAX_CONCURRENT_JOBS;
  g.__p2mRunning ??= 0;
  g.__p2mWaiters ??= [];
  if (g.__p2mRunning < max) {
    g.__p2mRunning++;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const waiter = () => {
      signal.removeEventListener("abort", onAbort);
      g.__p2mRunning!++;
      resolve();
    };
    const onAbort = () => {
      g.__p2mWaiters = g.__p2mWaiters!.filter((w) => w !== waiter);
      reject(new AppError("CANCELLED", "The conversion was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    g.__p2mWaiters!.push(waiter);
  });
}

function releaseSlot() {
  g.__p2mRunning = Math.max(0, (g.__p2mRunning ?? 1) - 1);
  g.__p2mWaiters?.shift()?.();
}

/** Runs a conversion job to completion, updating the job record as it progresses. */
export async function runJob(job: Job): Promise<void> {
  const limits = getLimits();
  const timeout = AbortSignal.timeout(limits.timeoutMs);
  const onTimeout = () => job.controller.abort("timeout");
  timeout.addEventListener("abort", onTimeout, { once: true });
  const log = logger.child({ jobId: job.id });

  try {
    await acquireSlot(job.controller.signal);
    try {
      if (job.controller.signal.aborted) throw new AppError("CANCELLED", "The conversion was cancelled.");
      job.status = "validating";
      const data = job.data!;
      const result = await convertPdfToMarkdown(data, job.settings, {
        filename: job.filename,
        signal: job.controller.signal,
        limits: { maxPages: limits.maxPages },
        engines: { ocr: sharedOcr() },
        onProgress: (e) => {
          if (job.status === "cancelled") return;
          job.status = e.stage;
          job.progress =
            e.current !== undefined && e.total !== undefined
              ? { current: e.current, total: e.total }
              : null;
        },
      });
      job.result = result;
      job.status = "completed";
      job.progress = null;
      log.info(
        { pages: result.stats.pages, ocrPages: result.stats.pagesOcr, ms: result.stats.durationMs },
        "conversion completed",
      );
    } finally {
      releaseSlot();
    }
  } catch (err) {
    const appErr = toAppError(err);
    if (job.status !== "cancelled") {
      job.status = appErr.code === "CANCELLED" ? "cancelled" : "failed";
      job.error = { code: appErr.code, message: appErr.message };
    }
    if (appErr.code === "INTERNAL") log.error({ err }, "conversion failed");
    else log.info({ code: appErr.code }, "conversion ended");
  } finally {
    timeout.removeEventListener("abort", onTimeout);
    job.data = null; // free the uploaded bytes as early as possible
    scheduleOcrShutdown();
  }
}
