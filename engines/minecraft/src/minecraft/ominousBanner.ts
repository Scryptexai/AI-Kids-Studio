// The ominous banner's flag texture (mc-raid), shared by the standing banner (RaidFx.tsx, fx agent) and the banner
// worn on Barry's head (mobs agent). Built like the game: the flag's base layer (entity/banner/base) and each pattern
// mask (entity/banner/<pattern>, 64x64 greyscale + alpha) multiplied by its dye colour and stacked in order. The pole
// and bar use entity/banner/banner_base as is. The vanilla PNGs are staged by scripts/mc_fx_textures.py
// into public/mc-preview/_fx/raid (index.json keys = the texture paths below); `useRaidTextures` in
// RaidFx.tsx loads them, or pass any image getter you have.
//
// Vanilla model (BannerRenderer, 64x64 texture, model pixels, y down; standing: translate(0.5, 0.5, 0.5) in the cell,
// scale (2/3, -2/3, -2/3)): flag box (-10, 0, -2) size 20x40x1 uv (0, 0) hung at y -32; pole (-1, -30, -1) 2x42x2
// uv (44, 0); bar (-10, -32, -1) 20x2x2 uv (0, 42). Sway: flag xRot = (-0.0125 + 0.01 cos(2 pi t)) pi, t = ticks/100.
import * as THREE from "three";

/** the game's dye colours (DyeColor texture diffuse colours) */
export const DYE: Record<string, [number, number, number]> = {
  white: [249, 255, 254], light_gray: [157, 157, 151], gray: [71, 79, 82], black: [29, 29, 33], cyan: [22, 156, 156],
  red: [176, 46, 38], blue: [60, 68, 170], yellow: [254, 216, 61], orange: [249, 128, 29], purple: [137, 50, 184],
};
/** the ominous banner (Raid.getOminousBannerInstance), bottom layer first */
export const OMINOUS_LAYERS: [string, string][] = [
  ["base", "white"], ["rhombus", "cyan"], ["stripe_bottom", "light_gray"], ["stripe_center", "gray"], ["border", "light_gray"],
  ["stripe_middle", "black"], ["half_horizontal", "light_gray"], ["circle", "light_gray"], ["border", "black"],
];
/** every texture the banner needs (manifest keys) */
export const BANNER_TEX = ["entity/banner/banner_base", ...[...new Set(OMINOUS_LAYERS.map(([p]) => p))].map((p) => `entity/banner/${p}`)];

/** the 64x64 flag texture as a canvas (null when an image is missing) */
export const bannerCanvas = (img: (key: string) => CanvasImageSource | undefined, layers = OMINOUS_LAYERS): HTMLCanvasElement | null => {
  const out = document.createElement("canvas"); out.width = out.height = 64;
  const g = out.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const tmp = document.createElement("canvas"); tmp.width = tmp.height = 64;
  const t = tmp.getContext("2d", { willReadFrequently: true })!;
  for (const [pattern, dye] of layers) {
    const src = img(`entity/banner/${pattern}`);
    if (!src) return null;
    t.clearRect(0, 0, 64, 64); t.drawImage(src, 0, 0, 64, 64);
    const d = t.getImageData(0, 0, 64, 64), [r, gg, b] = DYE[dye] ?? DYE.white;
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = (d.data[i] * r) / 255; d.data[i + 1] = (d.data[i + 1] * gg) / 255; d.data[i + 2] = (d.data[i + 2] * b) / 255; }
    t.putImageData(d, 0, 0);
    g.drawImage(tmp, 0, 0);
  }
  return out;
};

const cache = new WeakMap<object, THREE.Texture>();
/** the ominous flag as a crisp (nearest) sRGB texture, built once per image source */
export const ominousFlagTexture = (img: (key: string) => CanvasImageSource | undefined, cacheKey: object): THREE.Texture | null => {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const c = bannerCanvas(img);
  if (!c) return null;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  cache.set(cacheKey, tex);
  return tex;
};

/** the game draws a banner with flat entity light, so its pattern keeps its contrast in shade; a soft self-light
 *  (the texture added back at this strength) keeps the black border and eyes readable at phone size */
export const BANNER_GLOW = 0.3;
export const selfLit = <M extends THREE.MeshLambertMaterial>(m: M, k = BANNER_GLOW): M => {
  if (m.map) { m.emissiveMap = m.map; m.emissive.set("#ffffff"); m.emissiveIntensity = k; }
  return m;
};
