// mc-raid R6: the Glowing effect's outline (the game's spectral-arrow / glowing look): a white ring round the mob's
// silhouette, seen through walls, the body itself left as it is (not filled). The canvas has no stencil buffer, so
// the ring is cut with the colour buffer's alpha instead, by three passes of proxy meshes (children of each skin /
// item mesh: same geometry, same skeleton, same texture alpha cut, depth test off):
//   1000  8 copies shifted ~px pixels round the silhouette: alpha := 1 - k          (colour untouched)
//   1001  the silhouette itself:                          alpha := 1               (colour untouched)
//   1002  the 8 shifted copies again: colour := white * (1 - dstAlpha) + dst * dstAlpha, alpha := 1, depth written
// so only the ring (shifted, not under the silhouette) turns white by k. Idempotent where rings overlap, so several
// glowing mobs union cleanly (passes go by renderOrder across the whole scene). Proxies are made the first frame a
// mob glows (held items and the banner included) and hidden when it stops.
import * as THREE from "three";

const W = 1080, H = 1920;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
type GlowState = { k: { value: number }; px: number; offs: { value: THREE.Vector2 }[]; proxies: THREE.Mesh[] };

const proxyMaterial = (src: THREE.MeshLambertMaterial, pass: 0 | 1 | 2, off: { value: THREE.Vector2 }, k: { value: number }) => {
  const m = new THREE.MeshBasicMaterial({
    map: src.map, alphaTest: Math.max(0.1, src.alphaTest), side: THREE.DoubleSide, transparent: true,
    depthTest: false, depthWrite: pass === 2, fog: false, toneMapped: false, blending: THREE.CustomBlending,
  });
  m.blendEquation = THREE.AddEquation; m.blendEquationAlpha = THREE.AddEquation;
  if (pass === 2) { m.blendSrc = THREE.OneMinusDstAlphaFactor; m.blendDst = THREE.DstAlphaFactor; }
  else { m.blendSrc = THREE.ZeroFactor; m.blendDst = THREE.OneFactor; }
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.ZeroFactor;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOff = off; sh.uniforms.uK = k;
    sh.uniforms.uPass = { value: pass };
    sh.vertexShader = "uniform vec2 uOff;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  gl_Position.xy += uOff * gl_Position.w;");
    sh.fragmentShader = "uniform float uK;\nuniform float uPass;\n" + sh.fragmentShader.replace("#include <dithering_fragment>",
      "#include <dithering_fragment>\n  gl_FragColor = uPass < 0.5 ? vec4(0.0, 0.0, 0.0, 1.0 - uK) : uPass < 1.5 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(1.0, 1.0, 1.0, 1.0);");
  };
  m.customProgramCacheKey = () => "glow-outline-proxy";
  return m;
};

const eligible = (o: THREE.Object3D): o is THREE.Mesh => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.glowProxy || m.userData.noOutline) return false;
  const mat = m.material as THREE.MeshLambertMaterial;
  return !Array.isArray(mat) && !!(mat as THREE.MeshLambertMaterial).isMeshLambertMaterial && !!mat.map;
};

/** set a mob's glow outline for this frame: k 0..1 (0 = none), ring width in pixels at 1080x1920 */
export const glowOutline = (root: THREE.Object3D, k: number, px = 4) => {
  let st = root.userData.glow as GlowState | undefined;
  if (k <= 0.001) { if (st) for (const p of st.proxies) p.visible = false; return; }
  if (!st) {
    st = { k: { value: 0 }, px: -1, offs: DIRS.map(() => ({ value: new THREE.Vector2() })), proxies: [] };
    root.userData.glow = st;
  }
  if (st.px !== px) { DIRS.forEach(([x, y], i) => st!.offs[i].value.set((x * px * 2) / W, (y * px * 2) / H)); st.px = px; }
  st.k.value = Math.min(1, k);
  const zero = { value: new THREE.Vector2() };
  const fresh: THREE.Mesh[] = [];
  root.traverse((o) => { if (eligible(o) && !o.userData.glowDone) fresh.push(o); });
  for (const src of fresh) {
    src.userData.glowDone = true;
    const mat = src.material as THREE.MeshLambertMaterial;
    const add = (pass: 0 | 1 | 2, off: { value: THREE.Vector2 }) => {
      const pm = proxyMaterial(mat, pass, off, st!.k);
      let p: THREE.Mesh;
      if ((src as THREE.SkinnedMesh).isSkinnedMesh) {
        const sp = new THREE.SkinnedMesh(src.geometry, pm);
        sp.bind((src as THREE.SkinnedMesh).skeleton, new THREE.Matrix4());
        p = sp;
      } else p = new THREE.Mesh(src.geometry, pm);
      p.userData.glowProxy = true;
      p.renderOrder = 1000 + pass;
      p.frustumCulled = false; p.castShadow = false; p.receiveShadow = false;
      src.add(p);
      st!.proxies.push(p);
    };
    for (const off of st.offs) add(0, off);
    add(1, zero);
    for (const off of st.offs) add(2, off);
  }
  for (const p of st.proxies) p.visible = true;
};
