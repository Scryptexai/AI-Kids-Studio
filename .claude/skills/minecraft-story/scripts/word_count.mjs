#!/usr/bin/env node
// Hitung kata + estimasi durasi SCRIPT.md. SATU-SATUNYA sumber angka target (RULES §A mengutip dari sini):
//   VO 2:10–2:14 (130–134 detik) pada narator 160–165 wpm → 347–368 kata. Yang mengikat adalah durasi audio asli (--audio).
//   node scripts/word_count.mjs projects/<slug>/SCRIPT.md
//   node scripts/word_count.mjs projects/<slug>/SCRIPT.md --audio audio/vo.wav
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const WPM = [160, 165];                       // kecepatan narator (lambat, cepat)
const VO = { secMin: 130, secMax: 134 };      // target durasi VO; video final 135 detik (tail 1–5 detik)
const TARGET = { min: Math.ceil((VO.secMin * WPM[0]) / 60), max: Math.floor((VO.secMax * WPM[1]) / 60), ...VO }; // 347–368

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const audioIdx = args.indexOf("--audio");
const audio = audioIdx >= 0 ? args[audioIdx + 1] : null;

if (!file || !fs.existsSync(file)) {
  console.error("Pakai: node scripts/word_count.mjs <SCRIPT.md> [--audio vo.wav]");
  process.exit(1);
}

const raw = fs.readFileSync(file, "utf8");
const lines = raw.split(/\r?\n/);

// Ambil hanya blok ## VOICEOVER (fallback: seluruh file)
let voLines = [];
let inVo = false;
let foundSection = false;
for (const line of lines) {
  const h = line.match(/^##\s+(.*)$/);
  if (h) {
    inVo = /voiceover|vo\b/i.test(h[1]);
    if (inVo) foundSection = true;
    continue;
  }
  if (inVo) voLines.push(line);
}
if (!foundSection) voLines = lines;

const text = voLines
  .map((l) => l.replace(/^\s*B\d+\s*\|\s*/i, "").trim())
  .filter(Boolean)
  .join(" ")
  .replace(/[*_`#>|]/g, " ");

const words = text.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
const count = words.length;
const secSlow = (count / WPM[0]) * 60, secFast = (count / WPM[1]) * 60;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const okWords = count >= TARGET.min && count <= TARGET.max;

console.log(`file    : ${file}`);
console.log(`kata    : ${count}  (target ${TARGET.min}–${TARGET.max}) ${okWords ? "OK" : "DI LUAR TARGET"}`);
console.log(`estimasi: ${fmt(secFast)} @ ${WPM[1]} wpm … ${fmt(secSlow)} @ ${WPM[0]} wpm  (target VO ${fmt(TARGET.secMin)}–${fmt(TARGET.secMax)}; pastikan dengan --audio)`);

if (audio) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", audio],
      { encoding: "utf8" }
    ).trim();
    const dur = parseFloat(out);
    const realWpm = count / (dur / 60);
    console.log(`audio   : ${fmt(dur)}  →  ${Math.round(realWpm)} wpm`);
    const okDur = dur >= TARGET.secMin && dur <= TARGET.secMax;
    console.log(`durasi  : ${okDur ? "OK" : "PERLU DIATUR (potong kata dulu, baru atempo ≤ 1.05)"}`);
    if (!okDur) process.exitCode = 2;
  } catch (e) {
    console.error(`audio   : gagal ffprobe (${e.message})`);
    process.exitCode = 3;
  }
}

if (!okWords) process.exitCode = 2;
