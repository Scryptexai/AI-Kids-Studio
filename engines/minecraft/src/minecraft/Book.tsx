// CHALK BOOK (The Tapper): Ruby's open slate-page book on a table. Two pages per spread drawn on canvases in chunky
// chalk pixels (a 64 x 80 grid per page): an optional title, an optional chalk sketch (the dam), and rows of tick
// boxes. Ticks draw on stroke by stroke over 3 frames (`ticks` = the frames the next boxes get ticked), empty boxes can
// light one by one (`glow`), a page turns forward on each `flips` frame (curling over the spine, the next spread under
// it), and `keys` move the whole book (lift it to camera). Pure function of the frame; page canvases are cached per
// state. Box positions (for hand acts): bookBoxPoint() here and book_box() in projects/itw-01/anim/build_fxtest.py.
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { pathAt, type PathKey } from "./direction";
import { c01, layoutText, rnd, smooth, type V3 } from "./fxCommon";

export type BookPage = {
  /** a chalk heading (e.g. "TUNNEL") */
  title?: string;
  /** a chalk sketch under the title: "dam" (the dam wall, water on top, the tunnel inside) or "street" (houses) */
  sketch?: "dam" | "street";
  /** tick boxes on the page, `cols` per row (default 6) */
  boxes?: number; cols?: number;
  /** boxes ticked before the shot */
  ticked?: number;
  /** frames the next boxes (after `ticked`) get their tick, in order */
  ticks?: number[];
  /** empty boxes from index `from` light up one by one from frame f, every `every` frames (default 9), warm */
  glow?: { from: number; f: number; every?: number; n?: number; color?: string };
};
export type BookSpec = {
  /** centre of the open book's spine, resting on the table top */
  at: V3;
  /** Minecraft yaw of the reader: the page bottoms face the reader, who looks along this yaw (0 = +z) */
  yaw?: number;
  /** page height in blocks (default 0.62); page width = 0.8 x height */
  size?: number;
  spreads: { left: BookPage; right: BookPage }[];
  /** the spread open at the start (default 0) */
  spread?: number;
  /** a page turn forward from each f, `len` frames (default 10) */
  flips?: { f: number; len?: number }[];
  /** move the whole book: path keys (at = the spine centre), rot = [pitch, yaw, roll] in DEGREES added to the rest
   *  pose (pitch -70 = stood up toward the reader) */
  keys?: PathKey[];
  /** cover colour (default "#4b3626"), page slate colour (default "#2d3236"), chalk colour (default "#ece6d2") */
  cover?: string; page?: string; chalk?: string;
};

const GW = 64, GH = 80, S = 4; // grid size, canvas pixels per grid unit

/** box i's centre in page grid units */
const boxGrid = (p: BookPage, i: number): [number, number] => {
  const cols = p.cols ?? 6, y0 = 6 + (p.title ? 10 : 0) + (p.sketch ? 30 : 0);
  const w = cols * 9 - 2, x0 = Math.floor((GW - w) / 2);
  return [x0 + (i % cols) * 9 + 3.5, y0 + Math.floor(i / cols) * 9 + 3.5];
};
/** the world point of box i on a page (the book at rest, no keys): side "l" / "r" */
export const bookBoxPoint = (b: BookSpec, side: "l" | "r", i: number): V3 => {
  const H = b.size ?? 0.62, W = H * 0.8, p = b.spreads[b.spread ?? 0][side === "l" ? "left" : "right"];
  const [gx, gy] = boxGrid(p, i), u = gx / GW;
  // local frame: +z = page tops (away from the reader), +x = the reader's left (the left page)
  const x = side === "l" ? (1 - u) * W : -u * W, z = H / 2 - (gy / GH) * H;
  const r = (-(b.yaw ?? 0) * Math.PI) / 180;
  return [b.at[0] + x * Math.cos(r) + z * Math.sin(r), b.at[1] + 0.03, b.at[2] - x * Math.sin(r) + z * Math.cos(r)];
};

// tick stroke pixels (grid units relative to the box's top-left), in drawing order: short down-stroke, long up-stroke
const TICK: [number, number][] = [[1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [6, 2], [7, 1], [8, 0]];

const drawPage = (p: BookPage, frame: number, chalk: string, slate: string): { key: string; draw: () => HTMLCanvasElement } => {
  const nT = p.ticked ?? 0;
  // tick progress per box: pixels drawn of its tick
  const prog: number[] = [];
  for (let i = 0; i < (p.boxes ?? 0); i++) {
    if (i < nT) { prog.push(TICK.length); continue; }
    const f = p.ticks?.[i - nT];
    prog.push(f === undefined ? 0 : Math.max(0, Math.min(TICK.length, Math.floor(((frame - f) / 3) * TICK.length) + 1)));
  }
  const glows: number[] = [];
  if (p.glow) for (let i = p.glow.from; i < Math.min(p.boxes ?? 0, p.glow.from + (p.glow.n ?? 99)); i++) {
    const t = frame - (p.glow.f + (i - p.glow.from) * (p.glow.every ?? 9));
    glows.push(t < 0 ? 0 : Math.round((t < 4 ? t / 4 : 0.75 + 0.25 * Math.cos((t - 4) / 5)) * 8) / 8);
  }
  const key = `${prog.join(",")}|${glows.join(",")}`;
  return {
    key,
    draw: () => {
      const c = document.createElement("canvas"); c.width = GW * S; c.height = GH * S;
      const g = c.getContext("2d")!;
      // slate with a soft vignette and chalk dust smears
      g.fillStyle = slate; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(236,230,210,${0.03 + 0.03 * rnd(i, 1)})`; g.fillRect(Math.floor(rnd(i, 2) * GW) * S, Math.floor(rnd(i, 3) * GH) * S, S * (2 + Math.floor(rnd(i, 4) * 6)), S); }
      const dot = (x: number, y: number, col = chalk, a = 1) => { g.globalAlpha = a * (0.82 + 0.18 * rnd(x * 7 + y, 9)); g.fillStyle = col; g.fillRect(Math.round(x) * S, Math.round(y) * S, S, S); g.globalAlpha = 1; };
      const lineH = (x0: number, x1: number, y: number, a = 1) => { for (let x = x0; x <= x1; x++) if (rnd(x, y) > 0.06) dot(x, y, chalk, a); };
      const lineV = (x: number, y0: number, y1: number, a = 1) => { for (let y = y0; y <= y1; y++) if (rnd(x, y + 3) > 0.06) dot(x, y, chalk, a); };
      let y = 6;
      if (p.title) {
        const L = layoutText(p.title), x0 = Math.floor((GW - L.w) / 2);
        for (const w of L.words) for (const [x, yy] of w.px) dot(x0 + x, y + yy);
        y += 10;
      }
      if (p.sketch === "dam") {
        // the dam: a thick wall in side view, water on its left, a tunnel dashed through it, the town small at its foot
        const top = y + 2, bot = y + 26;
        for (let yy = top; yy <= bot; yy++) { const half = 5 + Math.floor((yy - top) * 0.45); lineH(32 - half, 32 + half, yy, yy === top || yy === bot ? 1 : 0); dot(32 - half, yy); dot(32 + half, yy); }
        for (let yy = top + 4; yy < bot; yy += 4) { const half = 5 + Math.floor((yy - top) * 0.45); for (let x = 32 - half + 2; x < 32 + half - 1; x += 4) dot(x, yy, chalk, 0.55); }
        for (let x = 6; x < 26; x++) dot(x, top + 3 + (x % 4 === 0 ? 1 : 0), chalk, 0.85);           // the lake's waves
        for (let x = 26; x <= 38; x += 2) dot(x, bot - 6, chalk, 0.95);                               // the tunnel, dashed
        for (let i = 0; i < 4; i++) { const hx = 44 + i * 5; lineH(hx, hx + 3, bot - 2, 0.9); dot(hx + 1, bot - 3, chalk, 0.9); dot(hx + 2, bot - 3, chalk, 0.9); } // houses
        y += 30;
      } else if (p.sketch === "street") {
        for (let i = 0; i < 5; i++) { const hx = 6 + i * 11; lineH(hx, hx + 8, y + 22); lineV(hx, y + 12, y + 22); lineV(hx + 8, y + 12, y + 22); for (let k = 0; k < 5; k++) { dot(hx + k, y + 12 - k); dot(hx + 8 - k, y + 12 - k); } }
        y += 30;
      }
      // boxes
      for (let i = 0; i < (p.boxes ?? 0); i++) {
        const [cx, cy] = boxGrid(p, i), bx = cx - 3.5, by = cy - 3.5;
        const gi = p.glow ? i - p.glow.from : -1, gk = gi >= 0 && gi < glows.length ? glows[gi] : 0;
        if (gk > 0) { g.globalAlpha = 0.45 * gk; g.fillStyle = p.glow?.color ?? "#ffd27a"; g.fillRect((bx - 1) * S, (by - 1) * S, 9 * S, 9 * S); g.globalAlpha = 1; }
        const col = gk > 0 ? (p.glow?.color ?? "#ffd27a") : chalk;
        for (let k = 0; k < 7; k++) { dot(bx + k, by, col); dot(bx + k, by + 6, col); dot(bx, by + k, col); dot(bx + 6, by + k, col); }
        for (let k = 0; k < prog[i]; k++) dot(bx - 0.5 + TICK[k][0] * 0.95, by - 1.5 + TICK[k][1] * 0.95 + 1.5);
      }
      return c;
    },
  };
};

const pageGeo = (W: number, H: number, left: boolean, lift = 0.035, seg = 12) => {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const d = (i / seg) * W;                                  // distance from the spine
    const x = left ? d : -d, y = 0.012 + lift * (1 - d / W) ** 2;   // the left page lies on local +x (the reader's left)
    const u = left ? 1 - d / W : d / W;
    pos.push(x, y, -H / 2, x, y, H / 2); uv.push(u, 0, u, 1);
    if (i < seg) { const a = i * 2; idx.push(...(left ? [a, a + 1, a + 2, a + 1, a + 3, a + 2] : [a, a + 2, a + 1, a + 1, a + 2, a + 3])); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};

export const Book: React.FC<{ spec: BookSpec }> = ({ spec }) => {
  const frame = useMcFrame();
  const H = spec.size ?? 0.62, W = H * 0.8;
  const chalk = spec.chalk ?? "#ece6d2", slate = spec.page ?? "#2d3236";
  const cache = useMemo(() => new Map<string, THREE.Texture>(), []);
  useEffect(() => () => { for (const t of cache.values()) t.dispose(); }, [cache]);
  const tex = (p: BookPage) => {
    const d = drawPage(p, frame, chalk, slate), k = `${JSON.stringify(p).length}|${p.title}|${p.boxes}|${d.key}`;
    let t = cache.get(k);
    if (!t) { t = new THREE.CanvasTexture(d.draw()); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.anisotropy = 8; cache.set(k, t); }
    return t;
  };
  const geos = useMemo(() => ({ l: pageGeo(W, H, true), r: pageGeo(W, H, false) }), [W, H]);
  useEffect(() => () => { geos.l.dispose(); geos.r.dispose(); }, [geos]);
  const tmp = useMemo<THREE.BufferGeometry[]>(() => [], [frame]);
  useEffect(() => () => { for (const g of tmp) g.dispose(); }, [tmp]);
  // which spread is open, and the turning page
  let sp = spec.spread ?? 0, turn: { k: number } | null = null;
  for (const fl of spec.flips ?? []) {
    const len = fl.len ?? 10;
    if (frame >= fl.f + len) sp++;
    else if (frame >= fl.f) turn = { k: (frame - fl.f) / len };
  }
  sp = Math.min(sp, spec.spreads.length - 1);
  const cur = spec.spreads[sp], next = spec.spreads[Math.min(sp + 1, spec.spreads.length - 1)];
  // the turning page: the right page lifts over the spine (curling: its outer edge lags), the next right page under it
  let turning: React.ReactNode = null;
  if (turn) {
    const k = smooth(turn.k), seg = 14;
    const pos: number[] = [], uvF: number[] = [], uvB: number[] = [], idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const d = (i / seg) * W, lag = 0.55 * Math.sin(Math.PI * k) * (d / W);
      const phi = Math.PI * c01(k - lag * 0.5 + 0.02) ;
      const x = -d * Math.cos(phi), y = 0.03 + d * Math.sin(phi) * 0.92 + 0.02 * Math.sin(Math.PI * k);
      pos.push(x, y, -H / 2, x, y, H / 2);
      uvF.push(d / W, 0, d / W, 1); uvB.push(1 - d / W, 0, 1 - d / W, 1);
      if (i < seg) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const mk = (uv: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); tmp.push(g); return g; };
    turning = (
      <>
        <mesh geometry={mk(uvF)} renderOrder={3}><meshLambertMaterial map={tex(cur.right)} side={THREE.FrontSide} /></mesh>
        <mesh geometry={mk(uvB)} renderOrder={3}><meshLambertMaterial map={tex(next.left)} side={THREE.BackSide} /></mesh>
      </>
    );
  }
  const rightUnder = turn ? next.right : cur.right;
  // the book's place: rest pose, or its keys
  const p = spec.keys?.length ? pathAt(spec.keys, frame) : null;
  const at = p?.at ?? spec.at, rot = p?.rot ?? [0, 0, 0];
  const d2r = Math.PI / 180, yaw = -(spec.yaw ?? 0) * d2r;
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      {/* local +z = page tops, away from the reader; +x = the reader's left */}
      <group rotation={[rot[0] * d2r, rot[1] * d2r, rot[2] * d2r]}>
        {/* cover and page blocks */}
        <mesh position={[0, 0.006, 0]} castShadow receiveShadow><boxGeometry args={[W * 2 + 0.06, 0.012, H + 0.05]} /><meshLambertMaterial color={spec.cover ?? "#4b3626"} /></mesh>
        <mesh position={[W / 2, 0.009, 0]} castShadow receiveShadow><boxGeometry args={[W - 0.01, 0.006, H - 0.01]} /><meshLambertMaterial color="#cfc6b0" /></mesh>
        <mesh position={[-W / 2, 0.009, 0]} castShadow receiveShadow><boxGeometry args={[W - 0.01, 0.006, H - 0.01]} /><meshLambertMaterial color="#cfc6b0" /></mesh>
        <mesh geometry={geos.l} receiveShadow><meshLambertMaterial map={tex(cur.left)} side={THREE.DoubleSide} /></mesh>
        <mesh geometry={geos.r} receiveShadow><meshLambertMaterial map={tex(rightUnder)} side={THREE.DoubleSide} /></mesh>
        {turning}
      </group>
    </group>
  );
};
