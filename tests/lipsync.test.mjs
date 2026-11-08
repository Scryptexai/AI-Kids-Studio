// Speech guards: the mouth has to follow the sound.
//
// The defect these pin was the most obvious thing in the episode and it survived every green
// test: nobody's mouth moved while they spoke. `talk` animated the mouth from a sine, so it
// flapped on a clock when nothing was being said, and `travelling` overwrote the whole pose state
// so a character who spoke while walking had a mouth welded shut.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { P, ROOT } from '../scripts/lib/paths.mjs';
import { mouthFor, envelopeFor } from '../apps/renderer/lipsync.mjs';
import { solvePose } from '../apps/renderer/pose.mjs';

const W = 1280;
const H = 720;
const bobby = await readJson(path.join(P.characters, 'bobby.character.json'));

/** A real line from the episode, so the envelope under test is the one on screen. */
const wav = 'audio/generated/ep-002/sc-002-b02-miss/b02-miss-d01.wav';
const hasAudio = fs.existsSync(path.join(ROOT, wav));

const line = (overrides = {}) => ({
  characterId: 'pip',
  startSec: 0.6,
  durationSec: 5.203,
  audioAsset: wav,
  ...overrides,
});

test('the mouth is driven by the audio amplitude, not by a clock', { skip: !hasAudio && 'no rendered audio' }, () => {
  const dialogue = [line()];
  const samples = [];
  for (let t = 0.6; t < 5.9; t += 0.05) {
    samples.push(mouthFor({ dialogue, characterId: 'pip', tSec: Number(t.toFixed(3)) }));
  }
  assert.ok(samples.every((v) => v != null), 'the speaker must have a mouth for the whole line');
  // Speech is bursts: the envelope must move, and must spend time both open and nearly closed.
  assert.ok(new Set(samples.map((v) => v.toFixed(2))).size > 8, 'the mouth is not moving');
  assert.ok(Math.max(...samples) > 0.5, 'the mouth never really opens');
  assert.ok(Math.min(...samples) < 0.15, 'the mouth never closes between words');
  // Determinism: the same time must give the same shape, or a frame is not reproducible.
  assert.equal(mouthFor({ dialogue, characterId: 'pip', tSec: 2.345 }), mouthFor({ dialogue, characterId: 'pip', tSec: 2.345 }));
});

test('nobody mouths a conversation they are not having', { skip: !hasAudio && 'no rendered audio' }, () => {
  const dialogue = [line()];
  // Before the line, and after it has finished, the mouth is closed.
  assert.equal(mouthFor({ dialogue, characterId: 'pip', tSec: 0.2 }), null);
  assert.equal(mouthFor({ dialogue, characterId: 'pip', tSec: 6.5 }), null);
  // And a listener never moves their lips.
  assert.equal(mouthFor({ dialogue, characterId: 'bobby', tSec: 2.5 }), null);
});

test('a line with no readable audio still gets a mouth, not a frozen face', () => {
  const dialogue = [line({ audioAsset: 'audio/nope/missing.wav', durationSec: 2 })];
  const samples = [1.0, 1.1, 1.2, 1.3].map((t) => mouthFor({ dialogue, characterId: 'pip', tSec: t }));
  assert.ok(samples.every((v) => v != null && v > 0), 'the fallback must still open the mouth');
  assert.ok(new Set(samples.map((v) => v.toFixed(3))).size > 1, 'the fallback must not be a fixed jaw');
});

test('speech survives travel: a walking speaker can still talk', { skip: !hasAudio && 'no rendered audio' }, () => {
  const instance = {
    characterId: 'pip',
    position: { x: 0.3, y: 0.82, z: 0.5 },
    scale: 1,
    facing: 'right',
    animation: 'walk',
    // The line starts at 0.8 s, so the character is mid-stride while speaking.
    motion: { path: [{ t: 0, x: 0.2, y: 0.82 }, { t: 3, x: 0.7, y: 0.82 }], ease: 'linear' },
  };
  const dialogue = [line({ startSec: 0.8 })];
  const open = solvePose({ character: bobby, instance, tSec: 1.6, compositionHeight: H, compositionWidth: W, dialogue });
  assert.equal(open.travelling, true);
  assert.ok(Math.abs(open.state.legSwing) > 0.01, 'still walking');
  assert.ok(open.state.mouthOpen > 0.15, 'travel must not weld the mouth shut');
});

test('a gesture with no line does not move the lips', () => {
  const instance = {
    characterId: 'bobby',
    position: { x: 0.5, y: 0.82, z: 0.5 },
    scale: 1,
    facing: 'right',
    animation: 'talk',
    poseTrack: [{ atSec: 0, animation: 'talk' }, { atSec: 2, animation: 'idle' }],
  };
  // No dialogue passed at all: the pose must not invent speech.
  const pose = solvePose({ character: bobby, instance, tSec: 1, compositionHeight: H, compositionWidth: W });
  assert.equal(pose.state.mouthOpen, 0);
});

test('the envelope reports silence instead of guessing', () => {
  const missing = envelopeFor('/definitely/not/a/file.wav');
  assert.equal(missing, null);
});

test('the expression does not flicker with every syllable', { skip: !hasAudio && 'no rendered audio' }, () => {
  // Brows and eye size are driven by the expression, not by the jaw. When they were driven by
  // mouthOpen, speech made the brows jump with every loud vowel — the character looked angry in
  // the middle of a happy line. This pins the separation.
  const instance = {
    characterId: 'pip',
    position: { x: 0.4, y: 0.82, z: 0.5 },
    scale: 1,
    facing: 'right',
    animation: 'talk',
    poseTrack: [{ atSec: 0, animation: 'talk' }, { atSec: 6, animation: 'talk' }],
  };
  const dialogue = [line({ startSec: 0.6 })];
  const frames = [];
  for (let t = 1.0; t < 4.0; t += 0.05) {
    frames.push(solvePose({ character: bobby, instance, tSec: Number(t.toFixed(3)), compositionHeight: H, compositionWidth: W, dialogue }));
  }
  // The jaw moves…
  const jaws = new Set(frames.map((f) => f.state.mouthOpen.toFixed(2)));
  assert.ok(jaws.size > 5, 'the jaw must follow the audio');
  // …but the expression stays the pose's, and the talking flag is on.
  const expressions = new Set(frames.map((f) => String(f.state.expressionOpen)));
  assert.equal(expressions.size, 1, `the expression must hold still, saw ${[...expressions].join(',')}`);
  assert.ok(frames.every((f) => f.state.speaking === true));
});
