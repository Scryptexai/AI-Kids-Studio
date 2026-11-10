// Story guards: the props have to obey the plot.
//
// Every rule here was a bug you could see in the episode, and none of them were catchable by
// looking at one frame: a ball standing on the grass while a character said it was missing, a
// character throwing a ball they were not holding, a ball found at the river that vanished again
// in the next two shots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { directScript } from '../apps/director/director.mjs';

const world = await readJson(`${P.worlds}/bobby-forest.world.json`);
const characters = new Map();
for (const id of ['bobby', 'pip', 'coco']) {
  characters.set(id, await readJson(`${P.characters}/${id}.character.json`));
}

const script = (beats, extra = {}) => ({
  schemaVersion: 1,
  id: 'story-test',
  worldId: 'bobby-forest',
  episodeId: 'story-test',
  title: 'story test',
  locations: ['playground', 'river-bend'],
  cast: [
    { characterId: 'bobby', role: 'lead' },
    { characterId: 'pip', role: 'sidekick' },
  ],
  beats,
  ...extra,
});

const ballOf = (scene) => (scene.props ?? []).find((p) => p.propId === 'toy-ball');
const holdsBall = (scene, who) => (scene.interactions ?? [])
  .some((i) => i.propId === 'toy-ball' && i.characterId === who);

test('a beat that says the ball is missing does not have the ball in shot', async () => {
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'playground', action: 'explore', emotion: 'happy', actor: 'bobby', target: 'pip', line: 'Ayo main bola di taman hari ini.' },
      { id: 'b2', location: 'playground', action: 'discover', emotion: 'surprised', actor: 'pip', target: 'bobby', absent: ['toy-ball'], line: 'Bobby, bolanya hilang! Tadi ada di sini.' },
    ]),
    world, characters,
  });
  assert.ok(ballOf(scenes[0]), 'the ball is on stage before it goes missing');
  assert.equal(ballOf(scenes[1]), undefined, 'the missing ball must not be standing next to them');
  assert.equal(holdsBall(scenes[1], 'bobby'), false, 'nobody can be holding a lost ball');
});

test('a lost prop stays lost in the beats that follow', async () => {
  // The scene prop list is rebuilt from the location every beat, so without carrying the story
  // state forward the ball popped back onto the grass in the very next shot.
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'playground', action: 'explore', emotion: 'happy', actor: 'bobby', target: 'pip', line: 'Ayo main bola di taman hari ini.' },
      { id: 'b2', location: 'playground', action: 'discover', emotion: 'surprised', actor: 'pip', target: 'bobby', absent: ['toy-ball'], line: 'Bobby, bolanya hilang! Tadi ada di sini.' },
      { id: 'b3', location: 'playground', action: 'ask', emotion: 'curious', actor: 'bobby', target: 'pip', line: 'Coba kita pikirkan bersama, ke mana perginya.' },
      { id: 'b4', location: 'playground', action: 'explain', emotion: 'curious', actor: 'pip', target: 'bobby', line: 'Mungkin menggelinding ke arah sungai.' },
    ]),
    world, characters,
  });
  for (const scene of scenes.slice(1)) {
    assert.equal(ballOf(scene), undefined, `${scene.id} put the lost ball back in shot`);
  }
});

test('a beat cannot throw a prop that is not in its hands', async () => {
  // A beat may still throw something on purpose: it picks the prop up in the same beat. What it
  // cannot do is send a prop flying from the hands of someone who is not holding it.
  const { scenes } = await directScript({
    script: script([
      {
        id: 'b1', location: 'playground', action: 'explore', emotion: 'excited', actor: 'bobby', target: 'pip',
        line: 'Ayo kita ke sungai sekarang, ikuti aku dan jangan berhenti.',
        throw: { atSec: 1.4, durationSec: 0.8 },
      },
    ]),
    world, characters,
  });
  const scene = scenes[0];
  const flight = scene.flights[0];
  const held = (scene.interactions ?? []).filter((i) => i.propId === flight.propId && i.characterId === flight.fromCharacterId);
  assert.ok(held.length, 'the thrower must be holding the prop at some point in the beat');
  const beforeRelease = held.some((i) => i.fromSec <= flight.startSec);
  assert.ok(beforeRelease, 'the prop must be in hand before it leaves');
});

test('a prop the story finds is not in shot before it is found', async () => {
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'river-bend', action: 'discover', emotion: 'excited', actor: 'bobby', target: 'pip',
        line: 'Ada di sini! Bolanya tersangkut di antara bunga-bunga.',
        reveal: { prop: 'toy-ball', atSec: 2.0, x: 0.3 },
        interact: 'hold' },
    ]),
    world, characters,
  });
  const ball = ballOf(scenes[0]);
  assert.ok(ball, 'a revealed prop must be on stage');
  assert.equal(ball.appearsAt, 2, 'it must arrive when the beat says, not at the start');
  // It cannot be in the hands before the audience has seen it.
  const hold = scenes[0].interactions.find((i) => i.propId === 'toy-ball');
  assert.ok(hold.fromSec >= 2, `picked it up at ${hold.fromSec}s, before the reveal`);
});

test('something found stays in hand across the following beats', async () => {
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'river-bend', action: 'discover', emotion: 'excited', actor: 'bobby', target: 'pip',
        line: 'Ada di sini! Bolanya tersangkut di antara bunga-bunga.',
        reveal: { prop: 'toy-ball', atSec: 1.5, x: 0.3 }, interact: 'hold' },
      { id: 'b2', location: 'river-bend', action: 'explain', emotion: 'happy', actor: 'pip', target: 'bobby',
        line: 'Terima kasih sudah mencari bersama, aku tidak akan menemukannya sendiri.' },
      { id: 'b3', location: 'river-bend', action: 'celebrate', emotion: 'laughing', actor: 'bobby', target: 'pip',
        line: 'Hore! Kita bermain lagi dan menjaga bolanya bersama.' },
    ]),
    world, characters,
  });
  for (const scene of scenes.slice(1)) {
    assert.ok(ballOf(scene), `${scene.id} lost the ball the characters just found`);
    assert.ok(holdsBall(scene, 'bobby'), `${scene.id} has the ball on stage but nobody holding it`);
  }
});

test('a throw passes the prop to the catcher, and the catcher keeps it', async () => {
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'playground', action: 'explore', emotion: 'excited', actor: 'bobby', target: 'pip',
        line: 'Ayo kita ke sungai sekarang, ikuti aku dan jangan berhenti.',
        interact: 'hold', throw: { atSec: 2.0, durationSec: 0.8 } },
      { id: 'b2', location: 'playground', action: 'explain', emotion: 'happy', actor: 'pip', target: 'bobby',
        line: 'Bola ini kita bawa ke sungai bersama-sama ya.' },
    ]),
    world, characters,
  });
  const flight = scenes[0].flights[0];
  const catcher = scenes[0].interactions.find((i) => i.characterId === 'pip');
  assert.ok(catcher, 'the catcher must hold the ball after catching it');
  assert.ok(Math.abs(catcher.fromSec - flight.endSec) < 1e-6);
  assert.ok(holdsBall(scenes[1], 'pip'), 'the ball follows the catcher into the next beat');
});

test('a prop that does not exist cannot be marked absent', async () => {
  await assert.rejects(
    () => directScript({
      script: script([
        { id: 'b1', location: 'playground', action: 'discover', emotion: 'sad', actor: 'bobby', target: 'pip', absent: ['unicorn'], line: 'Tidak ada di sini.' },
      ]),
      world, characters,
    }),
    /no such prop exists/,
  );
});

test('a prop is never let go in the last half second of a scene', async () => {
  // Regression: every hold closed at `duration - TAIL_PAD`, which left six frames — from the tail
  // pad to the cut — in which the ball was on the grass under a character who was supposed to be
  // carrying it. It happened in eight scenes out of eight, on both episodes, and no single frame
  // was wrong enough to notice: the drop was always just off the end of the shot.
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'playground', action: 'discover', emotion: 'happy', actor: 'bobby', target: 'pip', prop: 'toy-ball', interact: 'hold', line: 'Bola!' },
    ]),
    world,
    characters,
  });
  const s = scenes[0];
  const held = (s.interactions ?? []).filter((i) => i.attach === 'hands');
  assert.ok(held.length, 'the ball is held at all');
  assert.ok(
    held.some((i) => i.toSec >= s.durationSec - 0.001),
    `a hold must reach the cut: ${held.map((i) => i.toSec).join(', ')} vs ${s.durationSec}s`,
  );
});

test('a prop can change hands by hand, and the receiver ends up holding it', async () => {
  // The moral of ep-002 used to be spoken ("thank you for searching with me"). A gesture carries it
  // better: the character who found the ball puts it back in the hand of the one who lost it. That
  // needs a non-throwing handoff — same flight, slower, no spin, released after the line says
  // "here" — and the receiver has to be the one holding it at the cut.
  const { scenes } = await directScript({
    script: script([
      { id: 'b1', location: 'playground', action: 'discover', emotion: 'happy', actor: 'bobby', target: 'pip', prop: 'toy-ball', interact: 'hold', line: 'Bolanya ketemu!' },
      { id: 'b2', location: 'playground', action: 'explain', emotion: 'happy', actor: 'bobby', target: 'pip', prop: 'toy-ball', interact: 'hold', handoff: { atSec: 1.5, durationSec: 0.9 }, line: 'Ini bolamu.' },
    ]),
    world,
    characters,
  });
  const s = scenes[1];
  const flight = (s.flights ?? []).find((f) => f.propId === 'toy-ball');
  assert.ok(flight, 'the ball travels between hands');
  assert.equal(flight.fromCharacterId, 'bobby', 'it leaves the hand that had it');
  assert.equal(flight.toCharacterId, 'pip', 'and arrives in the other');
  assert.equal(flight.spin, false, 'a handed ball is not a thrown ball');
  const catcher = (s.interactions ?? []).find((i) => i.characterId === 'pip' && i.attach === 'hands');
  assert.ok(catcher, 'the ball is held after the handoff');
  assert.ok(catcher.fromSec >= flight.endSec, 'held only once it arrives');
});

test('a beat cannot take the prop out of its own hand', async () => {
  const error = await directScript({
    script: script([
      { id: 'b1', location: 'playground', action: 'discover', emotion: 'happy', actor: 'bobby', target: 'pip', prop: 'toy-ball', interact: 'hold', line: 'Bola!' },
      { id: 'b2', location: 'playground', action: 'celebrate', emotion: 'happy', actor: 'bobby', target: 'pip', prop: 'toy-ball', interact: 'take', line: 'Ayo!' },
    ]),
    world,
    characters,
  }).then(() => null, (e) => e);
  assert.ok(error, 'the director refuses it');
  assert.match(error.message, /already holding it/);
  assert.match(error.hint ?? '', /handoff/, 'and says which primitive to use instead');
});
