// XTTS-v2 (Coqui) — comparison engine, not a production candidate.
// Audit findings:
//  • Indonesian is NOT in XTTS-v2's official language list; it would have to be zero-shot
//    cloned from an Indonesian reference clip, with unverified quality.
//  • Weights are hosted on HuggingFace (unreachable here).
//  • Coqui Public Model License restricts commercial use — this studio publishes
//    monetised YouTube Kids content, so the licence blocks it even if it worked.
//  • ~4.5 GB RAM requirement exceeds this sandbox's 3.8 GB.
import { makeWeightsGatedAdapter } from './_blocked.mjs';

const adapter = makeWeightsGatedAdapter({
  id: 'xtts',
  displayName: 'XTTS-v2 (Coqui)',
  kind: 'tts',
  qualityTier: 'comparison',
  productionEligible: false,
  supportsLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'hu', 'ko', 'ja', 'hi'],
  pythonModule: 'TTS',
  weightsEnv: 'XTTS_WEIGHTS_PATH',
  blockedReason:
    'weights on huggingface.co (unreachable) + Coqui Public Model License forbids the intended commercial use + RAM exceeds sandbox',
  remediation:
    'Keep as a local A/B comparison only. Do not ship commercial episodes generated with XTTS-v2 without a licence review.',
});

export const meta = adapter.meta;
export const probe = adapter.probe;
export const synthesize = adapter.synthesize;
