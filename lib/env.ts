import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(500).default(25),
  MAX_PDF_PAGES: z.coerce.number().int().min(1).max(5000).default(200),
  JOB_RETENTION_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  CONVERSION_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(3600).default(180),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(16).default(2),
  RATE_LIMIT_CONVERSIONS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  OCR_ENABLED: boolish.default(true),
  /** Optional base URL/dir hosting Tesseract `*.traineddata.gz` files (air-gapped deployments). */
  OCR_LANG_PATH: z.string().optional(),
  OCR_CACHE_PATH: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

/** Parses and caches environment configuration. Throws a readable error on invalid values. */
export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export function getLimits() {
  const env = getEnv();
  return {
    maxUploadBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    maxUploadMb: env.MAX_UPLOAD_SIZE_MB,
    maxPages: env.MAX_PDF_PAGES,
    retentionMinutes: env.JOB_RETENTION_MINUTES,
    timeoutMs: env.CONVERSION_TIMEOUT_SECONDS * 1000,
  };
}
