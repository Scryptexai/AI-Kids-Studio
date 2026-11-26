// usage: node scripts/court/stills.mjs <outDir> [scale=0.5] [frames=9,62,82,105] [propsJSON]
// Renders test stills of the Court sandbox (src/sandboxes/court) with Chrome + ANGLE, like the other render scripts.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
const [out = "out/court/round1", scale = "0.5", frames = "9,62,82,105", props = "{}"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// Chrome to render with: CHROME_PATH if set, else the usual Windows install, else null (Remotion uses its own browser)
const WIN_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserExecutable = process.env.CHROME_PATH || ((await import("node:fs")).existsSync(WIN_CHROME) ? WIN_CHROME : null);
const chromiumOptions = { gl: "angle" };
const inputProps = JSON.parse(props);
const serveUrl = await bundle({ entryPoint: path.resolve("src/sandboxes/court/index.tsx"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: "Court", browserExecutable, chromiumOptions, inputProps, timeoutInMilliseconds: 180000 });
const onBrowserLog = (l) => { if (l.type === "error" || /error|warn/i.test(l.text)) console.log("[browser]", l.type, l.text.slice(0, 300)); };
for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  const file = path.join(out, `f${String(f).padStart(3, "0")}.png`);
  await renderStill({ composition, serveUrl, frame: f, output: file, imageFormat: "png", scale: Number(scale), browserExecutable, chromiumOptions, inputProps, onBrowserLog, timeoutInMilliseconds: 240000 });
  console.log(`frame ${f} -> ${file} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
