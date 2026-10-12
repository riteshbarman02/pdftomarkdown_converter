import { describe, expect, it } from "vitest";
import { conversionSettingsSchema, DEFAULT_SETTINGS } from "@/lib/validation/conversion-schema";
import { AppError, toAppError } from "@/lib/errors";
import { checkRateLimit, resetRateLimits } from "@/lib/security/rate-limit";

describe("conversion settings", () => {
  it("fills in sensible defaults", () => {
    expect(conversionSettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.ocrEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.flavor).toBe("gfm");
  });
  it("rejects unknown OCR languages (prevents arbitrary downloads)", () => {
    expect(conversionSettingsSchema.safeParse({ ocrLanguage: "../x" }).success).toBe(false);
    expect(conversionSettingsSchema.safeParse({ ocrLanguage: "deu" }).success).toBe(true);
  });
  it("rejects wrong types", () => {
    expect(conversionSettingsSchema.safeParse({ detectTables: "yes" }).success).toBe(false);
  });
});

describe("error mapping", () => {
  it("maps pdf.js exceptions to user-safe codes", () => {
    const pw = Object.assign(new Error("No password given"), { name: "PasswordException" });
    expect(toAppError(pw)).toMatchObject({ code: "PASSWORD_PROTECTED", status: 422 });
    const bad = Object.assign(new Error("Invalid PDF structure"), { name: "InvalidPDFException" });
    expect(toAppError(bad).code).toBe("CORRUPT_PDF");
  });
  it("hides internal details", () => {
    const e = toAppError(new Error("ENOENT: /srv/secret/path"));
    expect(e.code).toBe("INTERNAL");
    expect(e.message).not.toContain("/srv");
  });
  it("passes AppErrors through", () => {
    const e = new AppError("TOO_MANY_PAGES", "x");
    expect(toAppError(e)).toBe(e);
    expect(e.status).toBe(422);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    expect(checkRateLimit("k", 2, 1000, t0).allowed).toBe(true);
    expect(checkRateLimit("k", 2, 1000, t0).allowed).toBe(true);
    const blocked = checkRateLimit("k", 2, 1000, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(checkRateLimit("k", 2, 1000, t0 + 1500).allowed).toBe(true);
    expect(checkRateLimit("other", 2, 1000, t0).allowed).toBe(true);
  });
});
