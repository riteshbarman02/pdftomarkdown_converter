"use client";

import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/client/download";

interface Props {
  file: File;
  disabled?: boolean;
  onRemove: () => void;
}

export function SelectedFile({ file, disabled, onRemove }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
        <FileText className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · PDF</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
        <Trash2 aria-hidden />
        Remove
      </Button>
    </div>
  );
}
