import { describe, expect, it } from "vitest";
import {
  createSlugger,
  escapeBlockStart,
  escapeInline,
  safeHref,
  segmentsToMarkdown,
} from "@/lib/pdf/markdown";
import { normalizeText, joinWrapped, countWords } from "@/lib/pdf/text-normalize";
import { parseListMarker } from "@/lib/pdf/detect-layout";
import { toPlainText } from "@/lib/pdf/serialize-markdown";

describe("escapeInline", () => {
  it("escapes emphasis and code markers", () => {
    expect(escapeInline("2 * 3 `x`")).toBe("2 \\* 3 \\`x\\`");
  });
  it("leaves intra-word underscores alone but escapes standalone ones", () => {
    expect(escapeInline("snake_case_name")).toBe("snake_case_name");
    expect(escapeInline("_wrapped_")).toBe("\\_wrapped\\_");
  });
  it("only escapes angle brackets that could open HTML", () => {
    expect(escapeInline("a < b and <script>")).toBe("a < b and \\<script>");
  });
  it("escapes entities and tildes (GFM) but not plain ampersands", () => {
    expect(escapeInline("R&D &amp; ~~x~~")).toBe("R&D \\&amp; \\~\\~x\\~\\~");
  });
  it("escapes brackets only when they could form links", () => {
    expect(escapeInline("see [1] and [2]")).toBe("see [1] and [2]");
    expect(escapeInline("[a](b)")).toBe("\\[a\\](b)");
  });
  it("preserves Unicode", () => {
    expect(escapeInline("Café — “quoted” 日本語 €")).toBe("Café — “quoted” 日本語 €");
  });
});

describe("escapeBlockStart", () => {
  it.each([
    ["# not a heading", "\\# not a heading"],
    ["> not a quote", "\\> not a quote"],
    ["- not a list", "\\- not a list"],
    ["1. not a list", "1\\. not a list"],
    ["---", "\\---"],
    ["plain text", "plain text"],
  ])("%s", (input, expected) => {
    expect(escapeBlockStart(input)).toBe(expected);
  });
});

describe("segmentsToMarkdown", () => {
  it("renders emphasis, hugging non-space text", () => {
    expect(
      segmentsToMarkdown([{ text: "A " }, { text: " bold ", bold: true }, { text: "word" }]),
    ).toBe("A  **bold** word");
  });
  it("renders links and drops unsafe schemes", () => {
    expect(segmentsToMarkdown([{ text: "site", href: "https://example.org/a_(b)" }])).toBe(
      "[site](https://example.org/a_%28b%29)",
    );
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(segmentsToMarkdown([{ text: "x", href: "javascript:alert(1)" }])).toBe("x");
  });
  it("escapes pipes inside table cells", () => {
    expect(segmentsToMarkdown([{ text: "a|b" }], { escapePipes: true })).toBe("a\\|b");
  });
});

describe("text normalisation", () => {
  it("expands ligatures, removes soft hyphens and zero-width characters", () => {
    expect(normalizeText("\uFB01nal\u00ADly\u200B")).toBe("finally");
  });
  it("converts exotic spaces but keeps other Unicode", () => {
    expect(normalizeText("a\u00A0b 日本")).toBe("a b 日本");
  });
  it("joins wrapped lines conservatively", () => {
    expect(joinWrapped("hello", "world")).toBe("hello world");
    expect(joinWrapped("inter-", "national")).toBe("inter-national");
    expect(joinWrapped("well-", "Known")).toBe("well- Known");
    expect(joinWrapped("日本", "語")).toBe("日本語");
  });
  it("counts words with apostrophes and hyphens", () => {
    expect(countWords("It's a well-known fact, 42 times.")).toBe(6);
  });
});

describe("list markers", () => {
  it("detects bullets and numbers", () => {
    expect(parseListMarker("• item")).toMatchObject({ ordered: false });
    expect(parseListMarker("- item")).toMatchObject({ ordered: false });
    expect(parseListMarker("12) item")).toMatchObject({ ordered: true, number: 12 });
  });
  it("does not treat years or bare dashes as lists", () => {
    expect(parseListMarker("2024. was a year")).toBeNull();
    expect(parseListMarker("-")).toBeNull();
    expect(parseListMarker("1.")).toBeNull();
  });
});

describe("slugger", () => {
  it("matches GitHub style and de-duplicates", () => {
    const slug = createSlugger();
    expect(slug("Key Findings!")).toBe("key-findings");
    expect(slug("Key Findings")).toBe("key-findings-1");
  });
});

describe("toPlainText", () => {
  it("removes Markdown syntax but keeps content", () => {
    const out = toPlainText("# Title\n\nSome **bold** and [link](https://x.y)\\.\n");
    expect(out).toContain("Title");
    expect(out).toContain("bold");
    expect(out).not.toContain("**");
    expect(out).toContain("link (https://x.y)");
  });
});
