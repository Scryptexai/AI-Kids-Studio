// Camera speed of every frame without rendering: bundles a story.ts with esbuild, then measures, like world.ts CAMSPD,
// the mean screen motion (720p px/f) of a 3x3 grid on the subject plane and twice as far, between consecutive frames.
// usage: node scripts/cam_speed.mjs src/videos/<name>/story.ts [limit=25]
// Prints per shot: the peak speed and frame, and every run of frames above the limit.
import { build } from "esbuild";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import * as THREE from "three";
const [entry, lim = "25"] = process.argv.slice(2);
const out = path.join(os.tmpdir(), "cam_speed_story.mjs");
await build({ entryPoints: [path.resolve(entry)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error", loader: { ".json": "json" } });
const S = await import("file:///" + out.replace(/\\/g, "/") + "?" + Date.now());
const mk = (c) => {
  const k = new THREE.PerspectiveCamera(c.fov, 9 / 16, 0.05, 1500);
  k.position.set(...c.pos); k.up.set(0, 1, 0); k.lookAt(...c.look); k.rotateZ(c.roll); k.updateMatrixWorld(); k.updateProjectionMatrix();
  return k;
};
const fwd = new THREE.Vector3(), rt = new THREE.Vector3(), upv = new THREE.Vector3(), pt = new THREE.Vector3(), a0 = new THREE.Vector3();
const speed = (id, f) => {
  const c0 = S.camAt(id, f - 1), c1 = S.camAt(id, f), k0 = mk(c0), k1 = mk(c1);
  const d = Math.hypot(c0.look[0] - c0.pos[0], c0.look[1] - c0.pos[1], c0.look[2] - c0.pos[2]);
  k0.getWorldDirection(fwd); rt.setFromMatrixColumn(k0.matrixWorld, 0); upv.setFromMatrixColumn(k0.matrixWorld, 1);
  const hy = Math.tan((c0.fov * Math.PI) / 360) * d, hx = hy * (9 / 16);
  let sum = 0;
  for (const dk of [1, 2]) for (const gx of [-0.6, 0, 0.6]) for (const gy of [-0.6, 0, 0.6]) {
    pt.copy(k0.position).addScaledVector(fwd, d * dk).addScaledVector(rt, gx * hx * dk).addScaledVector(upv, gy * hy * dk);
    a0.copy(pt).project(k0); const b = pt.clone().project(k1);
    sum += Math.hypot((b.x - a0.x) * 360, (b.y - a0.y) * 640);
  }
  return sum / 18;
};
let moving = 0, total = 0;
for (const s of S.SHOTS) {
  let peak = 0, pf = 0, run = null;
  const runs = [];
  for (let f = s.a + 1; f < s.b; f++) {
    const v = speed(s.id, f); total++; if (v >= 2) moving++;
    if (v > peak) { peak = v; pf = f; }
    if (v > Number(lim)) { if (!run) run = [f, f, v]; run[1] = f; run[2] = Math.max(run[2], v); } else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  console.log(`shot ${String(s.id).padStart(2)} ${String(s.a).padStart(5)}-${String(s.b).padEnd(5)} peak ${peak.toFixed(1).padStart(6)} px/f @${pf}` +
    (runs.length ? "   FAST " + runs.map(([a, b, v]) => `${a}-${b} (${v.toFixed(0)})`).join(", ") : ""));
}
console.log(`moving >= 2 px/f: ${Math.round((100 * moving) / total)} % of frames`);
fs.rmSync(out, { force: true });
