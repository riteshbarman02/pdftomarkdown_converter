import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fx = (name: string) => join(__dirname, "../fixtures", name);

test("home page shows the landing content and upload area", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Convert PDF to Markdown in Seconds.");
  await expect(page.getByRole("button", { name: "Browse files" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy Policy" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert to Markdown" })).toBeDisabled();
});

test("upload → settings → convert → preview → edit → copy & download", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fx("simple.pdf"));
  await expect(page.getByText("simple.pdf")).toBeVisible();

  await page.getByRole("button", { name: "Conversion settings" }).click();
  await page.getByRole("switch", { name: "Table of contents" }).click();

  await page.getByRole("button", { name: "Convert to Markdown" }).click();
  await expect(page.getByRole("toolbar", { name: "Conversion actions" })).toBeVisible();

  // Preview shows reconstructed structure
  await page.getByRole("tab", { name: "Preview" }).click();
  const preview = page.locator(".md-preview");
  await expect(preview.getByRole("heading", { name: "Quarterly Field Report", level: 1 })).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Key Findings", level: 2 })).toBeVisible();
  await expect(preview.getByRole("link", { name: "Visit the project site" })).toHaveAttribute(
    "href",
    "https://example.org/project",
  );
  // table of contents (3 entries, nested) then the three bullets
  await expect(preview.locator("ul").first().locator("li")).toHaveCount(3);
  await expect(preview.getByText("Water quality improved at nine of the twelve sites.")).toBeVisible();

  // Edit the source
  await page.getByRole("tab", { name: "Source" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nEDITED-BY-TEST\n");
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();

  // Copy
  await page.getByRole("button", { name: "Copy" }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("EDITED-BY-TEST");
  expect(clip).toContain("# Quarterly Field Report");

  // Download the edited Markdown
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download .md" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("simple.md");
  const path = await download.path();
  const body = readFileSync(path, "utf8");
  expect(body).toContain("EDITED-BY-TEST");
  expect(body).toContain("Café attendance rose — “record” numbers");

  // Editing is protected by a confirmation
  await page.getByRole("button", { name: "New" }).click();
  await expect(page.getByRole("dialog")).toContainText("unsaved edits");
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("toolbar", { name: "Conversion actions" })).toBeVisible();
});

test("tables are reconstructed", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fx("table.pdf"));
  await page.getByRole("button", { name: "Convert to Markdown" }).click();
  await page.getByRole("tab", { name: "Preview" }).click();
  const rows = page.locator(".md-preview table tr");
  await expect(rows).toHaveCount(5);
  await expect(page.locator(".md-preview table")).toContainText("$48,000");
});

test("rejects a non-PDF renamed to .pdf with a friendly error", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is plain text, not a pdf"),
  });
  await page.getByRole("button", { name: "Convert to Markdown" }).click();
  await expect(page.locator("[data-slot=alert]")).toContainText("not a valid PDF");
});

test("rejects non-PDF file types in the browser", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.getByText("Only PDF files are supported.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert to Markdown" })).toBeDisabled();
});

test("password-protected PDFs get a clear message", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fx("secret.pdf"));
  await page.getByRole("button", { name: "Convert to Markdown" }).click();
  await expect(page.locator("[data-slot=alert]")).toContainText("password-protected");
});

test("scanned PDFs are read with OCR", async ({ page }) => {
  test.skip(process.env.SKIP_OCR_E2E === "1", "OCR needs to download language data");
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(fx("scanned.pdf"));
  await page.getByRole("button", { name: "Convert to Markdown" }).click();
  await page.getByRole("tab", { name: "Preview" }).click({ timeout: 60_000 });
  await expect(page.locator(".md-preview")).toContainText("Scanned Invoice");
});

test("job results are only available to the browser that created them", async ({ page, browser, baseURL }) => {
  await page.goto("/");
  const empty = await page.request.post("/api/convert", {
    multipart: { file: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) } },
  });
  expect(empty.status()).toBe(422);

  const created = await page.request.post("/api/convert", {
    multipart: {
      file: { name: "simple.pdf", mimeType: "application/pdf", buffer: readFileSync(fx("simple.pdf")) },
      mode: "sync",
    },
  });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  expect((await page.request.get(`/api/jobs/${id}`)).status()).toBe(200);
  const dl = await page.request.get(`/api/download/${id}?format=txt`);
  expect(dl.status()).toBe(200);
  expect(dl.headers()["content-type"]).toContain("text/plain");
  expect(dl.headers()["content-disposition"]).toContain('filename="simple.txt"');

  // A different browser session must not be able to read or download it.
  const other = await browser.newContext({ baseURL });
  expect((await other.request.get(`/api/jobs/${id}`)).status()).toBe(404);
  expect((await other.request.get(`/api/download/${id}`)).status()).toBe(404);
  await other.close();
});
