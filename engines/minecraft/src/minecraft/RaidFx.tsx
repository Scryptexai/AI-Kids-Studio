// mc-raid Wave A fx (spec types: types.ts "Wave A (mc-raid)"; README: projects/mc-raid/FX.md "Wave A: fx").
//   HUD (DOM over the picture, so it keeps its colour through the imagined look): the game's boss bar "Raid" (slam in,
//   fill / drain / refill, pulse), the Bad Omen / Raid Omen icon over an actor's head (stamp, flip, fly into the bar)
//   and the red line from the bar to an actor.
//   Scene: the village bell (swing + ring waves), arrows (streak, stuck with the vanilla quiver, hits, lens whip),
//   crash / roar shockwaves (rings; the breaks go through Build's wave), the village boundary (trace, pulse, shrink),
//   vex face rings, the standing ominous banner (gentle flap).
//   Pure helpers for McShort: the raid sky tint, shock waves -> WaveSpec, arrow hits -> hurt acts, farm flow paths,
//   the imagined look's amounts, cells to hide (bells, banners).
// Everything is a pure function of the key frame (30 fps keys, fractional at 60 fps).
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { useMcFrame } from "./mcTime";
import { cubeQuads, splitQuads, type Quad } from "./mobs/cube";
import { EASE, keyed, type V3 } from "./direction";
import { blockAt, protoOf, type WaveSpec } from "./Build";
import type { LightOverride, LoadedWorld } from "./VoxelWorld";
import type { Act } from "./mobs/acts";
import { softDot } from "./fxCommon";
import { BANNER_TEX, ominousFlagTexture, selfLit } from "./ominousBanner";
import type { ArrowSpec, BannerSpec, BellSpec, BoundsSpec, FaceRingSpec, FlowKey, OmenSpec, RaidFxDir, RaidLinkSpec, ShockSpec } from "./types";

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const sm = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const bump = (f: number, a: number, b: number) => (f < a || f > b ? 0 : Math.sin(((f - a) / (b - a)) * Math.PI));
const W = 1080, H = 1920;

// ------------------------------------------------------------------ textures (vanilla PNGs staged by scripts/mc_fx_textures.py)
export const RAID_TEX_ROOT = "mc-preview/_fx/raid";
/** every manifest texture the raid fx use */
export const RAID_TEX = ["entity/projectiles/arrow", "entity/bell/bell_body", "block/dark_oak_planks", "block/stone", ...BANNER_TEX];
export type RaidTex = { tex: Record<string, THREE.Texture>; img: Record<string, HTMLImageElement> };
export const NO_RAID: RaidTex = { tex: {}, img: {} };

/** loads the staged raid textures once per composition (outside the canvases); off (no fetch) when `on` is false.
 *  A missing folder is not an error: the bell / arrows / banner then draw without textures. */
export const useRaidTextures = (on: boolean, root = RAID_TEX_ROOT): RaidTex => {
  const [handle] = useState(() => (on ? delayRender(`mc raid textures ${root}`, { timeoutInMilliseconds: 60000 }) : null));
  const [rt, setRt] = useState<RaidTex | null>(on ? null : NO_RAID);
  useEffect(() => {
    if (handle === null) return;
    let live = true;
    (async () => {
      let out = NO_RAID;
      try {
        const r = await fetch(staticFile(`${root}/index.json`));
        if (r.ok) {
          const index = (await r.json()) as { textures: Record<string, { file: string }> };
          const tex: RaidTex["tex"] = {}, img: RaidTex["img"] = {};
          await Promise.all(Object.entries(index.textures).map(async ([k, t]) => {
            const im = new Image(); im.src = staticFile(`${root}/${t.file}`);
            await im.decode();
            const x = new THREE.Texture(im);
            x.magFilter = THREE.NearestFilter; x.minFilter = THREE.NearestFilter; x.generateMipmaps = false; x.colorSpace = THREE.SRGBColorSpace; x.needsUpdate = true;
            tex[k] = x; img[k] = im;
          }));
          out = { tex, img };
        }
      } catch (e) { console.error("MCRAID|", e); }
      if (!live) return;
      setRt(out);
      continueRender(handle);
    })();
    return () => { live = false; };
  }, [root, handle]);
  return rt ?? NO_RAID;
};
/** does any shot of a direction use the raid fx */
export const usesRaidFx = (shots: Record<string, RaidFxDir> | undefined) =>
  Object.values(shots ?? {}).some((d) => d.bells?.length || d.arrows?.length || d.banners?.length);

// ------------------------------------------------------------------ camera pose -> picture (for the DOM HUD)
export type Pose = { pos: V3; look: V3; fov: number };
const projCam = new THREE.PerspectiveCamera(50, W / H, 0.05, 400);
const pv = new THREE.Vector3(), fwdV = new THREE.Vector3();
/** a world point in picture pixels (1080x1920) and its depth in front of the lens (<= 0: behind) */
export const project = (pose: Pose, p: V3) => {
  projCam.position.set(...pose.pos); projCam.fov = pose.fov; projCam.up.set(0, 1, 0);
  projCam.lookAt(new THREE.Vector3(...pose.look)); projCam.updateMatrixWorld(); projCam.updateProjectionMatrix();
  projCam.getWorldDirection(fwdV);
  pv.set(...p);
  const depth = pv.clone().sub(projCam.position).dot(fwdV);
  pv.project(projCam);
  return { x: ((pv.x + 1) / 2) * W, y: ((1 - pv.y) / 2) * H, depth };
};

// ------------------------------------------------------------------ pure helpers for McShort
/** the red-violet raid look (blended over the set's sky preset by the raidSky keys) */
export const RAID_LOOK = { sky: "#a65a86", fog: "#c09aaa", hemiSky: "#ffe0e4", hemiGround: "#94786a", hemi: 2.1, sun: "#ffc8b0", sunI: 1.8 };
/** this frame's raid sky as a VoxelWorld light override (undefined = none) */
export const raidLight = (d: RaidFxDir | undefined, f: number): LightOverride | undefined => {
  if (!d?.raidSky?.length) return undefined;
  const k = keyed(d.raidSky, f, 0);
  return k > 0.001 ? { to: RAID_LOOK, k } : undefined;
};
/** the cells the raid fx draw themselves (hidden from the merged world mesh): bells and banners */
export const raidKeys = (d: RaidFxDir | undefined) => [...(d?.bells ?? []).map((b) => b.at.join(",")), ...(d?.banners ?? []).map((b) => b.at.join(",")),
  ...(d?.imagine?.keepCells ?? []).map((c) => c.slice(0, 3).join(","))];
/** shockwave breaks as one Build wave: each cell breaks into motes when the ring reaches it (base -> air) */
export const shockWaves = (d: RaidFxDir | undefined): WaveSpec[] => (d?.shocks ?? []).filter((s) => s.cells?.length).map((s) => ({
  cells: s.cells!.map((c) => [c[0], c[1], c[2], s.f + Math.round(Math.hypot(c[0] + 0.5 - s.at[0], c[2] + 0.5 - s.at[2]) / (s.speed ?? 0.7))]),
  from: "base", to: "air", motes: s.motes ?? 6, dust: false,
}));
/** arrow hits as hurt acts per mob id (red flash, recoil, knockback hop from the shooter) */
export const arrowActs = (d: RaidFxDir | undefined): Record<string, Act[]> => {
  const out: Record<string, Act[]> = {};
  for (const a of d?.arrows ?? []) if (a.hit) (out[a.hit] ??= []).push({ f: a.f + (a.n ?? 6), kind: "hurt", target: a.from, dist: a.dist ?? 0.35 } as Act);
  return out;
};
/** the imagined look this frame: amount, ghost, and one kept actor's colour (0..1) */
export const imagineAt = (d: RaidFxDir | undefined, f: number) => {
  const im = d?.imagine;
  if (!im) return null;
  return { k: c01(keyed(im.keys, f, 0)), ghost: c01(keyed(im.ghost, f, 0)) };
};
export const keepAt = (d: RaidFxDir | undefined, id: string, f: number) => c01(keyed(d?.imagine?.keepKeys?.[id], f, 1));

/** R13 a mob on a flow path this frame: position, facing, legs moving, and the segment's mode */
export const flowAt = (keys: FlowKey[] | undefined, f: number, seed = 0) => {
  if (!keys?.length) return null;
  const n = keys.length;
  let i = 1;
  while (i < n && f >= keys[i].f) i++;
  const P = (j: number) => keys[Math.max(0, Math.min(n - 1, j))].at;
  const yawOf = (a: V3, b: V3) => (Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.05 ? null : (Math.atan2(-(b[0] - a[0]), b[2] - a[2]) * 180) / Math.PI);
  // the facing of segment j (ending at key j): its own facing, else its direction, else the one before
  const segYaw = (j: number): number => {
    if (j <= 0) return keys[0].facing ?? yawOf(P(0), P(1)) ?? 0;
    return keys[j].facing ?? yawOf(P(j - 1), P(j)) ?? segYaw(j - 1);
  };
  if (f <= keys[0].f || i >= n) {
    const k = f <= keys[0].f ? keys[0] : keys[n - 1];
    const bob = k.mode === "swim" || k.mode === "float" ? 0.05 * Math.sin(f / 5 + seed) : 0;
    return { at: [k.at[0], k.at[1] + bob, k.at[2]] as V3, facing: segYaw(f <= keys[0].f ? 0 : n - 1), walk: false, mode: k.mode ?? "walk" };
  }
  const a = keys[i - 1], b = keys[i], mode = b.mode ?? "swim";
  const t = c01((f - a.f) / Math.max(1e-6, b.f - a.f));
  let at: V3;
  if (mode === "fall") {
    // gravity from rest: horizontal drift eased out, the drop slow then fast
    const h = EASE.cubicOut(t);
    at = [lerp(a.at[0], b.at[0], h), lerp(a.at[1], b.at[1], t * t), lerp(a.at[2], b.at[2], h)];
  } else {
    // centripetal-ish Catmull-Rom through the neighbours (a fall next door is not a neighbour: it would bend the curve)
    const p0 = keys[i - 2] && (keys[i - 1].mode ?? "swim") !== "fall" ? P(i - 2) : a.at, p3 = keys[i + 1] && (keys[i + 1].mode ?? "swim") !== "fall" ? P(i + 1) : b.at;
    const t2 = t * t, t3 = t2 * t;
    at = [0, 1, 2].map((j) => 0.5 * (2 * a.at[j] + (-p0[j] + b.at[j]) * t + (2 * p0[j] - 5 * a.at[j] + 4 * b.at[j] - p3[j]) * t2 + (-p0[j] + 3 * a.at[j] - 3 * b.at[j] + p3[j]) * t3)) as V3;
    if (mode === "swim" || mode === "float") at[1] += 0.05 * Math.sin(f / 5 + seed);
  }
  // facing eases into each segment's direction over its first 4 frames
  const fa = segYaw(i - 1), fb = segYaw(i);
  let dy = ((fb - fa + 540) % 360) - 180;
  if (!Number.isFinite(dy)) dy = 0;
  const facing = fa + dy * sm((f - a.f) / 4);
  return { at, facing, walk: mode === "walk" || mode === "swim", mode };
};

// ------------------------------------------------------------------ HUD: boss bar, omen icons, red line (DOM)
const S = 3.5, BW = 182, BAR_CX = 0.44 * W, BAR_TOP = 207;
const BAR_LEFT = BAR_CX - (BW * S) / 2;
/** the bar's rows (top to bottom): progress (red_progress) and background (red_background), our redraw */
const PROG = ["#ff7a7a", "#f03434", "#e21f1f", "#c81616", "#8c0b0b"];
const BACK = ["#7a2020", "#511010", "#470d0d", "#3e0b0b", "#280606"];
/** the game font's glyphs for the bar title (5x7, lower case sits on the baseline) */
const GL: Record<string, string[]> = {
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"], V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"], i: ["1", "0", "1", "1", "1", "1", "1"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"], c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  t: ["010", "010", "111", "010", "010", "010", "001"], o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"], y: ["00000", "00000", "10001", "10001", "01111", "00001", "11110"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"], "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};
const labelPixels = (text: string) => {
  const px: [number, number][] = [];
  let x = 0;
  for (const ch of text) {
    const g = GL[ch] ?? GL[" "];
    g.forEach((row, y) => [...row].forEach((b, gx) => { if (b === "1") px.push([x + gx, y]); }));
    x += g[0].length + 1;
  }
  return { px, w: Math.max(0, x - 1) };
};

/** the boss bar this frame (null = not shown) */
const barState = (d: RaidFxDir, f: number) => {
  const b = d.raidBar!;
  if (b.in !== undefined && f < b.in) return null;
  if (b.out !== undefined && f >= b.out + 8) return null;
  const u = b.in !== undefined ? (f - b.in) / 7 : 1;
  const land = c01(u);
  // slam: drops from above, swells then settles (overshoot), a white hit the frames it lands
  const dy = -120 * (1 - EASE.backOut(land)), sc = 1 + 0.22 * (1 - EASE.cubicOut(land));
  const hit = b.in !== undefined ? Math.max(0, 1 - Math.abs(f - b.in - 5) / 3) : 0;
  const jolt = b.in !== undefined && f >= b.in + 5 && f < b.in + 13 ? Math.sin((f - b.in) * 2.7) * 4 * (1 - (f - b.in - 5) / 8) : 0;
  let pulse = 0;
  for (const p of b.pulse ?? []) pulse = Math.max(pulse, f >= p && f < p + 12 ? (f < p + 2 ? (f - p) / 2 : Math.pow(1 - (f - p - 2) / 10, 1.6)) : 0);
  const fade = b.out !== undefined ? 1 - c01((f - b.out) / 8) : 1;
  return { dy: dy - (b.out !== undefined ? 30 * (1 - fade) : 0), sc: sc + 0.05 * pulse, op: c01(u * 3) * fade, hit, jolt, pulse, fill: c01(keyed(b.fill, f, 1)), label: b.label ?? "Raid" };
};

const BossBar: React.FC<{ d: RaidFxDir; f: number }> = ({ d, f }) => {
  const s = barState(d, f);
  const lab = useMemo(() => labelPixels(d.raidBar?.label ?? "Raid"), [d.raidBar?.label]);
  if (!s) return null;
  const P = Math.round(BW * s.fill), lx = Math.round((BW - lab.w) / 2);
  const notch = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => Math.round((i * BW) / 10));
  return (
    <div style={{ position: "absolute", left: BAR_LEFT + s.jolt, top: BAR_TOP - 9 * S + s.dy, width: BW * S, height: 14 * S, opacity: s.op, transform: `scale(${s.sc})`, transformOrigin: "50% 75%",
      filter: s.pulse > 0.01 ? `drop-shadow(0 0 ${18 * s.pulse}px rgba(255,40,40,${0.95 * s.pulse})) brightness(${1 + 0.45 * s.pulse})` : undefined }}>
      <svg width={BW * S} height={14 * S} viewBox={`0 0 ${BW} 14`} shapeRendering="crispEdges" style={{ display: "block", overflow: "visible" }}>
        {/* the title: white with the game's drop shadow (one pixel down-right, a quarter as bright) */}
        {lab.px.map(([x, y], i) => <rect key={`s${i}`} x={lx + x + 1} y={y + 1} width={1} height={1} fill="#3f3f3f" />)}
        {lab.px.map(([x, y], i) => <rect key={`t${i}`} x={lx + x} y={y} width={1} height={1} fill="#ffffff" />)}
        {BACK.map((c, r) => <rect key={`b${r}`} x={0} y={9 + r} width={BW} height={1} fill={c} />)}
        {P > 0 && PROG.map((c, r) => <rect key={`p${r}`} x={0} y={9 + r} width={P} height={1} fill={c} />)}
        {notch.map((x) => <rect key={`n${x}`} x={x} y={10} width={1} height={3} fill={x < P ? "#7d0a0a" : "#1e0303"} />)}
        {/* square ends a shade darker, like the sprite's edge */}
        <rect x={0} y={9} width={1} height={5} fill="#000" opacity={0.35} /><rect x={BW - 1} y={9} width={1} height={5} fill="#000" opacity={0.35} />
        {s.hit > 0 && <rect x={0} y={9} width={BW} height={5} fill="#ffffff" opacity={0.85 * s.hit} />}
      </svg>
    </div>
  );
};

// the icons, 16x16, redrawn in the vanilla style (the Bad Omen effect icon is not in the 26.4 pack)
const BAD = [
  "................",
  "..oooooooooooo..",
  "..obbbbbbbbbbo..",
  "..ohsssssssssdo.",
  "..ohsssssssssdo.",
  "..obbbbbbbbbbbo.",
  "..oswgssssgwsdo.",
  "..osssnNsssssdo.",
  "..odssnNsssssdo.",
  "..odssnNssssddo.",
  "..odsssNssssddo.",
  "..oddsmmmmsdddo.",
  "..odddssssddddo.",
  "..oooooooooooooo",
  "................",
  "................",
].map((r) => r.slice(0, 16));
const BAD_PAL: Record<string, string> = { o: "#1d1a1a", b: "#2b2626", h: "#b9bfba", s: "#9ba29e", d: "#747c79", w: "#ecebe2", g: "#2f8a3e", n: "#8b928e", N: "#666d6a", m: "#4e3434" };
/** Raid Omen: the game's 5x5 raid_omen particle at 3x, each pixel shaded (lit top-left), a dark rim down-right */
const RAID_OMEN_SRC = [".LLL.", "LLLDD", "L.D.D", ".LDD.", ".D.D."];
const iconPixels = (kind: "bad" | "raid") => {
  const out: { x: number; y: number; c: string }[] = [];
  if (kind === "bad") {
    BAD.forEach((row, y) => [...row].forEach((ch, x) => { if (BAD_PAL[ch]) out.push({ x, y, c: BAD_PAL[ch] }); }));
    return out;
  }
  const on = (x: number, y: number) => RAID_OMEN_SRC[y]?.[x] !== undefined && RAID_OMEN_SRC[y][x] !== ".";
  RAID_OMEN_SRC.forEach((row, py) => [...row].forEach((ch, px) => {
    if (ch === ".") return;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const lit = i === 0 && j === 0 && !on(px - 1, py) && !on(px, py - 1);
      const c = ch === "L" ? (lit || (j === 0 && !on(px, py - 1)) ? "#f27c90" : "#de4058") : (j === 2 && !on(px, py + 1) ? "#8f1f33" : "#b82d43");
      out.push({ x: 1 + px * 3 + i, y: 1 + py * 3 + j, c });
    }
  }));
  // a dark rim one pixel down-right of the shape (reads on a bright sky)
  const has = new Set(out.map((p) => `${p.x},${p.y}`));
  for (const p of [...out]) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) { const k = `${p.x + dx},${p.y + dy}`; if (!has.has(k)) { has.add(k); out.push({ x: p.x + dx, y: p.y + dy, c: dx + dy > 0 ? "#3a0a14" : "#5a1020" }); } }
  return out;
};
const ICON: Record<"bad" | "raid", { x: number; y: number; c: string }[]> = { bad: iconPixels("bad"), raid: iconPixels("raid") };

const Icon: React.FC<{ kind: "bad" | "raid"; size: number }> = ({ kind, size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ display: "block" }}>
    {ICON[kind].map((p, i) => <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />)}
  </svg>
);

const OmenIcon: React.FC<{ o: OmenSpec; f: number; pose: Pose; actorAt: (id: string, f: number) => V3 | null }> = ({ o, f, pose, actorAt }) => {
  if (f < o.stamp) return null;
  if (o.out !== undefined && f >= o.out + 6) return null;
  const flyEnd = o.fly !== undefined ? o.fly + 10 : Infinity;
  if (f >= flyEnd) return null;
  const feet = actorAt(o.actor, f);
  if (!feet) return null;
  const size = o.size ?? 128, up = o.up ?? 2.15;
  const pr = project(pose, [feet[0], feet[1] + up, feet[2]]);
  if (pr.depth < 0.2) return null;
  // minY: the icon's top kept at or below this % of the picture (clear of the Shorts top bar); the head point moves down
  const py = o.minY !== undefined ? Math.max(pr.y, (o.minY / 100) * H + size) : pr.y;
  const t = f - o.stamp;
  // stamp: falls onto the head (gravity, 5 f), then a damped squash
  const drop = c01(t / 5), land = t - 5;
  let dy = -170 * (1 - drop * drop), sx = 1, sy = 1;
  const sc0 = 1.5 - 0.5 * drop;
  if (land >= 0) { const a = 0.3 * Math.exp(-land / 2.5) * Math.cos(land * 1.3); sx = 1 + a; sy = 1 - 0.95 * a; dy = 3 * Math.sin(land / 8); }
  // flip: a card turn, the other icon from half way, a glint
  let kind: "bad" | "raid" = o.kind ?? "bad", glint = 0;
  if (o.flip !== undefined && f >= o.flip) {
    const u = c01((f - o.flip) / 8);
    sx *= Math.max(0.05, Math.abs(Math.cos(u * Math.PI)));
    if (u >= 0.5) kind = kind === "bad" ? "raid" : "bad";
    glint = bump(f, o.flip + 3, o.flip + 12);
  }
  // fly: shoots up along a curve into the bar, shrinking
  let x = pr.x, y = py + dy, s = sc0, op = c01(t * 0.6 + 0.4) * (o.out !== undefined ? 1 - c01((f - o.out) / 6) : 1);
  const trail: { x: number; y: number; s: number; o: number }[] = [];
  if (o.fly !== undefined && f >= o.fly) {
    const to = o.to ?? [44, 11];
    const tx = (to[0] / 100) * W, ty = (to[1] / 100) * H;
    const at = (g: number) => {
      const u = c01((g - o.fly!) / 10), e = u * u * (3 - 2 * u) * 0.35 + u * u * 0.65;
      const cx = pr.x, cy = Math.min(py, ty) - 40;
      const bx = (1 - e) * (1 - e) * pr.x + 2 * (1 - e) * e * cx + e * e * tx, by = (1 - e) * (1 - e) * (py + dy) + 2 * (1 - e) * e * cy + e * e * ty;
      return { x: bx, y: by, s: 1 - 0.55 * e };
    };
    const now = at(f); x = now.x; y = now.y; s = now.s;
    for (let k = 1; k <= 3; k++) { const p = at(f - k * 1.2); trail.push({ ...p, o: 0.35 * (1 - k / 4) }); }
  }
  const ring = land >= 0 && land < 9 ? land / 9 : -1;
  const box = (px: number, py: number, ss: number, extra: React.CSSProperties = {}) => ({ position: "absolute" as const, left: px - (size * ss) / 2, top: py - size * ss, width: size * ss, height: size * ss, ...extra });
  return (
    <>
      {trail.map((p, i) => <div key={i} style={box(p.x, p.y, p.s, { opacity: p.o * op })}><Icon kind={kind} size={size * p.s} /></div>)}
      {ring >= 0 && <div style={{ position: "absolute", left: x - 70 * (0.6 + ring), top: py - 14 * (0.6 + ring), width: 140 * (0.6 + ring), height: 28 * (0.6 + ring), borderRadius: "50%", border: `${5 * (1 - ring) + 1}px solid rgba(255,255,255,${0.75 * (1 - ring)})` }} />}
      <div style={box(x, y, s, { opacity: op, transform: `scale(${sx}, ${sy})`, transformOrigin: "50% 100%", filter: `drop-shadow(0 6px 4px rgba(0,0,0,0.35))${glint > 0 ? ` brightness(${1 + 1.3 * glint})` : ""}` })}>
        <Icon kind={kind} size={size * s} />
      </div>
    </>
  );
};

const Link: React.FC<{ l: RaidLinkSpec; f: number; pose: Pose; actorAt: (id: string, f: number) => V3 | null }> = ({ l, f, pose, actorAt }) => {
  if (f < l.f) return null;
  if (l.out !== undefined && f >= l.out + 6) return null;
  const feet = actorAt(l.actor, f);
  if (!feet) return null;
  const pr = project(pose, [feet[0], feet[1] + (l.up ?? 2.1), feet[2]]);
  if (pr.depth < 0.2) return null;
  const from = l.from ?? [44, 11.8], fx = (from[0] / 100) * W, fy = (from[1] / 100) * H;
  const u = EASE.cubicOut(c01((f - l.f) / (l.len ?? 9)));
  const ex = lerp(fx, pr.x, u), ey = lerp(fy, pr.y, u);
  const op = (0.88 + 0.12 * Math.sin(f / 4)) * (l.out !== undefined ? 1 - c01((f - l.out) / 6) : 1);
  const col = l.color ?? "#ff2a2a";
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: op }}>
      <line x1={fx} y1={fy} x2={ex} y2={ey} stroke={col} strokeWidth={18} strokeLinecap="round" opacity={0.18} />
      <line x1={fx} y1={fy} x2={ex} y2={ey} stroke={col} strokeWidth={9} strokeLinecap="round" opacity={0.45} />
      <line x1={fx} y1={fy} x2={ex} y2={ey} stroke="#ff8a7a" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={9 + 3 * Math.sin(f / 3)} fill={col} opacity={0.5} />
      <circle cx={ex} cy={ey} r={4.5} fill="#ffd0c8" />
    </svg>
  );
};

/** the DOM part of the raid fx: drawn over the picture (after the flash), so the imagined look never greys it */
export const RaidHud: React.FC<{ d: RaidFxDir; f: number; pose: Pose; actorAt: (id: string, f: number) => V3 | null }> = ({ d, f, pose, actorAt }) => {
  if (!d.raidBar && !d.omens?.length && !d.raidLinks?.length) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {d.raidLinks?.map((l, i) => <Link key={`l${i}`} l={l} f={f} pose={pose} actorAt={actorAt} />)}
      {d.raidBar && <BossBar d={d} f={f} />}
      {d.omens?.map((o, i) => <OmenIcon key={`o${i}`} o={o} f={f} pose={pose} actorAt={actorAt} />)}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ scene pieces
/** a soft ring (alpha peaks at 80 % of the radius) */
const ringTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!, img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const r = Math.hypot(x - 127.5, y - 127.5) / 128, a = Math.exp(-Math.pow((r - 0.8) / 0.07, 2)) + 0.12 * c01((0.8 - r) / 0.8) * (r < 0.8 ? 1 : 0);
      const i = (y * 256 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * Math.min(1, a));
    }
    g.putImageData(img, 0, 0);
    t = new THREE.CanvasTexture(c); return t;
  };
})();
/** a streak: bright at +x, clear at -x, soft across */
const streakTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 128; c.height = 16;
    const g = c.getContext("2d")!, img = g.createImageData(128, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 128; x++) {
      const a = Math.pow(x / 127, 1.6) * Math.exp(-Math.pow((y - 7.5) / 4.5, 2));
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * a);
    }
    g.putImageData(img, 0, 0);
    t = new THREE.CanvasTexture(c); return t;
  };
})();
/** a vertical glow (bright at the bottom, clear at the top) for the boundary curtain */
const curtainTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 4; c.height = 64;
    const g = c.getContext("2d")!, gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    t = new THREE.CanvasTexture(c); return t;
  };
})();

/** quads (cube.ts) -> a geometry, positions scaled */
const quadsGeo = (quads: Quad[], scale = 1) => {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  quads.forEach((q, i) => {
    for (let j = 0; j < 4; j++) { pos.push(q.p[j].x * scale, q.p[j].y * scale, q.p[j].z * scale); uv.push(...q.uv[j]); nrm.push(q.n.x, q.n.y, q.n.z); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
};
type Face = "east" | "west" | "up" | "down" | "south" | "north";
const FACE_I: Record<Face, number> = { east: 0, west: 1, up: 2, down: 3, south: 4, north: 5 };
/** a block-model element (pixels 0..16 in the cell) with per-face uv rects [u0, v0, u1, v1] (16 px textures) */
const elementGeo = (from: V3, to: V3, faces: Partial<Record<Face, [number, number, number, number]>>) => {
  const g = new THREE.BoxGeometry((to[0] - from[0]) / 16, (to[1] - from[1]) / 16, (to[2] - from[2]) / 16);
  g.translate((from[0] + to[0]) / 32, (from[1] + to[1]) / 32, (from[2] + to[2]) / 32);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (const [name, fi] of Object.entries(FACE_I)) {
    const r = faces[name as Face] ?? [0, 0, 16, 16];
    for (let j = 0; j < 4; j++) {
      const v = fi * 4 + j, a = uv.getX(v), b = uv.getY(v);
      uv.setXY(v, (r[0] + a * (r[2] - r[0])) / 16, 1 - (r[1] + (1 - b) * (r[3] - r[1])) / 16);
    }
  }
  return g;
};
const lambert = (map?: THREE.Texture, color = "#ffffff") => new THREE.MeshLambertMaterial({ map: map ?? null, color: map ? "#ffffff" : color, alphaTest: 0.5, side: THREE.DoubleSide });
const FACING_DEG = { north: 0, east: 90, south: 180, west: 270 } as const;

/** a camera-facing quad at `at` (radius r): ring waves */
const Facing: React.FC<{ at: V3; cam: V3; r: number; color: string; opacity: number; additive?: boolean }> = ({ at, cam, r, color, opacity, additive = true }) => {
  const q = useMemo(() => new THREE.Quaternion(), []);
  const o = new THREE.Object3D(); o.position.set(...at); o.lookAt(new THREE.Vector3(...cam)); q.copy(o.quaternion);
  return (
    <mesh position={at} quaternion={q} renderOrder={22} frustumCulled={false}>
      <planeGeometry args={[2 * r, 2 * r]} />
      <meshBasicMaterial map={ringTex()} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending} side={THREE.DoubleSide} fog={false} />
    </mesh>
  );
};
const GroundRing: React.FC<{ at: V3; r: number; color: string; opacity: number; additive?: boolean }> = ({ at, r, color, opacity, additive = false }) => (
  <mesh position={at} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21}>
    <planeGeometry args={[2 * r, 2 * r]} />
    <meshBasicMaterial map={ringTex()} color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
  </mesh>
);

// ---- R7 the bell
const BELL_BODY = [{ o: [-3, -6, -3] as V3, s: [6, 7, 6] as V3, uv: [0, 0] as [number, number] }, { o: [-4, -8, -4] as V3, s: [8, 2, 8] as V3, uv: [0, 13] as [number, number] }];
const Bell: React.FC<{ b: BellSpec; rt: RaidTex; f: number; cam: V3 }> = ({ b, rt, f, cam }) => {
  const parts = useMemo(() => {
    const oak = lambert(rt.tex["block/dark_oak_planks"], "#4a321c"), stone = lambert(rt.tex["block/stone"], "#7d7d7d");
    const post: { g: THREE.BufferGeometry; m: THREE.Material }[] = [];
    if ((b.attach ?? "floor") === "floor") {
      post.push({ g: elementGeo([2, 13, 7], [14, 15, 9], { north: [2, 2, 14, 4], south: [2, 3, 14, 5], up: [2, 3, 14, 5], down: [2, 3, 14, 5], east: [7, 2, 9, 4], west: [7, 2, 9, 4] }), m: oak });
      for (const x of [0, 14]) post.push({ g: elementGeo([x, 0, 6], [x + 2, 16, 10], { north: [0, 1, 2, 16], south: [0, 1, 2, 16], east: [0, 1, 4, 16], west: [0, 1, 4, 16], up: [0, 0, 2, 4], down: [0, 0, 2, 4] }), m: stone });
    } else {
      post.push({ g: elementGeo([7, 13, 7], [9, 16, 9], { north: [7, 2, 9, 5], south: [7, 2, 9, 5], east: [7, 2, 9, 5], west: [7, 2, 9, 5], up: [7, 7, 9, 9], down: [7, 7, 9, 9] }), m: oak });
    }
    const quads = BELL_BODY.flatMap((c) => cubeQuads(c, 32, 32));
    const body = { g: quadsGeo(quads, 1 / 16), m: lambert(rt.tex["entity/bell/bell_body"], "#e8b832") };
    return { post, body };
  }, [b.attach, rt]);
  // the vanilla swing after the last ring so far: sin(t / pi) / (4 + t / 3), t in ticks, 50 ticks long
  const last = (b.rings ?? []).filter((r) => r <= f).pop();
  let ang = 0;
  if (last !== undefined) { const t = ((f - last) * 20) / 30; if (t < 50) ang = (Math.sin(t / Math.PI) / (4 + t / 3)) * (b.swing ?? 2); }
  const from = b.from ?? b.facing ?? "north";
  const rot: V3 = from === "north" ? [-ang, 0, 0] : from === "south" ? [ang, 0, 0] : from === "east" ? [0, 0, -ang] : [0, 0, ang];
  const [x, y, z] = b.at;
  const centre: V3 = [x + 0.5, y + 0.55, z + 0.5];
  const waves: React.ReactNode[] = [];
  (b.rings ?? []).forEach((r, i) => {
    const u = (f - r) / 20;
    if (u < 0 || u >= 1) return;
    const R = 0.35 + ((b.radius ?? 6) - 0.35) * EASE.cubicOut(u), op = Math.pow(1 - u, 1.4);
    const col = b.color ?? "#fff1b8", wave = b.wave ?? "air";
    // the air ring: two thin rings a beat apart, at most 40 % of the ground radius (never fills the frame)
    if (wave !== "ground") for (const [j, lag] of [[0, 0], [1, 4]] as const) {
      const uj = (f - r - lag) / 20;
      if (uj > 0 && uj < 1) waves.push(<Facing key={`a${i}-${j}`} at={centre} cam={cam} r={0.3 + (0.4 * (b.radius ?? 6) - 0.3) * EASE.cubicOut(uj)} color={col} opacity={0.5 * Math.pow(1 - uj, 1.6)} />);
    }
    if (wave !== "air") waves.push(<GroundRing key={`g${i}`} at={[x + 0.5, (b.ground ?? y - 1) + 0.03, z + 0.5]} r={R} color={col} opacity={0.55 * op} additive />);
  });
  return (
    <>
      <group position={[x + 0.5, y, z + 0.5]} rotation={[0, (-FACING_DEG[b.facing ?? "north"] * Math.PI) / 180, 0]}>
        {parts.post.map((p, i) => <mesh key={i} geometry={p.g} material={p.m} position={[-0.5, 0, -0.5]} castShadow receiveShadow />)}
      </group>
      <group position={[x + 0.5, y + 12 / 16, z + 0.5]} rotation={rot}>
        <mesh geometry={parts.body.g} material={parts.body.m} castShadow receiveShadow />
      </group>
      {waves}
    </>
  );
};

// ---- R8 arrows
const arrowGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    // vanilla ArrowRenderer: two crossed 16x4 planes (u 0..16, v 0..5 of the 32x32 texture) and the 4x4 back fin at
    // x -7; here shifted so the TIP is at the origin (x -16..0), in blocks (0.05625 per pixel, the game's scale)
    const k = 0.05625, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const quad = (p: V3[], t: [number, number][]) => { const b = pos.length / 3; p.forEach((v) => pos.push(v[0] * k, v[1] * k, v[2] * k)); t.forEach(([u, v]) => uv.push(u, 1 - v)); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    const T: [number, number][] = [[0, 0], [0.5, 0], [0.5, 5 / 32], [0, 5 / 32]];
    quad([[-16, -2, 0], [0, -2, 0], [0, 2, 0], [-16, 2, 0]], T);
    quad([[-16, 0, -2], [0, 0, -2], [0, 0, 2], [-16, 0, 2]], T);
    quad([[-15, -2, -2], [-15, -2, 2], [-15, 2, 2], [-15, 2, -2]], [[0, 5 / 32], [5 / 32, 5 / 32], [5 / 32, 10 / 32], [0, 10 / 32]]);
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
})();
const xAxis = new THREE.Vector3(1, 0, 0);
/** an arrow's tip and direction at frame g (null = not in the air / not stuck) */
const arrowAt = (a: ArrowSpec, g: number, poseAt: (f: number) => Pose) => {
  const n = a.n ?? 6;
  if (g < a.f) return null;
  let to = a.to ?? a.from, beyond = 0;
  if (a.lens) {
    const p = poseAt(a.f + n), c = new THREE.Vector3(...p.pos), fw = new THREE.Vector3(...p.look).sub(c).normalize();
    const right = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, fw);
    to = c.addScaledVector(right, a.lens.side ?? 0.35).addScaledVector(up, a.lens.up ?? 0.12).addScaledVector(fw, 0.1).toArray() as V3;
    beyond = 0.6;
  }
  const u = (g - a.f) / n;
  if (a.lens && u > 1 + beyond) return null;
  if (a.hit && u > 1) return null;
  const stuck = !a.lens && u >= 1;
  const k = stuck ? 1 : u;
  const pAt = (kk: number): V3 => { const p = lerp3(a.from, to, kk); p[1] += 4 * (a.arc ?? 0) * kk * (1 - kk); return p; };
  const p = pAt(k), q = pAt(Math.max(0, k - 0.02)), p2 = pAt(k + 0.001);
  const dir = new THREE.Vector3(p2[0] - q[0], p2[1] - q[1], p2[2] - q[2]).normalize();
  return { tip: p, dir, stuck, u, pAt };
};
const Arrow: React.FC<{ a: ArrowSpec; rt: RaidTex; f: number; poseAt: (f: number) => Pose; cam: V3 }> = ({ a, rt, f, poseAt, cam }) => {
  const mat = useMemo(() => lambert(rt.tex["entity/projectiles/arrow"], "#8a6a4a"), [rt]);
  const st = arrowAt(a, f, poseAt);
  if (!st || (a.until !== undefined && f >= a.until)) return null;
  const n = a.n ?? 6;
  // stuck: the tip sinks `depth` into the face; the vanilla quiver (7 ticks: -sin(s * 3) * s degrees)
  const tip = st.stuck ? new THREE.Vector3(...st.tip).addScaledVector(st.dir, a.depth ?? 0.12) : new THREE.Vector3(...st.tip);
  const q = new THREE.Quaternion().setFromUnitVectors(xAxis, st.dir);
  if (st.stuck) {
    const s = 7 - ((f - a.f - n) * 20) / 30;
    if (s > 0) {
      const side = new THREE.Vector3(0, 1, 0).cross(st.dir); if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(side.normalize(), (-Math.sin(s * 3) * s * 1.6 * Math.PI) / 180));
    }
  }
  // the streak: from where the arrow was two frames ago to its fletching, facing the lens
  const tailK = Math.max(0, Math.min(st.u, 1) - 2 / n), tail = new THREE.Vector3(...st.pAt(a.lens ? Math.max(0, st.u - 2 / n) : tailK));
  const back = tip.clone().addScaledVector(st.dir, -0.85);
  const len = st.stuck ? 0 : Math.max(0, back.clone().sub(tail).dot(st.dir));
  let streak: React.ReactNode = null;
  if (len > 0.05) {
    const mid = back.clone().addScaledVector(st.dir, -len / 2), toCam = new THREE.Vector3(...cam).sub(mid).normalize();
    const zz = toCam.clone().addScaledVector(st.dir, -toCam.dot(st.dir)).normalize(), yy = new THREE.Vector3().crossVectors(zz, st.dir);
    const sq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(st.dir, yy, zz));
    streak = (
      <mesh position={mid.toArray()} quaternion={sq} scale={[len, a.lens ? 0.09 : 0.07, 1]} renderOrder={24} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={streakTex()} color={a.color ?? "#fff4d8"} transparent opacity={0.85} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    );
  }
  // the hit: a small white flash where it lands (3 f)
  const hf = f - a.f - n;
  const flash = !a.lens && hf >= 0 && hf < 3 ? (
    <sprite position={st.tip} scale={[0.5 * (1 - hf / 4), 0.5 * (1 - hf / 4), 1]} renderOrder={25}>
      <spriteMaterial map={softDot()} color="#ffffff" transparent opacity={0.9 * (1 - hf / 3)} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
    </sprite>
  ) : null;
  return (
    <>
      <mesh geometry={arrowGeo()} material={mat} position={tip.toArray()} quaternion={q} castShadow />
      {streak}
      {flash}
    </>
  );
};

// ---- R10 shock rings
const Shock: React.FC<{ s: ShockSpec; f: number; cam: V3 }> = ({ s, f, cam }) => {
  const R = s.radius ?? 8, life = R / (s.speed ?? 0.7) + 4, u = (f - s.f) / life;
  if (u < 0 || u >= 1) return null;
  const r = 0.4 + (R - 0.4) * EASE.cubicOut(u), rings = s.rings ?? "both";
  return (
    <>
      {rings !== "air" && <GroundRing at={[s.at[0], s.at[1] + 0.04, s.at[2]]} r={r} color={s.color ?? "#e6d8b8"} opacity={0.75 * Math.pow(1 - u, 1.2)} />}
      {rings !== "ground" && u < 0.6 && <Facing at={[s.at[0], s.at[1] + 1.2, s.at[2]]} cam={cam} r={r * 0.8} color="#ffffff" opacity={0.4 * Math.pow(1 - u / 0.6, 1.5)} />}
    </>
  );
};

// ---- R11 the village boundary
const Bounds: React.FC<{ b: BoundsSpec; f: number }> = ({ b, f }) => {
  if (b.trace && f < b.trace[0]) return null;
  if (b.out !== undefined && f >= b.out + 8) return null;
  let mn = b.min, mx = b.max;
  if (b.shrink && f > b.shrink.f) {
    const k = EASE.inOut(c01((f - b.shrink.f) / (b.shrink.len ?? 18)));
    mn = [lerp(b.min[0], b.shrink.min[0], k), lerp(b.min[1], b.shrink.min[1], k)];
    mx = [lerp(b.max[0], b.shrink.max[0], k), lerp(b.max[1], b.shrink.max[1], k)];
  }
  const y = b.y ?? 0, w = mx[0] - mn[0], d = mx[1] - mn[1], half = w + d;
  const drawn = b.trace ? EASE.inOut(c01((f - b.trace[0]) / Math.max(1, b.trace[1] - b.trace[0]))) * half : half;
  // two heads from the south-west corner: east along the south edge then north; north along the west edge then east
  const sw: [number, number] = [mn[0], mx[1]];
  const paths: [number, number][][] = [[sw, [mx[0], mx[1]], [mx[0], mn[1]]], [sw, [mn[0], mn[1]], [mx[0], mn[1]]]];
  const segs: { a: [number, number]; b: [number, number] }[] = [], heads: [number, number][] = [];
  for (const p of paths) {
    let left = drawn;
    for (let i = 1; i < p.length && left > 1e-4; i++) {
      const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]), k = Math.min(1, left / Math.max(L, 1e-6));
      const e: [number, number] = [lerp(p[i - 1][0], p[i][0], k), lerp(p[i - 1][1], p[i][1], k)];
      segs.push({ a: p[i - 1], b: e }); left -= L;
      if (left <= 0 && drawn < half - 1e-3) heads.push(e);
    }
  }
  let pulse = 0;
  for (const p of b.pulse ?? []) pulse = Math.max(pulse, f >= p && f < p + 14 ? (f < p + 3 ? (f - p) / 3 : 1 - (f - p - 3) / 11) : 0);
  const fade = b.out !== undefined ? 1 - c01((f - b.out) / 8) : 1;
  const col = new THREE.Color(b.color ?? "#ffd23f").multiplyScalar(1.3 + 0.9 * pulse);
  const width = (b.width ?? 0.16) * (1 + 0.6 * pulse), h = (b.height ?? 0.55) * (1 + 0.5 * pulse);
  const breathe = 0.85 + 0.15 * Math.sin(f / 6);
  return (
    <group userData={{ raidKeep: 1 }}>
      {segs.map((s, i) => {
        const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        if (L < 1e-3) return null;
        const cx = (s.a[0] + s.b[0]) / 2, cz = (s.a[1] + s.b[1]) / 2, yaw = -Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
        return (
          <group key={i} position={[cx, y, cz]} rotation={[0, yaw, 0]}>
            <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[L + width, width, 1]} renderOrder={23}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial color={col} transparent opacity={0.95 * fade} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
            </mesh>
            <mesh position={[0, h / 2, 0]} scale={[L, h, 1]} renderOrder={23}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={curtainTex()} color={col} transparent opacity={0.55 * fade * breathe} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
      {heads.map((p, i) => (
        <sprite key={`h${i}`} position={[p[0], y + 0.25, p[1]]} scale={[1.1, 1.1, 1]} renderOrder={24}>
          <spriteMaterial map={softDot()} color={col} transparent opacity={fade} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
};

// ---- vex face rings
const FACE_N: Record<FaceRingSpec["face"], V3> = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
const FaceRing: React.FC<{ s: FaceRingSpec; f: number }> = ({ s, f }) => {
  const len = s.len ?? 12, u = (f - s.f) / len;
  if (u < 0 || u >= 1) return null;
  const n = new THREE.Vector3(...FACE_N[s.face]), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const at = new THREE.Vector3(...s.at).addScaledVector(n, 0.025);
  const r = 0.12 + ((s.r ?? 0.65) - 0.12) * EASE.cubicOut(u), col = s.color ?? "#d9ccff";
  // sparks spread along the face
  const a1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q), a2 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const sparks = Array.from({ length: 7 }, (_, i) => {
    const ang = (i / 7) * Math.PI * 2 + s.f, d = 0.2 + 0.75 * EASE.cubicOut(u) * (0.7 + 0.3 * Math.sin(i * 2.3));
    return at.clone().addScaledVector(a1, Math.cos(ang) * d).addScaledVector(a2, Math.sin(ang) * d).addScaledVector(n, 0.06 * Math.sin(u * Math.PI));
  });
  return (
    <>
      <mesh position={at.toArray()} quaternion={q} renderOrder={22}>
        <planeGeometry args={[2 * r, 2 * r]} />
        <meshBasicMaterial map={ringTex()} color={col} transparent opacity={0.95 * Math.pow(1 - u, 1.2)} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {sparks.map((p, i) => (
        <mesh key={i} position={p.toArray()} renderOrder={23}>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshBasicMaterial color={col} transparent opacity={1 - u} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
};

// ---- the standing ominous banner
/** the flag's angle limit (radians, the game's -0.0025 pi) and the softness of the clamp */
const SWAY_MAX = -0.0025 * Math.PI, SWAY_W = 0.012;
const FLAG_CUBE = { o: [-10, 0, -2] as V3, s: [20, 40, 1] as V3, uv: [0, 0] as [number, number] };
const Banner: React.FC<{ b: BannerSpec; rt: RaidTex; f: number }> = ({ b, rt, f }) => {
  const built = useMemo(() => {
    const flagTex = ominousFlagTexture((k) => rt.img[k], rt.img);
    let quads = cubeQuads(FLAG_CUBE, 64, 64);
    for (const ys of [5, 10, 15, 20, 25, 30, 35]) quads = splitQuads(quads, ys);
    const flag = quadsGeo(quads);
    const base = (flag.getAttribute("position").array as Float32Array).slice();
    const wood = lambert(rt.tex["entity/banner/banner_base"], "#8a6a3a");
    return {
      flag, base, flagMat: selfLit(new THREE.MeshLambertMaterial({ map: flagTex, color: flagTex ? "#ffffff" : "#d8d8d0", alphaTest: 0.1, side: THREE.DoubleSide })),
      pole: quadsGeo(cubeQuads({ o: [-1, -30, -1], s: [2, 42, 2], uv: [44, 0] }, 64, 64)), bar: quadsGeo(cubeQuads({ o: [-10, -32, -1], s: [20, 2, 2], uv: [0, 42] }, 64, 64)), wood,
    };
  }, [rt]);
  if (b.pop !== undefined && f < b.pop) return null;
  // the vanilla sway (100 ticks, phase from the cell) with a travelling ripple down the cloth
  const ticks = (f * 20) / 30, [x, y, z] = b.at, wind = b.wind ?? 3;
  const t = (((x * 7 + y * 9 + z * 13 + ticks) % 100) + 100) % 100 / 100;
  const rot = (-0.0125 + 0.01 * wind * Math.cos(Math.PI * 2 * t)) * Math.PI;
  const pos = built.flag.getAttribute("position") as THREE.BufferAttribute, arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const yy = built.base[i + 1], zz = built.base[i + 2], k = yy / 40;
    const th0 = rot * (1 + 0.5 * k) + 0.028 * wind * Math.sin(Math.PI * 2 * (ticks / 34) - 2.6 * k) * k;
    // never back through the pole: a smooth min with the game's limit (vanilla xRot stays <= -0.0025 pi, away from it)
    const th = -SWAY_W * Math.log(Math.exp(-th0 / SWAY_W) + Math.exp(-SWAY_MAX / SWAY_W));
    arr[i] = built.base[i]; arr[i + 1] = yy * Math.cos(th) - zz * Math.sin(th); arr[i + 2] = yy * Math.sin(th) + zz * Math.cos(th);
  }
  pos.needsUpdate = true;
  built.flag.computeBoundingSphere();
  const pu = b.pop !== undefined ? c01((f - b.pop) / 6) : 1;
  const sc = pu >= 1 ? 1 : pu < 0.7 ? 0.6 + (0.48 * pu) / 0.7 : 1.08 - (0.08 * (pu - 0.7)) / 0.3;
  const k = (2 / 3 / 16) * sc;
  return (
    <group position={[x + 0.5, y, z + 0.5]} rotation={[0, (-(b.yaw ?? 0) * Math.PI) / 180, 0]}>
      <group position={[0, 0.5 * sc, 0]} scale={[k, -k, -k]}>
        <mesh geometry={built.pole} material={built.wood} castShadow receiveShadow />
        <mesh geometry={built.bar} material={built.wood} castShadow receiveShadow />
        <mesh geometry={built.flag} material={built.flagMat} position={[0, -32, 0]} castShadow receiveShadow />
      </group>
    </group>
  );
};

/** R11 world cells that keep their colour in the imagined look (the bed): drawn here, out of the merged mesh */
const KeptCells: React.FC<{ cells: number[][]; lw: LoadedWorld; k: number }> = ({ cells, lw, k }) => {
  const objs = useMemo(() => cells.map((c) => { const b = blockAt(lw).get(c.slice(0, 3).join(",")); return b ? { c, o: protoOf(b, lw, lw).clone() } : null; }), [cells, lw]);
  return (
    <group userData={{ raidKeep: k }}>
      {objs.map((x, i) => x && <primitive key={i} object={x.o} position={[x.c[0] + 0.5, x.c[1], x.c[2] + 0.5]} />)}
    </group>
  );
};

/** the scene part of the raid fx (inside VoxelWorld's actors) */
export const RaidScene: React.FC<{ d: RaidFxDir; lw: LoadedWorld; rt: RaidTex; poseAt: (f: number) => Pose }> = ({ d, lw, rt, poseAt }) => {
  const f = useMcFrame();
  const cam = poseAt(f).pos;
  return (
    <>
      {d.imagine?.keepCells?.length ? <KeptCells cells={d.imagine.keepCells} lw={lw} k={keepAt(d, "cells", f)} /> : null}
      {d.bells?.map((b, i) => <Bell key={`bell${i}`} b={b} rt={rt} f={f} cam={cam} />)}
      {d.arrows?.map((a, i) => <Arrow key={`arr${i}`} a={a} rt={rt} f={f} poseAt={poseAt} cam={cam} />)}
      {d.shocks?.map((s, i) => <Shock key={`sh${i}`} s={s} f={f} cam={cam} />)}
      {d.bounds?.map((b, i) => <Bounds key={`bd${i}`} b={b} f={f} />)}
      {d.faceRings?.map((s, i) => <FaceRing key={`fr${i}`} s={s} f={f} />)}
      {d.banners?.map((b, i) => <Banner key={`ban${i}`} b={b} rt={rt} f={f} />)}
    </>
  );
};
/** does this shot have scene raid fx */
export const hasRaidScene = (d: RaidFxDir | undefined) => !!(d?.imagine?.keepCells?.length || d?.bells?.length || d?.arrows?.length || d?.shocks?.length || d?.bounds?.length || d?.faceRings?.length || d?.banners?.length);
