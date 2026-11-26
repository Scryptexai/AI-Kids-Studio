// itw-02 (actors): a small block cube for a hand (a place act's cobblestone, a crowd member carrying a block). Its
// origin is the bottom centre, sized like a held block (0.3 of a block, in mob pixel units), textured `block/<name>`
// when the set staged that texture, else a plain grey.
import * as THREE from "three";
import type { LoadedWorld } from "../VoxelWorld";

export const handCube = (name: string, lw: LoadedWorld): THREE.Object3D => {
  const key = name.startsWith("block/") ? name : `block/${name}`;
  const tex = lw.textures[key];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(tex ? { map: tex } : { color: "#8a8a8a" }));
  mesh.position.y = 0.5; mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh); g.scale.setScalar(16 * 0.3);
  const w = new THREE.Group(); w.add(g);
  return w;
};
