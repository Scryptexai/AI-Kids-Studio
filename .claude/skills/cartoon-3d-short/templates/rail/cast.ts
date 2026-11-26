// Our cast as lit flat sprites in the 3D world (Stopped by Thin Air). Each frame every character asks for a drawing
// (a key + a draw call); the pool keeps one canvas per distinct drawing. Characters are yaw-only billboards shaded by
// cardShade(); standing ones get a soft multiply contact blob. Effects (flashes, rings, the road cut, the band's
// stamps, the tray) are unlit cards. Cards, effects and blobs live on the NOINK layer (no world ink on their quads).
import * as THREE from "three";
import { Pen, bodyFront, bodySide, fxPuff, fxCreak, fxContact, fxShadow, fxRing, Outfit, Expr, ExprIn, exprSnaps, FrontOpts, SideOpts, Prop, pullHand } from "./toon";
import { GEORGE, GEORGE72, VANDY, VANDY_RED, TATE, TEAMSTER, boss, bossBare, brakeman, brakemanBare, fxHorse, fxLetterNo, fxCoins, fxCap, fxBowler, fxBlast, fxSparks, fxCord, fxPriceTag, fxDial, fxValve } from "./brakefx";
import { fxGlowCol, fxSparkle } from "./diedfx";
import { FPS, SHOTS, SH, AT, V3, clamp01, smooth, B, LEADF, LEAP1, LEAP2, CRANK, SLIP, LEAP3, CAPFLY, WHISTLE, BLOW, FLARE, POINT, LETTERS, PUMP, LEVER1, CLAMP,
  PLANT, SEES, PULL, STOPF, PICK, FLIP, HOLDS, CUT, HALT, SMUG, PUFF, OFF, ROOF_Y, COACH_FLOOR, CAB_FLOOR, TATE_LOCAL, BOSSES_IN, GEORGE_IN, HOSE_UP,
  freightX, testX, shopTrainX, talkAt, wordFrames } from "./story";
import { O, RAIL_Y, BOX, SHOP_TRACK_Z } from "./layout";
import { groundAt } from "./solids";
/** a mark between -0.5 and 0.3 m is relative to the ground under it (feet ON the floor, step or kerb); higher or deep
 *  underground (the tunnel) = absolute */
const onGround = (x: number, y: number, z: number) => (y < 0.3 && y > -0.5 ? Math.max(0, y) + groundAt(x, z) : y); // a crouch never pushes the feet into the floor
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
    this.add.color.setScalar(1.6 * Math.max(1, tint)); // tint > 1: an HDR glow (lantern cores, sparks) that the bloom picks up
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
  /** vertical stretch of the card about the soles (breath, squash and stretch) */
  sy?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number;
  flat?: boolean; rot?: number; mode?: "cut" | "soft" | "add"; tint?: number;
  /** upright card fixed to a wall, facing world yaw (instead of facing the lens) */
  wallYaw?: number };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3; fov?: number };
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
/** a blink across every expression swap (motion-camera.md): half / shut / shut / half around each swap frame */
const swapLid = (t: number, swaps?: number[]) => {
  if (!swaps) return undefined;
  const f = Math.round(t * FPS);
  for (const fs of swaps) { const k = f - (fs - 2); if (k >= 0 && k < 4) return LID[k]; }
  return undefined;
};
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
/** default frames for a face to slide from one expression to the next (exprMorph) */
export const MORPH = 10;
const ease5 = (x: number) => { const u = clamp01(x); return u * u * u * (u * (6 * u - 15) + 10); };
/** expression by frame that SLIDES instead of cutting: [[frame, expr, dur?], ...] (first entry = the starting face).
 *  Each change eases (smootherstep) from the face before it over dur frames (MORPH = 10; 25-40 for a slow dawning
 *  smile), half-way LEADF frames before its key frame, so the face already reads on the word. A change interrupted by
 *  the next one starts from where it had got to. Spread into stand()/walk()/profile():
 *    stand(out, cam, t, who, at, { ...exprMorph(f, [[0, "neutral"], [at(3, "smiled"), "smile", 30]]), arm: ... })
 *  blinks = the half-way frames of changes with a part that cannot slide (exprSnaps): a blink hides the switch. */
export const exprMorph = (f: number, seq: [number, Expr, number?][]): { expr: ExprIn; blinks: number[] } => {
  let e: ExprIn = seq[0][1];
  const blinks: number[] = [];
  for (let i = 1; i < seq.length; i++) {
    const [fk, to, dur = MORPH] = seq[i], mid = fk - LEADF, f0 = mid - dur / 2;
    if (exprSnaps(seq[i - 1][1], to)) blinks.push(Math.round(mid));
    if (f < f0) continue;
    const k = ease5((f - f0) / dur);
    e = k >= 1 ? to : { from: e, to, k }; // an unfinished change carries on inside the next one (no jump)
  }
  return { expr: e, blinks };
};


type Who = { i: number; o: Outfit; okey: string };
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1, dark = 0): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = (who.i % 7) + 1;
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const dk = q(dark, 20), key = (view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`) + (dk ? `|d${dk}` : "");
  const draw = (p: Pen) => {
    if (view.side) bodySide(p, who.o, s2); else bodyFront(p, who.o, f2);
    if (dk) { const g = p.g; g.save(); g.globalCompositeOperation = "source-atop"; g.fillStyle = `rgba(14,10,24,${dk})`; g.fillRect(0, 0, 600, 1000); g.restore(); }
  };
  return { key, x, y, z, scale, mirror, draw, size: [w, h, k] };
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

// ---------------- key curves (references/reports/acting_gap.md) ----------------
/** a body key n frames after it starts: a 3 f anticipation (7 % the other way), fast out over d f, overshoot os of the
 *  move, settle over s f, then hold at 1 */
export const ANTIC = 3;
export const hit = (n: number, d = 4, os = 0.28, s = 8) =>
  n <= 0 ? (n > -ANTIC ? -0.08 * Math.sin((Math.PI * (n + ANTIC)) / ANTIC) : 0)
    : n < d ? 1 - (1 - n / d) ** 2 : n < d + s ? 1 + os * Math.sin((Math.PI * (n - d)) / s) * (1 - (n - d) / s) : 1;
/** go from a to b with hit() starting at frame f0 (chain keys: key(f, [[f0, v0], [f1, v1], ...])) */
export const keys = (f: number, ks: [number, number][]) => {
  let v = ks[0][1];
  for (let i = 1; i < ks.length; i++) if (f > ks[i][0] - ANTIC) { const prev = v; v = prev + (ks[i][1] - prev) * hit(f - ks[i][0]); } else break;
  return v;
};
/** a slow size change (someone swelling with pride or rage, shrinking with shame) that still lands alive:
 *  [[frame, scale, dur?], ...] (first = the starting size). Each change starts on its frame, eases in (smootherstep) to
 *  os past the target at 82 % of dur, then settles onto it over the rest plus 8 f. Feed it to stand()/walk()/profile()
 *  `scale`: the card grows from the soles, so the feet stay on the ground, and the ground shadow grows with it. */
export const sizeAt = (f: number, ks: [number, number, number?][], os = 0.06) => {
  let v = ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [f0, to, dur = 20] = ks[i];
    if (f < f0) break;
    const n = (f - f0) / dur, d = to - v, up = 0.82, rest = 1 - up + 8 / dur;
    v = v + d * (n <= up ? (1 + os) * ease5(n / up) : 1 + os * (1 - ease5((n - up) / rest)));
  }
  return v;
};
/** hauling on something that will not give (a locked door): from f0 the hands take the handle (grip over 5 f), then
 *  `tugs` yanks every `every` f, each a fast lean back with overshoot (hit()) and a part release, then a slump to 0.15.
 *  Pass the whole result as profile()'s `tug` (pose, grip, strain tremble, flush, sweat, squash) and to pullFx() (the
 *  door's strain ticks and dust). rattle (-1..1, damped, on every yank) shakes a knob / door mesh of the set a few mm.
 *  - squash: a 3 f squash before each yank, a stretch on it, a small squash on the recoil
 *  - flush: the face warms to red over the tugs (peak on the last), cools over 40 f after the slump
 *  - sweat: two drops fly off the head after each yank (0..1 over 10 f, undefined between)
 *  - yanks: the yank frames (SFX door_yank / effort grunts land on these) */
export const tugAt = (f: number, f0: number, tugs = 3, every = 12) => {
  const ks: [number, number][] = [[f0 - 99, 0], [f0 + 2, 0.15]];
  const yanks: number[] = [];
  for (let i = 0; i < tugs; i++) { const a = f0 + 7 + i * every; yanks.push(a); ks.push([a, 1], [a + Math.round(every * 0.55), 0.4]); }
  ks.push([f0 + 7 + tugs * every + 4, 0.15]);
  let rattle = 0, strain = 0, sq = 0, sweat: number | undefined;
  for (const [j, a] of yanks.entries()) {
    const n = f - a;
    if (n >= 0 && n < 12) rattle += Math.sin(n * 2.4) * Math.exp(-n / 3);
    if (n >= -2 && n < every) strain = Math.max(strain, (0.6 + 0.4 * (j / Math.max(1, tugs - 1))) * (n < 2 ? 1 : 1 - (n - 2) / every));
    if (n >= -3 && n < 0) sq = Math.max(sq, 0.45 * smooth((n + 3) / 3));
    if (n >= 0 && n < 14) sq += -0.9 * Math.exp(-n / 2.6) * Math.cos(n * 0.85);
    if (n >= 1 && n < 11) sweat = (n - 1) / 10;
  }
  const end = f0 + 7 + tugs * every + 4, last = yanks[yanks.length - 1] ?? f0;
  const flush = f < f0 ? 0 : f < last ? 0.25 + 0.75 * smooth((f - f0) / Math.max(1, last - f0)) : f < end ? 1 : 1 - smooth((f - end) / 40);
  return { pose: keys(f, ks), grip: clamp01(hit(f - f0, 5, 0.1, 6)), rattle: clampN(rattle, 1), strain: clamp01(strain),
    squash: clampN(sq, 1), flush: clamp01(flush) * clamp01((f - f0) / 6), sweat, yanks };
};
/** where the mode "pull" hands meet the handle, in metres from the feet: `fwd` ahead (the way the profile faces), `up`
 *  above the ground, and `hand` (canvas units) to pass as the pull `hand`. Give `up` (metres) for a handle at a set
 *  height (a door knob); scale is the card scale. */
export const pullReach = (o: Outfit, seed = 1, up?: number, scale = 1) => {
  const h = pullHand(o, seed, up === undefined ? undefined : 975 - up / (SU * scale));
  return { fwd: (h[0] - 300) * SU * scale, up: (975 - h[1]) * SU * scale, hand: h };
};
/** where to stand to pull a handle at world point `knob`, facing (dx, dz): the card turns to the camera, so the feet go
 *  on the card plane through the knob and the hands land on it from this camera. Returns the feet and the pull `hand`.
 *  Keep the camera still (or slow) in a pull shot: a camera that swings round slides the hands off the knob. */
export const pullSpot = (cam: CamInfo, knob: V3, who: Who, dx: number, dz: number, scale = 1): { at: V3; hand: [number, number] } => {
  const seed = (who.i % 7) + 1;
  let x = knob[0] - dx, z = knob[2] - dz, r = pullReach(who.o, seed, 1, scale);
  for (let k = 0; k < 4; k++) {
    const gy = onGround(x, 0, z), nx = cam.pos.x - x, nz = cam.pos.z - z, nl = Math.hypot(nx, nz) || 1;
    let rx = nz / nl, rz = -nx / nl; if (rx * dx + rz * dz < 0) { rx = -rx; rz = -rz; } // the card's sideways axis, toward the knob
    r = pullReach(who.o, seed, knob[1] - gy, scale); x = knob[0] - rx * r.fwd; z = knob[2] - rz * r.fwd;
  }
  return { at: [x, onGround(x, 0, z), z], hand: r.hand };
};
/** a laugh: the shoulders bounce about every 5 f (body up on each "ha"), the head jiggles, easing out over `dur` f */
export const laughAt = (f: number, f0: number, dur = 30) => {
  const n = f - f0;
  if (n < 0 || n > dur) return { sy: 0, roll: 0, head: 0 };
  const env = Math.min(1, n / 2) * (1 - (n / dur) ** 2), b = Math.abs(Math.sin((Math.PI * n) / 5));
  return { sy: 0.035 * b * env, roll: 0.02 * Math.sin((Math.PI * n) / 5) * env, head: 4 * Math.sin((Math.PI * n) / 10) * env };
};

// ---------------- motion memory (secondary motion, squash and stretch) ----------------
// world.ts runs the set's stage() a second time, 2 f earlier, into a throwaway stage first (the "ghost" pass); every
// person records how they were posed then, so this frame can tell how fast the body is moving: the hat and hair trail
// that motion (drag) and the card stretches a little along it. Pure: both passes are functions of the frame only.
type Motion = { x: number; z: number; ang: number; arm: number };
let GHOST: Map<string, Motion> | null = null;
let PREV = new Map<string, Motion>();
export const GHOST_LAG = 2;
export const ghostBegin = () => { GHOST = new Map(); };
export const ghostEnd = () => { PREV = GHOST ?? new Map(); GHOST = null; };
const motion = (who: Who, m: Motion) => {
  const k = `${who.okey}|${who.i}`;
  if (GHOST) { GHOST.set(k, m); return null; }
  return PREV.get(k) ?? null;
};
const clampN = (v: number, a: number) => Math.max(-a, Math.min(a, v));
/** drag (deg) and stretch (fraction) from the body's angular speed d (deg over GHOST_LAG frames) and arm speed */
const follow = (d: number, dArm: number) => ({ drag: Math.round(2 * clampN(-1.1 * d, 6)) / 2, stretch: Math.min(0.035, 0.0022 * Math.abs(d) + 0.03 * Math.abs(dArm)) });
/** a one-shot accent: out in 3 f, back with a damped swing over ~10 f (0 outside) */
const pulse = (n: number) => (n < 0 || n > 14 ? 0 : n < 3 ? 1 - (1 - n / 3) ** 2 : Math.exp(-(n - 3) / 4) * Math.cos((n - 3) * 0.45));

// ---------------- staging helpers ----------------
type Opt = { expr?: ExprIn; blinks?: number[]; prop?: Prop; arm?: FrontOpts["arm"]; mode?: FrontOpts["mode"]; wave?: number; look?: number; headTilt?: number; scale?: number; noBlob?: boolean; lid?: number;
  tilt?: number; reach?: number; swaps?: number[]; dark?: number; glassesDrop?: number; flare?: number; armK?: number; talk?: number; sy?: number; still?: boolean;
  /** whole-body lean (deg); armK already eased with hit() (may overshoot); talkBeat: the line this person is speaking (drives head nods/tilts) */
  lean?: number; armRaw?: boolean; talkBeat?: number;
  /** a laugh starting on this frame (shoulders bounce, head jiggles) for laughFor frames (30) */
  laugh?: number; laughFor?: number };
/** someone standing (or sitting) facing the lens */
const stand = (out: Stage, cam: CamInfo, t: number, who: Who, at: V3, o: Opt = {}) => {
  const fo: FrontOpts = { mode: o.mode ?? "stand", expr: o.expr ?? "neutral", prop: o.prop ?? null, arm: o.arm, wave: o.wave, look: o.look ?? 0,
    headTilt: o.headTilt ?? 0, tilt: o.tilt ?? 0, reach: o.reach, blink: o.lid ?? swapLid(t, o.swaps) ?? swapLid(t, o.blinks) ?? lidAt(t, who.i), glassesDrop: o.glassesDrop, flare: o.flare,
    armK: o.armK, talk: o.talk, lean: o.lean, armRaw: o.armRaw ?? o.armK !== undefined }; // hit()-eased arms keep their overshoot
  // nobody is ever frozen. Leads: a slow breath, a weight-shift sway, the head drifting, the eyes darting now and then.
  // Extras and held poses (still): a smaller breath and sway; extras also tip the head to a new angle every ~2.5 s.
  const f = Math.round(t * FPS), lead = !who.okey.startsWith("folk") && !o.still && fo.mode !== "fall", ph = who.i * 1.7;
  let sy = o.sy ?? 1, roll = 0;
  if (!lead && fo.mode !== "fall") {
    sy += 0.008 * Math.sin((2 * Math.PI * t) / 3.4 + ph);
    roll += 0.007 * Math.sin((2 * Math.PI * t) / 4.9 + ph);
    if (!o.still) {
      const P = 75, sl = Math.floor((f + 97 * hh(who.i, 4)) / P), f0 = Math.round(sl * P - 97 * hh(who.i, 4));
      const tgt = Math.round((hh(sl, who.i + 3) - 0.5) * 8), prev = Math.round((hh(sl - 1, who.i + 3) - 0.5) * 8);
      fo.headTilt = (fo.headTilt ?? 0) + Math.round(2 * (prev + (tgt - prev) * hit(f - f0, 6, 0.2, 8))) / 2;
    }
  }
  if (lead) {
    sy += 0.014 * Math.sin((2 * Math.PI * t) / 3.1 + ph);
    roll += 0.014 * Math.sin((2 * Math.PI * t) / 4.3 + ph);
    fo.headTilt = (fo.headTilt ?? 0) + Math.round(10 * Math.sin((2 * Math.PI * t) / 5.3 + ph)) / 2 + (who.i % 2 ? 4 : -4);
    if (o.tilt === undefined) fo.tilt = (who.i % 2 ? 5 : -5) + 2 * Math.sin((2 * Math.PI * t) / 6.1 + ph); // a stance, not a soldier at attention
    if (o.look === undefined) { const slot = Math.floor(t / 1.7 + hh(who.i, 3)); fo.look = [0, 0.35, 0, -0.35][Math.floor(hh(slot, who.i) * 4)]; }
  }
  // talk drive (reference: head moving in ~83 % of frames while speaking): a nod on every word onset with a dip before
  // it, and a new head-tilt target every 3 words reached with hit()
  if (lead && o.talkBeat !== undefined) {
    const on = wordFrames(o.talkBeat), last = on.filter((w) => w <= f + 2);
    if (last.length && f < on[on.length - 1] + 30) {
      const w0 = last[last.length - 1];
      sy += 0.012 * pulse(f - w0) - (f >= w0 - 2 && f < w0 ? 0.006 : 0);
      const ph3 = Math.floor((last.length - 1) / 3), fk = on[ph3 * 3];
      const tgt = (hh(ph3, who.i + 11) - 0.5) * 16, prev = ph3 ? (hh(ph3 - 1, who.i + 11) - 0.5) * 16 : 0;
      fo.headTilt = (fo.headTilt ?? 0) + prev + (tgt - prev) * hit(f - fk);
      fo.tilt = (fo.tilt ?? 0) + 2.5 * pulse(f - w0) * (last.length % 2 ? 1 : -1);
      // the hands talk too: a held pose beats on every word; empty hands open into a new gesture every 3 words
      if (fo.arm && fo.armK !== undefined) fo.armK += 0.12 * pulse(f - w0);
      else if (!fo.arm && !fo.prop) {
        const fe = (ph3 + 1) * 3 < on.length ? on[(ph3 + 1) * 3] - 5 : on[on.length - 1] + 14;
        fo.arm = (["chest", "reach", "shrug"] as const)[Math.floor(hh(ph3, who.i + 5) * 3)];
        fo.armK = 0.55 * (hit(f - fk, 4, 0.3, 8) - hit(f - fe, 5, 0.1, 6)) + 0.08 * pulse(f - w0); fo.armRaw = true;
      }
    }
  }
  // a laugh: the shoulders bounce
  if (o.laugh !== undefined) { const l = laughAt(f, o.laugh, o.laughFor); sy += l.sy; roll += l.roll; fo.headTilt = (fo.headTilt ?? 0) + l.head; }
  // secondary motion and stretch from how fast the body turned since the ghost pass (2 f ago)
  const ang = (fo.tilt ?? 0) + (fo.lean ?? 0) + 0.6 * (fo.headTilt ?? 0), mPrev = motion(who, { x: at[0], z: at[2], ang, arm: fo.armK ?? 0 });
  if (mPrev && fo.mode !== "fall") {
    const fl = follow(ang - mPrev.ang, (fo.armK ?? 0) - mPrev.arm);
    fo.drag = fl.drag; sy += fl.stretch;
  }
  // a pop on every change (reference: no body squash; the energy is a quick roll/position pop): 2 f of 1.5 % squash,
  // a 2 % stretch, and a 3 deg roll that swings back
  for (const fs of o.swaps ?? []) {
    const k = f - fs;
    if (k >= -2 && k < 0) sy -= 0.015 * (k + 3) / 3;
    else if (k >= 0 && k < 9) sy += 0.02 * Math.cos(k * 0.75) * (1 - k / 9);
    roll += 0.052 * pulse(k) * (who.i % 2 ? 1 : -1);
  }
  const gy = onGround(at[0], at[1], at[2]);
  out.places.push(person(cam, who, at[0], gy, at[2], { side: false, mirror: false }, fo, {}, o.scale ?? 1, o.dark ?? 0));
  const pl = out.places[out.places.length - 1]; pl.sy = sy; pl.roll = (pl.roll ?? 0) + roll;
  if (!o.noBlob && fo.mode !== "sit") blob(out, at[0], gy, at[2], o.scale ?? 1);
};
/** someone in profile facing world direction (dx, dz) (ears on the wall, pacing) */
const profile = (out: Stage, cam: CamInfo, t: number, who: Who, at: V3, dx: number, dz: number,
  so: SideOpts & { dark?: number; blinks?: number[]; scale?: number; strain?: number; tug?: ReturnType<typeof tugAt> } = {}) => {
  const mirror = dx * cam.right.x + dz * cam.right.z < 0, { dark, blinks, scale, tug, ...so3 } = so;
  // a tugAt() result fills the pull channels (explicit options still win)
  const { strain = tug?.strain, ...so2 } = so3;
  if (tug) Object.assign(so2, { pose: so2.pose ?? tug.pose, reach: so2.reach ?? tug.grip, flush: so2.flush ?? tug.flush,
    sweat: so2.sweat ?? tug.sweat, squash: so2.squash ?? tug.squash });
  const gy = onGround(at[0], at[1], at[2]), ph = who.i * 1.7, pull = so2.mode === "pull";
  // pull: the hands are fixed on the handle, so the breath and a strain tremble (strain 0..1, tugAt) rock the upper body
  // instead of the card (a card sway would slide the hands off the knob)
  if (pull) so2.shake = (so2.shake ?? 0) + 0.9 * Math.sin((2 * Math.PI * t) / 3.3 + ph) + 1.4 * (strain ?? 0) * Math.sin(t * FPS * 2.3);
  out.places.push(person(cam, who, at[0], gy, at[2], { side: true, mirror }, {}, { mode: "stand", blink: swapLid(t, blinks) ?? lidAt(t, who.i), ...so2 }, scale ?? 1, dark ?? 0));
  // never frozen: a breath and a slow sway
  const pl = out.places[out.places.length - 1];
  if (!pull) { pl.sy = 1 + 0.01 * Math.sin((2 * Math.PI * t) / 3.3 + ph); pl.roll = (pl.roll ?? 0) + 0.008 * Math.sin((2 * Math.PI * t) / 4.7 + ph); }
  blob(out, at[0], gy, at[2], scale ?? 1);
};
/** someone walking from a to b over [t0, t1] (s); front view when coming at the lens, profile otherwise */
const walk = (out: Stage, cam: CamInfo, t: number, who: Who, a: V3, b: V3, t0: number, t1: number, o: Opt = {}) => {
  const u = clamp01((t - t0) / (t1 - t0)), x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, v = L / (t1 - t0);
  const phase = q(((t * v) / 1.4 + hh(who.i, 5)) % 1, 120), view = viewOf(cam, x, z, dx / L, dz / L), moving = u > 0 && u < 1;
  // the step: squash on each footfall, stretch through the passing pose (two per cycle); the hat bobs a beat behind
  const f = Math.round(t * FPS), st = moving ? Math.cos(4 * Math.PI * phase) : 0, drag = moving ? Math.round(2 * 2.5 * Math.sin(4 * Math.PI * phase - 1.2)) / 2 : 0;
  const lf = o.laugh !== undefined ? laughAt(f, o.laugh, o.laughFor) : { sy: 0, roll: 0, head: 0 };
  const fo: FrontOpts = { mode: moving ? "stroll" : "stand", phase, expr: o.expr ?? "neutral", look: 0, blink: swapLid(t, o.blinks) ?? lidAt(t, who.i), prop: o.prop ?? null, wave: o.wave, drag, headTilt: Math.round(2 * lf.head) / 2 };
  const so: SideOpts = { mode: moving ? "march" : "stand", phase, expr: o.expr ?? "neutral", stomp: 0.55, stride: 0.875 * view.fs, blink: swapLid(t, o.blinks) ?? lidAt(t, who.i), prop: o.prop ?? undefined, drag };
  const gy = onGround(x, y, z);
  out.places.push(person(cam, who, x, gy, z, view, fo, so, o.scale ?? 1, o.dark ?? 0));
  const pl = out.places[out.places.length - 1];
  pl.sy = 1 - 0.018 * st + lf.sy + 0.008 * Math.sin((2 * Math.PI * t) / 3.2 + who.i); pl.roll = (pl.roll ?? 0) + lf.roll;
  blob(out, x, gy, z, o.scale ?? 1); // no motion record: a stand() right after a walk starts without a drag pop
};
/** a flat card lying on a surface (letters, the map, coins, flowers) */
const flat = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, at: V3, w: number, rot = 0) =>
  out.fx.push({ key, cw, ch, draw, x: at[0], y: at[1], z: at[2], w, h: (w * ch) / cw, flat: true, rot });
/** warm glow at a lamp (night only; small by day) */
const glow = (out: Stage, at: V3, size: number, k = 1) =>
  out.fx.push({ key: "glow", cw: 256, ch: 256, draw: (p) => fxGlowCol(p, "255,190,110"), x: at[0], y: at[1], z: at[2], w: size, h: size, mode: "add", tint: k });
const puff = (out: Stage, t: number, t0: number, at: V3, size = 1.6) => {
  const u = (t - t0) / 0.5;
  if (u < 0 || u >= 1) return;
  out.fx.push({ key: `puff${q(u, 20)}`, cw: 300, ch: 300, draw: (p) => fxPuff(p, q(u, 20)), x: at[0], y: at[1] + 0.9, z: at[2] + 0.05, w: size, h: size, mode: "soft" });
};


// ---------------- acting curves (motion-camera.md section 3) ----------------
/** an action landing on frame fw: 3-4 f wind-up, held ~7 f, a 1-frame strike on fw, then `after` frames since */
const action = (f: number, fw: number, up = 4, hold = 7) => {
  const s = fw - hold - up;
  if (f < s) return { wind: 0, struck: false, after: -1 };
  if (f < fw - hold) return { wind: smooth((f - s) / up), struck: false, after: -1 };
  if (f < fw) return { wind: 1, struck: false, after: -1 };
  return { wind: 1, struck: true, after: f - fw };
};
/** a startle on frame fa: 2 f crouch, a 6-8 f hop, landing; y offset in metres and a lean-back in degrees */
const startle = (f: number, fa: number, k = 1) => {
  const n = f - (fa - 2);
  if (n < 0 || n > 10) return { y: 0, tilt: 0 };
  if (n < 2) return { y: (-0.035 * k * (n + 1)) / 2, tilt: 2 * k };
  const u = (n - 2) / 8;
  return { y: 0.13 * k * 4 * u * (1 - u), tilt: -6 * k * Math.sin(Math.PI * u) };
};
/** a sip: the cup rises to the mouth over 6 f, stays `stay` f, comes down over 6 f */
const sip = (f: number, f0: number, stay = 14) => {
  const n = f - f0;
  return n < 0 ? 0 : n < 6 ? smooth(n / 6) : n < 6 + stay ? 1 : n < 12 + stay ? 1 - smooth((n - 6 - stay) / 6) : 0;
};


// ---------------- the cast ----------------
const C = {
  george: { i: 3, o: GEORGE, okey: "george" }, george72: { i: 3, o: GEORGE72, okey: "george72" },
  vandy: { i: 7, o: VANDY, okey: "vandy" }, vandyRed: { i: 7, o: VANDY_RED, okey: "vandyred" },
  tate: { i: 11, o: TATE, okey: "tate" }, teamster: { i: 13, o: TEAMSTER, okey: "teamster" },
} satisfies Record<string, Who>;
/** extras: brakemen and bosses (okey "folk*" so the framing check treats them as a crowd) */
const bm = (i: number, bare = false): Who => ({ i: 20 + i, o: bare ? brakemanBare(i) : brakeman(i), okey: `folkbm${i}${bare ? "b" : ""}` });
const bs = (i: number, bare = false): Who => ({ i: 40 + i, o: bare ? bossBare(i) : boss(i), okey: `folkboss${i}${bare ? "b" : ""}` });

const popAt = (f: number, fw: number) => { const n = f - fw; return n >= 0 && n < 8 ? 1 + 0.18 * Math.sin((Math.PI * n) / 8) : 1; };
const glint = (out: Stage, t: number, p: V3, size: number, col = "#fff6d0") => {
  const ph = q((t * 0.8) % 1, 12);
  out.fx.push({ key: `spark${ph}${col}`, cw: 200, ch: 200, draw: (pp) => fxSparkle(pp, ph * 7, col), x: p[0], y: p[1], z: p[2], w: size, h: size, mode: "add", tint: 1.5 });
};
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** a puff that grows and fades over `life` frames from frame f0 at p (steam, dust, air) */
const puffAt = (out: Stage, f: number, f0: number, p: V3, size: number, life = 16, rise = 0.6, dx = 0) => {
  const u = (f - f0) / life;
  if (u < 0 || u >= 1) return;
  const k = q(u, 20);
  out.fx.push({ key: `puff${k}`, cw: 300, ch: 300, draw: (pp) => fxPuff(pp, k), x: p[0] + dx * u, y: p[1] + rise * u, z: p[2], w: size * (0.6 + 0.6 * u), h: size * (0.6 + 0.6 * u), mode: "soft" });
};
/** what a locked door does on each yank (tugAt): strain ticks jitter just above the knob for 8 f and a little dust
 *  shakes out of the door top and falls in front of it. (dx, dz): the way the puller faces (toward the door); top: the
 *  door's top edge (m). The ticks sit above the hands, never over the face: keep the head 0.35 m+ behind the knob. */
const pullFx = (out: Stage, f: number, tug: { yanks: number[] }, knob: V3, dx: number, dz: number, top = knob[1] + 1.25) => {
  const L = Math.hypot(dx, dz) || 1, nx = dx / L, nz = dz / L;
  for (const [j, a] of tug.yanks.entries()) {
    const n = f - a;
    if (n >= 0 && n < 8) out.fx.push({ key: `creak${n}`, cw: 300, ch: 300, draw: (p) => fxCreak(p, n / FPS), x: knob[0] - nx * 0.01, y: knob[1] + 0.2,
      z: knob[2] - nz * 0.01, w: 0.3, h: 0.3, mode: "cut" });
    // dust, not steam: the puff tinted a dusty tan, small, sinking from the top edge
    const u = (f - a - 1) / 20;
    if (u >= 0 && u < 1) {
      const k = q(u, 20), sz = (0.18 + 0.04 * j) * (0.6 + 0.6 * u);
      out.fx.push({ key: `dust${k}`, cw: 300, ch: 300, mode: "soft", x: knob[0] - nx * 0.08, y: top - 0.03 - 0.35 * u, z: knob[2] - nz * 0.08, w: sz, h: sz,
        draw: (p) => { fxPuff(p, k); const g = p.g; g.save(); g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(150,118,84,0.9)"; g.fillRect(0, 0, 300, 300); g.restore(); } });
    }
  }
};
/** the smoke from a moving engine's stack: puffs left behind in the world where the stack was `age` ago */
const smoke = (out: Stage, f: number, xAt: (f: number) => number, stackLocal: number, y: number, z: number, night: boolean, n = 7) => {
  for (let k = 0; k < n; k++) {
    const age = ((f + k * 6) % 42), u = age / 42, xe = xAt(f - age) + stackLocal;
    const s = q(0.9 + 2.2 * u, 10), a = q(1 - u, 10);
    out.fx.push({ key: `smoke${s}${a}${night ? "n" : "d"}`, cw: 300, ch: 300, draw: (pp) => { pp.g.globalAlpha = Math.max(0, a); fxPuff(pp, 0.35); pp.g.globalAlpha = 1; },
      x: xe, y: y + 0.4 + 2.4 * u, z: z - 0.3 * u, w: s, h: s, mode: "soft", tint: night ? 0.45 : 0.95 });
  }
};
/** sparks at every wheel on the lens side of a train (brakes on, still rolling) */
const sparks = (out: Stage, t: number, nose: number, off: number[], kinds: string[], z: number, k: number) => {
  if (k <= 0.05) return;
  const ph = q((t * 2.7) % 1, 10);
  off.forEach((o, i) => {
    const kind = kinds[i];
    const xs = kind === "loco" ? [-0.45, 1.35] : kind === "tender" ? [-2.15, -0.65, 0.65, 2.15] : kind === "box" ? [-3.45, -1.95, 1.95, 3.45] : [-4.55, -3.05, 3.05, 4.55];
    xs.forEach((x, j) => out.fx.push({ key: `sparks${q((ph + j * 0.37) % 1, 10)}`, cw: 220, ch: 160, draw: (pp) => fxSparks(pp, (ph + j * 0.37) % 1),
      x: nose + o + x, y: RAIL_Y + 0.2, z: z + 0.3, w: 1.0 * k, h: 0.73 * k, mode: "add", tint: 1.8 }));
  });
};
const FREIGHT_K = ["loco", "tender", "box", "box", "box", "box", "box"], TEST_K = ["loco", "tender", "coachOpen", "coach", "coach", "coach"];

/** a brakeman's path on the freight roofs (train-local x) at frame f: runs, leaps a gap, stands at a brake wheel */
type Leg = { f0: number; f1: number; x0: number; x1: number; leap?: boolean };
const pathAt = (legs: Leg[], f: number) => {
  let cur = legs[0];
  for (const l of legs) if (f >= l.f0) cur = l;
  const u = clamp01((f - cur.f0) / Math.max(1, cur.f1 - cur.f0));
  return { x: cur.x0 + (cur.x1 - cur.x0) * u, y: cur.leap ? 0.75 * 4 * u * (1 - u) : 0, moving: f >= cur.f0 && f < cur.f1, leap: !!cur.leap && u > 0 && u < 1, dir: Math.sign(cur.x1 - cur.x0) };
};

/** everything with a face (and every lit prop card) in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], f = Math.round(t * FPS);
  LNAME = s.light;
  findSun(cam, SUN);
  const at = (beat: number, word: string, k = 1) => B(beat, word, k) - LEADF;
  switch (id) {
    case SH.hook: {
      // night: brakemen run and leap along the freight's roofs with lanterns; one cranks; a slip; a cap flies
      const X = freightX(id, f), xAt = (ff: number) => freightX(id, ff), Y = ROOF_Y, z = O.line[2];
      const legs1: Leg[] = [{ f0: 0, f1: LEAP1, x0: -19.6, x1: -24.6 }, { f0: LEAP1, f1: LEAP1 + 10, x0: -24.6, x1: -26.6, leap: true },
        { f0: LEAP1 + 10, f1: LEAP2, x0: -26.6, x1: -34.3 }, { f0: LEAP2, f1: LEAP2 + 10, x0: -34.3, x1: -36.3, leap: true }, { f0: LEAP2 + 10, f1: CRANK - 4, x0: -36.3, x1: -36.75 }];
      const legs2: Leg[] = [{ f0: 0, f1: LEAP3 - 14, x0: -51.0, x1: -51.0 }, { f0: LEAP3 - 14, f1: LEAP3, x0: -51.0, x1: -53.9 }, { f0: LEAP3, f1: LEAP3 + 8, x0: -53.9, x1: -54.65, leap: true }];
      const man = (who: Who, legs: Leg[], crankFrom: number, slip = -1, capOff = -1, drop = -1) => {
        const p = pathAt(legs, f), wx = X + p.x, bare = capOff >= 0 && f >= capOff;
        if (drop >= 0 && f >= drop) { // fell short: down into the gap between the cars, below the roofs (never seen again)
          const dy = 0.5 * 30 * ((f - drop) / FPS) ** 2;
          if (dy < 2.2) stand(out, cam, t, who, [wx, Y + 0.2 - dy, z], { mode: "fall", expr: "shock", noBlob: true });
          return;
        }
        const w2 = bare ? { ...who, o: brakemanBare(who.i - 20), okey: who.okey + "b" } : who;
        if (f >= crankFrom) {
          const sl = slip >= 0 ? f - slip : -1;
          if (sl >= 0 && sl < 26) { // feet slide off the icy walk, arms up, he wobbles back up
            const u = sl / 26, k = Math.sin(Math.PI * Math.min(1, u * 1.6));
            profile(out, cam, t, w2, [wx - 0.45 * k, Y, z], 1, 0, { mode: "march", phase: 0.25, stride: 1.4 * k, expr: "shock", reach: 0.9 });
            out.places[out.places.length - 1].roll = -0.3 * k;
            if (sl < 16) for (let j = 0; j < 3; j++) puffAt(out, f, slip + j * 3, [wx + 0.2, Y + 0.1, z + 0.2], 0.5, 14, 0.3, 0.4);
          } else profile(out, cam, t, w2, [wx, Y, z], 1, 0, { mode: "stand", reach: 0.7 + 0.2 * Math.sin(t * 9), expr: slip >= 0 && f >= slip ? "nervous" : "stern" });
        } else if (p.moving) {
          // running toward the lens (back along the train): a front view, drawn as a run; in the air: a leap pose
          stand(out, cam, t, w2, [wx, Y + p.y, z], { mode: p.leap ? "fall" : "march", expr: p.leap ? "shock" : "stern", prop: "lantern", noBlob: true, lid: 0, sy: p.leap ? 1.08 : 1 });
          if (!p.leap) { const pl = out.places[out.places.length - 1]; void pl; }
        } else stand(out, cam, t, w2, [wx, Y, z], { expr: "stern", prop: "lantern", noBlob: true });
        out.fx.push({ key: "glowL", cw: 256, ch: 256, draw: (pp) => fxGlowCol(pp, "255,190,110", 0.7), x: wx + 0.25, y: Y + p.y + 0.7, z: z + 0.2, w: 1.3, h: 1.3, mode: "add", tint: 0.9 });
        out.fx.push({ key: "lanternCore", cw: 256, ch: 256, draw: (pp) => fxGlowCol(pp, "255,225,170", 1.0), x: wx + 0.25, y: Y + p.y + 0.62, z: z + 0.25, w: 0.32, h: 0.32, mode: "add", tint: 2.4 });
      };
      man(bm(0), legs1, CRANK - 4, SLIP);
      man(bm(1), legs2.map((l) => ({ ...l })), 99999, -1, CAPFLY, LEAP3 + 6);
      const legs4: Leg[] = [{ f0: 0, f1: LEAP3 - 16, x0: -51.8, x1: -51.8 }, { f0: LEAP3 - 16, f1: LEAP3 - 2, x0: -51.8, x1: -53.9 }, { f0: LEAP3 - 2, f1: LEAP3 + 9, x0: -53.9, x1: -56.0, leap: true }, { f0: LEAP3 + 9, f1: LEAP3 + 40, x0: -56.0, x1: -56.6 }];
      { const p = pathAt(legs4, f); stand(out, cam, t, bm(3), [X + p.x, Y + p.y, z - 0.45], { mode: p.leap ? "fall" : p.moving ? "march" : "stand", expr: f >= CAPFLY ? "shock" : "stern", prop: "lantern", noBlob: true, lid: 0 });
        out.fx.push({ key: "glowL", cw: 256, ch: 256, draw: (pp) => fxGlowCol(pp, "255,190,110", 0.7), x: X + p.x + 0.25, y: Y + p.y + 0.7, z: z - 0.25, w: 1.3, h: 1.3, mode: "add", tint: 0.9 }); }
      // a third brakeman cranks at the fifth car's wheel all along (background)
      // the cap: off on "land", spinning back and up into the dark
      if (f >= CAPFLY && f < CAPFLY + 40) {
        const u = (f - CAPFLY) / 40;
        out.fx.push({ key: "capfly", cw: 200, ch: 140, draw: (pp) => fxCap(pp, "#4a5a7a"), x: X - 54.65 + 1.2 * u, y: Y + 0.6 + 4.6 * Math.sin(Math.min(1, u * 2.2) * Math.PI / 2), z: z + 0.4 * u, w: 0.8, h: 0.56, mode: "cut", rot: 0.5 * Math.sin(u * 14) });
      }
      // the whistle: a jet of steam on "whistles"; the stack smoke
      for (let k = 0; k < 7; k++) { const u = (f - (WHISTLE - 2 + k * 3)) / 26; if (u >= 0 && u < 1) { const kk = q(u, 20);
        out.fx.push({ key: `steam${kk}`, cw: 300, ch: 300, draw: (pp) => fxPuff(pp, kk), x: X + OFF.freight[0] - 1.35 - 3.5 * u, y: RAIL_Y + 3.6 + 3.2 * u, z, w: 2.6 + 3.6 * u, h: 2.6 + 3.6 * u, mode: "cut", tint: 1.25 }); } }
      smoke(out, f, xAt, OFF.freight[0] + 3.62, RAIL_Y + 4.0, z, true);
      out.fx.push({ key: "headlamp", cw: 256, ch: 256, draw: (pp) => fxGlowCol(pp, "255,230,170", 0.9), x: X + 0.2, y: RAIL_Y + 2.9, z, w: 2.4, h: 2.4, mode: "add", tint: 1.2 });
      break;
    }
    case SH.george: case SH.letters: {
      // the workshop: George, the hose on his shoulder; he blows down it on "air". The letters: four NO letters pin up,
      // George sinks; the yard train passes behind the window with brakemen on its roofs
      if (id === SH.george) {
        const blown = f >= BLOW;
        const up = f >= HOSE_UP;
        stand(out, cam, t, C.george, AT.george, { expr: up ? "whistle" : f >= at(5, "twentytwo") ? "grin" : "smile", prop: "hose", reach: up ? smooth((f - HOSE_UP) / 6) : 0.15, swaps: [at(5, "George"), at(5, "twentytwo"), HOSE_UP] });
        for (let k = 0; k < 6; k++) { puffAt(out, f, HOSE_UP + 4 + k * 5, add(AT.george, [0.42, 1.7, 0.3]), 0.7, 18, 0.3, 0.8); puffAt(out, f, HOSE_UP + 6 + k * 5, add(AT.george, [-0.3, 0.35, 0.35]), 0.8, 18, 0.2, -0.6); }
      } else {
        const n = LETTERS.filter((l) => f >= l).length;
        stand(out, cam, t, C.george, [AT.george[0] - 0.5, 0, AT.george[2]], { expr: n >= 3 ? "sad" : n >= 1 ? "nervous" : "neutral", prop: "hose", reach: 0.1, headTilt: n >= 4 ? -6 : 0, swaps: LETTERS.slice(0, 3) });
        AT.letters.forEach((p, i) => {
          if (f < LETTERS[i]) return;
          const k = popAt(f, LETTERS[i]), st = clamp01((f - LETTERS[i] + 1) / 3);
          out.fx.push({ key: `letter${i}${q(st, 4)}`, cw: 300, ch: 380, draw: (pp) => fxLetterNo(pp, i, st), x: p[0], y: p[1], z: p[2], w: 0.55 * k, h: 0.7 * k, wallYaw: 0, rot: [0.06, -0.05, 0.03, -0.08][i] });
        });
        if (f >= at(8, "cheaper") - 4) out.fx.push({ key: "pricetag", cw: 260, ch: 180, draw: fxPriceTag, x: O.shop[0] + 0.6, y: 1.3, z: O.shop[2] - 2.65, w: 0.42, h: 0.29, mode: "cut", rot: -0.15 });
        // brakemen on the yard train's roofs (they read through the window from "Brakemen" on)
        const X = shopTrainX(f);
        [-2.0, 2.0].forEach((dx, k) => stand(out, cam, t, bm(k), [X + OFF.shop[3] + dx, ROOF_Y, O.shop[2] + SHOP_TRACK_Z], { expr: "stern", prop: "lantern", noBlob: true }));
      }
      smoke(out, f, shopTrainX, OFF.shop[0] + 3.62, RAIL_Y + 4.0, O.shop[2] + SHOP_TRACK_Z, false, 5);
      break;
    }
    case SH.vandy: case SH.half: {
      // the office: Vanderbilt behind his desk. The pitch: George holds out the hose; in on Vanderbilt: whiskers flare and
      // his face goes red on "wind", he points at the door on "fools". The callback: smug; he blows at the model train
      const coinsK = id === SH.vandy && f >= at(6, "richest") && f < at(6, "richest") + 30;
      out.fx.push({ key: "coins", cw: 240, ch: 200, draw: fxCoins, x: AT.coins[0], y: AT.coins[1] + 0.1, z: AT.coins[2], w: 0.36, h: 0.3, mode: "cut" });
      if (coinsK) glint(out, t, add(AT.coins, [0.05, 0.26, 0.05]), 0.18);
      if (id === SH.vandy) {
        const rage = f >= FLARE, fl = clamp01((f - FLARE) / 5);
        const wob = rage ? 0.12 * Math.sin((f - FLARE) * 0.8) * Math.max(0, 1 - (f - FLARE) / 30) : 0, windF = at(7, "wind");
        const vArm = f >= POINT - 4 ? "point" : f >= windF - 3 ? "fist" : undefined, vK = f >= POINT - 4 ? hit(f - (POINT - 4)) : f >= windF - 3 ? hit(f - (windF - 3)) : 1;
        // big body keys with overshoot (acting_gap.md): rocks back on "Stop", leans in 22 deg on "wind", lunges 26 deg into the point
        const lean = keys(f, [[0, 0], [FLARE - 1, 8], [windF - 2, -12], [POINT - 4, 4], [POINT - 1, -14]]);
        stand(out, cam, t, rage ? C.vandyRed : C.vandy, AT.vandy, { expr: rage ? "angry" : f >= at(6, "Vanderbilt") ? "suspicious" : "stern", flare: Math.min(1, fl + wob), arm: vArm, armK: vK, armRaw: true,
          talk: talkAt(7, f), talkBeat: 7, lean, look: rage ? 0 : -0.5, tilt: 0, swaps: [at(6, "Vanderbilt"), FLARE, windF, POINT] });
        if (f >= POINT - 4) { const pl = out.places[out.places.length - 1]; pl.mirror = !pl.mirror; } // points to screen left, at the door
        stand(out, cam, t, C.george, AT.georgeOffice, { expr: rage ? "shock" : "grin", prop: "hose", reach: rage ? 0.2 : 0.6, look: 0.6, glassesDrop: 0, swaps: [FLARE],
          lean: keys(f, [[0, 0], [at(6, "Vanderbilt"), 7], [FLARE + 2, -5], [POINT + 3, 3]]) });
      } else {
        const blow = f >= PUFF;
        stand(out, cam, t, C.vandy, AT.vandy, { expr: blow ? "whistle" : f >= SMUG ? "slygrin" : "stern", flare: f >= SMUG && !blow ? 0.35 + 0.08 * Math.sin(f * 0.5) : 0, arm: blow ? undefined : f >= SMUG - 4 ? "hips" : undefined,
          armK: f >= SMUG - 4 ? smooth((f - SMUG + 4) / 6) : 1, tilt: blow ? 14 * smooth((f - PUFF) / 5) : f >= SMUG ? -3 : 0, swaps: [SMUG, PUFF] });
        for (let k = 0; k < 5; k++) puffAt(out, f, PUFF + 1 + k * 4, add(AT.vandy, [0.32, 1.32, 0.75]), 0.5, 20, -0.45, 0.45);
      }
      break;
    }
    case SH.station: {
      // the platform: George by the engine; Tate in the cab; the bosses stroll to the first coach, smirking; the pump
      // thumps; every brake shoe clamps on "once" with a little puff at each wheel
      const X = testX(id, f), z = O.pitt[2];
      const cheer = f >= at(9, "agrees") && f < at(9, "agrees") + 30;
      stand(out, cam, t, C.george, AT.georgeStation, { expr: f >= at(9, "agrees") ? "biggrin" : "smile", prop: cheer ? null : "hose", reach: 0.15, arm: cheer ? "up" : undefined, armK: cheer ? smooth((f - at(9, "agrees")) / 5) : 1, swaps: [at(9, "agrees")] });
      const tp: V3 = [X + OFF.test[0] - 3.0, TATE_LOCAL[1], z + 0.45];
      profile(out, cam, t, C.tate, tp, 1, 0, { mode: "stand", reach: f >= LEVER1 ? 0.7 : 0.3, expr: f >= LEVER1 ? "stern" : "neutral" });
      const w0 = (at(9, "bosses") - 24) / FPS, w1 = (at(9, "watch") + 2) / FPS;
      AT.bossesFrom.forEach((a, i) => {
        if (t < w1) walk(out, cam, t, bs(i), a, AT.bossesTo[i], w0, w1, { expr: i % 2 ? "slygrin" : "suspicious" });
        else stand(out, cam, t, bs(i), AT.bossesTo[i], { expr: i % 2 ? "slygrin" : "suspicious", arm: "fold", armK: smooth((t - w1) * FPS / 6), look: -0.4, swaps: [Math.round(w1 * FPS)] });
      });
      out.fx.push({ key: `dial${q(clamp01((f - PUMP) / 40), 10)}`, cw: 200, ch: 200, draw: (pp) => fxDial(pp, clamp01((f - PUMP) / 40)), x: X + OFF.test[0] + 0.7, y: RAIL_Y + 2.15, z: z + 1.52, w: 0.34, h: 0.34, mode: "cut", wallYaw: 0 });
      if (f >= PUMP) for (let k = 0; k < 12; k++) puffAt(out, f, PUMP + k * 6, [X + OFF.test[0] + 0.7, RAIL_Y + 2.9, z + 1.35], 0.9, 14, 0.7);
      if (f >= CLAMP && f < CLAMP + 18) OFF.test.forEach((o, i) => { const xs = TEST_K[i] === "loco" ? [-0.45, 1.35] : TEST_K[i] === "tender" ? [-2.15, -0.65, 0.65, 2.15] : [-4.55, -3.05, 3.05, 4.55];
        xs.forEach((x) => { const kb = 1 - (f - CLAMP) / 18, ph = q(((f - CLAMP) / 18) % 1, 6); out.fx.push({ key: `bite${ph}`, cw: 200, ch: 200, draw: (pp) => fxSparkle(pp, ph * 7, "#ffffff"), x: X + o + x, y: RAIL_Y + 0.5, z: z + 1.45, w: 0.9 * kb, h: 0.9 * kb, mode: "cut", tint: 1.2 }); }); });
      if (f >= CLAMP) OFF.test.forEach((o, i) => {
        if (i > 3) return;
        const xs = TEST_K[i] === "loco" ? [-0.45, 1.35] : TEST_K[i] === "tender" ? [-1.4, 1.4] : [-4.0, 4.0];
        xs.forEach((x) => { for (let r2 = 0; r2 < 3; r2++) puffAt(out, f, CLAMP + i + r2 * 8, [X + o + x, RAIL_Y + 0.6, z + 1.5], 1.0, 22, 0.35); });
      });
      break;
    }
    case SH.wagon: case SH.run: case SH.bosses: {
      // the crossing: the horse plants its hooves on "stop"; the teamster tugs, then lifts his hat at the stop. The run:
      // Tate leans out, eyes huge on "sees"; he yanks George's lever on "pulls"; sparks at every wheel until the stop.
      // The bosses: on the floor of the first coach, they pick themselves up on "pick"; George sits upright
      const X = testX(id, f), z = O.pitt[2], planted = id !== SH.wagon || f >= PLANT, stopped = f >= STOPF;
      const blink = lidAt(t, 77);
      out.fx.push({ key: `horse${planted ? "p" : "s"}${blink > 0.6 ? "b" : ""}`, cw: 640, ch: 460, draw: (pp) => fxHorse(pp, planted, blink),
        x: AT.horse[0], y: RAIL_Y + (2.6 * 0.71) / 2 + (id === SH.wagon ? startle(f, PLANT, 0.6).y : 0), z: AT.horse[2], w: 2.6, h: 2.6 * 0.71, mode: "cut", tint: 1.0 });
      stand(out, cam, t, C.teamster, [AT.teamster[0], AT.teamster[1], AT.teamster[2]], { mode: "sit", expr: stopped ? "relief_open" : planted ? (id === SH.run ? "shock" : "angry") : "neutral",
        wave: stopped ? 1 : undefined, arm: planted && !stopped && id === SH.wagon ? "fist" : undefined, tilt: planted && !stopped && id === SH.wagon ? 4 * Math.sin(f * 1.1) : 0, noBlob: true, swaps: [PLANT, STOPF] });
      if (id !== SH.wagon) {
        if (f < PULL - 6) stand(out, cam, t, C.tate, [X + OFF.test[0] + TATE_LOCAL[0] + 0.3, TATE_LOCAL[1], z + 1.0], { expr: f >= SEES ? "shock" : "stern", tilt: 4, noBlob: true, lid: f >= SEES ? 0 : undefined, swaps: [SEES] });
        else stand(out, cam, t, C.tate, [X + OFF.test[0] - 2.85, TATE_LOCAL[1], z + 0.55], { expr: "angry", arm: "point", armK: smooth((f - PULL + 6) / 5), tilt: f >= PULL ? -14 * smooth((f - PULL) / 3) : 4, noBlob: true, lid: 0, swaps: [PULL - 6, PULL] });
        if (f >= at(14, "No") - 6 && f < PULL) out.fx.push({ key: "cord", cw: 80, ch: 400, draw: fxCord, x: X + OFF.test[0] - 2.9, y: CAB_FLOOR + 1.4, z: z + 1.05, w: 0.16, h: 0.85, mode: "cut" });
        sparks(out, t, X, OFF.test, TEST_K, z + 1.0, f >= PULL && !stopped ? 1 : stopped ? clamp01(1 - (f - STOPF) / 8) : 0);
        smoke(out, f, (ff) => testX(id, ff), OFF.test[0] + 3.62, RAIL_Y + 4.0, z, false);
        // the bosses inside the first coach: thrown to the floor at the stop, up again on "pick"
        const cx = X + OFF.test[2], fy = COACH_FLOOR;
        BOSSES_IN.forEach((b, i) => {
          const up = f >= PICK + i * 3, p: V3 = [cx + b[0], fy, z + b[2]];
          if (f < PULL) stand(out, cam, t, bs(i), [p[0], fy + 0.45, p[2]], { mode: "sit", expr: "slygrin", arm: "chest", noBlob: true });
          else if (!up) stand(out, cam, t, bs(i, true), [p[0], fy - 0.25, p[2]], { mode: "fall", expr: i % 2 ? "dazed" : "shock", tilt: i % 2 ? 60 : -60, noBlob: true });
          else { const u2 = clamp01((f - PICK - 4 - i * 5) / 26); stand(out, cam, t, bs(i, true), [p[0], fy - 0.25 + 0.37 * u2, p[2]], { mode: u2 < 0.6 ? "fall" : "sit", expr: i % 2 ? "nervous" : "dazed", tilt: (i % 2 ? 60 : -60) * (1 - u2), noBlob: true }); }
          if (f >= PULL) out.fx.push({ key: `bowler${i}`, cw: 200, ch: 140, draw: (pp) => fxBowler(pp, boss(i).cap ?? "#2a2630"), x: p[0] + 0.5, y: fy + 0.14, z: p[2] + 0.25, w: 0.42, h: 0.29, mode: "cut" });
        });
        stand(out, cam, t, C.george, [cx + GEORGE_IN[0], fy + 0.45, z + GEORGE_IN[2]], { mode: "sit", expr: f >= PICK ? "smile" : "grin", prop: "hose", reach: 0.1, noBlob: true });
      }
      break;
    }
    case SH.flip: {
      // 1872: George flips his valve on "flips"; the gauge needle and the rig move in world.ts
      const flipped = f >= FLIP + 4;
      const turning = f >= FLIP && f < FLIP + 10;
      stand(out, cam, t, C.george72, AT.georgeFlip, { expr: f >= FLIP ? "grin" : "suspicious", prop: turning ? null : flipped ? "valve2" : "valve", arm: turning ? "chest" : undefined, reach: 0.45, swaps: [FLIP] });
      if (turning) out.fx.push({ key: "valveTurn", cw: 200, ch: 220, draw: fxValve, x: AT.georgeFlip[0] + 0.12, y: 1.32, z: AT.georgeFlip[2] + 0.12, w: 0.34, h: 0.37, mode: "cut", rot: Math.PI * clamp01((f - FLIP) / 9) });
      if (f >= FLIP && f < FLIP + 10) { const u = (f - FLIP) / 10;
        out.fx.push({ key: `ring${q(u, 10)}`, cw: 300, ch: 300, draw: (pp) => fxRing(pp, q(u, 10)), x: AT.georgeFlip[0] + 0.33, y: 1.3, z: AT.georgeFlip[2] + 0.3, w: 0.9, h: 0.9, mode: "cut" }); }
      if (f >= HOLDS && f < HOLDS + 24) glint(out, t, add(AT.gauge, [0.0, 0.0, 0.05]), 0.3);
      break;
    }
    case SH.cut: case SH.windout: {
      // 1872 by day: the hose between the second and third boxcars parts with a blast on "Cut"; the train stops itself
      const X = freightX(SH.cut, id === SH.windout ? Math.max(f, HALT) : f), z = O.line[2];
      const hoseX = X + (OFF.freight[3] + BOX.len / 2 * -1 + OFF.freight[4] + BOX.len / 2) / 2;
      const blasting = id === SH.windout || f >= CUT;
      if (blasting) {
        const ph = q((t * 1.3) % 1, 12), k = id === SH.windout ? 1 : clamp01((f - CUT) / 3);
        for (const dir of [-1, 1]) out.fx.push({ key: `blast${ph}${dir}`, cw: 400, ch: 260, draw: (pp) => fxBlast(pp, ph), x: hoseX + dir * 0.75 * k, y: RAIL_Y + 0.42, z: z + 1.3, w: 1.4 * k, h: 0.9 * k, mode: "soft", rot: dir < 0 ? Math.PI : 0 });
      }
      if (id === SH.cut) sparks(out, t, X, OFF.freight, FREIGHT_K, z + 1.0, f >= CUT + 3 && f < HALT ? 1 : f >= HALT ? clamp01(1 - (f - HALT) / 8) : 0);
      else sparks(out, t, X, OFF.freight, FREIGHT_K, z + 1.0, clamp01(1 - (f - SHOTS[id - 1].a) / 36));
      smoke(out, f, (ff) => freightX(SH.cut, id === SH.windout ? Math.max(ff, HALT) : ff), OFF.freight[0] + 3.62, RAIL_Y + 4.0, z, false, 5);
      break;
    }
  }
  return out;
};
export { FPS };
