// A model cube's six quads with the game's box UVs (ModelPart.Cube + Polygon). Pure (three only), so the director's
// tests can check it in Node.
import * as THREE from "three";
import type { Cube } from "./models.ts";

/** one cube in pixel units, model space (y down); UVs as ModelPart.Cube + Polygon assign them */
export const cubeQuads = (cu: Cube, texW: number, texH: number) => {
  const g = cu.g ?? 0;
  let [x0, y0, z0] = cu.o, [x1, y1, z1] = [cu.o[0] + cu.s[0], cu.o[1] + cu.s[1], cu.o[2] + cu.s[2]];
  x0 -= g; y0 -= g; z0 -= g; x1 += g; y1 += g; z1 += g;
  if (cu.mirror) [x0, x1] = [x1, x0];
  const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const [u, v] = cu.uv, [w, h, d] = cu.s;
  const polys: [number[], number, number, number, number][] = [
    [[5, 1, 2, 6], u + d + w, v + d, u + d + w + d, v + d + h],
    [[0, 4, 7, 3], u, v + d, u + d, v + d + h],
    [[5, 4, 0, 1], u + d, v, u + d + w, v + d],
    [[2, 3, 7, 6], u + d + w, v + d, u + d + w + w, v],
    [[1, 0, 3, 2], u + d, v + d, u + d + w, v + d + h],
    [[4, 5, 6, 7], u + d + w + d, v + d, u + d + w + d + w, v + d + h],
  ];
  const centre = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const out: { p: THREE.Vector3[]; uv: [number, number][]; n: THREE.Vector3 }[] = [];
  for (const [vi, u1, v1, u2, v2] of polys) {
    const p = vi.map((i) => new THREE.Vector3(...(V[i] as [number, number, number])));
    const uv: [number, number][] = [[u2, v1], [u1, v1], [u1, v2], [u2, v2]].map(([a, b]) => [a / texW, 1 - b / texH]);
    const mid = p.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(0.25);
    let n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
    // outward winding whatever the mirror did
    if (n.dot(mid.clone().sub(centre)) < 0) { p.reverse(); uv.reverse(); n = n.negate(); }
    out.push({ p, uv, n });
  }
  return out;
};

export type Quad = ReturnType<typeof cubeQuads>[number];

/** cut every quad that crosses the plane y = ys in two (UVs interpolated along the edge), so a limb can bend there
 *  (elbow / knee). Side faces of a box are two (x, z) columns along y: each vertex's partner shares its x and z. */
export const splitQuads = (quads: Quad[], ys: number): Quad[] => {
  const out: Quad[] = [];
  const eps = 1e-6;
  for (const q of quads) {
    const yy = q.p.map((p) => p.y), lo = Math.min(...yy), hi = Math.max(...yy);
    if (!(lo < ys - eps && hi > ys + eps)) { out.push(q); continue; }
    const partner = (i: number) => q.p.findIndex((p, j) => j !== i && Math.abs(p.x - q.p[i].x) < eps && Math.abs(p.z - q.p[i].z) < eps);
    for (const keepLow of [true, false]) {
      const p = q.p.map((v) => v.clone()), uv = q.uv.map((u) => [u[0], u[1]] as [number, number]);
      for (let i = 0; i < 4; i++) {
        const v = q.p[i];
        if (keepLow ? v.y <= ys : v.y >= ys) continue;
        const j = partner(i), w = q.p[j], k = (ys - w.y) / (v.y - w.y);
        p[i].y = ys;
        uv[i] = [q.uv[j][0] + (q.uv[i][0] - q.uv[j][0]) * k, q.uv[j][1] + (q.uv[i][1] - q.uv[j][1]) * k];
      }
      out.push({ p, uv, n: q.n.clone() });
    }
  }
  return out;
};
