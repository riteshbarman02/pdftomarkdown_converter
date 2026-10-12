import { FileSearch, FileType, Table2, ScanText, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: FileType,
    title: "Layout-aware text extraction",
    body: "Uses positions and font sizes — not just raw text — to rebuild paragraphs, headings, lists and reading order, including two-column pages.",
  },
  {
    icon: ScanText,
    title: "OCR for scanned pages",
    body: "Pages with no text layer are detected and read with OCR. Mixed documents are handled page by page.",
  },
  {
    icon: Table2,
    title: "Table reconstruction",
    body: "Aligned columns become Markdown tables. If a table is too uncertain, it stays as text and you are told.",
  },
  {
    icon: FileSearch,
    title: "Edit, preview, export",
    body: "Compare with the original PDF, edit the Markdown with find & replace, then download .md or .txt.",
  },
];

const steps = [
  { n: 1, title: "Upload", body: "Drop a PDF. The server validates it and enforces size and page limits." },
  { n: 2, title: "Convert", body: "Text is extracted, scanned pages are OCR'd if needed, and structure is rebuilt." },
  { n: 3, title: "Review & export", body: "Check the result beside the PDF, edit if you like, and download." },
];

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">Features</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <Icon className="size-5" aria-hidden />
            <h3 className="mt-3 font-medium">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16">
      <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="rounded-xl border bg-card p-5">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-sm text-primary-foreground">
              {s.n}
            </span>
            <h3 className="mt-3 font-medium">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PrivacyNotice({ retentionMinutes }: { retentionMinutes: number }) {
  return (
    <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16">
      <div className="flex gap-4 rounded-xl border bg-card p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="text-sm">
          <h2 className="font-medium">How your file is handled</h2>
          <p className="mt-1 text-muted-foreground">
            Your PDF is uploaded to this application&apos;s server and processed in memory. The upload
            is discarded as soon as processing ends; the converted result is kept in server memory for
            up to {retentionMinutes} minutes so you can download it, then deleted. Document contents
            are not written to logs. OCR runs on the server and does not send your document to a
            third party. See the{" "}
            <a className="underline underline-offset-4" href="/privacy">
              privacy policy
            </a>{" "}
            for details.
          </p>
        </div>
      </div>
    </section>
  );
}
