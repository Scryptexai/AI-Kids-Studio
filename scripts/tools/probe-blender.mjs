#!/usr/bin/env node
// Can Blender actually run here? Answer with evidence, not assumptions.
//
//   npm run blender:probe                # try every route, report
//   npm run blender:probe -- --route wasm
//
// Two independent routes exist and they fail for different reasons:
//
//   1. native  — PyPI `bpy` wheels (Blender compiled as a Python module).
//                manylinux wheels exist for cp311 x86_64, but they link against X11
//                (libGL, libICE, libSM, libXfixes, libXi, libXrender, libxkbcommon)
//                which this image does not have and which neither npm nor PyPI provides
//                as a shippable package.
//
//   2. wasm    — npm `@volter/blender-engine`, Blender 5.2 LTS compiled to WebAssembly.
//                Bundles wasm + data + EEVEE engine. No system libraries needed at all,
//                so it is the only route that can work in a bare container like this one.
//
// Blender is NOT required for the current pipeline (the 2.5D renderer is SVG/React).
// This probe exists so the "is Blender available?" question is answered with a result
// instead of an opinion.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { P, ensureDir, rel } from '../lib/paths.mjs';
import { log, StudioError } from '../lib/log.mjs';
import { runProcess } from '../lib/proc.mjs';

const require = createRequire(import.meta.url);
const WASM_DIR = path.join(P.tools, 'blender-wasm');

function parseArgs(argv) {
  const out = { route: 'all' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--route') out.route = argv[++i];
  }
  return out;
}

/** Route 1: is the native bpy wheel installable and importable? */
async function probeNative() {
  const venv = path.join(P.tools, 'bpy-venv');
  const py = path.join(venv, 'bin', 'python');
  const out = { route: 'native', steps: [] };

  if (!fsSync.existsSync(py)) out.steps.push({ step: 'venv', result: 'absent', note: 'not created; run npm run bootstrap -- --with-blender' });
  else {
    out.steps.push({ step: 'venv', result: 'present' });
    try {
      const r = await runProcess(py, ['-c', 'import bpy; print(bpy.app.version_string)'], { timeoutMs: 300_000 });
      out.steps.push({ step: 'import', result: 'ok', version: r.stdout.trim() });
      out.available = true;
    } catch (err) {
      out.steps.push({ step: 'import', result: 'failed', error: (err.stderr || err.message || '').split('\n')[0] });
      // Report the concrete missing libraries rather than a vague failure.
      try {
        const so = await runProcess('find', [venv, '-name', '__init__.so', '-path', '*bpy*'], { timeoutMs: 60_000 });
        const soPath = so.stdout.trim().split('\n')[0];
        if (soPath) {
          const ldd = await runProcess('ldd', [soPath], { timeoutMs: 60_000 });
          out.missingLibraries = ldd.stdout
            .split('\n')
            .filter((l) => l.includes('not found'))
            .map((l) => l.split('=>')[0].trim());
        }
      } catch {
        /* ldd may be unavailable; the import error is enough */
      }
    }
  }
  out.available ??= false;
  return out;
}

/** Route 2: unpack the WASM build and boot it in Node. */
async function probeWasm() {
  const out = { route: 'wasm', steps: [] };
  let pkgDir;
  try {
    const entry = require.resolve('@volter/blender-engine/package.json');
    pkgDir = path.dirname(entry);
  } catch {
    out.steps.push({ step: 'package', result: 'absent', note: 'npm install @volter/blender-engine' });
    out.available = false;
    return out;
  }
  const bundle = JSON.parse(await fs.readFile(path.join(pkgDir, 'wasm', 'BUNDLE.json'), 'utf8'));
  out.blenderVersion = bundle.blender;
  out.license = 'GPL-3.0-or-later';
  out.steps.push({ step: 'package', result: 'present', blender: bundle.blender });

  await ensureDir(WASM_DIR);
  // The emscripten glue is CommonJS; this repo is "type": "module", so it must be .cjs.
  await fs.copyFile(path.join(pkgDir, 'wasm', 'blender_browser.js'), path.join(WASM_DIR, 'blender_browser.cjs'));
  for (const [name, file] of [['blender_browser.wasm', 'blender_browser.wasm.br'], ['blender_browser.data', 'blender_browser.data.br']]) {
    const target = path.join(WASM_DIR, name);
    if (!fsSync.existsSync(target)) {
      const raw = zlib.brotliDecompressSync(await fs.readFile(path.join(pkgDir, 'wasm', file)));
      await fs.writeFile(target, raw);
    }
  }
  out.steps.push({ step: 'unpack', result: 'ok', dir: rel(WASM_DIR) });

  const script = path.join(WASM_DIR, 'boot-probe.mjs');
  await fs.writeFile(script, `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const createBlenderModule = require('./blender_browser.cjs');
const t0 = Date.now();
const mod = await createBlenderModule({
  noInitialRun: true,
  print: (s) => console.log('[blender] ' + s),
  printErr: () => {},
  locateFile: (f) => new URL('./' + f, import.meta.url).pathname,
});
const bootMs = Date.now() - t0;
const api = ['_blender_web_exec', '_blender_web_last_status', '_blender_web_session_alive',
             '_blender_web_export_frame', '_blender_web_export_buffer', '_blender_web_session_reset']
  .filter((k) => typeof mod[k] === 'function');
console.log(JSON.stringify({ bootMs, api, hasFS: !!mod.FS, hasHeap: !!mod.HEAPU8 }));
`);

  try {
    const r = await runProcess(process.execPath, [script], { timeoutMs: 600_000 });
    const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    const parsed = JSON.parse(line ?? '{}');
    out.steps.push({ step: 'boot', result: 'ok', bootMs: parsed.bootMs, api: parsed.api, hasFS: parsed.hasFS });
    out.available = true;
    out.note = 'boots, but the execute/bake protocol is an RPC surface for the package worker; '
      + 'driving a full render from it needs the package\'s worker, not raw _blender_web_exec';
    out.execReady = false;
  } catch (err) {
    out.steps.push({ step: 'boot', result: 'failed', error: (err.message || '').split('\n')[0] });
    out.available = false;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = { probedAt: new Date().toISOString(), routes: [] };
  if (args.route === 'all' || args.route === 'native') report.routes.push(await probeNative());
  if (args.route === 'all' || args.route === 'wasm') report.routes.push(await probeWasm());

  log.plain('');
  for (const r of report.routes) {
    log.step(r.route.toUpperCase());
    for (const s of r.steps) {
      const detail = s.blender ? ` Blender ${s.blender}` : s.version ? ` ${s.version}` : s.error ? ` ${s.error}` : s.note ? ` ${s.note}` : '';
      log.plain(`  ${s.step.padEnd(10)} ${s.result}${detail}`);
    }
    if (r.missingLibraries?.length) log.plain(`  missing    ${r.missingLibraries.join(', ')}`);
    log.plain(`  verdict    ${r.available ? 'RUNNABLE' : 'NOT USABLE'}${r.execReady === false ? ' (boots only)' : ''}`);
  }
  log.plain('');
  log.info('Blender is optional in this pipeline: the 2.5D renderer is SVG-based and does not need it.');
  return report.routes.some((r) => r.execReady) ? 0 : 0;
}

main().then(() => {
  process.exitCode = 0;
}).catch((err) => {
  log.error(err instanceof StudioError ? err.message : String(err));
  process.exitCode = 1;
});
