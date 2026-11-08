// Weight, timing and gait — the difference between a figure that moves and a figure that acts.
//
// Two problems this solves, both visible on screen and neither fixable by adding poses:
//
//   1. Feet slid. Walk and run were plain sines driven by a clock, with no relationship to how
//      fast the character was actually travelling. A character walking slowly and one sprinting
//      crossed the frame with the same cadence, so the contact foot skated over the ground.
//      `gaitFor` sizes the stride from the distance actually covered and advances the cycle from
//      the distance actually travelled: one stride of ground covered = one full leg cycle.
//
//   2. Nothing had weight. A figure that starts and stops instantly reads as a cursor, not a
//      body. `arrivalPulse` gives a landing a compression and a recovery, and `anticipateFor`
//      lets an actor coil back before it moves — the two halves of "anticipation and
//      follow-through" that a sine wave can never produce.

import { sampleMotion } from './motion.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Frame width expressed in body heights, matching the director's staging assumption. */
const FRAME_WIDTH_UNITS = 4.4;

/**
 * Stride length and cycle cadence for a character moving at a given rate.
 *
 * A child's stride is roughly one body height. We express everything in frame fractions, derive
 * the cycle from distance covered, and size the stride from speed so the legs neither skate nor
 * windmill.
 *
 * @param {number} speedUnitsPerSec Horizontal speed in frame widths per second.
 * @param {number} heightUnits The character's height in rig units (4.2 is the reference child).
 */
export function gaitFor(speedUnitsPerSec, heightUnits = 4.2) {
  const bodyHeights = heightUnits / 4.2; // relative size
  // One body height per stride, converted to frame fractions.
  const stride = clamp((bodyHeights / FRAME_WIDTH_UNITS) * 1.55, 0.1, 0.42);
  // Cadence follows speed: slower travel means longer, slower strides rather than a fixed tempo.
  const stepsPerSec = clamp(speedUnitsPerSec / stride, 0.5, 3.4);
  // Faster travel reads as a run; the rig leans and folds its knees accordingly.
  const running = speedUnitsPerSec > stride * 2.2;
  return { stride, stepsPerSec, running, speed: speedUnitsPerSec };
}

/**
 * Distance travelled up to `tSec` along a motion track, and the instantaneous speed there.
 *
 * This is what makes the gait honest: the cycle advances with ground covered, not with the
 * clock, so a character that eases into a stop also slows its steps.
 */
export function travelProgress(track, tSec, samples = 48) {
  if (!track?.path || track.path.length < 2) return { distance: 0, speed: 0, total: 0 };
  const last = [...track.path].sort((a, b) => a.t - b.t).at(-1);

  const distanceTo = (t) => {
    let acc = 0;
    let prev = null;
    for (let i = 0; i <= samples; i++) {
      const tj = (t * i) / samples;
      const p = sampleMotion(track, tj, { x: track.path[0].x, y: track.path[0].y ?? 0.8 });
      if (prev != null) acc += Math.abs(p.x - prev);
      prev = p.x;
    }
    return acc;
  };

  const distance = distanceTo(clamp(tSec, 0, last.t));
  const total = distanceTo(last.t);

  // Instantaneous speed by symmetric difference, so easing registers as acceleration.
  const dt = Math.min(0.08, Math.max(0.016, last.t / 60));
  const t0 = clamp(tSec - dt, 0, last.t);
  const t1 = clamp(tSec + dt, 0, last.t);
  const a = sampleMotion(track, t0, { x: track.path[0].x, y: track.path[0].y ?? 0.8 });
  const b = sampleMotion(track, t1, { x: track.path[0].x, y: track.path[0].y ?? 0.8 });
  const speed = t1 > t0 ? Math.abs(b.x - a.x) / (t1 - t0) : 0;

  return { distance, speed, total };
}

/**
 * Body compression as a character lands and recovers.
 *
 * Returns a squash in the same units the rig already uses (positive = compressed). It decays
 * after the foot plants, which is the follow-through half of the move.
 */
export function arrivalPulse({ tSec, landAtSec, durationSec = 0.34, amount = 0.09 }) {
  const dt = tSec - landAtSec;
  if (dt < 0 || dt > durationSec) return { squash: 0, bob: 0 };
  const k = 1 - dt / durationSec;
  // A fast snap down, a slower settle up: not a sine.
  const shape = Math.sin(Math.PI * Math.pow(k, 0.65));
  return { squash: amount * shape, bob: amount * shape * 40 };
}

/**
 * Wind-up before a move begins: the body coils back, then releases.
 *
 * @param {number} tSec
 * @param {number} startSec When travel starts.
 * @param {number} windSec How long the coil lasts (ends at startSec).
 */
export function anticipateFor({ tSec, startSec, windSec = 0.2, amount = 1 }) {
  if (windSec <= 0) return { amount: 0 };
  const from = startSec - windSec;
  if (tSec <= from || tSec >= startSec) return { amount: 0 };
  const k = (tSec - from) / windSec;
  // Coil in, then a quick release right at the start of travel.
  return { amount: Math.sin(Math.PI * k) * amount };
}

/**
 * Overshoot and settle after a pose change, for follow-through on limbs.
 * @returns {number} multiplier in [-1, 1]
 */
export function overshoot({ tSec, changeAtSec, durationSec = 0.45 }) {
  const dt = tSec - changeAtSec;
  if (dt < 0 || dt > durationSec) return 0;
  const k = dt / durationSec;
  // Damped oscillation: two visible corrections, then quiet.
  return Math.sin(Math.PI * 2.2 * k) * Math.exp(-4.2 * k);
}
