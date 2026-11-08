#!/usr/bin/env node
// Voice audition: render several candidate variants of ONE line with the SAME text so the
// candidates can be compared fairly, then write a comparison manifest.
//
//   npm run voice:audition -- --character bobby
//   npm run voice:audition -- --character pip --engine espeak --variants 4
//   npm run voice:audition -- --character coco --text "Teks percobaan sendiri."
//
// Output goes to audio/generated/auditions/<character>/ (derived, gitignored) plus
// audio/manifests/auditions-<character>.json. Nothing here approves a voice: approval is a
// separate, explicit act on the registry (see docs/VOICE-PIPELINE.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, abs, rel, ensureDir, exists } from '../lib/paths.mjs';
import { log, run, StudioError } from '../lib/log.mjs';
import { readJson, writeJson, sha256File } from '../lib/json.mjs';
import { getEngine, usableEngines } from '../../audio/engines/index.mjs';
import { loadConfig } from '../lib/config.mjs';

export const AUDITION_TEXT = 'Halo teman-teman! Senang sekali bertemu kalian hari ini. Ayo kita mulai petualangan baru!';

// Variant grid: each entry is a plausible character direction, not random jitter, so the
// comparison answers "which character is this?" rather than "which number sounds nicer?".
const VARIANTS = [
  { id: 'v1-bright', note: 'brighter, faster', params: { pitch: 68, speedWpm: 165 } },
  { id: 'v2-warm', note: 'warmer, medium pace', params: { pitch: 50, speedWpm: 150 } },
  { id: 'v3-deep', note: 'lower, slower, calmer', params: { pitch: 32, speedWpm: 138 } },
  { id: 'v4-energetic', note: 'high energy, quick', params: { pitch: 78, speedWpm: 180 } },
];

function parseArgs(argv) {
  const out = { character: null, engine: 'espeak', text: AUDITION_TEXT, variants: 3, speaker: 'id' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--character') out.character = argv[++i];
    else if (a === '--engine') out.engine = argv[++i];
    else if (a === '--text') out.text = argv[++i];
    else if (a === '--variants') out.variants = Math.max(1, Math.min(VARIANTS.length, Number(argv[++i])));
    else if (a === '--speaker') out.speaker = argv[++i];
    else throw new StudioError(`unknown argument: ${a}`);
  }
  if (!out.character) {
    throw new StudioError('--character is required', { hint: 'npm run voice:audition -- --character bobby' });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();

  const characterFile = path.join(P.characters, `${args.character}.character.json`);
  if (!(await exists(characterFile))) {
    throw new StudioError(`character '${args.character}' not found in library/characters`);
  }
  const character = await readJson(characterFile);

  const available = await usableEngines();
  if (!available.length) {
    throw new StudioError('no usable TTS engine', { hint: 'npm run bootstrap' });
  }
  const engine = await getEngine(args.engine);
  const probe = await engine.probe();
  if (!probe.available) {
    throw new StudioError(`engine '${args.engine}' is not usable: ${probe.status}`, {
      code: 3,
      hint: probe.remediation ?? `usable engines right now: ${available.map((e) => e.id).join(', ')}`,
    });
  }

  const isProduction = config.voicePolicy.productionEngines.includes(args.engine);
  if (!isProduction) {
    log.warn(`engine '${args.engine}' is not production-eligible — this audition is for pipeline verification only`);
  }

  const outDir = path.join(P.audioGenerated, 'auditions', args.character);
  await ensureDir(outDir);

  log.step(`auditioning ${args.variants} variant(s) for ${character.displayName} via ${args.engine}`);
  log.info(`text: "${args.text}"`);

  const candidates = [];
  for (const variant of VARIANTS.slice(0, args.variants)) {
    const outPath = path.join(outDir, `${args.engine}-${variant.id}.wav`);
    try {
      const res = await engine.synthesize({
        text: args.text,
        outPath,
        speakerId: args.speaker,
        language: config.pipeline.ttsLanguage,
        params: variant.params,
      });
      const sha256 = await sha256File(outPath);
      candidates.push({
        candidateId: variant.id,
        note: variant.note,
        params: variant.params,
        outputPath: rel(outPath),
        durationSec: res.durationSec,
        sampleRate: res.wav?.sampleRate ?? null,
        rms: res.wav?.rms ?? null,
        peak: res.wav?.peak ?? null,
        genMs: res.genMs,
        rtf: res.rtf,
        sha256,
      });
      log.ok(`${variant.id.padEnd(13)} ${res.durationSec.toFixed(2)}s rms=${res.wav?.rms} → ${rel(outPath)}`);
    } catch (err) {
      log.error(`${variant.id}: ${err.message}`);
    }
  }

  if (!candidates.length) {
    throw new StudioError('every audition variant failed', { code: 1 });
  }

  const manifestPath = `${P.audioManifests}/auditions-${args.character}.json`;
  await writeJson(manifestPath, {
    schemaVersion: 1,
    characterId: character.id,
    voiceAlias: character.voice?.voiceAlias ?? null,
    engine: args.engine,
    engineVersion: probe.detail ?? null,
    speakerId: args.speaker,
    language: config.pipeline.ttsLanguage,
    text: args.text,
    productionEligible: isProduction,
    createdAt: new Date().toISOString(),
    note: 'Candidates are NOT approved. Approve explicitly in audio/voices/registry.json (or the P3 GUI).',
    candidates,
  });

  log.plain('');
  log.plain('Listen to every candidate with the same text, then approve one explicitly:');
  for (const c of candidates) log.plain(`  ${c.outputPath}  (${c.note})`);
  log.plain('');
  log.ok(`audition manifest → ${rel(manifestPath)}`);
  log.info('next: set engine/speakerId/params/sampleAudio on the profile, then run npm run voice:validate');
  return 0;
}

run(main);
