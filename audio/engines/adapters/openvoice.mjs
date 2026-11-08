// OpenVoice V2 — voice conversion / style transfer, NOT an Indonesian TTS.
// It can only restyle audio that another engine produced, and its documented native
// languages do not include Indonesian. Weights are on HuggingFace (unreachable here).
import { makeWeightsGatedAdapter } from './_blocked.mjs';

const adapter = makeWeightsGatedAdapter({
  id: 'openvoice',
  displayName: 'OpenVoice V2',
  kind: 'voice-conversion',
  qualityTier: 'support',
  productionEligible: false,
  supportsLanguages: ['en', 'es', 'fr', 'zh', 'ja', 'ko'],
  pythonModule: 'openvoice',
  weightsEnv: 'OPENVOICE_WEIGHTS_PATH',
  blockedReason: 'weights on huggingface.co (unreachable); no Indonesian native language support',
  remediation:
    'Only relevant downstream of an Indonesian TTS. Re-audit if weights become reachable and a tone-colour transfer test on Indonesian audio passes.',
});

export const meta = adapter.meta;
export const probe = adapter.probe;
export const synthesize = adapter.synthesize;
