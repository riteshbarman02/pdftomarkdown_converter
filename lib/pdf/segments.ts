import { isCjk } from "./text-normalize";
import type { Segment, TextRun } from "./types";

/** Converts runs on one row into styled segments, inserting spaces where there are gaps. */
export function runsToSegments(runs: TextRun[], fontSize?: number): Segment[] {
  const segs: Segment[] = [];
  let prev: TextRun | undefined;
  for (const run of runs) {
    if (prev) {
      const gap = run.x - (prev.x + prev.width);
      const fs = Math.min(prev.fontSize, run.fontSize) || fontSize || 10;
      const needsSpace =
        !/\s$/.test(prev.text) &&
        !/^\s/.test(run.text) &&
        gap > 0.12 * fs &&
        !(isCjk(prev.text.slice(-1)) && isCjk(run.text[0]));
      if (needsSpace) {
        // Inherit style only if both neighbours share it, so emphasis spans stay contiguous.
        const same = prev.bold === run.bold && prev.italic === run.italic && prev.href === run.href;
        segs.push(
          same ? { text: " ", bold: prev.bold, italic: prev.italic, href: prev.href } : { text: " " },
        );
      }
    }
    segs.push({ text: run.text, bold: run.bold, italic: run.italic, href: run.href });
    prev = run;
  }
  return segs;
}
