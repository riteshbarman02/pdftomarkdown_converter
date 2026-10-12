import { describe, expect, it } from "vitest";
import { hasPdfSignature, validatePdfUpload } from "@/lib/pdf/validate-pdf";

const bytes = (s: string) => new TextEncoder().encode(s);
const limits = { maxBytes: 1024 };

describe("validatePdfUpload", () => {
  it("accepts a PDF with header", () => {
    expect(() =>
      validatePdfUpload({ name: "a.pdf", size: 8, type: "application/pdf" }, bytes("%PDF-1.7\n"), limits),
    ).not.toThrow();
  });
  it("accepts junk before the header (within 1 KiB)", () => {
    expect(hasPdfSignature(bytes("junk\n%PDF-1.4"))).toBe(true);
  });
  it("rejects renamed non-PDFs by content, not by claimed type", () => {
    expect(() =>
      validatePdfUpload({ name: "a.pdf", size: 5, type: "application/pdf" }, bytes("hello"), limits),
    ).toThrowError(/not a valid PDF/);
  });
  it("rejects wrong extension", () => {
    expect(() =>
      validatePdfUpload({ name: "a.txt", size: 8, type: "application/pdf" }, bytes("%PDF-1.7"), limits),
    ).toThrowError(/\.pdf/);
  });
  it("rejects clearly contradictory MIME types", () => {
    expect(() =>
      validatePdfUpload({ name: "a.pdf", size: 8, type: "image/png" }, bytes("%PDF-1.7"), limits),
    ).toThrowError(/PDF/);
  });
  it("rejects empty and oversized files with distinct codes", () => {
    expect(() =>
      validatePdfUpload({ name: "a.pdf", size: 0, type: "" }, new Uint8Array(0), limits),
    ).toThrowError(expect.objectContaining({ code: "EMPTY_FILE" }));
    expect(() =>
      validatePdfUpload({ name: "a.pdf", size: 2000, type: "" }, new Uint8Array(2000), limits),
    ).toThrowError(expect.objectContaining({ code: "FILE_TOO_LARGE" }));
  });
});
