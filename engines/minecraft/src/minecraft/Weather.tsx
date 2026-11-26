// N4 storm and lightning. The storm look itself (overcast sky, low light, fog) blends in VoxelWorld (stormLook), the grey
// grade in McPost; this file draws what falls and strikes:
//   - rain: the game's own rain texture on world-grid columns (one block wide, turned to face the lens about y), from
//     the top of whatever is in that column up into the sky, scrolling down fast; columns fill in as the storm rises.
//     Nothing rains under a roof. A few splash motes where the drops land, near the lens.
//   - a lightning bolt: blocky jagged segments from high in the sky to the hit point (a few short branches), three
//     additive layers (white core, pale blue, wide faint halo) so it reads in a single frame; a dim leader the frame
//     before, then the return-stroke flicker (direction.ts boltK). A strong cold light at the hit, sparks.
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { useThree } from "@react-three/fiber";
import { Motes, blockAt, type Mote } from "./Build";
import { boltK } from "./direction";
import type { LoadedWorld } from "./VoxelWorld";
import type { FxTex } from "./fxTextures";

type V3 = [number, number, number];

export type StormSpec = {
  /** [frame, 0..1] keys (smooth in-out between): 0 = the set's own sky, 1 = full storm */
  keys: [number, number][];
  /** rain density 0..1 at full storm: share of the grid columns that rain (default 0.55) */
  rain?: number;
  /** rain reaches this far from the lens, blocks (default 34) */
  radius?: number;
  /** splash motes where the drops land (default true) */
  splash?: boolean;
};

export type BoltSpec = {
  /** the strike frame (the bolt reads alone on this frame; the white flash follows) */
  f: number;
  /** the hit point (the top of the struck block) */
  to: V3;
  /** where it leaves the cloud (default 34 blocks above, a little to the side) */
  from?: V3;
  seed?: number;
  /** white frames after the strike (default 2) */
  flash?: number;
  /** frames of flicker light after the flash (default 6) */
  glow?: number;
  /** [amplitude, frames] of the damped camera shake (default [0.35, 9]); false = none */
  shake?: [number, number] | false;
};

const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- rain
const RAIN_CAP = 1400;
export const Rain: React.FC<{ lw: LoadedWorld; spec: StormSpec; k: number; fx: FxTex; cam?: { pos: V3; look: V3 } | null }> = ({ lw, spec, k, fx, cam }) => {
  const frame = useMcFrame();
  const { camera } = useThree();
  // the top of each column (rain lands there): the highest block of the set at that x, z (cross plants do not stop it)
  const tops = useMemo(() => {
    const m = new Map<string, number>();
    for (const [key, b] of blockAt(lw)) {
      if (b.shape === "cross") continue;
      const [x, y, z] = key.split(",").map(Number), c = `${x},${z}`;
      if ((m.get(c) ?? -Infinity) < y + 1) m.set(c, y + 1);
    }
    return m;
  }, [lw]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAIN_CAP * 12), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(RAIN_CAP * 8), 2));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(RAIN_CAP * 16), 4));
    const idx = new Uint32Array(RAIN_CAP * 6);
    for (let i = 0; i < RAIN_CAP; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return g;
  }, []);
  const tex = fx.tex["environment/rain"];
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, toneMapped: false }), []);
  if (mat.map !== (tex ?? null)) { mat.map = tex ?? null; mat.needsUpdate = true; }
  const cp = cam ? new THREE.Vector3(...cam.pos) : camera.position.clone();
  const fw = (cam ? new THREE.Vector3(...cam.look).sub(cp) : camera.getWorldDirection(new THREE.Vector3())).setY(0).normalize();
  const R = spec.radius ?? 34, dens = (spec.rain ?? 0.55) * k;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute, uv = geo.getAttribute("uv") as THREE.BufferAttribute, col = geo.getAttribute("color") as THREE.BufferAttribute;
  const motes: Mote[] = [];
  let n = 0;
  const t = (frame / 30) * 20;                                     // game ticks
  if (dens > 0.001) {
    const x0 = Math.floor(cp.x - R), x1 = Math.ceil(cp.x + R), z0 = Math.floor(cp.z - R), z1 = Math.ceil(cp.z + R);
    for (let x = x0; x <= x1 && n < RAIN_CAP; x++) for (let z = z0; z <= z1 && n < RAIN_CAP; z++) {
      const dx = x + 0.5 - cp.x, dz = z + 0.5 - cp.z, d = Math.hypot(dx, dz);
      if (d < 2.2 || d > R) continue;
      // in front of the lens only (a wide wedge), denser near it
      const ahead = (dx * fw.x + dz * fw.z) / d;
      if (ahead < 0.55) continue;
      const s0 = (x * 73856093) ^ (z * 19349663);
      const near = d < 12 ? 1 : 0.6;
      if (rnd(s0, 1) > dens * near) continue;
      const bottom = tops.get(`${x},${z}`) ?? 0, top = Math.max(bottom + 4, cp.y + 16);
      // turned to face the lens about y
      const sx = -dz / d * 0.5, sz = dx / d * 0.5, cx = x + 0.5, cz = z + 0.5;
      pos.setXYZ(n * 4, cx - sx, bottom, cz - sz); pos.setXYZ(n * 4 + 1, cx + sx, bottom, cz + sz);
      pos.setXYZ(n * 4 + 2, cx + sx, top, cz + sz); pos.setXYZ(n * 4 + 3, cx - sx, top, cz - sz);
      // the game: u spans the column, v = y / 4 scrolled down fast (each column its own phase and speed)
      const u0 = Math.floor(rnd(s0, 2) * 4) * 0.25, sp = (0.36 + 0.12 * rnd(s0, 3)), ph = rnd(s0, 4) * 4;
      const v = t * sp + ph;
      uv.setXY(n * 4, u0, bottom * 0.25 + v); uv.setXY(n * 4 + 1, u0 + 1, bottom * 0.25 + v);
      uv.setXY(n * 4 + 2, u0 + 1, top * 0.25 + v); uv.setXY(n * 4 + 3, u0, top * 0.25 + v);
      // the texture is a dark blue at ~45% alpha: lift it to a pale blue-grey so it reads over a grey sky; fade the far ones
      const a = Math.min(1, 1.6 * k) * (d < 6 ? 0.6 + 0.4 * ((d - 2.2) / 3.8) : 1) * (d > R - 6 ? (R - d) / 6 : 1);
      for (let j = 0; j < 4; j++) col.setXYZW(n * 4 + j, 4.5, 3.4, 1.55, a);
      n++;
      // splashes: a tiny burst of pale motes where a drop lands, now and then (near the lens only)
      if (spec.splash !== false && d < 16) {
        const per = 9 + Math.floor(rnd(s0, 5) * 9), u = (frame + Math.floor(rnd(s0, 6) * per)) % per;
        if (u < 4) for (let i = 0; i < 3; i++) {
          const ss = s0 + i * 7 + Math.floor((frame + Math.floor(rnd(s0, 6) * per)) / per) * 131;
          const a2 = rnd(ss, 1) * Math.PI * 2, r = 0.06 + u * 0.05;
          motes.push({ p: [x + 0.2 + 0.6 * rnd(ss, 2) + Math.cos(a2) * r, bottom + 0.04 + 0.12 * Math.sin((u / 4) * Math.PI), z + 0.2 + 0.6 * rnd(ss, 3) + Math.sin(a2) * r], s: 0.045 * (1 - u / 5), c: "#c9d5e6" });
        }
      }
    }
  }
  pos.needsUpdate = true; uv.needsUpdate = true; col.needsUpdate = true;
  geo.setDrawRange(0, n * 6);
  if (!n) return null;
  return (
    <>
      <mesh geometry={geo} material={mat} renderOrder={18} frustumCulled={false} />
      <Motes motes={motes} lit={false} />
    </>
  );
};

// ---------------------------------------------------------------- lightning
type Seg = { a: THREE.Vector3; b: THREE.Vector3; w: number };
/** the bolt's path: steps of ~2.5-4 blocks up from the hit, swinging side to side (more the higher it goes), plus
 *  2-3 short branches forking off */
const boltPath = (b: BoltSpec): Seg[] => {
  const seed = b.seed ?? Math.round(b.f * 7 + b.to[0] * 13 + b.to[2] * 17);
  const to = new THREE.Vector3(...b.to);
  const from = b.from ? new THREE.Vector3(...b.from) : to.clone().add(new THREE.Vector3((rnd(seed, 1) - 0.5) * 10, 34, 6 + rnd(seed, 2) * 6));
  const out: Seg[] = [], pts: THREE.Vector3[] = [to.clone()];
  const H = from.y - to.y;
  let y = to.y, i = 0;
  while (y < from.y - 0.01) {
    y = Math.min(from.y, y + 2.4 + rnd(seed, 10 + i) * 1.8);
    const k = (y - to.y) / H;
    const base = to.clone().lerp(from, k);
    // the swing grows with height, a few blocks at most; the first step leaves the hit nearly straight up
    const amp = 0.6 + 2.2 * Math.min(1, k * 2.5);
    base.x += (rnd(seed, 30 + i) - 0.5) * 2 * amp; base.z += (rnd(seed, 50 + i) - 0.5) * 2 * amp * 0.6;
    if (y >= from.y) base.copy(from);
    pts.push(base);
    i++;
  }
  for (let j = 0; j < pts.length - 1; j++) out.push({ a: pts[j], b: pts[j + 1], w: 1 });
  // branches: from a joint in the upper two thirds, short, angled down and out
  const nb = 2 + Math.floor(rnd(seed, 3) * 2);
  for (let j = 0; j < nb && pts.length > 3; j++) {
    const at = pts[1 + Math.floor(rnd(seed, 70 + j) * (pts.length - 2))];
    let p = at.clone();
    const dir = rnd(seed, 80 + j) > 0.5 ? 1 : -1;
    for (let s = 0; s < 2 + Math.floor(rnd(seed, 90 + j) * 2); s++) {
      const q = p.clone().add(new THREE.Vector3(dir * (1 + rnd(seed, 100 + j * 5 + s) * 1.8), -(1.6 + rnd(seed, 110 + j * 5 + s) * 1.6), (rnd(seed, 120 + j * 5 + s) - 0.5) * 1.5));
      out.push({ a: p, b: q, w: 0.55 - s * 0.12 });
      p = q;
    }
  }
  return out;
};

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const LAYERS = [
  { w: 0.15, color: new THREE.Color(4, 4, 4.4), op: 1 },
  { w: 0.32, color: new THREE.Color(1.4, 1.6, 2.4), op: 0.55 },
  { w: 0.66, color: new THREE.Color(0.55, 0.7, 1.3), op: 0.22 },
];

export const Bolt: React.FC<{ spec: BoltSpec }> = ({ spec }) => {
  const frame = useMcFrame();
  const segs = useMemo(() => boltPath(spec), [spec]);
  const mats = useMemo(() => LAYERS.map((l) => new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: l.op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })), []);
  const u = frame - spec.f, k = boltK(u, spec.glow);
  const motes: Mote[] = [];
  // sparks off the hit (10 f)
  if (u >= 0 && u <= 10) {
    const t = u / 30;
    for (let i = 0; i < 14; i++) {
      const a = rnd(i, 1) * Math.PI * 2, sp = 2 + rnd(i, 2) * 3, up = 2.5 + rnd(i, 3) * 3;
      motes.push({ p: [spec.to[0] + Math.cos(a) * sp * t, spec.to[1] + 0.05 + up * t - 8 * t * t, spec.to[2] + Math.sin(a) * sp * t], s: 0.06 * (1 - u / 11), c: i % 3 ? "#e8f0ff" : "#ffffff" });
    }
  }
  if (k <= 0) return <Motes motes={motes} lit={false} />;
  mats.forEach((m, i) => { m.opacity = LAYERS[i].op * k; });
  const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  return (
    <>
      {segs.map((s, i) => {
        const d = s.b.clone().sub(s.a), len = d.length(), mid = s.a.clone().add(s.b).multiplyScalar(0.5);
        q.setFromUnitVectors(Y, d.normalize());
        const quat = q.clone();
        return LAYERS.map((l, j) => (
          <mesh key={`${i}:${j}`} geometry={UNIT} material={mats[j]} position={mid} quaternion={quat} scale={[l.w * s.w, len + l.w * s.w, l.w * s.w]} renderOrder={40 + j} frustumCulled={false} />
        ));
      })}
      {/* the hit: a hard cold light on everything around it */}
      <pointLight position={[spec.to[0], spec.to[1] + 1.2, spec.to[2]]} color="#dfe8ff" intensity={140 * k} distance={28} decay={1.4} />
      <Motes motes={motes} lit={false} />
    </>
  );
};
