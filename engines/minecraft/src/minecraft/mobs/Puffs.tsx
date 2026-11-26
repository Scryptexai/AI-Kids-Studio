// Square particles like the game's: flat squares that always face the camera (screen-aligned, no roll), one grey
// level each, shrinking away instead of fading (so they are opaque: no sorting). One instanced draw per mob.
import React, { useMemo } from "react";
import * as THREE from "three";
import type { Puff } from "./life";

const CAP = 160;
const GEO = new THREE.PlaneGeometry(1, 1);

const puffMaterial = () => {
  const m = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: true });
  // billboard: the instance's centre into view space, then the quad's corners added in view x / y
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", `
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float puffSize = length(instanceMatrix[0].xyz);
      mvPosition.xy += position.xy * puffSize;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => "mob-puff-billboard";
  return m;
};

/** `puffs` in the group's space (Mob.tsx puts the group at the mob's feet, turned with its yaw) */
export const Puffs: React.FC<{ puffs: Puff[] }> = ({ puffs }) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(GEO, puffMaterial(), CAP);
    m.frustumCulled = false;
    m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = 15;
    m.setColorAt(0, new THREE.Color("#ffffff"));
    return m;
  }, []);
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const n = Math.min(CAP, puffs.length);
  for (let i = 0; i < n; i++) {
    const p = puffs[i];
    mx.compose(v.set(...p.p), q, s.setScalar(Math.max(1e-4, p.s)));
    mesh.setMatrixAt(i, mx);
    mesh.setColorAt(i, p.c ? col.setRGB(p.c[0], p.c[1], p.c[2]) : col.setRGB(p.g, p.g, p.g));
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return n ? <primitive object={mesh} /> : null;
};
