#!/usr/bin/env node
// Environment + capability doctor. Read-only: it never installs anything.
// Writes manifests/environment.json so later runs (and CI) can diff the environment.
//
//   npm run doctor            human-readable report
//   npm run doctor -- --json  machine-readable only
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, rel } from './lib/paths.mjs';
import { log, run } from './lib/log.mjs';
import { probeProcess, which } from './lib/proc.mjs';
import { listEnginesWithProbe } from '../audio/engines/index.mjs';
import { writeJson } from './lib/json.mjs';

const MB = 1024 * 1024;

async function diskInfo() {
  try {
    const st = await fs.statfs(ROOT);
    return {
      totalGb: Number(((st.blocks * st.bsize) / 1024 ** 3).toFixed(1)),
      freeGb: Number(((st.bavail * st.bsize) / 1024 ** 3).toFixed(1)),
    };
  } catch {
    return { totalGb: null, freeGb: null };
  }
}

async function netProbe() {
  const { statusOf } = await import('./lib/net.mjs');
  const targets = {
    npm: 'https://registry.npmjs.org/-/ping',
    pypi: 'https://pypi.org/simple/six/',
    github: 'https://github.com',
    'github-codeload': 'https://codeload.github.com',
    'github-release-page': 'https://github.com/k2-fsa/sherpa-onnx/releases',
    // Release *assets* redirect to this CDN host; it is blocked, which is why no
    // pretrained model checkpoint can be fetched here.
    'github-asset-cdn': 'https://release-assets.githubusercontent.com',
    huggingface: 'https://huggingface.co/api/models',
    modelscope: 'https://www.modelscope.cn',
  };
  const out = {};
  for (const [name, url] of Object.entries(targets)) {
    out[name] = await statusOf(url, { timeoutMs: 8000 });
  }
  return out;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const report = { generatedAt: new Date().toISOString(), host: {}, node: {}, network: {}, media: {}, engines: {}, storage: {} };

  // --- host ---
  const cpus = os.cpus();
  report.host = {
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.trim() ?? 'unknown',
    cpuCount: cpus.length,
    totalRamMb: Math.round(os.totalmem() / MB),
    freeRamMb: Math.round(os.freemem() / MB),
    gpu: null,
    disk: await diskInfo(),
  };
  const gpu = await probeProcess('sh', ['-c', 'command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name --format=csv,noheader || true']);
  report.host.gpu = gpu.ok && gpu.stdout.trim() ? gpu.stdout.trim() : 'none detected (CPU-only pipeline)';

  // --- node/python ---
  report.node = {
    node: process.version,
    npm: (await probeProcess('npm', ['-v'])).stdout?.trim() ?? null,
    python3: (await probeProcess('python3', ['-V'])).stdout?.trim() ?? null,
    venvModule: (await probeProcess('python3', ['-c', 'import venv'])).ok,
  };

  // --- network ---
  report.network = await netProbe();

  // --- media toolchain ---
  let ffmpegPath = null;
  let ffprobePath = null;
  try {
    ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).default?.path ?? null;
  } catch {}
  try {
    ffprobePath = (await import('@ffprobe-installer/ffprobe')).default?.path ?? null;
  } catch {}
  report.media = {
    ffmpeg: ffmpegPath ? { path: rel(ffmpegPath), version: (await probeProcess(ffmpegPath, ['-version'])).stdout?.split('\n')[0] } : null,
    ffprobe: ffprobePath ? { path: rel(ffprobePath), version: (await probeProcess(ffprobePath, ['-version'])).stdout?.split('\n')[0] } : null,
    espeakNg: (await which('espeak-ng')) ?? (await fs.stat(P.espeakBin).then(() => rel(P.espeakBin)).catch(() => null)),
    chromium: null,
  };
  // Remotion needs a Chrome binary; @sparticuz/chromium ships one inside the npm tarball.
  try {
    const chromium = await import('@sparticuz/chromium');
    const mod = chromium.default ?? chromium;
    const exe = typeof mod.executablePath === 'function' ? await mod.executablePath() : null;
    report.media.chromium = exe ? { provider: '@sparticuz/chromium', path: exe, exists: true } : { provider: '@sparticuz/chromium', installed: true, note: 'path not resolved yet' };
  } catch {
    report.media.chromium = null;
  }

  // --- TTS engines (live probe) ---
  try {
    for (const e of await listEnginesWithProbe()) {
      report.engines[e.id] = {
        displayName: e.displayName,
        kind: e.kind,
        declaredStatus: e.status,
        productionEligible: e.productionEligible,
        qualityTier: e.qualityTier,
        probe: e.probe,
      };
    }
  } catch (err) {
    report.engines.error = err.message;
  }

  await writeJson(P.envManifest, report);
  report.storage = { environmentManifest: rel(P.envManifest) };

  if (asJson) {
    log.plain(JSON.stringify(report, null, 2));
    return 0;
  }

  log.plain('');
  log.step('HOST');
  log.plain(`  platform      ${report.host.platform} ${report.host.arch}`);
  log.plain(`  cpu           ${report.host.cpuModel} x${report.host.cpuCount}`);
  log.plain(`  ram           ${report.host.totalRamMb} MB total / ${report.host.freeRamMb} MB free`);
  log.plain(`  disk          ${report.host.disk.freeGb} GB free of ${report.host.disk.totalGb} GB`);
  log.plain(`  gpu           ${report.host.gpu}`);

  log.step('TOOLCHAIN');
  log.plain(`  node          ${report.node.node}  npm ${report.node.npm}`);
  log.plain(`  python        ${report.node.python3 ?? 'missing'}`);
  log.plain(`  ffmpeg        ${report.media.ffmpeg ? `${report.media.ffmpeg.version}` : 'MISSING'}`);
  log.plain(`  ffprobe       ${report.media.ffprobe ? `${report.media.ffprobe.version}` : 'MISSING'}`);
  log.plain(`  espeak-ng     ${report.media.espeakNg ?? 'MISSING (npm run bootstrap)'}`);
  log.plain(`  chromium      ${report.media.chromium?.path ?? 'not installed (needed for renderer)'}`);

  log.step('NETWORK (egress allowlist)');
  for (const [k, v] of Object.entries(report.network)) {
    log.plain(`  ${k.padEnd(24)} ${v.reachable ? `reachable (${v.httpStatus})` : `BLOCKED (${v.error})`}`);
  }

  log.step('TTS ENGINES');
  for (const [id, e] of Object.entries(report.engines)) {
    if (id === 'error') continue;
    const usable = e.probe?.available ? 'usable now' : e.probe?.status ?? 'unknown';
    log.plain(`  ${id.padEnd(14)} ${String(usable).padEnd(26)} tier=${e.qualityTier} production=${e.productionEligible}`);
  }

  log.plain('');
  log.ok(`environment manifest written to ${rel(P.envManifest)}`);
  return 0;
}

run(main);
