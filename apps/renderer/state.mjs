// Animation state for the rig: the numbers a pose needs at a given instant.
//
// Kept apart from rigs.mjs so pose.mjs can import it without importing the renderer (which would
// be a cycle: rigs → pose → rigs).
//
// Joint angles matter as much as the main swing. A limb that only rotates at the shoulder or hip
// swings like a stick; `elbowBend` and `kneeBend` give it a second joint, which is what makes a
// walk read as walking and a gesture read as a gesture.

const TAU = Math.PI * 2;

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Deterministic pseudo-random in [0,1) so a frame renders identically on every machine. */
function noise(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Rendered body height in pixels for a character instance. Shared by the rig and by prop
 * attachment so a carried object lands in the hands rather than at the feet.
 */
export function bodyHeightPx(instance, character) {
  const heightUnits = character?.visual?.bodyProportions?.heightUnits ?? 4.2;
  return 205 * (heightUnits / 4.2) * (instance?.scale ?? 1);
}

/**
 * Animation state for a character at a given local time.
 * Joint angles are what make the motion read: a limb that only rotates at the shoulder or hip
 * swings like a stick. `elbowBend` and `kneeBend` add the second joint, so a walk has knees and
 * a gesture has an elbow.
 *
 * @returns {{bobY:number, squash:number, tilt:number, armSwing:number, legSwing:number,
 *            elbowBend:number, kneeBend:number, mouthOpen:number, blink:boolean, hopY:number,
 *            tears:boolean, armRaise:number, raiseSide:number, headBob:number}}
 */
export function animationState(animationId, tSec, characterId) {
  const seed = [...characterId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const phase = TAU * (tSec * 1.1 + noise(seed) * 0.5);
  const state = {
    bobY: 0,
    squash: 0,
    tilt: 0,
    armSwing: 0,
    legSwing: 0,
    mouthOpen: 0,
    blink: false,
    hopY: 0,
    tears: false,
    armRaise: 0,
    raiseSide: 1,
    // Second joints. Positive elbowBend brings the forearm forward; positive kneeBend lifts the
    // shin backward, which is how a real walking leg moves.
    elbowBend: 0,
    kneeBend: 0,
    headBob: 0,
    lean: 0,
  };

  switch (animationId) {
    case 'idle':
      // Breathing: chest rises, arms drift, head settles a beat behind the body.
      state.bobY = Math.sin(phase) * 1.2;
      state.armSwing = Math.sin(phase * 0.5) * 0.05;
      state.elbowBend = 0.12 + Math.sin(phase * 0.5) * 0.04;
      state.kneeBend = 0.04;
      state.headBob = Math.sin(phase - 0.6) * 0.012;
      break;
    case 'walk': {
      const step = Math.sin(phase * 1.6);
      state.bobY = Math.abs(step) * -3;
      state.legSwing = step * 0.55;
      state.armSwing = -step * 0.4;
      // The back leg folds while it passes under the body; elbows follow the swing.
      state.kneeBend = (1 - step) * 0.5;
      state.elbowBend = 0.2 + Math.max(0, -step) * 0.45;
      state.headBob = Math.sin(phase * 3.2) * 0.01;
      break;
    }
    case 'run': {
      const step = Math.sin(phase * 2.2);
      state.bobY = Math.abs(step) * -6;
      state.legSwing = step * 0.9;
      state.armSwing = -step * 0.8;
      state.tilt = step * 0.06;
      // Running folds the knees hard and pumps the elbows to ~90 degrees.
      state.kneeBend = (1 - step) * 0.95;
      state.elbowBend = 0.9 + Math.max(0, -step) * 0.5;
      state.lean = 0.08;
      break;
    }
    case 'jump': {
      const cycle = (tSec * 1.4) % 1;
      state.hopY = -Math.sin(cycle * Math.PI) * 26;
      state.squash = cycle < 0.12 ? 0.12 : cycle > 0.88 ? 0.1 : -0.06;
      state.armRaise = 0.55;
      // Crouch, then tuck the knees at the apex, then reach for the ground on the way down.
      state.kneeBend = cycle < 0.12 ? 0.85 : Math.max(0, Math.sin(cycle * Math.PI)) * 0.7;
      state.elbowBend = 0.5;
      break;
    }
    case 'talk':
      state.mouthOpen = 0.35 + 0.65 * Math.abs(Math.sin(phase * 4.2));
      state.bobY = Math.sin(phase * 1.2) * 1.5;
      state.armSwing = Math.sin(phase * 1.1) * 0.12;
      // Hands come up to the body while speaking — the gesture children actually make.
      state.elbowBend = 0.55 + Math.sin(phase * 1.1) * 0.22;
      state.kneeBend = 0.05;
      state.headBob = Math.sin(phase * 2.4) * 0.018;
      break;
    case 'wave':
      state.armRaise = 0.9 + Math.sin(phase * 3.2) * 0.18;
      state.raiseSide = 1;
      state.mouthOpen = 0.4;
      state.bobY = Math.sin(phase * 0.9) * 1.5;
      // A raised arm needs a bent elbow to look like a wave rather than a salute.
      state.elbowBend = 0.85 + Math.sin(phase * 3.2) * 0.35;
      state.headBob = Math.sin(phase * 0.9) * 0.01;
      break;
    case 'laugh':
      state.mouthOpen = 1;
      state.tilt = Math.sin(phase * 4) * 0.1;
      state.bobY = Math.abs(Math.sin(phase * 4)) * -3;
      state.armRaise = 0.3;
      state.elbowBend = 0.7;
      state.kneeBend = 0.12;
      state.lean = Math.sin(phase * 4) * 0.03;
      break;
    case 'cry':
      state.tears = true;
      state.mouthOpen = 0.25;
      state.bobY = Math.sin(phase * 1.6) * 2;
      state.tilt = Math.sin(phase * 0.8) * 0.05;
      // Shoulders in, elbows tucked: a slumped, small silhouette.
      state.elbowBend = 0.45;
      state.kneeBend = 0.18;
      state.lean = 0.04;
      break;
    case 'surprise':
      state.squash = -0.1;
      state.mouthOpen = 0.9;
      state.hopY = -8;
      state.armRaise = 0.75;
      // Arms fly up and the elbows open — the classic startle shape.
      state.elbowBend = 0.35;
      state.kneeBend = 0.22;
      state.headBob = -0.02;
      break;
    default:
      state.bobY = Math.sin(phase) * 1;
  }

  state.blink = noise(Math.floor(tSec * 2.7) + seed) > 0.93;
  return state;
}


export const esc = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
