/**
 * Produces a safe, portable file *base name* (no directories, no control chars,
 * no reserved characters) and optionally swaps the extension.
 */
export function sanitizeFilename(input: string, fallback = "document"): string {
  let name = String(input ?? "")
    .normalize("NFKC")
    // strip any path component, either separator style
    .split(/[\\/]/)
    .pop()!;
  // control chars, reserved characters, bidi overrides
  name = name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, "");
  name = name.replace(/\s+/g, " ").trim();
  // no leading dots (hidden files / traversal), no trailing dots or spaces (Windows)
  name = name.replace(/^\.+/, "").replace(/[. ]+$/, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name)) name = `_${name}`;
  if (name.length > 120) name = name.slice(0, 120).trim();
  return name || fallback;
}

/** `Report (final).PDF` → `Report (final)`; sanitized. */
export function baseNameWithoutExtension(filename: string, fallback = "document"): string {
  const safe = sanitizeFilename(filename, fallback);
  const stripped = safe.replace(/\.pdf$/i, "").trim();
  return stripped || fallback;
}

/** Value for a `Content-Disposition` header with an ASCII fallback and RFC 5987 UTF-8 name. */
export function contentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\;]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
