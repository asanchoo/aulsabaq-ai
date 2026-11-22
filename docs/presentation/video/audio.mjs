// Звук для видео: голос за кадром, эффекты и музыка из ElevenLabs, сведение с AulSabaq-AI.mp4 через ffmpeg.
//   node audio.mjs --voices   → список голосов аккаунта (имя, id), чтобы выбрать voice_id в sound.json
//   node audio.mjs            → генерирует недостающее в audio/ и собирает AulSabaq-AI-sound.mp4
// Что и когда звучит, описано в sound.json. Уже сгенерированные файлы в audio/ повторно не запрашиваются
// (это экономит кредиты); чтобы переделать фразу или звук, удалите его файл.
// Ключ: переменная ELEVENLABS_API_KEY или файл ~/.config/elevenlabs/key. Скрипт ключ не печатает и никуда, кроме
// api.elevenlabs.io, не отправляет.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(readFileSync(join(dir, "sound.json"), "utf8"));
const keyFile = join(homedir(), ".config/elevenlabs/key");
const key = (process.env.ELEVENLABS_API_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "")).trim();
if (!key) {
  console.error("Нет ключа ElevenLabs: задайте ELEVENLABS_API_KEY или положите ключ в ~/.config/elevenlabs/key");
  process.exit(1);
}
const API = "https://api.elevenlabs.io/v1";
const headers = { "xi-api-key": key, "Content-Type": "application/json" };

if (process.argv.includes("--voices")) {
  const r = await fetch(`${API}/voices`, { headers });
  if (!r.ok) throw new Error(`voices: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const { voices } = await r.json();
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}  ${[v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.description].filter(Boolean).join(", ")}`);
  process.exit(0);
}

const out = join(dir, "audio");
mkdirSync(out, { recursive: true });

/** POST в ElevenLabs, ответ (mp3) сохраняем в файл. Готовый файл не перезапрашиваем. */
async function fetchAudio(file, path, body) {
  if (existsSync(file)) return;
  const r = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log("сгенерировано:", file.slice(dir.length + 1));
}
const duration = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

// 1. Голос: каждая фраза отдельным файлом, чтобы поставить её точно на свою сцену
const { voice } = plan;
const voices = plan.lines.map((line, i) => ({ ...line, file: join(out, `voice-${String(i + 1).padStart(2, "0")}.mp3`) }));
for (const line of voices) {
  await fetchAudio(line.file, `/text-to-speech/${voice.voice_id}?output_format=mp3_44100_128`, {
    text: line.text, model_id: voice.model_id, voice_settings: voice.settings,
  });
}
// Фраза не должна наезжать на следующую: предупреждаем, сколько не хватает
voices.forEach((line, i) => {
  const end = line.at + duration(line.file);
  const next = voices[i + 1]?.at ?? 60;
  console.log(`${line.at.toFixed(1)}–${end.toFixed(1)} с${end > next ? `  НАЕЗЖАЕТ на следующую на ${(end - next).toFixed(1)} с` : ""}  ${line.text}`);
});

// 2. Эффекты и 3. музыка
for (const [name, s] of Object.entries(plan.sfx)) {
  await fetchAudio(join(out, `sfx-${name}.mp3`), "/sound-generation", { text: s.prompt, duration_seconds: s.seconds, prompt_influence: 0.6 });
}
const music = join(out, "music.mp3");
await fetchAudio(music, "/music", { prompt: plan.music.prompt, music_length_ms: plan.music.ms });

// 4. Сведение: музыка приглушается под голос (sidechain), эффекты и голос по своим секундам, громкость по стандарту −16 LUFS
const inputs = ["-i", join(dir, "AulSabaq-AI.mp4"), "-i", music];
const parts = [];
const fmt = "aformat=sample_rates=44100:channel_layouts=stereo";
let n = 2;
const voiceLabels = voices.map((line, i) => {
  inputs.push("-i", line.file);
  parts.push(`[${n++}:a]${fmt},adelay=delays=${Math.round(line.at * 1000)}:all=1,apad[v${i}]`);
  return `[v${i}]`;
});
const sfxLabels = plan.cues.map((cue, i) => {
  inputs.push("-i", join(out, `sfx-${cue.sfx}.mp3`));
  parts.push(`[${n++}:a]${fmt},volume=${cue.gain},adelay=delays=${Math.round(cue.at * 1000)}:all=1,apad[s${i}]`);
  return `[s${i}]`;
});
parts.push(`${voiceLabels.join("")}amix=inputs=${voiceLabels.length}:normalize=0,volume=1.0[voice]`);
parts.push(`${sfxLabels.join("")}amix=inputs=${sfxLabels.length}:normalize=0[sfx]`);
parts.push(`[voice]asplit=2[voiceout][key]`);
parts.push(`[1:a]${fmt},volume=${plan.music.gain},afade=t=in:d=0.8,afade=t=out:st=57.5:d=2.5[music]`);
parts.push(`[music][key]sidechaincompress=threshold=0.012:ratio=10:attack=25:release=450[ducked]`);
parts.push(`[ducked][sfx][voiceout]amix=inputs=3:normalize=0,atrim=0:60,afade=t=out:st=59.2:d=0.8,loudnorm=I=-16:TP=-1.5:LRA=11[mix]`);

execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.join(";"),
  "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", "60",
  "-movflags", "+faststart", join(dir, "AulSabaq-AI-sound.mp4")], { stdio: "inherit" });
console.log("готово: AulSabaq-AI-sound.mp4");
