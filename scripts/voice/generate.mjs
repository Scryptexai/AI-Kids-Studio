#!/usr/bin/env node
// Dialogue generation. Resolves every line through the APPROVED voice registry and
// produces WAV masters into audio/generated/<episode>/<scene>/.
//
//   npm run voice:generate -- --episode ep-001 --engine espeak --allow-unapproved
//
// Gates enforced here (brief sections 5, 9, 15):
//   • a line whose character has no registry profile  -> hard stop
//   • a profile that is not `approved`                -> hard stop unless --allow-unapproved
//   • an engine that is not production-eligible       -> hard stop unless --allow-unapproved
//   • never substitutes a different engine or speaker  -> no silent fallback, ever
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, abs, rel, ensureDir, exists } from '../lib/paths.mjs';
import { log, run, StudioError } from '../lib/log.mjs';
import { readJson, writeJson, sha256File } from '../lib/json.mjs';
import { loadConfig } from '../lib/config.mjs';
import { getEngine } from '../../audio/engines/index.mjs';

function parseArgs(argv) {
  const out = { episode: null, scene: null, engine: null, speaker: null, allowUnapproved: false, dryRun: false, reflow: false, gapSec: 0.35 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episode') out.episode = argv[++i];
    else if (a === '--scene') out.scene = argv[++i];
    else if (a === '--engine') out.engine = argv[++i];
    else if (a === '--speaker') out.speaker = argv[++i];
    else if (a === '--allow-unapproved') out.allowUnapproved = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--reflow') out.reflow = true;
    else if (a === '--gap') out.gapSec = Number(argv[++i]);
    else throw new StudioError(`unknown argument: ${a}`);
  }
  if (!out.episode) {
    throw new StudioError('--episode is required', { hint: 'npm run voice:generate -- --episode ep-001 --engine espeak --allow-unapproved' });
  }
  return out;
}

async function loadRegistry() {
  const registry = await readJson(P.voiceRegistry);
  const byAlias = new Map();
  for (const p of registry.profiles ?? []) byAlias.set(p.voiceAlias, p);
  return { registry, byAlias };
}

async function loadCharacter(id) {
  const file = path.join(P.characters, `${id}.character.json`);
  if (!(await exists(file))) throw new StudioError(`character '${id}' not found in library/characters`);
  return readJson(file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();
  const { byAlias } = await loadRegistry();

  const episodeDir = path.join(P.projects, args.episode);
  const episode = await readJson(path.join(episodeDir, 'episode.json'));

  const sceneFiles = episode.scenes
    .filter((s) => !args.scene || s.sceneId === args.scene)
    .map((s) => ({ sceneId: s.sceneId, file: abs(s.file) }));

  if (!sceneFiles.length) throw new StudioError(`no scenes matched (episode ${args.episode}, scene ${args.scene ?? '*'})`);

  // ---- gate: every speaking character needs a resolvable voice profile ----
  const problems = [];
  const plan = [];
  let warnedDefaultSpeaker = false;
  for (const sf of sceneFiles) {
    const scene = await readJson(sf.file);
    for (const line of scene.dialogue ?? []) {
      const character = await loadCharacter(line.characterId);
      const alias = character.voice?.voiceAlias;
      if (!alias) {
        problems.push(`${line.characterId} has no voiceAlias in its character file`);
        continue;
      }
      const profile = byAlias.get(alias);
      if (!profile) {
        problems.push(`voiceAlias '${alias}' (${line.characterId}) is not in the registry`);
        continue;
      }
      const engineId = args.engine ?? profile.engine;
      if (!engineId || engineId === 'unassigned') {
        problems.push(`profile '${alias}' has no engine assigned — complete casting in the voice registry first`);
        continue;
      }
      if (profile.status !== 'approved' && !args.allowUnapproved) {
        problems.push(`profile '${alias}' status is '${profile.status}', not 'approved'`);
        continue;
      }
      // Speaker resolution: the approved profile owns the identity. A smoke test may
      // borrow an engine-level speaker via --speaker, which is recorded in the manifest.
      let speakerId = profile.speakerId && profile.speakerId !== 'unassigned' ? profile.speakerId : args.speaker;
      if (!speakerId) {
        speakerId = undefined;
        if (!warnedDefaultSpeaker) {
          log.warn('profile has no speakerId and --speaker was not given: falling back to the engine default voice');
          warnedDefaultSpeaker = true;
        }
      }
      plan.push({ sceneId: scene.id, sceneFile: sf.file, line, character, profile, engineId, speakerId });
    }
  }

  if (problems.length) {
    log.error('voice gate blocked generation:');
    for (const p of problems) log.error(`  - ${p}`);
    throw new StudioError(`${problems.length} dialogue line(s) cannot be generated`, {
      code: 5,
      hint: 'approve voice profiles first, or use --engine espeak --allow-unapproved for a pipeline smoke test',
    });
  }

  // ---- engine eligibility ----
  const engineIds = [...new Set(plan.map((p) => p.engineId))];
  const engines = {};
  for (const id of engineIds) {
    const engine = await getEngine(id);
    const probe = engine.probe ? await engine.probe() : { available: true };
    if (!probe.available) {
      throw new StudioError(`engine '${id}' is not usable: ${probe.status} — ${probe.detail ?? ''}`, {
        code: 3,
        hint: probe.remediation,
      });
    }
    const productionOk = config.voicePolicy.productionEngines.includes(id) || engine.declared.productionEligible;
    if (!productionOk && !args.allowUnapproved) {
      throw new StudioError(`engine '${id}' is not approved for production dialogue`, {
        code: 6,
        hint: `production engines are: ${config.voicePolicy.productionEngines.join(', ')}. Use --allow-unapproved only for smoke tests.`,
      });
    }
    if (!productionOk) {
      log.warn(`engine '${id}' is NOT production-eligible — output is a smoke test, do not publish`);
    }
    engines[id] = engine;
  }

  log.step(`generating ${plan.length} dialogue line(s) for ${args.episode}`);
  if (args.dryRun) {
    for (const p of plan) log.plain(`  [dry-run] ${p.sceneId}/${p.line.id} ${p.line.characterId} via ${p.engineId}: "${p.line.text.slice(0, 48)}…"`);
    return 0;
  }

  const records = [];
  const touchedScenes = new Map();
  let failures = 0;

  for (const item of plan) {
    const { line, profile, engineId, sceneId } = item;
    const engine = engines[engineId];
    const outDir = path.join(P.audioGenerated, args.episode, sceneId);
    await ensureDir(outDir);
    const outPath = path.join(outDir, `${line.id}.wav`);

    // Engine params come from the approved profile; scene emotion only selects a style preset.
    const params = { ...(profile.params ?? {}), ...(profile.emotionDefaults?.[line.emotion] ?? {}) };

    try {
      const res = await engine.synthesize({
        text: line.text,
        outPath,
        speakerId: item.speakerId,
        language: profile.language ?? config.pipeline.ttsLanguage,
        params,
      });

      const q = config.quality;
      const issues = [];
      if (res.durationSec < q.minDurationSec) issues.push(`too short (${res.durationSec}s)`);
      if (res.durationSec > q.maxDurationSec) issues.push(`too long (${res.durationSec}s)`);
      if (res.wav?.rms != null && res.wav.rms < q.minRms) issues.push(`too quiet (rms ${res.wav.rms})`);
      if (res.wav?.silent) issues.push('output is silent');

      const sha256 = await sha256File(outPath);
      const record = {
        dialogueId: line.id,
        sceneId,
        characterId: line.characterId,
        voiceAlias: profile.voiceAlias,
        profileVersion: profile.version,
        engine: engineId,
        engineVersion: res.engineVersion ?? 'unknown',
        model: profile.model,
        modelVersion: res.modelVersion ?? profile.modelVersion,
        speakerId: res.speakerIdUsed ?? item.speakerId ?? 'engine-default',
        text: line.text,
        emotion: line.emotion,
        language: profile.language,
        params,
        outputPath: rel(outPath),
        durationSec: res.durationSec,
        sampleRate: res.wav?.sampleRate ?? null,
        channels: res.wav?.channels ?? null,
        genMs: res.genMs,
        rtf: res.rtf,
        sha256,
        qualityStatus: issues.length ? 'failed' : 'passed',
        issues,
        generatedAt: new Date().toISOString(),
        smokeTest: !config.voicePolicy.productionEngines.includes(engineId),
      };
      records.push(record);

      if (issues.length) {
        failures++;
        log.warn(`${line.id}: quality check failed — ${issues.join(', ')}`);
      } else {
        log.ok(`${line.id} ${record.durationSec.toFixed(2)}s ${res.genMs}ms rtf=${res.rtf} → ${rel(outPath)}`);
      }

      // keep the scene manifest in sync so the renderer can place audio on the timeline
      if (!touchedScenes.has(sceneId)) {
        touchedScenes.set(sceneId, await readJson(item.sceneFile));
      }
      const scene = touchedScenes.get(sceneId);
      const target = scene.dialogue.find((d) => d.id === line.id);
      if (target) {
        target.audioAsset = rel(outPath);
        target.durationSec = record.durationSec;
      }
    } catch (err) {
      failures++;
      log.error(`${line.id}: ${err.message}`);
      if (err.details) log.error('  details:', err.details);
    }
  }

  // write updated scenes
  for (const [sceneId, scene] of touchedScenes) {
    const file = path.join(P.projects, args.episode, 'scenes', `${sceneId}.json`);
    await writeJson(file, scene);
  }

  // ---- timeline: either report conflicts, or reflow dialogue sequentially ----
  for (const [sceneId, scene] of touchedScenes) {
    if (args.reflow) {
      const lines = [...scene.dialogue].sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));
      let cursor = lines[0]?.startSec ?? 0.5;
      for (const line of lines) {
        line.startSec = Number(cursor.toFixed(3));
        cursor += (line.durationSec ?? 0) + args.gapSec;
      }
      // Subtitles are derived from the voiced dialogue so picture and text cannot drift.
      scene.subtitles = lines
        .filter((l) => l.durationSec)
        .map((l) => ({
          startSec: l.startSec,
          endSec: Number((l.startSec + l.durationSec).toFixed(3)),
          text: l.text,
        }));
      const sceneEnd = Number((cursor - args.gapSec + 0.4).toFixed(2));
      if (sceneEnd > scene.durationSec) {
        log.info(`${sceneId}: extending scene duration ${scene.durationSec}s -> ${sceneEnd}s to fit voiced dialogue`);
        scene.durationSec = sceneEnd;
      }
      const lastKf = scene.camera.keyframes.at(-1);
      if (lastKf && lastKf.t < scene.durationSec) {
        // stretch the final camera keyframe to the new scene end
        lastKf.t = scene.durationSec;
      }
      log.ok(`${sceneId}: reflowed ${lines.length} line(s); scene now ${scene.durationSec}s`);
    } else {
      const end = Math.max(0, ...scene.dialogue.map((d) => (d.startSec ?? 0) + (d.durationSec ?? 0)));
      if (end > scene.durationSec) {
        log.warn(`${sceneId}: dialogue runs to ${end.toFixed(2)}s but the scene is ${scene.durationSec}s — rerun with --reflow to retime, or extend the scene`);
      }
      const overlapping = scene.dialogue.filter((d, i, arr) =>
        i > 0 && (arr[i - 1].startSec + (arr[i - 1].durationSec ?? 0)) > d.startSec);
      if (overlapping.length) log.warn(`${sceneId}: ${overlapping.length} dialogue line(s) overlap the previous line — dialogue should not collide`);
    }
  }

  const manifestPath = `${P.audioManifests}/dialogue-${args.episode}.json`;
  await writeJson(manifestPath, {
    schemaVersion: 1,
    episodeId: args.episode,
    generatedAt: new Date().toISOString(),
    engine: engineIds.length === 1 ? engineIds[0] : engineIds,
    smokeTest: engineIds.some((e) => !config.voicePolicy.productionEngines.includes(e)),
    summary: {
      lines: records.length,
      passed: records.filter((r) => r.qualityStatus === 'passed').length,
      failed: records.filter((r) => r.qualityStatus === 'failed').length,
      totalAudioSec: Number(records.reduce((s, r) => s + r.durationSec, 0).toFixed(2)),
      avgRtf: records.length ? Number((records.reduce((s, r) => s + (r.rtf ?? 0), 0) / records.length).toFixed(4)) : null,
    },
    records,
  });

  log.plain('');
  log.ok(`generated ${records.length} line(s); metadata → ${rel(manifestPath)}`);
  if (failures) {
    log.error(`${failures} line(s) failed generation or quality checks`);
    return 1;
  }
  return 0;
}

run(main);
