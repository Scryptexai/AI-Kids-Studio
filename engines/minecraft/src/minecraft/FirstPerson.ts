// First person (shot direction `pov`): we are the actor. Its body is hidden (Mob.tsx, cue.pov) while the lens sits at
// its eyes (camera keys), and its right arm (its own skin, slim or wide per its model) with the held item is drawn in
// camera space by FirstPersonEffect: its own scene and camera (fixed 70 deg vertical FOV, own cleared depth), so it
// never clips into the world, composited after the lens blur and AO (sharp) and before bloom / grade (graded like the
// picture). Lit by copies of the scene's lights (moved into camera space) plus the drink's purple face light.
// Poses follow ItemInHandRenderer, refitted to a 9:16 frame: the item held low right; `drink` brings it in toward
// the centre / mouth, tilts it up and bobs |cos(t/4*pi)| (game ticks) like applyEatTransform; a head-back pose act
// (the gulp) tips it higher; the arm lags camera turns a little; `out` lowers it out of the bottom over 6 f.
// itw-02 (actors): `mine` acts swing a pickaxe (wind-up to the top over 8 f, a 2 f strike, contact at f + i*every,
// a recoil and a settle); `windup` holds the top of the swing (a shot that ends wound up loops into one that strikes).
import * as THREE from "three";
import { BlendFunction, Effect } from "postprocessing";
import type { LoadedWorld } from "./VoxelWorld";
import type { ShotDirection } from "./direction";
import { camAt } from "./direction";
import { modelFor, type Cube, type MobModel } from "./mobs/models";
import { boxMesh } from "./mobs/boxMesh";
import { stackSkins } from "./mobs/Mob";
import { raidState } from "./mobs/raid";
import { spriteItem } from "./props/HandItems";
import type { Act } from "./mobs/acts";
import type { PovSpec } from "./types";

const sm = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const env = (t: number, ein: number, len: number, eout: number) =>
  (t < -ein ? 0 : t < 0 ? (ein > 0 ? sm((t + ein) / ein) : 1) : t <= len ? 1 : eout > 0 ? 1 - sm((t - len) / eout) : 0);
/** game ticks per key frame (keys at 30 fps) */
const TPF = 20 / 30;
const D = Math.PI / 180;
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** one frame of first person (McShort -> McPost -> FirstPersonEffect) */
export type FpFrame = {
  on: boolean; f: number;
  model: MobModel | null; skin: THREE.Texture | null;
  /** the right-hand item's texture and its pop-in scale */
  item: THREE.Texture | null; itemK: number;
  /** drink 0..1 and its time in game ticks; gulp 0..1.5 (head-back pose acts); out 0..1 (arm lowered away) */
  drink: number; ticks: number; gulp: number; out: number;
  /** camera turn per frame [yaw, pitch] rad (the arm lags it) */
  sway: [number, number];
  /** the drink / totem face light */
  light: { color: string; k: number } | null;
  /** itw-02 pickaxe swing: up 0..1 (the wound-up top), hit 0..1 (the strike), shake (the contact jolt) */
  swing?: { up: number; hit: number; shake: number };
};
export const FP_OFF: FpFrame = { on: false, f: 0, model: null, skin: null, item: null, itemK: 0, drink: 0, ticks: 0, gulp: 0, out: 0, sway: [0, 0], light: null };

/** itw-02: the pickaxe swing at f from `mine` (contacts at f + i*every, n swings, default every 16) and `windup` acts */
export const mineSwing = (acts: Act[], f: number): { up: number; hit: number; shake: number } => {
  let up = 0, hit = 0, shake = 0;
  const over = (x: number, o = 1.6) => { const t = Math.max(0, Math.min(1, x)) - 1; return 1 + t * t * ((o + 1) * t + o); };
  for (const a of acts) {
    const k = a.amt ?? 1;
    if (a.kind === "windup") {
      const t = f - a.f, ein = a.ein ?? 8, len = a.len ?? 1e9, eout = a.eout ?? 8;
      if (t >= -ein) up = Math.max(up, (t < 0 ? over((t + ein) / ein) : t <= len ? 1 : 1 - sm((t - len) / eout)) * k);
      continue;
    }
    if (a.kind !== "mine") continue;
    const n = a.n ?? 1, P = a.every ?? 16;
    for (let i = 0; i < n; i++) {
      const t = f - a.f - i * P;
      if (t < -10 || t > 16) continue;
      if (t < -2) up = Math.max(up, over((t + 10) / 8) * k);
      else if (t <= 0) { const u = (t + 2) / 2; up = Math.max(up, (1 - u * u) * k); hit = Math.max(hit, u * u * k); }
      else if (t <= 4) { hit = Math.max(hit, (1 - 0.3 * Math.sin((t / 4) * Math.PI * 0.5)) * k); shake = Math.max(shake, Math.exp(-t / 1.5) * k); }
      else hit = Math.max(hit, 0.7 * (1 - sm((t - 4) / 12)) * k);
    }
  }
  return { up: Math.min(1.2, up), hit: Math.min(1, hit) * (1 - Math.min(1, up)), shake };
};

/** the pov spec active at f (the body hidden), or undefined */
export const povSpecAt = (dir: ShotDirection | undefined, f: number): PovSpec | undefined =>
  dir?.pov?.find((p) => f >= p.f0 && (p.f1 === undefined || f < p.f1));
/** is this actor's body hidden for first person at f */
export const povHides = (dir: ShotDirection | undefined, id: string, f: number) => povSpecAt(dir, f)?.actor === id;

const skins = new WeakMap<LoadedWorld, Map<string, THREE.Texture>>();
const skinOf = (lw: LoadedWorld, id: string, texs: string[]) => {
  let m = skins.get(lw);
  if (!m) { m = new Map(); skins.set(lw, m); }
  let t = m.get(id);
  if (!t) { const ts = texs.map((k) => lw.textures[k]).filter(Boolean); if (!ts.length) return null; t = stackSkins(ts); m.set(id, t); }
  return t;
};

const camAngles = (c: { pos: [number, number, number]; look: [number, number, number] }) => {
  const dx = c.look[0] - c.pos[0], dy = c.look[1] - c.pos[1], dz = c.look[2] - c.pos[2];
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** first person this frame for a shot with `pov` (FP_OFF while none is active or the arm is gone) */
export const povFrame = (dir: ShotDirection, lw: LoadedWorld, f: number, seed: number): FpFrame => {
  const spec = povSpecAt(dir, f);
  if (!spec) return FP_OFF;
  const out = spec.out !== undefined ? sm((f - spec.out) / 6) : 0;
  if (out >= 1) return FP_OFF;
  const m = lw.world.mobs.find((x) => x.id === spec.actor);
  const model = m ? modelFor(m.mob, m.textures[0]) : null;
  const skin = m ? skinOf(lw, m.id, m.textures) : null;
  if (!m || !model || !skin || !model.parts.some((p) => p.name === "right_arm")) return FP_OFF;
  const acts = (dir.acts?.[spec.actor] ?? []) as Act[];
  const rs = raidState(model, acts, f, f, hash(spec.actor), [0, 0, 0], 0, 1);
  const hr = rs.hands.r;
  // itw-02: a mine / windup act's `item` is the pickaxe when no hold act put one in the hand
  const swingItem = !hr ? acts.find((a) => (a.kind === "mine" || a.kind === "windup") && a.item)?.item : undefined;
  const item = hr && hr.kind !== "shield" ? lw.textures[hr.key] ?? null : swingItem ? lw.textures[swingItem] ?? null : null;
  let drink = 0, ticks = 0;
  for (const a of acts) {
    if (a.kind !== "drink") continue;
    const t = f - a.f, w = env(t, 10, a.len ?? 24, 3);
    if (w > drink) { drink = w; ticks = t * TPF; }
  }
  // the gulp: head-back pose acts (negative head pitch), weighted like acts.ts poses; -0.16 = 1
  let gulp = 0;
  for (const a of acts) {
    const h = a.kind === "pose" ? a.joints?.head?.[1] ?? 0 : 0;
    if (h >= 0) continue;
    const t = f - a.f, ein = a.ein ?? 6, eout = a.eout ?? 8, len = a.len ?? 0;
    gulp += (t < 0 ? sm((t + ein) / ein) : 1) * (t > len ? 1 - sm((t - len) / eout) : 1) * (a.amt ?? 1) * (-h / 0.16);
  }
  const c0 = camAt(dir, f, seed), c1 = camAt(dir, f - 2, seed);
  let sway: [number, number] = [0, 0];
  if (c0 && c1) { const a0 = camAngles(c0), a1 = camAngles(c1); sway = [wrap(a0[0] - a1[0]) / 2, (a0[1] - a1[1]) / 2]; }
  const lk = Math.max(rs.faceLight, rs.totem);
  return {
    on: true, f, model, skin, item, itemK: item ? hr?.k ?? 1 : 0, drink, ticks, gulp: Math.min(1.5, gulp), out, sway, swing: mineSwing(acts, f),
    light: lk > 0.001 ? { color: rs.totem > rs.faceLight ? "#ffd75a" : "#a54cff", k: lk } : null,
  };
};

// ------------------------------------------------------------------------------------------------ the rig
/** metres per pixel in the camera-space rig: the arm (1/16 m in the game, drawn ~0.56x to fit 9:16) and the item
 *  (the game's first-person item scale 0.68 against the arm) */
const UA = 0.03, UI = 0.018;
type Pose = { p: [number, number, number]; r: [number, number, number]; w: [number, number, number] };
/** hand position (camera space, m), hand rotation and wrist rotation (deg, XYZ) */
const HOLD: Pose = { p: [0.12, -0.3, -0.6], r: [-28, -8, 12], w: [18, -25, 0] };
const DRINK: Pose = { p: [0.06, -0.2, -0.52], r: [-14, -6, 22], w: [30, -15, 4] };
// itw-02 pickaxe swing: the wound-up top (hand up and back by the right ear, the head of the pick up behind) and the
// strike (hand down in front, the pick's head biting down at the centre of the frame)
const TOP: Pose = { p: [0.2, -0.06, -0.5], r: [14, -12, 20], w: [34, -25, 0] };
const STRIKE: Pose = { p: [0.05, -0.26, -0.62], r: [-80, -8, 32], w: [-5, -25, 0] };

type Rig = { root: THREE.Group; hand: THREE.Group; wrist: THREE.Group; items: Map<THREE.Texture, THREE.Group>; model: MobModel; skin: THREE.Texture };
const buildRig = (model: MobModel, skin: THREE.Texture): Rig => {
  const part = model.parts.find((p) => p.name === "right_arm")!;
  const cubes: Cube[] = part.cubes;
  // the arm's centre in x / z, its hand end (max y, y runs shoulder -> hand); the grip 2 px up from the end
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
  for (const c of cubes) if (!c.g) { x0 = Math.min(x0, c.o[0]); x1 = Math.max(x1, c.o[0] + c.s[0]); z0 = Math.min(z0, c.o[2]); z1 = Math.max(z1, c.o[2] + c.s[2]); y1 = Math.max(y1, c.o[1] + c.s[1]); }
  const mesh = boxMesh(cubes, skin, model.tex[0], model.tex[1]);
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.position.set(-(x0 + x1) / 2, -(y1 - 2), -(z0 + z1) / 2);
  // arm space -> hand space: the hand end up (+y), the outside of the right arm to the right
  const arm = new THREE.Group(); arm.rotation.y = Math.PI; arm.scale.setScalar(UA); arm.add(mesh);
  const hand = new THREE.Group(), wrist = new THREE.Group(), root = new THREE.Group();
  hand.add(arm); hand.add(wrist); root.add(hand);
  return { root, hand, wrist, items: new Map(), model, skin };
};
const itemOf = (rig: Rig, tex: THREE.Texture) => {
  let g = rig.items.get(tex);
  if (!g) {
    const it = spriteItem(tex);
    it.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    it.scale.setScalar(UI); it.position.y = 9 * UI;
    g = new THREE.Group(); g.add(it); rig.wrist.add(g); rig.items.set(tex, g);
  }
  return g;
};
const mix3 = (a: number[], b: number[], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const posRig = (rig: Rig, s: FpFrame) => {
  const k = s.drink, p = mix3(HOLD.p, DRINK.p, k), r = mix3(HOLD.r, DRINK.r, k), w = mix3(HOLD.w, DRINK.w, k);
  // applyEatTransform's bob, in game ticks, from a fifth of the way in; the gulp lifts and tips the bottle
  p[1] += Math.abs(Math.cos((s.ticks / 4) * Math.PI)) * 0.045 * k * sm(s.ticks / 6);
  p[1] += 0.04 * s.gulp * k; p[2] += 0.02 * s.gulp * k; w[0] += 18 * s.gulp * k; r[2] += 5 * s.gulp * k;
  // itw-02: the pickaxe swing (hold -> top by up, -> strike by hit), a jolt on contact
  const sw = s.swing;
  if (sw && (sw.up > 0 || sw.hit > 0)) {
    const mix = (a: number[], b: number[], k: number) => { for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k; };
    mix(p, TOP.p, sw.up); mix(r, TOP.r, sw.up); mix(w, TOP.w, sw.up);
    mix(p, STRIKE.p, sw.hit); mix(r, STRIKE.r, sw.hit); mix(w, STRIKE.w, sw.hit);
    p[1] += 0.012 * sw.shake * Math.sin(s.f * 2.7); r[0] += 6 * sw.shake;
  }
  // breathing, and the lowering out of frame
  p[1] += 0.006 * Math.sin(s.f * 0.11) - 0.6 * s.out; r[0] -= 30 * s.out;
  rig.hand.position.set(p[0], p[1], p[2]);
  rig.hand.rotation.set(r[0] * D, r[1] * D, r[2] * D);
  rig.wrist.rotation.set(w[0] * D, w[1] * D, w[2] * D);
  // the arm lags camera turns (ItemInHandRenderer's xBob / yBob), clamped
  const c = (v: number) => Math.max(-0.12, Math.min(0.12, v));
  rig.root.rotation.set(-c(s.sway[1] * 2.5), -c(s.sway[0] * 2.5), 0);
  for (const [t, g] of rig.items) { g.visible = t === s.item && s.itemK > 0.001; g.scale.setScalar(Math.max(0.001, s.itemK)); }
};

// ------------------------------------------------------------------------------------------------ the pass
const frag = /* glsl */ `
uniform sampler2D fpTex; uniform float fpOn;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 o = fpOn > 0.5 ? texture2D(fpTex, uv) : vec4(0.0);
  outputColor = vec4(inputColor.rgb * (1.0 - o.a) + o.rgb, inputColor.a);
}`;
const NPOINT = 6;

export class FirstPersonEffect extends Effect {
  state: FpFrame = FP_OFF;
  main: THREE.Scene | null = null;
  mainCam: THREE.Camera | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(70, 9 / 16, 0.01, 5);
  private rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  private rig: Rig | null = null;
  private amb = new THREE.AmbientLight(0xffffff, 0);
  private hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
  private suns = [new THREE.DirectionalLight(0xffffff, 0), new THREE.DirectionalLight(0xffffff, 0)];
  private points = Array.from({ length: NPOINT }, () => new THREE.PointLight(0xffffff, 0));
  private face = new THREE.PointLight(0xa54cff, 0, 3, 1.6);
  constructor() {
    super("FirstPersonEffect", frag, { blendFunction: BlendFunction.SRC, uniforms: new Map<string, THREE.Uniform>([["fpTex", new THREE.Uniform(null)], ["fpOn", new THREE.Uniform(0)]]) });
    this.scene.add(this.amb, this.hemi, ...this.suns, ...this.points, this.face);
    for (const s of this.suns) this.scene.add(s.target);
    this.face.position.set(0, 0.1, 0);
  }
  setSize(w: number, h: number) { this.rt.setSize(w, h); this.cam.aspect = w / Math.max(h, 1); this.cam.updateProjectionMatrix(); }
  private syncLights(s: FpFrame) {
    const cam = this.mainCam!, inv = cam.matrixWorldInverse, q = new THREE.Quaternion();
    cam.getWorldQuaternion(q); q.invert();
    const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const amb = new THREE.Color(0, 0, 0);
    let hemi: THREE.HemisphereLight | null = null;
    const suns: THREE.DirectionalLight[] = [], pts: { l: THREE.PointLight; w: number; p: THREE.Vector3 }[] = [];
    const v = new THREE.Vector3(), u = new THREE.Vector3();
    this.main!.traverseVisible((o) => {
      const l = o as THREE.Light;
      if (!l.isLight || l.intensity <= 0) return;
      if ((l as THREE.AmbientLight).isAmbientLight) amb.add(l.color.clone().multiplyScalar(l.intensity));
      else if ((l as THREE.HemisphereLight).isHemisphereLight) { if (!hemi || l.intensity > hemi.intensity) hemi = l as THREE.HemisphereLight; }
      else if ((l as THREE.DirectionalLight).isDirectionalLight) suns.push(l as THREE.DirectionalLight);
      else if ((l as THREE.PointLight).isPointLight) {
        const pl = l as THREE.PointLight; pl.getWorldPosition(v);
        const d = v.distanceTo(camPos);
        // the pov actor's own lights sit at its face: replaced by `face` below
        if (d < 0.9 || (pl.distance > 0 && d > pl.distance + 0.6)) return;
        pts.push({ l: pl, w: pl.intensity / Math.max(0.25, d * d), p: v.clone().applyMatrix4(inv) });
      }
    });
    this.amb.color.copy(amb); this.amb.intensity = 1;
    const h = hemi as THREE.HemisphereLight | null;
    if (h) {
      this.hemi.color.copy(h.color); this.hemi.groundColor.copy(h.groundColor); this.hemi.intensity = h.intensity;
      h.getWorldPosition(v); this.hemi.position.copy(v.lengthSq() > 0 ? v.normalize() : v.set(0, 1, 0)).applyQuaternion(q);
    } else this.hemi.intensity = 0;
    suns.sort((a, b) => b.intensity - a.intensity);
    this.suns.forEach((d, i) => {
      const src = suns[i];
      if (!src) { d.intensity = 0; return; }
      src.getWorldPosition(v); src.target.getWorldPosition(u);
      d.color.copy(src.color); d.intensity = src.intensity;
      d.position.copy(v.sub(u).normalize().applyQuaternion(q)); d.target.position.set(0, 0, 0);
    });
    pts.sort((a, b) => b.w - a.w);
    this.points.forEach((p, i) => {
      const src = pts[i];
      if (!src) { p.intensity = 0; return; }
      p.color.copy(src.l.color); p.intensity = src.l.intensity; p.distance = src.l.distance; p.decay = src.l.decay; p.position.copy(src.p);
    });
    this.face.color.set(s.light?.color ?? "#a54cff"); this.face.intensity = 1.0 * (s.light?.k ?? 0);
  }
  update(renderer: THREE.WebGLRenderer) {
    const s = this.state, on = this.uniforms.get("fpOn")!;
    on.value = 0;
    if (!s.on || !s.model || !s.skin || !this.main || !this.mainCam) return;
    if (!this.rig || this.rig.model !== s.model || this.rig.skin !== s.skin) {
      if (this.rig) this.scene.remove(this.rig.root);
      this.rig = buildRig(s.model, s.skin); this.scene.add(this.rig.root);
    }
    if (s.item) itemOf(this.rig, s.item);
    posRig(this.rig, s);
    this.syncLights(s);
    const prev = renderer.getRenderTarget(), auto = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    const sh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.autoClear = false;
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); renderer.autoClear = auto; renderer.shadowMap.autoUpdate = sh;
    this.uniforms.get("fpTex")!.value = this.rt.texture;
    on.value = 1;
  }
  dispose() { this.rt.dispose(); super.dispose(); }
}
