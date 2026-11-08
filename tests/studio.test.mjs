// Unit tests for the pieces that are easy to get silently wrong:
// WAV parsing, asset manifest hashing, schema enforcement and the voice gate.
//
//   npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readWav } from '../scripts/lib/wav.mjs';
import { validateAgainst } from '../scripts/lib/schema.mjs';
import { readJson, sha256File, sha256Text } from '../scripts/lib/json.mjs';
import { P } from '../scripts/lib/paths.mjs';
import { makeWeightsGatedAdapter } from '../audio/engines/adapters/_blocked.mjs';

/** Build a minimal 16-bit PCM WAV in memory. */
function makeWav({ sampleRate = 22050, seconds = 1, amplitude = 8000 }) {
  const frames = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('readWav parses header fields and loudness', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-wav-'));
  const file = path.join(dir, 'tone.wav');
  await fs.writeFile(file, makeWav({ seconds: 1.5, amplitude: 8000 }));
  const wav = await readWav(file);
  assert.equal(wav.codec, 'pcm_s16le');
  assert.equal(wav.sampleRate, 22050);
  assert.equal(wav.channels, 1);
  assert.equal(wav.durationSec, 1.5);
  assert.ok(wav.rms > 0.1, `expected audible rms, got ${wav.rms}`);
  assert.equal(wav.silent, false);
  await fs.rm(dir, { recursive: true, force: true });
});

test('readWav flags a silent file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-wav-'));
  const file = path.join(dir, 'silence.wav');
  await fs.writeFile(file, makeWav({ amplitude: 0 }));
  const wav = await readWav(file);
  assert.equal(wav.silent, true);
  await fs.rm(dir, { recursive: true, force: true });
});

test('readWav rejects non-RIFF input', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-wav-'));
  const file = path.join(dir, 'notawav.wav');
  await fs.writeFile(file, Buffer.from('this is definitely not a wav file at all'));
  await assert.rejects(() => readWav(file), /not a RIFF\/WAVE file/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('sha256 helpers agree with each other', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-sha-'));
  const file = path.join(dir, 'x.txt');
  await fs.writeFile(file, 'kids-ai-studio');
  assert.equal(await sha256File(file), sha256Text('kids-ai-studio'));
  assert.match(await sha256File(file), /^[a-f0-9]{64}$/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('voice registry shipped in the repo satisfies its schema', async () => {
  const registry = await readJson(P.voiceRegistry);
  const errors = await validateAgainst('voice.schema.json', registry, 'registry');
  assert.deepEqual(errors, []);
});

test('scene schema rejects a scene with no characters', async () => {
  const scene = await readJson(path.join(P.projects, 'ep-001/scenes/sc-001.json'));
  const broken = { ...scene, characters: [] };
  const errors = await validateAgainst('scene.schema.json', broken, 'scene');
  assert.ok(errors.length > 0, 'expected a schema violation');
});

test('scene schema rejects an unknown emotion', async () => {
  const scene = await readJson(path.join(P.projects, 'ep-001/scenes/sc-001.json'));
  const broken = structuredClone(scene);
  broken.dialogue[0].emotion = 'furious';
  const errors = await validateAgainst('scene.schema.json', broken, 'scene');
  assert.ok(
    errors.some((e) => e.message.includes('/dialogue/0/emotion') && e.message.includes('allowed values')),
    `expected an enum violation on dialogue[0].emotion, got: ${JSON.stringify(errors)}`,
  );
});

test('element ordering is preserved for scene timing', async () => {
  const scene = await readJson(path.join(P.projects, 'ep-001/scenes/sc-001.json'));
  const starts = scene.dialogue.map((d) => d.startSec);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b), 'dialogue must be authored in start order');
});

test('weights-gated adapters refuse to synthesise instead of silently substituting', async () => {
  const adapter = makeWeightsGatedAdapter({
    id: 'fake-blocked',
    displayName: 'Fake',
    kind: 'tts',
    qualityTier: 'target-production',
    pythonModule: 'definitely_not_a_real_module_xyz',
    weightsEnv: 'FAKE_WEIGHTS_PATH_UNSET',
    blockedReason: 'test double',
    remediation: 'none',
  });
  const probe = await adapter.probe();
  assert.equal(probe.available, false);
  assert.equal(probe.weightsPresent, false);
  await assert.rejects(() => adapter.synthesize({ text: 'halo', outPath: '/tmp/x.wav' }), /cannot synthesise/);
});

test('character files point at registry aliases that exist', async () => {
  const registry = await readJson(P.voiceRegistry);
  const aliases = new Set(registry.profiles.map((p) => p.voiceAlias));
  const files = (await fs.readdir(P.characters)).filter((f) => f.endsWith('.character.json'));
  assert.ok(files.length > 0, 'expected at least one character');
  for (const f of files) {
    const ch = await readJson(path.join(P.characters, f));
    assert.ok(aliases.has(ch.voice.voiceAlias), `${ch.id} -> ${ch.voice.voiceAlias} missing from registry`);
  }
});
