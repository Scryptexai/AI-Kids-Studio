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
function pickProp({ beat, placements }) {
  if (beat.prop) {
    const found = placements.find((p) => p.propId === beat.prop);
    if (!found) {
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
  if (beat.action === 'discover' || beat.action === 'explain') {
    return placements.find((p) => p.hero) ?? placements[0] ?? null;
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
export function directBeat({ beat, index, script, world, cast, characters, leadId, previousLocation, previousShot, transitionOverride }) {
  const intent = intentFor(beat.action); // throws early on a typo'd action
  const location = beat.location ?? script.locations[0];
  const placements = placeProps({ world, location });
  const prop = pickProp({ beat, placements });

  // Timing: measured audio wins; otherwise estimate so a script can be staged before TTS.
  const lineDuration = beat.line
    ? Number(beat.lineDurationSec ?? estimateLineDuration(beat.line))
    : 0;
  const durationSec = Number(
    (beat.durationSec ?? (ROOT_PAD + Math.max(lineDuration, 1.2) + TAIL_PAD)).toFixed(3),
  );
  if (durationSec <= 0) throw new StudioError(`beat '${beat.id}' has non-positive duration`);

  // Blocking needs the partner's mark, which needs the actor's mark: solve partner first.
  const block = blockBeat({ beat, cast, propPlacements: placements, leadId });

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

  const poses = posesFor({ beat, block, cast });

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
      let motion = motionTrackFor({
        entry: pos.entry,
        durationSec,
        holdUntilSec: durationSec,
      });

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

      return {
        characterId: pos.characterId,
        position: { x: pos.x, y: pos.y, z: pos.z },
        scale: Number(pos.scale.toFixed(3)),
        facing: pos.facing,
        expression: pose.expression,
        animation,
        entranceAt: 0,
        ...(motion ? { motion } : {}),
      };
    });

  const lineStart = ROOT_PAD;
  const lineEnd = Number((lineStart + lineDuration).toFixed(3));

  const dialogue = beat.line
    ? [{
        id: `${beat.id}-d01`,
        characterId: block.actorId,
        text: beat.line,
        startSec: Number(lineStart.toFixed(3)),
        emotion: beat.emotion ?? 'neutral',
        audioAsset: `audio/generated/${script.episodeId}/${beat.id}/${beat.id}-d01.wav`,
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
  const flights = [];
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
    flights.push({
      propId: prop.propId,
      // Both ends are named so the renderer can fly the prop between the actual hands (the rig
      // knows where a hand is; a stored coordinate would only be a guess).
      fromCharacterId: block.actorId,
      toCharacterId: beat.target,
      fromX: Number((block.positions.get(block.actorId).x + 0.05).toFixed(4)),
      fromY: Number((block.positions.get(block.actorId).y - handLift).toFixed(4)),
      toX: Number((targetMark.x + 0.03).toFixed(4)),
      toY: Number((targetMark.y - handLift).toFixed(4)),
      startSec,
      endSec,
      ...(beat.throw.arc != null ? { arc: beat.throw.arc } : {}),
      spin: beat.throw.spin ?? true,
      note: `${beat.action}: ${block.actorId} throws ${prop.propId} to ${beat.target}`,
    });
  }

  // Carrying and throwing both claim the same prop, so they must agree on who holds it when.
  // The carry window ends the instant the throw leaves the hand — otherwise the renderer's
  // precedence rule gives the ball back to the thrower as soon as the flight is over, and the
  // catcher is left miming a catch.
  const interactions = [];
  if (prop && beat.interact !== 'none') {
    const attach = beat.interact === 'hold' ? 'hands' : null;
    const releaseSec = flights[0]?.startSec ?? null;
    if (attach) {
      const fromSec = Number((ROOT_PAD + 0.4).toFixed(3));
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

  const scene = {
    schemaVersion: 1,
    id: `sc-${String(index + 1).padStart(3, '0')}-${beat.id}`,
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
    props: placements.map((p) => ({
      propId: p.propId,
      x: Number(p.x.toFixed(3)),
      y: Number(p.y.toFixed(3)),
      scale: Number(p.scale.toFixed(3)),
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

  for (const [i, beat] of script.beats.entries()) {
    const override = script.transitions?.find((t) => t.afterBeat === script.beats[i - 1]?.id)?.kind ?? null;
    const { scene, timing } = directBeat({
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
    });
    scenes.push(scene);
    timings.push(timing);
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
