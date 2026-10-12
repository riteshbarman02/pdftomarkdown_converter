/**
 * Generates the synthetic PDF fixtures used by the test suite.
 * Everything here is original content created for testing; nothing is copied
 * from third-party documents. Run with `npm run fixtures`.
 */
import PDFDocument from "pdfkit";
import { createCanvas } from "@napi-rs/canvas";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = (name: string) => join(here, name);

function write(name: string, build: (doc: PDFKit.PDFDocument) => void, options: PDFKit.PDFDocumentOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: name.replace(".pdf", ""), Author: "Fixture Generator" }, ...options });
    const stream = createWriteStream(out(name));
    doc.pipe(stream);
    build(doc);
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

const BODY = "Helvetica";
const BOLD = "Helvetica-Bold";

async function main() {
  mkdirSync(here, { recursive: true });

  await write("simple.pdf", (doc) => {
    doc.font(BOLD).fontSize(26).text("Quarterly Field Report");
    doc.moveDown(0.6);
    doc.font(BODY).fontSize(11).text(
      "This report summarises the findings of the spring survey. The survey covered twelve sites and was completed in under three weeks, which is faster than the previous year.",
    );
    doc.moveDown();
    doc.font(BOLD).fontSize(17).text("Key Findings");
    doc.moveDown(0.4);
    doc.font(BODY).fontSize(11);
    doc.text("• Water quality improved at nine of the twelve sites.");
    doc.text("• Café attendance rose — “record” numbers were reported.");
    doc.text("• Equipment costs stayed within the 5 % budget margin.");
    doc.moveDown();
    doc.font(BOLD).fontSize(17).text("Next Steps");
    doc.moveDown(0.4);
    doc.font(BODY).fontSize(11);
    doc.text("1. Review the raw measurements with the field teams.");
    doc.text("2. Publish the summary on the project website.");
    doc.text("3. Schedule the autumn survey.");
    doc.moveDown();
    doc.fillColor("blue").text("Visit the project site", { link: "https://example.org/project", underline: true });
    doc.fillColor("black");
    doc.moveDown();
    doc.text("Special characters: 2 * 3 = 6, snake_case_name, and a_b_c should stay readable.");
  });

  await write("multipage.pdf", (doc) => {
    for (let p = 1; p <= 3; p++) {
      if (p > 1) doc.addPage();
      doc.font(BODY).fontSize(9).text("Acme Research — Confidential Draft", 56, 30, { lineBreak: false });
      doc.font(BOLD).fontSize(20).text(`Chapter ${p}`, 56, 90);
      doc.font(BODY).fontSize(11).moveDown(0.5).text(
        `Page ${p} body text. The quick brown fox jumps over the lazy dog while the committee discusses agenda item number ${p}. Further details follow in the next paragraph.`,
      );
      doc.moveDown().text(`Second paragraph of chapter ${p}, containing a hyphen-ated word and a number: ${p * 111}.`);
      doc.font(BODY).fontSize(9).text(`Page ${p}`, 56, 780, { lineBreak: false });
    }
  });

  await write("table.pdf", (doc) => {
    doc.font(BOLD).fontSize(18).text("Sales Overview");
    doc.moveDown();
    doc.font(BODY).fontSize(11).text("The table below lists regional results for the quarter.");
    doc.moveDown();
    const rows = [
      ["Region", "Units", "Revenue"],
      ["North", "1,200", "$48,000"],
      ["South", "980", "$39,200"],
      ["East", "1,450", "$58,000"],
      ["West", "760", "$30,400"],
    ];
    const xs = [56, 200, 320];
    let y = doc.y;
    rows.forEach((row, i) => {
      doc.font(i === 0 ? BOLD : BODY).fontSize(11);
      row.forEach((cell, c) => doc.text(cell, xs[c], y, { lineBreak: false }));
      y += 22;
    });
    doc.font(BODY).text("Figures are unaudited.", 56, y + 14);
  });

  await write("columns.pdf", (doc) => {
    doc.font(BOLD).fontSize(20).text("Two Column Article", { align: "left" });
    doc.moveDown();
    const left = "Left column paragraph one. It talks about rivers and the way they carve valleys over thousands of years of patient erosion and sediment transport across the plain. ".repeat(3);
    const right = "Right column paragraph one. It talks about mountains and the slow uplift that drives rivers to cut down through the rock beneath the high plateau. ".repeat(3);
    const top = doc.y;
    doc.font(BODY).fontSize(11);
    doc.text(left, 56, top, { width: 230, align: "left" });
    doc.text(right, 310, top, { width: 230, align: "left" });
  });

  await write("empty.pdf", () => {});

  await write("secret.pdf", (doc) => {
    doc.font(BODY).text("This document is protected.");
  }, { userPassword: "hunter2", ownerPassword: "owner-pass" } as PDFKit.PDFDocumentOptions);

  // Scanned page: text is rasterised into an image, no text layer.
  const canvas = createCanvas(1240, 600);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1240, 600);
  ctx.fillStyle = "#000";
  ctx.font = "bold 64px sans-serif";
  ctx.fillText("Scanned Invoice 2048", 60, 120);
  ctx.font = "44px sans-serif";
  ctx.fillText("Payment is due within thirty days.", 60, 240);
  ctx.fillText("Thank you for your business.", 60, 320);
  const png = canvas.toBuffer("image/png");
  await write("scanned.pdf", (doc) => {
    doc.image(png, 56, 80, { width: 480 });
  });

  console.log("fixtures written to", here);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
