// usage: node scripts/frame_check.mjs [step=6] [from=0] [to=TOTAL]
// Renders every step-th frame with inputProps { frameCheck: true } and prints, per shot, the characters that are cut by
// the side / top of the frame (CUT) or stand near a side (EDGE). Crowd extras (folk*) are left out.
import fs from "node:fs";
if (process.env.REMOTION_TMP) { fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true }); process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP; }
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import os from "node:os";
const [step = "6", from = "0", to] = process.argv.slice(2);
// Chrome to render with: CHROME_PATH if set, else the usual Windows install, else null (Remotion uses its own browser)
const WIN_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserExecutable = process.env.CHROME_PATH || ((await import("node:fs")).existsSync(WIN_CHROME) ? WIN_CHROME : null);
const chromiumOptions = { gl: "angle" };
const inputProps = { frameCheck: true };
const serveUrl = await bundle({ entryPoint: path.resolve(process.env.BRIDGE_ENTRY || "src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: process.env.COMP || "TigaJenderal", browserExecutable, chromiumOptions, inputProps });
const end = to ? Number(to) : composition.durationInFrames;
const hits = [];
const clip = new Set();
const speeds = [];
const onBrowserLog = (l) => {
  if (l.text.startsWith("FRAMECHK|")) hits.push(l.text.split("|").slice(1));
  // the "no clipping, no z-fighting" rule (solids.ts in the video folder): characters through solids, feet below
  // the floor, coplanar overlapping faces
  if (/^(COLLIDE|FLOOR|ZFIGHT|PROPFLOOR|PROPCLIP)\|/.test(l.text)) clip.add(l.text);
  if (l.text.startsWith("CAMSPD|")) speeds.push(l.text.split("|").slice(1).map(Number));
  // the Shorts safe zone (a video's safezone.ts) and 2D drawings cut by their own canvas (CARDCLIP)
  if (l.text.startsWith("SAFE|")) safe.push(l.text.split("|").slice(1));
  if (l.text.startsWith("CARDCLIP|")) cardclip.push(l.text.split("|").slice(1));
};
const safe = [], cardclip = [];
const tmp = path.join(os.tmpdir(), "framecheck.jpg");
for (let f = Number(from); f < end; f += Number(step))
  await renderStill({ composition, serveUrl, frame: f, output: tmp, imageFormat: "jpeg", scale: 0.25, browserExecutable, chromiumOptions, inputProps, onBrowserLog, timeoutInMilliseconds: 180000 });
const byShot = new Map();
for (const [f, id, who, x0, x1, y1, kind] of hits) {
  if (who.startsWith("folk")) continue;
  const k = `${id}|${who}|${kind}`, e = byShot.get(k) ?? { id: Number(id), who, kind, frames: [], worst: 0 };
  e.frames.push(Number(f)); e.worst = Math.max(e.worst, Math.abs(Number(x0)), Math.abs(Number(x1)), Number(y1));
  byShot.set(k, e);
}
const rows = [...byShot.values()].sort((a, b) => a.id - b.id || a.who.localeCompare(b.who));
for (const r of rows) console.log(`shot ${r.id}\t${r.kind}\t${r.who}\tframes ${r.frames[0]}-${r.frames[r.frames.length - 1]} (${r.frames.length})\tworst ${r.worst.toFixed(2)}`);
// camera speed (world.ts logs it when frameCheck is on): shots whose sampled frames move faster than 25 px/f at 720p
const fast = new Map();
for (const [f, id, px] of speeds) if (px > 25) { const e = fast.get(id) ?? { frames: [], worst: 0 }; e.frames.push(f); e.worst = Math.max(e.worst, px); fast.set(id, e); }
for (const [id, e] of fast) console.log(`shot ${id}	FAST	camera	frames ${e.frames[0]}-${e.frames[e.frames.length - 1]} (${e.frames.length})	worst ${e.worst.toFixed(1)} px/f`);
const moving = speeds.filter(([, , px]) => px >= 2).length;
console.log(`camera: ${speeds.length ? Math.round((100 * moving) / speeds.length) : 0} % of sampled frames moving (>= 2 px/f; reference ~65 %)`);
// clipping report: per shot and who/what, frame ranges; z-fights listed once
const zf = [...clip].filter((l) => /^(ZFIGHT|PROPFLOOR|PROPCLIP)\|/.test(l));
const cg = new Map();
for (const l of clip) {
  if (/^(ZFIGHT|PROPFLOOR|PROPCLIP)\|/.test(l)) continue;
  const [kind, f, id, who, what] = l.split("|"), k = `${kind}|${id}|${who}|${what}`, e = cg.get(k) ?? [];
  e.push(Number(f)); cg.set(k, e);
}
for (const [k, fs] of [...cg].sort()) { fs.sort((a, b) => a - b); const [kind, id, who, what] = k.split("|"); console.log(`shot ${id}	${kind}	${who}	${what}	frames ${fs[0]}-${fs[fs.length - 1]} (${fs.length})`); }
for (const l of zf) console.log(l);
console.log(`clipping: ${cg.size} collide/floor problems, ${zf.length} z-fighting / prop-floor problems`);
// SAFE: per shot + who (a figure, or key:<object>) + edges, frame ranges and the worst box; CARDCLIP: per shot + who + sides
const group = (list, keyOf) => { const m = new Map(); for (const r of list) { const k = keyOf(r), e = m.get(k) ?? []; e.push(r); m.set(k, e); } return m; };
const safeG = group(safe.filter(([, , who]) => !who.startsWith("folk")), ([, id, who, e]) => `${id}|${who}|${e}`);
for (const [k, rs] of [...safeG].sort((a, b) => Number(a[0].split("|")[0]) - Number(b[0].split("|")[0]))) {
  const [id, who, e] = k.split("|"), fs = rs.map((r) => Number(r[0])).sort((a, b) => a - b);
  const w = rs.reduce((m, r) => ({ x0: Math.min(m.x0, +r[4]), y0: Math.min(m.y0, +r[5]), x1: Math.max(m.x1, +r[6]), y1: Math.max(m.y1, +r[7]), fb: Math.max(m.fb, +r[8]) }), { x0: 9, y0: 9, x1: -9, y1: -9, fb: -9 });
  console.log(`shot ${id}	SAFE	${who}	${e}	frames ${fs[0]}-${fs[fs.length - 1]} (${fs.length})	key box x ${w.x0.toFixed(3)}-${w.x1.toFixed(3)} y ${w.y0.toFixed(3)}-${w.y1.toFixed(3)} feet ${w.fb.toFixed(3)}`);
}
const ccG = group(cardclip, ([, id, who, e]) => `${id}|${who}|${e}`);
for (const [k, rs] of ccG) { const [id, who, e] = k.split("|"), fs = rs.map((r) => Number(r[0])).sort((a, b) => a - b); console.log(`shot ${id}	CARDCLIP	${who}	${e}	frames ${fs[0]}-${fs[fs.length - 1]} (${fs.length})`); }
console.log(`safe: ${safeG.size} safe-zone problems, ${ccG.size} card-clip problems`);
console.log(`checked ${Math.ceil((end - Number(from)) / Number(step))} frames, ${rows.length + fast.size + safeG.size + ccG.size} problems`);
