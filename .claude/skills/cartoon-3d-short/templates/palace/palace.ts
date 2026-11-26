// The palace compound of Kerajaan Arunika as static batches: plaza and lawns, the pendopo (stone platform, red pillars,
// two-tier joglo roof, throne, the meeting wall with its loose brick), the alley behind it, the brick compound wall with
// the split gate, two banyan trees, Raja Surya's tomb, the kitchen, the barracks with empty racks, the generals' table,
// two writing desks, the town outside and the fortress on its hill up the road. Lanterns are HDR-bright cards at night.
import * as THREE from "three";
import { Batch, boxGeo, quad, V, lam, prop, house, Kit, Ray, setSight } from "./build";
import { stoneHD, roofHD, cobbleHD, grassHD, planksHD, beam, brick, rep, ctex, rng } from "./paint";
import {
  HALL, PILLARS_X, PILLARS_Z, THRONE, HOLE, HOLE_W, HOLE_H, PORTRAIT, ALLEY, WALL, GATE_W, TOMB, EASEL, KITCHEN, HEARTH, BARRACKS,
  RACK_X, RACK_Z, TABLE, COURIER_DESK, PATIH_DESK, FORT, DESK_H, TABLE_H, V3, BENCH_X,
} from "./layout";

const box = (b: Batch, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 2) =>
  b.add(boxGeo(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tile), m);
const up = (x0: number, x1: number, z0: number, z1: number, y: number, tile: number) =>
  quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), (x1 - x0) / tile, (z1 - z0) / tile);
/** four sloped faces from the outer rectangle at y0 up to the inner one at y1 (a hip / joglo tier) */
const hip = (b: Batch, m: THREE.Material, o: [number, number, number, number], i: [number, number, number, number], y0: number, y1: number) => {
  const [x0, x1, z0, z1] = o, [a0, a1, c0, c1] = i, t = 3;
  const s = (Math.hypot(z0 - c0, y1 - y0) + 0.01) / t;
  b.add(quad(V(x1, y0, z0), V(x0, y0, z0), V(a0, y1, c0), V(a1, y1, c0), (x1 - x0) / t, s), m);
  b.add(quad(V(x0, y0, z1), V(x1, y0, z1), V(a1, y1, c1), V(a0, y1, c1), (x1 - x0) / t, s), m);
  b.add(quad(V(x0, y0, z0), V(x0, y0, z1), V(a0, y1, c1), V(a0, y1, c0), (z1 - z0) / t, s), m);
  b.add(quad(V(x1, y0, z1), V(x1, y0, z0), V(a1, y1, c0), V(a1, y1, c1), (z1 - z0) / t, s), m);
};
const cyl = (b: Batch, m: THREE.Material, x: number, y0: number, z: number, r: number, h: number, seg = 14) =>
  b.add(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y0 + h / 2, z), m);

/** batik cloth (curtain, throne backdrop) */
const batik = (key: string, base: string, ink: string) => ctex("batik" + key, 512, 512, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = ink; g.lineWidth = 5;
  for (let y = 32; y < 512; y += 64) for (let x = 32; x < 512; x += 64) {
    g.beginPath(); g.ellipse(x + ((y / 64) % 2) * 32, y, 18, 10, Math.PI / 4, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x + ((y / 64) % 2) * 32, y, 4 + r() * 2, 0, Math.PI * 2); g.fillStyle = ink; g.fill();
  }
  g.fillStyle = ink; g.fillRect(0, 0, 512, 18); g.fillRect(0, 494, 512, 18);
});

/** lantern and candle spots (their glow cards are drawn by cast.ts at night) */
export const LANTERNS: V3[] = [
  [-2.1, 3.55, 13.75], [2.1, 3.55, 13.75], [-0.6, 2.55, 29.4], [5.2, 2.55, 29.4], [-2.05, 3.0, WALL.zS - 0.5], [2.05, 3.0, WALL.zS - 0.5],
  [23.2, 2.7, 4], [23.2, 2.7, 12], [TABLE[0] + 0.5, TABLE_H + 0.18, TABLE[2] + 0.1],
];
export const CANDLES: V3[] = [[COURIER_DESK[0] + 0.35, DESK_H + 0.17, COURIER_DESK[2] - 0.25], [PATIH_DESK[0] + 0.25, DESK_H + 0.17, PATIH_DESK[2] - 0.45]];
export const HEARTH_FIRE: V3 = [HEARTH[0], 0.72, HEARTH[2] - 0.35];

export type PalaceParts = { brick: THREE.Mesh; lanternMat: THREE.MeshBasicMaterial; portraitMats: THREE.MeshBasicMaterial[] };

export const buildPalace = (root: THREE.Object3D, kit: Kit, rays: Ray[], portraitTex: THREE.Texture): PalaceParts => {
  setSight(rays);
  const b = new Batch();
  const M = {
    grass: lam("grassHD", () => ({ map: grassHD() })),
    cobble: lam("cobbleHD", () => ({ map: cobbleHD() })),
    stone: lam("hallStone", () => ({ map: stoneHD("hallStone", ["#cfc4b2", "#c4b8a5", "#d8cebd", "#bdb09c"], "#9a8d7b") })),
    floor: lam("hallFloor", () => ({ map: stoneHD("hallFloor", ["#e6dccb", "#ddd2bf", "#ece4d6", "#d6cbba"], "#b5a994") })),
    plaster: lam("plaster", () => ({ map: stoneHD("plaster", ["#ecdfc6", "#e6d8bd", "#efe4cf", "#e2d3b8"], "#cbbb9d") })),
    brick: lam("candiBrick", () => ({ map: rep(brick(), 1, 1), color: "#d9a184" })),
    pillar: lam("pillarRed", () => ({ color: "#8a2f26" })),
    gold: lam("trimGold", () => ({ color: "#d8a83e" })),
    wood: lam("wood", () => ({ map: beam() })),
    planks: lam("planksHD", () => ({ map: planksHD() })),
    roof: lam("roofJoglo", () => ({ map: roofHD("#9c4f36"), side: THREE.DoubleSide })),
    roofK: lam("roofKitchen", () => ({ map: roofHD("#a8704e"), side: THREE.DoubleSide })),
    ceil: lam("ceiling", () => ({ color: "#6e4630" })),
    red: lam("cushionRed", () => ({ color: "#a8323a" })),
    iron: lam("potIron", () => ({ color: "#3a3640" })),
    jar: lam("jarClay", () => ({ color: "#b8684a" })),
    cloth: lam("batikCurtain", () => ({ map: batik("c", "#8a5a34", "#2a1b14"), side: THREE.DoubleSide })),
    drape: lam("batikDrape", () => ({ map: batik("d", "#8a2f3a", "#e3b23c"), side: THREE.DoubleSide })),
    hill: lam("hillGrass", () => ({ color: "#6f9a52" })),
    fort: lam("fortStone", () => ({ map: stoneHD("fortStone", ["#b9b2a4", "#aea697", "#c3bcae", "#a69e8f"], "#8a8274") })),
    paper: lam("deskPaper", () => ({ color: "#efe3c4" })),
  };
  // ---- ground: lawn, plaza, road ----
  b.add(up(-900, 900, -900, 900, 0, 4), M.grass);
  b.add(up(-26, 26, WALL.zS, 12, 0.03, 4), M.cobble);
  b.add(up(-2.6, 2.6, -420, WALL.zS, 0.035, 4), M.cobble);
  b.add(up(-12, 12, ALLEY.z0, ALLEY.z1 + 0.4, 0.03, 4), M.cobble);
  b.add(up(KITCHEN[0] - 3.4, KITCHEN[0] + 3.4, KITCHEN[2] - 3.4, KITCHEN[2] + 3.4, 0.058, 4), M.cobble);
  b.add(up(15, 25, -5, 17, 0.052, 4), M.cobble);
  // ---- pendopo ----
  box(b, M.stone, HALL.x0, 0, HALL.z0, HALL.x1, HALL.top - 0.04, HALL.z1);
  b.add(up(HALL.x0, HALL.x1, HALL.z0, HALL.z1, HALL.top, 2.5), M.floor);
  box(b, M.stone, -3.2, 0, HALL.z0 - 1.2, 3.2, 0.3, HALL.z0);
  box(b, M.stone, -3.2, 0.3, HALL.z0 - 0.6, 3.2, HALL.top - 0.04, HALL.z0);
  for (const x of PILLARS_X) for (const z of PILLARS_Z) {
    box(b, M.stone, x - 0.32, HALL.top, z - 0.32, x + 0.32, HALL.top + 0.3, z + 0.32, 0);
    cyl(b, M.pillar, x, HALL.top + 0.3, z, 0.19, HALL.eave - HALL.top - 0.3);
    for (const y of [HALL.top + 0.55, HALL.eave - 0.35]) cyl(b, M.gold, x, y, z, 0.215, 0.12);
  }
  // tie beams under the eave + plank ceiling
  for (const z of PILLARS_Z) box(b, M.wood, PILLARS_X[0] - 0.3, HALL.eave - 0.32, z - 0.13, PILLARS_X[3] + 0.3, HALL.eave, z + 0.13, 0);
  for (const x of PILLARS_X) box(b, M.wood, x - 0.13, HALL.eave - 0.32, PILLARS_Z[0] - 0.3, x + 0.13, HALL.eave, HALL.wallZ, 0);
  b.add(quad(V(HALL.x0 - 1, HALL.eave, HALL.z0 - 1.2), V(HALL.x1 + 1, HALL.eave, HALL.z0 - 1.2), V(HALL.x1 + 1, HALL.eave, HALL.z1 + 0.4), V(HALL.x0 - 1, HALL.eave, HALL.z1 + 0.4)), M.ceil);
  // joglo roof: wide low tier, steep high tier, short ridge; gold finials
  hip(b, M.roof, [HALL.x0 - 1.2, HALL.x1 + 1.2, HALL.z0 - 1.4, HALL.z1 + 0.6], [-4.2, 4.2, 15.6, 23.2], HALL.eave - 0.05, 6.1);
  hip(b, M.roof, [-4.2, 4.2, 15.6, 23.2], [-1.6, 1.6, 19.4, 19.4], 6.1, 9.2);
  for (const x of [-1.6, 1.6]) b.add(new THREE.SphereGeometry(0.22, 12, 8).translate(x, 9.3, 19.4), M.gold);
  // the meeting wall with the loose brick's hole
  const hx0 = HOLE[0] - HOLE_W / 2, hx1 = HOLE[0] + HOLE_W / 2, hy0 = HOLE[1] - HOLE_H / 2, hy1 = HOLE[1] + HOLE_H / 2, wz0 = HALL.wallZ, wz1 = HALL.wallZ1;
  box(b, M.plaster, HALL.x0, 0, wz0, hx0, HALL.eave, wz1);
  box(b, M.plaster, hx1, 0, wz0, HALL.x1, HALL.eave, wz1);
  box(b, M.plaster, hx0, 0, wz0, hx1, hy0, wz1, 0);
  box(b, M.plaster, hx0, hy1, wz0, hx1, HALL.eave, wz1, 0);
  // throne on a low dais, the red-gold drape behind it, the courtiers' bench
  const [tx, ty, tz] = THRONE;
  box(b, M.stone, tx - 1.4, ty, tz - 1.1, tx + 1.4, ty + 0.2, tz + 1.1, 0);
  box(b, M.gold, tx - 0.75, ty + 0.2, tz - 0.4, tx + 0.75, ty + 0.62, tz + 0.35, 0);
  box(b, M.red, tx - 0.62, ty + 0.62, tz - 0.36, tx + 0.62, ty + 0.72, tz + 0.3, 0);
  box(b, M.gold, tx - 0.82, ty + 0.62, tz + 0.3, tx + 0.82, ty + 2.6, tz + 0.48, 0);
  box(b, M.red, tx - 0.6, ty + 0.8, tz + 0.28, tx + 0.6, ty + 2.4, tz + 0.31, 0);
  for (const s of [-1, 1]) box(b, M.gold, tx + s * 0.75 - 0.08, ty + 0.62, tz - 0.4, tx + s * 0.75 + 0.08, ty + 1.05, tz + 0.35, 0);
  b.add(new THREE.SphereGeometry(0.16, 12, 8).translate(tx, ty + 2.75, tz + 0.39), M.gold);
  b.add(quad(V(tx - 1.7, ty + 0.3, wz0 - 0.02), V(tx + 1.7, ty + 0.3, wz0 - 0.02), V(tx + 1.7, 3.95, wz0 - 0.02), V(tx - 1.7, 3.95, wz0 - 0.02), 1.2, 1.2), M.drape);
  box(b, M.wood, BENCH_X - 0.4, HALL.top, 15.2, BENCH_X + 0.4, HALL.top + 0.45, 20.8, 0);
  // ---- alley: back wall of the compound, a drain gutter ----
  box(b, M.brick, -WALL.x, 0, ALLEY.z1, WALL.x, 3.6, ALLEY.z1 + 0.5);
  for (let x = -WALL.x; x < WALL.x; x += 3) box(b, M.stone, x, 3.6, ALLEY.z1 - 0.05, x + 3, 3.8, ALLEY.z1 + 0.55, 0);
  box(b, M.stone, -12, 0, ALLEY.z0 + 0.05, 12, 0.08, ALLEY.z0 + 0.45, 0);
  // ---- compound wall + split gate ----
  const wallSeg = (x0: number, z0: number, x1: number, z1: number) => {
    box(b, M.brick, x0, 0, z0, x1, 3.2, z1);
    box(b, M.stone, x0 - 0.1, 3.2, z0 - 0.1, x1 + 0.1, 3.42, z1 + 0.1);
  };
  const gx = GATE_W / 2, tw = 4.6;
  wallSeg(-WALL.x, WALL.zS - 0.6, -gx - tw, WALL.zS);
  wallSeg(gx + tw, WALL.zS - 0.6, WALL.x, WALL.zS);
  wallSeg(-WALL.x - 0.6, WALL.zS, -WALL.x, ALLEY.z1);
  wallSeg(WALL.x, WALL.zS, WALL.x + 0.6, ALLEY.z1);
  for (const s of [-1, 1]) { // candi bentar: a stepped brick tower split down the middle
    const xi = s * gx, xo = s * (gx + tw), zc = WALL.zS - 0.3;
    const tiers: [number, number, number][] = [[0, 3.4, 1.4], [3.4, 5.6, 1.05], [5.6, 7.4, 0.75], [7.4, 8.8, 0.45], [8.8, 9.6, 0.2]];
    tiers.forEach(([y0, y1, dz], k) => {
      const inset = k * 0.55;
      box(b, M.brick, xi, y0, zc - dz, xo - s * inset, y1, zc + dz);
      if (k < tiers.length - 1) box(b, M.stone, xi, y1 - 0.12, zc - dz - 0.08, xo - s * (inset - 0.08), y1 + 0.02, zc + dz + 0.08, 0);
    });
  }
  // ---- banyan trees and gardens inside the compound ----
  for (const [x, z, h] of [[-11, -25, 11], [11, -25, 11.5]] as const) prop(b, kit, "tree_fat", x, 0, z, h);
  for (const [x, z] of [[-18, 18], [16, 22], [-36, 4], [36, -10], [-38, -34], [38, -32], [-14, 26.8], [12, 27.2]] as const)
    prop(b, kit, (x + z) % 2 ? "tree_oak" : "tree_default", x, 0, z, 6 + ((x * z) % 3));
  for (const [x, z] of [[-8.5, 10], [8.5, 10], [-8.5, 4], [8.5, 4]] as const) prop(b, kit, "plant_bushLarge", x, 0, z, 1.1);
  // ---- Raja Surya's tomb: stepped stone, two headstones, a low fence, a frangipani tree ----
  const [mx, , mz] = TOMB;
  box(b, M.stone, mx - 1.3, 0, mz - 0.75, mx + 1.3, 0.38, mz + 0.75, 0);
  box(b, M.floor, mx - 1.05, 0.38, mz - 0.52, mx + 1.05, 0.7, mz + 0.52, 0);
  for (const s of [-1, 1]) box(b, M.stone, mx + s * 0.9 - 0.13, 0.7, mz - 0.18, mx + s * 0.9 + 0.13, 1.35, mz + 0.18, 0);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, x = mx + Math.cos(a) * 2.4, z = mz + Math.sin(a) * 1.8;
    box(b, M.wood, x - 0.05, 0, z - 0.05, x + 0.05, 0.75, z + 0.05, 0);
  }
  prop(b, kit, "tree_default", mx - 3.2, 0, mz + 2.4, 5);
  // easel for the portrait
  const [ex, , ez] = EASEL;
  for (const dz of [-0.35, 0.35]) box(b, M.wood, ex - 0.04, 0, ez + dz - 0.04, ex + 0.04, 1.9, ez + dz + 0.04, 0);
  box(b, M.wood, ex - 0.06, 0.88, ez - 0.45, ex + 0.06, 0.95, ez + 0.45, 0);
  // ---- kitchen: open shed, hearth, pot, shelf with jars, a batik curtain ----
  const [kx, , kz] = KITCHEN;
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [-3, 0], [3, 0]]) box(b, M.wood, kx + dx - 0.1, 0, kz + dz - 0.1, kx + dx + 0.1, 3.0, kz + dz + 0.1, 0);
  b.add(quad(V(kx - 3.6, 2.9, kz - 3.6), V(kx + 3.6, 2.9, kz - 3.6), V(kx + 3.6, 4.4, kz), V(kx - 3.6, 4.4, kz), 2.4, 1.3), M.roofK);
  b.add(quad(V(kx + 3.6, 2.9, kz + 3.6), V(kx - 3.6, 2.9, kz + 3.6), V(kx - 3.6, 4.4, kz), V(kx + 3.6, 4.4, kz), 2.4, 1.3), M.roofK);
  const [hx, , hz] = HEARTH;
  box(b, M.stone, hx - 1.2, 0, hz - 0.6, hx + 1.2, 0.68, hz + 0.6, 0);
  b.add(new THREE.CylinderGeometry(0.32, 0.26, 0.42, 16).translate(hx, 0.68 + 0.21, hz), M.iron);
  box(b, M.wood, kx - 2.9, 0, kz - 2.2, kx - 2.5, 1.9, kz + 2.2, 0);
  for (const [y, z] of [[0.6, -1.4], [0.6, -0.5], [1.3, 0.6], [1.3, 1.4], [0.6, 1.1]]) b.add(new THREE.CylinderGeometry(0.16, 0.12, 0.38, 12).translate(kx - 2.7, y + 0.19, kz + z), M.jar);
  b.add(quad(V(kx + 2.6, 0.25, kz + 2.95), V(kx - 0.6, 0.25, kz + 2.95), V(kx - 0.6, 2.6, kz + 2.95), V(kx + 2.6, 2.6, kz + 2.95), 1, 1), M.cloth);
  // ---- barracks: long house, empty weapon racks, the generals' table and stools, the courier's desk ----
  house(b, BARRACKS[0], BARRACKS[2], -Math.PI / 2, 14, 7, 4.2, 1, 0);
  for (const z of RACK_Z) {
    for (const dz of [-1.1, 1.1]) box(b, M.wood, RACK_X - 0.07, 0, z + dz - 0.07, RACK_X + 0.07, 1.9, z + dz + 0.07, 0);
    for (const y of [0.55, 1.6]) box(b, M.wood, RACK_X - 0.06, y, z - 1.2, RACK_X + 0.06, y + 0.1, z + 1.2, 0);
  }
  const table = (x: number, z: number, w: number, d: number, h: number) => {
    box(b, M.planks, x - w / 2, h - 0.08, z - d / 2, x + w / 2, h, z + d / 2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, M.wood, x + sx * (w / 2 - 0.1) - 0.05, 0, z + sz * (d / 2 - 0.1) - 0.05, x + sx * (w / 2 - 0.1) + 0.05, h - 0.08, z + sz * (d / 2 - 0.1) + 0.05, 0);
  };
  table(TABLE[0], TABLE[2], 2.2, 1.3, TABLE_H);
  for (const [dx, dz] of [[-1.5, 0], [1.5, 0], [0, 1.1]]) cyl(b, M.wood, TABLE[0] + dx, 0, TABLE[2] + dz, 0.22, 0.45, 10);
  table(COURIER_DESK[0], COURIER_DESK[2], 1.4, 0.8, DESK_H);
  table(PATIH_DESK[0], PATIH_DESK[2], 1.0, 1.6, DESK_H);
  // the patih's quarters: a house facing the plaza (+x); papers stacked on his desk
  house(b, -27, PATIH_DESK[2], Math.PI / 2, 10, 7, 4.2, 4, 0);
  box(b, M.paper, PATIH_DESK[0] - 0.3, DESK_H, PATIH_DESK[2] + 0.35, PATIH_DESK[0] + 0.15, DESK_H + 0.12, PATIH_DESK[2] + 0.7, 0);
  // ---- the town outside the gate, and around the compound ----
  const r = rng(23);
  for (const s of [-1, 1]) for (let z = WALL.zS - 9; z > -150; z -= 9 + Math.floor(r() * 3)) {
    const w = 7 + Math.floor(r() * 2) * 2;
    house(b, s * (5 + 3.5 + r() * 1.5), z, s > 0 ? -Math.PI / 2 : Math.PI / 2, w, 7, 4.2 + Math.floor(r() * 3) * 1.4, Math.floor(r() * 8), 0);
  }
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, d = 60 + r() * 90, x = Math.cos(a) * d, z = Math.sin(a) * d + 10;
    if (Math.abs(x) < 14 && z < 0) continue; // keep the road clear
    prop(b, kit, ["tree_oak", "tree_default", "tree_fat", "tree-high-round"][i % 4], x, 0, z, 7 + r() * 5);
  }
  // ---- the north fortress on its hill ----
  const [fx, , fz] = FORT;
  b.add(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(140, 34, 90).translate(fx, -2, fz), M.hill);
  box(b, M.fort, fx - 30, 30, fz - 18, fx + 30, 44, fz + 18);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(b, M.fort, fx + sx * 30 - 6, 30, fz + sz * 18 - 6, fx + sx * 30 + 6, 52, fz + sz * 18 + 6);
    b.add(new THREE.ConeGeometry(8.5, 10, 4).rotateY(Math.PI / 4).translate(fx + sx * 30, 57, fz + sz * 18), M.roof);
  }
  b.build(root);

  // ---- dynamic / unlit parts ----
  const brickMesh = new THREE.Mesh(new THREE.BoxGeometry(HOLE_W - 0.01, HOLE_H - 0.01, HALL.wallZ1 - HALL.wallZ), lam("looseBrick", () => ({ map: rep(brick(), 0.3, 0.3), color: "#e6c2a8" })));
  brickMesh.position.set(HOLE[0], HOLE[1], HOLE[2]); brickMesh.castShadow = true; brickMesh.receiveShadow = true;
  root.add(brickMesh);
  // lanterns: a small roofed lamp whose glass is an unlit HDR colour (bloom picks it up); world.ts dims it by day
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 0.9) });
  const lb = new Batch();
  for (const [x, y, z] of LANTERNS) {
    lb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 10).translate(x, y, z), lanternMat);
    lb.add(new THREE.ConeGeometry(0.17, 0.14, 8).translate(x, y + 0.2, z), M.iron);
    lb.add(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10).translate(x, y - 0.15, z), M.iron);
  }
  lb.build(root, false);
  // the portraits: one on the meeting wall (facing -z, into the hall), one on the easel by the tomb (facing +x)
  const portraitMats: THREE.MeshBasicMaterial[] = [];
  for (const [pos, yaw, s] of [[PORTRAIT, Math.PI, 1.1], [[EASEL[0] + 0.08, 1.55, EASEL[2]] as V3, Math.PI / 2, 0.95]] as const) {
    const m = new THREE.MeshBasicMaterial({ map: portraitTex, alphaTest: 0.5, color: 0xe6e6e6 });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.78 * s, 1.0 * s), m);
    pm.position.set(pos[0], pos[1], pos[2]); pm.rotation.y = yaw;
    root.add(pm); portraitMats.push(m);
  }
  return { brick: brickMesh, lanternMat, portraitMats };
};
