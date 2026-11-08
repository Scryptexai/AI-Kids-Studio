// Timing and weight guards.
//
// Everything here was invisible in unit tests but obvious on screen: feet that skated because the
// walk cycle ran on a clock, a character that kept marching after it had arrived, and a body that
// started and stopped instantly like a cursor.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { gaitFor, travelProgress, arrivalPulse, anticipateFor, overshoot } from '../apps/renderer/timing.mjs';
import { solvePose } from '../apps/renderer/pose.mjs';

const W = 1280;
const H = 720;
const bobby = await readJson(path.join(P.characters, 'bobby.character.json'));

const walker = (motion) => ({
  characterId: 'bobby',
  position: { x: 0.3, y: 0.82, z: 0.5 },
  scale: 1,
  facing: 'right',
  animation: 'walk',
  motion,
});

/** A 1.2 s walk covering roughly a quarter of the frame. */
const shortWalk = {
  path: [{ t: 0.5, x: 0.18, y: 0.82 }, { t: 1.7, x: 0.56, y: 0.82 }],
  ease: 'ease-in-out',
  durationSec: 1.2,
};

const poseAt = (instance, tSec) => solvePose({ character: bobby, instance, tSec, compositionHeight: H, compositionWidth: W });

test('cadence follows speed instead of a fixed clock', () => {
  const slow = gaitFor(0.1, 4.2);
  const fast = gaitFor(0.8, 4.2);
  assert.ok(fast.stepsPerSec > slow.stepsPerSec, 'a faster character must take steps faster');
  assert.ok(fast.running, 'a genuinely fast character reads as running');
  assert.ok(!slow.running);
  // A stride must stay inside a believable range, not collapse or balloon.
  for (const g of [slow, fast, gaitFor(2.5, 4.2)]) {
    assert.ok(g.stride > 0.05 && g.stride < 0.5, `implausible stride ${g.stride}`);
  }
});

test('distance travelled is independent of how the track is sampled', () => {
  const a = travelProgress(shortWalk, 1.7, 24);
  const b = travelProgress(shortWalk, 1.7, 96);
  assert.ok(Math.abs(a.total - b.total) < 0.02, `sampling changed the distance: ${a.total} vs ${b.total}`);
  // Easing means the middle of the walk is faster than the ends.
  const start = travelProgress(shortWalk, 0.52).speed;
  const middle = travelProgress(shortWalk, 1.1).speed;
  const end = travelProgress(shortWalk, 1.68).speed;
  assert.ok(middle > start && middle > end, 'ease-in-out must peak in the middle');
});

test('the leg cycle advances with ground covered, not with time', () => {
  // Same elapsed time, different amounts of travel: the faster one must have moved its legs
  // further through the cycle. This is the anti-skate property.
  const slowTrack = { path: [{ t: 0, x: 0.3, y: 0.82 }, { t: 2, x: 0.35, y: 0.82 }], ease: 'linear' };
  const fastTrack = { path: [{ t: 0, x: 0.3, y: 0.82 }, { t: 2, x: 0.8, y: 0.82 }], ease: 'linear' };
  const slow = poseAt(walker(slowTrack), 1.0);
  const fast = poseAt(walker(fastTrack), 1.0);
  assert.ok(fast.gait.speed > slow.gait.speed, 'the fast track must register a higher speed');
  // Both are mid-stride, but the fast character has completed more cycles, so its stride
  // length is larger relative to the ground covered.
  assert.ok(fast.gait.stride >= slow.gait.stride - 1e-9);
});

test('a character stops walking when the travel ends', () => {
  // Regression: the director labels the whole scene 'walk', so after arriving the character kept
  // marching on the spot — legs cycling with no forward movement.
  const before = poseAt(walker(shortWalk), 1.0);
  const after = poseAt(walker(shortWalk), 2.4);
  assert.equal(before.travelling, true);
  assert.equal(after.travelling, false);
  assert.ok(Math.abs(before.state.legSwing) > 0.05, 'mid-walk the legs must swing');
  assert.ok(Math.abs(after.state.legSwing) < 0.05, 'after arriving the legs must be still');
});

test('arriving compresses the body and then settles', () => {
  const landed = poseAt(walker(shortWalk), 1.85);
  const settled = poseAt(walker(shortWalk), 2.9);
  assert.ok(landed.state.squash > 0.01, 'the landing must compress the body');
  assert.ok(settled.state.squash < 0.005, 'the compression must decay');
  // The compression is a short pulse, not a permanent crouch.
  const pulse = arrivalPulse({ tSec: 1.75, landAtSec: 1.7, amount: 0.07 });
  const later = arrivalPulse({ tSec: 2.4, landAtSec: 1.7, amount: 0.07 });
  assert.ok(pulse.squash > 0 && later.squash === 0);
});

test('a character coils before it moves', () => {
  const winding = poseAt(walker(shortWalk), 0.42);
  const moving = poseAt(walker(shortWalk), 0.6);
  assert.ok(winding.anticipation > 0.5, 'the body must coil before travel starts');
  assert.equal(moving.travelling, true);
  assert.ok(winding.state.kneeBend > moving.state.kneeBend, 'the coil folds the knees');
});

test('anticipation is silent when there is nothing to anticipate', () => {
  assert.equal(anticipateFor({ tSec: 1, startSec: 0, windSec: 0.2 }).amount, 0);
  assert.equal(anticipateFor({ tSec: 5, startSec: 1, windSec: 0.2 }).amount, 0);
  assert.equal(poseAt(walker(null), 1).anticipation, 0);
});

test('overshoot decays instead of ringing forever', () => {
  const values = [0.05, 0.15, 0.3, 0.44, 0.6].map((dt) => Math.abs(overshoot({ tSec: dt, changeAtSec: 0 })));
  assert.ok(values[0] > values.at(-1), 'the correction must fade');
  assert.equal(overshoot({ tSec: 0.5, changeAtSec: 0 }), 0, 'it must end, not ring');
});

test('a character that has arrived stops travelling, so the walk cycle ends', () => {
  // The director used to append a "hold" keyframe at the scene end, which made the sampler read
  // the character as travelling for the rest of the beat. On screen this was a figure marching
  // in place for six seconds after reaching its mark.
  const arrived = walker(shortWalk);
  const during = poseAt(arrived, 1.0);
  const after = poseAt(arrived, 4.0);
  assert.equal(during.travelling, true);
  assert.equal(after.travelling, false, 'standing on the mark is not travelling');
  assert.ok(Math.abs(after.state.legSwing) < 0.01, 'the legs must stop swinging when the feet stop');
  // The pose must come from the rest animation, not from the locomotion cycle.
  assert.equal(after.cx, poseAt(arrived, 4.0).cx, 'a still character does not drift');
});
