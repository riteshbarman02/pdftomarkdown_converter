import { jsonError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getJobFor } from "@/lib/jobs/store";
import { toPlainText } from "@/lib/pdf/serialize-markdown";
import { getOwnerHash } from "@/lib/security/owner";
import { baseNameWithoutExtension, contentDisposition } from "@/lib/security/sanitize-filename";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = getJobFor(jobId, await getOwnerHash({ create: false }));
    if (!job) throw new AppError("NOT_FOUND", "This conversion was not found or has expired.");
    if (job.status !== "completed" || !job.result) {
      throw new AppError("NOT_READY", "This conversion has not finished yet.");
    }

    const format = new URL(request.url).searchParams.get("format") === "txt" ? "txt" : "md";
    const base = baseNameWithoutExtension(job.filename);
    const text = format === "txt" ? toPlainText(job.result.markdown) : job.result.markdown;

    return new Response(text, {
      headers: {
        "Content-Type":
          format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
        "Content-Disposition": contentDisposition(`${base}.${format}`),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
