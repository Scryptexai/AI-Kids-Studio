// Draft render for notes (540x960 by default): the same browser + GL as the gate and the final (Chrome, ANGLE), so the
// ink / lens / grade show up, then the mix is muxed in. Not a final: no FX gate, crf 20.
// usage: node scripts/render_draft.mjs <Composition> <out.mp4> <mix.wav> [--scale 0.5] [--range a-b] [--concurrency n] (a big world: n=3, else the GPU runs out: D3D 0x8007000e)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
const TMP = process.env.REMOTION_TMP || (await import("node:os")).tmpdir();
fs.mkdirSync(TMP, { recursive: true }); process.env.TEMP = process.env.TMP = TMP;
const { bundle } = await import("@remotion/bundler");
const { renderMedia, selectComposition } = await import("@remotion/renderer");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [comp, out, mix] = args;
const range = opt("--range", null)?.split("-").map(Number) ?? null;
// Chrome to render with: CHROME_PATH if set, else the usual Windows install, else null (Remotion uses its own browser)
const WIN_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserExecutable = process.env.CHROME_PATH || ((await import("node:fs")).existsSync(WIN_CHROME) ? WIN_CHROME : null);
const chromiumOptions = { gl: "angle" };
const serveUrl = await bundle({ entryPoint: path.resolve(process.env.BRIDGE_ENTRY || "src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable, chromiumOptions });
const silent = out.replace(/\.mp4$/, "_silent.mp4");
let last = -1;
const fx = new Set();
await renderMedia({ composition, serveUrl, codec: "h264", crf: 20, scale: Number(opt("--scale", "0.5")), outputLocation: silent,
  browserExecutable, chromiumOptions, timeoutInMilliseconds: 300000, ...(opt("--concurrency", null) ? { concurrency: Number(opt("--concurrency", null)) } : {}), ...(range ? { frameRange: range } : {}),
  onBrowserLog: (l) => { if (l.text.includes("[FX]")) fx.add(l.text.trim()); },
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.log(`render ${Math.round(progress * 100)} %`); } } });
console.log([...fx].join("\n"));
const ss = range ? (range[0] / composition.fps).toFixed(4) : "0"; // a range clip takes its own slice of the mix
execSync(`ffmpeg -y -loglevel error -i "${silent}" -ss ${ss} -i "${mix}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${out}"`);
console.log("draft:", out);
