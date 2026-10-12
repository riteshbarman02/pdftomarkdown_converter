import { randomBytes } from "node:crypto";
import { getLimits } from "@/lib/env";
import { ownersMatch } from "@/lib/security/owner-hash";
import type { ConversionResult, ConversionStage } from "@/lib/pdf/types";
import type { ConversionSettings } from "@/lib/validation/conversion-schema";

export type JobStatus = "queued" | ConversionStage | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  ownerHash: string;
  status: JobStatus;
  progress: { current: number; total: number } | null;
  filename: string;
  settings: ConversionSettings;
  createdAt: number;
  expiresAt: number;
  error: { code: string; message: string } | null;
  result: ConversionResult | null;
  controller: AbortController;
  /** Uploaded bytes; released as soon as processing ends. */
  data: Uint8Array | null;
}

const g = globalThis as unknown as { __p2mJobs?: Map<string, Job>; __p2mSweep?: NodeJS.Timeout };
const jobs = (g.__p2mJobs ??= new Map<string, Job>());

function sweep(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (job.expiresAt <= now) {
      job.controller.abort("expired");
      job.data = null;
      jobs.delete(id);
    }
  }
}

if (!g.__p2mSweep) {
  g.__p2mSweep = setInterval(() => sweep(), 30_000);
  g.__p2mSweep.unref?.();
}

export const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function createJob(input: {
  ownerHash: string;
  filename: string;
  settings: ConversionSettings;
  data: Uint8Array;
}): Job {
  const now = Date.now();
  const job: Job = {
    id: randomBytes(24).toString("base64url"),
    ownerHash: input.ownerHash,
    status: "queued",
    progress: null,
    filename: input.filename,
    settings: input.settings,
    createdAt: now,
    expiresAt: now + getLimits().retentionMinutes * 60_000,
    error: null,
    result: null,
    controller: new AbortController(),
    data: input.data,
  };
  jobs.set(job.id, job);
  return job;
}

/** Returns the job only if it exists, has not expired and belongs to `ownerHash`. */
export function getJobFor(id: string, ownerHash: string | null, now = Date.now()): Job | null {
  if (!ownerHash || !JOB_ID_PATTERN.test(id)) return null;
  const job = jobs.get(id);
  if (!job) return null;
  if (job.expiresAt <= now) {
    jobs.delete(id);
    return null;
  }
  return ownersMatch(job.ownerHash, ownerHash) ? job : null;
}

export function deleteJob(id: string) {
  const job = jobs.get(id);
  if (job) job.data = null;
  jobs.delete(id);
}

export function countActiveJobs(): number {
  let n = 0;
  for (const j of jobs.values()) {
    if (j.status !== "completed" && j.status !== "failed" && j.status !== "cancelled") n++;
  }
  return n;
}

export function __sweepForTests(now: number) {
  sweep(now);
}

export function __clearJobsForTests() {
  jobs.clear();
}
