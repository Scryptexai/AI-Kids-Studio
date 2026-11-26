// Wave B (mc-cobblegen) C10: the imagined "ghost" look for objects (a piston, items): desaturated, pale, softly
// glowing and see-through, drawn so only the FRONT surface shows (a depth-only pass first, then the colour pass with
// LessEqual), so a ghost cube never shows its back faces or inner seams through itself. Both passes sit in the
// transparent list (after every opaque block), so nothing behind a ghost is ever cut out of the picture.
import * as THREE from "three";

const greyCache = new Map<string, THREE.Texture>();
/** a desaturated, lightened copy of a texture (sat 0 = grey, 1 = the original colours) */
export const greyTex = (tex: THREE.Texture, sat = 0.2, lift = 0.18): THREE.Texture => {
  const img = tex.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const key = `${tex.uuid}|${sat}|${lift}`;
  const hit = greyCache.get(key);
  if (hit) return hit;
  if (!img || !img.width) return tex;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2], l = 0.3 * r + 0.59 * gg + 0.11 * b;
    for (const [j, v] of [[0, r], [1, gg], [2, b]] as const) d.data[i + j] = Math.min(255, Math.round((l + (v - l) * sat) * (1 - lift) + 255 * lift));
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.copy(tex.repeat); t.offset.copy(tex.offset);
  greyCache.set(key, t);
  return t;
};

export type Ghost = { obj: THREE.Group; set: (opacity: number) => void };
/** a ghost copy of an object (geometry shared, own materials): set(opacity) each frame (0 hides it) */
export const ghostOf = (src: THREE.Object3D, o: { sat?: number; tint?: string; glow?: string; glowI?: number; order?: number } = {}): Ghost => {
  const root = src.clone(true) as THREE.Group;
  const mats: { m: THREE.Material; base: number }[] = [], depth: THREE.Material[] = [];
  const order = o.order ?? 30;
  const meshes: THREE.Mesh[] = [];
  root.traverse((x) => { if ((x as THREE.Mesh).isMesh) meshes.push(x as THREE.Mesh); });
  for (const mesh of meshes) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const conv = (m: THREE.Material) => {
      const src = m as THREE.MeshLambertMaterial;
      const map = src.map ? greyTex(src.map, o.sat ?? 0.2) : null;
      const cut = (src.alphaTest ?? 0) > 0 || !!src.transparent;
      const d = new THREE.MeshBasicMaterial({ map, colorWrite: false, depthWrite: true, transparent: true, alphaTest: cut ? 0.5 : 0, side: src.side });
      const c = new THREE.MeshLambertMaterial({
        map, color: new THREE.Color(o.tint ?? "#eef3ff"), emissive: new THREE.Color(o.glow ?? "#aebfe0"), emissiveMap: map, emissiveIntensity: o.glowI ?? 0.45,
        vertexColors: !!src.vertexColors, transparent: true, opacity: 1, depthWrite: false, depthFunc: THREE.LessEqualDepth,
        alphaTest: cut ? 0.5 : 0, side: src.side,
      });
      depth.push(d); mats.push({ m: c, base: 1 });
      return { d, c };
    };
    const pairs = list.map(conv);
    const pre = new THREE.Mesh(mesh.geometry, Array.isArray(mesh.material) ? pairs.map((p) => p.d) : pairs[0].d);
    pre.renderOrder = order; pre.castShadow = false; pre.receiveShadow = false;
    mesh.material = Array.isArray(mesh.material) ? pairs.map((p) => p.c) : pairs[0].c;
    mesh.renderOrder = order + 1; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.add(pre);
  }
  return {
    obj: root,
    set: (op: number) => {
      root.visible = op > 0.003;
      for (const { m, base } of mats) m.opacity = Math.max(0, Math.min(1, op * base));
    },
  };
};
