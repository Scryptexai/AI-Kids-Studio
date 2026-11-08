// Director-engine guards.
//
// The point of the director layer is that a writer supplies intent and the engine produces a
// scene that the renderer accepts. These tests pin the behaviours that make that true — and
// the composition bugs that were found by actually looking at rendered frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { validateAgainst } from '../scripts/lib/schema.mjs';
import { intentFor, estimateLineDuration, INTENTS, SHOTS } from '../apps/director/intents.mjs';
import { markFor, facingFor, castIndex, SAFE_MIN, SAFE_MAX } from '../apps/director/stage.mjs';
import { frameBeat } from '../apps/director/camera.mjs';
import { directScript, placeProps } from '../apps/director/director.mjs';
import { cameraAt } from '../apps/renderer/scene-svg.mjs';

async function loadFixtures() {
  const world = await readJson(path.join(P.worlds, 'bobby-forest.world.json'));
  const characters = new Map();
  for (const id of ['bobby', 'pip', 'coco']) {
    characters.set(id, await readJson(path.join(P.characters, `${id}.character.json`)));
  }
  return { world, characters };
}

function miniScript() {
  return {
    schemaVersion: 1,
    id: 'test-script',
    worldId: 'bobby-forest',
    episodeId: 'ep-test',
    title: 'Test',
    locations: ['forest-clearing'],
    cast: [
      { characterId: 'bobby', role: 'lead' },
      { characterId: 'pip', role: 'sidekick' },
    ],
    beats: [
      { id: 'b1', location: 'forest-clearing', action: 'explore', actor: 'bobby', target: 'pip', emotion: 'happy', line: 'Ayo kita jalan.' },
      { id: 'b2', location: 'forest-clearing', action: 'discover', actor: 'bobby', target: 'pip', emotion: 'surprised', prop: 'flower-patch', line: 'Lihat bunga ini!' },
    ],
  };
}

test('every intent maps to a shot the world defines', async () => {
  const { world } = await loadFixtures();
  const defined = new Set(world.cameraPresets.map((p) => p.id));
  for (const [id, intent] of Object.entries(INTENTS)) {
    assert.ok(intent.pose, `${id} must declare a pose`);
    assert.ok(SHOTS[intent.shot], `${id} uses unknown shot '${intent.shot}'`);
    assert.ok(defined.has(intent.shot), `world has no camera preset '${intent.shot}' for intent '${id}'`);
  }
});

test('unknown actions fail loudly instead of silently defaulting', () => {
  assert.throws(() => intentFor('fly-to-moon'), /unknown action/);
});

test('line duration is estimated when no audio exists, and scales with text length', () => {
  const short = estimateLineDuration('Halo!');
  const long = estimateLineDuration('Halo teman-teman, hari ini kita akan bermain bersama di taman yang sangat luas sekali.');
  assert.ok(short > 0 && long > short);
  assert.ok(estimateLineDuration('') === 0);
});

test('blocking keeps every actor inside the safe frame', () => {
  for (const action of Object.keys(INTENTS)) {
    for (let actors = 1; actors <= 3; actors++) {
      const marks = [];
      for (let i = 0; i < actors; i++) {
        marks.push(markFor({
          intent: INTENTS[action],
          role: i === 0 ? 'lead' : 'companion',
          actorIndex: i,
          actorCount: actors,
          targetX: null,
          propX: 0.3,
        }));
      }
      for (const m of marks) {
        assert.ok(m.x >= SAFE_MIN && m.x <= SAFE_MAX, `${action}/${actors} actor: x=${m.x} outside safe frame`);
        assert.ok(m.y > 0 && m.y < 1);
      }
    }
  }
});

test('reactors never share a mark with the actor or each other', () => {
  // Regression: reactors were queued to the right of the actor and the last one clipped
  // off-frame, then collapsing onto the clamp made two characters overlap exactly.
  for (const actorX of [0.1, 0.42, 0.5, 0.9]) {
    const xs = [actorX];
    for (let i = 0; i < 2; i++) {
      xs.push(markFor({
        intent: { ...INTENTS.react, stance: 'hold' },
        role: 'companion',
        actorIndex: i,
        actorCount: 3,
        actorX,
      }).x);
    }
    const unique = new Set(xs.map((x) => x.toFixed(3)));
    assert.equal(unique.size, xs.length, `overlapping marks for actorX=${actorX}: ${xs}`);
    for (const x of xs) assert.ok(x >= SAFE_MIN && x <= SAFE_MAX);
  }
});

test('facing is relational to the target, the prop, or the camera', () => {
  // celebrate jumps to camera by design, so use a partner-facing intent for the relational case.
  assert.equal(facingFor({ intent: INTENTS.explain, markX: 0.4, targetX: 0.7 }), 'right');
  assert.equal(facingFor({ intent: INTENTS.explain, markX: 0.7, targetX: 0.4 }), 'left');
  assert.equal(facingFor({ intent: INTENTS.celebrate, markX: 0.4, targetX: 0.7 }), 'front');
  assert.equal(facingFor({ intent: INTENTS.discover, markX: 0.6, propX: 0.2 }), 'left');
  // idle faces the camera by definition; a partner-facing intent without a partner falls right.
  assert.equal(facingFor({ intent: INTENTS.idle, markX: 0.5, targetX: null }), 'front');
  assert.equal(facingFor({ intent: INTENTS.explain, markX: 0.5, targetX: null }), 'right');
  assert.equal(facingFor({ intent: { ...INTENTS.idle, facing: 'toward-camera' }, markX: 0.5 }), 'front');
  assert.equal(facingFor({ intent: { ...INTENTS.depart }, markX: 0.5 }), 'back');
});

test('camera keyframes are monotonic and start at zero', () => {
  const block = {
    intent: INTENTS.explain,
    actorId: 'bobby',
    partnerId: 'pip',
    positions: new Map([
      ['bobby', { x: 0.4 }],
      ['pip', { x: 0.62 }],
    ]),
    propPlacement: null,
    facing: 'right',
  };
  const frame = frameBeat({ block, durationSec: 6, intensity: 0.5 });
  assert.equal(frame.keyframes[0].t, 0);
  for (let i = 1; i < frame.keyframes.length; i++) {
    assert.ok(frame.keyframes[i].t > frame.keyframes[i - 1].t, 'keyframe times must increase');
  }
  assert.ok(frame.keyframes.at(-1).t <= 6.001);
  // Focus sits between the two speakers.
  assert.ok(frame.focusX > 0.4 && frame.focusX < 0.62);
});

test('camera widens when the pair is too far apart for the requested shot', () => {
  const wide = {
    intent: INTENTS.explain,
    actorId: 'a',
    partnerId: 'b',
    positions: new Map([['a', { x: 0.1 }], ['b', { x: 0.9 }]]),
    propPlacement: null,
    facing: 'right',
  };
  const frame = frameBeat({ block: wide, durationSec: 5 });
  assert.ok(frame.widenedForSpread, 'a 0.8-wide pair must widen the shot');
  assert.ok(frame.solvedZoom < SHOTS.medium.zoom);
});

test('the camera never exposes canvas outside the world (regression)', async () => {
  // A directed scene with an off-centre focus point used to show blank space at the frame
  // edge. cameraAt + the renderer's clamp must keep the scaled world covering the viewport.
  const { world, characters } = await loadFixtures();
  const { scenes } = await directScript({ script: miniScript(), world, characters });
  const width = 1280;
  const height = 720;
  const OVERSCAN = 1.12;
  for (const scene of scenes) {
    for (let t = 0; t <= scene.durationSec; t += scene.durationSec / 8) {
      const cam = cameraAt(scene.camera.keyframes, t);
      const zoom = cam.zoom * OVERSCAN;
      const worldW = width * zoom;
      const worldH = height * zoom;
      const clamp = (v, size, view) => Math.min(0, Math.max(view - size, v));
      const tx = clamp(width / 2 - cam.x * worldW, worldW, width);
      const ty = clamp(height / 2 - cam.y * worldH, worldH, height);
      assert.ok(tx <= 0 && tx + worldW >= width, `${scene.id} t=${t.toFixed(2)}: horizontal gap (tx=${tx})`);
      assert.ok(ty <= 0 && ty + worldH >= height, `${scene.id} t=${t.toFixed(2)}: vertical gap (ty=${ty})`);
    }
  }
});

test('places every prop with an inherited ground line', async () => {
  const { world } = await loadFixtures();
  const props = placeProps({ world, location: 'river-bend' });
  assert.ok(props.length > 0);
  for (const p of props) {
    assert.ok(p.x >= 0 && p.x <= 1);
    assert.ok(p.y > 0 && p.y < 1, 'prop y must default to the location ground line');
  }
  assert.throws(() => placeProps({ world, location: 'atlantis' }), /not in world/);
});

test('a beat naming an unplaced prop is rejected with the placed list', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[1].prop = 'house-cottage'; // placed at village-square, not forest-clearing
  await assert.rejects(
    () => directScript({ script, world, characters }),
    (err) => {
      assert.match(err.message, /is not placed at this location/);
      assert.match(err.hint, /tree-round|flower-patch/);
      return true;
    },
  );
});

test('directed scenes satisfy the scene contract without manual fixes', async () => {
  const { world, characters } = await loadFixtures();
  const { scenes, episode, report } = await directScript({ script: miniScript(), world, characters });
  for (const scene of scenes) {
    const errs = await validateAgainst('scene.schema.json', scene, scene.id);
    assert.deepEqual(errs.map((e) => `${e.where}: ${e.message}`), [], `${scene.id} must be a legal scene`);
    // Expressions and animations must exist on the rig that will play them.
    for (const c of scene.characters) {
      const character = characters.get(c.characterId);
      assert.ok(character.rig.poses.includes(c.animation), `${c.characterId} rig has no pose '${c.animation}'`);
      assert.ok(character.rig.expressions.includes(c.expression), `${c.characterId} rig has no expression '${c.expression}'`);
    }
    assert.ok(scene.direction, 'a directed scene records why it looks the way it does');
  }
  assert.equal(episode.sceneIds.length, 2);
  assert.equal(report.sceneCount, 2);
});

test('one beat becomes one scene, and subtitles are derived from the line', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[0].line = 'A'.repeat(200);
  const { scenes } = await directScript({ script, world, characters });
  assert.equal(scenes.length, script.beats.length);
  const long = scenes[0];
  assert.ok(long.subtitles.length > 1, 'a long line must be split into readable cues');
  assert.ok(long.subtitles.every((s) => s.text.length <= 62));
  assert.equal(long.subtitles[0].startSec >= 0, true);
  assert.ok(long.subtitles.at(-1).endSec <= long.durationSec + 0.001);
});

test('a location change is staged as an establishing shot', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.locations = ['forest-clearing', 'river-bend'];
  script.beats[1].location = 'river-bend';
  const { scenes } = await directScript({ script, world, characters });
  assert.equal(scenes[0].camera.preset, 'wide');
  assert.equal(scenes[1].camera.preset, 'establishing', 'the first beat in a new location establishes');
});

test('measured audio overrides the text estimate', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  const estimate = (await directScript({ script, world, characters })).scenes[0].durationSec;
  script.beats[0].lineDurationSec = 12;
  const measured = (await directScript({ script, world, characters })).scenes[0].durationSec;
  assert.ok(measured > estimate, 'a 12s measured line must produce a longer scene than the estimate');
  assert.ok(measured >= 12.9, 'scene must contain the line plus pads');
});

test('the shipped director script still directs cleanly', async () => {
  const script = await readJson(path.join(P.projects, 'ep-002', 'script.json'));
  const { world, characters } = await loadFixtures();
  const { scenes, report } = await directScript({ script, world, characters });
  assert.equal(scenes.length, script.beats.length);
  assert.ok(report.totalDurationSec > 30);
  assert.ok(report.locationsUsed.length >= 1);
});

test('castIndex keeps the lead first even if listed later', () => {
  const cast = castIndex(
    [{ characterId: 'pip', role: 'sidekick' }, { characterId: 'bobby', role: 'lead' }],
    'bobby',
  );
  assert.equal(cast.ids[0], 'bobby');
  assert.equal(cast.lead, 'bobby');
  assert.equal(cast.get('pip').role, 'sidekick');
});
