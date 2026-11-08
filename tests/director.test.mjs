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

test('a throw is solved between the actor and the target marks', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[0].throw = { atSec: 1.2, durationSec: 0.8 };
  script.beats[0].target = 'pip';
  const { scenes } = await directScript({ script, world, characters });
  const flight = scenes[0].flights?.[0];
  assert.ok(flight, 'the beat must produce a flight');
  const actorX = scenes[0].characters.find((c) => c.characterId === 'bobby').position.x;
  const targetX = scenes[0].characters.find((c) => c.characterId === 'pip').position.x;
  // The ball leaves near the thrower and arrives near the catcher.
  assert.ok(Math.abs(flight.fromX - actorX) < 0.12, 'throw must start at the thrower');
  assert.ok(Math.abs(flight.toX - targetX) < 0.12, 'throw must land at the catcher');
  assert.ok(flight.endSec > flight.startSec);
});

test('a throw without a target is refused with a usable hint', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[0].throw = { atSec: 1, durationSec: 0.6 };
  delete script.beats[0].target;
  await assert.rejects(
    () => directScript({ script, world, characters }),
    (err) => {
      assert.match(err.message, /names no target/);
      assert.match(err.hint, /"target"/);
      return true;
    },
  );
});

test('a throw that would outlast its scene is refused, not clipped', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[0].throw = { atSec: 1, durationSec: 60 };
  await assert.rejects(
    () => directScript({ script, world, characters }),
    /throw ends at .* but the scene is/,
  );
});

test('a thrown prop is never a bench or a tree', async () => {
  // Regression: the hero prop at the playground is the bench, and it was thrown across the
  // yard before carryable props were preferred.
  const { world, characters } = await loadFixtures();
  const script = {
    ...miniScript(),
    locations: ['playground'],
    beats: [{
      id: 'b1', location: 'playground', action: 'celebrate', actor: 'bobby', target: 'pip',
      emotion: 'happy', throw: { atSec: 1, durationSec: 0.8 },
    }],
  };
  const { scenes } = await directScript({ script, world, characters });
  const flight = scenes[0].flights?.[0];
  assert.ok(flight, 'celebrate with a throw must produce a flight');
  assert.ok(!/bench|tree|rock|house/.test(flight.propId), `threw an unwieldy prop: ${flight.propId}`);
});

test('depth on a beat produces a z ramp and therefore a changing scale', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[0].depth = 'away';
  const { scenes } = await directScript({ script, world, characters });
  const actor = scenes[0].characters.find((c) => c.characterId === 'bobby');
  assert.ok(actor.motion, 'depth needs a motion track');
  const zs = actor.motion.path.map((k) => k.z).filter((z) => z !== undefined);
  assert.ok(zs.length >= 2, 'depth must ramp, not be a single value');
  assert.ok(zs.at(-1) > zs[0], 'walking away increases depth');
});

test('a beat without depth leaves the motion track free of z', async () => {
  const { world, characters } = await loadFixtures();
  const { scenes } = await directScript({ script: miniScript(), world, characters });
  for (const scene of scenes) {
    for (const c of scene.characters) {
      if (!c.motion) continue;
      assert.ok(c.motion.path.every((k) => k.z === undefined), 'unrequested depth must not appear');
    }
  }
});

test('a throw hands the prop to the catcher instead of giving it back', async () => {
  // Regression: the carry window used to run to the end of the scene, so after the ball landed
  // it snapped back into the thrower's hands and the catcher was left miming.
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  // A line long enough that the catch has room to read; a 2 s scene ends as the ball lands.
  script.beats[0].line = 'Ayo kita ke sungai sekarang, ikuti aku dan jangan berhenti.';
  script.beats[0].interact = 'hold';
  script.beats[0].target = 'pip';
  script.beats[0].throw = { atSec: 1.4, durationSec: 0.85 };
  const { scenes } = await directScript({ script, world, characters });
  const scene = scenes[0];
  const flight = scene.flights[0];
  const holds = scene.interactions.filter((i) => i.propId === flight.propId);

  const thrower = holds.find((i) => i.characterId === 'bobby');
  const catcher = holds.find((i) => i.characterId === 'pip');
  assert.ok(catcher, 'the catcher must hold the prop after the catch');

  // Nobody carries the ball through its own flight.
  for (const hold of holds) {
    const overlaps = hold.fromSec < flight.endSec && hold.toSec > flight.startSec;
    assert.ok(!overlaps, `${hold.characterId} carries the prop while it is airborne`);
  }
  // The thrower lets go at release; the catcher takes it at landing.
  if (thrower) assert.ok(Math.abs(thrower.toSec - flight.startSec) < 1e-6);
  assert.ok(Math.abs(catcher.fromSec - flight.endSec) < 1e-6);
  assert.ok(catcher.toSec > catcher.fromSec);
});

test('a throw without hold still gives the catcher the prop', async () => {
  const { world, characters } = await loadFixtures();
  const script = miniScript();
  script.beats[0].target = 'pip';
  script.beats[0].throw = { atSec: 1.2, durationSec: 0.8 };
  script.beats[0].interact = 'touch';
  const { scenes } = await directScript({ script, world, characters });
  const catcher = scenes[0].interactions.find((i) => i.characterId === 'pip');
  assert.ok(catcher, 'even touch-beats must hand the caught prop over');
});
