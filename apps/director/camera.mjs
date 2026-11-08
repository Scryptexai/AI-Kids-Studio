// Camera direction: choose a shot from the beat's intent, then solve continuous keyframes.
//
// The renderer interpolates keyframes with smoothstep, so the director only has to place a
// few well-chosen stops: an establish, the settle on the actor, and a gentle drift so the
// frame never feels locked off. Overlapping actors are the main constraint — the camera must
// frame the actor AND their partner, otherwise a two-hander looks like a solo shot.
import { SHOTS } from './intents.mjs';

const round = (v, p = 4) => Number(v.toFixed(p));

/**
 * Framing for one beat.
 * @param {object} block  result of blockBeat()
 * @param {object} opts   { shotOverride, intensity, durationSec }
 */
export function frameBeat({ block, shotOverride = null, intensity = 0.5, durationSec = 4 }) {
  const shotName = shotOverride ?? block.intent.shot ?? 'wide';
  const shot = SHOTS[shotName] ?? SHOTS.wide;

  const actor = block.positions.get(block.actorId);
  const partner = block.partnerId ? block.positions.get(block.partnerId) : null;
  const propX = block.propPlacement?.x ?? null;

  // Centre between the actor and whatever they are interacting with.
  const focusPoints = [actor.x];
  if (partner) focusPoints.push(partner.x);
  else if (propX != null) focusPoints.push(propX);
  const centreX = focusPoints.reduce((a, b) => a + b, 0) / focusPoints.length;

  // If the pair is too far apart for the requested shot, widen so both stay in frame.
  const spread = Math.max(...focusPoints) - Math.min(...focusPoints);
  const maxSpreadForShot = 0.42 / shot.zoom;
  const zoom = spread > maxSpreadForShot
    ? round(Math.max(0.9, 0.42 / Math.max(spread, 0.01)))
    : shot.zoom;

  // Higher intensity means a tighter, more urgent push-in.
  const intensityBias = 1 + (intensity - 0.5) * 0.12;
  const settledZoom = round(zoom * intensityBias);
  const y = round(shot.y);

  const stops = [];
  // 1. Establish: start slightly wider and off-centre so the move has direction.
  stops.push({ t: 0, x: round(centreX - 0.035), y: round(y + 0.012), zoom: round(settledZoom * 0.94) });

  // 2. Settle on the subject as the line lands.
  const settleAt = round(Math.min(durationSec * 0.35, 1.6));
  stops.push({ t: settleAt, x: round(centreX), y, zoom: settledZoom });

  // 3. Drift: a slow float (or a push-in for high intensity) so nothing feels frozen.
  const driftDir = block.facing === 'right' ? 1 : -1;
  const driftAmount = block.intent.shot === 'close-up' ? 0.008 : 0.02;
  stops.push({
    t: round(Math.max(settleAt + 0.6, durationSec * 0.82)),
    x: round(centreX + driftDir * driftAmount),
    y: round(y - 0.006),
    zoom: round(settledZoom * (intensity > 0.66 ? 1.05 : 1.015)),
  });

  // 4. Hold to the end so the last frames do not snap back.
  if (stops.at(-1).t < durationSec) {
    stops.push({ ...stops.at(-1), t: round(durationSec) });
  }

  return {
    preset: shotName,
    keyframes: stops.filter((s, i, arr) => i === 0 || s.t > arr[i - 1].t),
    focusX: round(centreX),
    solvedZoom: settledZoom,
    widenedForSpread: spread > maxSpreadForShot,
  };
}

/**
 * Scene-to-scene continuity. A location change wants an establishing beat before the action
 * resumes; the same location keeps the previous framing energy.
 */
export function shotForTransition({ fromLocation, toLocation, intent, previousShot }) {
  if (fromLocation && toLocation && fromLocation !== toLocation) return 'establishing';
  if (previousShot === 'close-up' && intent.shot === 'close-up') return 'medium';
  return intent.shot ?? 'wide';
}
