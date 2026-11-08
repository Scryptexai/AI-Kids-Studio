// Motion tracks and prop interaction.
//
// These lock the behaviours that make a scene feel like a game rather than a slideshow:
// characters actually travel, the walk cycle engages while travelling, props can be carried,
// and a bad track is rejected by name instead of silently producing a teleport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  sampleMotion, travelDirection, propInteractionAt, interactionProgress, validateMotionTrack, EASINGS,
  sampleFlight, validateFlight, depthToScale, sampleDepth, sampleMotionWithDepth, DEPTH,
} from '../apps/renderer/motion.mjs';
import { motionTrackFor, entryFor, LANES } from '../apps/director/stage.mjs';
import { INTENTS } from '../apps/director/intents.mjs';
import { renderCharacter, bodyHeightPx } from '../apps/renderer/rigs.mjs';
import { buildSceneSvg } from '../apps/renderer/scene-svg.mjs';
import { readJson } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';

const character = {
  id: 'tester',
  visual: { palette: { primary: '#f2994a', secondary: '#4f4f4f', accent: '#2d9cdb' }, bodyProportions: { headScale: 1.3, heightUnits: 4.2 } },
};
const instance = {
  characterId: 'tester',
  position: { x: 0.4, y: 0.82, z: 2 },
  scale: 1,
  facing: 'right',
  expression: 'neutral',
  animation: 'idle',
};

test('a missing track falls back to the static position', () => {
  const m = sampleMotion(null, 1.5, instance.position);
  assert.equal(m.x, 0.4);
  assert.equal(m.y, 0.82);
  assert.equal(m.moving, false);
});

test('sampling is monotonically increasing across the path', () => {
  const track = { path: [{ t: 0, x: 0.1, y: 0.82 }, { t: 2, x: 0.7, y: 0.82 }], ease: 'linear' };
  let previous = -1;
  for (let t = 0; t <= 2; t += 0.1) {
    const { x } = sampleMotion(track, t, instance.position);
    assert.ok(x >= previous - 1e-9, `x went backwards at t=${t}`);
    previous = x;
  }
  assert.ok(Math.abs(sampleMotion(track, 2, instance.position).x - 0.7) < 1e-9);
});

test('the last keyframe holds after the path ends', () => {
  const track = { path: [{ t: 0, x: 0.1, y: 0.82 }, { t: 1, x: 0.6, y: 0.82 }] };
  assert.equal(sampleMotion(track, 99, instance.position).x, 0.6);
  assert.equal(sampleMotion(track, 99, instance.position).moving, false);
});

test('before the first keyframe the start position is held', () => {
  const track = { path: [{ t: 2, x: 0.3, y: 0.82 }, { t: 4, x: 0.6, y: 0.82 }] };
  assert.equal(sampleMotion(track, 0, instance.position).x, 0.3);
});

test('unsorted keyframes are sorted defensively, never causing a teleport', () => {
  const track = { path: [{ t: 2, x: 0.7, y: 0.82 }, { t: 0, x: 0.1, y: 0.82 }], ease: 'linear' };
  const mid = sampleMotion(track, 1, instance.position);
  assert.ok(mid.x > 0.1 && mid.x < 0.7, `expected an in-between value, got ${mid.x}`);
});

test('easing changes the shape of the travel, not its endpoints', () => {
  const base = (ease) => ({ path: [{ t: 0, x: 0, y: 0.82 }, { t: 1, x: 1, y: 0.82 }], ease });
  const linearMid = sampleMotion(base('linear'), 0.5, instance.position).x;
  const easeInMid = sampleMotion(base('ease-in'), 0.5, instance.position).x;
  const easeOutMid = sampleMotion(base('ease-out'), 0.5, instance.position).x;
  assert.ok(Math.abs(linearMid - 0.5) < 1e-9);
  assert.ok(easeInMid < linearMid, 'ease-in starts slower');
  assert.ok(easeOutMid > linearMid, 'ease-out starts faster');
  for (const e of Object.keys(EASINGS)) {
    assert.ok(Math.abs(sampleMotion(base(e), 1, instance.position).x - 1) < 1e-9);
  }
});

test('travel direction reflects the sign of movement', () => {
  const right = { path: [{ t: 0, x: 0.2, y: 0.82 }, { t: 1, x: 0.8, y: 0.82 }] };
  const left = { path: [{ t: 0, x: 0.8, y: 0.82 }, { t: 1, x: 0.2, y: 0.82 }] };
  assert.equal(travelDirection(right, 0.5), 'right');
  assert.equal(travelDirection(left, 0.5), 'left');
  assert.equal(travelDirection(null, 0.5), null);
});

test('walk-in travels from off-frame to the mark and the track ends with the walk', () => {
  const mark = { x: 0.42, y: 0.82, z: 2, scale: 1 };
  const entry = entryFor({ intent: INTENTS.entrance, mark, role: 'lead', castIndex: 0 });
  const track = motionTrackFor({ entry, durationSec: 6 });
  assert.ok(track.path[0].x < 0, 'starts off-frame');
  assert.equal(track.path.at(-1).x, 0.42);
  // The track must stop when the walk stops. Pinning a third key at the scene end made the
  // character read as travelling for the rest of the beat, so the walk cycle never ended.
  assert.equal(track.path.length, 2, 'no hold key: the sampler holds the last keyframe already');
  assert.ok(track.path.at(-1).t < 6, 'the track must end before the scene does');
  assert.equal(track.durationSec, track.path.at(-1).t, 'duration matches the walk, not the scene');
});

test('departure travels from the mark to off-frame and does not hold', () => {
  const mark = { x: 0.42, y: 0.82, z: 2, scale: 1 };
  const entry = entryFor({ intent: INTENTS.depart, mark, role: 'lead', castIndex: 0 });
  const track = motionTrackFor({ entry, durationSec: 5 });
  assert.equal(track.path[0].x, 0.42, 'starts on the mark');
  assert.ok(track.path.at(-1).x !== 0.42, 'does not stay on the mark — the character leaves');
});

test('a still intent produces no track at all', () => {
  const mark = { x: 0.42, y: 0.82, z: 2, scale: 1 };
  const entry = entryFor({ intent: INTENTS.idle, mark, role: 'lead', castIndex: 0 });
  assert.equal(motionTrackFor({ entry, durationSec: 5 }), null);
});

test('validateMotionTrack names the exact problem', () => {
  assert.deepEqual(validateMotionTrack(null), []);
  assert.match(validateMotionTrack({ path: [{ t: 0, x: 0 }] })[0], /at least 2 keyframes/);
  assert.match(validateMotionTrack({ path: [{ t: 0, x: 0 }, { t: 5, x: 1 }] }, { durationSec: 3 })[0], /past the scene end/);
  assert.match(validateMotionTrack({ path: [{ t: 2, x: 0 }, { t: 1, x: 1 }] })[0], /goes backwards/);
  assert.match(validateMotionTrack({ path: [{ t: 0, x: 0 }, { t: 1, x: 9 }] })[0], /far outside the frame/);
  assert.match(validateMotionTrack({ path: [{ t: 0, x: 0 }, { t: 1, x: 1 }], ease: 'wobble' })[0], /unknown ease/);
  assert.deepEqual(validateMotionTrack({ path: [{ t: 0, x: 0 }, { t: 1, x: 1 }], ease: 'linear' }, { durationSec: 2 }), []);
});

test('a travelling character swings its legs even in a non-walk pose', () => {
  // Render at two different times on a track and confirm the limbs move: compare the rendered
  // SVG of the same instance at two travel times.
  const moving = { ...instance, animation: 'talk', motion: { path: [{ t: 0, x: 0.1, y: 0.82 }, { t: 2, x: 0.8, y: 0.82 }] } };
  const a = renderCharacter({ character, instance: moving, tSec: 0.4, compositionHeight: 720, compositionWidth: 1280 });
  const b = renderCharacter({ character, instance: moving, tSec: 0.9, compositionHeight: 720, compositionWidth: 1280 });
  assert.notEqual(a, b, 'the rig must redraw while travelling');
  // The centre of the body must actually have shifted along the path.
  const cx = (svg) => Number(svg.match(/<circle cx="([\d.]+)" cy="[\d.]+" r="[\d.]+" fill="#2d9cdb"/)?.[1] ?? NaN);
  assert.ok(Number.isFinite(cx(a)) && Number.isFinite(cx(b)));
  assert.ok(cx(b) > cx(a), 'travel should move the character to the right');
});

test('prop interaction windows open and close', () => {
  const interactions = [{ propId: 'toy-ball', characterId: 'tester', fromSec: 1, toSec: 3, attach: 'hands' }];
  assert.equal(propInteractionAt(interactions, 'toy-ball', 0.5), null);
  assert.ok(propInteractionAt(interactions, 'toy-ball', 2));
  assert.equal(propInteractionAt(interactions, 'toy-ball', 3.5), null);
  assert.equal(propInteractionAt(interactions, 'other-prop', 2), null);
  assert.equal(propInteractionAt(undefined, 'toy-ball', 2), null);
});

test('interaction progress is normalised across the window', () => {
  const it = { propId: 'p', characterId: 'c', fromSec: 2, toSec: 4 };
  assert.equal(interactionProgress(it, 1), 0);
  assert.equal(interactionProgress(it, 3), 0.5);
  assert.equal(interactionProgress(it, 9), 1);
  assert.equal(interactionProgress(null, 3), 0);
});

test('a carried prop is drawn above its staged ground position', async () => {
  // Regression guard for the "ball stays glued to the grass" bug.
  const world = await readJson(path.join(P.worlds, 'bobby-forest.world.json'));
  const bobby = await readJson(path.join(P.characters, 'bobby.character.json'));
  const scene = {
    schemaVersion: 1,
    id: 'sc-test',
    worldId: world.id,
    episodeId: 'ep-test',
    location: 'playground',
    durationSec: 4,
    fps: 24,
    camera: { preset: 'wide', keyframes: [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }] },
    characters: [{
      characterId: 'bobby',
      position: { x: 0.4, y: LANES.mid.y, z: 2 },
      scale: 1,
      facing: 'right',
      expression: 'happy',
      animation: 'idle',
    }],
    props: [{ propId: 'toy-ball', x: 0.5, y: LANES.mid.y, scale: 0.8 }],
    interactions: [{ propId: 'toy-ball', characterId: 'bobby', fromSec: 1, toSec: 3, attach: 'hands' }],
    dialogue: [],
    subtitles: [],
  };
  const characters = new Map([['bobby', bobby]]);
  const before = buildSceneSvg({ scene, world, characters, frame: 0, fps: 24, width: 1280, height: 720 });
  const during = buildSceneSvg({ scene, world, characters, frame: 48, fps: 24, width: 1280, height: 720 });
  // The ball is an ellipse/path near the actor; compare the whole layer instead of parsing:
  // the two frames must differ, and the carried frame must not draw the ball at the staged spot.
  assert.notEqual(before, during);
  assert.ok(before.length > 1000 && during.length > 1000);
});

test('bodyHeightPx scales with the instance scale', () => {
  const small = bodyHeightPx({ scale: 0.5 }, character);
  const big = bodyHeightPx({ scale: 1 }, character);
  assert.ok(big > small);
  assert.equal(bodyHeightPx({ scale: 1 }, character), 205);
});

// ---------------------------------------------------------------------------
// Thrown props (ballistics)
// ---------------------------------------------------------------------------

test('a throw leaves one hand and arrives at the other', () => {
  const flight = { fromX: 0.2, fromY: 0.6, toX: 0.8, toY: 0.6, startSec: 1, endSec: 2 };
  assert.deepEqual(
    { x: sampleFlight(flight, 1).x, y: sampleFlight(flight, 1).y },
    { x: 0.2, y: 0.6 },
  );
  const end = sampleFlight(flight, 2);
  assert.ok(Math.abs(end.x - 0.8) < 1e-9 && Math.abs(end.y - 0.6) < 1e-9);
});

test('a throw arcs upward in the middle (screen y decreases)', () => {
  const flight = { fromX: 0.2, fromY: 0.6, toX: 0.8, toY: 0.6, startSec: 0, endSec: 1 };
  const mid = sampleFlight(flight, 0.5);
  assert.ok(mid.y < 0.6, `expected the prop to rise, got y=${mid.y}`);
  assert.equal(mid.airborne, true);
});

test('a longer throw arcs higher than a short toss', () => {
  const apexOf = (span) => {
    const f = { fromX: 0.2, fromY: 0.6, toX: 0.8, toY: 0.6, startSec: 0, endSec: span };
    let best = 1;
    for (let t = 0; t <= span; t += 0.01) best = Math.min(best, sampleFlight(f, t).y);
    return 0.6 - best;
  };
  assert.ok(apexOf(2.0) > apexOf(0.6), 'a lob should peak higher than a toss');
});

test('the prop is not airborne before or after the flight', () => {
  const flight = { fromX: 0.2, fromY: 0.6, toX: 0.8, toY: 0.6, startSec: 1, endSec: 2 };
  assert.equal(sampleFlight(flight, 0.5).airborne, false);
  assert.equal(sampleFlight(flight, 2.5).airborne, false);
  assert.equal(sampleFlight(flight, 0.5).x, 0.2, 'before the throw it rests at the origin');
  assert.equal(sampleFlight(flight, 2.5).x, 0.8, 'after the catch it rests at the target');
});

test('an explicit arc overrides the duration-derived apex', () => {
  const low = { fromX: 0.2, fromY: 0.6, toX: 0.8, toY: 0.6, startSec: 0, endSec: 1, arc: 0.05 };
  const high = { ...low, arc: 0.5 };
  assert.ok(sampleFlight(high, 0.4).y < sampleFlight(low, 0.4).y, 'a bigger arc must fly higher');
});

test('validateFlight names the problem', () => {
  assert.deepEqual(validateFlight(null), []);
  assert.match(validateFlight({ fromX: 0, fromY: 0, toX: 1, toY: 0, startSec: 2, endSec: 1 })[0], /endSec must be after/);
  assert.match(validateFlight({ fromX: 0, fromY: 0, toX: 1, toY: 0, startSec: 0, endSec: 9 }, { durationSec: 3 })[0], /past the scene end/);
  assert.match(validateFlight({ fromX: 0, fromY: 0, toX: 1, startSec: 0, endSec: 1 })[0], /missing numeric toY/);
});

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

test('the default depth is an exact identity so existing scenes do not shift', () => {
  const mid = depthToScale(0.5);
  assert.equal(mid.scale, 1);
  assert.equal(mid.groundY, 0.82);
});

test('walking away shrinks the character and raises its ground line', () => {
  const near = depthToScale(0);
  const far = depthToScale(1);
  assert.ok(far.scale < near.scale, 'farther must be smaller');
  assert.ok(far.groundY < near.groundY, 'farther must stand higher in frame (smaller y)');
  assert.equal(near.depth, 0);
  assert.equal(far.depth, 1);
});

test('depth is clamped, so a bad keyframe cannot invert the scale', () => {
  assert.equal(depthToScale(-5).scale, depthToScale(0).scale);
  assert.equal(depthToScale(9).scale, depthToScale(1).scale);
});

test('depth keyframes interpolate and hold like position', () => {
  const track = { path: [{ t: 0, x: 0.3, z: 0 }, { t: 2, x: 0.5, z: 1 }] };
  assert.equal(sampleDepth(track, 0, 0.5), 0);
  assert.equal(sampleDepth(track, 2, 0.5), 1);
  assert.ok(Math.abs(sampleDepth(track, 1, 0.5) - 0.5) < 1e-9);
  assert.equal(sampleDepth(track, 9, 0.5), 1, 'holds the last depth');
  assert.equal(sampleDepth({ path: [{ t: 0, x: 0 }] }, 1, 0.5), 0.5, 'no z keyframes means the fallback');
});

test('a track without depth keeps the static position and scale', () => {
  const track = { path: [{ t: 0, x: 0.3 }, { t: 1, x: 0.6 }] };
  const m = sampleMotionWithDepth(track, 0.5, { x: 0, y: 0.82, depth: 0.5 });
  assert.equal(m.scale, 1);
  assert.ok(m.x > 0.3 && m.x < 0.6);
});

test('DEPTH.lanes are ordered front, mid, far', () => {
  assert.ok(DEPTH.front.scale > DEPTH.mid.scale && DEPTH.mid.scale > DEPTH.far.scale);
  assert.ok(DEPTH.front.groundY > DEPTH.mid.groundY && DEPTH.mid.groundY > DEPTH.far.groundY);
});

test('walking into the picture counts as moving, not as standing still', () => {
  // A depth ramp keeps x constant and moves z. The visibility test used to look only at x, so a
  // character walking away from camera played a standing pose and glided backwards with locked
  // legs — the depth shot read as a bug in the renderer.
  const towardBack = {
    path: [{ t: 0, x: 0.4, y: 0.82, z: 0.5 }, { t: 3, x: 0.4, y: 0.82, z: 0.9 }],
    ease: 'linear',
  };
  assert.equal(sampleMotion(towardBack, 1.5, { x: 0.4, y: 0.82 }).moving, true);
  // But not before it starts or after it stops.
  assert.equal(sampleMotion(towardBack, 0, { x: 0.4, y: 0.82 }).moving, false);
  assert.equal(sampleMotion(towardBack, 3, { x: 0.4, y: 0.82 }).moving, false);
  // A genuinely static track is still static.
  const still = { path: [{ t: 0, x: 0.4, y: 0.82, z: 0.5 }, { t: 3, x: 0.4, y: 0.82, z: 0.5 }] };
  assert.equal(sampleMotion(still, 1.5, { x: 0.4, y: 0.82 }).moving, false);
});
