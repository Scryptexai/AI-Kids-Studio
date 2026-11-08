// eSpeak NG adapter — the only TTS engine currently able to run fully offline in this
// sandbox. Quality tier: smoke-test-only. It exists to validate the adapter contract,
// dialogue timing and subtitle synchronisation; it must never be used for aired audio.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess, which } from '../../../scripts/lib/proc.mjs';
import { readWav } from '../../../scripts/lib/wav.mjs';
import { StudioError } from '../../../scripts/lib/log.mjs';
import { P, exists, ensureDir } from '../../../scripts/lib/paths.mjs';

export const meta = {
  id: 'espeak',
  displayName: 'eSpeak NG',
  kind: 'tts',
  productionEligible: false,
  qualityTier: 'smoke-test-only',
  supportsLanguages: ['id', 'en'],
};

async function resolveBinary() {
  if (process.env.ESPEAK_BIN && (await exists(process.env.ESPEAK_BIN))) return process.env.ESPEAK_BIN;
  if (await exists(P.espeakBin)) return P.espeakBin;
  const onPath = await which('espeak-ng');
  return onPath ?? null;
}

export async function probe() {
  const bin = await resolveBinary();
  if (!bin) {
    return {
      available: false,
      status: 'not-installed',
      detail: 'espeak-ng binary not found',
      remediation: 'run `npm run bootstrap` (builds eSpeak NG from source into .tools/) or `npm run bootstrap -- --with-espeak`',
    };
  }
  const dataDir = process.env.ESPEAK_DATA_PATH ?? P.espeakData;
  const r = await runProcess(bin, ['--voices=id'], {
    env: { ESPEAK_DATA_PATH: dataDir },
    timeoutMs: 15_000,
  }).catch((err) => ({ ok: false, error: err.message }));
  if (r.ok === false) {
    return { available: false, status: 'broken', detail: r.error ?? 'espeak-ng failed to list voices' };
  }
  const hasIndonesian = /(^|\s)id(\s|$)/m.test(r.stdout);
  return {
    available: hasIndonesian,
    status: hasIndonesian ? 'available' : 'missing-language',
    detail: hasIndonesian ? 'Indonesian (id) voice present' : 'Indonesian voice missing from espeak-ng-data',
    binary: bin,
    dataDir,
    languages: r.stdout.split('\n').slice(1).filter(Boolean).length,
  };
}

/**
 * @param {object} job { text, outPath, speakerId, params }
 * speakerId accepts espeak voice specs: "id", "id+m3", "id+f2" …
 * params: { speedWpm, pitch (0-99), amplitude (0-200), wordGap (x10ms) }
 */
export async function synthesize(job) {
  const { text, outPath, speakerId = 'id', params = {} } = job;
  const bin = await resolveBinary();
  if (!bin) throw new StudioError('eSpeak NG binary not available', { hint: 'run `npm run bootstrap`' });

  const dataDir = process.env.ESPEAK_DATA_PATH ?? P.espeakData;
  const args = [
    '-v', speakerId,
    '-s', String(params.speedWpm ?? 150),
    '-p', String(params.pitch ?? 50),
    '-a', String(params.amplitude ?? 120),
    '-g', String(params.wordGap ?? 4),
    '-w', outPath,
    text,
  ];

  await ensureDir(path.dirname(outPath));
  const started = Date.now();
  const res = await runProcess(bin, args, {
    env: { ESPEAK_DATA_PATH: dataDir },
    timeoutMs: params.timeoutMs ?? 120_000,
  });
  const genMs = Date.now() - started;

  if (!(await exists(outPath))) {
    throw new StudioError('eSpeak NG produced no output file', {
      details: { stderr: res.stderr.slice(-800), args },
    });
  }
  const wav = await readWav(outPath);
  return {
    ok: true,
    wavPath: outPath,
    durationSec: wav.durationSec,
    genMs,
    rtf: wav.durationSec > 0 ? Number((genMs / 1000 / wav.durationSec).toFixed(4)) : null,
    engineVersion: 'espeak-ng (source build)',
    modelVersion: 'espeak-ng-data',
    speakerIdUsed: speakerId,
    wav,
  };
}
