#!/usr/bin/env node
// Validates the asset manifest and every file reference in the library/project data.
//
//   npm run assets:validate            missing pending art is a warning
//   npm run assets:validate -- --strict  missing pending art is an error (used before render)
//
// Exit codes: 0 ok · 1 validation errors · 2 unreadable input
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel, exists } from '../lib/paths.mjs';
import { log, run } from '../lib/log.mjs';
import { readJson, sha256File } from '../lib/json.mjs';
import { validateAgainst } from '../lib/schema.mjs';

async function main() {
  const strict = process.argv.includes('--strict');
  const errors = [];
  const warnings = [];

  const manifest = await readJson(P.assetManifest);
  const schemaErrors = await validateAgainst('asset.schema.json', manifest, 'manifests/assets.json');
  errors.push(...schemaErrors.map((e) => `${e.where}: ${e.message}`));

  const byPath = new Map();
  const seenIds = new Set();

  for (const a of manifest.assets ?? []) {
    if (seenIds.has(a.id)) errors.push(`duplicate asset id: ${a.id}`);
    seenIds.add(a.id);
    byPath.set(a.path, a);

    const full = path.join(ROOT, a.path);
    const present = await exists(full);

    if (!present) {
      const msg = `missing file for asset '${a.id}': ${a.path}`;
      if (a.required === false) (strict ? errors : warnings).push(`${msg} (pending art)`);
      else errors.push(msg);
      continue;
    }

    const stat = await fs.stat(full);
    const sha = await sha256File(full);
    if (a.sha256 && a.sha256 !== sha) {
      errors.push(`checksum mismatch for '${a.id}': manifest ${a.sha256.slice(0, 12)}… != disk ${sha.slice(0, 12)}… (run npm run assets:manifest)`);
    }
    if (a.bytes != null && a.bytes !== stat.size) {
      errors.push(`size mismatch for '${a.id}': manifest ${a.bytes} != disk ${stat.size}`);
    }
    if (a.storage === 'drive' && !a.drive?.fileId) {
      warnings.push(`asset '${a.id}' is flagged for Drive but has no drive.fileId — it will not survive a sandbox reset`);
    }
  }

  // Referenced paths must either exist on disk or be declared in the manifest.
  const checkRef = (refPath, label) => {
    if (!refPath) return;
    if (byPath.has(refPath)) return;
    errors.push(`${label} references '${refPath}' which is not in manifests/assets.json (run npm run assets:manifest)`);
  };

  for (const f of await fs.readdir(P.worlds).catch(() => [])) {
    if (!f.endsWith('.world.json')) continue;
    const world = await readJson(path.join(P.worlds, f));
    for (const loc of world.locations ?? []) {
      checkRef(loc.background, `world ${world.id} location ${loc.id} background`);
      checkRef(loc.ambientAudio, `world ${world.id} location ${loc.id} ambient audio`);
    }
    for (const p of world.propCatalog ?? []) checkRef(p.asset, `world ${world.id} prop ${p.id}`);
  }

  for (const f of await fs.readdir(P.characters).catch(() => [])) {
    if (!f.endsWith('.character.json')) continue;
    const ch = await readJson(path.join(P.characters, f));
    checkRef(ch.visual?.baseImage, `character ${ch.id} baseImage`);
  }

  // Scene audio tracks + assigned dialogue audio
  for (const project of await fs.readdir(P.projects).catch(() => [])) {
    const scenesDir = path.join(P.projects, project, 'scenes');
    for (const f of await fs.readdir(scenesDir).catch(() => [])) {
      if (!f.endsWith('.json')) continue;
      const scene = await readJson(path.join(scenesDir, f));
      for (const t of scene.audioTracks ?? []) checkRef(t.asset, `scene ${scene.id} audio track ${t.id}`);
      for (const d of scene.dialogue ?? []) {
        if (d.audioAsset) checkRef(d.audioAsset, `scene ${scene.id} dialogue ${d.id}`);
      }
    }
  }

  log.plain('');
  for (const w of warnings) log.warn(w);
  for (const e of errors) log.error(e);

  log.plain('');
  if (errors.length) {
    log.error(`asset validation FAILED: ${errors.length} error(s), ${warnings.length} warning(s)`);
    return 1;
  }
  log.ok(`asset validation passed: ${manifest.assets.length} assets, ${warnings.length} warning(s)`);
  return 0;
}

run(main);
