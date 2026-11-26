#!/usr/bin/env node
// Cek instalasi sebelum mulai project / sebelum Wave Produksi. Exit 1 kalau ada FAIL.
//   node <skill>/scripts/doctor.mjs            cek lokal (Node, ffmpeg, agent terpasang, hook kepemilikan)
//   node <skill>/scripts/doctor.mjs --rcon     + tes koneksi server (hanya `list` dan `script run 1+1`)
//   node <skill>/scripts/doctor.mjs --agents-dir <folder>
// Yang paling penting: hook kepemilikan. Kalau path guard_paths.mjs di agent salah, hook keluar dengan kode 1
// (bukan 2) dan Claude Code TIDAK memblokir apa pun — kunci terbuka tanpa peringatan. Cek ini menangkapnya.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SKILL_DIR, defaultAgentsDir, sourceAgents, renderAgent, hookPaths } from "./lib/agents.mjs";

const argv = process.argv.slice(2);
const ai = argv.indexOf("--agents-dir");
const agentsDir = ai >= 0 ? path.resolve(argv[ai + 1]) : defaultAgentsDir();
let fails = 0, warns = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const warn = (m) => { warns++; console.log(`  WARN  ${m}`); };
const fail = (m) => { fails++; console.log(`  FAIL  ${m}`); };
const same = (a, b) => path.resolve(a).replace(/\\/g, "/").toLowerCase() === path.resolve(b).replace(/\\/g, "/").toLowerCase();

console.log("Lingkungan");
const major = +process.versions.node.split(".")[0];
major >= 18 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} — butuh 18+`);
for (const bin of ["ffmpeg", "ffprobe"]) {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  r.status === 0 ? ok(`${bin} ada di PATH`) : fail(`${bin} tidak ada di PATH (dipakai word_count --audio dan assemble.mjs)`);
}
path.basename(SKILL_DIR) === "minecraft-story" ? ok(`folder skill: ${SKILL_DIR}`) : warn(`folder skill bernama "${path.basename(SKILL_DIR)}", bukan "minecraft-story" — /minecraft-story mungkin tidak dikenali`);

console.log(`Agent terpasang (${agentsDir})`);
for (const a of sourceAgents()) {
  const inst = path.join(agentsDir, a.name);
  if (!fs.existsSync(inst)) { fail(`${a.name} belum terpasang → node ${SKILL_DIR}/scripts/install.mjs`); continue; }
  const text = fs.readFileSync(inst, "utf8");
  const agent = a.name.replace(/\.md$/, "");
  let bad = false;
  for (const h of hookPaths(text)) {
    if (!h.file) { fail(`${a.name}: hook tidak memanggil guard_paths.mjs (${h.cmd})`); bad = true; continue; }
    if (!fs.existsSync(h.file)) { fail(`${a.name}: hook menunjuk file yang tidak ada: ${h.file} — kunci kepemilikan TIDAK aktif → jalankan install.mjs`); bad = true; continue; }
    if (!same(h.file, path.join(SKILL_DIR, "scripts/guard_paths.mjs"))) { warn(`${a.name}: hook memakai skill lain: ${h.file}`); }
    // hook harus benar-benar menolak (exit 2) tulisan di luar wilayah
    const bash = / --bash\s*$/.test(h.cmd);
    const input = bash
      ? { tool_name: "Bash", tool_input: { command: "node rcon.mjs --check" } }
      : { tool_name: "Write", tool_input: { file_path: path.join(SKILL_DIR, "_doctor_di_luar_projects.md") } };
    const r = spawnSync(process.execPath, [h.file, agent, ...(bash ? ["--bash"] : [])], { encoding: "utf8", input: JSON.stringify(input) });
    if (r.status !== 2) { fail(`${a.name}: hook ${bash ? "Bash" : "Write"} tidak menolak (exit ${r.status}, seharusnya 2)`); bad = true; }
  }
  if (bad) continue;
  if (text !== renderAgent(a.src)) warn(`${a.name}: beda dari agents/${a.name} di skill → jalankan install.mjs lagi`);
  else ok(`${a.name}${hookPaths(text).length ? " (hook aktif)" : " (tanpa hook, hanya baca)"}`);
}

console.log("Project (folder kerja sekarang)");
const rc = path.resolve(".rcon.json");
let cfg = null;
if (!fs.existsSync(rc)) warn(`.rcon.json tidak ada di ${process.cwd()} — jalankan dari root repo (tempat projects/)`);
else {
  try { cfg = JSON.parse(fs.readFileSync(rc, "utf8")); ok(".rcon.json terbaca"); } catch (e) { fail(`.rcon.json rusak: ${e.message}`); }
  if (cfg && !(cfg.tick_freeze && cfg.tick_unfreeze))
    warn('.rcon.json belum punya "tick_freeze"/"tick_unfreeze". Di Carpet 1.20.1 `tick freeze` adalah TOGGLE: cek `/tick freeze status` di server, lalu isi mis. "tick_freeze": "tick freeze on", "tick_unfreeze": "tick freeze off"');
}
fs.existsSync(path.resolve("projects")) ? ok("folder projects/ ada") : warn("folder projects/ belum ada di sini");

if (argv.includes("--rcon")) {
  console.log("Server (RCON)");
  const { Rcon, resolveConfig, failureOf } = await import("./mc/rcon.mjs");
  const r = new Rcon(resolveConfig({}));
  try {
    await r.connect();
    ok(`terhubung: ${(await r.send("list")).trim()}`);
    const s = await r.send("script run 1+1");
    failureOf(s) ? fail(`scarpet tidak menjawab (Carpet terpasang di server?): ${failureOf(s)}`) : ok(`scarpet aktif: ${s.trim()}`);
  } catch (e) { fail(`RCON: ${e.message}`); } finally { r.close(); }
}

console.log(`\n${fails} FAIL, ${warns} WARN`);
process.exit(fails ? 1 : 0);
