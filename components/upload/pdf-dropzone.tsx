"use client";

import { useDropzone, type FileRejection } from "react-dropzone";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  maxSizeMb: number;
  disabled?: boolean;
  compact?: boolean;
  onFile: (file: File) => void;
}

function rejectionMessage(rejections: FileRejection[], maxSizeMb: number): string {
  const codes = rejections.flatMap((r) => r.errors.map((e) => e.code));
  if (codes.includes("too-many-files")) return "Please add one PDF at a time.";
  if (codes.includes("file-too-large")) return `That file is larger than the ${maxSizeMb} MB limit.`;
  if (codes.includes("file-invalid-type")) return "Only PDF files are supported.";
  return "That file could not be added.";
}

export function PdfDropzone({ maxSizeMb, disabled, compact, onFile }: Props) {
  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    maxSize: maxSizeMb * 1024 * 1024,
    disabled,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files) => onFile(files[0]),
    onDropRejected: (r) => toast.error(rejectionMessage(r, maxSizeMb)),
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "rounded-2xl border-2 border-dashed bg-card text-center transition-colors",
        compact ? "p-6" : "p-10 sm:p-14",
        isDragActive && !isDragReject && "border-primary bg-primary/5",
        isDragReject && "border-destructive bg-destructive/5",
        !isDragActive && "border-border hover:border-muted-foreground/50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input {...getInputProps()} aria-label="Choose a PDF file" />
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-muted">
          <FileUp className="size-5" aria-hidden />
        </span>
        <p className="text-base font-medium">
          {isDragReject
            ? "Only PDF files can be dropped here"
            : isDragActive
              ? "Drop the PDF to select it"
              : compact
                ? "Drop another PDF to replace the current one"
                : "Drag and drop a PDF here"}
        </p>
        <p className="text-sm text-muted-foreground">
          PDF files up to {maxSizeMb} MB. Text-based and scanned documents are supported.
        </p>
        <Button variant="outline" size="lg" onClick={open} disabled={disabled}>
          Browse files
        </Button>
      </div>
    </div>
  );
}
