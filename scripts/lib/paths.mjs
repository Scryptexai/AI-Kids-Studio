// Canonical filesystem layout for the studio. Every script imports paths from here
// so that the repository structure is defined in exactly one place.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const P = {
  root: ROOT,
  config: path.join(ROOT, 'config'),
  schemas: path.join(ROOT, 'schemas'),
  library: path.join(ROOT, 'library'),
  characters: path.join(ROOT, 'library/characters'),
  worlds: path.join(ROOT, 'library/worlds'),
  audioEngines: path.join(ROOT, 'audio/engines'),
  audioVoices: path.join(ROOT, 'audio/voices'),
  audioSamples: path.join(ROOT, 'audio/samples'),
  audioGenerated: path.join(ROOT, 'audio/generated'),
  audioBenchmarks: path.join(ROOT, 'audio/benchmarks'),
  audioManifests: path.join(ROOT, 'audio/manifests'),
  manifests: path.join(ROOT, 'manifests'),
  projects: path.join(ROOT, 'projects'),
  renders: path.join(ROOT, 'renders'),
  tools: path.join(ROOT, '.tools'),
  espeakRoot: path.join(ROOT, '.tools/espeak-ng'),
  espeakBin: path.join(ROOT, '.tools/espeak-ng/bin/espeak-ng'),
  espeakData: path.join(ROOT, '.tools/espeak-ng/share/espeak-ng-data'),
  envManifest: path.join(ROOT, 'manifests/environment.json'),
  assetManifest: path.join(ROOT, 'manifests/assets.json'),
  voiceRegistry: path.join(ROOT, 'audio/voices/registry.json'),
  voiceHistory: path.join(ROOT, 'audio/voices/history'),
  engineRegistry: path.join(ROOT, 'audio/engines/engines.json'),
  studioConfig: path.join(ROOT, 'config/studio.config.json'),
};

/** Repository-relative POSIX path, used for all manifest entries (portable to CI). */
export function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

export function abs(relative) {
  const p = path.isAbsolute(relative) ? relative : path.join(ROOT, relative);
  const resolved = path.resolve(p);
  if (!resolved.startsWith(ROOT)) {
    throw new Error(`path escapes repository root: ${relative}`);
  }
  return resolved;
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
