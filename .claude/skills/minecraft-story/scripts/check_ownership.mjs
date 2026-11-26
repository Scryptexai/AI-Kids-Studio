#!/usr/bin/env node
// Cek kepemilikan file selama Wave Produksi.
//   Sebelum wave:  node ~/.claude/skills/minecraft-story/scripts/check_ownership.mjs projects/<slug> --snapshot
//   Sesudah wave:  node ~/.claude/skills/minecraft-story/scripts/check_ownership.mjs projects/<slug> --verify [--agents a,b]
// --verify gagal (exit 1) kalau:
//   - ada file berubah/baru/hilang yang bukan milik agent wave (ownership.json "wave", atau --agents) / compile_shots
//   - file BACA SAJA (readonly_after_gate5) berubah
//   - shots/<shot>/world.json menulis set yang beda dari base.json, atau ada folder sets/<set>/ yang tidak ada di LAYOUT.json
// Snapshot disimpan di projects/<slug>/.wave/snapshot.json (sha1 per file). Folder captures/ dan .wave/ diabaikan.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { OWNERSHIP, ownersOf, matchAny } from "./lib/ownership.mjs";

const argv = process.argv.slice(2);
const ai = argv.indexOf("--agents");
const project = argv.find((a, i) => !a.startsWith("--") && (ai < 0 || i !== ai + 1));
const mode = argv.includes("--snapshot") ? "snapshot" : argv.includes("--verify") ? "verify" : null;
const agents = ai >= 0 ? argv[ai + 1].split(",") : OWNERSHIP.wave;
if (!project || !mode) {
  console.error("pakai: check_ownership.mjs projects/<slug> --snapshot | --verify [--agents set-builder,visual-director,camera-director]");
  process.exit(1);
}
const P = path.resolve(project);
const SNAP = path.join(P, ".wave", "snapshot.json");
const IGNORE = [/^\.wave\//, /^captures\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/];

function walk(dir, rel = "", out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (IGNORE.some((re) => re.test(r + (e.isDirectory() ? "/" : "")))) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, r, out);
    else out[r] = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
  }
  return out;
}

if (mode === "snapshot") {
  const files = walk(P);
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify({ at: new Date().toISOString(), files }, null, 1));
  console.log(`snapshot: ${Object.keys(files).length} file → ${path.relative(process.cwd(), SNAP)}`);
  process.exit(0);
}

if (!fs.existsSync(SNAP)) { console.error("snapshot belum ada — jalankan --snapshot SEBELUM wave."); process.exit(1); }
const before = JSON.parse(fs.readFileSync(SNAP, "utf8")).files;
const now = walk(P);
const changed = [];
for (const [f, h] of Object.entries(now)) if (before[f] !== h) changed.push({ f, kind: before[f] ? "ubah" : "baru" });
for (const f of Object.keys(before)) if (!(f in now)) changed.push({ f, kind: "hapus" });

const allowed = [...agents, "compile_shots"];
const problems = [];
const byAgent = {};
for (const { f, kind } of changed) {
  if (matchAny(f, OWNERSHIP.readonly_after_gate5)) { problems.push(`${kind} ${f}: file BACA SAJA setelah GATE 5`); continue; }
  const own = ownersOf(f, allowed);
  if (!own.length) { problems.push(`${kind} ${f}: bukan milik ${allowed.join(" / ")} (pemilik: ${ownersOf(f).join(", ") || "tidak ada"})`); continue; }
  (byAgent[own[0]] ??= []).push(`${kind} ${f}`);
}

// per-set: world.json harus menulis set yang sama dengan base.json; sets/<set>/ harus set yang ada di LAYOUT
let layoutSets = null;
try { layoutSets = Object.keys(JSON.parse(fs.readFileSync(path.join(P, "LAYOUT.json"), "utf8")).sets ?? {}); } catch { problems.push("LAYOUT.json tidak bisa dibaca"); }
for (const { f, kind } of changed) {
  if (kind === "hapus") continue;
  const mw = f.match(/^shots\/([^/]+)\/world\.json$/);
  if (mw) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(P, f), "utf8"));
      const b = JSON.parse(fs.readFileSync(path.join(P, `shots/${mw[1]}/base.json`), "utf8"));
      if (w.set !== b.set) problems.push(`${f}: set "${w.set}" ≠ base.json "${b.set}" (set-builder salah shot)`);
    } catch (e) { problems.push(`${f}: tidak bisa dicek (${e.message})`); }
  }
  const ms = f.match(/^sets\/([^/]+)\//);
  if (ms && layoutSets && !layoutSets.includes(ms[1])) problems.push(`${f}: folder set "${ms[1]}" tidak ada di LAYOUT.json`);
}

console.log(`check_ownership: ${changed.length} file berubah sejak snapshot`);
for (const [a, list] of Object.entries(byAgent)) {
  console.log(`  ${a}: ${list.length}`);
  for (const l of list.slice(0, 40)) console.log(`    ${l}`);
}
if (problems.length) {
  console.log(`FAIL — ${problems.length} masalah:`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log("PASS — semua perubahan ada di wilayah pemiliknya.");
