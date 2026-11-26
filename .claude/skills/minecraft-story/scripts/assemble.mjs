#!/usr/bin/env node
// Step 9 (orchestrator): cek render tiap shot, gabung sesuai start_frame, mux audio → final tepat total_frames.
//   node <skill>/scripts/assemble.mjs projects/<slug> --check          hanya cek (tidak menulis video)
//   node <skill>/scripts/assemble.mjs projects/<slug>                  cek → audio/mix.wav (kalau belum ada) → final.mp4
//   opsi: --out <file.mp4>   --music-db -18   --allow-estimate   --crf 17
//
// Cek per shot (dari shots/<shot>.json hasil compile):
//   - captures/<shot>/render.mp4 ada, 1080×1920 (render.w/h), jumlah frame ≥ frames
//     (lebih panjang = dipotong di akhir + WARN; lebih pendek = FAIL → render ulang shot itu)
// Audio: audio/mix.wav dipakai kalau ada. Kalau tidak ada, dibuat dari audio/vo.wav
//   (+ file pertama di audio/music/, di-loop, volume --music-db, fade-out 1.5 detik) dan disimpan ke audio/mix.wav.
// Final: video di-encode ulang (H.264, CRF 17, 30 fps), audio dipanjangkan dengan senyap sampai durasi video,
//   jumlah frame dicek lagi setelah selesai. Hasil cek ditulis ke .wave/assemble.json.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const val = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : def; };
const flagsWithValue = ["--out", "--music-db", "--crf"];
const project = argv.find((a, i) => !a.startsWith("--") && !flagsWithValue.includes(argv[i - 1]));
if (!project) { console.error("pakai: assemble.mjs projects/<slug> [--check] [--out final.mp4] [--music-db -18] [--allow-estimate]"); process.exit(1); }
const P = path.resolve(project);
const checkOnly = argv.includes("--check");
const rel = (p) => path.relative(P, p).replace(/\\/g, "/");

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`${bin} tidak bisa dijalankan (ada di PATH?): ${r.error.message}`);
  return r;
}
function probe(file) {
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames",
    "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames", "-of", "json", file]);
  if (r.status !== 0) return null;
  const s = JSON.parse(r.stdout).streams?.[0];
  if (!s) return null;
  const [n, d] = String(s.r_frame_rate).split("/").map(Number);
  return { w: s.width, h: s.height, fps: d ? n / d : n, frames: +s.nb_read_frames };
}

// ---------- shot hasil compile ----------
const layout = JSON.parse(fs.readFileSync(path.join(P, "LAYOUT.json"), "utf8"));
const FPS = layout.fps ?? 30, TOTAL = layout.total_frames ?? 4050;
const shotDir = path.join(P, "shots");
const shots = fs.readdirSync(shotDir).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(shotDir, f), "utf8")))
  .filter((s) => s.compiled).sort((a, b) => a.start_frame - b.start_frame);
const layers = fs.readdirSync(shotDir).filter((d) => fs.statSync(path.join(shotDir, d)).isDirectory());

const issues = [];
const fail = (shot, msg) => issues.push({ shot, level: "FAIL", msg });
const warn = (shot, msg) => issues.push({ shot, level: "WARN", msg });

for (const d of layers) if (!shots.some((s) => s.shot === d)) fail(d, "belum ada hasil compile (shots/<shot>.json) — jalankan compile_shots.mjs");
if (shots.some((s) => s.timing !== "vo") && !argv.includes("--allow-estimate")) fail("TIMING", 'ada shot dengan timing "estimate" — kunci VO dulu (Step 7), atau pakai --allow-estimate untuk preview');
const sum = shots.reduce((n, s) => n + s.frames, 0);
if (sum !== TOTAL) fail("TOTAL", `total frame shot ${sum} ≠ ${TOTAL}`);

const rows = [];
for (const s of shots) {
  const file = path.join(P, s.render?.out ?? `captures/${s.shot}/render.mp4`);
  const row = { shot: s.shot, start: s.start_frame, need: s.frames, file, got: null };
  rows.push(row);
  if (!fs.existsSync(file)) { fail(s.shot, `render belum ada: ${rel(file)}`); continue; }
  const v = probe(file);
  if (!v) { fail(s.shot, `render tidak bisa dibaca ffprobe: ${rel(file)}`); continue; }
  row.got = v.frames;
  const W = s.render?.w ?? 1080, H = s.render?.h ?? 1920;
  if (v.w !== W || v.h !== H) fail(s.shot, `resolusi ${v.w}×${v.h}, seharusnya ${W}×${H}`);
  if (Math.abs(v.fps - FPS) > 0.01) warn(s.shot, `fps ${v.fps.toFixed(3)} (dikonversi ke ${FPS})`);
  if (v.frames < s.frames) fail(s.shot, `render ${v.frames} frame, butuh ${s.frames} (kurang ${s.frames - v.frames}) — panjangkan camera path / render ulang`);
  else if (v.frames > s.frames) warn(s.shot, `render ${v.frames} frame, dipakai ${s.frames} pertama (${v.frames - s.frames} frame di akhir dibuang)`);
}

console.log(`assemble: ${shots.length} shot, total ${sum}/${TOTAL} frame @ ${FPS} fps`);
console.log("shot      start  butuh  render  status");
const failed = new Set(issues.filter((i) => i.level === "FAIL").map((i) => i.shot));
for (const r of rows) console.log(`${r.shot.padEnd(9)} ${String(r.start).padStart(5)}  ${String(r.need).padStart(5)}  ${String(r.got ?? "-").padStart(6)}  ${failed.has(r.shot) ? "FAIL" : issues.some((i) => i.shot === r.shot) ? "WARN" : "OK"}`);
for (const i of issues) console.log(`  ${i.level} ${i.shot}: ${i.msg}`);

const report = { at: new Date().toISOString(), total: sum, issues, shots: rows.map((r) => ({ shot: r.shot, start: r.start, need: r.need, got: r.got })) };
const writeReport = (extra = {}) => { fs.mkdirSync(path.join(P, ".wave"), { recursive: true }); fs.writeFileSync(path.join(P, ".wave", "assemble.json"), JSON.stringify({ ...report, ...extra }, null, 2)); };

if (issues.some((i) => i.level === "FAIL")) { writeReport(); console.log("\nFAIL — final tidak dibuat."); process.exit(1); }
if (checkOnly) { writeReport(); console.log("\nPASS — semua render siap digabung."); process.exit(0); }

// ---------- audio ----------
const dur = TOTAL / FPS;
const mix = path.join(P, "audio", "mix.wav");
if (!fs.existsSync(mix)) {
  const vo = path.join(P, "audio", "vo.wav");
  if (!fs.existsSync(vo)) { console.error("audio/mix.wav dan audio/vo.wav tidak ada."); process.exit(1); }
  const mdir = path.join(P, "audio", "music");
  const music = fs.existsSync(mdir) ? fs.readdirSync(mdir).filter((f) => /\.(wav|mp3|m4a|ogg|flac)$/i.test(f)).sort()[0] : null;
  const db = Number(val("--music-db", "-18"));
  const args = ["-y", "-v", "error", "-i", vo];
  let graph;
  if (music) {
    args.push("-stream_loop", "-1", "-i", path.join(mdir, music));
    graph = `[0:a]aresample=48000,apad[v];[1:a]aresample=48000,volume=${db}dB,afade=t=out:st=${(dur - 1.5).toFixed(3)}:d=1.5[m];[v][m]amix=inputs=2:duration=longest:normalize=0,atrim=0:${dur.toFixed(3)}[a]`;
  } else graph = `[0:a]aresample=48000,apad,atrim=0:${dur.toFixed(3)}[a]`;
  args.push("-filter_complex", graph, "-map", "[a]", "-t", dur.toFixed(3), "-c:a", "pcm_s16le", mix);
  const r = run("ffmpeg", args);
  if (r.status !== 0) { console.error(`gagal membuat mix.wav:\n${r.stderr}`); process.exit(1); }
  console.log(`audio/mix.wav dibuat dari vo.wav${music ? ` + music/${music} (${db} dB)` : " (tanpa musik: audio/music/ kosong)"}`);
}

// ---------- concat + mux ----------
const out = path.resolve(P, val("--out", "final.mp4"));
const args = ["-y", "-v", "error"];
for (const r of rows) args.push("-i", r.file);
args.push("-i", mix);
const W = shots[0].render?.w ?? 1080, H = shots[0].render?.h ?? 1920;
const parts = rows.map((r, i) => `[${i}:v]fps=${FPS},trim=end_frame=${r.need},setpts=PTS-STARTPTS,scale=${W}:${H},setsar=1,format=yuv420p[v${i}]`);
const graph = [...parts, `${rows.map((_, i) => `[v${i}]`).join("")}concat=n=${rows.length}:v=1:a=0[v]`, `[${rows.length}:a]apad[a]`].join(";");
args.push("-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-frames:v", String(TOTAL), "-t", dur.toFixed(3),
  "-r", String(FPS), "-c:v", "libx264", "-crf", String(val("--crf", "17")), "-preset", "medium", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out);
const r = run("ffmpeg", args);
if (r.status !== 0) { console.error(`ffmpeg gagal:\n${r.stderr}`); process.exit(1); }
const fin = probe(out);
writeReport({ out: rel(out), final_frames: fin?.frames ?? null });
if (!fin || fin.frames !== TOTAL) { console.error(`FAIL — ${rel(out)} punya ${fin?.frames} frame, seharusnya ${TOTAL}.`); process.exit(1); }
console.log(`\nPASS — ${rel(out)}: ${fin.frames} frame = ${(fin.frames / FPS).toFixed(1)} detik, ${fin.w}×${fin.h}.`);
