// Copied from the cartoon-3d-short skill template (templates/rail/toon.ts, face v3) for the Minecraft-mode cast. Keep in step with the template.
// Our own flat 2D cartoon cast (riflemen, officer, townsfolk, kid, parent) + 2D effects, drawn on a canvas.
// Construction v2 (characters.md, our own cast): superellipse heads (pointed crown 1.75 / full jaw 2.3, chin taper,
// seeded side bulge + tilt), bean torsos, single-stroke limbs with ink-dot hands, a thick-thin plum outline weighted
// away from the light, soft painted crescents, deadpan lidded eyes, no blush, no catchlights.
// Design space 600 x 1000 units (soles at y = 975); the canvas transform scales it.
export const INK = "#241726";
export const SKIN = "#ffe2c2";
const WHITE = "#ffffff";
const MOUTH = "#5a1e28";
const TONGUE = "#e86e78";
type C3 = [number, number, number];
const SH_SKIN: C3 = [0.96, 0.86, 0.84]; // measured shadow/lit ratio on skin heads
const SH_CLOTH: C3 = [0.64, 0.66, 0.74]; // torsos: lit side -> far side ~0.65
const SH_FELT: C3 = [0.62, 0.62, 0.7];

export type Build = "adult" | "stout" | "kid" | "tall";
export type Outfit = {
  jacket: string; pants: string; boots: string; hat?: string | null; belt?: string | null; buttons?: string; rifle?: boolean;
  sash?: string; sword?: boolean; moustache?: string; skin?: string; head?: number; cap?: string; hair?: string; dress?: string;
  build?: Build;
  /** palace cast: plume colour on a "helm", batik dots on a "blangkon", hairdo on "hair", a spear instead of a rifle */
  plume?: string; batik?: string; hairdo?: "braid" | "bun"; spear?: boolean; beard?: string;
  /** Javanese dress: a batik wrap (jarik) over the legs (knee length when short), a beskap jacket (diagonal button
   *  line, stand collar), a keris tucked in the sash */
  jarik?: string; jarikShort?: boolean; beskap?: boolean; keris?: boolean;
  /** modern cast: a plain skirt instead of batik on a jarik, a bow tie at the collar, glove colour for the hand dots,
   *  round glasses, a police cap band colour (hat "police") */
  jarikPlain?: boolean; bowtie?: string; gloves?: string; glasses?: boolean; band?: string;
  /** a gold monocle on the right eye with its chain; a string of pearls at the collar */
  monocle?: boolean; pearls?: boolean;
  /** kardus durian cast: a hijab (hat "hijab", colour in `cap`), a gold wrist watch, a batik shirt motif colour, a tie */
  watch?: boolean; shirtBatik?: string; tie?: string;
  /** where the hair ends above the brows (fraction of the head height from the crown; default 0.42) */
  hairTop?: number;
  /** died-on-time cast: one loose curl over the forehead (colour), a beauty mark, one thick brow across both eyes, a
   *  long pointed nose, a stethoscope round the neck, a doctor's head mirror */
  curl?: string; mole?: boolean; unibrow?: boolean; longNose?: boolean; stetho?: boolean; headMirror?: boolean;
  /** air-brake cast: big mutton-chop side whiskers (colour; FrontOpts.flare puffs them out), a neckerchief under the chin,
   *  a coil of rubber hose over the left shoulder (colour), a fur collar (colour) */
  chops?: string; scarf?: string; hoseCoil?: string; fur?: string;
  /** minecraft cast: diamond armour (chestplate pixel plates, no buttons); pair with hat "diamond_helmet" */
  armor?: "diamond";
};
type P2 = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const mul = (c: string, m: C3) => {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number, k: number) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255, m[0])}${ch((n >> 8) & 255, m[1])}${ch(n & 255, m[2])}`;
};
export const shade = (c: string, k: number) => mul(c, [k, k, k]);
export const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};
/** strain / rage flush: the whole face skin warms toward red (not cheek blush spots), k 0..1 */
const FLUSH = "#e2553f";
const flushed = (skin: string, k = 0) => (k > 0 ? mix(skin, FLUSH, 0.6 * Math.min(1, k)) : skin);
/** deterministic per-character random in [0, 1) */
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
/** diamond armour texture colours (light to dark) */
const DIAMOND = ["#e5fffa", "#b4fdee", "#6bf3e3", "#4aedd9", "#30d0be", "#2dc4b2", "#1f9d8e"];
/** chestplate over the torso (inside its clip): pixel plates, a dark seam down the middle and under the chest */
const chestplate = (p: Pen, tcx: number, chin: number, bot: number, ta: number, HH: number, u: number, seed: number) => {
  diamondPixels(p, tcx - 1.2 * ta, chin - 0.1 * HH, tcx + 1.2 * ta, bot + 0.05 * HH, 0.075 * HH, seed + 57);
  p.band([[tcx, chin], [tcx, bot - 0.32 * HH]], DIAMOND[6], 2.6 * u, 0);
  p.band([[tcx - 1.3 * ta, bot - 0.32 * HH], [tcx + 1.3 * ta, bot - 0.32 * HH]], DIAMOND[6], 3 * u, 0);
  p.band([[tcx - 1.3 * ta, chin + 0.04 * HH], [tcx + 1.3 * ta, chin + 0.04 * HH]], DIAMOND[0], 3 * u, 0); // lit collar edge
};
/** a grid of square pixels in the diamond palette over a box (call inside a clip): mostly mid tones, light pixels
 *  towards the lit top-left, dark ones low and right, so the plate reads as faceted voxel armour */
const diamondPixels = (p: Pen, x0: number, y0: number, x1: number, y1: number, cell: number, seed: number) => {
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const r = rnd(seed, 100 + j * 37 + i), lit = 1 - (i / nx) * 0.5 - (j / ny) * 0.6; // 1 at top-left
    const k = r < 0.12 * lit ? 0 : r < 0.3 * lit ? 1 : r < 0.5 ? 2 : r < 0.7 ? 3 : r < 0.86 ? 4 : r < 0.96 ? 5 : 6;
    if (k === 4) continue; // base colour shows through
    const x = x0 + i * cell, y = y0 + j * cell;
    p.poly([[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]], DIAMOND[k], 0);
  }
};
const rotPts = (pts: P2[], a: number, cx: number, cy: number): P2[] =>
  pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const rotAbout = (q: P2, a: number, c: P2): P2 => rotPts([q], a, c[0], c[1])[0];
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** smooth curve from a through (near) k to b, as a polyline */
const curve = (a: P2, k: P2, b: P2, n = 10): P2[] => {
  const c: P2 = [2 * k[0] - (a[0] + b[0]) / 2, 2 * k[1] - (a[1] + b[1]) / 2], out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return out;
};

export const RIFLEMAN: Outfit = { jacket: "#357650", pants: "#3d4440", boots: INK, hat: "shako", belt: "#f1efe6", buttons: "#d9dde0", rifle: true };
export const OFFICER: Outfit = { ...RIFLEMAN, hat: "shako_tall", buttons: "#e8c45a", sash: "#c0353a", sword: true, moustache: "#4a3020", rifle: false, belt: null, build: "stout" };
export const KID: Outfit = { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "cap", cap: "#e2453c", build: "kid" };
export const PARENT: Outfit = { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#5a3b2a" };
export const SKINS = [SKIN, "#f5c9a0", "#ecd0b6", "#c99067"];

export const soldier = (v = 0, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { ...RIFLEMAN, skin: SKINS[v % 4] };
  if (v % 4 === 1) o.moustache = "#4a3426";
  if (v % 4 === 3) o.moustache = "#2a201a";
  return { ...o, ...extra };
};

export const townsfolk = (v = 0): Outfit => {
  const coats = ["#3f6fb5", "#8c3b4a", "#5d7a3a", "#b5653f", "#2f5f6a", "#7b5ac9"];
  const o: Outfit = { jacket: coats[v % 6], pants: "#3b3f52", boots: "#4a3426", skin: SKINS[v % 4] };
  return v % 2 ? { ...o, hat: "bonnet", dress: ["#d9a441", "#c25a7a", "#5a8fc2"][v % 3] } : { ...o, hat: "tophat" };
};

export class Pen {
  g: CanvasRenderingContext2D;
  ol = 12;
  /** [angle, cx, cy] rotation about (cx, cy), optional post-translation [.., dx, dy] */
  rot: number[] | null = null;
  constructor(g: CanvasRenderingContext2D) { this.g = g; }
  P(x: number, y: number): P2 {
    if (!this.rot) return [x, y];
    const r = this.rot, a = r[0], cx = r[1], cy = r[2], dx = r.length > 3 ? r[3] : 0, dy = r.length > 4 ? r[4] : 0, c = Math.cos(a), s = Math.sin(a);
    return [cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy];
  }
  path(pts: P2[], close: boolean) {
    const g = this.g;
    g.beginPath();
    pts.forEach((p, i) => { const [x, y] = this.P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    if (close) g.closePath();
  }
  /** filled shape with an ink outline; fill=null draws the outline only */
  poly(pts: P2[], fill: string | null, ol?: number) {
    const g = this.g, w = ol ?? this.ol;
    this.path(pts, true);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); }
  }
  ell(cx: number, cy: number, rx: number, ry: number, fill: string | null, ol?: number, a0 = 0, a1 = 360, rot = 0) {
    this.poly(ellPts(cx, cy, rx, ry, a0, a1, rot), fill, ol);
  }
  /** thick round-capped limb with an ink rim (effects, rope) */
  line(pts: P2[], fill: string, w: number, ink = true) {
    const g = this.g;
    g.lineCap = "round"; g.lineJoin = "round";
    if (ink) { this.path(pts, false); g.strokeStyle = INK; g.lineWidth = w + 2 * this.ol * 0.9; g.stroke(); }
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  }
  stroke(pts: P2[], w: number, fill = INK) {
    const g = this.g;
    g.lineCap = "round"; g.lineJoin = "round";
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  }
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, fill = INK) {
    const pts: P2[] = [];
    for (let i = 0; i <= 24; i++) pts.push([cx + rx * Math.cos(rad(a0 + ((a1 - a0) * i) / 24)), cy + ry * Math.sin(rad(a0 + ((a1 - a0) * i) / 24))]);
    this.stroke(pts, w, fill);
  }
  dot(cx: number, cy: number, r: number, fill = INK) {
    const [x, y] = this.P(cx, cy);
    this.g.beginPath(); this.g.arc(x, y, r, 0, Math.PI * 2); this.g.fillStyle = fill; this.g.fill();
  }
  /** draw with a closed shape as clip */
  clip(pts: P2[], fn: () => void) { const g = this.g; g.save(); this.path(pts, true); g.clip(); fn(); g.restore(); }
  /** flat fill + soft crescent on the side away from the light (light = canvas angle the light comes FROM).
   *  Radial ramp centred `shift` R toward the light: flat out to ~0.6 R on the far side, full shadow by ~0.8 R. */
  shadedFill(pts: P2[], base: string, shadow: string, light: number, R: number, shift = 0.45, r0 = 1.05, r1 = 1.25) {
    const g = this.g, n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    const [gx, gy] = this.P(cx + Math.cos(light) * shift * R, cy + Math.sin(light) * shift * R);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r1 * R);
    gr.addColorStop(0, base); gr.addColorStop(r0 / r1, base); gr.addColorStop(1, shadow);
    this.path(pts, true); g.fillStyle = gr; g.fill();
  }
  /** broad gradient across a shape along the light: lit edge = base, far edge = shadow (torsos, coats) */
  gradFill(pts: P2[], base: string, shadow: string, light: number, flat = 0.22) {
    const g = this.g, dx = Math.cos(light), dy = Math.sin(light), n = pts.length;
    let cx = 0, cy = 0, lo = Infinity, hi = -Infinity;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; const d = x * dx + y * dy; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const dc = cx * dx + cy * dy;
    const [ax, ay] = this.P(cx + dx * (hi - dc), cy + dy * (hi - dc)), [bx, by] = this.P(cx + dx * (lo - dc), cy + dy * (lo - dc));
    const gr = g.createLinearGradient(ax, ay, bx, by);
    gr.addColorStop(0, base); gr.addColorStop(flat, base); gr.addColorStop(1, shadow);
    this.path(pts, true); g.fillStyle = gr; g.fill();
  }
  /** thick-thin ink ring: w(θ) = w0 (1 + k cos(θ − thick)), θ from the contour centroid (canvas angles) */
  inkRing(pts: P2[], w0: number, thick: number, k = 0.45, col = INK) {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    const out: P2[] = [], inn: P2[] = [];
    pts.forEach((q, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      let nx = b[1] - a[1], ny = a[0] - b[0]; // outward normal for clockwise-on-screen contours
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const h = 0.5 * w0 * (1 + k * Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - thick));
      out.push([q[0] + nx * h, q[1] + ny * h]); inn.push([q[0] - nx * h, q[1] - ny * h]);
    });
    const g = this.g;
    const trace = (r: P2[]) => { r.forEach(([x0, y0], i) => { const [x, y] = this.P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
    g.beginPath(); trace(out); trace(inn.reverse());
    g.fillStyle = col; g.fill("evenodd");
  }
  /** flat strap with a thin ink rim (cross belts, sash, rifle, handles) */
  band(pts: P2[], fill: string, w: number, rim: number, cap: CanvasLineCap = "butt") {
    const g = this.g; g.lineCap = cap; g.lineJoin = "round";
    this.path(pts, false); g.strokeStyle = INK; g.lineWidth = w + 2 * rim; g.stroke();
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
    g.lineCap = "round";
  }
}

const ellPts = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0, n = 48): P2[] => {
  const r = rad(rot), pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
};

const rrect = (x0: number, y0: number, x1: number, y1: number, r: number, n = 8): P2[] => {
  const pts: P2[] = [];
  for (const [cx, cy, a] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]])
    for (let i = 0; i <= n; i++) pts.push([cx + r * Math.cos(rad(a + (90 * i) / n)), cy + r * Math.sin(rad(a + (90 * i) / n))]);
  return pts;
};

/** tapered stroke, thick end at a: brows, moustache halves */
const taper = (p: Pen, a: P2, b: P2, wa: number, wb: number, col = INK) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  p.poly([[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
    [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]], col, 0);
  p.dot(a[0], a[1], wa / 2, col); p.dot(b[0], b[1], wb / 2, col);
};

// ---------------- contours ----------------
export type Blob = { a: number; b: number; nTop: number; nBot: number; egg: number; asym: number; rot: number; noise: number; seed: number };

/** superellipse "bean": separate crown / jaw exponents, egg taper (neg = narrower chin), one-side bulge, soft noise.
 *  Points run right -> down -> left -> up (clockwise on screen). */
export const blobPts = (cx: number, cy: number, B: Blob, n = 72): P2[] => {
  const ph = [rnd(B.seed, 11), rnd(B.seed, 12), rnd(B.seed, 13)].map((v) => v * Math.PI * 2);
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? B.nTop : B.nBot);
    let X = Math.sign(c) * Math.abs(c) ** e;
    const Y = Math.sign(s) * Math.abs(s) ** e;
    X *= (1 + B.egg * Y) * (1 + B.asym * Math.sign(X));
    const r = 1 + B.noise * (Math.cos(2 * t + ph[0]) + 0.7 * Math.cos(3 * t + ph[1]) + 0.5 * Math.cos(4 * t + ph[2]));
    const x = B.a * X * r, y = B.b * Y * r;
    pts.push([cx + x * Math.cos(B.rot) - y * Math.sin(B.rot), cy + x * Math.sin(B.rot) + y * Math.cos(B.rot)]);
  }
  return pts;
};

/** measured head: H/W 0.94, slightly pointed crown (1.75), fuller jaw (2.3), chin taper -0.12, 8 % bulge to the facing side */
export const headBlob = (seed: number, a = 118, facing = 0): Blob => ({
  a, b: a * (0.94 + 0.08 * (rnd(seed, 1) - 0.5)),
  nTop: 1.75 + 0.3 * (rnd(seed, 2) - 0.5), nBot: 2.3 + 0.3 * (rnd(seed, 3) - 0.5),
  egg: -0.12 + 0.06 * (rnd(seed, 4) - 0.5),
  asym: (0.06 + 0.04 * rnd(seed, 5)) * (facing || (rnd(seed, 6) < 0.5 ? -1 : 1)),
  rot: rad(8 * (rnd(seed, 7) - 0.5)), noise: 0.008, seed,
});

/** thickest outline direction: away from the light, pulled toward the ground (64 deg measured for upper-left light) */
export const thickAngle = (light: number) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
const DEF_LIGHT = rad(-120);

// ---------------- faces ----------------
type ExprV2 = "neutral" | "stern" | "grin" | "laugh" | "whistle" | "nervous" | "shock" | "relief" | "relief_open" | "dazed"
  | "pained" | "smile" | "smile_closed" | "lick" | "sly" | "suspicious" | "sad" | "angry" | "crosseyed" | "slygrin" | "chew" | "biggrin"
  | "wink" | "dead" | "count" | "aha";
/** face v3 adds these (v2 draws them as neutral) */
type ExprV3 = "skeptic" | "determined" | "sheepish" | "awe" | "disgust" | "fake_smile" | "smug" | "bored" | "confused" | "fear" | "terror"
  | "cry" | "furious" | "joy" | "idea";
export type Expr = ExprV2 | ExprV3;
type EyeK = "dot" | "small" | "lid" | "slit" | "happy" | "dash" | "squeeze" | "shock" | "shockHalf" | "spiral" | "cross";
type MouthK = "dash" | "frown" | "smirk" | "smile" | "smileWide" | "grin" | "laugh" | "o" | "O" | "wave" | "teeth" | "lick";
/** eyes [back, front], brows [inner, outer] offsets in u (+ = down), mouth kind */
const FACE: Record<ExprV2, { eye: [EyeK, EyeK]; brow: [number, number]; mouth: MouthK }> = {
  neutral: { eye: ["lid", "lid"], brow: [0, -1], mouth: "dash" },
  stern: { eye: ["lid", "lid"], brow: [8, -4], mouth: "frown" },
  grin: { eye: ["happy", "happy"], brow: [-3, -3], mouth: "grin" },
  laugh: { eye: ["squeeze", "squeeze"], brow: [-4, -4], mouth: "laugh" },
  whistle: { eye: ["dash", "dash"], brow: [-2, -4], mouth: "o" },
  nervous: { eye: ["small", "small"], brow: [-6, 4], mouth: "wave" },
  shock: { eye: ["shock", "shock"], brow: [-7, -6], mouth: "O" },
  relief: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "smileWide" },
  relief_open: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "grin" },
  dazed: { eye: ["spiral", "spiral"], brow: [-3, 2], mouth: "wave" },
  pained: { eye: ["squeeze", "lid"], brow: [-3, 2], mouth: "teeth" },
  smile: { eye: ["dot", "dot"], brow: [0, -1], mouth: "smirk" },
  smile_closed: { eye: ["happy", "happy"], brow: [0, -1], mouth: "smile" },
  lick: { eye: ["dot", "dot"], brow: [0, -1], mouth: "lick" },
  sly: { eye: ["lid", "lid"], brow: [2, -3], mouth: "smirk" },
  suspicious: { eye: ["slit", "slit"], brow: [8, -3], mouth: "frown" },
  sad: { eye: ["lid", "lid"], brow: [-8, 8], mouth: "frown" },
  angry: { eye: ["small", "small"], brow: [10, -6], mouth: "teeth" },
  crosseyed: { eye: ["cross", "cross"], brow: [-7, -6], mouth: "wave" },
  slygrin: { eye: ["slit", "slit"], brow: [7, -5], mouth: "grin" },
  chew: { eye: ["happy", "happy"], brow: [-1, -2], mouth: "wave" },
  biggrin: { eye: ["slit", "slit"], brow: [8, -6], mouth: "laugh" },
  wink: { eye: ["dash", "dot"], brow: [3, -5], mouth: "smirk" },
  dead: { eye: ["dash", "dash"], brow: [0, 0], mouth: "dash" },
  count: { eye: ["slit", "slit"], brow: [6, -2], mouth: "o" },
  /** brows shot up, eyes wide open, a little "oh": noticing something */
  aha: { eye: ["dot", "dot"], brow: [-8, -8], mouth: "o" },
};
const halfLid = (k: EyeK): EyeK => (k === "dot" || k === "small" ? "lid" : k === "lid" ? "slit" : k === "shock" ? "shockHalf" : k);
const eyeKind = (k: EyeK, lid: number): EyeK =>
  lid >= 1 && k !== "happy" && k !== "squeeze" && k !== "spiral" ? "dash" : lid > 0 ? halfLid(k) : k;
const lidOf = (b: boolean | number | undefined) => (b === true ? 1 : Number(b) || 0);

const eye = (p: Pen, kind: EyeK, x: number, ey: number, u: number, side: number, look: number, skin: string) => {
  const lx = x + look * 3 * u, lw = 3.8 * u;
  switch (kind) {
    case "dot": p.ell(lx, ey, 3.8 * u, 5.5 * u, INK, 0); break;
    case "small": p.ell(lx, ey, 3 * u, 4.4 * u, INK, 0); break;
    case "lid": p.ell(lx, ey - u, 7 * u, 6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey - u], [x + 9 * u, ey - u]], lw); break;
    case "slit": p.ell(lx, ey, 7 * u, 2.6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey], [x + 9 * u, ey]], lw); break;
    case "happy": p.arc(x, ey + 3 * u, 8 * u, 6 * u, 200, 340, lw); break;
    case "dash": p.stroke([[x - 8.5 * u, ey], [x + 8.5 * u, ey]], lw); break;
    case "squeeze": p.stroke([[x + 6 * u * side, ey - 5 * u], [x - 6 * u * side, ey], [x + 6 * u * side, ey + 5 * u]], lw); break;
    case "cross": // wide eyes, both pupils pulled in to the nose (the moth on it)
      p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u); p.dot(x + side * 6 * u, ey + 2 * u, 3.6 * u);
      break;
    case "shock": case "shockHalf":
      p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u); p.dot(lx - side * 1.5 * u, ey + 1.5 * u, 3 * u);
      if (kind === "shockHalf") { p.ell(x, ey, 11 * u, 11 * u, skin, 0, 180, 360); p.stroke([[x - 11 * u, ey], [x + 11 * u, ey]], 2.6 * u); }
      break;
    default: {
      const s: P2[] = [];
      for (let t = 1; t < 15; t++) s.push([x + Math.cos(t * 0.9) * t * 0.55 * u, ey + Math.sin(t * 0.9) * t * 0.55 * u]);
      p.stroke(s, 2.4 * u);
    }
  }
};

/** open "D" mouth with a white teeth band (+ tongue) */
const dmouth = (p: Pen, mx: number, y: number, rx: number, ry: number, u: number, tongue = false) => {
  p.ell(mx, y, rx, ry, MOUTH, 0, 0, 180);
  p.clip([[mx - rx, y], [mx + rx, y], [mx + rx, y + 3 * u], [mx - rx, y + 3 * u]], () => p.ell(mx, y, rx, ry, WHITE, 0, 0, 180));
  if (tongue) p.ell(mx + 2 * u, y + 0.62 * ry, 0.4 * rx, 0.28 * ry, TONGUE, 0);
  p.ell(mx, y, rx, ry, null, 3 * u, 0, 180);
};

const mouth = (p: Pen, kind: MouthK, mx: number, my: number, u: number, k = 1) => {
  const mw = 4 * u;
  switch (kind) {
    case "dash": p.stroke([[mx - 5.5 * u * k, my], [mx + 5.5 * u * k, my - 0.8 * u]], mw); break;
    case "frown": p.arc(mx, my + 3 * u, 6.5 * u * k, 3.5 * u, 200, 340, mw); break;
    case "smirk": p.arc(mx + u, my - 3 * u, 7 * u * k, 4 * u, 10, 150, mw); break;
    case "smile": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); break;
    case "smileWide": p.arc(mx, my - 4 * u, 11 * u * k, 6 * u, 15, 165, mw); break;
    case "grin": dmouth(p, mx, my - u, 12 * u * k, 8 * u, u); break;
    case "laugh": dmouth(p, mx, my, 16 * u * k, 11 * u, u, true); break;
    case "o": p.ell(mx + 4 * u, my, 3.5 * u, 4 * u, MOUTH, 2.8 * u); break;
    case "O": p.ell(mx, my + 2 * u, 9 * u * k, 11 * u, MOUTH, 3.2 * u); break;
    case "wave": { const s: P2[] = []; for (let i = 0; i <= 12; i++) s.push([mx - 9 * u * k + i * 1.5 * u * k, my + 1.5 * u * Math.sin(i * 1.3)]); p.stroke(s, 3 * u); break; }
    case "teeth":
      p.poly([[mx - 12 * u * k, my - 4 * u], [mx + 12 * u * k, my - 4 * u], [mx + 11 * u * k, my + 4 * u], [mx - 11 * u * k, my + 4 * u]], WHITE, 3 * u);
      for (const j of [-1, 0, 1]) p.stroke([[mx + j * 6 * u * k, my - 4 * u], [mx + j * 6 * u * k, my + 4 * u]], 1.5 * u);
      break;
    case "lick": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); p.ell(mx + 6 * u * k, my + 3 * u, 3.6 * u, 4.6 * u, TONGUE, 2.4 * u); break;
  }
};

// ---------------- face v3: parametric ("Bahasa Wajah Toon" reference page) ----------------
// Numbers per expression instead of fixed eye / mouth shapes. House rules: the upper lid tilts with the brow (angry
// slopes down to the nose, sad up); brows per side (one can rise); a lower lid (cheek line) marks a real smile; white
// eyes only at peaks, pupil size carries the meaning; mouths are never symmetric except deadpan. Pairs are [back, front]
// like FACE. Brows stay inside the forehead band: -8u (up) .. +12u (down).
/** false = the old v2 faces (before/after renders) */
export const FACE_V3 = true;
type EyeV = "dial" | "happy" | "squeeze" | "dash" | "spiral" | "cross";
/** teeth: 0 none / 1 top band / 2 gritted (a mix passes through fractions: the band grows in, >= 1.5 grits);
 *  tongue, wave and lick are 0..1 amounts (1 = the full shape) */
type MouthV = { w: number; c?: number; tilt?: number; open?: number; round?: number; teeth?: number; tongue?: number; wave?: number; lick?: number };
type Pair = [number, number];
type FaceV = { eye?: EyeV | [EyeV, EyeV]; white?: boolean; lid?: number | Pair; low?: number | Pair; pupil?: number; look?: Pair;
  brow: Pair | [Pair, Pair]; mouth: MouthV; fx?: ("sweat" | "tears" | "ticks")[];
  /** set only on a face part-way through a morph (mixFace): lid lines fade in, a rising lower lid bends into the happy arc */
  soft?: boolean };
/** exported for the skill's expression presets (presets/expressions/*.json copy these numbers; a test keeps them equal) */
export const EXPR_FACES: Record<Expr, FaceV> = {
  neutral: { lid: 0.5, brow: [0, -1], mouth: { w: 5.5, tilt: 0.8 } },
  stern: { lid: 0.45, brow: [8, -4], mouth: { w: 6.5, c: -0.45, tilt: -1 } },
  grin: { eye: "happy", brow: [-3, -3], mouth: { w: 12, c: 0.7, open: 0.55, teeth: 1, tilt: 1.5 } },
  laugh: { eye: "squeeze", brow: [-4, -4], mouth: { w: 16, c: 0.6, open: 0.95, teeth: 1, tongue: 1, tilt: 1 } },
  whistle: { eye: "dash", brow: [-2, -4], mouth: { w: 3.5, open: 0.3, round: 1 } },
  nervous: { brow: [-6, 4], look: [0.5, 0], mouth: { w: 9, wave: 1 } },
  shock: { white: true, pupil: 0.55, brow: [-8, -7], mouth: { w: 9, open: 0.9, round: 1 } },
  relief: { eye: "happy", brow: [-2, 3], mouth: { w: 11, c: 0.75, tilt: 1 } },
  relief_open: { eye: "happy", brow: [-2, 3], mouth: { w: 12, c: 0.7, open: 0.5, teeth: 1, tilt: 1 } },
  dazed: { eye: "spiral", brow: [-3, 2], mouth: { w: 9, wave: 1 } },
  pained: { eye: ["squeeze", "dial"], lid: [0, 0.5], brow: [-3, 2], mouth: { w: 12, c: -0.2, open: 0.45, teeth: 2, tilt: -2 } },
  smile: { low: 0.3, brow: [0, -1], mouth: { w: 7, c: 0.6, tilt: 2.5 } },
  smile_closed: { eye: "happy", brow: [0, -1], mouth: { w: 8, c: 0.7, tilt: 1.5 } },
  lick: { low: 0.3, brow: [0, -1], mouth: { w: 8, c: 0.7, lick: 1 } },
  sly: { lid: 0.42, brow: [3, -3], look: [0.6, 0], mouth: { w: 7, c: 0.5, tilt: 3.5 } },
  suspicious: { lid: 0.62, low: 0.2, brow: [[3, -1], [8, -3]], mouth: { w: 6.5, c: -0.4, tilt: -2 } },
  sad: { lid: 0.5, brow: [-8, 8], look: [0, 0.6], mouth: { w: 7, c: -0.75, tilt: -1 } },
  angry: { lid: 0.4, brow: [10, -6], mouth: { w: 12, c: -0.4, open: 0.4, teeth: 2 } },
  crosseyed: { eye: "cross", brow: [-7, -6], mouth: { w: 9, wave: 1 } },
  slygrin: { lid: 0.5, brow: [7, -5], mouth: { w: 12, c: 0.7, open: 0.5, teeth: 1, tilt: 3 } },
  chew: { eye: "happy", brow: [-1, -2], mouth: { w: 9, wave: 1 } },
  biggrin: { lid: 0.5, low: 0.2, brow: [8, -6], mouth: { w: 16, c: 0.6, open: 0.9, teeth: 1, tongue: 1, tilt: 2 } },
  wink: { eye: ["dash", "dial"], low: [0, 0.25], brow: [[3, -2], [-4, -5]], mouth: { w: 7, c: 0.6, tilt: 3 } },
  dead: { eye: "dash", brow: [0, 0], mouth: { w: 5.5 } },
  count: { lid: 0.62, brow: [6, -2], mouth: { w: 3.5, open: 0.3, round: 1 } },
  aha: { brow: [-8, -8], mouth: { w: 3.5, open: 0.3, round: 1 } },
  skeptic: { lid: [0.2, 0.5], brow: [[-8, -7], [4, 0]], mouth: { w: 6, c: -0.1, tilt: 3 } },
  determined: { lid: 0.3, brow: [7, -3], mouth: { w: 8, c: -0.15, tilt: -1 } },
  sheepish: { low: 0.32, brow: [-6, 4], look: [-0.5, 0.4], mouth: { w: 7, c: 0.45, tilt: -2 }, fx: ["sweat"] },
  awe: { white: true, pupil: 1.25, brow: [-7, -4], mouth: { w: 5, open: 0.5, round: 1 } },
  disgust: { lid: 0.5, low: 0.4, brow: [7, 0], mouth: { w: 9, c: -0.6, tilt: -5, open: 0.3, teeth: 2 } },
  fake_smile: { lid: 0.1, brow: [-1, 0], mouth: { w: 10, c: 0.8, open: 0.3, teeth: 2 }, fx: ["sweat"] },
  smug: { lid: 0.5, low: 0.12, brow: [-2, -5], mouth: { w: 8, c: 0.6, tilt: 3 } },
  bored: { lid: 0.78, brow: [0, 2], look: [0, 0.3], mouth: { w: 6, c: -0.2, tilt: -1 } },
  confused: { lid: [0, 0.3], brow: [[-8, -5], [3, -1]], mouth: { w: 7, wave: 1, tilt: 2 } },
  fear: { white: true, pupil: 0.7, brow: [-8, 1], mouth: { w: 10, c: -0.4, open: 0.4, teeth: 1 }, fx: ["sweat"] },
  terror: { white: true, pupil: 0.4, brow: [-8, -3], mouth: { w: 13, c: -0.6, open: 0.9, teeth: 2 }, fx: ["sweat", "ticks"] },
  cry: { eye: "squeeze", brow: [-8, 9], mouth: { w: 12, c: -0.9, open: 0.7, teeth: 1 }, fx: ["tears"] },
  furious: { white: true, pupil: 0.5, lid: 0.3, brow: [12, -7], mouth: { w: 15, c: -0.6, open: 0.75, teeth: 2 } },
  joy: { low: 0.45, brow: [-3, -3], mouth: { w: 11, c: 0.8, open: 0.45, teeth: 1, tilt: 1 } },
  idea: { white: true, pupil: 1, brow: [-8, -7], mouth: { w: 11, c: 0.9, open: 0.5, teeth: 1 }, fx: ["ticks"] },
};
const V3 = EXPR_FACES;
const pairOf = <T,>(v: T | [T, T]): [T, T] => (Array.isArray(v) ? (v as [T, T]) : [v, v]);
const browOf = (F: FaceV): [Pair, Pair] => {
  const b = (typeof F.brow[0] === "number" ? [F.brow, F.brow] : F.brow) as [Pair, Pair];
  return b.map(([i, o]) => [clamp(i, -8, 12), clamp(o, -8, 12)]) as [Pair, Pair];
};

// ---------------- expression morph (face v3) ----------------
/** a face part-way from one expression to another: k = 0 is `from`, 1 is `to` (cast.ts exprMorph() eases k over frames).
 *  Every number (lids, brows, pupils, gaze, mouth width / curve / tilt / opening, teeth, tongue) slides; a happy-arc
 *  eye is a dial eye with the lower lid up (lid 0, low 1) and a dash eye a shut dial (lid 0.55, low 0.45), so a flat
 *  face can smile its eyes shut a frame at a time. Shapes that cannot slide (squeeze, spiral or cross eyes, white
 *  shock eyes, a round O mouth, sweat / tears) switch at k = 0.5, where exprMorph() puts a blink. */
/** `from` may itself be a mix: a change that starts before the last one finished slides on from where it got to */
export type ExprMix = { from: ExprIn; to: Expr; k: number };
export type ExprIn = Expr | ExprMix;
/** the expression a mix reads as (the nearer end): v2 faces, the profile sweat drop */
export const exprName = (e: ExprIn): Expr => (typeof e === "string" ? e : e.k < 0.5 ? exprName(e.from) : e.to);
const EYE_AS_DIAL: Partial<Record<EyeV, [number, number]>> = { dial: [-1, -1], happy: [0, 1], dash: [0.55, 0.45] };
const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;
/** one eye of a face as [kind, lid, low], happy / dash folded into dial numbers */
const eyeNum = (F: FaceV, i: number): [EyeV, number, number, boolean] => {
  const k = pairOf<EyeV>(F.eye ?? "dial")[i], d = EYE_AS_DIAL[k];
  if (!d) return [k, pairOf(F.lid ?? 0)[i], pairOf(F.low ?? 0)[i], false];
  return d[0] < 0 ? ["dial", pairOf(F.lid ?? 0)[i], pairOf(F.low ?? 0)[i], true] : ["dial", d[0], d[1], true];
};
/** true when going a -> b has a part that cannot slide (it switches at k = 0.5 and wants a blink to hide it) */
export const exprSnaps = (a: Expr, b: Expr) => {
  const A = V3[a], B = V3[b];
  if (!!A.white !== !!B.white) return true;
  for (const i of [0, 1]) { const ea = eyeNum(A, i), eb = eyeNum(B, i); if (!(ea[3] && eb[3]) && ea[0] !== eb[0]) return true; }
  return (A.mouth.round ?? 0) > 0.5 !== (B.mouth.round ?? 0) > 0.5;
};
const mixFace = (A: FaceV, B: FaceV, k: number): FaceV => {
  const near = k < 0.5 ? A : B, eye: [EyeV, EyeV] = ["dial", "dial"], lid: Pair = [0, 0], low: Pair = [0, 0];
  for (const i of [0, 1]) {
    const ea = eyeNum(A, i), eb = eyeNum(B, i);
    eye[i] = ea[3] && eb[3] ? "dial" : k < 0.5 ? pairOf<EyeV>(A.eye ?? "dial")[i] : pairOf<EyeV>(B.eye ?? "dial")[i];
    lid[i] = lerpN(ea[1], eb[1], k); low[i] = lerpN(ea[2], eb[2], k);
  }
  const ba = browOf(A), bb = browOf(B), la = A.look ?? [0, 0], lb = B.look ?? [0, 0];
  const brow = [0, 1].map((i) => [lerpN(ba[i][0], bb[i][0], k), lerpN(ba[i][1], bb[i][1], k)]) as [Pair, Pair];
  const MZ = { c: 0, tilt: 0, open: 0, round: 0, teeth: 0, tongue: 0, wave: 0, lick: 0 }, ma = { ...MZ, ...A.mouth }, mb = { ...MZ, ...B.mouth };
  const mouth = Object.fromEntries((["w", ...Object.keys(MZ)] as (keyof MouthV)[]).map((n) => [n, lerpN(ma[n] ?? 0, mb[n] ?? 0, k)])) as MouthV;
  return { eye, white: near.white, lid, low, pupil: lerpN(A.pupil ?? 1, B.pupil ?? 1, k), look: [lerpN(la[0], lb[0], k), lerpN(la[1], lb[1], k)],
    brow, mouth, fx: near.fx, soft: true };
};
/** the face numbers for an expression or a mix */
const faceV = (e: ExprIn): FaceV => {
  if (typeof e === "string") return V3[e];
  const k = clamp(e.k, 0, 1);
  return k <= 0 ? faceV(e.from) : k >= 1 ? V3[e.to] : mixFace(faceV(e.from), V3[e.to], k);
};
/** quadratic curve a -> b through control c, as points */
const qpts = (a: P2, c: P2, b: P2, n = 12): P2[] => {
  const o: P2[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, s = 1 - t; o.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]); }
  return o;
};
/** one eye: i = 0 back / 1 front, side = -1 screen-left / +1 screen-right, look = extra horizontal glance, blink 0..1 */
const eyeV = (p: Pen, F: FaceV, i: number, x: number, ey: number, u: number, side: number, look: number, blink: number) => {
  const k = pairOf<EyeV>(F.eye ?? "dial")[i], [dI, dO] = browOf(F)[i], lw = 3.8 * u;
  const m = clamp((dI - dO) * 0.035, -0.4, 0.4), ly = (xx: number, yc: number) => yc - m * (xx - x) * side; // lid follows brow
  const happy = () => p.stroke(qpts([x - 8 * u, ey + 3 * u], [x, ey - 8 * u], [x + 8 * u, ey + 3 * u]), lw);
  const dash = (yc: number) => p.stroke([[x - 8.5 * u, ly(x - 8.5 * u, yc)], [x + 8.5 * u, ly(x + 8.5 * u, yc)]], lw);
  if (k === "happy") return happy();
  if (k === "squeeze") return p.stroke([[x + 6 * u * side, ey - 5 * u], [x - 6 * u * side, ey], [x + 6 * u * side, ey + 5 * u]], lw);
  if (k === "spiral") {
    const s: P2[] = [];
    for (let t = 1; t < 15; t++) s.push([x + Math.cos(t * 0.9) * t * 0.55 * u, ey + Math.sin(t * 0.9) * t * 0.55 * u]);
    return p.stroke(s, 2.4 * u);
  }
  if (k === "dash" || blink >= 1) return dash(ey);
  const W = !!F.white || k === "cross", R = W ? 11 * u : 6.5 * u, RX = W ? 10 * u : 6.2 * u;
  const T0 = pairOf(F.lid ?? 0)[i], T = T0 + (1 - T0) * blink, B = pairOf(F.low ?? 0)[i];
  const lh = clamp((F.look?.[0] ?? 0) + look, -1, 1), lv = F.look?.[1] ?? 0;
  const ecx = W ? x : x + lh * 2.5 * u, ecy = W ? ey : ey + lv * 2 * u;
  if (T + B >= 0.95) return B >= T ? happy() : dash(ecy - R + T * 2 * R);
  const yc0 = T < 0.02 ? ecy - R - 8 * u : ecy - R + T * 2 * R, yb = B < 0.02 ? ecy + R + 8 * u : ecy + R - B * 2 * R, X = RX + 3 * u;
  // a face part-way through a morph (F.soft): lid lines grow in instead of popping, and an eye rising into a smile
  // (lower lid over half-way up) bends its lower lid into the happy arc while the cap above thins onto it, so it
  // lands on happy() without a jump. Whole expressions never set soft and draw exactly as before.
  const soft = !!F.soft, fade = (v: number) => (soft ? Math.min(1, v / 0.15) : 1);
  const h = soft && B >= T ? clamp((B - 0.45) / 0.5, 0, 1) ** 2 * (3 - 2 * clamp((B - 0.45) / 0.5, 0, 1)) : 0;
  const yc = h ? yc0 + (ey - 2.5 * u - yc0) * h * h : yc0;
  const lowL = lerp2([x - X * 0.9, yb + 1.5 * u], [x - 8 * u, ey + 3 * u], h), lowC = lerp2([x, yb - 3.5 * u], [x, ey - 8 * u], h),
    lowR = lerp2([x + X * 0.9, yb + 1.5 * u], [x + 8 * u, ey + 3 * u], h);
  const clipPts: P2[] = [[x - X - 2 * u, ly(x - X - 2 * u, yc)], [x + X + 2 * u, ly(x + X + 2 * u, yc)],
    ...(h ? qpts(lerp2([x + X + 2 * u, yb + 2 * u], lowR, h), lerp2([x, yb - 4 * u], lowC, h), lerp2([x - X - 2 * u, yb + 2 * u], lowL, h))
      : qpts([x + X + 2 * u, yb + 2 * u], [x, yb - 4 * u], [x - X - 2 * u, yb + 2 * u]))];
  p.clip(clipPts, () => {
    if (!W) { p.ell(ecx, ecy, RX, R, INK, 0); return; }
    const pu = F.pupil ?? 1;
    p.ell(x, ey, RX, R, WHITE, 2.6 * u);
    p.dot(k === "cross" ? x - side * 5 * u : x + lh * 3.5 * u - side * u * (pu < 0.8 ? 0 : 1), ey + u + lv * 3.5 * u, 3.6 * u * pu);
  });
  if (T >= 0.02) p.stroke([[x - X, ly(x - X, yc)], [x + X, ly(x + X, yc)]], lw * fade(T));
  if (B >= 0.02) p.stroke(qpts(lowL, lowC, lowR), (2.4 * u + (lw - 2.4 * u) * h) * fade(B));
};
/** mouth from numbers: w half-width (u), c curve (-1 frown .. 1 smile), tilt (right corner up), open 0..1, round = o/O,
 *  teeth 1 = top band / 2 = gritted, tongue, wave, lick. Talking opens it without losing the curve. */
const mouthV = (p: Pen, M0: MouthV, mx: number, my: number, u: number, k = 1) => {
  const M = { c: 0, tilt: 0, open: 0, round: 0, teeth: 0, tongue: 0, wave: 0, lick: 0, ...M0 };
  if (TALK > 0.3) { M.wave = 0; M.lick = 0; M.w = Math.max(M.w, 6); M.open = Math.max(M.open, 0.12 + 0.5 * TALK); }
  const w = M.w * u * k;
  if (M.wave >= 0.999) {
    const s: P2[] = [];
    for (let i = 0; i <= 12; i++) s.push([mx - w + (i * 2 * w) / 12, my + 1.6 * u * Math.sin(i * 1.3) - M.tilt * u * 0.5 * (i / 6 - 1)]);
    return p.stroke(s, 3 * u);
  }
  if (M.round > 0.5 && M.open > 0.05) {
    const ry = M.open * 10 * u + 2 * u, cy = my + M.open * 2 * u;
    p.ell(mx, cy, w, ry, MOUTH, 0);
    if (M.tongue > 0.02 || M.open > 0.6) p.clip(ellPts(mx, cy, w, ry, 0, 360), () => p.ell(mx + u, cy + ry * 0.8, w * 0.6, ry * 0.4, TONGUE, 0));
    return p.ell(mx, cy, w, ry, null, 3 * u);
  }
  const cy = my - M.c * 3.5 * u, Lp: P2 = [mx - w, cy + M.tilt * u * 0.5], Rp: P2 = [mx + w, cy - M.tilt * u * 0.5], top = my + M.c * 4 * u;
  // a part-way wavy mouth (expression morph): the wobble of the wave mouth, scaled, on the upper lip
  const upper = M.wave > 0.02
    ? qpts(Lp, [mx, top], Rp, 14).map(([x, y], i): P2 => [x, y + M.wave * 1.6 * u * Math.sin((i * 1.3 * 12) / 14)])
    : qpts(Lp, [mx, top], Rp, 14);
  if (M.open < 0.05) {
    p.stroke(upper, (4 - M.wave) * u);
    if (M.lick > 0.02) { const l = Math.min(1, M.lick); p.ell(mx + 0.75 * w, my + 3 * u, 3.6 * u * l, 4.6 * u * l, TONGUE, 2.4 * u); }
    return;
  }
  const bot = top + M.open * 22 * u, shape = [...upper, ...qpts(Rp, [mx, bot], Lp, 14)];
  p.poly(shape, M.teeth >= 1.5 ? WHITE : MOUTH, 0);
  p.clip(shape, () => {
    if (M.teeth > 0.02 && M.teeth < 1.5) p.stroke(upper, 7 * u * Math.min(1, M.teeth), WHITE);
    if (M.teeth >= 1.5) {
      p.stroke(qpts(Lp, [mx, (top + bot) / 2], Rp), 1.6 * u);
      for (const j of [-0.5, 0, 0.5]) p.stroke([[mx + j * w, cy - 20 * u], [mx + j * w, bot + 4 * u]], 1.5 * u);
    }
    if (M.tongue > 0.02) { const tg = Math.min(1, M.tongue); p.ell(mx + 2 * u, (top + bot) / 2 + M.open * 6 * u, w * 0.45 * tg, (M.open * 6 * u + 1.5 * u) * tg, TONGUE, 0); }
  });
  p.poly(shape, null, 3 * u);
};
/** sweat drop / tear streams / surprise ticks (front faces; the profile skips the ticks) */
const fxV = (p: Pen, F: FaceV, cx: number, cy: number, eyes: number[], u: number, sd: number, ticks: boolean) => {
  if (F.fx?.includes("sweat")) p.ell(cx + 40 * u * sd, cy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
  if (F.fx?.includes("tears")) for (const x of eyes) {
    const s = x < cx ? -1 : 1, pts: P2[] = [[x + s * 2 * u, cy + 7 * u], [x + s * 3 * u, cy + 16 * u], [x + s * 2 * u, cy + 26 * u]];
    p.stroke(pts, 6.4 * u); p.stroke(pts, 3.6 * u, "#9fd4ff");
  }
  if (ticks && F.fx?.includes("ticks")) for (const dg of [-62, -42, -22]) {
    const r = rad(dg), c = Math.cos(r) * sd, s = Math.sin(r);
    p.stroke([[cx + c * 56 * u, cy + s * 55 * u], [cx + c * 63 * u, cy + s * 62 * u]], 3 * u);
  }
};

/** face v2 (front / 3-4). u = 1 % of the head path width W. Eyes 26u apart on the centre line, brows 20u up, mouth 20u
 *  down, everything slid toward the facing side. No blush, no catchlights. */
let GLASS_DROP = 0;
/** secondary motion (deg): hat, hair edge and curl swing this far behind the head (set per drawing by bodyFront/bodySide) */
let DRAG = 0;
let TALK = 0;
const talkMouth = (k: MouthK): MouthK => (TALK > 0.66 ? "O" : TALK > 0.3 ? "o" : k);
let FACEX: { unibrow?: boolean; longNose?: boolean; mole?: boolean; chops?: string; flare?: number } = {};
const faceFront = (p: Pen, cx: number, cy: number, W: number, exprIn: ExprIn, facing: number, look: number, lid: number, brim: boolean,
  skin: string, moustache?: string, stout = false, beard?: string, glasses = false, monocle = false) => {
  const expr = exprName(exprIn), u = W / 100, F = FACE[expr as ExprV2] ?? FACE.neutral, V = FACE_V3 ? faceV(exprIn) : null, fx = cx + 7 * u * facing;
  const ex = (!V && F.eye[0] === "shock" ? 12 : 13) * u, ey = cy;
  for (const side of [-1, 1]) {
    const x = fx + side * ex, i = (facing ? side === facing : side > 0) ? 1 : 0;
    const kind = eyeKind(F.eye[i], lid);
    if (V) eyeV(p, V, i, x, ey, u, side, look, lid);
    else eye(p, kind, x, ey, u, side, look, skin);
    const [dI, dO] = V ? browOf(V)[i] : F.brow, by = ey - BROW_Y * u;
    if (FACEX.unibrow) continue;
    if (!V && (kind === "shock" || kind === "shockHalf")) p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 8.5 * u, by + dI * u], [x + side * 8.5 * u, by + dO * u], 5 * u, 2.5 * u);
  }
  if (FACEX.unibrow) { // one thick black brow across both eyes: its ends follow the expression's outer brows, the middle the inner
    const [dI, dO] = V ? browOf(V)[1] : F.brow, by = ey - BROW_Y * u, shock = V ? !!V.white : F.eye[0] === "shock";
    const pts: P2[] = [[fx - ex - 11 * u, by + (shock ? -8 : dO) * u], [fx - ex + 4 * u, by + (shock ? -10 : (dI + dO) / 2) * u], [fx, by + (shock ? -9 : dI) * u],
      [fx + ex - 4 * u, by + (shock ? -10 : (dI + dO) / 2) * u], [fx + ex + 11 * u, by + (shock ? -8 : dO) * u]];
    p.stroke(pts, 9 * u, "#1a1418"); p.stroke(pts, 6.5 * u, "#2e2228");
  }
  if (FACEX.longNose) { // a long pointed nose from between the eyes down past the mouth corner
    const nx = fx + 2 * u * (facing || 1);
    p.poly([[nx - 4.5 * u, cy - 2 * u], [nx + 4.5 * u, cy - 2 * u], [nx + 3 * u * (facing || 1) + 1.5 * u, cy + 17 * u], [nx + 9 * u * (facing || 1), cy + 21 * u]], skin, 2.6 * u);
  }
  if (FACEX.mole) p.dot(cx + 18 * u, cy + 15 * u, 2.6 * u, "#3a2228");
  if (FACEX.chops) for (const side of [-1, 1]) { // mutton chops: fat white puffs from the ears down the cheeks, flaring out
    const k = 1 + 0.7 * (FACEX.flare ?? 0), bx = cx + side * (40 + 10 * (k - 1)) * u, by = cy + 12 * u;
    const pts: P2[] = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = 1 + 0.12 * Math.sin(a * 5 + side); pts.push([bx + Math.cos(a) * 15 * k * r * u, by + Math.sin(a) * 25 * r * u]); }
    p.poly(pts, FACEX.chops, 2.4 * u);
    for (let j = 0; j < 3; j++) p.stroke([[bx - side * 4 * u, by - 14 * u + j * 12 * u], [bx + side * 6 * k * u, by - 8 * u + j * 12 * u]], 1.4 * u, "#c9c4bc");
  }
  const mx = cx + 8 * u * facing, my = cy + 20 * u;
  if (V) { mouthV(p, V.mouth, mx, my, u); fxV(p, V, cx, cy, [fx - ex, fx + ex], u, facing < 0 ? -1 : 1, true); }
  else mouth(p, talkMouth(F.mouth), mx, my, u);
  if (moustache) for (const s of [-1, 1])
    taper(p, [mx + s * 1.5 * u, cy + 12.5 * u], [mx + s * (stout ? 19 : 15) * u, cy + (stout ? 10.5 : 15) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (beard) p.poly([[mx - 13 * u, cy + 29 * u], [mx + 13 * u, cy + 29 * u], [mx + 6 * u, cy + 46 * u], [mx, cy + 52 * u], [mx - 6 * u, cy + 46 * u]], beard, 2.4 * u);
  if (monocle) { // gold rim round the right-hand eye, a fine chain down to the collar
    const mx2 = fx + 13 * u;
    p.arc(mx2, cy, 11 * u, 11 * u, 0, 360, 3.2 * u, "#c9a24e");
    p.stroke([[mx2 + 9 * u, cy + 7 * u], [mx2 + 16 * u, cy + 30 * u], [mx2 + 10 * u, cy + 56 * u]], 1.4 * u, "#c9a24e");
  }
  if (glasses) { // big round glasses (GLASS_DROP: slid down the nose)
    const gy = cy + GLASS_DROP * u;
    for (const side of [-1, 1]) p.arc(fx + side * 13 * u, gy, 11.5 * u, 11.5 * u, 0, 360, 3 * u);
    p.stroke([[fx - 2.5 * u, gy - 1 * u], [fx + 2.5 * u, gy - 1 * u]], 2.6 * u);
  }
  if (expr === "nervous") p.ell(cx + 40 * u * (facing || 1), cy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

/** cheated profile (classic 2D): both eyes, same size and level, grouped on the facing (right) side with the nose
 *  between and a little below them and the mouth centred under the nose. The whole group sits around FC = 17u, so the
 *  outer edge of the widest eye (shock, 11u) stays at ~39u, well inside the head outline (~50u); the back is empty. */
const faceSide = (p: Pen, hx: number, hy: number, W: number, exprIn: ExprIn, lid: number, brim: boolean, skin: string, moustache?: string, stout = false, beard?: string) => {
  const expr = exprName(exprIn), u = W / 100, F = FACE[expr as ExprV2] ?? FACE.neutral, V = FACE_V3 ? faceV(exprIn) : null, fc = hx + 17 * u, ey = hy;
  const ex = (!V && F.eye[0] === "shock" ? 10.5 : 11) * u;
  const by = ey - BROW_Y * u;
  for (const side of [-1, 1]) {
    const i = side > 0 ? 1 : 0, x = fc + side * ex, kind = eyeKind(F.eye[i], lid);
    if (V) eyeV(p, V, i, x, ey, u, side, 0.5, lid);
    else eye(p, kind, x, ey, u, side, 0.5, skin);
    if (FACEX.unibrow) continue;
    const [dI, dO] = V ? browOf(V)[i] : F.brow;
    if (!V && (kind === "shock" || kind === "shockHalf")) p.arc(x, by - 6 * u, 8.5 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 7.5 * u, by + dI * u], [x + side * 7.5 * u, by + dO * u], 5 * u, 2.5 * u);
  }
  const [dI, dO] = V ? browOf(V)[1] : F.brow;
  if (FACEX.unibrow) { // one thick brow across both eyes
    const shock = V ? !!V.white : F.eye[0] === "shock";
    const pts: P2[] = [[fc - ex - 9 * u, by + (shock ? -8 : dO) * u], [fc, by + (shock ? -9 : dI) * u], [fc + ex + 9 * u, by + (shock ? -8 : dO) * u]];
    p.stroke(pts, 9 * u, "#1a1418"); p.stroke(pts, 6.5 * u, "#2e2228");
  }
  if (FACEX.chops) { const k = 1 + 0.7 * (FACEX.flare ?? 0); p.ell(hx - 10 * u, hy + 14 * u, 15 * k * u, 24 * u, FACEX.chops, 2.4 * u); }
  // nose: between the eyes and a little below, a small hook pointing the way he faces (a long nose still ends inside)
  const nx = fc + 1.5 * u, ny = ey + 9 * u;
  if (FACEX.longNose) p.poly([[nx - 3 * u, ny - 6 * u], [nx + 22 * u, ny + 6 * u], [nx - 2 * u, ny + 4 * u]], skin, 2.6 * u);
  else p.stroke([[nx - 1 * u, ny - 4 * u], [nx + 3 * u, ny + 1 * u], [nx - 2 * u, ny + 2.5 * u]], 3 * u);
  // mouth centred under the nose
  const mx = fc + 1.5 * u, my = ey + 21 * u;
  if (V) { mouthV(p, V.mouth, mx, my, u, 0.8); fxV(p, V, hx, hy, [fc - ex, fc + ex], u, -1, false); }
  else mouth(p, talkMouth(F.mouth), mx, my, u, 0.8);
  if (moustache) for (const s of [-1, 1])
    taper(p, [mx + s * 1.5 * u, ey + 13.5 * u], [mx + s * (stout ? 15 : 12) * u, ey + (stout ? 11.5 : 15.5) * u], stout ? 5 * u : 4.2 * u, 1.6 * u, moustache);
  if (beard) p.poly([[mx - 11 * u, ey + 29 * u], [mx + 11 * u, ey + 29 * u], [mx + 5 * u, ey + 45 * u], [mx, ey + 50 * u], [mx - 5 * u, ey + 45 * u]], beard, 2.4 * u);
  if (expr === "nervous") p.ell(hx - 30 * u, hy - 24 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

// ---------------- hats ----------------
/** hats whose brim sits low on the forehead (brows drawn lower) */
const BRIM = new Set(["shako", "shako_tall", "tophat", "helm", "caping", "police", "bowler", "straw", "rail"]);
const GOLD = "#e3b23c", GOLD_D = "#a8781e";
const BONNET = "#e9cf8f", BONNET_BRIM = "#d6b46a";
/** parts of a hat that sit behind the head (bonnet) */
const hatBehind = (p: Pen, o: Outfit, H: Blob, cx: number, hc: number, light: number, thick: number, ow: number, side: boolean) => {
  const u = H.a / 50;
  if (o.hat === "blangkon" && side) { // the mondolan knot at the back of the head
    const k = ellPts(cx - 0.95 * H.a, hc + 0.05 * H.b, 0.32 * H.a, 0.3 * H.b);
    p.shadedFill(k, o.cap ?? "#5a3b2a", mul(o.cap ?? "#5a3b2a", SH_FELT), light, 0.32 * H.a);
    p.inkRing(k, ow * 0.85, thick);
  }
  if (o.hat === "hair" && o.hairdo === "bun") {
    const k = ellPts(cx - (side ? 0.55 * H.a : 0), hc - 0.92 * H.b, 0.34 * H.a, 0.3 * H.b);
    p.shadedFill(k, o.hair!, mul(o.hair!, SH_FELT), light, 0.34 * H.a);
    p.inkRing(k, ow * 0.85, thick);
  }
  if (o.hat === "hair" && o.hairdo === "braid" && side) braid(p, o.hair!, cx - 0.8 * H.a, hc + 0.4 * H.b, 2.0 * H.b, u, light, thick, ow);
  if (o.hat === "hijab" && side) { // the drape: falls behind the head onto the shoulders (front view: drawn before the hands)
    const col = o.cap ?? "#1f2f5a", dx = side ? -0.12 * H.a : 0;
    const k = blobPts(cx + dx, hc + 0.42 * H.b, { ...H, a: H.a * 1.24, b: H.b * 1.42, asym: 0, egg: -0.1, seed: H.seed + 5 });
    p.shadedFill(k, col, mul(col, SH_CLOTH), light, H.a * 1.24);
    p.inkRing(k, ow * 0.9, thick);
  }
  if (o.hat !== "bonnet") return;
  const bb = blobPts(cx - (side ? 12 : 0) * (H.a / 50), hc - 0.07 * 2 * H.b, { ...H, a: H.a * 1.17, b: H.b * 1.13, asym: 0, egg: 0.04, seed: H.seed + 3 });
  p.shadedFill(bb, BONNET, mul(BONNET, SH_CLOTH), light, H.a * 1.17);
  p.inkRing(bb, ow * 0.85, thick);
};

/** a plait hanging from (x, y), length len, as a chain of ink-ringed lobes and a ribbon tie */
const braid = (p: Pen, col: string, x: number, y: number, len: number, u: number, light: number, thick: number, ow: number) => {
  const n = 6, r = len / n / 1.6;
  for (let i = 0; i < n; i++) {
    const k = ellPts(x + (i % 2 ? 2 : -2) * u, y + i * r * 1.55, r * (1 - i * 0.06), r * 0.95);
    p.shadedFill(k, col, mul(col, SH_FELT), light, r);
    p.inkRing(k, ow * 0.7, thick);
  }
  p.ell(x, y + n * r * 1.55 - 0.4 * r, 0.7 * r, 0.45 * r, "#c0353a", ow * 0.6);
};

/** brow line above the eye centre, and the top of the face (u): no hat, brim, hair or accessory reaches below
 *  FACE_TOP, leaving bare forehead above the highest brow (BROW_Y + 8 raise + stroke = ~28.5u) */
const BROW_Y = 18, FACE_TOP = 33;
const hatOn = (p: Pen, o: Outfit, hp: P2[], H: Blob, cx: number, hc: number, light: number, seed: number, facing: number, side: boolean) => {
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, crown = hc - H.b, ow = 0.85 * 5 * u;
  /** the lowest any hat, brim or hair may reach: a clear band of bare forehead above the highest brow */
  const edge = hc - FACE_TOP * u;
  const dr = rad(clamp(DRAG, -6, 6)), a = H.rot + rad(4 * (rnd(seed, 20) - 0.5)) + dr; // tilt with the head, +-2 deg extra, plus the drag
  const R = (pts: P2[]) => rotPts(pts, a, cx, hc);
  const sag = (yb: number, wb: number): P2[] => {
    const base: P2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; base.push([cx + wb * (2 * t - 1), yb + 3 * u * (1 - (2 * t - 1) ** 2)]); }
    return base;
  };
  if (o.hat === "hijab") { // the head cover: the head outline grown a little, the face showing through an oval
    const col = o.cap ?? "#1f2f5a", g = p.g;
    const outer = hp.map(([x, y]) => [cx + (x - cx) * 1.1, hc + (y - hc) * 1.08 - 2 * u] as P2);
    const fcx = cx + (side ? 0.32 * H.a : 7 * u * facing), inner = ellPts(fcx, hc + 0.16 * H.b, side ? 0.62 * H.a : 0.74 * H.a, 0.8 * H.b);
    g.beginPath();
    for (const ring of [outer, inner]) ring.forEach(([x0, y0], i) => { const [x, y] = p.P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.fillStyle = col; g.fill("evenodd");
    p.inkRing(outer, ow, thickAngle(light));
    p.poly(inner, null, 0.6 * ow);
    return;
  }
  if (o.hat === "shako" || o.hat === "shako_tall") {
    const tall = o.hat === "shako_tall", yb = edge - 3 * u, ht = (tall ? 0.66 : 0.56) * HH, wb = 46 * u, wt = 52 * u;
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, "#3a3d47", "#24262d", light, wt, 0.4);
    if (tall) p.clip(body, () => p.band(R([[cx - wt - 5 * u, yb - ht + 0.07 * HH], [cx + wt + 5 * u, yb - ht + 0.07 * HH]]), "#e8c45a", 0.06 * HH, 1.5 * u));
    p.poly(body, null, ow);
    const deg = (a * 180) / Math.PI;
    if (side) {
      p.poly(R([[cx + 36 * u, yb - 1 * u], [cx + 54 * u, yb - 7 * u], [cx + 38 * u, yb + 3 * u]]), "#16171b", 2.5 * u);
      const [tx, ty] = R([[cx + 24 * u, yb - ht - 6 * u]])[0];
      p.ell(tx, ty, 7 * u, 7 * u, "#2b7a4b", 2.5 * u);
    } else {
      const [px, py] = R([[cx + 3 * u * facing, yb + 2 * u]])[0];
      p.ell(px, py, 30 * u, 0.04 * HH, "#16171b", 2.5 * u, 180, 360, deg); // peak
      const [bx, by] = R([[cx, yb - 0.45 * ht]])[0];
      p.ell(bx, by, 7 * u, 6 * u, tall ? "#e8c45a" : "#c9ccd2", 2 * u, 0, 360, deg); // badge plate
      p.arc(bx, by, 3.5 * u, 2.8 * u, 200, 500, 1.6 * u);
      const [tx, ty] = R([[cx, yb - ht - 6 * u]])[0];
      p.ell(tx, ty, 7 * u, 7 * u, "#2b7a4b", 2.5 * u); // green tuft
    }
  } else if (o.hat === "cap" || o.hat === "hair") {
    // no bangs: the hair edge stays above the forehead band; the back of the head may go lower, behind the eyes
    const cut = o.hat === "cap" ? edge - 3 * u : Math.min(crown + (o.hairTop ?? 0.42) * HH, edge - 4 * u);
    const keep = (x: number, y: number) => y < cut + (x - cx) * Math.tan(dr) || (side && o.hat === "hair" && x < cx - 20 * u && y < hc - 20 * u);
    // start the arc at the first kept point after a dropped one, so the kept run is contiguous and the cut closes it
    const n = hp.length, startIdx = Math.max(0, hp.findIndex(([x, y], i) => keep(x, y) && !keep(hp[(i + n - 1) % n][0], hp[(i + n - 1) % n][1])));
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([x, y]) => keep(x, y))
      .map(([x, y]) => [cx + (x - cx) * 1.03, hc + (y - hc) * 1.03] as P2);
    if (arc.length < 3) return;
    if (o.hat === "hair") { // scalloped lower edge
      const [x0, y0] = arc[arc.length - 1], [x1, y1] = arc[0];
      for (let i = 1; i < 6; i++) arc.push([x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6 + (i % 2 ? 4 * u : 0)]);
    }
    const col = o.hat === "cap" ? o.cap! : o.hair!;
    p.shadedFill(arc, col, mul(col, SH_FELT), light, H.a, 0.35);
    p.poly(arc, null, ow);
    if (o.hat === "hair") {
      const s = side ? -1 : facing || 1;
      p.stroke([[cx + s * 10 * u, cut - 30 * u], [cx + s * 2 * u, cut - 12 * u]], 1.2 * u);
      if (o.hairdo === "braid" && !side) braid(p, col, cx - 0.92 * H.a, hc + 0.35 * H.b, 1.9 * H.b, u, light, thickAngle(light), ow);
    }
    if (o.hat === "cap") {
      const deg = (a * 180) / Math.PI;
      if (side) p.poly(R([[cx + 38 * u, cut - 2 * u], [cx + 57 * u, cut - 8 * u], [cx + 41 * u, cut + 2 * u]]), shade(col, 0.8), ow);
      else {
        const s = facing || (rnd(seed, 21) < 0.5 ? -1 : 1), [px, py] = R([[cx + s * 4 * u, cut + 1 * u]])[0];
        p.ell(px, py, 28 * u, 0.05 * HH, shade(col, 0.8), ow, 180, 360, deg);
      }
    }
  } else if (o.hat === "tophat") {
    const yb = edge - 6 * u, ht = 0.8 * HH, wb = 0.31 * W, wt = 0.33 * W, col = "#2e2a36";
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, col, mul(col, SH_FELT), light, wt, 0.4);
    p.clip(body, () => p.band(R([[cx - wt - 4 * u, yb - 0.13 * HH], [cx + wt + 4 * u, yb - 0.13 * HH]]), shade(o.jacket, 0.9), 0.14 * HH, 0.8 * u));
    p.poly(body, null, ow);
    const [bx, by] = R([[cx, yb + 1 * u]])[0];
    p.ell(bx, by, 0.45 * W, 0.05 * HH, "#1d1b22", ow, 0, 360, (a * 180) / Math.PI);
  } else if (o.hat === "crown" || o.hat === "diadem") {
    const big = o.hat === "crown", yb = Math.min(crown + (big ? 0.2 : 0.17) * HH, edge), hb = (big ? 0.12 : 0.07) * HH, wb = (big ? 40 : 44) * u;
    const nPts = side ? 3 : big ? 5 : 3, tip = (big ? 0.26 : 0.12) * HH;
    const pts: P2[] = [[cx - wb, yb], [cx + wb, yb], [cx + wb, yb - hb]];
    for (let i = nPts - 1; i >= 0; i--) {
      const x = cx - wb + ((i + 0.5) / nPts) * 2 * wb, xl = cx - wb + (i / nPts) * 2 * wb;
      pts.push([x, yb - hb - (big || i === (nPts >> 1) ? tip : tip * 0.4)], [xl, yb - hb]);
    }
    const band = R(pts);
    p.shadedFill(band, GOLD, GOLD_D, light, wb, 0.4);
    p.poly(band, null, ow * 0.8);
    const [jx, jy] = R([[cx + (side ? 18 * u : 0), yb - 0.55 * hb]])[0];
    p.ell(jx, jy, 5.5 * u, 5 * u, "#c0353a", 1.8 * u);
    if (big) for (let i = 0; i < nPts; i++) { const [tx, ty] = R([[cx - wb + ((i + 0.5) / nPts) * 2 * wb, yb - hb - tip]])[0]; p.ell(tx, ty, 4 * u, 4 * u, GOLD, 1.6 * u); }
  } else if (o.hat === "blangkon" || o.hat === "helm") {
    const helm = o.hat === "helm", cut = edge - (helm ? 5 : 3) * u, col = helm ? "#b8873a" : o.cap ?? "#5a3b2a";
    const n = hp.length, keep = (y: number) => y < cut;
    const startIdx = Math.max(0, hp.findIndex(([, y], i) => keep(y) && !keep(hp[(i + n - 1) % n][1])));
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([, y]) => keep(y)).map(([x, y]) => [cx + (x - cx) * 1.05, hc + (y - hc) * 1.05] as P2);
    if (arc.length < 3) return;
    p.shadedFill(arc, col, mul(col, SH_FELT), light, H.a, 0.35);
    if (!helm) p.clip(arc, () => { for (let i = 0; i < 18; i++) p.dot(cx - 45 * u + (i % 6) * 18 * u + (i % 12 < 6 ? 0 : 9 * u), crown + 6 * u + Math.floor(i / 6) * 11 * u, 2.6 * u, o.batik ?? "#e0c17a"); });
    p.poly(arc, null, ow);
    if (helm) {
      const deg = (a * 180) / Math.PI, [bx, by] = R([[cx, cut]])[0];
      p.ell(bx, by, 0.55 * W, 0.045 * HH, "#8a6226", ow * 0.8, 0, 360, deg); // rim
      const [tx, ty] = R([[cx + (side ? -6 * u : 0), crown - 0.02 * HH]])[0];
      p.band([[tx, ty + 4 * u], [tx, ty - 10 * u]], "#8a6226", 4 * u, 1.4 * u);
      const pc = o.plume ?? "#c0353a", lean = side ? -30 : 0;
      for (const k of [-1, 1, 0]) {
        const a2 = rad(lean + k * 24), fx2 = tx + Math.sin(a2) * 13 * u, fy2 = ty - 8 * u - Math.cos(a2) * 13 * u;
        const fe = ellPts(fx2, fy2, 4.5 * u, 14 * u, 0, 360, lean + k * 24);
        p.shadedFill(fe, k ? mul(pc, [0.88, 0.88, 0.9]) : pc, mul(pc, SH_FELT), light, 10 * u);
        p.poly(fe, null, ow * 0.55);
      }
    }
  } else if (o.hat === "diamond_helmet") {
    // a boxy voxel helmet: the shell stops above the forehead band, cheek flaps hang outside the face (front) or
    // behind the ear (side); no part crosses the brows
    const yb = edge - 7 * u, top = crown - 0.17 * HH, ch = 8 * u, low = hc + 0.06 * HH;
    const xo = 0.6 * W, xi = 0.49 * W;
    const shell: P2[] = side
      ? [[cx + xo * 0.95, yb], [cx + xo * 0.95, top + ch], [cx + xo * 0.95 - ch, top], [cx - xo + ch, top], [cx - xo, top + ch], [cx - xo, low],
         [cx - 0.12 * W, low], [cx - 0.12 * W, yb]]
      : [[cx - xo, low], [cx - xo, top + ch], [cx - xo + ch, top], [cx + xo - ch, top], [cx + xo, top + ch], [cx + xo, low],
         [cx + xi, low], [cx + xi, yb], [cx - xi, yb], [cx - xi, low]];
    const body = R(shell);
    p.shadedFill(body, DIAMOND[4], DIAMOND[5], light, xo, 0.35);
    p.clip(body, () => {
      diamondPixels(p, cx - xo, top, cx + xo, low, 0.105 * W, seed + 31);
      p.band(R([[cx - xo - 2 * u, yb - 3 * u], [cx + xo + 2 * u, yb - 3 * u]]), DIAMOND[6], 4.5 * u, 0); // dark rim above the face
      p.band(R([[cx - xo - 2 * u, top + 3 * u], [cx + xo + 2 * u, top + 3 * u]]), DIAMOND[0], 3.5 * u, 0); // lit top edge
    });
    p.poly(body, null, ow);
  } else if (o.hat === "police") {
    const yb = edge - 3 * u, deg = (a * 180) / Math.PI, col = o.cap ?? "#1f2a4a";
    const band = R([[cx - 0.47 * W, yb], [cx + 0.47 * W, yb], [cx + 0.47 * W, yb - 0.1 * HH], [cx - 0.47 * W, yb - 0.1 * HH]]);
    const top = R([[cx - 0.47 * W, yb - 0.1 * HH], [cx + 0.47 * W, yb - 0.1 * HH], [cx + 0.58 * W, yb - 0.27 * HH], [cx - 0.58 * W, yb - 0.27 * HH]]);
    p.shadedFill(top, col, mul(col, SH_FELT), light, 0.55 * W, 0.4);
    p.poly(top, null, ow);
    p.shadedFill(band, o.band ?? "#14182a", "#0c0f1a", light, 0.47 * W, 0.4);
    p.poly(band, null, ow * 0.8);
    if (side) p.poly(R([[cx + 0.3 * W, yb], [cx + 0.5 * W, yb - 0.06 * HH], [cx + 0.32 * W, yb + 0.03 * HH]]), "#101320", 2.5 * u);
    else { const [px, py] = R([[cx, yb + 1 * u]])[0]; p.ell(px, py, 0.34 * W, 0.04 * HH, "#101320", 2.5 * u, 180, 360, deg); }
    const [bx, by] = R([[cx + (side ? 0.25 * W : 0), yb - 0.17 * HH]])[0];
    p.ell(bx, by, 6 * u, 7 * u, GOLD, 1.8 * u, 0, 360, deg);
  } else if (o.hat === "caping") {
    const yb = edge - 2 * u, wb = 0.78 * W, deg = (a * 180) / Math.PI;
    const cone = R([[cx - wb, yb], [cx + wb, yb], [cx + 4 * u, crown - 0.32 * HH], [cx - 4 * u, crown - 0.32 * HH]]);
    p.shadedFill(cone, "#dcb46c", "#a9844a", light, wb, 0.35);
    p.clip(cone, () => { for (let i = -4; i <= 4; i++) p.stroke(R([[cx, crown - 0.3 * HH], [cx + i * 0.2 * wb, yb]]), 1.4 * u, "#b48d4f"); });
    p.poly(cone, null, ow);
    const [bx, by] = R([[cx, yb]])[0];
    p.ell(bx, by, wb + 2 * u, 0.03 * HH, "#c9a25e", ow * 0.6, 0, 360, deg);
  } else if (o.hat === "bowler" || o.hat === "straw" || o.hat === "rail") {
    const deg = (a * 180) / Math.PI, yb = edge - 6 * u;
    const col = o.hat === "bowler" ? o.cap ?? "#2a2630" : o.hat === "straw" ? "#e2c27a" : "#3a5a9a";
    const wb = (o.hat === "straw" ? 0.4 : 0.44) * W, ht = (o.hat === "bowler" ? 0.42 : 0.3) * HH;
    const dome: P2[] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, ang = Math.PI * t; dome.push([cx - Math.cos(ang) * wb, yb - Math.sin(ang) * ht]); }
    if (o.hat !== "bowler") for (let i = 1; i < 16; i++) dome[i] = [dome[i][0], Math.min(dome[i][1], yb - ht * 0.85)]; // flat-topped
    const body = R(dome);
    p.shadedFill(body, col, mul(col, SH_FELT), light, wb, 0.4);
    if (o.hat === "rail") p.clip(body, () => { for (let k = -6; k <= 6; k++) p.band(R([[cx + k * 8 * u, yb + 2 * u], [cx + k * 8 * u, yb - ht - 4 * u]]), "#f2efe6", 3 * u, 0); });
    if (o.hat === "straw") p.clip(body, () => p.band(R([[cx - wb - 4 * u, yb - 0.08 * HH], [cx + wb + 4 * u, yb - 0.08 * HH]]), "#8a2a2a", 0.07 * HH, 0));
    if (o.hat === "bowler") p.clip(body, () => p.band(R([[cx - wb - 4 * u, yb - 0.06 * HH], [cx + wb + 4 * u, yb - 0.06 * HH]]), "#141218", 0.07 * HH, 0));
    p.poly(body, null, ow);
    const [bx, by] = R([[cx + (side ? 6 * u : 0), yb + 1 * u]])[0];
    if (o.hat === "rail") { // a peak to the front
      if (side) p.poly(R([[cx + 0.3 * W, yb], [cx + 0.5 * W, yb - 0.06 * HH], [cx + 0.32 * W, yb + 0.03 * HH]]), "#1c2a4a", 2.5 * u);
      else p.ell(bx, by, 0.34 * W, 0.04 * HH, "#1c2a4a", 2.5 * u, 180, 360, deg);
    } else p.ell(bx, by, (o.hat === "straw" ? 0.72 : 0.5) * W, 0.05 * HH, o.hat === "straw" ? "#d6b064" : shade(col, 0.8), ow * 0.8, 0, 360, deg);
  } else if (o.hat === "bonnet") {
    const [bx, by] = R([[cx + (side ? 6 * u : 0), crown + 0.16 * HH]])[0];
    p.arc(bx, by, 0.5 * W, 0.2 * HH, 200, 340, 7 * u, BONNET_BRIM);
    p.arc(bx, by, 0.5 * W + 3.5 * u, 0.2 * HH + 3.5 * u, 200, 340, 1.2 * u);
    const cy = hc + H.b * 0.98;
    p.stroke([[cx - 14 * u, cy - 4 * u], [cx, cy + 2 * u], [cx + 14 * u, cy - 4 * u]], 2 * u, BONNET_BRIM);
  }
};

// ---------------- bodies ----------------
export type Arms = [P2[], P2[]];
/** held prop; for the hammer the number is the strike 0 (raised) .. 1 (struck) */
export type Prop = null | "icecream" | "shako" | ["hammer", number] | "letter" | "scroll" | "pouch" | "brick" | "cup" | "card" | "box" | "magnifier" | "parcel" | "gem" | "plum"
  | "calculator" | "phone" | "receipt" | "camera" | "mic" | "bundle" | "spoon"
  | "lantern" | "newspaper" | "sausage" | "flatcap" | "mirror" | "emerald" | "stethoscope" | "pocketwatch" | "hose" | "valve" | "valve2";

const BUILD: Record<Build, { a: number; torso: number; legs: number; tw: number }> = {
  adult: { a: 118, torso: 1.1, legs: 1.4, tw: 0.8 },
  stout: { a: 118, torso: 1.15, legs: 1.32, tw: 0.92 },
  kid: { a: 112, torso: 0.85, legs: 1.0, tw: 0.72 },
  tall: { a: 112, torso: 1.22, legs: 1.62, tw: 0.74 },
};

export type FrontOpts = {
  phase?: number; expr?: ExprIn; mode?: "march" | "stroll" | "stand" | "sit" | "fall"; look?: number; blink?: boolean | number; lift?: number;
  prop?: Prop; tilt?: number; headTilt?: number; wave?: number;
  /** right-arm poses: an arm round a neighbour's shoulders (to screen right), pointing down-forward, hand on the heart */
  arm?: "hug" | "point" | "chest" | "hips" | "fold" | "up" | "fist" | "reach" | "shrug";
  /** whole-body lean in degrees (upper body about the hips, knees push the other way); armRaw: armK is already eased and may overshoot past 1 */
  lean?: number; armRaw?: boolean;
  /** secondary motion (deg, +-6): hat, hair edge and curl trail the head by this much */
  drag?: number;
  /** 0..1: how far the arms have moved from hanging into the pose (eases pose changes instead of snapping) */
  armK?: number;
  /** 0..1: the mouth opening while speaking (lip flaps) */
  talk?: number;
  /** 0..1: a held prop rises from chest height to the face (sip a cup, raise a card or a magnifier to the eye) */
  reach?: number;
  /** canvas angle the key light comes FROM (painted crescent + thick outline side) */
  light?: number; facing?: -1 | 0 | 1; seed?: number;
  /** glasses slid down the nose by this many face units (shock) */
  glassesDrop?: number;
  /** 0..1: mutton chops puff out (rage) */
  flare?: number;
  /** 0..1: the face skin warms to red (strain, rage) a frame at a time, instead of swapping to a red outfit */
  flush?: number;
};

const footStroke = (p: Pen, a: P2, b: P2, w: number, col: string) => {
  if (col !== INK) p.stroke([a, b], w + 3, INK);
  p.stroke([a, b], w, col);
};

/** batik wrap from the waist (cx, y0), half-width w, length len: parang stripes, a pleated front panel (wiru) */
const jarik = (p: Pen, col: string, cx: number, y0: number, w: number, len: number, u: number, light: number, thick: number, ow: number, s: number, plain = false) => {
  const y1 = y0 + len, pts: P2[] = [[cx - w, y0], [cx + w, y0], [cx + w * 0.9, y1], [cx - w * 0.9, y1]];
  const dark = mul(col, [0.62, 0.6, 0.62]), pale = mix(col, "#f2e6c8", 0.45);
  p.gradFill(pts, col, mul(col, SH_CLOTH), light);
  if (!plain) p.clip(pts, () => {
    for (let k = -8; k < 14; k++) { // parang: diagonal S-bands with a pale edge
      const x = cx - w + k * 13 * u;
      p.stroke([[x, y0], [x + 6 * u, y0 + 0.3 * len], [x + 4 * u, y0 + 0.55 * len], [x + 12 * u, y1]].map(([a, b]) => [a + (b - y0) * 0.55, b] as P2), 3.6 * u, dark);
      p.stroke([[x + 4 * u, y0], [x + 10 * u, y0 + 0.3 * len], [x + 8 * u, y0 + 0.55 * len], [x + 16 * u, y1]].map(([a, b]) => [a + (b - y0) * 0.55, b] as P2), 1.4 * u, pale);
    }
    const fx = cx + s * 0.3 * w, fw = 0.32 * w; // wiru: the front pleats, a zigzag hem
    p.poly([[fx - fw / 2, y0], [fx + fw / 2, y0], [fx + fw / 2, y1], [fx, y1 - 4 * u], [fx - fw / 2, y1]], shade(col, 0.92), 1.4 * u);
    for (const d of [-0.25, 0, 0.25]) p.stroke([[fx + d * fw, y0 + 4 * u], [fx + d * fw, y1 - 3 * u]], 1.2 * u, dark);
  });
  p.inkRing(pts, ow * 0.9, thick);
};
/** beskap front: stand collar, the diagonal closing from the left collar to the right hip, gold buttons along it */
const beskap = (p: Pen, o: Outfit, tcx: number, chin: number, torsoBot: number, a: number, HH: number, u: number, facing: number) => {
  const s = facing || 1, A: P2 = [tcx - s * 0.18 * a, chin + 0.06 * HH], B: P2 = [tcx + s * 0.55 * a, torsoBot - 0.36 * HH];
  p.band([[tcx - 0.5 * a, chin + 0.02 * HH], [tcx + 0.5 * a, chin + 0.02 * HH]], shade(o.jacket, 0.82), 0.07 * HH, 1.2 * u);
  p.stroke([A, B], 2.2 * u, mul(o.jacket, [0.45, 0.45, 0.5]));
  for (let i = 0; i < 4; i++) { const q = lerp2(A, B, 0.15 + i * 0.22); p.dot(q[0] + s * 4 * u, q[1], 3 * u, INK); p.dot(q[0] + s * 4 * u, q[1], 2.1 * u, GOLD); }
  if (o.sash) {
    p.band([[tcx - 1.3 * a, torsoBot - 0.3 * HH], [tcx + 1.3 * a, torsoBot - 0.3 * HH]], o.sash, 0.12 * HH, 1.6 * u);
    p.poly([[tcx - 7 * u, torsoBot - 0.36 * HH], [tcx + 7 * u, torsoBot - 0.36 * HH], [tcx + 7 * u, torsoBot - 0.24 * HH], [tcx - 7 * u, torsoBot - 0.24 * HH]], GOLD, 1.4 * u);
  }
};
/** batik shirt: rows of small kawung flowers (four petals round a dot) in the motif colour */
const batikShirt = (p: Pen, col: string, tcx: number, chin: number, torsoBot: number, a: number, u: number) => {
  for (let y = chin + 6 * u, r = 0; y < torsoBot; y += 15 * u, r++) for (let x = tcx - 1.2 * a + (r % 2) * 8 * u; x < tcx + 1.2 * a; x += 16 * u) {
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) p.ell(x + dx * u, y + dy * u, 2.6 * u, 2.6 * u, col, 0);
    p.dot(x, y, 1.4 * u, "#f2e6c8");
  }
};
/** keris tucked in the sash: the wooden sheath's boat-shaped top (warangka) and the hilt, tilted outward (s = side) */
const keris = (p: Pen, x: number, y: number, u: number, s: number) => {
  p.poly([[x - s * 4 * u, y + 4 * u], [x + s * 22 * u, y - 8 * u], [x + s * 30 * u, y - 4 * u], [x + s * 18 * u, y + 6 * u], [x + s * 2 * u, y + 12 * u]], "#8a5a34", 1.6 * u);
  p.band([[x + s * 8 * u, y - 2 * u], [x + s * 4 * u, y - 18 * u]], "#5a3b2a", 4 * u, 1.2 * u, "round");
  p.dot(x + s * 3.5 * u, y - 19 * u, 3.4 * u, GOLD);
};
/** guard's spear along a -> b: wooden shaft, red tassel, steel leaf blade past b */
const spearAt = (p: Pen, a: P2, b: P2, u: number) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  p.band([a, b], "#7a4b2a", 4.2 * u, 1.4 * u, "round");
  const t: P2 = [b[0] + ux * 30 * u, b[1] + uy * 30 * u];
  p.poly([[b[0] + nx * 7 * u, b[1] + ny * 7 * u], t, [b[0] - nx * 7 * u, b[1] - ny * 7 * u], [b[0] - ux * 6 * u, b[1] - uy * 6 * u]], "#c9ccd2", 1.6 * u);
  p.ell(b[0] - ux * 10 * u, b[1] - uy * 10 * u, 6 * u, 9 * u, "#c0353a", 1.4 * u);
};
/** a small thing held at chest height in the right hand */
const heldProp = (p: Pen, prop: string, hx: number, hy: number, u: number) => {
  if (prop === "letter") {
    p.poly([[hx - 30 * u, hy - 44 * u], [hx + 22 * u, hy - 48 * u], [hx + 26 * u, hy + 18 * u], [hx - 26 * u, hy + 22 * u]], "#f3ead2", 2 * u);
    for (let i = 0; i < 5; i++) p.stroke([[hx - 20 * u, hy - 34 * u + i * 10 * u], [hx + 14 * u - (i % 2) * 8 * u, hy - 36 * u + i * 10 * u]], 1.6 * u, "#7a6a5a");
    p.ell(hx + 8 * u, hy + 10 * u, 6 * u, 6 * u, "#b8323a", 1.4 * u);
  } else if (prop === "scroll") {
    p.poly([[hx - 34 * u, hy - 9 * u], [hx + 34 * u, hy - 9 * u], [hx + 34 * u, hy + 9 * u], [hx - 34 * u, hy + 9 * u]], "#e8d6a8", 2 * u);
    for (const s of [-1, 1]) p.ell(hx + s * 36 * u, hy, 6 * u, 11 * u, "#8a5a34", 1.6 * u);
    p.band([[hx - 3 * u, hy - 10 * u], [hx - 3 * u, hy + 10 * u]], "#b8323a", 3 * u, 1 * u);
  } else if (prop === "pouch") {
    p.ell(hx, hy + 8 * u, 20 * u, 18 * u, "#8a6a3a", 2 * u);
    p.poly([[hx - 9 * u, hy - 8 * u], [hx + 9 * u, hy - 8 * u], [hx + 5 * u, hy - 2 * u], [hx - 5 * u, hy - 2 * u]], "#7a5a2e", 1.6 * u);
    p.ell(hx + 11 * u, hy - 12 * u, 5 * u, 5 * u, GOLD, 1.4 * u);
  } else if (prop === "brick") {
    p.poly([[hx - 24 * u, hy - 12 * u], [hx + 24 * u, hy - 12 * u], [hx + 24 * u, hy + 12 * u], [hx - 24 * u, hy + 12 * u]], "#a8704e", 2 * u);
    p.stroke([[hx - 20 * u, hy - 4 * u], [hx + 6 * u, hy - 6 * u]], 1.4 * u, "#7d4f36");
  } else if (prop === "cup") {
    p.poly([[hx - 13 * u, hy - 26 * u], [hx + 13 * u, hy - 26 * u], [hx + 10 * u, hy + 4 * u], [hx - 10 * u, hy + 4 * u]], "#f2efe8", 2 * u);
    p.band([[hx - 13 * u, hy - 14 * u], [hx + 13 * u, hy - 14 * u]], "#8a5a34", 5 * u, 0);
    p.arc(hx + 15 * u, hy - 12 * u, 6 * u, 8 * u, -90, 90, 2.4 * u);
    for (const d of [-5, 4]) p.stroke([[hx + d * u, hy - 32 * u], [hx + d * u + 3 * u, hy - 44 * u], [hx + d * u, hy - 54 * u]], 1.6 * u, "#c8c4bc");
  } else if (prop === "card") {
    p.poly([[hx - 22 * u, hy - 30 * u], [hx + 22 * u, hy - 30 * u], [hx + 22 * u, hy - 2 * u], [hx - 22 * u, hy - 2 * u]], "#fbf8f0", 2 * u);
    p.stroke([[hx - 9 * u, hy - 24 * u], [hx, hy - 9 * u], [hx + 9 * u, hy - 24 * u]], 2.6 * u, "#8a2030");
  } else if (prop === "box") {
    p.poly([[hx - 16 * u, hy - 22 * u], [hx + 16 * u, hy - 22 * u], [hx + 16 * u, hy + 4 * u], [hx - 16 * u, hy + 4 * u]], "#3a2a3a", 2 * u);
    p.band([[hx - 16 * u, hy - 14 * u], [hx + 16 * u, hy - 14 * u]], "#c9a24e", 2.4 * u, 0.8 * u);
  } else if (prop === "magnifier") {
    p.band([[hx, hy + 2 * u], [hx + 14 * u, hy - 22 * u]], "#5a3b2a", 5 * u, 1.4 * u, "round");
    p.ell(hx + 22 * u, hy - 36 * u, 16 * u, 16 * u, "#cfe6f2", 3 * u);
  } else if (prop === "gem") { // the stolen diamond held up between the gloved fingers
    const k = 1.7; // big enough to read at phone size
    p.poly([[hx - 12 * k * u, hy - 26 * k * u], [hx + 12 * k * u, hy - 26 * k * u], [hx + 18 * k * u, hy - 16 * k * u], [hx, hy + 4 * u], [hx - 18 * k * u, hy - 16 * k * u]], "#bfe6ff", 2.4 * u);
    p.stroke([[hx - 18 * k * u, hy - 16 * k * u], [hx + 18 * k * u, hy - 16 * k * u]], 1.8 * u, "#6aa8d0");
    p.stroke([[hx - 4 * k * u, hy - 26 * k * u], [hx, hy + 4 * u], [hx + 4 * k * u, hy - 26 * k * u]], 1.6 * u, "#6aa8d0");
  } else if (prop === "plum") { // a ripe plum held up for scale: as big as the diamond
    const k = 2.4;
    p.ell(hx, hy - 16 * k * u, 15 * k * u, 14 * k * u, "#9a3a9a", 2.4 * u);
    p.ell(hx - 5 * k * u, hy - 21 * k * u, 4 * k * u, 3 * k * u, "#a86aa8", 0);
    p.stroke([[hx, hy - 29 * k * u], [hx + 2 * u, hy - 36 * k * u]], 2.2 * u, "#4a3020");
    p.poly([[hx + 2 * u, hy - 33 * k * u], [hx + 16 * k * u, hy - 38 * k * u], [hx + 8 * k * u, hy - 30 * k * u]], "#5a9a3a", 1.6 * u);
  } else if (prop === "calculator") {
    p.poly([[hx - 20 * u, hy - 46 * u], [hx + 20 * u, hy - 46 * u], [hx + 20 * u, hy + 8 * u], [hx - 20 * u, hy + 8 * u]], "#3a3d47", 2.2 * u);
    p.poly([[hx - 14 * u, hy - 40 * u], [hx + 14 * u, hy - 40 * u], [hx + 14 * u, hy - 28 * u], [hx - 14 * u, hy - 28 * u]], "#bfe0a8", 1.4 * u);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) p.dot(hx - 10 * u + j * 10 * u, hy - 19 * u + i * 8 * u, 2.6 * u, j === 2 && i === 2 ? "#e2453c" : "#e8e4da");
  } else if (prop === "phone") { // an office handset at the ear, its coiled cord hanging
    p.band([[hx - 6 * u, hy - 28 * u], [hx + 4 * u, hy + 6 * u]], "#e8e2d0", 9 * u, 1.6 * u, "round");
    p.ell(hx - 7 * u, hy - 30 * u, 8 * u, 6 * u, "#e8e2d0", 1.6 * u); p.ell(hx + 5 * u, hy + 8 * u, 8 * u, 6 * u, "#e8e2d0", 1.6 * u);
    const cs: P2[] = []; for (let k = 0; k < 18; k++) cs.push([hx + 5 * u + Math.sin(k * 1.6) * 4 * u, hy + 12 * u + k * 3.2 * u]);
    p.stroke(cs, 1.6 * u, "#2a2a33");
  } else if (prop === "receipt") { // a crumpled shop receipt held up
    p.poly([[hx - 16 * u, hy - 54 * u], [hx + 14 * u, hy - 56 * u], [hx + 17 * u, hy - 4 * u], [hx + 8 * u, hy - 1 * u], [hx - 2 * u, hy - 5 * u], [hx - 14 * u, hy - 2 * u]], "#fbfaf4", 2 * u);
    for (let i = 0; i < 6; i++) p.stroke([[hx - 9 * u, hy - 46 * u + i * 7 * u], [hx + 9 * u - (i % 3) * 4 * u, hy - 46 * u + i * 7 * u]], 1.6 * u, "#6a6a72");
    p.ell(hx, hy - 50 * u, 5 * u, 2 * u, "#c0262f", 0);
  } else if (prop === "camera") { // a press camera with a flash on top
    p.poly([[hx - 24 * u, hy - 30 * u], [hx + 22 * u, hy - 30 * u], [hx + 22 * u, hy - 2 * u], [hx - 24 * u, hy - 2 * u]], "#2a2a33", 2.2 * u);
    p.ell(hx - 2 * u, hy - 16 * u, 11 * u, 11 * u, "#5a6070", 2 * u); p.ell(hx - 2 * u, hy - 16 * u, 5 * u, 5 * u, "#9fc4e8", 0);
    p.poly([[hx - 18 * u, hy - 42 * u], [hx - 2 * u, hy - 42 * u], [hx - 2 * u, hy - 30 * u], [hx - 18 * u, hy - 30 * u]], "#d8d8de", 1.6 * u);
  } else if (prop === "mic") {
    p.band([[hx, hy + 4 * u], [hx + 6 * u, hy - 30 * u]], "#2a2a33", 6 * u, 1.4 * u, "round");
    p.ell(hx + 7 * u, hy - 36 * u, 9 * u, 10 * u, "#5a6070", 2 * u);
    p.poly([[hx - 1 * u, hy - 22 * u], [hx + 13 * u, hy - 22 * u], [hx + 12 * u, hy - 14 * u], [hx, hy - 14 * u]], "#c0262f", 1.2 * u);
  } else if (prop === "bundle") { // a banded bundle of red notes, held flat
    p.poly([[hx - 34 * u, hy - 20 * u], [hx + 34 * u, hy - 20 * u], [hx + 34 * u, hy - 4 * u], [hx - 34 * u, hy - 4 * u]], "#e0536a", 2 * u);
    for (let i = 1; i < 4; i++) p.stroke([[hx - 32 * u, hy - 20 * u + i * 4 * u], [hx + 32 * u, hy - 20 * u + i * 4 * u]], 1 * u, "#a8324a");
    p.poly([[hx - 6 * u, hy - 21 * u], [hx + 6 * u, hy - 21 * u], [hx + 6 * u, hy - 3 * u], [hx - 6 * u, hy - 3 * u]], "#f4ecd6", 1.4 * u);
  } else if (prop === "spoon") {
    p.band([[hx, hy + 2 * u], [hx + 4 * u, hy - 30 * u]], "#c9ccd2", 3 * u, 1 * u, "round");
    p.ell(hx + 5 * u, hy - 36 * u, 6 * u, 8 * u, "#c9ccd2", 1.4 * u);
  } else if (prop === "lantern") { // a storm lantern hanging from the hand: warm glass, black frame
    p.stroke([[hx, hy], [hx, hy + 12 * u]], 2 * u);
    p.poly([[hx - 14 * u, hy + 14 * u], [hx + 14 * u, hy + 14 * u], [hx + 12 * u, hy + 50 * u], [hx - 12 * u, hy + 50 * u]], "#ffd27a", 2.4 * u);
    p.ell(hx, hy + 32 * u, 6 * u, 10 * u, "#fff6d0", 0);
    p.poly([[hx - 17 * u, hy + 10 * u], [hx + 17 * u, hy + 10 * u], [hx + 14 * u, hy + 16 * u], [hx - 14 * u, hy + 16 * u]], "#2a2a33", 1.6 * u);
    p.poly([[hx - 15 * u, hy + 50 * u], [hx + 15 * u, hy + 50 * u], [hx + 15 * u, hy + 56 * u], [hx - 15 * u, hy + 56 * u]], "#2a2a33", 1.6 * u);
  } else if (prop === "newspaper") { // a broadsheet held open in front of the chest
    p.poly([[hx - 58 * u, hy - 62 * u], [hx + 40 * u, hy - 66 * u], [hx + 44 * u, hy + 14 * u], [hx - 54 * u, hy + 18 * u]], "#f1ead8", 2.4 * u);
    p.band([[hx - 50 * u, hy - 52 * u], [hx + 34 * u, hy - 55 * u]], "#2a2228", 6 * u, 0);
    for (let i = 0; i < 6; i++) p.stroke([[hx - 48 * u, hy - 36 * u + i * 8 * u], [hx - 8 * u - (i % 2) * 6 * u, hy - 37 * u + i * 8 * u]], 1.6 * u, "#7a7070");
    p.poly([[hx + 2 * u, hy - 40 * u], [hx + 32 * u, hy - 41 * u], [hx + 33 * u, hy - 4 * u], [hx + 3 * u, hy - 3 * u]], "#3a3036", 1.4 * u);
  } else if (prop === "sausage") { // a sausage on a fork
    p.band([[hx, hy + 4 * u], [hx + 6 * u, hy - 26 * u]], "#c9ccd2", 2.6 * u, 1 * u, "round");
    p.band([[hx - 4 * u, hy - 30 * u], [hx + 22 * u, hy - 50 * u]], "#b8623a", 12 * u, 2 * u, "round");
  } else if (prop === "flatcap") { // a flat cap held by its peak (taken off)
    p.ell(hx + 6 * u, hy - 14 * u, 26 * u, 13 * u, "#5a4636", 2.4 * u);
    p.ell(hx - 14 * u, hy - 8 * u, 14 * u, 6 * u, "#4a3828", 2 * u);
  } else if (prop === "mirror") { // a round hand mirror on a handle
    p.band([[hx, hy + 2 * u], [hx + 4 * u, hy - 20 * u]], "#8a5a34", 5 * u, 1.4 * u, "round");
    p.ell(hx + 6 * u, hy - 36 * u, 17 * u, 17 * u, "#c9a24e", 2.4 * u);
    p.ell(hx + 6 * u, hy - 36 * u, 12 * u, 12 * u, "#dff0fa", 0);
  } else if (prop === "emerald") { // the Owl's Eye: a big green cut stone held up between the fingers
    const k = 1.15;
    p.poly([[hx - 12 * k * u, hy - 26 * k * u], [hx + 12 * k * u, hy - 26 * k * u], [hx + 18 * k * u, hy - 14 * k * u], [hx + 10 * k * u, hy], [hx - 10 * k * u, hy], [hx - 18 * k * u, hy - 14 * k * u]], "#2fbf6a", 2.6 * u);
    p.poly([[hx - 7 * k * u, hy - 22 * k * u], [hx + 7 * k * u, hy - 22 * k * u], [hx + 10 * k * u, hy - 12 * k * u], [hx - 10 * k * u, hy - 12 * k * u]], "#8af0b0", 1.4 * u);
  } else if (prop === "pocketwatch") { // a big gold pocket watch held up on its chain, reading 9:00
    const cx = hx + 4 * u, cy = hy - 30 * u, R = 26 * u;
    p.stroke([[hx, hy], [cx - 6 * u, cy + R]], 2 * u, "#c9a24e");
    p.ell(cx, cy - R - 4 * u, 6 * u, 5 * u, "#c9a24e", 2 * u);
    p.ell(cx, cy, R, R, "#e0b850", 2.6 * u); p.ell(cx, cy, R * 0.8, R * 0.8, "#fffaf0", 1.4 * u);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p.stroke([[cx + Math.sin(a) * R * 0.66, cy - Math.cos(a) * R * 0.66], [cx + Math.sin(a) * R * 0.74, cy - Math.cos(a) * R * 0.74]], 1.6 * u, "#2a1d28"); }
    p.stroke([[cx, cy], [cx, cy - R * 0.62]], 2.4 * u, "#2a1d28"); // minute hand on XII
    p.stroke([[cx, cy], [cx - R * 0.42, cy]], 3.2 * u, "#2a1d28");  // hour hand on IX
    p.ell(cx, cy, 2.6 * u, 2.6 * u, "#a8222a", 0);
  } else if (prop === "stethoscope") { // the chest piece held out (listening)
    p.stroke([[hx, hy], [hx - 10 * u, hy - 30 * u]], 2.4 * u, "#3a3a44");
    p.ell(hx + 2 * u, hy + 4 * u, 8 * u, 8 * u, "#c9ccd2", 2 * u);
  } else if (prop === "hose") { // the free end of a red rubber hose with a brass coupling, the tube hanging down
    const tube: P2[] = [[hx, hy], [hx - 6 * u, hy + 30 * u], [hx - 16 * u, hy + 62 * u], [hx - 10 * u, hy + 96 * u]];
    p.stroke(tube, 13 * u, INK);
    p.stroke(tube, 8.5 * u, "#c8322e");
    p.poly([[hx - 7 * u, hy - 4 * u], [hx + 7 * u, hy - 4 * u], [hx + 9 * u, hy - 26 * u], [hx - 9 * u, hy - 26 * u]], "#e3b23c", 2.2 * u);
    p.band([[hx - 10 * u, hy - 14 * u], [hx + 10 * u, hy - 14 * u]], "#a8781e", 3 * u, 1 * u);
  } else if (prop === "valve2") { // the same valve turned upside down: the handle hangs below
    p.poly([[hx - 22 * u, hy - 30 * u], [hx + 22 * u, hy - 30 * u], [hx + 22 * u, hy + 4 * u], [hx - 22 * u, hy + 4 * u]], "#e3b23c", 2.4 * u);
    p.band([[hx - 22 * u, hy - 17 * u], [hx + 22 * u, hy - 17 * u]], "#a8781e", 3 * u, 1 * u);
    p.band([[hx, hy + 4 * u], [hx - 4 * u, hy + 24 * u]], "#3a3036", 4 * u, 1.2 * u, "round");
    p.ell(hx - 5 * u, hy + 28 * u, 9 * u, 6 * u, "#c8322e", 2 * u);
  } else if (prop === "valve") { // a brass brake-valve model: a drum with a handle on top
    p.poly([[hx - 22 * u, hy - 30 * u], [hx + 22 * u, hy - 30 * u], [hx + 22 * u, hy + 4 * u], [hx - 22 * u, hy + 4 * u]], "#e3b23c", 2.4 * u);
    p.band([[hx - 22 * u, hy - 13 * u], [hx + 22 * u, hy - 13 * u]], "#a8781e", 3 * u, 1 * u);
    p.band([[hx, hy - 30 * u], [hx + 4 * u, hy - 50 * u]], "#3a3036", 4 * u, 1.2 * u, "round");
    p.ell(hx + 5 * u, hy - 54 * u, 9 * u, 6 * u, "#c8322e", 2 * u);
  } else if (prop === "parcel") {
    p.poly([[hx - 30 * u, hy - 26 * u], [hx + 30 * u, hy - 26 * u], [hx + 30 * u, hy + 8 * u], [hx - 30 * u, hy + 8 * u]], "#c9a26a", 2.2 * u);
    p.band([[hx, hy - 26 * u], [hx, hy + 8 * u]], "#8a3b2a", 4 * u, 0.8 * u);
    p.band([[hx - 30 * u, hy - 9 * u], [hx + 30 * u, hy - 9 * u]], "#8a3b2a", 4 * u, 0.8 * u);
  }
  p.dot(hx, hy, 5.5 * u);
};

/** the loose curl over the forehead (under a brim it peeks out at the side) and the doctor's head mirror */
const extras = (p: Pen, o: Outfit, H: Blob, cx: number, hc: number, u: number, brim: boolean, side: boolean) => {
  if (o.curl) {
    // under a brim the curl escapes at the temple, below the cap; with bare hair it falls over the forehead
    const x0 = cx + (side ? (brim ? -40 : -12) : brim ? -40 : -14) * u, y0 = brim ? hc - (FACE_TOP + 2) * u : hc - 0.9 * H.b, c = o.curl, dg = clamp(DRAG, -6, 6) / 6;
    const pts: P2[] = [];
    for (let i = 0; i <= 22; i++) { const t = i / 22, a = rad(100 - 560 * t), r = (14 - 8 * t) * u; pts.push([x0 - 6 * u * t + 16 * u * dg * t * t + Math.cos(a) * r, y0 - 22 * u * t - Math.sin(a) * r * 0.6]); } // the tip lags most
    p.stroke(pts, 9 * u, INK); p.stroke(pts, 5.6 * u, c);
  }
  if (o.headMirror && !side) { // a band round the forehead with a round silver mirror in the middle
    const y = hc - (FACE_TOP + 4) * u; // above the forehead band
    p.stroke([[cx - 0.98 * H.a, y + 4 * u], [cx, y - 2 * u], [cx + 0.98 * H.a, y + 4 * u]], 4 * u, "#2a2a33");
    p.ell(cx + 4 * u, y - 4 * u, 13 * u, 13 * u, "#d8dde2", 2.6 * u); p.ell(cx + 4 * u, y - 4 * u, 4 * u, 4 * u, "#2a2a33", 0);
  }
};

export const bodyFront = (p: Pen, o: Outfit, opts: FrontOpts) => {
  const { phase = 0, expr = "neutral", mode = "march", look = 0, blink = false, lift = 60, prop = null, tilt = 0, headTilt = 0, wave,
    light = DEF_LIGHT, facing = 0, seed = 1, arm } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = flushed(o.skin ?? SKIN, opts.flush), two = Math.PI * 2, lid = lidOf(blink);
  const H = headBlob(seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100;
  const tall = (1 + Bd.torso + Bd.legs) * HH, sole = 975;
  // body bob 5 % (march) / 3 % (stroll) of the height, lowest at contact (phase 0 and 0.5)
  const bob = mode === "march" ? 0.025 * tall * Math.cos(2 * two * phase) : mode === "stroll" ? 0.015 * tall * Math.cos(2 * two * phase) : 0;
  const torsoBot = mode === "sit" ? sole - 0.2 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hipY = torsoBot - 0.12 * HH;
  const thick = thickAngle(light), ow = 5 * u;
  const legCol = mix(o.pants, INK, 0.55), armCol = mix(o.jacket, INK, 0.5), footCol = o.boots;
  const legW = 5.8 * u, footW = 7.5 * u;
  // ---- legs + feet (not rotated) ----
  p.rot = null;
  if (mode === "sit") {
    for (const side of [-1, 1]) {
      const h: P2 = [300 + side * 15 * u, hipY], k: P2 = [300 + side * 36 * u, hipY + 0.2 * HH], f: P2 = [300 + side * 44 * u, sole - 8 * u];
      p.stroke(curve(h, k, f), legW, legCol);
      footStroke(p, [f[0] - side * 2 * u, f[1]], [f[0] + side * 12 * u, f[1] - 5 * u], footW, footCol);
    }
  } else if (mode === "fall") {
    const legs: [P2, P2, P2][] = [
      [[300 - 15 * u, hipY], [300 - 46 * u, hipY + 0.5 * HH], [300 - 70 * u, hipY + 0.72 * HH]],
      [[300 + 15 * u, hipY], [300 + 50 * u, hipY + 0.45 * HH], [300 + 76 * u, hipY + 0.22 * HH]],
    ];
    legs.forEach(([h, k, f], i) => {
      p.stroke(curve(h, k, f), legW, legCol);
      footStroke(p, f, [f[0] + (i ? 14 : -14) * u, f[1] + (i ? -6 : 4) * u], footW, footCol);
    });
  } else if (o.dress) {
    for (const side of [-1, 1]) {
      const fx = 300 + side * 12 * u, fy = sole - 4 * u;
      p.stroke([[fx, sole - 0.4 * HH], [fx + side * u, fy]], legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 12 * u, fy + u], footW, footCol);
    }
  } else {
    const L = mode === "march" ? lift * 1.25 : mode === "stroll" ? lift * 0.55 : 0;
    for (const [side, ph] of [[-1, 0], [1, 0.5]] as const) {
      const up = Math.max(0, Math.sin(two * (phase + ph))) * L;
      const hx = 300 + side * 15 * u, fx = 300 + side * 22 * u, fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16) - (opts.lean ?? 0) * 0.4 * u, (hipY + fy) / 2 - up * 0.08 + Math.abs(opts.lean ?? 0) * 0.15 * u];
      p.stroke(curve([hx, hipY], k, [fx, fy]), legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 13 * u, fy + 0.5 * u], footW, footCol);
    }
  }
  if (o.jarik && mode !== "sit" && mode !== "fall") {
    const w0 = ((Bd.tw / 2) * W) / 1.06 * 0.98, len = (o.jarikShort ? 0.42 : 0.74) * Bd.legs * HH;
    jarik(p, o.jarik, 300, hipY - 0.06 * HH, w0, len, u, light, thickAngle(light), ow, facing || 1, o.jarikPlain);
  }
  // ---- upper body: rotates about the hips (tilt + a small weight-shift sway on every step) ----
  const sway = mode === "march" ? 1.6 * Math.sin(two * phase) : mode === "stroll" ? 1.0 * Math.sin(two * phase) : 0;
  const A = tilt + sway + (opts.lean ?? 0);
  p.rot = A ? [rad(A), 300, hipY] : null;
  const dress = !!o.dress && mode !== "sit" && mode !== "fall";
  const T: Blob = { a: ((Bd.tw / 2) * W) / 1.06, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.6, egg: o.build === "stout" ? 0.17 : 0.12,
    asym: 0.04 * facing, rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 3 * u * facing, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const hang = (side: number, fwd: number): [P2, P2, P2] => {
    const S = sh(side), ex = tcx + side * (1.12 * T.a + 4 * u);
    const hx = ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd);
    return [S, [ex, S[1] + 0.48 * HH], [hx, chin + 1.04 * HH - Math.abs(fwd) * 9 * u]];
  };
  const sw = mode === "march" || mode === "stroll" ? Math.sin(two * phase) : 0;
  // rifle at the order: butt by the right hip, held by the hanging right hand, muzzle past the crown
  const R0: P2 = [300 + 47 * u, torsoBot + 0.12 * HH], R1: P2 = [300 + 64 * u, crown - 0.32 * HH];
  const rifle = !!(o.rifle || o.spear) && (mode === "march" || mode === "stand" || mode === "stroll");
  const held = prop === "letter" || prop === "scroll" || prop === "pouch" || prop === "brick" || prop === "cup" || prop === "card" || prop === "box"
    || prop === "magnifier" || prop === "parcel" || prop === "gem" || prop === "plum" || prop === "calculator" || prop === "phone" || prop === "receipt"
    || prop === "camera" || prop === "mic" || prop === "bundle" || prop === "spoon" || prop === "lantern" || prop === "newspaper" || prop === "sausage"
    || prop === "flatcap" || prop === "mirror" || prop === "emerald" || prop === "stethoscope" || prop === "pocketwatch" || prop === "hose" || prop === "valve" || prop === "valve2";
  type Arm = { pts: [P2, P2, P2]; front: boolean };
  const arms: Arm[] = [];
  const sitArm = (side: number): Arm => ({ pts: [sh(side), [tcx + side * (1.1 * T.a + 6 * u), sh(side)[1] + 0.4 * HH], [tcx + side * (1.2 * T.a + 10 * u), torsoBot + 0.04 * HH]], front: false });
  if (mode === "sit" && !(held || arm)) for (const side of [-1, 1]) arms.push(sitArm(side));
  else if (mode === "fall") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.15 * T.a + 12 * u), sh(side)[1] - 0.25 * HH], [tcx + side * (1.3 * T.a + 24 * u), sh(side)[1] - 0.68 * HH]], front: false });
  else {
    const two = arm === "hips" || arm === "fold" || arm === "up" || arm === "shrug";
    const S0 = sh(-1), S1 = sh(1);
    if (arm === "hips") arms.push({ pts: [S0, [tcx - 1.3 * T.a - 14 * u, S0[1] + 0.3 * HH], [tcx - 0.85 * T.a, torsoBot - 0.12 * HH]], front: false });
    else if (arm === "fold") arms.push({ pts: [S0, [tcx - 1.1 * T.a, S0[1] + 0.42 * HH], [tcx + 0.55 * T.a, S0[1] + 0.32 * HH]], front: true });
    else if (arm === "up") arms.push({ pts: [S0, [tcx - 1.2 * T.a - 14 * u, S0[1] - 0.28 * HH], [tcx - 1.0 * T.a - 22 * u, S0[1] - 0.72 * HH]], front: false });
    else if (arm === "shrug") arms.push({ pts: [S0, [tcx - 1.25 * T.a - 10 * u, S0[1] + 0.32 * HH], [tcx - 1.1 * W, S0[1] - 0.08 * HH]], front: false });
    else arms.push(mode === "sit" ? sitArm(-1) : { pts: prop === "shako" ? hang(-1, 0) : hang(-1, -sw), front: false });
    if (two) {
      if (arm === "hips") arms.push({ pts: [S1, [tcx + 1.3 * T.a + 14 * u, S1[1] + 0.3 * HH], [tcx + 0.85 * T.a, torsoBot - 0.12 * HH]], front: false });
      else if (arm === "fold") arms.push({ pts: [S1, [tcx + 1.1 * T.a, S1[1] + 0.36 * HH], [tcx - 0.55 * T.a, S1[1] + 0.26 * HH]], front: true });
      else if (arm === "shrug") arms.push({ pts: [S1, [tcx + 1.25 * T.a + 10 * u, S1[1] + 0.32 * HH], [tcx + 1.1 * W, S1[1] - 0.08 * HH]], front: false });
      else arms.push({ pts: [S1, [tcx + 1.2 * T.a + 14 * u, S1[1] - 0.28 * HH], [tcx + 1.0 * T.a + 22 * u, S1[1] - 0.72 * HH]], front: false });
    } else if (arm === "fist") {
      arms.push({ pts: [S1, [tcx + 1.25 * T.a + 16 * u, S1[1] - 0.05 * HH], [tcx + 1.1 * T.a + 20 * u, S1[1] - 0.5 * HH]], front: true });
    } else if (rifle) {
      const G = lerp2(R0, R1, 0.1);
      arms.push({ pts: [sh(1), [tcx + 1.12 * T.a + 5 * u, sh(1)[1] + 0.45 * HH], G], front: false });
    } else if (arm === "hug") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.25 * T.a + 22 * u, S[1] - 0.02 * HH], [tcx + 1.3 * T.a + 62 * u, S[1] + 0.06 * HH]], front: false });
    } else if (arm === "point") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.2 * T.a + 0.45 * HH, S[1] - 0.01 * HH], [tcx + 1.2 * T.a + 1.0 * HH, S[1] - 0.05 * HH]], front: false });
    } else if (arm === "reach") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.2 * T.a + 0.4 * HH, S[1] + 0.12 * HH], [tcx + 1.15 * T.a + 0.9 * HH, S[1] + 0.18 * HH]], front: false });
    } else if (arm === "chest" || held) {
      const r = clamp(opts.reach ?? 0, 0, 1), S = sh(1);
      const Hd: P2 = arm === "chest" ? [tcx - 0.15 * T.a, S[1] + 0.22 * HH]
        : prop === "phone" ? [tcx + 1.22 * T.a, chin - 0.3 * HH]   // at the ear (drawn over the head)
        : prop === "receipt" && r > 0.8 ? [tcx + 1.5 * T.a, chin + 0.12 * HH] // held up beside the shoulder
        : prop === "lantern" ? [tcx + 1.3 * T.a + 10 * u, S[1] + 0.5 * HH - 0.6 * r * HH] // hanging beside the hip, raised with reach
        : prop === "emerald" && r > 0.8 ? [tcx + 0.55 * T.a, chin - 0.35 * HH] // held up to the right eye (drawn over the head)
        : prop === "pocketwatch" ? [tcx + 1.25 * T.a + 10 * u, S[1] + (0.8 - 0.6 * r) * HH] // held out beside the chest, face to the lens
        : [tcx + (0.35 - 0.3 * r) * T.a, S[1] + (0.38 - 0.62 * r) * HH]; // up to the mouth / eye at reach 1
      arms.push({ pts: [S, [tcx + 1.05 * T.a + 4 * u, S[1] + 0.42 * HH], Hd], front: true });
    } else if (wave !== undefined) {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.1 * T.a + 10 * u + 3 * u * wave, S[1] - 0.22 * HH], [tcx + 1.18 * T.a + 16 * u + 12 * u * wave, S[1] - 0.6 * HH]], front: false });
    } else if (prop === "icecream") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.05 * T.a + 4 * u, S[1] + 0.45 * HH], [tcx + 0.5 * T.a, S[1] + 0.4 * HH]], front: true });
    } else if (Array.isArray(prop)) {
      const S = sh(1), k = clamp(prop[1], 0, 1);
      const E = lerp2([tcx + 1.1 * T.a + 10 * u, S[1] - 0.15 * HH], [tcx + 1.2 * T.a + 10 * u, S[1] + 0.3 * HH], k);
      const Hd = lerp2([tcx + 1.15 * T.a + 14 * u, S[1] - 0.55 * HH], [tcx + 1.45 * T.a + 22 * u, S[1] + 0.35 * HH], k);
      arms.push({ pts: [S, E, Hd], front: true });
    } else arms.push({ pts: hang(1, sw), front: false });
  }
  if (opts.armK !== undefined && (opts.armRaw || opts.armK < 1) && mode !== "fall" && mode !== "sit") {
    const k = clamp(opts.armK, opts.armRaw ? -0.3 : 0, opts.armRaw ? 1.4 : 1), e = opts.armRaw ? k : k * k * (3 - 2 * k);
    arms.forEach((a, i) => { const h = hang(i ? 1 : -1, 0); a.pts = [lerp2(h[0], a.pts[0], e), lerp2(h[1], a.pts[1], e), lerp2(h[2], a.pts[2], e)]; });
  }
  const drawArm = (a: Arm) => {
    p.stroke(curve(a.pts[0], a.pts[1], a.pts[2]), 5.2 * u, armCol);
    p.dot(a.pts[2][0], a.pts[2][1], (arm === "fist" && a === arms[arms.length - 1] ? 9 : 5.5) * u);
    if (o.watch && a === arms[arms.length - 1]) { // a fat gold watch just above the right hand
      const w = lerp2(a.pts[2], a.pts[1], 0.16);
      p.ell(w[0], w[1], 7.5 * u, 6.5 * u, "#e3b23c", 2 * u); p.ell(w[0], w[1], 3.6 * u, 3.2 * u, "#fff3c4", 0);
    }
    if (o.gloves) p.dot(a.pts[2][0], a.pts[2][1], 4 * u, o.gloves);
  };
  // behind the body: rifle, sword, arms
  if (rifle && o.spear) spearAt(p, R0, R1, u);
  else if (rifle) {
    p.band([R0, R1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(R0, R1, 0.6), R1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  if (o.sword && mode !== "sit") {
    const s0: P2 = [tcx - 0.75 * T.a, torsoBot - 0.2 * HH];
    p.band([s0, [s0[0] - Math.sin(rad(25)) * 0.8 * HH, s0[1] + Math.cos(rad(25)) * 0.8 * HH]], "#c9ccd2", 3 * u, 1.2 * u, "round");
  }
  for (const a of arms) if (!a.front) drawArm(a);
  // torso / dress: shaded fill -> clothing clipped to it -> thick-thin ink ring
  if (dress) {
    const D: Blob = { a: 0.5 * W * 0.98, b: 0.5 * ((sole - 0.35 * HH) - (chin - 0.2 * HH)), nTop: 2.0, nBot: 3.0, egg: 0.35, asym: 0.03 * facing, rot: 0, noise: 0.006, seed: seed + 9 };
    const dp = blobPts(300, sole - 0.35 * HH - D.b, D);
    p.gradFill(dp, o.dress!, mul(o.dress!, SH_CLOTH), light);
    p.inkRing(dp, ow, thick);
    const Sw: Blob = { a: 0.37 * W, b: 0.3 * HH, nTop: 2.2, nBot: 2.4, egg: 0.1, asym: 0, rot: 0, noise: 0.006, seed: seed + 8 };
    const sp = blobPts(300, chin + 0.12 * HH, Sw);
    p.gradFill(sp, o.jacket, mul(o.jacket, SH_CLOTH), light);
    p.inkRing(sp, ow * 0.9, thick);
  } else {
    p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), light);
    p.clip(tp, () => {
      if (o.armor) chestplate(p, tcx, chin, torsoBot, T.a, HH, u, seed);
      if (o.beskap) beskap(p, o, tcx, chin, torsoBot, T.a, HH, u, facing);
      else if (o.belt) {
        for (const s of [-1, 1]) p.band([[tcx - s * 0.75 * T.a, chin - 0.05 * HH], [tcx + s * 0.8 * T.a, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
        const xc = tcx + 0.025 * T.a, yc = chin - 0.05 * HH + (torsoBot - 0.1 * HH - (chin - 0.05 * HH)) * (0.75 / 1.55);
        p.poly([[xc - 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc + 3.5 * u], [xc - 3.5 * u, yc + 3.5 * u]], "#d9dde0", 1.5 * u);
      }
      if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
      if (o.shirtBatik) batikShirt(p, o.shirtBatik, tcx, chin, torsoBot, T.a, u);
      if (o.tie) p.poly([[tcx - 5 * u, chin + 0.03 * HH], [tcx + 5 * u, chin + 0.03 * HH], [tcx + 7 * u, chin + 0.5 * HH], [tcx, chin + 0.58 * HH], [tcx - 7 * u, chin + 0.5 * HH]], o.tie, 1.4 * u);
      for (let i = 0; i < (o.beskap || o.armor ? 0 : 4); i++) {
        const y = chin + 0.12 * HH + i * 0.2 * HH;
        if (o.sash && Math.abs(y - (torsoBot - 0.32 * HH)) < 0.08 * HH) continue;
        p.dot(tcx + 2 * u * facing, y, 2.2 * u + 0.8 * u, INK); p.dot(tcx + 2 * u * facing, y, 2.2 * u, o.buttons ?? shade(o.jacket, 0.7));
      }
    });
    if (o.sash && !o.beskap) { const s = facing || 1; p.poly([[tcx + s * 0.55 * T.a, torsoBot - 0.3 * HH], [tcx + s * 0.75 * T.a, torsoBot + 0.05 * HH], [tcx + s * 0.45 * T.a, torsoBot + 0.02 * HH]], o.sash, 1.6 * u); }
    p.inkRing(tp, ow, thick);
    if (o.keris) keris(p, tcx + 0.62 * T.a, torsoBot - 0.34 * HH, u, 1);
    if (o.pearls) for (let i = -5; i <= 5; i++) { // pearls along the neckline
      const a = (i / 5) * 1.1, px = tcx + Math.sin(a) * 0.5 * T.a, py = chin + 0.04 * HH + (1 - Math.cos(a)) * 0.22 * T.a;
      p.ell(px, py, 4.2 * u, 4.2 * u, "#f6f2ea", 1.2 * u);
    }
    if (o.stetho) { // a stethoscope round the neck: two grey tubes down the chest, a silver chest piece
      for (const s of [-1, 1]) p.stroke([[tcx + s * 0.42 * T.a, chin + 0.02 * HH], [tcx + s * 0.36 * T.a, chin + 0.3 * HH], [tcx + s * 0.12 * T.a, chin + 0.5 * HH]], 3.2 * u, "#3a3a44");
      p.ell(tcx + 0.05 * T.a, chin + 0.55 * HH, 7 * u, 7 * u, "#c9ccd2", 2 * u);
    }
    if (o.fur) p.band([[tcx - 0.95 * T.a, chin + 0.08 * HH], [tcx - 0.3 * T.a, chin + 0.02 * HH], [tcx + 0.3 * T.a, chin + 0.02 * HH], [tcx + 0.95 * T.a, chin + 0.08 * HH]], o.fur, 0.14 * HH, 2 * u, "round");
    if (o.scarf) p.poly([[tcx - 0.55 * T.a, chin + 0.02 * HH], [tcx + 0.55 * T.a, chin + 0.02 * HH], [tcx + 4 * u, chin + 0.36 * HH]], o.scarf, 2 * u);
    if (o.hoseCoil) for (let k = 0; k < 3; k++) { // a coil of rubber hose slung over the left shoulder
      const ring = ellPts(tcx - 0.62 * T.a + k * 4 * u, chin + 0.36 * HH + k * 3 * u, 0.5 * T.a, 0.4 * HH);
      p.stroke([...ring, ring[0]], 11 * u, INK); p.stroke([...ring, ring[0]], 7 * u, o.hoseCoil);
    }
    if (o.bowtie) { // bow tie under the chin
      const by = chin + 0.06 * HH;
      for (const s of [-1, 1]) p.poly([[tcx, by], [tcx + s * 13 * u, by - 7 * u], [tcx + s * 13 * u, by + 7 * u]], o.bowtie, 1.6 * u);
      p.ell(tcx, by, 3.6 * u, 3.6 * u, o.bowtie, 1.4 * u);
    }
  }
  if (o.hat === "hijab") { // the hijab's drape over the shoulders, under the hands and what they hold
    const col = o.cap ?? "#1f2f5a", k = blobPts(300, hc + 0.42 * H.b, { ...H, a: H.a * 1.24, b: H.b * 1.42, asym: 0, egg: -0.1, seed: H.seed + 5 });
    p.shadedFill(k, col, mul(col, SH_CLOTH), light, H.a * 1.24);
    p.inkRing(k, ow * 0.9, thick);
  }
  // in front of the body: hands holding props
  const overHead = prop === "phone" || ((prop === "receipt" || prop === "emerald" || prop === "hose") && (opts.reach ?? 0) > 0.8);
  for (const a of arms) if (a.front && !overHead) {
    drawArm(a);
    const [hx, hy] = a.pts[2];
    if (prop === "icecream") {
      p.poly([[hx - 8 * u, hy - 12 * u], [hx + 8 * u, hy - 12 * u], [hx, hy + 7 * u]], "#e0a35a", 1.8 * u);
      p.ell(hx, hy - 19 * u, 11 * u, 10 * u, "#f7c6d9", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    } else if (held) heldProp(p, prop as string, hx, hy, u);
    else if (Array.isArray(prop)) {
      const ang = rad(-70 + 105 * clamp(prop[1], 0, 1));
      const Rh = (pts: P2[]) => rotPts(pts, ang, hx, hy);
      p.band(Rh([[hx, hy + 12 * u], [hx, hy - 44 * u]]), "#8a5a34", 5 * u, 1.5 * u, "round");
      p.poly(Rh([[hx - 12 * u, hy - 58 * u], [hx + 20 * u, hy - 58 * u], [hx + 20 * u, hy - 42 * u], [hx - 12 * u, hy - 42 * u]]), "#7d848c", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    }
  }
  if (prop === "shako") { // carried by the left hand
    const [hx, hy] = arms[0].pts[2];
    p.poly([[hx - 14 * u, hy + 3 * u], [hx + 14 * u, hy + 3 * u], [hx + 16 * u, hy + 30 * u], [hx - 16 * u, hy + 30 * u]], "#3a3d47", 2.2 * u);
    p.ell(hx, hy + 31 * u, 3.5 * u, 3.5 * u, "#2b7a4b", 1.5 * u);
    p.dot(hx, hy, 5.5 * u);
  }
  // ---- head: rotates with the body, plus its own tilt about the chin ----
  const Ah = A + headTilt, [cpx, cpy] = rotAbout([300, chin], rad(A), [300, hipY]);
  p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
  hatBehind(p, o, H, 300, hc, light, thick, ow, false);
  const hp = blobPts(300, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  DRAG = opts.drag ?? 0;
  hatOn(p, o, hp, H, 300, hc, light, seed, facing, false);
  const brim = BRIM.has(o.hat ?? "");
  GLASS_DROP = opts.glassesDrop ?? 0; TALK = opts.talk ?? 0;
  FACEX = { unibrow: o.unibrow, longNose: o.longNose, mole: o.mole, chops: o.chops, flare: opts.flare };
  faceFront(p, 300, hc, W, expr, facing, look, lid, brim, skin, o.moustache, o.build === "stout", o.beard, o.glasses, o.monocle);
  FACEX = {}; GLASS_DROP = 0;
  extras(p, o, H, 300, hc, u, brim, false);
  DRAG = 0;
  if (overHead) { // the hand with the phone / the receipt over the cheek
    p.rot = A ? [rad(A), 300, hipY] : null;
    for (const a of arms) if (a.front) { drawArm(a); heldProp(p, prop as string, a.pts[2][0], a.pts[2][1], u); }
  }
  p.rot = null;
};

export type SideOpts = {
  phase?: number; expr?: ExprIn; mode?: "march" | "stand" | "swing" | "push" | "pull"; blink?: boolean | number; stomp?: number; pose?: number;
  /** step length as a multiple of 0.8 m (370 units): matches 1.6 m/s at 2 steps/s; scale by the view's foreshortening */
  stride?: number; light?: number; seed?: number;
  /** push mode: where the hands land at pose 1, in final canvas units (e.g. the swing kid's back);
   *  pull mode: the handle both hands hold (default pullHand(): an arm's length ahead at full lean) */
  hand?: [number, number];
  /** pull mode: extra lean in degrees (- = back) for breath and strain tremble; the hands stay on the handle */
  shake?: number;
  /** 0..1: the face skin warms to red (strain, rage); from 0.5 a sweat bead sits on the brow */
  flush?: number;
  /** 0..1: sweat drops flung off the back of the head (0 = just left the head, 1 = gone); undefined = none */
  sweat?: number;
  /** -1..1: + squash (torso shorter and wider, head drops), - stretch (taller, thinner); the hands keep their grip */
  squash?: number;
  /** 0..1: the near arm reaches forward and up (a lever, a door handle); 1 = level with the shoulder and a bit above.
   *  pull mode: the grip, 0 = hands hanging, 1 = both hands on the handle (default 1) */
  reach?: number;
  /** a prop in the near hand (a press camera, a bundle of notes) */
  prop?: Prop;
  /** secondary motion (deg, +-6): hat, hair edge and curl trail the head by this much */
  drag?: number;
};

// ---------------- pull (a locked door, a stuck lid, a rope): side view, feet braced, hands fixed on the handle ----------------
// pose 0 = standing at the handle, elbows bent; pose 1 = full haul: hips drop, the upper body leans back about the hip
// and the arms straighten. The hands never move (the thing does not give), so the effort shows in the body.
// pose 0 already leans back a little; the default handle is set for pose 1.2 so a hit() overshoot keeps both hands on it.
const PULL = { hip0: 0.9, hip1: 0.85, lean0: -6, lean1: -20, reachPose: 1.2 };
const pullFrame = (o: Outfit, seed: number, pose: number, sq = 0) => {
  const Bd = BUILD[o.build ?? "adult"], H = headBlob(seed, Bd.a, 1), W = 2 * H.a, HH = 2 * H.b, u = W / 100, ankY = 975 - 4 * u;
  const legLen = (Bd.legs + 0.12) * HH - 4 * u, hipY = ankY - (PULL.hip0 + (PULL.hip1 - PULL.hip0) * pose) * legLen;
  const chin = hipY + 0.12 * HH - Bd.torso * HH * squashH(sq), Ta = (o.build === "stout" ? 0.36 : 0.31) * W;
  return { HH, u, hipY, lean: PULL.lean0 + (PULL.lean1 - PULL.lean0) * pose, S: [300 + 2 * u + 0.05 * Ta, chin + 0.14 * HH] as P2, aLen: 0.95 * HH,
    hd: [300 + 4 * u, chin - H.b] as P2, ha: H.a };
};
/** torso height and width factors for SideOpts.squash (-1..1) */
const squashH = (sq = 0) => 1 - 0.14 * clamp(sq, -1, 1), squashW = (sq = 0) => 1 + 0.08 * clamp(sq, -1, 1);
/** the default handle for mode "pull", in canvas units (600 x 1000, soles at y 975, facing screen-right): where the
 *  near hand is at pose 1.2 (keys overshoot) with the arm almost straight. For the set: the handle sits (x - 300) * SU metres in front of
 *  the feet and (975 - y) * SU metres up (cast.ts pullReach() does this). */
export const pullHand = (o: Outfit, seed = 1, y?: number): P2 => {
  const F = pullFrame(o, seed, PULL.reachPose), Sc = rotAbout(F.S, rad(F.lean), [300, F.hipY]), r = 0.97 * F.aLen;
  // a handle at a given height (canvas y, e.g. a set's door knob): as far ahead as the arm reaches at that height
  let h: P2 = [Sc[0] + r * Math.cos(rad(10)), Sc[1] + r * Math.sin(rad(10))];
  if (y !== undefined) { const dy = clamp(y - Sc[1], -0.8 * r, 0.8 * r); h = [Sc[0] + Math.sqrt(r * r - dy * dy), Sc[1] + dy]; }
  // never closer than the face at rest (pose 0 plus a breath) and a knob's depth: a high knob (above these short
  // shoulders) is out of full reach, and the lean stops early instead (bodySide caps it by the real reach)
  const F0 = pullFrame(o, seed, 0), hc = rotAbout(F0.hd, rad(F0.lean + 1.5), [300, F0.hipY]);
  return [Math.max(h[0], hc[0] + F0.ha + 12 * F0.u), h[1]];
};
/** two-bone arm from shoulder S to hand at most reach away, elbow dropping below the line */
const armTo = (S: P2, hand: P2, len: number): [P2, P2, P2] => {
  const dx = hand[0] - S[0], dy = hand[1] - S[1], d = Math.hypot(dx, dy) || 1, dd = Math.min(d, len * 0.995);
  const h: P2 = [S[0] + (dx / d) * dd, S[1] + (dy / d) * dd], l = len / 2;
  const A = Math.acos(clamp(dd / (2 * l), -1, 1)), k = Math.atan2(dy, dx) + A;
  return [S, [S[0] + l * Math.cos(k), S[1] + l * Math.sin(k)], h];
};

/** two-bone leg, knee bending forward (+x) */
const ik = (hip: P2, ank: P2, l1: number, l2: number): P2 => {
  const dx = ank[0] - hip[0], dy = ank[1] - hip[1], d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), k = Math.atan2(dy, dx) - A;
  return [hip[0] + l1 * Math.cos(k), hip[1] + l1 * Math.sin(k)];
};

/** hip height of the seated kid in `swing` mode (design units); swingKid seats the torso bottom on the plank */
const SWING_HIP = 733;

/** side view facing screen-right; march footfalls land at phase 0 (near foot) and 0.5 (far foot), like the front view.
 *  The stance foot is planted: it slides back at exactly the walking speed while the hip rises and falls over it. */
export const bodySide = (p: Pen, o: Outfit, opts: SideOpts) => {
  const { phase = 0, expr = "neutral", mode = "march", blink = false, stomp = 1, pose = 0, stride = 1, light = DEF_LIGHT, seed = 1, squash: sq = 0 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = flushed(o.skin ?? SKIN, opts.flush), two = Math.PI * 2, lid = lidOf(blink);
  const H: Blob = { ...headBlob(seed, Bd.a, 1), asym: 0.12, rot: rad(3 + 3 * (rnd(seed, 7) - 0.5)) };
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, sole = 975, ankY = sole - 4 * u;
  const thick = thickAngle(light), ow = 5 * u;
  const legLen = (Bd.legs + 0.12) * HH - 4 * u, l1 = legLen / 2, l2 = legLen / 2;
  const nearCol = mix(o.pants, INK, 0.55), farCol = mix(o.pants, INK, 0.75), footCol = o.boots;
  type LegS = { ank: P2; pitch: number; near: boolean };
  const legs: LegS[] = [];
  let hipY = ankY - legLen * 0.995, lean = 0, nearFwd = 0;
  if (mode === "march") {
    const S = 370 * stride, liftH = Math.max(22, 40 + 70 * (stomp - 1));
    const st = (ph: number) => {
      const c = (((phase + ph) % 1) + 1) % 1;
      if (c < 0.5) { const s = c / 0.5; return { x: S / 2 - S * s, h: 0, stance: true, s }; }
      const s = (c - 0.5) / 0.5; // swing: cycloid in world space, so the foot leaves and lands at zero ground speed
      return { x: -S / 2 + S * s - (S / Math.PI) * Math.sin(2 * Math.PI * s), h: liftH * Math.sin(Math.PI * s), stance: false, s };
    };
    const nL = st(0), fL = st(0.5), stance = nL.stance ? nL : fL;
    const Leff = legLen * (1 - 0.035 * Math.sin(Math.PI * stance.s));
    hipY = ankY - Math.sqrt(Math.max(1, Leff * Leff - stance.x * stance.x));
    for (const [L, near] of [[fL, false], [nL, true]] as const)
      legs.push({ ank: [300 + L.x, ankY - L.h], pitch: L.stance ? 0 : rad(35 * Math.sin(Math.PI * L.s) * (1 - 1.6 * L.s)), near });
    lean = 4 + 3 * Math.cos(2 * two * phase); // 7 deg at contact, 1 deg at passing
    nearFwd = nL.x / (S / 2);
  } else if (mode === "push") {
    hipY = ankY - 0.87 * legLen;
    legs.push({ ank: [300 - 0.5 * legLen, ankY], pitch: rad(-8), near: false }, { ank: [300 + 0.32 * legLen, ankY], pitch: 0, near: true });
    lean = 14 * pose;
  } else if (mode === "pull") {
    // braced: near foot planted forward with the toe up, far foot back; knees give as the hips drop
    // shake (breath, tremble) rocks the upper body; the back lean stops where the arms run out of reach, so the hands
    // never slip off the handle (overshoot, a high knob)
    const F = pullFrame(o, seed, pose, sq), hd = opts.hand ?? pullHand(o, seed), rr = 0.985 * F.aLen;
    const gap = (L: number) => { const Sc = rotAbout(F.S, rad(L), [300, F.hipY]); return Math.hypot(Sc[0] - hd[0], Sc[1] - hd[1]); };
    let cap = 2 * PULL.lean1;
    if (gap(cap) > rr) { let lo = cap, hi = PULL.lean0 + 8; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (gap(m) > rr) lo = m; else hi = m; } cap = hi; }
    hipY = F.hipY; lean = Math.max(F.lean + (opts.shake ?? 0), cap);
    legs.push({ ank: [300 - 0.42 * legLen, ankY], pitch: rad(-4), near: false }, { ank: [300 + 0.3 * legLen, ankY], pitch: rad(-12 * pose), near: true });
  } else if (mode === "swing") {
    hipY = SWING_HIP;
    const a = rad(60 * pose);
    for (const [dx, near] of [[-6, false], [0, true]] as const) {
      const knee: P2 = [300 + l1 * 0.98 + dx * u, hipY + 6 * u];
      legs.push({ ank: [knee[0] + l2 * Math.sin(a), knee[1] + l2 * Math.cos(a)], pitch: -a * 0.5, near });
    }
  } else {
    legs.push({ ank: [300 - 4 * u, ankY], pitch: 0, near: false }, { ank: [300 + 4 * u, ankY], pitch: 0, near: true });
  }
  const torsoBot = hipY + 0.12 * HH, chin = torsoBot - Bd.torso * HH * squashH(sq), hc = chin - H.b, crown = hc - H.b, hip: P2 = [300, hipY];
  p.rot = null;
  for (const L of legs) {
    const knee = mode === "swing" ? ([300 + l1 * 0.98 + (L.near ? 0 : -6 * u), hipY + 6 * u] as P2) : ik(hip, L.ank, l1, l2);
    const hp0: P2 = [300 + (L.near ? 0 : -5 * u), hipY];
    p.stroke([hp0, knee, L.ank], 5.8 * u, L.near ? nearCol : farCol);
    const c = Math.cos(L.pitch), s = Math.sin(L.pitch);
    footStroke(p, [L.ank[0] - 3 * u * c, L.ank[1] - 3 * u * s], [L.ank[0] + 13 * u * c, L.ank[1] + 13 * u * s + 0.5 * u],
      7.5 * u, L.near ? footCol : footCol === INK ? INK : shade(footCol, 0.82));
  }
  if (o.jarik && mode !== "swing") {
    const len = (o.jarikShort ? 0.42 : 0.74) * Bd.legs * HH;
    jarik(p, o.jarik, 300, hipY - 0.06 * HH, (o.build === "stout" ? 0.36 : 0.31) * W * 0.95, len, u, light, thickAngle(light), ow, 1, o.jarikPlain);
  }
  // ---- upper body leans about the hip ----
  p.rot = lean ? [rad(lean), 300, hipY] : null;
  const T: Blob = { a: (o.build === "stout" ? 0.36 : 0.31) * W * squashW(sq), b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.5, egg: 0.1, asym: 0.06,
    rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 2 * u, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const armCol = mix(o.jacket, INK, 0.5), farArm = mix(o.jacket, INK, 0.68);
  const S: P2 = [tcx + 0.05 * T.a, chin + 0.14 * HH], aLen = 0.95 * HH;
  const swingArm = (ang: number): [P2, P2, P2] => {
    const e: P2 = [S[0] + Math.sin(ang) * aLen * 0.5, S[1] + Math.cos(ang) * aLen * 0.5], a2 = ang + rad(16) * Math.sign(ang || 1);
    return [S, e, [e[0] + Math.sin(a2) * aLen * 0.5, e[1] + Math.cos(a2) * aLen * 0.5]];
  };
  const rifle = !!(o.rifle || o.spear) && (mode === "march" || mode === "stand");
  const B0: P2 = [tcx + 0.72 * T.a, chin + 0.58 * HH], B1: P2 = [tcx - 0.95 * T.a - 22 * u, crown - 0.4 * HH];
  let near: [P2, P2, P2], far: [P2, P2, P2] | null;
  if (mode === "swing") { near = [S, [S[0] + 12 * u, S[1] - 0.16 * HH], [300 + 6 * u, chin - 0.3 * HH]]; far = [S, [S[0] + 8 * u, S[1] - 0.18 * HH], [300 + 2 * u, chin - 0.36 * HH]]; }
  else if (mode === "push") {
    const reach = 0.55 * HH + 0.45 * HH * pose;
    let hN: P2 = [S[0] + reach, S[1] + 0.06 * HH];
    if (opts.hand) {
      // target is in final canvas units; the arm is drawn inside the lean rotation, so undo it
      const th = -rad(lean), dx = opts.hand[0] - 300, dy = opts.hand[1] - hipY;
      const tg: P2 = [300 + dx * Math.cos(th) - dy * Math.sin(th), hipY + dx * Math.sin(th) + dy * Math.cos(th)];
      hN = [hN[0] + (tg[0] - hN[0]) * pose, hN[1] + (tg[1] - hN[1]) * pose];
    }
    near = [S, [(S[0] + hN[0]) / 2, (S[1] + hN[1]) / 2 + 0.06 * HH], hN];
    far = [S, [(S[0] + hN[0]) / 2 - 4 * u, (S[1] + hN[1]) / 2 - 0.02 * HH], [hN[0] - 6 * u, hN[1] - 0.08 * HH]];
  } else if (mode === "pull") {
    // both hands on the handle (canvas units); the arms are drawn inside the lean rotation, so take the handle into it
    const g = clamp(opts.reach ?? 1, 0, 1), hc0 = opts.hand ?? pullHand(o, seed), th = -rad(lean);
    const dx = hc0[0] - 300, dy = hc0[1] - hipY;
    const hl: P2 = [300 + dx * Math.cos(th) - dy * Math.sin(th), hipY + dx * Math.sin(th) + dy * Math.cos(th)];
    const hang = swingArm(0)[2], hN = lerp2(hang, hl, g), hF = lerp2(swingArm(rad(-8))[2], [hl[0] - 5 * u, hl[1] - 3 * u], g);
    near = armTo(S, hN, aLen);
    far = armTo([S[0] - 4 * u, S[1] - 2 * u], hF, aLen);
  } else if (rifle) { near = [S, [S[0] - 4 * u, S[1] + 0.42 * HH], B0]; far = mode === "march" ? swingArm(rad(30) * nearFwd) : swingArm(0); }
  else if (opts.reach !== undefined) { near = swingArm(rad(115 * clamp(opts.reach, 0, 1))); far = null; }
  else { near = swingArm(rad(-30) * nearFwd); far = mode === "march" ? swingArm(rad(30) * nearFwd) : null; }
  if (far) { p.stroke(curve(far[0], far[1], far[2]), 5.2 * u, farArm); p.dot(far[2][0], far[2][1], 5.5 * u); }
  p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), light);
  p.clip(tp, () => {
    if (o.armor) chestplate(p, tcx, chin, torsoBot, T.a, HH, u, seed);
    if (o.belt) p.band([[tcx - 0.65 * T.a, chin - 0.05 * HH], [tcx + 0.75 * T.a, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
    if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
    if (!o.dress && !o.beskap && !o.armor) for (let i = 0; i < 3; i++) { const y = chin + 0.16 * HH + i * 0.24 * HH; p.dot(tcx + 0.8 * T.a, y, 3 * u, INK); p.dot(tcx + 0.8 * T.a, y, 2.2 * u, o.buttons ?? shade(o.jacket, 0.7)); }
  });
  p.inkRing(tp, ow, thick);
  if (o.keris) keris(p, tcx - 0.55 * T.a, torsoBot - 0.36 * HH, u, -1);
  if (rifle && o.spear) spearAt(p, B0, B1, u);
  else if (rifle) {
    p.band([B0, B1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(B0, B1, 0.6), B1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  p.stroke(curve(near[0], near[1], near[2]), 5.2 * u, armCol); p.dot(near[2][0], near[2][1], 5.5 * u);
  if (opts.prop && typeof opts.prop === "string") heldProp(p, opts.prop, near[2][0], near[2][1], u);
  // ---- head ----
  const hx = 300 + 4 * u;
  hatBehind(p, o, H, hx, hc, light, thick, ow, true);
  const hp = blobPts(hx, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  DRAG = opts.drag ?? 0;
  hatOn(p, o, hp, H, hx, hc, light, seed, 1, true);
  const brim = BRIM.has(o.hat ?? "");
  FACEX = { unibrow: o.unibrow, longNose: o.longNose, mole: o.mole };
  faceSide(p, hx, hc, W, expr, lid, brim, skin, o.moustache, o.build === "stout", o.beard);
  FACEX = {};
  extras(p, o, H, hx, hc, u, brim, true);
  DRAG = 0;
  sweatSide(p, hx, hc, H, u, opts.flush ?? 0, opts.sweat);
  p.rot = null;
};
/** effort sweat on a profile head (facing screen-right): a bead on the brow from flush 0.5, and on each yank two
 *  drops flung up and back off the head that arc down, shrink and are gone at s = 1 */
const sweatSide = (p: Pen, hx: number, hc: number, H: Blob, u: number, flush: number, s?: number) => {
  const SW = "#9fd4ff", drop = (x: number, y: number, r: number, ang: number) => {
    // a teardrop: round end leading, tip trailing along the flight
    const pts: P2[] = [];
    for (let k = 0; k <= 16; k++) { const a = ang - Math.PI / 2 + (Math.PI * k) / 16; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
    pts.push([x - 2.4 * r * Math.cos(ang), y - 2.4 * r * Math.sin(ang)]);
    p.poly(pts, SW, 2 * u);
  };
  if (flush >= 0.5) drop(hx - 30 * u, hc - 22 * u, 3.4 * u * Math.min(1, 0.6 + (flush - 0.5)), Math.PI / 2);
  if (s === undefined || s < 0 || s >= 1) return;
  for (const [vx, vy, r] of [[-30, -34, 3.4], [-44, -18, 2.8]] as const) {
    const x = hx - 0.5 * H.a + vx * u * s * 1.4, y = hc - 0.45 * H.b + vy * u * s * 1.4 + 60 * u * s * s;
    const ang = Math.atan2(vy * 1.4 + 120 * s, vx * 1.4); // the drop points along its flight
    drop(x, y, r * u * (1 - 0.45 * s), ang);
  }
};

/** rope + seat + seated kid on a 700 x 2300 canvas; the pivot is design (350, 20); kid drawn at 0.92 scale */
export const swingKid = (p: Pen, o: Outfit, kick: number, expr: ExprIn, light = DEF_LIGHT, blink: number = 0) => {
  const rope = 1830, k = 1.1, HH = 2 * headBlob(5, BUILD[o.build ?? "adult"].a, 1).b;
  // two ropes from the pivot to the ends of a wide plank, the kid framed between them: a single rope behind the kid
  // ended at the cap and read as a hanging. Far rope behind the kid, near rope drawn over (clear of the face).
  const seat = rope + 18, x0 = 150, x1 = 550;
  p.line([[350, 20], [x0 + 16, seat + 4]], "#a07a4c", 10);
  p.poly(rrect(x0, seat, x1, seat + 36, 10), "#b5653f", 9);
  const g = p.g;
  g.save();
  g.translate(350 - 300 * k, rope + 18 - (SWING_HIP + 0.12 * HH) * k);
  g.scale(k, k);
  bodySide(new Pen(g), o, { expr, mode: "swing", pose: kick, light, seed: 5, blink });
  g.restore();
  p.line([[350, 20], [x1 - 16, seat + 4]], "#a07a4c", 10);
};

// ---------------- effects ----------------
export const fxNote = (p: Pen, kind: number, col = "#1f2a44") => {
  p.ell(70, 200, 46, 34, col, 8, 0, 360, -20);
  p.stroke([[110, 190], [110, 40]], 14);
  if (kind === 0) p.poly([[110, 40], [170, 70], [170, 110], [110, 82]], col, 8);
  else {
    p.ell(150, 170, 40, 30, col, 8, 0, 360, -20);
    p.stroke([[186, 160], [186, 20]], 14);
    p.poly([[110, 40], [186, 20], [186, 50], [110, 70]], col, 8);
  }
};

/** spark / impact star on a 500 x 500 canvas; t in 0..1 */
export const fxBurst = (p: Pen, t: number, col = "#fff3b0", rays = 10, r0 = 40, r1 = 230) => {
  const c = 250, e = 1 - (1 - t) ** 3;
  for (let i = 0; i < rays; i++) {
    const a = rad((i * 360) / rays + 7 * (i % 2)), ra = r0 + (r1 - r0) * e * (0.75 + 0.25 * (i % 2));
    p.poly([[c + r0 * 0.5 * Math.cos(a + 0.18), c + r0 * 0.5 * Math.sin(a + 0.18)], [c + ra * Math.cos(a), c + ra * Math.sin(a)],
      [c + r0 * 0.5 * Math.cos(a - 0.18), c + r0 * 0.5 * Math.sin(a - 0.18)]], col, Math.max(3, 8 * (1 - t)));
  }
  if (t < 0.5) p.ell(c, c, r0 * (1.4 - t), r0 * (1.4 - t), WHITE, 8);
};

/** water splash crown on an 800 x 800 canvas; t in 0..1 */
export const fxSplash = (p: Pen, t: number) => {
  const c = 400, size = 800, rise = Math.sin(Math.min(1, t * 1.3) * Math.PI);
  const blue = "#bfe8ff", deep = "#6cc0f0";
  if (rise > 0.02) {
    const pts: P2[] = [];
    for (let i = 0; i < 19; i++) {
      const h = (i % 2 ? 260 : 130) * rise * (0.7 + 0.3 * Math.sin(i * 1.7));
      pts.push([c - 330 + (660 * i) / 18, size - 120 - h]);
    }
    p.poly([...pts, [c + 330, size - 90], [c - 330, size - 90]], blue, 10);
    p.ell(c, size - 100, 360, 46, deep, 10);
  }
  for (let i = 0; i < 8; i++) {
    const a = rad(200 + i * 18), d = 120 + 380 * t, y = size - 160 + d * Math.sin(a) + 520 * t * t, r = 26 * (1 - t) + 6;
    if (t > 0.08 && y < size - 40) p.ell(c + d * Math.cos(a), y, r, r * 1.25, blue, 7);
  }
};

/** dust puff on a 300 x 300 canvas; t in 0..1 */
export const fxPuff = (p: Pen, t: number) => {
  for (let i = 0; i < 5; i++) {
    const a = rad(160 + i * 55), d = 40 + 70 * t, r = (34 + 20 * (i % 2)) * (1 - 0.6 * t);
    p.ell(150 + d * Math.cos(a), 180 + d * 0.45 * Math.sin(a), r, r * 0.8, `rgba(238,225,205,${(1 - t).toFixed(3)})`, 0);
  }
};

/** circling stars on a 420 x 210 canvas */
export const fxStars = (p: Pen, t: number) => {
  for (let i = 0; i < 4; i++) {
    const a = t * Math.PI * 2 + (i * Math.PI) / 2, x = 210 + 150 * Math.cos(a), y = 110 + 40 * Math.sin(a), pts: P2[] = [];
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 14 : 34, b = rad(k * 36 - 90); pts.push([x + r * Math.cos(b), y + r * Math.sin(b)]); }
    p.poly(pts, "#ffd84a", 6);
  }
};

/** three jittering strain ticks on a 300 x 300 canvas */
export const fxCreak = (p: Pen, t: number) => {
  const j = 6 * Math.sin(t * 40);
  for (const a of [-30, 0, 30]) {
    const b = rad(a - 90);
    p.stroke([[150 + 70 * Math.cos(b) + j, 230 + 70 * Math.sin(b)], [150 + 100 * Math.cos(b) + 10 + j, 230 + 100 * Math.sin(b)],
      [150 + 130 * Math.cos(b) + j, 230 + 130 * Math.sin(b)]], 10);
  }
};

/** flat water ring (drawn top-down) on a 600 x 600 canvas; t in 0..1 */
export const fxRing = (p: Pen, t: number) => {
  // thin light water rings (white crest, pale blue trailing rings), thinning as they spread
  const g = p.g;
  for (let k = 0; k < 3; k++) {
    const u = t - k * 0.22;
    if (u <= 0 || u >= 1) continue;
    g.beginPath(); g.ellipse(300, 300, 60 + 230 * u, 60 + 230 * u, 0, 0, Math.PI * 2);
    g.strokeStyle = k === 0 ? "#f6fcff" : "#cfe8fa"; g.lineWidth = 9 * (1 - u) + 3; g.stroke();
  }
};

/** text-free sign on a 700 x 520 canvas: "no marching in step on the bridge". A bridge (deck + arch + piers), four
 *  identical pairs of marching legs in the same stride (in step), a bold red X over all of it. */
export const fxSign = (p: Pen) => {
  const g = p.g, RED = "#d42f2f";
  p.poly(rrect(14, 14, 686, 506, 40), "#f6ecd2", 0);
  p.poly(rrect(14, 14, 686, 506, 40), null, 14);
  // bridge: deck, stone arch underneath, two piers
  p.poly(rrect(70, 352, 630, 384, 8), "#8a5a3a", 9);
  g.beginPath(); g.moveTo(112, 470); g.quadraticCurveTo(350, 300, 588, 470);
  g.strokeStyle = INK; g.lineWidth = 16; g.lineCap = "round"; g.stroke();
  for (const x of [88, 612]) p.poly(rrect(x - 16, 384, x + 16, 470, 4), "#8a5a3a", 9);
  // four identical soldiers' legs mid-stride: same leg forward on every one = in step
  for (const x of [150, 278, 406, 534]) {
    p.poly(rrect(x - 30, 150, x + 30, 214, 14), "#357650", 9);                  // coat hem
    p.stroke([[x - 8, 210], [x + 34, 262], [x + 46, 338]], 15, INK);           // front leg
    p.stroke([[x + 6, 210], [x - 12, 274], [x - 36, 336]], 15, INK);           // back leg
    p.poly(rrect(x + 30, 330, x + 74, 350, 9), INK, 0);                          // boots point forward
    p.poly(rrect(x - 52, 328, x - 8, 348, 9), INK, 0);
  }
  // big red X
  for (const [a, b] of [[[96, 70], [604, 452]], [[604, 70], [96, 452]]] as [[number, number], [number, number]][]) {
    p.stroke([a, b], 58, "#ffffff");
    p.stroke([a, b], 42, RED);
  }
};

/** soft cartoon cloud on a 600 x 300 canvas */
export const fxCloud = (p: Pen, seed: number) => {
  const blobs: [number, number, number][] = [[150, 190, 80], [250, 150, 105], [360, 160, 95], [450, 195, 70], [300, 210, 90]];
  for (const [x, y, r] of blobs) p.ell(x + ((seed * 37) % 20) - 10, y, r, r * 0.8, "#ffffff", 0);
  p.ell(300, 235, 230, 40, "#ffffff", 0);
};

/** cast shadow on a 128 x 256 canvas: dark soft contact pool at the feet (y 205) and a softer tail that runs up the
 *  canvas = away from the sun, fading with distance; multiply colour (sRGB-encoded linear ratio), white = no change */
export const fxShadow = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 256);
  g.save(); g.filter = "blur(9px)";
  const lg = g.createLinearGradient(0, 205, 0, 22);
  lg.addColorStop(0, mix(col, WHITE, 0.08)); lg.addColorStop(0.55, mix(col, WHITE, 0.3)); lg.addColorStop(1, mix(col, WHITE, 0.85));
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(40, 205); g.bezierCurveTo(36, 120, 46, 50, 64, 30); g.bezierCurveTo(82, 50, 92, 120, 88, 205); g.closePath(); g.fill();
  g.fillStyle = col; g.beginPath(); g.ellipse(64, 205, 30, 17, 0, 0, Math.PI * 2); g.fill();
  g.restore();
};

/** tight contact shadow right under the feet on a 128 x 128 canvas: dark core, short fall-off (multiply colour) */
export const fxContact = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.32, 0.02], [0.5, 0.22], [0.66, 0.58], [0.82, 0.88], [1, 1]] as const) gr.addColorStop(r, mix(col, WHITE, k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};

/** floating wooden plank, side-on, on a 320 x 110 canvas */
export const fxPlank = (p: Pen) => {
  p.poly(rrect(14, 30, 306, 78, 10), "#a8744a", 9);
  p.line([[40, 46], [150, 44], [270, 50]], "#7d5234", 4);
  p.line([[60, 62], [200, 64], [284, 60]], "#7d5234", 4);
  p.dot(36, 54, 5, INK); p.dot(284, 54, 5, INK);
};

/** floating marching drum (no text) on a 260 x 240 canvas: white shell, red hoops, ink zig-zag cord */
export const fxDrum = (p: Pen) => {
  p.poly(rrect(40, 70, 220, 190, 16), "#f1ece0", 9);
  p.poly(rrect(32, 58, 228, 86, 12), "#c9373a", 8);
  p.poly(rrect(32, 176, 228, 204, 12), "#c9373a", 8);
  p.line([[52, 88], [82, 172], [112, 88], [142, 172], [172, 88], [202, 172]], INK, 6);
  p.ell(130, 58, 98, 18, "#f7f3ea", 8);
};

/** soft ground contact blob on a 128 x 128 canvas, multiply colour (sRGB-encoded linear ratio) in the centre */
export const fxBlob = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 128);
  // soft contact shadow: flat core, then a long smooth (roughly gaussian) fall-off to white = no change
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.5, 0.04], [0.64, 0.18], [0.76, 0.42], [0.87, 0.72], [0.95, 0.92], [1, 1]] as const) gr.addColorStop(r, mix(col, WHITE, k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};
