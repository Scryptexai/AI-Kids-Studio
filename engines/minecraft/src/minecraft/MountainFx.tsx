// itw-02 "Mined, Not Born" fx (Wave A, fx agent): the mountain's fx layer. Every field is documented in types.ts
// (MountainFxDir) and projects/itw-02/FX.md "## fx". All pure functions of the key frame; random = seeded per
// particle index, so a 60 fps render steps the same way as 30 fps.
//   R1 mines        destroy stages over a cell, chips / sparks per pick hit, a burst (a Build wave base -> air)
//   R4 steams       hot wind streaks + grit, steam column, flue run (front), jet + plume, wisp (polyline particles)
//   R5 lavaColumns  a WxD lava column filling upward cell by cell (surges), glowing front + light, drain, cooled crust
//   R6 melts        gold blocks glowing, squashing to a slab with drips; lids = two hinged iron halves bending up,
//                   red-hot ramp; shimmers = heat haze (screen-space in McPost + faint wisps)
//   R7 heaves       a pile of cells jolting and heaving up, lava light through the gaps (+ camera shake, direction.ts)
//   R8 treadTexts   carved letters on a tread's top face (BlockText TextOne on +y); treadLines = small carved words on the other treads
//   R9 traces       a glowing route drawn on along a polyline (x-ray); heatTints = heat spreading through the rock
//   misc            cellOutlines (per-cell white outlines, timed, snuff), gravels (trickle down a face), dusts (ceiling)
import React, { useMemo } from "react";
import * as THREE from "three";
import { KEY_FPS, keyNoise, useMcFrame } from "./mcTime";
import { keyed, keysAt } from "./direction";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock, CellOutlineSpec, DustSpec, GravelSpec, HeatTintSpec, HeaveSpec, LavaColumnSpec, LidSpec, MeltSpec, MineSpec, MountainFxDir, ShimmerSpec, SteamSpec, TraceSpec, TreadLinesSpec, TreadTextSpec } from "./types";
import { Motes, blockAt, blockColor, popScale, protoOf, type Mote, type WaveSpec, type WorldMap } from "./Build";
import { contactBlock, crackMat } from "./Fluids";
import { stepFx, type FxTex } from "./fxTextures";
import { TextOne } from "./BlockText";
import { backOut, c01, rnd, smooth, softDot, type V3 } from "./fxCommon";

// ------------------------------------------------------------------ gate, cells, waves (pure, used by McShort)
export const hasMountainFx = (d: MountainFxDir | undefined) => !!(d && (d.mines?.length || d.steams?.length || d.lavaColumns?.length || d.melts?.length ||
  d.lids?.length || d.shimmers?.length || d.heaves?.length || d.treadTexts?.length || d.treadLines?.length || d.traces?.length || d.heatTints?.length ||
  d.cellOutlines?.length || d.gravels?.length || d.dusts?.length));
/** cells the layer draws itself (left out of the merged world mesh): melting caps and heaving piles */
export const mountainKeys = (d: MountainFxDir | undefined): string[] => [
  ...(d?.melts ?? []).flatMap((m) => m.cells.map((c) => c.join(","))),
  ...(d?.heaves ?? []).flatMap((h) => h.cells.map((c) => c.join(","))),
];
/** mined cells that burst: one Build wave each (the old block bursts into motes, air after) */
export const mountainWaves = (d: MountainFxDir | undefined): WaveSpec[] => (d?.mines ?? []).filter((m) => m.break !== undefined).map((m) => ({
  cells: [[m.at[0], m.at[1], m.at[2], m.break!]], from: "base", to: "air", motes: m.motes ?? 6, dust: false,
}));
/** the heat shimmer boxes live this frame (McPost draws the haze) */
export const shimmerAt = (d: MountainFxDir | undefined, f: number): { min: V3; max: V3; k: number }[] =>
  (d?.shimmers ?? []).map((s) => ({ min: s.min, max: s.max, k: c01(keyed(s.keys, f, 0)) * (s.amount ?? 1) })).filter((s) => s.k > 0.005);

// ------------------------------------------------------------------ shared bits
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BOX_BASE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);      // origin at the bottom centre
const PLANE = new THREE.PlaneGeometry(1, 1);
const LAVA_ORANGE = "#ff7a1a";
type Face6 = NonNullable<MineSpec["face"]>;
const N6: Record<Face6, V3> = { "-x": [-1, 0, 0], "+x": [1, 0, 0], "-y": [0, -1, 0], "+y": [0, 1, 0], "-z": [0, 0, -1], "+z": [0, 0, 1] };
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const flick = (f: number, s = 0) => 0.86 + 0.08 * Math.sin(f * 0.9 + s) + 0.06 * Math.sin(f * 2.3 + 1 + s) + 0.08 * (keyNoise((k) => rnd(k, 7 + s), f) - 0.5);

/** a polyline with arc length: point and unit tangent at distance d (clamped) */
type Poly = { pts: V3[]; cum: number[]; len: number };
const poly = (pts: V3[]): Poly => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  return { pts, cum, len: cum[cum.length - 1] };
};
const polyAt = (P: Poly, d: number): { p: V3; t: V3 } => {
  const n = P.pts.length;
  if (n < 2) return { p: P.pts[0] ?? [0, 0, 0], t: [0, 1, 0] };
  const dd = Math.max(0, Math.min(P.len, d));
  let i = 1;
  while (i < n - 1 && P.cum[i] < dd) i++;
  const a = P.pts[i - 1], b = P.pts[i], L = P.cum[i] - P.cum[i - 1] || 1, u = (dd - P.cum[i - 1]) / L;
  const t: V3 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], t };
};
/** two unit vectors across a tangent */
const across = (t: V3): [V3, V3] => {
  const T = new THREE.Vector3(...t), ref = Math.abs(t[1]) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3().crossVectors(T, ref).normalize(), b = new THREE.Vector3().crossVectors(T, a).normalize();
  return [a.toArray() as V3, b.toArray() as V3];
};
const qAlong = (() => { const X = new THREE.Vector3(1, 0, 0); return (t: V3) => new THREE.Quaternion().setFromUnitVectors(X, new THREE.Vector3(...t).normalize()); })();

/** an instanced bunch of unlit boxes (streaks, sparks, bars), additive by default: colour carries the brightness */
const Glows: React.FC<{ items: { p: V3; q?: THREE.Quaternion; s: V3; c: THREE.Color }[]; additive?: boolean; xray?: boolean; order?: number }> = ({ items, additive = true, xray = false, order = 24 }) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, depthTest: !xray, toneMapped: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }), 2048);
    m.frustumCulled = false; m.renderOrder = order;
    if (xray) (m.material as THREE.Material).userData.xrayMask = true;   // McPost imagine mask: kept through rock too
    m.setColorAt(0, new THREE.Color("#ffffff"));
    return m;
  }, [additive, xray, order]);
  const mx = new THREE.Matrix4(), Q0 = new THREE.Quaternion();
  const n = Math.min(2048, items.length);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    mx.compose(new THREE.Vector3(...it.p), it.q ?? Q0, new THREE.Vector3(...it.s));
    mesh.setMatrixAt(i, mx); mesh.setColorAt(i, it.c);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return n ? <primitive object={mesh} /> : null;
};

/** the 12 edges of a box [lo, hi] as bars */
const edgeBars = (lo: V3, hi: V3, w: number): { p: V3; s: V3 }[] => {
  const out: { p: V3; s: V3 }[] = [], mid = (i: number) => (lo[i] + hi[i]) / 2, len = (i: number) => hi[i] - lo[i];
  for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push({ p: [mid(0), y, z], s: [len(0) + w, w, w] });
  for (const x of [lo[0], hi[0]]) for (const z of [lo[2], hi[2]]) out.push({ p: [x, mid(1), z], s: [w, len(1) + w, w] });
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) out.push({ p: [x, y, mid(2)], s: [w, w, len(2) + w] });
  return out;
};

/** a crack stage texture as a white mask (the crack pixels), for a glow showing through the cracks */
const maskCache = new WeakMap<THREE.Texture, THREE.Texture>();
const crackMask = (tex: THREE.Texture | undefined) => {
  if (!tex) return null;
  let m = maskCache.get(tex);
  if (!m) {
    const img = tex.image as HTMLCanvasElement | HTMLImageElement;
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      // the remapped stage: dark crack lines (< mid grey) glow, the light rims less, the rest is clear
      const v = d.data[i], a = d.data[i + 3];
      const k = a < 128 ? 0 : v < 100 ? 1 : 0.35;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = Math.round(255 * k);
    }
    g.putImageData(d, 0, 0);
    m = new THREE.CanvasTexture(c);
    m.magFilter = THREE.NearestFilter; m.minFilter = THREE.NearestFilter; m.generateMipmaps = false;
    maskCache.set(tex, m);
  }
  return m;
};

/** a block object for a cell: the set's own block there, else a named block (set / fx textures) */
const cellBlock = (c: V3, lw: LoadedWorld, worlds: WorldMap, fx: FxTex, id?: string): { obj: THREE.Object3D; color: string } | null => {
  const b = blockAt(lw).get(c.join(","));
  if (b && b.shape !== "fluid") return { obj: protoOf(b, lw, lw).clone(), color: blockColor(b, lw) };
  return id ? contactBlock(id, lw, worlds, fx) : null;
};

// ------------------------------------------------------------------ R1 mines
type Hit = { f: number; stage?: number; sparks?: boolean | string; n?: number };
const hitsOf = (m: MineSpec): Hit[] => (m.hits ?? []).map((h) => (typeof h === "number" ? { f: h } : h)).sort((a, b) => a.f - b.f);
/** the destroy stage on a frame (-1 = none) */
export const mineStage = (m: MineSpec, f: number): number => {
  if (m.break !== undefined && f >= m.break) return -1;
  if (m.stages?.length) { let s = -1; for (const [kf, v] of m.stages) if (f >= kf) s = v; return Math.min(9, s); }
  if (m.run) {
    const [f0, f1, s0 = 0, s1 = 9] = m.run;
    if (f < f0) return -1;
    return Math.min(9, Math.floor(s0 + (s1 - s0 + 0.999) * c01((f - f0) / Math.max(1, f1 - f0))));
  }
  const hs = hitsOf(m);
  let s = -1;
  hs.forEach((h, i) => { if (f >= h.f) s = h.stage ?? Math.round((9 * (i + 1)) / (hs.length + (m.break !== undefined ? 0.6 : 0))); });
  return Math.min(9, s);
};
const faceToward = (c: V3, cam: V3): Face6 => {
  const d = [cam[0] - (c[0] + 0.5), cam[1] - (c[1] + 0.5), cam[2] - (c[2] + 0.5)], a = d.map(Math.abs);
  const i = a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
  return (`${d[i] >= 0 ? "+" : "-"}${"xyz"[i]}`) as Face6;
};

const Mines: React.FC<{ specs: MineSpec[]; lw: LoadedWorld; fx: FxTex; cam: V3 }> = ({ specs, lw, fx, cam }) => {
  const frame = useMcFrame();
  const nodes: React.ReactNode[] = [], motes: Mote[] = [], glows: { p: V3; q?: THREE.Quaternion; s: V3; c: THREE.Color }[] = [];
  specs.forEach((m, mi) => {
    const c = m.at, ctr: V3 = [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5];
    const b = blockAt(lw).get(c.join(","));
    const chip = m.chip ?? (b ? blockColor(b, lw) : "#8a8a8a");
    const st = mineStage(m, frame);
    const tex = st >= 0 ? fx.tex[`block/destroy_stage_${st}`] : undefined;
    if (tex) nodes.push(<mesh key={`mc${mi}`} geometry={BOX} material={crackMat(tex)} position={ctr} scale={1.002} renderOrder={6} />);
    // glow through the cracks (the last plug block before the steam)
    const gk = m.glow ? c01(keyed(m.glow, frame, 0)) : 0;
    if (gk > 0.01 && (m.break === undefined || frame < m.break)) {
      const mask = crackMask(fx.tex[`block/destroy_stage_${Math.max(st, 5)}`]);
      const col = new THREE.Color(m.glowColor ?? LAVA_ORANGE).multiplyScalar(1.6 * gk * flick(frame, mi));
      nodes.push(
        <mesh key={`mg${mi}`} geometry={BOX} position={ctr} scale={1.004} renderOrder={7} userData={{ raidKeep: 1 }}>
          <meshBasicMaterial color={col} map={mask} transparent depthWrite={false} toneMapped={false} fog={false} blending={THREE.AdditiveBlending} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>,
        <pointLight key={`ml${mi}`} position={add(ctr, N6[faceToward(c, cam)], 0.9)} color={m.glowColor ?? "#ff8a34"} intensity={2.2 * gk * flick(frame, mi + 3)} distance={4.5} decay={1.6} />,
      );
    }
    // chips and sparks off the hit face
    const face = m.face ?? faceToward(c, cam), n = N6[face];
    const [ua, ub] = across(n);
    hitsOf(m).forEach((h, hi) => {
      const u = frame - h.f;
      if (u < 0 || u > 14) return;
      const t = u / KEY_FPS, seed = mi * 977 + hi * 131;
      const hitP = add(add(ctr, n, 0.52), ua, (rnd(seed, 1) - 0.5) * 0.5);
      const nc = h.n ?? 4;
      for (let i = 0; i < nc; i++) {
        const s0 = seed + i * 7, sp = 1.6 + rnd(s0, 2) * 1.6;
        const v: V3 = add(add(add([0, 0, 0], n, sp), ua, (rnd(s0, 3) - 0.5) * 2.4), ub, (rnd(s0, 4) - 0.5) * 2.4);
        const p: V3 = [hitP[0] + v[0] * t, Math.max(c[1] - 2, hitP[1] + (v[1] + 2.2 + rnd(s0, 5) * 1.5) * t - 8 * t * t), hitP[2] + v[2] * t];
        motes.push({ p, s: (0.06 + 0.05 * rnd(s0, 6)) * (u > 9 ? 1 - (u - 9) / 5 : 1), c: chip, r: t * 9 * rnd(s0, 7) });
      }
      const sparks = h.sparks ?? m.sparks;
      if (sparks && u <= 7) {
        const sc = new THREE.Color(typeof sparks === "string" ? sparks : "#fff1b8");
        for (let i = 0; i < 9; i++) {
          const s0 = seed + 300 + i * 11, sp = 4 + rnd(s0, 1) * 5;
          const dir = new THREE.Vector3(...add(add(n, ua, (rnd(s0, 2) - 0.5) * 2.2), ub, (rnd(s0, 3) - 0.5) * 2.2)).normalize();
          dir.y += 0.3 * rnd(s0, 4); dir.normalize();
          const d = sp * t, len = 0.12 + 0.18 * (1 - u / 7);
          const p = add(hitP, dir.toArray() as V3, d);
          p[1] -= 3 * t * t;
          glows.push({ p, q: qAlong(dir.toArray() as V3), s: [len, 0.025, 0.025], c: sc.clone().multiplyScalar(2.2 * (1 - u / 8)) });
        }
        if (u <= 2) glows.push({ p: add(hitP, n, 0.01), s: [0.32, 0.32, 0.32], c: sc.clone().multiplyScalar(1.4 * (1 - u / 3)) });
      }
    });
  });
  return <>{nodes}<Motes motes={motes} /><Glows items={glows} /></>;
};

// ------------------------------------------------------------------ R4 steam / hot wind
const STEAM_DEF = {
  wind: { speed: 0.6, rate: 3, width: 1.2, size: 0.7, color: "#fff0d8" },
  steam: { speed: 0.25, rate: 1.5, width: 0.8, size: 0.9, color: "#f2f2f2" },
  jet: { speed: 0.8, rate: 3, width: 0.5, size: 0.8, color: "#f4f4f4" },
  wisp: { speed: 0.05, rate: 0.4, width: 0.3, size: 0.5, color: "#f0f0f0" },
} as const;
const MAX_P = 420;

const Steam: React.FC<{ s: SteamSpec; fx: FxTex; si: number }> = ({ s, fx, si }) => {
  const frame = useMcFrame();
  const kind = s.kind ?? "steam", D = STEAM_DEF[kind];
  const P = useMemo(() => poly(s.path), [s.path]);
  const speed = s.speed ?? D.speed, rate = s.rate ?? D.rate, width = s.width ?? D.width, size = s.size ?? D.size;
  const plume = s.plume ?? 0, total = P.len + plume, op = (s.opacity ?? 0.85) * (s.ghost ? 0.75 : 1);
  const maxLife = total / (speed * 0.75) + 2;
  const mats = useMemo(() => [] as THREE.SpriteMaterial[], []);
  const H = s.front ? P.len * c01((frame - s.front[0]) / Math.max(1, s.front[1] - s.front[0])) : Infinity;
  const head = s.front && H < P.len ? H : Infinity;
  const streaks: { p: V3; q?: THREE.Quaternion; s: V3; c: THREE.Color }[] = [], grit: Mote[] = [], puffs: React.ReactNode[] = [];
  const base = new THREE.Color(s.color ?? D.color);
  const seed = (s.seed ?? si) * 7919;
  const j1 = Math.floor(frame * rate), j0 = Math.max(j1 - MAX_P, Math.ceil((frame - maxLife) * rate));
  let slot = 0;
  for (let j = j1; j >= j0; j--) {
    const J = seed + j;
    const b = (j + rnd(J, 1) * 0.6) / rate, a = frame - b;
    if (a < 0) continue;
    const str = s.keys?.length ? c01(keyed(s.keys, b, 0)) : 1;
    if (rnd(J, 2) > str) continue;
    const sp = speed * (0.75 + 0.5 * rnd(J, 3));
    let d = a * sp;
    if (d > total) continue;
    if (d > head) d = head - rnd(J, 9) * Math.min(1.2, size);       // piling up at the racing front
    if (d < 0) continue;
    const life = d / total;
    const at = polyAt(P, d);
    let p = at.p, g = 1;
    if (d > P.len) {                                                  // the plume past the path end: slows, grows, drifts
      const over = d - P.len, end = polyAt(P, P.len);
      const dr = s.drift ?? [0, 0, 0], age = over / sp;
      p = add(add(end.p, end.t, over * 0.7), dr, age);
      g = 1 + 0.8 * (over / Math.max(0.01, plume));
    }
    const [u1, u2] = across(at.t);
    const wob = Math.sin(a * 0.21 + rnd(J, 4) * 6.28) * 0.18 * width;
    p = add(add(p, u1, (rnd(J, 5) - 0.5) * width * (kind === "wind" ? 1 : 0.6) * g + wob), u2, (rnd(J, 6) - 0.5) * width * (kind === "wind" ? 1 : 0.6) * g);
    const fadeIn = c01(a / 3), fadeOut = 1 - smooth((life - 0.8) / 0.2);
    if (kind === "wind") {
      if (rnd(J, 7) < (s.grit ?? 0.3)) {
        grit.push({ p, s: 0.045 + 0.04 * rnd(J, 8), c: rnd(J, 10) < 0.5 ? "#4b4541" : "#6b625a", r: a * 0.7 });
      } else {
        const L = size * (0.6 + 0.8 * rnd(J, 8)) * (0.6 + 0.4 * str);
        streaks.push({ p, q: qAlong(at.t), s: [L, 0.03, 0.03], c: base.clone().multiplyScalar(op * 0.9 * fadeIn * fadeOut * (0.5 + 0.5 * str)) });
      }
      continue;
    }
    // steam / jet / wisp: the game's big smoke frames as the puff ages
    const fi = Math.min(11, Math.floor(life * 9 + rnd(J, 11) * 3));
    const tex = fx.tex[`particle/big_smoke_${fi}`];
    const m = (mats[slot] ??= new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: true }));
    m.map = tex ?? softDot(); m.alphaTest = tex ? 0.02 : 0; m.color.copy(base);
    m.opacity = op * fadeIn * fadeOut * (kind === "wisp" ? 0.55 : 1) * (0.55 + 0.45 * str);
    m.rotation = rnd(J, 12) * 6.28 + a * 0.01 * (rnd(J, 13) - 0.5);
    const sz = size * (0.55 + 0.9 * life) * g * (kind === "wisp" ? 0.6 + 0.4 * Math.sin(a * 0.05 + J) : 1);
    puffs.push(<sprite key={slot} position={p} scale={[sz, sz, 1]} material={m} renderOrder={14} />);
    slot++;
  }
  return (
    <group userData={s.ghost ? { raidKeep: 1 } : undefined}>
      {puffs}
      <Glows items={streaks} order={15} />
      <Motes motes={grit} />
    </group>
  );
};

// ------------------------------------------------------------------ R5 lava columns
/** the lava look (the game's lava texture, self-lit), optionally tinted (molten gold) */
const lavaMats = new Map<string, THREE.MeshLambertMaterial>();
const lavaMat = (tex: THREE.Texture | undefined, tint = "#ffffff", glow = 0.85) => {
  const key = `${tex?.uuid ?? "none"}|${tint}|${glow}`;
  let m = lavaMats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: tex ?? null, color: tex ? tint : LAVA_ORANGE, emissive: new THREE.Color(tex ? tint : LAVA_ORANGE), emissiveMap: tex ?? null, emissiveIntensity: glow });
    lavaMats.set(key, m);
  }
  return m;
};

const LavaColumn: React.FC<{ s: LavaColumnSpec; fx: FxTex; lw: LoadedWorld; worlds: WorldMap; ci: number }> = ({ s, fx, lw, worlds, ci }) => {
  const frame = useMcFrame();
  const [w, dd] = s.size ?? [2, 2], [x0, y0, z0] = s.from;
  const raw = keysAt(s.level, frame);
  const n = Math.floor(raw), fr = raw - n;
  const top = s.gulp === false ? raw : n + backOut(c01((fr - 0.35) / 0.65), 1.4);   // each cell gulps up (small overshoot)
  const tex = stepFx(fx, "block/lava_still", frame, KEY_FPS);
  const mat = lavaMat(tex);
  const mesh = useMemo(() => { const m = new THREE.InstancedMesh(BOX_BASE, mat, 1024); m.frustumCulled = false; m.receiveShadow = true; return m; }, [mat]);
  const mx = new THREE.Matrix4(), Q0 = new THREE.Quaternion();
  let k = 0;
  for (let y = y0; y < top && k < 1024; y++) {
    const h = Math.min(1, top - y);
    if (h <= 0.01) break;
    for (let x = 0; x < w; x++) for (let z = 0; z < dd; z++) {
      mx.compose(new THREE.Vector3(x0 + x + 0.5, y, z0 + z + 0.5), Q0, new THREE.Vector3(1, h, 1));
      mesh.setMatrixAt(k++, mx);
    }
  }
  mesh.count = k; mesh.instanceMatrix.needsUpdate = true;
  const live = top > y0 + 0.02;
  const fl = flick(frame, ci * 3), fk = s.front ?? 1;
  const cx = x0 + w / 2, cz = z0 + dd / 2;
  // bubbles popping on the surface (whole key frames)
  const bub: Mote[] = [];
  if (live) for (let j = Math.floor(frame) - 10; j <= Math.floor(frame); j++) {
    const J = ci * 4441 + j, u = frame - j;
    if (rnd(J, 1) > 0.45 || u < 0) continue;
    const t = u / 10, px = x0 + 0.15 + rnd(J, 2) * (w - 0.3), pz = z0 + 0.15 + rnd(J, 3) * (dd - 0.3);
    bub.push({ p: [px, top + 0.05 + 0.9 * t - 1.1 * t * t, pz], s: 0.07 * (1 - t), c: rnd(J, 4) < 0.5 ? "#ffb347" : "#ff8a1e" });
  }
  // the cooled crust cap
  const crust = s.crust && frame >= s.crust.f ? s.crust : null;
  const crustBlk = useMemo(() => (s.crust ? contactBlock(s.crust.block ?? "cobblestone", lw, worlds, fx) : null), [s.crust, lw, worlds, fx]);
  const crustCells = useMemo(() => {
    if (!crustBlk || !s.crust) return [];
    const out: THREE.Object3D[] = [];
    for (let x = 0; x < w; x++) for (let z = 0; z < dd; z++) out.push(crustBlk.obj.clone());
    return out;
  }, [crustBlk, s.crust, w, dd]);
  const hot = crust ? 1 - c01((frame - crust.f) / (crust.len ?? 30)) : 0;
  return (
    <group userData={{ raidKeep: 1 }}>
      {live && <primitive object={mesh} />}
      {live && fk > 0 && (
        <>
          <mesh geometry={PLANE} position={[cx, top + 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} scale={[w, dd, 1]} renderOrder={9}>
            <meshBasicMaterial color={new THREE.Color("#ffc65a").multiplyScalar(0.9 * fk * fl)} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh geometry={BOX} position={[cx, top - 0.35, cz]} scale={[w + 0.08, 0.8, dd + 0.08]} renderOrder={9}>
            <meshBasicMaterial color={new THREE.Color("#ff7a1a").multiplyScalar(0.55 * fk * fl)} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <pointLight position={[cx, top + 0.8, cz]} color="#ff8a34" intensity={(s.light ?? 3) * fl} distance={9} decay={1.5} />
        </>
      )}
      <Motes motes={bub} lit={false} />
      {crust && crustCells.map((o, i) => {
        const x = Math.floor(i / dd), z = i % dd;
        return <primitive key={`cr${i}`} object={o} position={[x0 + x + 0.5, crust.y, z0 + z + 0.5]} />;
      })}
      {crust && hot > 0.01 && (
        <>
          <mesh geometry={BOX} position={[cx, crust.y + 0.5, cz]} scale={[w + 0.01, 1.01, dd + 0.01]} renderOrder={8}>
            <meshBasicMaterial color={new THREE.Color(LAVA_ORANGE).multiplyScalar(0.7 * hot * hot)} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <pointLight position={[cx, crust.y + 1.4, cz]} color="#ff8a34" intensity={2 * hot} distance={6} decay={1.6} />
        </>
      )}
    </group>
  );
};

// ------------------------------------------------------------------ R6 melts, lids, shimmer wisps
const Melt: React.FC<{ s: MeltSpec; lw: LoadedWorld; worlds: WorldMap; fx: FxTex; mi: number }> = ({ s, lw, worlds, fx, mi }) => {
  const frame = useMcFrame();
  const objs = useMemo(() => s.cells.map((c) => cellBlock(c, lw, worlds, fx, s.block ?? "gold_block")), [s.cells, s.block, lw, worlds, fx]);
  const to = s.to ?? 0.5, [f0, f1] = s.squash;
  const k = c01((frame - f0) / Math.max(1, f1 - f0));
  // squash with a soft wobble at the end (butter settling)
  const e = smooth(k) + (k >= 1 ? 0.06 * Math.sin((frame - f1) * 0.7) * Math.exp(-(frame - f1) / 5) : 0);
  const h = 1 - (1 - to) * Math.min(1.08, e), bulge = 1 + 0.07 * ((1 - h) / Math.max(0.01, 1 - to));
  const g = s.glow ? c01(keyed(s.glow, frame, 0)) : k;
  const gold = lavaMat(stepFx(fx, "block/lava_still", frame, KEY_FPS), s.dripColor ?? "#ffcf3a", 0.7);
  const nodes: React.ReactNode[] = [];
  s.cells.forEach((c, ci) => {
    const o = objs[ci];
    const bx = c[0] + 0.5, bz = c[2] + 0.5;
    if (o) nodes.push(<group key={`m${ci}`} position={[bx, c[1], bz]} scale={[bulge, h, bulge]}><primitive object={o.obj} /></group>);
    else nodes.push(<mesh key={`m${ci}`} geometry={BOX_BASE} position={[bx, c[1], bz]} scale={[bulge, h, bulge]}><meshLambertMaterial color="#f5c542" /></mesh>);
    if (g > 0.01) nodes.push(
      <mesh key={`g${ci}`} geometry={BOX_BASE} position={[bx, c[1] - 0.002, bz]} scale={[bulge + 0.012, h + 0.008, bulge + 0.012]} renderOrder={8} userData={{ raidKeep: 1 }}>
        <meshBasicMaterial color={new THREE.Color(LAVA_ORANGE).multiplyScalar(0.62 * g * flick(frame, mi + ci))} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>,
    );
    // the molten top: gold-tinted lava spreading over the squashed top
    if (k > 0.05) nodes.push(
      <mesh key={`t${ci}`} geometry={PLANE} position={[bx, c[1] + h + 0.004, bz]} rotation={[-Math.PI / 2, 0, 0]} scale={[bulge * Math.min(1, 0.3 + k), bulge * Math.min(1, 0.3 + k), 1]} material={gold} renderOrder={7} />,
    );
    // drips down the sides, pooling at the foot
    const nd = s.drips ?? 3;
    for (let i = 0; i < nd; i++) {
      const J = mi * 733 + ci * 97 + i * 13, side = Math.floor(rnd(J, 1) * 4), along = 0.2 + rnd(J, 2) * 0.6;
      const ts = f0 + rnd(J, 3) * (f1 - f0) * 0.7, u = frame - ts;
      if (u < 0) continue;
      const len = Math.min(h, (u / 14) * h * (0.8 + 0.4 * rnd(J, 4))), wd = 0.09 + 0.06 * rnd(J, 5), out = 0.5 * bulge + 0.025;
      const nrm: V3 = side === 0 ? [1, 0, 0] : side === 1 ? [-1, 0, 0] : side === 2 ? [0, 0, 1] : [0, 0, -1];
      const tan: V3 = side < 2 ? [0, 0, 1] : [1, 0, 0];
      const p: V3 = add(add([bx, c[1] + h - len / 2, bz], nrm, out), tan, along - 0.5);
      nodes.push(<mesh key={`d${ci}:${i}`} geometry={BOX} position={p} scale={side < 2 ? [0.05, len, wd] : [wd, len, 0.05]} material={gold} />);
      const pool = c01((u - 14) / 16);
      if (pool > 0) {
        const r = 0.12 + 0.22 * pool * (0.7 + 0.6 * rnd(J, 6));
        nodes.push(<mesh key={`p${ci}:${i}`} geometry={BOX} position={add(add([bx, c[1] + 0.02, bz], nrm, out + r * 0.6), tan, along - 0.5)} scale={side < 2 ? [r * 1.2, 0.04, r] : [r, 0.04, r * 1.2]} material={gold} />);
      }
    }
  });
  return <>{nodes}</>;
};

const Lid: React.FC<{ s: LidSpec; lw: LoadedWorld; li: number }> = ({ s, lw, li }) => {
  const frame = useMcFrame();
  const mat = useMemo(() => {
    const t = lw.textures[s.tex ?? "block/iron_block"];
    return new THREE.MeshLambertMaterial({ map: t ?? null, emissiveMap: t ?? null, color: t ? "#ffffff" : "#c9c9c9", emissive: new THREE.Color("#000000") });
  }, [lw, s.tex]);
  if (s.hide !== undefined && frame >= s.hide) return null;
  if (s.pop !== undefined && frame < s.pop) return null;
  const sc = s.pop !== undefined ? popScale(frame - s.pop) : 1;
  const [w, d] = s.size ?? [2, 2], th = s.thick ?? 0.19, y = s.y ?? s.at[1] + 1;
  const g = s.glow ? c01(keyed(s.glow, frame, 0)) : 0;
  // iron -> dark red -> red-hot -> orange
  const hotC = g < 0.5 ? new THREE.Color("#000000").lerp(new THREE.Color("#8a1000"), g / 0.5) : new THREE.Color("#8a1000").lerp(new THREE.Color("#ff6a14"), (g - 0.5) / 0.5);
  mat.emissive.copy(hotC); mat.emissiveIntensity = 1 + g;
  // the lit colour sinks as the glow takes over, so hot iron reads dark red -> orange (never pink)
  mat.color.set(new THREE.Color("#ffffff").lerp(new THREE.Color("#140c0a"), c01(g * 4)));
  const th0 = ((s.bend ? keyed(s.bend, frame, 0) : 0) * Math.PI) / 180;
  const ax = s.axis ?? "x";
  const x0 = s.at[0], z0 = s.at[2];
  const halves = ax === "x"
    ? [{ pivot: [x0 + w / 2, y, z0] as V3, rot: [-th0, 0, 0] as V3, plate: [0, th / 2, d / 4] as V3, size: [w, th, d / 2] as V3 },
       { pivot: [x0 + w / 2, y, z0 + d] as V3, rot: [th0, 0, 0] as V3, plate: [0, th / 2, -d / 4] as V3, size: [w, th, d / 2] as V3 }]
    : [{ pivot: [x0, y, z0 + d / 2] as V3, rot: [0, 0, th0] as V3, plate: [w / 4, th / 2, 0] as V3, size: [w / 2, th, d] as V3 },
       { pivot: [x0 + w, y, z0 + d / 2] as V3, rot: [0, 0, -th0] as V3, plate: [-w / 4, th / 2, 0] as V3, size: [w / 2, th, d] as V3 }];
  const gap = c01(th0 / (Math.PI / 6));
  return (
    <group userData={g > 0.05 ? { raidKeep: 1 } : undefined}>
      {halves.map((hf, i) => (
        <group key={i} position={hf.pivot} rotation={hf.rot} scale={sc}>
          <mesh geometry={BOX} position={hf.plate} scale={hf.size} material={mat} castShadow receiveShadow />
          {/* the hinge knuckle */}
          <mesh geometry={BOX} position={[0, th * 0.6, 0]} scale={ax === "x" ? [w * 0.9, th * 0.7, th * 0.7] : [th * 0.7, th * 0.7, d * 0.9]} material={mat} />
        </group>
      ))}
      {gap > 0.02 && (
        <mesh geometry={PLANE} position={[x0 + w / 2, y + 0.01, z0 + d / 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[w * 0.96, d * 0.96, 1]} renderOrder={8}>
          <meshBasicMaterial color={new THREE.Color("#ff9a3a").multiplyScalar(1.3 * gap * flick(frame, li))} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      )}
      {g > 0.2 && <pointLight position={[x0 + w / 2, y + 0.9, z0 + d / 2]} color="#ff5a1a" intensity={2.2 * g * flick(frame, li + 5)} distance={5} decay={1.6} />}
    </group>
  );
};

/** faint rising heat wisps inside a shimmer box (the haze itself is McPost's) */
const Wisps: React.FC<{ s: ShimmerSpec; si: number }> = ({ s, si }) => {
  const frame = useMcFrame();
  const k = c01(keyed(s.keys, frame, 0));
  if (k < 0.01 || s.wisps === false) return null;
  const items: { p: V3; q?: THREE.Quaternion; s: V3; c: THREE.Color }[] = [];
  const H = s.max[1] - s.min[1], col = new THREE.Color("#ffe2b0");
  for (let j = Math.floor(frame) - 40; j <= Math.floor(frame); j++) {
    const J = si * 3331 + j;
    if (rnd(J, 1) > 0.5) continue;
    const u = (frame - j) / 40;
    const p: V3 = [s.min[0] + rnd(J, 2) * (s.max[0] - s.min[0]) + 0.05 * Math.sin(u * 9 + J), s.min[1] + u * H, s.min[2] + rnd(J, 3) * (s.max[2] - s.min[2])];
    items.push({ p, s: [0.012, 0.18 + 0.1 * rnd(J, 4), 0.012], c: col.clone().multiplyScalar(0.12 * k * Math.sin(u * Math.PI)) });
  }
  return <Glows items={items} order={14} />;
};

// ------------------------------------------------------------------ R7 heave
const Heave: React.FC<{ s: HeaveSpec; lw: LoadedWorld; worlds: WorldMap; fx: FxTex; hi: number }> = ({ s, lw, worlds, fx, hi }) => {
  const frame = useMcFrame();
  const objs = useMemo(() => s.cells.map((c) => cellBlock(c, lw, worlds, fx, "cobblestone")), [s.cells, lw, worlds, fx]);
  const up = s.up ?? 0.6, len = s.len ?? 16, rest = s.rest ?? 0.12;
  const u = frame - s.f;
  // 0 -> 1 in 4 f (overshoot), then a damped settle down to `rest`
  const lift = u < 0 ? 0 : u < 4 ? backOut(u / 4, 1.8) : rest + (1 - rest) * Math.exp(-(u - 4) / (len / 3)) * Math.cos(((u - 4) / len) * Math.PI * 1.5);
  let jolt = 0;
  for (const j of s.jolts ?? []) { const v = frame - j; if (v >= 0 && v < 6) jolt += 0.07 * Math.sin((v / 6) * Math.PI) * (1 - v / 6); }
  const g = s.glow ? c01(keyed(s.glow, frame, 0)) : 0;
  const fl = flick(frame, hi * 5);
  const nodes: React.ReactNode[] = [], bars: { p: V3; s: V3; c: THREE.Color }[] = [];
  const ys = s.cells.map((c) => c[1]), yMin = Math.min(...ys), yMax = Math.max(...ys);
  s.cells.forEach((c, ci) => {
    const J = hi * 1009 + ci * 31, amp = 0.7 + 0.6 * rnd(J, 1) + 0.25 * (c[1] - yMin) / Math.max(1, yMax - yMin);
    const dy = up * lift * amp + jolt * (0.6 + 0.8 * rnd(J, 2));
    const tilt = (rnd(J, 3) - 0.5) * 0.22 * Math.min(1, lift), tilt2 = (rnd(J, 4) - 0.5) * 0.22 * Math.min(1, lift);
    const o = objs[ci];
    if (o) nodes.push(<group key={`h${ci}`} position={[c[0] + 0.5, c[1] + dy, c[2] + 0.5]} rotation={[tilt, 0, tilt2]}><primitive object={o.obj} /></group>);
    if (g > 0.01) {
      const col = new THREE.Color(LAVA_ORANGE).multiplyScalar(1.5 * g * fl);
      for (const b of edgeBars([c[0], c[1] + dy, c[2]], [c[0] + 1, c[1] + 1 + dy, c[2] + 1], 0.06)) bars.push({ ...b, c: col });
      if (dy > 0.03) nodes.push(
        <mesh key={`u${ci}`} geometry={BOX_BASE} position={[c[0] + 0.5, c[1], c[2] + 0.5]} scale={[0.96, dy, 0.96]} renderOrder={8} userData={{ raidKeep: 1 }}>
          <meshBasicMaterial color={new THREE.Color("#ffb347").multiplyScalar(1.6 * g * fl)} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>,
      );
    }
  });
  const cx = s.cells.reduce((a, c) => a + c[0] + 0.5, 0) / s.cells.length, cz = s.cells.reduce((a, c) => a + c[2] + 0.5, 0) / s.cells.length;
  return (
    <group userData={{ raidKeep: 1 }}>
      {nodes}
      <Glows items={bars} order={9} />
      {g > 0.01 && <pointLight position={[cx, yMax + 1.6, cz]} color="#ff7a2a" intensity={3 * g * fl} distance={7} decay={1.5} />}
    </group>
  );
};

// ------------------------------------------------------------------ R8 tread text / lines
const TOP_YAW: Record<NonNullable<TreadTextSpec["top"]>, number> = { "-z": 0, "+z": Math.PI, "+x": -Math.PI / 2, "-x": Math.PI / 2 };
const treadPlane = (top: TreadTextSpec["top"]) => ({ rot: new THREE.Euler(-Math.PI / 2, TOP_YAW[top ?? "+z"], 0, "YXZ"), n: [0, 1, 0] as V3 });
const CARVE = "NEVER DIG BELOW THE LAST STAIR".split(" ");
const TreadLines: React.FC<{ s: TreadLinesSpec }> = ({ s }) => {
  const plane = useMemo(() => treadPlane(s.top), [s.top]);
  const texts = useMemo(() => s.cells.map((_, i) => {
    const rows = s.rows ?? 2, out: string[] = [];
    for (let r = 0; r < rows; r++) {
      // whole words only (a cut word reads as a typo); two short ones share a row
      const pick = (k: number) => CARVE[Math.floor(rnd((s.seed ?? 3) * 97 + i * 13 + r * 5, k) * CARVE.length)];
      const a = pick(0), b = pick(1);
      out.push(a.length + b.length < 8 && a !== b ? `${a} ${b}` : a);
    }
    return out.join("\n");
  }), [s.cells, s.rows, s.seed]);
  return <>{s.cells.map((c, i) => <TextOne key={i} s={{ text: texts[i], at: [c[0] + 0.5, c[1] + 1, c[2] + 0.5], face: "+z", height: 0.11, mode: "carved" }} plane={plane} />)}</>;
};

// ------------------------------------------------------------------ R9 route trace, heat tint
/** does the route turn at point j (more than ~8 degrees)? the ends never count */
const bentAt = (P: ReturnType<typeof poly>, j: number) => {
  if (j <= 0 || j >= P.pts.length - 1) return false;
  const a = P.pts[j - 1], b = P.pts[j], c = P.pts[j + 1];
  const u = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(), v = new THREE.Vector3(c[0] - b[0], c[1] - b[1], c[2] - b[2]).normalize();
  return u.dot(v) < 0.99;
};
const Trace: React.FC<{ s: TraceSpec }> = ({ s }) => {
  const frame = useMcFrame();
  const P = useMemo(() => poly(s.path), [s.path]);
  const k = smooth((frame - s.f0) / Math.max(1, s.f1 - s.f0));
  const fade = s.out !== undefined ? 1 - smooth((frame - s.out) / 10) : 1;
  if (k <= 0 || fade <= 0.01) return null;
  const D = P.len * k, w = s.width ?? 0.18, xray = s.xray ?? true;
  // a given colour tints the core too (a red-orange route reads red-orange, not cream)
  const glow = new THREE.Color(s.color ?? "#ffd27a"), core = s.color ? new THREE.Color(s.color).lerp(new THREE.Color("#fff6dc"), 0.45) : new THREE.Color("#fff6dc");
  const items: { p: V3; q?: THREE.Quaternion; s: V3; c: THREE.Color }[] = [];
  for (let i = 1; i < P.pts.length; i++) {
    const a0 = P.cum[i - 1], a1 = Math.min(P.cum[i], D);
    if (a1 <= a0) break;
    const A = polyAt(P, a0 + 1e-4), B = polyAt(P, a1 - 1e-4), L = a1 - a0;
    // a joint only overlaps (ends stretched to close the corner, a joint glow) where the route bends: a straight run
    // of short segments would stack additive light into bright bars at every joint
    const e0 = bentAt(P, i - 1) ? 1 : 0, e1 = bentAt(P, i) && a1 >= P.cum[i] ? 1 : 0;
    const sh = (x: number) => ((e1 - e0) * x) / 4;      // shift the box centre so only the bent ends stick out
    const at = (x: number): V3 => [mid[0] + A.t[0] * sh(x), mid[1] + A.t[1] * sh(x), mid[2] + A.t[2] * sh(x)];
    const mid: V3 = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2, (A.p[2] + B.p[2]) / 2], q = qAlong(A.t);
    // a slow brightness wave runs along the finished route
    const pulse = 0.85 + 0.15 * Math.sin(frame * 0.25 - P.cum[i] * 0.3);
    items.push({ p: at(w * 0.45), q, s: [L + (w * 0.45 * (e0 + e1)) / 2, w * 0.45, w * 0.45], c: core.clone().multiplyScalar(1.4 * fade * pulse) });
    items.push({ p: at(w * 1.8), q, s: [L + (w * 1.8 * (e0 + e1)) / 2, w * 1.8, w * 1.8], c: glow.clone().multiplyScalar(0.45 * fade * pulse) });
    if (e1 && i < P.pts.length - 1 && P.cum[i] <= D) items.push({ p: P.pts[i], s: [w * 1.8, w * 1.8, w * 1.8], c: glow.clone().multiplyScalar(0.3 * fade) });
  }
  if (k < 1) {
    const h = polyAt(P, D);
    // the head: a bright bead; a wide route keeps it a bead (not a big lit cube)
    const hc = Math.min(w * 3, w + 0.5), hg = Math.min(w * 6, w * 1.8 + 1);
    items.push({ p: h.p, s: [hc, hc, hc], c: core.clone().multiplyScalar(1.8 * fade) });
    items.push({ p: h.p, s: [hg, hg, hg], c: glow.clone().multiplyScalar(0.35 * fade) });
  }
  return <group userData={{ raidKeep: 1 }}><Glows items={items} xray={xray} order={30} /></group>;
};

const TINT_N: Record<NonNullable<HeatTintSpec["face"]>, V3> = { "-x": [-1, 0, 0], "+x": [1, 0, 0], "-z": [0, 0, -1], "+z": [0, 0, 1], "+y": [0, 1, 0] };
const TINT_ROT: Record<NonNullable<HeatTintSpec["face"]>, V3> = { "-x": [0, -Math.PI / 2, 0], "+x": [0, Math.PI / 2, 0], "-z": [0, Math.PI, 0], "+z": [0, 0, 0], "+y": [-Math.PI / 2, 0, 0] };
const HeatTint: React.FC<{ s: HeatTintSpec; lw: LoadedWorld; exclude: Set<string>; ti: number }> = ({ s, lw, exclude, ti }) => {
  const frame = useMcFrame();
  const face = s.face ?? "-x", n = TINT_N[face];
  const cells = useMemo(() => {
    const out: { c: V3; d: number; r: number }[] = [], R = s.radius;
    for (const [key, b] of blockAt(lw)) {
      if ((b as CBlock).shape === "fluid") continue;
      const c = key.split(",").map(Number) as V3;
      if (s.min && (c[0] < s.min[0] || c[1] < s.min[1] || c[2] < s.min[2])) continue;
      if (s.max && (c[0] > s.max[0] || c[1] > s.max[1] || c[2] > s.max[2])) continue;
      const d = Math.hypot(c[0] + 0.5 - s.at[0], c[1] + 0.5 - s.at[1], c[2] + 0.5 - s.at[2]);
      if (d > R) continue;
      out.push({ c, d, r: rnd(ti * 7 + c[0] * 3 + c[1] * 5, c[2]) });
    }
    return out;
  }, [lw, s.at, s.radius, s.min, s.max, ti]);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(PLANE, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, toneMapped: false, fog: false,
      // dst * (1 + src): warms the face it sits on and keeps the texture's contrast (additive washed stone to salmon)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), Math.max(1, cells.length));
    m.frustumCulled = false; m.renderOrder = 7; m.setColorAt(0, new THREE.Color("#000"));
    return m;
  }, [cells.length]);
  const at = blockAt(lw), col = new THREE.Color(s.color ?? "#ff6a1a"), mx = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...TINT_ROT[face]));
  const fade = s.out !== undefined ? 1 - smooth((frame - s.out) / 12) : 1, op = s.opacity ?? 1.1;
  let k = 0;
  for (const it of cells) {
    const nb = add(it.c, n).join(",");
    if (at.has(nb) && !exclude.has(nb) && at.get(nb)!.shape !== "fluid") continue;   // that face is covered
    const reach = c01((it.d + (it.r - 0.5) * 1.6) / s.radius);
    const tf = s.f0 + (s.f1 - s.f0) * reach, a = smooth((frame - tf) / 8) * fade;
    if (a <= 0.01) continue;
    const I = a * op * Math.pow(1 - it.d / s.radius, 1.4) * (0.9 + 0.2 * it.r);
    const p: V3 = [it.c[0] + 0.5 + n[0] * 0.506, it.c[1] + 0.5 + n[1] * 0.506, it.c[2] + 0.5 + n[2] * 0.506];
    mx.compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(k, mx); mesh.setColorAt(k, col.clone().multiplyScalar(I)); k++;
  }
  mesh.count = k; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return k ? <group userData={{ raidKeep: 1 }}><primitive object={mesh} /></group> : null;
};

// ------------------------------------------------------------------ cell outlines, gravel, dust
const nth = (v: number | number[] | undefined, i: number, every?: number): number | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v + (every ?? 0) * i;
const CellOutlines: React.FC<{ s: CellOutlineSpec }> = ({ s }) => {
  const frame = useMcFrame();
  const mats = useMemo(() => s.cells.map(() => new THREE.MeshBasicMaterial({ color: s.color ?? "#ffffff", transparent: true, depthWrite: false, depthTest: !s.xray, toneMapped: false, fog: false })), [s.cells, s.color, s.xray]);
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  const base = new THREE.Color(s.color ?? "#ffffff"), w0 = s.width ?? 0.05;
  s.cells.forEach((c, i) => {
    const on = nth(s.on, i, s.every)!, off = nth(s.off, i), sn = s.snuff?.find((x) => x.i === i)?.f;
    if (frame < on) return;
    const u = frame - on;
    let k = smooth(u / 4), sc = 1 + 0.22 * (1 - c01(u / 6)) ** 2, w = w0, bright = 1;
    if (off !== undefined) k *= 1 - smooth((frame - off) / 8);
    if (sn !== undefined && frame >= sn) {
      const v = frame - sn;
      if (v <= 2) { bright = 2.2; w = w0 * 1.8; sc *= 1.05; }
      else { const e = c01((v - 2) / 6); sc *= 1 - e; k *= 1 - e; }
      // the snuff: white motes out of the cell
      if (v <= 12) for (let m = 0; m < 8; m++) {
        const J = i * 53 + m, a = rnd(J, 1) * 6.28, t = v / 12;
        motes.push({ p: [c[0] + 0.5 + Math.cos(a) * (0.5 + 0.7 * t), c[1] + 0.5 + (rnd(J, 2) - 0.3) * 0.9 * t + 0.4 * t, c[2] + 0.5 + Math.sin(a) * (0.5 + 0.7 * t)], s: 0.07 * (1 - t), c: "#ffffff" });
      }
    }
    if (k <= 0.01 || sc <= 0.01) return;
    const m = mats[i]; m.opacity = Math.min(1, k); m.color.copy(base).multiplyScalar(bright);
    const h = 0.5 * sc + 0.02, ctr: V3 = [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5];
    edgeBars([ctr[0] - h, ctr[1] - h, ctr[2] - h], [ctr[0] + h, ctr[1] + h, ctr[2] + h], w).forEach((b, bi) =>
      nodes.push(<mesh key={`${i}:${bi}`} geometry={BOX} position={b.p} scale={b.s} material={m} renderOrder={s.xray ? 31 : 22} />));
  });
  return <>{nodes}<Motes motes={motes} lit={false} /></>;
};

const GRAVEL = ["#8b8580", "#6f6a66", "#a29c95", "#7a746e"];
const Gravel: React.FC<{ s: GravelSpec; gi: number }> = ({ s, gi }) => {
  const frame = useMcFrame();
  const P = useMemo(() => poly(s.path), [s.path]);
  const rate = s.rate ?? 3, acc = s.speed ?? 0.012, width = s.width ?? 1.2, size = s.size ?? 1;
  const motes: Mote[] = [];
  const maxLife = Math.sqrt((2 * P.len) / acc) + 2;
  const j1 = Math.floor(Math.min(frame, s.f1) * rate), j0 = Math.max(Math.ceil(s.f0 * rate), Math.ceil((frame - maxLife) * rate), j1 - 600);
  for (let j = j0; j <= j1; j++) {
    const J = (s.seed ?? gi) * 6151 + j, b = j / rate + rnd(J, 1) * 0.5 / rate, a = frame - b;
    if (a < 0) continue;
    const d = 0.04 * a + 0.5 * acc * (0.7 + 0.6 * rnd(J, 2)) * a * a;
    if (d > P.len) continue;
    const at = polyAt(P, d), [u1] = across(at.t);
    const side: V3 = [u1[0], 0, u1[2]];
    const hop = Math.abs(Math.sin(a * (0.35 + 0.2 * rnd(J, 3)) + J)) * 0.18 * c01(d / 1.5);
    const p = add(add(at.p, side, (rnd(J, 4) - 0.5) * width), [0, 1, 0], hop + 0.06);
    const end = 1 - smooth((d / P.len - 0.9) / 0.1);
    motes.push({ p, s: (0.07 + 0.07 * rnd(J, 5)) * size * end, c: GRAVEL[Math.floor(rnd(J, 6) * GRAVEL.length)], r: a * 0.4 * rnd(J, 7) });
  }
  return <Motes motes={motes} />;
};

const Dust: React.FC<{ s: DustSpec; di: number }> = ({ s, di }) => {
  const frame = useMcFrame();
  const rate = s.rate ?? 4, H = s.max[1] - s.min[1], motes: Mote[] = [];
  const life = H / 0.05 + 2;
  const j1 = Math.floor(Math.min(frame, s.f1) * rate), j0 = Math.max(Math.ceil(s.f0 * rate), Math.ceil((frame - life) * rate), j1 - 800);
  for (let j = j0; j <= j1; j++) {
    const J = (s.seed ?? di) * 4271 + j, b = j / rate, a = frame - b;
    if (a < 0) continue;
    const str = s.keys?.length ? c01(keyed(s.keys, b, 0)) : 1;
    if (rnd(J, 1) > str) continue;
    // a few "streams" (the same spot, a thin trickle) and loose motes
    const grp = rnd(J, 2) < 0.5 ? Math.floor(rnd(J, 3) * 5) : -1;
    const fx = grp >= 0 ? rnd(di * 31 + grp, 4) : rnd(J, 4), fz = grp >= 0 ? rnd(di * 31 + grp, 5) : rnd(J, 5);
    const v = 0.05 + 0.04 * rnd(J, 6), y = s.max[1] - 0.02 - v * a - 0.002 * a * a;
    if (y < s.min[1]) continue;
    const sway = Math.sin(a * 0.15 + J) * 0.06;
    motes.push({ p: [s.min[0] + fx * (s.max[0] - s.min[0]) + sway, y, s.min[2] + fz * (s.max[2] - s.min[2])], s: (s.size ?? 0.035) * (0.6 + 0.8 * rnd(J, 7)), c: s.color ?? "#9a9286" });
  }
  return <Motes motes={motes} />;
};

// ------------------------------------------------------------------ the layer
export const MountainLayers: React.FC<{ d: MountainFxDir; lw: LoadedWorld; worlds: WorldMap; fx: FxTex; cam: V3; exclude: Set<string> }> = ({ d, lw, worlds, fx, cam, exclude }) => (
  <>
    {d.mines?.length ? <Mines specs={d.mines} lw={lw} fx={fx} cam={cam} /> : null}
    {d.steams?.map((s, i) => <Steam key={`st${i}`} s={s} fx={fx} si={i} />)}
    {d.lavaColumns?.map((s, i) => <LavaColumn key={`lc${i}`} s={s} fx={fx} lw={lw} worlds={worlds} ci={i} />)}
    {d.melts?.map((s, i) => <Melt key={`me${i}`} s={s} lw={lw} worlds={worlds} fx={fx} mi={i} />)}
    {d.lids?.map((s, i) => <Lid key={`li${i}`} s={s} lw={lw} li={i} />)}
    {d.shimmers?.map((s, i) => <Wisps key={`sh${i}`} s={s} si={i} />)}
    {d.heaves?.map((s, i) => <Heave key={`hv${i}`} s={s} lw={lw} worlds={worlds} fx={fx} hi={i} />)}
    {d.treadTexts?.map((s, i) => <TextOne key={`tt${i}`} s={{ ...s, face: "+z" }} plane={treadPlane(s.top)} />)}
    {d.treadLines?.map((s, i) => <TreadLines key={`tl${i}`} s={s} />)}
    {d.traces?.map((s, i) => <Trace key={`tr${i}`} s={s} />)}
    {d.heatTints?.map((s, i) => <HeatTint key={`ht${i}`} s={s} lw={lw} exclude={exclude} ti={i} />)}
    {d.cellOutlines?.map((s, i) => <CellOutlines key={`co${i}`} s={s} />)}
    {d.gravels?.map((s, i) => <Gravel key={`gr${i}`} s={s} gi={i} />)}
    {d.dusts?.map((s, i) => <Dust key={`du${i}`} s={s} di={i} />)}
  </>
);
