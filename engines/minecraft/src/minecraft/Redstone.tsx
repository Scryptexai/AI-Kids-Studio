// Wave B (mc-cobblegen) C5 / C6 / C10: the piston that pushes the cobblestone line, the redstone clock that drives it,
// and the imagined ghost piston. Spec types (documented) at the end of types.ts: PistonSpec, RedstoneSpec,
// GhostPistonSpec. Drawn outside the merged world mesh: pistonKeys / redstoneKeys name the cells to leave out of it.
//
// Piston (vanilla models + textures, redstoneModels.ts): at rest the whole "piston" block; while it works the base
// (piston_inner face) plus the head plate sliding out one block over `ext` frames, the arm growing behind it (always
// reaching into the base, never out of its back). Linear like the game. The blocks in front move with the plate (same
// distance, so they never overlap it); a refill block forms in the front cell after the head is back (a hiss, a hot
// glow, the Wave A contact look), so the line grows by one per push; past `max` a block falls away or pops.
// Redstone: one flat quad per dust cell (no overlapping pieces), its texture composited from the game's dot / line
// pieces for that cell's connections, tinted with the game's power colour (dark red unpowered, bright red at 15, one
// step dimmer per cell from a repeater); repeaters swap to their lit model with a glow on the torches.
import React, { useMemo } from "react";
import * as THREE from "three";
import { KEY_FPS, useMcFrame } from "./mcTime";
import { blockObject } from "./Actors";
import { Motes, SmokePuff, breakMotes, dustPuff, popScale, type Mote, type WorldMap } from "./Build";
import { SmokeSq } from "./Fire";
import { contactBlock, crackMat } from "./Fluids";
import { ghostOf, type Ghost } from "./ghost";
import { haloTex } from "./Items";
import { WAVEB_MODELS } from "./redstoneModels";
import type { FxTex } from "./fxTextures";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock, CElement, Facing, GhostPistonSpec, ItemSpec, PistonSpec, RedstoneSpec } from "./types";

type V3 = [number, number, number];
const K = (x: number, y: number, z: number) => `${x},${y},${z}`;
const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

export const FACE_VEC: Record<Facing, V3> = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
/** blockstate rotation [x, y] of a north-facing model turned to face `f` (the game's piston blockstates) */
const FACE_ROT: Record<Facing, [number, number]> = { north: [0, 0], east: [0, 90], south: [0, 180], west: [0, 270], up: [270, 0], down: [90, 0] };

// ---------------------------------------------------------------- model objects
const modelBlock = (key: string, els: CElement[], layer: CBlock["layer"] = "opaque"): CBlock => ({
  key: `wb:${key}`, id: key, shape: "model", layer, tint: null, rotX: 0, rotY: 0, light: 0, positions: [], elements: els,
});
const protoCache = new Map<string, THREE.Group>();
/** a north-facing model part as an object (origin bottom centre), a fresh clone per call */
const part = (name: "piston" | "base" | "plate" | "arm", fx: FxTex): THREE.Object3D => {
  let g = protoCache.get(name);
  if (!g) {
    const els = name === "piston" ? WAVEB_MODELS.piston : name === "base" ? WAVEB_MODELS.piston_base : name === "plate" ? WAVEB_MODELS.piston_head.slice(0, 1) : WAVEB_MODELS.piston_head.slice(1);
    g = blockObject(modelBlock(name, els), fx.tex);
    protoCache.set(name, g);
  }
  return g.clone();
};
/** a repeater (output toward `dir`), unlit or lit */
const repeaterObj = (dir: "north" | "south" | "east" | "west", delay: number, on: boolean, fx: FxTex) => {
  const name = `repeater_${Math.max(1, Math.min(4, delay))}tick${on ? "_on" : ""}`;
  const b = modelBlock(name, WAVEB_MODELS[name], "cutout");
  // the model's output end (the fixed torch) is north at y = 0
  b.rotY = { north: 0, east: 90, south: 180, west: 270 }[dir];
  b.key = `wb:${name}:${b.rotY}`;
  return blockObject(b, fx.tex);
};

/** the parts of a north-facing piston at extension d (0..1), drawn in the piston cell's local frame (origin bottom
 *  centre, -z = out). The arm runs from the plate's back 4 + 12 d px into the base, so it never shows behind it. */
const PistonParts: React.FC<{ d: number; o: { piston: THREE.Object3D; base: THREE.Object3D; plate: THREE.Object3D; arm: THREE.Object3D } }> = ({ d, o }) => {
  if (d <= 0.0005) return <primitive object={o.piston} />;
  const s = (4 + 12 * d) / 16;
  return (
    <>
      <primitive object={o.base} />
      <group position={[0, 0, -d]}><primitive object={o.plate} /></group>
      {/* arm element spans head-cell z 4..20 px = local -0.25..0.75; pivot at its plate end */}
      <group position={[0, 0, -0.25 - d]} scale={[1, 1, s]}><group position={[0, 0, 0.25]}><primitive object={o.arm} /></group></group>
    </>
  );
};
/** turns a north-facing part group to face `f`, about the cell centre */
const Faced: React.FC<{ at: V3; facing: Facing; scale?: number; children: React.ReactNode }> = ({ at, facing, scale = 1, children }) => {
  const [rx, ry] = FACE_ROT[facing];
  return (
    <group position={[at[0] + 0.5, at[1] + 0.5, at[2] + 0.5]} scale={scale}>
      <group rotation={new THREE.Euler((-rx * Math.PI) / 180, (-ry * Math.PI) / 180, 0, "YXZ")}>
        <group position={[0, -0.5, 0]}>{children}</group>
      </group>
    </group>
  );
};

// ---------------------------------------------------------------- piston timing (pure)
export const pistonTiming = (s: PistonSpec) => {
  const period = s.clock?.period ?? 16;
  const ext = s.ext ?? 2, ret = s.ret ?? 2, hold = s.hold ?? Math.max(1, Math.min(6, Math.floor(period / 2) - 2));
  let pushes = s.pushes ? [...s.pushes] : [];
  if (s.clock) { const f1 = s.clock.f1 ?? s.clock.f0 + 40 * period; for (let f = s.clock.f0; f < f1; f += period) pushes.push(f); }
  pushes = [...new Set(pushes)].sort((a, b) => a - b);
  return { pushes, ext, hold, ret };
};
/** the head's extension 0..1 at frame f */
const extAt = (t: ReturnType<typeof pistonTiming>, f: number) => {
  let d = 0;
  for (const P of t.pushes) {
    const u = f - P;
    if (u < 0 || u >= t.ext + t.hold + t.ret) continue;
    d = Math.max(d, u < t.ext ? u / t.ext : u < t.ext + t.hold ? 1 : 1 - (u - t.ext - t.hold) / t.ret);
  }
  return d;
};

type LineBlock = { id: string; born: number; idx0: number; moves: number[]; end: number; endKind: "fall" | "pop" | "mined" | null; crack: number; refill: boolean };
/** the line's blocks over the whole shot: who is where, when they form and leave */
const simulate = (s: PistonSpec) => {
  const t = pistonTiming(s), max = s.max ?? 12, id = s.line?.block ?? "cobblestone";
  const blocks: LineBlock[] = [];
  for (let i = 0; i < (s.line?.n ?? 1); i++) blocks.push({ id, born: -1e6, idx0: i, moves: [], end: 1e9, endKind: null, crack: 0, refill: false });
  const idxAt = (b: LineBlock, f: number) => b.idx0 + b.moves.filter((P) => P <= f).length;
  const alive = (b: LineBlock, f: number) => b.born <= f && b.end > f;
  type Ev = { f: number; kind: "push" | "refill" | "mine"; k?: number; crack?: number };
  const evs: Ev[] = [
    ...t.pushes.map((f) => ({ f, kind: "push" as const })),
    ...(s.refill ? t.pushes.map((P) => ({ f: P + t.ext + t.hold + t.ret + (s.refill!.delay ?? 1), kind: "refill" as const })) : []),
    ...(s.mine ?? []).map((m) => ({ f: m.f, kind: "mine" as const, k: m.k, crack: m.crack ?? 0 })),
  ].sort((a, b) => a.f - b.f || (a.kind === "mine" ? -1 : 0));
  for (const e of evs) {
    const live = blocks.filter((b) => alive(b, e.f));
    const at = (k: number) => live.find((b) => idxAt(b, e.f) === k);
    if (e.kind === "push") {
      // the contiguous run from the front cell moves one cell
      const run: LineBlock[] = [];
      for (let k = 0; k <= max; k++) { const b = at(k); if (!b) break; run.push(b); }
      run.forEach((b, k) => {
        b.moves.push(e.f);
        if (k + 1 >= max) { b.end = e.f + t.ext; b.endKind = s.drop ?? "fall"; }
      });
    } else if (e.kind === "refill") {
      if (!at(0)) blocks.push({ id: s.refill?.block ?? id, born: e.f, idx0: 0, moves: [], end: 1e9, endKind: null, crack: 0, refill: true });
    } else {
      const b = at(e.k ?? 0);
      if (b) { b.end = e.f; b.endKind = "mined"; b.crack = e.crack ?? 0; }
    }
  }
  return { t, blocks, max };
};
/** the line block's fractional index at f (moving with the head) */
const lineIdx = (b: LineBlock, t: ReturnType<typeof pistonTiming>, f: number) => b.idx0 + b.moves.reduce((n, P) => n + c01((f - P) / t.ext), 0);

/** "x,y,z" cells the pistons own (the piston cell and the line cells up to max): left out of the world mesh */
export const pistonKeys = (specs: PistonSpec[] | undefined): string[] => {
  const out: string[] = [];
  for (const s of specs ?? []) {
    const n = FACE_VEC[s.facing], max = s.max ?? 12;
    out.push(K(...s.at));
    for (let i = 1; i <= max; i++) out.push(K(...add(s.at, n, i)));
  }
  return out;
};

// ---------------------------------------------------------------- pistons layer
const CUBE = new THREE.BoxGeometry(1, 1, 1);
const hiss = (nodes: React.ReactNode[], key: string, top: V3, u: number, seed: number, fx: FxTex, scale = 1) => {
  if (u < 0 || u > 26) return;
  nodes.push(<SmokePuff key={`${key}a`} fx={fx} at={[top[0] - 0.15, top[1], top[2] + 0.1]} u={u} seed={seed} life={22} rise={1.2} size={0.95 * scale} color="#ffffff" opacity={0.9} />);
  for (let j = 0; j < 6; j++) {
    const a = u / 16;
    if (a < 0 || a >= 1) continue;
    const ang = (j / 6) * Math.PI * 2 + rnd(seed, j) * 0.7, r = 0.2 + (0.3 + 0.3 * rnd(seed, j + 9)) * (1 - (1 - a) ** 2);
    nodes.push(<SmokeSq key={`${key}q${j}`} fx={fx} k={a} size={(0.2 + 0.08 * rnd(seed, j + 20)) * scale} grey={0.92}
      at={[top[0] + Math.cos(ang) * r, top[1] - 0.1 + a * (0.8 + 0.5 * rnd(seed, j + 30)), top[2] + Math.sin(ang) * r]} />);
  }
};

const OnePiston: React.FC<{ s: PistonSpec; i: number; lw: LoadedWorld; worlds: WorldMap; fx: FxTex }> = ({ s, i, lw, worlds, fx }) => {
  const frame = useMcFrame();
  const sim = useMemo(() => simulate(s), [s]);
  const o = useMemo(() => ({ piston: part("piston", fx), base: part("base", fx), plate: part("plate", fx), arm: part("arm", fx) }), [fx]);
  const objs = useMemo(() => sim.blocks.map((b) => contactBlock(b.id, lw, worlds, fx)), [sim, lw, worlds, fx]);
  const n = FACE_VEC[s.facing], seed = 5100 + i * 71;
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  const pop = s.pop !== undefined ? popScale(frame - s.pop) : 1;
  if (pop > 0) nodes.push(<Faced key="p" at={s.at} facing={s.facing} scale={pop}><PistonParts d={extAt(sim.t, frame)} o={o} /></Faced>);
  if (s.pop !== undefined) dustPuff(motes, [s.at[0] + 0.5, s.at[1], s.at[2] + 0.5], frame - s.pop, seed);
  const g = 0.09;                                                 // the game's gravity, blocks per key frame squared
  sim.blocks.forEach((b, j) => {
    const blk = objs[j];
    if (!blk || frame < b.born) return;
    const idx = lineIdx(b, sim.t, Math.min(frame, b.end));
    let c = add(s.at, n, 1 + idx);                                // the block's cell corner (fractional along n)
    let sc = b.refill ? popScale(frame - b.born) : 1, rot = 0;
    if (frame >= b.end) {
      const u = frame - b.end;
      if (b.endKind === "fall" && u < 20) {
        // tips off the end: keeps drifting out a little, drops under gravity, turns a bit
        c = add(c, n, 0.05 * u);
        c = [c[0], c[1] - 0.5 * g * u * u, c[2]];
        rot = 0.05 * u * u * 0.1;
      } else {
        if (b.endKind !== "fall") breakMotes(motes, [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])], u, blk.color, 6, seed + j, Math.round(c[1]));
        return;
      }
    }
    const crack = b.endKind === "mined" && b.crack > 0 && frame >= b.end - b.crack ? Math.min(9, Math.floor(10 * c01((frame - (b.end - b.crack)) / b.crack))) : -1;
    const ct = crack >= 0 ? fx.tex[`block/destroy_stage_${crack}`] : undefined;
    nodes.push(
      <group key={`b${j}`} position={[c[0] + 0.5, c[1] + 0.5, c[2] + 0.5]} scale={sc} rotation={[n[2] * rot, 0, -n[0] * rot]}>
        <primitive object={blk.obj} position={[0, -0.5, 0]} />
        {ct && <mesh geometry={CUBE} material={crackMat(ct)} scale={1.002} renderOrder={6} />}
      </group>,
    );
    if (b.refill) {
      const u = frame - b.born, gk = 1 - c01(u / 8);
      if (gk > 0) nodes.push(
        <mesh key={`h${j}`} geometry={CUBE} position={[c[0] + 0.5, c[1] + 0.5, c[2] + 0.5]} scale={1.012 * sc} renderOrder={12}>
          <meshBasicMaterial color="#ff5000" transparent opacity={0.32 * gk * gk} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
      if (s.refill?.hiss !== false) hiss(nodes, `s${j}`, [c[0] + 0.5, c[1] + 1, c[2] + 0.5], u, seed + 7 * j, fx);
    }
  });
  return <>{nodes}<Motes motes={motes} /></>;
};

export const Pistons: React.FC<{ specs: PistonSpec[]; lw: LoadedWorld; worlds: WorldMap; fx: FxTex }> = ({ specs, lw, worlds, fx }) => (
  <>{specs.map((s, i) => <OnePiston key={i} s={s} i={i} lw={lw} worlds={worlds} fx={fx} />)}</>
);

// ---------------------------------------------------------------- redstone
const SIDES: { d: "n" | "s" | "e" | "w"; v: [number, number] }[] = [{ d: "n", v: [0, -1] }, { d: "s", v: [0, 1] }, { d: "e", v: [1, 0] }, { d: "w", v: [-1, 0] }];
const maskTex = new Map<string, THREE.Texture>();
/** one 16x16 texture per connection mask, composited from the game's pieces (white, tinted by the material) */
const dustTexture = (mask: string, fx: FxTex): THREE.Texture | null => {
  const hit = maskTex.get(mask);
  if (hit) return hit;
  const img = (k: string) => fx.tex[`block/redstone_dust_${k}`]?.image as HTMLImageElement | undefined;
  const dot = img("dot"), line = img("line0"), line1 = img("line1");
  if (!dot || !line || !line1) return null;
  const cv = document.createElement("canvas"); cv.width = cv.height = 16;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const has = (d: string) => mask.includes(d);
  const ns = has("n") || has("s"), ew = has("e") || has("w");
  /** the line piece along the n-s axis (rot 0) or e-w (rot 90): the half toward `half` ("a" = n / e, "b" = s / w, "" = whole) */
  const piece = (src: HTMLImageElement, rot: 0 | 90, half: "a" | "b" | "") => {
    g.save();
    if (rot) { g.translate(16, 0); g.rotate(Math.PI / 2); }
    if (half === "a") g.drawImage(src, 0, 0, 16, 8, 0, 0, 16, 8);
    else if (half === "b") g.drawImage(src, 0, 8, 16, 8, 0, 8, 16, 8);
    else g.drawImage(src, 0, 0);
    g.restore();
  };
  if (!ew) piece(line, 0, "");                                    // a straight run (or one end, or none): the game
  else if (!ns) piece(line1, 90, "");                             // draws the line right across the block
  else {
    g.drawImage(dot, 0, 0);
    if (has("n")) piece(line, 0, "a");
    if (has("s")) piece(line1, 0, "b");
    // rotated 90 deg clockwise: the texture's top half lands on the east side
    if (has("e")) piece(line, 90, "a");
    if (has("w")) piece(line1, 90, "b");
  }
  // the pieces are greyscale + alpha: make them white so the material colour is the dust colour
  const d = g.getImageData(0, 0, 16, 16);
  for (let i = 0; i < d.data.length; i += 4) { const l = d.data[i] / 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.round(255 * (0.55 + 0.45 * l)); d.data[i + 3] = d.data[i + 3] > 40 ? 255 : 0; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  maskTex.set(mask, t);
  return t;
};
/** the game's redstone wire colour at a power level (RedStoneWireBlock.getColorForPower) */
export const powerColor = (p: number) => {
  const f = p / 15, r = f * 0.6 + (f > 0 ? 0.4 : 0.3), g = Math.max(0, Math.min(1, f * f * 0.7 - 0.5)), b = Math.max(0, Math.min(1, f * f * 0.6 - 0.7));
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
};
/** lit 0..1 for parts that switch on at each of `ons` and stay on `lit` frames (1 f on, 2 f off) */
const litAt = (ons: number[], lit: number, f: number) => {
  let k = 0;
  for (const o of ons) { const u = f - o; if (u < 0 || u > lit + 2) continue; k = Math.max(k, u < 1 ? u : u < lit ? 1 : 1 - (u - lit) / 2); }
  return c01(k);
};

/** "x,y,z" cells the redstone owns (left out of the world mesh: a set's own repeaters are replaced by these) */
export const redstoneKeys = (specs: RedstoneSpec[] | undefined): string[] =>
  (specs ?? []).flatMap((s) => [...(s.dust ?? []).map((c) => K(c[0], c[1], c[2])), ...(s.repeaters ?? []).map((r) => K(...r.at))]);

const DUST_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const OneCircuit: React.FC<{ s: RedstoneSpec; i: number; pistons: PistonSpec[]; fx: FxTex }> = ({ s, i, pistons, fx }) => {
  const frame = useMcFrame();
  const seed = 7300 + i * 59;
  const plan = useMemo(() => {
    const dust = (s.dust ?? []).map((c) => [c[0], c[1], c[2]] as V3);
    const reps = s.repeaters ?? [];
    const dk = new Set(dust.map((c) => K(...c))), ck = new Set((s.connect ?? []).map((c) => K(c[0], c[1], c[2])));
    const repAt = new Map(reps.map((r) => [K(...r.at), r]));
    // connections: dust, `connect` cells, repeaters along their axis
    const masks = dust.map((c) => SIDES.filter(({ v }) => {
      const k = K(c[0] + v[0], c[1], c[2] + v[1]);
      if (dk.has(k) || ck.has(k)) return true;
      const r = repAt.get(k);
      if (!r) return false;
      const ax = r.dir === "east" || r.dir === "west" ? "x" : "z";
      return (ax === "x" && v[0] !== 0) || (ax === "z" && v[1] !== 0);
    }).map((x) => x.d).join(""));
    // power: 15 next to a repeater's output (or at the first dust), one less per dust step
    const pw = new Map<string, number>();
    const q: V3[] = [];
    for (const r of reps) { const o = add(r.at, FACE_VEC[r.dir]), k = K(...o); if (dk.has(k)) { pw.set(k, 15); q.push(o); } }
    if (!q.length && dust.length) { pw.set(K(...dust[0]), 15); q.push(dust[0]); }
    while (q.length) {
      const c = q.shift()!, p = pw.get(K(...c))!;
      for (const { v } of SIDES) { const nb: V3 = [c[0] + v[0], c[1], c[2] + v[1]], k = K(...nb); if (dk.has(k) && !pw.has(k)) { pw.set(k, Math.max(1, p - 1)); q.push(nb); } }
    }
    const power = dust.map((c) => pw.get(K(...c)) ?? 12);
    const mats = dust.map((_, j) => new THREE.MeshLambertMaterial({
      map: dustTexture(masks[j], fx), alphaTest: 0.5, emissive: new THREE.Color("#000000"), emissiveMap: dustTexture(masks[j], fx),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const repObjs = reps.map((r) => ({ off: repeaterObj(r.dir, r.delay ?? 1, false, fx), on: repeaterObj(r.dir, r.delay ?? 1, true, fx) }));
    // timing: the pulses, each repeater `step` frames after the one before, the last `lead` before the pulse
    const pulses = s.pulses ?? (s.piston !== undefined && pistons[s.piston] ? pistonTiming(pistons[s.piston]).pushes : []);
    const step = s.step ?? 2, lead = s.lead ?? 2;
    const gap = pulses.length > 1 ? Math.min(...pulses.slice(1).map((p, k) => p - pulses[k])) : 16;
    const lit = s.lit ?? Math.max(4, Math.floor(gap / 2));
    const repOn = reps.map((_, j) => pulses.map((P) => P - lead - step * (reps.length - 1 - j)));
    const dustOn = pulses.map((P) => P - lead + 1);
    return { dust, reps, masks, power, mats, repObjs, repOn, dustOn, lit };
  }, [s, pistons, fx]);
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  const popAt = (k: number) => (s.pop === undefined ? 1 : popScale(frame - s.pop - k));
  plan.reps.forEach((r, j) => {
    const sc = popAt(j);
    if (sc <= 0) return;
    const k = litAt(plan.repOn[j], plan.lit, frame), on = k >= 0.5;
    const o = on ? plan.repObjs[j].on : plan.repObjs[j].off;
    nodes.push(<group key={`r${j}`} position={[r.at[0] + 0.5, r.at[1], r.at[2] + 0.5]} scale={sc}><primitive object={o} /></group>);
    if (k > 0.01) {
      // the two torch tips glow (the game's lit torch texture plus a soft halo so it reads in a wide shot)
      const out = FACE_VEC[r.dir], dl = r.delay ?? 1;
      for (const zpx of [3, 7 + 2 * (dl - 1)]) {
        const off = (8 - zpx) / 16;                               // from the centre toward the output side
        nodes.push(
          <sprite key={`rg${j}:${zpx}`} position={[r.at[0] + 0.5 + out[0] * off, r.at[1] + 0.42, r.at[2] + 0.5 + out[2] * off]} scale={[0.34, 0.34, 1]} renderOrder={14}>
            <spriteMaterial map={haloTex()} color="#ff3a1a" transparent opacity={0.55 * k} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>,
        );
      }
    }
  });
  plan.dust.forEach((c, j) => {
    const sc = popAt(plan.reps.length + j);
    if (sc <= 0) return;
    const k = litAt(plan.dustOn, plan.lit, frame), p = plan.power[j] * k;
    const m = plan.mats[j];
    m.color.copy(powerColor(p));
    m.emissive.copy(powerColor(p)).multiplyScalar(0.55 * k);
    nodes.push(<mesh key={`d${j}`} geometry={DUST_GEO} material={m} position={[c[0] + 0.5, c[1] + 0.016, c[2] + 0.5]} scale={[sc, 1, sc]} renderOrder={3} />);
    // the game's redstone particles over powered wire: a few small red specks drifting up (whole key frames, seeded)
    if (k > 0.5) for (let b = Math.floor(frame) - 7; b <= Math.floor(frame); b++) {
      if (rnd(seed + j * 13, b) > 0.16) continue;
      const u = (frame - b) / 8;
      if (u < 0 || u >= 1) continue;
      motes.push({ p: [c[0] + 0.2 + 0.6 * rnd(seed + j, b + 1), c[1] + 0.08 + 0.35 * u, c[2] + 0.2 + 0.6 * rnd(seed + j, b + 2)], s: 0.045 * (1 - 0.5 * u), c: "#ff2a10" });
    }
  });
  return <>{nodes}<Motes motes={motes} lit={false} /></>;
};

export const Redstone: React.FC<{ specs: RedstoneSpec[]; pistons: PistonSpec[]; fx: FxTex }> = ({ specs, pistons, fx }) => (
  <>{specs.map((s, i) => <OneCircuit key={i} s={s} i={i} pistons={pistons} fx={fx} />)}</>
);

// ---------------------------------------------------------------- ghost piston (C10)
/** the floating parts a ghost piston comes apart into, as ghost item entries (McShort adds them to the items) */
export const ghostParts = (specs: GhostPistonSpec[] | undefined): ItemSpec[] => (specs ?? []).flatMap((s) => {
  if (s.apart === undefined) return [];
  const c: V3 = [s.at[0] + 0.5, s.at[1] + 0.35, s.at[2] + 0.5];
  const parts = s.parts ?? [{ item: "redstone" }, { item: "iron_ingot" }];
  // either side of the piston, across the view axis when it faces along z (and vice versa)
  const side: V3 = s.facing === "east" || s.facing === "west" ? [0, 0, 1] : [1, 0, 0];
  return parts.map((p, j) => ({
    item: p.item, ghost: true, f: p.f ?? s.apart! + 2 + 8 * j, from: c,
    land: p.to ?? add([c[0], s.at[1] + 1.3 + 0.15 * j, c[2]], side, j % 2 ? 0.75 : -0.75),
    until: s.fade ?? s.apart! + 60, size: 1.15,
    spin: p.spin ?? 0, yaw: p.yaw ?? 0,                    // named parts hover face-on (REQUESTS key-b__ghost-parts)
  }));
});

const GhostOne: React.FC<{ s: GhostPistonSpec; i: number; lw: LoadedWorld; worlds: WorldMap; fx: FxTex }> = ({ s, i, lw, worlds, fx }) => {
  const frame = useMcFrame();
  const g = useMemo(() => {
    const mk = (o: THREE.Object3D) => ghostOf(o, { sat: 0.12 });
    const blk = s.block === null ? null : contactBlock(s.block ?? "cobblestone", lw, worlds, fx);
    return {
      piston: mk(part("piston", fx)), base: mk(part("base", fx)), plate: mk(part("plate", fx)), arm: mk(part("arm", fx)),
      block: blk ? mk(blk.obj) : null,
    };
  }, [s, lw, worlds, fx]);
  const seed = 8800 + i * 31, op = s.opacity ?? 0.6, n = FACE_VEC[s.facing];
  const fin = smooth((frame - s.f0) / 6);
  const A = s.apart ?? 1e9, F = s.fade ?? A + 60;
  const d = s.push === undefined ? 0 : smooth((frame - s.push) / 3);
  const au = frame - A;                                           // coming apart: 0 .. 14
  const bodyOp = op * fin * (au < 0 ? 1 : 1 - smooth(au / 14));
  const nodes: React.ReactNode[] = [], motes: Mote[] = [];
  const set = (x: Ghost, v: number) => x.set(v);
  [g.piston, g.base, g.plate, g.arm].forEach((x) => set(x, 0));
  if (bodyOp > 0.003) {
    const rise = 0.15 * (1 - fin), sc = 0.85 + 0.15 * fin;
    const at: V3 = [s.at[0], s.at[1] + rise, s.at[2]];
    if (au < 0) {
      if (d <= 0.0005) { set(g.piston, bodyOp); nodes.push(<Faced key="gp" at={at} facing={s.facing} scale={sc}><primitive object={g.piston.obj} /></Faced>); }
      else {
        [g.base, g.plate, g.arm].forEach((x) => set(x, bodyOp));
        nodes.push(<Faced key="gp" at={at} facing={s.facing} scale={sc}><PistonParts d={d} o={{ piston: g.piston.obj, base: g.base.obj, plate: g.plate.obj, arm: g.arm.obj }} /></Faced>);
      }
    } else {
      // apart: the head floats out and up, the base sinks back, both turning a little, fading
      const k = smooth(au / 14);
      [g.base, g.plate, g.arm].forEach((x) => set(x, bodyOp));
      nodes.push(
        <Faced key="gb" at={at} facing={s.facing}>
          <group position={[0, -0.12 * k, 0.25 * k]} rotation={[0.25 * k, 0.2 * k, 0]}><primitive object={g.base.obj} /></group>
          <group position={[0, 0.35 * k, -d - 0.35 * k]} rotation={[-0.35 * k, -0.3 * k, 0.15 * k]}>
            <primitive object={g.plate.obj} />
            <group position={[0, 0, -0.25]} scale={[1, 1, 0.25 + 0.75 * d]}><group position={[0, 0, 0.25]}><primitive object={g.arm.obj} /></group></group>
          </group>
        </Faced>,
      );
      // a puff of pale squares where it came apart
      for (let j = 0; j < 10; j++) {
        const t = au / 16;
        if (t < 0 || t >= 1) continue;
        const ang = rnd(seed, j) * Math.PI * 2, r = 0.3 + 0.5 * rnd(seed, j + 5) * (1 - (1 - t) ** 2);
        motes.push({ p: [s.at[0] + 0.5 + Math.cos(ang) * r, s.at[1] + 0.4 + 0.6 * rnd(seed, j + 9) + 0.5 * t, s.at[2] + 0.5 + Math.sin(ang) * r], s: 0.07 * (1 - t), c: j % 3 ? "#e6ecf8" : "#c4d0ea" });
      }
    }
  }
  // the ghost block it pushed: slides one cell with the head, then floats where it is and fades at `fade`
  if (g.block) {
    const bop = op * fin * (1 - smooth((frame - F) / 12));
    g.block.set(bop);
    if (bop > 0.003 && s.push !== undefined) {
      const c = add(s.at, n, 1 + d);
      nodes.push(<group key="gk" position={[c[0] + 0.5, c[1], c[2] + 0.5]}><primitive object={g.block.obj} /></group>);
    }
  }
  return <>{nodes}<Motes motes={motes} lit={false} /></>;
};

export const GhostPistons: React.FC<{ specs: GhostPistonSpec[]; lw: LoadedWorld; worlds: WorldMap; fx: FxTex }> = ({ specs, lw, worlds, fx }) => (
  <>{specs.map((s, i) => <GhostOne key={i} s={s} i={i} lw={lw} worlds={worlds} fx={fx} />)}</>
);
