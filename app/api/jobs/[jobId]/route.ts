import { jsonError, noStoreJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getJobFor } from "@/lib/jobs/store";
import { getOwnerHash } from "@/lib/security/owner";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const rate = checkRateLimit(`jobs:${clientKey(request)}`, 240);
    if (!rate.allowed) throw new AppError("RATE_LIMITED", "Too many requests.");

    const { jobId } = await params;
    const job = getJobFor(jobId, await getOwnerHash({ create: false }));
    // Unknown, expired and foreign jobs are indistinguishable by design.
    if (!job) throw new AppError("NOT_FOUND", "This conversion was not found or has expired.");

    return noStoreJson({
      id: job.id,
      status: job.status,
      progress: job.progress,
      filename: job.filename,
      expiresAt: new Date(job.expiresAt).toISOString(),
      error: job.error,
      result: job.status === "completed" ? job.result : null,
    });
  } catch (err) {
    return jsonError(err);
  }
}
