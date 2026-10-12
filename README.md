# PDF to Markdown

A Next.js (App Router, TypeScript) web app that converts PDFs to clean, editable Markdown:
upload → server-side validation → layout-aware extraction (PDF.js) → optional OCR (Tesseract.js)
→ Markdown → preview, edit, copy, download.

## What it does

- **Upload**: drag & drop or file picker, real upload-progress, cancel, remove/replace.
- **Validation (server-side)**: `.pdf` extension, declared MIME cross-check, `%PDF-` signature, size limit
  enforced while streaming the body, page limit, password/corrupt detection.
- **Extraction**: PDF.js text + positions + font weight/style + link annotations, page by page.
- **Structure**: paragraphs, headings (font size / bold), bullet & numbered lists with nesting,
  hyperlinks, two-column reading order, running header/footer and page-number removal,
  tables (only when columns align with enough confidence).
- **OCR**: pages without a usable text layer are rendered and read with Tesseract.js; OCR lines go through
  the *same* layout analysis as text pages. Mixed documents work page by page.
- **Workspace**: PDF viewer (page nav, zoom) next to a CodeMirror source editor (find & replace) and a
  sanitized rendered preview. Copy, `.md` / `.txt` download, re-run, settings, revert, and a confirmation
  before edits are discarded.
- **Statistics**: pages, characters, words, tables, headings, links, OCR pages, duration, and warnings —
  only values the engine actually computes. No accuracy scores.

## Quick start

```bash
npm install          # also copies the PDF.js worker into public/
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + integration tests (uses generated PDF fixtures) |
| `npm run test:e2e` | Playwright against a production build (`npx playwright install chromium` once) |
| `npm run fixtures` | Regenerate `tests/fixtures/*.pdf` (synthetic, original content) |

## Configuration

Copy `.env.example`. Everything is optional and validated at first use (`lib/env.ts`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `MAX_UPLOAD_SIZE_MB` | 25 | Max PDF size; enforced server-side while reading the body |
| `MAX_PDF_PAGES` | 200 | Max pages per document |
| `JOB_RETENTION_MINUTES` | 30 | How long results stay in memory |
| `CONVERSION_TIMEOUT_SECONDS` | 180 | Wall-clock limit per conversion |
| `MAX_CONCURRENT_JOBS` | 2 | Parallel conversions per process; others wait as `queued` |
| `RATE_LIMIT_CONVERSIONS_PER_MINUTE` | 10 | Per client address |
| `OCR_ENABLED` | true | Disable to turn OCR off entirely |
| `OCR_LANG_PATH` | – | Self-hosted `<lang>.traineddata.gz` location (air-gapped) |
| `OCR_CACHE_PATH` | temp dir | Language-data cache |
| `LOG_LEVEL` | info | pino level |

### OCR

OCR uses Tesseract.js in a worker thread (it does not block the event loop). The first use of a language
makes the **server** download that language's `traineddata` from the Tesseract.js CDN; only language data
is fetched, never your document. For offline/air-gapped hosts, set `OCR_LANG_PATH` to a directory or URL
you host. The selectable languages are a fixed allow-list in `lib/validation/conversion-schema.ts`.

If OCR can't run, the app says so (warning, or `OCR_UNAVAILABLE` if nothing could be read) instead of
returning empty Markdown.

## Architecture

```
app/
  page.tsx, privacy/, terms/        UI pages
  api/convert                       POST  multipart {file, settings, mode?} → 202 {id} (or 200 with mode=sync)
  api/jobs/[jobId]                  GET   status, stage, page progress, result when completed
  api/jobs/[jobId]/cancel           POST  cancel queued/running job
  api/download/[jobId]?format=md|txt GET  attachment with safe Content-Disposition
  api/health, api/capabilities
components/                         upload/, converter/, editor/, pdf/, layout/, home/, ui/ (shadcn)
lib/
  pdf/            types · validate-pdf · extract-text (PDF.js adapter) · detect-layout · detect-tables
                  · ocr (Tesseract adapter) · serialize-markdown · markdown (escaping) · convert-to-markdown
  jobs/           in-memory store (retention sweep) · runner (concurrency, timeout, cancel)
  security/       sanitize-filename · rate-limit · owner (cookie → job ownership)
  validation/     Zod settings schema
  env.ts errors.ts logger.ts
tests/            unit/ integration/ e2e/ fixtures/
```

### Pipeline (`lib/pdf/convert-to-markdown.ts`)

1. **validating** – open with PDF.js (password / corrupt → typed errors), enforce page limit.
2. **extracting** – per page: runs with position, size, bold/italic, link target; image count.
3. **ocr** – only for pages with < 25 text characters *and* images (or every page with "Always OCR").
   Blank pages are skipped. The OCR text never replaces a longer text layer.
4. **formatting** – document stats (body size, line spacing) → rows → column gutter detection →
   lines → remove running headers/footers → tables → paragraphs / lists / headings → heading levels →
   Markdown serialization (escaping only where syntax would change meaning) → output checks.

Engines are behind interfaces (`PdfExtractor`, `OcrEngine` in `lib/pdf/types.ts`) and injected into the
pipeline, so they can be tested with fakes and replaced independently.

### Jobs and privacy model

- The upload lives in memory only, and is released as soon as processing ends. The app never writes
  documents to disk.
- Job ids are 192-bit random. Every lookup/download also requires the HttpOnly owner cookie of the browser
  that created the job; other sessions get `404` (indistinguishable from "expired").
- Results are deleted after `JOB_RETENTION_MINUTES`, or on restart.
- Logs contain job ids, counts, durations and error codes — never document text.
- The preview disables raw HTML and sanitizes output; remote images are not loaded; PDF.js runs with eval
  disabled and URLs inside PDFs are never fetched.

## Deployment

The conversion job store is **in memory**, so the app needs one long-lived Node process (or sticky
routing). Pick accordingly:

| Platform | Status |
| --- | --- |
| Single VM / container (Docker, Fly.io, Railway, Render, ECS single task) | **Supported.** `Dockerfile` provided (see caveat below). Give it ≥ 1 GB RAM; a 200-page text PDF used roughly 400 MB RSS in testing. |
| Several replicas | Needs sticky sessions, or a shared job store (not implemented). |
| Vercel / serverless | **Not recommended as-is.** The in-memory job store does not survive across invocations, serverless request bodies are limited (about 4.5 MB on Vercel), and OCR is CPU/time heavy. A workable layout is the Next.js UI on Vercel and this conversion API in a container — the API surface is already separated, but that split is not built or tested here. |

Health check: `GET /api/health`. Run behind a reverse proxy that also caps request body size.

> The Dockerfile has **not** been built in this environment (no Docker available). Treat it as a starting
> point.

## Limitations (honest list)

- **Tables**: detected from aligned cell columns only. Ruled-line tables, multi-line cell content, merged
  cells and tables inside multi-column pages are not handled; uncertain tables stay as text and a warning
  says how many.
- **Columns**: one two-column gutter per page. Three or more columns, or complex magazine layouts, may
  read in the wrong order.
- **Headings** come from font size and bold weight; documents that style headings in unusual ways may
  need manual edits. Inline bold/italic is kept, other styling isn't.
- **Hyphenation**: a hyphen at a line end is kept (`inter-national`), because a real compound hyphen
  can't be distinguished from a split word.
- **Images** are not extracted (the setting can note that a page had images). No ZIP/JSON export.
- **OCR** quality depends on scan quality; it returns line text with geometry only (no font info), so
  heading detection on scans relies on line height. Right-to-left and vertical scripts are untested.
- **Not implemented** from the optional list: Python/PyMuPDF/Camelot service, vision-LLM enhancement,
  Redis/BullMQ, Upstash rate limiting, object storage. The adapter interfaces are where those would plug in.
- Rate limiting is per process (in memory).
