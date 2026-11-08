// Studio-wide configuration: defaults + optional local overrides (config/studio.local.json, gitignored).
// Secrets are never read from the config file; they come from environment variables only.
import { P, exists } from './paths.mjs';
import { readJson } from './json.mjs';

const DEFAULTS = {
  studio: { name: 'Kids AI Studio', schemaVersion: 1 },
  pipeline: {
    primaryLanguage: 'id-ID',
    ttsLanguage: 'id',
    masterAudio: { format: 'wav', sampleRate: 22050, channels: 1 },
    previewAudio: { format: 'mp3', bitrate: '128k' },
  },
  voicePolicy: {
    // Enforced by scripts/voice/generate.mjs and scripts/episode/validate.mjs.
    requireApprovedProfile: true,
    forbidSilentFallback: true,
    // Engines allowed to produce final dialogue. espeak-ng is excluded on purpose:
    // it is a pipeline smoke-test engine, not production voice quality.
    productionEngines: ['voxcpm', 'http-remote'],
  },
  quality: {
    minDurationSec: 0.25,
    maxDurationSec: 60,
    maxSilenceRatio: 0.9,
    minRms: 0.005,
  },
  storage: {
    // Large binaries live outside git. "drive" assets are restored by npm run assets:restore.
    largeAssetProvider: 'drive',
    driveFolderId: null,
  },
};

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== 'object' || base === null) return override ?? base;
  if (typeof override !== 'object' || override === null) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

export async function loadConfig() {
  const base = await readJson(P.studioConfig);
  let cfg = deepMerge(DEFAULTS, base);
  const localPath = `${P.config}/studio.local.json`;
  if (await exists(localPath)) cfg = deepMerge(cfg, await readJson(localPath));
  return cfg;
}

export { DEFAULTS };
