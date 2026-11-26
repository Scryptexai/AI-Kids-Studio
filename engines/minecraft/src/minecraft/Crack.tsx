// CRACK (The Tapper's block-state language): a BLACK jagged STAIRCASE that runs along the block edges (the mortar
// lines) in axis-aligned steps, 1 block over or 1 block up, one block step per `rate` frames (default 2). Drawn in
// 1/16-block pixels like the game's own crack art: a near-black core about 4 px wide that jogs a pixel off
// the seam now and then, light chipped-stone pixels bitten out along both edges, and a 1 px crack FACE on the upper
// (or +u) side that turns GLASSY (pale glass-grey with a slow sheen, never blue) a few frames after it opens. Every
// step throws stone chips off the face; the first `burst` steps open at once (the hard-cut impact, with a dust puff).
// `zip` closes it again bottom to top, each block flashing SOLID white as the front passes.
// Pure function of the frame: pixel and chip times come from the seed, so any frame renders alone.
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { Motes, type Mote } from "./Build";
import { FACE, c01, faceRot, facePlane, facePoint, rnd, softDot, type FaceDir, type V3 } from "./fxCommon";

export type CrackSpec = {
  /** the side of the wall the crack is drawn on ("-z" = the face looking toward -z) */
  face: FaceDir;
  /** start block [x, y, z] (a block whose `face` side is the wall surface); the crack starts at its trailing corner */
  from: V3;
  /** block steps (default 12) */
  steps?: number;
  /** overall heading on the face [du, dv]: u = world x on z faces (world z on x faces), v = up. Default [0.5, 1]
   *  (up and to +u, more up than across). Each step goes one block along u OR v, picked by the seed in this ratio. */
  go?: [number, number];
  /** instead of from/steps/go: the cells in order as [u, v] (u = x or z, v = y); consecutive cells share an edge */
  path?: [number, number][];
  /** frame of the first step (the crack's first pixel) */
  f: number;
  /** frames per block step (default 2) */
  rate?: number;
  /** steps that open together at f (the impact burst, default 0); the rest follow at `rate` */
  burst?: number;
  /** crack width in pixels of 1/16 block (default 5: a 4 px black core + the 1 px glassy face). 5 reads from a
   *  wide shot of a 40-block dam at 1080x1920; 3 is a hairline for close-ups */
  width?: number;
  /** the core colour (default "#241d05": through the house Minecraft grade (McPost lifts blacks and tints shadows
   *  blue) it lands a neutral near-black, about #2b292e on screen; a plain #141414 reads navy there) */
  color?: string;
  /** light chipped-stone pixels bitten out along both edges (default "#b2ada3"); false = none */
  edge?: string | false;
  /** stone chips thrown per step (default 2; burst steps x3) */
  chips?: number;
  chipColor?: string;
  /** the crack face's GLASSY colour (default "#d9dbd6", pale glass-grey: no blue); false = the face stays dark */
  glassy?: string | false;
  /** frames after a pixel opens until its face shows glassy (default 6), or an absolute frame via `glassyAt` */
  glassyDelay?: number; glassyAt?: number;
  /** close the crack bottom to top from f over len frames (default steps * 1.5), SOLID white flash per block */
  zip?: { f: number; len?: number; flash?: boolean };
  /** short side branches along the mortar (count, default steps / 5) */
  branches?: number;
  seed?: number;
  /** the face plane coordinate (default from `from` and `face`) */
  plane?: number;
};

/** pixel class: 0 core (black), 1 crack face (turns glassy), 2 chipped edge (light stone) */
type Px = { x: number; y: number; t: number; k: 0 | 1 | 2; sh: number };
type Built = { px: Px[]; cells: { u: number; v: number; t: number }[]; vmin: number; vmax: number; chipsAt: { t: number; x: number; y: number; n: number; burst: boolean }[] };

/** the crack's cells, in order */
export const crackCells = (s: CrackSpec): [number, number][] => {
  if (s.path?.length) return s.path;
  const F = FACE[s.face], seed = s.seed ?? 7;
  const go = s.go ?? [0.5, 1], steps = s.steps ?? 12;
  const pv = Math.abs(go[1]) / (Math.abs(go[0]) + Math.abs(go[1]) || 1);
  let u = s.from[F.axis === 2 ? 0 : 2], v = s.from[1];
  const out: [number, number][] = [[u, v]];
  let lastV = true;
  for (let i = 1; i < steps; i++) {
    // never two sideways steps in a row when the heading is mostly up (keeps the staircase look)
    let vert = rnd(seed, i * 3.1) < pv;
    if (!vert && !lastV && pv > 0.4) vert = true;
    if (vert) v += Math.sign(go[1] || 1); else u += Math.sign(go[0] || 1);
    lastV = vert;
    out.push([u, v]);
  }
  return out;
};

const build = (s: CrackSpec): Built => {
  const cells = crackCells(s), seed = s.seed ?? 7, rate = s.rate ?? 2, burst = s.burst ?? 0;
  const w = Math.max(2, Math.round(s.width ?? 5)), oMin = -Math.floor(w / 2), oMax = w - 1 + oMin;
  const tStep = (i: number) => (i < burst ? s.f + (i / Math.max(1, burst)) * 1.5 : s.f + 1.5 * (burst > 0 ? 1 : 0) + (i - burst) * rate);
  // block-edge vertices: start at the first cell's trailing corner, then one block edge per step (the seam between
  // the cells), so the line runs along the mortar: across a block's top edge, up a block's side edge, ...
  const ds = cells.slice(1).map((c, i) => [c[0] - cells[i][0], c[1] - cells[i][1]] as [number, number]);
  const su = Math.sign(ds.find((d) => d[0])?.[0] ?? s.go?.[0] ?? 1) || 1, sv = Math.sign(ds.find((d) => d[1])?.[1] ?? s.go?.[1] ?? 1) || 1;
  const verts: [number, number][] = [[cells[0][0] + (su > 0 ? 0 : 1), cells[0][1] + (sv > 0 ? 0 : 1)]];
  // a single-cell crack still gets one edge: up the block's side
  for (const d of ds.length ? ds : [[0, sv] as [number, number]]) {
    const [x, y] = verts[verts.length - 1];
    verts.push([x + Math.sign(d[0]), y + Math.sign(d[1])]);
  }
  const map = new Map<string, Px>();
  const put = (x: number, y: number, t: number, k: 0 | 1 | 2) => {
    const key = `${x},${y}`, o = map.get(key);
    if (!o) map.set(key, { x, y, t, k, sh: rnd(x * 0.37 + y * 1.13, seed) });
    else { o.t = Math.min(o.t, t); if (k < o.k) o.k = k; }
  };
  const chipsAt: Built["chipsAt"] = [];
  const cellT: Built["cells"] = [];
  const centre: { x: number; y: number; px: number; py: number; t: number }[] = [];
  // the centre line, pixel by pixel: straight along the seam with 1 px jogs (never more than 1 px off it)
  let cx = verts[0][0] * 16, cy = verts[0][1] * 16;
  for (let i = 0; i < verts.length - 1; i++) {
    const t0 = tStep(i), t1 = i < burst ? t0 + 0.5 : t0 + rate;
    const [ax, ay] = [Math.sign(verts[i + 1][0] - verts[i][0]), Math.sign(verts[i + 1][1] - verts[i][1])];
    const px = ay ? 1 : 0, py = ax ? 1 : 0;  // the perpendicular (always toward +u or +v)
    const seam = ax ? verts[i][1] * 16 : verts[i][0] * 16;
    const end = ax ? verts[i + 1][0] * 16 : verts[i + 1][1] * 16;
    const j1 = 3 + Math.floor(rnd(seed, 20 + i) * 5), j2 = 9 + Math.floor(rnd(seed, 30 + i) * 5);
    const len = Math.abs(end - (ax ? cx : cy)) || 1;
    let j = 0;
    const push = () => centre.push({ x: cx, y: cy, px, py, t: t0 + (t1 - t0) * Math.min(1, j / len) });
    push();
    while ((ax ? cx : cy) !== end) {
      if (ax) cx += ax; else cy += ay;
      j++;
      push();
      if (j === j1 || (j === j2 && rnd(seed, 40 + i) < 0.7)) {
        // jog one pixel off the seam (or back onto it), axis-aligned
        const cur = (ax ? cy : cx) - seam;
        const nxt = cur !== 0 ? 0 : rnd(seed, 50 + i * 2 + (j === j2 ? 1 : 0)) < 0.5 ? -1 : 1;
        if (ax) cy = seam + nxt; else cx = seam + nxt;
        push();
      }
    }
    cellT.push({ u: cells[i]?.[0] ?? cells[0][0], v: cells[i]?.[1] ?? cells[0][1], t: t0 });
    chipsAt.push({ t: t0, x: cx, y: cy, n: (s.chips ?? 2) * (i < burst ? 3 : 1), burst: i < burst });
  }
  if (cells.length > verts.length - 1) cells.slice(verts.length - 1).forEach((c) => cellT.push({ u: c[0], v: c[1], t: tStep(cells.length - 1) }));
  // the brush: w px across the run; the +side pixel is the crack face (glassy), the rest the black core;
  // the width wobbles by a pixel, chipped light stone sits outside both edges
  centre.forEach((c, n) => {
    const r = (q: number) => rnd(seed * 31 + n * 0.71, q);
    for (let o = oMin; o <= oMax; o++) {
      if (o === oMin && r(1) < 0.22) continue;  // narrower here
      put(c.x + c.px * o, c.y + c.py * o, c.t, o === oMax && w >= 3 ? 1 : 0);
    }
    if (r(2) < 0.18) put(c.x + c.px * (oMin - 1), c.y + c.py * (oMin - 1), c.t + 0.5, 0);  // a bite into the stone
    if (s.edge !== false) {
      if (r(3) < 0.4) put(c.x + c.px * (oMin - 1), c.y + c.py * (oMin - 1), c.t + 0.5, 2);
      if (r(4) < 0.12) put(c.x + c.px * (oMin - 2), c.y + c.py * (oMin - 2), c.t + 0.5, 2);
      if (r(5) < 0.35) put(c.x + c.px * (oMax + 1), c.y + c.py * (oMax + 1), c.t + 0.5, 2);
    }
  });
  // fill the outside of each corner (a w x w block of core at every vertex)
  verts.forEach((v, i) => {
    const t = centre.find((c) => c.x === v[0] * 16 && c.y === v[1] * 16)?.t ?? tStep(Math.max(0, i - 1));
    for (let a = oMin; a <= oMax; a++) for (let b = oMin; b <= oMax; b++) put(v[0] * 16 + a, v[1] * 16 + b, t, 0);
  });
  // side branches: short spurs along the mortar, perpendicular to the run, 3-6 px, 2 px wide, chipped tip
  const nb = s.branches ?? Math.floor(cells.length / 5);
  for (let b = 0; b < nb && centre.length; b++) {
    const c = centre[Math.floor(rnd(seed, 60 + b) * centre.length)];
    const len = 3 + Math.floor(rnd(seed, 70 + b) * 4), dir = rnd(seed, 80 + b) < 0.5 ? -1 : 1;
    const start = dir > 0 ? oMax + 1 : oMin - 1;
    for (let j = 0; j < len; j++) {
      const o = start + dir * j, t = c.t + j * 0.4;
      // the spur's own 1 px jog halfway
      const sx = j >= len / 2 ? c.py : 0, sy = j >= len / 2 ? c.px : 0;
      put(c.x + c.px * o + sx, c.y + c.py * o + sy, t, 0);
      put(c.x + c.px * o + sx + c.py, c.y + c.py * o + sy + c.px, t, 0);
    }
    if (s.edge !== false) put(c.x + c.px * (start + dir * len), c.y + c.py * (start + dir * len), c.t + len * 0.4, 2);
  }
  const px = [...map.values()];
  const vs = px.map((p) => p.y);
  return { px, cells: cellT, vmin: Math.min(...vs), vmax: Math.max(...vs), chipsAt };
};

const PIX = new THREE.PlaneGeometry(1 / 16, 1 / 16);
const CELLQ = new THREE.PlaneGeometry(1.02, 1.02);
const G = 18;

const CrackOne: React.FC<{ s: CrackSpec; i: number }> = ({ s, i }) => {
  const frame = useMcFrame();
  const b = useMemo(() => build(s), [s]);
  const plane = s.plane ?? facePlane(s.from, s.face);
  const rot = faceRot(s.face);
  const ink = s.color ?? "#241d05";
  const glassy = s.glassy === false ? null : new THREE.Color(s.glassy ?? "#d9dbd6");
  const { core, face, edge } = useMemo(() => {
    const mk = (color: string, tint: boolean) => {
      const m = new THREE.InstancedMesh(PIX, new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }), Math.max(1, b.px.length));
      if (tint) m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.frustumCulled = false; m.renderOrder = 4;
      return m;
    };
    return { core: mk(ink, false), face: mk(ink, false), edge: mk("#ffffff", true) };
  }, [b, ink]);
  const zipLen = s.zip ? s.zip.len ?? Math.max(8, b.cells.length * 1.5) : 0;
  const zipT = (y: number) => (s.zip ? s.zip.f + zipLen * ((y - b.vmin) / Math.max(1, b.vmax - b.vmin)) : Infinity);
  // the pixels this frame
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), one = new THREE.Vector3(1, 1, 1);
  const edgeCol = new THREE.Color(s.edge || "#b2ada3"), tmp = new THREE.Color();
  let nc = 0, nf = 0, ne = 0;
  for (const p of b.px) {
    if (frame < p.t || frame >= zipT(p.y)) continue;
    const pos = facePoint(s.face, plane, (p.x + 0.5) / 16, (p.y + 0.5) / 16, 0.006);
    mx.compose(new THREE.Vector3(...pos), q, one);
    if (p.k === 0) core.setMatrixAt(nc++, mx);
    else if (p.k === 1) face.setMatrixAt(nf++, mx);
    else { edge.setColorAt(ne, tmp.copy(edgeCol).multiplyScalar(0.86 + p.sh * 0.22)); edge.setMatrixAt(ne++, mx); }
  }
  core.count = nc; face.count = nf; edge.count = ne;
  core.instanceMatrix.needsUpdate = face.instanceMatrix.needsUpdate = edge.instanceMatrix.needsUpdate = true;
  if (edge.instanceColor) edge.instanceColor.needsUpdate = true;
  // the crack face: a dark stone grey when it opens, then pale GLASSY with a slow sheen running along it
  const faceMat = face.material as THREE.MeshBasicMaterial;
  faceMat.color.set("#3a342a");
  if (glassy) {
    const k = c01((frame - (s.glassyAt ?? s.f + (s.glassyDelay ?? 6))) / 8);
    faceMat.color.lerp(glassy, k * (0.82 + 0.18 * Math.sin(frame / 5 + i)));
  }
  // chips off the face (ballistic, fading), dust puffs on the burst
  const motes: Mote[] = [];
  const F = FACE[s.face];
  const puffs: React.ReactNode[] = [];
  b.chipsAt.forEach((c, ci) => {
    const u = frame - c.t;
    if (u < 0 || u > 26) return;
    const t = u / 30;
    for (let k = 0; k < c.n; k++) {
      const sd = i * 1000 + ci * 17 + k;
      const out = 1.2 + rnd(sd, 1) * 2.4, side = (rnd(sd, 2) - 0.5) * 2.6, up = 0.6 + rnd(sd, 3) * 2.2;
      const p0 = facePoint(s.face, plane, c.x / 16, c.y / 16, 0.05);
      const pos: V3 = [
        p0[0] + (F.n[0] * out + F.u[0] * side) * t,
        p0[1] + up * t - 0.5 * G * t * t,
        p0[2] + (F.n[2] * out + F.u[2] * side) * t,
      ];
      const sz = (0.05 + rnd(sd, 4) * 0.07) * (u > 18 ? 1 - (u - 18) / 8 : 1);
      const shade = 0.75 + rnd(sd, 5) * 0.4;
      const col = new THREE.Color(s.chipColor ?? "#8d8d8d").multiplyScalar(shade);
      motes.push({ p: pos, s: sz, c: `#${col.getHexString()}`, r: t * 10 * rnd(sd, 6) });
    }
    if (c.burst && u < 16) {
      const k = u / 16;
      const p0 = facePoint(s.face, plane, c.x / 16, c.y / 16, 0.25 + 0.4 * k);
      puffs.push(<sprite key={`p${ci}`} position={p0} scale={[0.6 + 1.2 * k, 0.6 + 1.2 * k, 1]} renderOrder={18}>
        <spriteMaterial map={softDot()} color="#cfc8bc" transparent opacity={0.55 * (1 - k)} depthWrite={false} />
      </sprite>);
    }
  });
  // SOLID flash per block as the zip front passes it (2 f full, 4 f fade), white
  const flashes: React.ReactNode[] = [];
  if (s.zip && s.zip.flash !== false) b.cells.forEach((c, ci) => {
    const t = zipT(c.v * 16 + 8), u = frame - t;
    if (u < 0 || u > 6) return;
    const k = u <= 2 ? 1 : 1 - (u - 2) / 4;
    flashes.push(<mesh key={`z${ci}`} geometry={CELLQ} position={facePoint(s.face, plane, c.u + 0.5, c.v + 0.5, 0.01)} rotation={rot} renderOrder={6}>
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85 * k} toneMapped={false} depthWrite={false} />
    </mesh>);
  });
  return (
    <>
      {nc > 0 && <primitive object={core} />}
      {nf > 0 && <primitive object={face} />}
      {ne > 0 && <primitive object={edge} />}
      {motes.length > 0 && <Motes motes={motes} />}
      {puffs}
      {flashes}
    </>
  );
};

export const Cracks: React.FC<{ specs: CrackSpec[] }> = ({ specs }) => <>{specs.map((s, i) => <CrackOne key={i} s={s} i={i} />)}</>;
