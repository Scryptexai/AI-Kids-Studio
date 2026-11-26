// A mob from models.ts: box geometry with the game's box UVs, its skin (a stack of textures composited into one,
// e.g. villager base + biome clothes + profession), the walk cycle and idle motion from the game's own formulas,
// and a head that turns toward a look target.
import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CROSSBOW_TEX, PLAYER_ITEM_TEX, slotIndex, type Cube, type MobModel, type Part } from "./models";
import { geometryOf, skinMaterial, depthMaterial } from "./boxMesh";
import { actOffsets, type Act, type ActOffsets } from "./acts";
import { mobLife, type BodySize } from "./life";
import { Puffs } from "./Puffs";
import { raidState, poseRaid, lookAngles, type RaidDefaults, type RaidState, type RootPose } from "./raid";
import { DISPLAY, displayed, handFrame, setDisplay, shieldItem, spriteItem } from "../props/HandItems";
import { headBanner, ominousBannerTexture } from "../props/Banner";
import { glowOutline } from "../GlowOutline";
import { itw2State, peekGlow } from "./itw2";
import { NameTag } from "../NameTag";

/** the joint of a bending part: mid turns half, low the full angle (about the part's x axis) */
export type Bend = { mid: THREE.Bone; low: THREE.Bone; at: number };

/** the part tree as THREE groups (named), meshes per texture slot */
export const buildMob = (model: MobModel, slotTex: THREE.Texture[], slotTint: (string | undefined)[]) => {
  const parts = new Map<string, THREE.Group>();
  const build = (p: Part): THREE.Group => {
    const grp = new THREE.Group();
    grp.name = p.name;
    if (p.at) grp.position.set(...p.at);
    grp.rotation.set(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0, "ZYX");
    grp.userData.base = grp.rotation.clone();
    const bySlot = new Map<number, Cube[]>();
    for (const cu of p.cubes) bySlot.set(cu.layer ?? 0, [...(bySlot.get(cu.layer ?? 0) ?? []), cu]);
    // a bending part: three bones in the part's own space (shared by its slot meshes), bound at rest
    let skeleton: THREE.Skeleton | null = null;
    if (p.bend !== undefined) {
      const root = new THREE.Bone(), mid = new THREE.Bone(), low = new THREE.Bone();
      mid.position.y = p.bend; low.position.y = p.bend;
      root.add(mid); root.add(low); grp.add(root);
      const inv = new THREE.Matrix4().makeTranslation(0, -p.bend, 0);
      skeleton = new THREE.Skeleton([root, mid, low], [new THREE.Matrix4(), inv, inv.clone()]);
      grp.userData.bend = { mid, low, at: p.bend } satisfies Bend;
    }
    // the humanoid head's outer layer (hood, hair) in its own child group: it lags a few frames on fast head turns
    if (model.rig === "humanoid" && p.name === model.head && p.cubes.some((c) => c.g) && p.cubes.some((c) => !c.g)) {
      for (const [slot, cubes] of bySlot) bySlot.set(slot, cubes.filter((c) => !c.g));
      grp.add(build({ name: `${p.name}_hat`, cubes: p.cubes.filter((c) => c.g) }));
    }
    for (const [slot, cubes] of bySlot) {
      if (!cubes.length) continue;
      const tex = slotTex[slot];
      if (!tex) continue;
      const geo = geometryOf(cubes, model.tex[0], model.tex[1], p.bend);
      let mesh: THREE.Mesh;
      if (skeleton) {
        const sm = new THREE.SkinnedMesh(geo, skinMaterial(tex, slotTint[slot]));
        sm.bind(skeleton, new THREE.Matrix4());
        sm.frustumCulled = false;
        mesh = sm;
      } else mesh = new THREE.Mesh(geo, skinMaterial(tex, slotTint[slot]));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.customDepthMaterial = depthMaterial(tex);
      // the texture slot, for per-frame recolours (sheep wool tint)
      (mesh.material as THREE.Material).userData.slot = slot;
      grp.add(mesh);
    }
    for (const k of p.kids ?? []) grp.add(build(k));
    parts.set(p.name, grp);
    return grp;
  };
  // model space -> world: 180 deg about x (y up, the mob faces +z), feet at 0, 1 block = 16 px
  const root = new THREE.Group();
  root.position.y = 1.5;
  root.rotation.x = Math.PI;
  root.scale.setScalar(1 / 16);
  for (const p of model.parts) root.add(build(p));
  return { root, parts };
};

/** stack the skin textures (bottom first) into one canvas texture */
export const stackSkins = (texs: THREE.Texture[]): THREE.Texture => {
  if (texs.length === 1) return texs[0];
  const imgs = texs.map((t) => t.image as HTMLImageElement);
  const cv = document.createElement("canvas");
  cv.width = imgs[0].width; cv.height = imgs[0].height;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  for (const im of imgs) g.drawImage(im, 0, 0, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

export type MobAction = "idle" | "walk" | "run";
export type MobPose = { age: number; action: MobAction; seed: number; look: THREE.Vector3 | null; /** bow draw 0..1 */ aim?: number;
  /** acting beats (tap, wave, talk ...) and the video frame they are keyed on */ acts?: Act[]; frame?: number };

const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));
const isZombie = (model: MobModel) => model.rig === "humanoid" && model.defaultTexture.startsWith("entity/zombie");

/** the acting offsets for this moment (humanoids only) */
export const mobActs = (model: MobModel, parts: Map<string, THREE.Group>, at: THREE.Vector3, yawRad: number, acts: Act[] | undefined, frame: number) =>
  model.rig === "humanoid" ? actOffsets(acts, frame, at, yawRad, parts.get("right_arm")?.position.y ?? 2, isZombie(model)) : null;

/** the head's yaw / pitch (rad, relative to the body) this moment: the look target or a slow look-around, the acting
 *  look (lookCam, punch) blended over it, the acting head offsets on top */
export const headAngles = (model: MobModel, at: THREE.Vector3, yawRad: number, pose: MobPose, ac: ActOffsets | null): [number, number] => {
  const { age, seed } = pose;
  let yaw = Math.sin(age * 0.021 + seed) * 0.35, pitch = Math.sin(age * 0.033 + seed * 2) * 0.1;
  if (pose.look) {
    const base = model.parts.find((p) => p.name === model.head)?.at ?? [0, 0, 0];
    const eye = new THREE.Vector3(base[0] / 16, 1.5 - base[1] / 16, -base[2] / 16).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRad).add(at);
    const d = pose.look.clone().sub(eye).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yawRad);
    yaw = Math.atan2(d.x, d.z) + Math.sin(age * 0.05 + seed) * 0.03;
    pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
  if (ac?.look) { const w = ac.look.w; yaw += (ac.look.yaw - yaw) * w; pitch += (ac.look.pitch - pitch) * w; }
  return [clamp(yaw + (ac?.head[0] ?? 0), 1.25), clamp(pitch + (ac?.head[1] ?? 0), 0.8)];
};

/** set every part's rotation for this moment (age in game ticks). `ac` = the acting offsets (computed here when not
 *  given); `legComp` = body lean (rad) the legs cancel so the feet stay under the hips */
export const poseMob = (model: MobModel, parts: Map<string, THREE.Group>, at: THREE.Vector3, yawRad: number, pose: MobPose, acIn?: ActOffsets | null, legComp?: number) => {
  for (const g of parts.values()) {
    g.rotation.copy(g.userData.base as THREE.Euler);
    const b = g.userData.bend as Bend | undefined;
    if (b) { b.mid.rotation.x = 0; b.low.rotation.x = 0; b.mid.rotation.z = 0; b.low.rotation.z = 0; }
  }
  const { age, seed } = pose;
  const run = pose.action === "run", walk = pose.action === "walk" || run;
  // walk ~35 deg leg swing (a stroll; 0.75 read as a scissor split); run: a faster, longer sprint stride
  const ls = run ? age * 0.85 : walk ? age * 0.55 : 0, amt = run ? 0.82 : walk ? 0.42 : 0;
  const rx = (n: string, v: number) => { const g = parts.get(n); if (g) g.rotation.x += v; };
  const ry = (n: string, v: number) => { const g = parts.get(n); if (g) g.rotation.y += v; };
  const rz = (n: string, v: number) => { const g = parts.get(n); if (g) g.rotation.z += v; };
  /** elbow (- = forearm forward) / knee (+ = shin back) */
  const bend = (n: string, v: number) => { const b = parts.get(n)?.userData.bend as Bend | undefined; if (b) { b.mid.rotation.x = v / 2; b.low.rotation.x = v; } };
  const swing = Math.cos(ls * 0.6662), anti = Math.cos(ls * 0.6662 + Math.PI);
  const sw = Math.sin(ls * 0.6662), walkK = amt / 0.42;
  const zombie = isZombie(model);
  const ac: ActOffsets | null = acIn !== undefined ? acIn : mobActs(model, parts, at, yawRad, pose.acts, pose.frame ?? 0);
  const lean = legComp ?? ac?.body.pitch ?? 0;
  if (model.rig === "quadruped" || model.rig === "creeper" || model.rig === "horse") {
    rx("right_hind_leg", swing * 1.4 * amt); rx("left_hind_leg", anti * 1.4 * amt);
    rx("right_front_leg", anti * 1.4 * amt); rx("left_front_leg", swing * 1.4 * amt);
  }
  if (model.rig === "horse") {
    const tail = parts.get("tail");
    if (tail) { tail.rotation.y += Math.sin(age * 0.11 + seed) * 0.25; tail.rotation.x += walk ? 0.3 : Math.sin(age * 0.05 + seed) * 0.06; }
  }
  if (model.rig === "humanoid" || model.rig === "villager" || model.rig === "illager") {
    // legs: walk swing (dropped under a pose), the knee folding as the leg swings forward, a soft idle knee; legs
    // cancel the body lean (posed against world vertical: a lean never swings the feet off the floor)
    const legK = 1 - (ac?.legW ?? 0), vk = model.rig !== "humanoid" ? (model.legSwing ?? 0.5) : 1;
    rx("right_leg", swing * 1.4 * amt * vk * legK - lean); rx("left_leg", anti * 1.4 * amt * vk * legK - lean);
    if (ac) {
      rx("right_leg", ac.rLeg[0]); ry("right_leg", ac.rLeg[1]); rz("right_leg", ac.rLeg[2]);
      rx("left_leg", ac.lLeg[0]); ry("left_leg", ac.lLeg[1]); rz("left_leg", ac.lLeg[2]);
    }
    bend("right_leg", (0.04 + 0.8 * walkK * Math.max(0, sw)) * legK + (ac?.rKn ?? 0));
    bend("left_leg", (0.04 + 0.8 * walkK * Math.max(0, -sw)) * legK + (ac?.lKn ?? 0));
  }
  if (model.rig === "humanoid") {
    const bobZ = Math.cos(age * 0.09) * 0.05 + 0.05, bobX = Math.sin(age * 0.067) * 0.05;
    if (zombie) {
      // arms forward (the acting adds the lunge wind-up / give-up drop on top)
      rx("right_arm", -1.45 + bobX + (ac?.r[0] ?? 0)); rx("left_arm", -1.45 - bobX + (ac?.l[0] ?? 0));
      ry("right_arm", ac?.r[1] ?? 0); ry("left_arm", ac?.l[1] ?? 0);
      rz("right_arm", bobZ + (ac?.r[2] ?? 0)); rz("left_arm", -bobZ + (ac?.l[2] ?? 0));
      bend("right_arm", -0.05); bend("left_arm", -0.05);
    } else {
      const k = pose.aim ?? 0;
      const rK = 1 - Math.min(1, ac?.rW ?? 0), lK = 1 - Math.min(1, ac?.lW ?? 0);
      // run: arms pump harder, elbows bent
      const pump = run ? 1.25 : 1;
      rx("right_arm", ((anti * amt * pump + bobX) * (1 - k) - 1.5 * k) * rK); rx("left_arm", ((swing * amt * pump - bobX) * (1 - k) - 1.5 * k) * lK);
      ry("right_arm", -0.1 * k * rK); ry("left_arm", 0.5 * k * lK);
      rz("right_arm", bobZ * (0.4 + 0.6 * rK)); rz("left_arm", -bobZ * (0.4 + 0.6 * lK));
      // elbows: a relaxed bend that breathes, more as the arm swings forward on a walk, straight when aiming
      const runE = run ? -0.75 : 0, wE = run ? 0.25 : 0.5;
      const eR = (-0.14 + runE - 0.05 * Math.sin(age * 0.067 + seed) - wE * walkK * Math.max(0, -anti)) * (1 - k);
      const eL = (-0.14 + runE - 0.05 * Math.sin(age * 0.061 + seed * 1.3) - wE * walkK * Math.max(0, -swing)) * (1 - k);
      bend("right_arm", eR * rK + (ac?.rE ?? 0)); bend("left_arm", eL * lK + (ac?.lE ?? 0));
      if (ac) {
        rx("right_arm", ac.r[0]); ry("right_arm", ac.r[1]); rz("right_arm", ac.r[2]);
        rx("left_arm", ac.l[0]); ry("left_arm", ac.l[1]); rz("left_arm", ac.l[2]);
      }
    }
  }
  // head: toward the look target, or a slow look-around (never frozen), acting on top
  const head = parts.get(model.head);
  if (head) {
    const [yaw, pitch] = headAngles(model, at, yawRad, pose, model.rig === "humanoid" ? ac : null);
    head.rotation.y += -yaw;
    head.rotation.x += pitch;
  }
  if (model.idle === "witch") witchIdle(model, parts, at, yawRad, pose);
  if (model.idle === "chicken") chickenIdle(parts, pose);
};

/** a chicken's idle on the quadruped rig: a quick head bob, a peck at the ground now and then (seeded), a wing ruffle,
 *  and wings flapping on a walk / run (the game flaps them only in the air; a flutter reads better on a short) */
const chickenIdle = (parts: Map<string, THREE.Group>, pose: MobPose) => {
  const { age: a, seed: s } = pose, walk = pose.action !== "idle";
  const head = parts.get("head");
  if (head) {
    // peck: a 9-tick dip every ~70 ticks (phase per bird), two quick jabs; between pecks a jerky little bob
    const u = (a + Math.abs(s) * 53) % 70, peck = u < 9 ? Math.sin((u / 9) * Math.PI) * (1 + 0.25 * Math.sin(u * 1.4)) : 0;
    // (rotation only: poseMob resets rotations each frame, not positions)
    head.rotation.x += (walk ? 0.12 * Math.sin(a * 0.7) : 0.85 * peck) + Math.round(Math.sin(a * 0.21 + s) * 2) * 0.05;
  }
  const v = (a + Math.abs(s) * 31) % 110, ruffle = v < 7 ? Math.sin((v / 7) * Math.PI) * 0.35 : 0;
  const flap = walk ? 0.25 + 0.25 * Math.sin(a * (pose.action === "run" ? 1.6 : 0.9)) : ruffle;
  const rw = parts.get("right_wing"), lw = parts.get("left_wing");
  if (rw) rw.rotation.z += flap;
  if (lw) lw.rotation.z -= flap;
};

/** a copy of a skin with its red pixels moved to `to` (their brightness kept): red belongs to one character */
const noRedCache = new WeakMap<THREE.Texture, THREE.Texture>();
const recolourRed = (tex: THREE.Texture, to: string): THREE.Texture => {
  const hit = noRedCache.get(tex);
  if (hit) return hit;
  const im = tex.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!im || !im.width) return tex;
  const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data, c = new THREE.Color(to);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx === 0 || (mx - mn) / mx < 0.45 || mx !== r) continue;
    const h = ((gg - b) / (mx - mn)) * 60, hue = h < 0 ? h + 360 : h;
    if (hue > 14 && hue < 340) continue;
    const k = mx / 0.8;
    px[i] = Math.min(255, c.r * 255 * k); px[i + 1] = Math.min(255, c.g * 255 * k); px[i + 2] = Math.min(255, c.b * 255 * k);
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 16; t.colorSpace = THREE.SRGBColorSpace;
  noRedCache.set(tex, t);
  return t;
};

/** the witch's own idle on top of the villager rig: the game's nose wiggle (livelier), a head bob and a slow cock of
 *  the head, the robe swaying from the hips (hem clear of the legs: 0.05 rad front/back, 0.03 sideways), and the hat
 *  tiers dragging behind the head's motion (2 f lag, plus a soft sway; the fill cubes hide the seams) */
const witchIdle = (model: MobModel, parts: Map<string, THREE.Group>, at: THREE.Vector3, yawRad: number, pose: MobPose) => {
  const { age: a, seed: s } = pose;
  const bob = (t: number) => Math.sin(t * 0.12 + s) * 0.045, cock = (t: number) => Math.sin(t * 0.05 + s * 2) * 0.04;
  const head = parts.get(model.head);
  if (head) { head.rotation.x += bob(a); head.rotation.z += cock(a); }
  const nose = parts.get("nose");
  if (nose) {
    const f = 0.075 + 0.02 * ((Math.abs(s) * 3.7) % 1);
    nose.rotation.x += Math.sin(a * f) * 0.1 + Math.sin(a * 0.37 + s) * 0.025;
    nose.rotation.z += Math.cos(a * f) * 0.06;
  }
  const jb = parts.get("jacket")?.userData.bend as Bend | undefined;
  if (jb) {
    const x = Math.sin(a * 0.09 + s) * 0.05, z = Math.sin(a * 0.067 + s * 1.7) * 0.03;
    jb.mid.rotation.x = x / 2; jb.mid.rotation.z = z / 2; jb.low.rotation.x = x; jb.low.rotation.z = z;
  }
  // drag: how far the head turned / nodded over the last 2 frames (game ticks: 2 f = 1.33 ticks)
  const dt = 2 * (20 / 30);
  const now = headAngles(model, at, yawRad, pose, null), was = headAngles(model, at, yawRad, { ...pose, age: a - dt }, null);
  const dP = was[1] + bob(a - dt) - (now[1] + bob(a)), dY = was[0] - now[0], dC = cock(a - dt) - cock(a);
  const cl = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  const sway = parts.get("hat_sway"), h3 = parts.get("hat3"), h4 = parts.get("hat4");
  if (sway) { sway.rotation.x += cl(dP * 0.9, 0.05) + Math.sin(a * 0.1 + s) * 0.012; sway.rotation.z += cl(dY * 0.35 + dC * 0.9, 0.05) + Math.sin(a * 0.083 + s) * 0.012; }
  if (h3) { h3.rotation.x += cl(dP * 0.5, 0.03) + Math.sin(a * 0.1 + s - 0.7) * 0.012; h3.rotation.z += cl(dY * 0.2 + dC * 0.5, 0.03) + Math.sin(a * 0.083 + s - 0.7) * 0.015; }
  if (h4) { h4.rotation.x += Math.sin(a * 0.1 + s - 1.4) * 0.04; h4.rotation.z += cl(dY * 0.3, 0.05) + Math.sin(a * 0.083 + s - 1.4) * 0.05; }
};

export type HeldGrip = "tool" | "item" | "block" | "hang";
export type MobProps = {
  model: MobModel; skin: THREE.Texture[]; slots: THREE.Texture[]; at: [number, number, number]; facing: number;
  baby?: boolean; pose: MobPose; onParts?: (parts: Map<string, THREE.Group>) => void;
  /** a held prop (origin = its grip), put in the hand / arms / mouth */
  held?: THREE.Object3D | null;
  /** how a humanoid holds it: "tool" (handle in the fist, head forward and up: pickaxe, sword), "item" (a flat item,
   *  same hold, smaller), "block" (a small cube under the fist), "hang" (hangs from the fist by its handle, kept upright
   *  in the world: a bucket; `tip` tips it forward) */
  grip?: HeldGrip;
  /** held item pop-in scale (1 = normal) and tip (degrees, + = top forward) */
  heldPop?: number; tip?: number;
  /** whole-body tilt in degrees [pitch (+ = lean forward, 90 = face down), roll (+ = to its left)] about the hips */
  tilt?: [number, number];
  /** N5 creeper fuse: body scale [width/depth, height] about the feet, and the white flash 0..1 over every material */
  swell?: [number, number]; white?: number;
  /** mc-raid: the mob's standing defaults (captain banner, name tag, glowing, opacity); acts change them (mobs/raid.ts) */
  raid?: RaidDefaults;
};

/** where a held prop sits, in the holding part's pixel space (y down, forward -z): part, position, basis (item x, y) */
const HOLD: Partial<Record<MobModel["rig"], { part: string; at: [number, number, number]; x: [number, number, number]; y: [number, number, number] }>> = {
  // the hand at the end of the right arm; the item's +y (blade) forward, its +x up: tip forward and up
  humanoid: { part: "right_arm", at: [-1, 10, -1], x: [0, -1, 0], y: [0, 0, -1] },
  // standing up out of the crossed arms
  villager: { part: "arms", at: [0, 4, -4.2], x: [1, 0, 0], y: [0, -1, 0] },
  // across the mouth
  quadruped: { part: "head", at: [0, 3, -7], x: [0, 0, -1], y: [1, 0, 0] },
  horse: { part: "head", at: [0, -2, -10], x: [0, 0, -1], y: [1, 0, 0] },
  creeper: { part: "head", at: [0, -2, -5], x: [0, 0, -1], y: [1, 0, 0] },
  illager: { part: "right_arm", at: [-1, 10, -1], x: [0, -1, 0], y: [0, 0, -1] },
  ravager: { part: "mouth", at: [0, 1, -15], x: [0, 0, -1], y: [1, 0, 0] },
  vex: { part: "right_arm", at: [0, 3.5, 0], x: [0, -1, 0], y: [0, 0, -1] },
};

/** a hand digit (thumb / finger): a box coloured with one skin pixel (the hand's), in the forearm bone's space */
const digit = (tex: THREE.Texture, size: [number, number, number], px: [number, number]) => {
  const geo = new THREE.BoxGeometry(...size);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (px[0] + 0.5) / 64, 1 - (px[1] + 0.5) / 64);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  m.castShadow = true; m.visible = false;
  return m;
};

/** the hand items a model can show (mc-raid): built once, switched per frame */
type HandSet = { items: Map<string, { pop: THREE.Group; disp: THREE.Group; mats: THREE.MeshLambertMaterial[]; left: boolean }>; crossbow: THREE.Group[];
  banner: { obj: THREE.Group; flag: THREE.Group } | null; woolLayer: number; vexBase: THREE.Texture | null; vexCharging: THREE.Texture | null };
const matsOf = (o: THREE.Object3D) => { const out: THREE.MeshLambertMaterial[] = []; o.traverse((x) => { const m = (x as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined; if (m && (x as THREE.Mesh).isMesh) { m.userData.item = true; out.push(m); } }); return out; };
/** the totem raised: the generated display turned a quarter about its x, its face to the front */
const TOTEM_UP = { r: [90, 0, 0] as [number, number, number], t: [0, 2.5, -4] as [number, number, number], s: 0.6 };
const buildHands = (model: MobModel, parts: Map<string, THREE.Group>, slots: THREE.Texture[], skin0: THREE.Texture): HandSet => {
  const tex = (key: string) => { const i = slotIndex(model, key); return i >= 0 ? slots[i] : undefined; };
  const hs: HandSet = { items: new Map(), crossbow: [], banner: null, woolLayer: slotIndex(model, "entity/sheep/sheep_wool") + 1, vexBase: null, vexCharging: null };
  const frames: Partial<Record<"r" | "l", THREE.Group>> = {};
  const hand = (side: "r" | "l") => {
    if (frames[side]) return frames[side]!;
    const arm = parts.get(side === "r" ? "right_arm" : "left_arm");
    if (!arm) return null;
    const b = arm.userData.bend as Bend | undefined;
    let pre: THREE.Matrix4 | undefined;
    // the vex's small hands (VexModel.translateToHand); a slim player's arm is 0.5 px further in
    if (model.rig === "vex") pre = new THREE.Matrix4().makeScale(0.55, 0.55, 0.55).multiply(new THREE.Matrix4().makeTranslation(side === "r" ? 0.75 : -0.75, -2.5, 1.25));
    else if (model.rig === "humanoid" && model.defaultTexture.includes("/slim/")) pre = new THREE.Matrix4().makeTranslation(side === "r" ? 0.5 : -0.5, 0, 0);
    const f = handFrame(side === "l", b?.at ?? 0, pre);
    (b?.low ?? arm).add(f);
    frames[side] = f;
    return f;
  };
  const add = (key: string, side: "r" | "l", obj: THREE.Object3D, d: typeof DISPLAY[keyof typeof DISPLAY]) => {
    const f = hand(side);
    if (!f) return null;
    const disp = displayed(obj, d, side === "l"), pop = new THREE.Group();
    pop.add(disp); pop.visible = false; f.add(pop);
    const e = { pop, disp, mats: matsOf(obj), left: side === "l" };
    hs.items.set(`${side}|${key}`, e);
    return e;
  };
  if (model.rig === "illager" && model.arms === "crossbow") {
    for (const k of CROSSBOW_TEX) { const t = tex(k); if (t) hs.crossbow.push(add(k, "r", spriteItem(t), DISPLAY.crossbow)!.pop); }
  }
  if (model.rig === "illager" && model.arms === "axe") { const t = tex("item/iron_axe"); if (t) add("item/iron_axe", "r", spriteItem(t), DISPLAY.handheld); }
  if (model.rig === "vex") {
    const t = tex("item/iron_sword"); if (t) add("item/iron_sword", "r", spriteItem(t), DISPLAY.handheld);
    hs.vexBase = skin0; hs.vexCharging = tex("entity/illager/vex_charging") ?? null;
  }
  if (model.rig === "humanoid") {
    for (const k of PLAYER_ITEM_TEX) {
      const t = tex(k);
      if (!t) continue;
      for (const side of ["r", "l"] as const) {
        if (k.includes("shield")) { if (side === "l") add(k, side, shieldItem(t), DISPLAY.shieldL); }
        else add(k, side, spriteItem(t), /(sword|pickaxe)$/.test(k) ? DISPLAY.handheld : DISPLAY.generated);
      }
    }
  }
  // the ominous banner (a raid captain wears it on the head)
  const btex = model.rig === "illager" ? ominousBannerTexture(tex) : null, head = parts.get(model.head);
  if (btex && head) { hs.banner = headBanner(btex); hs.banner.obj.visible = false; head.add(hs.banner.obj); matsOf(hs.banner.obj); }
  return hs;
};
/** a body on its own root (bed): its feet point under the hip (as drawn), its yaw, and `up(p)`: a world point turned
 *  back by the body's pitch / roll about the hip, so a look solved for an upright body at `feet` lands right */
const ownFrame = (root: RootPose, scale: number, yaw: number, roll: number) => {
  const hipY = 0.75 * scale, Y = new THREE.Vector3(0, 1, 0);
  const feet = new THREE.Vector3(root.hip[0], root.hip[1] - hipY, root.hip[2]);
  const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(root.pitch, 0, roll)).invert();
  const up = (p: THREE.Vector3) => {
    const v = p.clone().sub(feet).applyAxisAngle(Y, -yaw);
    v.y -= hipY; v.applyQuaternion(inv); v.y += hipY;
    return v.applyAxisAngle(Y, yaw).add(feet);
  };
  return { feet, yaw, up };
};
/** the eye point (world) the raid looks aim from */
const eyeOf = (model: MobModel, at: THREE.Vector3, yawRad: number, s: number) => {
  const [h, f] = model.rig === "ravager" ? [1.6, 1.1] : model.rig === "vex" ? [0.6, 0] : [1.75, 0];
  return new THREE.Vector3(Math.sin(yawRad) * f * s, h * s, Math.cos(yawRad) * f * s).add(at);
};

export const Mob: React.FC<MobProps> = ({ model, skin, slots, at, facing, baby, pose, onParts, held, grip, heldPop, tip, tilt, swell, white, raid }) => {
  const built = useMemo(() => {
    const base = stackSkins(skin);
    const tex = [model.noRed ? recolourRed(base, model.noRed) : base, ...slots];
    const tints = [undefined, ...(model.slots ?? []).map((s) => s.tint)];
    const b = buildMob(model, tex, tints);
    // the body's rest size (blocks, before the model / baby scale): half width incl. arms, height incl. hat
    b.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
    const size: BodySize = box.isEmpty() ? { hw: 0.3, h: 1.8 } : { hw: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), h: box.max.y };
    // thumbs (thumbsUp) and index fingers (idea) on a player's hands, hidden until an act raises them
    const digits: Record<string, THREE.Mesh> = {};
    if (model.rig === "humanoid" && model.tex[1] === 64 && !isZombie(model)) {
      const rLow = (b.parts.get("right_arm")?.userData.bend as Bend | undefined)?.low, lLow = (b.parts.get("left_arm")?.userData.bend as Bend | undefined)?.low;
      if (rLow && lLow) {
        digits.rThumb = digit(tex[0], [1.8, 1.8, 3.2], [45, 31]); rLow.add(digits.rThumb);
        digits.rFinger = digit(tex[0], [1.2, 2.6, 1.2], [45, 31]); rLow.add(digits.rFinger);
        digits.lThumb = digit(tex[0], [1.8, 1.8, 3.2], [37, 63]); lLow.add(digits.lThumb);
        digits.lFinger = digit(tex[0], [1.2, 2.6, 1.2], [37, 63]); lLow.add(digits.lFinger);
      }
    }
    const hands = buildHands(model, b.parts, slots, tex[0]);
    return { ...b, digits, size, hands };
  }, [model, skin, slots]);
  const yawRad = (-facing * Math.PI) / 180;
  const atV = useMemo(() => new THREE.Vector3(...at), [at]);
  const outer = useRef<THREE.Group>(null);
  const frame = pose.frame ?? 0;
  const ac = mobActs(model, built.parts, atV, yawRad, pose.acts, frame);
  // spawn / hurt / poof (mobs/life.ts): visibility, scale-in, red overlay, death roll, knockback, particles
  const life = mobLife(pose.acts, frame, at, yawRad, built.size, model.rig === "humanoid", pose.seed);
  const ms0 = model.scale ?? 1, bs0 = (baby ? 0.5 : 1) * ms0;
  // mc-raid: the raid mobs' state (items, banner, tag, glow, motes, a body off its path: bed, throw, rear)
  const rs: RaidState = raidState(model, pose.acts, frame, pose.age, pose.seed, at, yawRad, bs0, raid);
  // itw-02: tumble (a body off its path), sneeze dust, the see-through peek glow (mobs/itw2.ts)
  const i2 = itw2State(pose.acts, frame, bs0);
  // whole-body motion: the acting body offsets, a sprint lean and bob, and an idle sway / breath (never frozen); a
  // baby's acting drops and steps are its own size (a sitting baby sits on the floor)
  const acBody = ac?.body ? (baby ? { ...ac.body, dy: ac.body.dy * bs0, fwd: ac.body.fwd * bs0 } : ac.body) : {};
  const body = { dy: 0, pitch: 0, roll: 0, yaw: 0, fwd: 0, ...acBody };
  if (model.rig === "humanoid") {
    const a = pose.age, sd = pose.seed;
    if (pose.action === "run") { const ph = a * 0.85 * 0.6662; body.pitch += 0.22; body.dy += 0.05 * Math.abs(Math.sin(ph)); body.roll += 0.04 * Math.sin(ph); }
    else if (pose.action === "idle") { body.roll += Math.sin(a * 0.04 + sd) * 0.018; body.dy += Math.sin(a * 0.13 + sd) * 0.004; body.pitch += Math.sin(a * 0.13 + sd + 1) * 0.008; }
  } else if (model.idle === "witch" && pose.action === "idle") {
    // a witch's weight shift and breath (the villager rig has no body idle of its own)
    const a = pose.age, sd = pose.seed;
    body.roll += Math.sin(a * 0.045 + sd) * 0.02; body.dy += Math.sin(a * 0.13 + sd) * 0.005; body.pitch += Math.sin(a * 0.11 + sd + 1) * 0.012;
  }
  body.dy += rs.body.dy; body.pitch += rs.body.pitch; body.roll += rs.body.roll; body.yaw += rs.body.yaw; body.fwd += rs.body.fwd;
  if (life) { body.dy += life.hop; body.pitch -= life.recoil; }
  const root = rs.root ?? i2.root;
  // pose before this frame renders (layout effect: same commit as the frame)
  useLayoutEffect(() => {
    // a body placed by its own root (bed): the head looks from that body as drawn (feet under its hip, its yaw, the
    // look target turned back by its pitch / roll), never from the path keys, and the legs do not walk
    const own = root?.own ? ownFrame(root, bs0 * (life?.scale ?? 1), root.yaw ?? yawRad + body.yaw, body.roll * 0.3) : null;
    const lookPose: MobPose = own ? { ...pose, action: "idle", look: pose.look ? own.up(pose.look) : null } : pose;
    poseMob(model, built.parts, own?.feet ?? atV, own?.yaw ?? yawRad, lookPose, ac, root ? -root.legRel : body.pitch);
    const headG = built.parts.get(model.head), hb = headG?.userData.base as THREE.Euler | undefined;
    // a raid look (aim, swing, bite, cast at a target) blended over the head's own look
    if (headG && hb && rs.look && rs.look.w > 0) {
      const lookAt = own ? (own.up(new THREE.Vector3(...rs.look.at)).toArray() as [number, number, number]) : rs.look.at;
      const [ty, tpch] = lookAngles(eyeOf(model, own?.feet ?? atV, own?.yaw ?? yawRad, bs0), own?.yaw ?? yawRad + body.yaw, lookAt), w = Math.min(1, rs.look.w);
      const cy = -(headG.rotation.y - hb.y), cp = headG.rotation.x - hb.x;
      headG.rotation.y = hb.y - (cy + (clamp(ty, 1.1) - cy) * w); headG.rotation.x = hb.x + cp + (clamp(tpch, 0.7) - cp) * w;
    }
    // lying down: the head mostly rests
    if (headG && hb && root && root.lie > 0) { const d = 1 - 0.75 * root.lie; headG.rotation.y = hb.y + (headG.rotation.y - hb.y) * d; headG.rotation.x = hb.x + (headG.rotation.x - hb.x) * d; }
    poseRaid(model, built.parts, rs, pose.age, pose.seed, pose.action);
    // a villager sitting / lying in bed: the robe's skirt follows the legs (over the lap)
    if (root && model.rig === "villager") {
      const jb = built.parts.get("jacket")?.userData.bend as Bend | undefined;
      if (jb) { jb.mid.rotation.x = root.legRel / 2; jb.low.rotation.x = root.legRel; }
    }
    // hand items: crossbow sprite, axe, sword, the player's act items (pop-in scale, the shield's block blend)
    const hs = built.hands;
    hs.crossbow.forEach((g, i) => { g.visible = rs.armed && rs.crossbow === i; g.scale.setScalar(1); });
    for (const [key, e] of hs.items) {
      const [side, item] = key.split("|");
      if (item.startsWith("item/crossbow")) continue;
      let k = 0;
      if (item === "item/iron_axe") k = rs.armed ? 1 : 0;
      else if (model.rig === "vex") k = 1;
      else { const h = rs.hands[side as "r" | "l"]; k = h && h.key === item ? h.k : 0; }
      e.pop.visible = k > 0.01; e.pop.scale.setScalar(Math.max(0.001, k));
      if (item.includes("shield")) setDisplay(e.disp, DISPLAY.shieldL, DISPLAY.shieldBlockL, Math.min(1, rs.block), e.left);
      // the totem held up turns its face to the front (a held sprite is side-on to the camera the game's way)
      if (item.includes("totem")) setDisplay(e.disp, DISPLAY.generated, TOTEM_UP, Math.min(1, rs.totem * 1.5), e.left);
      const glowK = item.includes("totem") ? 0.25 * rs.totem : item.includes("shield") ? 0.3 * rs.flash : 0;
      for (const m of e.mats) m.emissive.setScalar(glowK);
    }
    if (hs.banner) {
      hs.banner.obj.visible = rs.captain;
      // BannerRenderer's flag sway, plus a little drag from the walk
      const tt = pose.age / 100;
      hs.banner.flag.rotation.x = (-0.0125 + 0.01 * Math.cos(2 * Math.PI * tt)) * Math.PI + (pose.action !== "idle" ? 0.05 * Math.sin(pose.age * 0.37) : 0);
    }
    glowOutline(built.root, rs.glow * (life ? (life.visible ? 1 : 0) : 1), rs.glowPx);
    peekGlow(built.root, i2.peek, i2.peekColor);
    // digits grow out of the fist with their act
    const dg = ac?.digits;
    for (const [k, m] of Object.entries(built.digits)) {
      const w = dg ? dg[k as keyof typeof dg] : 0;
      m.visible = w > 0.02;
      if (!m.visible) continue;
      const left = k[0] === "l";
      // thumb out of the fist's front face (inner side); finger out of the fist's end
      if (k.endsWith("Thumb")) { m.scale.set(1, 1, w); m.position.set(left ? -0.3 : 0.3, 5, -2 - 1.6 * w); }   // 3.2 px thumb: reads at MCU distance
      else { m.scale.set(1, w, 1); m.position.set(left ? -0.2 : 0.2, 6 + 1.3 * w, -1.2); }
    }
    // hood / hair drag: the outer head layer trails the head by 2 frames on fast turns, a pure rotation lag of at
    // most ~2.3 deg about the head's own centre (no positional offset: the layer never separates from the head)
    const hat = built.parts.get(`${model.head}_hat`);
    if (hat && model.rig === "humanoid") {
      const LAG = 2, MAX = 0.04;
      const prevPose = { ...pose, age: pose.age - LAG * (20 / 30), frame: frame - LAG };
      const acPrev = mobActs(model, built.parts, atV, yawRad, pose.acts, frame - LAG);
      const now = headAngles(model, atV, yawRad, pose, ac), was = headAngles(model, atV, yawRad, prevPose, acPrev);
      const dYaw = (was[0] + (acPrev?.body.yaw ?? 0)) - (now[0] + body.yaw), dPitch = (was[1] - (acPrev?.body.pitch ?? 0)) - (now[1] - body.pitch);
      hat.rotation.set(clamp(dPitch, MAX), -clamp(dYaw, MAX), 0, "ZYX");
      let c = hat.userData.centre as THREE.Vector3 | undefined;
      if (!c) {
        const box = new THREE.Box3();
        hat.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); if (m.geometry.boundingBox) box.union(m.geometry.boundingBox); } });
        c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        hat.userData.centre = c;
      }
      hat.position.copy(c).sub(c.clone().applyEuler(hat.rotation));
    }
  });
  useLayoutEffect(() => { onParts?.(built.parts); }, [built, onParts]);
  const g: HeldGrip = grip ?? "tool";
  useLayoutEffect(() => {
    const h = HOLD[model.rig], arm = held && h ? built.parts.get(h.part) : null;
    if (!held || !arm || !h) return;
    // a bending arm: the prop rides the forearm (the lower bone sits at the elbow)
    const b = arm.userData.bend as Bend | undefined, part: THREE.Object3D = b?.low ?? arm;
    const by = b?.at ?? 0;
    if (model.rig === "humanoid" && g === "block") {
      // a small cube just past the fist (its base against the fist's end), a little forward, turned to read as a cube
      held.position.set(-1, 10.15 - by, -1.2); held.rotation.set(0, 0.45, 0); held.scale.setScalar(1);
    } else if (model.rig === "humanoid" && g === "hang") {
      held.position.set(-1, 10.2 - by, -0.2); held.rotation.set(0, 0, 0); held.scale.setScalar(1);
    } else {
      const x = new THREE.Vector3(...h.x), y = new THREE.Vector3(...h.y);
      held.matrix.makeBasis(x, y, x.clone().cross(y)).setPosition(h.at[0], h.at[1] - by, h.at[2]);
      held.matrix.decompose(held.position, held.quaternion, held.scale);
    }
    held.userData.baseScale = held.scale.x;
    part.add(held);
    return () => { part.remove(held); };
  }, [built, held, model.rig, g]);
  // per frame: pop-in scale, and a hanging item kept upright in the world (tipped forward by `tip`)
  useLayoutEffect(() => {
    if (held) held.visible = !rs.hands.r;
    if (!held || model.rig !== "humanoid") return;
    held.scale.setScalar((held.userData.baseScale ?? 1) * (heldPop ?? 1));
    if (g !== "hang" || !held.parent) return;
    // the forearm's rotation in the world: outer (yaw + twist) . tilt (pitch, roll) . root (180 about x) . parts
    let q = new THREE.Quaternion();
    for (let o: THREE.Object3D | null = held.parent; o && o !== built.root; o = o.parent) q = o.quaternion.clone().multiply(q);
    // (a body on its own root, the tumble: its drawn pitch and yaw)
    const tp = root ? root.pitch : ((tilt?.[0] ?? 0) * Math.PI) / 180 + body.pitch, tr = root ? body.roll * 0.3 : ((tilt?.[1] ?? 0) * Math.PI) / 180 + body.roll;
    const world = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, root?.yaw ?? yawRad + body.yaw, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tp, 0, tr)))
      .multiply(built.root.quaternion).multiply(q);
    // wanted: upright, turned 35 deg off the mob's forward, tipped forward about the mob's side axis (uniform scales
    // do not change the rotation)
    const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, root?.yaw ?? yawRad, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((((tip ?? 0) + i2.swing) * Math.PI) / 180, 0, 0)))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, 0)));
    held.quaternion.copy(world.invert().multiply(want));
  });
  // the fuse flash: every material glows white (the game's white overlay), off again between flashes; the hurt
  // overlay pulls every skin toward red; a spawning mob fades in (transparent only while it fades)
  const red = life?.red ?? 0, opacity = (life?.opacity ?? 1) * rs.opacity;
  const wool = rs.wool, charging = rs.vexCharge > 0.5;
  useLayoutEffect(() => {
    const w = white ?? 0;
    const key = `${w}|${red}|${opacity}|${wool?.map((v) => v.toFixed(3)).join(",") ?? ""}|${charging}`;
    if (key === (built.root.userData.fxKey ?? "0|0|1||false")) return;
    built.root.userData.fxKey = key;
    built.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[] | undefined;
      for (const x of m ? (Array.isArray(m) ? m : [m]) : []) {
        if (!x.emissive || x.userData.item) continue;
        // the vex's charging face
        if (built.hands.vexCharging && x.userData.slot === 0) { const want = charging ? built.hands.vexCharging : built.hands.vexBase; if (want && x.map !== want) { x.map = want; x.needsUpdate = true; } }
        // the game's hurt overlay: the skin keeps its pixels, pulled toward red (not a flat red fill)
        x.emissive.setRGB(w + 0.07 * red, w, w); x.emissiveIntensity = 1;
        const base = (x.userData.baseColor ??= x.color.clone()) as THREE.Color;
        // sheep wool dyed (the wool slot multiplied by the dye colour)
        const dye = wool && x.userData.slot === built.hands.woolLayer ? wool : [1, 1, 1];
        x.color.setRGB(base.r * dye[0] * (1 + 0.25 * red), base.g * dye[1] * (1 - 0.55 * red), base.b * dye[2] * (1 - 0.55 * red));
        const tr = opacity < 0.999;
        if (x.transparent !== tr) { x.transparent = tr; x.needsUpdate = true; }
        x.opacity = opacity;
      }
    });
  });
  const bs = bs0, ls = life?.scale ?? 1;
  const sc: [number, number, number] = swell ? [bs * ls * swell[0], bs * ls * swell[1], bs * ls * swell[0]] : [bs * ls, bs * ls, bs * ls];
  const hip = 0.75, tp = root ? root.pitch : ((tilt?.[0] ?? 0) * Math.PI) / 180 + body.pitch, tr = root ? body.roll * 0.3 : ((tilt?.[1] ?? 0) * Math.PI) / 180 + body.roll;
  // knockback (mob-local x / z) into the world
  const [shx, shz] = life?.shove ?? [0, 0], cy = Math.cos(yawRad), sy = Math.sin(yawRad);
  const ox = shx * cy + shz * sy, oz = -shx * sy + shz * cy;
  const pos: [number, number, number] = root ? [root.hip[0], root.hip[1] - hip * bs * ls, root.hip[2]]
    : [at[0] + ox + Math.sin(yawRad) * body.fwd, at[1] + body.dy, at[2] + oz + Math.cos(yawRad) * body.fwd];
  const yawOut = root?.yaw ?? yawRad + body.yaw;
  // landing squash about the floor under the hips (throw, jump out of bed)
  const q = root?.squash ?? 0, sq: [number, number, number] = [1 + 0.1 * q, 1 - 0.18 * q, 1 + 0.1 * q];
  const sqAt: [number, number, number] = root ? [root.hip[0], root.floor, root.hip[2]] : [0, 0, 0];
  const rear = rs.rear ?? { pitch: 0, py: 0, pz: 0 };
  const shown = life ? life.visible : true;
  // the name tag: above the banner on a captain, else the game's height + 0.5
  const tagY = rs.captain && built.hands.banner ? 3.7 * bs + 0.25 : root ? 0.9 : built.size.h * bs + 0.5;
  const tagAt: [number, number, number] = root ? [root.hip[0], root.hip[1] + tagY, root.hip[2]] : [pos[0], pos[1] + tagY, pos[2]];
  const light = (pose.acts ?? []).some((a) => a.kind === "drink" || a.kind === "totem");
  // death roll about the body's side edge on the floor (so it lies ON the floor, not half through it)
  const side = life?.rollSide ?? -1, pivX = side * built.size.hw, rollZ = -side * (life?.roll ?? 0);
  return (
    <>
      <group position={sqAt} scale={sq}><group position={[-sqAt[0], -sqAt[1], -sqAt[2]]}>
        <group ref={outer} position={pos} rotation={[0, yawOut, 0]} scale={sc} visible={shown}>
          <group position={[0, rear.py, rear.pz]} rotation={[rear.pitch, 0, 0]}><group position={[0, -rear.py, -rear.pz]}>
            <group position={[pivX, 0, 0]} rotation={[0, 0, rollZ]}><group position={[-pivX, 0, 0]}>
              <group position={[0, hip, 0]} rotation={[tp, 0, tr]}><group position={[0, -hip, 0]}><group visible={!raid?.pov}><primitive object={built.root} /></group></group></group>
            </group></group>
          </group></group>
          {light && <pointLight position={[0, 1.75, 0.55]} color={rs.totem > rs.faceLight ? "#ffd75a" : "#a54cff"} intensity={2.6 * Math.max(rs.faceLight, rs.totem)} distance={3} decay={1.6} />}
        </group>
      </group></group>
      {life && life.puffs.length > 0 && (
        <group position={[at[0] + ox, at[1], at[2] + oz]} rotation={[0, yawRad, 0]} scale={bs}><Puffs puffs={life.puffs} /></group>
      )}
      {(rs.motes.length > 0 || i2.motes.length > 0) && (
        <group position={pos} rotation={[0, yawOut, 0]} scale={bs}><Puffs puffs={i2.motes.length ? [...rs.motes, ...i2.motes] : rs.motes} /></group>
      )}
      {rs.tag && shown && !raid?.pov && <NameTag text={rs.tag.text} size={rs.tag.size} opacity={Math.min(1, rs.tag.k)} at={tagAt} />}
    </>
  );
};
