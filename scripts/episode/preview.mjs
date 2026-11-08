#!/usr/bin/env node
// Render ONE frame to PNG for fast composition checks (seconds instead of minutes).
//
//   npm run render:preview -- --episode ep-001 --scene sc-001 --at 9
//   npm run render:preview -- --episode ep-001 --scene sc-001 --at 4.2 --out /tmp/frame.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { P, ROOT, abs, rel, ensureDir, exists } from '../lib/paths.mjs';
import { log, run, StudioError } from '../lib/log.mjs';
import { readJson } from '../lib/json.mjs';
import { buildSceneSvg } from '../../apps/renderer/scene-svg.mjs';
import { prepareBackground } from '../../apps/renderer/render.mjs';

function parseArgs(argv) {
  const out = { episode: null, scene: null, at: 4, out: null, debug: false, sampling: 'quality' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episode') out.episode = argv[++i];
    else if (a === '--scene') out.scene = argv[++i];
    else if (a === '--at') out.at = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--debug') out.debug = true;
    else if (a === '--fast-bg') out.sampling = 'fast';
    else throw new StudioError(`unknown argument: ${a}`);
  }
  if (!out.episode || !out.scene) {
    throw new StudioError('--episode and --scene are required', {
      hint: 'npm run render:preview -- --episode ep-001 --scene sc-001 --at 9',
    });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const episode = await readJson(path.join(P.projects, args.episode, 'episode.json'));
  const ref = (episode.scenes ?? []).find((s) => s.sceneId === args.scene || s.id === args.scene);
  if (!ref) throw new StudioError(`scene '${args.scene}' is not listed in ${args.episode}`);
  const scene = await readJson(abs(ref.file ?? ref.filePath ?? `projects/${args.episode}/scenes/${args.scene}.json`));
  const world = await readJson(path.join(P.worlds, `${episode.worldId}.world.json`));

  const characters = new Map();
  for (const f of await fs.readdir(P.characters)) {
    if (!f.endsWith('.character.json')) continue;
    const ch = await readJson(path.join(P.characters, f));
    characters.set(ch.id, ch);
  }

  const { default: ffmpegInstaller } = await import('@ffmpeg-installer/ffmpeg');
  const ffmpeg = ffmpegInstaller.path;
  const width = episode.output.width;
  const height = episode.output.height;
  const fps = episode.output.fps;

  const backgroundDataUri = await prepareBackground({
    world, scene, width, height, cacheDir: path.join(P.tools, 'render-cache'), ffmpeg,
  });

  const frame = Math.round(args.at * fps);
  const svg = buildSceneSvg({
    scene, world, characters, frame, fps, width, height,
    backgroundDataUri, backgroundSampling: args.sampling, showDebug: args.debug,
  });

  const fonts = [];
  for (const f of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
    const p = path.join(ROOT, 'node_modules/dejavu-fonts-ttf/ttf', f);
    if (await exists(p)) fonts.push(p);
  }

  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
  });
  const png = renderer.render().asPng();

  const outPath = args.out ?? path.join(P.renders, args.episode, 'preview', `${args.scene}-${args.at.toFixed(2)}s.png`);
  await ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, png);
  log.ok(`frame at ${args.at}s (frame ${frame}) → ${outPath.startsWith(ROOT) ? rel(outPath) : outPath}`);
  return 0;
}

run(main);
