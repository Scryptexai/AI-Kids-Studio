// SVG -> raw RGBA -> H.264 pipeline.
//
// Why not Remotion: measured in this environment Chromium cannot start because
// libnss3/libnspr4/libnssutil3 are absent and every source for them is blocked
// (apt mirrors, deb.debian.org, browser CDNs). See docs/RENDERER.md for the benchmark.
// The scene contract is renderer-agnostic, so a Remotion backend can be added later
// without touching scene JSON, world data or the audio pipeline.
//
// Performance notes (measured on 2 vCPU, 1280x720):
//   • resvg -> PNG -> disk -> ffmpeg : ~355 ms/frame  (RTF 8.5)
//   • resvg -> raw RGBA -> ffmpeg    : ~60-90 ms/frame (RTF 1.5-2.2)
// Skipping the PNG encode is the single biggest win; embeddings a JPEG background
// instead of a 1.4 MB PNG is the second.
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { buildSceneSvg } from './scene-svg.mjs';
import { ensureDir, exists } from '../../scripts/lib/paths.mjs';
import { runProcess } from '../../scripts/lib/proc.mjs';
import { StudioError } from '../../scripts/lib/log.mjs';

let fontFilesCache = null;

/** Fonts vendored through the `dejavu-fonts-ttf` npm package (deterministic across machines). */
async function fontFiles() {
  if (fontFilesCache) return fontFilesCache;
  const base = path.join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf');
  const files = [];
  for (const w of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
    const p = path.join(base, w);
    if (await exists(p)) files.push(p);
  }
  fontFilesCache = files;
  return files;
}

/**
 * Downscale/crop the location background once per (background, size) pair and return a
 * data URI. JPEG keeps the per-frame payload ~15x smaller than PNG, which is what the
 * rasteriser spends most of its time decoding.
 */
export async function prepareBackground({ world, scene, width, height, cacheDir, ffmpeg }) {
  const location = world.locations.find((l) => l.id === scene.location);
  if (!location?.background) return null;

  const sourcePath = path.join(process.cwd(), location.background);
  if (!(await exists(sourcePath))) return null;

  await ensureDir(cacheDir);
  // Overscan 1.15x so camera pans/zooms never expose an edge of the artwork.
  const w = Math.round(width * 1.15);
  const h = Math.round(height * 1.15);
  const cachePath = path.join(
    cacheDir,
    `${path.basename(location.background, path.extname(location.background))}-${w}x${h}.jpg`,
  );

  if (!(await exists(cachePath))) {
    await runProcess(
      ffmpeg,
      ['-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath,
       '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
       '-q:v', '3', '-frames:v', '1', cachePath],
      { timeoutMs: 120_000 },
    );
  }
  const buf = await fs.readFile(cachePath);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** Spawn ffmpeg accepting raw RGBA frames on stdin and encoding H.264. */
function spawnEncoder({ ffmpeg, width, height, fps, outputPath }) {
  const child = spawn(
    ffmpeg,
    ['-y', '-hide_banner', '-loglevel', 'error',
     '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(fps),
     '-i', '-',
     '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
     '-movflags', '+faststart', outputPath],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new StudioError(`ffmpeg encode failed (exit ${code})`, { details: { stderr: stderr.slice(-1200) } }));
    });
  });
  return { child, done, stderr: () => stderr };
}

/** Write to a stream, waiting for drain so we never buffer a whole scene in memory. */
function writeAsync(stream, buffer) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    stream.once('error', onError);
    const ok = stream.write(buffer, () => {
      stream.removeListener('error', onError);
      resolve();
    });
    if (!ok) stream.once('drain', () => {});
  });
}

/**
 * Render one scene to a silent MP4 (audio is muxed separately).
 * @returns {Promise<{outputPath:string, frames:number, renderMs:number, avgFrameMs:number}>}
 */
export async function renderScene({
  scene,
  world,
  characters,
  outputPath,
  fps,
  width,
  height,
  workDir,
  ffmpeg,
  showDebug = false,
  backgroundSampling = 'quality',
  onProgress = () => {},
}) {
  await ensureDir(path.dirname(outputPath));
  const backgroundDataUri = await prepareBackground({
    world, scene, width, height, cacheDir: path.join(workDir, 'bg'), ffmpeg,
  });
  const fonts = await fontFiles();
  const totalFrames = Math.max(1, Math.round(scene.durationSec * fps));

  const encoder = spawnEncoder({ ffmpeg, width, height, fps, outputPath });
  const started = Date.now();
  let lastPct = -1;

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      const svg = buildSceneSvg({ scene, world, characters, frame, fps, width, height, backgroundDataUri, backgroundSampling, showDebug });
      const renderer = new Resvg(svg, {
        fitTo: { mode: 'width', value: width },
        font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
      });
      const img = renderer.render();
      if (img.width !== width || img.height !== height) {
        throw new StudioError(`frame size mismatch: got ${img.width}x${img.height}, expected ${width}x${height}`);
      }
      await writeAsync(encoder.child.stdin, img.pixels);

      const pct = Math.floor(((frame + 1) / totalFrames) * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        onProgress({ sceneId: scene.id, frame: frame + 1, totalFrames, pct });
      }
    }
  } catch (err) {
    encoder.child.kill('SIGKILL');
    throw err;
  }

  encoder.child.stdin.end();
  await encoder.done;

  const renderMs = Date.now() - started;
  if (!(await exists(outputPath))) {
    throw new StudioError(`video encode produced no file for scene ${scene.id}`);
  }
  return { outputPath, frames: totalFrames, renderMs, avgFrameMs: Number((renderMs / totalFrames).toFixed(1)) };
}

/** Concatenate scene MP4s that share identical codec parameters (stream copy, no re-encode). */
export async function concatVideos({ inputs, outputPath, workDir, ffmpeg }) {
  const listPath = path.join(workDir, 'concat.txt');
  await ensureDir(workDir);
  await fs.writeFile(listPath, inputs.map((p) => `file '${path.resolve(p)}'`).join('\n'), 'utf8');
  await ensureDir(path.dirname(outputPath));
  await runProcess(
    ffmpeg,
    ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listPath,
     '-c', 'copy', '-movflags', '+faststart', outputPath],
    { timeoutMs: 900_000 },
  );
  return outputPath;
}
