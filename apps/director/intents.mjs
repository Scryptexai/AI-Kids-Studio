// Intent table: what a story verb means on screen.
//
// The writer never says "put Bobby at x=0.38 facing right playing walk". They say
// `action: "discover"`. This table turns that into blocking, pose and shot decisions.
// Keeping it in one file means directing notes are tunable without touching the engine.
//
// Fields per intent:
//   stance   — where the actor stands relative to their default mark
//   pose     — which rig animation plays (must exist in the world animationCatalog)
//   facing   — which way the actor looks, overridable by the target's position
//   shot     — camera framing the editor wants for this beat
//   offset   — how far apart the actors stand (fraction of frame width)
//   transition — pose used to arrive at this beat when it follows another beat
//   priority — when two beats want the same actor, higher wins the pose

export const INTENTS = {
  entrance: {
    note: 'Someone arrives: walk in from the frame edge, stop, look at the others.',
    walkIn: true,
    pose: 'walk',
    restPose: 'idle',
    facing: 'toward-partner',
    shot: 'wide',
    offset: 0.26,
    transition: 'walk',
  },
  discover: {
    note: 'The actor finds something: look up at the prop, lean toward it, react.',
    stance: 'lean-to-prop',
    pose: 'surprise',
    restPose: 'curious',
    facing: 'toward-prop',
    shot: 'medium',
    offset: 0.22,
    transition: 'walk',
  },
  explain: {
    note: 'Speaking to the group, steady, facing the audience side of the other actors.',
    stance: 'centre',
    pose: 'talk',
    restPose: 'talk',
    facing: 'toward-partner',
    shot: 'medium',
    offset: 0.24,
    transition: 'walk',
  },
  ask: {
    note: 'A question: turn to the partner, tilt head, hold the beat.',
    stance: 'toward-partner',
    pose: 'talk',
    restPose: 'curious',
    facing: 'toward-partner',
    shot: 'medium',
    offset: 0.2,
    transition: 'walk',
  },
  celebrate: {
    note: 'Joy: jump, land, arms up. The widest, brightest pose in the set.',
    stance: 'centre',
    pose: 'jump',
    restPose: 'laugh',
    facing: 'toward-camera',
    shot: 'wide',
    offset: 0.3,
    transition: 'run',
  },
  explore: {
    note: 'Moving through the world: walk toward the next mark, camera follows.',
    stance: 'walk-to',
    pose: 'walk',
    restPose: 'walk',
    facing: 'travel-direction',
    shot: 'wide',
    offset: 0.3,
    transition: 'walk',
  },
  react: {
    note: 'Short reaction: one beat, no line needed, eyes on whoever is speaking.',
    stance: 'hold',
    pose: 'surprise',
    restPose: 'idle',
    facing: 'toward-partner',
    shot: 'close-up',
    offset: 0.2,
    transition: 'idle',
  },
  console: {
    note: 'Comforting: step close to the target, gentle wave, warm pose.',
    stance: 'close-to-target',
    pose: 'wave',
    restPose: 'talk',
    facing: 'toward-partner',
    shot: 'medium',
    offset: 0.16,
    transition: 'walk',
  },
  depart: {
    note: 'Leaving: turn away and walk off toward the frame edge.',
    walkOut: true,
    pose: 'walk',
    restPose: 'walk',
    facing: 'away',
    shot: 'wide',
    offset: 0.3,
    transition: 'walk',
  },
  idle: {
    note: 'Holding beat: breathe, blink, let the audience settle.',
    stance: 'hold',
    pose: 'idle',
    restPose: 'idle',
    facing: 'toward-camera',
    shot: 'wide',
    offset: 0.24,
    transition: 'walk',
  },
};

/** Emotion → which rig pose/expression carries it when the actor is not speaking. */
export const EMOTION_POSE = {
  neutral: { pose: 'idle', expression: 'neutral' },
  happy: { pose: 'laugh', expression: 'happy' },
  excited: { pose: 'jump', expression: 'excited' },
  sad: { pose: 'cry', expression: 'sad' },
  surprised: { pose: 'surprise', expression: 'surprised' },
  curious: { pose: 'idle', expression: 'curious' },
  laughing: { pose: 'laugh', expression: 'happy' },
};

/** Shot → camera framing. zoom multiplies the 1.0 wide framing. */
export const SHOTS = {
  wide: { zoom: 1.0, y: 0.5, label: 'wide' },
  medium: { zoom: 1.34, y: 0.52, label: 'medium' },
  'close-up': { zoom: 1.9, y: 0.55, label: 'close-up' },
  establishing: { zoom: 0.92, y: 0.46, label: 'establishing' },
};

/** Rough speaking rate used only when a script has no measured audio yet. */
export const SPEAKING_CHARS_PER_SEC = 14.5;

export function estimateLineDuration(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  // Indonesian children's pacing: ~2.4 words/sec, plus a breath at the end.
  return Number(Math.max(1.2, words / 2.4 + 0.35).toFixed(3));
}

export function intentFor(action) {
  const intent = INTENTS[action];
  if (!intent) {
    throw new Error(`unknown action '${action}' — known: ${Object.keys(INTENTS).join(', ')}`);
  }
  return intent;
}
