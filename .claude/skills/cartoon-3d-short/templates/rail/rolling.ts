// The rolling stock of "Stopped by Thin Air", built from primitives (period 1860s American look): a 4-4-0 locomotive
// with a balloon stack, cowcatcher, big headlamp, brass domes and a wooden cab; its tender; wooden boxcars with a roof
// walk and a brake wheel on top; yellow passenger coaches with clerestory roofs and end platforms. Every car is its own
// group (local +x forward, y = 0 on the rail top, z = 0 on the track centre), so world.ts can move whole trains, spin
// the spoked wheels, push the brake shoes onto the treads and let a hose part.
import * as THREE from "three";
import { Batch, boxGeo, V, lam } from "./build";
import { ctex } from "./paint";
import { NOINK } from "./ink";
import { LOCO, BOX, COACH, GAP } from "./layout";

export type Kind = "loco" | "tender" | "box" | "coach" | "coachOpen";
export type Wheel = { o: THREE.Object3D; r: number };
export type Shoe = { o: THREE.Object3D; x0: number; dir: number };
export type Car = {
  kind: Kind; g: THREE.Group; len: number; front: number; back: number; wheels: Wheel[]; shoes: Shoe[];
  /** boxcar: the brake wheel on the roof (spins about y) */
  brakeWheel?: THREE.Object3D;
  /** loco: the brake lever in the cab, the air pump's piston rod, the side rods, the headlamp glass, the whistle */
  lever?: THREE.Object3D; pumpRod?: THREE.Object3D; rods?: { o: THREE.Object3D; x0: number; r: number }[]; lamp?: THREE.MeshBasicMaterial;
};
export type Hose = { a: THREE.Object3D; b: THREE.Object3D; x: number };
export type Consist = { g: THREE.Group; cars: Car[]; hoses: Hose[]; offsets: number[] };

const M = () => ({
  iron: lam("rsIron", () => ({ color: "#2c2c34" })),
  ironL: lam("rsIronL", () => ({ color: "#4a4a54" })),
  red: lam("rsRed", () => ({ color: "#b8342c" })),
  green: lam("rsGreen", () => ({ map: boilerTex() })),
  brass: lam("rsBrass", () => ({ color: "#e0b040" })),
  cab: lam("rsCab", () => ({ map: plankTex("cab", "#8c3a2c", true) })),
  cabIn: lam("rsCabIn", () => ({ color: "#5a2a22" })),
  roof: lam("rsRoof", () => ({ color: "#3a3440" })),
  box: lam("rsBox", () => ({ map: boxcarTex() })),
  boxEnd: lam("rsBoxEnd", () => ({ map: plankTex("boxEnd", "#94462a", true) })),
  walk: lam("rsWalk", () => ({ color: "#7a5a3a" })),
  coach: lam("rsCoach", () => ({ map: coachTex() })),
  coachEnd: lam("rsCoachEnd", () => ({ map: panelTex() })),
  coachIn: lam("rsCoachIn", () => ({ color: "#6a3a2a" })),
  seat: lam("rsSeat", () => ({ color: "#8a2a34" })),
  floor: lam("rsFloor", () => ({ color: "#5a3a2a" })),
  coal: lam("rsCoal", () => ({ color: "#1e1c22" })),
  hose: lam("rsHose", () => ({ color: "#c8322e" })),
});

/** vertical plank boards with dark seams (car sides) */
const plankTex = (key: string, col: string, vertical: boolean) => ctex("plank" + key, 512, 512, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 512, 512);
  const c = new THREE.Color(col);
  for (let i = 0; i < 16; i++) {
    const k = 0.9 + r() * 0.16, cc = c.clone().multiplyScalar(k);
    g.fillStyle = "#" + cc.getHexString();
    if (vertical) g.fillRect(i * 32 + 2, 0, 28, 512); else g.fillRect(0, i * 32 + 2, 512, 28);
  }
  g.fillStyle = "rgba(30,14,10,0.75)";
  for (let i = 0; i <= 16; i++) if (vertical) g.fillRect(i * 32 - 2, 0, 4, 512); else g.fillRect(0, i * 32 - 2, 512, 4);
});
/** the coach side: ochre yellow, a dark red letterboard and belt line, window shapes painted dark (for closed coaches) */
/** the boxcar side (1024 x 300 over 8.6 x 2.5 m): weathered red planks, a darker frame, a Howe-truss brace each side
 *  of the door, door rails, lettering, rust streaks */
const boxcarTex = () => ctex("boxcarSide", 1024, 300, (g, r) => {
  g.fillStyle = "#94462e"; g.fillRect(0, 0, 1024, 300);
  for (let i = 0; i < 64; i++) { const k = 0.88 + r() * 0.18; g.fillStyle = `rgba(${Math.round(148 * k)},${Math.round(70 * k)},${Math.round(46 * k)},1)`; g.fillRect(i * 16 + 1, 0, 14, 300); }
  g.fillStyle = "rgba(40,16,10,0.55)"; for (let i = 0; i <= 64; i++) g.fillRect(i * 16 - 1, 0, 2, 300);
  g.fillStyle = "#6a2c1e"; g.fillRect(0, 0, 1024, 18); g.fillRect(0, 280, 1024, 20); g.fillRect(0, 0, 20, 300); g.fillRect(1004, 0, 20, 300);
  g.strokeStyle = "#6a2c1e"; g.lineWidth = 14;
  for (const [x0, x1] of [[20, 420], [604, 1004]]) { g.strokeRect(x0, 18, x1 - x0, 262); g.beginPath(); g.moveTo(x0, 280); g.lineTo((x0 + x1) / 2, 18); g.lineTo(x1, 280); g.stroke(); }
  g.fillStyle = "#3a2a24"; g.fillRect(400, 30, 224, 8); g.fillRect(400, 266, 224, 8);
  g.fillStyle = "#f2e2c0"; g.font = "900 46px Georgia, serif"; g.textAlign = "center"; g.fillText("P. R. R.", 220, 120); g.font = "900 34px Georgia, serif"; g.fillText("No. 2214", 220, 168);
  for (let i = 0; i < 14; i++) { const x = r() * 1024, y = 20 + r() * 60, l = 40 + r() * 120; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, "rgba(60,30,18,0.35)"); gr.addColorStop(1, "rgba(60,30,18,0)"); g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 4, l); }
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(30,20,20,0.7)"; g.beginPath(); g.arc(30 + (i % 20) * 50, i < 20 ? 9 : 290, 3, 0, 7); g.fill(); }
});
/** varnished ochre panelling (inside the open coach, end walls) */
const panelTex = () => ctex("coachPanel", 512, 256, (g) => {
  g.fillStyle = "#c08f3c"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#8a5a24"; g.lineWidth = 8; for (let i = 0; i < 4; i++) g.strokeRect(12 + i * 125, 20, 110, 216);
  g.strokeStyle = "rgba(255,230,170,0.35)"; g.lineWidth = 3; for (let i = 0; i < 4; i++) g.strokeRect(20 + i * 125, 28, 94, 200);
});
/** the boiler jacket (wraps round the cylinder): Russia-iron green with a sheen along the top, rivet rows */
const boilerTex = () => ctex("boilerJacket", 512, 512, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#24503a"); gr.addColorStop(0.22, "#3f8060"); gr.addColorStop(0.3, "#2f6a4a"); gr.addColorStop(1, "#24503a");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(20,30,24,0.8)"; for (let x = 0; x < 512; x += 128) for (let y = 8; y < 512; y += 22) { g.beginPath(); g.arc(x + 6, y, 3.2, 0, 7); g.fill(); }
});
const runnerTex = () => ctex("coachRunner", 256, 64, (g) => {
  g.fillStyle = "#8a2a30"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#c9a24e"; g.fillRect(0, 6, 256, 4); g.fillRect(0, 54, 256, 4);
  for (let x = 16; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 32 - 10); g.lineTo(x + 10, 32); g.lineTo(x, 42); g.lineTo(x - 10, 32); g.fill(); }
});
const coachTex = () => ctex("coachSide", 1024, 256, (g) => {
  g.fillStyle = "#c99a44"; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = "#9a6a2c"; g.lineWidth = 6; for (let k = 0; k < 8; k++) g.strokeRect(58 + k * 118, 52, 80, 96);
  g.strokeStyle = "#e8c070"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 168); g.lineTo(1024, 168); g.stroke();
  g.fillStyle = "#7a2a24"; g.fillRect(0, 0, 1024, 40); g.fillRect(0, 150, 1024, 12);
  g.fillStyle = "#f2d27a"; g.font = "900 30px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("PAN HANDLE", 512, 21);
  for (let k = 0; k < 8; k++) { const x = 70 + k * 118; g.fillStyle = "#2a2a3a"; g.fillRect(x, 60, 56, 80); g.strokeStyle = "#7a2a24"; g.lineWidth = 6; g.strokeRect(x, 60, 56, 80); }
});

const cylX = (r: number, x0: number, x1: number, y: number, z: number, seg = 20) => new THREE.CylinderGeometry(r, r, x1 - x0, seg).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z);
const cylY = (r0: number, r1: number, y0: number, y1: number, x: number, z: number, seg = 18) => new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(x, (y0 + y1) / 2, z);
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 0) =>
  boxGeo(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tile);

/** a spoked wheel at (x, r, z): an iron tyre ring, n spokes, a hub; its own group so it can spin about z */
const wheel = (car: Car, x: number, r: number, z: number, spokeM: THREE.Material, n = 10) => {
  const mm = M(), g = new THREE.Group(), b = new Batch();
  if (r > 0.7) b.add(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.06, 20, 1, false, -0.9, 1.8).rotateX(Math.PI / 2).translate(0, 0, 0.03), mm.iron);
  b.add(new THREE.TorusGeometry(r - 0.05, 0.06, 8, 32), mm.iron);
  b.add(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.04, 28).rotateX(Math.PI / 2).translate(0, 0, -0.06), lam("rsDisc", () => ({ color: "#1e1e24" })));
  for (let k = 0; k < n; k++) b.add(new THREE.BoxGeometry(r * 0.92, 0.055, 0.05).translate(r * 0.46, 0, 0.02).rotateZ((k / n) * Math.PI * 2), spokeM);
  b.add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.14, 14).rotateX(Math.PI / 2), spokeM);
  b.build(g);
  g.position.set(x, r, z);
  car.g.add(g); car.wheels.push({ o: g, r });
  return g;
};
/** a brake shoe beside a wheel's tread (dir = +1: on the wheel's +x side); world.ts slides it onto the tread */
const shoe = (car: Car, x: number, r: number, z: number, dir: number) => {
  const mm = M(), o = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), lam("rsShoe", () => ({ color: "#3a6ab8" })));
  const x0 = x + dir * (r + 0.13);
  o.position.set(x0, r, z); o.castShadow = true; car.g.add(o); car.shoes.push({ o, x0, dir });
};
/** a two-axle truck under a car at local x: 4 wheels (2 per side, only the lens side gets brake shoes drawn big) */
const truck = (car: Car, b: Batch, x: number, r: number, w: number) => {
  const mm = M();
  for (const s of [-1, 1]) for (const dx of [-0.75, 0.75]) {
    wheel(car, x + dx, r, s * (w / 2), mm.ironL, 8);
    shoe(car, x + dx, r, s * (w / 2 + 0.2), dx < 0 ? 1 : -1);
  }
  for (const s of [-1, 1]) b.add(bx(x - 1.2, r - 0.12, s * (w / 2 + 0.1) - 0.05, x + 1.2, r + 0.12, s * (w / 2 + 0.1) + 0.05), mm.iron); // side frame
  b.add(bx(x - 0.3, r + 0.12, -w / 2, x + 0.3, r + 0.3, w / 2), mm.iron);
};
/** the train pipe along a car's lens side at y 0.8 (the red hoses join them between cars) */
const pipe = (b: Batch, x0: number, x1: number) => b.add(cylX(0.06, x0, x1, 0.82, 1.22, 8), lam("rsPipe", () => ({ color: "#b8bcc4" })));

const newCar = (kind: Kind, len: number): Car => ({ kind, g: new THREE.Group(), len, front: len / 2, back: -len / 2, wheels: [], shoes: [] });

// ---------------- the locomotive ----------------
const loco = (): Car => {
  const mm = M(), car = newCar("loco", LOCO.len), b = new Batch(), bCab = new Batch();
  car.front = LOCO.nose; car.back = LOCO.nose - LOCO.len;
  const bc = 1.95, br = 0.72;
  // frame and running boards
  b.add(bx(-3.7, 0.98, -1.05, 3.9, 1.12, 1.05), mm.iron);
  for (const s of [-1, 1]) b.add(bx(-1.6, 1.5, s * 1.2 - 0.18, 3.3, 1.56, s * 1.2 + 0.18), mm.iron);
  // boiler, brass bands, smokebox, stack, headlamp, domes, bell, whistle
  b.add(cylX(br, -1.7, 3.2, bc, 0), mm.green);
  for (const s of [-1, 1]) { b.add(cylX(0.022, -1.6, 3.9, bc + 0.32, s * (br + 0.12), 6), mm.brass); for (const x of [-1.2, 0.4, 2.0, 3.5]) b.add(bx(x - 0.02, bc + 0.12, s * (br + 0.02), x + 0.02, bc + 0.34, s * (br + 0.12)), mm.brass); }
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24).rotateZ(Math.PI / 2).translate(4.08, bc, 0), mm.ironL);
  b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20).rotateZ(Math.PI / 2).translate(4.12, bc + 0.05, 0), mm.brass);
  for (const x of [-1.1, 0.2, 1.6, 2.8]) b.add(cylX(br + 0.025, x, x + 0.1, bc, 0), mm.brass);
  b.add(cylX(br + 0.05, 3.2, 4.05, bc, 0), mm.iron);
  b.add(new THREE.CircleGeometry(br + 0.05, 24).rotateY(Math.PI / 2).translate(4.051, bc, 0), mm.ironL);
  b.add(cylY(0.2, 0.2, bc + 0.6, bc + 1.25, 3.62, 0), mm.iron);
  b.add(cylY(0.22, 0.62, bc + 1.25, bc + 1.95, 3.62, 0), mm.iron);       // balloon stack
  b.add(cylY(0.64, 0.64, bc + 1.95, bc + 2.05, 3.62, 0), mm.ironL);
  b.add(bx(3.62, bc + 0.72, -0.34, 4.12, bc + 1.18, 0.34), lam("rsLampBox", () => ({ color: "#1e3a2a" })));
  b.add(bx(3.66, bc + 1.18, -0.38, 4.16, bc + 1.24, 0.38), mm.brass);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 0.9) });
  const lm = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20).rotateY(Math.PI / 2).translate(4.125, bc + 0.95, 0), lamp); lm.layers.set(NOINK); car.g.add(lm);
  car.lamp = lamp;
  b.add(cylY(0.32, 0.32, bc + 0.5, bc + 0.95, 1.1, 0), mm.brass); b.add(new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(1.1, bc + 0.95, 0), mm.brass);
  b.add(cylY(0.24, 0.24, bc + 0.5, bc + 0.82, 2.35, 0), mm.brass); b.add(new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(2.35, bc + 0.82, 0), mm.brass);
  b.add(cylY(0.16, 0.22, bc + 0.62, bc + 0.9, 2.95, 0), mm.brass);
  b.add(cylY(0.05, 0.05, bc + 0.6, bc + 0.95, -1.35, 0), mm.brass); b.add(cylY(0.09, 0.09, bc + 0.95, bc + 1.12, -1.35, 0), mm.brass); // whistle
  // cylinders and steam chests, the air pump on the lens side (its piston rod moves)
  for (const s of [-1, 1]) { b.add(cylX(0.3, 2.5, 3.5, 1.22, s * 1.12), mm.ironL); b.add(bx(2.55, 1.45, s * 1.12 - 0.22, 3.45, 1.8, s * 1.12 + 0.22), mm.ironL); }
  b.add(cylY(0.26, 0.26, 1.56, 2.5, 0.7, 1.2), mm.brass); for (const y of [1.75, 2.1]) b.add(cylY(0.28, 0.28, y, y + 0.06, 0.7, 1.2), mm.iron); b.add(cylY(0.3, 0.3, 2.5, 2.6, 0.7, 1.2), mm.iron);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mm.ironL); rod.position.set(0.7, 2.8, 1.2); car.g.add(rod); car.pumpRod = rod;
  b.add(cylX(0.18, -3.4, -1.9, 0.72, 0.55, 12), mm.iron); // the main reservoir under the cab
  pipe(b, -3.6, -1.9);
  // the cowcatcher: a red V of slats in front
  for (let k = -4; k <= 4; k++) {
    const z = k * 0.24, x = 3.95 + 0.62 * (1 - Math.abs(k) / 4);
    b.add(bx(3.92, 0.12, z - 0.04, x + 0.02, 0.98, z + 0.04), mm.red);
  }
  b.add(bx(3.9, 0.85, -1.05, 4.0, 1.0, 1.05), mm.red);
  // the cab (walls round a window opening on each side), its roof; the lever inside
  const cx0 = -3.65, cx1 = -1.55, cy0 = 1.12, cy1 = 3.25, wz = 1.2, wx0 = -3.3, wx1 = -2.0, wy0 = 2.05, wy1 = 2.85;
  for (const s of [-1, 1]) {
    const z0 = s * wz - 0.04, z1 = s * wz + 0.04;
    bCab.add(bx(cx0, cy0, z0, cx1, wy0, z1, 1.2), mm.cab); bCab.add(bx(cx0, wy1, z0, cx1, cy1, z1, 1.2), mm.cab);
    bCab.add(bx(cx0, wy0, z0, wx0, wy1, z1, 1.2), mm.cab); bCab.add(bx(wx1, wy0, z0, cx1, wy1, z1, 1.2), mm.cab);
    b.add(bx(wx0 - 0.05, wy0 - 0.06, s * (wz + 0.05) - 0.02, wx1 + 0.05, wy0, s * (wz + 0.05) + 0.02), mm.brass);
  }
  bCab.add(bx(cx1 - 0.08, cy0, -wz, cx1, cy1, wz, 1.2), mm.cab); // the front wall (round the boiler)
  bCab.add(bx(cx0 - 0.2, cy1, -wz - 0.25, cx1 + 0.3, cy1 + 0.1, wz + 0.25), mm.roof);
  bCab.add(bx(cx0, cy0, -wz, cx1, cy0 + 0.04, wz), mm.cabIn); // the cab floor
  const lever = new THREE.Group(); lever.position.set(-2.45, 1.45, 0.9);
  const lv = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8).translate(0, 0.39, 0), mm.brass); lv.castShadow = true; lever.add(lv);
  const kn = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8).translate(0, 0.8, 0), mm.red); lever.add(kn);
  b.add(cylY(0.12, 0.12, 1.25, 1.5, -2.45, 0.9), mm.brass); // the valve body the lever sits on
  car.g.add(lever); car.lever = lever;
  // wheels: four red drivers (with side rods), a leading truck
  car.rods = [];
  for (const s of [-1, 1]) {
    for (const x of [-0.45, 1.35]) { wheel(car, x, LOCO.drv, s * 1.0, mm.red, 14); shoe(car, x, LOCO.drv, s * 1.0, x < 0 ? 1 : -1); }
    const rd = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 0.06), mm.ironL); rd.castShadow = true;
    rd.position.set(0.45, LOCO.drv, s * 1.1); car.g.add(rd); car.rods.push({ o: rd, x0: 0.45, r: 0.36 });
    for (const x of [2.55, 3.35]) wheel(car, x, LOCO.lead, s * 0.85, mm.ironL, 8);
  }
  b.build(car.g); bCab.build(car.g, false);
  return car;
};
const tender = (): Car => {
  const mm = M(), car = newCar("tender", LOCO.tender), b = new Batch(), h = LOCO.tender / 2;
  b.add(bx(-h, 1.0, -1.25, h, 2.25, 1.25, 1.4), mm.cab);
  b.add(bx(-h - 0.04, 2.25, -1.29, h + 0.04, 2.33, 1.29), mm.brass);
  b.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.9, 0.55, 1.05).translate(0.6, 2.25, 0), mm.coal);
  for (const x of [-1.4, 1.4]) truck(car, b, x, 0.42, 2.0);
  pipe(b, -h, h);
  b.build(car.g);
  return car;
};
// ---------------- the boxcar ----------------
const boxcar = (): Car => {
  const mm = M(), car = newCar("box", BOX.len), b = new Batch(), h = BOX.len / 2, w = BOX.w / 2, y0 = BOX.floor, y1 = BOX.floor + BOX.h;
  b.add(bx(-h, y0, -w, h, y1, w, 2.5), mm.box);
  for (const s of [-1, 1]) b.add(bx(-0.75, y0 + 0.1, s * (w + 0.02) - 0.02, 0.75, y1 - 0.15, s * (w + 0.02) + 0.02, 1.4), mm.boxEnd); // the sliding door
  b.add(bx(-h - 0.12, y1, -w - 0.12, h + 0.12, y1 + 0.1, w + 0.12), mm.roof);
  b.add(bx(-h - 0.1, y1 + 0.1, -0.28, h + 0.1, y1 + 0.17, 0.28), mm.walk); // the roof walk the brakemen run along
  for (const s of [-1, 1]) b.add(bx(-h - 0.05, y1 + 0.1, s * 0.3, h + 0.05, y1 + 0.16, s * (w + 0.08)), lam("rsSnow", () => ({ color: "#eef3fa" }))); // snow on the roof
  // the brake wheel on its staff at the front end, above the roof
  const bw = new THREE.Group(); bw.position.set(h - 0.45, y1 + 0.17, 0.75);
  const bwb = new Batch();
  bwb.add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8).translate(0, 0.35, 0), mm.iron);
  bwb.add(new THREE.TorusGeometry(0.3, 0.035, 8, 24).rotateX(Math.PI / 2).translate(0, 0.72, 0), mm.iron);
  for (let k = 0; k < 4; k++) bwb.add(new THREE.BoxGeometry(0.58, 0.03, 0.03).rotateY((k * Math.PI) / 4).translate(0, 0.72, 0), mm.iron);
  bwb.build(bw); car.g.add(bw); car.brakeWheel = bw;
  for (const x of [-h + 1.6, h - 1.6]) truck(car, b, x, BOX.wheel, 2.0);
  b.add(bx(-h, 0.95, -1.0, h, y0, 1.0), mm.iron); // the underframe
  pipe(b, -h, h);
  b.build(car.g);
  return car;
};
// ---------------- the coach (open = real window holes on the lens side, seats inside) ----------------
const coach = (open: boolean): Car => {
  const mm = M(), car = newCar(open ? "coachOpen" : "coach", COACH.len), b = new Batch(), bIn = new Batch();
  const h = COACH.len / 2 - 0.7, w = COACH.w / 2, y0 = COACH.floor, y1 = COACH.floor + COACH.h, wy0 = y0 + 0.85, wy1 = y0 + 1.75;
  const wins = Array.from({ length: 8 }, (_, k) => -h + 0.75 + k * ((2 * h - 1.5) / 7));
  const side = (s: number, holes: boolean) => {
    const z0 = s * w - 0.05, z1 = s * w + 0.05;
    if (!holes) { b.add(bx(-h, y0, z0, h, y1, z1), mm.coach); return; }
    bIn.add(bx(-h, y0, z0, h, wy0, z1), mm.coachEnd); bIn.add(bx(-h, wy1, z0, h, y1, z1), mm.coachEnd);
    let x = -h;
    for (const c of wins) { bIn.add(bx(x, wy0, z0, c - 0.32, wy1, z1), mm.coachEnd); x = c + 0.32; }
    bIn.add(bx(x, wy0, z0, h, wy1, z1), mm.coachEnd);
    bIn.add(bx(-h, y1 - 0.42, s * (w + 0.06) - 0.01, h, y1 - 0.12, s * (w + 0.06) + 0.01), lam("rsLetter", () => ({ color: "#7a2a24" })));
  };
  side(1, open); side(-1, false);
  for (const s of [-1, 1]) b.add(bx(s * h - 0.05, y0, -w, s * h + 0.05, y1, w), mm.coachEnd);
  // the clerestory and the roof
  b.add(bx(-h - 0.5, y1, -w - 0.15, h + 0.5, y1 + 0.12, w + 0.15), mm.roof);
  b.add(bx(-h, y1 + 0.12, -0.75, h, y1 + 0.5, 0.75), lam("rsClere", () => ({ color: "#c89838" })));
  b.add(bx(-h - 0.2, y1 + 0.5, -0.9, h + 0.2, y1 + 0.58, 0.9), mm.roof);
  // end platforms with railings and a brake wheel at the front one
  for (const s of [-1, 1]) {
    const xp = s * (h + 0.35);
    b.add(bx(xp - 0.35, y0 - 0.08, -w + 0.1, xp + 0.35, y0, w - 0.1), mm.floor);
    for (const zz of [-w + 0.15, w - 0.15]) b.add(cylY(0.03, 0.03, y0, y0 + 1.0, s * (h + 0.65), zz, 8), mm.iron);
    b.add(cylX(0.03, -0.0001 + s * (h + 0.62), s * (h + 0.68), y0 + 1.0, 0, 6), mm.iron);
  }
  b.add(bx(h + 0.62, y0 + 1.0, -w + 0.15, h + 0.68, y0 + 1.04, w - 0.15), mm.iron);
  b.add(bx(-h - 0.68, y0 + 1.0, -w + 0.15, -h - 0.62, y0 + 1.04, w - 0.15), mm.iron);
  b.add(cylY(0.025, 0.025, y0, y0 + 1.25, h + 0.3, 0.9, 8), mm.iron);
  b.add(new THREE.TorusGeometry(0.22, 0.03, 8, 20).rotateX(Math.PI / 2).translate(h + 0.3, y0 + 1.25, 0.9), mm.iron);
  // inside: floor, seats facing forward, a dark back wall
  bIn.add(bx(-h, y0, -w + 0.05, h, y0 + 0.1, w - 0.05), lam("rsFloorPlanks", () => ({ map: plankTex("coachFloor", "#6a4a30", false) })));
  if (open) {
    bIn.add(bx(-h, y0 + 0.1, -0.05, h, y0 + 0.112, 0.75), lam("rsRunner", () => ({ map: runnerTex() })));
    for (const c of wins) for (const s2 of [-1, 1]) bIn.add(bx(c - 0.36, y0 + 1.25, -w + 0.07, c + 0.36, y0 + 1.85, -w + 0.1), lam("rsCurtain", () => ({ color: "#7a2a34" })));
    bIn.add(bx(-h, y0 + 1.95, -w + 0.06, h, y0 + 2.0, -w + 0.5), mm.iron);
    for (let k = 0; k < 6; k++) bIn.add(bx(-h + 0.6 + k * 1.5, y0 + 2.0, -w + 0.12, -h + 1.2 + k * 1.5, y0 + 2.28, -w + 0.45), lam("rsBag" + (k % 3), () => ({ color: ["#6a4a2a", "#3a3a4a", "#8a6a3a"][k % 3] })));
  }
  if (open) {
    bIn.add(bx(-h, y0, -w - 0.01, h, y1, -w + 0.06), mm.coachIn);
    for (const c of wins) for (const zs of [-1]) { // seats on the far side only: the floor by the windows stays in view
      const zc = zs * 0.75;
      bIn.add(bx(c - 0.28, y0 + 0.1, zc - 0.5, c + 0.18, y0 + 0.55, zc + 0.5), mm.seat);
      bIn.add(bx(c - 0.38, y0 + 0.1, zc - 0.5, c - 0.28, y0 + 1.05, zc + 0.5), mm.seat);
    }
    bIn.add(bx(-h, y1 - 0.01, -w, h, y1, w), mm.coachIn); // ceiling
  }
  for (const x of [-h + 1.5, h - 1.5]) truck(car, b, x, COACH.wheel, 2.0);
  b.add(bx(-h, 0.95, -1.0, h, y0, 1.0), mm.iron);
  pipe(b, -h - 0.7, h + 0.7);
  b.build(car.g); bIn.build(car.g, false);
  car.front = h + 0.7; car.back = -h - 0.7;
  return car;
};

/** a red rubber hose half from a car end (local pivot) to the coupling in the middle; its group droops when parted */
const hoseHalf = (len: number, dir: number) => {
  const mm = M(), g = new THREE.Group();
  const pts = [V(0, 0, 0), V(dir * len * 0.35, -0.2, 0.02), V(dir * len * 0.8, -0.3, 0.03), V(dir * len, -0.28, 0.03)];
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.07, 8), mm.hose));
  const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 10).rotateZ(Math.PI / 2).translate(dir * len, -0.28, 0.03), mm.brass); g.add(cp);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
  return g;
};

const MAKE: Record<Kind, () => Car> = { loco, tender, box: boxcar, coach: () => coach(false), coachOpen: () => coach(true) };
/** a train: the consist's group origin sits at the loco's nose (local x 0), cars run back along -x */
export const consist = (root: THREE.Object3D, kinds: Kind[], at: [number, number, number]): Consist => {
  const g = new THREE.Group(), cars: Car[] = [], offsets: number[] = [], hoses: Hose[] = [];
  let x = 0;
  kinds.forEach((k, i) => {
    const c = MAKE[k]();
    const off = x - c.front; // this car's local origin, in the consist
    c.g.position.set(off, 0, 0); g.add(c.g); cars.push(c); offsets.push(off);
    if (i > 0) { // a hose between the previous car's back and this car's front
      // x is this car's front; the previous car's back is at x + GAP; the couplings meet half way
      const len = GAP / 2 + 0.25, a = hoseHalf(len, -1), b = hoseHalf(len, 1);
      a.position.set(x + GAP / 2 + len, 0.82, 1.22); b.position.set(x + GAP / 2 - len, 0.82, 1.22);
      g.add(a, b); hoses.push({ a, b, x: x + GAP / 2 });
    }
    x = off + c.back - GAP;
  });
  g.position.set(...at);
  root.add(g);
  return { g, cars, hoses, offsets };
};
/** total length from the nose to the last car's back */
export const consistLen = (c: Consist) => -(c.offsets[c.offsets.length - 1] + c.cars[c.cars.length - 1].back);
