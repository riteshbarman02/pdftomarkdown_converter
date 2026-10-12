import { AppError } from "@/lib/errors";

const PDF_MIME_OK = new Set(["application/pdf", "application/x-pdf", "application/octet-stream", ""]);

/** True when `%PDF-` appears within the first 1024 bytes (the range PDF readers accept). */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < limit; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

export interface FileLike {
  name: string;
  size: number;
  type?: string;
}

/**
 * Validates an upload without trusting client claims: the extension and declared MIME type
 * are cross-checked, and the actual bytes must carry a PDF header.
 */
export function validatePdfUpload(
  file: FileLike,
  bytes: Uint8Array,
  limits: { maxBytes: number },
): void {
  if (bytes.length === 0 || file.size === 0) {
    throw new AppError("EMPTY_FILE", "The uploaded file is empty.");
  }
  if (bytes.length > limits.maxBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `This file is larger than the ${Math.round(limits.maxBytes / 1024 / 1024)} MB limit.`,
    );
  }
  if (!/\.pdf$/i.test(file.name)) {
    throw new AppError("INVALID_FILE_TYPE", "Only files with a .pdf extension are accepted.");
  }
  const mime = (file.type ?? "").toLowerCase().split(";")[0].trim();
  if (!PDF_MIME_OK.has(mime)) {
    throw new AppError("INVALID_FILE_TYPE", "This file does not look like a PDF document.");
  }
  if (!hasPdfSignature(bytes)) {
    throw new AppError(
      "INVALID_FILE_TYPE",
      "This file is not a valid PDF (missing PDF header). It may have been renamed.",
    );
  }
}
