// Cinematic finish for Minecraft-mode shots (inside the ThreeCanvas, after the scene): thin-lens depth of field focused
// on what the camera frames, ambient occlusion in the voxel corners, bloom on the glowing eyes / moon / lanterns,
// the night grade (S-curve, blue shadows, warm highlights, vignette) and deterministic film grain.
// Reuses the house shaders (court lens blur + grain, alfatih grade). Toggle with inputProps { post: { lens: false, ... } }.
import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { getInputProps, useCurrentFrame } from "remotion";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, Effect, EffectAttribute } from "postprocessing";
import { LensBlur, GrainEffect } from "../videos/court/lensblur";
import { GradeEffect, GRADE_NIGHT, type GradeParams } from "../videos/alfatih/grade";
import { FirstPersonEffect, type FpFrame } from "./FirstPerson";
import type { AtmoSpec } from "./types";
import { useMcFrame } from "./mcTime";
// Minecraft night: the Al-Fatih night curve with the mids lifted and a lighter vignette, so a dark pit still reads on a phone
const GRADE_MC_NIGHT: GradeParams = { ...GRADE_NIGHT, ky: [0.03, 0.14, 0.3, 0.57, 0.83, 0.95, 1], vig: [0.18, 0.45] };
// N4 storm: desaturated and cool, flatter mids, highlights keep some colour (fire still reads orange), heavier vignette
const GRADE_MC_STORM: GradeParams = { ky: [0.025, 0.12, 0.27, 0.52, 0.79, 0.93, 1], sat: [0.55, 0.6, 0.85], tintS: [0.03, -0.012], tintM: [0.018, -0.006], tintH: [0, 0.01], vig: [0.3, 0.4] };
const ATMO_FOG = new THREE.Color("#1b2a4a"), ATMO_STORM = new THREE.Color("#5d6571");

type Post = { lens: boolean; ao: boolean; bloom: boolean; grade: boolean; grain: boolean; atmo: boolean };
/** strengths, overridable per render for A/B stills: inputProps { post: { aoI: 3, bloomT: 0.6 } } */
type Tune = { aoR: number; aoI: number; aoFall: number; bloomI: number; bloomT: number; bloomR: number };
const TUNE: Tune = { aoR: 0.8, aoI: 2.4, aoFall: 0.5, bloomI: 0.85, bloomT: 0.8, bloomR: 0.5 };
const tune = (): Tune => ({ ...TUNE, ...((getInputProps() as { post?: Partial<Tune> }).post ?? {}) });
// lens (depth of field) is OFF by default: user rule 2026-11-25, Minecraft shorts stay sharp front to back.
// grain is OFF by default: at preview scale it is per-pixel and changes every frame, which reads as video noise
const toggles = (): Post => ({ lens: false, ao: true, bloom: true, grade: true, grain: false, atmo: true, ...((getInputProps() as { post?: Partial<Post> }).post ?? {}) });

const makeBloom = (t: Tune) => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: t.bloomI, luminanceThreshold: t.bloomT, luminanceSmoothing: 0.15, mipmapBlur: true, levels: 5, radius: t.bloomR });
  // the MIP chain starts at 540x960 whatever the output size, so the glow is the same at --scale 0.5 and 1
  const mip = b.mipmapBlurPass, setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((960 * w) / Math.max(h, 1)), 960);
  return b;
};

// Atmosphere (our own shader, written for this look, not taken from any shader pack): exponential HEIGHT fog that
// pools low over the ground and in hollows, integrated along each view ray from the depth buffer, plus forward
// scattering toward the moon (a soft glow in the fog around the moon direction). The sky (depth 1) gets the glow only.
const atmoFrag = /* glsl */ `
uniform mat4 invProj; uniform mat4 camWorld; uniform vec3 camPos; uniform vec3 moonDir;
uniform vec3 fogCol; uniform vec3 glowCol; uniform float density; uniform float falloff; uniform float groundY; uniform float glow;
uniform float floorOn; uniform float under; uniform float caveK; uniform float caveD; uniform vec3 caveCol;
// fog integral along [t0, t1] of the ray, all of it above groundY (density falls off with height)
float above(float y0, float dyr, float k, float t0, float t1) {
  float a = density * exp(-(y0 - groundY) * k);
  return abs(dyr * k) < 1e-4 ? a * (t1 - t0) : a * (exp(-dyr * k * t0) - exp(-dyr * k * t1)) / (dyr * k);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 v = invProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0); v /= v.w;
  vec3 wp = (camWorld * vec4(v.xyz, 1.0)).xyz;
  vec3 d = wp - camPos; float dist = length(d); vec3 dir = d / max(dist, 1e-4);
  bool sky = depth >= 0.99999;
  dist = min(dist, 160.0);
  float k = falloff, h0 = camPos.y - groundY;
  float dy = dir.y * k * dist;
  float integ = density * exp(-h0 * k) * (abs(dy) < 1e-4 ? dist : (1.0 - exp(-dy)) / (dir.y * k));
  if (floorOn > 0.5) {
    // itw-02: the fog stops thickening at groundY; below it only under x the ground density (no pooling in voids)
    float y0 = camPos.y, y1 = y0 + dir.y * dist, tg = abs(dir.y) < 1e-5 ? 1e9 : (groundY - y0) / dir.y;
    float lo = density * under;
    if (y0 >= groundY) integ = y1 >= groundY ? above(y0, dir.y, k, 0.0, dist) : above(y0, dir.y, k, 0.0, tg) + lo * (dist - tg);
    else integ = y1 <= groundY ? lo * dist : lo * tg + above(y0, dir.y, k, tg, dist);
  }
  integ = mix(integ, caveD * dist, caveK);
  float amt = sky ? 0.0 : 1.0 - exp(-max(integ, 0.0));
  float mu = max(dot(dir, moonDir), 0.0);
  float phase = pow(mu, 6.0) * 0.6 + pow(mu, 40.0) * 0.8;
  vec3 col = mix(fogCol + glowCol * phase * glow, caveCol, caveK);
  vec3 c = mix(inputColor.rgb, col, amt);
  if (sky) c += glowCol * pow(mu, 10.0) * glow * 0.25 * (1.0 - caveK);
  outputColor = vec4(c, inputColor.a);
}`;
class AtmosphereEffect extends Effect {
  constructor() {
    super("AtmosphereEffect", atmoFrag, {
      blendFunction: BlendFunction.NORMAL, attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["invProj", new THREE.Uniform(new THREE.Matrix4())], ["camWorld", new THREE.Uniform(new THREE.Matrix4())], ["camPos", new THREE.Uniform(new THREE.Vector3())],
        ["moonDir", new THREE.Uniform(new THREE.Vector3(0.8, 0.45, -0.5).normalize())],
        ["fogCol", new THREE.Uniform(new THREE.Color("#1b2a4a"))], ["glowCol", new THREE.Uniform(new THREE.Color("#6f8fd8"))],
        ["density", new THREE.Uniform(0.035)], ["falloff", new THREE.Uniform(0.32)], ["groundY", new THREE.Uniform(0)], ["glow", new THREE.Uniform(1)],
        ["floorOn", new THREE.Uniform(0)], ["under", new THREE.Uniform(0.35)], ["caveK", new THREE.Uniform(0)], ["caveD", new THREE.Uniform(0.018)], ["caveCol", new THREE.Uniform(new THREE.Color("#0c0b0e"))],
      ]),
    });
  }
  sync(cam: THREE.Camera) {
    const u = this.uniforms;
    (u.get("invProj")!.value as THREE.Matrix4).copy((cam as THREE.PerspectiveCamera).projectionMatrixInverse);
    (u.get("camWorld")!.value as THREE.Matrix4).copy(cam.matrixWorld);
    (u.get("camPos")!.value as THREE.Vector3).copy(cam.position);
  }
  set moon(v: [number, number, number]) { (this.uniforms.get("moonDir")!.value as THREE.Vector3).set(...v).normalize(); }
}

const fwd = new THREE.Vector3();

// mc-raid R11 the imagined freeze: the picture goes grey, cool and pale (a thought, not the world), except what is
// marked to keep its colour (userData.raidKeep 0..1 on an object or any parent: the kept actors, the boundary). A
// half-res mask pass renders the scene with every material swapped for a flat one (colour = keep amount, alpha cut
// from the texture), then the shader mixes grey into everything the mask does not cover. The HUD is DOM over the
// canvas, so it never greys.
const imagineFrag = /* glsl */ `
uniform sampler2D mask; uniform vec2 texel; uniform float amount; uniform float ghost;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float m = 0.0, w = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    float k = (i == 0 && j == 0) ? 4.0 : ((i == 0 || j == 0) ? 2.0 : 1.0);
    m += texture2D(mask, uv + vec2(float(i), float(j)) * texel * 1.5).r * k; w += k;
  }
  m = clamp(m / w, 0.0, 1.0);
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 g = mix(c, vec3(l), 0.88) * vec3(0.93, 0.98, 1.08);
  g = mix(g, vec3(0.80, 0.84, 0.92) * (0.55 + 0.6 * l), 0.3 * ghost);
  vec2 d = uv - 0.5; float vig = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.8)));
  g *= mix(0.78, 1.0, vig);
  outputColor = vec4(mix(c, g, amount * (1.0 - m)), inputColor.a);
}`;
const maskMats = new Map<string, THREE.MeshBasicMaterial>();
const maskMat = (src: THREE.Material, keep: number) => {
  const s = src as THREE.MeshBasicMaterial;
  const map = s.map ?? null, add = s.transparent && !s.depthWrite;
  // itw-02: a material flagged userData.xrayMask (an x-ray glow drawn through rock) keeps depthTest off in the mask too
  const xr = !!src.userData?.xrayMask && !src.depthTest;
  const key = `${src.uuid}|${keep > 0 ? 1 : 0}${xr ? "|x" : ""}`;
  let m = maskMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map, alphaTest: s.alphaTest, side: s.side, transparent: add, depthWrite: !add, depthTest: !xr, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, toneMapped: false });
    // the map only cuts alpha (leaves, mob hat layers); the colour is the keep amount
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#ifdef USE_MAP\n diffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif"); };
    m.customProgramCacheKey = () => "raidmask";
    maskMats.set(key, m);
  }
  m.opacity = add ? s.opacity : 1;
  m.color.setScalar(keep);
  return m;
};
class ImagineEffect extends Effect {
  scene: THREE.Scene | null = null; cam: THREE.Camera | null = null; amount = 0;
  /** itw-02: texture names (substrings of the image file name, e.g. "lava", "magma", "redstone_ore") whose materials
   *  keep their colour like a kept actor (lava, ore); empty = the mc-raid behaviour */
  keepTex: string[] = [];
  rt = new THREE.WebGLRenderTarget(540, 960, { depthBuffer: true });
  constructor() {
    super("ImagineEffect", imagineFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([["mask", new THREE.Uniform(null)], ["texel", new THREE.Uniform(new THREE.Vector2(1 / 540, 1 / 960))], ["amount", new THREE.Uniform(0)], ["ghost", new THREE.Uniform(0)]]),
    });
    this.uniforms.get("mask")!.value = this.rt.texture;
  }
  setSize(w: number, h: number) { const W = Math.max(1, Math.round(w / 2)), H = Math.max(1, Math.round(h / 2)); this.rt.setSize(W, H); (this.uniforms.get("texel")!.value as THREE.Vector2).set(1 / W, 1 / H); }
  update(renderer: THREE.WebGLRenderer) {
    const scene = this.scene, cam = this.cam;
    if (!scene || !cam || this.amount <= 0.001) return;
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [], hidden: THREE.Object3D[] = [];
    const kt = this.keepTex;
    const texKeep = (m: THREE.Material, k: number) => {
      if (k > 0 || !kt.length) return k;
      const mm = m as THREE.MeshStandardMaterial, img = (mm.map ?? mm.emissiveMap)?.image as { src?: string } | undefined;
      const name = img?.src ? img.src.slice(img.src.lastIndexOf("/") + 1) : "";
      return name && kt.some((n) => name.includes(n)) ? 1 : k;
    };
    const walk = (o: THREE.Object3D, keep: number) => {
      if (!o.visible) return;
      const k = typeof o.userData.raidKeep === "number" ? o.userData.raidKeep : keep;
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) { o.visible = false; hidden.push(o); return; }
      if ((o as THREE.Mesh).isMesh) {
        const me = o as THREE.Mesh, src = Array.isArray(me.material) ? me.material[0] : me.material;
        // nothing that skips the depth buffer may cover a kept actor: additive fx, and the sky domes (an opaque radius-10
        // BackSide sphere drawn at the far plane by its own shader; swapped to a flat mask it would be a real wall 10
        // blocks from the origin, in front of an actor standing farther out)
        if ((!src.depthWrite || !src.depthTest) && k <= 0) { o.visible = false; hidden.push(o); return; }
        swapped.push([me, me.material]);
        me.material = Array.isArray(me.material) ? me.material.map((x) => maskMat(x, texKeep(x, k))) : maskMat(me.material, texKeep(me.material, k));
      }
      for (const c of o.children) walk(c, k);
    };
    walk(scene, 0);
    const bg = scene.background, fog = scene.fog, auto = renderer.shadowMap.autoUpdate, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), prev = renderer.getRenderTarget();
    scene.background = null; scene.fog = null; renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this.rt); renderer.clear(true, true, false);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
    scene.background = bg; scene.fog = fog; renderer.shadowMap.autoUpdate = auto;
    for (const [me, m] of swapped) me.material = m;
    for (const o of hidden) o.visible = true;
  }
}

// itw-02 R6 heat shimmer: a rising heat haze over up to 4 screen rects (each a world box projected through this
// frame's camera), stronger at the bottom (the hot surface), soft edges. Reads the pass input at a wobbled uv, so it
// goes FIRST in its pass (before first person / bloom / grade).
const shimmerFrag = /* glsl */ `
uniform vec4 rects[4]; uniform float amts[4]; uniform float time;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 off = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    if (amts[i] <= 0.0) continue;
    vec4 r = rects[i];
    vec2 q = (uv - r.xy) / max(r.zw - r.xy, vec2(1e-4));
    float m = smoothstep(0.0, 0.18, q.x) * smoothstep(1.0, 0.82, q.x) * smoothstep(-0.04, 0.08, q.y) * smoothstep(1.0, 0.55, q.y);
    m *= mix(1.0, 0.4, clamp(q.y, 0.0, 1.0));
    float y = uv.y * 70.0 - time * 6.0;
    float n = sin(y + sin(uv.x * 41.0 + time * 1.3) * 1.8) * 0.6 + sin(y * 1.7 + uv.x * 27.0 - time * 2.3) * 0.4;
    off += amts[i] * m * vec2(n * 0.0024, n * 0.0011);
  }
  outputColor = (off.x == 0.0 && off.y == 0.0) ? inputColor : texture2D(inputBuffer, uv + off);
}`;
class ShimmerEffect extends Effect {
  constructor() {
    super("ShimmerEffect", shimmerFrag, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([
      ["rects", new THREE.Uniform([0, 1, 2, 3].map(() => new THREE.Vector4()))], ["amts", new THREE.Uniform([0, 0, 0, 0])], ["time", new THREE.Uniform(0)]]) });
  }
  /** project each world box through the camera into a uv rect */
  sync(cam: THREE.Camera, boxes: { min: [number, number, number]; max: [number, number, number]; k: number }[], time: number) {
    const rects = this.uniforms.get("rects")!.value as THREE.Vector4[], amts = this.uniforms.get("amts")!.value as number[];
    this.uniforms.get("time")!.value = time;
    for (let i = 0; i < 4; i++) {
      const b = boxes[i];
      amts[i] = 0;
      if (!b) continue;
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0, ok = false;
      for (let c = 0; c < 8; c++) {
        const p = new THREE.Vector3(c & 1 ? b.max[0] : b.min[0], c & 2 ? b.max[1] : b.min[1], c & 4 ? b.max[2] : b.min[2]);
        const v = p.clone().applyMatrix4(cam.matrixWorldInverse);
        if (v.z > -0.05) continue;                                     // behind the lens
        p.project(cam); ok = true;
        const u = (p.x + 1) / 2, w = (p.y + 1) / 2;
        x0 = Math.min(x0, u); y0 = Math.min(y0, w); x1 = Math.max(x1, u); y1 = Math.max(y1, w);
      }
      if (!ok || x1 <= x0 || y1 <= y0) continue;
      rects[i].set(x0, y0, x1, y1); amts[i] = b.k;
    }
  }
}

/** focus: the world point the camera frames this frame; cInf: blur (px at 1080x1920) of things at infinity;
 *  imagine: the mc-raid imagined look this frame (amount, ghost); bare: only the imagined look (a shot with no
 *  directed camera gets none of the rest of the finish) */
export const McPost: React.FC<{ focus: () => THREE.Vector3 | null; cInf?: number; moon?: [number, number, number]; /** N4 storm 0..1: grey grade, grey haze */ storm?: number; imagine?: { k: number; ghost: number; /** itw-02 kept texture names (ImagineEffect.keepTex) */ keepTex?: string[] } | null; bare?: boolean;
  /** first person this frame (FirstPerson.ts); given only on shots with `pov` (the pass is not added otherwise) */
  fp?: FpFrame;
  /** itw-02 heat shimmer boxes this frame (MountainFx shimmerAt); given only on shots with `shimmers` */
  shimmer?: { min: [number, number, number]; max: [number, number, number]; k: number }[];
  /** itw-02 per-shot fog (types.ts AtmoSpec); false = no atmosphere pass */
  atmo?: AtmoSpec | false }> = ({ focus, cInf = 9, moon, storm = 0, imagine, bare = false, fp, shimmer, atmo }) => {
  const frame = useCurrentFrame();
  const kf = useMcFrame();
  const { camera, scene } = useThree();
  const on0 = useMemo(toggles, []);
  const tn = useMemo(tune, []);
  const on = bare ? { lens: false, ao: false, bloom: false, grade: false, grain: false, atmo: false } : on0;
  const fx = useMemo(() => {
    const grade = new GradeEffect(GRADE_MC_NIGHT, 1);
    return { atmo: new AtmosphereEffect(), lens: new LensBlur({ maxCoC: 10, nearScale: 0.8 }), bloom: makeBloom(tn), grade, grain: new GrainEffect({ amount: 0.022, cellPx: 1.6 }), imagine: new ImagineEffect(), fp: new FirstPersonEffect(), shimmer: new ShimmerEffect(), stormK: 0 };
  }, []);
  useLayoutEffect(() => {
    fx.imagine.scene = scene; fx.imagine.cam = camera;
    if (fp) { fx.fp.state = fp; fx.fp.main = scene; fx.fp.mainCam = camera; } fx.imagine.amount = imagine?.k ?? 0; fx.imagine.keepTex = imagine?.keepTex ?? [];
    fx.imagine.uniforms.get("amount")!.value = imagine?.k ?? 0; fx.imagine.uniforms.get("ghost")!.value = imagine?.ghost ?? 0;
    const p = focus();
    camera.getWorldDirection(fwd);
    fx.lens.focus = p ? Math.max(0.4, p.clone().sub(camera.position).dot(fwd)) : 10;
    fx.lens.cInf = cInf;
    fx.grain.seed = frame;
    camera.updateMatrixWorld(); fx.atmo.sync(camera);
    if (shimmer) fx.shimmer.sync(camera, shimmer, kf / 30);
    if (moon) fx.atmo.moon = moon;
    // the storm: blend the grade (only touched when it changes) and thicken the haze to a rain grey
    if (fx.stormK !== storm) { fx.grade.set(GRADE_MC_NIGHT, GRADE_MC_STORM, storm); fx.stormK = storm; }
    (fx.atmo.uniforms.get("fogCol")!.value as THREE.Color).copy(ATMO_FOG).lerp(ATMO_STORM, storm);
    fx.atmo.uniforms.get("density")!.value = 0.035 + 0.03 * storm;
    // itw-02 underground / per-shot fog. With no `atmo` and a camera above y -2 every uniform keeps the old value
    const A = atmo || undefined, U = fx.atmo.uniforms, gy = A?.groundY ?? 0;
    U.get("groundY")!.value = gy;
    U.get("floorOn")!.value = A ? 1 : 0;
    if (A?.density !== undefined) U.get("density")!.value = A.density + 0.03 * storm;
    U.get("falloff")!.value = A?.falloff ?? 0.32;
    U.get("under")!.value = A?.under ?? 0.35;
    U.get("glow")!.value = A?.glow ?? 1;
    if (A?.color) (U.get("fogCol")!.value as THREE.Color).set(A.color).lerp(ATMO_STORM, storm);
    const depth = gy - camera.position.y;
    U.get("caveK")!.value = A?.cave === true ? 1 : A?.cave === false ? 0 : THREE.MathUtils.smoothstep(depth, 2, 4);
    U.get("caveD")!.value = A?.caveDensity ?? 0.018;
    (U.get("caveCol")!.value as THREE.Color).set(A?.caveColor ?? "#0c0b0e");
  });
  // first person: after the lens and AO (sharp), before bloom / grade (graded with the picture)
  const list: [boolean, object][] = [[!!shimmer, fx.shimmer], [!!fp, fx.fp], [on.bloom, fx.bloom], [on.grade, fx.grade], [!!imagine, fx.imagine], [on.grain, fx.grain]];
  // autoClear OFF: the RenderPass clears the frame itself. With it on, every EffectPass that writes into the buffer
  // that owns the depth texture also wipes that depth, so a depth pass two places after the RenderPass (N8AO after
  // the two lens passes) saw an empty scene: AO was silently missing from every Minecraft final until 2026-11-25
  // (0.0 % pixel change with AO on vs off at full chain; 23 % once fixed).
  return (
    <EffectComposer multisampling={4} autoClear={false}>
      <>
        {on.atmo && atmo !== false && <primitive object={fx.atmo} dispose={null} />}
        {on.lens && <primitive object={fx.lens.pre} dispose={null} />}
        {on.lens && <primitive object={fx.lens.main} dispose={null} />}
        {on.ao && <N8AO aoRadius={tn.aoR} distanceFalloff={tn.aoFall} intensity={tn.aoI} aoSamples={16} denoiseSamples={8} denoiseRadius={8} halfRes={false} />}
        {list.filter(([u]) => u).map(([, o], i) => <primitive key={i} object={o} dispose={null} />)}
      </>
    </EffectComposer>
  );
};
