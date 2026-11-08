// Chromium provisioning from the npm tarball — the part that was missing before.
//
// LESSON LEARNED (kept in code so it is not repeated): `@sparticuz/chromium` does NOT
// only ship a chromium binary. Its tarball contains four payloads:
//
//   bin/chromium.br      the browser binary
//   bin/al2023.tar.br    the Amazon Linux 2023 shared libraries Chromium links against
//                        (libnss3, libnspr4, libnssutil3, libsoftokn3, libfreebl3, …)
//   bin/swiftshader.tar.br  software GL implementation (needed with --disable-gpu)
//   bin/fonts.tar.br     a minimal font set
//
// `require('@sparticuz/chromium').executablePath()` only unpacks the first one, so the
// browser then dies with "error while loading shared libraries: libnspr4.so". You must
// unpack the .so payload too and point LD_LIBRARY_PATH at it.
//
// Verify with:  node -e "import('./scripts/lib/chromium.mjs').then(m=>m.ensureChromium()).then(console.log)"
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { P, ROOT, ensureDir, exists, rel } from './paths.mjs';
import { runProcess } from './proc.mjs';
import { readJson, writeJson } from './json.mjs';
import { StudioError } from './log.mjs';

const require = createRequire(import.meta.url);
const INSTALL_DIR = path.join(P.tools, 'chromium');
const STAMP = path.join(INSTALL_DIR, 'version.json');

function packageDir() {
  try {
    // resolve the package entry, then walk up to the package root
    const entry = require.resolve('@sparticuz/chromium');
    let dir = path.dirname(entry);
    for (let i = 0; i < 5; i++) {
      if (fsSync.existsSync(path.join(dir, 'package.json'))) {
        const pkg = JSON.parse(fsSync.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        if (pkg.name === '@sparticuz/chromium') return { dir, version: pkg.version };
      }
      dir = path.dirname(dir);
    }
  } catch {
    /* fall through */
  }
  throw new StudioError('@sparticuz/chromium is not installed', {
    hint: 'npm install @sparticuz/chromium',
  });
}

async function brotliToFile(src, dest) {
  const out = zlib.brotliDecompressSync(await fs.readFile(src));
  await fs.writeFile(dest, out);
  return out.length;
}

/**
 * Unpack chromium + its shared libraries into .tools/chromium.
 * @returns {Promise<{executablePath:string, libDir:string, version:string, env:Record<string,string>, cached:boolean}>}
 */
export async function ensureChromium({ force = false } = {}) {
  const { dir, version } = packageDir();
  const bin = path.join(INSTALL_DIR, 'chromium');

  if (!force && (await exists(bin)) && (await exists(STAMP))) {
    const stamp = await readJson(STAMP);
    if (stamp.version === version) {
      return { executablePath: bin, libDir: path.join(INSTALL_DIR, 'lib'), version, env: chromiumEnv(), cached: true };
    }
  }

  await ensureDir(INSTALL_DIR);
  const payloads = ['chromium.br', 'al2023.tar.br', 'swiftshader.tar.br', 'fonts.tar.br'];
  const tarDir = path.join(INSTALL_DIR, 'payload');
  await ensureDir(tarDir);

  for (const name of payloads) {
    const src = path.join(dir, 'bin', name);
    if (!(await exists(src))) throw new StudioError(`@sparticuz/chromium is missing ${name}`);
    const target = name.endsWith('.tar.br') ? path.join(tarDir, name.replace(/\.br$/, '')) : bin;
    const bytes = await brotliToFile(src, target);
    if (!name.endsWith('.tar.br')) await fs.chmod(target, 0o755);
    else await runProcess('tar', ['xf', target, '-C', INSTALL_DIR], { timeoutMs: 120_000 });
    void bytes;
  }

  // sanity: the three libraries that were missing must now be present
  const required = ['libnss3.so', 'libnspr4.so', 'libnssutil3.so'];
  for (const so of required) {
    if (!(await exists(path.join(INSTALL_DIR, 'lib', so)))) {
      throw new StudioError(`chromium provisioning incomplete: ${so} missing from al2023 payload`);
    }
  }

  await writeJson(STAMP, {
    version,
    unpackedAt: new Date().toISOString(),
    payloads,
    libraries: required,
  });

  return { executablePath: bin, libDir: path.join(INSTALL_DIR, 'lib'), version, env: chromiumEnv(), cached: false };
}

/**
 * Fonts: Chromium reads fonts through fontconfig. Point it at the vendored DejaVu faces
 * plus the tarball's own font payload so subtitle text renders identically to the SVG backend.
 */
export async function ensureFontconfig() {
  const confPath = path.join(P.tools, 'fonts.conf');
  const dejavuDir = path.join(ROOT, 'node_modules/dejavu-fonts-ttf/ttf');
  const payloadFonts = path.join(INSTALL_DIR, 'fonts');
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${dejavuDir}</dir>
  <dir>${payloadFonts}</dir>
  <cachedir>${path.join(P.tools, 'font-cache')}</cachedir>
</fontconfig>
`;
  await fs.writeFile(confPath, conf, 'utf8');
  return { FONTCONFIG_FILE: confPath };
}

/** Environment every Chromium launch needs in this image. */
export function chromiumEnv() {
  const libDir = path.join(INSTALL_DIR, 'lib');
  const existing = process.env.LD_LIBRARY_PATH;
  return {
    LD_LIBRARY_PATH: existing ? `${libDir}:${existing}` : libDir,
    // Keeps Chromium from trying to reach services that are firewalled here.
    CHROME_DEVEL_SANDBOX: '',
  };
}

/**
 * Flags that work in this sandbox. `--headless=<mode> --screenshot/--dump-dom` on the CLI
 * hangs, but the CDP path (which Remotion and puppeteer-core use) works, so headless is
 * driven through the DevTools protocol instead of the one-shot CLI shortcuts.
 */
export function chromiumArgs({ width, height }) {
  return [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--use-gl=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--metrics-recording-only',
    '--hide-scrollbars',
    '--mute-audio',
    `--window-size=${width ?? 1280},${height ?? 720}`,
  ];
}

/** Verify the browser actually starts and reports a version (no page load involved). */
export async function probeChromium() {
  try {
    const { executablePath, env, version } = await ensureChromium();
    const res = await runProcess(executablePath, ['--version'], { env, timeoutMs: 30_000 });
    return { available: true, version, reported: res.stdout.trim(), executablePath: rel(executablePath) };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

export const CHROMIUM_DIR = INSTALL_DIR;
void ROOT;
