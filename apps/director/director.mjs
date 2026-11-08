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
      const motion = motionTrackFor({
        entry: pos.entry,
        durationSec,
        holdUntilSec: durationSec,
      });

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
  const interactions = [];
  if (prop && beat.interact !== 'none') {
    const attach = beat.interact === 'hold' ? 'hands' : null;
    if (attach) {
      const fromSec = Number((ROOT_PAD + 0.4).toFixed(3));
      const toSec = Number(Math.max(fromSec + 0.6, durationSec - TAIL_PAD).toFixed(3));
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
