#!/usr/bin/env node
// Episode validation: schema conformance + every cross-reference across
// world / character / scene / dialogue / voice registry / asset library.
//
//   npm run episode:validate -- --episode ep-001
//   npm run episode:validate -- --episode ep-001 --strict   voice gate failure becomes an error
//
// Exit codes: 0 ok · 1 structural errors · 5 voice gate blocked (only with --strict)
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, abs, rel, exists } from '../lib/paths.mjs';
import { log, run, StudioError } from '../lib/log.mjs';
import { readJson } from '../lib/json.mjs';
import { validateAgainst } from '../lib/schema.mjs';

async function inferEpisode() {
  const dirs = (await fs.readdir(P.projects, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (dirs.length === 1) return dirs[0];
  throw new StudioError('--episode is required when more than one project exists', {
    hint: `available: ${dirs.join(', ')}`,
  });
}

function parseArgs(argv) {
  const out = { episode: null, strict: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--episode') out.episode = argv[++i];
    else if (argv[i] === '--strict') out.strict = true;
    else if (argv[i] === '--all') out.all = true;
  }
  return out;
}

/** Every project directory that has an episode.json. */
async function allEpisodes() {
  const dirs = (await fs.readdir(P.projects, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const out = [];
  for (const d of dirs) {
    if (await exists(path.join(P.projects, d, 'episode.json'))) out.push(d);
  }
  return out.sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --all: validate every episode, then summarise. Used by `npm run validate` so adding a
  // second story cannot silently stop the suite from checking anything.
  if (args.all) {
    const episodes = await allEpisodes();
    const results = [];
    for (const episode of episodes) {
      const code = await validateOne(episode, args.strict);
      results.push({ episode, code });
    }
    log.plain('');
    for (const r of results) {
      const line = `${r.episode}: ${r.code === 0 ? 'OK' : `FAILED (exit ${r.code})`}`;
      if (r.code === 0) log.ok(line);
      else log.error(line);
    }
    return results.every((r) => r.code === 0) ? 0 : 1;
  }

  if (!args.episode) args.episode = await inferEpisode();
  return validateOne(args.episode, args.strict);
}

async function validateOne(episodeId, strict) {
  const args = { episode: episodeId, strict };
  const errors = [];
  const warnings = [];

  // ---------- load world + characters + voice registry ----------
  const episodeFile = path.join(P.projects, args.episode, 'episode.json');
  const episode = await readJson(episodeFile);
  errors.push(...(await validateAgainst('episode.schema.json', episode, rel(episodeFile))).map((e) => `${e.where}: ${e.message}`));

  const worldFile = path.join(P.worlds, `${episode.worldId}.world.json`);
  if (!(await exists(worldFile))) {
    throw new StudioError(`world '${episode.worldId}' not found (${rel(worldFile)})`, { code: 2 });
  }
  const world = await readJson(worldFile);
  errors.push(...(await validateAgainst('world.schema.json', world, rel(worldFile))).map((e) => `${e.where}: ${e.message}`));

  const locations = new Map(world.locations.map((l) => [l.id, l]));
  const animations = new Map(world.animationCatalog.map((a) => [a.id, a]));
  const cameraPresets = new Map(world.cameraPresets.map((c) => [c.id, c]));

  const characters = new Map();
  for (const f of await fs.readdir(P.characters).catch(() => [])) {
    if (!f.endsWith('.character.json')) continue;
    const ch = await readJson(path.join(P.characters, f));
    characters.set(ch.id, ch);
  }

  const registry = await readJson(P.voiceRegistry);
  const profileByAlias = new Map((registry.profiles ?? []).map((p) => [p.voiceAlias, p]));

  // ---------- episode-level checks ----------
  if (episode.worldId !== world.id) errors.push(`episode.worldId '${episode.worldId}' != world id '${world.id}'`);

  let totalDuration = 0;
  const speakingCharacters = new Set();
  const gateBlocks = [];

  for (const sceneRef of episode.scenes) {
    const file = abs(sceneRef.file);
    if (!(await exists(file))) {
      errors.push(`scene '${sceneRef.sceneId}' file is missing: ${sceneRef.file}`);
      continue;
    }
    const scene = await readJson(file);
    const label = rel(file);

    for (const e of await validateAgainst('scene.schema.json', scene, label)) errors.push(`${e.where}: ${e.message}`);

    if (scene.id !== sceneRef.sceneId) errors.push(`${label}: scene.id '${scene.id}' != episode reference '${sceneRef.sceneId}'`);
    if (scene.episodeId !== episode.id) errors.push(`${label}: episodeId '${scene.episodeId}' != '${episode.id}'`);
    if (scene.worldId !== world.id) errors.push(`${label}: worldId '${scene.worldId}' != '${world.id}'`);

    totalDuration += scene.durationSec ?? 0;

    if (!locations.has(scene.location)) {
      errors.push(`${label}: location '${scene.location}' is not defined in world '${world.id}'`);
    }
    if (!cameraPresets.has(scene.camera.preset)) {
      errors.push(`${label}: camera preset '${scene.camera.preset}' is not defined in the world`);
    }
    for (const kf of scene.camera.keyframes ?? []) {
      if (kf.t > scene.durationSec) warnings.push(`${label}: camera keyframe at ${kf.t}s is beyond scene duration ${scene.durationSec}s`);
    }

    for (const inst of scene.characters) {
      const ch = characters.get(inst.characterId);
      if (!ch) {
        errors.push(`${label}: character '${inst.characterId}' not found in library/characters`);
        continue;
      }
      if (ch.worldId !== world.id) errors.push(`${label}: character '${inst.characterId}' belongs to world '${ch.worldId}', not '${world.id}'`);

      const anim = animations.get(inst.animation);
      if (!anim) errors.push(`${label}: animation '${inst.animation}' is not in the world animation catalogue`);
      else if (!anim.appliesTo.includes(inst.characterId)) {
        errors.push(`${label}: animation '${inst.animation}' is not rigged for character '${inst.characterId}'`);
      }

      if (!ch.rig.expressions.includes(inst.expression)) {
        errors.push(`${label}: expression '${inst.expression}' is not available on rig '${ch.rig.rigId}'`);
      }
      if (inst.entranceAt != null && inst.entranceAt > scene.durationSec) {
        warnings.push(`${label}: character '${inst.characterId}' enters at ${inst.entranceAt}s, after the scene ends`);
      }
    }

    const propIds = new Set(world.propCatalog.map((p) => p.id));
    for (const prop of scene.props ?? []) {
      if (!propIds.has(prop.propId)) errors.push(`${label}: prop '${prop.propId}' is not in the world prop catalogue`);
    }

    const onScreen = new Set(scene.characters.map((c) => c.characterId));
    for (const line of scene.dialogue ?? []) {
      speakingCharacters.add(line.characterId);

      if (!onScreen.has(line.characterId)) {
        warnings.push(`${label}: dialogue '${line.id}' is spoken by '${line.characterId}' who is not placed in this scene`);
      }
      if ((line.startSec ?? 0) >= scene.durationSec) {
        errors.push(`${label}: dialogue '${line.id}' starts at ${line.startSec}s, beyond scene duration ${scene.durationSec}s`);
      }
      if (line.durationSec != null && line.startSec + line.durationSec > scene.durationSec + 0.001) {
        errors.push(`${label}: dialogue '${line.id}' ends at ${(line.startSec + line.durationSec).toFixed(2)}s, beyond scene duration`);
      }
      if (line.audioAsset && !(await exists(path.join(ROOT, line.audioAsset)))) {
        const derived = line.audioAsset.startsWith('audio/generated/');
        const msg = `${label}: dialogue '${line.id}' audio is missing: ${line.audioAsset}`;
        if (derived) warnings.push(`${msg} (derived — rerun npm run voice:generate)`);
        else errors.push(msg);
      }
      if (!line.audioAsset) warnings.push(`${label}: dialogue '${line.id}' has no rendered audio yet`);
    }

    let prevEnd = -1;
    for (const [i, sub] of (scene.subtitles ?? []).entries()) {
      if (sub.endSec <= sub.startSec) errors.push(`${label}: subtitle ${i} ends before it starts`);
      if (sub.endSec > scene.durationSec + 0.001) errors.push(`${label}: subtitle ${i} extends past the scene duration`);
      if (sub.startSec < prevEnd) warnings.push(`${label}: subtitle ${i} overlaps the previous subtitle`);
      prevEnd = sub.endSec;
    }
  }

  // ---------- voice gate ----------
  for (const characterId of speakingCharacters) {
    const ch = characters.get(characterId);
    if (!ch) continue;
    const alias = ch.voice?.voiceAlias;
    if (!alias) {
      gateBlocks.push(`${characterId}: no voiceAlias on the character`);
      continue;
    }
    const profile = profileByAlias.get(alias);
    if (!profile) {
      gateBlocks.push(`${characterId}: alias '${alias}' missing from registry`);
      continue;
    }
    if (profile.status !== 'approved') {
      gateBlocks.push(`${characterId}: '${alias}' is '${profile.status}', not approved`);
    }
  }

  // ---------- report ----------
  log.plain('');
  log.plain(`episode    ${episode.id} — ${episode.title}`);
  log.plain(`world      ${world.id} (${world.locations.length} locations, ${world.animationCatalog.length} animations)`);
  log.plain(`scenes     ${episode.scenes.length}, total ${totalDuration.toFixed(1)}s (target ${episode.concept.durationTargetSec}s)`);
  log.plain(`speakers   ${[...speakingCharacters].join(', ') || 'none'}`);
  log.plain('');

  for (const w of warnings) log.warn(w);
  for (const e of errors) log.error(e);

  log.plain('');
  if (errors.length) {
    log.error(`episode validation FAILED: ${errors.length} error(s), ${warnings.length} warning(s)`);
    return 1;
  }

  if (gateBlocks.length) {
    log.warn(`VOICE GATE: ${gateBlocks.length} character(s) cannot be voiced`);
    for (const g of gateBlocks) log.warn(`  - ${g}`);
    log.warn('rendering is blocked until every speaking character has an approved voice profile');
    if (args.strict) return 5;
  } else {
    log.ok('voice gate passed: every speaking character has an approved profile');
  }

  log.ok(`episode structure valid (${warnings.length} warning(s))`);
  return 0;
}

run(main);
