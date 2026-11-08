#!/usr/bin/env node
// Direct a script into scenes: story beats in, renderable scene JSON out.
//
//   npm run studio:direct -- --episode ep-001
//   npm run studio:direct -- --script scripts/example-script.json --dry-run
//
// Nothing here needs audio. Lines without measured audio are estimated so a story can be
// blocked and previewed before any voice exists — which is the whole point of the director
// layer: the container is ready before the performance.
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, rel, exists } from '../lib/paths.mjs';
import { readJson, writeJson } from '../lib/json.mjs';
import { log, StudioError } from '../lib/log.mjs';
import { validateAgainst } from '../lib/schema.mjs';
import { directScript, writeDirectedEpisode } from '../../apps/director/director.mjs';
import { INTENTS } from '../../apps/director/intents.mjs';

function parseArgs(argv) {
  const out = { episode: null, script: null, dryRun: false, force: false, json: false, measure: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    if (a.startsWith('--') && a.includes('=')) {
      inline = a.slice(a.indexOf('=') + 1);
      a = a.slice(0, a.indexOf('='));
    }
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (a === '--episode') out.episode = value();
    else if (a === '--script') out.script = value();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--json') out.json = true;
    else if (a === '--measure') out.measure = true;
    else throw new StudioError(`unknown argument: ${a}`);
  }
  if (!out.episode && !out.script) {
    throw new StudioError('provide --episode <id> or --script <path>', {
      hint: 'npm run studio:direct -- --episode ep-001',
    });
  }
  return out;
}

async function resolveScriptPath(args) {
  if (args.script) return path.isAbsolute(args.script) ? args.script : path.join(process.cwd(), args.script);
  const episodeId = args.episode;
  const candidates = [
    path.join(P.projects, episodeId, 'script.json'),
    path.join(ROOT_SCRIPTS, `${episodeId}.script.json`),
  ];
  for (const c of candidates) if (await exists(c)) return c;
  throw new StudioError(`no script found for episode '${episodeId}'`, {
    hint: `expected ${candidates.map(rel).join(' or ')} — write the beat sheet first`,
  });
}

const ROOT_SCRIPTS = path.join(P.root, 'projects');

async function loadCharacters(castList) {
  const map = new Map();
  for (const entry of castList) {
    const file = path.join(P.characters, `${entry.characterId}.character.json`);
    if (!(await exists(file))) {
      throw new StudioError(`cast member '${entry.characterId}' has no character file`, {
        hint: `expected ${rel(file)}`,
      });
    }
    map.set(entry.characterId, await readJson(file));
  }
  return map;
}

/**
 * Adopt measured audio durations into the script before directing.
 *
 * The director can estimate line length from text, but estimation drifts from the real
 * recording (an espeak line can be 25% longer), which makes scenes too short for their own
 * dialogue. `--measure` reads audio/manifests/dialogue-<episode>.json and uses the true
 * duration per line, so retiming is a property of the story, not a post-hoc fix.
 */
async function applyMeasuredDurations({ script, episodeId }) {
  const manifestPath = path.join(P.audioManifests, `dialogue-${episodeId}.json`);
  if (!(await exists(manifestPath))) {
    throw new StudioError(`no dialogue manifest for '${episodeId}'`, {
      hint: 'run npm run voice:generate -- --episode ' + episodeId + ' first, or drop --measure',
    });
  }
  const manifest = await readJson(manifestPath);
  const byScene = new Map();
  for (const record of manifest.records ?? []) {
    if (record.durationSec == null) continue;
    byScene.set(record.sceneId, { durationSec: record.durationSec, dialogueId: record.dialogueId });
  }

  let applied = 0;
  const beats = script.beats.map((beat) => {
    // A directed scene id is sc-<NNN>-<beatId>; match on the beat id suffix.
    const match = [...byScene.entries()].find(([sceneId]) => sceneId.endsWith(`-${beat.id}`));
    if (!match) return beat;
    applied += 1;
    return { ...beat, lineDurationSec: Number(match[1].durationSec) };
  });
  return { script: { ...script, beats }, applied, total: script.beats.length, manifestPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptPath = await resolveScriptPath(args);
  let script = await readJson(scriptPath);
  log.step(`directing ${rel(scriptPath)}`);

  if (args.measure) {
    const measured = await applyMeasuredDurations({ script, episodeId: script.episodeId });
    script = measured.script;
    log.info(`adopted measured audio for ${measured.applied}/${measured.total} beats from ${rel(measured.manifestPath)}`);
  }

  const scriptErrors = await validateAgainst('script.schema.json', script, rel(scriptPath));
  if (scriptErrors.length) {
    throw new StudioError('script failed schema validation', { code: 2, details: scriptErrors.map((e) => `${e.where}: ${e.message}`) });
  }

  const worldFile = path.join(P.worlds, `${script.worldId}.world.json`);
  if (!(await exists(worldFile))) throw new StudioError(`world '${script.worldId}' not found`);
  const world = await readJson(worldFile);

  // Reading the character library is a separate failure from directing, so report it clearly.
  const castList = script.cast?.length
    ? script.cast
    : [...new Set(script.beats.map((b) => b.actor).filter(Boolean))].map((characterId) => ({ characterId }));
  const characters = await loadCharacters(castList);

  const { scenes, episode, report } = await directScript({ script, world, characters });

  // Every directed scene must satisfy the renderer contract before it is written.
  const sceneErrors = [];
  for (const scene of scenes) {
    const errs = await validateAgainst('scene.schema.json', scene, scene.id);
    for (const e of errs) sceneErrors.push(`${e.where}: ${e.message}`);
  }
  if (sceneErrors.length) {
    throw new StudioError('director produced scenes that violate the scene contract', { code: 2, details: sceneErrors });
  }

  if (args.json) log.plain(JSON.stringify({ report, scenes }, null, 2));

  log.plain('');
  log.plain(`  scenes      ${report.sceneCount}`);
  log.plain(`  duration    ${report.totalDurationSec}s${report.targetDurationSec ? ` (target ${report.targetDurationSec}s)` : ''}`);
  log.plain(`  locations   ${report.locationsUsed.join(', ')}`);
  log.plain(`  lead        ${report.lead}   cast: ${report.cast.join(', ')}`);
  log.plain('');
  for (const shot of report.shots) {
    log.plain(`  ${shot.sceneId.padEnd(26)} ${String(shot.seconds).padStart(6)}s  ${shot.shot}`);
  }
  if (report.estimatedLines > 0) {
    log.info(`${report.estimatedLines} line(s) used estimated duration — run with --measure after voice:generate for exact timing`);
  }
  for (const warning of report.warnings) log.warn(warning);
  log.plain('');

  if (args.dryRun) {
    log.info('dry run — nothing written');
    return;
  }

  const written = await writeDirectedEpisode({
    scenes,
    episode,
    report,
    episodeId: script.episodeId,
    scriptPath,
  });
  log.ok(`${written.scenes.length} scene(s) → ${rel(path.dirname(written.scenes[0]))}`);
  log.ok(`episode → ${written.episodeFile}`);
  log.ok(`direction report → ${written.reportFile}`);
  log.info('next: npm run render:preview -- --episode ' + script.episodeId + ' --scene ' + scenes[0].id);
}

/** Alternative intents, for when a writer asks "what actions exist?". */
export function listIntents() {
  return Object.entries(INTENTS).map(([id, intent]) => ({ id, note: intent.note }));
}

if (process.argv.includes('--list-intents')) {
  for (const { id, note } of listIntents()) log.plain(`  ${id.padEnd(12)} ${note}`);
} else {
  main().catch((err) => {
    log.error(err.message);
    if (err.details) for (const d of [].concat(err.details)) log.error(`  - ${d}`);
    if (err.hint) log.warn(`hint: ${err.hint}`);
    process.exitCode = err.code ?? 1;
  });
}
