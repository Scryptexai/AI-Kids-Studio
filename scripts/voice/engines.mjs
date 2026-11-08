#!/usr/bin/env node
// Engine capability matrix with a LIVE probe of every declared engine.
//
//   npm run voice:engines            table
//   npm run voice:engines -- --json  machine-readable
//
// Nothing in this table is a vendor claim: `probe` values are measured in this sandbox
// right now. Adapters for engines whose weights are unreachable report that status and
// refuse to synthesise (they never silently fall back).
import { log, run } from '../lib/log.mjs';
import { listEnginesWithProbe } from '../../audio/engines/index.mjs';
import { writeJson } from '../lib/json.mjs';
import { P } from '../lib/paths.mjs';

async function main() {
  const asJson = process.argv.includes('--json');
  const engines = await listEnginesWithProbe();

  const summary = {
    generatedAt: new Date().toISOString(),
    usableNow: engines.filter((e) => e.probe?.available).map((e) => e.id),
    engines: engines.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      kind: e.kind,
      declaredStatus: e.status,
      productionEligible: e.productionEligible,
      qualityTier: e.qualityTier,
      license: e.license,
      indonesianVerified: e.indonesianVerified,
      approxRamMb: e.approxRamMb,
      probe: e.probe,
    })),
  };

  await writeJson(`${P.audioManifests}/engine-status.json`, summary);

  if (asJson) {
    log.plain(JSON.stringify(summary, null, 2));
    return summary.usableNow.length ? 0 : 1;
  }

  log.plain('');
  log.plain('ENGINE          KIND               STATUS                      TIER                 PROD  ID-VERIFIED');
  log.plain('-'.repeat(112));
  for (const e of summary.engines) {
    const p = e.probe ?? {};
    const status = p.available ? 'AVAILABLE' : (p.status ?? 'unknown');
    log.plain(
      `${e.id.padEnd(15)} ${e.kind.padEnd(18)} ${String(status).padEnd(27)} ${String(e.qualityTier).padEnd(20)} ${(e.productionEligible ? 'yes' : 'no').padEnd(5)} ${e.indonesianVerified ? 'yes' : 'no'}`,
    );
    if (p.detail) log.plain(`  └─ ${p.detail}`);
    if (p.remediation) log.plain(`  └─ fix: ${p.remediation}`);
  }

  log.plain('');
  if (summary.usableNow.length) {
    log.ok(`usable right now: ${summary.usableNow.join(', ')}`);
    const productionReady = summary.engines.filter((e) => e.probe?.available && e.productionEligible);
    if (!productionReady.length) {
      log.warn('no PRODUCTION-eligible engine is usable: voice casting for aired dialogue stays blocked');
      log.warn('next action: stand up a remote engine (TTS_HTTP_ENDPOINT) — see docs/VOICE-PIPELINE.md');
    }
  } else {
    log.error('no usable TTS engine — run `npm run bootstrap`');
  }
  return summary.usableNow.length ? 0 : 1;
}

run(main);
