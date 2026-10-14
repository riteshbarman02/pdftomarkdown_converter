import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy — PDF to Markdown" };
export const dynamic = "force-static";

export default function PrivacyPage() {
  const ocr = getEnv().OCR_ENABLED;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-muted-foreground">
          This page describes what this deployment of PDF to Markdown actually does with your files.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">What is processed</h2>
          <p>
            The PDF you select is processed entirely inside your web browser using PDF.js and WebAssembly.
            Your document is never uploaded to any server or external service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">How long results are kept</h2>
          <p>
            The converted Markdown remains only in your active browser session memory until you close or refresh
            the tab. No files are persisted on external servers or databases.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">OCR</h2>
          <p>
            {ocr
              ? "OCR runs directly in your browser using Tesseract.js Web Workers. Your document never leaves your machine."
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
            The PDF preview, conversion, OCR and Markdown editor run entirely in your browser.
            Your theme preference is stored in local storage.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
