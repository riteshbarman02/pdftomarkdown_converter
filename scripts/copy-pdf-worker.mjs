// Copies the PDF.js worker next to the app so the browser viewer loads a version-matched
// worker from the same origin (no CDN, no remote code).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = join(root, "public/pdf.worker.min.mjs");
if (!existsSync(src)) {
  console.warn("pdfjs-dist worker not found; skipping copy");
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
