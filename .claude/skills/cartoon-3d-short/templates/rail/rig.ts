// RIG TEST (sandbox): a motion layer over toon.ts bodyFront. Instead of canned hit() curves on a few knobs, every body
// part is a damped spring chasing its own target, the parts start one after another (pelvis -> chest -> hands -> head),
// the feet stay planted while the pelvis shifts its weight, and the eyes move before the head.
// Pure: the springs are simulated from frame 0 to the asked frame, so any frame renders the same on its own.
import { ExprIn, Expr, exprSnaps, FrontOpts, Outfit, frontRig } from "./toon";

type P2 = [number, number];
const FPS = 30, SUB = 4, DT = 1 / (FPS * SUB);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const ease5 = (x: number) => { const u = clamp(x, 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };

// ---------------- the acting script (shared by the old and the new version) ----------------
export type HandPose = "rest" | "palm" | "up" | "point" | "shrug" | "chin" | "hip";
export type Beat = {
  f: number; lean?: number; hipX?: number; sink?: number; head?: number; look?: number; shoulder?: number;
  R?: HandPose; L?: HandPose; expr?: Expr;
};
/** word onsets (frame, length in frames, stress 0..1) */
export type Word = [number, number, number];

// ---------------- springs ----------------
type Sp = { hz: number; z: number };
const spring = (x: number, v: number, tgt: number, p: Sp): [number, number] => {
  const w = 2 * Math.PI * p.hz, a = w * w * (tgt - x) - 2 * p.z * w * v;
  v += a * DT; return [x + v * DT, v];
};
/** per-part feel and start delay (frames after the beat): the pelvis leads, the chest follows, then the hands, then
 *  the head; the eyes go FIRST (negative delay) */
const PART = {
  hipX: { hz: 1.5, z: 0.75, d: 0 }, sink: { hz: 2.4, z: 0.5, d: 0 }, lean: { hz: 2.0, z: 0.48, d: 2 },
  shoulder: { hz: 3.0, z: 0.45, d: 1 }, head: { hz: 1.7, z: 0.4, d: 4 }, hand: { hz: 3.4, z: 0.55, d: 2 },
  look: { hz: 8, z: 0.95, d: -3 },
};
/** the value a channel is told to reach at frame f: the last beat's value, with an anticipation (a small move the
 *  other way over the 4 f before a big change) */
const track = (beats: Beat[], key: keyof Beat, f: number, delay: number, def: number, antic = 0.14, big = 3) => {
  let prev = def, cur = def;
  for (const b of beats) {
    const v = b[key] as number | undefined;
    if (v === undefined) continue;
    const fk = b.f + delay;
    if (f >= fk) { prev = cur; cur = v; continue; }
    if (f >= fk - 4 && Math.abs(v - cur) > big) return cur - antic * (v - cur) * Math.sin((Math.PI * (f - fk + 4)) / 4);
    break;
  }
  void prev;
  return cur;
};
const poseAt = (beats: Beat[], side: "R" | "L", f: number, delay: number): HandPose => {
  let cur: HandPose = "rest";
  for (const b of beats) { if (b[side] === undefined) continue; if (f >= b.f + delay) cur = b[side]!; else break; }
  return cur;
};

/** a hand pose as a point in the BODY frame (no lean, no pelvis shift), design px */
const handPoint = (R: ReturnType<typeof frontRig>, pose: HandPose, side: number): P2 => {
  const S = R.sh(side), u = R.u;
  switch (pose) {
    case "palm": return [S[0] + side * 34 * u, S[1] + 58 * u];
    case "up": return [S[0] + side * 40 * u, S[1] - 52 * u];
    case "point": return [S[0] + side * 108 * u, S[1] - 14 * u];
    case "shrug": return [S[0] + side * 66 * u, S[1] + 24 * u];
    case "chin": return [300 + side * 6 * u, R.chin + 4 * u];
    case "hip": return [300 + side * 1.0 * R.Ta, R.hipY - 0.12 * R.HH];
    default: return R.rest(side);
  }
};

const lidShape = [0.5, 1, 1, 0.5];

export type RigOut = { fo: FrontOpts; debug: { hipX: number; lean: number; head: number } };

/** the NEW version: springs, overlap, planted feet, weight shift, breath, eyes-first, talking beats */
export const rigPose = (f: number, o: Outfit, beats: Beat[], words: Word[], exprSeq: [number, Expr, number?][], seed = 1): RigOut => {
  const R = frontRig(o, seed), u = R.u;
  const S: Record<string, [number, number]> = { hipX: [0, 0], sink: [0, 0], lean: [0, 0], shoulder: [0, 0], head: [0, 0], look: [0, 0] };
  const H: Record<"R" | "L", { p: P2; v: P2 }> = { R: { p: R.rest(1), v: [0, 0] }, L: { p: R.rest(-1), v: [0, 0] } };
  let headVel = 0, prevHead = 0;
  const wordAt = new Map<number, Word>(); for (const w of words) wordAt.set(w[0], w);
  for (let fr = 0; fr <= f; fr++) {
    const t = fr / FPS;
    // ---- targets: the script + the life layer ----
    // weight shift: every 2.5-3.5 s the weight moves to the other leg (pelvis out over it), a small extra sink on the move
    const slot = Math.floor((fr + 40) / 90), wside = slot % 2 ? 1 : -1;
    const shift = 7 * u * wside * (0.7 + 0.3 * hh(slot, seed));
    const tg = {
      hipX: track(beats, "hipX", fr, PART.hipX.d, 0) * u + shift,
      sink: track(beats, "sink", fr, PART.sink.d, 0) * u + 1.2 * u * Math.sin((2 * Math.PI * t) / 3.6),
      // contrapposto: the chest leans back over the feet, against the pelvis shift (balance)
      lean: track(beats, "lean", fr, PART.lean.d, 0) - (Math.atan(S.hipX[0] / R.torsoH) * 180) / Math.PI * 0.9,
      shoulder: track(beats, "shoulder", fr, PART.shoulder.d, 0) * u + 1.8 * u * Math.max(0, Math.sin((2 * Math.PI * t) / 3.6)),
      look: track(beats, "look", fr, PART.look.d, 0, 0, 99),
      head: 0,
    };
    // the head stays near level (it balances against the lean) and tips a little toward where the eyes look
    tg.head = S.lean[0] * 0.45 + track(beats, "head", fr, PART.head.d, 0) + 5 * S.look[0] + 2.2 * Math.sin((2 * Math.PI * t) / 5.3 + seed);
    for (let k = 0; k < SUB; k++) {
      for (const c of ["hipX", "sink", "lean", "shoulder", "look", "head"] as const) S[c] = spring(S[c][0], S[c][1], tg[c], PART[c]);
    }
    // ---- talking: each word kicks the head and the gesturing hand (a beat, damped by the springs, never canned) ----
    const w = wordAt.get(fr);
    if (w) {
      const sgn = hh(fr, 7) < 0.5 ? -1 : 1;
      S.head[1] += sgn * (25 + 35 * w[2]);
      S.sink[1] += (18 + 26 * w[2]) * u;
      S.lean[1] += sgn * 10 * w[2];
    }
    // ---- hands: world-space springs chasing the pose carried by the body (so they trail every body move) ----
    const toWorld = (q: P2): P2 => {
      const a = (S.lean[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cy = R.hipY + S.sink[0];
      const x = q[0] - 300, y = q[1] + S.sink[0] - S.shoulder[0] * 0.6 - cy;
      return [300 + x * c - y * s + S.hipX[0], cy + x * s + y * c];
    };
    for (const side of ["R", "L"] as const) {
      const sd = side === "R" ? 1 : -1, pose = poseAt(beats, side, fr, PART.hand.d), tgt = toWorld(handPoint(R, pose, sd));
      const h = H[side];
      if (w && pose !== "rest" && pose !== "hip") h.v[1] += (30 + 50 * w[2]) * u; // the hand beats down on the word
      for (let k = 0; k < SUB; k++) {
        const [x, vx] = spring(h.p[0], h.v[0], tgt[0], PART.hand);
        const [y, vy] = spring(h.p[1], h.v[1], tgt[1], { hz: PART.hand.hz * 0.82, z: PART.hand.z }); // y slower: hands travel on arcs
        h.p = [x, y]; h.v = [vx, vy];
      }
    }
    headVel = S.head[0] - prevHead; prevHead = S.head[0];
  }
  // ---- face: expression changes lead the body by 4 f; a blink hides each snap, each big eye jump, and a few idle ones ----
  const LEAD = 4;
  let expr: ExprIn = exprSeq[0][1];
  const blinks: number[] = [];
  for (let i = 1; i < exprSeq.length; i++) {
    const [fk, to, dur = 10] = exprSeq[i], mid = fk - LEAD, f0 = mid - dur / 2;
    if (exprSnaps(exprSeq[i - 1][1], to)) blinks.push(Math.round(mid));
    if (f >= f0) { const k = ease5((f - f0) / dur); expr = k >= 1 ? to : { from: expr, to, k }; }
  }
  let lastLook = 0;
  for (const b of beats) if (b.look !== undefined) { if (Math.abs(b.look - lastLook) > 0.25) blinks.push(b.f + PART.look.d); lastLook = b.look; }
  for (let s = 20 + Math.round(30 * hh(seed, 2)); s < f + 10; s += 75 + Math.round(45 * hh(s, seed))) blinks.push(s);
  let lid = 0;
  for (const bf of blinks) { const k = f - (bf - 1); if (k >= 0 && k < 4) lid = Math.max(lid, lidShape[k]); }
  const talk = talkAt(f, words);
  const fo: FrontOpts = {
    mode: "stand", expr, lean: S.lean[0], hipX: S.hipX[0], sink: S.sink[0], shoulder: S.shoulder[0],
    headTilt: S.head[0] - S.lean[0], look: clamp(S.look[0], -1, 1), blink: lid, talk,
    drag: clamp(-2.2 * headVel * 1.1, -6, 6), handR: H.R.p, handL: H.L.p, armRaw: true,
  };
  return { fo, debug: { hipX: S.hipX[0], lean: S.lean[0], head: S.head[0] } };
};

/** mouth opening from the words: a flap per syllable (~4 f), open widest on stressed words */
export const talkAt = (f: number, words: Word[]) => {
  let v = 0;
  for (const [w0, len, st] of words) {
    const n = f - w0;
    if (n < 0 || n >= len) continue;
    const syl = Math.max(1, Math.round(len / 4)), ph = (n / len) * syl;
    v = Math.max(v, (0.45 + 0.55 * st) * Math.sin(Math.PI * (ph - Math.floor(ph))));
  }
  return clamp(v, 0, 1);
};
