// Final render behind the FX gate (cartoon-3d-short SKILL.md, "Pre-render QA gate").
// usage: node scripts/render_final.mjs <Composition> <out.mp4> <gateDir> [--range 0-149] [--check 100] [--concurrency n] (a big world: n=2-3, else D3D 0x8007000e)
//   - refuses to start unless <gateDir>/fx_gate.md is ALL GREEN
//   - renders with the SAME browser + GL as the gate stills (Chrome, ANGLE). The CLI default GL produced a final
//     with no ink / lens / grade on Tiga Jenderal (2026-11-04) while stills looked right.
//   - collects "[FX] <name> active" from the render's browser log; a missing effect = FAIL
//   - pulls the --check frame from the mp4 and compares it with the gate's f<check>_on.png / f<check>_no-<fx>.png:
//     the final must be closer to ON than to every OFF still, else an effect is missing in the real render
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
const TMP = process.env.REMOTION_TMP || (await import("node:os")).tmpdir();
fs.mkdirSync(TMP, { recursive: true }); process.env.TEMP = process.env.TMP = TMP;
const { bundle } = await import("@remotion/bundler");
const { renderMedia, selectComposition } = await import("@remotion/renderer");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [comp, out, gateDir] = args;
// the effects to prove: by default every effect the gate tested (its "effect: <name>" rows), so a short with a zoom blur
// checks the zoom in the final too; --fx overrides
const gateFx = (() => { try { return [...fs.readFileSync(path.join(args[2], "fx_gate.md"), "utf8").matchAll(/\| effect: (\w+) \|/g)].map((m) => m[1]); } catch { return []; } })();
const FX = opt("--fx", gateFx.length ? gateFx.join(",") : "ink,lens,bloom,grade").split(",");
const range = opt("--range", null)?.split("-").map(Number) ?? null;
const check = Number(opt("--check", "300"));
const gate = fs.readFileSync(path.join(gateDir, "fx_gate.md"), "utf8");
if (!gate.includes("ALL GREEN")) { console.error("FX gate is not green: run scripts/fx_gate.mjs first"); process.exit(1); }
if (!fs.existsSync(path.join(gateDir, `f${check}_on.png`))) { console.error(`no gate stills for frame ${check}: run fx_gate.mjs --frames ${check},...`); process.exit(1); }

// Chrome to render with: CHROME_PATH if set, else the usual Windows install, else null (Remotion uses its own browser)
const WIN_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserExecutable = process.env.CHROME_PATH || ((await import("node:fs")).existsSync(WIN_CHROME) ? WIN_CHROME : null);
const chromiumOptions = { gl: "angle" };
const serveUrl = await bundle({ entryPoint: path.resolve(process.env.BRIDGE_ENTRY || "src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable, chromiumOptions });
const logs = new Set();
let last = -1;
const scale = Number(opt("--scale", "1.3333333333333333"));
  await renderMedia({ composition, serveUrl, codec: "h264", crf: 16, scale, outputLocation: out,
  browserExecutable, chromiumOptions, timeoutInMilliseconds: 300000, ...(range ? { frameRange: range } : {}),
  ...(opt("--concurrency", null) ? { concurrency: Number(opt("--concurrency", null)) } : {}),
  onBrowserLog: (l) => { if (l.text.includes("[FX]")) logs.add(l.text.trim().replace(/ \(.*\)$/, "")); },
  onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; console.log(`render ${Math.round(progress * 100)} %`); } } });

const rows = [];
let ok = true;
for (const n of FX) { const y = logs.has(`[FX] ${n} active`); if (!y) ok = false; rows.push([`log: ${n}`, y ? "OK" : "FAIL", y ? "printed during the final render" : "never printed"]); }
const idx = check - (range ? range[0] : 0);
const vf = path.join(gateDir, `final_f${check}.png`);
execSync(`ffmpeg -v error -y -i "${out}" -vf "select=eq(n\\,${idx}),scale=540:960:flags=area" -frames:v 1 "${vf}"`);
const diff = (a, b) => JSON.parse(execSync(`python -I "${path.resolve("scripts/fx_diff.py")}" "${a}" "${b}"`, { encoding: "utf8" }));
const dOn = diff(vf, path.join(gateDir, `f${check}_on.png`)).mean;
for (const n of FX) {
  const offPng = path.join(gateDir, `f${check}_no-${n}.png`);
  if (diff(path.join(gateDir, `f${check}_on.png`), offPng).pct < 0.5) { rows.push([`final frame ${check} vs ${n} OFF`, "n/a", `${n} does not show in frame ${check} (proved by the gate on another frame)`]); continue; }
  const dOff = diff(vf, offPng).mean;
  const y = dOn < dOff;
  if (!y) ok = false;
  rows.push([`final frame ${check} vs ${n} OFF`, y ? "OK" : "FAIL", `mean |d| to ON ${dOn.toFixed(2)} vs to ${n}-OFF ${dOff.toFixed(2)}`]);
}
const md = [`# Final render check: ${comp} -> ${out}`, "", "| check | status | evidence |", "|---|---|---|", ...rows.map((r) => `| ${r.join(" | ")} |`), "",
  ok ? "**ALL GREEN: render has every effect.**" : "**NOT GREEN: the render is missing an effect; do not deliver it.**"].join("\n");
fs.writeFileSync(out.replace(/\.mp4$/, "_fxcheck.md"), md + "\n");
console.log("\n" + md);
process.exit(ok ? 0 : 1);
