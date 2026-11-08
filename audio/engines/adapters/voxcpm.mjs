// VoxCPM 2 — primary TTS candidate per the production brief.
// Audit result (2026-11-08): `pip install voxcpm==2.0.3` resolves from PyPI, but the
// checkpoint is published on HuggingFace and ModelScope, both of which are outside this
// environment's egress allowlist. No checkpoint => no inference, no benchmark.
// This adapter therefore probes, reports, and refuses. That is the honest state.
import { makeWeightsGatedAdapter } from './_blocked.mjs';

const adapter = makeWeightsGatedAdapter({
  id: 'voxcpm',
  displayName: 'VoxCPM 2',
  kind: 'tts',
  qualityTier: 'target-production',
  productionEligible: true,
  supportsLanguages: ['id', 'zh', 'en'],
  pythonModule: 'voxcpm',
  weightsEnv: 'VOXCPM_WEIGHTS_PATH',
  blockedReason:
    'checkpoint hosted on huggingface.co / modelscope.cn, both unreachable from the sandbox; also 3.8 GB RAM is marginal for CPU inference',
  remediation:
    'Host VoxCPM 2 where the weights are reachable and expose the HTTP contract, then use the http-remote engine: see docs/VOICE-PIPELINE.md#remote-execution',
});

export const meta = adapter.meta;
export const probe = adapter.probe;
export const synthesize = adapter.synthesize;
