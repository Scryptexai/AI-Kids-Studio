// DIEGETIC TEXT (The Tapper): words that live on blocks, in our own 5x7 pixel font (fxCommon.ts) so they read at
// 1080x1920. `texts` = letters on a wall face: "carved" (chisel-cut grooves: dark with a lit lower lip, Grandma's lintel),
// "painted" or "chalk"; each word can light warm on its own frame (eased up with a small overshoot, then held) and
// flash white (a palm tap) settling to full warm. `signs` = a wooden board on a post with painted letters (NO TAPPER):
// it can be hammered (jolts on `hits`), pop in, and light. `memoryImage` draws the same board as a 2D picture for the
// memory double-exposure overlay (TapperFx `memories`). Pure functions of the frame.
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import type { LoadedWorld } from "./VoxelWorld";
import { blockAt } from "./Build";
import { stateMatrix } from "./geometry";
import { backOut, c01, faceRot, layoutText, pixelTex, rnd, smooth, type FaceDir, type TextLayout, type V3 } from "./fxCommon";

export type TextSpec = {
  /** the words (upper case; "\n" breaks a line) */
  text: string;
  /** centre of the text block: a world point ON the face (not needed with `onSign`) */
  at?: V3;
  face: FaceDir;
  /** itw-02: a world cell holding a model block (a wall sign): the text sits flush on that board's `face` side, centred,
   *  sized to fit (82 % of the width, 70 % of the height) unless `height` is given; default mode "painted", dark ink */
  onSign?: V3;
  /** letter height in blocks (default 0.3: 7 font pixels of 0.043) */
  height?: number;
  mode?: "carved" | "painted" | "chalk";
  /** painted / chalk letter colour (default painted "#f1ead8", chalk "#e9e2cc") */
  color?: string;
  /** words that light: word index (0-based over the whole text) and the frame it lights; level 0..1 (default 1) */
  lights?: { word: number; f: number; level?: number }[];
  /** a white flash on a word (palm tap) that settles to full warm light */
  flashes?: { word: number; f: number }[];
  /** the warm light colour (default "#ffc15e") */
  glow?: string;
  /** the letters fade in from this frame over 12 f (re-carved / chalked on); default always there */
  appear?: number;
};

const PX = 8; // canvas pixels per font pixel

/** the base letters (no light) as a canvas */
const baseCanvas = (L: TextLayout, mode: NonNullable<TextSpec["mode"]>, color: string) => {
  const c = document.createElement("canvas");
  c.width = (L.w + 2) * PX; c.height = (L.h + 2) * PX;
  const g = c.getContext("2d")!;
  const on = new Set(L.words.flatMap((w) => w.px.map(([x, y]) => `${x},${y}`)));
  for (const w of L.words) for (const [x, y] of w.px) {
    const X = (x + 1) * PX, Y = (y + 1) * PX;
    if (mode === "carved") {
      // the groove: dark, its lower lip catching the light when the pixel below is stone
      g.fillStyle = "rgba(28,26,24,0.88)"; g.fillRect(X, Y, PX, PX);
      if (!on.has(`${x},${y + 1}`)) { g.fillStyle = "rgba(232,226,210,0.55)"; g.fillRect(X, Y + PX - 2, PX, 2); }
      if (!on.has(`${x},${y - 1}`)) { g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(X, Y, PX, 2); }
    } else if (mode === "chalk") {
      // chalk: rough, a few pixels missing, grainy alpha
      const r = rnd(x * 31 + y, 5);
      g.fillStyle = color; g.globalAlpha = 0.75 + 0.25 * r; g.fillRect(X, Y, PX, PX);
      g.globalAlpha = 1;
      if (r < 0.25) g.clearRect(X + (r * 16 % 6), Y + 2, 2, 2);
    } else {
      g.fillStyle = color; g.fillRect(X, Y, PX, PX);
    }
  }
  return c;
};
/** one word's pixels, filled (the light layer), with a 1-unit soft bleed */
const wordCanvas = (L: TextLayout, wi: number) => {
  const c = document.createElement("canvas");
  c.width = (L.w + 2) * PX; c.height = (L.h + 2) * PX;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.28)";
  for (const [x, y] of L.words[wi].px) g.fillRect((x + 1) * PX - 3, (y + 1) * PX - 3, PX + 6, PX + 6);
  g.fillStyle = "#ffffff";
  for (const [x, y] of L.words[wi].px) g.fillRect((x + 1) * PX, (y + 1) * PX, PX, PX);
  return c;
};

const PLANE = new THREE.PlaneGeometry(1, 1);

/** a word's light this frame: 0..~1.15 (lights) and the white flash 0..1 */
export const wordLight = (s: TextSpec, wi: number, f: number) => {
  let k = 0, flash = 0;
  for (const l of s.lights ?? []) if (l.word === wi && f >= l.f - 2) k = Math.max(k, (l.level ?? 1) * backOut((f - l.f + 2) / 8, 1.6));
  for (const fl of s.flashes ?? []) if (fl.word === wi && f >= fl.f) {
    const u = f - fl.f;
    flash = Math.max(flash, u <= 2 ? 1 : Math.max(0, 1 - (u - 2) / 10));
    k = Math.max(k, 1);
  }
  return { k, flash };
};

/** one text block; `plane` (itw-02 R8 tread text) overrides the face frame: rotation of a +z plane and its normal
 *  (a text lying on a tread's top face) */
export const TextOne: React.FC<{ s: TextSpec; plane?: { rot: THREE.Euler; n: V3 } }> = ({ s, plane }) => {
  const frame = useMcFrame();
  const mode = s.mode ?? "carved";
  const L = useMemo(() => layoutText(s.text), [s.text]);
  const tex = useMemo(() => {
    const t = pixelTex(baseCanvas(L, mode, s.color ?? (mode === "chalk" ? "#e9e2cc" : "#f1ead8")));
    return { base: t, words: L.words.map((_, i) => pixelTex(wordCanvas(L, i))) };
  }, [L, mode, s.color]);
  const h = s.height ?? 0.3, unit = h / 7, W = (L.w + 2) * unit, H = (L.h + 2) * unit;
  const rot = plane?.rot ?? faceRot(s.face);
  const n: V3 = plane?.n ?? (s.face === "-z" ? [0, 0, -1] : s.face === "+z" ? [0, 0, 1] : s.face === "-x" ? [-1, 0, 0] : [1, 0, 0]);
  const at = s.at ?? [0, 0, 0];
  const off = (d: number): V3 => [at[0] + n[0] * d, at[1] + n[1] * d, at[2] + n[2] * d];
  const ap = s.appear === undefined ? 1 : smooth((frame - s.appear) / 12);
  if (ap <= 0) return null;
  const glow = new THREE.Color(s.glow ?? "#ffc15e");
  return (
    <group>
      <mesh geometry={PLANE} position={off(0.004)} rotation={rot} scale={[W, H, 1]} renderOrder={7}>
        <meshBasicMaterial map={tex.base} transparent opacity={ap} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} toneMapped />
      </mesh>
      {L.words.map((_, wi) => {
        const { k, flash } = wordLight(s, wi, frame);
        if (k <= 0.01 && flash <= 0.01) return null;
        // warm light, pushed over 1 so the bloom catches it; the flash goes white and brighter
        const col = glow.clone().multiplyScalar(1.15 + 0.4 * Math.sin(frame / 9 + wi) * 0.1).lerp(new THREE.Color(3, 3, 3), flash * 0.8);
        return (
          <mesh key={wi} geometry={PLANE} position={off(0.008)} rotation={rot} scale={[W, H, 1]} renderOrder={8}>
            <meshBasicMaterial map={tex.words[wi]} color={col} transparent opacity={Math.min(1, k) * ap} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------- signs
export type SignSpec = {
  /** the post's foot (bottom centre) */
  at: V3;
  /** Minecraft yaw the board's painted side faces (0 = +z, 180 = -z, -90 = +x, 90 = -x) */
  facing: number;
  text: string;
  /** board size in blocks (default 1.6 x 0.75) and post height to the board's bottom edge (default 1.1; 0 = no post:
   *  the board hangs on a wall) */
  w?: number; h?: number; post?: number;
  /** hammer hits: the board jolts (pop + small tilt) on each frame */
  hits?: number[];
  /** the sign pops in at this frame (scale 0 -> 1.08 -> 1 over 6 f) */
  appear?: number;
  /** [frame, 0..1] keys (eased): the letters glow (NO TAPPER "lights") */
  lit?: [number, number][];
  /** letter colour (default dark "#1d1a16"), light colour (default "#fff1c8") */
  ink?: string; glow?: string;
  /** a slight lean in degrees (default 4) */
  lean?: number;
  /** the set's plank texture to use for the board (default "block/spruce_planks", falls back to drawn planks) */
  planks?: string;
};

const drawnPlanks = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const g = c.getContext("2d")!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4), seam = y % 4 === 3 || (x === (row * 5 + 3) % 16);
      const v = seam ? 70 : 118 + Math.floor(rnd(x + row * 3, y) * 22);
      g.fillStyle = `rgb(${v},${Math.round(v * 0.72)},${Math.round(v * 0.45)})`; g.fillRect(x, y, 1, 1);
    }
    t = pixelTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
})();

const keyedLit = (keys: [number, number][] | undefined, f: number) => {
  if (!keys?.length) return 0;
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (f < keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return va + (vb - va) * smooth((f - a) / (b - a)); }
  return keys[keys.length - 1][1];
};

const SignOne: React.FC<{ s: SignSpec; lw: LoadedWorld }> = ({ s, lw }) => {
  const frame = useMcFrame();
  const w = s.w ?? 1.6, h = s.h ?? 0.75, post = s.post ?? 1.1, lean = ((s.lean ?? 4) * Math.PI) / 180;
  const L = useMemo(() => layoutText(s.text), [s.text]);
  const mats = useMemo(() => {
    const src = lw.textures[s.planks ?? "block/spruce_planks"] ?? lw.textures["block/oak_planks"];
    const wood = src ? src.clone() : drawnPlanks().clone();
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(w, h); wood.needsUpdate = true;
    const side = src ? src.clone() : drawnPlanks().clone(); side.needsUpdate = true;
    const board = new THREE.MeshLambertMaterial({ map: wood });
    const ink = pixelTex(baseCanvas(L, "painted", s.ink ?? "#1d1a16"));
    const lit = pixelTex(wordCanvasAll(L));
    return { board, side: new THREE.MeshLambertMaterial({ map: side }), ink, lit };
  }, [lw, L, w, h, s.ink, s.planks]);
  // pop in, hammer jolts
  let sc = 1, tilt = 0;
  if (s.appear !== undefined) { const u = (frame - s.appear) / 6; if (u < 0) return null; sc = u >= 1 ? 1 : backOut(u, 2.2); }
  for (const hf of s.hits ?? []) { const u = frame - hf; if (u >= 0 && u < 8) { const e = Math.sin((u / 8) * Math.PI) * (1 - u / 8); tilt += e * 0.06 * (hf % 2 ? 1 : -1); sc *= 1 + 0.03 * e; } }
  const glow = c01(keyedLit(s.lit, frame));
  // the board's local +z (painted side) turned to the facing direction (yawFwd)
  const yaw = (-s.facing * Math.PI) / 180;
  // letters fill 82 % of the board width
  const unit = Math.min((w * 0.82) / (L.w + 2), (h * 0.7) / (L.h + 2));
  const tw = (L.w + 2) * unit, th = (L.h + 2) * unit;
  const by = post + h / 2;
  return (
    <group position={s.at} rotation={[0, yaw, 0]}>
      <group rotation={[lean * 0.5, 0, tilt]} scale={sc}>
        {post > 0 && (
          <mesh position={[0, post / 2 + h * 0.3, -0.06]} castShadow receiveShadow material={mats.side}>
            <boxGeometry args={[0.14, post + h * 0.6, 0.14]} />
          </mesh>
        )}
        <mesh position={[0, by, 0.03]} castShadow receiveShadow material={[mats.side, mats.side, mats.side, mats.side, mats.board, mats.board]}>
          <boxGeometry args={[w, h, 0.08]} />
        </mesh>
        <mesh geometry={PLANE} position={[0, by, 0.072]} scale={[tw, th, 1]} renderOrder={7}>
          <meshLambertMaterial map={mats.ink} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
        {glow > 0.01 && (
          <mesh geometry={PLANE} position={[0, by, 0.076]} scale={[tw, th, 1]} renderOrder={8}>
            <meshBasicMaterial map={mats.lit} color={new THREE.Color(s.glow ?? "#fff1c8").multiplyScalar(1.6)} transparent opacity={glow} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
        {glow > 0.01 && <pointLight position={[0, by, 0.6]} color={s.glow ?? "#fff1c8"} intensity={1.2 * glow} distance={3} decay={1.6} />}
      </group>
    </group>
  );
};
const wordCanvasAll = (L: TextLayout) => {
  const c = document.createElement("canvas");
  c.width = (L.w + 2) * PX; c.height = (L.h + 2) * PX;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.3)";
  for (const w of L.words) for (const [x, y] of w.px) g.fillRect((x + 1) * PX - 3, (y + 1) * PX - 3, PX + 6, PX + 6);
  g.fillStyle = "#ffffff";
  for (const w of L.words) for (const [x, y] of w.px) g.fillRect((x + 1) * PX, (y + 1) * PX, PX, PX);
  return c;
};

/** a sign board as a 2D picture (data URL) for the memory double-exposure overlay */
export const signImage = (() => {
  const cache = new Map<string, string>();
  return (text: string, lit = true): string => {
    const key = `${text}|${lit}`;
    if (cache.has(key)) return cache.get(key)!;
    const L = layoutText(text);
    const pad = 6, W = (L.w + pad * 2) * PX, H = (L.h + pad * 2) * PX;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    // planks
    for (let y = 0; y < H; y += PX) for (let x = 0; x < W; x += PX) {
      const row = Math.floor(y / (PX * 4)), seam = (y / PX) % 4 === 3;
      const v = seam ? 70 : 118 + Math.floor(rnd(x / PX + row * 3, y / PX) * 22);
      g.fillStyle = `rgb(${v},${Math.round(v * 0.72)},${Math.round(v * 0.45)})`; g.fillRect(x, y, PX, PX);
    }
    for (const w of L.words) for (const [x, y] of w.px) {
      g.fillStyle = lit ? "#fff1c8" : "#1d1a16"; g.fillRect((x + pad) * PX, (y + pad) * PX, PX, PX);
    }
    const url = c.toDataURL("image/png");
    cache.set(key, url);
    return url;
  };
})();

/** the world box of a model block's first element (blockstate rotation applied), or null if the cell has none */
export const boardBox = (lw: LoadedWorld, c: V3): { min: V3; max: V3 } | null => {
  const b = blockAt(lw).get(`${c[0]},${c[1]},${c[2]}`);
  const e = b?.elements?.[0];
  if (!b || !e) return null;
  const st = stateMatrix(b.rotX, b.rotY), box = new THREE.Box3();
  for (const x of [e.from[0], e.to[0]]) for (const y of [e.from[1], e.to[1]]) for (const z of [e.from[2], e.to[2]]) box.expandByPoint(new THREE.Vector3(x / 16, y / 16, z / 16).applyMatrix4(st));
  return { min: [c[0] + box.min.x, c[1] + box.min.y, c[2] + box.min.z], max: [c[0] + box.max.x, c[1] + box.max.y, c[2] + box.max.z] };
};
/** a `texts` entry with `onSign`: placed flush on the board's face side (falls back to the cell's face if no block) */
const onSignSpec = (s: TextSpec, lw: LoadedWorld): TextSpec => {
  const c = s.onSign!, B = boardBox(lw, c) ?? { min: [c[0], c[1], c[2]] as V3, max: [c[0] + 1, c[1] + 1, c[2] + 1] as V3 };
  const mid: V3 = [(B.min[0] + B.max[0]) / 2, (B.min[1] + B.max[1]) / 2, (B.min[2] + B.max[2]) / 2];
  const ax = s.face === "-x" || s.face === "+x" ? 0 : 2, plus = s.face === "+x" || s.face === "+z";
  const at: V3 = [...mid]; at[ax] = plus ? B.max[ax] : B.min[ax];
  const bw = B.max[2 - ax] - B.min[2 - ax], bh = B.max[1] - B.min[1];
  const L = layoutText(s.text);
  const height = s.height ?? 7 * Math.min((bw * 0.82) / (L.w + 2), (bh * 0.7) / (L.h + 2));
  return { mode: "painted", color: "#1d1a16", ...s, at, height };
};

export const BlockTexts: React.FC<{ texts?: TextSpec[]; signs?: SignSpec[]; lw: LoadedWorld }> = ({ texts, signs, lw }) => (
  <>
    {texts?.map((s, i) => <TextOne key={`t${i}`} s={s.onSign ? onSignSpec(s, lw) : s} />)}
    {signs?.map((s, i) => <SignOne key={`s${i}`} s={s} lw={lw} />)}
  </>
);
