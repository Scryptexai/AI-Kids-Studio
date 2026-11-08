// The actor's performance across a beat: which pose, and when.
//
// A beat used to produce exactly one pose for its whole duration, so a character that looked
// surprised at second one was still wearing the same expression at second six. Real acting is a
// change of state inside the beat: settle, react, then rest. The director now writes that change
// as a short pose track, and the renderer blends between the keys.
//
// The writer still supplies intent only — `emotion` and `action` — and the timing is derived from
// the beat, so nothing here asks a writer to think about frames.

import { EMOTION_POSE } from './intents.mjs';

const round = (v) => Number(v.toFixed(3));

/** Poses that read as a reaction rather than a resting state. */
const REACTIONS = new Set(['surprise', 'laugh', 'cry', 'wave']);

/**
 * Build the pose track for one character in one beat.
 *
 * @param {object} args
 * @param {'actor'|'reactor'} args.role
 * @param {object} args.intent  The beat's resolved intent (action pose, rest pose, walk-in).
 * @param {string} args.emotion The beat's emotion, which drives the face.
 * @param {number} args.durationSec
 * @param {boolean} args.travelling Whether the character walks during this beat — travel
 *   overrides the performance, so a track would be dead weight.
 * @returns {Array<{atSec:number, animation:string}>|null}
 */
export function performanceFor({ role, intent, emotion, durationSec, travelling }) {
  if (travelling) return null;
  const feel = EMOTION_POSE[emotion] ?? EMOTION_POSE.neutral;
  const rest = intent?.restPose ?? feel.pose ?? 'idle';
  const action = intent?.pose ?? rest;

  if (role === 'actor') {
    // An arriving actor is walking, so there is no performance to stage.
    if (intent?.walkIn) return null;

    // The reaction lands a beat after the line starts, not on the first frame — a character who
    // is already surprised before anything happens has nothing to react to.
    const reactAt = round(Math.min(Math.max(durationSec * 0.3, 0.7), Math.max(durationSec - 0.5, 0.4)));
    const settleAt = round(Math.min(reactAt + Math.max(durationSec * 0.28, 0.7), durationSec));

    // When the action pose already *is* the reaction, playing it twice would be a loop.
    if (REACTIONS.has(action)) {
      return [
        { atSec: 0, animation: rest },
        { atSec: reactAt, animation: action },
        ...(settleAt < durationSec - 0.05 ? [{ atSec: settleAt, animation: rest }] : []),
      ];
    }

    // Otherwise: settle into the action, then land the emotion on top of it.
    return [
      { atSec: 0, animation: action },
      ...(feel.pose && feel.pose !== action && settleAt < durationSec - 0.05
        ? [{ atSec: settleAt, animation: feel.pose }]
        : []),
    ];
  }

  // A reactor reacts to the actor, so the reaction comes later in the beat and holds.
  const reactAt = round(Math.min(Math.max(durationSec * 0.42, 0.9), Math.max(durationSec - 0.4, 0.5)));
  const pose = feel.pose ?? 'idle';
  if (pose === 'idle') return null;
  return [
    { atSec: 0, animation: 'idle' },
    { atSec: reactAt, animation: pose },
  ];
}
