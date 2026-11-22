// Рендер видео: открывает video.html в Chrome без окна, для каждого кадра вызывает render(t) и снимает экран,
// потом ffmpeg склеивает кадры в MP4 (H.264, 30 кадров в секунду).
//   node render.mjs                 → AulSabaq-AI.mp4
//   node render.mjs --at 3,14,22    → снимки отдельных секунд для проверки (preview-3.png …)
// Нужны playwright-core и Chrome; ffmpeg для MP4. playwright-core не входит в зависимости сайта: скопируйте скрипт
// туда, где он установлен, и укажите папку видео: VIDEO_DIR=docs/presentation/video node render.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const dir = process.env.VIDEO_DIR ?? dirname(fileURLToPath(import.meta.url));
const FPS = 30, SECONDS = 60;
const at = process.argv.includes("--at") ? process.argv[process.argv.indexOf("--at") + 1].split(",").map(Number) : null;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${join(dir, "video.html")}`, { waitUntil: "networkidle" });
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))); });

if (at) {
  for (const t of at) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: join(dir, `preview-${t}.png`) });
  }
} else {
  const frames = join(dir, "frames");
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames);
  for (let i = 0; i < FPS * SECONDS; i++) {
    await page.evaluate((x) => window.render(x), i / FPS);
    await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (i % 150 === 0) console.log(`кадр ${i} из ${FPS * SECONDS}`);
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(dir, "AulSabaq-AI.mp4")]);
  rmSync(frames, { recursive: true, force: true });
  console.log("готово: AulSabaq-AI.mp4");
}
await browser.close();
