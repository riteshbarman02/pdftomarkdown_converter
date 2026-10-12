import { beforeEach, describe, expect, it } from "vitest";
import {
  __clearJobsForTests,
  __sweepForTests,
  createJob,
  getJobFor,
} from "@/lib/jobs/store";
import { hashOwner } from "@/lib/security/owner-hash";
import { DEFAULT_SETTINGS } from "@/lib/validation/conversion-schema";

const alice = hashOwner("alice-token");
const bob = hashOwner("bob-token");

describe("job store", () => {
  beforeEach(() => __clearJobsForTests());

  const make = () =>
    createJob({ ownerHash: alice, filename: "a.pdf", settings: DEFAULT_SETTINGS, data: new Uint8Array(4) });

  it("generates long unguessable ids", () => {
    const a = make();
    const b = make();
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a.id).not.toBe(b.id);
  });
  it("only returns a job to its owner", () => {
    const job = make();
    expect(getJobFor(job.id, alice)).toBe(job);
    expect(getJobFor(job.id, bob)).toBeNull();
    expect(getJobFor(job.id, null)).toBeNull();
  });
  it("rejects malformed ids", () => {
    expect(getJobFor("../../etc/passwd", alice)).toBeNull();
    expect(getJobFor("short", alice)).toBeNull();
  });
  it("expires jobs after the retention window and releases the upload", () => {
    const job = make();
    const later = job.expiresAt + 1;
    expect(getJobFor(job.id, alice, later)).toBeNull();
    const job2 = make();
    __sweepForTests(job2.expiresAt + 1);
    expect(job2.data).toBeNull();
    expect(getJobFor(job2.id, alice)).toBeNull();
  });
});
