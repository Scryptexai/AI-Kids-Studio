// Build a Minecraft short's direction.json from a higher-level spec: each camera key names a position and the subjects
// it frames ("you", "gerald:head", or a point); the solver aims and sets the FOV so the subjects' boxes sit inside the
// Shorts safe zone at the asked fill. Usage: node scripts/mc-direct.mts <spec.json> <world-dir> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "../node_modules/three/build/three.module.js";
import { pathAt, type ShotDirection, type CamKey } from "../src/minecraft/direction.ts";

type SpecKey = Omit<CamKey, "look" | "fov"> & { look?: [number, number, number]; fov?: number;
  frame?: string[]; fill?: number; center?: [number, number] };
type Spec = { shots: Record<string, Omit<ShotDirection, "cam"> & { set: string; cam: SpecKey[] }> };
const [specPath, worldRoot, outPath] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
const SAFE = { l: 0.04, r: 0.84, t: 0.08, b: 0.75 };
const H: Record<string, number> = { you: 2.2, zombie: 2.0, skeleton: 2.0 };

const boxPts = (d: Spec["shots"][string], world: any, name: string, f: number): THREE.Vector3[] => {
  const [id, part] = name.split(":");
  const ch = world.characters.find((c: any) => c.id === id), mob = world.mobs.find((m: any) => m.id === id);
  const at = (ch ? pathAt(d.cast?.[id], f)?.at ?? ch.at : pathAt(d.mobs?.[id], f)?.at ?? mob?.at) as number[];
  if (!at) throw new Error(`no subject ${name}`);
  const h = ch ? H.you : H[mob.mob] ?? 2;
  const ys = part === "head" ? [h - 0.55, h] : [0, h * 0.5, h];
  const pts: THREE.Vector3[] = [];
  for (const y of ys) for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) pts.push(new THREE.Vector3(at[0] + dx, at[1] + y, at[2] + dz));
  return pts;
};

const solve = (pos: number[], pts: THREE.Vector3[], fill: number, center: [number, number], fov0?: number) => {
  const cam = new THREE.PerspectiveCamera(fov0 ?? 45, 9 / 16, 0.05, 400);
  cam.position.set(pos[0], pos[1], pos[2]);
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  let look = c.clone();
  for (let it = 0; it < 60; it++) {
    cam.lookAt(look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const sc = pts.map((p) => { const v = p.clone().project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; });
    const x0 = Math.min(...sc.map((s) => s[0])), x1 = Math.max(...sc.map((s) => s[0]));
    const y0 = Math.min(...sc.map((s) => s[1])), y1 = Math.max(...sc.map((s) => s[1]));
    const ex = (x0 + x1) / 2 - center[0], ey = (y0 + y1) / 2 - center[1];
    const dist = look.distanceTo(cam.position), ty = Math.tan((cam.fov * Math.PI) / 360);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    look.addScaledVector(right, ex * 2 * ty * (9 / 16) * dist * 0.7).addScaledVector(up, -ey * 2 * ty * dist * 0.7);
    if (fov0 === undefined) {
      const need = Math.max((x1 - x0) / ((SAFE.r - SAFE.l) * fill), (y1 - y0) / ((SAFE.b - SAFE.t) * fill));
      const nt = Math.min(Math.tan((100 * Math.PI) / 360), Math.max(Math.tan((14 * Math.PI) / 360), ty * Math.pow(need, 0.6)));
      cam.fov = (Math.atan(nt) * 360) / Math.PI;
    }
  }
  return { look: [look.x, look.y, look.z].map((v) => +v.toFixed(3)) as [number, number, number], fov: +cam.fov.toFixed(2) };
};

const out: { shots: Record<string, ShotDirection> } = { shots: {} };
for (const [sid, d] of Object.entries(spec.shots)) {
  const world = JSON.parse(readFileSync(`${worldRoot}/${d.set}/world.json`, "utf8"));
  const cam: CamKey[] = d.cam.map((k) => {
    if (!k.frame) return { f: k.f, pos: k.pos, look: k.look!, fov: k.fov!, ...(k.ease ? { ease: k.ease } : {}), ...(k.cut ? { cut: true } : {}) };
    const pts = k.frame.flatMap((n) => boxPts(d, world, n, k.f));
    const s = solve(k.pos, pts, k.fill ?? 0.85, k.center ?? [(SAFE.l + SAFE.r) / 2, (SAFE.t + SAFE.b) / 2], k.fov);
    // focus on the lead subject (the first one named): the middle of its box
    const lead = boxPts(d, world, k.frame[0], k.f), fc = lead.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / lead.length);
    return { f: k.f, pos: k.pos, look: k.look ?? s.look, fov: s.fov, focus: [+fc.x.toFixed(3), +fc.y.toFixed(3), +fc.z.toFixed(3)] as [number, number, number], ...(k.ease ? { ease: k.ease } : {}), ...(k.cut ? { cut: true } : {}) };
  });
  const { set: _set, cam: _cam, ...rest } = d;
  out.shots[sid] = { ...rest, cam };
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log("wrote", outPath);
