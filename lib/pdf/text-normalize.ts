const LIGATURES: Record<string, string> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};

/**
 * Cleans a raw text-layer string: expands typographic ligatures, drops invisible
 * and control characters, converts exotic spaces. It never changes letters or
 * punctuation and preserves all other Unicode as-is.
 */
export function normalizeText(input: string): string {
  return input
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c] ?? c)
    .replace(/\u00AD/g, "") // soft hyphen
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "") // zero-width
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\r\n?/g, "\n");
}

export function collapseSpaces(input: string): string {
  return input.replace(/[ \t]+/g, " ").trim();
}

const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3040-\u30FF\uAC00-\uD7AF]/;
export const isCjk = (ch: string | undefined) => !!ch && CJK.test(ch);

/**
 * Joins two wrapped lines. A trailing hyphen keeps the hyphen (the join is only
 * a line-break removal) because it is impossible to know if the hyphen was a
 * real compound hyphen; no letters are ever dropped.
 */
export function joinWrapped(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  const last = prev[prev.length - 1];
  const first = next[0];
  if (last === "-" && /\p{L}/u.test(prev[prev.length - 2] ?? "") && /\p{Ll}/u.test(first)) {
    return prev + next;
  }
  if (isCjk(last) && isCjk(first)) return prev + next;
  return `${prev} ${next}`;
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['\u2019\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}
