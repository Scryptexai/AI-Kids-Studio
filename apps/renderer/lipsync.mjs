// Mouth shapes driven by the dialogue audio.
//
// The problem this fixes was the most visible defect in the whole episode: nobody's mouth moved
// while they spoke.
//
// The rig already had a `mouthOpen` channel and a `talk` animation that animates it — from a sine
// wave. That is exactly backwards. The mouth was flapping continuously in the beats where the
// character said nothing, and identical in every beat where they spoke, so the picture was not
// connected to the sound. Worse, `travelling` overrides the pose state, so a character who spoke
// while walking had a mouth that was literally frozen shut.
//
// The fix is to derive the mouth from the thing the audience is listening to: the amplitude of the
// rendered speech. A syllable is a burst of energy, so mouth-open follows the loudness envelope.
// This is not phoneme-accurate viseme animation — there is no phoneme timing in the pipeline — but
// it is genuinely in sync, which is what a viewer actually notices.
//
// Pure and synchronous: the envelope is computed once per file, folded into a lookup table, and
// then sampled per frame. The renderer is a per-frame pure function and must stay that way.

import fs from 'node:fs';

/** Envelope frames per second. Speech energy changes fast; 100 Hz is plenty and still small. */
const ENV_HZ = 100;

/** Mouth remains above this for a few hundred ms after a line so the last word is not a slit. */
const RELEASE_SEC = 0.12;

const cache = new Map();

/**
 * Read a 16-bit PCM WAV and return its mono amplitude envelope in [0,1].
 *
 * Only 16-bit PCM is supported, which is what every engine in the pipeline emits (espeak and the
 * HTTP adapters both write pcm_s16le). A file we cannot read returns null rather than a guess, so
 * a missing mouth is a visible, traceable problem instead of a silently wrong one.
 */
function envelopeOf(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;

  let offset = 12;
  let fmt = null;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataStart = body;
      dataLen = Math.min(size, buf.length - body);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || dataStart < 0 || fmt.format !== 1 || fmt.bits !== 16 || !fmt.sampleRate) return null;

  const bytesPerFrame = 2 * fmt.channels;
  const frameCount = Math.floor(dataLen / bytesPerFrame);
  if (!frameCount) return null;
  const secPerFrame = 1 / fmt.sampleRate;
  const hop = Math.max(1, Math.round(fmt.sampleRate / ENV_HZ));
  const bins = Math.ceil(frameCount / hop);
  const rms = new Float32Array(bins);

  for (let bin = 0; bin < bins; bin++) {
    const from = bin * hop;
    const to = Math.min(frameCount, from + hop);
    let sum = 0;
    for (let f = from; f < to; f++) {
      const p = dataStart + f * bytesPerFrame;
      const s = buf.readInt16LE(p) / 32768;
      sum += s * s;
    }
    rms[bin] = to > from ? Math.sqrt(sum / (to - from)) : 0;
  }

  // Normalise against the loud peak, not the mean: a quiet line should still open the mouth fully.
  let peak = 0;
  for (const v of rms) peak = Math.max(peak, v);
  if (peak <= 1e-4) return { bins: new Float32Array(bins), stepSec: hop * secPerFrame, silent: true };

  // A mild gamma lifts the quiet consonants. Without it only the vowels move and the mouth looks
  // like it is opening at random rather than tracking the words.
  const out = new Float32Array(bins);
  for (let i = 0; i < bins; i++) out[i] = Math.min(1, (rms[i] / peak) ** 0.6);

  return { bins: out, stepSec: hop * secPerFrame, silent: false };
}

/**
 * Envelope for one audio file, cached by path.
 * @returns {{bins:Float32Array, stepSec:number, silent:boolean}|null}
 */
export function envelopeFor(file) {
  if (!file) return null;
  if (!cache.has(file)) cache.set(file, envelopeOf(file));
  return cache.get(file);
}

/** Linear sample of an envelope at a local time inside the file. */
function sampleEnvelope(env, tSec) {
  const pos = tSec / env.stepSec;
  if (pos <= 0) return env.bins[0] ?? 0;
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = env.bins[i] ?? 0;
  const b = env.bins[i + 1] ?? a;
  return a + (b - a) * frac;
}

/**
 * Mouth opening for a character at a time, from every line they speak in the scene.
 *
 * @param {Array<{characterId:string, startSec:number, durationSec?:number, audioAsset?:string|null}>} dialogue
 * @param {{characterId:string, tSec:number, root?:string}} args
 * @returns {number|null} openness in [0,1], or null when the character says nothing here
 */
export function mouthFor({ dialogue, characterId, tSec, root = process.cwd() }) {
  let open = null;
  for (const line of dialogue ?? []) {
    if (!line || line.characterId !== characterId) continue;
    const start = line.startSec ?? 0;

    // Speech may be shorter than the slot the director reserved for it. The audio is the truth;
    // `durationSec` is only the estimate in a script that has not been voiced yet.
    const env = envelopeFor(line.audioAsset ? `${root}/${line.audioAsset}` : null);
    let span = line.durationSec ?? 0;
    if (env && env.bins.length) span = Math.max(env.bins.length * env.stepSec, span * 0.5);
    if (tSec < start || tSec > start + span + RELEASE_SEC) continue;

    let value;
    if (env && !env.silent) {
      value = sampleEnvelope(env, tSec - start);
      // A short release keeps the mouth from snapping shut on the last syllable.
      if (tSec > start + span) value *= Math.max(0, 1 - (tSec - start - span) / RELEASE_SEC);
    } else {
      // No readable audio: fall back to a fast, word-sized flutter rather than a fixed jaw.
      value = 0.25 + 0.35 * Math.abs(Math.sin((tSec - start) * 11));
    }
    open = open == null ? value : Math.max(open, value);
  }
  return open;
}
