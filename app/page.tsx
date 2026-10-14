import { Converter } from "@/components/converter/converter";
import { Hero } from "@/components/home/hero";
import {
  FeaturesSection,
  HowItWorksSection,
  PrivacyNotice,
} from "@/components/home/info-sections";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getEnv, getLimits } from "@/lib/env";

export const dynamic = "force-static";

export default function Home() {
  const limits = getLimits();
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Converter
          limits={{
            maxUploadMb: limits.maxUploadMb,
            maxPages: limits.maxPages,
            retentionMinutes: limits.retentionMinutes,
          }}
          ocrAvailable={getEnv().OCR_ENABLED}
          hero={<Hero />}
          below={
            <>
              <FeaturesSection />
              <HowItWorksSection />
              <PrivacyNotice retentionMinutes={limits.retentionMinutes} />
            </>
          }
        />
      </main>
      <SiteFooter />
    </>
  );
}
