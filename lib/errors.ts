export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_FILE_TYPE"
  | "INVALID_SETTINGS"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PAGES"
  | "EMPTY_FILE"
  | "PASSWORD_PROTECTED"
  | "CORRUPT_PDF"
  | "NO_TEXT_FOUND"
  | "OCR_UNAVAILABLE"
  | "TIMEOUT"
  | "CANCELLED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "NOT_READY"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_FILE_TYPE: 415,
  INVALID_SETTINGS: 400,
  FILE_TOO_LARGE: 413,
  TOO_MANY_PAGES: 422,
  EMPTY_FILE: 422,
  PASSWORD_PROTECTED: 422,
  CORRUPT_PDF: 422,
  NO_TEXT_FOUND: 422,
  OCR_UNAVAILABLE: 422,
  TIMEOUT: 504,
  CANCELLED: 409,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  NOT_READY: 409,
  INTERNAL: 500,
};

/** User-safe error. `message` is always safe to show to end users. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
  }
}

/**
 * Maps any thrown value (including pdf.js exceptions) to an AppError that is safe
 * to return to clients. Internal details are never exposed.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const name = (err as { name?: string } | null)?.name;
  switch (name) {
    case "PasswordException":
      return new AppError(
        "PASSWORD_PROTECTED",
        "This PDF is password-protected. Remove the password and try again.",
        { cause: err },
      );
    case "InvalidPDFException":
    case "FormatError":
    case "MissingPDFException":
      return new AppError(
        "CORRUPT_PDF",
        "This file could not be read as a PDF. It may be corrupt or truncated.",
        { cause: err },
      );
    case "AbortException":
      return new AppError("CANCELLED", "The conversion was cancelled.", { cause: err });
  }
  return new AppError("INTERNAL", "Something went wrong while converting this document.", {
    cause: err,
  });
}

export function errorBody(err: AppError) {
  return { error: { code: err.code, message: err.message } };
}
