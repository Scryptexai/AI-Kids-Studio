// The actor's performance across a beat: which pose, and when.
//
// A beat used to produce exactly one pose for its whole duration, so a character that looked
// surprised at second one was still wearing the same expression at second six. Real acting is a
// change of state inside the beat: settle, react, then rest. The director now writes that change
// as a short pose track, and the renderer blends between the keys.
//
// The writer still supplies intent only — `emotion` and `action` — and the timing is derived from
// the beat, so nothing here asks a writer to think about frames.
//
// The first version of this had a hole that was plain to see on screen: the track covered the
// opening of the beat and then stopped. A beat is 6–9 seconds long and the line only lasts about
// three, so the actor performed for three seconds and then stood perfectly still — still wearing
// the "I just spoke" pose — for the rest of the beat. Nobody on screen has finished acting while
// the camera is still rolling. Every track now ends in a settle, placed against the line.

import { EMOTION_POSE } from './intents.mjs';

const round = (v) => Number(v.toFixed(3));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Poses that read as a reaction rather than a resting state. */
const REACTIONS = new Set(['surprise', 'laugh', 'cry', 'wave']);

/**
 * When the line's last word lands.
 *
 * Speech is the clock a performance hangs from: a gesture held after the voice has finished is
 * dead air, and one released before it is a character who stopped caring mid-sentence.
 */
function lineEndFor({ durationSec, lineStartSec, lineDurationSec }) {
  if (lineDurationSec == null || lineDurationSec <= 0) return null;
  return clamp((lineStartSec ?? 0) + lineDurationSec, 0.3, durationSec - 0.15);
}

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
 * @param {number|null} [args.lineStartSec] When the actor's line starts inside the beat.
 * @param {number|null} [args.lineDurationSec] How long the actor's line lasts.
 * @returns {Array<{atSec:number, animation:string}>|null}
 */
export function performanceFor({
  role, intent, emotion, durationSec, travelling,
  lineStartSec = null, lineDurationSec = null,
}) {
  if (travelling) return null;
  const feel = EMOTION_POSE[emotion] ?? EMOTION_POSE.neutral;
  const rest = intent?.restPose ?? feel.pose ?? 'idle';
  const action = intent?.pose ?? rest;
  const lineEnd = lineEndFor({ durationSec, lineStartSec, lineDurationSec });

  if (role === 'actor') {
    // An arriving actor is walking, so there is no performance to stage.
    if (intent?.walkIn) return null;

    // Nothing new begins in the last stretch of a beat: the editor cuts there, and a pose change
    // whose blend is still running on the cut frame reads as a flicker.
    const settleLimit = durationSec - 0.3;
    // The reaction lands a beat after the line starts, not on the first frame — a character who
    // is already surprised before anything happens has nothing to react to.
    const reactAt = round(clamp(durationSec * 0.3, 0.7, Math.max(settleLimit - 0.25, 0.4)));
    // Released after the line, not after a fixed fraction of the beat: the gesture belongs to the
    // sentence. Releasing on a timer either drops the arm mid-word or holds it through silence.
    const releaseAt = round(Math.min(
      lineEnd != null ? lineEnd + 0.35 : reactAt + Math.max(durationSec * 0.28, 0.7),
      settleLimit,
    ));

    if (REACTIONS.has(action)) {
      // A beat too short for react–hold–release cuts on the reaction instead of staging half of it.
      if (reactAt > settleLimit - 0.2) return [{ atSec: 0, animation: action }];
      const track = [
        { atSec: 0, animation: rest },
        { atSec: reactAt, animation: action },
      ];
      // Then let it go. The hands come down and the shoulders settle: the beat has landed and the
      // character is listening again. Without this the actor held a startle for the last four
      // seconds of every beat.
      if (releaseAt > reactAt + 0.2) track.push({ atSec: releaseAt, animation: rest });
      return track;
    }

    // A speaking beat holds its gesture for the whole line, then relaxes. Previously the pose
    // changed a third of the way in and the actor finished the sentence in a listening body.
    const track = [{ atSec: 0, animation: action }];
    const target = feel.pose && feel.pose !== action ? feel.pose : rest;
    if (target != null && target !== action && releaseAt < settleLimit && releaseAt > 0.4) {
      track.push({ atSec: releaseAt, animation: target });
    }
    return track;
  }

  // A reactor reacts to the actor, so the reaction comes later in the beat.
  //
  // A listener's resting body is `idle`, never the actor's rest pose. Using `rest` here compared
  // a listener's emotion against the *actor's* pose — so in a celebrate beat where both resolve
  // to 'laugh' the listener got no track at all and stood frozen for eight seconds. `posesFor`
  // sets non-actors to `restAnimation: 'idle'`, and this must agree with it.
  const reactAt = round(clamp(durationSec * 0.42, 0.9, Math.max(durationSec - 0.4, 0.5)));
  const pose = feel.pose ?? 'idle';
  if (pose === 'idle') return null;

  // A listener's reaction has its own length — a laugh is not a statue. It runs about as long as
  // it takes, then relaxes. This used to hold until the cut: a listener laughing at second three
  // was still frozen mid-laugh at second six.
  const hold = clamp(reactAt * 0.45, 0.8, 1.6);
  const track = [
    { atSec: 0, animation: 'idle' },
    { atSec: reactAt, animation: pose },
  ];
  const releaseAt = round(reactAt + hold);
  if (releaseAt < durationSec - 0.3) track.push({ atSec: releaseAt, animation: 'idle' });
  return track;
}
