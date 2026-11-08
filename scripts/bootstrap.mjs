#!/usr/bin/env node
// P0 recovery entry point. Idempotent: safe to run after every sandbox reset.
//
//   npm run bootstrap                 install deps + build the offline TTS fallback
//   npm run bootstrap -- --skip-espeak   skip the eSpeak NG source build
//   npm run bootstrap -- --force         rebuild eSpeak NG even if present
//
// What it does NOT do: download any neural TTS weights. Those hosts are outside this
// environment's egress allowlist (see docs/AUDIT-2026-11-08.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel, ensureDir, exists } from './lib/paths.mjs';
import { log, run, StudioError } from './lib/log.mjs';
import { runProcess, probeProcess } from './lib/proc.mjs';
import { download } from './lib/net.mjs';

const ESPEAK_REPO = 'https://codeload.github.com/espeak-ng/espeak-ng/tar.gz/refs/heads/master';

const flags = {
  skipEspeak: process.argv.includes('--skip-espeak'),
  force: process.argv.includes('--force'),
};

async function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    throw new StudioError(`Node ${process.version} is too old`, { hint: 'install Node 20 or newer' });
  }
  log.ok(`node ${process.version}`);
}

async function ensureDeps() {
  if (await exists(path.join(ROOT, 'node_modules'))) {
    log.ok('node_modules present');
    return;
  }
  log.step('installing npm dependencies');
  await runProcess('npm', ['install', '--no-audit', '--no-fund'], { timeoutMs: 600_000 });
  log.ok('npm dependencies installed');
}

async function ensureBuildTooling() {
  let cmake = (await probeProcess('cmake', ['--version'])).ok;
  let ninja = (await probeProcess('ninja', ['--version'])).ok;
  if (cmake && ninja) return { cmake: 'system', ninja: 'system', env: {} };

  // apt is unusable here (no Debian mirror reachable), so tooling comes from PyPI wheels.
  const venv = path.join(P.tools, 'py');
  const bin = path.join(venv, 'bin');
  if (!(await exists(path.join(bin, 'cmake')))) {
    log.step('creating python venv and installing cmake + ninja from PyPI');
    await runProcess('python3', ['-m', 'venv', venv], { timeoutMs: 120_000 });
    await runProcess(path.join(bin, 'pip'), ['install', '-q', '--disable-pip-version-check', 'cmake', 'ninja'], {
      timeoutMs: 600_000,
    });
  }
  const env = { PATH: `${bin}:${process.env.PATH ?? ''}` };
  cmake = (await probeProcess('cmake', ['--version'], { env })).ok;
  ninja = (await probeProcess('ninja', ['--version'], { env })).ok;
  if (!cmake || !ninja) {
    throw new StudioError('could not provision cmake/ninja', {
      hint: 'PyPI must be reachable (it is on the allowlist); check `npm run doctor`',
    });
  }
  log.ok('cmake + ninja available from .tools/py');
  return { cmake: rel(path.join(bin, 'cmake')), ninja: rel(path.join(bin, 'ninja')), env };
}

async function buildEspeak() {
  const installed = await exists(P.espeakBin);
  if (installed && !flags.force) {
    log.ok('espeak-ng already built (.tools/espeak-ng)');
    return;
  }
  if (flags.skipEspeak) {
    log.warn('skipping eSpeak NG build (--skip-espeak); the smoke-test TTS engine will be unavailable');
    return;
  }

  log.step('building eSpeak NG from source (offline Indonesian TTS smoke-test engine)');
  const buildDir = path.join(P.tools, 'build');
  await ensureDir(buildDir);
  const tarball = path.join(buildDir, 'espeak-ng.tar.gz');
  const srcDir = path.join(buildDir, 'espeak-ng-master');

  if (!(await exists(tarball))) {
    log.info(`downloading ${ESPEAK_REPO}`);
    const { bytes } = await download(ESPEAK_REPO, tarball);
    log.info(`downloaded ${(bytes / 1024).toFixed(0)} KB`);
  }

  if (flags.force || !(await exists(srcDir))) {
    await fs.rm(srcDir, { recursive: true, force: true });
    await runProcess('tar', ['xzf', tarball, '-C', buildDir], { timeoutMs: 120_000 });
  }

  const tooling = await ensureBuildTooling();
  const cmakePath = tooling.cmake === 'system' ? 'cmake' : path.join(ROOT, tooling.cmake);
  const buildOut = path.join(srcDir, 'build');

  await runProcess(
    cmakePath,
    [
      '-S', srcDir, '-B', buildOut, '-G', 'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DUSE_LIBPCAUDIO=OFF',   // no audio device in CI; we only write WAV files
      '-DUSE_LIBSONIC=OFF',
      '-DUSE_ASYNC=OFF',
      `-DCMAKE_INSTALL_PREFIX=${P.espeakRoot}`,
    ],
    { timeoutMs: 300_000, env: tooling.env },
  );
  await runProcess(cmakePath, ['--build', buildOut, '-j', String(Math.max(1, (await import('node:os')).cpus().length))], {
    timeoutMs: 900_000,
    env: tooling.env,
  });
  await runProcess(cmakePath, ['--install', buildOut], { timeoutMs: 300_000, env: tooling.env });

  const probe = await runProcess(P.espeakBin, ['--voices=id'], {
    env: { ESPEAK_DATA_PATH: P.espeakData },
    timeoutMs: 30_000,
  });
  const hasIndonesian = probe.stdout.includes('Indonesian');
  if (!hasIndonesian) {
    throw new StudioError('eSpeak NG built but the Indonesian voice is missing', {
      details: { stdout: probe.stdout.slice(0, 500) },
    });
  }
  log.ok('espeak-ng built with Indonesian voice (id)');
}

async function ensureRuntimeDirs() {
  const dirs = [
    P.manifests, P.audioGenerated, P.audioSamples, P.audioBenchmarks,
    P.audioManifests, P.voiceHistory, P.renders, P.tools,
  ];
  for (const d of dirs) await ensureDir(d);
  log.ok(`runtime directories ready (${dirs.length})`);
}

async function main() {
  log.plain('\n=== Kids AI Studio :: bootstrap ===\n');
  await checkNode();
  await ensureDeps();
  await ensureRuntimeDirs();
  await buildEspeak();

  log.step('probing TTS engines');
  const { listEnginesWithProbe } = await import('../audio/engines/index.mjs');
  const engines = await listEnginesWithProbe();
  for (const e of engines) {
    const state = e.probe?.available ? 'USABLE' : (e.probe?.status ?? 'unknown');
    (e.probe?.available ? log.ok : log.info)(`${e.id.padEnd(14)} ${state}`);
  }

  const usable = engines.filter((e) => e.probe?.available);
  log.plain('');
  if (!usable.length) {
    log.warn('no TTS engine is usable yet — voice casting is blocked.');
  } else {
    log.ok(`${usable.length} usable engine(s): ${usable.map((e) => e.id).join(', ')}`);
  }

  log.plain('\nNext steps:');
  log.plain('  npm run doctor              # environment + network capability report');
  log.plain('  npm run voice:engines       # engine capability matrix');
  log.plain('  npm run assets:manifest     # checksum every asset into manifests/assets.json');
  log.plain('  npm run validate            # schemas, asset references, voice gate\n');
  return 0;
}

run(main);
