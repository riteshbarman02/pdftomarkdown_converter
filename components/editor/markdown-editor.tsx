"use client";

import { useEffect, useRef } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { openSearchPanel } from "@codemirror/search";
import { useIsDark } from "@/hooks/use-dark-mode";

export interface EditorHandle {
  openFind: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  handleRef?: React.MutableRefObject<EditorHandle | null>;
}

export default function MarkdownEditor({ value, onChange, handleRef }: Props) {
  const dark = useIsDark();
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      openFind: () => {
        if (viewRef.current) {
          viewRef.current.focus();
          openSearchPanel(viewRef.current);
        }
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={dark ? "dark" : "light"}
      height="100%"
      className="h-full text-sm"
      extensions={[markdown(), EditorView.lineWrapping]}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, searchKeymap: true }}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
      aria-label="Markdown source"
    />
  );
}
