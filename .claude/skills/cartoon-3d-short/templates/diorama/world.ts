// Gate courtyard for the Stage-3 look test against the reference "cart" short. PBR world (no ink lines): bevelled
// instanced stone blocks over a dark mortar core, a gate arch with a warm far end and a light shaft, a red-pillared
// pavilion on the gatehouse, banners with our own crane emblem, a plank shed, a fence, a perforated board on a stand,
// instanced wind-blown grass, an HDR-lit sky. Lit by a sun with soft shadows + the HDR as image-based light.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { staticFile } from "remotion";
import { rng, fbm, vnoise, stoneTex, stoneBump, woodTex, groundTex, boardTex, bannerTex } from "./tex";

// ---------------- layout (metres; camera side = +z) ----------------
export const GATE = { x0: -2, x1: 7, zf: -9, zb: -14, h: 8.4 };          // gatehouse tower
export const ARCH = { cx: 3.0, r: 1.6, spring: 2.6, ring: 0.55 };          // gate opening (semicircular head)
export const WALL = { z: -11, h: 6.16, t: 3 };                             // curtain wall face, height, thickness
export const COURSE = 0.56;                                               // stone course height
const GAP = 0.028, PROT = 0.06, DEPTH = 0.42;                            // joint width, block protrusion, block depth

export type Kit = { sky: THREE.Texture; env: THREE.DataTexture };
export const loadKit = async (): Promise<Kit> => {
  const [sky, env] = await Promise.all([
    new THREE.TextureLoader().loadAsync(staticFile("court/sky8k.jpg")),
    new RGBELoader().loadAsync(staticFile("court/src/kloofendal_48d_partly_cloudy_puresky_2k.hdr")),
  ]);
  sky.colorSpace = THREE.SRGBColorSpace; sky.anisotropy = 8;
  env.mapping = THREE.EquirectangularReflectionMapping;
  return { sky, env };
};

// ---------------- stone blocks ----------------
type Block = { m: THREE.Matrix4; c: THREE.Color };
type Hole = (y0: number, y1: number) => [number, number] | null;            // blocked s-interval for a course
/** One masonry face from A to B (xz), outward normal n = (-dz, dx), courses from y0 to y1. Corner modes: "cover"
 *  = this face's blocks run PROT past the corner (alternate courses), "yield" = stop short so the other face covers. */
const face = (out: Block[], A: [number, number], B: [number, number], y0: number, y1: number, seed: number,
  ends: { a?: "il" | "il2" | "stop"; b?: "il" | "il2" | "stop" } = {}, hole?: Hole, tone = 1) => {
  const r = rng(seed), dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
  const yaw = Math.atan2(-uz, ux), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const courses = Math.floor((y1 - y0) / COURSE + 1e-6);
  const yield_ = DEPTH - PROT + GAP;
  for (let c = 0; c < courses; c++) {
    const cy0 = y0 + c * COURSE, cy1 = cy0 + COURSE, even = c % 2 === 0;
    // "il" covers the corner on even courses, "il2" on odd ones: pair them across a corner
    const endOff = (mode: string | undefined) => mode === "il" ? (even ? PROT : -yield_) : mode === "il2" ? (even ? -yield_ : PROT) : 0;
    const s0 = -endOff(ends.a), s1 = len + endOff(ends.b);
    const ivs: [number, number][] = [];
    const h = hole?.(cy0, cy1);
    if (h) { if (h[0] > s0) ivs.push([s0, Math.min(s1, h[0])]); if (h[1] < s1) ivs.push([Math.max(s0, h[1]), s1]); }
    else ivs.push([s0, s1]);
    for (const [a, b] of ivs) {
      let s = a + (even ? 0 : -r() * 0.5);
      s = Math.max(a, s);
      while (s < b - 0.05) {
        let L = COURSE * (1.55 + r() * 1.25);
        if (b - (s + L) < COURSE * 0.9) L = b - s;                               // no slivers at the end
        const bl = L - GAP, bh = COURSE - GAP, bd = DEPTH + r() * 0.02, prot = PROT + (r() - 0.5) * 0.025;
        const cs = s + L / 2, cyy = (cy0 + cy1) / 2, off = prot - bd / 2;
        const p = new THREE.Vector3(A[0] + ux * cs + nx * off, cyy, A[1] + uz * cs + nz * off);
        const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(bl, bh, bd));
        const v = tone * (0.86 + r() * 0.2), w = (r() - 0.5) * 0.05;
        out.push({ m, c: new THREE.Color(0.76 * v * (1 + w), 0.74 * v, 0.69 * v * (1 - w)) });
        s += L;
      }
    }
  }
};

/** blocked s-interval of an arch (outer radius R, spring height hs, centre s=cs) for a course [y0, y1] */
const archHole = (cs: number, R: number, hs: number, pad = 0.0): Hole => (y0) => {
  if (y0 >= hs + R) return null;
  // below the spring the jambs alternate long (+0.3, even courses) and short
  const long = y0 < hs - 0.01 && Math.round(y0 / COURSE) % 2 === 0 ? 0.3 : 0;
  const hw = y0 <= hs ? R + long : Math.sqrt(Math.max(0, R * R - (y0 - hs) * (y0 - hs)));
  return hw < 0.05 ? null : [cs - hw - pad, cs + hw + pad];
};

// ---------------- world ----------------
export class World {
  root = new THREE.Group();
  sun: THREE.DirectionalLight;
  /** diorama: warm bounce from the front (no shadow), on only in the backlit preset so shade-side stone stays warm */
  fill: THREE.DirectionalLight;
  grassMat: THREE.MeshStandardMaterial;
  grassUni = { uTime: { value: 0 }, uWind: { value: 0.12 } };
  skyMesh: THREE.Mesh;
  shaftMat: THREE.ShaderMaterial;
  board: THREE.Group;
  shed: THREE.Group;
  fences = new THREE.Group();
  /** mid-ground clutter at the wall foot (barrels, crates, ladder): shown in the two-shot only */
  extras = new THREE.Group();
  veilMat!: THREE.ShaderMaterial;

  constructor(kit: Kit, gl: THREE.WebGLRenderer, scene: THREE.Scene) {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromEquirectangular(kit.env).texture;
    scene.environmentIntensity = 1.55;
    scene.environmentRotation.set(0, 1.2, 0);
    pm.dispose();

    // ---- sun (behind-left, high) ----
    this.sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.68), 3.5) /* diorama: warm late sun */;
    this.sun.position.set(-14, 20, -12);
    this.sun.target.position.set(1, 0, -2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.root.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(new THREE.Color(1.0, 0.78, 0.55), 0);
    this.fill.position.set(2, 3, 14); this.fill.target.position.set(0, 1, -9);
    this.root.add(this.fill, this.fill.target);

    // ---- materials ----
    const sTex = stoneTex(), sBump = stoneBump();
    const stoneMat = new THREE.MeshStandardMaterial({ map: sTex, bumpMap: sBump, bumpScale: 1.6, roughness: 0.88, metalness: 0 });
    // per-instance texture offset so no two blocks show the same patch
    stoneMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
#ifdef USE_INSTANCING
  vec2 io = fract( instanceMatrix[3].xz * 0.371 + instanceMatrix[3].y * 0.713 );
  vec2 isz = vec2( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ) ) * 0.42;
  vMapUv = vMapUv * isz + io; vBumpMapUv = vBumpMapUv * isz + io;
#endif`);
    };
    const mortar = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.19, 0.175), roughness: 1 });

    // ---- masonry ----
    const blocks: Block[] = [];
    const G = GATE, A = ARCH, Ro = A.r + A.ring;
    const archS = A.cx - G.x0;
    // gatehouse: front with the arch, both sides; top course band
    face(blocks, [G.x0, G.zf], [G.x1, G.zf], 0, G.h, 11, { a: "il", b: "il" }, archHole(archS, Ro + 0.02, A.spring));
    face(blocks, [G.x0, G.zb], [G.x0, G.zf], 0, G.h, 12, { b: "il2" });
    face(blocks, [G.x1, G.zf], [G.x1, G.zb], 0, G.h, 13, { a: "il2" });
    // curtain walls left and right of the gatehouse (stop at the tower sides)
    face(blocks, [-30, WALL.z], [G.x0 - PROT - GAP, WALL.z], 0, WALL.h, 21, {}, undefined, 0.97);
    face(blocks, [G.x1 + PROT + GAP, WALL.z], [30, WALL.z], 0, WALL.h, 22, {}, undefined, 0.97);
    // merlons on the curtain wall
    for (const [x0, x1, sd] of [[-30, G.x0 - 0.3, 31], [G.x1 + 0.3, 30, 32]] as const) {
      const rr = rng(sd);
      for (let x = x0 + 0.2; x < x1 - 1.0; x += 2.1) {
        const w = 1.15;
        face(blocks, [x, WALL.z], [x + w, WALL.z], WALL.h, WALL.h + 2 * COURSE, sd + Math.floor(x * 7) + 1000, { a: "il", b: "il" }, undefined, 0.95 + rr() * 0.06);
        face(blocks, [x + w, WALL.z], [x + w, WALL.z - 0.9], WALL.h, WALL.h + 2 * COURSE, sd + Math.floor(x * 7) + 2000, { a: "il2", b: "stop" }, undefined, 0.92);
        face(blocks, [x, WALL.z - 0.9], [x, WALL.z], WALL.h, WALL.h + 2 * COURSE, sd + Math.floor(x * 7) + 3000, { a: "stop", b: "il2" }, undefined, 0.92);
        const core = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 2 * COURSE, 0.8), mortar);
        core.position.set(x + w / 2, WALL.h + COURSE, WALL.z - 0.45); core.castShadow = core.receiveShadow = true; this.root.add(core);
      }
    }
    const blockGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.15); // diorama: soft, moulded-plaster stones
    const inst = new THREE.InstancedMesh(blockGeo, stoneMat, blocks.length);
    blocks.forEach((b, i) => { inst.setMatrixAt(i, b.m); inst.setColorAt(i, b.c); });
    inst.castShadow = inst.receiveShadow = true;
    this.root.add(inst);

    // mortar cores (the joints show this): gatehouse with the arch hole, curtain wall
    const gShape = new THREE.Shape();
    gShape.moveTo(G.x0, 0); gShape.lineTo(G.x1, 0); gShape.lineTo(G.x1, G.h); gShape.lineTo(G.x0, G.h); gShape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(A.cx - A.r, 0); hole.lineTo(A.cx - A.r, A.spring); hole.absarc(A.cx, A.spring, A.r, Math.PI, 0, true); hole.lineTo(A.cx + A.r, 0); hole.closePath();
    gShape.holes.push(hole);
    const gCore = new THREE.Mesh(new THREE.ExtrudeGeometry(gShape, { depth: G.zf - G.zb - 0.02, bevelEnabled: false, curveSegments: 32 }), mortar);
    gCore.position.z = G.zb + 0.01; gCore.castShadow = gCore.receiveShadow = true;
    this.root.add(gCore);
    // curtain wall cores left and right of the gatehouse (never through the tunnel)
    for (const [xa, xb] of [[-30, G.x0 + 0.5], [G.x1 - 0.5, 30]]) {
      const wCore = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, WALL.h, WALL.t), mortar);
      wCore.position.set((xa + xb) / 2, WALL.h / 2, WALL.z - WALL.t / 2 - 0.005); wCore.castShadow = wCore.receiveShadow = true;
      this.root.add(wCore);
    }

    // ---- arch ring (voussoirs + jambs) and tunnel ----
    const ringMat = stoneMat;
    const vous: Block[] = [];
    const nV = 13;
    const vGeo = (a0: number, a1: number) => {
      const s = new THREE.Shape(), r0 = A.r, r1 = Ro;
      s.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); s.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
      s.absarc(0, 0, r1, a0, a1, false); s.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0); s.absarc(0, 0, r0, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -DEPTH + PROT + 0.01);
      return g;
    };
    const vr = rng(5);
    for (let i = 0; i < nV; i++) {
      const gap = 0.012, a0 = (i / nV) * Math.PI + gap, a1 = ((i + 1) / nV) * Math.PI - gap;
      const m = new THREE.Mesh(vGeo(a0, a1), ringMat.clone());
      const t = 0.9 + vr() * 0.15;
      (m.material as THREE.MeshStandardMaterial).color.setRGB(0.74 * t, 0.72 * t, 0.67 * t);
      m.position.set(A.cx, A.spring, G.zf); m.castShadow = m.receiveShadow = true;
      this.root.add(m);
    }
    // jambs: alternating long/short blocks down both sides of the opening
    for (const side of [-1, 1]) {
      for (let c = 0; c * COURSE < A.spring - 0.01; c++) {
        const long = c % 2 === 0, w = long ? A.ring + 0.3 : A.ring;
        const bh = Math.min(COURSE, A.spring - c * COURSE) - GAP;
        const x = A.cx + side * (A.r + w / 2);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, c * COURSE + bh / 2 + GAP / 2, G.zf + PROT - DEPTH / 2),
          new THREE.Quaternion(), new THREE.Vector3(w - GAP, bh, DEPTH));
        vous.push({ m, c: new THREE.Color(0.74, 0.72, 0.67).multiplyScalar(0.92 + vr() * 0.12) });
      }
    }
    // the face blocks next to the jambs must clear the long jambs: the hole already removed Ro; long jambs reach Ro+.3
    // only below the spring, so cut those courses back (rebuild handled by the hole pad on low courses)
    const jamb = new THREE.InstancedMesh(blockGeo, stoneMat, vous.length);
    vous.forEach((b, i) => { jamb.setMatrixAt(i, b.m); jamb.setColorAt(i, b.c); });
    jamb.castShadow = jamb.receiveShadow = true;
    this.root.add(jamb);

    // tunnel lining: barrel vault + side walls (darker stone), floor flagstones handled with the paving
    const tunMat = new THREE.MeshStandardMaterial({ map: sTex, bumpMap: sBump, bumpScale: 1.2, color: new THREE.Color(0.42, 0.4, 0.38), roughness: 0.95, side: THREE.BackSide, shadowSide: THREE.DoubleSide });
    sTex.repeat.set(1, 1);
    const tl = G.zf - G.zb;
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(A.r, A.r, tl, 32, 1, true, -Math.PI / 2, Math.PI), tunMat);
    vault.rotation.x = -Math.PI / 2; vault.position.set(A.cx, A.spring, (G.zf + G.zb) / 2); vault.receiveShadow = vault.castShadow = true;
    this.root.add(vault);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(tl, A.spring), tunMat.clone());
      (w.material as THREE.MeshStandardMaterial).side = THREE.FrontSide;
      w.rotation.y = side * -Math.PI / 2; w.position.set(A.cx + side * A.r, A.spring / 2, (G.zf + G.zb) / 2); w.receiveShadow = w.castShadow = true; (w.material as THREE.MeshStandardMaterial).shadowSide = THREE.DoubleSide;
      this.root.add(w);
    }
    // transverse ribs under the vault (the reference's ribbed tunnel), a plank door swung back against the right wall,
    // the portcullis teeth showing under the front of the arch
    const ribGeo = new THREE.TorusGeometry(A.r - 0.05, 0.075, 8, 28, Math.PI);
    for (let z = G.zf - 0.7; z > G.zb + 0.4; z -= 1.05) {
      const rib = new THREE.Mesh(ribGeo, tunMat.clone());
      (rib.material as THREE.MeshStandardMaterial).side = THREE.FrontSide;
      rib.position.set(A.cx, A.spring, z); rib.castShadow = rib.receiveShadow = true; this.root.add(rib);
    }
    const doorMat = new THREE.MeshStandardMaterial({ map: woodTex([112, 82, 60], 5, 21), roughness: 0.85 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.5, 1.5), doorMat);
    door.position.set(A.cx + A.r - 0.06, 1.25, G.zf - 1.0); door.castShadow = door.receiveShadow = true; this.root.add(door);
    const iron = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.08, 0.08, 0.09), roughness: 0.5, metalness: 0.6 });
    for (const y of [0.45, 1.25, 2.05]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 1.46), iron);
      strap.position.set(A.cx + A.r - 0.105, y, G.zf - 1.0); this.root.add(strap);
    }
    for (let i = -5; i <= 5; i++) {
      const x = A.cx + i * 0.26, top = A.spring + Math.sqrt(Math.max(0, A.r * A.r - (i * 0.26) ** 2));
      const len = 0.32;
      if (top - len < A.spring + 0.2) continue;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.05), iron);
      bar.position.set(x, top - len / 2 + 0.02, G.zf - 0.45); this.root.add(bar);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), iron);
      tip.rotation.x = Math.PI; tip.position.set(x, top - len - 0.03, G.zf - 0.45); this.root.add(tip);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), iron);
    cross.position.set(A.cx, A.spring + A.r - 0.12, G.zf - 0.45); this.root.add(cross);
    // far end: the real sunlit outside shows through (road, ground, sky); a soft additive warm veil hangs in the far
    // opening so it reads as hazy light rather than a hard picture
    const far = new THREE.Shape();
    far.moveTo(-A.r, 0); far.lineTo(-A.r, A.spring); far.absarc(0, A.spring, A.r, Math.PI, 0, true); far.lineTo(A.r, 0); far.closePath();
    this.veilMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uH: { value: A.spring + A.r }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform float uH; uniform float uTime; varying vec2 vP; void main(){ float t = vP.y / uH;
        float k = (1.0 - 0.6 * smoothstep(0.1, 0.9, t)) * (1.0 - 0.5 * smoothstep(0.4, 1.0, abs(vP.x) / ${A.r.toFixed(2)}));
        float d = vP.y * 3.1 - vP.x * 1.4;
        float w = sin(vP.y * 9.0 + sin(vP.x * 3.0 + uTime * 0.6) * 2.2 - uTime * 0.4) * sin(vP.y * 4.1 - vP.x * 2.0 + uTime * 0.25);
        float streak = 0.62 + 0.38 * smoothstep(0.2, 0.95, w);
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * 1.05 * k * streak, 1.0); }`,
    });
    const veil = new THREE.Mesh(new THREE.ShapeGeometry(far, 24), this.veilMat);
    veil.position.set(A.cx, 0, G.zb - 0.3); veil.renderOrder = 4;
    this.root.add(veil);
    // sunlit haze beyond the gate: a warm backdrop some metres out, so the far opening shows bright dusty air over the
    // road instead of bare sky (only ever seen through the tunnel)
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `varying vec2 vU; void main(){
        vec3 low = vec3(1.25, 1.02, 0.74), high = vec3(0.92, 0.95, 1.0);
        gl_FragColor = vec4(mix(low, high, smoothstep(0.05, 0.75, vU.y)) * 1.15, 1.0); }`,
    }));
    haze.position.set(A.cx, 4.5, G.zb - 7.5);
    this.root.add(haze);
    // the road out of the gate: flagstones continue outside (built with the paving below)
    // warm bounce inside the far half of the tunnel so the vault reads (bright far end, dark near end)
    const bounce = new THREE.PointLight(new THREE.Color(1, 0.8, 0.58), 6, 5, 1.8);
    bounce.position.set(A.cx, 1.2, G.zb + 0.7);
    this.root.add(bounce);
    // a warm spot through the tunnel onto the floor at the mouth
    const spot = new THREE.SpotLight(new THREE.Color(1, 0.78, 0.5), 70, 16, 0.42, 0.7, 1.5);
    spot.position.set(A.cx - 0.4, 3.6, G.zb - 0.5); spot.target.position.set(A.cx + 0.2, 0, G.zf + 1.5);
    this.root.add(spot, spot.target);
    // volumetric shaft: an additive frustum from the far opening down to the floor in front of the arch
    this.shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(1.0, 0.76, 0.5) }, uK: { value: 0.95 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uK; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float n1(float x){ float i=floor(x), f=fract(x); return mix(h(vec2(i,1.)), h(vec2(i+1.,1.)), f*f*(3.-2.*f)); }
        void main(){
          float edge = pow(abs(dot(vN, vV)), 2.2);
          float along = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          float streak = 0.2 + 0.8 * n1(vUv.x * 26.0 + uTime * 0.3) * n1(vUv.x * 9.0 - uTime * 0.2 + 3.0);
          gl_FragColor = vec4(uCol * uK * edge * along * streak, 1.0);
        }`,
    });
    const shaftGeo = new THREE.CylinderGeometry(0.5, 0.95, 1, 40, 1, true);
    const shaft = new THREE.Mesh(shaftGeo, this.shaftMat);
    const sa = new THREE.Vector3(A.cx - 0.6, 3.6, G.zb + 1.0), sb = new THREE.Vector3(A.cx + 0.5, 0.1, G.zf + 2.6);
    shaft.position.copy(sa).add(sb).multiplyScalar(0.5);
    shaft.scale.set(1, sa.distanceTo(sb), 1);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sb.clone().sub(sa).normalize());
    shaft.renderOrder = 5;
    this.root.add(shaft);

    // ---- pavilion on the gatehouse ----
    const red = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.05, 0.06), roughness: 0.55 });
    const darkWood = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.07, 0.06, 0.06), roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 0.11, 0.13), roughness: 0.7 });
    const py = G.h + 0.25;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(G.x1 - G.x0 + 0.4, 0.25, G.zf - G.zb + 0.4), mortar);
    slab.position.set((G.x0 + G.x1) / 2, G.h + 0.12, (G.zf + G.zb) / 2); slab.castShadow = slab.receiveShadow = true; this.root.add(slab);
    const back = new THREE.Mesh(new THREE.BoxGeometry(G.x1 - G.x0 - 1.2, 2.6, 0.2), darkWood);
    back.position.set((G.x0 + G.x1) / 2, py + 1.3, G.zf - 2.2); back.castShadow = back.receiveShadow = true; this.root.add(back);
    for (let i = 0; i < 5; i++) {
      const x = G.x0 + 0.6 + i * ((G.x1 - G.x0 - 1.2) / 4);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.8, 16), red);
      p.position.set(x, py + 1.4, G.zf - 0.6); p.castShadow = p.receiveShadow = true; this.root.add(p);
      const p2 = p.clone(); p2.position.z = G.zf - 3.6; this.root.add(p2);
    }
    for (const [y, h] of [[py + 2.75, 0.22], [py + 2.35, 0.1], [py + 0.55, 0.09]] as const) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(G.x1 - G.x0 - 0.8, h, 0.18), red);
      beam.position.set((G.x0 + G.x1) / 2, y, G.zf - 0.6); beam.castShadow = true; this.root.add(beam);
    }
    for (let i = 0; i < 17; i++) { // railing balusters
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), red);
      b.position.set(G.x0 + 0.8 + i * ((G.x1 - G.x0 - 1.6) / 16), py + 0.28, G.zf - 0.6); this.root.add(b);
    }
    // hip roof with flared eaves
    const roofShape = new THREE.Shape();
    const rw = (G.zf - G.zb) / 2 + 1.1;
    roofShape.moveTo(-rw, 0); roofShape.quadraticCurveTo(-rw * 0.55, 0.15, -0.25, 1.9); roofShape.lineTo(0.25, 1.9); roofShape.quadraticCurveTo(rw * 0.55, 0.15, rw, 0); roofShape.lineTo(rw - 0.2, -0.18); roofShape.lineTo(-rw + 0.2, -0.18); roofShape.closePath();
    const roofLen = G.x1 - G.x0 + 1.6;
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: roofLen, bevelEnabled: false, curveSegments: 10 }), roofMat);
    roof.rotation.y = Math.PI / 2; roof.position.set(G.x0 - 0.8, py + 2.86, (G.zf + G.zb) / 2);
    roof.castShadow = roof.receiveShadow = true; this.root.add(roof);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.7, 0.05, 0.04), emissive: new THREE.Color(0.4, 0.05, 0.02), roughness: 0.5 }));
    lantern.scale.y = 1.25; lantern.position.set(A.cx - 1.0, py + 2.2, G.zf - 0.6); this.root.add(lantern);

    // ---- banners (our crane emblem) ----
    const bTex = bannerTex();
    const bannerMat = new THREE.MeshStandardMaterial({ map: bTex, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide });
    const banner = (x: number, y: number, z: number, w = 1.1, h = 2.75) => {
      const g = new THREE.PlaneGeometry(w, h, 8, 20), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), pyy = pos.getY(i), t = (h / 2 - pyy) / h;
        pos.setZ(i, 0.03 * Math.sin(px * 7 + 1) + 0.05 * t * Math.sin(px * 4 + 0.5) + 0.04 * t);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, bannerMat);
      m.position.set(x, y - h / 2, z + PROT + 0.05); m.castShadow = m.receiveShadow = true; this.root.add(m);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w + 0.3, 8), darkWood);
      rod.rotation.z = Math.PI / 2; rod.position.set(x, y + 0.02, z + PROT + 0.08); this.root.add(rod);
    };
    banner(A.cx - 2.9, 7.6, G.zf);
    banner(-5.0, 6.1, WALL.z);
    banner(-11.0, 6.1, WALL.z);
    banner(G.x1 + 3.0, 6.1, WALL.z);

    // ---- ground ----
    const SIZE = 44, CX = 1, CZ = -1;
    const gTex = groundTex(SIZE, 1536, CX, CZ, grassAt);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(CX, 0, CZ); ground.receiveShadow = true;
    this.root.add(ground);
    const outer = new THREE.Mesh(new THREE.RingGeometry(SIZE / 2 * 0.999, 200, 64), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.09, 0.025), roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(CX, -0.002, CZ); outer.receiveShadow = true; this.root.add(outer);

    // paving in front of and through the gate: bevelled flagstones
    const pave: Block[] = [];
    const pr = rng(91);
    for (let z = G.zb - 7.3; z < G.zf + 3.4; z += 0.62) {
      const half = z < G.zb ? 1.3 + (G.zb - z) * 0.08 : z < G.zf ? A.r - 0.02 : 2.3 - Math.max(0, z - G.zf) * 0.12;
      let x = A.cx - half + (pr() - 0.5) * 0.2;
      while (x < A.cx + half - 0.2) {
        const L = Math.min(0.5 + pr() * 0.7, A.cx + half - x);
        const t = 0.8 + pr() * 0.25;
        pave.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x + L / 2, 0.015 + pr() * 0.012, z + 0.3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (pr() - 0.5) * 0.04), new THREE.Vector3(L - 0.04, 0.09, 0.58)),
          c: new THREE.Color(0.5 * t, 0.49 * t, 0.47 * t) });
        x += L;
      }
    }
    const paveMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.2), stoneMat, pave.length);
    pave.forEach((b, i) => { paveMesh.setMatrixAt(i, b.m); paveMesh.setColorAt(i, b.c); });
    paveMesh.receiveShadow = true; paveMesh.castShadow = false;
    this.root.add(paveMesh);

    // ---- grass ----
    this.grassMat = this.makeGrass();

    // ---- shed (left, mid-ground) ----
    const plank = woodTex([150, 112, 78], 6, 4), plankDark = woodTex([108, 80, 58], 8, 7);
    const shedMat = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.85 });
    plank.repeat.set(1, 1.5);
    const shed = new THREE.Group();
    const sw = 3.6, sd = 3.0, sh = 2.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), shedMat);
    box.position.y = sh / 2; box.castShadow = box.receiveShadow = true; shed.add(box);
    const sroof = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.6, 0.12, sd + 0.9), new THREE.MeshStandardMaterial({ map: plankDark, roughness: 0.9 }));
    sroof.position.set(0, sh + 0.35, 0.1); sroof.rotation.x = 0.22; sroof.castShadow = sroof.receiveShadow = true; shed.add(sroof);
    for (const [x, z] of [[-sw / 2, sd / 2], [sw / 2, sd / 2], [-sw / 2, -sd / 2], [sw / 2, -sd / 2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, sh + 0.3, 0.16), new THREE.MeshStandardMaterial({ map: plankDark, roughness: 0.9 }));
      post.position.set(x, (sh + 0.3) / 2, z); post.castShadow = true; shed.add(post);
    }
    shed.position.set(-6.4, 0, -3.8); shed.rotation.y = 0.3;
    this.root.add(shed);
    this.shed = shed;

    // ---- fence (left foreground) ----
    const fenceMat = new THREE.MeshStandardMaterial({ map: woodTex([128, 98, 74], 2, 12), roughness: 0.9 });
    const fr = rng(17);
    const fence = (ax: number, az: number, bx: number, bz: number, n: number) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.05, 0.13), fenceMat);
        post.position.set(x, 0.52, z); post.rotation.set((fr() - 0.5) * 0.05, fr(), (fr() - 0.5) * 0.06); post.castShadow = post.receiveShadow = true; this.fences.add(post);
      }
      const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax);
      for (const y of [0.45, 0.88]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.1, 0.07), fenceMat);
        rail.position.set((ax + bx) / 2, y, (az + bz) / 2 + 0.08); rail.rotation.y = yaw; rail.rotation.z = (fr() - 0.5) * 0.04;
        rail.castShadow = rail.receiveShadow = true; this.fences.add(rail);
      }
    };
    fence(-1.95, 4.8, -1.55, 1.0, 3);
    fence(-1.55, 1.0, -3.6, 0.0, 2);
    this.root.add(this.fences);

    // ---- wall-foot clutter for the two-shot: barrels with iron hoops, a crate stack, a ladder against the gatehouse ----
    const staveMat = new THREE.MeshStandardMaterial({ map: woodTex([132, 92, 58], 10, 3), roughness: 0.8 });
    const hoopMat = new THREE.MeshStandardMaterial({ color: "#3b3631", roughness: 0.5, metalness: 0.6 });
    const crateMat = new THREE.MeshStandardMaterial({ map: woodTex([170, 128, 84], 5, 5), roughness: 0.85 });
    const barrel = (x: number, z: number, s = 1) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 20, 6), staveMat);
      const pos = body.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), b = 1 + 0.13 * (1 - (y / 0.45) ** 2); pos.setX(i, pos.getX(i) * b); pos.setZ(i, pos.getZ(i) * b); }
      body.geometry.computeVertexNormals(); body.position.y = 0.45; g.add(body);
      for (const y of [0.12, 0.33, 0.57, 0.78]) {
        const r = 0.34 * (1 + 0.13 * (1 - ((y - 0.45) / 0.45) ** 2)) + 0.012;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 28), hoopMat); hoop.rotation.x = Math.PI / 2; hoop.position.y = y; g.add(hoop);
      }
      g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
      g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = x * 3.1; this.extras.add(g);
    };
    barrel(5.35, -8.4); barrel(5.95, -7.7, 0.95);
    const crate = (x: number, y: number, z: number, s: number, yaw: number) => {
      const c = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 2, 0.02), crateMat);
      c.position.set(x, y + s / 2, z); c.rotation.y = yaw; c.castShadow = c.receiveShadow = true; this.extras.add(c);
      for (const sx of [-1, 1]) { const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, s * 1.02, s * 1.02), staveMat); slat.position.set(sx * s * 0.47, 0, 0); c.add(slat); }
    };
    crate(6.45, 0, -8.5, 0.7, 0.2); crate(-0.15, 0, -8.55, 0.6, -0.15); crate(6.45, 0.7, -8.52, 0.55, 0.5);
    const ladder = new THREE.Group();
    for (const x of [-0.25, 0.25]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.6, 0.07), staveMat); rail.position.set(x, 1.8, 0); ladder.add(rail); }
    for (let i = 0; i < 10; i++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), staveMat); rung.rotation.z = Math.PI / 2; rung.position.set(0, 0.3 + i * 0.34, 0); ladder.add(rung); }
    ladder.traverse((m) => { m.castShadow = m.receiveShadow = true; });
    ladder.position.set(-1.7, 0, -8.2); ladder.rotation.x = -0.2; this.extras.add(ladder);
    this.extras.visible = false;
    this.root.add(this.extras);

    // ---- perforated board on a stand ----
    this.board = this.makeBoard(new THREE.Vector3(2.15, 0, 1.05), -0.95);
    this.root.add(this.board);

    // ---- sky ----
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uSky: { value: kit.sky }, uExp: { value: 1.05 }, uSat: { value: 1.3 }, uRot: { value: 2.4 } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
      fragmentShader: `uniform sampler2D uSky; uniform float uExp; uniform float uSat; uniform float uRot; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float az = atan(d.z, d.x) + uRot; float u = fract(az / 6.2831853 + 0.5);
          float v = asin(clamp(d.y, 0.0, 1.0)) / 1.5707963; vec3 c = texture2D(uSky, vec2(u, max(v, 0.002))).rgb;
          float l = dot(c, vec3(0.2126,0.7152,0.0722)); c = max(mix(vec3(l), c, uSat), 0.0) * uExp; gl_FragColor = vec4(c * 0.72, 1.0); }`,
    }));
    this.skyMesh.renderOrder = -10; this.skyMesh.frustumCulled = false;
    this.root.add(this.skyMesh);
  }

  makeGrass() {
    // blade: 5 segments, tapered, bent forward; colour dark root -> yellow-green tip
    const SEG = 5, pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
    const cRoot = new THREE.Color("#22400c"), cMid = new THREE.Color("#57a020"), cTip = new THREE.Color("#cde246");
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, w = 0.5 * (1 - Math.pow(t, 1.4)) + 0.02, z = 0.35 * t * t;
      const c = t < 0.5 ? cRoot.clone().lerp(cMid, t / 0.5) : cMid.clone().lerp(cTip, (t - 0.5) / 0.5);
      for (const s of [-1, 1]) { pos.push(s * w, t, z); col.push(c.r, c.g, c.b); nor.push(0, 0.95, 0.3); }
      if (i < SEG) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.grassUni);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uWind;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
  vec3 ip = vec3( instanceMatrix[3] );
  float ph = dot( ip.xz, vec2( 0.55, 0.32 ) ) - uTime * 1.7;
  float sway = ( sin( ph ) * 0.6 + sin( ph * 2.37 + 1.3 ) * 0.25 + 0.35 ) * uWind * position.y * position.y;
  vec3 wl = transpose( mat3( instanceMatrix ) ) * vec3( 0.8, 0.0, 0.6 );
  transformed += normalize( wl ) * sway / max( length( instanceMatrix[1].xyz ), 1e-3 );`);
    };
    // placement: rejection-sample against the grass mask, denser near the cameras
    const r = rng(2024), N = 320000;
    const geoI = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let n = 0, tries = 0;
    while (n < N && tries < N * 12) {
      tries++;
      const x = -12 + r() * 26, z = -10.6 + r() * 19;
      const mk = grassAt(x, z);
      if (mk < 0.5) continue;
      const d = Math.hypot(x - 1.2, z - 4.5);
      if (r() > Math.min(1, Math.max(0.12, 1.25 - d / 10))) continue;
      const tall = 0.75 + 0.5 * fbm(x * 0.35, z * 0.35, 2, 6);
      const near = Math.max(0, 1 - d / 9);                                       // taller, wilder blades near the lens
      const h = (0.26 + r() * 0.36 + near * r() * 0.3) * tall * (0.6 + 0.4 * mk);
      p.set(x, 0, z);
      e.set((r() - 0.5) * (0.6 + near * 0.5), r() * Math.PI * 2, (r() - 0.5) * (0.6 + near * 0.5));
      q.setFromEuler(e);
      const w = 0.022 + r() * 0.02 + near * 0.012;
      s.set(w, h, h);
      m.compose(p, q, s);
      geoI.setMatrixAt(n, m);
      const k = 0.72 + r() * 0.45, y = r() < 0.12 ? 1.12 : 1;
      c.setRGB(k * y, k, k * (0.85 + r() * 0.2));
      geoI.setColorAt(n, c);
      n++;
    }
    geoI.count = n;
    geoI.castShadow = false; geoI.receiveShadow = true;
    geoI.frustumCulled = false;
    this.root.add(geoI);
    return mat;
  }

  makeBoard(at: THREE.Vector3, yaw: number) {
    const g = new THREE.Group();
    const bt = boardTex(), panelMat = new THREE.MeshStandardMaterial({ map: bt, bumpMap: bt, bumpScale: 3, roughness: 0.7 });
    const frame = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.62, 0.3), roughness: 0.65 });
    const black = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.03, 0.03, 0.03), roughness: 0.5 });
    const knob = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.35, 0.16, 0.06), roughness: 0.35 });
    const panel = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.9, 0.06, 2, 0.02), panelMat);
    panel.position.set(0, 0.85, 0); panel.castShadow = panel.receiveShadow = true; g.add(panel);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new RoundedBoxGeometry(0.16, 1.3, 0.16, 2, 0.02), frame);
      post.position.set(sx * 0.6, 0.65, 0); post.castShadow = post.receiveShadow = true; g.add(post);
      for (const y of [1.18, 0.62, 0.28]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.17, y === 1.18 ? 0.14 : 0.06, 0.17), black);
        band.position.set(sx * 0.6, y, 0); g.add(band);
      }
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), knob); k.position.set(sx * 0.6, 0.92, 0.09); g.add(k);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.12, 0.5, 2, 0.02), frame);
      foot.position.set(sx * 0.6, 0.06, 0); foot.castShadow = foot.receiveShadow = true; g.add(foot);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.07, 0.1), black);
    top.position.set(0, 1.33, 0); g.add(top);
    g.position.copy(at); g.rotation.y = yaw;
    return g;
  }

  /** light preset per shot (the reference relights per map/shot): "back" = sun behind-left (courtyard backlit),
   *  "front" = sun front-left, raking across the masonry */
  update(frame: number, cam: THREE.Camera, light: "back" | "front" = "back") {
    if (light === "front") { this.sun.position.set(-16, 17, 9); this.sun.target.position.set(-1, 0, -5); }
    else { this.sun.position.set(-14, 20, -12); this.sun.target.position.set(1, 0, -2); }
    this.fill.intensity = light === "back" ? 1.1 : 0;
    this.grassUni.uTime.value = frame / 30;
    this.veilMat.uniforms.uTime.value = frame / 30;
    this.shaftMat.uniforms.uTime.value = frame / 30;
    this.skyMesh.position.copy(cam.position);
  }
}

/** diorama: worn dirt spots [x, z, radius] where characters stand, so their cutout shadow lands on visible ground.
 *  Filled by the shot layout (Court.tsx) at module load, before the World is built. */
export const TRAMPLED: [number, number, number][] = [];
/** 1 = grass grows here, 0 = bare dirt / paving (noisy edges) */
export function grassAt(x: number, z: number) {
  const n = fbm(x * 0.9, z * 0.9, 3, 12) - 0.5, n2 = vnoise(x * 3, z * 3, 7) - 0.5;
  for (const [tx, tz, tr] of TRAMPLED) { const k = Math.hypot(x - tx, z - tz) / tr + 0.35 * n + 0.15 * n2; if (k < 1) return 0; }
  const A = ARCH, G = GATE;
  // paving: in front of the gate (widening funnel) + the tunnel
  if (z < G.zf + 3.5 && Math.abs(x - A.cx) < 2.45 - Math.max(0, z - G.zf) * 0.12) return 0;
  // dirt strip at the wall foot
  const foot = x > G.x0 - 0.2 && x < G.x1 + 0.2 ? G.zf : WALL.z;
  const strip = z - foot - (0.8 + 0.9 * n + 0.2 * n2);
  if (strip < 0) return 0;
  // dirt patches
  if (z < -3 && fbm(x * 0.25 + 9, z * 0.25, 3, 33) > 0.66) return 0;
  return Math.min(1, strip * 2.5 + 0.4);
}
