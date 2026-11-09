// Acting guards: pose changes inside a beat, and how they blend.
//
// Before this, a beat produced exactly one pose for its whole duration: a character surprised at
// second one was still wearing the same expression at second six. A pose track fixes that, but it
// only works if the *states* blend — you cannot interpolate the string 'idle'.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { poseStateAt, blendState, animationState } from '../apps/renderer/state.mjs';
import { solvePose } from '../apps/renderer/pose.mjs';
import { performanceFor } from '../apps/director/performance.mjs';
import { intentFor } from '../apps/director/intents.mjs';

const W = 1280;
const H = 720;
const bobby = await readJson(path.join(P.characters, 'bobby.character.json'));

const inst = (overrides = {}) => ({
  characterId: 'bobby',
  position: { x: 0.4, y: 0.82, z: 0.5 },
  scale: 1,
  facing: 'right',
  animation: 'idle',
  ...overrides,
});

const poseAt = (i, tSec) => solvePose({ character: bobby, instance: i, tSec, compositionHeight: H, compositionWidth: W });

test('the director stages more than one pose per beat', () => {
  const track = performanceFor({
    role: 'actor',
    intent: intentFor('discover'),
    emotion: 'surprised',
    durationSec: 6.3,
    travelling: false,
  });
  assert.ok(Array.isArray(track), 'an acting beat must produce a track');
  assert.ok(track.length >= 2, 'a single key is not a performance');
  const anims = track.map((k) => k.animation);
  assert.notEqual(anims[0], anims[1], 'the pose must actually change');
  // Keys must be ordered and inside the beat.
  for (let i = 1; i < track.length; i++) assert.ok(track[i].atSec > track[i - 1].atSec);
  for (const k of track) assert.ok(k.atSec >= 0 && k.atSec < 6.3);
});

test('a reactor reacts later than the actor', () => {
  const actor = performanceFor({ role: 'actor', intent: intentFor('discover'), emotion: 'surprised', durationSec: 6.3, travelling: false });
  const reactor = performanceFor({ role: 'reactor', intent: intentFor('discover'), emotion: 'surprised', durationSec: 6.3, travelling: false });
  assert.ok(reactor, 'a reactor with an emotion must react');
  assert.ok(reactor[1].atSec > actor[1].atSec, 'the reactor must not react before the actor acts');
});

test('travelling beats get no track — travel overrides the performance', () => {
  assert.equal(performanceFor({ role: 'actor', intent: intentFor('explore'), emotion: 'excited', durationSec: 7, travelling: true }), null);
});

test('an arriving actor gets no track: they are walking, not acting', () => {
  assert.equal(performanceFor({ role: 'actor', intent: intentFor('entrance'), emotion: 'happy', durationSec: 6.6, travelling: false }), null);
});

test('pose states blend instead of jumping', () => {
  const track = [{ atSec: 0, animation: 'idle' }, { atSec: 2, animation: 'wave' }];
  const before = poseStateAt({ animation: 'idle', poseTrack: track, tSec: 1.5, characterId: 'bobby' });
  const mid = poseStateAt({ animation: 'idle', poseTrack: track, tSec: 1.95, characterId: 'bobby' });
  const after = poseStateAt({ animation: 'idle', poseTrack: track, tSec: 2, characterId: 'bobby' });
  assert.equal(after.armRaise, animationState('wave', 2, 'bobby').armRaise);
  // Mid-transition sits between the two poses, not on either.
  assert.ok(mid.armRaise > before.armRaise, 'the arm must be on its way up');
  assert.ok(mid.armRaise < after.armRaise + 0.35, 'the blend must not overshoot the target');
});

test('blending never produces NaN or a half-closed blink', () => {
  const a = animationState('idle', 1, 'bobby');
  const b = { ...animationState('cry', 1, 'bobby'), tears: true, blink: true };
  const mid = blendState(a, b, 0.5);
  for (const [k, v] of Object.entries(mid)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is not finite`);
  }
  // Booleans are chosen, not averaged: a half-blinking eye is a different expression.
  assert.equal(mid.tears, true);
  assert.equal(blendState(a, b, 0.49).tears, false);
});

test('the rig plays the track it is given', () => {
  const instance = inst({
    poseTrack: [
      { atSec: 0, animation: 'idle' },
      { atSec: 3, animation: 'surprise' },
    ],
  });
  const calm = poseAt(instance, 1);
  const startled = poseAt(instance, 3.1);
  assert.ok(startled.state.mouthOpen > calm.state.mouthOpen + 0.3, 'the beat must be visible on the face');
});

test('a pose track holds before and after instead of extrapolating', () => {
  const track = [{ atSec: 1, animation: 'wave' }, { atSec: 2, animation: 'laugh' }];
  const before = poseStateAt({ animation: 'idle', poseTrack: track, tSec: 0.2, characterId: 'bobby' });
  const after = poseStateAt({ animation: 'idle', poseTrack: track, tSec: 9, characterId: 'bobby' });
  assert.equal(before.armRaise, animationState('wave', 0.2, 'bobby').armRaise);
  assert.equal(after.mouthOpen, animationState('laugh', 9, 'bobby').mouthOpen);
});

test('a scene with a travel track ignores its pose track while moving', () => {
  // Walking and gesturing at the same time is a separate feature; today travel wins, and the rig
  // must not be mid-wave while the legs are covering ground.
  const instance = inst({
    animation: 'walk',
    motion: { path: [{ t: 0, x: 0.2, y: 0.82 }, { t: 1, x: 0.6, y: 0.82 }], ease: 'linear' },
    poseTrack: [{ atSec: 0, animation: 'idle' }, { atSec: 0.5, animation: 'surprise' }],
  });
  const moving = poseAt(instance, 0.5);
  assert.equal(moving.travelling, true);
  assert.ok(Math.abs(moving.state.legSwing) > 0.02, 'the legs must be walking');
  assert.ok(moving.state.mouthOpen < 0.5, 'the surprise must not fire mid-stride');
});

test('a child feels the news before deciding what to do about it', () => {
  // Regression: a beat where Bobby had just lost his ball opened with a calm, curious body asking
  // "shall we think about it" — an adult solving logistics. A child is upset first and reasonable
  // second, and the only place that order can be staged is inside one beat.
  const track = performanceFor({
    role: 'actor',
    intent: intentFor('ask'),
    emotion: 'sad',
    durationSec: 6.2,
    travelling: false,
    lineStartSec: 0.6,
    lineDurationSec: 5.06,
    feelFirst: true,
  });
  assert.ok(Array.isArray(track) && track.length === 3, 'feel, then decide');
  assert.equal(track[1].animation, 'cry', 'the face falls first');
  assert.notEqual(track[2].animation, 'cry', 'then the character does something');
  // The feeling comes as the line starts, not before it: nobody is sad about news they have not
  // heard yet.
  assert.ok(track[1].atSec > 0.05 && track[1].atSec <= 0.6, `fell at ${track[1].atSec}s`);
  // The decision arrives while they are still talking, not long after the beat is over.
  assert.ok(track[2].atSec > track[1].atSec + 0.5);
  assert.ok(track[2].atSec < 6.2, 'the decision must land inside the beat');
});

test('feeling first is opt-in, not applied to every beat', () => {
  const plain = performanceFor({
    role: 'actor', intent: intentFor('ask'), emotion: 'happy', durationSec: 6.2,
    travelling: false, lineStartSec: 0.6, lineDurationSec: 5,
  });
  assert.ok(!plain.some((k) => k.animation === 'cry'), 'a happy question is not a sulk');
});

test('mood is a separate channel from the mouth and survives a blend', () => {
  // -1 crestfallen … +1 delighted. Without it the rig could only be crying or fine.
  assert.equal(animationState('cry', 1, 'bobby').mood, -1);
  assert.ok(animationState('laugh', 1, 'bobby').mood > 0.8);
  assert.equal(animationState('idle', 1, 'bobby').mood, 0);
  // Speaking over a sad face keeps the sad face: the jaw moves, the mood does not.
  const sad = inst({ animation: 'cry', poseTrack: [{ atSec: 0, animation: 'cry' }, { atSec: 3, animation: 'cry' }] });
  const p = poseAt(sad, 1);
  assert.equal(p.state.mood, -1);
  assert.equal(p.state.tears, true);
});
