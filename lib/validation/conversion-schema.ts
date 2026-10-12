import { z } from "zod";

/** Languages the OCR stage is allowed to request (prevents arbitrary language-data downloads). */
export const OCR_LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "spa", label: "Spanish" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "rus", label: "Russian" },
  { code: "ara", label: "Arabic" },
  { code: "hin", label: "Hindi" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
] as const;

const ocrCodes = OCR_LANGUAGES.map((l) => l.code) as [string, ...string[]];

export const conversionSettingsSchema = z.object({
  // Text extraction
  preserveParagraphs: z.boolean().default(true),
  preserveHeadings: z.boolean().default(true),
  preserveLists: z.boolean().default(true),
  preserveLinks: z.boolean().default(true),
  // Document structure
  detectTables: z.boolean().default(true),
  pageSeparators: z.boolean().default(false),
  pageComments: z.boolean().default(false),
  includeMetadata: z.boolean().default(false),
  // OCR
  ocrEnabled: z.boolean().default(true),
  ocrLanguage: z.enum(ocrCodes).default("eng"),
  /** "auto": OCR only pages without a usable text layer. "always": OCR every page. */
  ocrMode: z.enum(["auto", "always"]).default("auto"),
  // Markdown output
  flavor: z.enum(["gfm", "standard"]).default("gfm"),
  frontMatter: z.boolean().default(false),
  tableOfContents: z.boolean().default(false),
  pageReferences: z.boolean().default(false),
  imageHandling: z.enum(["omit", "placeholder"]).default("omit"),
});

export type ConversionSettings = z.infer<typeof conversionSettingsSchema>;

export const DEFAULT_SETTINGS: ConversionSettings = conversionSettingsSchema.parse({});
