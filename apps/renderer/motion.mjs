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

export { EASINGS };
