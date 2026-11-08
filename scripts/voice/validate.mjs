#!/usr/bin/env node
// Voice registry validation: schema, identity uniqueness, approval completeness,
// sample-audio integrity and consistency between characters and profiles.
//
//   npm run voice:validate
//   npm run voice:validate -- --strict   also fail when no character has an approved voice yet
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel, exists } from '../lib/paths.mjs';
import { log, run } from '../lib/log.mjs';
import { readJson, sha256File } from '../lib/json.mjs';
import { validateAgainst } from '../lib/schema.mjs';
import { readWav } from '../lib/wav.mjs';
import { loadConfig } from '../lib/config.mjs';

async function main() {
  const strict = process.argv.includes('--strict');
  const config = await loadConfig();
  const errors = [];
  const warnings = [];

  const registry = await readJson(P.voiceRegistry);
  for (const e of await validateAgainst('voice.schema.json', registry, 'audio/voices/registry.json')) {
    errors.push(`${e.where}: ${e.message}`);
  }

  // character library
  const characters = new Map();
  for (const f of await fs.readdir(P.characters).catch(() => [])) {
    if (!f.endsWith('.character.json')) continue;
    const ch = await readJson(path.join(P.characters, f));
    characters.set(ch.id, ch);
  }

  const aliases = new Map();
  const approvedPerCharacter = new Map();

  for (const p of registry.profiles ?? []) {
    const label = `${p.voiceAlias} (${p.characterId})`;

    if (aliases.has(p.voiceAlias)) errors.push(`duplicate voiceAlias '${p.voiceAlias}' — aliases are permanent and unique`);
    aliases.set(p.voiceAlias, p);

    if (!characters.has(p.characterId)) {
      errors.push(`profile ${label} points at a character that does not exist in library/characters`);
    }

    if (!p.history?.length) warnings.push(`profile ${label} has no history entries`);

    if (p.status === 'approved') {
      if (!p.engine || p.engine === 'unassigned') errors.push(`approved profile ${label} has no engine assigned`);
      if (!p.speakerId || p.speakerId === 'unassigned') errors.push(`approved profile ${label} has no speakerId`);
      if (!p.approvedAt) errors.push(`approved profile ${label} is missing approvedAt`);
      if (!p.sampleAudio) {
        errors.push(`approved profile ${label} has no sampleAudio — approval requires a rendered audition sample`);
      } else {
        const samplePath = path.join(ROOT, p.sampleAudio);
        if (!(await exists(samplePath))) {
          errors.push(`approved profile ${label} sample audio is missing: ${p.sampleAudio}`);
        } else {
          const sha = await sha256File(samplePath);
          if (p.sampleChecksum && p.sampleChecksum !== sha) {
            errors.push(`approved profile ${label} sample checksum mismatch — sample was replaced after approval`);
          }
          try {
            const wav = await readWav(samplePath);
            if (wav.silent) errors.push(`approved profile ${label} sample audio is silent`);
            if (!config.voicePolicy.productionEngines.includes(p.engine)) {
              warnings.push(`approved profile ${label} uses non-production engine '${p.engine}' — re-audition before publishing`);
            }
          } catch (err) {
            errors.push(`approved profile ${label} sample is not a readable WAV: ${err.message}`);
          }
        }
      }
      approvedPerCharacter.set(p.characterId, (approvedPerCharacter.get(p.characterId) ?? 0) + 1);
    }
  }

  for (const [id, count] of approvedPerCharacter) {
    if (count > 1) errors.push(`character '${id}' has ${count} approved profiles — exactly one voice identity may be active`);
  }

  // every character that speaks must have a resolvable profile
  for (const [id, ch] of characters) {
    const alias = ch.voice?.voiceAlias;
    if (!alias) {
      errors.push(`character '${id}' has no voiceAlias`);
      continue;
    }
    if (!aliases.has(alias)) errors.push(`character '${id}' references voiceAlias '${alias}' which is not in the registry`);
  }

  const approved = [...approvedPerCharacter.keys()];
  const unapproved = [...characters.keys()].filter((c) => !approved.includes(c));

  log.plain('');
  for (const w of warnings) log.warn(w);
  for (const e of errors) log.error(e);

  log.plain('');
  log.plain(`profiles: ${registry.profiles.length} (revision ${registry.revision})`);
  log.plain(`approved characters: ${approved.length ? approved.join(', ') : 'none'}`);
  if (unapproved.length) log.plain(`awaiting approval: ${unapproved.join(', ')}`);

  if (errors.length) {
    log.error(`voice registry validation FAILED: ${errors.length} error(s)`);
    return 1;
  }
  if (strict && unapproved.length) {
    log.error(`strict mode: ${unapproved.length} character(s) still have no approved voice`);
    return 1;
  }
  log.ok('voice registry valid');
  return 0;
}

run(main);
