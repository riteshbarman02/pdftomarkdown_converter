"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardCopy,
  Download,
  FileDown,
  Plus,
  RefreshCw,
  Replace,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConversionSummary } from "@/components/converter/conversion-summary";
import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { MarkdownPreview } from "./markdown-preview";
import type { EditorHandle } from "./markdown-editor";
import { downloadText, outputFilename } from "@/lib/client/download";
import { toPlainText } from "@/lib/pdf/serialize-markdown";
import type { ConversionResult } from "@/lib/pdf/types";

const MarkdownEditor = dynamic(() => import("./markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-muted/50" aria-label="Loading editor" />,
});

interface Props {
  file: File;
  result: ConversionResult;
  onNew: () => void;
  onRerun: () => void;
  onEditSettings: () => void;
}

type Guarded = "new" | "rerun" | "settings" | "revert";

export function ResultsWorkspace({ file, result, onNew, onRerun, onEditSettings }: Props) {
  const original = result.markdown;
  const [text, setText] = useState(original);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<Guarded | null>(null);
  const [mobileTab, setMobileTab] = useState<"markdown" | "pdf">("markdown");
  const [editorTab, setEditorTab] = useState<"source" | "preview">("source");
  const editorRef = useRef<EditorHandle | null>(null);
  const dirty = text !== original;

  // Warn on tab close when there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const run = (action: Guarded) => {
    switch (action) {
      case "new":
        return onNew();
      case "rerun":
        return onRerun();
      case "settings":
        return onEditSettings();
      case "revert":
        setText(original);
        toast.success("Reverted to the original conversion");
    }
  };
  const guard = (action: Guarded) => (dirty ? setPending(action) : run(action));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Markdown copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not access the clipboard. Select the text and copy it manually.");
    }
  };

  const plainOnDownload = useMemo(() => () => toPlainText(text), [text]);

  const pendingCopy: Record<Guarded, { title: string; confirm: string }> = {
    new: { title: "Start a new conversion?", confirm: "Discard edits and start over" },
    rerun: { title: "Re-run the conversion?", confirm: "Discard edits and re-run" },
    settings: { title: "Change settings?", confirm: "Discard edits and continue" },
    revert: { title: "Revert to the original?", confirm: "Discard my edits" },
  };

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2"
        role="toolbar"
        aria-label="Conversion actions"
      >
        <Button onClick={copy} variant="outline" size="sm">
          {copied ? <Check /> : <ClipboardCopy />}
          Copy
        </Button>
        <Button
          size="sm"
          onClick={() => downloadText(text, outputFilename(file.name, "md"), "text/markdown")}
        >
          <Download />
          Download .md
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadText(plainOnDownload(), outputFilename(file.name, "txt"), "text/plain")}
        >
          <FileDown />
          .txt
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <Button size="sm" variant="ghost" onClick={() => guard("rerun")}>
          <RefreshCw />
          <span className="hidden sm:inline">Re-run</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => guard("settings")}>
          <SlidersHorizontal />
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">Edited</span>}
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => guard("revert")}>
            <RotateCcw />
            <span className="hidden sm:inline">Revert</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => guard("new")}>
            <Plus />
            New
          </Button>
        </div>
      </div>

      <details className="rounded-xl border bg-card p-3" open={result.warnings.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">
          Conversion details
          {result.warnings.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
              {result.warnings.length} warning{result.warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </summary>
        <div className="mt-3">
          <ConversionSummary filename={file.name} result={result} />
        </div>
      </details>

      <Tabs
        value={mobileTab}
        onValueChange={(v) => setMobileTab(v as "markdown" | "pdf")}
        className="lg:hidden"
      >
        <TabsList className="w-full">
          <TabsTrigger value="markdown">Markdown</TabsTrigger>
          <TabsTrigger value="pdf">PDF</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem] lg:grid-cols-2">
        <div className={mobileTab === "pdf" ? "min-h-[28rem]" : "hidden lg:block lg:min-h-0"}>
          <PdfViewer file={file} />
        </div>
        <div
          className={`flex min-h-[28rem] flex-col overflow-hidden rounded-xl border bg-card ${
            mobileTab === "markdown" ? "" : "hidden lg:flex"
          }`}
        >
          <Tabs
            value={editorTab}
            onValueChange={(v) => setEditorTab(v as "source" | "preview")}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="flex items-center justify-between gap-2 border-b p-2">
              <TabsList>
                <TabsTrigger value="source">Source</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <Button
                size="sm"
                variant="ghost"
                disabled={editorTab !== "source"}
                onClick={() => editorRef.current?.openFind()}
              >
                <Replace />
                Find &amp; replace
              </Button>
            </div>
            <TabsContent value="source" className="min-h-0 flex-1 overflow-auto">
              <MarkdownEditor value={text} onChange={setText} handleRef={editorRef} />
            </TabsContent>
            <TabsContent value="preview" className="min-h-0 flex-1 overflow-auto p-5">
              <MarkdownPreview markdown={text} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending ? pendingCopy[pending].title : ""}</DialogTitle>
            <DialogDescription>
              You have unsaved edits to the Markdown. Continuing will discard them. Copy or
              download your edited version first if you want to keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const a = pending;
                setPending(null);
                if (a) run(a);
              }}
            >
              {pending ? pendingCopy[pending].confirm : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
