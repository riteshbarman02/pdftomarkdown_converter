import pino from "pino";
import { getEnv } from "./env";

/**
 * Structured logger. Never log document contents, extracted text or filenames
 * verbatim; log job ids, counts, durations and error codes only.
 */
export const logger = pino({
  level: getEnv().LOG_LEVEL,
  base: { app: "pdf-to-markdown" },
  redact: ["req.headers.cookie", "headers.cookie"],
});
