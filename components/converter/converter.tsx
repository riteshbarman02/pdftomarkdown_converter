"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfDropzone } from "@/components/upload/pdf-dropzone";
import { SelectedFile } from "@/components/upload/selected-file";
import { ConversionSettingsFields } from "./conversion-settings";
import { ConversionProgress, type WorkState } from "./conversion-progress";
import { ResultsWorkspace } from "@/components/editor/results-workspace";
import {
  ApiError,
  cancelJob,
  uploadForConversion,
  waitForJob,
} from "@/lib/client/convert-client";
import type { ConversionResult } from "@/lib/pdf/types";
import {
  conversionSettingsSchema,
  DEFAULT_SETTINGS,
  type ConversionSettings,
} from "@/lib/validation/conversion-schema";

interface Props {
  limits: { maxUploadMb: number; maxPages: number; retentionMinutes: number };
  ocrAvailable: boolean;
  hero: React.ReactNode;
  below: React.ReactNode;
}

type Phase =
  | { kind: "idle" }
  | { kind: "working"; state: WorkState }
  | { kind: "done"; result: ConversionResult; jobKey: string }
  | { kind: "error"; code: string; message: string };

const ERROR_TIPS: Record<string, string> = {
  PASSWORD_PROTECTED: "Remove the password in your PDF reader, save a copy, and upload that copy.",
  NO_TEXT_FOUND: "If this is a scan, make sure OCR is enabled in the settings.",
  OCR_UNAVAILABLE: "Text-based PDFs still convert normally. Try again later or use a PDF with a text layer.",
  CORRUPT_PDF: "Try re-exporting the document from the original application.",
  TOO_MANY_PAGES: "Split the document into smaller parts and convert them separately.",
};

export function Converter({ limits, ocrAvailable, hero, below }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const form = useForm<ConversionSettings>({
    defaultValues: DEFAULT_SETTINGS,
    resolver: zodResolver(conversionSettingsSchema) as unknown as Resolver<ConversionSettings>,
  });

  const working = phase.kind === "working";

  const convert = useCallback(
    async (target: File, settings: ConversionSettings) => {
      if (abortRef.current) return; // prevent duplicate submissions
      const controller = new AbortController();
      abortRef.current = controller;
      jobIdRef.current = null;
      setPhase({ kind: "working", state: { stage: "uploading", fraction: 0 } });
      try {
        const { id } = await uploadForConversion(target, settings, {
          signal: controller.signal,
          onUploadProgress: (fraction) =>
            setPhase({ kind: "working", state: { stage: "uploading", fraction } }),
        });
        jobIdRef.current = id;
        setPhase({ kind: "working", state: { stage: "queued", progress: null } });
        const job = await waitForJob(id, {
          signal: controller.signal,
          onUpdate: (j) =>
            setPhase({ kind: "working", state: { stage: j.status, progress: j.progress } }),
        });
        if (job.status === "completed" && job.result) {
          setPhase({ kind: "done", result: job.result, jobKey: job.id });
          toast.success("Conversion complete");
        } else if (job.status === "cancelled") {
          setPhase({ kind: "idle" });
        } else {
          const err = job.error ?? { code: "INTERNAL", message: "The conversion failed." };
          setPhase({ kind: "error", ...err });
          toast.error(err.message);
        }
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") {
          setPhase({ kind: "idle" });
        } else {
          const err =
            e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong. Please try again.");
          setPhase({ kind: "error", code: err.code, message: err.message });
          toast.error(err.message);
        }
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const cancel = () => {
    abortRef.current?.abort();
    const id = jobIdRef.current;
    if (id) void cancelJob(id);
    toast("Conversion cancelled");
  };

  // Abort in-flight work when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    setFile(null);
    setPhase({ kind: "idle" });
  };

  if (phase.kind === "done" && file) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">
        <ResultsWorkspace
          key={phase.jobKey}
          file={file}
          result={phase.result}
          onNew={reset}
          onRerun={() => void convert(file, form.getValues())}
          onEditSettings={() => setSettingsDialog(true)}
        />
        <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Conversion settings</DialogTitle>
              <DialogDescription>
                Changes apply when you re-run the conversion of {file.name}.
              </DialogDescription>
            </DialogHeader>
            <ConversionSettingsFields control={form.control} ocrAvailable={ocrAvailable} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSettingsDialog(false);
                  void convert(file, form.getValues());
                }}
              >
                Apply and re-run
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <>
      {hero}
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-16">
        {phase.kind === "error" && (
          <Alert variant="destructive" role="alert">
            <AlertCircle aria-hidden />
            <AlertTitle>Conversion failed</AlertTitle>
            <AlertDescription>
              {phase.message} {ERROR_TIPS[phase.code]}
            </AlertDescription>
          </Alert>
        )}

        {working && file ? (
          <ConversionProgress state={phase.state} fileName={file.name} onCancel={cancel} />
        ) : (
          <>
            <PdfDropzone
              maxSizeMb={limits.maxUploadMb}
              compact={!!file}
              onFile={(f) => {
                setFile(f);
                setPhase({ kind: "idle" });
              }}
            />
            {file && <SelectedFile file={file} onRemove={reset} />}
          </>
        )}

        <div className="rounded-xl border bg-card">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-xl p-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
            aria-expanded={showSettings}
            aria-controls="conversion-settings-panel"
            onClick={() => setShowSettings((s) => !s)}
          >
            <span>Conversion settings</span>
            <ChevronDown
              className={`size-4 transition-transform ${showSettings ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <div id="conversion-settings-panel" hidden={!showSettings} className="border-t p-4">
            <ConversionSettingsFields control={form.control} ocrAvailable={ocrAvailable} />
          </div>
        </div>

        <Button size="lg" className="h-11 w-full text-base" disabled={!file || working}
          onClick={() => file && void convert(file, form.getValues())}
        >
          <Sparkles aria-hidden />
          {working ? "Converting…" : "Convert to Markdown"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Limits: {limits.maxUploadMb} MB and {limits.maxPages} pages per file.
        </p>
      </div>
      {below}
    </>
  );
}
