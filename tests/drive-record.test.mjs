// Guards on the "upload, never silently delete" rule.
//
// A large artefact (a render) must not live in git and must not stay in the sandbox forever —
// the workspace snapshot has a hard cap, and six 12 MB renders pushed renders/ to 121 MB against
// a limit of about 128 MB, which put the newest render at risk of being dropped. Uploading is the
// right answer, but only if the upload is *recorded*: an unrecorded upload is a file you cannot
// find again. These tests pin the recording, and pin that the manifest treats a recorded render as
// describable rather than as noise to be dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { P, ROOT } from '../scripts/lib/paths.mjs';
import { readJson, sha256File } from '../scripts/lib/json.mjs';

const run = promisify(execFile);

/** Run a node script and return {code, stdout, stderr} without throwing on non-zero exit. */
async function node(script, args = []) {
  try {
    const { stdout, stderr } = await run(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** A throwaway "large" file inside renders/, removed afterwards. */
async function withRenderFixture(fn) {
  const dir = path.join(ROOT, 'renders', 'ep-test-tmp');
  const file = path.join(dir, 'ep-test-tmp-2099.mp4');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, Buffer.alloc(1_200_000, 7));
  const rel = 'renders/ep-test-tmp/ep-test-tmp-2099.mp4';
  const original = await fs.readFile(P.assetManifest, 'utf8').catch(() => null);
  try {
    return await fn({ rel, file });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    // Never leave the real manifest polluted by a fixture.
    if (original != null) await fs.writeFile(P.assetManifest, original);
  }
}

test('record-drive refuses a file that is not there', async () => {
  const r = await node('scripts/assets/record-drive.mjs', [
    '--path', 'renders/nope/nothing.mp4', '--file-id', 'abcdefghijklmnop',
  ]);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr + r.stdout, /no such file/);
});

test('record-drive refuses something that is not a Drive file id', async () => {
  await withRenderFixture(async ({ rel }) => {
    const r = await node('scripts/assets/record-drive.mjs', ['--path', rel, '--file-id', 'x']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr + r.stdout, /does not look like a Drive file id/);
  });
});

test('record-drive records the real bytes and checksum', async () => {
  await withRenderFixture(async ({ rel, file }) => {
    const r = await node('scripts/assets/record-drive.mjs', [
      '--path', rel, '--file-id', '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    ]);
    assert.equal(r.code, 0, r.stderr);

    const manifest = await readJson(P.assetManifest);
    const entry = manifest.assets.find((a) => a.path === rel);
    assert.ok(entry, 'the render must be recorded');
    assert.equal(entry.storage, 'drive');
    assert.equal(entry.drive.fileId, '1AbCdEfGhIjKlMnOpQrStUvWxYz');
    // The record must describe the file that was uploaded, not a remembered guess.
    assert.equal(entry.sha256, await sha256File(file));
    assert.equal(entry.bytes, (await fs.stat(file)).size);
  });
});

test('a recorded render survives a manifest rebuild instead of being dropped', async () => {
  // Regression: renders/ was excluded entirely, so a recorded render was treated as stale and
  // deleted from the manifest on the next rebuild — the record vanished while the file stayed.
  await withRenderFixture(async ({ rel }) => {
    await node('scripts/assets/record-drive.mjs', ['--path', rel, '--file-id', '1AbCdEfGhIjKlMnOpQrStUvWxYz']);
    const r = await node('scripts/assets/manifest.mjs');
    assert.equal(r.code, 0, r.stderr);

    const manifest = await readJson(P.assetManifest);
    const entry = manifest.assets.find((a) => a.path === rel);
    assert.ok(entry, 'a rebuild must not drop a Drive-recorded render');
    assert.equal(entry.drive.fileId, '1AbCdEfGhIjKlMnOpQrStUvWxYz');
    assert.equal(entry.required, false, 'a recorded render is allowed to be absent later');
  });
});

test('rebuilding the manifest twice does not grow the description', async () => {
  // Regression: the "missing locally" note was appended on every run.
  await withRenderFixture(async ({ rel }) => {
    await node('scripts/assets/record-drive.mjs', ['--path', rel, '--file-id', '1AbCdEfGhIjKlMnOpQrStUvWxYz']);
    await node('scripts/assets/manifest.mjs');
    const first = (await readJson(P.assetManifest)).assets.find((a) => a.path === rel).description;
    await node('scripts/assets/manifest.mjs');
    const second = (await readJson(P.assetManifest)).assets.find((a) => a.path === rel).description;
    assert.equal(first, second, `description is not a fixed point: "${first}" -> "${second}"`);
  });
});

test('verify-drive passes once the upload is recorded', async () => {
  await withRenderFixture(async ({ rel }) => {
    await node('scripts/assets/record-drive.mjs', ['--path', rel, '--file-id', '1AbCdEfGhIjKlMnOpQrStUvWxYz']);
    const r = await node('scripts/assets/verify-drive.mjs', ['--path', rel]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /safe to delete/);
  });
});
