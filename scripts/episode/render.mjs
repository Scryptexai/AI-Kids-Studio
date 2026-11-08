#!/usr/bin/env node
// Episode renderer: scene JSON -> per-scene MP4 (H.264/AAC) -> concatenated episode.
//
//   npm run episode:render -- --episode ep-001
//   npm run episode:render -- --episode ep-001 --scene sc-001 --debug-overlay
//   npm run episode:render -- --episode ep-001 --allow-smoke     # placeholder audio
//
// Gates, in order:
//   1. structural validation must pass (schemas + cross references)
//   2. every dialogue line must have rendered audio (npm run voice:generate)
//   3. audio produced by a non-production engine requires an explicit --allow-smoke,
//      and the resulting file is marked smokeTest in the render manifest
import fs from 'node:fs/promises';
import path from 'node:path';
import { P, ROOT, abs, rel, ensureDir, exists } from '../lib/paths.mjs';
import { log, run, StudioError } from '../lib/log.mjs';
import { readJson, writeJson, sha256File, sha256Text } from '../lib/json.mjs';
import { runProcess } from '../lib/proc.mjs';
import { loadConfig } from '../lib/config.mjs';
import { renderScene, concatVideos, prepareBackground } from '../../apps/renderer/render.mjs';
import { buildSceneAudio } from '../../apps/renderer/audio-mix.mjs';

function parseArgs(argv) {
  const out = {
    episode: null,
    scene: null,
    allowSmoke: false,
    debugOverlay: false,
    skipValidate: false,
    keepFrames: false,
    bgSampling: 'quality',
    backend: 'svg',
    concurrency: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    // Accept both `--key value` and `--key=value` so `npm run ... -- --key=value` works.
    let inline;
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=');
      inline = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (a === '--episode') out.episode = value();
    else if (a === '--scene') out.scene = value();
    else if (a === '--allow-smoke') out.allowSmoke = true;
    else if (a === '--debug-overlay') out.debugOverlay = true;
    else if (a === '--skip-validate') out.skipValidate = true;
    else if (a === '--keep-frames') out.keepFrames = true;
    else if (a === '--fast-bg') out.bgSampling = 'fast';
    else if (a === '--backend') out.backend = value();
    else if (a === '--concurrency') out.concurrency = Number(value());
    else throw new StudioError(`unknown argument: ${a}`);
  }
  if (!out.episode) throw new StudioError('--episode is required', { hint: 'npm run episode:render -- --episode ep-001' });
  if (!['svg', 'remotion'].includes(out.backend)) {
    throw new StudioError(`unknown backend '${out.backend}'`, { hint: 'use --backend=svg or --backend=remotion' });
  }
  return out;
}

async function ffmpegPath() {
  const mod = await import('@ffmpeg-installer/ffmpeg');
  return mod.default?.path ?? mod.path;
}

async function loadCharacters() {
  const map = new Map();
  for (const f of await fs.readdir(P.characters)) {
    if (!f.endsWith('.character.json')) continue;
    const ch = await readJson(path.join(P.characters, f));
    map.set(ch.id, ch);
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();
  const ffmpeg = await ffmpegPath();

  const episodeDir = path.join(P.projects, args.episode);
  const episode = await readJson(path.join(episodeDir, 'episode.json'));
  const world = await readJson(path.join(P.worlds, `${episode.worldId}.world.json`));
  const characters = await loadCharacters();

  // ---- gate 1: structure ----
  if (!args.skipValidate) {
    log.step('structural validation');
    const res = await runProcess('node', ['scripts/episode/validate.mjs', '--episode', args.episode], { timeoutMs: 120_000 }).catch((e) => e);
    const ok = res.code === 0;
    if (!ok) {
      const detail = res.details?.stderr ?? res.details?.stdout ?? res.stderr ?? res.message ?? '';
      throw new StudioError('episode validation failed — refusing to render', {
        code: 1,
        details: { output: String(detail).slice(-1500) },
        hint: 'fix the reported errors, or use --skip-validate only when you know why',
      });
    }
  }

  const sceneRefs = episode.scenes.filter((s) => !args.scene || s.sceneId === args.scene);
  if (!sceneRefs.length) throw new StudioError(`no scenes matched (episode ${args.episode}, scene ${args.scene ?? '*'})`);

  const scenes = [];
  for (const ref of sceneRefs) scenes.push(await readJson(abs(ref.file)));

  // ---- gate 2: every line is voiced ----
  const missingAudio = [];
  for (const scene of scenes) {
    for (const line of scene.dialogue ?? []) {
      if (!line.audioAsset || !(await exists(path.join(ROOT, line.audioAsset)))) missingAudio.push(`${scene.id}/${line.id}`);
    }
  }
  if (missingAudio.length) {
    throw new StudioError(`${missingAudio.length} dialogue line(s) have no rendered audio`, {
      code: 5,
      details: { lines: missingAudio },
      hint: `run: npm run voice:generate -- --episode ${args.episode}`,
    });
  }

  // ---- gate 3: placeholder audio needs explicit consent ----
  const dialogueManifestPath = `${P.audioManifests}/dialogue-${args.episode}.json`;
  let dialogueManifest = null;
  if (await exists(dialogueManifestPath)) dialogueManifest = await readJson(dialogueManifestPath);
  const isSmoke = dialogueManifest?.smokeTest === true;
  if (isSmoke && !args.allowSmoke) {
    throw new StudioError('dialogue audio was generated by a non-production engine', {
      code: 6,
      hint: `engines used: ${JSON.stringify(dialogueManifest?.engine)}. Re-run with --allow-smoke to render a pipeline test (it will be labelled smokeTest).`,
    });
  }
  if (isSmoke) log.warn('rendering a SMOKE TEST: dialogue audio is placeholder, not production voice');

  const width = episode.output.width;
  const height = episode.output.height;
  const fps = episode.output.fps;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(P.renders, args.episode);
  const workDir = path.join(P.tools, 'render-work', `${args.episode}-${stamp}`);
  await ensureDir(outDir);
  await ensureDir(workDir);

  log.step(`rendering ${scenes.length} scene(s) at ${width}x${height} @ ${fps}fps using the ${args.backend} backend`);
  let remotion = null;
  if (args.backend === 'remotion') {
    const { renderSceneRemotion } = await import('../../apps/renderer/remotion/render.mjs');
    remotion = { renderSceneRemotion };
    log.info('preparing Chromium + Remotion bundle');
  }
  const sceneResults = [];

  for (const scene of scenes) {
    const sceneAudioOut = path.join(workDir, `${scene.id}.wav`);
    const audio = await buildSceneAudio({
      scene,
      ffmpeg,
      outPath: sceneAudioOut,
      dialogue: (scene.dialogue ?? []).map((d) => ({ path: path.join(ROOT, d.audioAsset), startSec: d.startSec, text: d.text })),
      ambience: (scene.audioTracks ?? [])
        .filter((t) => t.kind === 'ambience')
        .map((t) => ({ path: path.join(ROOT, t.asset), gainDb: t.gainDb })),
    });

    const silentVideo = path.join(workDir, `${scene.id}-silent.mp4`);
    const sceneVideo = path.join(outDir, `${args.episode}-${scene.id}.mp4`);

    const progress = ({ pct, frame, totalFrames }) => log.info(`${scene.id}: ${pct}% (${frame}/${totalFrames} frames)`);
    const result = remotion
      ? await remotion.renderSceneRemotion({
          scene, world, characters,
          backgroundDataUri: await prepareBackground({
            world, scene, width, height, cacheDir: path.join(workDir, 'bg'), ffmpeg,
          }),
          outputPath: silentVideo,
          fps, width, height,
          showDebug: args.debugOverlay,
          concurrency: args.concurrency,
          onProgress: progress,
        })
      : await renderScene({
          scene, world, characters,
          outputPath: silentVideo,
          fps, width, height, workDir, ffmpeg,
          showDebug: args.debugOverlay,
          backgroundSampling: args.bgSampling,
          onProgress: progress,
        });

    if (audio) {
      await runProcess(
        ffmpeg,
        ['-y', '-hide_banner', '-loglevel', 'error', '-i', silentVideo, '-i', audio.path,
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '22050', '-shortest', '-movflags', '+faststart', sceneVideo],
        { timeoutMs: 600_000 },
      );
    } else {
      log.warn(`${scene.id}: no audio available, keeping the scene silent`);
      await fs.copyFile(silentVideo, sceneVideo);
    }

    const stat = await fs.stat(sceneVideo);
    const videoSec = result.frames / fps;
    sceneResults.push({
      sceneId: scene.id,
      file: rel(sceneVideo),
      frames: result.frames,
      durationSec: Number(videoSec.toFixed(3)),
      renderMs: result.renderMs,
      rtf: Number((result.renderMs / 1000 / videoSec).toFixed(3)),
      bytes: stat.size,
      sha256: await sha256File(sceneVideo),
      hasAudio: Boolean(audio),
    });
    log.ok(`${scene.id}: ${videoSec.toFixed(2)}s rendered in ${(result.renderMs / 1000).toFixed(1)}s (rtf ${(result.renderMs / 1000 / videoSec).toFixed(2)}), ${(stat.size / 1e6).toFixed(1)} MB`);
  }

  // ---- concatenate ----
  let finalPath = sceneResults[0].file;
  if (sceneResults.length > 1) {
    finalPath = rel(path.join(outDir, `${args.episode}-${stamp}.mp4`));
    await concatVideos({
      inputs: sceneResults.map((s) => path.join(ROOT, s.file)),
      outputPath: path.join(ROOT, finalPath),
      workDir,
      ffmpeg,
    });
    log.ok(`concatenated ${sceneResults.length} scenes → ${finalPath}`);
  }

  const finalAbs = path.join(ROOT, finalPath);
  const probe = await runProcess(path.join(ROOT, 'node_modules/@ffprobe-installer/linux-x64/ffprobe'), [
    '-v', 'error', '-show_entries', 'format=duration,size,bit_rate',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,channels,sample_rate',
    '-of', 'json', finalAbs,
  ], { timeoutMs: 60_000 }).catch(() => null);
  const probeData = probe ? JSON.parse(probe.stdout) : null;

  const manifest = {
    schemaVersion: 1,
    episodeId: episode.id,
    renderedAt: new Date().toISOString(),
    smokeTest: isSmoke,
    output: { file: finalPath, bytes: (await fs.stat(finalAbs)).size, sha256: await sha256File(finalAbs) },
    video: { width, height, fps, codec: episode.output.videoCodec, audioCodec: episode.output.audioCodec, backend: args.backend },
    probe: probeData,
    scenes: sceneResults.map((s) => ({ ...s, sceneChecksum: sha256Text(JSON.stringify(s.sceneId)) })),
    totals: {
      scenes: sceneResults.length,
      durationSec: Number(sceneResults.reduce((a, s) => a + s.durationSec, 0).toFixed(3)),
      renderMs: sceneResults.reduce((a, s) => a + s.renderMs, 0),
      audioLines: dialogueManifest?.summary?.lines ?? null,
      engines: dialogueManifest?.engine ?? null,
    },
  };
  const manifestPath = path.join(outDir, 'render-manifest.json');
  await writeJson(manifestPath, manifest);

  if (!args.keepFrames) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  log.plain('');
  log.ok(`final video: ${finalPath} (${(manifest.output.bytes / 1e6).toFixed(1)} MB, ${manifest.totals.durationSec}s)`);
  log.ok(`render manifest: ${rel(manifestPath)}`);
  if (isSmoke) log.warn('this render used placeholder voice audio — do not publish');
  return 0;
}

run(main);
