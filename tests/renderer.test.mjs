// Renderer tests: the composition must be deterministic and must honour the timeline.
// These catch the class of bug that silently produces a wrong video (camera drift,
// subtitles on screen at the wrong time, characters appearing before their entrance).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildSceneSvg, cameraAt } from '../apps/renderer/scene-svg.mjs';
import { animationState } from '../apps/renderer/rigs.mjs';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;

async function fixture() {
  const scene = await readJson(path.join(P.projects, 'ep-001/scenes/sc-001.json'));
  const world = await readJson(path.join(P.worlds, 'bobby-forest.world.json'));
  const characters = new Map();
  for (const id of ['bobby', 'pip', 'coco']) {
    characters.set(id, await readJson(path.join(P.characters, `${id}.character.json`)));
  }
  return { scene, world, characters };
}

test('cameraAt clamps outside the keyframe range', () => {
  const kf = [
    { t: 0, x: 0.4, y: 0.5, zoom: 1 },
    { t: 10, x: 0.6, y: 0.5, zoom: 2 },
  ];
  assert.deepEqual(cameraAt(kf, -5), kf[0]);
  assert.deepEqual(cameraAt(kf, 99), kf[1]);
});

test('cameraAt interpolates monotonically between keyframes', () => {
  const kf = [
    { t: 0, x: 0, y: 0, zoom: 1 },
    { t: 10, x: 1, y: 1, zoom: 2 },
  ];
  let prev = -1;
  for (let t = 0; t <= 10; t += 0.5) {
    const cam = cameraAt(kf, t);
    assert.ok(cam.x >= prev, `camera x went backwards at t=${t}`);
    assert.ok(cam.zoom >= 1 && cam.zoom <= 2, `zoom out of range at t=${t}: ${cam.zoom}`);
    prev = cam.x;
  }
});

test('cameraAt handles a single keyframe and an empty track', () => {
  const one = [{ t: 3, x: 0.2, y: 0.3, zoom: 1.4 }];
  assert.deepEqual(cameraAt(one, 99), one[0]);
  assert.deepEqual(cameraAt([], 5), { x: 0.5, y: 0.5, zoom: 1 });
});

test('the same scene and frame always produce identical SVG', async () => {
  const { scene, world, characters } = await fixture();
  const a = buildSceneSvg({ scene, world, characters, frame: 42, fps: FPS, width: WIDTH, height: HEIGHT });
  const b = buildSceneSvg({ scene, world, characters, frame: 42, fps: FPS, width: WIDTH, height: HEIGHT });
  assert.equal(a, b);
});

test('consecutive frames differ (the scene is actually animating)', async () => {
  const { scene, world, characters } = await fixture();
  const a = buildSceneSvg({ scene, world, characters, frame: 10, fps: FPS, width: WIDTH, height: HEIGHT });
  const b = buildSceneSvg({ scene, world, characters, frame: 11, fps: FPS, width: WIDTH, height: HEIGHT });
  assert.notEqual(a, b);
});

test('subtitles only appear inside their time window', async () => {
  const { scene, world, characters } = await fixture();
  const sub = scene.subtitles[0];
  const inside = buildSceneSvg({ scene, world, characters, frame: Math.round(((sub.startSec + sub.endSec) / 2) * FPS), fps: FPS, width: WIDTH, height: HEIGHT });
  const before = buildSceneSvg({ scene, world, characters, frame: Math.max(0, Math.round((sub.startSec - 0.5) * FPS)), fps: FPS, width: WIDTH, height: HEIGHT });
  assert.ok(inside.includes(sub.text.split(' ')[0]), 'expected subtitle text inside its window');
  assert.ok(!before.includes(sub.text.split(' ')[0]) || sub.startSec < 0.5, 'subtitle leaked before its start');
});

test('a character does not appear before its entrance time', async () => {
  const { scene, world, characters } = await fixture();
  const inst = scene.characters.find((c) => c.entranceAt > 0);
  if (!inst) return; // this scene has no delayed entrance
  const before = buildSceneSvg({ scene, world, characters, frame: 0, fps: FPS, width: WIDTH, height: HEIGHT });
  const after = buildSceneSvg({ scene, world, characters, frame: Math.round((inst.entranceAt + 1) * FPS), fps: FPS, width: WIDTH, height: HEIGHT });
  assert.ok(!before.includes(inst.characterId), `${inst.characterId} drawn before entranceAt`);
  assert.ok(after.includes(inst.characterId));
});

test('animation state is deterministic per (animation, time, character)', () => {
  const a = animationState('walk', 1.234, 'bobby');
  const b = animationState('walk', 1.234, 'bobby');
  assert.deepEqual(a, b);
  const other = animationState('walk', 2.5, 'bobby');
  assert.notDeepEqual(a, other);
});

test('the talk pose does not invent a mouth: speech comes from the audio', () => {
  // The talk animation used to open the mouth from a sine, which meant it flapped on a clock and
  // was identical for every line. Speech is now driven by the dialogue's amplitude, so a
  // gesturing character with no line must NOT be mouthing a fake conversation.
  const samples = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((t) => animationState('talk', t, 'pip').mouthOpen);
  assert.deepEqual(samples, [0, 0, 0, 0, 0, 0]);
});

test('unknown animation ids fall back to a neutral idle instead of throwing', () => {
  const st = animationState('not-a-real-animation', 1, 'bobby');
  assert.equal(typeof st.bobY, 'number');
  assert.equal(st.mouthOpen, 0);
});

test('svg declares the requested composition size', async () => {
  const { scene, world, characters } = await fixture();
  const svg = buildSceneSvg({ scene, world, characters, frame: 0, fps: FPS, width: 640, height: 360 });
  assert.match(svg, /width="640"/);
  assert.match(svg, /height="360"/);
  assert.ok(svg.startsWith('<svg'), 'not an svg document');
  assert.ok(svg.trimEnd().endsWith('</svg>'), 'svg not closed');
});
