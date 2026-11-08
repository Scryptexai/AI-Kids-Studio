// Remote HTTP TTS adapter — the production-shaped path for this studio.
//
// Why this exists: heavy neural TTS (VoxCPM 2, XTTS) needs model weights that this
// sandbox cannot download and RAM/GPU it does not have. The architecturally correct
// answer is to run the engine where the weights live (a GPU workstation, a VPS, or a
// machine with unrestricted egress) and let the studio orchestrate it over HTTP.
//
// Contract (v1) — implement it with any engine you host:
//   POST {TTS_HTTP_ENDPOINT}
//   JSON body: { text, speakerId, language, params, format: "wav" }
//   Success: 200 with `audio/wav` body (16-bit PCM), optional headers:
//              X-Engine-Version, X-Model-Version, X-Sample-Rate
//   Failure: non-2xx with JSON { error: string }
//
// Nothing here pretends to work: without TTS_HTTP_ENDPOINT the adapter reports
// `needs-configuration` and synthesize() refuses.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readWav } from '../../../scripts/lib/wav.mjs';
import { StudioError } from '../../../scripts/lib/log.mjs';
import { ensureDir } from '../../../scripts/lib/paths.mjs';

export const meta = {
  id: 'http-remote',
  displayName: 'Remote HTTP TTS service',
  kind: 'tts',
  productionEligible: true,
  qualityTier: 'target-production',
  supportsLanguages: ['*'],
};

function endpoint() {
  const url = process.env.TTS_HTTP_ENDPOINT;
  return url && url.trim() ? url.trim() : null;
}

export async function probe() {
  const url = endpoint();
  if (!url) {
    return {
      available: false,
      status: 'needs-configuration',
      detail: 'TTS_HTTP_ENDPOINT is not set',
      remediation:
        'export TTS_HTTP_ENDPOINT=https://your-gpu-box/synthesize (see docs/VOICE-PIPELINE.md#remote-execution)',
    };
  }
  // Health check: HEAD then GET on /health is optional; a TCP/HTTP reachability probe is enough here.
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(url, { method: 'OPTIONS', signal: ac.signal }).catch(() => null);
    clearTimeout(timer);
    return {
      available: true,
      status: 'available',
      detail: `endpoint configured: ${new URL(url).origin}${new URL(url).pathname}`,
      probeHttpStatus: res ? res.status : 'unreachable-until-first-call',
    };
  } catch (err) {
    return { available: false, status: 'misconfigured', detail: err.message };
  }
}

export async function synthesize(job) {
  const url = endpoint();
  if (!url) {
    throw new StudioError('remote TTS endpoint not configured', {
      hint: 'export TTS_HTTP_ENDPOINT=… , see docs/VOICE-PIPELINE.md#remote-execution',
    });
  }
  const { text, outPath, speakerId, language = 'id', params = {} } = job;
  const timeoutMs = params.timeoutMs ?? 180_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.TTS_HTTP_TOKEN ? { authorization: `Bearer ${process.env.TTS_HTTP_TOKEN}` } : {}),
      },
      body: JSON.stringify({ text, speakerId, language, params, format: 'wav' }),
      signal: ac.signal,
    });
  } catch (err) {
    throw new StudioError(`remote TTS request failed: ${err.message}`, {
      hint: 'check TTS_HTTP_ENDPOINT reachability and TLS certificate (npm run voice:engines)',
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new StudioError(`remote TTS returned HTTP ${res.status}`, {
      details: { body: body.slice(0, 800) },
    });
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('audio/wav') && !contentType.includes('audio/x-wav')) {
    throw new StudioError(`remote TTS returned unexpected content-type: ${contentType || '(none)'}`, {
      hint: 'the service must respond with audio/wav bytes, see the contract in this file',
    });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new StudioError('remote TTS returned a suspiciously small WAV payload');

  await ensureDir(path.dirname(outPath));
  const tmp = `${outPath}.part`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, outPath);
  const wav = await readWav(outPath);

  return {
    ok: true,
    wavPath: outPath,
    durationSec: wav.durationSec,
    genMs: Date.now() - started,
    rtf: wav.durationSec > 0 ? Number((Date.now() - started) / 1000 / wav.durationSec).toFixed(4) : null,
    engineVersion: res.headers.get('x-engine-version') ?? 'unknown',
    modelVersion: res.headers.get('x-model-version') ?? 'unknown',
    speakerIdUsed: speakerId,
    wav,
  };
}
