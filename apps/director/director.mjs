// Director engine: story beats → renderable scenes.
//
// Input is intent (schema/script.schema.json). Output is the exact scene contract the
// renderers already consume (schema/scene.schema.json), so nothing downstream changes.
//
// One beat becomes one scene. That is a deliberate choice, not a shortcut: the rig can only
// play one animation per character per scene, so a scene is a single cleared performance —
// walk in or settle, perform the beat's pose, hold. Multi-beat scenes would need per-character
// animation tracks, which the renderer does not have yet. Documented in docs/DIRECTOR.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, rel, ensureDir, exists } from '../../scripts/lib/paths.mjs';
import { readJson, writeJson } from '../../scripts/lib/json.mjs';
import { StudioError } from '../../scripts/lib/log.mjs';
import { intentFor, estimateLineDuration, EMOTION_POSE } from './intents.mjs';
import { blockBeat, posesFor, castIndex, LANES, motionTrackFor } from './stage.mjs';
import { performanceFor } from './performance.mjs';
import { frameBeat, shotForTransition } from './camera.mjs';

// Character heights are expressed against the 4.2-unit reference rig; the throw solver needs
// the same ratio the renderer uses so the ball leaves the hands, not the knees.
const heightRef = 4.2;
const num = (v) => Number(v.toFixed(4));
function bodyHeightRatio(character) {
  return character?.visual?.bodyProportions?.heightUnits ?? heightRef;
}

const ROOT_PAD = 0.6; // seconds of silence at the head of a scene
const TAIL_PAD = 0.5; // seconds after the last line settles

/** Props placed for a location, in frame-normalised coordinates. */
export function placeProps({ world, location }) {
  const loc = world.locations.find((l) => l.id === location);
  if (!loc) throw new StudioError(`location '${location}' is not in world '${world.id}'`);
  const placements = [];
  for (const entry of loc.props ?? []) {
    const catalog = (world.propCatalog ?? []).find((p) => p.id === entry.propId);
    placements.push({
      propId: entry.propId,
      x: entry.x,
      y: entry.y ?? loc.groundLineY ?? 0.84,
      scale: entry.scale ?? catalog?.scaleUnits ?? 1,
    });
  }
  return placements;
}

/** Preferred prop for a beat: the one it names, else a sensible default per intent. */
function pickProp({ beat, placements, hidden = new Set(), carried = null }) {
  // Something a character is already holding outranks everything: a beat that picks a different
  // prop would leave the held one on the floor mid-shot. Before this, the ball Bobby found at the
  // river vanished again in the next two scenes, because those beats never named it.
  if (carried) {
    const held = placements.find((p) => p.propId === carried.propId);
    if (held) return held;
  }
  if (beat.prop) {
    const found = placements.find((p) => p.propId === beat.prop);
    if (!found) {
      // Distinguish "not in this location" from "the plot has taken it away". The second is a
      // script that forgot to say so, and the hint is the part that gets it fixed.
      if (hidden.has(beat.prop)) {
        throw new StudioError(`beat '${beat.id}' names prop '${beat.prop}', but an earlier beat marks it absent`, {
          hint: `add "absent": ["${beat.prop}"] to this beat if it is still lost, or reveal it first`,
        });
      }
      throw new StudioError(`beat '${beat.id}' refers to prop '${beat.prop}' which is not placed at this location`, {
        hint: `placed here: ${placements.map((p) => p.propId).join(', ') || 'none'}`,
      });
    }
    return found;
  }
  // A beat that throws or holds something must resolve a prop even if the action itself
  // (explore, celebrate) does not usually need one. Prefer a *carryable* hero prop: throwing
  // the bench across the playground is not a bug we want to ship.
  if (beat.throw || beat.interact === 'hold') {
    const notCarryable = /bench|house|tree|rock|fence|slide|swing/;
    const carryable = placements.filter((p) => !notCarryable.test(p.propId));
    const pool = carryable.length ? carryable : placements;
    return pool.find((p) => p.hero) ?? pool[0] ?? null;
  }
  // Discovery/explanation beats read better when they point at something.
  //
  // But only when the hero prop is actually *there*. A story beats `absent` on a prop that the
  // plot has lost or hidden, and a beat that claims something is missing must not stand next to
  // it pointing at an empty patch of grass — or, worse, at the prop itself.
  if (beat.action === 'discover' || beat.action === 'explain') {
    const absent = new Set(beat.absent ?? []);

  // A lost prop is not being carried. If the story takes something off the stage, the carry chain
  // has to be broken in the same beat — otherwise the character keeps holding a ball that the next
  // line says is missing, which is exactly the contradiction this feature exists to remove.
  if (carried && (absent.has(carried.propId) || hidden.has(carried.propId))) carried = null;
    const shown = placements.filter((p) => !absent.has(p.propId));
    // Only a hero prop is worth pointing at. Falling back to `placements[0]` made this beat about
    // a missing ball point at the bench, which is exactly the wrong thing to look at.
    return shown.find((p) => p.hero) ?? null;
  }
  return null;
}

/** Split a line into subtitle cues short enough to read on a phone screen. */
function subtitleCues({ line, startSec, endSec, maxChars = 62 }) {
  if (!line) return [];
  // A single token longer than a cue (a URL, a run of dashes) must still be split, otherwise
  // it renders as one overflowing line.
  const words = line.split(/\s+/).flatMap((word) => {
    if (word.length <= maxChars) return [word];
    const parts = [];
    for (let i = 0; i < word.length; i += maxChars) parts.push(word.slice(i, i + maxChars));
    return parts;
  });
  const chunks = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      chunks.push(current.trim());
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) chunks.push(current.trim());

  const total = endSec - startSec;
  const weights = chunks.map((c) => c.length);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = startSec;
  return chunks.map((text, i) => {
    const span = (total * weights[i]) / weightSum;
    const cue = { startSec: Number(cursor.toFixed(3)), endSec: Number((cursor + span).toFixed(3)), text };
    cursor += span;
    return cue;
  });
}

/**
 * Turn one beat into one scene.
 * @returns {{scene:object, timing:object}}
 */
export function directBeat({
  beat, index, script, world, cast, characters, leadId, previousLocation, previousShot,
  transitionOverride, hidden = new Set(), carried = null,
}) {
  const intent = intentFor(beat.action); // throws early on a typo'd action
  const location = beat.location ?? script.locations[0];
  const placements = placeProps({ world, location });
  // `absent` is a story fact, not a staging hint: these props are off-stage for this beat because
  // the plot has lost or hidden them. Filtering here means no downstream rule can feature a ball
  // that the characters are in the middle of looking for.
  const absent = new Set(beat.absent ?? []);

  // A lost prop is not being carried. If the story takes something off the stage, the carry chain
  // has to be broken in the same beat — otherwise the character keeps holding a ball that the next
  // line says is missing, which is exactly the contradiction this feature exists to remove.
  if (carried && (absent.has(carried.propId) || hidden.has(carried.propId))) carried = null;
  // Absent only makes sense for a prop this location actually stages. Saying "the ball is gone"
  // at the river, where there was never a ball, is a script mistake — but it is also harmless,
  // and a location change is exactly when people write it. So it is a warning-shaped no-op, not
  // a hard stop, unless the prop is not in the world at all.
  const worldProps = new Set((world.propCatalog ?? []).map((p) => p.id));
  for (const id of absent) {
    if (!worldProps.has(id)) {
      throw new StudioError(`beat '${beat.id}' marks prop '${id}' absent, but no such prop exists in world '${world.id}'`, {
        hint: 'absent hides a prop; it cannot invent one or remove something that never existed',
      });
    }
  }
  // `hidden` carries the story forward: a prop a previous beat lost stays lost in every later
  // scene at that location, whether or not this beat's line mentions it. Without this, the ball
  // pops back onto the grass in the very next shot because that beat simply did not repeat the
  // word "absent" — the audience reads that as the ball being found twice.
  let present = placements.filter((p) => !absent.has(p.propId) && !hidden.has(p.propId));
  const stillHidden = new Set([...hidden, ...absent]);

  // A `reveal` puts something back into shot. Hiding a prop and showing it are opposite actions,
  // so one flag cannot express both: a beat that finds the ball needs the ball on stage for the
  // second half of the beat, while the beats before it must not have it at all.
  if (beat.reveal) {
    const r = beat.reveal;
    if (present.some((p) => p.propId === r.prop)) {
      throw new StudioError(`beat '${beat.id}' reveals '${r.prop}', which is already on stage`, {
        hint: 'reveal is for a prop the story has hidden with "absent"',
      });
    }
    const catalog = (world.propCatalog ?? []).find((p) => p.id === r.prop);
    if (!catalog) {
      throw new StudioError(`beat '${beat.id}' reveals '${r.prop}', which is not in the world prop catalogue`);
    }
    const loc = world.locations.find((l) => l.id === location);
    stillHidden.delete(r.prop);
    present = [...present, {
      propId: r.prop,
      x: num(r.x ?? 0.5),
      y: num(r.y ?? loc?.groundLineY ?? 0.84),
      scale: num(r.scale ?? catalog.scaleUnits ?? 1),
      appearsAt: num(r.atSec ?? 0),
    }];
  }

  // A held prop has to be on stage wherever its carrier is. The ball is only in the playground's
  // prop list, so the moment the story walked to the river the found ball disappeared — the
  // characters arrived at the payoff scene with nothing in their hands.
  if (carried && !absent.has(carried.propId) && !present.some((p) => p.propId === carried.propId)) {
    const catalog = (world.propCatalog ?? []).find((p) => p.id === carried.propId);
    const loc = world.locations.find((l) => l.id === location);
    if (!catalog) {
      throw new StudioError(`'${carried.characterId}' is carrying '${carried.propId}', which is not in the world prop catalogue`);
    }
    present = [...present, {
      propId: carried.propId,
      x: 0.5,
      y: num(loc?.groundLineY ?? 0.84),
      scale: num(catalog.scaleUnits ?? 1),
      carriedIn: true,
    }];
    stillHidden.delete(carried.propId);
  }

  // A beat that reveals a prop is about that prop: it is what the character has just found, and
  // what every later rule (facing, interaction, pointing) should work from. Picking the location's
  // hero prop instead made a beat reveal the ball and then bend down over a flower patch.
  const beatProp = beat.prop ?? beat.reveal?.prop ?? null;
  const prop = pickProp({ beat: beatProp ? { ...beat, prop: beatProp } : beat, placements: present, hidden: stillHidden, carried });

  // Timing: measured audio wins; otherwise estimate so a script can be staged before TTS.
  const lineDuration = beat.line
    ? Number(beat.lineDurationSec ?? estimateLineDuration(beat.line))
    : 0;
  const durationSec = Number(
    (beat.durationSec ?? (ROOT_PAD + Math.max(lineDuration, 1.2) + TAIL_PAD)).toFixed(3),
  );
  if (durationSec <= 0) throw new StudioError(`beat '${beat.id}' has non-positive duration`);

  // Where the line sits inside the beat. Needed before the characters are built, because the
  // performance is timed against the voice.
  const lineStart = ROOT_PAD;
  // Scene id is derived here because the dialogue asset path is keyed by it.
  const sceneId = `sc-${String(index + 1).padStart(3, '0')}-${beat.id}`;

  // Blocking needs the partner's mark, which needs the actor's mark: solve partner first.
  const block = blockBeat({ beat, cast, propPlacements: placements, leadId, characters });

  // Shot choice, with continuity rules.
  const shotOverride = shotForTransition({
    fromLocation: previousLocation,
    toLocation: location,
    intent,
    previousShot,
  });
  const frame = frameBeat({
    block,
    shotOverride,
    intensity: beat.intensity ?? 0.5,
    durationSec,
  });

  const poses = posesFor({ beat, block, cast, characters });

  /** When a prop arrives in shot, or null if it was always there. */
  const revealedAt = (p) => present.find((x) => x.propId === p?.propId)?.appearsAt ?? null;

  // Declared before every block that reads or fills them. The throw has to be solved *before*
  // the carry windows, because a carried prop leaves the hands at the moment of release — and the
  // windows have to be solved before the character loop, which records what is still being held
  // into the next beat. Getting this order wrong is silent: the prop is held through its own
  // flight, so it snaps back to the thrower's hand as soon as it lands.
  const flights = [];
  const carryWindows = [];
  const interactions = [];

  if (beat.throw && prop) {
    // A throw must name who catches it. Falling back to "whoever happens to be nearby" makes
    // the story ambiguous — the ball could go to the wrong character.
    if (!beat.target) {
      throw new StudioError(`beat '${beat.id}' throws '${prop.propId}' but names no target`, {
        hint: 'add "target": "<characterId>" so the director knows who catches it',
      });
    }
    const targetMark = block.positions.get(beat.target);
    if (!targetMark) {
      throw new StudioError(`beat '${beat.id}' throws to '${beat.target}', who is not in this beat's cast`, {
        hint: 'the target must be a cast member present in the scene',
      });
    }
    const startSec = Number((beat.throw.atSec ?? ROOT_PAD + 0.3).toFixed(3));
    const flightSec = Number((beat.throw.durationSec ?? 0.9).toFixed(3));
    const endSec = Number((startSec + flightSec).toFixed(3));
    if (endSec > durationSec) {
      throw new StudioError(`beat '${beat.id}' throw ends at ${endSec}s but the scene is ${durationSec}s`, {
        hint: 'shorten the throw or give the beat an explicit durationSec',
      });
    }
    // Hands sit a little above each character's ground line.
    const handLift = 0.34 * (bodyHeightRatio(characters.get(block.actorId)) / heightRef);
    // A throw can only leave the hands of whoever is actually holding the prop. Using the beat's
    // actor unconditionally meant a beat could throw a ball it was not holding, or could pick one
    // up mid-air. When the prop is already in someone's hands, they are the thrower.
    const throwerId = carried && carried.propId === prop.propId ? carried.characterId : block.actorId;
    const throwerMark = block.positions.get(throwerId);
    if (!throwerMark) {
      throw new StudioError(`beat '${beat.id}' throws '${prop.propId}', but '${throwerId}' is not in this scene`, {
        hint: 'the thrower must be on stage, and must be the one holding the prop',
      });
    }
    flights.push({
      propId: prop.propId,
      // Both ends are named so the renderer can fly the prop between the actual hands (the rig
      // knows where a hand is; a stored coordinate would only be a guess).
      fromCharacterId: throwerId,
      toCharacterId: beat.target,
      fromX: Number((throwerMark.x + 0.05).toFixed(4)),
      fromY: Number((throwerMark.y - handLift).toFixed(4)),
      toX: Number((targetMark.x + 0.03).toFixed(4)),
      toY: Number((targetMark.y - handLift).toFixed(4)),
      startSec,
      endSec,
      ...(beat.throw.arc != null ? { arc: beat.throw.arc } : {}),
      spin: beat.throw.spin ?? true,
      note: `${beat.action}: ${throwerId} throws ${prop.propId} to ${beat.target}`,
    });
  }

  // Throwing something requires having held it. A script that writes a throw and forgets to say
  // `interact: "hold"` used to produce a ball that left a hand it was never in, so the hold is
  // implied from the start of the beat up to release.
  if (prop && beat.throw && beat.interact !== 'hold' && beat.interact !== 'none') {
    const releaseAtSec = flights[0]?.startSec ?? null;
    const fromSec = Number((revealedAt(prop) ?? ROOT_PAD + 0.4).toFixed(3));
    if (releaseAtSec != null && releaseAtSec > fromSec) {
      interactions.push({
        propId: prop.propId,
        characterId: flights[0].fromCharacterId,
        fromSec,
        toSec: releaseAtSec,
        attach: 'hands',
        note: `${beat.action}: ${flights[0].fromCharacterId} holds ${prop.propId} before the throw`,
      });
    }
  }

  if (prop && beat.interact !== 'none') {
    const attach = beat.interact === 'hold' ? 'hands' : null;
    const releaseSec = flights[0]?.startSec ?? null;
    if (attach) {
      // You cannot pick something up before it is in shot. A revealed prop is held from the
      // instant it appears; otherwise the character walks on camera already holding an object
      // the audience has not been shown yet, which gives away the reveal.
      const fromSec = Number((revealedAt(prop) ?? ROOT_PAD + 0.4).toFixed(3));
      const carryEnd = Number((durationSec - TAIL_PAD).toFixed(3));
      const toSec = releaseSec != null ? releaseSec : Number(Math.max(fromSec + 0.6, carryEnd).toFixed(3));
      if (toSec > fromSec) {
        interactions.push({
          propId: prop.propId,
          characterId: block.actorId,
          fromSec,
          toSec,
          attach,
          note: `${beat.action}: ${block.actorId} carries ${prop.propId}`,
        });
      }
    }
    // A throw with a catcher means the prop changes hands: the catcher holds it from the
    // moment it lands until the scene ends. This is what makes a catch read as a catch.
    if (flights.length) {
      const catchFrom = Number((flights[0].endSec).toFixed(3));
      const catchTo = Number((durationSec - TAIL_PAD).toFixed(3));
      if (catchTo > catchFrom) {
        interactions.push({
          propId: prop.propId,
          characterId: beat.target,
          fromSec: catchFrom,
          toSec: catchTo,
          attach: 'hands',
          note: `${beat.action}: ${beat.target} catches ${prop.propId}`,
        });
      }
    }
  }

  // Characters array, ordered back-to-front so the renderer's z sort is stable.
  const sceneCharacters = [...block.positions.values()]
    .sort((a, b) => a.z - b.z || a.x - b.x)
    .map((pos) => {
      const pose = poses.get(pos.characterId);
      const character = characters.get(pos.characterId);
      if (!character) {
        throw new StudioError(`beat '${beat.id}' uses '${pos.characterId}', which is not in the character library`);
      }
      // Real travel: an entry path becomes a motion track the renderer samples per frame.
      let motion = motionTrackFor({ entry: pos.entry, durationSec });

      // Depth: walking into or out of the picture adds a z ramp, which also drives scale and
      // the ground line — no separate scale track needed.
      if (pos.isActor && (beat.depth === 'away' || beat.depth === 'toward-camera')) {
        // Depth does not need an entry walk: a stationary actor can still walk away from the
        // camera while the shot holds.
        if (!motion) {
          motion = {
            path: [
              { t: 0, x: num(pos.x), y: num(pos.y) },
              { t: durationSec, x: num(pos.x), y: num(pos.y) },
            ],
            ease: 'ease-in-out',
            durationSec,
          };
        }
        const fromZ = beat.depth === 'away' ? 0.5 : 0.9;
        const toZ = beat.depth === 'away' ? 0.9 : 0.5;
        motion = {
          ...motion,
          path: motion.path.map((kf, i) => ({
            ...kf,
            z: Number((i === 0 ? fromZ : toZ).toFixed(3)),
          })),
        };
      }

      // If the character travels, the pose must be a walk cycle, otherwise legs slide.
      const animation = motion && (motion.path[0].x < -0.01 || motion.path[0].x > 1.01)
        ? 'walk'
        : pose.animation;

      // The performance: which pose, and when. A beat used to be a single pose for its whole
      // duration, so a character surprised at second one was still surprised at second six.
      const poseTrack = performanceFor({
        role: pos.isActor ? 'actor' : 'reactor',
        intent: block.intent,
        emotion: beat.emotion ?? 'neutral',
        durationSec,
        travelling: Boolean(motion),
        // The line is the clock the performance hangs from: it tells the director when the
        // actor's gesture should be released instead of held to the end of the beat.
        lineStartSec: lineStart,
        lineDurationSec: lineDuration,
        feelFirst: Boolean(beat.feelFirst),
      });

      // A carry inherited from the previous beat has to be marked here, at the only place that has
      // both the cast of this scene and the prop list: an inherited hold that is not re-stated by
      // the script must still appear as a hold on screen, or the object arrives in shot with the
      // character's hands at their sides and the ball hovering beside them.
      const carries = Boolean(
        carried
        && prop
        && prop.propId === carried.propId
        && carried.characterId === pos.characterId,
      );
      if (carries) {
        carryWindows.push({ propId: carried.propId, characterId: carried.characterId, fromSec: 0 });
      }


      return {
        characterId: pos.characterId,
        position: { x: pos.x, y: pos.y, z: pos.z },
        scale: Number(pos.scale.toFixed(3)),
        facing: pos.facing,
        expression: pose.expression,
        animation,
        restAnimation: pose.restAnimation,
        entranceAt: 0,
        ...(motion ? { motion } : {}),
        ...(poseTrack && poseTrack.length > 1 ? { poseTrack } : {}),
      };
    });

  // --- story state leaving this beat ---------------------------------------------------------
  // Everything below runs after the character loop, because only that loop knows which carried
  // props actually have a carrier on stage in this scene.

  // Inherited holds become ordinary hold windows, opened at the first frame. This is what makes a
  // found object stay found: the character walks into the next shot already carrying it.
  for (const w of carryWindows) {
    if (interactions.some((i) => i.propId === w.propId && i.characterId === w.characterId && i.fromSec === 0)) continue;
    interactions.push({
      propId: w.propId,
      characterId: w.characterId,
      fromSec: 0,
      toSec: Number((durationSec - TAIL_PAD).toFixed(3)),
      attach: 'hands',
      note: `carried over: ${w.characterId} is still holding ${w.propId}`,
    });
  }

  // What leaves this beat in someone's hands. A carried prop belongs to the character, not to the
  // scene: it has to follow them into the next shot, otherwise the story loses the object every
  // time the location or the beat changes. "Still holding at the end" means the window reaches the
  // tail of the beat, which is where every hold closes by construction.
  const holdEndsAt = Number((durationSec - TAIL_PAD).toFixed(3));
  const heldAtEnd = interactions
    .filter((i) => i.attach === 'hands' && i.toSec >= holdEndsAt - 0.05)
    .at(-1) ?? null;
  const carriedNext = heldAtEnd
    ? { propId: heldAtEnd.propId, characterId: heldAtEnd.characterId, fromBeatId: beat.id }
    : null;

  const lineEnd = Number((lineStart + lineDuration).toFixed(3));

  const dialogue = beat.line
    ? [{
        id: `${beat.id}-d01`,
        characterId: block.actorId,
        text: beat.line,
        startSec: Number(lineStart.toFixed(3)),
        emotion: beat.emotion ?? 'neutral',
        // The voice generator writes into audio/generated/<episode>/<SCENE id>/, keyed by the
        // scene, not the beat. Guessing .../<beatId>/<beatId>-d01.wav here pointed at a file that
        // never exists, so re-directing after voice:generate silently replaced the real asset path
        // with a wrong one and the render refused with "dialogue line has no rendered audio".
        audioAsset: `audio/generated/${script.episodeId}/${sceneId}/${beat.id}-d01.wav`,
        durationSec: Number(lineDuration.toFixed(3)),
      }]
    : [];

  const subtitles = beat.line
    ? subtitleCues({ line: beat.line, startSec: lineStart, endSec: lineEnd })
    : [];

  // Prop interaction: if the beat is about a prop and the actor reaches it, the prop is
  // attached to them for the middle of the scene (picked up, carried). "ground" means it is
  // touched but stays put. A beat can opt out with `interact: "none"`.
  // A throw is solved from the two marks: the director knows where both characters stand,
  // so the author only supplies timing.
  // Carrying and throwing both claim the same prop, so they must agree on who holds it when.
  // The carry window ends the instant the throw leaves the hand — otherwise the renderer's
  // precedence rule gives the ball back to the thrower as soon as the flight is over, and the
  // catcher is left miming a catch.
  const scene = {
    schemaVersion: 1,
    id: sceneId,
    beatId: beat.id,
    worldId: script.worldId,
    episodeId: script.episodeId,
    location,
    durationSec,
    fps: script.fps ?? 24,
    camera: {
      preset: frame.preset,
      keyframes: frame.keyframes,
    },
    characters: sceneCharacters,
    props: present.map((p) => ({
      propId: p.propId,
      x: Number(p.x.toFixed(3)),
      y: Number(p.y.toFixed(3)),
      scale: Number(p.scale.toFixed(3)),
      // Only written when the prop genuinely arrives mid-beat; absent means "on stage from frame 0".
      ...(p.appearsAt ? { appearsAt: Number(p.appearsAt.toFixed(3)) } : {}),
    })),
    dialogue,
    subtitles,
    ...(interactions.length ? { interactions } : {}),
    ...(flights.length ? { flights } : {}),
    audioTracks: (world.locations.find((l) => l.id === location)?.ambientAudio
      ? [{
          id: `${beat.id}-ambience`,
          kind: 'ambience',
          asset: world.locations.find((l) => l.id === location).ambientAudio,
          gainDb: -18,
        }]
      : []),
    direction: {
      action: beat.action,
      intent: beat.action,
      actor: block.actorId,
      target: block.partnerId,
      prop: prop?.propId ?? null,
      shot: frame.preset,
      focusX: frame.focusX,
      widenedForSpread: frame.widenedForSpread,
      entry: block.positions.get(block.actorId)?.entry.kind ?? 'still',
      lineEstimated: beat.line ? beat.lineDurationSec == null : false,
      transition: transitionOverride ?? (previousLocation && previousLocation !== location ? 'establishing' : 'cut'),
    },
  };

  return {
    scene,
    // What is still off-stage after this beat, so the next scene inherits the story rather than
    // re-reading the prop list from scratch.
    hiddenNext: stillHidden,
    carriedNext,
    timing: {
      beatId: beat.id,
      durationSec,
      lineDurationSec: lineDuration,
      rootPadSec: ROOT_PAD,
      tailPadSec: TAIL_PAD,
    },
  };
}

/**
 * Direct a whole script into scenes.
 * @returns {Promise<{scenes:Array, episode:object, report:object}>}
 */
export async function directScript({ script, world, characters }) {
  if (script.worldId !== world.id) {
    throw new StudioError(`script targets world '${script.worldId}' but '${world.id}' was loaded`);
  }
  for (const loc of script.locations) {
    if (!world.locations.some((l) => l.id === loc)) {
      throw new StudioError(`script location '${loc}' does not exist in world '${world.id}'`);
    }
  }

  const castList = script.cast?.length
    ? script.cast
    : [...new Set(script.beats.map((b) => b.actor).filter(Boolean))].map((characterId) => ({ characterId }));
  const leadId = castList.find((c) => c.role === 'lead')?.characterId ?? castList[0]?.characterId ?? null;
  if (!leadId) throw new StudioError('script has no cast and no beat actor — cannot determine the lead');

  const cast = castIndex(castList, leadId);
  const scenes = [];
  const timings = [];
  let previousLocation = null;
  let previousShot = null;
  // Props the story has taken off the stage. Carried from beat to beat so a lost ball stays lost
  // through a location change instead of reappearing every time the prop list is rebuilt.
  let hidden = new Set();
  let carried = null;

  for (const [i, beat] of script.beats.entries()) {
    const override = script.transitions?.find((t) => t.afterBeat === script.beats[i - 1]?.id)?.kind ?? null;
    const { scene, timing, hiddenNext, carriedNext } = directBeat({
      beat,
      index: i,
      script,
      world,
      cast,
      characters,
      leadId,
      previousLocation,
      previousShot,
      transitionOverride: override,
      hidden,
      carried,
    });
    scenes.push(scene);
    timings.push(timing);
    hidden = hiddenNext;
    carried = carriedNext;
    previousLocation = scene.location;
    previousShot = scene.camera.preset;
  }

  const totalDurationSec = Number(scenes.reduce((sum, s) => sum + s.durationSec, 0).toFixed(3));
  const episode = {
    schemaVersion: 1,
    id: script.episodeId,
    title: script.title ?? script.episodeId,
    worldId: script.worldId,
    concept: script.concept ?? null,
    sceneIds: scenes.map((s) => s.id),
    totalDurationSec,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    scriptId: script.id,
    episodeId: script.episodeId,
    worldId: script.worldId,
    sceneCount: scenes.length,
    totalDurationSec,
    targetDurationSec: script.targetDurationSec ?? null,
    lead: leadId,
    cast: cast.ids,
    locationsUsed: [...new Set(scenes.map((s) => s.location))],
    estimatedLines: timings.filter((t) => t.lineDurationSec > 0).length,
    shots: scenes.map((s) => ({ sceneId: s.id, shot: s.camera.preset, seconds: s.durationSec })),
    travelling: scenes.reduce((n, s) => n + s.characters.filter((c) => c.motion).length, 0),
    interactions: scenes.reduce((n, s) => n + (s.interactions?.length ?? 0), 0),
    flights: scenes.reduce((n, s) => n + (s.flights?.length ?? 0), 0),
    warnings: buildWarnings({ scenes, script, world }),
  };
  return { scenes, episode, report };
}

function buildWarnings({ scenes, script, world }) {
  const warnings = [];
  for (const s of scenes) {
    const loc = world.locations.find((l) => l.id === s.location);
    if (!loc?.background) {
      warnings.push(`${s.id}: location '${s.location}' has no background plate — the renderer will draw a flat sky`);
    }
    if (s.dialogue.length && s.dialogue[0].durationSec < 1) {
      warnings.push(`${s.id}: line is only ${s.dialogue[0].durationSec}s — may be too short to read`);
    }
    const withAudio = s.dialogue.every((d) => !d.audioAsset || d.audioAsset.startsWith('audio/generated/'));
    if (!withAudio) warnings.push(`${s.id}: dialogue asset path is outside audio/generated — check the generator`);
  }
  const usedActions = new Set(script.beats.map((b) => b.action));
  for (const action of usedActions) {
    try {
      intentFor(action);
    } catch (err) {
      warnings.push(err.message);
    }
  }
  if (script.targetDurationSec) {
    const total = scenes.reduce((a, s) => a + s.durationSec, 0);
    if (Math.abs(total - script.targetDurationSec) > script.targetDurationSec * 0.25) {
      warnings.push(
        `directed length ${total.toFixed(1)}s is more than 25% away from target ${script.targetDurationSec}s`,
      );
    }
  }
  return warnings;
}

/** Write directed scenes + episode file into projects/<episodeId>/. */
export async function writeDirectedEpisode({ scenes, episode, report, episodeId, scriptPath }) {
  const dir = path.join(P.projects, episodeId);
  const scenesDir = path.join(dir, 'scenes');
  await ensureDir(scenesDir);

  const written = [];
  for (const scene of scenes) {
    const file = path.join(scenesDir, `${scene.id}.json`);
    await writeJson(file, scene);
    written.push(rel(file));
  }

  const playback = buildPlayback({ scenes, episode });
  const episodeFile = path.join(dir, 'episode.json');
  // Match the episode contract the renderer/preview/validator already read:
  // scenes is a list of {sceneId, file}; concept/output are required by the schema.
  await writeJson(episodeFile, {
    schemaVersion: 1,
    id: episode.id,
    title: episode.title,
    worldId: episode.worldId,
    status: 'storyboarded',
    // Episode concept requires durationTargetSec; prefer the story's target, else the
    // directed length, so the episode contract is always satisfied.
    concept: {
      logline: episode.concept?.logline ?? episode.title,
      moral: episode.concept?.moral ?? 'Belajar bersama teman.',
      targetAge: episode.concept?.targetAge ?? '4-6',
      durationTargetSec: episode.concept?.durationTargetSec ?? episode.totalDurationSec,
    },
    scenes: scenes.map((s) => ({
      sceneId: s.id,
      file: rel(path.join(scenesDir, `${s.id}.json`)),
    })),
    output: episode.output ?? {
      width: 1280,
      height: 720,
      fps: scenes[0]?.fps ?? 24,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
    },
  });
  const reportFile = path.join(dir, 'direction-report.json');
  await writeJson(reportFile, { ...report, script: scriptPath ? rel(scriptPath) : null });

  await writeJson(path.join(dir, 'playback.json'), playback);
  return { dir, scenes: written, episodeFile: rel(episodeFile), reportFile: rel(reportFile), playbackFile: rel(path.join(dir, 'playback.json')) };
}

/** Episode-level playback manifest: what plays when, and how scenes join. */
function buildPlayback({ scenes, episode }) {
  let cursor = 0;
  const timeline = scenes.map((s) => {
    const entry = {
      sceneId: s.id,
      startSec: Number(cursor.toFixed(3)),
      endSec: Number((cursor + s.durationSec).toFixed(3)),
      location: s.location,
      shot: s.camera.preset,
      dialogue: s.dialogue.map((d) => ({ id: d.id, characterId: d.characterId, startSec: Number((cursor + d.startSec).toFixed(3)) })),
    };
    cursor += s.durationSec;
    return entry;
  });
  return {
    totalDurationSec: Number(cursor.toFixed(3)),
    timeline,
    output: {
      width: 1280,
      height: 720,
      fps: scenes[0]?.fps ?? 24,
      videoCodec: 'h264',
      audioCodec: 'aac',
    },
    episodeSchemaVersion: episode.schemaVersion,
  };
}

export { ROOT_PAD, TAIL_PAD, LANES, EMOTION_POSE };
