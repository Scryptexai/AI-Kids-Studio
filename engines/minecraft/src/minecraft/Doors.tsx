// N2 doors and buttons, drawn outside the merged world mesh (their cells are excluded) so they can move:
//   oak door   - each hit: a decaying wobble on the hinge, splinter motes, the crack overlay grows a stage (the game's
//                destroy_stage textures, blended 2*src*dst like the game); on `break` it bursts into planks + motes
//                that fly inward, land on the floor, rest and shrink away
//   iron door  - pops in (0.6 -> 1.08 -> 1.0, dust), swings open/closed on its hinge from [frame, 0..1] keys
//   button     - pops in; each press pushes it 1/16 into the wall (2 f in, held, 2 f out) with a white flash and a
//                white rim glow; `select` shows the game's black block-highlight outline so it reads on cobble
// A door's two halves are the set's own door blocks (from the shot's set, or another staged set), so it matches the
// world exactly when it is closed. Hinge: the end of the panel it turns about ("-x" = the panel's -x end).
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { keyed } from "./direction";
import type { LoadedWorld } from "./VoxelWorld";
import { Motes, POP_LEN, blockColor, breakMotes, dustPuff, popScale, protoOf, resolveBlock, type Mote, type WorldMap } from "./Build";
import type { FxTex } from "./fxTextures";

type V3 = [number, number, number];
type Axis = "-x" | "+x" | "-z" | "+z";

export type DoorSpec = {
  /** the lower half's cell (the upper half is the cell above) */
  at: V3;
  /** staged set the door blocks come from (default the shot's set) */
  set?: string;
  /** the panel end it turns about */
  hinge: Axis;
  /** the side the free end swings toward (default: into the cell, away from the face the panel sits on) */
  opens?: Axis;
  /** frame it pops in (absent: there from the start) */
  pop?: number;
  /** frames it is hit: a wobble, splinters, one more crack stage each */
  hits?: number[];
  /** crack stage (0-9) after each hit (default spread 2..8 over the hits) */
  stages?: number[];
  /** crack stage from the start (a door already damaged) */
  crack?: number;
  /** frame it breaks apart (planks and motes, gone) */
  break?: number;
  /** [frame, 0..1] open amount keys (eased between keys); 1 = swung 90 degrees */
  open?: [number, number][];
  /** degrees at open = 1 (default 90) */
  swing?: number;
};

export type ButtonSpec = {
  at: V3;
  set?: string;
  pop?: number;
  /** frames a finger presses it */
  press?: number[];
  /** frames it stays pressed (default 12) */
  hold?: number;
  /** [from, to] frames the black selection outline shows (the game's block highlight) */
  select?: [number, number];
  /** rim glow colour on press (default white) */
  flash?: string;
};

export const doorKeys = (specs: DoorSpec[] | undefined) => (specs ?? []).flatMap((d) => [d.at.join(","), [d.at[0], d.at[1] + 1, d.at[2]].join(",")]);
export const buttonKeys = (specs: ButtonSpec[] | undefined) => (specs ?? []).map((b) => b.at.join(","));

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const AX: Record<Axis, V3> = { "-x": [-1, 0, 0], "+x": [1, 0, 0], "-z": [0, 0, -1], "+z": [0, 0, 1] };

/** the mesh inside a block object (blockObject: a group holding one mesh offset to the cell corner) */
const meshOf = (g: THREE.Object3D) => g.children[0] as THREE.Mesh;
const boxOf = (g: THREE.Object3D) => { const geo = meshOf(g).geometry; geo.computeBoundingBox(); return geo.boundingBox!.clone(); };

/** crack overlay material: the game's destroy stage multiplied over what is under it (2 * src * dst) */
const crackMats = new WeakMap<THREE.Texture, THREE.Material>();
const crackMat = (tex: THREE.Texture) => {
  let m = crackMats.get(tex);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.1, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    crackMats.set(tex, m);
  }
  return m;
};

/** the black block-highlight outline (12 thin bars) around a box, in world coords */
const BAR = new THREE.BoxGeometry(1, 1, 1);
export const SelectBox: React.FC<{ min: V3; max: V3; w?: number; color?: string; opacity?: number; add?: boolean }> = ({ min, max, w = 0.006, color = "#000000", opacity = 0.6, add = false }) => {
  const e = 0.003, a = min.map((v) => v - e) as V3, b = max.map((v) => v + e) as V3;
  const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const bars: { p: V3; sc: V3 }[] = [];
  for (const i of [a[1], b[1]]) for (const j of [a[2], b[2]]) bars.push({ p: [c[0], i, j], sc: [s[0] + w, w, w] });
  for (const i of [a[0], b[0]]) for (const j of [a[2], b[2]]) bars.push({ p: [i, c[1], j], sc: [w, s[1] + w, w] });
  for (const i of [a[0], b[0]]) for (const j of [a[1], b[1]]) bars.push({ p: [i, j, c[2]], sc: [w, w, s[2] + w] });
  return (
    <>
      {bars.map((r, i) => (
        <mesh key={i} geometry={BAR} position={r.p} scale={r.sc} renderOrder={16}>
          <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} blending={add ? THREE.AdditiveBlending : THREE.NormalBlending} />
        </mesh>
      ))}
    </>
  );
};

/** a door on its hinge */
export const Door: React.FC<{ lw: LoadedWorld; worlds: WorldMap; spec: DoorSpec; fx: FxTex }> = ({ lw, worlds, spec, fx }) => {
  const frame = useMcFrame();
  const [x, y, z] = spec.at;
  const parts = useMemo(() => {
    const src = spec.set ?? "base";
    const lo = resolveBlock(src, `${x},${y},${z}`, lw, worlds), hi = resolveBlock(src, `${x},${y + 1},${z}`, lw, worlds);
    if (!lo) return null;
    const lower = protoOf(lo.b, lo.w, lw).clone(), upper = hi ? protoOf(hi.b, hi.w, lw).clone() : null;
    // bounds of the panel in cell space (lower cell 0..1)
    const box = boxOf(lower);
    if (upper) box.union(boxOf(upper).translate(new THREE.Vector3(0, 1, 0)));
    const color = blockColor(lo.b, lo.w);
    return { lower, upper, box, color, geoLo: meshOf(lower).geometry, geoHi: upper ? meshOf(upper).geometry : null };
  }, [spec.set, x, y, z, lw, worlds]);
  if (!parts) return null;
  const { box, color } = parts;
  // panel axis = its long horizontal side; the hinge sits at one end of it, centred in the thickness
  const alongX = box.max.x - box.min.x >= box.max.z - box.min.z;
  const th = alongX ? box.max.z - box.min.z : box.max.x - box.min.x;
  const hv = AX[spec.hinge];
  const midT = alongX ? (box.min.z + box.max.z) / 2 : (box.min.x + box.max.x) / 2;
  const px = alongX ? (hv[0] < 0 ? box.min.x + th / 2 : box.max.x - th / 2) : midT;
  const pz = alongX ? midT : (hv[2] < 0 ? box.min.z + th / 2 : box.max.z - th / 2);
  const pivot: V3 = [x + px, y, z + pz];
  // which way it swings: the free end (opposite the hinge) turns toward `opens`
  const opens = spec.opens ? AX[spec.opens] : alongX ? [0, 0, midT < 0.5 ? 1 : -1] : [midT < 0.5 ? 1 : -1, 0, 0];
  const free = [-hv[0], 0, -hv[2]];
  // rotating `free` about +y by +90 degrees gives (free.z, 0, -free.x)
  const sign = free[2] * opens[0] - free[0] * opens[2] > 0 ? 1 : -1;
  const maxA = ((spec.swing ?? 90) * Math.PI) / 180;
  let ang = sign * maxA * keyed(spec.open, frame, 0);
  // hits: a decaying wobble on the hinge (about 4 degrees), pushed inward first
  const hits = spec.hits ?? [];
  for (const h of hits) { const u = frame - h; if (u >= 0 && u < 14) ang += sign * ((4 * Math.PI) / 180) * Math.sin(u * 1.5 + 0.4) * Math.exp(-u / 3.5); }
  const stages = spec.stages ?? hits.map((_, i) => Math.round(2 + (6 * (i + 1)) / Math.max(1, hits.length)));
  let stage = spec.crack ?? -1;
  hits.forEach((h, i) => { if (frame >= h) stage = Math.max(stage, stages[i] ?? 9); });
  const broken = spec.break !== undefined && frame >= spec.break;
  const popped = spec.pop === undefined ? 1 : popScale(frame - spec.pop);
  const motes: Mote[] = [];
  const nodes: React.ReactNode[] = [];
  const centre: V3 = [x + (box.min.x + box.max.x) / 2, y + 1, z + (box.min.z + box.max.z) / 2];
  const face: V3 = [centre[0] - opens[0] * th, centre[1], centre[2] - opens[2] * th]; // the outer face: hits land here
  hits.forEach((h, i) => {
    const u = frame - h;
    if (u < 0 || u > 14) return;
    breakMotes(motes, [face[0] - 0.5, face[1] - 0.5 + (rnd(i, 3) - 0.5) * 0.6, face[2] - 0.5], u, color, 5, 4000 + i * 13 + x * 7, y);
  });
  if (!broken && popped > 0) {
    const crackTex = stage >= 0 ? fx.tex[`block/destroy_stage_${Math.min(9, stage)}`] : undefined;
    const half = (obj: THREE.Object3D, geo: THREE.BufferGeometry | null, dy: number, k: string) => (
      <group key={k} position={[x + 0.5 - pivot[0], y + dy - pivot[1], z + 0.5 - pivot[2]]}>
        <primitive object={obj} />
        {crackTex && geo && <mesh geometry={geo} material={crackMat(crackTex)} position={[-0.5, 0, -0.5]} renderOrder={6} />}
      </group>
    );
    nodes.push(
      <group key="door" position={centre} scale={popped}>
        <group position={[pivot[0] - centre[0], pivot[1] - centre[1], pivot[2] - centre[2]]} rotation={[0, ang, 0]}>
          {half(parts.lower, parts.geoLo, 0, "lo")}
          {parts.upper && half(parts.upper, parts.geoHi, 1, "hi")}
        </group>
      </group>,
    );
  }
  if (spec.pop !== undefined) dustPuff(motes, [x, y, z], frame - spec.pop, 900 + x, 8);
  // the break: planks fly inward, bounce once on the floor, rest, shrink away; motes burst out of both halves
  if (spec.break !== undefined) {
    const u = frame - spec.break;
    if (u >= 0) {
      breakMotes(motes, [face[0] - 0.5, y, face[2] - 0.5], u, color, 8, 5100, y);
      breakMotes(motes, [face[0] - 0.5, y + 1, face[2] - 0.5], u, color, 8, 5200, y);
      for (let i = 0; i < 6; i++) {
        const t = u / 30, s0 = 6000 + i;
        const along = alongX ? [1, 0, 0] : [0, 0, 1];
        const off = (rnd(s0, 1) - 0.5) * 0.8, sp = 1.6 + rnd(s0, 2) * 1.6, side = (rnd(s0, 3) - 0.5) * 1.2, up = 1.2 + rnd(s0, 4) * 1.6;
        const y0 = y + 0.25 + (i / 6) * 1.5;
        // a bounce: first flight lands at t1, a small hop, then rests
        const t1 = (up + Math.sqrt(up * up + 2 * 16 * (y0 - y - 0.03))) / 16;
        let py: number, tt = t;
        if (t < t1) py = y0 + up * t - 8 * t * t;
        else { const v2 = up * 0.25, t2 = t - t1, tb = (2 * v2) / 16; py = y + 0.03 + (t2 < tb ? v2 * t2 - 8 * t2 * t2 : 0); tt = t1 + Math.min(t2, tb) * 0.4; }
        const px2 = face[0] + opens[0] * sp * tt + along[0] * (off + side * tt), pz2 = face[2] + opens[2] * sp * tt + along[2] * (off + side * tt);
        const fade = u > 34 ? 1 - c01((u - 34) / 10) : 1;
        if (fade <= 0) continue;
        const spin = Math.min(t, t1) * (6 + 6 * rnd(s0, 5));
        nodes.push(
          <mesh key={`pl${i}`} position={[px2, py + 0.03, pz2]} rotation={[t < t1 ? spin : 0, rnd(s0, 6) * 3 + (t < t1 ? spin * 0.5 : 0), t < t1 ? spin * 0.3 : 0]} scale={fade} castShadow>
            <boxGeometry args={[0.42 - 0.12 * rnd(s0, 7), 0.06, 0.14]} />
            <meshLambertMaterial color={color} />
          </mesh>,
        );
      }
    }
  }
  return <>{nodes}<Motes motes={motes} /></>;
};

/** a stone button on a wall */
export const Button: React.FC<{ lw: LoadedWorld; worlds: WorldMap; spec: ButtonSpec }> = ({ lw, worlds, spec }) => {
  const frame = useMcFrame();
  const [x, y, z] = spec.at;
  const parts = useMemo(() => {
    const r = resolveBlock(spec.set ?? "base", `${x},${y},${z}`, lw, worlds);
    if (!r) return null;
    const obj = protoOf(r.b, r.w, lw).clone(true);
    // its own materials (the press flash lights them)
    const mesh = meshOf(obj);
    mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
    const box = boxOf(obj);
    // the thin axis is the press axis; it presses toward the cell face it is mounted on
    const size = box.getSize(new THREE.Vector3()), axis = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
    const lo = box.min.getComponent(axis), hi = box.max.getComponent(axis);
    const dir: V3 = [0, 0, 0]; dir[axis] = 1 - hi < lo ? 1 : -1;
    return { obj, mesh, box, dir };
  }, [spec.set, x, y, z, lw, worlds]);
  if (!parts) return null;
  const { obj, mesh, box, dir } = parts;
  // press: 2 f in, held, 2 f out
  const hold = spec.hold ?? 12;
  let push = 0, flash = 0;
  for (const p of spec.press ?? []) {
    const u = frame - p;
    if (u < 0 || u > hold + 4) continue;
    push = Math.max(push, u < 2 ? smooth(u / 2) : u <= hold + 2 ? 1 : 1 - smooth((u - hold - 2) / 2));
    flash = Math.max(flash, u < 1 ? 1 : 1 - c01((u - 1) / 8));
  }
  for (const m of mesh.material as THREE.MeshLambertMaterial[]) { m.emissive.set("#ffffff"); m.emissiveIntensity = 0.55 * flash; if (!m.emissiveMap) m.emissiveMap = m.map; }
  const d = push / 16;
  const popped = spec.pop === undefined ? 1 : popScale(frame - spec.pop);
  if (popped <= 0) return null;
  const c: V3 = [x + (box.min.x + box.max.x) / 2, y + (box.min.y + box.max.y) / 2, z + (box.min.z + box.max.z) / 2];
  const min: V3 = [x + box.min.x + dir[0] * d, y + box.min.y + dir[1] * d, z + box.min.z + dir[2] * d];
  const max: V3 = [x + box.max.x + dir[0] * d, y + box.max.y + dir[1] * d, z + box.max.z + dir[2] * d];
  const sel = spec.select && frame >= spec.select[0] && frame <= spec.select[1];
  const motes: Mote[] = [];
  if (spec.pop !== undefined && frame - spec.pop < POP_LEN + 10) dustPuff(motes, [c[0] - 0.5, c[1] - 0.25, c[2] - 0.5], frame - spec.pop, 700 + x, 5);
  return (
    <>
      <group position={c} scale={popped}>
        <primitive object={obj} position={[x + 0.5 - c[0] + dir[0] * d, y - c[1] + dir[1] * d, z + 0.5 - c[2] + dir[2] * d]} />
      </group>
      {sel && popped >= 1 && <SelectBox min={min} max={max} w={0.008} opacity={0.75} />}
      {flash > 0.02 && <SelectBox min={min} max={max} w={0.012} color={spec.flash ?? "#ffffff"} opacity={0.9 * flash} add />}
      <Motes motes={motes} />
    </>
  );
};

export const Doors: React.FC<{ lw: LoadedWorld; worlds: WorldMap; specs: DoorSpec[]; fx: FxTex }> = ({ lw, worlds, specs, fx }) => <>{specs.map((s, i) => <Door key={i} lw={lw} worlds={worlds} spec={s} fx={fx} />)}</>;
export const Buttons: React.FC<{ lw: LoadedWorld; worlds: WorldMap; specs: ButtonSpec[] }> = ({ lw, worlds, specs }) => <>{specs.map((s, i) => <Button key={i} lw={lw} worlds={worlds} spec={s} />)}</>;
