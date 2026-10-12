import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = { title: "Terms — PDF to Markdown" };

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
        <p>
          This service is provided as is, without warranty. Conversion quality depends on how a PDF
          was authored: complex layouts, scanned documents and tables may not convert perfectly, and
          you should review the output before relying on it.
        </p>
        <p>
          Only upload documents you have the right to process. Limits on file size, page count and
          request rate apply and may change.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
