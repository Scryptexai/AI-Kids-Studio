// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing. Characters are yaw-only billboards shaded by cardShade(); standing
// ones get a soft multiply contact blob. Effects (flames, glows, letters, the map, riders) are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import { Pen, bodyFront, bodySide, fxPuff, fxContact, fxShadow, Outfit, Expr, FrontOpts, SideOpts, Prop } from "./toon";
import {
  BASKARA, ARYA, KALANG, WIRATAMA, SEKAR, BAYU, COURIER, MAID, GUARD, OLD_COURT, NEW_COURT, FOLK,
  fxMap, fxFlame, fxGlow, fxRider, fxRiderBack, fxCracks, fxLetter, fxScroll, fxQuill, fxKamboja, fxCoins,
} from "./royalfx";
import { FPS, SHOTS, SH, AT, V3, smooth, clamp01, brickOut } from "./story";
import { HALL, HOLE, TOMB, TABLE, TABLE_H, COURIER_DESK, PATIH_DESK, DESK_H, WALL, RACK_X } from "./layout";
import { LANTERNS, CANDLES, HEARTH_FIRE } from "./palace";
import type { LightName } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
const ROOTS = new Set<THREE.Object3D>();

export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false;
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (glow, dust) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; add: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false;
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // glows: additive and over-bright, so the bloom pass picks them up at night
    this.add = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.6, 1.6) });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(mode: "cut" | "soft" | "add", tint = 1) {
    this.mesh.material = mode === "soft" ? this.soft : mode === "add" ? this.add : this.mat;
    this.mat.color.setScalar(tint);
  }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.add.map = t; this.mesh.renderOrder = this.mesh.material === this.add ? 2 : 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number;
  flat?: boolean; rot?: number; mode?: "cut" | "soft" | "add"; tint?: number;
  /** upright card fixed to a wall, facing world yaw (instead of facing the lens) */
  wallYaw?: number };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: LightName = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
const LEAD = 2 / FPS;
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number) => {
  const f = Math.round(t * FPS);
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13));
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
/** expression by time: [[from-word-time (s), expr], ...]; changes land LEAD before the word */
const exprAt = (t: number, seq: [number, Expr][]) => { let e = seq[0][1]; for (const [ts, x] of seq) if (t >= ts / FPS - LEAD) e = x; return e; };

type Who = { i: number; o: Outfit; okey: string };
const W = {
  baskara: { i: 1, o: BASKARA, okey: "bas" }, arya: { i: 2, o: ARYA, okey: "arya" }, kalang: { i: 3, o: KALANG, okey: "kal" },
  wira: { i: 4, o: WIRATAMA, okey: "wira" }, sekar: { i: 5, o: SEKAR, okey: "sekar" }, bayu: { i: 6, o: BAYU, okey: "bayu" },
  courier: { i: 7, o: COURIER, okey: "kurir" }, maid: { i: 8, o: MAID, okey: "maid" },
} satisfies Record<string, Who>;
const guard = (i: number): Who => ({ i: 40 + i, o: GUARD, okey: "guard" });

const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = (who.i % 7) + 1;
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return { key, x, y, z, scale, mirror, draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)), size: [w, h, k] };
};

const CONTACT: Record<LightName, [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], night: [0.12, 0.13, 0.24] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h;
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.075, z: z + oz * c, w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.08, z: z + oz * 0.03 * sc, w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- staging helpers ----------------
type Opt = { expr?: Expr; prop?: Prop; arm?: FrontOpts["arm"]; mode?: FrontOpts["mode"]; wave?: number; look?: number; headTilt?: number; scale?: number; noBlob?: boolean; lid?: number };
/** someone standing (or sitting) facing the lens */
const stand = (out: Stage, cam: CamInfo, t: number, who: Who, at: V3, o: Opt = {}) => {
  const fo: FrontOpts = { mode: o.mode ?? "stand", expr: o.expr ?? "neutral", prop: o.prop ?? null, arm: o.arm, wave: o.wave, look: o.look ?? 0,
    headTilt: o.headTilt ?? 0, blink: o.lid ?? lidAt(t, who.i) };
  out.places.push(person(cam, who, at[0], at[1], at[2], { side: false, mirror: false }, fo, {}, o.scale ?? 1));
  if (!o.noBlob && fo.mode !== "sit") blob(out, at[0], at[1], at[2], o.scale ?? 1);
};
/** someone in profile facing world direction (dx, dz) (ears on the wall, pacing) */
const profile = (out: Stage, cam: CamInfo, t: number, who: Who, at: V3, dx: number, dz: number, so: SideOpts = {}) => {
  const mirror = dx * cam.right.x + dz * cam.right.z < 0;
  out.places.push(person(cam, who, at[0], at[1], at[2], { side: true, mirror }, {}, { mode: "stand", blink: lidAt(t, who.i), ...so }));
  blob(out, at[0], at[1], at[2]);
};
/** someone walking from a to b over [t0, t1] (s); front view when coming at the lens, profile otherwise */
const walk = (out: Stage, cam: CamInfo, t: number, who: Who, a: V3, b: V3, t0: number, t1: number, o: Opt = {}) => {
  const u = clamp01((t - t0) / (t1 - t0)), x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, v = L / (t1 - t0);
  const phase = q(((t * v) / 1.4 + hh(who.i, 5)) % 1, 120), view = viewOf(cam, x, z, dx / L, dz / L), moving = u > 0 && u < 1;
  const fo: FrontOpts = { mode: moving ? "stroll" : "stand", phase, expr: o.expr ?? "neutral", look: 0, blink: lidAt(t, who.i), prop: o.prop ?? null };
  const so: SideOpts = { mode: moving ? "march" : "stand", phase, expr: o.expr ?? "neutral", stomp: 0.55, stride: 0.875 * view.fs, blink: lidAt(t, who.i) };
  out.places.push(person(cam, who, x, y, z, view, fo, so, o.scale ?? 1));
  blob(out, x, y, z, o.scale ?? 1);
};
/** a flat card lying on a surface (letters, the map, coins, flowers) */
const flat = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, at: V3, w: number, rot = 0) =>
  out.fx.push({ key, cw, ch, draw, x: at[0], y: at[1], z: at[2], w, h: (w * ch) / cw, flat: true, rot });
/** warm glow at a lamp (night only; small by day) */
const glow = (out: Stage, at: V3, size: number, k = 1) =>
  out.fx.push({ key: "glow", cw: 256, ch: 256, draw: (p) => fxGlow(p), x: at[0], y: at[1], z: at[2], w: size, h: size, mode: "add", tint: k });
const flame = (out: Stage, t: number, at: V3, h: number) => {
  const ph = q((t * 3.7) % 1, 12);
  out.fx.push({ key: `flame${ph}`, cw: 120, ch: 200, draw: (p) => fxFlame(p, ph * 1.7), x: at[0], y: at[1] + h * 0.45, z: at[2], w: h * 0.6, h, mode: "cut", tint: 1.8 });
};
const puff = (out: Stage, t: number, t0: number, at: V3, size = 1.6) => {
  const u = (t - t0) / 0.5;
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `puff${q(u, 20)}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, q(u, 20)), x: at[0], y: at[1] + 0.9, z: at[2] + 0.05, w: size, h: size, mode: "soft" });
};
const lamps = (out: Stage, cam: CamInfo, t: number) => {
  if (LNAME !== "night") return;
  for (const l of LANTERNS) if (cam.pos.distanceTo(tmp.set(...l)) < 40) glow(out, l, 1.5);
  for (const c of CANDLES) if (cam.pos.distanceTo(tmp.set(...c)) < 12) { flame(out, t, c, 0.13); glow(out, [c[0], c[1] + 0.08, c[2]], 1.0); }
};
const hearth = (out: Stage, t: number) => {
  for (let i = 0; i < 3; i++) flame(out, t + i * 0.37, [HEARTH_FIRE[0] - 0.25 + i * 0.25, HEARTH_FIRE[1], HEARTH_FIRE[2]], 0.34 - (i % 2) * 0.08);
  glow(out, [HEARTH_FIRE[0], HEARTH_FIRE[1] + 0.2, HEARTH_FIRE[2]], LNAME === "night" ? 2.2 : 1.0, LNAME === "night" ? 1 : 0.5);
};
// flat cards: rot 0 puts the drawing's top toward -z, so a lens looking +z needs PI and one looking -x needs PI / 2
const tableProps = (out: Stage, hi = 0) => {
  flat(out, `map${hi}`, 800, 600, (p) => fxMap(p, hi), [TABLE[0] - 0.1, TABLE_H + 0.004, TABLE[2] - 0.1], 1.0, Math.PI + 0.05);
};
/** cracked plaster round the hole, on the alley face (alley) or the hall face */
const cracks = (out: Stage, alley: boolean) =>
  out.fx.push({ key: "cracks", cw: 400, ch: 400, draw: fxCracks, x: HOLE[0], y: HOLE[1], z: alley ? HALL.wallZ1 + 0.008 : HALL.wallZ - 0.008, w: 1.1, h: 1.1,
    wallYaw: alley ? 0 : Math.PI, mode: "cut" });
const kamboja = (out: Stage) => {
  for (const [dx, dz, r] of [[-0.5, 0.1, 0.2], [0.1, -0.2, 1.1], [0.55, 0.15, 2.0], [-0.1, 0.25, 2.9], [0.3, -0.05, 0.6]] as const)
    flat(out, "kamboja", 160, 160, fxKamboja, [TOMB[0] + dx, 0.705, TOMB[2] + dz], 0.16, r);
};

// ---------------- who is where, shot by shot ----------------
const HT = HALL.top;
const crowd = (out: Stage, cam: CamInfo, t: number, cheer: boolean, generals = true) => {
  for (let i = 0; i < 34; i++) {
    const row = Math.floor(i / 7), col = i % 7;
    const x = -6.6 + col * 2.2 + (row % 2) * 1.1 + (hh(i) - 0.5) * 0.5, z = 9.2 - row * 1.9 + (hh(i, 2) - 0.5) * 0.4;
    if (row === 0 && col >= 2 && col <= 4) continue; // the generals' places
    const who: Who = { i: 100 + i, o: FOLK[i % 6], okey: `folk${i % 6}` };
    const wave = cheer && i % 3 !== 1 ? q(Math.sin(t * 9 + i * 1.3), 20) : undefined;
    const hop = cheer && i % 4 === 0 ? Math.max(0, Math.sin(t * 7 + i)) * 0.12 : 0;
    stand(out, cam, t, who, [x, hop, z], { expr: (["smile", "grin", "smile_closed", "laugh"] as Expr[])[i % 4], wave });
  }
  if (!generals) return;
  const gx = (k: number) => -6.6 + (2 + k) * 2.2 + 0.0;
  stand(out, cam, t, W.sekar, [gx(0), 0, 9.25], { expr: cheer ? "smile" : "neutral", wave: cheer ? q(Math.sin(t * 8), 20) : undefined });
  stand(out, cam, t, W.wira, [gx(1), 0, 9.3], { expr: cheer ? "smile_closed" : "neutral", arm: cheer ? "chest" : undefined });
  stand(out, cam, t, W.bayu, [gx(2), 0, 9.2], { expr: cheer ? "grin" : "neutral", wave: cheer ? q(Math.sin(t * 9 + 2), 20) : undefined });
};
const throne = (out: Stage, cam: CamInfo, t: number, bas: Expr, arya: Expr | null, kalang: Expr | null) => {
  stand(out, cam, t, W.baskara, AT.baskaraThrone, { mode: "sit", expr: bas });
  if (arya) stand(out, cam, t, W.arya, AT.aryaThrone, { expr: arya, lid: Math.min(lidAt(t, 2), t > 2330 / FPS ? 0 : 1) });
  if (kalang) stand(out, cam, t, W.kalang, AT.kalangThrone, { expr: kalang });
};
const atWall = (out: Stage, cam: CamInfo, t: number, wira: Expr, sekar: Expr, bayu: Expr, all = true) => {
  if (all) profile(out, cam, t, W.sekar, AT.sekarWall, 0, -1, { expr: sekar });
  profile(out, cam, t, W.wira, AT.wiraWall, 0, -1, { expr: wira });
  if (all) profile(out, cam, t, W.bayu, AT.bayuWall, 0, -1, { expr: bayu });
};
/** the three courtiers between the middle pillars, screen left to right; each is swapped for a new man on his word */
const courtRow = (out: Stage, cam: CamInfo, t: number, swaps: number[]) => {
  AT.court.forEach((at, k) => {
    const ts = swaps[k] / FPS - LEAD, isNew = t >= ts;
    const who: Who = isNew ? { i: 60 + k, o: NEW_COURT[k], okey: `new${k}` } : { i: 50 + k, o: OLD_COURT[k], okey: `old${k}` };
    stand(out, cam, t, who, at, { expr: isNew ? "sly" : t > 584 / FPS - LEAD ? "nervous" : "neutral" });
    puff(out, t, ts - 0.08, at);
  });
};

/** everything with a face (and every lit prop card) in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], f = Math.round(t * FPS);
  LNAME = s.light;
  findSun(cam, SUN);
  lamps(out, cam, t);
  switch (id) {
    case SH.hook:
      atWall(out, cam, t, "suspicious", "suspicious", "nervous");
      cracks(out, true);
      glow(out, [HOLE[0], HOLE[1], HALL.wallZ1 + 0.03], 0.45, 0.8);
      break;
    case SH.tomb: case SH.oath:
      kamboja(out);
      if (id === SH.oath) stand(out, cam, t, W.wira, AT.wiraTomb, { expr: "sad", arm: "chest", headTilt: -4 });
      break;
    case SH.crown:
      stand(out, cam, t, W.baskara, AT.baskaraSteps, { expr: "smile", wave: q(0.6 + 0.4 * Math.sin(t * 2), 20) });
      stand(out, cam, t, W.arya, AT.aryaSteps, { expr: "smile_closed" });
      crowd(out, cam, t, false, false);
      break;
    case SH.embrace:
      stand(out, cam, t, W.baskara, AT.baskaraSteps, { expr: "smile", arm: t > 286 / FPS - LEAD ? "hug" : undefined });
      stand(out, cam, t, W.arya, AT.aryaSteps, { expr: exprAt(t, [[279, "neutral"], [300, "smile_closed"], [389, "grin"]]) });
      for (const [k, x] of [[0, -2.6], [1, 2.6]] as const) stand(out, cam, t, guard(k), [x, HT, 14.4], { expr: "stern" });
      break;
    case SH.cheer:
      crowd(out, cam, t, true);
      break;
    case SH.purge:
      courtRow(out, cam, t, [598, 625, 653]);
      break;
    case SH.exile: {
      stand(out, cam, t, W.baskara, AT.baskaraExile, { expr: "smile", arm: "hug" });
      stand(out, cam, t, W.arya, AT.aryaExile, { expr: "smile_closed" });
      const t0 = 686 / FPS, t1 = 772 / FPS;
      OLD_COURT.forEach((o, k) => walk(out, cam, t, { i: 50 + k, o, okey: `old${k}` }, [-0.6 + k * 0.9, 0, -5 - k * 1.2], [-0.2 + k * 0.9, 0, -14 - k * 1.2], t0, t1, { expr: "sad" }));
      for (const k of [0, 1]) walk(out, cam, t, guard(k), [-1.6 + k * 3.4, 0, -3.6], [-1.2 + k * 3.4, 0, -12.6], t0, t1, { expr: "stern" });
      break;
    }
    case SH.doubt: case SH.plot: {
      tableProps(out);
      const plot = id === SH.plot;
      stand(out, cam, t, W.wira, AT.tableW, { expr: plot ? exprAt(t, [[1073, "stern"], [1127, "sad"]]) : "suspicious" });
      stand(out, cam, t, W.sekar, AT.tableS, { expr: plot ? "suspicious" : "stern", arm: plot && t > 1100 / FPS ? "point" : undefined });
      stand(out, cam, t, W.bayu, AT.tableB, { expr: plot ? exprAt(t, [[1073, "stern"], [1180, "angry"]]) : "angry" });
      break;
    }
    case SH.shield:
      stand(out, cam, t, W.baskara, [0.45, HT, 23.4], { expr: "sly", arm: "hug" });
      stand(out, cam, t, W.arya, [0.0, HT, 22.6], { expr: "neutral" });
      break;
    case SH.sister:
      stand(out, cam, t, W.sekar, AT.sekarTree, { expr: "sad", prop: "letter", headTilt: 5 });
      break;
    case SH.troops: {
      stand(out, cam, t, W.bayu, AT.bayuRacks, { expr: exprAt(t, [[1027, "stern"], [1050, "angry"]]) });

      break;
    }
    case SH.kitchen: case SH.maid:
      hearth(out, t);
      stand(out, cam, t, W.maid, AT.maid, { expr: id === SH.maid ? "neutral" : "smile" });
      if (id === SH.kitchen) stand(out, cam, t, W.sekar, AT.sekarKitchen, { expr: "sly", headTilt: t > 1262 / FPS ? 4 : 0 });
      else stand(out, cam, t, W.kalang, AT.kalangKitchen, { expr: "sly", headTilt: -6 });
      break;
    case SH.bribe:
      stand(out, cam, t, W.courier, AT.courier, { expr: exprAt(t, [[1295, "nervous"], [1325, "grin"]]) });
      stand(out, cam, t, W.bayu, AT.bayuDesk, { expr: "sly", prop: t > 1305 / FPS ? "pouch" : null });
      if (t > 1325 / FPS) flat(out, "coins", 240, 140, fxCoins, [COURIER_DESK[0] - 0.3, DESK_H + 0.006, COURIER_DESK[2] - 0.1], 0.3, 0.4);
      break;
    case SH.copy: { // the desk insert: the courier is just off the top of the frame
      const lines = Math.min(7, Math.floor((t - 1339 / FPS) * 3.2) + 1);
      flat(out, "letterSeal", 300, 380, (p) => fxLetter(p, true), [COURIER_DESK[0] - 0.24, DESK_H + 0.004, COURIER_DESK[2]], 0.3, Math.PI + 0.06);
      flat(out, `letterCopy${lines}`, 300, 380, (p) => fxLetter(p, false, lines), [COURIER_DESK[0] + 0.14, DESK_H + 0.005, COURIER_DESK[2] + 0.02], 0.3, Math.PI - 0.05);
      flat(out, "quill", 200, 420, fxQuill, [COURIER_DESK[0] + 0.26, DESK_H + 0.008, COURIER_DESK[2] - 0.02], 0.11, 0.5 + 0.08 * Math.sin(t * 9));
      break;
    }
    case SH.hole:
      if (f < 1462) profile(out, cam, t, W.wira, AT.wiraHole, 0, -1, { expr: "suspicious" }); // the close-up on the hole leaves him out
      cracks(out, true);
      if (brickOut(f) > 0.9) glow(out, [HOLE[0], HOLE[1], HALL.wallZ1 + 0.03], 0.45, 0.8);
      break;
    case SH.patih:
      throne(out, cam, t, "neutral", "neutral", exprAt(t, [[1521, "neutral"], [1550, "suspicious"]]));
      break;
    case SH.write: case SH.trap: {
      const hi = id === SH.trap ? (f > 2008 ? 1 : 0) : f >= 1771 ? 3 : f >= 1744 ? 2 : f >= 1722 ? 1 : 0;
      if (id === SH.write && f < 1700) stand(out, cam, t, W.kalang, AT.kalangDesk, { expr: "suspicious", arm: "point" }); // inserts: map only
      flat(out, `map${hi}`, 800, 600, (p) => fxMap(p, hi), [PATIH_DESK[0] + 0.02, DESK_H + 0.004, PATIH_DESK[2] - 0.12], 0.78, Math.PI / 2);
      const nScroll = id === SH.trap ? 3 : hi;
      for (let k = 0; k < nScroll; k++) flat(out, "scroll", 360, 120, (p) => fxScroll(p), [PATIH_DESK[0] + 0.32, DESK_H + 0.03 + k * 0.035, PATIH_DESK[2] + 0.3 + k * 0.05], 0.36, -Math.PI / 2 + k * 0.15);
      break;
    }
    case SH.courier:
      stand(out, cam, t, W.courier, AT.courier, { expr: "nervous" });
      stand(out, cam, t, W.kalang, AT.bayuDesk, { expr: "sly", prop: "scroll" });
      break;
    case SH.speech:
      stand(out, cam, t, W.kalang, [0, HT, 16.9], { expr: "sly", arm: "point" });
      [0, 2].forEach((k, j) => stand(out, cam, t, { i: 60 + k, o: NEW_COURT[k], okey: `new${k}` }, [j ? -0.65 : 0.65, HT, 17.7], { expr: "neutral" }));
      break;
    case SH.restless: {
      const u = (t - 1867 / FPS) * 0.55, z = 7.3 + 0.5 * Math.sin(u * Math.PI), dir = Math.cos(u * Math.PI) >= 0 ? 1 : -1;
      const phase = q((t * 1.6) % 1, 60);
      out.places.push(person(cam, W.bayu, RACK_X - 1.2, 0, z, { side: true, mirror: dir * cam.right.z < 0 }, {},
        { mode: "march", phase, expr: "angry", stomp: 0.7, stride: 0.8, blink: lidAt(t, 6) }));
      blob(out, RACK_X - 1.2, 0, z);
      break;
    }
    case SH.riders:
      for (let k = 0; k < 4; k++) {
        const t0 = 1940 / FPS + k * 0.22, z = WALL.zS - 2 - 9 * Math.max(0, t - t0), x = (k % 2 ? 0.9 : -0.9);
        if (t < t0) continue;
        const ph = q((t * 2.4 + k * 0.3) % 1, 16), away = f >= 1970;
        if (away) out.fx.push({ key: `riderB${ph}`, cw: 600, ch: 700, draw: (p) => fxRiderBack(p, ph, "#d07a2e", "#f0c53c"), x, y: 1.25, z, w: 1.75, h: 2.05, mode: "cut", tint: 0.55 });
        else out.fx.push({ key: `rider${ph}`, cw: 900, ch: 700, draw: (p) => fxRider(p, ph, "#d07a2e", "#f0c53c"), x, y: 1.2, z, w: 2.8, h: 2.18, mode: "cut", tint: 0.55 });
        for (let j = 0; j < 2; j++) puff(out, t, t0 + 0.25 * j + Math.floor((t - t0) / 0.5) * 0.5, [x, -0.6, z + 1.6], 1.4);
      }
      break;
    case SH.caught:
      stand(out, cam, t, W.courier, AT.courier, { expr: "shock" });
      for (const k of [0, 1]) stand(out, cam, t, guard(k), [COURIER_DESK[0] + (k ? 0.95 : -0.95), 0, COURIER_DESK[2] + 1.6], { expr: "stern" });
      flat(out, "letterSeal", 300, 380, (p) => fxLetter(p, true), [COURIER_DESK[0] - 0.24, DESK_H + 0.004, COURIER_DESK[2]], 0.3, 0.06);
      break;
    case SH.summon: {
      const t0 = 2098 / FPS, t1 = 2197 / FPS;
      walk(out, cam, t, W.sekar, [-1.05, 0, -7.2], [-1.05, 0, 0.0], t0, t1, { expr: "nervous" });
      walk(out, cam, t, W.wira, [0, 0, -7.0], [0, 0, 0.2], t0, t1, { expr: "stern" });
      walk(out, cam, t, W.bayu, [1.05, 0, -7.3], [1.05, 0, -0.1], t0, t1, { expr: "nervous" });
      for (const k of [0, 1]) walk(out, cam, t, guard(k), [-0.5 + k, 0, -10.0], [-0.5 + k, 0, -2.6], t0, t1, { expr: "stern" });
      break;
    }
    case SH.wall:
      cracks(out, false);
      break;
    case SH.king:
      throne(out, cam, t, "neutral", null, null);
      break;
    case SH.arya: case SH.black: {
      // Arya glances at the king on "Pangeran", then back at us with heavy lids on "Arya": nothing given away
      stand(out, cam, t, W.baskara, AT.baskaraThrone, { mode: "sit", expr: "neutral" });
      const look = f >= 2338 && f < 2364 ? -1 : 0, lid = f >= 2364 ? 0.5 : lidAt(t, 2);
      stand(out, cam, t, W.arya, AT.aryaThrone, { expr: "neutral", look, lid });
      break;
    }
  }
  return out;
};
export { FPS };
