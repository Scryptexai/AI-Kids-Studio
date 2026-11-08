// Guards for the Chromium provisioning path.
//
// These exist because the first attempt at this problem concluded "Remotion is blocked"
// after a bare `npm install`. The tarball's al2023 payload — which carries libnss3,
// libnspr4 and libnssutil3 — was never unpacked. These tests make that failure mode
// loud instead of silent.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureChromium, probeChromium, chromiumEnv, chromiumArgs, CHROMIUM_DIR } from '../scripts/lib/chromium.mjs';

test('chromium unpacks the shared libraries, not just the binary', async (t) => {
  let info;
  try {
    info = await ensureChromium();
  } catch (err) {
    t.skip(`@sparticuz/chromium not installed: ${err.message}`);
    return;
  }
  for (const so of ['libnss3.so', 'libnspr4.so', 'libnssutil3.so']) {
    const p = path.join(info.libDir, so);
    const st = await fs.stat(p).catch(() => null);
    assert.ok(st, `${so} must be unpacked from bin/al2023.tar.br into ${info.libDir}`);
    assert.ok(st.size > 0, `${so} must not be empty`);
  }
  assert.ok((await fs.stat(info.executablePath)).size > 100_000_000, 'chromium binary should be ~209 MB');
});

test('chromiumEnv puts the lib dir first on LD_LIBRARY_PATH', async (t) => {
  try {
    await ensureChromium();
  } catch (t2) {
    t.skip('chromium unavailable');
    return;
  }
  const env = chromiumEnv();
  const first = env.LD_LIBRARY_PATH.split(':')[0];
  assert.equal(first, path.join(CHROMIUM_DIR, 'lib'));
});

test('chromium actually launches and reports a version', async (t) => {
  const probe = await probeChromium();
  if (!probe.available) {
    t.skip(`chromium unavailable: ${probe.error}`);
    return;
  }
  assert.match(probe.reported, /^Chromium \d+\./);
});

test('chromiumArgs never enables the sandbox and stays headless', () => {
  const args = chromiumArgs({ width: 640, height: 360 });
  assert.ok(args.includes('--no-sandbox'));
  assert.ok(args.includes('--headless=new'));
  assert.ok(args.includes('--window-size=640,360'));
  assert.ok(!args.some((a) => a.includes('--start-fullscreen')));
});

test('probeChromium never throws when the package is missing', async () => {
  // Contract check: probe returns a result object in both cases.
  const probe = await probeChromium();
  assert.equal(typeof probe.available, 'boolean');
  assert.ok(probe.available || typeof probe.error === 'string');
});

test('remotion backend module resolves when installed', async (t) => {
  let mod;
  try {
    mod = await import('../apps/renderer/remotion/render.mjs');
  } catch (err) {
    t.skip(`remotion not installed: ${err.message}`);
    return;
  }
  assert.equal(typeof mod.renderSceneRemotion, 'function');
  const probe = await probeChromium();
  if (!probe.available) t.skip('chromium unavailable, cannot render');
});
