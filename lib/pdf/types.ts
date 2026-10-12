import type { ConversionSettings } from "@/lib/validation/conversion-schema";

/** A positioned run of text. Coordinates are in top-left-origin points (y grows downward). */
export interface TextRun {
  text: string;
  x: number;
  /** Baseline y. */
  y: number;
  width: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  href?: string;
}

export interface ExtractedPage {
  pageNumber: number;
  width: number;
  height: number;
  runs: TextRun[];
  /** Non-whitespace characters found in the text layer. */
  charCount: number;
  imageCount: number;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  pageCount: number;
}

export interface PdfDocumentHandle {
  readonly numPages: number;
  readonly metadata: PdfMetadata;
  getPage(pageNumber: number): Promise<ExtractedPage>;
  /** Rasterises a page to PNG (used for OCR). */
  renderPagePng(pageNumber: number, maxDimension?: number): Promise<Buffer>;
  destroy(): Promise<void>;
}

/** Text-extraction engine. PDF.js is the default implementation. */
export interface PdfExtractor {
  open(data: Uint8Array, options?: { signal?: AbortSignal }): Promise<PdfDocumentHandle>;
}

export interface OcrLine {
  text: string;
  /** Pixel bounding box in the rendered page image. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrResult {
  text: string;
  /** Recognised lines with geometry, in reading order, when the engine provides them. */
  lines?: OcrLine[];
  /** 0-100 mean word confidence as reported by the engine. */
  confidence: number;
}

/** OCR engine. Tesseract.js is the default implementation. */
export interface OcrEngine {
  recognize(png: Buffer, language: string, signal?: AbortSignal): Promise<OcrResult>;
  terminate(): Promise<void>;
}

// ---- layout model -------------------------------------------------------

export interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}

export interface Line {
  runs: TextRun[];
  segments: Segment[];
  x0: number;
  x1: number;
  y: number;
  fontSize: number;
  /** True when every non-space character is bold. */
  bold: boolean;
  plain: string;
  /** Lines in different regions are never merged into one paragraph. */
  region: number;
}

export type Block =
  | {
      type: "heading";
      level: number;
      segments: Segment[];
      plain: string;
      page: number;
      /** Layout hints used while assigning levels across the document. */
      size?: number;
      boldOnly?: boolean;
    }
  | { type: "paragraph"; segments: Segment[]; plain: string; page: number }
  | {
      type: "list-item";
      ordered: boolean;
      number?: number;
      depth: number;
      segments: Segment[];
      plain: string;
      page: number;
    }
  | { type: "table"; rows: Segment[][][]; plain: string; page: number; columns: number }
  | { type: "image"; page: number; count: number; plain: string };

export interface PageResult {
  pageNumber: number;
  blocks: Block[];
  source: "text" | "ocr";
  ocrConfidence?: number;
}

export type WarningCode =
  | "scanned_no_ocr"
  | "ocr_unavailable"
  | "ocr_low_confidence"
  | "page_empty"
  | "replacement_chars"
  | "tables_uncertain";

export interface ConversionWarning {
  code: WarningCode;
  message: string;
  pages?: number[];
}

export interface ConversionStats {
  pages: number;
  characters: number;
  words: number;
  tables: number;
  headings: number;
  links: number;
  pagesOcr: number;
  pagesWithoutText: number;
  headersFootersRemoved: number;
  durationMs: number;
}

export interface ConversionResult {
  markdown: string;
  stats: ConversionStats;
  warnings: ConversionWarning[];
  metadata: PdfMetadata;
}

export type ConversionStage = "validating" | "extracting" | "ocr" | "formatting";

export interface ProgressEvent {
  stage: ConversionStage;
  current?: number;
  total?: number;
}

export interface ConvertOptions {
  filename?: string;
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
  engines?: {
    extractor?: PdfExtractor;
    ocr?: OcrEngine | null;
  };
  limits: { maxPages: number };
}

export type { ConversionSettings };
