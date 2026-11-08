// Voice registry operations shared by the CLI and the studio GUI.
//
// Rule this file encodes: approving a voice is a state transition with an audit trail, not a
// field edit. Every mutation bumps `revision`, snapshots the previous registry into
// audio/voices/history/, and appends to the profile's own history. Approved profiles are
// immutable — changing one requires `migrate()`, which creates version+1 with an A/B record.
// The voice alias never changes: it is the stable identity episodes reference.
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, rel, ensureDir, exists } from './paths.mjs';
import { readJson, writeJson, sha256File } from './json.mjs';
import { StudioError } from './log.mjs';
import { readWav } from './wav.mjs';
import { validateAgainst } from './schema.mjs';
import { loadConfig } from './config.mjs';
import { deepMerge } from './config.mjs';

// Tests and the audition bench need their own registry/config pair. Everything defaults to
// the real paths, so production callers pass nothing.
function pathsOf(override) {
  return {
    registry: override?.registryPath ?? P.voiceRegistry,
    history: override?.historyDir ?? P.voiceHistory,
  };
}

async function configOf(override) {
  const base = await loadConfig();
  return override?.config ? deepMerge(base, override.config) : base;
}

const now = () => new Date().toISOString();

export async function loadRegistry(override) {
  return readJson(pathsOf(override).registry);
}

export function findProfile(registry, { characterId, voiceAlias }) {
  const profile = (registry.profiles ?? []).find(
    (p) => p.voiceAlias === voiceAlias || (characterId && p.characterId === characterId),
  );
  if (!profile) {
    throw new StudioError(`no voice profile for '${voiceAlias ?? characterId}'`, {
      code: 4,
      hint: 'profiles are created by bootstrap; check audio/voices/registry.json',
    });
  }
  return profile;
}

/** Snapshot the registry before a mutation, so every change is reversible. */
async function snapshot(registry, reason, override) {
  const { history } = pathsOf(override);
  await ensureDir(history);
  const file = path.join(history, `registry.r${registry.revision ?? 0}.json`);
  if (!(await exists(file))) {
    await writeJson(file, { ...registry, snapshotReason: reason, snapshotAt: now() });
  }
  return rel(file);
}

async function persist(registry, event, override) {
  // Snapshot BEFORE bumping, so the file name matches the revision it contains
  // (registry.r3.json holds revision 3 = the state that was just replaced).
  const snapshotPath = await snapshot(registry, event.note ?? event.event, override);
  registry.revision = (registry.revision ?? 0) + 1;
  registry.updatedAt = now();

  const errors = await validateAgainst('voice.schema.json', registry, 'audio/voices/registry.json');
  if (errors.length) {
    throw new StudioError('registry would become invalid — write aborted', {
      code: 2,
      details: errors.map((e) => `${e.where}: ${e.message}`),
    });
  }
  await writeJson(pathsOf(override).registry, registry);
  return { revision: registry.revision, snapshot: snapshotPath };
}

/** Quality gate on the candidate audio; refuses to approve silence or a stub. */
export async function inspectCandidate(samplePath, override) {
  const config = await configOf(override);
  const absPath = path.isAbsolute(samplePath) ? samplePath : path.join(process.cwd(), samplePath);
  if (!(await exists(absPath))) {
    throw new StudioError(`sample audio not found: ${samplePath}`, { code: 4 });
  }
  const wav = await readWav(absPath);
  const problems = [];
  const q = config.quality;
  if (wav.durationSec < q.minDurationSec) problems.push(`duration ${wav.durationSec.toFixed(2)}s < ${q.minDurationSec}s`);
  if (wav.durationSec > q.maxDurationSec) problems.push(`duration ${wav.durationSec.toFixed(2)}s > ${q.maxDurationSec}s`);
  if ((wav.peak ?? 0) < 0.01) problems.push(`peak ${wav.peak} — output is silent`);
  if ((wav.rms ?? 0) < q.minRms) problems.push(`rms ${wav.rms} < ${q.minRms}`);
  return {
    path: rel(absPath),
    sha256: await sha256File(absPath),
    durationSec: Number(wav.durationSec.toFixed(3)),
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    rms: wav.rms,
    peak: wav.peak,
    problems,
  };
}

/**
 * Approve a candidate voice. Explicit act, recorded, gated.
 * @param {{characterId?:string, voiceAlias?:string, engine:string, model?:string, speakerId:string,
 *          samplePath:string, params?:object, approvedBy:string, note?:string}} input
 */
export async function approveVoice(input, override) {
  const config = await configOf(override);
  if (!input.approvedBy) {
    throw new StudioError('approvedBy is required: approvals must name a person', { code: 2 });
  }
  const registry = await loadRegistry(override);
  const profile = findProfile(registry, input);

  if (!config.voicePolicy.productionEngines.includes(input.engine)) {
    throw new StudioError(`engine '${input.engine}' is not production-eligible`, {
      code: 3,
      hint: `allowed: ${config.voicePolicy.productionEngines.join(', ')}. Audition freely, but a production profile needs a production engine.`,
    });
  }

  const sample = await inspectCandidate(input.samplePath, override);
  if (sample.problems.length) {
    throw new StudioError('candidate audio failed the quality gate', { code: 3, details: sample.problems });
  }

  if (profile.status === 'approved' && profile.engine !== input.engine) {
    throw new StudioError(`'${profile.voiceAlias}' is already approved on '${profile.engine}'`, {
      code: 4,
      hint: `use the migration path to switch engines; the alias must stay '${profile.voiceAlias}'`,
    });
  }

  const at = now();
  profile.engine = input.engine;
  profile.model = input.model ?? profile.model ?? 'n/a';
  profile.speakerId = input.speakerId;
  profile.params = input.params ?? profile.params ?? {};
  profile.sampleAudio = sample.path;
  profile.sampleChecksum = sample.sha256;
  profile.quality = {
    durationSec: sample.durationSec,
    sampleRate: sample.sampleRate,
    rms: sample.rms,
    peak: sample.peak,
  };
  profile.status = 'approved';
  profile.approvedBy = input.approvedBy;
  profile.approvedAt = at;
  profile.updatedAt = at;
  profile.history = [
    ...(profile.history ?? []),
    {
      at,
      event: 'profile.approved',
      actor: input.approvedBy,
      note: input.note ?? `approved on ${input.engine} / ${input.speakerId}`,
      sampleChecksum: sample.sha256,
    },
  ];

  const persisted = await persist(registry, { event: 'profile.approved', note: input.voiceAlias ?? input.characterId }, override);
  return { profile, ...persisted };
}

/** Reject a draft: recorded, but never blocks the alias from being re-cast later. */
export async function rejectCandidate({ characterId, voiceAlias, rejectedBy, reason }, override) {
  if (!rejectedBy) throw new StudioError('rejectedBy is required', { code: 2 });
  const registry = await loadRegistry(override);
  const profile = findProfile(registry, { characterId, voiceAlias });
  if (profile.status === 'approved') {
    throw new StudioError('an approved profile cannot be rejected — use migration', { code: 4 });
  }
  const at = now();
  profile.status = 'rejected';
  profile.updatedAt = at;
  profile.history = [...(profile.history ?? []), { at, event: 'profile.rejected', actor: rejectedBy, note: reason ?? null }];
  const persisted = await persist(registry, { event: 'profile.rejected' }, override);
  return { profile, ...persisted };
}

/**
 * Engine/parameter change on an approved profile, without breaking identity.
 * Creates version+1, keeps the alias, and records the A/B candidate pair that justified it.
 */
export async function migrate({ characterId, voiceAlias, engine, model, speakerId, params, samplePath, approvedBy, note }, override) {
  if (!approvedBy) throw new StudioError('approvedBy is required for migration', { code: 2 });
  const registry = await loadRegistry(override);
  const profile = findProfile(registry, { characterId, voiceAlias });
  if (profile.status !== 'approved') {
    throw new StudioError('only an approved profile can be migrated; drafts are simply re-cast', { code: 4 });
  }
  const sample = await inspectCandidate(samplePath, override);
  if (sample.problems.length) {
    throw new StudioError('migration sample failed the quality gate', { code: 3, details: sample.problems });
  }

  const previous = {
    version: profile.version,
    engine: profile.engine,
    model: profile.model,
    speakerId: profile.speakerId,
    params: profile.params,
    sampleAudio: profile.sampleAudio,
    sampleChecksum: profile.sampleChecksum,
  };
  const at = now();
  profile.version = previous.version + 1;
  profile.engine = engine;
  profile.model = model ?? profile.model;
  profile.speakerId = speakerId;
  profile.params = params ?? profile.params;
  profile.sampleAudio = sample.path;
  profile.sampleChecksum = sample.sha256;
  profile.approvedBy = approvedBy;
  profile.approvedAt = at;
  profile.updatedAt = at;
  profile.history = [
    ...(profile.history ?? []),
    {
      at,
      event: 'profile.migrated',
      actor: approvedBy,
      note: note ?? `engine ${previous.engine} → ${engine}; alias preserved`,
      from: previous,
      to: { engine, model: model ?? previous.model, speakerId, sampleChecksum: sample.sha256 },
    },
  ];
  const persisted = await persist(registry, { event: 'profile.migrated' }, override);
  return { profile, previous, ...persisted };
}
