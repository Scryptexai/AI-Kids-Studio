// N5 explosions (a creeper's, or TNT's). The fuse (swell, white flashes) is a mob cue (direction.ts boomCue); on f:
//   - a white flash (direction.ts flashAt: 1 frame near-white, 1 frame half), a hot light dying over 8 f
//   - the game's explosion puffs: the explosion_0..15 sprite frames, grey-tinted like the game (0.4..1), big, spawned
//     over the first frames around the blast point, each playing its frames once
//   - debris: the destroyed cells break into chunks thrown away from the blast (Shatter), from the shot's set or from
//     `src` (the set before the blast, when the shot plays on the crater)
//   - grey smoke that hangs over the spot and clears over `smoke` frames
//   - no `cells`: a blast that breaks nothing (obsidian): flash, puffs, shake, a few dust motes falling
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { Motes, SmokePuff, type Mote, type WorldMap } from "./Build";
import { Shatter, type ShatterSpec } from "./Shatter";
import type { LoadedWorld } from "./VoxelWorld";
import type { FxTex } from "./fxTextures";

type V3 = [number, number, number];

export type BoomSpec = {
  /** the blast frame (< 0: it went off before the shot, which opens in its smoke) */
  f: number;
  /** the blast centre */
  at: V3;
  /** the creeper (mob id) that swells, flashes white and is gone at f */
  mob?: string;
  /** fuse frames before f (default 45, the game's 30 ticks) */
  fuse?: number;
  /** cells destroyed (thrown as debris); none = no damage */
  cells?: number[][];
  /** the set the destroyed blocks come from (default the shot's set) */
  src?: string;
  /** debris speed, blocks/s (default 7) */
  power?: number;
  /** white flash frames (default 2, 0 = none) */
  flash?: number;
  /** [amplitude, frames] of the damped shake (default [0.32, 10]); false = none */
  shake?: [number, number] | false;
  /** frames the smoke takes to clear (default 40) */
  smoke?: number;
  /** dust motes shaken loose (no-damage blast against a wall), count */
  dust?: number;
  /** blast radius scale (default 1) */
  size?: number;
};

const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const PUFFS = 20;
/** explosion sprite frames that are still solid discs (later ones are hollow rings) */
const SOLID = 5;
/** smoke greys (multiplied over the grey big_smoke sprite) */
const SMOKE = ["#8e8e8a", "#6f6f6b", "#a9a9a4"];

/** the boom's destroyed cells (left out of the shot's merged mesh; Shatter draws them until f) */
export const boomKeys = (specs: BoomSpec[] | undefined) => (specs ?? []).flatMap((b) => (b.cells ?? []).map((c) => `${c[0]},${c[1]},${c[2]}`));

const BoomOne: React.FC<{ lw: LoadedWorld; worlds: WorldMap; spec: BoomSpec; fx: FxTex; i: number }> = ({ lw, worlds, spec, fx, i }) => {
  const frame = useMcFrame();
  const u = frame - spec.f, S = spec.size ?? 1;
  const src = spec.src ? worlds[spec.src] ?? lw : lw;
  const shatter = useMemo<ShatterSpec | null>(() => (spec.cells?.length ? { f: spec.f, cells: spec.cells.map((c) => [c[0], c[1], c[2]] as V3), origin: spec.at, power: spec.power ?? 7, up: 4, split: 2, spin: 12, life: 22 } : null), [spec]);
  const puffs = useMemo(() => Array.from({ length: PUFFS }, (_, j) => {
    const s0 = i * 97 + j;
    // the first few right at the centre, the rest thrown out around it over the first 7 frames
    const r = j < 4 ? 0.3 : (0.9 + rnd(s0, 1) * 1.5) * S, a = rnd(s0, 2) * Math.PI * 2, e = (rnd(s0, 3) - 0.3) * 1.2;
    return {
      p: [spec.at[0] + Math.cos(a) * r, spec.at[1] + 0.4 + e * r * 0.7 + 0.3, spec.at[2] + Math.sin(a) * r] as V3,
      t0: j < 4 ? 0 : Math.floor(rnd(s0, 4) * 7), life: 8 + Math.floor(rnd(s0, 5) * 5),
      size: (1.4 + rnd(s0, 6) * 1.3) * S, grey: 0.32 + rnd(s0, 7) * 0.55,
    };
  }), [spec, i, S]);
  const mats = useMemo(() => puffs.map(() => new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false, fog: false })), [puffs]);
  const nodes: React.ReactNode[] = [];
  puffs.forEach((p, j) => {
    const a = u - p.t0;
    if (a < 0) return;
    // explosion_0..6 are the solid growing discs; 7..15 turn into hollow crescents that read as flat white rings on
    // screen, so each puff plays only the solid part (hot, then greying) and hands off to a rolling smoke cloud
    const pl = Math.max(3, Math.round(p.life * 0.42)), k = a / pl;
    if (a < pl) {
      const fr = Math.min(SOLID - 1, Math.floor(k * SOLID)), tex = fx.tex[`particle/explosion_${fr}`];
      const m = mats[j];
      if (m.map !== (tex ?? null)) { m.map = tex ?? null; m.needsUpdate = true; }
      // the game's grey tint per puff (flat, full bright), warm on the first frames, darkening as it cools
      // (capped below white and darkening fast, so a late disc never reads as a flat pale plate)
      const g = Math.min(0.62, p.grey) * (1 - 0.5 * k);
      m.color.setRGB(Math.min(1, g * (1 + 0.3 * (1 - k))), Math.min(1, g * (1 + 0.12 * (1 - k))), g * (1 - 0.1 * (1 - k)));
      m.opacity = k < 0.45 ? 1 : 1 - 0.75 * ((k - 0.45) / 0.55);
      nodes.push(<sprite key={`p${j}`} material={m} position={[p.p[0], p.p[1] + a * 0.02, p.p[2]]} scale={[p.size, p.size, 1]} renderOrder={22} />);
    }
    // the hand-off: a dark grey smoke cloud grows out of the disc (fades in under its last 3 frames), rises and thins
    const sl = 14 + Math.round(rnd(i * 97 + j, 8) * 12);
    if (a >= pl - 4 && a < pl - 4 + sl) {
      nodes.push(<SmokePuff key={`h${j}`} fx={fx} at={[p.p[0], p.p[1] + pl * 0.02 - 0.15, p.p[2]]} u={a - (pl - 4) + 2} life={sl} rise={0.5 + rnd(i * 97 + j, 9) * 0.6}
        size={p.size * 1.35} color={SMOKE[j % 3]} opacity={0.95} seed={i * 97 + j} />);
    }
  });
  // the smoke that hangs: grey puffs filling the spot over the first 10 f, rising slowly, clearing by `smoke` frames
  const smoke = spec.smoke ?? 40;
  for (let j = 0; j < 22; j++) {
    const s0 = i * 131 + j, t0 = 2 + Math.floor(rnd(s0, 1) * 8), life = smoke * (0.75 + 0.25 * rnd(s0, 2));
    const a = rnd(s0, 3) * Math.PI * 2, r = (0.2 + rnd(s0, 4) * 1.8) * S;
    nodes.push(<SmokePuff key={`s${j}`} fx={fx} at={[spec.at[0] + Math.cos(a) * r, spec.at[1] - 0.3 + rnd(s0, 5) * 1.4 * S, spec.at[2] + Math.sin(a) * r * 0.7]} u={u - t0} life={life} rise={0.9 + rnd(s0, 6) * 0.9} size={(2.4 + rnd(s0, 7) * 1.6) * S} color={j % 3 ? "#b6b6b2" : "#8e8e8a"} opacity={1} seed={s0} />);
  }
  // dust shaken loose (no-damage blast): pale grey motes falling off the face it hit
  const motes: Mote[] = [];
  if (spec.dust && u >= 0 && u < 30) for (let j = 0; j < spec.dust; j++) {
    const s0 = i * 53 + j, t = (u - rnd(s0, 1) * 6) / 30;
    if (t < 0) continue;
    const x = spec.at[0] + (rnd(s0, 2) - 0.5) * 3 * S, z = spec.at[2] + (rnd(s0, 3) - 0.5) * 1.2 * S;
    const y = spec.at[1] + 0.5 + rnd(s0, 4) * 2.2 * S + 0.6 * t - 0.5 * 6 * t * t;
    if (y < 0.03) continue;
    motes.push({ p: [x + Math.sin(t * 9 + j) * 0.05, y, z], s: (0.05 + 0.04 * rnd(s0, 5)) * (1 - u / 32), c: j % 2 ? "#cfcac0" : "#a7a29a", r: t * 4 });
  }
  const hot = u >= 0 && u < 8 ? Math.pow(1 - u / 8, 2) : 0;
  return (
    <>
      {shatter && <Shatter lw={src} spec={shatter} />}
      {nodes}
      <Motes motes={motes} lit />
      {hot > 0 && <pointLight position={[spec.at[0], spec.at[1] + 1, spec.at[2]]} color="#ffe2b8" intensity={40 * hot * S} distance={14 * S} decay={1.4} />}
    </>
  );
};

export const Booms: React.FC<{ lw: LoadedWorld; worlds: WorldMap; specs: BoomSpec[]; fx: FxTex }> = ({ lw, worlds, specs, fx }) => <>{specs.map((s, i) => <BoomOne key={i} lw={lw} worlds={worlds} spec={s} fx={fx} i={i} />)}</>;
