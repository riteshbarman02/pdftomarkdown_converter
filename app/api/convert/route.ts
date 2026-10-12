import { jsonError, noStoreJson } from "@/lib/api";
import { getLimits } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createJob } from "@/lib/jobs/store";
import { runJob } from "@/lib/jobs/runner";
import { validatePdfUpload } from "@/lib/pdf/validate-pdf";
import { getOwnerHash } from "@/lib/security/owner";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { sanitizeFilename } from "@/lib/security/sanitize-filename";
import { getEnv } from "@/lib/env";
import { conversionSettingsSchema } from "@/lib/validation/conversion-schema";
import { after } from "next/server";

export const maxDuration = 300;

/** Reads the request body, aborting as soon as it exceeds the byte budget. */
async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("FILE_TOO_LARGE", "The upload is larger than the allowed size.");
  }
  if (!request.body) throw new AppError("INVALID_REQUEST", "The request body is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new AppError("FILE_TOO_LARGE", "The upload is larger than the allowed size.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const rate = checkRateLimit(
      `convert:${clientKey(request)}`,
      getEnv().RATE_LIMIT_CONVERSIONS_PER_MINUTE,
    );
    if (!rate.allowed) {
      throw new AppError("RATE_LIMITED", "Too many conversions. Please wait a moment and try again.");
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("INVALID_REQUEST", "Expected a multipart/form-data upload.");
    }

    const limits = getLimits();
    // multipart framing and the settings field add a little on top of the file itself
    const body = await readBodyLimited(request, limits.maxUploadBytes + 256 * 1024);
    let form: FormData;
    try {
      form = await new Response(new Blob([body]), { headers: { "content-type": contentType } }).formData();
    } catch {
      throw new AppError("INVALID_REQUEST", "The upload could not be read.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("INVALID_REQUEST", "No PDF file was provided.");
    }

    const rawSettings = form.get("settings");
    let settingsInput: unknown = {};
    if (typeof rawSettings === "string" && rawSettings.trim()) {
      try {
        settingsInput = JSON.parse(rawSettings);
      } catch {
        throw new AppError("INVALID_SETTINGS", "Conversion settings must be valid JSON.");
      }
    }
    const parsed = conversionSettingsSchema.safeParse(settingsInput);
    if (!parsed.success) {
      throw new AppError(
        "INVALID_SETTINGS",
        `Invalid conversion settings: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    validatePdfUpload(file, bytes, { maxBytes: limits.maxUploadBytes });

    const ownerHash = (await getOwnerHash({ create: true }))!;
    const job = createJob({
      ownerHash,
      filename: sanitizeFilename(file.name, "document.pdf"),
      settings: parsed.data,
      data: bytes,
    });

    const mode = form.get("mode") === "sync" ? "sync" : "async";
    if (mode === "sync") {
      await runJob(job);
      if (job.status !== "completed" || !job.result) {
        const e = job.error ?? { code: "INTERNAL", message: "Conversion failed." };
        throw new AppError(e.code as ConstructorParameters<typeof AppError>[0], e.message);
      }
      return noStoreJson({ id: job.id, status: job.status, result: job.result });
    }

    // Keep the work alive after the response on platforms that support it.
    after(() => runJob(job));
    return noStoreJson(
      { id: job.id, status: job.status },
      { status: 202, headers: { Location: `/api/jobs/${job.id}` } },
    );
  } catch (err) {
    const headers: Record<string, string> = {};
    if (err instanceof AppError && err.code === "RATE_LIMITED") headers["Retry-After"] = "30";
    return jsonError(err, headers);
  }
}
