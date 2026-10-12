"use client";

import { Controller, type Control } from "react-hook-form";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OCR_LANGUAGES, type ConversionSettings } from "@/lib/validation/conversion-schema";

type BooleanKey = {
  [K in keyof ConversionSettings]: ConversionSettings[K] extends boolean ? K : never;
}[keyof ConversionSettings];

interface ToggleSpec {
  name: BooleanKey;
  label: string;
  hint?: string;
}

const GROUPS: { title: string; items: ToggleSpec[] }[] = [
  {
    title: "Text extraction",
    items: [
      { name: "preserveParagraphs", label: "Preserve paragraphs", hint: "Join wrapped lines into paragraphs. Off keeps every visual line separate." },
      { name: "preserveHeadings", label: "Detect headings", hint: "Uses font size and weight. Only clear headings are marked; ambiguous lines stay as text." },
      { name: "preserveLists", label: "Preserve lists", hint: "Recognises bullets and numbered items." },
      { name: "preserveLinks", label: "Preserve hyperlinks", hint: "Keeps link annotations as Markdown links. Links are never fetched." },
    ],
  },
  {
    title: "Document structure",
    items: [
      { name: "detectTables", label: "Extract tables", hint: "Rebuilds tables only when columns align with enough confidence." },
      { name: "pageSeparators", label: "Page separators", hint: "Inserts a horizontal rule between pages." },
      { name: "pageComments", label: "Page number comments", hint: "Adds <!-- Page N --> markers that don't show in the preview." },
      { name: "includeMetadata", label: "Document metadata", hint: "Adds author, subject, keywords and dates to the YAML front matter when the PDF has them." },
    ],
  },
  {
    title: "Markdown output",
    items: [
      { name: "frontMatter", label: "YAML front matter" },
      { name: "tableOfContents", label: "Table of contents", hint: "Generated from detected headings." },
      { name: "pageReferences", label: "Page references", hint: "Adds an italic “Page N” line at the start of each page." },
    ],
  },
];

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`More information: ${text}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

interface Props {
  control: Control<ConversionSettings>;
  ocrAvailable?: boolean;
}

export function ConversionSettingsFields({ control, ocrAvailable = true }: Props) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
          {group.items.map((item) => (
            <Controller
              key={item.name}
              control={control}
              name={item.name}
              render={({ field }) => (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`s-${item.name}`} className="flex items-center gap-1.5 font-normal">
                    {item.label}
                    {item.hint && <InfoTip text={item.hint} />}
                  </Label>
                  <Switch
                    id={`s-${item.name}`}
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          ))}
        </fieldset>
      ))}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">OCR (scanned pages)</legend>
        <Controller
          control={control}
          name="ocrEnabled"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="s-ocrEnabled" className="flex items-center gap-1.5 font-normal">
                Enable OCR
                <InfoTip
                  text={
                    ocrAvailable
                      ? "Runs only on pages without a usable text layer unless “Always” is selected. Recognition happens on the server."
                      : "OCR is disabled on this server."
                  }
                />
              </Label>
              <Switch
                id="s-ocrEnabled"
                checked={!!field.value && ocrAvailable}
                disabled={!ocrAvailable}
                onCheckedChange={field.onChange}
              />
            </div>
          )}
        />
        <Controller
          control={control}
          name="ocrLanguage"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label className="font-normal" id="lbl-ocrLanguage">
                Language
              </Label>
              <Select
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                items={OCR_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              >
                <SelectTrigger aria-labelledby="lbl-ocrLanguage" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OCR_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
        <Controller
          control={control}
          name="ocrMode"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-1.5 font-normal" id="lbl-ocrMode">
                Mode
                <InfoTip text="Automatic: use the text layer and OCR only pages without one. Always: OCR every page (slower)." />
              </Label>
              <Select
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                items={[
                  { value: "auto", label: "Automatic (text layer first)" },
                  { value: "always", label: "Always OCR" },
                ]}
              >
                <SelectTrigger aria-labelledby="lbl-ocrMode" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic (text layer first)</SelectItem>
                  <SelectItem value="always">Always OCR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Format</legend>
        <Controller
          control={control}
          name="flavor"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-1.5 font-normal" id="lbl-flavor">
                Markdown flavor
                <InfoTip text="GitHub Flavored Markdown supports tables. Standard Markdown keeps tables as aligned code blocks." />
              </Label>
              <Select
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                items={[
                  { value: "gfm", label: "GitHub Flavored" },
                  { value: "standard", label: "Standard" },
                ]}
              >
                <SelectTrigger aria-labelledby="lbl-flavor" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gfm">GitHub Flavored</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />
        <Controller
          control={control}
          name="imageHandling"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-1.5 font-normal" id="lbl-images">
                Images
                <InfoTip text="Embedded images are not extracted. “Note their presence” adds a line saying how many images a page had." />
              </Label>
              <Select
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                items={[
                  { value: "omit", label: "Omit" },
                  { value: "placeholder", label: "Note their presence" },
                ]}
              >
                <SelectTrigger aria-labelledby="lbl-images" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="omit">Omit</SelectItem>
                  <SelectItem value="placeholder">Note their presence</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </fieldset>
    </div>
  );
}
