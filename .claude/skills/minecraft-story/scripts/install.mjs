#!/usr/bin/env node
// Pasang agent skill ini ke ~/.claude/agents, dengan path hook disesuaikan ke lokasi skill yang sebenarnya.
//   node <skill>/scripts/install.mjs            pasang / perbarui semua agent
//   node <skill>/scripts/install.mjs --dry      tampilkan saja apa yang akan ditulis
//   node <skill>/scripts/install.mjs --dest <folder-agents>
// Jalankan ulang setiap kali agents/*.md diubah atau folder skill dipindah, lalu mulai sesi Claude Code baru.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR, DEFAULT_SKILL, defaultAgentsDir, sourceAgents, renderAgent } from "./lib/agents.mjs";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const di = argv.indexOf("--dest");
const dest = di >= 0 ? path.resolve(argv[di + 1]) : defaultAgentsDir();

console.log(`skill : ${SKILL_DIR}${SKILL_DIR === DEFAULT_SKILL ? "" : `  (path di agent disesuaikan dari ${DEFAULT_SKILL})`}`);
console.log(`tujuan: ${dest}`);
if (!dry) fs.mkdirSync(dest, { recursive: true });

let n = 0;
for (const a of sourceAgents()) {
  const want = renderAgent(a.src);
  const out = path.join(dest, a.name);
  const have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
  const state = have === null ? "baru" : have === want ? "sama" : "diperbarui";
  if (state !== "sama") { n++; if (!dry) fs.writeFileSync(out, want); }
  console.log(`  ${state.padEnd(10)} ${a.name}`);
}
console.log(dry ? `(--dry) ${n} file akan ditulis.` : `${n} file ditulis. Mulai sesi Claude Code baru, lalu jalankan doctor.mjs.`);
