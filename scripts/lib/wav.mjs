// WAV inspection without external binaries (used for audio-quality validation).
import fs from 'node:fs/promises';

const FORMATS = {
  1: 'pcm_s16le',
  3: 'pcm_f32le',
  6: 'pcm_alaw',
  7: 'pcm_mulaw',
  0xfffe: 'pcm_extensible',
};

/**
 * Parse a RIFF/WAVE header: duration, sample rate, channels, bit depth,
 * plus simple loudness/quality heuristics derived from the sample stream.
 */
export async function readWav(file) {
  const buf = await fs.readFile(file);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }

  let offset = 12;
  let fmt = null;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        formatCode: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataStart = body;
      dataLength = Math.min(size, buf.length - body);
    }
    offset = body + size + (size % 2);
  }

  if (!fmt || dataStart < 0) throw new Error('WAV missing fmt or data chunk');

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * fmt.channels));
  const durationSec = fmt.sampleRate ? frameCount / fmt.sampleRate : 0;

  // Peak + RMS over 16-bit PCM only; enough to catch silent/truncated output.
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  if (fmt.formatCode === 1 && fmt.bitsPerSample === 16) {
    for (let i = dataStart; i + 1 < dataStart + dataLength; i += 2) {
      const s = buf.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(s));
      sumSq += s * s;
      count++;
    }
  }

  return {
    codec: FORMATS[fmt.formatCode] ?? `format_${fmt.formatCode}`,
    channels: fmt.channels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    durationSec: Number(durationSec.toFixed(3)),
    peak: count ? Number(peak.toFixed(4)) : null,
    rms: count ? Number(Math.sqrt(sumSq / count).toFixed(4)) : null,
    silent: count ? peak < 0.01 : null,
  };
}
