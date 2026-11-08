#!/usr/bin/env node
// Renderer benchmark: renders the same scene slice through both backends and reports
// per-frame cost + real-time factor. This is the tool that decides which backend is the
// default; numbers go into docs/RENDERER.md.
//
//   npm run renderer:bench -- --scene sc-001 --seconds 3
import path from 'node:path';
import fs from 'node:fs/promises';
import { P, ensureDir, rel } from '../lib/paths.mjs';
import { readJson, writeJson } from '../lib/json.mjs';
import { log, StudioError } from '../lib/log.mjs';
import { renderScene, prepareBackground } from '../../apps/renderer/render.mjs';
async function ffmpegPath() {
  return (await import('@ffmpeg-installer/ffmpeg')).default.path;
}
async function ffprobePath() {
  return (await import('@ffprobe-installer/ffprobe')).default.path;
}

function parseArgs(argv) {
  const out = { episode: 'ep-001', scene: 'sc-001', seconds: 3, fps: 24, width: 1280, height: 720, backends: 'svg,remotion', concurrency: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episode') out.episode = argv[++i];
    else if (a === '--scene') out.scene = argv[++i];
    else if (a === '--seconds') out.seconds = Number(argv[++i]);
    else if (a === '--fps') out.fps = Number(argv[++i]);
    else if (a === '--backends') out.backends = argv[++i];
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
  }
  return out;
}

async function loadCharacters(scene) {
  const map = new Map();
  for (const inst of scene.characters) {
    if (!map.has(inst.characterId)) {
      map.set(inst.characterId, await readJson(path.join(P.characters, `${inst.characterId}.character.json`)));
    }
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenePath = path.join(P.projects, args.episode, 'scenes', `${args.scene}.json`);
  const full = await readJson(scenePath);
  const world = await readJson(path.join(P.worlds, 'bobby-forest.world.json'));
  const characters = await loadCharacters(full);

  // Slice: keep the first N seconds so both backends render identical content.
  const scene = {
    ...full,
    durationSec: args.seconds,
    camera: { keyframes: sliceKeyframes(full.camera.keyframes, args.seconds) },
    subtitles: (full.subtitles ?? []).filter((s) => s.startSec < args.seconds),
  };
  const frames = Math.round(args.seconds * args.fps);

  const outDir = path.join(P.renders, 'bench');
  await ensureDir(outDir);
  const workDir = path.join(P.tools, 'bench-work');
  const ffmpeg = await ffmpegPath();
  const ffprobe = await ffprobePath();

  const results = [];
  const backends = args.backends.split(',').map((s) => s.trim()).filter(Boolean);

  for (const backend of backends) {
    const outputPath = path.join(outDir, `bench-${args.scene}-${backend}.mp4`);
    log.step(`benchmarking ${backend} — ${args.scene} ${args.seconds}s (${frames} frames)`);
    const started = Date.now();
    let res;
    if (backend === 'remotion') {
      const { renderSceneRemotion } = await import('../../apps/renderer/remotion/render.mjs');
      res = await renderSceneRemotion({
        scene, world, characters,
        backgroundDataUri: await prepareBackground({ world, scene, width: args.width, height: args.height, cacheDir: path.join(workDir, 'bg'), ffmpeg }),
        outputPath, fps: args.fps, width: args.width, height: args.height, concurrency: args.concurrency,
      });
    } else if (backend === 'svg') {
      res = await renderScene({
        scene, world, characters, outputPath, fps: args.fps, width: args.width, height: args.height,
        workDir, ffmpeg, backgroundSampling: 'fast',
      });
    } else {
      throw new StudioError(`unknown backend '${backend}'`);
    }
    const wallMs = Date.now() - started;
    const size = (await fs.stat(outputPath)).size;
    results.push({
      backend,
      concurrency: backend === 'remotion' ? args.concurrency : 1,
      frames,
      wallMs,
      avgFrameMs: Number((wallMs / frames).toFixed(1)),
      rtf: Number(((wallMs / 1000) / args.seconds).toFixed(2)),
      bytes: size,
      output: rel(outputPath),
      ...res,
    });
    log.info(`${backend}: ${(wallMs / 1000).toFixed(1)}s wall, ${(wallMs / frames).toFixed(0)} ms/frame, RTF ${((wallMs / 1000) / args.seconds).toFixed(2)}, ${(size / 1e6).toFixed(2)} MB`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scene: args.scene,
    episode: args.episode,
    seconds: args.seconds,
    fps: args.fps,
    resolution: `${args.width}x${args.height}`,
    ffmpeg: ffmpegPath(),
    ffprobe,
    results,
  };
  const reportPath = path.join(outDir, `bench-${args.scene}.json`);
  await writeJson(reportPath, report);
  log.ok(`benchmark report → ${rel(reportPath)}`);
  console.log(JSON.stringify(results, null, 2));
}

/** Keep keyframes inside the sliced window and keep the list non-empty. */
function sliceKeyframes(keyframes, seconds) {
  const inside = keyframes.filter((k) => k.t <= seconds);
  if (inside.length >= 1) return inside;
  return [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }];
}

main().catch((err) => {
  log.error(err.message);
  process.exitCode = 1;
});
