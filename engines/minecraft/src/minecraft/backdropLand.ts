// The land beyond a set, as data (no React): Backdrop.tsx draws it, scripts/edge_check.mjs ray-casts it.
import type { CBlock, CompiledWorld } from "./types";

type V3 = [number, number, number];
export type BackdropSpec = {
  off?: boolean;
  /** how far the land runs past the set's ground, blocks (default 190) */
  radius?: number;
  /** low hills just past the edge, height in blocks (default 6) */
  hills?: number;
  /** far mountains, height in blocks (default 34) */
  mountains?: number;
  /** "x": a valley running along x (mountains only beyond the set's z edges; the floor runs on along x); "z" likewise */
  valley?: "x" | "z";
  /** forest cover 0..1 (default 0.5) */
  trees?: number;
  /** roads / paths at the set edge run on this many blocks before the hills close in (default 30) */
  carry?: number;
  /** solid landmark boxes (inclusive block coords) of one of the set's blocks, e.g. the dam wall */
  boxes?: { from: V3; to: V3; block: string }[];
  /** clouds (default true); height above the set ground (default 70; negative = below the set, as in "void" mode) */
  clouds?: boolean; cloudY?: number;
  /** several cloud decks instead of the one at cloudY: y above the set ground, cover 0..1 (default 0.4 = the classic
   *  sparse deck), seed. Default in "void" mode: a deck at -26 and a thinner one far below at -62 */
  cloudLayers?: { y: number; cover?: number; seed?: number }[];
  /** "land" (default): the ring of land below. "void": a floating set (sky islands): no land at all, the cloud decks
   *  under the set and a void gradient below the horizon (the dome darkens from the haze to `voidColors`) */
  mode?: "land" | "void" | "ocean";
  /** the sea (R12, mc-raid): water to the horizon at cell y `y` (surface y + 8/9; the set needs one water block so the
   *  water texture loads). "ocean" mode: the whole ring is sea over a seabed that deepens outward to `depth` (default
   *  16). With `coast` (land mode): the ring is sea past the line axis = at on the `sign` side (seabed deepening 1 per
   *  5 blocks), land on the other side, falling to a sand beach at the line (3 blocks per step down) */
  sea?: { y: number; depth?: number; coast?: { axis: "x" | "z"; sign: 1 | -1; at: number } };
  /** void mode: [just under the horizon, straight down] (default ["#6f95d6", "#1c2747"]) */
  voidColors?: [string, string];
  /** a square Minecraft sun in the sky, placed along the scene's sun light (so the G3 `cycle` keys slide it across the
   *  sky). mirror (default true): drawn on the +z side of the sky, in front of the -z cameras (the light itself still
   *  comes from the -z side, so the sets stay front-lit). size: angular size in degrees (default 7). arc: [azimuth,
   *  elevation] scale (default [1, 1]); e.g. [0.25, 0.5] squeezes a G3 day arc (rise far left, noon overhead, set far
   *  right) into a tall frame looking +z: in at the left edge, up to ~35 deg, out at the right */
  sun?: boolean | { mirror?: boolean; size?: number; arc?: [number, number] };
  seed?: number;
};
export type CloudLayer = { y: number; t: number; seed: number };

const hash = (x: number, z: number, s: number) => { const h = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const vnoise = (x: number, z: number, s: number) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x: number, z: number, s: number) => vnoise(x, z, s) * 0.6 + vnoise(x * 2.1, z * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 13) * 0.1;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const upTex = (b: CBlock): string => {
  for (const e of (b as unknown as { elements?: { faces?: Record<string, { tex?: string }> }[] }).elements ?? []) { const t = e.faces?.up?.tex; if (t) return t; }
  return "";
};
const GROUND = /grass_block_top|dirt|path|sand|gravel|stone|cobble|podzol|snow|mud|clay|deepslate|tuff|andesite|granite|diorite/;
const isGround = (b: CBlock) => b.shape === "fluid" || ((b.shape === "cube" || b.shape === "model") && b.layer !== "translucent" && GROUND.test(upTex(b)));
const isSoil = (b: CBlock) => /grass_block_top|block\/dirt$/.test(upTex(b));

/** the backdrop's spec for a world: the file's, or the default for the sky preset (null = none) */
export const specFor = (world: CompiledWorld, file?: BackdropSpec | null): BackdropSpec | null => {
  if (file?.off) return null;
  if (file) return file;
  return ["day", "sunset", "night"].includes(world.sky.preset) ? {} : null;
};

type Inst = Map<CBlock, Map<string, [number, number, number, number]>>; // block -> key -> [x, y, z, scale]

export const buildBackdrop = (w: CompiledWorld, spec: BackdropSpec) => {
  const R = spec.radius ?? 190, HILLS = spec.hills ?? 6, MOUNT = spec.mountains ?? 34, TREES = spec.trees ?? 0.5, CARRY = spec.carry ?? 30, seed = spec.seed ?? 3;
  if (spec.mode === "void") return buildVoid(w, spec, R);
  // the set's ground: top ground block per column, and the rectangle it covers
  const tops = new Map<string, { y: number; b: CBlock }>();
  const yCount = new Map<number, number>();
  for (const b of w.blocks) if (isGround(b)) for (let i = 0; i < b.positions.length; i += 3) {
    const x = b.positions[i], y = b.positions[i + 1], z = b.positions[i + 2], k = `${x},${z}`, t = tops.get(k);
    if (!t || y > t.y) tops.set(k, { y, b });
  }
  if (!tops.size) return null;
  const sea = spec.mode === "ocean" ? { ...(spec.sea ?? { y: -1 }), coast: undefined } : spec.sea;
  for (const t of tops.values()) yCount.set(t.y, (yCount.get(t.y) ?? 0) + 1);
  const groundY = [...yCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const k of tops.keys()) { const [x, z] = k.split(",").map(Number); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const soilBlocks = w.blocks.filter((b) => isGround(b) && isSoil(b));
  const grass = soilBlocks.find((b) => upTex(b).includes("grass_block_top")) ?? soilBlocks[0];
  const dirt = w.blocks.find((b) => b.shape === "cube" && /block\/dirt$/.test(upTex(b))) ?? grass;
  if (!grass && !sea) return null;
  const cubeUp = (re: RegExp) => w.blocks.find((b) => b.shape === "cube" && re.test(upTex(b)));
  const sand = cubeUp(/block\/sand$/) ?? dirt, gravel = cubeUp(/block\/gravel$/) ?? sand;
  const seabed = (dd: number) => (dd >= 3 ? gravel : sand);
  const SD = sea?.depth ?? 16;
  const leaves = w.blocks.find((b) => /leaves/.test(upTex(b)));
  // trunks: oak first (spruce reads as dark pillars in the fog); the side texture tells (the top is the ring)
  const sideTex = (b: CBlock) => { for (const e of (b as unknown as { elements?: { faces?: Record<string, { tex?: string }> }[] }).elements ?? []) { const t = e.faces?.north?.tex; if (t) return t; } return ""; };
  const log = w.blocks.find((b) => /oak_log$/.test(sideTex(b))) ?? w.blocks.find((b) => /birch_log$|spruce_log$/.test(sideTex(b)));
  // the border column a ring cell continues: its ground height and block (roads carry on, soil turns to hills)
  const edgeAt = (x: number, z: number) => {
    const px = Math.max(x0, Math.min(x1, Math.round(x))), pz = Math.max(z0, Math.min(z1, Math.round(z)));
    const t = tops.get(`${px},${pz}`);
    return t ?? { y: groundY, b: grass };
  };
  /** top surface (the y the top cube ends at) and the block on top, for a cell of size s centred at (cx, cz) */
  const land = (cx: number, cz: number, s: number): { top: number; b: CBlock | undefined; d: number; road: boolean; wet?: boolean } => {
    const ox = Math.max(x0 - cx, 0, cx - (x1 + 1)), oz = Math.max(z0 - cz, 0, cz - (z1 + 1)), d = Math.hypot(ox, oz);
    const e = edgeAt(cx, cz);
    if (sea && spec.mode === "ocean") { // open sea: the seabed falls away from the set's edge
      const dd = Math.min(SD, sea.y - e.y + Math.floor(d / 6));
      return { top: Math.min(e.y + 1, sea.y + 1 - Math.max(1, dd)), b: seabed(dd), d, road: false, wet: true };
    }
    const cst = sea?.coast, c = cst ? cst.sign * ((cst.axis === "x" ? cx : cz) - cst.at) : -Infinity;
    if (sea && cst && c >= 0) { // seaward of the shore line
      const dd = Math.min(SD, 1 + Math.floor(c / 5));
      return { top: sea.y + 1 - dd, b: seabed(dd), d, road: false, wet: true };
    }
    const road = !isSoil(e.b) && e.b.shape !== "fluid" && (ox === 0 || oz === 0) && d < CARRY;
    const quiet = road ? 0 : 1;
    const k = cst ? smooth(0, 40, -c) : 1; // flat toward the shore
    const hills = k * smooth(3, 40, d) * HILLS * fbm(cx / 26, cz / 26, seed) * quiet;
    const dm = spec.valley === "x" ? oz : spec.valley === "z" ? ox : d;
    const mount = k * smooth(26, 150, dm) * MOUNT * (0.5 + 0.5 * fbm(cx / 70, cz / 70, seed + 31));
    const H = Math.max(0, Math.round((hills + mount) / s) * s);
    if (sea && cst) { // the land falls to the beach: one block per 3 toward the line
      const coastP = sea.y + 1 + Math.floor(-c / 3);
      if (coastP <= sea.y + 2) return { top: Math.min(e.y + 1 + H, coastP), b: sand, d, road: false };
      return { top: Math.min(e.y + 1 + H, coastP), b: road && H === 0 ? e.b : grass, d, road };
    }
    return { top: e.y + 1 + H, b: road && H === 0 ? e.b : grass, d, road };
  };
  // sea surface quads [x, z, size] at sea.y + 8/9: ring cells whose ground is under the sea, and the set's own columns
  // where the sea cell is open (no block there)
  const seaQuads: [number, number, number][] = [];

  const inst: Inst = new Map();
  const put = (b: CBlock | undefined, x: number, y: number, z: number, s: number) => {
    if (!b) return;
    let m = inst.get(b); if (!m) inst.set(b, (m = new Map()));
    m.set(`${x},${y},${z},${s}`, [x, y, z, s]);
  };
  const tree = (x: number, y: number, z: number, s: number, r: number) => {
    const h = (4 + Math.floor(r * 2.99)) * s;
    for (let k = 0; k < h; k += s) put(log, x, y + k, z, s);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const dy of [h - s, h]) if (!(Math.abs(i) === 2 && Math.abs(j) === 2 && dy === h)) put(leaves, x + i * s, y + dy, z + j * s, s);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) put(leaves, x + i * s, y + h + s, z + j * s, s);
    put(leaves, x, y + h + 2 * s, z, s);
  };
  const inside = (x: number, z: number, s: number) => x + s > x0 && x < x1 + 1 && z + s > z0 && z < z1 + 1;
  const cell = (x: number, z: number, s: number) => {
    if (inside(x, z, s)) return;
    const c = land(x + s / 2, z + s / 2, s);
    // fill down to the lowest neighbour so no side face is left open (at least one cube under the top)
    let low = c.top - 2 * s;
    for (const [dx, dz] of [[s, 0], [-s, 0], [0, s], [0, -s]]) {
      if (inside(x + dx, z + dz, s)) continue;
      low = Math.min(low, land(x + dx + s / 2, z + dz + s / 2, s).top - s);
    }
    put(c.b, x, c.top - s, z, s);
    for (let y = c.top - 2 * s; y >= low; y -= s) put(c.wet ? c.b : dirt, x, y, z, s);
    if (sea && c.top <= sea.y) seaQuads.push([x, z, s]);
    // forest patches (never on the carried roads, never right at the set's edge, never under the sea)
    if (c.wet || c.road || c.d < 14 || !leaves || !log) return;
    const forest = fbm((x + 400) / 34, (z + 400) / 34, seed + 5);
    if (forest < 0.66 - 0.2 * TREES) return;
    const r = hash(x, z, seed + 9);
    if (s === 4) { if (r < 0.55) put(leaves, x, c.top, z, s); return; }
    // real-size trees out to the 4-block ring (scaled-up trees read as a wall of giants)
    if (r < (s === 1 ? 0.03 : 0.1) * (0.5 + TREES)) tree(x, c.top, z, 1, hash(z, x, seed + 2));
  };
  const step = 4, gx0 = Math.floor((x0 - R) / step) * step, gz0 = Math.floor((z0 - R) / step) * step;
  for (let X = gx0; X <= x1 + R; X += step) for (let Z = gz0; Z <= z1 + R; Z += step) {
    const ox = Math.max(x0 - (X + 2), 0, X + 2 - (x1 + 1)), oz = Math.max(z0 - (Z + 2), 0, Z + 2 - (z1 + 1)), d = Math.hypot(ox, oz);
    if (d > R) continue;
    const s = d < 40 ? 1 : d < 90 ? 2 : 4;
    for (let i = 0; i < step; i += s) for (let j = 0; j < step; j += s) cell(X + i, Z + j, s);
  }
  for (const bx of spec.boxes ?? []) {
    const b = w.blocks.find((q) => q.key === bx.block);
    if (!b) continue;
    const [a, c] = [bx.from, bx.to];
    const s = 2; // landmarks are far: 2-block cubes
    for (let x = Math.min(a[0], c[0]); x <= Math.max(a[0], c[0]); x += s) for (let y = Math.min(a[1], c[1]); y <= Math.max(a[1], c[1]); y += s) for (let z = Math.min(a[2], c[2]); z <= Math.max(a[2], c[2]); z += s) {
      // only the shell: the inside is never seen
      const edge = x - Math.min(a[0], c[0]) < s || Math.max(a[0], c[0]) - x < s || y - Math.min(a[1], c[1]) < s || Math.max(a[1], c[1]) - y < s || z - Math.min(a[2], c[2]) < s || Math.max(a[2], c[2]) - z < s;
      if (edge) put(b, x, y, z, s);
    }
  }
  let seaOut: { y: number; quads: [number, number, number][]; block: CBlock } | null = null;
  const water = sea ? w.blocks.find((b) => b.shape === "fluid" && b.id === "water") : undefined;
  if (sea && water) {
    const filled = new Set<string>();
    for (const b of w.blocks) for (let i = 0; i < b.positions.length; i += 3) if (b.positions[i + 1] === sea.y) filled.add(`${b.positions[i]},${b.positions[i + 2]}`);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!filled.has(`${x},${z}`)) seaQuads.push([x, z, 1]);
    seaOut = { y: sea.y + 8 / 9, quads: seaQuads, block: water };
  }
  return { inst, groundY, rect: [x0, x1, z0, z1] as const, clouds: spec.clouds !== false, cloudY: groundY + 1 + (spec.cloudY ?? 70), cloudLayers: layersFor(spec, groundY), R, land, sea: seaOut };
};

/** the cloud decks in world y: the spec's list, or the one classic deck at cloudY (threshold 0.6 = cover 0.4) */
const layersFor = (spec: BackdropSpec, groundY: number): CloudLayer[] => {
  const list = spec.cloudLayers ?? (spec.mode === "void" && spec.cloudY === undefined ? [{ y: -26, cover: 0.42 }, { y: -62, cover: 0.3, seed: 91 }] : [{ y: spec.cloudY ?? 70 }]);
  return list.map((l) => ({ y: groundY + 1 + l.y, t: 1 - (l.cover ?? 0.4), seed: l.seed ?? 77 }));
};

/** "void" mode: the set floats. No land, just the cloud decks under it (Backdrop.tsx adds the void dome) */
const buildVoid = (w: CompiledWorld, spec: BackdropSpec, R: number) => {
  const yCount = new Map<number, number>();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const tops = new Map<string, number>();
  for (const b of w.blocks) if (isGround(b)) for (let i = 0; i < b.positions.length; i += 3) {
    const x = b.positions[i], y = b.positions[i + 1], z = b.positions[i + 2], k = `${x},${z}`;
    if ((tops.get(k) ?? -Infinity) < y) tops.set(k, y);
  }
  if (!tops.size) return null;
  for (const [k, y] of tops) { const [x, z] = k.split(",").map(Number); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); yCount.set(y, (yCount.get(y) ?? 0) + 1); }
  const groundY = [...yCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const land = (_cx: number, _cz: number, _s: number) => ({ top: -999, b: undefined as CBlock | undefined, d: Infinity, road: false });
  return { inst: new Map() as Inst, groundY, rect: [x0, x1, z0, z1] as const, clouds: spec.clouds !== false, cloudY: groundY + 1 + (spec.cloudY ?? -26), cloudLayers: layersFor(spec, groundY), R, land, sea: null as { y: number; quads: [number, number, number][]; block: CBlock } | null };
};
