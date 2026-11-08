// Programmatic Remotion renderer for the studio's scene format.
//
// Requires a working Chromium. In this image that means the @sparticuz/chromium tarball
// must be unpacked *including* its al2023 shared-library payload — see
// scripts/lib/chromium.mjs and the note in docs/RENDERER.md.
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { ensureChromium, chromiumEnv, chromiumArgs, ensureFontconfig } from '../../../scripts/lib/chromium.mjs';
import { StudioError } from '../../../scripts/lib/log.mjs';

const ENTRY = new URL('./Root.jsx', import.meta.url).pathname;
let bundleCache = null;

/** Bundle once per process: webpack startup dominates short renders. */
async function getBundle({ onLog } = {}) {
  if (bundleCache) return bundleCache;
  onLog?.('bundling Remotion project');
  bundleCache = await bundle({ entryPoint: ENTRY });
  return bundleCache;
}

export async function prepareRemotion() {
  const chromium = await ensureChromium();
  Object.assign(process.env, chromiumEnv(), await ensureFontconfig());
  return { serveUrl: await getBundle(), chromium };
}

/**
 * @returns {Promise<{outputPath:string, frames:number, renderMs:number, avgFrameMs:number}>}
 */
export async function renderSceneRemotion({
  scene,
  world,
  characters,
  backgroundDataUri,
  outputPath,
  fps,
  width,
  height,
  showDebug = false,
  concurrency = 1,
  onProgress = () => {},
}) {
  const started = Date.now();
  const t0 = Date.now();
  const serveUrl = await getBundle();
  const bundleMs = Date.now() - t0;
  const { executablePath } = await ensureChromium();
  Object.assign(process.env, chromiumEnv(), await ensureFontconfig());

  const inputProps = {
    scene,
    world,
    characters: [...characters.values()].map((c) => c),
    backgroundDataUri,
    showDebug,
    fps,
    width,
    height,
  };

  const composition = await selectComposition({
    serveUrl,
    id: 'KidsScene',
    inputProps,
    browserExecutable: executablePath,
    chromiumOptions: { gl: 'swangle' },
  });

  if (composition.width !== width || composition.height !== height) {
    throw new StudioError(`Remotion composition size mismatch: ${composition.width}x${composition.height} != ${width}x${height}`);
  }

  const renderStart = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    browserExecutable: executablePath,
    chromiumOptions: { gl: 'swangle' },
    concurrency,
    imageFormat: 'jpeg',
    jpegQuality: 95,
    onProgress: ({ renderedFrames, encodedFrames }) => {
      const pct = Math.floor((renderedFrames / composition.durationInFrames) * 100);
      onProgress({ sceneId: scene.id, pct, frame: renderedFrames, totalFrames: composition.durationInFrames, encoded: encodedFrames });
    },
  });

  const renderMs = Date.now() - renderStart;
  return {
    outputPath,
    frames: composition.durationInFrames,
    renderMs,
    avgFrameMs: Number((renderMs / composition.durationInFrames).toFixed(1)),
    bundleMs,
    totalMs: Date.now() - started,
  };
}

export { chromiumArgs };
