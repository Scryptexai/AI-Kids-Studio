// Per-frame character motion: a walk path with timing, plus prop interaction state.
//
// Until now a character held one static position for the whole scene, so "walk" meant walking
// in place. A motion track lets a character genuinely travel across the frame during a beat:
//
//   { path: [{t, x, y}, ...], ease: 'ease-in-out', facingWhileMoving: 'right' }
//
// The track is authored by the director (never hand-typed), and read by both renderers, so the
// SVG backend and the Remotion backend move characters identically.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Easings by name. `linear` is intentionally available: constant-speed walking reads badly. */
const EASINGS = {
  linear: (t) => clamp01(t),
  'ease-in': (t) => clamp01(t) ** 2,
  'ease-out': (t) => 1 - (1 - clamp01(t)) ** 2,
  'ease-in-out': smoothstep,
};

/**
 * Sample a motion track at a time.
 * The last keyframe holds; times must be ascending (the director guarantees this, and we
 * sort defensively so a hand-edited scene cannot produce a teleport).
 *
 * @param {{path:Array<{t:number,x:number,y:number}>, ease?:string}|null|undefined} track
 * @param {number} tSec
 * @param {{x:number,y:number}} fallback  static position when there is no track
 * @returns {{x:number,y:number,moving:boolean,phase:number}}
 */
export function sampleMotion(track, tSec, fallback) {
  if (!track || !Array.isArray(track.path) || track.path.length === 0) {
    return { x: fallback.x, y: fallback.y, moving: false, phase: 0 };
  }
  const path = [...track.path].sort((a, b) => a.t - b.t);
  if (path.length === 1) {
    return { x: path[0].x, y: path[0].y ?? fallback.y, moving: false, phase: 0 };
  }

  const ease = EASINGS[track.ease ?? 'ease-in-out'] ?? smoothstep;

  if (tSec <= path[0].t) return { x: path[0].x, y: path[0].y ?? fallback.y, moving: false, phase: 0 };
  const last = path[path.length - 1];
  if (tSec >= last.t) return { x: last.x, y: last.y ?? fallback.y, moving: false, phase: 0 };

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (tSec <= b.t) {
      const span = b.t - a.t;
      const raw = span <= 0 ? 1 : (tSec - a.t) / span;
      const k = ease(raw);
      const ay = a.y ?? fallback.y;
      const by = b.y ?? fallback.y;
      return {
        x: a.x + (b.x - a.x) * k,
        y: ay + (by - ay) * k,
        moving: Math.abs(b.x - a.x) > 0.001 && raw > 0 && raw < 1,
        phase: raw,
      };
    }
  }
  return { x: last.x, y: last.y ?? fallback.y, moving: false, phase: 0 };
}

/** Which way is the character actually travelling at time t? */
export function travelDirection(track, tSec) {
  if (!track?.path || track.path.length < 2) return null;
  const path = [...track.path].sort((a, b) => a.t - b.t);
  for (let i = 1; i < path.length; i++) {
    if (tSec <= path[i].t) {
      const dx = path[i].x - path[i - 1].x;
      if (Math.abs(dx) < 0.001) return null;
      return dx > 0 ? 'right' : 'left';
    }
  }
  return null;
}

/**
 * Prop interaction state at a time.
 *
 * A prop can be *attached* to a character for a window of the scene — the ball is picked up,
 * carried, then put down. While attached the renderer draws it at the character's hands rather
 * than at its staged position.
 *
 * @param {{propId:string, characterId:string, fromSec:number, toSec:number, attach?:'hands'|'head'}} interaction
 */
export function propInteractionAt(interactions, propId, tSec) {
  if (!Array.isArray(interactions)) return null;
  for (const it of interactions) {
    if (it.propId !== propId) continue;
    if (tSec >= it.fromSec && tSec <= it.toSec) return it;
  }
  return null;
}

/** Normalised progress through an interaction window (0 = just picked up, 1 = released). */
export function interactionProgress(interaction, tSec) {
  if (!interaction) return 0;
  const span = interaction.toSec - interaction.fromSec;
  if (span <= 0) return 1;
  return clamp01((tSec - interaction.fromSec) / span);
}

/**
 * Validate a motion track. Returns human-readable problems; empty means usable.
 * Kept separate from sampling so the scene validator can report a bad track by name.
 */
export function validateMotionTrack(track, { durationSec, label = 'motion' } = {}) {
  const problems = [];
  if (track == null) return problems;
  if (typeof track !== 'object') return [`${label}: must be an object`];
  if (!Array.isArray(track.path) || track.path.length < 2) {
    problems.push(`${label}: path needs at least 2 keyframes`);
    return problems;
  }
  let previous = -Infinity;
  for (const [i, kf] of track.path.entries()) {
    if (typeof kf.t !== 'number' || Number.isNaN(kf.t)) problems.push(`${label}: keyframe ${i} has no numeric t`);
    else {
      if (kf.t < previous) problems.push(`${label}: keyframe ${i} t=${kf.t} goes backwards`);
      previous = kf.t;
      if (durationSec != null && kf.t > durationSec + 0.001) {
        problems.push(`${label}: keyframe ${i} t=${kf.t} is past the scene end (${durationSec}s)`);
      }
    }
    // y is optional — a level walk only needs x. x is mandatory.
    for (const axis of ['x', 'y']) {
      if (kf[axis] === undefined && axis === 'y') continue;
      if (typeof kf[axis] !== 'number' || Number.isNaN(kf[axis])) problems.push(`${label}: keyframe ${i} has no numeric ${axis}`);
      else if (kf[axis] < -0.4 || kf[axis] > 1.4) problems.push(`${label}: keyframe ${i} ${axis}=${kf[axis]} is far outside the frame`);
    }
  }
  if (track.ease && !EASINGS[track.ease]) {
    problems.push(`${label}: unknown ease '${track.ease}' (known: ${Object.keys(EASINGS).join(', ')})`);
  }
  return problems;
}

/**
 * Ballistic flight for a thrown prop.
 *
 * A throw is not an interaction window: the prop is not attached to anyone, it travels on its
 * own arc between two characters. Modelling it as a real parabola (rather than a tween) means
 * the arc looks right at any duration and can be sampled at any frame.
 *
 * Gravity is expressed in frame-heights per second², which keeps the shape independent of
 * resolution: g = 3.2 makes a 1-second throw rise about 0.2 of the frame height.
 */
const GRAVITY = 3.2;

/**
 * @param {{fromX:number, fromY:number, toX:number, toY:number, startSec:number, endSec:number, arc?:number}} flight
 * @param {number} tSec
 * @returns {{x:number, y:number, airborne:boolean, progress:number}}
 */
export function sampleFlight(flight, tSec) {
  if (!flight) return null;
  const span = flight.endSec - flight.startSec;
  if (span <= 0) return { x: flight.toX, y: flight.toY, airborne: false, progress: 1 };
  if (tSec < flight.startSec) return { x: flight.fromX, y: flight.fromY, airborne: false, progress: 0 };
  if (tSec > flight.endSec) return { x: flight.toX, y: flight.toY, airborne: false, progress: 1 };

  const p = (tSec - flight.startSec) / span;
  const x = flight.fromX + (flight.toX - flight.fromX) * p;
  // Straight line between the two hands...
  const line = flight.fromY + (flight.toY - flight.fromY) * p;
  // ...plus a parabola whose apex scales with duration so longer throws arc higher.
  const arc = flight.arc ?? Math.min(0.34, 0.12 + span * 0.11);
  const lift = 4 * arc * p * (1 - p);
  // A real trajectory is asymmetric (rises fast, falls slower), so bias the apex early.
  const biased = lift * (1 + 0.18 * (1 - p) * (p < 0.5 ? 1 : 0.4));
  return {
    x,
    // y grows downward in screen space, so "up" subtracts.
    y: line - biased,
    airborne: true,
    progress: p,
  };
}

/**
 * Depth scaling.
 *
 * Walking "into" the picture means the character gets smaller and their ground line rises
 * toward the horizon. Both are driven by a single normalised depth `z` where 0 is the front
 * lane and 1 is the far lane, so a director only has to think about depth, not about scale.
 */
// Values chosen so depth 0.5 — the default — yields exactly scale 1.0 and the mid ground
// line, which means scenes without depth keyframes render unchanged.
// Prop placements carry no `z` in the schema: they sit on the stage's ground line, which is
// the *middle* depth lane. Calibrating them there means one depth model paints characters and
// props alike, and an unstaged scene keeps its old look.
export const PROP_DEPTH = 0.5;

export const DEPTH = {
  front: { z: 0, scale: 1.06, groundY: 0.86 },
  mid: { z: 0.5, scale: 1.0, groundY: 0.82 },
  far: { z: 1, scale: 0.94, groundY: 0.78 },
};

/** Interpolate scale and ground line from a 0..1 depth. */
export function depthToScale(depth) {
  const d = Math.max(0, Math.min(1, depth ?? 0.5));
  // Round to kill float drift: at the default depth this must be exactly 1 and 0.82 so
  // scenes without depth keyframes render byte-identically to before.
  const scale = Number((DEPTH.front.scale + (DEPTH.far.scale - DEPTH.front.scale) * d).toFixed(4));
  const groundY = Number((DEPTH.front.groundY + (DEPTH.far.groundY - DEPTH.front.groundY) * d).toFixed(4));
  return { scale, groundY, depth: d };
}

/**
 * Sample a motion track that also carries depth.
 * Keyframes may include `z` in 0..1; the returned scale follows it automatically so a
 * character walking away does not need a second, hand-authored scale track.
 */
export function sampleMotionWithDepth(track, tSec, fallback) {
  const pos = sampleMotion(track, tSec, fallback);
  const depth = sampleDepth(track, tSec, fallback.depth ?? 0.5);
  const { scale, groundY } = depthToScale(depth);
  return {
    ...pos,
    // Depth owns the ground line while walking into the picture.
    y: track?.path?.some((k) => k.z !== undefined) ? groundY : pos.y,
    scale,
    depth,
  };
}

/** Depth at a time, from optional `z` keyframes. */
export function sampleDepth(track, tSec, fallbackDepth = 0.5) {
  const keys = (track?.path ?? []).filter((k) => k.z !== undefined);
  if (!keys.length) return fallbackDepth;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  if (sorted.length === 1) return sorted[0].z;
  if (tSec <= sorted[0].t) return sorted[0].z;
  if (tSec >= sorted.at(-1).t) return sorted.at(-1).z;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (tSec <= b.t) {
      const span = b.t - a.t;
      const k = span <= 0 ? 1 : smoothstep((tSec - a.t) / span);
      return a.z + (b.z - a.z) * k;
    }
  }
  return sorted.at(-1).z;
}

/** Validate a flight so a bad throw is reported instead of silently rendering straight. */
export function validateFlight(flight, { durationSec, label = 'flight' } = {}) {
  const problems = [];
  if (!flight) return problems;
  for (const k of ['fromX', 'fromY', 'toX', 'toY', 'startSec', 'endSec']) {
    if (typeof flight[k] !== 'number' || Number.isNaN(flight[k])) problems.push(`${label}: missing numeric ${k}`);
  }
  if (typeof flight.startSec === 'number' && typeof flight.endSec === 'number' && flight.endSec <= flight.startSec) {
    problems.push(`${label}: endSec must be after startSec`);
  }
  if (durationSec != null && typeof flight.endSec === 'number' && flight.endSec > durationSec + 0.001) {
    problems.push(`${label}: flight ends at ${flight.endSec}s, past the scene end (${durationSec}s)`);
  }
  return problems;
}

export { EASINGS };
