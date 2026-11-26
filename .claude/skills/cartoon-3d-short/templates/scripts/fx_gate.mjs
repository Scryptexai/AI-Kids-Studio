// Pre-render QA gate (cartoon-3d-short SKILL.md). MUST pass before every final render.
// usage: node scripts/fx_gate.mjs <Composition> <outDir> [--frames 300,800] [--fx ink,lens,bloom,grade[,zoom]]
//   1. dependencies: exactly one installed copy of three / postprocessing / @react-three/postprocessing
//   2. A/B: every test frame rendered with all effects ON and once per effect with only that effect OFF
//      (inputProps { post: { <fx>: false } }); pixel diff ON vs OFF must be clearly above zero
//   3. logs: the ON render must print "[FX] <fx> active" for every effect, the OFF render must NOT print it
//   4. report: table printed and written to <outDir>/fx_gate.md; exit code 1 if anything is not green
// "No error" is not proof. An effect counts only when its pixels visibly change the frame.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
const TMP = process.env.REMOTION_TMP || (await import("node:os")).tmpdir();
fs.mkdirSync(TMP, { recursive: true }); process.env.TEMP = process.env.TMP = TMP;
const { bundle } = await import("@remotion/bundler");
const { renderStill, selectComposition } = await import("@remotion/renderer");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [comp, outDir] = args;
if (!comp || !outDir) { console.error("usage: node scripts/fx_gate.mjs <Composition> <outDir> [--frames a,b] [--fx ink,lens,bloom,grade]"); process.exit(2); }
const frames = opt("--frames", "300,800").split(",").map(Number);
const FX = opt("--fx", "ink,lens,bloom,grade").split(",");
// pass when at least this share of pixels changes by more than 3/255 in some channel (below = "nearly identical")
const MIN_CHANGED_PCT = Number(opt("--min-pct", "0.5"));
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
let ok = true;

// ---- 1. duplicate dependencies ----
const PKGS = ["three", "postprocessing", "@react-three/postprocessing"];
let depLines = [];
try { depLines = execSync(`npm ls --all --parseable ${PKGS.join(" ")}`, { encoding: "utf8" }).trim().split(/\r?\n/); }
catch (e) { depLines = (e.stdout || "").trim().split(/\r?\n/); ok = false; rows.push(["dependencies", "npm ls", "FAIL", "npm ls exited non-zero (invalid/missing package)"]); }
for (const p of PKGS) {
  const tail = path.join("node_modules", ...p.split("/"));
  const copies = [...new Set(depLines)].filter((l) => l.endsWith(tail));
  const vers = copies.map((c) => JSON.parse(fs.readFileSync(path.join(c, "package.json"), "utf8")).version);
  const pass = copies.length === 1;
  if (!pass) ok = false;
  rows.push(["dependencies", p, pass ? "OK" : "FAIL", `${copies.length} copy(ies): ${vers.join(", ") || "none"}`]);
}
if (!ok) { report(); process.exit(1); } // STOP: fix duplicates before anything else

// ---- 2 + 3. A/B renders and FX logs ----
// Chrome to render with: CHROME_PATH if set, else the usual Windows install, else null (Remotion uses its own browser)
const WIN_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserExecutable = process.env.CHROME_PATH || ((await import("node:fs")).existsSync(WIN_CHROME) ? WIN_CHROME : null);
const chromiumOptions = { gl: "angle" };
const serveUrl = await bundle({ entryPoint: path.resolve(process.env.BRIDGE_ENTRY || "src/index.ts"), publicDir: path.resolve("public") });
const still = async (frame, post, file) => {
  const inputProps = { post };
  const composition = await selectComposition({ serveUrl, id: comp, browserExecutable, chromiumOptions, inputProps });
  const logs = [];
  await renderStill({ composition, serveUrl, frame, output: file, imageFormat: "png", scale: 0.5, inputProps,
    browserExecutable, chromiumOptions, timeoutInMilliseconds: 180000,
    onBrowserLog: (l) => { if (l.text.includes("[FX]")) logs.push(l.text.trim()); } });
  return logs;
};
const diff = (a, b) => JSON.parse(execSync(`python -I "${path.resolve("scripts/fx_diff.py")}" "${a}" "${b}"`, { encoding: "utf8" }));

const best = Object.fromEntries(FX.map((n) => [n, { pct: 0, mean: 0, frame: null, logOn: false, logOffClean: true }]));
for (const f of frames) {
  const on = path.join(outDir, `f${f}_on.png`);
  const onLogs = await still(f, {}, on);
  console.log(`frame ${f} ON logs:`, onLogs.join(" | ") || "(none)");
  for (const n of FX) {
    const off = path.join(outDir, `f${f}_no-${n}.png`);
    const offLogs = await still(f, { [n]: false }, off);
    const d = diff(on, off);
    const b = best[n];
    if (onLogs.some((l) => l.startsWith(`[FX] ${n} active`))) b.logOn = true;
    if (offLogs.some((l) => l.startsWith(`[FX] ${n} active`))) b.logOffClean = false;
    if (d.pct > b.pct) Object.assign(b, { pct: d.pct, mean: d.mean, frame: f });
    console.log(`  ${n.padEnd(6)} f${f}: ${d.pct.toFixed(2)} % px changed, mean |d| ${d.mean.toFixed(2)}/255`);
  }
}
for (const n of FX) {
  const b = best[n];
  const ab = b.pct >= MIN_CHANGED_PCT;
  const pass = ab && b.logOn && b.logOffClean;
  if (!pass) ok = false;
  rows.push([`effect: ${n}`, `log ON ${b.logOn ? "yes" : "NO"} / OFF ${b.logOffClean ? "silent" : "STILL LOGS"}`, pass ? "OK" : "FAIL",
    `A/B best f${b.frame}: ${b.pct.toFixed(2)} % px changed (min ${MIN_CHANGED_PCT} %), mean |d| ${b.mean.toFixed(2)}/255`]);
}
report();
process.exit(ok ? 0 : 1);

function report() {
  const md = [`# FX gate: ${comp} (${new Date().toISOString()})`, "", "| check | detail | status | evidence |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`), "", ok ? "**ALL GREEN: final render may proceed.**" : "**NOT GREEN: do not render the final.**"].join("\n");
  fs.writeFileSync(path.join(outDir, "fx_gate.md"), md + "\n");
  console.log("\n" + md);
}
