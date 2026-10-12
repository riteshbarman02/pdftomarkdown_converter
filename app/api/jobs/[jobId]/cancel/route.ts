import { jsonError, noStoreJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getJobFor } from "@/lib/jobs/store";
import { getOwnerHash } from "@/lib/security/owner";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = getJobFor(jobId, await getOwnerHash({ create: false }));
    if (!job) throw new AppError("NOT_FOUND", "This conversion was not found or has expired.");
    if (job.status !== "completed" && job.status !== "failed" && job.status !== "cancelled") {
      job.status = "cancelled";
      job.error = { code: "CANCELLED", message: "The conversion was cancelled." };
      job.controller.abort("cancelled");
    }
    return noStoreJson({ id: job.id, status: job.status });
  } catch (err) {
    return jsonError(err);
  }
}
