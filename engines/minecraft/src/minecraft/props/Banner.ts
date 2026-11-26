// The ominous banner (Raid.getOminousBannerInstance) as the game draws it worn on a raid captain's head:
// banner_base + the pattern masks tinted by their dyes, on the banner box model (pole, bar, flag).
// CustomHeadLayer chain in the head part's pixel space (y down, the mob faces -z):
//   T(0,-4,0) . Ry(180) . S(0.625,-0.625,-0.625) . [HEAD display T(0,16,7) . Ry(180) . S(1.5)] . T(-8,-8,-8)
//   . [banner item transformation T(8,0,8) . S(2/3,-2/3,-2/3)] . banner model
import * as THREE from "three";
import { boxMesh } from "../mobs/boxMesh";
import { BANNER_BASE, OMINOUS_BANNER } from "../mobs/models";
import { selfLit } from "../ominousBanner";

const cache = new WeakMap<THREE.Texture, THREE.Texture>();
/** the composited 64x64 banner texture; `tex(key)` gives a staged texture (missing layers are skipped) */
export const ominousBannerTexture = (tex: (key: string) => THREE.Texture | undefined): THREE.Texture | null => {
  const base = tex(BANNER_BASE);
  const im = base?.image as HTMLImageElement | undefined;
  if (!base || !im?.width) return null;
  const hit = cache.get(base);
  if (hit) return hit;
  const W = im.width, H = im.height;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  g.drawImage(im, 0, 0);
  const dst = g.getImageData(0, 0, W, H);
  const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
  const tg = tmp.getContext("2d", { willReadFrequently: true })!;
  tg.imageSmoothingEnabled = false;
  for (const [key, dye] of OMINOUS_BANNER) {
    const li = tex(key)?.image as HTMLImageElement | undefined;
    if (!li?.width) continue;
    tg.clearRect(0, 0, W, H); tg.drawImage(li, 0, 0, W, H);
    const src = tg.getImageData(0, 0, W, H).data, c = new THREE.Color(dye), d = dst.data;
    // the pattern texture is a white mask: colour = mask rgb * dye, alpha-blended over what is there
    const dr = Math.round(c.r * 255), dg = Math.round(c.g * 255), db = Math.round(c.b * 255);
    for (let i = 0; i < d.length; i += 4) {
      const a = src[i + 3] / 255;
      if (a <= 0) continue;
      d[i] = d[i] * (1 - a) + ((src[i] * dr) / 255) * a;
      d[i + 1] = d[i + 1] * (1 - a) + ((src[i + 1] * dg) / 255) * a;
      d[i + 2] = d[i + 2] * (1 - a) + ((src[i + 2] * db) / 255) * a;
      d[i + 3] = Math.max(d[i + 3], src[i + 3]);
    }
  }
  g.putImageData(dst, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  // crisp like the standing flag (ominousFlagTexture): trilinear mips blur the 1-px border and eyes to grey
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  cache.set(base, t);
  return t;
};

/** the banner worn on a head: a group for the head part (its `flag` child sways: set `.rotation.x`) */
export const headBanner = (tex: THREE.Texture): { obj: THREE.Group; flag: THREE.Group } => {
  const pole = boxMesh([{ uv: [44, 0], o: [-1, -42, -1], s: [2, 42, 2] }], tex, 64, 64);
  const bar = boxMesh([{ uv: [0, 42], o: [-10, -44, -1], s: [20, 2, 2] }], tex, 64, 64);
  const flagMesh = boxMesh([{ uv: [0, 0], o: [-10, 0, -2], s: [20, 40, 1] }], tex, 64, 64);
  selfLit(flagMesh.material as THREE.MeshLambertMaterial);
  const flag = new THREE.Group(); flag.name = "banner_flag"; flag.position.set(0, -44, 0); flag.add(flagMesh);
  const model = new THREE.Group(); model.add(pole, bar, flag);
  // the chain, outermost first
  const m = new THREE.Matrix4().makeTranslation(0, -4, 0)
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    .multiply(new THREE.Matrix4().makeScale(0.625, -0.625, -0.625))
    .multiply(new THREE.Matrix4().makeTranslation(0, 16, 7))
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    .multiply(new THREE.Matrix4().makeScale(1.5, 1.5, 1.5))
    .multiply(new THREE.Matrix4().makeTranslation(-8, -8, -8))
    .multiply(new THREE.Matrix4().makeTranslation(8, 0, 8))
    .multiply(new THREE.Matrix4().makeScale(2 / 3, -2 / 3, -2 / 3));
  const obj = new THREE.Group();
  obj.name = "ominous_banner";
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(m);
  obj.add(model);
  return { obj, flag };
};
