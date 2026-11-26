// The world beyond the set: without it every set ends in a hard edge of dirt and an empty sky. Around the set's
// ground a ring of plain voxel land runs out to `radius` blocks: the set's own grass/dirt (and its roads, carried
// straight on out of the set), low hills that start a few blocks past the edge, mountains far out (only on the
// valley's sides when `valley` is set), forest patches and big landmark boxes (a dam closing the valley). Detail
// drops with distance like the game's far chunks: 1-block cells near, 2-block, then 4-block cells far, where the
// fog takes them anyway. Plus Minecraft clouds and a gradient sky dome whose horizon is the fog colour, so far land
// melts into the sky instead of stopping. Built once per set (pure function of world + spec), nothing per frame.
// Spec: public/<set dir>/backdrop.json (optional). Default: on for the day / sunset / night presets.
import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { blockGeometry } from "./geometry";
import { makeMaterial, type LoadedWorld } from "./VoxelWorld";
import { buildBackdrop, fbm, specFor, type BackdropSpec } from "./backdropLand";

export type { BackdropSpec };
/** the backdrop's spec for this world (null = none) */
export const backdropSpec = (lw: LoadedWorld) => specFor(lw.world, lw.backdrop);

export const Backdrop: React.FC<{ lw: LoadedWorld; /** N4: storm clouds go dark grey; a lightning glow lights them */ storm?: number; glow?: number }> = ({ lw, storm = 0, glow = 0 }) => {
  const built = useMemo(() => { const s = backdropSpec(lw); return s ? buildBackdrop(lw.world, s) : null; }, [lw]);
  const meshes = useMemo(() => {
    if (!built) return [];
    const out: THREE.Object3D[] = [];
    for (const [b, cells] of built.inst) {
      const { geometry, keys } = blockGeometry(b);
      const mats = keys.map((k) => makeMaterial(b, k, lw.textures[k.tex]));
      const mesh = new THREE.InstancedMesh(geometry, mats, cells.size);
      const m = new THREE.Matrix4();
      let i = 0;
      for (const [x, y, z, s] of cells.values()) mesh.setMatrixAt(i++, m.makeScale(s, s, s).setPosition(x, y, z));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false; mesh.receiveShadow = true;
      out.push(mesh);
    }
    if (built.sea && built.sea.quads.length) out.push(seaMesh(built.sea, lw));
    if (built.clouds) for (const layer of built.cloudLayers) {
      // the game's clouds: flat 12x4x12 slabs in a noise pattern, drifting nowhere (still frames read better)
      const [x0, x1, z0, z1] = built.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = built.R + 120, C = 12;
      const cells: [number, number][] = [];
      for (let x = -span; x <= span; x += C) for (let z = -span; z <= span; z += C) if (fbm((cx + x) / 60 + 9, (cz + z) / 60 + 9, layer.seed) > layer.t) cells.push([cx + x, cz + z]);
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(C, 4, C), new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.55, transparent: true, opacity: 0.85, depthWrite: false }), cells.length);
      mesh.userData.cloud = true;
      const m = new THREE.Matrix4();
      cells.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, layer.y, z)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    const spec = backdropSpec(lw);
    if (spec?.mode === "void") out.push(voidDome(spec.voidColors ?? ["#6f95d6", "#1c2747"]));
    if (spec?.sun) out.push(...sunDisk(typeof spec.sun === "object" ? spec.sun : {}));
    return out;
  }, [built, lw.textures]);
  for (const o of meshes) if (o.userData.cloud) {
    const m = (o as THREE.InstancedMesh).material as THREE.MeshLambertMaterial;
    m.color.set("#ffffff").lerp(new THREE.Color("#5c626b"), storm);
    m.emissive.set("#ffffff").lerp(new THREE.Color("#4a5059"), storm).lerp(new THREE.Color("#dde6ff"), glow * storm);
    m.opacity = 0.85 + 0.13 * storm;
  }
  return <>{meshes.map((o, i) => <primitive key={i} object={o} />)}</>;
};

/** R12: the sea to the horizon, one merged mesh of flat up-facing quads at the still-water surface height, drawn with
 *  the set's own water material (still texture, tint, translucent) so it meets the set's water without a seam */
const seaMesh = (sea: { y: number; quads: [number, number, number][]; block: import("./types").CBlock }, lw: LoadedWorld) => {
  const n = sea.quads.length, pos = new Float32Array(n * 18), nrm = new Float32Array(n * 18), uv = new Float32Array(n * 12), col = new Float32Array(n * 18);
  const tc = new THREE.Color(sea.block.tint ?? "#ffffff"), y = sea.y;
  sea.quads.forEach(([x, z, s], q) => {
    // a (x, z+s), b (x+s, z+s), c (x+s, z), d (x, z): triangles a b c, a c d (counter-clockwise seen from above)
    const P = [[x, z + s], [x + s, z + s], [x + s, z], [x, z + s], [x + s, z], [x, z]];
    const U = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 6; i++) {
      pos.set([P[i][0], y, P[i][1]], q * 18 + i * 3); nrm.set([0, 1, 0], q * 18 + i * 3);
      uv.set(U[i], q * 12 + i * 2); col.set([tc.r, tc.g, tc.b], q * 18 + i * 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const key = "block/water_still";
  const mesh = new THREE.Mesh(g, makeMaterial(sea.block, { tex: key, overlay: false }, lw.textures[key]));
  mesh.receiveShadow = true; mesh.renderOrder = 1;
  return mesh;
};

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const DAY_HOR = lum(new THREE.Color("#bcd6ff"));

/** "void" mode dome: drawn right over the SkyDome. Above the horizon it is the SkyDome's own gradient; below it the
 *  haze falls off into the void colours (dimmed with the horizon, so a G3 night darkens the void too). The sky and
 *  horizon colours are read from the scene each frame (Lights sets them), so cycle / storm looks carry over. */
const voidDome = ([top, bot]: [string, string]) => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, vTop: { value: new THREE.Color(top) }, vBot: { value: new THREE.Color(bot) }, dim: { value: 1 } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }",
    fragmentShader: "uniform vec3 zen; uniform vec3 hor; uniform vec3 vTop; uniform vec3 vBot; uniform float dim; varying vec3 vDir; void main(){ float y = normalize(vDir).y; vec3 c; if (y >= 0.0) { float k = smoothstep(0.0, 0.42, y); c = mix(hor, zen, pow(k, 0.8)); } else { vec3 a = mix(hor, vTop * dim, smoothstep(0.0, 0.35, -y)); c = mix(a, vBot * dim, smoothstep(0.3, 1.0, -y)); } gl_FragColor = vec4(c, 1.0); \n#include <colorspace_fragment>\n }",
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
  m.renderOrder = -9; m.frustumCulled = false;
  m.onBeforeRender = (_r, scene) => {
    const u = mat.uniforms;
    if (scene.background instanceof THREE.Color) u.zen.value.copy(scene.background);
    if (scene.fog) u.hor.value.copy(scene.fog.color);
    u.dim.value = Math.min(1, lum(u.hor.value) / DAY_HOR);
  };
  return m;
};

const findSun = (scene: THREE.Object3D): THREE.DirectionalLight | null => {
  let found: THREE.DirectionalLight | null = null;
  scene.traverse((ob) => { if (!found && (ob as THREE.DirectionalLight).isDirectionalLight) found = ob as THREE.DirectionalLight; });
  return found;
};

/** a square Minecraft sun with a soft glow, 300 blocks out along the scene's sun light (mirrored to +z by default),
 *  fading out when the sky goes dark */
const sunDisk = (o: { mirror?: boolean; size?: number; arc?: [number, number] }) => {
  const D = 300, mirror = o.mirror !== false, [aA, aE] = o.arc ?? [1, 1], s = 2 * D * Math.tan(((o.size ?? 7) * Math.PI) / 360);
  const N = 64, data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const d = Math.hypot(i - N / 2 + 0.5, j - N / 2 + 0.5) / (N / 2), a = Math.max(0, 1 - d) ** 2.2;
    data.set([255, 255, 255, Math.round(255 * a)], (i * N + j) * 4);
  }
  const glowTex = new THREE.DataTexture(data, N, N); glowTex.needsUpdate = true;
  const core = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: "#fffbe6", fog: false, depthWrite: false, transparent: true }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(s * 3.4, s * 3.4), new THREE.MeshBasicMaterial({ map: glowTex, color: "#fff0b0", fog: false, depthWrite: false, transparent: true, opacity: 0.55 }));
  let light: THREE.DirectionalLight | null = null;
  const dir = new THREE.Vector3();
  for (const [mesh, k] of [[glow, 0.55], [core, 1]] as const) {
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    mesh.onBeforeRender = (_r, scene, camera) => {
      if (!light || !light.parent) light = findSun(scene);
      const L = light;
      const bg = scene.background instanceof THREE.Color ? lum(scene.background) : 0;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = L ? k * Math.max(0, Math.min(1, (bg - 0.2) / 0.25)) : 0;
      if (!L) return;
      dir.copy(L.position).sub(L.target.position).normalize();
      if (mirror) dir.z = Math.abs(dir.z);
      if (aA !== 1 || aE !== 1) { // squeeze the path into a vertical frame: azimuth about +z and elevation scaled
        const az = Math.atan2(dir.x, dir.z) * aA, el = Math.asin(Math.max(-1, Math.min(1, dir.y))) * aE;
        dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      }
      mesh.position.copy(camera.position).addScaledVector(dir, D);
      mesh.lookAt(camera.position);
      mesh.updateMatrixWorld();
    };
  }
  return [glow, core];
};

/** a sky dome that follows the camera: zenith = the sky colour, the horizon (and below) = the fog colour, so fogged
 *  land meets the sky without a seam. Drawn first, never writes depth (stars, moon, clouds draw over it). */
export const SkyDome: React.FC<{ sky: string; fog: string }> = ({ sky, fog }) => {
  const mesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { zen: { value: new THREE.Color(sky) }, hor: { value: new THREE.Color(fog) } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }",
      fragmentShader: "uniform vec3 zen; uniform vec3 hor; varying vec3 vDir; void main(){ float y = normalize(vDir).y; float k = smoothstep(0.0, 0.42, y); gl_FragColor = vec4(mix(hor, zen, pow(k, 0.8)), 1.0); \n#include <colorspace_fragment>\n }",
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    m.renderOrder = -10; m.frustumCulled = false;
    return m;
  }, []);
  useLayoutEffect(() => {
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    u.zen.value.set(sky); u.hor.value.set(fog);
  });
  return <primitive object={mesh} />;
};
