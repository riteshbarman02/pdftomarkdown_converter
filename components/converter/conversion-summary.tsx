import { AlertTriangle } from "lucide-react";
import type { ConversionResult } from "@/lib/pdf/types";

interface Props {
  filename: string;
  result: ConversionResult;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Shows only values the conversion engine actually calculated. */
export function ConversionSummary({ filename, result }: Props) {
  const { stats, warnings } = result;
  const seconds = (stats.durationMs / 1000).toFixed(stats.durationMs < 10_000 ? 2 : 1);
  return (
    <section aria-label="Conversion statistics" className="space-y-3">
      <p className="truncate text-sm text-muted-foreground" title={filename}>
        {filename}
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        <Stat label="Pages" value={stats.pages} />
        <Stat label="Characters" value={stats.characters.toLocaleString()} />
        <Stat label="Words" value={stats.words.toLocaleString()} />
        <Stat label="Tables" value={stats.tables} />
        <Stat label="Headings" value={stats.headings} />
        <Stat label="OCR pages" value={stats.pagesOcr} />
        <Stat label="Links" value={stats.links} />
        <Stat label="Header/footer lines removed" value={stats.headersFootersRemoved} />
        <Stat label="Duration" value={`${seconds} s`} />
      </dl>
      {warnings.length > 0 && (
        <ul className="space-y-2" aria-label="Warnings">
          {warnings.map((w, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                {w.message}
                {w.pages?.length ? (
                  <span className="text-muted-foreground">
                    {" "}
                    (page{w.pages.length > 1 ? "s" : ""} {w.pages.slice(0, 12).join(", ")}
                    {w.pages.length > 12 ? "…" : ""})
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
