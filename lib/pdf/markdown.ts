import type { Segment } from "./types";
import type { ConversionSettings } from "@/lib/validation/conversion-schema";

const SAFE_URL = /^(https?:|mailto:|tel:)/i;

/** Escapes inline Markdown syntax, but only where it could change meaning. */
export function escapeInline(text: string, flavor: ConversionSettings["flavor"] = "gfm"): string {
  let out = "";
  const hasLinkSyntax = text.includes("](") || text.includes("][");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1] ?? "";
    const next = text[i + 1] ?? "";
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case "*":
        out += "\\*";
        break;
      case "`":
        out += "\\`";
        break;
      case "_": {
        const wordBefore = /[\p{L}\p{N}]/u.test(prev);
        const wordAfter = /[\p{L}\p{N}]/u.test(next);
        // Intra-word underscores (snake_case) are never emphasis in CommonMark.
        out += wordBefore && wordAfter ? "_" : "\\_";
        break;
      }
      case "[":
      case "]":
        out += hasLinkSyntax ? `\\${ch}` : ch;
        break;
      case "<":
        out += /[A-Za-z/!?]/.test(next) ? "\\<" : "<";
        break;
      case "&":
        out += /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text.slice(i)) ? "\\&" : "&";
        break;
      case "~":
        out += flavor === "gfm" && (next === "~" || prev === "~") ? "\\~" : "~";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** Escapes constructs that are only meaningful at the start of a block. */
export function escapeBlockStart(text: string): string {
  if (/^(#{1,6})(\s|$)/.test(text)) return `\\${text}`;
  if (/^>/.test(text)) return `\\${text}`;
  if (/^([-+*])\s/.test(text)) return `\\${text}`;
  if (/^\d{1,9}[.)]\s/.test(text)) return text.replace(/^(\d{1,9})([.)])/, "$1\\$2");
  if (/^(={2,}|-{2,}|_{3,}|\*{3,})\s*$/.test(text)) return `\\${text}`;
  if (/^(```|~~~)/.test(text)) return `\\${text}`;
  if (/^\|/.test(text)) return `\\${text}`;
  return text;
}

export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!SAFE_URL.test(trimmed)) return null;
  return trimmed
    .replace(/[\u0000-\u0020<>]/g, (c) => encodeURIComponent(c))
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

interface SerializeOptions {
  flavor?: ConversionSettings["flavor"];
  /** Drop bold/italic (used inside headings, where emphasis is redundant). */
  plainEmphasis?: boolean;
  /** Characters to escape additionally (e.g. `|` in table cells). */
  escapePipes?: boolean;
}

function sameStyle(a: Segment, b: Segment) {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && a.href === b.href;
}

/** Serialises styled segments into inline Markdown. */
export function segmentsToMarkdown(segments: Segment[], options: SerializeOptions = {}): string {
  const flavor = options.flavor ?? "gfm";
  const merged: Segment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const last = merged[merged.length - 1];
    if (last && sameStyle(last, seg)) last.text += seg.text;
    else merged.push({ ...seg });
  }

  let out = "";
  for (const seg of merged) {
    const lead = seg.text.match(/^\s*/)![0];
    const trail = seg.text.match(/\s*$/)![0];
    const core = seg.text.trim();
    if (!core) {
      out += seg.text;
      continue;
    }
    let body = escapeInline(core, flavor);
    if (options.escapePipes) body = body.replace(/\|/g, "\\|");
    if (!options.plainEmphasis) {
      const bold = seg.bold && !/^[\p{P}\p{S}\s]+$/u.test(core);
      const italic = seg.italic && !/^[\p{P}\p{S}\s]+$/u.test(core);
      if (bold && italic) body = `***${body}***`;
      else if (bold) body = `**${body}**`;
      else if (italic) body = `*${body}*`;
    }
    const href = seg.href ? safeHref(seg.href) : null;
    if (href) body = `[${body}](${href})`;
    out += lead + body + trail;
  }
  return out;
}

/** GitHub-compatible heading slug generator with de-duplication. */
export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}
