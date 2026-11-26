// Still frames of a staged Minecraft set: bundles the Remotion project once and renders the McPreview composition
// for each camera. GPU (ANGLE) like remotion.config.ts.
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

// REMOTION_CHROME=<chrome or chrome-headless-shell path> picks a browser; unset = the one Remotion downloads itself.
const BROWSER = process.env.REMOTION_CHROME || undefined;

export type StillJob = { stageDir: string; cameras: string[]; outDir: string; markers: boolean; scale: number; frame?: number; repo: string };

export const renderStills = async (job: StillJob): Promise<string[]> => {
  const { bundle } = await import("@remotion/bundler");
  const { renderStill, selectComposition } = await import("@remotion/renderer");
  const chromiumOptions = { gl: "angle" as const };
  const serveUrl = await bundle({ entryPoint: join(job.repo, "src", "index.ts"), publicDir: join(job.repo, "public") });
  // bundle() leaves a copy of the project in the temp folder; delete it when done
  try {
    mkdirSync(job.outDir, { recursive: true });
    const out: string[] = [];
    for (const camera of job.cameras) {
      const inputProps = { dir: job.stageDir, camera, markers: job.markers };
      const composition = await selectComposition({ serveUrl, id: "McPreview", inputProps, browserExecutable: BROWSER, chromiumOptions });
      const file = resolve(job.outDir, `${camera}.png`);
      await renderStill({
        composition, serveUrl, inputProps, frame: job.frame ?? 0, output: file, imageFormat: "png", scale: job.scale,
        browserExecutable: BROWSER, chromiumOptions, timeoutInMilliseconds: 180000,
        onBrowserLog: (l) => { if (l.type === "error" || process.env.MC_DEBUG) console.error(`  browser: ${l.text}`); },
      });
      out.push(file);
    }
    return out;
  } finally {
    rmSync(serveUrl, { recursive: true, force: true });
  }
};
