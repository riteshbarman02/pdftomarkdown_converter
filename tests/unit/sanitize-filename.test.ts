import { describe, expect, it } from "vitest";
import {
  baseNameWithoutExtension,
  contentDisposition,
  sanitizeFilename,
} from "@/lib/security/sanitize-filename";

describe("sanitizeFilename", () => {
  it("strips directories and traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
  });
  it("removes control and reserved characters", () => {
    expect(sanitizeFilename('a<b>c:"d|e?f*.pdf')).toBe("abcdef.pdf");
    expect(sanitizeFilename("bad\u0000name\n.pdf")).toBe("badname.pdf");
  });
  it("neutralises hidden files, trailing dots and Windows device names", () => {
    expect(sanitizeFilename(".htaccess")).toBe("htaccess");
    expect(sanitizeFilename("file. . ")).toBe("file");
    expect(sanitizeFilename("CON.pdf")).toBe("_CON.pdf");
  });
  it("falls back for empty results and bounds length", () => {
    expect(sanitizeFilename("   ")).toBe("document");
    expect(sanitizeFilename("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });
  it("preserves Unicode", () => {
    expect(sanitizeFilename("résumé 日本語.pdf")).toBe("résumé 日本語.pdf");
  });
  it("derives output base names", () => {
    expect(baseNameWithoutExtension("My Report.PDF")).toBe("My Report");
  });
  it("builds a safe Content-Disposition", () => {
    const h = contentDisposition('na"me;é.md');
    expect(h).toContain("attachment;");
    expect(h).not.toMatch(/filename="[^"]*"[^;]*"/);
    expect(h).toContain("filename*=UTF-8''");
  });
});
