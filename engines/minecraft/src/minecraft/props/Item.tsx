// Items as the game draws them in the world: the 16x16 sprite extruded one pixel thick, each opaque pixel's open
// edges closed with a side quad in that pixel's colour. Size in pixel units (16 = one block); the grip is at y = 0.
import * as THREE from "three";

export const itemGeometry = (img: HTMLImageElement | ImageBitmap): THREE.BufferGeometry => {
  const w = img.width, h = img.height;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127;
  // pixel units scaled to a 16-px-wide item, x centred, y up from the bottom edge, 1 px thick (z -0.5..0.5)
  const s = 16 / w, X = (px: number) => (px - w / 2) * s, Y = (py: number) => (h - py) * s, T = 0.5;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  const quad = (p: number[][], n: number[], uvs: number[][]) => {
    // wind it so the face points along n
    const e1 = p[1].map((v, i) => v - p[0][i]), e2 = p[2].map((v, i) => v - p[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const order = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) { pos.push(...p[i]); nrm.push(...n); uv.push(...uvs[i]); }
  };
  const full = [[0, 1], [1, 1], [1, 0], [0, 0]];
  quad([[X(0), Y(0), T], [X(w), Y(0), T], [X(w), Y(h), T], [X(0), Y(h), T]], [0, 0, 1], full);
  quad([[X(w), Y(0), -T], [X(0), Y(0), -T], [X(0), Y(h), -T], [X(w), Y(h), -T]], [0, 0, -1], [[1, 1], [0, 1], [0, 0], [1, 0]]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    const c = [(x + 0.5) / w, 1 - (y + 0.5) / h], cu = [c, c, c, c];
    const x0 = X(x), x1 = X(x + 1), y0 = Y(y), y1 = Y(y + 1);
    if (!solid(x, y - 1)) quad([[x0, y0, T], [x1, y0, T], [x1, y0, -T], [x0, y0, -T]], [0, 1, 0], cu);
    if (!solid(x, y + 1)) quad([[x0, y1, -T], [x1, y1, -T], [x1, y1, T], [x0, y1, T]], [0, -1, 0], cu);
    if (!solid(x - 1, y)) quad([[x0, y1, -T], [x0, y1, T], [x0, y0, T], [x0, y0, -T]], [-1, 0, 0], cu);
    if (!solid(x + 1, y)) quad([[x1, y1, T], [x1, y1, -T], [x1, y0, -T], [x1, y0, T]], [1, 0, 0], cu);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
};

/** the item as a group whose origin is `grip` (item pixel units: x from the centre, y up from the bottom), size in
 *  the parent's units per 16 px (1 = one block in the world; 16 inside a mob part, which is in pixels) */
export const itemMesh = (tex: THREE.Texture, sizeBlocks: number, grip: [number, number] = [0, 0]): THREE.Group => {
  const geo = itemGeometry(tex.image as HTMLImageElement).translate(-grip[0], -grip[1], 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  mesh.scale.setScalar(sizeBlocks / 16);
  const g = new THREE.Group();
  g.add(mesh);
  return g;
};
