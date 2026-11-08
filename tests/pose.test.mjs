// Rig guards: joints, hands, and identity.
//
// These pin the things that were actually wrong, all of which were only visible in rendered
// frames: a limb that swung from one pivot like a stick, an elbow that folded the wrong way when
// the arm was raised, legs too short to carry a walk, and three characters that differed only in
// colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { animationState } from '../apps/renderer/state.mjs';
import { solvePose, handAt } from '../apps/renderer/pose.mjs';
import { renderCharacter, handPosition } from '../apps/renderer/rigs.mjs';

const W = 1280;
const H = 720;

const bobby = await readJson(path.join(P.characters, 'bobby.character.json'));
const pip = await readJson(path.join(P.characters, 'pip.character.json'));
const coco = await readJson(path.join(P.characters, 'coco.character.json'));

const instance = (overrides = {}) => ({
  characterId: 'bobby',
  position: { x: 0.5, y: 0.82, z: 0.5 },
  scale: 1,
  facing: 'right',
  animation: 'idle',
  ...overrides,
});

const poseAt = (character, instance_, tSec = 1.3) => solvePose({ character, instance: instance_, tSec, compositionHeight: H, compositionWidth: W });

test('limbs have a second joint, so a walk is not a scissor', () => {
  for (const anim of ['walk', 'run', 'jump', 'talk', 'wave', 'cry', 'laugh', 'surprise']) {
    const st = animationState(anim, 1.1, 'bobby');
    assert.equal(typeof st.kneeBend, 'number', `${anim} must drive the knee`);
    assert.equal(typeof st.elbowBend, 'number', `${anim} must drive the elbow`);
  }
});

test('a walking leg actually bends at the knee', () => {
  const pose = poseAt(bobby, instance({ animation: 'walk' }));
  for (const side of ['left', 'right']) {
    const limb = pose.limbs[side];
    // The knee must not sit on the straight line between hip and foot.
    const straight = limb.hip.y + (limb.foot.y - limb.hip.y) * 0.5;
    assert.ok(Math.abs(limb.knee.y - straight) > 0.5 || Math.abs(limb.knee.x - (limb.hip.x + limb.foot.x) / 2) > 0.5,
      `${side} leg is straight — no knee`);
  }
});

test('a raised arm bends toward the head, not into a hose', () => {
  // Regression: elbow flexion was always signed the same way, so a wave folded the forearm away
  // from the head like a bent pipe.
  const pose = poseAt(bobby, instance({ animation: 'wave' }));
  const limb = pose.limbs[pose.state.raiseSide] ?? pose.limbs.right;
  assert.ok(limb.elbowFold > 10, 'a wave must have a bent elbow');
  // The hand must be higher than the elbow, i.e. reaching up rather than drooping.
  assert.ok(limb.hand.y < limb.elbow.y, 'the wave hand must be above the elbow');
});

test('handPosition and the drawn pose are the same point', () => {
  for (const anim of ['idle', 'walk', 'wave', 'talk']) {
    const inst = instance({ animation: anim });
    const pose = poseAt(bobby, inst);
    for (const side of ['left', 'right']) {
      const hand = handPosition({ character: bobby, instance: inst, tSec: 1.3, compositionHeight: H, compositionWidth: W, side });
      assert.ok(Math.abs(hand.px - handAt(pose, side).x) < 1e-9, `${anim}/${side} hand x drifted`);
      assert.ok(Math.abs(hand.py - handAt(pose, side).y) < 1e-9, `${anim}/${side} hand y drifted`);
    }
  }
});

test('legs are long enough and far enough apart to read as legs', () => {
  // Regression: the first pass had legs at 0.26 of body height with the hips almost touching, so
  // a standing character looked like a single column.
  const pose = poseAt(bobby, instance());
  assert.ok(pose.legLen > pose.bodyH * 0.9, 'legs must be comparable to the torso');
  const gap = Math.abs(pose.limbs.left.hip.x - pose.limbs.right.hip.x);
  assert.ok(gap > pose.bodyW * 0.4, 'hips must be apart');
});

test('every character has its own visual identity, not just a palette', () => {
  for (const [name, character] of [['bobby', bobby], ['pip', pip], ['coco', coco]]) {
    const look = character.visual?.look;
    assert.ok(look, `${name} has no look block`);
    assert.match(look.skin, /^#[0-9a-f]{6}$/i, `${name} skin colour`);
    assert.ok(look.hairStyle, `${name} needs a hairstyle`);
  }
  // They must be distinguishable at a glance, not just tinted.
  const styles = new Set([bobby.visual.look.hairStyle, pip.visual.look.hairStyle, coco.visual.look.hairStyle]);
  assert.ok(styles.size >= 2, 'at least two distinct hairstyles');
  const heights = new Set([bobby, pip, coco].map((c) => c.visual.bodyProportions.heightUnits));
  assert.equal(heights.size, 3, 'the cast must differ in size');
});

test('rendering is deterministic and survives every pose in the library', () => {
  for (const anim of ['idle', 'walk', 'run', 'jump', 'talk', 'wave', 'laugh', 'cry', 'surprise']) {
    const inst = instance({ animation: anim });
    const a = renderCharacter({ character: bobby, instance: inst, tSec: 0.9, compositionHeight: H, compositionWidth: W });
    const b = renderCharacter({ character: bobby, instance: inst, tSec: 0.9, compositionHeight: H, compositionWidth: W });
    assert.equal(a, b, `${anim} is not deterministic`);
    assert.ok(a.length > 500, `${anim} produced almost no markup`);
    assert.ok(!a.includes('NaN'), `${anim} produced NaN coordinates`);
  }
});
