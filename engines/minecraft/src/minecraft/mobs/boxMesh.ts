// Box-model mesh pieces shared by the mobs (Mob.tsx) and the box-model props they carry (banner, shield): the game's
// box UVs from models.ts cubes, the skin material and its shadow depth material.
import * as THREE from "three";
import type { Cube } from "./models";
import { cubeQuads, splitQuads } from "./cube";

/** a part's mesh data; with `bend` the quads are cut at that y and every vertex is skinned to one of three bones:
 *  0 above the joint (still), 1 on the joint ring (turns half the bend: a mitred joint, no gap, no pinch),
 *  2 below it (turns the full bend) */
export const geometryOf = (cubes: Cube[], texW: number, texH: number, bend?: number) => {
  const pos: number[] = [], nrm: number[] = [], uvs: number[] = [], si: number[] = [], sw: number[] = [];
  for (const cu of cubes) {
    let quads = cubeQuads(cu, texW, texH);
    if (bend !== undefined) quads = splitQuads(quads, bend);
    for (const q of quads) for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(q.p[i].x, q.p[i].y, q.p[i].z); nrm.push(q.n.x, q.n.y, q.n.z); uvs.push(q.uv[i][0], q.uv[i][1]);
      if (bend !== undefined) { const y = q.p[i].y; si.push(Math.abs(y - bend) < 1e-4 ? 1 : y > bend ? 2 : 0, 0, 0, 0); sw.push(1, 0, 0, 0); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (bend !== undefined) {
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  }
  return geo;
};

export const skinMaterial = (tex: THREE.Texture, tint?: string) =>
  new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide, color: tint ?? "#ffffff" });
export const depthMaterial = (tex: THREE.Texture) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.1 });

/** a plain (unskinned) box-model mesh in pixel units, y down like models.ts */
export const boxMesh = (cubes: Cube[], tex: THREE.Texture, texW: number, texH: number): THREE.Mesh => {
  const m = new THREE.Mesh(geometryOf(cubes, texW, texH), skinMaterial(tex));
  m.castShadow = true; m.receiveShadow = true;
  m.customDepthMaterial = depthMaterial(tex);
  return m;
};
