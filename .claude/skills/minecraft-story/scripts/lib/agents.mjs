// Helper bersama install.mjs + doctor.mjs: daftar agent sumber dan isi yang seharusnya terpasang.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").replace(/\\/g, "/");
/** penanda path di file sumber (agents/*.md dan dokumen); install.mjs menggantinya dengan lokasi skill yang sebenarnya */
export const DEFAULT_SKILL = "~/.claude/skills/minecraft-story";
export const defaultAgentsDir = () => path.join(os.homedir(), ".claude", "agents");

export function sourceAgents() {
  const dir = path.join(SKILL_DIR, "agents");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({ name: f, src: path.join(dir, f) }));
}

/** isi agent untuk dipasang: path skill di file sumber diganti dengan lokasi skill yang sebenarnya */
export function renderAgent(srcFile, skillDir = SKILL_DIR) {
  let s = fs.readFileSync(srcFile, "utf8");
  if (skillDir === DEFAULT_SKILL) return s;
  if (/\s/.test(skillDir)) {
    // hook = perintah shell di dalam string YAML berkutip ganda → path berspasi harus dikutip
    s = s.replaceAll(`node ${DEFAULT_SKILL}/scripts/guard_paths.mjs`, `node \\"${skillDir}/scripts/guard_paths.mjs\\"`);
  }
  return s.replaceAll(DEFAULT_SKILL, skillDir);
}

/** ambil path guard_paths.mjs dari tiap baris `command:` di frontmatter */
export function hookPaths(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*command:\s*"(.*)"\s*$/gm)) {
    const cmd = m[1].replace(/\\"/g, '"');
    const p = cmd.match(/node\s+"([^"]+guard_paths\.mjs)"/) ?? cmd.match(/node\s+(\S+guard_paths\.mjs)/);
    out.push({ cmd, file: p ? p[1] : null });
  }
  return out;
}
