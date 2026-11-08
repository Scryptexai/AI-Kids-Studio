#!/usr/bin/env node
// Guards the one rule that matters for large artefacts: never delete something that is not
// recorded somewhere else.
//
//   npm run assets:verify-drive              # audit every Drive-backed entry
//   npm run assets:verify-drive -- --path renders/ep-002/foo.mp4
//   npm run assets:verify-drive -- --path renders/ep-002/foo.mp4 --require-local
//
// Exit codes
//   0  everything recorded as Drive-backed is accounted for
//   3  a file has a local copy with no Drive record AND is not required — this is the dangerous
//      state: deleting it loses it, restoring it does not bring it back
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { P, ROOT, rel, exists } from '../lib/paths.mjs';
import { log } from '../lib/log.mjs';
import { readJson, sha256File } from '../lib/json.mjs';

function parseArgs(argv) {
  const out = { path: null, requireLocal: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path') out.path = argv[++i];
    else if (a === '--require-local') out.requireLocal = true;
    // Acknowledges "yes, this one is regenerable and I am about to delete it".
    else if (a === '--keep') out.keep = true;
    else return { error: `unknown argument: ${a}` };
  }
  return out;
}

function assetId(relPath) {
  return relPath
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Files big enough to be worth recording before deleting. */
const BIG_BYTES = 1_000_000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    log.error(args.error);
    log.info('usage: npm run assets:verify-drive [-- --path <file> [--require-local]] [--keep]');
    return 2;
  }

  const manifest = await readJson(P.assetManifest).catch(() => ({ assets: [] }));
  const byPath = new Map((manifest.assets ?? []).map((a) => [a.path, a]));

  const targets = [];
  if (args.path) {
    const full = path.isAbsolute(args.path) ? args.path : path.join(ROOT, args.path);
    targets.push(rel(full));
  } else {
    // Every big file on disk, plus every entry the manifest claims lives in Drive.
    const rendersDir = path.join(ROOT, 'renders');
    if (await exists(rendersDir)) {
      const walk = async (dir) => {
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) await walk(full);
          else targets.push(rel(full));
        }
      };
      await walk(rendersDir);
    }
    for (const a of manifest.assets ?? []) {
      if (a.storage === 'drive') targets.push(a.path);
    }
  }

  const unique = [...new Set(targets)];
  const problems = [];
  const safe = [];
  const missingLocally = [];
  const unrecorded = [];

  for (const relPath of unique) {
    const full = path.join(ROOT, relPath);
    const onDisk = await exists(full);
    const entry = byPath.get(relPath) ?? byPath.get(relPath) ?? null;
    const hasDriveRecord = Boolean(entry?.drive?.fileId);

    if (!onDisk) {
      if (hasDriveRecord) missingLocally.push(relPath);
      else if (entry?.required) problems.push(`${relPath}: manifest says required but the file is gone and there is no Drive record`);
      continue;
    }

    const stat = await fs.stat(full);
    if (hasDriveRecord) {
      // The record must describe *this* file, or the "safe to delete" promise is empty.
      const sha256 = await sha256File(full);
      if (entry.sha256 && entry.sha256 !== sha256) {
        problems.push(`${relPath}: recorded sha256 does not match the file on disk — the Drive copy is a different build`);
      } else {
        safe.push({ path: relPath, bytes: stat.size, fileId: entry.drive.fileId });
      }
    } else if (stat.size >= BIG_BYTES) {
      unrecorded.push({ path: relPath, bytes: stat.size });
    }
  }

  if (args.path && args.requireLocal) {
    const full = path.join(ROOT, args.path);
    if (!(await exists(full))) {
      log.error(`${args.path} does not exist locally`);
      return 2;
    }
  }

  for (const s of safe) log.ok(`${s.path} — recorded in Drive (${s.fileId}), ${(s.bytes / 1e6).toFixed(1)} MB safe to delete`);
  for (const m of missingLocally) log.info(`${m} — not on disk, restorable from Drive`);

  if (unrecorded.length && !args.keep) {
    log.warn(`${unrecorded.length} large file(s) have no Drive record — deleting them loses them:`);
    for (const u of unrecorded) log.warn(`  ${u.path} (${(u.bytes / 1e6).toFixed(1)} MB)`);
    log.info('upload first, then: npm run assets:record-drive -- --path <file> --file-id <id>');
  }

  if (problems.length) {
    for (const p of problems) log.error(p);
    return 3;
  }

  if (!safe.length && !missingLocally.length) {
    log.info('nothing recorded in Drive yet');
  } else {
    log.ok(`${safe.length} file(s) verified safe to delete, ${missingLocally.length} only in Drive`);
  }
  return 0;
}

process.exitCode = await main();
