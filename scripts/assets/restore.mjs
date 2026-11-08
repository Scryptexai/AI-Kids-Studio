#!/usr/bin/env node
// Restores asset binaries from Google Drive into the repository and verifies checksums.
//
//   npm run assets:restore               restore everything that is missing
//   npm run assets:restore -- --check    report what is missing, download nothing
//   npm run assets:restore -- --force    re-download even if a local copy exists
//
// A fresh sandbox only needs: npm install && npm run bootstrap && npm run assets:restore && npm run validate
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel, exists, ensureDir } from '../lib/paths.mjs';
import { log, run } from '../lib/log.mjs';
import { readJson, sha256File } from '../lib/json.mjs';
import { createDriveClientFromEnv } from '../lib/drive.mjs';

async function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const force = args.has('--force');

  const manifest = await readJson(P.assetManifest);
  const targets = [];

  for (const a of manifest.assets ?? []) {
    if (a.storage !== 'drive') continue;
    const full = path.join(ROOT, a.path);
    const present = await exists(full);
    if (present && !force) {
      const sha = await sha256File(full);
      if (a.sha256 && sha !== a.sha256) {
        log.warn(`local copy of '${a.id}' has wrong checksum — will restore`);
        targets.push(a);
      }
      continue;
    }
    targets.push(a);
  }

  if (!targets.length) {
    log.ok('all Drive-backed assets are already present and verified');
    return 0;
  }

  log.step(`${targets.length} asset(s) need restoring`);
  for (const a of targets) {
    const flag = a.drive?.fileId ? '' : '  [no drive.fileId — cannot restore]';
    log.plain(`  - ${a.id} -> ${a.path}${flag}`);
  }

  if (checkOnly) {
    log.warn('--check mode: nothing downloaded');
    return 1;
  }

  const restorable = targets.filter((a) => a.drive?.fileId);
  if (!restorable.length) {
    log.error('no restorable assets: manifest entries lack drive.fileId');
    log.warn('upload them once with the Drive client, then commit the updated manifest');
    return 1;
  }

  const drive = await createDriveClientFromEnv();
  let restored = 0;
  const failed = [];

  for (const a of restorable) {
    const full = path.join(ROOT, a.path);
    try {
      await ensureDir(path.dirname(full));
      await drive.download(a.drive.fileId, full);
      const sha = await sha256File(full);
      if (a.sha256 && sha !== a.sha256) {
        failed.push(`${a.id}: checksum mismatch after download (${sha.slice(0, 12)}…)`);
        await fs.rm(full, { force: true });
        continue;
      }
      restored += 1;
      log.ok(`restored ${a.id} (${rel(full)})`);
    } catch (err) {
      failed.push(`${a.id}: ${err.message}`);
    }
  }

  log.plain('');
  for (const f of failed) log.error(f);
  if (failed.length) {
    log.error(`restore incomplete: ${restored} restored, ${failed.length} failed`);
    return 1;
  }
  log.ok(`restored ${restored} asset(s) and verified checksums`);
  return 0;
}

run(main);
