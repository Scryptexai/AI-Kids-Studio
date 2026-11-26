// Per-shot direction over the plan (public/mc-preview/<story>/direction.json): keyframed camera with FOV punches and
// impact shakes, mob paths (walk while moving), cast moves (jumps on an arc), prop flights, dark volumes and glowing
// eyes. Pure functions only, so a node check can evaluate the same camera the render uses.
export type V3 = [number, number, number];
export type EaseName = "linear" | "inOut" | "cubicOut" | "expoOut" | "backOut" | "expoIn";
export type CamKey = { f: number; pos: V3; look: V3; fov: number; ease?: EaseName; /** a hard cut lands on this key: no smoothing across it */ cut?: boolean; /** where the lens focuses (the lead subject); default the look point */ focus?: V3 };
export type Shake = { f: number; amp: number; len: number };
export type PathKey = { f: number; at: V3; ease?: EaseName; arc?: number; facing?: number; look?: V3 | null; hidden?: boolean; rot?: V3;
  /** mobs: overall size (spawn pop), default 1 */
  scale?: number;
  /** mobs: whole-body tilt in degrees [pitch (+ forward, 90 = face down), roll] about the hips (eased like the path) */
  tilt?: [number, number];
  /** mobs: bow-draw / arms-forward pose 0..1; cast: crouch squash 0..1 (+) or stretch (-) */
  aim?: number; squash?: number;
  /** mobs: the gait while moving between this key and the next: "walk" (default) or "run" (a sprint: longer stride,
   *  pumping elbows, forward lean, a bob). Set it on the key the run ends on. */
  gait?: "walk" | "run" };
/** what a mob holds in its right hand from frame f: a prop id (a set prop with heldBy = that mob) or null (empty hand).
 *  Each switch pops the new item in (0 -> 108 % -> 100 % over 4 f). */
export type HeldKey = { f: number; item: string | null };
export type DirEvent = { startFrame: number; endFrame: number; action: string; params: Record<string, unknown>; target: { kind: string; id: string }; intensity?: number };
/** the raid fields (mc-raid Wave A: HUD, bell, arrows, shocks, boundary, imagined look, flows, vex rings, banners) are
 *  documented in types.ts (RaidFxDir) and projects/mc-raid/FX.md */
export type ShotDirection = import("./types").RaidFxDir & import("./types").MountainFxDir & {
  cam?: CamKey[]; shake?: Shake[];
  /** this shot's dissolve IN length in frames (overrides the default 12 when the plan dissolves into it); the shot
   *  before runs on for the same length. Short (~6) for two angles of the same character, so no ghost double. */
  dissolve?: number;
  /** an imagined / hypothetical picture: keys [frame, 0..1] (eased) of a warm soft vignette, slight desaturation and
   *  a gentle wobble, so a "this COULD happen" preview never reads as real */
  dream?: [number, number][];
  mobs?: Record<string, PathKey[]>; cast?: Record<string, PathKey[]>; props?: Record<string, PathKey[]>;
  /** keys: [frame, opacity] pairs (eased) that override opacity, e.g. the pit sinking into darkness */
  dark?: { min: V3; max: V3; opacity: number; keys?: [number, number][] }[];
  /** blocks still standing at the start that are broken one by one: each block [x,y,z] (block coords) breaks on frame f */
  dig?: { blocks: [number, number, number, number][]; top?: string; fill?: string };
  /** a cool back light that rims silhouettes against the dark (direction it shines FROM) */
  rim?: { from: V3; color?: string; i: number };
  /** a dark veil over the lens ([frame, opacity] keys): everything darkens except glowing eyes (drawn after it) */
  veil?: [number, number][];
  /** night sky dressing: a square moon in direction `moon`, n stars */
  sky?: { moon?: V3; stars?: number };
  /** low ground mist: soft drifting sheets over the grass (y) and in the pit (pitY), n puffs */
  mist?: { y: number; pitY?: number; n?: number; color?: string; opacity?: number };
  /** a glowing streak behind a flying prop (the last `len` frames of its path) */
  trails?: { prop: string; color?: string; len?: number }[];
  /** G3 time-lapse: [frame, days elapsed] keys (linear between keys, so days pass at a steady rate); sun arcs, night falls, dawn */
  cycle?: [number, number][];
  /** depth of field strength: blur (px at 1080x1920) of things at infinity; 0 = all sharp (default 9). Only used when
   *  the lens is turned on (inputProps { post: { lens: true } }); it is OFF by default since 2026-11-25 (user rule) */
  dof?: number;
  /** glowing eyes: tease = half-lit slit before they snap open on `open` */
  eyes?: { mob: string; open: number; tease?: number; color?: string; /** [frame, glow] keys override open/tease (snap: keys 1-2 frames apart) */ keys?: [number, number][] }[];
  /** block-break debris: n cubes thrown up from `at` on frame f, falling under gravity */
  bursts?: { f: number; at: V3; colors: string[]; n?: number; speed?: number; size?: number }[];
  /** block states over time (BlockFx.tsx): glassy / gone / taps per block or box */
  /** acting beats per mob id (mobs/acts.ts). Player: tap, wave, talk, point, headDrop, nod, doubleTake, shrug, lift,
   *  reach, pose; swings at a world point: punch (n hits every 8 f, amt > 1 = big wind-up, crouch 0..1), place, knock
   *  (3 raps), press; gestures held `len`: idea, frame, hipsHands, armsCrossed, headGrab, panicJump (hops every 11 f),
   *  wipeBrow, brushShoulder, thumbsUp, lookCam (target = the lens), sigh; full body: sit (ein = frames to sit down),
   *  fallBack (f = the blast, lands sitting). Zombie: hit / bump (target = the face the hands land on at f), giveUp.
   *  e.g. {"f": 30, "kind": "punch", "target": [0.5, 0.05, -3], "n": 3, "crouch": 0.6} */
  acts?: Record<string, import("./mobs/acts").Act[]>;
  /** the held item per mob id over time: [{f: 0, item: "dirt"}, {f: 40, item: null}, {f: 52, item: "pick"}]; without
   *  keys a mob holds the first prop with its heldBy */
  held?: Record<string, HeldKey[]>;
  /** a held item's tip angle per mob id: [frame, degrees] keys (eased), + = the top tips forward (a bucket pouring) */
  tip?: Record<string, [number, number][]>;
  blockfx?: import("./BlockFx").BlockFxSpec[];
  /** N1 build waves: cells that change from one block to another (pop in, break into motes, lava fizzing to obsidian) */
  waves?: import("./Build").WaveSpec[];
  /** N7 water poured from a bucket point onto cells (a film spreads; pair with a fizz wave) */
  pours?: import("./Build").PourSpec[];
  /** N2 doors on hinges (hits, cracks, break, pop, open/close keys) */
  doors?: import("./Doors").DoorSpec[];
  /** N2 buttons (pop, press, selection outline) */
  buttons?: import("./Doors").ButtonSpec[];
  /** glowing ownership outlines around boxes of blocks */
  outlines?: import("./BlockFx").OutlineSpec[];
  /** replaces the plan's events for this shot */
  events?: DirEvent[];
  /** blocks that break apart with physics on frame f (Shatter.tsx) */
  shatter?: import("./Shatter").ShatterSpec[];
  /** wind buffeting: [frame, amplitude in blocks] keys (linear); a fast jitter added after the smoothing */
  rumble?: [number, number][];
  /** speed streaks over the picture (Overlays.tsx): [frame, 0..1] keys, "up" = the world rushing up past a fall */
  speedlines?: import("./Overlays").SpeedLinesSpec;
  /** an on-screen counter (altitude, speed ...): value keys counted linearly between */
  hud?: import("./Overlays").HudSpec[];
  /** N3 fire on blocks (Fire.tsx): cells ignite in order (spread), flames on their open faces, light, embers, smoke,
   *  optional charring (`char`) and burning away (`gone`) */
  fires?: import("./Fire").FireSpec[];
  /** N3 lava embers: one bright drop popping out of the lava on f and arcing to `to` (a pop splash, sparks on landing) */
  embers?: import("./Fire").EmberSpec[];
  /** N3 random small lava pops over a lake rectangle */
  lavapops?: import("./Fire").LavaPopSpec[];
  /** N4 storm (Weather.tsx): [frame, 0..1] keys (eased) blend the sky to overcast, low light, a grey grade and 3D rain */
  storm?: import("./Weather").StormSpec;
  /** N4 lightning: a jagged bolt to `to` on f, then a 2 f white flash, ~6 f of flicker light and a damped shake */
  bolts?: import("./Weather").BoltSpec[];
  /** N5 explosions (Boom.tsx): a creeper fuse (swell, white flashes), then flash, puffs, debris from `cells`, shake,
   *  lingering smoke; no `cells` = a blast that breaks nothing; f < 0 = the shot opens in its smoke */
  booms?: import("./Boom").BoomSpec[];
  // ---------------------------------------------------------------- The Tapper fx (TapperFx.tsx; examples in
  // projects/itw-01/FX.md). Shots without these fields render exactly as before.
  /** black jagged staircase cracks across a block face (one block step per `rate` f), chips, glassy crack faces, zip shut */
  cracks?: import("./Crack").CrackSpec[];
  /** water drops swelling on a face and sliding down it, then falling */
  drips?: import("./Water").DripSpec[];
  /** a thin meandering trickle down a face, with a splash */
  trickles?: import("./Water").TrickleSpec[];
  /** spray arcs (mist, rainbow without red) or a hard jet, strength keyed (shrink to a drip, then nothing) */
  sprays?: import("./Water").SpraySpec[];
  /** pixel-font words on a block face (carved lintel / painted / chalk), lit word by word, palm flashes */
  texts?: import("./BlockText").TextSpec[];
  /** a wooden sign on a post (hammered on, lights up) */
  signs?: import("./BlockText").SignSpec[];
  /** Ruby's chalk book: tick boxes filling, page flips, empty boxes lighting */
  books?: import("./Book").BookSpec[];
  /** a 4-point star glint on an actor (gem head / badge): joy, hurt, realise, tink */
  glints?: import("./Glint").GlintSpec[];
  /** 60+ cheap extras from template mobs: beats (cheer, clap, press ...), surge, caps tossed */
  crowds?: import("./Crowd").CrowdSpec[];
  /** light shafts (a chink of daylight) that can follow `cycle` */
  beams?: import("./TapperFx").BeamSpec[];
  /** a square sun / moon riding `cycle` */
  sunDisc?: { size?: number };
  /** a vine curtain over a gap that parts on f */
  curtains?: import("./TapperFx").CurtainSpec[];
  /** a fishing line from a rod tip (or a mob) to a bobbing bobber */
  fishLines?: import("./TapperFx").FishLineSpec[];
  /** a ring of SOLID tap flashes running out from a point through a box of blocks (adds taps to blockfx) */
  ripples?: import("./TapperFx").RippleSpec[];
  /** own pixel-art items placed in the world (rest at `at`, fly with `props` paths); hold them with held "fx:<name>" */
  fxProps?: import("./TapperFx").TapperFxDir["fxProps"];
  /** actor size per mob id (Young Ruby 0.75) */
  sizes?: Record<string, number>;
  /** warm faded flashback grade: [frame, 0..1] keys (eased), no card */
  flashback?: [number, number][];
  /** whip-pan directional blur (8 f) */
  whip?: import("./TapperFx").WhipSpec[];
  /** a soft double-exposed sign over a close-up (a memory) */
  memories?: import("./TapperFx").MemorySpec[];
};
/** `atmo` at the top = the default fog for every shot (a shot's own `atmo` wins) */
export type Direction = { shots: Record<string, ShotDirection>; atmo?: import("./types").AtmoSpec | false; /** itw-02 default `imagineKeep` for every shot */ imagineKeep?: string[] };

const c01 = (v: number) => Math.max(0, Math.min(1, v));
export const EASE: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoIn: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  backOut: (t) => { const s = 1.9; const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; },
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** the segment f falls in: previous key, next key, eased progress (holds before the first / after the last key) */
export const seg = <K extends { f: number; ease?: EaseName }>(keys: K[], f: number): [K, K, number, number] => {
  if (f <= keys[0].f) return [keys[0], keys[0], 1, 1];
  for (let i = 1; i < keys.length; i++) if (f < keys[i].f) {
    const raw = c01((f - keys[i - 1].f) / (keys[i].f - keys[i - 1].f));
    return [keys[i - 1], keys[i], EASE[keys[i].ease ?? "inOut"](raw), raw];
  }
  const last = keys[keys.length - 1];
  return [last, last, 1, 1];
};

/** the raw keyed camera (eased per segment) + impact shakes, before smoothing */
const camRaw = (d: ShotDirection, f: number): { pos: V3; look: V3; fov: number; focus: V3 } => {
  const [a, b, k] = seg(d.cam!, f);
  const pos = lerp3(a.pos, b.pos, k), look = lerp3(a.look, b.look, k), focus = lerp3(a.focus ?? a.look, b.focus ?? b.look, k);
  const fov = lerp(a.fov, b.fov, k);
  for (const s of d.shake ?? []) if (f >= s.f && f < s.f + s.len) {
    const e = Math.pow(1 - (f - s.f) / s.len, 2) * s.amp;
    look[0] += Math.sin(f * 1.3) * e; look[1] += Math.cos(f * 1.7) * e; look[2] += Math.sin(f * 1.1 + 1) * e * 0.6;
  }
  return { pos, look, fov, focus };
};

/** camera smoothing window: a gaussian over +-CAM_SMOOTH*2 frames, so a whip keeps its speed but never jerks
 *  (no velocity jump at a key, shakes become soft bumps). 0 = off. */
export const CAM_SMOOTH = 2.0;

/** camera this frame: keys, smoothed in time, + a never-still handheld drift */
export const camAt = (d: ShotDirection, f: number, seed = 0): { pos: V3; look: V3; fov: number; focus: V3 } | null => {
  if (!d.cam?.length) return null;
  // a hard cut lands on a whole key frame: an in-between frame just before it still shows the old shot
  for (const k of d.cam) if (k.cut && f > k.f - 1 && f < k.f) f = k.f - 1;
  let out = camRaw(d, f);
  if (CAM_SMOOTH > 0) {
    const pos: V3 = [0, 0, 0], look: V3 = [0, 0, 0], focus: V3 = [0, 0, 0]; let fov = 0, ws = 0;
    const R = Math.ceil(CAM_SMOOTH * 2);
    // never smooth across a hard cut: clamp each sample to the side of the cut this frame is on
    const cuts = d.cam.filter((k) => k.cut).map((k) => k.f);
    const side = (g: number) => { for (const c of cuts) { if (f < c && g >= c) return c - 1; if (f >= c && g < c) return c; } return g; };
    for (let i = -R; i <= R; i++) {
      const w = Math.exp(-(i * i) / (2 * CAM_SMOOTH * CAM_SMOOTH)), c = camRaw(d, side(f + i));
      for (let j = 0; j < 3; j++) { pos[j] += c.pos[j] * w; look[j] += c.look[j] * w; focus[j] += c.focus[j] * w; }
      fov += c.fov * w; ws += w;
    }
    out = { pos: pos.map((v) => v / ws) as V3, look: look.map((v) => v / ws) as V3, fov: fov / ws, focus: focus.map((v) => v / ws) as V3 };
  }
  // handheld: two slow sines, ~1.5 cm
  out.pos[0] += Math.sin(f / 23 + seed) * 0.015; out.pos[1] += Math.sin(f / 29 + seed * 1.7) * 0.012;
  // impact shakes (lightning, explosions): after the smoothing so they keep their snap; damped (1 - u/len)^2 to a soft stop
  for (const [f0, amp, len] of fxShakes(d)) {
    const u = f - f0;
    if (u < 0 || u >= len) continue;
    const e = amp * Math.pow(1 - u / len, 2);
    const n = (a: number, b: number, c: number) => (Math.sin(u * a + f0) + 0.55 * Math.sin(u * b + f0 * 1.7) + 0.3 * Math.sin(u * c + 2.1)) / 1.85;
    out.look[0] += n(2.1, 3.7, 5.3) * e; out.look[1] += n(2.6, 4.1, 5.9) * e; out.look[2] += n(1.9, 3.3, 4.7) * e * 0.5;
    out.pos[0] += n(1.7, 2.9, 4.4) * e * 0.12; out.pos[1] += n(2.3, 3.1, 4.9) * e * 0.12;
  }
  // wind buffeting: fast, uneven (three sines per axis, never a clean wobble)
  const ru = d.rumble?.length ? keysAt(d.rumble, f) : 0;
  if (ru > 0) {
    const n = (a: number, b: number, c: number) => (Math.sin(f * a + seed) + 0.6 * Math.sin(f * b + seed * 2.1) + 0.35 * Math.sin(f * c + 1.3)) / 1.95;
    out.look[0] += n(1.31, 2.27, 3.71) * ru; out.look[1] += n(1.73, 2.91, 4.13) * ru; out.look[2] += n(1.07, 2.53, 3.29) * ru * 0.6;
    out.pos[0] += n(0.93, 1.87, 3.07) * ru * 0.25; out.pos[1] += n(1.19, 2.39, 3.53) * ru * 0.25;
  }
  return out;
};

/** a path's state this frame: position (with jump arc), facing, look, moving, hidden, rotation */
export const pathAt = (keys: PathKey[] | undefined, f: number) => {
  if (!keys?.length) return null;
  const [a, b, k, raw] = seg(keys, f);
  const at = lerp3(a.at, b.at, k);
  if (b.arc && a !== b) at[1] += 4 * b.arc * raw * (1 - raw);
  const moving = a !== b && Math.hypot(b.at[0] - a.at[0], b.at[2] - a.at[2]) > 0.05 && raw > 0 && raw < 1;
  const facing = b.facing !== undefined && a.facing !== undefined ? lerp(a.facing, b.facing, c01(raw * 3)) : (a.facing ?? b.facing);
  const num = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : lerp(x ?? 0, y ?? 0, k));
  return { at, facing, look: a.look, moving, aim: num(a.aim, b.aim), squash: num(a.squash, b.squash), hidden: !!(raw >= 1 ? b.hidden : a.hidden), scale: a.scale === undefined && b.scale === undefined ? undefined : lerp(a.scale ?? 1, b.scale ?? 1, k), rot: a.rot && b.rot ? lerp3(a.rot, b.rot, k) : (b.rot ?? a.rot),
    tilt: a.tilt === undefined && b.tilt === undefined ? undefined : ([lerp(a.tilt?.[0] ?? 0, b.tilt?.[0] ?? 0, k), lerp(a.tilt?.[1] ?? 0, b.tilt?.[1] ?? 0, k)] as [number, number]),
    gait: moving ? (b.gait ?? "walk") : undefined };
};

/** the held item this frame: prop id (null = empty hand, undefined = no keys) and its pop-in scale */
export const heldAt = (keys: HeldKey[] | undefined, f: number): { item: string | null; pop: number } | undefined => {
  if (!keys?.length) return undefined;
  let cur: HeldKey | undefined;
  for (const k of keys) if (f >= k.f) cur = k;
  if (!cur) return { item: null, pop: 1 };
  const u = (f - cur.f) / 4;
  // 0 -> 1.08 (frame 3) -> 1 (frame 4)
  const pop = u >= 1 ? 1 : u < 0.75 ? 1.08 * EASE.cubicOut(u / 0.75) : 1.08 - 0.08 * ((u - 0.75) / 0.25);
  return { item: cur.item, pop: Math.max(0.001, pop) };
};

/** a keyed scalar ([frame, value] pairs, smooth in-out between), or the fallback */
export const keyed = (keys: [number, number][] | undefined, f: number, fallback: number) => {
  if (!keys?.length) return fallback;
  const [a, b, k] = seg(keys.map(([kf, v]) => ({ f: kf, v })), f);
  return lerp(a.v, b.v, k);
};

/** linear [frame, value] keys (holds outside) */
export const keysAt = (keys: [number, number][], f: number) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (f < keys[i][0]) {
    const [f0, v0] = keys[i - 1], [f1, v1] = keys[i];
    return v0 + (v1 - v0) * (f - f0) / (f1 - f0);
  }
  return keys[keys.length - 1][1];
};

// ---------------------------------------------------------------- N3-N5 weather, lightning, explosions (pure)
/** storm amount 0..1 this frame */
export const stormAt = (d: ShotDirection | undefined, f: number) => (d?.storm ? keyed(d.storm.keys, f, 0) : 0);

/** a bolt's brightness u frames after its strike: a dim leader the frame before, the strike, then the return-stroke flicker */
const BOLT = [1, 1, 0.85, 0.2, 1, 0.55, 0.15, 0.45, 0.1];
// u may be fractional (60 fps): the table steps on whole key frames, so each brightness holds 1/30 s as at 30 fps
export const boltK = (uIn: number, glow = 6) => { const u = Math.floor(uIn); return u === -1 ? 0.35 : u < 0 || u >= Math.min(BOLT.length, 3 + glow) ? 0 : BOLT[u]; };
/** creeper fuse frames (the game's 30 ticks) */
export const FUSE = 45;

/** white over the whole picture: bolts flash on the 2 frames after the strike (the bolt reads alone on its own frame),
 *  explosions on their first 2 frames; never full white for more than 1 frame */
export const flashAt = (d: ShotDirection | undefined, f: number) => {
  let w = 0;
  // whole key frames: a 1-frame white stays 1/30 s at any output fps
  for (const b of d?.bolts ?? []) { const u = Math.floor(f - b.f - 1); if (u >= 0 && u < (b.flash ?? 2)) w = Math.max(w, u === 0 ? 1 : 0.55 * (1 - (u - 1) / (b.flash ?? 2))); }
  for (const b of d?.booms ?? []) { const u = Math.floor(f - b.f); if (b.flash !== 0 && u >= 0 && u < (b.flash ?? 2)) w = Math.max(w, u === 0 ? 0.92 : 0.45 * (1 - (u - 1) / (b.flash ?? 2))); }
  return w;
};
/** scene light boost 0..1 (sky and fill brighten): the lightning flicker after a strike */
export const glowAt = (d: ShotDirection | undefined, f: number) => {
  let g = 0;
  for (const b of d?.bolts ?? []) g = Math.max(g, boltK(f - b.f, b.glow));
  return g;
};
/** every impact shake of a shot as [frame, amp, len]: plain shakes are in `shake`; these come from bolts and booms */
export const fxShakes = (d: ShotDirection): [number, number, number][] => [
  ...(d.bolts ?? []).filter((b) => b.shake !== false).map((b) => [b.f, ...((b.shake || [0.35, 9]) as [number, number])] as [number, number, number]),
  ...(d.booms ?? []).filter((b) => b.shake !== false && b.f >= 0).map((b) => [b.f, ...((b.shake || [0.32, 10]) as [number, number])] as [number, number, number]),
  // mc-raid R10 crash / roar shockwaves
  ...(d.shocks ?? []).filter((s) => s.shake !== false).map((s) => [s.f, ...((s.shake || [0.3, 12]) as [number, number])] as [number, number, number]),
  // itw-02 R7 lava heave (and its small jolts before)
  ...(d.heaves ?? []).filter((h) => h.shake !== false).flatMap((h) => [[h.f, ...((h.shake || [0.28, 12]) as [number, number])] as [number, number, number],
    ...(h.jolts ?? []).map((j) => [j, 0.1, 6] as [number, number, number])]),
];
/** a creeper's fuse this frame: swell [width, height], white flash, gone after the blast */
export const boomCue = (d: ShotDirection | undefined, id: string, f: number): { swell?: [number, number]; white?: number; hidden?: boolean } | null => {
  const b = d?.booms?.find((x) => x.mob === id);
  if (!b) return null;
  if (f >= b.f) return { hidden: true };
  const fuse = b.fuse ?? FUSE, g = c01((f - (b.f - fuse)) / fuse);
  if (g <= 0) return null;
  // the game's swell (sharpest at the end), with a fast wobble growing with it
  const h = 1 + Math.sin(f * 1.9) * g * 0.03, g3 = g * g * g;
  return { swell: [(1 + g3 * 0.15) * h, (1 + g3 * 0.06) / h], white: Math.floor(g * 10) % 2 ? Math.max(0.5, g) * 0.85 : 0 };
};
