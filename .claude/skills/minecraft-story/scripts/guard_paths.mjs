#!/usr/bin/env node
// PreToolUse hook: tolak Write/Edit di luar wilayah agent (ownership.json), dan untuk Bash tolak command terlarang.
// Dipasang di frontmatter agent:
//   node ~/.claude/skills/minecraft-story/scripts/guard_paths.mjs <agent>          (matcher Write|Edit|MultiEdit|NotebookEdit)
//   node ~/.claude/skills/minecraft-story/scripts/guard_paths.mjs <agent> --bash   (matcher Bash)
// Input hook = JSON di stdin ({tool_name, tool_input, ...}). Exit 0 = boleh, exit 2 = ditolak (stderr dikirim ke agent).
// Tes manual: echo {"tool_name":"Write","tool_input":{"file_path":"E:/x/projects/demo/shots/s01/camera.json"}} | node guard_paths.mjs camera-director
import { OWNERSHIP, ownGlobs, matchAny, splitProject } from "./lib/ownership.mjs";

const agent = process.argv[2];
const bashMode = process.argv.includes("--bash");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw || "{}"); } catch { deny("input hook bukan JSON"); }
  const ti = input.tool_input ?? {};

  if (!agent || !OWNERSHIP.agents[agent]) deny(`agent tidak dikenal di ownership.json: ${agent}`);

  if (bashMode) {
    const cmd = String(ti.command ?? "");
    for (const pat of OWNERSHIP.bash_forbidden?.[agent] ?? []) {
      if (new RegExp(pat, "i").test(cmd)) {
        deny(`${agent} tidak boleh mengirim command ke server (pola /${pat}/). Selama Wave Produksi semua agent hanya menghasilkan file; orchestrator yang menjalankan RCON di Step 8.`);
      }
    }
    process.exit(0);
  }

  const file = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (!file) process.exit(0); // tool tanpa path: bukan urusan hook ini
  const sp = splitProject(file);
  if (!sp) deny(`${agent} hanya boleh menulis di dalam projects/<slug>/ — ditolak: ${file}`);

  const own = ownGlobs(agent);
  if (matchAny(sp.rel, own)) process.exit(0);

  const ro = matchAny(sp.rel, OWNERSHIP.readonly_after_gate5) ? " File ini BACA SAJA setelah GATE 5." : "";
  deny(
    `${agent} tidak memiliki ${sp.rel}.${ro}\n` +
      `MILIKKU: ${own.join(", ") || "(tidak ada)"}\n` +
      `Butuh perubahan di file ini? Jangan edit — tulis permintaan ke REQUESTS/${agent}__<topik>.md (file, alasan, perubahan yang diminta).`
  );
});

function deny(msg) {
  process.stderr.write(`[guard_paths] DITOLAK: ${msg}\n`);
  process.exit(2);
}
