// Casting-workflow guards. These encode the standing voice rules:
//   - only a production-eligible engine may produce an approved profile
//   - every approval names a person and passes the audio quality gate
//   - the voice alias is stable across engine changes (migration, never replacement)
//   - approved profiles are immutable
//   - a missing profile halts generation instead of falling back to a default voice
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  approveVoice, rejectCandidate, migrate, loadRegistry, findProfile, inspectCandidate,
} from '../scripts/lib/voices.mjs';
import { P } from '../scripts/lib/paths.mjs';

// A config that treats a fake engine as production, plus espeak excluded, so the gates can be
// exercised without a real production model (none is downloadable in this environment).
const FIXTURE_CONFIG = {
  voicePolicy: { requireApprovedProfile: true, forbidSilentFallback: true, productionEngines: ['test-engine'] },
  quality: { minDurationSec: 0.05, maxDurationSec: 60, maxSilenceRatio: 0.9, minRms: 0.005 },
};

async function makeFixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voices-'));
  const registryPath = path.join(dir, 'registry.json');
  const historyDir = path.join(dir, 'history');
  await fs.mkdir(historyDir, { recursive: true });

  const base = {
    schemaVersion: 1,
    revision: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    profiles: [
      {
        characterId: 'bobby',
        voiceAlias: 'bobby_warm_01',
        version: 1,
        engine: 'unassigned',
        engineVersion: 'n/a',
        model: 'unassigned',
        modelVersion: 'n/a',
        speakerId: 'unassigned',
        voiceDescription: 'test',
        referenceAudio: null,
        referenceTranscript: null,
        language: 'id',
        pitchProfile: null,
        speakingRate: null,
        timbreDescription: null,
        accentProfile: null,
        emotionDefaults: {},
        params: {},
        status: 'draft',
        approvedBy: null,
        approvedAt: null,
        sampleAudio: null,
        sampleChecksum: null,
        quality: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        history: [],
      },
    ],
  };
  await fs.writeFile(registryPath, JSON.stringify(base, null, 2));

  // A real 16-bit PCM WAV so the quality gate reads actual audio, not a stub.
  const wavPath = path.join(dir, 'sample.wav');
  const frames = 22050; // 1 second
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / 22050) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(22050, 24);
  header.writeUInt32LE(22050 * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  await fs.writeFile(wavPath, Buffer.concat([header, data]));

  // Silent WAV: must fail the quality gate.
  const silentPath = path.join(dir, 'silent.wav');
  const silent = Buffer.alloc(header.length + frames * 2);
  header.copy(silent, 0);
  await fs.writeFile(silentPath, silent);

  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return {
    dir,
    registryPath,
    historyDir,
    wavPath,
    silentPath,
    override: { registryPath, historyDir, config: FIXTURE_CONFIG },
  };
}

test('a non-production engine cannot produce an approved profile', async (t) => {
  const fx = await makeFixture(t);
  await assert.rejects(
    () => approveVoice({
      characterId: 'bobby', engine: 'espeak', speakerId: 'id',
      samplePath: fx.wavPath, approvedBy: 'tester',
    }, fx.override),
    (err) => {
      assert.match(err.message, /not production-eligible/);
      assert.match(err.hint, /test-engine/);
      return true;
    },
  );
  const registry = await loadRegistry(fx.override);
  assert.equal(registry.profiles[0].status, 'draft', 'a refused approval must not mutate the registry');
  assert.equal(registry.revision, 0);
});

test('approval requires a named approver', async (t) => {
  const fx = await makeFixture(t);
  await assert.rejects(
    () => approveVoice({
      characterId: 'bobby', engine: 'test-engine', speakerId: 'id',
      samplePath: fx.wavPath, approvedBy: '',
    }, fx.override),
    /approvedBy is required/,
  );
});

test('silent audio fails the quality gate', async (t) => {
  const fx = await makeFixture(t);
  await assert.rejects(
    () => approveVoice({
      characterId: 'bobby', engine: 'test-engine', speakerId: 'id',
      samplePath: fx.silentPath, approvedBy: 'tester',
    }, fx.override),
    (err) => {
      assert.match(err.message, /quality gate/);
      assert.ok(err.details.some((d) => /silent|rms|peak/i.test(d)), `unexpected details: ${err.details}`);
      return true;
    },
  );
});

test('a valid approval records identity, sample checksum, quality and history', async (t) => {
  const fx = await makeFixture(t);
  const result = await approveVoice({
    characterId: 'bobby', engine: 'test-engine', speakerId: 'voice-a',
    samplePath: fx.wavPath, approvedBy: 'director', note: 'clear diction',
  }, fx.override);

  assert.equal(result.profile.status, 'approved');
  assert.equal(result.profile.voiceAlias, 'bobby_warm_01', 'alias must not change on approval');
  assert.equal(result.profile.engine, 'test-engine');
  assert.match(result.profile.sampleChecksum, /^[0-9a-f]{64}$/);
  assert.equal(result.profile.approvedBy, 'director');
  assert.ok(result.profile.quality.durationSec > 0.9);
  const last = result.profile.history.at(-1);
  assert.equal(last.event, 'profile.approved');
  assert.equal(last.actor, 'director');
  assert.equal(result.revision, 1);

  // snapshot of the pre-change registry must exist
  const snaps = await fs.readdir(fx.historyDir);
  assert.ok(snaps.some((s) => s.startsWith('registry.r0')), `expected r0 snapshot, got ${snaps}`);
});

test('switching engine on an approved profile is refused; migration keeps the alias', async (t) => {
  const fx = await makeFixture(t);
  await approveVoice({
    characterId: 'bobby', engine: 'test-engine', speakerId: 'voice-a',
    samplePath: fx.wavPath, approvedBy: 'director',
  }, fx.override);

  const migrated = await migrate({
    characterId: 'bobby', engine: 'test-engine-2', speakerId: 'voice-b',
    samplePath: fx.wavPath, approvedBy: 'director', note: 'A/B: better consonants',
  }, fx.override);

  assert.equal(migrated.profile.voiceAlias, 'bobby_warm_01');
  assert.equal(migrated.profile.version, 2, 'migration bumps the profile version');
  assert.equal(migrated.profile.engine, 'test-engine-2');
  assert.equal(migrated.previous.engine, 'test-engine');
  const event = migrated.profile.history.at(-1);
  assert.equal(event.event, 'profile.migrated');
  assert.equal(event.from.engine, 'test-engine');
  assert.ok(event.to, 'migration records the target side of the A/B');
});

test('an approved profile cannot be rejected into a draft-like state', async (t) => {
  const fx = await makeFixture(t);
  await approveVoice({
    characterId: 'bobby', engine: 'test-engine', speakerId: 'voice-a',
    samplePath: fx.wavPath, approvedBy: 'director',
  }, fx.override);
  await assert.rejects(
    () => rejectCandidate({ characterId: 'bobby', rejectedBy: 'director', reason: 'changed mind' }, fx.override),
    /approved profile cannot be rejected/,
  );
});

test('rejecting a draft is recorded and keeps the alias available', async (t) => {
  const fx = await makeFixture(t);
  const result = await rejectCandidate({ characterId: 'bobby', rejectedBy: 'director', reason: 'too nasal' }, fx.override);
  assert.equal(result.profile.status, 'rejected');
  assert.equal(result.profile.voiceAlias, 'bobby_warm_01');
  assert.equal(result.profile.history.at(-1).event, 'profile.rejected');
});

test('an unknown character halts instead of falling back to a default voice', async (t) => {
  const fx = await makeFixture(t);
  const registry = await loadRegistry(fx.override);
  assert.throws(() => findProfile(registry, { characterId: 'nobody' }), /no voice profile/);
});

test('the real registry ships draft profiles with unassigned engines', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.profiles.length >= 3);
  for (const p of registry.profiles) {
    if (p.status !== 'approved') continue;
    assert.notEqual(p.engine, 'unassigned', `${p.voiceAlias} is approved but has no engine`);
    assert.ok(p.sampleChecksum, `${p.voiceAlias} is approved but has no sample checksum`);
  }
});

test('inspectCandidate reports measurements for real audio', async (t) => {
  const fx = await makeFixture(t);
  const info = await inspectCandidate(fx.wavPath, fx.override);
  assert.deepEqual(info.problems, []);
  assert.ok(info.durationSec >= 0.9);
  assert.equal(info.sampleRate, 22050);
  assert.equal(info.channels, 1);
  assert.ok(info.rms > 0.005);
});

test('the studio dashboard files are present and reference the API', async () => {
  const dir = path.join(P.root, 'apps/studio');
  for (const f of ['server.mjs', 'public/index.html', 'public/app.js', 'public/style.css']) {
    await fs.access(path.join(dir, f));
  }
  const app = await fs.readFile(path.join(dir, 'public/app.js'), 'utf8');
  for (const route of ['/api/state', '/api/audition', '/api/approve', '/api/reject']) {
    assert.ok(app.includes(route), `dashboard should call ${route}`);
  }
});
