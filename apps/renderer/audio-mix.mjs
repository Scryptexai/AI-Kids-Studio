// Builds a scene-length audio bed: dialogue placed at its timeline position + ambience
// looped underneath, normalised to broadcast-ish loudness so episodes are consistent.
import { exists } from '../../scripts/lib/paths.mjs';
import { runProcess } from '../../scripts/lib/proc.mjs';
import { StudioError } from '../../scripts/lib/log.mjs';

const dbToGain = (db) => Math.pow(10, db / 20);

/**
 * @param {object} args
 * @param {object} args.scene
 * @param {Array<{path:string,startSec:number,text:string}>} args.dialogue existing clips only
 * @param {Array<{path:string,gainDb:number}>} args.ambience existing tracks only
 * @param {string} args.outPath
 * @param {string} args.ffmpeg
 * @param {number} [args.targetLufs]
 * @returns {Promise<{path:string}|null>} null when there is nothing to mix
 */
export async function buildSceneAudio({ scene, dialogue, ambience, outPath, ffmpeg, targetLufs = -16 }) {
  const usableDialogue = [];
  for (const d of dialogue) {
    if (await exists(d.path)) usableDialogue.push(d);
  }
  const usableAmbience = [];
  for (const a of ambience) {
    if (await exists(a.path)) usableAmbience.push(a);
  }

  if (!usableDialogue.length && !usableAmbience.length) return null;

  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const filters = [];
  const labels = [];
  let inputIndex = 0;

  for (const d of usableDialogue) {
    args.push('-i', d.path);
    const delayMs = Math.round(Math.max(0, d.startSec) * 1000);
    // adelay in this ffmpeg build has no `all=1`; aformat already forced mono, so one value applies.
    filters.push(`[${inputIndex}:a]aformat=sample_fmts=s16:channel_layouts=mono,adelay=${delayMs}[d${inputIndex}]`);
    labels.push(`[d${inputIndex}]`);
    inputIndex += 1;
  }

  for (const a of usableAmbience) {
    // -stream_loop keeps ambience running for the full scene regardless of source length
    args.push('-stream_loop', '-1', '-t', String(scene.durationSec), '-i', a.path);
    const gain = dbToGain(a.gainDb ?? -18).toFixed(4);
    filters.push(`[${inputIndex}:a]aformat=sample_fmts=s16:channel_layouts=mono,volume=${gain},atrim=0:${scene.durationSec},asetpts=N/SR/TB[a${inputIndex}]`);
    labels.push(`[a${inputIndex}]`);
    inputIndex += 1;
  }

  const mix = `${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0[mix]`;
  // This ffmpeg build predates apad's `whole_dur`; pad to an explicit sample count instead.
  const wholeLen = Math.round(scene.durationSec * 22050);
  const finish = `[mix]apad=whole_len=${wholeLen},atrim=0:${scene.durationSec},loudnorm=I=${targetLufs}:TP=-1.5:LRA=11,aresample=22050[out]`;
  filters.push(mix, finish);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-ac', '1',
    '-ar', '22050',
    '-c:a', 'pcm_s16le',
    outPath,
  );

  try {
    await runProcess(ffmpeg, args, { timeoutMs: 300_000 });
  } catch (err) {
    throw new StudioError(`audio mix failed for scene ${scene.id}: ${err.message}`, { details: err.details });
  }
  return { path: outPath };
}
