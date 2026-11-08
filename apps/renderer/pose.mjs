// Body layout and joint angles for a character at one instant.
//
// Why this is one function instead of two
//   The rig used to compute the body layout inside `renderCharacter` and again inside
//   `handPosition`. When the second copy drifted the hand was in the wrong place and a carried
//   ball floated beside the character. The joints are now solved once, and the drawing, the hand
//   query and the prop attachment all read the same numbers.
//
// The rig is a cutout skeleton: hips and shoulders rotate, and each limb has a second joint
// (knee, elbow). Two joints are what separate a walk from a scissor: the back leg folds as it
// passes under the body, and an arm gesture bends instead of pointing like a stick.

import { sampleMotionWithDepth, travelDirection } from './motion.mjs';
import { animationState } from './state.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Proportions, expressed as fractions of body height. Kept here so every part agrees. */
const SHAPE = {
  headRadius: 0.16,
  bodyWidth: 0.23,
  bodyHeight: 0.31,
  // Legs carry a child's weight and make a walk readable. The first pass kept them at 0.26 of
  // body height with the hips close together, so a standing figure looked like one column.
  legLength: 0.31,
  armLength: 0.30, // fraction of body height, per whole arm
  hipSpread: 0.34, // fraction of body width
  shoulderSpread: 0.5,
  shoulderDrop: 0.16, // fraction of body height below the top of the torso
  // A walking leg folds this hard at the knee at most.
  maxKneeFold: 62,
  maxElbowFold: 78,
};

/**
 * Full pose for one character instance at time `tSec`.
 *
 * Returns geometry in composition pixels plus the joint angles used, so callers can either draw
 * it or ask where a hand is and get an answer consistent with the drawing.
 */
export function solvePose({ character, instance, tSec, compositionHeight, compositionWidth, travelling: forceTravelling }) {
  const motion = sampleMotionWithDepth(instance.motion, tSec, {
    ...instance.position,
    depth: instance.depth ?? 0.5,
  });
  const effectiveScale = instance.scale * motion.scale;
  const travelling = forceTravelling ?? Boolean(motion.moving && instance.motion);
  const st = animationState(instance.animation, tSec, character.id);

  // While travelling the limbs must swing even if the beat's pose is something else — a character
  // can walk and talk at the same time.
  if (travelling) {
    const phase = (tSec * 1.1 + 0.25) * Math.PI * 2;
    const step = Math.sin(phase * 1.6);
    st.legSwing = step * 0.55;
    st.armSwing = -step * 0.4;
    st.bobY = Math.abs(step) * -3;
    st.kneeBend = (1 - step) * 0.5;
    st.elbowBend = 0.2 + Math.max(0, -step) * 0.45;
  }

  const baseHeight = 205 * (character.visual.bodyProportions.heightUnits / 4.2);
  const h = baseHeight * effectiveScale;
  const headScale = character.visual.bodyProportions.headScale ?? 1;

  const headR = h * SHAPE.headRadius * headScale;
  const bodyW = h * SHAPE.bodyWidth;
  const bodyH = h * SHAPE.bodyHeight;
  const legLen = h * SHAPE.legLength;
  const armLen = h * SHAPE.armLength;

  const travelDir = travelling ? travelDirection(instance.motion, tSec) : null;
  const facingDir = (travelDir ?? instance.facing) === 'left' ? -1 : 1;

  const cx = motion.x * compositionWidth;
  const groundY = motion.y * compositionHeight;
  const footY = groundY + st.hopY + st.bobY;
  const bodyTop = footY - legLen - bodyH;
  const headCy = bodyTop - headR * 0.9 + st.headBob * h;

  const hipY = bodyTop + bodyH * 0.9;
  const shoulderY = bodyTop + bodyH * SHAPE.shoulderDrop;

  const limbs = {
    left: solveLimb({ dir: -1, side: 'left', st, bodyW, bodyH, armLen, legLen, hipY, shoulderY, cx }),
    right: solveLimb({ dir: 1, side: 'right', st, bodyW, bodyH, armLen, legLen, hipY, shoulderY, cx }),
  };

  return {
    motion,
    effectiveScale,
    travelling,
    facingDir,
    state: st,
    // Geometry in pixels.
    cx,
    groundY,
    footY,
    bodyTop,
    headCy,
    headR,
    bodyW,
    bodyH,
    legLen,
    armLen,
    hipY,
    shoulderY,
    h,
    limbs,
  };
}

/** One arm and one leg on one side, with their second joints. */
function solveLimb({ dir, side, st, bodyW, bodyH, armLen, legLen, hipY, shoulderY, cx }) {
  const swing = dir === 1 ? st.armSwing : -st.armSwing;
  const raise = st.raiseSide === 0 || st.raiseSide === dir ? st.armRaise : 0;
  // SVG's rotate() maps a downward vector (0,1) to (-sin, cos), so a positive angle swings the
  // right arm ACROSS the body. Negated: negative = outward for the right arm.
  const shoulderAngle = -(dir * 8 + swing * 26 + dir * raise * 115);

  const shoulderX = cx + dir * bodyW * SHAPE.shoulderSpread;
  const hipX = cx + dir * bodyW * SHAPE.hipSpread;

  const legSwingDeg = (dir === 1 ? st.legSwing : -st.legSwing) * 55;
  const kneeFold = clamp(st.kneeBend, 0, 1) * SHAPE.maxKneeFold;
  const elbowFold = clamp(st.elbowBend, 0, 1.2) * SHAPE.maxElbowFold;

  // Joint positions, computed forward from the parent. Keeping this arithmetic here means the
  // hand query and the drawing cannot disagree.
  const shoulder = { x: shoulderX, y: shoulderY };
  const elbow = {
    x: shoulder.x - Math.sin(rad(shoulderAngle)) * armLen * 0.5,
    y: shoulder.y + Math.cos(rad(shoulderAngle)) * armLen * 0.5,
  };
  // Elbow flexion folds the forearm toward the biceps. With the arm hanging, the biceps faces
  // forward, so the hand comes forward. With the arm raised overhead the biceps faces the other
  // way, so the same fold must rotate the other direction — without this a wave bends at the
  // elbow like a hose instead of reaching up.
  const foldSign = raise > 0.35 ? -1 : 1;
  const forearmAngle = shoulderAngle + dir * foldSign * elbowFold;
  const hand = {
    x: elbow.x - Math.sin(rad(forearmAngle)) * armLen * 0.5,
    y: elbow.y + Math.cos(rad(forearmAngle)) * armLen * 0.5,
  };

  const hip = { x: hipX, y: hipY };
  const knee = {
    x: hip.x + Math.sin(rad(legSwingDeg)) * legLen * 0.5,
    y: hip.y + Math.cos(rad(legSwingDeg)) * legLen * 0.5,
  };
  // The shin folds backward, away from the direction of travel.
  const shinAngle = legSwingDeg - kneeFold;
  const foot = {
    x: knee.x + Math.sin(rad(shinAngle)) * legLen * 0.5,
    y: knee.y + Math.cos(rad(shinAngle)) * legLen * 0.5,
  };

  return {
    side,
    dir,
    shoulderAngle,
    elbowFold,
    legSwingDeg,
    kneeFold,
    shoulder,
    elbow,
    hand,
    hip,
    knee,
    foot,
  };
}

/**
 * Where a hand is, derived from the same pose the rig draws.
 * @param {'left'|'right'} [side]
 */
export function handAt(pose, side = 'right') {
  return pose.limbs[side]?.hand ?? pose.limbs.right.hand;
}
