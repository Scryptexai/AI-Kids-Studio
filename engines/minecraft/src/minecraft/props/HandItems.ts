// Items held the game's way (ItemInHandLayer + the item model's third-person display transform), in a mob part's
// pixel space (y down, the mob faces -z: the same space the game poses them in, 16x larger).
//   hand frame: arm.translateAndRotate . Rx(-90) . Ry(180) . T(+-1, 2, -10)          (+1 right hand, -1 left)
//   display:    T(i*tx, ty, tz) . R_XYZ(rx, i*ry, i*rz) . S(s)                       (i = -1 in the left hand)
//   item:       the model centred on its 16 px cube (T(-8, -8, -8) of the 0..16 model box)
// Generated items (sprites) use props/Item.tsx's extruded sprite; the shield is its box model (ShieldModel).
import * as THREE from "three";
import { itemMesh } from "./Item";
import { boxMesh } from "../mobs/boxMesh";

type V3 = [number, number, number];
export type Display = { r: V3; t: V3; s: number };
/** third-person displays from the vanilla item models (right hand; the left hand mirrors them, see `displayed`) */
export const DISPLAY = {
  /** item/generated (bottle, totem, bell ...) */
  generated: { r: [0, 0, 0], t: [0, 3, 1], s: 0.55 },
  /** item/handheld (sword, axe) */
  handheld: { r: [0, -90, 55], t: [0, 4, 0.5], s: 0.85 },
  /** item/crossbow (and its pulling / charged models, same parent) */
  crossbow: { r: [-90, 0, -60], t: [2, 0.1, -3], s: 0.9 },
  /** item/shield, off hand, resting and blocking (thirdperson_lefthand) */
  shieldL: { r: [0, 90, 0], t: [10, 6, 12], s: 1 },
  shieldBlockL: { r: [45, 155, 0], t: [11.51, 7, 2.5], s: 1 },
} satisfies Record<string, Display>;

const D2R = Math.PI / 180;
/** the hand frame in an arm part's space; `bendY` = the forearm bone's y when the item rides a bending arm's lower
 *  bone; `pre` = a matrix applied first (the vex's hand scale) */
export const handFrame = (left: boolean, bendY = 0, pre?: THREE.Matrix4): THREE.Group => {
  const g = new THREE.Group();
  g.name = left ? "hand_l" : "hand_r";
  g.matrixAutoUpdate = false;
  const m = new THREE.Matrix4().makeTranslation(0, -bendY, 0);
  if (pre) m.multiply(pre);
  m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(left ? -1 : 1, 2, -10));
  g.matrix.copy(m);
  return g;
};

/** an item object (centred on its model cube) under its display transform, for the hand `left` */
export const displayed = (obj: THREE.Object3D, d: Display, left: boolean): THREE.Group => {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const i = left ? -1 : 1;
  g.matrix.makeTranslation(i * d.t[0], d.t[1], d.t[2])
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(d.r[0] * D2R, i * d.r[1] * D2R, i * d.r[2] * D2R, "XYZ")))
    .scale(new THREE.Vector3(d.s, d.s, d.s));
  g.add(obj);
  return g;
};
/** change a displayed group's transform in place (the shield going from rest to block) */
export const setDisplay = (g: THREE.Group, a: Display, b: Display, k: number, left: boolean) => {
  const i = left ? -1 : 1, mix = (x: number, y: number) => x + (y - x) * k;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a.r[0] * D2R, i * a.r[1] * D2R, i * a.r[2] * D2R, "XYZ"))
    .slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(b.r[0] * D2R, i * b.r[1] * D2R, i * b.r[2] * D2R, "XYZ")), k);
  const s = mix(a.s, b.s);
  g.matrix.compose(new THREE.Vector3(i * mix(a.t[0], b.t[0]), mix(a.t[1], b.t[1]), mix(a.t[2], b.t[2])), q, new THREE.Vector3(s, s, s));
};

/** a generated item (a sprite extruded 1 px) centred on its 16 px model cube */
export const spriteItem = (tex: THREE.Texture): THREE.Group => itemMesh(tex, 16, [0, 8]);

/** the shield (ShieldModel, 64x64 texture) as the special renderer draws it: T(-8,-8,-8) . S(1,-1,-1) . model */
export const shieldItem = (tex: THREE.Texture): THREE.Group => {
  const mesh = boxMesh([
    { uv: [0, 0], o: [-6, -11, -2], s: [12, 22, 1] },     // plate
    { uv: [26, 0], o: [-1, -3, -1], s: [2, 6, 6] },       // handle
  ], tex, 64, 64);
  const inner = new THREE.Group();
  inner.scale.set(1, -1, -1);
  inner.add(mesh);
  const g = new THREE.Group();
  g.position.set(-8, -8, -8);
  g.add(inner);
  const w = new THREE.Group();
  w.add(g);
  return w;
};
