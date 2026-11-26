// PDF инструкции для рецензента: открывает guide.html в Chrome без окна и печатает в A4.
//   node render.mjs  → AulSabaq-AI-instruction.pdf рядом
// Нужен playwright-core (не входит в зависимости сайта): запустите там, где он установлен,
// и укажите папку: GUIDE_DIR=docs/presentation/guide node render.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const dir = process.env.GUIDE_DIR ?? dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto(`file://${join(dir, "guide.html")}`, { waitUntil: "networkidle" });
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))); });
await page.pdf({ path: join(dir, "AulSabaq-AI-instruction.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("PDF:", join(dir, "AulSabaq-AI-instruction.pdf"));
