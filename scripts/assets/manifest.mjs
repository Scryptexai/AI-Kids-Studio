#!/usr/bin/env node
// Generates manifests/assets.json: the single source of truth mapping asset IDs to
// repository paths, sizes, SHA-256 checksums and durable storage location.
//
//   npm run assets:manifest
//
// Design notes
//  • Hand-maintained Drive file IDs survive regeneration (existing entries are merged by id).
//  • Files that are referenced by the world/character/scene data but not yet produced are
//    recorded with required:false so `assets:validate` can distinguish "pending art" from
//    "broken reference".
//  • Large binaries (video, model weights, long audio) are flagged for Drive storage; they
//    are never committed to git.
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel, exists, ensureDir } from '../lib/paths.mjs';
import { log, run } from '../lib/log.mjs';
import { readJson, writeJson, sha256File } from '../lib/json.mjs';

// Images up to ~4 MB stay in git: they are small, needed for every render, and keeping
// them in the repo means a fresh clone can render without any Drive credential.
const GIT_IMAGE_LIMIT = 4_000_000;
const LARGE_FILE_BYTES = 1_000_000;
// audio/generated is deliberately excluded: dialogue WAVs are derived artefacts that are
// reproduced by `npm run voice:generate` and tracked by audio/manifests/dialogue-<episode>.json.
// `renders` is included so finished MP4s get checksummed, but ephemeral review output
// (preview frames, benchmark clips, per-scene intermediates) is excluded — it changes on every
// run and would make asset validation fail for no reason.
// renders/ is deliberately NOT scanned: mp4s are build output, and a new timestamped file per
// run makes the manifest churn. Renders enter the manifest only when explicitly recorded in
// Drive via `assets:record-drive`; after that they survive regeneration through step 3 below.
const SCAN_DIRS = ['library', 'projects', 'audio/samples'];
// Ephemeral review output: preview frames and benchmark clips change on every run.
const EXCLUDE = [
  /^renders\/.+\/preview\//,
  /^renders\/bench\//,
  /^renders\/.+\/work\//,
];
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3', '.mp4', '.ogg', '.pth', '.onnx', '.bin']);

function shouldUseDrive(relPath, bytes) {
  const ext = path.extname(relPath).toLowerCase();
  if (!BINARY_EXT.has(ext)) return false; // text/JSON always belongs in git
  const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  return bytes > (isImage ? GIT_IMAGE_LIMIT : LARGE_FILE_BYTES);
}

function classify(relPath) {
  if (relPath.startsWith('library/characters/')) return 'character-image';
  if (relPath.startsWith('library/backgrounds/')) return 'background';
  if (relPath.startsWith('library/props/')) return 'prop';
  if (relPath.startsWith('library/animations/')) return 'animation';
  if (/\/ambience\//.test(relPath)) return 'audio-ambience';
  if (/\/music\//.test(relPath)) return 'audio-music';
  if (/\/sfx\//.test(relPath)) return 'audio-sfx';
  if (relPath.startsWith('audio/samples/')) return 'audio-sample';
  if (relPath.startsWith('audio/generated/')) return 'audio-dialogue';
  // Renders are a special case: they are never scanned wholesale (see SCAN_DIRS — every render
  // writes new files, so tracking them guarantees a validation failure), but a render that has
  // been explicitly recorded in Drive must still be classified, or the manifest cannot describe
  // what it just recorded.
  if (relPath.startsWith('renders/')) return 'video';
  if (EXCLUDE.some((re) => re.test(relPath))) return null;
  if (relPath.endsWith('.json')) return 'scene-manifest';
  return null;
}

/** Stable ID: relative path without extension, non-alphanumerics collapsed to dashes. */
/**
 * Descriptions are rewritten by this script when a Drive-backed file goes missing, so they must
 * be cleaned before being carried forward — otherwise a stale "restorable from Drive" note
 * sticks to a file that is sitting right there on disk.
 */
function cleanDescription(desc) {
  return (desc ?? '')
    .replace(/\((?:missing locally|local copy removed|also present locally)[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function assetId(relPath) {
  return relPath
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

async function walk(dir) {
  const out = [];
  if (!(await exists(dir))) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function collectWorldReferences() {
  const refs = new Map(); // relPath -> {kind, description}
  const worldDir = P.worlds;
  if (!(await exists(worldDir))) return refs;

  for (const f of await fs.readdir(worldDir)) {
    if (!f.endsWith('.world.json')) continue;
    const world = await readJson(path.join(worldDir, f));
    for (const loc of world.locations ?? []) {
      if (loc.background) refs.set(loc.background, { kind: 'background', description: `${world.id}/${loc.id} background` });
      if (loc.ambientAudio) refs.set(loc.ambientAudio, { kind: 'audio-ambience', description: `${world.id}/${loc.id} ambience` });
    }
    for (const prop of world.propCatalog ?? []) {
      if (prop.asset) refs.set(prop.asset, { kind: 'prop', description: `${world.id} prop ${prop.id}` });
    }
  }

  for (const f of await fs.readdir(P.characters)) {
    if (!f.endsWith('.character.json')) continue;
    const ch = await readJson(path.join(P.characters, f));
    if (ch.visual?.baseImage) refs.set(ch.visual.baseImage, { kind: 'character-image', description: `${ch.id} base image` });
  }
  return refs;
}

async function main() {
  log.step('scanning assets');
  await ensureDir(P.manifests);

  let previous = { assets: [] };
  if (await exists(P.assetManifest)) {
    previous = await readJson(P.assetManifest).catch(() => ({ assets: [] }));
  }
  const previousById = new Map((previous.assets ?? []).map((a) => [a.id, a]));

  const entries = new Map();

  // 1) files that actually exist
  for (const dir of SCAN_DIRS) {
    for (const full of await walk(path.join(ROOT, dir))) {
      const relPath = rel(full);
      const kind = classify(relPath);
      if (!kind) continue;
      const id = assetId(relPath);
      const stat = await fs.stat(full);
      const prior = previousById.get(id);
      const sha256 = await sha256File(full);
      entries.set(id, {
        id,
        kind,
        path: relPath,
        storage: shouldUseDrive(relPath, stat.size) ? 'drive' : 'git',
        bytes: stat.size,
        sha256,
        drive: prior?.drive ?? null,
        required: true,
        ...(prior?.description ? { description: cleanDescription(prior.description) } : {}),
        ...(prior?.tags ? { tags: prior.tags } : {}),
      });
    }
  }

  // 2) referenced-but-not-yet-produced assets (pending art / pending recordings)
  const fileCount = entries.size;
  for (const [refPath, meta] of await collectWorldReferences()) {
    const id = assetId(refPath);
    if (entries.has(id)) continue;
    const prior = previousById.get(id);
    entries.set(id, {
      id,
      kind: meta.kind,
      path: refPath,
      storage: 'drive',
      bytes: prior?.bytes ?? null,
      sha256: prior?.sha256 ?? null,
      drive: prior?.drive ?? null,
      required: false,
      description: `${meta.description} — not produced yet`,
      ...(prior?.tags ? { tags: prior.tags } : {}),
    });
  }

  // 3) previously known entries that are gone from disk: keep only if they carry a Drive
  //    fileId (restorable); otherwise drop them so a stale path cannot poison validation.
  const dropped = [];
  for (const [id, prior] of previousById) {
    if (entries.has(id)) continue;
    if (prior.drive?.fileId) {
      // Ask the disk, do not assume. Step 1 no longer scans renders/, so a recorded render is
      // never in `entries` above — but it may well still be sitting on disk, and claiming
      // otherwise in the manifest is a lie the next reader would act on.
      const full = path.join(ROOT, prior.path);
      const present = await exists(full);
      const base = cleanDescription(prior.description) || 'recorded in Drive';
      const note = present ? '(also present locally)' : '(missing locally, restorable from Drive)';
      entries.set(id, {
        ...prior,
        ...(present ? { bytes: (await fs.stat(full)).size, sha256: await sha256File(full) } : {}),
        required: false,
        description: `${base} ${note}`.trim(),
      });
    } else {
      dropped.push(id);
    }
  }
  if (dropped.length) log.warn(`dropped ${dropped.length} stale manifest entr(ies): ${dropped.slice(0, 5).join(', ')}${dropped.length > 5 ? '…' : ''}`);

  const assets = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/assets/manifest.mjs',
    assets,
  };
  await writeJson(P.assetManifest, manifest);

  const pending = assets.filter((a) => a.required === false && !(a.sha256));
  const onDrive = assets.filter((a) => a.storage === 'drive');
  log.ok(`${assets.length} assets in manifest (${fileCount} on disk, ${pending.length} pending, ${onDrive.length} flagged for Drive)`);
  log.info(`written: ${rel(P.assetManifest)}`);
  if (onDrive.length) {
    log.info('large binaries are flagged storage=drive; run `npm run assets:restore` on a fresh sandbox to pull them back');
  }
  return 0;
}

run(main);
