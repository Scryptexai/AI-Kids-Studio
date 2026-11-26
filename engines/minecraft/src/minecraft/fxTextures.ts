// Shared fx textures for every Minecraft-mode shot (crack stages, water, smoke, splash, generic particles), staged by
// scripts/mc_fx_textures.py into public/mc-preview/_fx/ (index.json + PNGs). Loaded once per composition, outside the
// canvases. A missing folder is not an error: the fx that need it just draw without textures.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { continueRender, delayRender, staticFile } from "remotion";

export type FxTex = {
  tex: Record<string, THREE.Texture>;
  meta: Record<string, { frames: number; frametime: number }>;
  /** the default water tint */
  water: string;
};
export const NO_FX: FxTex = { tex: {}, meta: {}, water: "#3F76E4" };

/** the game multiplies its crack greys (61 darker, 155 lighter) over the block in sRGB; our blend runs in linear light,
 *  where the same factors barely show. Remap them so 2*src*dst in linear matches the game's sRGB result
 *  (x0.48 -> x0.2, x1.22 -> x1.5). */
const crackRemap = (tex: THREE.Texture): THREE.Texture => {
  const img = tex.image as HTMLImageElement;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] < 128) continue;
    const f = Math.pow((2 * d.data[i]) / 255, 2.2) / 2;           // the sRGB factor as a linear one, halved for 2*src*dst
    d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.round(Math.min(1, f) * 255);
  }
  g.putImageData(d, 0, 0);
  return new THREE.CanvasTexture(c);
};

export const useFxTextures =(root = "mc-preview/_fx"): FxTex | null => {
  const [handle] = useState(() => delayRender(`mc fx textures ${root}`, { timeoutInMilliseconds: 60000 }));
  const [fx, setFx] = useState<FxTex | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      let out = NO_FX;
      try {
        const r = await fetch(staticFile(`${root}/index.json`));
        if (r.ok) {
          const index = (await r.json()) as { water: string; textures: Record<string, { file: string; frames: number; frametime: number }> };
          const loader = new THREE.TextureLoader();
          const entries = await Promise.all(Object.entries(index.textures).map(async ([k, t]) => {
            let tex: THREE.Texture = await loader.loadAsync(staticFile(`${root}/${t.file}`));
            if (k.startsWith("block/destroy_stage")) tex = crackRemap(tex);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
            // crack stages blend like the game (2 * src * dst): their greys must stay linear (61 -> darker, 155 -> lighter)
            tex.colorSpace = k.startsWith("block/destroy_stage") ? THREE.NoColorSpace : THREE.SRGBColorSpace;
            if (t.frames > 1) tex.repeat.set(1, 1 / t.frames);
            // rain tiles down a tall column and is seen far off: wrap it and mipmap it (thin streaks would shimmer)
            if (k === "environment/rain") { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; }
            return [k, tex] as const;
          }));
          out = { tex: Object.fromEntries(entries), meta: Object.fromEntries(Object.entries(index.textures).map(([k, t]) => [k, { frames: t.frames, frametime: t.frametime }])), water: index.water };
        }
      } catch (e) { console.error("MCFX|", e); }
      if (!live) return;
      setFx(out);
      continueRender(handle);
    })();
    return () => { live = false; };
  }, [root, handle]);
  return fx;
};

/** step an animated fx texture to this video frame (20 game ticks per second) */
export const stepFx = (fx: FxTex, key: string, frame: number, fps: number) => {
  const t = fx.tex[key], m = fx.meta[key];
  if (!t || !m || m.frames <= 1) return t;
  const f = Math.floor(((frame / fps) * 20) / Math.max(1, m.frametime)) % m.frames;
  t.offset.set(0, 1 - (f + 1) / m.frames);
  return t;
};
