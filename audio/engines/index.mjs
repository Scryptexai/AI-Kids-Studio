// Engine loader. Resolves adapters declared in audio/engines/engines.json, merges the
// declared capability metadata with the adapter's live probe, and exposes one API the
// rest of the studio uses. Adding an engine means adding an adapter module + a row in
// engines.json — no other file changes.
import { readJson } from '../../scripts/lib/json.mjs';
import { P } from '../../scripts/lib/paths.mjs';
import { StudioError, log } from '../../scripts/lib/log.mjs';

const cache = new Map();

export async function loadEngineRegistry() {
  const registry = await readJson(P.engineRegistry);
  for (const e of registry.engines) cache.set(e.id, e);
  return registry;
}

export async function getEngine(id) {
  if (!cache.size) await loadEngineRegistry();
  const declared = cache.get(id);
  if (!declared) {
    throw new StudioError(`unknown TTS engine '${id}'`, {
      hint: `known engines: ${[...cache.keys()].join(', ')}`,
    });
  }
  const mod = await import(new URL(`../../${declared.adapter}`, import.meta.url).href);
  return { declared, meta: mod.meta ?? declared, probe: mod.probe, synthesize: mod.synthesize };
}

export async function listEnginesWithProbe() {
  const registry = await loadEngineRegistry();
  const out = [];
  for (const declared of registry.engines) {
    try {
      const engine = await getEngine(declared.id);
      const probe = engine.probe ? await engine.probe() : { available: false, status: 'no-probe' };
      out.push({ ...declared, probe });
    } catch (err) {
      log.warn(`probe failed for ${declared.id}: ${err.message}`);
      out.push({ ...declared, probe: { available: false, status: 'probe-error', detail: err.message } });
    }
  }
  return out;
}

/** Engines that can actually generate audio right now. */
export async function usableEngines() {
  return (await listEnginesWithProbe()).filter((e) => e.probe.available === true);
}
