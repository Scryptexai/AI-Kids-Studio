#!/usr/bin/env node
// Cek kemiripan teks SCRIPT.md vs folder referensi.
//   node scripts/overlap_check.mjs projects/<slug>/SCRIPT.md projects/<slug>/refs/
import fs from "node:fs";
import path from "node:path";

const COMMON = new Set(["in this world", "in this town", "and then", "but here's the thing"]);

const toks = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) ?? []);
const grams = (w, n) => {
  const s = new Set();
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(" "));
  return s;
};

const [, , scriptPath, refsDir] = process.argv;
if (!scriptPath || !refsDir) {
  console.error("Pakai: node scripts/overlap_check.mjs SCRIPT.md refs/");
  process.exit(1);
}

const text = fs.readFileSync(scriptPath, "utf8");
const vo = text.includes("## VOICEOVER")
  ? text.split("## VOICEOVER")[1].split(/\n## /)[0]
  : text;
const cleaned = vo.replace(/^B\d+\s*\|/gm, "");
const s = toks(cleaned);
const g4s = grams(s, 4);
const g6s = grams(s, 6);

let fail = false;
const files = fs
  .readdirSync(refsDir, { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => d.name)
  .sort();

for (const name of files) {
  const r = toks(fs.readFileSync(path.join(refsDir, name), "utf8"));
  const shared4 = [...g4s].filter((g) => grams(r, 4).has(g));
  const shared6 = [...g6s].filter((g) => grams(r, 6).has(g) && ![...COMMON].some((c) => g.includes(c)));
  const pct = (100 * shared4.length) / Math.max(g4s.size, 1);
  const bad = shared6.length > 0 || pct > 3;
  fail ||= bad;
  console.log(
    `[${bad ? "FAIL" : "PASS"}] ${name}: 4-gram overlap ${pct.toFixed(1)}% | shared 6-gram: ${shared6.length}`
  );
  for (const g of shared6.sort().slice(0, 15)) console.log(`    6g: ${g}`);
  if (pct > 3) for (const g of shared4.sort().slice(0, 15)) console.log(`    4g: ${g}`);
}

console.log("VERDICT TEKS:", fail ? "FAIL" : "PASS", "(premis/twist tetap dinilai agent)");
process.exit(fail ? 1 : 0);
