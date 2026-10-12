import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getEnv, getLimits } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy — PDF to Markdown" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const limits = getLimits();
  const ocr = getEnv().OCR_ENABLED;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-muted-foreground">
          This page describes what this deployment of PDF to Markdown actually does with your files.
          If you self-host it, your operator&apos;s own policies also apply.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">What is processed</h2>
          <p>
            The PDF you select is uploaded to the server and converted there. The file is held in
            memory while it is processed and released when processing ends. The application does not
            write uploaded documents to disk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">How long results are kept</h2>
          <p>
            The converted Markdown stays in server memory for up to {limits.retentionMinutes} minutes
            so you can download it, and is then deleted. Restarting the server also clears it. Access
            requires the browser that created the job; the job link alone is not enough.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">OCR</h2>
          <p>
            {ocr
              ? "OCR runs on the server using Tesseract.js. Your document is not sent to an external OCR service. On first use of a language, the server downloads that language's recognition data from the Tesseract.js content delivery network (or from the operator's own mirror); only the language data request leaves the server, not your document."
              : "OCR is disabled in this deployment."}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Logs and analytics</h2>
          <p>
            Server logs record job identifiers, counts, durations and error codes — not document
            contents or extracted text. Your hosting provider may keep standard request logs (such as
            IP addresses). This application includes no analytics or advertising trackers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Your browser</h2>
          <p>
            The PDF preview and Markdown editor run in your browser. Your theme preference is stored
            in local storage; a short-lived, HttpOnly cookie identifies your browser to the jobs it
            created.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
