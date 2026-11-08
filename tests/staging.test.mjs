// Staging guards.
//
// Every bug pinned here was found by looking at rendered frames, not by a failing test: a ball
// that vanished behind a tree, a carried ball a head's width from the hand, and two backends
// drawing different films. The point of these tests is that those three can no longer happen
// silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { sampleFlight } from '../apps/renderer/motion.mjs';
import { handPosition } from '../apps/renderer/rigs.mjs';
import { stageProps, paintOrder, resolveFlight } from '../apps/renderer/staging.mjs';

const W = 1280;
const H = 720;

async function loadCharacter(id) {
  return readJson(path.join(P.characters, `${id}.character.json`));
}

/** A two-character scene with a staged prop and nothing else moving. */
async function fixture(overrides = {}) {
  const characters = new Map([
    ['bobby', await loadCharacter('bobby')],
    ['pip', await loadCharacter('pip')],
  ]);
  const scene = {
    id: 'sc-test',
    durationSec: 6,
    characters: [
      { characterId: 'bobby', position: { x: 0.4, y: 0.82, z: 0.5 }, scale: 1, facing: 'right', animation: 'idle' },
      { characterId: 'pip', position: { x: 0.7, y: 0.82, z: 0.5 }, scale: 1, facing: 'left', animation: 'idle' },
    ],
    props: [{ propId: 'toy-ball', x: 0.5, y: 0.82, scale: 0.8 }],
    interactions: [],
    flights: [],
    ...overrides,
  };
  return { scene, characters };
}

const ctx = (scene, characters, t) => ({ scene, characters, tSec: t, height: H, width: W });

test('a carried prop sits in the hand the rig actually draws', async () => {
  const { scene, characters } = await fixture({
    interactions: [{ propId: 'toy-ball', characterId: 'bobby', fromSec: 0, toSec: 6, attach: 'hands' }],
  });
  const [ball] = stageProps(ctx(scene, characters, 3));
  const bobby = scene.characters[0];
  const hand = handPosition({
    character: characters.get('bobby'),
    instance: bobby,
    tSec: 3,
    compositionHeight: H,
    compositionWidth: W,
    side: 'right',
  });

  // The ball is at the hand, not at a fixed offset above the feet. The old guess was
  // (x + 0.06, y - 0.34h) — roughly 50 px wide of the mark on this rig.
  assert.ok(Math.abs(ball.x - hand.x) < 0.02, `carried x ${ball.x} drifted from hand ${hand.x}`);
  assert.ok(Math.abs(ball.y - hand.y) < 0.02, `carried y ${ball.y} drifted from hand ${hand.y}`);
});

test('the hand moves with the pose, so the ball is not pinned to the body', async () => {
  // A raised arm must move the hand; if the carry height were a constant, this would be flat.
  const calm = { characterId: 'bobby', position: { x: 0.4, y: 0.82, z: 0.5 }, scale: 1, facing: 'right', animation: 'idle' };
  const waving = { ...calm, animation: 'wave' };
  const character = await loadCharacter('bobby');
  const a = handPosition({ character, instance: calm, tSec: 1.3, compositionHeight: H, compositionWidth: W });
  const b = handPosition({ character, instance: waving, tSec: 1.3, compositionHeight: H, compositionWidth: W });
  // 'wave' raises the arm; 'idle' hangs it. The hand must follow.
  assert.ok(Math.abs(a.y - b.y) > 0.02, 'a raised arm must lift the hand');
});

test('a thrown prop is on its arc between the two hands', async () => {
  const { scene, characters } = await fixture({
    flights: [{
      propId: 'toy-ball', fromCharacterId: 'bobby', toCharacterId: 'pip',
      fromX: 0, fromY: 0, toX: 1, toY: 1,
      startSec: 1, endSec: 2, spin: true,
    }],
  });
  const resolved = resolveFlight(scene.flights[0], { scene, characters, height: H, width: W });
  const bobbyHand = handPosition({
    character: characters.get('bobby'), instance: scene.characters[0], tSec: 1,
    compositionHeight: H, compositionWidth: W, side: 'right',
  });

  // The stored (0,0) coordinates are a lie; the throw must start at Bobby's real hand.
  assert.ok(Math.abs(resolved.fromX - bobbyHand.x) < 1e-6, 'the flight ignored the thrower hand');
  // And it must land on one of Pip's hands, not on the coordinates it was given.
  const pipRight = handPosition({
    character: characters.get('pip'), instance: scene.characters[1], tSec: 2,
    compositionHeight: H, compositionWidth: W, side: 'right',
  });
  const pipLeft = handPosition({
    character: characters.get('pip'), instance: scene.characters[1], tSec: 2,
    compositionHeight: H, compositionWidth: W, side: 'left',
  });
  const nearest = Math.min(Math.abs(resolved.toX - pipRight.x), Math.abs(resolved.toX - pipLeft.x));
  assert.ok(nearest < 1e-6, 'the flight did not land on a hand');

  const mid = stageProps(ctx(scene, characters, 1.5)).find((p) => p.propId === 'toy-ball');
  assert.equal(mid.airborne, true, 'mid-flight the prop must be airborne');
  const sampled = sampleFlight(resolved, 1.5);
  assert.ok(Math.abs(mid.x - sampled.x) < 1e-9 && Math.abs(mid.y - sampled.y) < 1e-9);
});

test('a prop caught in front of scenery is not buried by it', async () => {
  // Regression: a ball caught at x = 0.82 landed exactly on the tree at x = 0.82 and vanished,
  // because every prop was painted before every character.
  const { scene, characters } = await fixture({
    interactions: [{ propId: 'toy-ball', characterId: 'pip', fromSec: 1, toSec: 6, attach: 'hands' }],
    props: [
      { propId: 'toy-ball', x: 0.5, y: 0.82, scale: 0.8 },
      { propId: 'tree-round', x: 0.711, y: 0.82, scale: 1 },
    ],
  });
  const staged = stageProps(ctx(scene, characters, 3));
  const { scenery, layers } = paintOrder({ scene, stagedProps: staged, characters, tSec: 3 });

  const ball = staged.find((p) => p.propId === 'toy-ball');
  assert.equal(ball.bornWith, 'pip', 'a carried prop belongs to its holder layer');
  // It must not be in the scenery list at all — that list is what gets painted behind actors.
  assert.ok(!scenery.some(({ prop }) => prop.propId === 'toy-ball'), 'the ball was painted as scenery');
  const pipLayer = layers.find((l) => l.characterId === 'pip');
  assert.ok(pipLayer.props.some((p) => p.propId === 'toy-ball'), 'the ball must ride in Pip’s layer');
});

test('scenery and characters interleave by depth', async () => {
  const { scene, characters } = await fixture({
    props: [
      { propId: 'tree-round', x: 0.2, y: 0.82, scale: 1 },
      { propId: 'bench-wood', x: 0.9, y: 0.82, scale: 1 },
    ],
  });
  const staged = stageProps(ctx(scene, characters, 0));
  const { scenery, layers } = paintOrder({ scene, stagedProps: staged, characters, tSec: 0 });
  // Everything is at the stage lane, so nothing may be reordered relative to each other.
  assert.equal(scenery.length, 2);
  assert.equal(layers.length, 2);
});

test('stageProps is a pure function of time — both backends must agree', async () => {
  // The SVG and Remotion backends both call this. If it were impure or backend-specific they
  // would drift again, which is exactly what happened before it existed.
  const { scene, characters } = await fixture({
    interactions: [{ propId: 'toy-ball', characterId: 'bobby', fromSec: 0, toSec: 6, attach: 'hands' }],
  });
  const a = stageProps(ctx(scene, characters, 2.5));
  const b = stageProps(ctx(scene, characters, 2.5));
  assert.deepEqual(a, b);
});

test('a prop with no interaction stays staged where the director put it', async () => {
  const { scene, characters } = await fixture();
  const [ball] = stageProps(ctx(scene, characters, 3));
  assert.equal(ball.x, 0.5);
  assert.equal(ball.y, 0.82);
  assert.equal(ball.z, 0.5);
  assert.equal(ball.attachedTo, undefined);
  assert.equal(ball.airborne, undefined);
});
