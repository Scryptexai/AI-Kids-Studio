// Writes a video's shot list (name, first frame, end frame) as JSON for scripts/export_extras.py.
// usage: node scripts/dump_shots.mjs <src/videos/<name>/story.ts> <out.json>
// Bundles story.ts with esbuild (it imports words.json), reads PLAN order from SH and SHOTS, writes [{name, a, b}].
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const [story, out] = process.argv.slice(2);
const tmp = path.resolve("out/.dump_shots");
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, "entry.ts"),
  `import { SH, SHOTS } from ${JSON.stringify(path.resolve(story).replace(/\\/g, "/").replace(/\.ts$/, ""))};\n` +
  `const names = Object.fromEntries(Object.entries(SH).map(([n, i]) => [i, n]));\n` +
  `console.log(JSON.stringify(SHOTS.map((s) => ({ name: names[s.id], a: s.a, b: s.b }))));\n`);
const esb = path.resolve("node_modules/.bin/esbuild" + (process.platform === "win32" ? ".cmd" : ""));
execSync(`"${esb}" "${path.join(tmp, "entry.ts")}" --bundle --platform=node --outfile="${path.join(tmp, "entry.cjs")}" --log-level=error`);
const json = execSync(`node "${path.join(tmp, "entry.cjs")}"`).toString().trim();
fs.writeFileSync(out, JSON.stringify(JSON.parse(json), null, 1));
console.log(`shots -> ${out}`);
