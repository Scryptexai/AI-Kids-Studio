// Player acting beats layered on top of the walk/idle pose: reach + tap a block, wave, talking hands, point,
// head drop, nod, double-take, shrug, lift (both hands up to the chest). Every beat has anticipation (a small
// counter-move first), the action with overshoot, a short settle, and an ease back to the idle pose.
// Arms aim at a world point from the shoulder, so a tap lands on the block face (contact, no penetration: the
// reach stops at arm length + hand, the character is placed within reach by its path).
//
// mc-bunker wave 3 adds a layered full-body set (each with anticipation, overshoot and a blend in/out with the idle):
//   swings at a world point: punch (Minecraft arm swing, repeated hits, optional crouch), place, knock, press
//   gestures: idea (finger up), frame (both hands frame a house), hipsHands, armsCrossed, headGrab, panicJump,
//   wipeBrow, brushShoulder, thumbsUp, lookCam (slow deadpan head turn to a point, held), sigh
//   full body: sit (bottom on the floor, legs forward), fallBack (blown back onto the floor, ends sitting)
//   zombie: hit / bump (lunge with the arms forward into a wall or door; contact on f), giveUp (arms and head drop)
//   every mob (mobs/life.ts, not here): spawn, hurt, poof (death roll + poof cloud)
// Layers: later acts override earlier ones per channel by their weight (arms, legs, body), so a thumbs-up on top of a
// sit only takes the right arm. Body offsets (drop, lean, roll, twist, step) move the whole figure about the hips;
// legs are posed against world vertical (a lean does not swing the feet off the floor).
import * as THREE from "three";

export type ActKind = "tap" | "wave" | "talk" | "point" | "headDrop" | "nod" | "doubleTake" | "shrug" | "lift" | "reach" | "pose"
  | "punch" | "place" | "knock" | "press" | "idea" | "frame" | "hipsHands" | "armsCrossed" | "headGrab" | "panicJump"
  | "wipeBrow" | "brushShoulder" | "thumbsUp" | "lookCam" | "sit" | "sigh" | "fallBack"
  | "hit" | "bump" | "giveUp"
  // life beats for every mob (mobs/life.ts, drawn by Mob.tsx): spawn, hurt (non-humanoids also take "hit"), poof
  | "spawn" | "hurt" | "poof"
  // mc-raid Wave A (mobs/raid.ts draws them; formats in projects/mc-raid/FX.md "## Wave A: mobs")
  //   any mob: glowing (outline through walls), tag (name tag), captain (ominous banner on the head), phase (see-through)
  //   illagers: aim, charge, fire (pillager crossbow), swing (vindicator axe / player sword), cast (evoker), cross
  //   ravager: bite, stun, roar, charge; vex: charge (+ phase)
  //   player: hold (an item in a hand), drink, block, clank (shield), swing (sword), bell (aimed use-swing), totem, throw
  //   villager: bed, sitUp, jumpOut, wave; sheep: wool
  | "glowing" | "tag" | "captain" | "phase" | "aim" | "charge" | "fire" | "swing" | "cast" | "cross"
  | "bite" | "stun" | "roar" | "hold" | "drink" | "block" | "clank" | "bell" | "totem" | "throw"
  | "bed" | "sitUp" | "jumpOut" | "wool"
  // itw-02 Wave A (here + mobs/itw2.ts; formats in projects/itw-02/FX.md "## actors")
  //   babies: curl (knees to chest, uncurls with a stretch), kick, wriggle, fists (fist wave), sneeze, scream, armsUp
  //   carriers: carry (high over the head / in the arms / twins, one per arm; Actors.tsx moves the babies onto the hands)
  //   careTap (a small careful tap, can glance off), stomp, tumble (down a stair polyline, mobs/itw2.ts moves the body),
  //   peek (the mob's silhouette glows through blocks), mine / windup (a pickaxe hit / the wind-up top, also first person)
  | "curl" | "kick" | "wriggle" | "fists" | "sneeze" | "scream" | "armsUp" | "carry" | "careTap" | "stomp" | "tumble"
  | "peek" | "mine" | "windup";
/** a full-body pose: arm / leg euler offsets (rad, model space ZYX) and joint bends (rad; elbows - = forearm forward,
 *  knees + = shin back), head [yaw, pitch]. Poses blend by weight (normalised when they overlap). */
export type Joints = {
  r_arm?: [number, number, number]; l_arm?: [number, number, number]; r_leg?: [number, number, number]; l_leg?: [number, number, number];
  r_elbow?: number; l_elbow?: number; r_knee?: number; l_knee?: number; head?: [number, number];
};
export type Act = {
  /** frame of the beat's key moment: tap / punch / knock contact, the pose reached (idea, sit ...), the blast (fallBack) */
  f: number; kind: ActKind;
  /** hold / repeat length in frames (wave, talk, point, headDrop, lift, reach; every wave-3 gesture: held this long) */
  len?: number;
  /** "r" (default) or "l" arm; talk/shrug/lift use both */
  side?: "r" | "l";
  /** world point the arm aims at (tap, point, reach, punch, place, knock, press), the head looks at (lookCam), or the
   *  wall / door face the zombie's hands reach (hit, bump) */
  target?: [number, number, number];
  /** 0..1 strength (default 1); punch / place: > 1 = a bigger wind-up (the last block's big swing) */
  amt?: number;
  /** pose: the joints, reached at f (eased in over `ein` frames, default 6), held `len`, eased out over `eout` (8) */
  joints?: Joints; ein?: number; eout?: number;
  /** repeats (punch, knock, brushShoulder flicks, panicJump hops are set by len / every): hit count, default 1 (knock 3) */
  n?: number;
  /** frames between repeats (punch 8, place 8, knock 5, panicJump hop period 11) */
  every?: number;
  /** punch / place: 0..1 squat while swinging (reach a block on the ground) */
  crouch?: number;
  /** fallBack: blocks blown backward (default 1.1); hit: lunge length when no target (default 0.2) */
  dist?: number;
  /** panicJump: hop height in blocks (default 0.38) */
  hop?: number;
  /** poof: the item id it drops at the poof frame (f + len); mobs/life.ts poofDrops hands it to the items layer */
  drop?: string;
  // ---- mc-raid Wave A fields (mobs/raid.ts)
  /** tag: the name shown (default "Barry" on the mob called barry) */
  text?: string;
  /** hold: the item texture key ("item/iron_sword", "entity/shield/shield_base_nopattern", "item/totem_of_undying" ...) */
  item?: string;
  /** throw: the feet before (from) and where it lands lying on its back (to); bed: the foot-end direction point (to) */
  from?: [number, number, number]; to?: [number, number, number];
  /** throw: the arc's peak over the straight line (blocks, default 1.5) */
  height?: number;
  /** cast: the spell mote colour; wool: the dye colour (both "#rrggbb") */
  color?: string;
  /** tag: text size (1 = the game's) */
  size?: number;
  /** glowing: outline width in pixels at 1080x1920 (default 4) */
  px?: number;
  // ---- itw-02 Wave A fields (actors; see projects/itw-02/FX.md "## actors")
  /** carry: how the baby is held: "high" (sitting on the palms over the head, the default), "arms" (cradled on the
   *  carrier's right side, on both fists, the carrier's face clear), "twins" (one baby on each forearm: baby on the
   *  right, baby2 on the left) */
  carry?: "high" | "arms" | "twins";
  /** carry: the carried mob ids (world mobs) */
  baby?: string; baby2?: string;
  /** careTap: the tap glances off (slides along the face, the hand jerks back) */
  skid?: boolean;
  /** tumble: feet points on the treads (world) the body bounces through; fs = the contact frame per point (default
   *  f + i * every); slam = frames squashed against the last point (a wall); f2 = when it rolls on to `to` over len */
  path?: [number, number, number][]; fs?: number[]; slam?: number; f2?: number;
  /** place: the block's texture name ("cobblestone", "gold_block") shown in the hand from the wind-up to the contact */
  block?: string;
};

const sm = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** 0 -> 1 with a small overshoot past 1 then settle (backOut-like) */
const over = (x: number, s = 1.6) => { const t = Math.max(0, Math.min(1, x)) - 1; return 1 + t * t * ((s + 1) * t + s); };
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI));
const c01 = (x: number) => Math.max(0, Math.min(1, x));
/** eased in over `ein` before t = 0 (with overshoot s > 0), held `len`, eased out over `eout` */
const env = (t: number, ein: number, len: number, eout: number, s = 0) =>
  (t < -ein ? 0 : t < 0 ? (s ? over((t + ein) / ein, s) : sm((t + ein) / ein)) : t <= len ? 1 : 1 - sm((t - len) / eout));

export type ActOffsets = {
  r: [number, number, number]; l: [number, number, number];
  /** head yaw (+ = turn to the mob's left), pitch (+ = down) */
  head: [number, number];
  /** arm weight 0..1: how much of the idle arm swing to keep (1 - weight) */
  rW: number; lW: number;
  /** elbow bends (weighted sums, rad) replacing the idle bend by rW / lW */
  rE: number; lE: number;
  /** leg euler offsets, knee bends, and the leg weight (how much of the walk swing / idle knee to drop) */
  rLeg: [number, number, number]; lLeg: [number, number, number]; rKn: number; lKn: number; legW: number;
  /** whole figure: drop (blocks, + up), lean (rad, + forward, about the hips), roll (rad, + to its left), twist (rad,
   *  + = turns to its left), step along its facing (blocks, + forward) */
  body: { dy: number; pitch: number; roll: number; yaw: number; fwd: number };
  /** the head turned to a point (lookCam, punch): yaw / pitch the head reaches, blended over the idle look by w */
  look: { yaw: number; pitch: number; w: number } | null;
  /** hand digits 0..1: thumb up (thumbsUp), index finger up (idea) */
  digits: { rThumb: number; lThumb: number; rFinger: number; lFinger: number };
};

// ------------------------------------------------------------------ geometry
/** shoulder pivot height above the feet (blocks) for an arm pivot at armY px below the neck */
const HIP = 0.75;
/** arm pivot -> fingertip (px): the arm box runs -2..10, the elbow at 4 */
const UPPER = 4, FORE = 6;

type Body = ActOffsets["body"];
/** mob-local (feet origin, y up, forward +z) -> world, through the body offsets (same nesting as Mob.tsx) */
const bodyMatrix = (at: THREE.Vector3, yawRad: number, b: Body) => {
  const yaw = yawRad + b.yaw;
  const fwd = new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad)).multiplyScalar(b.fwd);
  const outer = new THREE.Matrix4().compose(at.clone().add(fwd).add(new THREE.Vector3(0, b.dy, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
  const tilt = new THREE.Matrix4().makeTranslation(0, HIP, 0)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(b.pitch, 0, b.roll)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -HIP, 0));
  return outer.multiply(tilt);
};

/** model-space arm euler [rx, ry, 0] + elbow that put the fingertip of an arm pivoting at `shoulderW` on world point
 *  `tgt` (torso frame `m`). Out of reach: the arm points straight at it. Too close: the elbow bends so the fingertip
 *  stops ON the point instead of going through. */
const aimReach = (m: THREE.Matrix4, shoulderW: THREE.Vector3, tgt: THREE.Vector3): [number, number, number, number] => {
  const inv = new THREE.Matrix4().extractRotation(m).invert();
  const d = tgt.clone().sub(shoulderW).applyMatrix4(inv);     // torso-local: forward +z, up +y, left +x
  const D = d.length() * 16;
  const pitch = Math.atan2(Math.hypot(d.x, d.z), -d.y);       // 0 = hanging, pi/2 = level forward
  const yaw = Math.atan2(-d.x, d.z);                          // model ry: + turns the arm to the mob's RIGHT
  let e = 0, beta = 0;
  const L = UPPER + FORE;
  if (D < L - 0.05) {
    const ce = Math.max(-1, Math.min(1, (D * D - UPPER * UPPER - FORE * FORE) / (2 * UPPER * FORE)));
    const ang = Math.acos(ce);                                 // forearm angle off the upper arm line
    e = -ang;
    beta = Math.asin(Math.min(1, (FORE * Math.sin(ang)) / Math.max(D, 1e-3)));
  }
  return [-(pitch - beta), yaw, 0, e];
};

// ------------------------------------------------------------------ authored poses (model space, right arm; FK-checked
// against the head / body / legs boxes: no arm through the body). A4 = [rx, ry, rz, elbow].
type A4 = [number, number, number, number];
const mir = (a: A4): A4 => [a[0], -a[1], -a[2], a[3]];
const mix4 = (a: A4, b: A4, k: number): A4 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
export const POSES = {
  /** hand on the hip, elbow out */
  hips: [0.2, -1.5708, 1.05, -1.75] as A4,
  /** right forearm across the chest (under), left over it */
  crossR: [-1.38, -0.68, 1.6, -1.53] as A4, crossL: [-1.35, 0.56, -1.56, -1.55] as A4,
  /** hands on the sides of the head, elbows wide */
  grab: [-0.24, 1.34, 1.6, -1.74] as A4,
  /** arm up beside the head, a slight bend (the finger points up) */
  idea: [-2.91, 0.09, -0.06, -0.25] as A4,
  /** both hands up in front at face height (framing a house) */
  frame: [-2.09, -0.35, -0.46, -0.16] as A4,
  /** fist forward at the chest, thumb up */
  thumb: [-0.4, -0.11, 0.11, -1.37] as A4,
  /** seated: hands resting over the thighs */
  sit: [-0.94, -0.31, 0.41, 0] as A4,
  /** wipe: hand out at the temple -> across the brow */
  wipeA: [-1.62, 0.69, 1.16, -0.6] as A4, wipeB: [-1.53, 0.28, 1.19, -1.01] as A4,
  /** brush: hand in front of the far shoulder */
  brush: [-1.45, -0.08, 1.65, -1.65] as A4,
};

/** a leg against world vertical: [rx (- = forward), ry, rz, knee] */
type L4 = [number, number, number, number];
type Ch = "r" | "l" | "rl" | "ll";

/** carry: the hands' hold points per mode, torso-local (x = its left, y up from the feet, z forward; blocks) */
const CARRY: Record<"high" | "arms" | "twins", { r: [number, number, number]; l: [number, number, number] }> = {
  high: { r: [-0.15, 2.04, 0.06], l: [0.15, 2.04, 0.06] },
  arms: { r: [-0.42, 0.92, 0.36], l: [-0.08, 0.95, 0.4] },
  twins: { r: [-0.4, 0.82, 0.34], l: [0.4, 0.82, 0.34] },
};

/** tumble timing: the contact frame per path point, the end of the slam, the roll-through start and end */
export const tumbleTimes = (a: Act) => {
  const n = a.path?.length ?? 1, fs = Array.from({ length: n }, (_, i) => a.fs?.[i] ?? a.f + i * (a.every ?? 7));
  const slamEnd = fs[n - 1] + (a.slam ?? 0), rollStart = a.to ? Math.max(slamEnd, a.f2 ?? slamEnd) : slamEnd;
  return { fs, slamEnd, rollStart, rollEnd: a.to ? rollStart + (a.len ?? 12) : slamEnd };
};
const tumbleEnd = (a: Act) => tumbleTimes(a).rollEnd;

export const actOffsets = (acts: Act[] | undefined, frame: number, at: THREE.Vector3, yawRad: number, armY: number, zombie = false): ActOffsets | null => {
  if (!acts?.length) return null;
  const o: ActOffsets = { r: [0, 0, 0], l: [0, 0, 0], head: [0, 0], rW: 0, lW: 0, rE: 0, lE: 0, rLeg: [0, 0, 0], lLeg: [0, 0, 0], rKn: 0, lKn: 0, legW: 0,
    body: { dy: 0, pitch: 0, roll: 0, yaw: 0, fwd: 0 }, look: null, digits: { rThumb: 0, lThumb: 0, rFinger: 0, lFinger: 0 } };
  const add = (side: "r" | "l", v: [number, number, number], w: number, elbow = 0) => {
    const a = o[side]; a[0] += v[0] * w; a[1] += v[1] * w; a[2] += v[2] * w;
    if (side === "r") { o.rW = Math.max(o.rW, w); o.rE += elbow * w; } else { o.lW = Math.max(o.lW, w); o.lE += elbow * w; }
  };
  // ---------------------------------------------------------------- layered channels (wave 3)
  const ch: Record<Ch, number[]> = { r: [0, 0, 0, 0], l: [0, 0, 0, 0], rl: [0, 0, 0, 0], ll: [0, 0, 0, 0] };
  const chW: Record<Ch, number> = { r: 0, l: 0, rl: 0, ll: 0 };
  /** override a channel by weight w (later acts win) */
  const set = (c: Ch, v: number[], w: number) => {
    if (w <= 0) return;
    const k = Math.min(1, w);
    for (let i = 0; i < 4; i++) ch[c][i] += (v[i] - ch[c][i]) * k;
    chW[c] = 1 - (1 - chW[c]) * (1 - k);
  };
  /** add on top of a channel (gesture wiggles), at weight w */
  const plus = (c: Ch, v: number[], w: number) => { if (w <= 0) return; for (let i = 0; i < 4; i++) ch[c][i] += v[i] * w; chW[c] = Math.max(chW[c], Math.min(1, w)); };
  const B = o.body;
  const body = (dy: number, pitch: number, roll = 0, yaw = 0, fwd = 0) => { B.dy += dy; B.pitch += pitch; B.roll += roll; B.yaw += yaw; B.fwd += fwd; };
  /** a squat with the feet planted: thighs forward by a, knees 2a, hips drop 0.75 (1 - cos a); weight k */
  const squat = (a: number, k: number) => {
    if (k <= 0) return;
    set("rl", [-a, 0.05, 0.04, 2 * a], Math.min(1, k * 3)); set("ll", [-a, -0.05, -0.04, 2 * a], Math.min(1, k * 3));
    body(-HIP * (1 - Math.cos(a)) * Math.min(1, k * 3), 0);
  };
  /** the seated pose (k = 0 standing .. 1 sitting) through a squat on the way down */
  const SIT_LEGS = -Math.PI / 2;
  const sitPose = (k: number, w: number) => {
    if (w <= 0) return;
    const a1 = sm(k / 0.55), a2 = sm((k - 0.55) / 0.45);
    // stage 1: squat down (thighs forward, knees bent); stage 2: legs swing out forward, bottom to the floor
    const thigh = -1.05 * a1 + (SIT_LEGS + 1.05) * a2, knee = 2.1 * a1 * (1 - a2);
    const dy = -HIP * (1 - Math.cos(1.05 * a1)) * (1 - a2) + -0.625 * a2;
    set("rl", [thigh, 0, 0.03, knee], w); set("ll", [thigh, 0, -0.03, knee], w);
    // splay the legs a little once out
    plus("rl", [0, 0.18 * a2, 0, 0], w); plus("ll", [0, -0.18 * a2, 0, 0], w);
    body(dy * w, (0.32 * a1 * (1 - a2) + 0.06 * a2) * w);
    set("r", mix4([0, 0, 0, 0], POSES.sit, a2), w * (0.4 + 0.6 * a2)); set("l", mir(mix4([0, 0, 0, 0], POSES.sit, a2)), w * (0.4 + 0.6 * a2));
  };
  const sorted = [...acts].sort((a, b) => a.f - b.f);
  /** "hold": the ITEM arm pose weight per hand (mc-raid) */
  const holdK = { r: 0, l: 0 };
  // pass 1: everything but the aimed swings
  for (const a of sorted) {
    const t = frame - a.f, k = a.amt ?? 1, side = a.side ?? "r", len = a.len ?? 0;
    const S: Ch = side, O: Ch = side === "r" ? "l" : "r", pose = (p: A4): A4 => (side === "r" ? p : mir(p));
    if (zombie) {
      if (a.kind === "hit" || a.kind === "bump") {
        if (t < -10 || t > len + 16) continue;
        const soft = a.kind === "bump" ? 0.55 : 1;
        // lunge so the fingertips land on the target face (arms level, 0.62 forward of the shoulder + the lean)
        let L = (a.dist ?? 0.2) * k;
        if (a.target) {
          const fw = new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));
          L = Math.max(0, Math.min(0.7, new THREE.Vector3(...a.target).sub(at).dot(fw) - (0.62 + 0.625 * Math.sin(0.16 * soft))));
        }
        let up = 0, p = 0, f = 0, head = 0;
        if (t < -3) { const w = sm((t + 10) / 7); up = 0.5 * soft * w; p = -0.1 * soft * w; f = -0.08 * soft * w; }
        else if (t < 0) { const s = Math.pow((t + 3) / 3, 2); up = 0.5 * soft * (1 - s); p = -0.1 * soft + (0.26 * soft) * s; f = -0.08 * soft + (L + 0.08 * soft) * s; }
        else if (t < 4) { const r = bump(t / 4); p = 0.16 * soft - 0.04 * r; f = L - 0.05 * r; head = 0.14 * soft * r; up = -0.06 * r; }
        else { const s = 1 - sm((t - 4 - len) / 10); p = 0.16 * soft * s; f = L * s; }
        add("r", [-up, 0, 0], 1); add("l", [-up, 0, 0], 1); o.rW = o.lW = 0;
        body(0, p, 0, 0, f); o.head[1] += head;
      } else if (a.kind === "giveUp") {
        const w = env(t, 10, len, 12);
        if (w <= 0) continue;
        add("r", [1.15 * w, 0, -0.1 * w], 1); add("l", [1.15 * w, 0, 0.1 * w], 1); o.rW = o.lW = 0;
        o.head[1] += 0.35 * w; o.head[0] += 0.1 * Math.sin(t * 0.15) * w; body(-0.01 * w, 0.07 * w);
      }
      continue;
    }
    switch (a.kind) {
      case "idea": {
        // a dip (arm and head down), then the arm pops up with the finger, head lifts; a small wag while held
        const w = env(t, 6, len || 18, 10, 1.6) * k, dip = bump((t + 12) / 7) * k;
        set(S, [0.3, 0, 0, -0.5], dip);
        set(S, pose([POSES.idea[0] + 0.05 * Math.sin(t * 0.5) * (t > 0 ? 1 : 0), POSES.idea[1], POSES.idea[2], POSES.idea[3]]), w);
        o.head[1] += -0.3 * w + 0.15 * dip; body(0.012 * w - 0.02 * dip, -0.04 * w + 0.05 * dip);
        o.digits[side === "r" ? "rFinger" : "lFinger"] = Math.max(o.digits.rFinger, c01(w));
        break;
      }
      case "frame": {
        // arms swing back and the body dips, then both hands come up in front (overshoot); looks through them, swaying
        const w = env(t, 7, len || 20, 10, 1.3) * k, dip = bump((t + 13) / 6) * k;
        set("r", [0.35, 0, 0.1, -0.3], dip); set("l", [0.35, 0, -0.1, -0.3], dip);
        const sway = t > 0 ? Math.sin(t * 0.16) : 0;
        set("r", [POSES.frame[0] + 0.05 * sway, POSES.frame[1], POSES.frame[2], POSES.frame[3]], w);
        set("l", mir([POSES.frame[0] - 0.05 * sway, POSES.frame[1], POSES.frame[2], POSES.frame[3]]), w);
        body(-0.025 * dip, 0.05 * dip - 0.03 * w, 0.03 * sway * w, 0.06 * sway * w);
        o.head[1] += -0.12 * w; o.head[0] += 0.08 * sway * w;
        break;
      }
      case "hipsHands": {
        // shoulders drop, then hands to the hips with a proud lift: chest out, chin up, a small bob
        const w = env(t, 6, len || 24, 10, 1.4) * k, dip = bump((t + 11) / 6) * k;
        set("r", POSES.hips, w); set("l", mir(POSES.hips), w);
        const bob = t > 0 ? Math.sin(t * 0.22) * 0.006 : 0;
        body(-0.025 * dip + (0.012 + bob) * w, -0.08 * w); o.head[1] += -0.16 * w + 0.08 * dip;
        break;
      }
      case "armsCrossed": {
        // arms swing out a touch, then fold; weight shifts while held
        const w = env(t, 7, len || 24, 10, 1.2) * k, out = bump((t + 12) / 6) * k;
        set("r", [0, 0, 0.35, -0.3], out); set("l", [0, 0, -0.35, -0.3], out);
        set("r", POSES.crossR, w); set("l", POSES.crossL, w);
        const sh = t > 0 ? Math.sin(t * 0.08) : 0;
        body(0.006 * w, -0.03 * w, 0.025 * sh * w); o.head[0] += 0.06 * sh * w; o.head[1] += -0.05 * w;
        break;
      }
      case "headGrab": {
        // a flinch (2 f), hands snap to the head (overshoot), head shakes in panic, settling
        const w = env(t, 4, len || 18, 10, 2.0) * k, fl = bump((t + 7) / 4) * k;
        set("r", POSES.grab, w); set("l", mir(POSES.grab), w);
        const shake = t > 0 ? Math.sin(t * 0.75) * Math.exp(-t / 22) : 0;
        o.head[0] += 0.22 * shake * w; o.head[1] += 0.1 * fl - 0.08 * w;
        body(-0.03 * fl + 0.01 * w, 0.08 * fl - 0.05 * w, 0.03 * shake * w);
        break;
      }
      case "panicJump": {
        // hops (crouch, air, land squash) with both arms up waving, head looking round
        const P = a.every ?? 11, H = a.hop ?? 0.38, w = env(t, 5, len, 8) * k;
        if (w <= 0) break;
        const live = t >= 0 && t <= len, ph = live ? (t % P) / P : 0;
        let dy = 0, kn = 0, th = 0;
        if (live) {
          if (ph < 0.22) { const c = bump(ph / 0.44); kn = 0.75 * c; th = -0.38 * c; dy = -HIP * (1 - Math.cos(0.38 * c)); }
          else if (ph < 0.88) { const air = (ph - 0.22) / 0.66; dy = H * Math.sin(air * Math.PI); kn = 0.45 * Math.sin(air * Math.PI); th = -0.2 * Math.sin(air * Math.PI); }
          else { const c = bump((ph - 0.88) / 0.24); kn = 0.55 * c; th = -0.28 * c; dy = -HIP * (1 - Math.cos(0.28 * c)); }
        }
        set("rl", [th, 0.04, 0.05, kn], w); set("ll", [th, -0.04, -0.05, kn], w);
        const wv = Math.sin(t * 0.85);
        set("r", [-2.75 + 0.35 * wv, 0.05, 0.42 + 0.28 * wv, -0.35], w);
        set("l", mir([-2.75 - 0.35 * wv, 0.05, 0.42 - 0.28 * wv, -0.35]), w);
        body(dy * w, -0.04 * w, 0.04 * Math.sin(t * 0.4) * w);
        o.head[1] += -0.18 * w; o.head[0] += 0.32 * Math.sin(t * 0.33) * w;
        break;
      }
      case "wipeBrow": {
        // hand up to the temple (shoulders lift), across the brow (head dips into it), a flick out, then a relieved drop
        const W = len || 7;
        const w = env(t, 7, W + 5, 9) * k;
        if (w <= 0) break;
        const sw = sm(t / W), fl = sm((t - W) / 5);
        const arm = mix4(mix4(POSES.wipeA, POSES.wipeB, sw), [-0.7, 0, 0.6, -0.15], fl);
        set(S, pose(arm), w);
        const relief = bump((t - W) / 14);
        o.head[1] += 0.16 * sw * (1 - fl) * w + 0.1 * relief; o.head[0] += (side === "r" ? -1 : 1) * 0.18 * (1 - fl) * w;
        body(0.012 * (1 - sw) * w - 0.025 * relief, 0.05 * relief, (side === "r" ? -1 : 1) * 0.03 * (1 - fl) * w);
        break;
      }
      case "brushShoulder": {
        // the hand comes across to the far shoulder, flicks n times (default 2, every 6), chin up after
        const n = a.n ?? 2, P = a.every ?? 6, end = (n - 1) * P + 4, w = env(t, 6, Math.max(len, end), 9, 1.3) * k;
        if (w <= 0) break;
        let flick = 0;
        for (let i = 0; i < n; i++) flick += bump((t - i * P + 1) / 4);
        const p = pose(POSES.brush);
        set(S, [p[0] - 0.18 * flick, p[1], p[2] + (side === "r" ? 1 : -1) * 0.12 * flick, p[3] + 0.4 * flick], w);
        const smug = sm((t - end) / 6);
        o.head[0] += (side === "r" ? 1 : -1) * 0.4 * (1 - smug) * w; o.head[1] += (0.18 * (1 - smug) - 0.16 * smug) * w;
        body(0, -0.03 * smug * w, (side === "r" ? 1 : -1) * 0.03 * (1 - smug) * w);
        break;
      }
      case "thumbsUp": {
        // elbow cocks back, the fist pops forward (overshoot) with the thumb, a small pump, a nod
        const w = env(t, 5, len || 20, 9, 2.0) * k, cock = bump((t + 10) / 6) * k;
        set(S, pose([0.2, 0, 0.1, -2.0]), cock);
        const pump = t > 0 ? 0.05 * Math.sin(t * 0.45) * Math.exp(-t / 25) : 0;
        set(S, pose([POSES.thumb[0] + pump, POSES.thumb[1], POSES.thumb[2], POSES.thumb[3]]), w);
        o.digits[side === "r" ? "rThumb" : "lThumb"] = Math.max(o.digits[side === "r" ? "rThumb" : "lThumb"], c01(w));
        o.head[1] += 0.1 * bump(t / 8) * k - 0.05 * w; body(0, 0.04 * w);
        break;
      }
      case "lookCam": {
        // a slow head turn to the point (the lens), a gentle overshoot, held dead still; the body follows a quarter
        if (!a.target) break;
        const ein = a.ein ?? 14, w = env(t, ein, len || 30, a.eout ?? 12, 0.7) * k;
        if (w <= 0) break;
        const neck = new THREE.Vector3(0, 1.5, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad).add(at);
        const d = new THREE.Vector3(...a.target).sub(neck).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yawRad);
        const yaw = Math.atan2(d.x, d.z), pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
        const bodyYaw = 0.25 * yaw;
        body(0, 0, 0, bodyYaw * w);
        o.look = { yaw: yaw - bodyYaw, pitch, w: Math.min(1, w) };
        break;
      }
      case "sit": {
        // down through a squat (ein, default 14 f) to the floor, a small settle; up again after len if eout is given
        const ein = a.ein ?? 14;
        if (t < -ein) break;
        const up = a.eout !== undefined && len ? sm((t - len) / a.eout) : 0;
        let kk = t < 0 ? sm((t + ein) / ein) : 1;
        kk *= 1 - up;
        const settle = t >= 0 && t < 6 ? 0.02 * bump(t / 6) : 0;
        sitPose(kk, k);
        body(-settle * k, 0.04 * bump(t / 8) * k);
        // seated breathing
        if (t > 0) body(0.004 * Math.sin(t * 0.18) * kk, 0.01 * Math.sin(t * 0.18) * kk);
        break;
      }
      case "sigh": {
        // inhale (shoulders up, chin up), exhale (slump, head droops) and stay drooped for len, then recover
        const t0 = c01((t + 10) / 10), t1 = c01(t / 9), back = a.eout !== undefined ? sm((t - len) / a.eout) : 0;
        if (t < -10) break;
        const inh = sm(t0) * (1 - sm(t1)), exh = sm(t1) * (1 - back);
        body((0.022 * inh - 0.022 * exh) * k, (-0.05 * inh + 0.11 * exh) * k);
        o.head[1] += (-0.14 * inh + 0.45 * exh) * k;
        plus("r", [0, 0, 0.08 * inh, 0], k * (inh + exh) * 0.999); plus("l", [0, 0, -0.08 * inh, 0], k * (inh + exh) * 0.999);
        break;
      }
      case "fallBack": {
        // the blast: a 2 f flinch, blown back off the feet (legs up, arms flung up), the bottom hits the floor, a rock
        // back and forward (overshoot), then sitting, dazed (head wobble)
        const A = 9, dist = a.dist ?? 1.1;
        if (t < -2) break;
        if (t < 0) { const fl = bump((t + 2) / 3); o.head[1] += 0.1 * fl; set("r", [-0.3, 0, -0.2, -0.6], fl); set("l", [-0.3, 0, 0.2, -0.6], fl); break; }
        if (t < A) {
          const q = t / A, qe = 1 - Math.pow(1 - q, 2);
          body(0.42 * Math.sin(Math.PI * q) - 0.625 * sm(q), -0.6 * qe, 0, 0, -dist * qe);
          set("rl", [-1.9 * qe, 0.15 * qe, 0, 0.35 * Math.sin(Math.PI * q)], 1); set("ll", [-1.75 * qe, -0.15 * qe, 0, 0.5 * Math.sin(Math.PI * q)], 1);
          set("r", [-2.5, 0.1, 0.55, -0.3], sm(q * 3)); set("l", mir([-2.5, 0.1, 0.55, -0.3]), sm(q * 3));
          o.head[1] += 0.35 * bump(q * 1.2);
          break;
        }
        const u = t - A, land = c01(u / 7);
        // rock: back past upright, forward slump overshoot, settle at the sit lean
        const rock = u < 7 ? -0.6 + 0.78 * over(land, 2.2) : 0.06 + 0.12 * Math.exp(-(u - 7) / 5) * Math.cos((u - 7) * 0.5);
        body(-0.625 + 0.03 * bump(u / 5), rock, 0, 0, -dist);
        const legs = -1.9 + (SIT_LEGS + 1.9) * over(land, 1.8);
        set("rl", [legs, 0.18, 0, 0], 1); set("ll", [legs + 0.15 * (1 - land), -0.18, 0, 0], 1);
        set("r", mix4([-2.5, 0.1, 0.55, -0.3], POSES.sit, sm(land)), 1); set("l", mir(mix4([-2.5, 0.1, 0.55, -0.3], POSES.sit, sm(land))), 1);
        const daze = Math.exp(-u / 40);
        o.head[0] += 0.14 * Math.sin(u * 0.2) * daze; o.head[1] += 0.08 * Math.sin(u * 0.13) * daze;
        if (u > 10) body(0.004 * Math.sin(u * 0.18), 0.01 * Math.sin(u * 0.18));
        void len;
        break;
      }
      // ---------------------------------------------------------------- mc-raid Wave A player acts
      case "hold": {
        // an item in the hand: the game's ITEM arm pose (arm a little forward), on top of the idle / walk swing
        if (!a.item) break;
        const sd = a.side ?? (a.item.includes("shield") ? "l" : "r");
        const w = env(t, a.ein ?? 4, a.len ?? 1e9, a.eout ?? 4) * k;
        if (w > 0) holdK[sd] = Math.max(holdK[sd], w);
        break;
      }
      case "block": case "clank": {
        // the shield up in front (the game's BLOCK pose: arm forward 54 deg, turned in 30 deg); a clank kicks it back
        const sd = a.side ?? "l", cl = a.kind === "clank";
        const w = env(t, a.ein ?? 4, cl ? 6 : len || 20, a.eout ?? 8) * k;
        if (w <= 0) break;
        const kick = cl && t >= 0 ? Math.exp(-t / 3) * Math.min(1, t + 0.5) : 0;
        const p: A4 = [-0.9425 + 0.35 * kick + 0.02 * Math.sin(t * 0.3), -0.5236, 0, -0.25 - 0.2 * kick];
        set(sd, sd === "r" ? p : mir(p), w);
        if (cl) { body(0, -0.06 * kick, 0, 0, -0.05 * kick); o.head[1] += -0.06 * kick; }
        // braced behind it: a little crouch and lean in
        body(-0.02 * w, 0.06 * w);
        break;
      }
      case "swing": {
        // the game's attack swing (6 ticks = 9 f, the blade most forward at f), n swings every 12 f; arm held up after
        const n = a.n ?? 1, P = a.every ?? 12;
        const w = env(t, 6, (n - 1) * P + 6, 8) * k;
        if (w <= 0) break;
        let at = -1;
        for (let i = 0; i < n; i++) { const u = (t - i * P + 4.5) / 9; if (u >= 0 && u < 1) at = u; }
        const sg = side === "r" ? 1 : -1;
        let p: A4 = [-0.31, 0, 0, -0.2];
        if (at >= 0) {
          const f1 = 1 - Math.pow(1 - at, 4), bodyY = Math.sin(Math.sqrt(at) * Math.PI * 2) * 0.2;
          p = [-0.31 - (Math.sin(f1 * Math.PI) * 1.2 + Math.sin(at * Math.PI) * 0.7 * 0.75), bodyY * 2, -Math.sin(at * Math.PI) * 0.4, -0.2 - 0.3 * Math.sin(at * Math.PI)];
          body(0, 0.05 * Math.sin(at * Math.PI), 0, -sg * bodyY);
        }
        set(S, pose(p), w);
        break;
      }
      case "totem": {
        // the totem raised high (overshoot), a little shake while it works, the head looks up at it
        const sd = a.side ?? "l", w = env(t, 8, len || 30, 8, 1.8) * k;
        if (w <= 0) break;
        const sh = t > 0 ? 0.05 * Math.sin(t * 0.9) * Math.exp(-t / 20) : 0;
        const p: A4 = [-2.95 + sh, 0.05, -0.12, -0.1];
        set(sd, sd === "r" ? p : mir(p), w);
        o.head[1] += -0.3 * w; o.head[0] += (sd === "l" ? -0.15 : 0.15) * w;
        body(0.02 * w, -0.05 * w, (sd === "l" ? -0.03 : 0.03) * w);
        break;
      }
      case "throw": {
        // flung through the air (arms and legs flailing), then flat on its back, arms out, dazed (mobs/raid.ts moves the body)
        if (!a.from || !a.to || t < 0) break;
        const L = a.len ?? 16, land = t - L, lk = sm(land / 6);
        const fa = (ph: number): A4 => [-2.5 + 0.45 * Math.sin(t * 0.9 + ph), 0, 0.55 + 0.3 * Math.sin(t * 0.7 + ph), -0.35];
        set("r", mix4(fa(0), [-0.1, 0, 1.25, -0.15], lk), 1); set("l", mir(mix4(fa(1.7), [-0.25, 0, 1.0, -0.2], lk)), 1);
        const lg = (ph: number) => [(-0.55 + 0.5 * Math.sin(t * 0.8 + ph)) * (1 - lk), (ph ? -0.12 : 0.12) * lk, ph ? -0.05 : 0.05, (0.5 + 0.3 * Math.sin(t * 0.8 + ph)) * (1 - lk) + 0.05 * lk];
        set("rl", lg(0), 1); set("ll", lg(2.2), 1);
        if (land > 0) { const daze = Math.exp(-land / 45); o.head[0] += 0.25 * Math.sin(land * 0.18) * daze; o.head[1] += -0.1 * daze; }
        else o.head[1] += -0.25;
        break;
      }
      case "punch": case "place": {
        // the squat for a low target (pass 1); the swing itself is aimed in pass 2
        const n = a.n ?? 1, P = a.every ?? 8, c = a.crouch ?? 0;
        if (c > 0) { const wc = env(t, 10, (n - 1) * P + len, 10); squat(1.05 * c * wc, wc); body(0, 0.28 * c * wc); }
        break;
      }
      default: break;
    }
    void O;
  }
  // itw-02 Wave A: baby beats, stomp, tumble, the carry's reach squat (after pass 1, so they layer over a sit)
  if (!zombie) for (const a of sorted) {
    const t = frame - a.f, k = a.amt ?? 1, len = a.len ?? 0;
    switch (a.kind) {
      case "curl": {
        // knees to the chest, arms hugging them, back rounded, head tucked; held len, then uncurls over eout (default
        // 16) into a big stretch (arms up and out, back arched, head back) that overshoots and settles
        const ein = a.ein ?? 0, eout = a.eout ?? 16;
        const w = (ein > 0 ? env(t, ein, len, eout) : t <= len ? 1 : 1 - sm((t - len) / eout)) * k;
        const st = bump(c01((t - len) / (eout + 12))) * k;
        if (w <= 0.001 && st <= 0.001) break;
        const br = Math.sin((frame + 3) * 0.21) * 0.03;
        set("rl", [-2.25 - br, 0.12, 0.06, 2.25 + br], w); set("ll", [-2.25 - br, -0.12, -0.06, 2.25 + br], w);
        set("r", [-0.55, -0.45, 0.1, -1.35], w); set("l", mir([-0.55, -0.45, 0.1, -1.35]), w);
        body(0.01 * w, (0.42 + br) * w); o.head[1] += 0.42 * w;
        // the stretch: arms up and out, legs pushed long, chin up
        set("r", [-2.55, 0.1, 0.55, -0.15], st); set("l", mir([-2.55, 0.1, 0.55, -0.15]), st);
        plus("rl", [-0.2 * st, 0, 0.1 * st, 0], st); plus("ll", [-0.2 * st, 0, -0.1 * st, 0], st);
        body(0.01 * st, -0.12 * st); o.head[1] += -0.3 * st;
        break;
      }
      case "kick": {
        // legs cycling, alternate (every = one kick each, default 8 f); the arms bounce with them
        const P = a.every ?? 8, w = env(t, 4, len || 24, 6) * k;
        if (w <= 0) break;
        const sR = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / P), sL = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / P + Math.PI);
        plus("rl", [-0.55 * sR, 0, 0.04, 0.9 * (1 - sR)], w); plus("ll", [-0.55 * sL, 0, -0.04, 0.9 * (1 - sL)], w);
        plus("r", [-0.25 * sL, 0, 0.12 * sL, -0.3 * sL], w); plus("l", [-0.25 * sR, 0, -0.12 * sR, -0.3 * sR], w);
        body(0.006 * Math.sin((4 * Math.PI * t) / P) * w, 0);
        break;
      }
      case "wriggle": {
        // the whole body squirms: roll and twist, head shakes, arms and legs flap out of phase
        const w = env(t, 5, len || 24, 8) * k;
        if (w <= 0) break;
        const a1 = Math.sin(t * 0.62), a2 = Math.sin(t * 0.47 + 1.3);
        body(0.008 * Math.abs(a2) * w, 0.04 * a2 * w, 0.12 * a1 * w, 0.1 * a2 * w);
        o.head[0] += 0.2 * Math.sin(t * 0.55 + 0.7) * w; o.head[1] += -0.08 * w;
        plus("r", [0.3 * a1, 0, 0.25 + 0.2 * a2, -0.3], w); plus("l", [-0.3 * a1, 0, -0.25 - 0.2 * a2, -0.3], w);
        plus("rl", [-0.3 * Math.max(0, a2), 0, 0.05, 0.4 * Math.max(0, -a2)], w); plus("ll", [-0.3 * Math.max(0, -a2), 0, -0.05, 0.4 * Math.max(0, a2)], w);
        break;
      }
      case "fists": {
        // a dip, then both fists come up in front and pump alternately (every, default 10 f), overshoot
        const P = a.every ?? 10, w = env(t, 6, len || 24, 8, 1.6) * k, dip = bump((t + 11) / 6) * k;
        if (w <= 0 && dip <= 0) break;
        set("r", [0.25, 0, 0.1, -0.4], dip); set("l", mir([0.25, 0, 0.1, -0.4]), dip);
        const pr = Math.sin((2 * Math.PI * t) / P), pl = Math.sin((2 * Math.PI * t) / P + Math.PI);
        set("r", [-1.95 - 0.4 * pr, -0.3, 0.1, -1.15 + 0.35 * pr], w); set("l", mir([-1.95 - 0.4 * pl, -0.3, 0.1, -1.15 + 0.35 * pl]), w);
        body(0.006 * Math.abs(pr) * w - 0.01 * dip, 0.03 * dip - 0.03 * w); o.head[1] += -0.12 * w;
        break;
      }
      case "scream": {
        // the inhale (shoulders up, head back, lean back) then the scream: fists up over the head shaking hard, head
        // thrown back, the whole body trembling; eases out after len
        const w = env(t, 4, len || 24, 8, 2.0) * k, inh = c01((t + 10) / 8) * (1 - sm(t / 3)) * k;
        if (w <= 0 && inh <= 0) break;
        set("r", [-0.5, 0, 0.25, -1.2], inh); set("l", mir([-0.5, 0, 0.25, -1.2]), inh);
        body(0.01 * inh, -0.06 * inh); o.head[1] += -0.15 * inh;
        const sh = Math.sin(t * 2.1), sh2 = Math.sin(t * 1.7 + 1);
        set("r", [-2.8 + 0.12 * sh, 0.1, 0.4 + 0.1 * sh2, -0.65 + 0.15 * sh], w); set("l", mir([-2.8 + 0.12 * sh2, 0.1, 0.4 + 0.1 * sh, -0.65 + 0.15 * sh2]), w);
        body(0.008 * sh * w, -0.1 * w, 0.025 * sh2 * w); o.head[1] += -0.4 * w; o.head[0] += 0.06 * sh2 * w;
        break;
      }
      case "armsUp": {
        // both arms up, reaching (to be picked up), hands opening and closing, head tipped back, overshoot
        const w = env(t, 6, len || 24, 8, 1.8) * k;
        if (w <= 0) break;
        const g = Math.sin(t * 0.5), g2 = Math.sin(t * 0.5 + 1.6);
        set("r", [-2.7 + 0.12 * g, 0.05, 0.2, -0.2 - 0.15 * g], w); set("l", mir([-2.7 + 0.12 * g2, 0.05, 0.2, -0.2 - 0.15 * g2]), w);
        body(0.008 * Math.abs(g) * w, -0.05 * w); o.head[1] += -0.32 * w;
        break;
      }
      case "sneeze": {
        // the wind-up (head and body tip back twice, shoulders up, 14 f), the sneeze at f (the head snaps down, the
        // body jerks forward, overshoot), then a recoil and a little head shake; mobs/itw2.ts puffs the dust at f
        if (t < -14 || t > 22) break;
        const ah = c01((t + 14) / 14) * (1 - sm(t / 2)), wob = 0.25 * Math.sin(((t + 14) / 14) * Math.PI * 3) * ah;
        const snap = t < 0 ? 0 : t < 3 ? sm(t / 3) : Math.exp(-(t - 3) / 5) * Math.cos((t - 3) * 0.6);
        const settle = t >= 0 ? 1 - sm((t - 10) / 12) : 0;
        o.head[1] += (-0.38 * ah + wob * 0.4 + 0.55 * snap) * k;
        if (t > 4) o.head[0] += 0.12 * Math.sin(t * 0.9) * Math.exp(-(t - 4) / 6) * k;
        body((0.012 * ah - 0.012 * snap) * k, (-0.1 * ah + 0.22 * snap) * k);
        set("r", [-0.35, 0, 0.3, -0.9], (ah + 0.6 * Math.abs(snap) * settle) * k * 0.9); set("l", mir([-0.35, 0, 0.3, -0.9]), (ah + 0.6 * Math.abs(snap) * settle) * k * 0.9);
        break;
      }
      case "stomp": {
        // the knee comes up high (body leans back, arms out for balance), the foot slams down on f with a body drop and
        // overshoot, a little bounce after
        const sd = a.side ?? "r", L: Ch = sd === "r" ? "rl" : "ll", s2 = sd === "r" ? 1 : -1;
        if (t < -12 || t > 18) break;
        const up = t < 0 ? sm((t + 12) / 9) * (1 - Math.pow(c01((t + 3) / 3), 2)) : 0;
        const hit = t >= 0 ? bump(t / 8) : 0, w = env(t, 12, 4, 10) * k;
        set(L, [-1.5 * up + 0.12 * hit, 0, 0.05 * s2, 1.7 * up], w);
        set("r", [-0.5 * up, 0, 0.7 * up + 0.3 * hit, -0.3], w); set("l", mir([-0.5 * up, 0, 0.7 * up + 0.3 * hit, -0.3]), w);
        body((0.03 * up - 0.06 * hit) * k, (-0.08 * up + 0.12 * hit) * k, 0.04 * s2 * up * k);
        o.head[1] += (0.2 * hit - 0.1 * up) * k;
        break;
      }
      case "tumble": {
        // a slip (arms windmill up, 6 f), then flailing arms and legs down the stairs; flat and dazed at the end
        if (t < -6) break;
        const end = tumbleEnd(a) - a.f;
        const lk = sm((t - end) / 6);
        const fa = (ph: number): A4 => [-2.4 + 0.6 * Math.sin(t * 0.95 + ph), 0, 0.6 + 0.35 * Math.sin(t * 0.73 + ph), -0.4];
        const wu = t < 0 ? sm((t + 6) / 6) : 1;
        set("r", mix4(fa(0), [-0.15, 0, 1.2, -0.15], lk), wu * k); set("l", mir(mix4(fa(1.9), [-0.2, 0, 1.0, -0.2], lk)), wu * k);
        const lg = (ph: number) => [(-0.6 + 0.55 * Math.sin(t * 0.85 + ph)) * (1 - lk), (ph ? -0.12 : 0.12) * lk, ph ? -0.06 : 0.06, (0.6 + 0.4 * Math.sin(t * 0.85 + ph)) * (1 - lk) + 0.05 * lk];
        if (t >= 0) { set("rl", lg(0), k); set("ll", lg(2.3), k); }
        if (t > end) { const daze = Math.exp(-(t - end) / 45); o.head[0] += 0.25 * Math.sin((t - end) * 0.18) * daze; }
        else o.head[1] += t < 0 ? -0.2 * wu : 0.25 * Math.sin(t * 0.5);
        break;
      }
      case "carry": {
        // the reach down to a low baby is a squat (the arms are aimed in pass 2)
        if (!a.target || t > 2) break;
        const low = c01((at.y + 0.9 - a.target[1]) / 0.7), w = env(t, a.ein ?? 10, 0, 8) * low * k;
        if (w > 0) { squat(0.95 * w, w); body(0, 0.3 * w); }
        break;
      }
      case "careTap": {
        // leaning in, careful (the arm is aimed in pass 2)
        const w = env(t, 16, ((a.n ?? 1) - 1) * (a.every ?? 18) + len, 14) * k;
        if (w > 0) body(-0.01 * w, 0.12 * w, 0, 0, 0.03 * w);
        break;
      }
      case "windup": {
        // the swing's top: the tool arm raised up and back, held (third person; FirstPerson.ts does the same in pov)
        const w = env(t, a.ein ?? 8, len || 1e9, a.eout ?? 8, 1.3) * k;
        if (w <= 0) break;
        const side = a.side ?? "r";
        set(side, side === "r" ? [-2.55, 0.25, 0.05, -1.1] : mir([-2.55, 0.25, 0.05, -1.1]), w);
        body(0, -0.06 * w, 0, (side === "r" ? -0.18 : 0.18) * w);
        break;
      }
      default: break;
    }
  }
  // pass 2: aimed swings from the shoulder through this frame's body
  const M = bodyMatrix(at, yawRad, B);
  const shoulderW = (side: "r" | "l") => new THREE.Vector3(side === "r" ? -5 / 16 : 5 / 16, 1.5 - armY / 16, 0).applyMatrix4(M);
  for (const a of sorted) {
    if (zombie) break;
    if (a.kind === "drink") {
      // the bottle to the lips: the hand aimed at a point just in front of the mouth, the head tipping back to drink
      const L = a.len ?? 24, t = frame - a.f, w = env(t, 10, L, 10, 1.2) * (a.amt ?? 1);
      if (w <= 0) continue;
      const sd = a.side ?? "r", sg = sd === "r" ? 1 : -1;
      const sip = t > 0 && t < L ? Math.sin(t * 0.35) : 0;
      const mouth = new THREE.Vector3(sg * 0.02, 1.36 + 0.04 * sm(t / 6) + 0.01 * sip, 0.5).applyMatrix4(M);
      const aim = aimReach(M, shoulderW(sd), mouth);
      set(sd, [aim[0] - 0.05 * sip, aim[1], aim[2], aim[3]], w);
      o.head[1] += (-0.38 * sm(t / 6) - 0.05 * sip) * w; body(0, -0.06 * w);
      continue;
    }
    if (a.kind === "carry") {
      // itw-02: the carrier's hands go to the baby (target, its chest / seat), take it on f, then lift it into the hold
      // pose with overshoot (L = 10 f) and keep it there, jiggling; Actors.tsx puts the baby on the hands
      const t = frame - a.f, k = a.amt ?? 1, mode = a.carry ?? "high", w = env(t, a.ein ?? 10, a.len ?? 1e9, a.eout ?? 10) * k;
      if (w <= 0) continue;
      const lift = over(c01(t / 10), 1.5), jig = t > 10 ? Math.sin(t * 0.23) : 0;
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
      for (const sd of ["r", "l"] as const) {
        const sx = sd === "r" ? -1 : 1, H = CARRY[mode], hp = H[sd];
        const pose = new THREE.Vector3(hp[0], hp[1] + 0.012 * jig, hp[2]).applyMatrix4(M);
        let reach: THREE.Vector3;
        if (a.target) reach = new THREE.Vector3(...a.target).add(new THREE.Vector3(sx * (mode === "twins" ? 0.3 : 0.15), 0, 0).applyQuaternion(yawQ));
        else reach = new THREE.Vector3(sx * 0.2, 0.75, 0.45).applyMatrix4(M);
        const tgt = t < 0 ? reach : reach.clone().lerp(pose, lift);
        const aim = aimReach(M, shoulderW(sd), tgt);
        set(sd, [aim[0], aim[1], aim[2], aim[3]], w);
      }
      // the carrier looks at the baby: up at it held high, down at it in the arms, from one twin to the other
      const lk = t < 0 ? 0 : sm(t / 8) * w;
      if (mode === "high") { o.head[1] += -0.45 * lk; body(0, -0.05 * lk); }
      else if (mode === "arms") o.head[1] += 0.28 * lk;
      else { o.head[1] += 0.22 * lk; o.head[0] += 0.35 * Math.sin(Math.max(0, t - 6) * 0.09) * lk; }
      continue;
    }
    if (a.kind === "careTap" && a.target) {
      // itw-02 Auma: a small careful tap: a slow lift of the forearm, a light strike, the pick rests on the face a
      // moment; skid: it glances off (the hand slides along the face, jerks back, the head flinches)
      const t = frame - a.f, k = a.amt ?? 1, side = a.side ?? "r", len = a.len ?? 0;
      const n = a.n ?? 1, P = a.every ?? 18, w = env(t, 16, (n - 1) * P + len, 14);
      if (w <= 0) continue;
      const sg = side === "r" ? 1 : -1;
      let s = 0, sk = 0;
      for (let i = 0; i < n; i++) {
        const u = t - i * P, last = i === n - 1;
        let h = 0;
        if (u >= -5 && u < 0) h = Math.pow((u + 5) / 5, 1.6);
        else if (u >= 0 && (last || u < 3)) h = 1;
        else if (!last && u >= 3 && u < P - 5) h = 1 - sm((u - 3) / Math.max(1, P - 9));
        s = Math.max(s, h);
        if (a.skid && u >= 0 && u < 14) sk = Math.max(sk, sm(u / 3) * (1 - sm((u - 6) / 8)));
      }
      const tgt = new THREE.Vector3(...a.target);
      if (sk > 0) tgt.add(new THREE.Vector3(-sg * 0.2 * sk, 0.12 * sk, -0.12 * sk).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad));
      const aim = aimReach(M, shoulderW(side), tgt);
      const wind: A4 = [-0.4 * k, 0.1 * sg * k, 0, -0.85 * k];
      set(side, [aim[0] + wind[0] * (1 - s) + 0.25 * sk, aim[1] + wind[1] * (1 - s), aim[2], aim[3] + wind[3] * (1 - s) - 0.3 * sk], w);
      const neck = new THREE.Vector3(0, 1.5, 0).applyMatrix4(M);
      const d = tgt.clone().sub(neck).applyMatrix4(new THREE.Matrix4().extractRotation(M).invert());
      o.look = { yaw: Math.atan2(d.x, d.z), pitch: -Math.atan2(d.y, Math.hypot(d.x, d.z)), w: Math.min(1, w) * 0.95 };
      o.head[1] += -0.12 * sk; body(0, -0.05 * sk, 0, 0, -0.03 * sk);
      continue;
    }
    if (!["punch", "place", "knock", "press", "bell", "mine"].includes(a.kind) || !a.target) continue;
    const t = frame - a.f, k = a.amt ?? 1, side = a.side ?? "r", len = a.len ?? 0;
    const knock = a.kind === "knock" || a.kind === "press";
    const n = a.n ?? (a.kind === "knock" ? 3 : 1), P = a.every ?? (knock ? 5 : 8);
    const Wd = knock ? 4 : a.kind === "place" ? 5 : 6;
    const w = env(t, Wd + 4, (n - 1) * P + len, 10);
    if (w <= 0) continue;
    const tgt = new THREE.Vector3(...a.target);
    const aim = aimReach(M, shoulderW(side), tgt);
    const sg = side === "r" ? 1 : -1;
    // wind-up: punch / place raise the arm up and back, elbow cocked; knock / press cock the forearm
    const wind: A4 = a.kind === "mine" ? [-1.6 * k, 0.25 * sg * k, 0, -1.1 * k]
      : a.kind === "punch" || a.kind === "bell" ? [-0.95 * k, 0.22 * sg * k, 0, -1.0 * k]
      : a.kind === "place" ? [-0.8 * k, 0.18 * sg * k, 0, -0.9 * k]
      : a.kind === "knock" ? [-0.12, 0, 0, -0.95] : [-0.08, 0, 0, -0.7];
    // strike shape: 0 = wound up, 1 = on the target; a fast ease-in strike, a 1.5 f contact, back to the wind-up
    let s = 0, rec = 0;
    for (let i = 0; i < n; i++) {
      const u = t - i * P, last = i === n - 1;
      let h = 0;
      if (u >= -2.5 && u < 0) h = Math.pow(u / 2.5 + 1, 2);
      else if (u >= 0 && (last || u < 1.5)) h = 1;
      else if (!last && u >= 1.5 && u < P - 2.5) h = 1 - sm((u - 1.5) / Math.max(1, P - 4));
      s = Math.max(s, h);
      if (u >= 0 && u < 3) rec = Math.max(rec, bump(u / 3));
    }
    const arm: A4 = [aim[0] + wind[0] * (1 - s) + 0.08 * rec, aim[1] + wind[1] * (1 - s), aim[2], aim[3] + wind[3] * (1 - s)];
    set(side, arm, w);
    // the body twists back on the wind-up and follows through past square on the hit; leans into it
    const follow = knock ? 0 : bump(Math.max(0, ((t - (n - 1) * P) % P) / 5));
    body(0, (knock ? 0.02 : 0.06) * s * w, 0, (-0.2 * sg * (1 - s) * (knock ? 0.2 : 1) + 0.07 * sg * follow) * w);
    // the head looks at the target
    const neck = new THREE.Vector3(0, 1.5, 0).applyMatrix4(M);
    const d = tgt.clone().sub(neck).applyMatrix4(new THREE.Matrix4().extractRotation(M).invert());
    o.look = { yaw: Math.atan2(d.x, d.z), pitch: -Math.atan2(d.y, Math.hypot(d.x, d.z)), w: Math.min(1, w) * 0.85 };
  }
  // an item in the hand: the ITEM pose on top (the idle swing kept)
  if (holdK.r > 0) { o.r[0] += -0.31 * holdK.r; o.rE += -0.12 * holdK.r; }
  if (holdK.l > 0) { o.l[0] += -0.31 * holdK.l; o.lE += -0.12 * holdK.l; }
  // layered channels -> offsets
  if (chW.r > 0) add("r", [ch.r[0], ch.r[1], ch.r[2]], 1, ch.r[3]), (o.rW = chW.r);
  if (chW.l > 0) add("l", [ch.l[0], ch.l[1], ch.l[2]], 1, ch.l[3]), (o.lW = chW.l);
  if (chW.rl > 0 || chW.ll > 0) {
    o.rLeg = [ch.rl[0], ch.rl[1], ch.rl[2]]; o.lLeg = [ch.ll[0], ch.ll[1], ch.ll[2]]; o.rKn = ch.rl[3]; o.lKn = ch.ll[3];
    o.legW = Math.max(chW.rl, chW.ll);
  }

  // ---------------------------------------------------------------- the original beats (additive)
  // poses first: weights normalised where two overlap (a cross-fade, never a doubled pose)
  const poseW = acts.map((a) => {
    if (a.kind !== "pose") return 0;
    const t = frame - a.f, ein = a.ein ?? 6, eout = a.eout ?? 8, len = a.len ?? 0;
    return (t < 0 ? sm((t + ein) / ein) : 1) * (t > len ? 1 - sm((t - len) / eout) : 1) * (a.amt ?? 1);
  });
  const wSum = poseW.reduce((s, w) => s + w, 0), norm = wSum > 1 ? 1 / wSum : 1;
  acts.forEach((a, i) => {
    const w = poseW[i] * norm, j = a.joints;
    if (w <= 0 || !j) return;
    add("r", j.r_arm ?? [0, 0, 0], w, j.r_elbow ?? 0);
    add("l", j.l_arm ?? [0, 0, 0], w, j.l_elbow ?? 0);
    for (let k = 0; k < 3; k++) { o.rLeg[k] += (j.r_leg?.[k] ?? 0) * w; o.lLeg[k] += (j.l_leg?.[k] ?? 0) * w; }
    o.rKn += (j.r_knee ?? 0) * w; o.lKn += (j.l_knee ?? 0) * w;
    o.legW = Math.min(1, o.legW + w);
    if (j.head) { o.head[0] += j.head[0] * w; o.head[1] += j.head[1] * w; }
  });
  for (const a of acts) {
    const t = frame - a.f, k = a.amt ?? 1, side = a.side ?? "r", len = a.len ?? 0;
    if (zombie || a.kind === "pose" || t < -14 || t > len + 16) continue;
    if (a.kind === "tap" || a.kind === "reach" || a.kind === "point") {
      const tgt = a.target ? new THREE.Vector3(...a.target) : shoulderW(side).add(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad));
      const aim = aimReach(M, shoulderW(side), tgt);
      // anticipation: a small pull back (-12..-7), reach with overshoot (-7..0), contact recoil, hold, ease back
      const lead = a.kind === "tap" ? 7 : 9;
      const pull = t < -lead ? sm((t + lead + 5) / 5) * (1 - sm((t + lead) / 3)) : 0;
      let w = t < -lead ? 0 : t < 0 ? over((t + lead) / lead, a.kind === "tap" ? 1.2 : 1.7) : 1;
      if (t >= len) w *= 1 - sm((t - len) / (a.kind === "tap" ? 9 : 12));
      // the elbow cocks on the pull-back and straightens into the reach (bent only as far as the contact needs)
      const wt = Math.max(w, pull) * k;
      add(side, [aim[0] * w * k + 0.35 * pull * k, aim[1] * w * k, 0], wt, wt > 0 ? (-0.75 * pull + Math.min(-0.05, aim[3]) * w) * k / wt : 0);
      if (a.kind === "tap" && t >= 0 && t < 5) o[side][0] += Math.sin((t / 5) * Math.PI) * 0.12 * k; // contact recoil
      if (a.kind === "point") o.head[1] += -0.05 * w * k;
    } else if (a.kind === "wave") {
      const w = sm((t + 6) / 6) * (1 - sm((t - len) / 8));
      // forearm up and wagging at the elbow
      add(side, [-2.4 * w * k, 0, (side === "r" ? -1 : 1) * (0.25 + Math.sin(t * 0.55) * 0.2) * w * k], w * k, -0.45 - Math.sin(t * 0.55) * 0.3);
    } else if (a.kind === "talk") {
      const w = sm((t + 5) / 5) * (1 - sm((t - len) / 8));
      // upper arms close, forearms up and moving: hands talk at the elbow
      add("r", [(-0.25 - 0.12 * Math.sin(t * 0.31)) * w * k, -0.2 * w * k, 0.1 * w * k], w * 0.8 * k, -0.85 - 0.3 * Math.sin(t * 0.31 + 0.6));
      add("l", [(-0.18 - 0.12 * Math.sin(t * 0.27 + 1.7)) * w * k, 0.2 * w * k, -0.1 * w * k], w * 0.8 * k, -0.7 - 0.3 * Math.sin(t * 0.27 + 2.3));
      o.head[1] += Math.sin(t * 0.4) * 0.06 * w * k;
    } else if (a.kind === "lift") {
      // a hug: upper arms forward, forearms folded in across the chest
      const w = (t < 0 ? over((t + 8) / 8, 1.3) : 1) * (t < -8 ? 0 : 1) * (1 - sm((t - len) / 10));
      add("r", [-0.75 * w * k, -0.35 * w * k, 0], w * k, -1.35);
      add("l", [-0.75 * w * k, 0.35 * w * k, 0], w * k, -1.35);
    } else if (a.kind === "shrug") {
      // elbows in, forearms up and out, palms up
      const w = sm((t + 5) / 5) * (1 - sm((t - Math.max(len, 10)) / 8));
      add("r", [-0.15 * w * k, -0.5 * w * k, 0.35 * w * k], w * k, -1.3);
      add("l", [-0.15 * w * k, 0.5 * w * k, -0.35 * w * k], w * k, -1.3);
      o.head[0] += 0.12 * w * k; o.head[1] += -0.05 * w * k;
    } else if (a.kind === "headDrop") {
      const w = (t < 0 ? 0 : over(t / 8, 1.0)) * (1 - sm((t - Math.max(len, 12)) / 14));
      o.head[1] += 0.55 * w * k;
    } else if (a.kind === "nod") {
      const w = t < 0 ? 0 : 1 - sm((t - 12) / 4);
      o.head[1] += Math.max(0, Math.sin((t / 12) * Math.PI * 2)) * 0.35 * w * k;
    } else if (a.kind === "doubleTake") {
      // glance (0..5), back (5..10), snap hard + hold with overshoot (12..), ease back after len
      const g = sm(t / 5) * (1 - sm((t - 5) / 5)) * 0.45;
      const snap = t < 12 ? 0 : over((t - 12) / 5, 2.2) * (1 - sm((t - 12 - Math.max(len, 18)) / 10)) * 0.75;
      const dir = side === "r" ? -1 : 1;
      o.head[0] += dir * (g + snap) * k; o.head[1] += -0.08 * snap * k;
    }
  }
  return o;
};
