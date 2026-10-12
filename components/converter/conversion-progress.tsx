"use client";

import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS, type JobStatus } from "@/lib/client/convert-client";

export type WorkState =
  | { stage: "uploading"; fraction: number }
  | { stage: JobStatus; progress: { current: number; total: number } | null };

interface Props {
  state: WorkState;
  fileName: string;
  onCancel: () => void;
}

/** Only shows determinate progress when the app really has the numbers (bytes or page counts). */
export function ConversionProgress({ state, fileName, onCancel }: Props) {
  let label: string;
  let fraction: number | null = null;
  let detail: string | null = null;

  if (state.stage === "uploading") {
    label = "Uploading";
    fraction = state.fraction;
    detail = `${Math.round(state.fraction * 100)}%`;
  } else {
    label = STAGE_LABELS[state.stage];
    if (state.progress && state.progress.total > 0 && (state.stage === "extracting" || state.stage === "ocr")) {
      fraction = state.progress.current / state.progress.total;
      detail = `${state.progress.current} of ${state.progress.total} pages`;
    }
  }

  return (
    <div
      className="rounded-2xl border bg-card p-6"
      role="status"
      aria-live="polite"
      aria-label={`Converting ${fileName}`}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}…</p>
          <p className="truncate text-xs text-muted-foreground">{fileName}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X aria-hidden />
          Cancel
        </Button>
      </div>
      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      >
        {fraction === null ? (
          <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        )}
      </div>
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
