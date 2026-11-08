// Internal production dashboard — voice casting, audition and approval.
//
// This is an internal tool, not a product: it binds 0.0.0.0 so the sandbox preview proxy can
// reach it, and it exposes only what the studio needs. Node's built-in http is intentional —
// no build step, no bundler, no framework to keep alive.
//
// Every route delegates to scripts/lib/* so the GUI and the CLI cannot diverge:
//   GET  /api/state            characters + voice profiles + engines + config
//   GET  /api/engines          live probe of every engine
//   GET  /api/character/:id    one character with its profile and history
//   POST /api/audition         render N variants of the audition text for a character
//   GET  /api/auditions/:id    list generated candidates on disk
//   POST /api/approve          approve a candidate (production engine + quality gate)
//   POST /api/reject           reject a draft
//   POST /api/migrate          engine change with version bump + alias preserved
//   GET  /audio/<path>         stream a generated WAV/MP3
//   GET  /api/voice-report     validation result as JSON (same code as npm run voice:validate)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { P, ROOT, rel, exists } from '../../scripts/lib/paths.mjs';
import { readJson, writeJson, sha256File } from '../../scripts/lib/json.mjs';
import { readWav } from '../../scripts/lib/wav.mjs';
import { log, StudioError } from '../../scripts/lib/log.mjs';
import { loadConfig } from '../../scripts/lib/config.mjs';
import { listEnginesWithProbe, getEngine } from '../../audio/engines/index.mjs';
import { loadRegistry, approveVoice, rejectCandidate, migrate } from '../../scripts/lib/voices.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, 'public');
const PORT = Number(process.env.STUDIO_PORT ?? 4173);
const HOST = process.env.STUDIO_HOST ?? '0.0.0.0';

const AUDITION_TEXT = 'Halo teman-teman! Senang sekali bertemu kalian hari ini. Ayo kita mulai petualangan baru!';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new StudioError('request body too large', { code: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new StudioError('request body is not valid JSON', { code: 400 });
  }
}

/** Serve a file only if it resolves inside the allowed roots. */
async function serveFile(res, filePath, roots) {
  const resolved = path.resolve(filePath);
  const allowed = roots.some((root) => resolved.startsWith(path.resolve(root) + path.sep));
  if (!allowed) return json(res, 403, { error: 'path outside allowed roots' });
  if (!(await exists(resolved))) return json(res, 404, { error: 'not found' });
  const stat = await fs.stat(resolved);
  const type = MIME[path.extname(resolved)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
    'accept-ranges': 'none',
  });
  const handle = await fs.open(resolved, 'r');
  await new Promise((resolve, reject) => {
    handle.createReadStream().on('error', reject).on('end', resolve).pipe(res);
  });
  await handle.close().catch(() => {});
}

async function loadCharacters() {
  const dir = P.characters;
  const out = [];
  for (const file of await fs.readdir(dir).catch(() => [])) {
    if (!file.endsWith('.character.json')) continue;
    out.push(await readJson(path.join(dir, file)));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function listAuditions(characterId) {
  const dir = path.join(P.audioGenerated, 'auditions', characterId);
  const files = await fs.readdir(dir).catch(() => []);
  const manifestPath = path.join(P.audioManifests, `auditions-${characterId}.json`);
  const manifest = (await exists(manifestPath)) ? await readJson(manifestPath) : null;
  const byFile = new Map((manifest?.candidates ?? []).map((c) => [path.basename(c.outputPath), c]));
  const candidates = [];
  for (const f of files.filter((x) => x.endsWith('.wav')).sort()) {
    const meta = byFile.get(f) ?? {};
    // Anything on disk without manifest metadata still gets measured, never shown blank.
    let wav = null;
    if (meta.durationSec == null) {
      try {
        wav = await readWav(path.join(dir, f));
      } catch {
        wav = null;
      }
    }
    candidates.push({
      file: f,
      url: `/audio/auditions/${characterId}/${f}`,
      candidateId: meta.candidateId ?? f.replace(/\.wav$/, ''),
      note: meta.note ?? null,
      params: meta.params ?? null,
      durationSec: meta.durationSec ?? wav?.durationSec ?? null,
      rms: meta.rms ?? wav?.rms ?? null,
      peak: meta.peak ?? wav?.peak ?? null,
      sha256: meta.sha256 ?? (await sha256File(path.join(dir, f)).catch(() => null)),
      engine: meta.engine ?? engineIdFromFile(f),
    });
  }
  return candidates;
}

function engineIdFromFile(file) {
  return file.split('-')[0] ?? null;
}

async function buildState() {
  const [characters, registry, config, engines] = await Promise.all([
    loadCharacters(),
    loadRegistry(),
    loadConfig(),
    listEnginesWithProbe().catch(() => []),
  ]);

  return {
    studio: config.studio,
    policy: config.voicePolicy,
    quality: config.quality,
    auditionText: AUDITION_TEXT,
    revision: registry.revision,
    characters: characters.map((c) => {
      const profile = (registry.profiles ?? []).find((p) => p.characterId === c.id) ?? null;
      return {
        id: c.id,
        displayName: c.displayName,
        species: c.species ?? null,
        role: c.role ?? null,
        palette: c.visual?.palette ?? null,
        voiceAlias: c.voice?.voiceAlias ?? profile?.voiceAlias ?? null,
        profile,
      };
    }),
    engines: engines.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      kind: e.kind,
      status: e.status,
      probe: e.probe,
      productionEligible: e.productionEligible,
      qualityTier: e.qualityTier,
      license: e.license ?? null,
    })),
  };
}

const routes = {
  async 'GET /api/state'(req, res) {
    json(res, 200, await buildState());
  },

  async 'GET /api/engines'(req, res) {
    const engines = await listEnginesWithProbe();
    json(res, 200, { engines });
  },

  async 'GET /api/character/:id'(req, res, params) {
    const state = await buildState();
    const character = state.characters.find((c) => c.id === params.id);
    if (!character) return json(res, 404, { error: `unknown character '${params.id}'` });
    json(res, 200, { character, auditions: await listAuditions(params.id) });
  },

  async 'POST /api/audition'(req, res) {
    const body = await readBody(req);
    const engineId = body.engine ?? 'espeak';
    const characterId = body.characterId;
    if (!characterId) return json(res, 400, { error: 'characterId is required' });

    const engine = await getEngine(engineId);
    const probe = await engine.probe();
    if (!probe.available) {
      return json(res, 409, {
        error: `engine '${engineId}' is not usable`,
        status: probe.status,
        hint: probe.remediation ?? null,
      });
    }

    const variants = Array.isArray(body.variants) && body.variants.length
      ? body.variants
      : [
          { id: 'v1-bright', note: 'brighter, faster', params: { pitch: 68, speedWpm: 165 } },
          { id: 'v2-warm', note: 'warmer, medium pace', params: { pitch: 50, speedWpm: 150 } },
          { id: 'v3-deep', note: 'lower, slower, calmer', params: { pitch: 32, speedWpm: 138 } },
        ];

    const text = body.text ?? AUDITION_TEXT;
    const cfg = await loadConfig();
    const outDir = path.join(P.audioGenerated, 'auditions', characterId);
    await fs.mkdir(outDir, { recursive: true });

    const results = [];
    for (const variant of variants) {
      const outPath = path.join(outDir, `${engineId}-${variant.id}.wav`);
      try {
        const r = await engine.synthesize({
          text,
          outPath,
          speakerId: body.speakerId ?? cfg.pipeline.ttsLanguage,
          language: cfg.pipeline.ttsLanguage,
          params: variant.params ?? {},
        });
        results.push({
          candidateId: variant.id,
          note: variant.note ?? null,
          params: variant.params ?? {},
          file: path.basename(outPath),
          url: `/audio/auditions/${characterId}/${path.basename(outPath)}`,
          durationSec: r.durationSec,
          rms: r.wav?.rms ?? null,
          peak: r.wav?.peak ?? null,
          genMs: r.genMs,
        });
      } catch (err) {
        results.push({ candidateId: variant.id, error: err.message });
      }
    }

    // Persist the manifest: the CLI writes audio/manifests/auditions-<char>.json and the UI
    // reads measurements back from it. Without this the WAVs exist but their metadata is lost.
    const ok = results.filter((r) => !r.error);
    if (ok.length) {
      await writeJson(path.join(P.audioManifests, `auditions-${characterId}.json`), {
        schemaVersion: 1,
        characterId,
        engine: engineId,
        text,
        productionEligible: cfg.voicePolicy.productionEngines.includes(engineId),
        generatedAt: new Date().toISOString(),
        candidates: ok.map((r) => ({
          candidateId: r.candidateId,
          note: r.note,
          params: r.params,
          outputPath: `audio/generated/auditions/${characterId}/${r.file}`,
          durationSec: r.durationSec,
          rms: r.rms,
          peak: r.peak,
        })),
      });
    }

    json(res, ok.length ? 200 : 500, {
      characterId,
      engine: engineId,
      text,
      productionEligible: cfg.voicePolicy.productionEngines.includes(engineId),
      candidates: results,
    });
  },

  async 'GET /api/auditions/:id'(req, res, params) {
    json(res, 200, { characterId: params.id, candidates: await listAuditions(params.id) });
  },

  async 'POST /api/approve'(req, res) {
    const body = await readBody(req);
    const result = await approveVoice({
      characterId: body.characterId,
      voiceAlias: body.voiceAlias,
      engine: body.engine,
      model: body.model,
      speakerId: body.speakerId,
      samplePath: body.samplePath,
      params: body.params,
      approvedBy: body.approvedBy,
      note: body.note,
    });
    json(res, 200, {
      ok: true,
      voiceAlias: result.profile.voiceAlias,
      status: result.profile.status,
      version: result.profile.version,
      revision: result.revision,
      snapshot: result.snapshot,
    });
  },

  async 'POST /api/reject'(req, res) {
    const body = await readBody(req);
    const result = await rejectCandidate(body);
    json(res, 200, { ok: true, status: result.profile.status, revision: result.revision });
  },

  async 'POST /api/migrate'(req, res) {
    const body = await readBody(req);
    const result = await migrate(body);
    json(res, 200, {
      ok: true,
      voiceAlias: result.profile.voiceAlias,
      version: result.profile.version,
      engine: result.profile.engine,
      previous: result.previous,
      revision: result.revision,
    });
  },
};

function matchRoute(method, pathname) {
  for (const key of Object.keys(routes)) {
    const [routeMethod, routePath] = key.split(' ');
    if (routeMethod !== method) continue;
    const routeParts = routePath.split('/');
    const urlParts = pathname.split('/');
    if (routeParts.length !== urlParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      const rp = routeParts[i];
      if (rp.startsWith(':')) params[rp.slice(1)] = decodeURIComponent(urlParts[i]);
      else if (rp !== urlParts[i]) { ok = false; break; }
    }
    if (ok) return { handler: routes[key], params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  // Preview proxies embed the app in an iframe; do not send framing denials.
  res.setHeader('x-content-type-options', 'nosniff');

  try {
    if (pathname.startsWith('/audio/')) {
      const relPath = decodeURIComponent(pathname.slice('/audio/'.length));
      const target = path.join(P.audioGenerated, relPath);
      return await serveFile(res, target, [P.audioGenerated]);
    }

    if (pathname.startsWith('/api/')) {
      const match = matchRoute(req.method, pathname);
      if (!match) return json(res, 404, { error: `no route for ${req.method} ${pathname}` });
      return await match.handler(req, res, match.params);
    }

    // static assets
    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    return await serveFile(res, path.join(PUBLIC_DIR, relPath), [PUBLIC_DIR]);
  } catch (err) {
    const status = err.code && Number.isInteger(err.code) && err.code >= 400 && err.code < 600 ? err.code : 500;
    if (status >= 500) log.error(`${req.method} ${pathname} — ${err.stack ?? err.message}`);
    return json(res, status, {
      error: err.message,
      details: err.details ?? undefined,
      hint: err.hint ?? undefined,
    });
  }
});

server.listen(PORT, HOST, () => {
  log.ok(`studio dashboard on http://${HOST}:${PORT}`);
  log.info(`root: ${rel(ROOT)} · audition text: "${AUDITION_TEXT.slice(0, 40)}…"`);
  log.info('internal tool — exposes the local asset and voice registry, never publish it');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log.info(`received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  });
}
