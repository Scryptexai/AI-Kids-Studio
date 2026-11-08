// RVC — voice *conversion*, not text-to-speech. It cannot generate dialogue from text;
// it needs (a) source audio from a real TTS engine and (b) a per-character trained
// .pth model plus optionally a faiss index. Pretrained base models are hosted on
// HuggingFace (unreachable here) and training requires a GPU.
import { makeWeightsGatedAdapter } from './_blocked.mjs';

const adapter = makeWeightsGatedAdapter({
  id: 'rvc',
  displayName: 'RVC (voice conversion)',
  kind: 'voice-conversion',
  qualityTier: 'support',
  productionEligible: false,
  supportsLanguages: ['*'],
  pythonModule: 'torch',
  weightsEnv: 'RVC_MODEL_PATH',
  blockedReason:
    'requires per-character trained .pth models + GPU training; HuBERT/faiss base weights are on huggingface.co (unreachable)',
  remediation:
    'Treat as a post-processing stage once a base TTS works and a character voice dataset exists. See docs/VOICE-PIPELINE.md.',
});

export const meta = adapter.meta;
export const probe = adapter.probe;
export const synthesize = adapter.synthesize;
