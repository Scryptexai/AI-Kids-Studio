// Print camAt(id, f) for a list of [id, f] pairs: node scripts/cam_query.mjs src/videos/<name>/story.ts "[[1,20]]"
import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
await build({ entryPoints: [process.argv[2]], bundle: true, format: "esm", platform: "node", outfile: "out/_story.mjs", logLevel: "error", loader: { ".json": "json" } });
const S = await import(pathToFileURL(path.resolve("out/_story.mjs")).href + "?" + Date.now());
for (const [id, f] of JSON.parse(process.argv[3])) console.log(id, f, JSON.stringify(S.camAt(id, f), (k, v) => typeof v === "number" ? Math.round(v * 100) / 100 : v));
