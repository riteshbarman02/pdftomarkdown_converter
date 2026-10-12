import { getEnv, getLimits } from "@/lib/env";
import { OCR_LANGUAGES } from "@/lib/validation/conversion-schema";

export function GET() {
  const limits = getLimits();
  return Response.json(
    {
      limits: {
        maxUploadMb: limits.maxUploadMb,
        maxPages: limits.maxPages,
        retentionMinutes: limits.retentionMinutes,
      },
      ocr: { enabled: getEnv().OCR_ENABLED, languages: OCR_LANGUAGES },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
