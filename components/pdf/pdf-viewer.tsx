"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfDoc = any;

interface Props {
  file: File;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

export function PdfViewer({ file }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState<number | null>(null); // null = fit width
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the document (browser only; the file never leaves this tab for viewing).
  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
        pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
        const data = new Uint8Array(await file.arrayBuffer());
        const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false });
        task = loadingTask;
        loaded = await loadingTask.promise;
        if (cancelled) {
          void task?.destroy();
          return;
        }
        setDoc(loaded);
        setPage(1);
        setPageInput("1");
      } catch {
        if (!cancelled) setError("The preview could not be rendered.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file]);

  const renderPage = useCallback(async () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container) return () => {};
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const available = Math.max(200, container.clientWidth - 32);
    const scale = zoom ?? Math.min(MAX_ZOOM, available / base.width);
    const dpr = window.devicePixelRatio || 1;
    const viewport = pdfPage.getViewport({ scale: scale * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    const task = pdfPage.render({
      canvasContext: canvas.getContext("2d"),
      canvas,
      viewport,
    });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [doc, page, zoom]);

  useEffect(() => {
    let cancel: (() => void) | undefined;
    let stopped = false;
    renderPage().then((c) => {
      if (stopped) c?.();
      else cancel = c;
    });
    const container = containerRef.current;
    const ro = container && zoom === null ? new ResizeObserver(() => void renderPage()) : null;
    if (ro && container) ro.observe(container);
    return () => {
      stopped = true;
      cancel?.();
      ro?.disconnect();
    };
  }, [renderPage, zoom]);

  const total = doc?.numPages ?? 0;
  const go = (n: number) => {
    const next = Math.min(Math.max(1, n), Math.max(1, total));
    setPage(next);
    setPageInput(String(next));
  };
  const currentScale = zoom ?? 1;
  const step = (dir: 1 | -1) =>
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(currentScale + dir * 0.2).toFixed(2))));

  return (
    <div className="flex h-full min-h-[24rem] flex-col rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <label className="flex items-center gap-1 text-sm">
            <span className="sr-only">Page number</span>
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => go(parseInt(pageInput || "1", 10))}
              onKeyDown={(e) => e.key === "Enter" && go(parseInt(pageInput || "1", 10))}
              inputMode="numeric"
              className="h-7 w-12 rounded-md border bg-background px-1 text-center tabular-nums"
              disabled={!doc}
            />
            <span className="text-muted-foreground">/ {total || "–"}</span>
          </label>
          <Button variant="ghost" size="icon-sm" onClick={() => go(page + 1)} disabled={!doc || page >= total} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Zoom out" disabled={!doc}>
            <ZoomOut />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label="Zoom in" disabled={!doc}>
            <ZoomIn />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom(null)} aria-label="Fit to width" disabled={!doc}>
            <Maximize2 />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-muted/50 p-4">
        {loading && <div className="mx-auto h-96 max-w-md animate-pulse rounded bg-muted" aria-label="Loading preview" />}
        {error && <p className="text-center text-sm text-muted-foreground">{error}</p>}
        <canvas
          ref={canvasRef}
          className="mx-auto block rounded bg-white shadow-md"
          aria-label={`Page ${page} of ${total}`}
          hidden={!doc}
        />
      </div>
    </div>
  );
}
