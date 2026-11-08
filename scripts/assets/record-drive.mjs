#!/usr/bin/env node
// Records that a large artefact now lives in Google Drive, so it can be deleted locally without
// being lost.
//
//   npm run assets:record-drive -- --path renders/ep-002/ep-002-...mp4 --file-id <driveFileId>
//   npm run assets:verify-drive -- --path renders/ep-002/ep-002-...mp4
//
// Why this exists
//   Large files (renders, model weights) must not be committed to git, and they must not stay in
//   the sandbox forever either: the workspace snapshot has a hard size cap, and six 12 MB renders
//   pushed it to 121 MB against a limit of about 128 MB — which put the newest render at risk of
//   being dropped. Uploading is the right answer, but only if the upload is *recorded*: an
//   unrecorded upload is a file that exists somewhere you cannot find again.
//
//   Once recorded, `assets:validate` knows the file is safe, `assets:restore` can pull it back,
//   and deleting the local copy is a deliberate act instead of an accident.
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel, exists } from '../lib/paths.mjs';
import { log } from '../lib/log.mjs';
import { readJson, writeJson, sha256File } from '../lib/json.mjs';

const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

function parseArgs(argv) {
  const out = { path: null, fileId: null, name: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path') out.path = argv[++i];
    else if (a === '--file-id') out.fileId = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else return { error: `unknown argument: ${a}` };
  }
  if (!out.path) return { error: '--path is required' };
  return out;
}

/** Same id scheme as scripts/assets/manifest.mjs, so entries merge instead of duplicating. */
function assetId(relPath) {
  return relPath
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    log.error(args.error);
    log.info('usage: npm run assets:record-drive -- --path <file> --file-id <driveFileId> [--name <driveName>]');
    return 2;
  }

  const full = path.isAbsolute(args.path) ? args.path : path.join(ROOT, args.path);
  const relPath = rel(full);
  if (!relPath || relPath.startsWith('..')) {
    log.error(`'${args.path}' is outside the repository`);
    return 2;
  }
  if (!(await exists(full))) {
    log.error(`no such file: ${relPath}`);
    log.info('record-drive needs the local file present so it can checksum what was uploaded');
    return 2;
  }
  if (!DRIVE_ID_RE.test(args.fileId ?? '')) {
    log.error(`'--file-id' does not look like a Drive file id: ${args.fileId ?? '(missing)'}`);
    return 2;
  }

  const manifest = await readJson(P.assetManifest).catch(() => ({ schemaVersion: 1, assets: [] }));
  const assets = manifest.assets ?? [];
  const id = assetId(relPath);
  const bytes = (await fs.stat(full)).size;
  const sha256 = await sha256File(full);

  const existing = assets.find((a) => a.id === id);
  const entry = {
    id,
    kind: existing?.kind ?? (relPath.endsWith('.mp4') ? 'video' : 'binary'),
    path: relPath,
    // The point of recording: this file's home is Drive, not the sandbox and not git.
    storage: 'drive',
    bytes,
    sha256,
    drive: {
      fileId: args.fileId,
      name: args.name ?? path.basename(relPath),
      uploadedAt: new Date().toISOString(),
    },
    // It is present now, but it is allowed to be absent later — that is the whole arrangement.
    required: false,
    description: existing?.description ?? 'recorded in Drive; local copy may be removed',
  };

  if (existing) Object.assign(existing, entry);
  else assets.push(entry);
  assets.sort((a, b) => a.id.localeCompare(b.id));

  await writeJson(P.assetManifest, { ...manifest, assets });
  log.ok(`recorded ${relPath} in Drive`);
  log.info(`  asset id   ${id}`);
  log.info(`  drive id   ${args.fileId}`);
  log.info(`  bytes      ${bytes}`);
  log.info(`  sha256     ${sha256.slice(0, 16)}…`);
  log.info('the local copy may now be deleted; `npm run assets:restore` can pull it back');
  return 0;
}

process.exitCode = await main();
