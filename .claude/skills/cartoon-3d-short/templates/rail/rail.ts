// The sets of "Stopped by Thin Air" as static batches plus the moving trains: the open line through snowy fields (the
// night freight of the hook, the 1872 day train), Pittsburgh (a platform with a canopy and the station sign, the line
// into a stone-portalled tunnel through a green hill, a dirt-road crossing on the far side with a wagon of barrels), the
// workshop (a window onto a track behind it, the bench, a brake demo rig, a pressure gauge) and Vanderbilt's office.
import * as THREE from "three";
import { Batch, boxGeo, quad, V, lam, prop, house, Kit, Ray, setSight } from "./build";
import { ctex, stoneHD, planksHD, roofHD, rep } from "./paint";
import { NOINK } from "./ink";
import { addSolid, addPlate, label, resetSolids, groundAt } from "./solids";
import { consist, Consist } from "./rolling";
import { V3, O, at, BALLAST_Y, RAIL_Y, GAUGE, PLAT, PORTAL_W, PORTAL_E, TUN_W, TUN_H, HILL_H, CROSS_X, WAGON, SHOP, BENCH, SHOP_WIN, SHOP_TRACK_Z,
  OFFICE, ODESK, DESK_H, PARK_NOSE } from "./layout";

const box = (b: Batch, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 2) =>
  addSolid([x0, y0, z0], [x1, y1, z1]) && b.add(boxGeo(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tile), m);
const boxN = (b: Batch, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 0) =>
  b.add(boxGeo(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), tile), m);
const up = (x0: number, x1: number, z0: number, z1: number, y: number, tile: number) =>
  (addPlate(x0, x1, z0, z1, y), quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), (x1 - x0) / tile, (z1 - z0) / tile));
const cyl = (b: Batch, m: THREE.Material, x: number, y0: number, z: number, r: number, h: number, seg = 14) =>
  addSolid([x - r, y0, z - r], [x + r, y0 + h, z + r], "cyl") && b.add(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y0 + h / 2, z), m);
/** an unlit picture: a plane at c facing yaw (0 = +z), w x h metres */
const plate = (root: THREE.Object3D, map: THREE.Texture, c: V3, yaw: number, w: number, h: number, basic = true) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map }) : lam("plate" + map.uuid, () => ({ map })));
  m.position.set(...c); m.rotation.y = yaw; root.add(m);
  return m;
};
const signTex = (key: string, lines: string[], bg: string, fg: string, w = 1024, h = 256, font = "900 120px Georgia, serif") => ctex("sign" + key, w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.font = font;
  lines.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / (lines.length + 0.6))));
});

// ---------------- painted textures ----------------
const snowTex = () => ctex("snow", 512, 512, (g, r) => {
  g.fillStyle = "#e8eef6"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.5)" : "rgba(150,170,210,0.12)"; g.beginPath(); g.ellipse(r() * 512, r() * 512, 4 + r() * 22, 2 + r() * 8, 0, 0, 7); g.fill(); }
});
const grassTex = (key: string, col: string) => ctex("grassT" + key, 512, 512, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,200,0.07)" : "rgba(20,60,20,0.1)"; g.fillRect(r() * 512, r() * 512, 2 + r() * 5, 2 + r() * 5); }
});
/** a muted painted meadow (1024 px over one 6 m tile): olive greens in soft blotches, tufts, a few dry patches and
 *  wild flowers (the old flat lime green read like a toy) */
const meadowTex = (key: string) => ctex("meadow" + key, 1024, 1024, (g, r) => {
  g.fillStyle = "#7a9e52"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 40; i++) {
    const x = r() * 1024, y = r() * 1024, rad = 60 + r() * 220, c = ["rgba(104,140,62,0.35)", "rgba(140,170,84,0.3)", "rgba(150,140,86,0.22)", "rgba(88,122,58,0.35)"][i % 4];
    for (const [dx, dy] of [[0, 0], [1024, 0], [-1024, 0], [0, 1024], [0, -1024]]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, 2 * rad, 2 * rad); }
  }
  g.lineWidth = 2; g.lineCap = "round";
  for (let i = 0; i < 2600; i++) { const x = r() * 1024, y = r() * 1024, h = 6 + r() * 12, l = r() < 0.4; g.strokeStyle = l ? "rgba(170,196,110,0.4)" : "rgba(70,100,44,0.45)"; g.beginPath(); g.moveTo(x - 3, y - h); g.lineTo(x, y); g.lineTo(x + 3, y - h * 0.8); g.stroke(); }
  for (let i = 0; i < 30; i++) { const x = r() * 1024, y = r() * 1024; g.fillStyle = ["#f4efe2", "#e8c84a", "#d9a0b0"][i % 3]; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
});
const ballastTex = () => ctex("ballast", 512, 512, (g, r) => {
  g.fillStyle = "#6e665c"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 520; i++) {
    const x = r() * 512, y = r() * 512, rx = 7 + r() * 9, ry = 5 + r() * 6, a = r() * 3, v = 120 + r() * 60;
    g.fillStyle = "rgba(40,34,30,0.8)"; g.beginPath(); g.ellipse(x, y + 1.5, rx + 1.5, ry + 1.5, a, 0, 7); g.fill();
    g.fillStyle = `rgb(${v},${v - 8},${v - 18})`; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill();
    g.fillStyle = "rgba(255,248,230,0.28)"; g.beginPath(); g.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.45, ry * 0.35, a, 0, 7); g.fill();
  }
});
const dirtTex = () => ctex("dirtRoad", 512, 512, (g, r) => {
  g.fillStyle = "#a88a62"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,240,210,0.12)" : "rgba(80,50,30,0.14)"; g.beginPath(); g.ellipse(r() * 512, r() * 512, 4 + r() * 16, 2 + r() * 6, 0, 0, 7); g.fill(); }
  g.fillStyle = "rgba(90,60,40,0.3)"; g.fillRect(100, 0, 40, 512); g.fillRect(370, 0, 40, 512); // wheel ruts
});
const brickTex = (key: string, col: string, mortar: string) => ctex("brickT" + key, 512, 512, (g, r) => {
  g.fillStyle = mortar; g.fillRect(0, 0, 512, 512);
  const c = new THREE.Color(col);
  for (let y = 0; y < 16; y++) for (let x = -1; x < 9; x++) {
    const k = 0.86 + r() * 0.24; g.fillStyle = "#" + c.clone().multiplyScalar(k).getHexString();
    g.fillRect(x * 64 + (y % 2) * 32 + 3, y * 32 + 3, 58, 26);
  }
});
const panelTex = () => ctex("woodPanel", 512, 512, (g) => {
  g.fillStyle = "#5a3424"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#3a2018"; g.lineWidth = 10;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g.strokeRect(24 + i * 256, 24 + j * 256, 208, 208);
  g.strokeStyle = "rgba(255,210,150,0.18)"; g.lineWidth = 3;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g.strokeRect(34 + i * 256, 34 + j * 256, 188, 188);
});
const wallpaperTex = () => ctex("wallpaper", 512, 512, (g) => {
  g.fillStyle = "#6a2a32"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(230,190,110,0.35)";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const cx = x * 64 + (y % 2) * 32 + 16, cy = y * 64 + 32; g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx + 9, cy); g.lineTo(cx, cy + 14); g.lineTo(cx - 9, cy); g.fill(); }
});
/** the NY view out of Vanderbilt's window: sky and brownstone roofs */
const nyView = () => ctex("nyView", 512, 512, (g, r) => {
  const sky = g.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, "#7fb2e8"); sky.addColorStop(1, "#e2ecf6"); g.fillStyle = sky; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) { g.fillStyle = ["#8a5a4a", "#a87a5a", "#7a6a7a", "#9a6a52"][i % 4]; const x = i * 60 - 20 + r() * 20, w = 60 + r() * 40, h = 150 + r() * 200; g.fillRect(x, 512 - h, w, h);
    g.fillStyle = "rgba(255,240,200,0.5)"; for (let k = 0; k < 6; k++) g.fillRect(x + 10 + (k % 2) * 28, 512 - h + 20 + Math.floor(k / 2) * 40, 12, 20); }
});
const portraitTex = () => ctex("portrait", 256, 320, (g) => {
  g.fillStyle = "#c9a24e"; g.fillRect(0, 0, 256, 320); g.fillStyle = "#3a2a20"; g.fillRect(16, 16, 224, 288);
  g.fillStyle = "#2a2632"; g.beginPath(); g.ellipse(128, 260, 80, 70, 0, Math.PI, 0); g.fill();
  g.fillStyle = "#f0d8b8"; g.beginPath(); g.ellipse(128, 140, 44, 52, 0, 0, 7); g.fill();
  g.fillStyle = "#f4f2ec"; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 44, 158, 18, 30, 0, 0, 7); g.fill(); }
  g.fillStyle = "#2a2632"; g.fillRect(92, 50, 72, 54); g.fillRect(80, 100, 96, 8);
});
const rugTex = () => ctex("rug", 512, 512, (g) => {
  g.fillStyle = "#5a2030"; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "#c9a24e"; g.lineWidth = 14; g.strokeRect(24, 24, 464, 464); g.lineWidth = 4; g.strokeRect(50, 50, 412, 412);
  g.fillStyle = "#2a4a6a"; g.beginPath(); g.moveTo(256, 120); g.lineTo(392, 256); g.lineTo(256, 392); g.lineTo(120, 256); g.fill();
  g.fillStyle = "#c9a24e"; for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.beginPath(); g.arc(256 + Math.cos(a) * 170, 256 + Math.sin(a) * 170, 18, 0, 7); g.fill(); }
  g.fillStyle = "#e8d8b0"; g.beginPath(); g.arc(256, 256, 34, 0, 7); g.fill();
});
const mapTex = () => ctex("railMap", 384, 288, (g) => {
  g.fillStyle = "#c9a24e"; g.fillRect(0, 0, 384, 288); g.fillStyle = "#efe2c0"; g.fillRect(14, 14, 356, 260);
  g.strokeStyle = "#2a1d28"; g.lineWidth = 4; g.beginPath(); g.moveTo(40, 220); g.bezierCurveTo(120, 60, 200, 240, 340, 70); g.stroke();
  g.lineWidth = 2; for (let i = 0; i < 9; i++) { const x = 50 + i * 34; g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 20, 250); g.stroke(); }
  g.fillStyle = "#a82a36"; for (const [x, y] of [[70, 160], [190, 150], [300, 100]]) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
});
const globeTex = () => ctex("globe", 256, 128, (g) => {
  g.fillStyle = "#5a8ab0"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#c8b07a";
  for (const [x, y, w, h] of [[30, 30, 50, 40], [60, 70, 26, 40], [120, 25, 60, 35], [140, 60, 30, 45], [200, 35, 40, 30]]) { g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0.3, 0, 7); g.fill(); }
});
const toolBoardTex = () => ctex("toolBoard", 512, 320, (g) => {
  g.fillStyle = "#b8905a"; g.fillRect(0, 0, 512, 320); g.fillStyle = "rgba(60,40,20,0.5)"; for (let y = 16; y < 320; y += 32) for (let x = 16; x < 512; x += 32) g.fillRect(x, y, 4, 4);
  g.strokeStyle = "#3a3036"; g.fillStyle = "#3a3036"; g.lineWidth = 10; g.lineCap = "round";
  for (const [x, y, l] of [[60, 60, 140], [120, 60, 110], [180, 60, 160]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + l); g.stroke(); }
  g.beginPath(); g.arc(300, 120, 50, 0, 7); g.lineWidth = 12; g.stroke(); g.fillRect(380, 50, 30, 120); g.fillRect(360, 40, 70, 24);
  g.fillStyle = "#c8322e"; g.fillRect(440, 60, 34, 200);
});
/** a soft sunlight pool / shaft texture: a warm quad with feathered edges, brighter at the window end */
const sunTex = (key: string, bars: boolean) => ctex("sun" + key, 256, 256, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(255,226,170,0.95)"); gr.addColorStop(1, "rgba(255,210,150,0.25)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  if (bars) { g.fillStyle = "rgba(0,0,0,1)"; g.fillRect(122, 0, 12, 256); g.fillRect(0, 0, 256, 10); }
  const e = g.createLinearGradient(0, 0, 256, 0); e.addColorStop(0, "rgba(0,0,0,1)"); e.addColorStop(0.12, "rgba(0,0,0,0)"); e.addColorStop(0.88, "rgba(0,0,0,0)"); e.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out"; g.fillStyle = e; g.fillRect(0, 0, 256, 256);
  const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.85, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = v; g.fillRect(0, 0, 256, 256);
});
/** an additive quad (no ink, no depth writes) from four corners */
const glowQuad = (root: THREE.Object3D, key: string, corners: [number, number, number][], k: number, bars = false) => {
  const geo = new THREE.BufferGeometry();
  const [a, b2, c, d] = corners;
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b2, ...c, ...a, ...c, ...d], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: sunTex(key, bars), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: new THREE.Color(k, k * 0.92, k * 0.78) }));
  m.layers.set(NOINK); m.renderOrder = 3; root.add(m);
};
/** a far range of rounded hills painted on a big upright plane (unlit, no ink), its colour already hazed */
const hillsFar = (root: THREE.Object3D, x: number, z: number, w: number, h: number, col: string, seed: number) => {
  const t = ctex("hillsFar" + seed, 1024, 256, (g, r) => {
    g.clearRect(0, 0, 1024, 256); g.fillStyle = col; g.beginPath(); g.moveTo(0, 256);
    for (let i = 0; i <= 32; i++) { const xx = i * 32; g.lineTo(xx, 120 - 70 * Math.abs(Math.sin(i * 0.37 + seed)) * (0.6 + 0.4 * r())); }
    g.lineTo(1024, 256); g.fill();
    g.fillStyle = "rgba(255,255,255,0.12)"; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r() * 1024, 140 + r() * 110, 6 + r() * 10, 0, 7); g.fill(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.position.set(x, h / 2 - 4, z); m.layers.set(NOINK); m.renderOrder = -0.4; root.add(m);
};
const gaugeTex = () => ctex("gaugeDial", 256, 256, (g) => {
  g.fillStyle = "#c9a24e"; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.fillStyle = "#fbf6e6"; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.fill();
  g.strokeStyle = "#2a1d28"; g.lineWidth = 5;
  for (let k = 0; k <= 8; k++) { const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; g.beginPath(); g.moveTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); g.lineTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); g.stroke(); }
  g.fillStyle = "#3aa04a"; g.beginPath(); g.arc(128, 128, 100, -Math.PI * 0.2, Math.PI * 0.25); g.lineTo(128, 128); g.fill();
  g.fillStyle = "#2a1d28"; g.font = "900 34px Georgia, serif"; g.textAlign = "center"; g.fillText("AIR", 128, 190);
});

/** the hill over the tunnel (local x, z): a broad ridge across the line, a cutting in front of each portal */
export const hillH = (x: number, z: number) => {
  const sm = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ridge = sm(-4, 26, x) * (1 - sm(64, 94, x)) * (1 - sm(40, 95, Math.abs(z + 10)));
  let h = HILL_H * ridge + 4 * Math.sin(x * 0.07 + z * 0.05) * ridge;
  const cut = 1 - sm(TUN_W / 2 + 1.5, TUN_W / 2 + 3.5, Math.abs(z));
  if (x < PORTAL_W || x > PORTAL_E) h *= 1 - cut; // the cuttings
  else h = Math.max(h, TUN_H + 2.5 * (1 - (1 - cut) * 0.0));
  return Math.max(0, h);
};

export type Parts = {
  blind: THREE.Object3D;
  freight: Consist; test: Consist; shopTrain: Consist;
  /** the workshop: the demo rig's brake shoe and the gauge needle */
  rigShoe: THREE.Object3D; rigX0: number; needle: THREE.Object3D;
  lampMats: THREE.MeshBasicMaterial[];
};

export const buildRail = (root: THREE.Object3D, kit: Kit, rays: Ray[]): Parts => {
  setSight(rays);
  resetSolids();
  const b = new Batch(), walls = new Batch();
  const M = {
    snow: lam("snowGround", () => ({ map: rep(snowTex(), 1, 1) })),
    grass: lam("grassPitt", () => ({ map: meadowTex("pitt") })),
    hill: lam("grassHill", () => ({ map: meadowTex("hill") })),
    ballast: lam("ballast", () => ({ map: ballastTex() })),
    sleeper: lam("sleeper", () => ({ color: "#5a4030" })),
    rail: lam("rail", () => ({ color: "#6a6a72" })),
    stone: lam("portalStone", () => ({ map: stoneHD("portalStone", ["#b8a890", "#aa9a82", "#c2b29a", "#a2927a"], "#7e705e") })),
    dark: lam("tunnelDark", () => ({ color: "#1c1816" })),
    dirt: lam("dirtRoad", () => ({ map: dirtTex() })),
    planks: lam("platPlanks", () => ({ map: planksHD() })),
    trim: lam("trimCream", () => ({ color: "#efe4c8" })),
    post: lam("postGreen", () => ({ color: "#2f5a3e" })),
    canopy: lam("canopyRoof", () => ({ map: roofHD("#7a4a3e", true), side: THREE.DoubleSide })),
    wood: lam("wagonWood", () => ({ color: "#9a6a3e" })),
    crate: lam("crateWood", () => ({ map: planksHD() })),
    woodD: lam("darkWood", () => ({ color: "#5a3524" })),
    barrel: lam("barrel", () => ({ color: "#a8743e" })),
    hoop: lam("hoop", () => ({ color: "#3a3036" })),
    brick: lam("shopBrick", () => ({ map: brickTex("shop", "#a85a3e", "#d8c4a4") })),
    floor: lam("shopFloor", () => ({ map: planksHD() })),
    bench: lam("bench", () => ({ color: "#7a5434" })),
    iron: lam("ironGrey", () => ({ color: "#4a4a54" })),
    brass: lam("brassB", () => ({ color: "#e0b040" })),
    red: lam("rigRed", () => ({ color: "#b8342c" })),
    panel: lam("woodPanel", () => ({ map: panelTex() })),
    paper: lam("wallpaper", () => ({ map: wallpaperTex() })),
    desk: lam("deskMahogany", () => ({ color: "#6a2e22" })),
    gold: lam("goldTrim", () => ({ color: "#c9a24e" })),
    carpet: lam("carpet", () => ({ color: "#7a2a30" })),
  };
  const lampMats: THREE.MeshBasicMaterial[] = [];
  let blind: THREE.Object3D;
  /** a straight track along x from x0 to x1 at z (world): ballast, sleepers, two rails */
  const track = (x0: number, x1: number, z: number, solid = true) => {
    (solid ? box : boxN)(b, M.ballast, x0, 0, z - 1.9, x1, BALLAST_Y, z + 1.9, 3);
    for (let x = x0 + 0.4; x < x1; x += 0.75) boxN(b, M.sleeper, x - 0.12, BALLAST_Y, z - 1.3, x + 0.12, BALLAST_Y + 0.08, z + 1.3);
    for (const s of [-1, 1]) boxN(b, M.rail, x0, BALLAST_Y + 0.08, z + s * GAUGE / 2 - 0.045, x1, RAIL_Y, z + s * GAUGE / 2 + 0.045);
  };

  label("line");
  // =================== 1. the open line (snowy fields; night freight, 1872 day train) ===================
  {
    const [ox, , oz] = O.line, X = (x: number) => ox + x, Z = (z: number) => oz + z;
    b.add(up(X(-400), X(400), Z(-300), Z(300), 0, 6), M.snow);
    track(X(-400), X(400), Z(0));
    // telegraph poles along the far side, snowy pines, a far farm
    for (let x = -390; x < 400; x += 22) { cyl(b, M.woodD, X(x), 0, Z(-4.2), 0.09, 6.2, 8); boxN(b, M.woodD, X(x) - 0.04, 5.6, Z(-4.2) - 0.7, X(x) + 0.04, 5.7, Z(-4.2) + 0.7); }
    for (let k = 0; k < 60; k++) { const x = -380 + k * 13 + ((k * 37) % 9), z = -14 - ((k * 53) % 40); prop(b, kit, "tree_cone", X(x), 0, Z(z), 5 + ((k * 7) % 5)); }
    for (let k = 0; k < 30; k++) { const x = -380 + k * 26 + ((k * 17) % 11), z = 16 + ((k * 29) % 30); prop(b, kit, "tree_cone", X(x), 0, Z(z), 4.5 + ((k * 5) % 4)); }
    for (let k = 0; k < 6; k++) house(b, X(-300 + k * 120), Z(-70 - (k % 2) * 20), 0, 9, 8, 6, k + 2, 0);
  }
  const freight = consist(root, ["loco", "tender", "box", "box", "box", "box", "box"], [O.line[0], RAIL_Y, O.line[2]]);

  label("pitt");
  // =================== 2. Pittsburgh: platform, tunnel through the hill, crossing ===================
  {
    const [ox, , oz] = O.pitt, X = (x: number) => ox + x, Z = (z: number) => oz + z;
    // the ground with the hill as a height field (0.5 m cells round the portals), the line through it
    const gx0 = -260, gx1 = 320, gz0 = -220, gz1 = 120;
    b.add(up(X(gx0), X(gx1), Z(gz0), Z(gz1), 0, 22), M.grass);
    const hx0 = -6, hx1 = 98, hz0 = -110, hz1 = 50, nx = (hx1 - hx0) * 2, nz = (hz1 - hz0) * 2;
    const hg = new THREE.PlaneGeometry(hx1 - hx0, hz1 - hz0, nx, nz).rotateX(-Math.PI / 2);
    const hp = hg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      const lx = hp.getX(i) + (hx0 + hx1) / 2, lz = hp.getZ(i) + (hz0 + hz1) / 2;
      hp.setXYZ(i, X(lx), hillH(lx, lz) + 0.03, Z(lz));
    }
    const huv = hg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < huv.count; i++) huv.setXY(i, huv.getX(i) * 5, huv.getY(i) * 8);
    // leave out every cell over the bore between the portals' fronts (its slope would show inside the arch); a strip
    // of the same ground roofs the slot from the portals' tops inward
    const slot = (x: number, z: number) => Math.abs(z) < TUN_W / 2 + 0.6 && x > PORTAL_W - 1.45 && x < PORTAL_E + 1.45;
    const idx = hg.index!, keep: number[] = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), c = idx.getX(i + 1), d = idx.getX(i + 2);
      const cx = (hp.getX(a) + hp.getX(c) + hp.getX(d)) / 3 - O.pitt[0], cz = (hp.getZ(a) + hp.getZ(c) + hp.getZ(d)) / 3 - O.pitt[2];
      if (!slot(cx, cz)) keep.push(a, c, d);
    }
    hg.setIndex(keep); hg.computeVertexNormals();
    b.add(hg, M.hill);
    const sw = TUN_W + 1.4, sx0 = PORTAL_W - 0.2, sx1 = PORTAL_E + 0.2;
    const strip = new THREE.PlaneGeometry(sx1 - sx0, sw, Math.round((sx1 - sx0) * 2), 8).rotateX(-Math.PI / 2);
    const sp = strip.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) { const lx = sp.getX(i) + (sx0 + sx1) / 2, lz = sp.getZ(i); sp.setXYZ(i, X(lx), Math.max(TUN_H + 2.5, hillH(lx, 9)) + 0.03, Z(lz)); }
    strip.computeVertexNormals(); b.add(strip, M.hill);
    addSolid([X(PORTAL_W), TUN_H, Z(-40)], [X(PORTAL_E), HILL_H, Z(30)], "box", "hill");
    // the track runs from the platform through the tunnel past the crossing
    track(X(-250), X(PORTAL_W), Z(0)); track(X(PORTAL_W), X(PORTAL_E), Z(0), false); track(X(PORTAL_E), X(320), Z(0));
    // the bore: dark walls and a vault inside, stone portals with an arched mouth at each end
    for (const s of [-1, 1]) boxN(walls, M.dark, X(PORTAL_W), 0, Z(s * (TUN_W / 2 + 0.3)), X(PORTAL_E), TUN_H, Z(s * TUN_W / 2));
    boxN(walls, M.dark, X(PORTAL_W), TUN_H - 0.3, Z(-TUN_W / 2), X(PORTAL_E), TUN_H, Z(TUN_W / 2));
    b.add(up(X(PORTAL_W - 1.4), X(PORTAL_E + 1.4), Z(-TUN_W / 2), Z(TUN_W / 2), 0.025, 4), M.dark);
    blind = new THREE.Mesh(new THREE.PlaneGeometry(TUN_W, TUN_H).rotateY(-Math.PI / 2).translate(X(40), TUN_H / 2, Z(0)), new THREE.MeshBasicMaterial({ color: "#050404" }));
    blind.layers.set(NOINK); root.add(blind);
    const portal = (px: number, dir: number) => {
      const sh = new THREE.Shape(); const hw = 11, hh = 12.5;
      sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, hh); sh.lineTo(-hw, hh); sh.lineTo(-hw, 0);
      const hole = new THREE.Path(), r = TUN_W / 2, yc = TUN_H - r;
      hole.moveTo(-r, 0); hole.lineTo(-r, yc); hole.absarc(0, yc, r, Math.PI, 0, true); hole.lineTo(r, 0); hole.lineTo(-r, 0);
      sh.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false, curveSegments: 20 });
      geo.rotateY(Math.PI / 2).translate(X(px) - (dir < 0 ? 1.4 : 0), 0, Z(0));
      const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
      walls.add(geo, M.stone);
      boxN(walls, M.stone, X(px) - 0.9, hh, Z(-11.6), X(px) + 0.9, hh + 0.7, Z(11.6)); // the coping
      for (const s of [-1, 1]) addSolid([X(px) - 0.8, 0, Z(s * r) + (s > 0 ? 0 : -10.4)], [X(px) + 0.8, hh, Z(s * r) + (s > 0 ? 10.4 : 0)], "box", "portal");
    };
    portal(PORTAL_W, -1); portal(PORTAL_E, 1);
    // the platform on the lens side, its canopy, the station sign, lamps, benches
    box(b, M.trim, X(PLAT.x0), 0, Z(PLAT.z0), X(PLAT.x1), PLAT.y - 0.06, Z(PLAT.z1), 2);
    b.add(up(X(PLAT.x0), X(PLAT.x1), Z(PLAT.z0), Z(PLAT.z1), PLAT.y, 2.4), M.planks);
    boxN(b, M.trim, X(PLAT.x0), PLAT.y - 0.02, Z(PLAT.z0) - 0.02, X(PLAT.x1), PLAT.y + 0.03, Z(PLAT.z0) + 0.12);
    const cz0 = PLAT.z0 + 1.6, cz1 = PLAT.z1 + 0.3, cy = PLAT.y + 3.6;
    for (let x = PLAT.x0 + 4; x <= PLAT.x1 - 4; x += 6) if (x < -28 || x > -10) cyl(b, M.post, X(x), PLAT.y, Z(cz1 - 0.6), 0.09, 3.6, 10); // none in the station shot's view
    b.add(quad(V(X(PLAT.x0 + 2), cy - 0.6, Z(cz0)), V(X(PLAT.x1 - 2), cy - 0.6, Z(cz0)), V(X(PLAT.x1 - 2), cy, Z(cz1)), V(X(PLAT.x0 + 2), cy, Z(cz1))), M.canopy);
    boxN(b, M.trim, X(PLAT.x0 + 2), cy - 0.75, Z(cz0) - 0.05, X(PLAT.x1 - 2), cy - 0.55, Z(cz0) + 0.05);
    const sx = -30;
    for (const dx of [-2.2, 2.2]) cyl(b, M.post, X(sx + dx), PLAT.y, Z(PLAT.z1 - 1.0), 0.07, 2.6, 8);
    plate(root, signTex("pitt", ["PITTSBURGH"], "#1e3a2a", "#f2d27a", 1024, 200, "900 120px Georgia, serif"), [X(sx), PLAT.y + 2.75, Z(PLAT.z1 - 0.95)], 0, 5.0, 0.98);
    for (const x of [-60, -45, -16]) { cyl(b, M.woodD, X(x), PLAT.y, Z(PLAT.z1 - 1.2), 0.05, 0.45, 6); boxN(b, M.woodD, X(x) - 0.9, PLAT.y + 0.45, Z(PLAT.z1 - 1.45), X(x) + 0.9, PLAT.y + 0.52, Z(PLAT.z1 - 0.95)); }
    label("platformDressing");
    const crate = (x: number, z: number, s2: number, y0: number = PLAT.y) => box(b, M.crate, X(x) - s2 / 2, y0, Z(z) - s2 / 2, X(x) + s2 / 2, y0 + s2, Z(z) + s2 / 2, 0.8);
    const barrel = (x: number, z: number, y0: number = PLAT.y) => { cyl(b, M.barrel, X(x), y0, Z(z), 0.3, 0.85, 14); for (const hy of [0.18, 0.66]) boxN(b, M.hoop, X(x) - 0.31, y0 + hy, Z(z) - 0.31, X(x) + 0.31, y0 + hy + 0.05, Z(z) + 0.31); };
    for (const [x, z] of [[-44, 7.6], [-43.3, 7.9], [-43.7, 7.0], [-36, 7.8], [-62, 7.4]] as const) barrel(x, z);
    crate(-41.5, 7.7, 0.9); crate(-40.6, 7.8, 0.7); crate(-41.1, 7.7, 0.6, PLAT.y + 0.9); crate(-58, 7.5, 0.8); crate(-24.5, 7.9, 0.7);
    box(b, M.woodD, X(-52) - 1.0, PLAT.y + 0.4, Z(7.0) - 0.5, X(-52) + 1.0, PLAT.y + 0.55, Z(7.0) + 0.5, 0); // the baggage cart
    for (const sx of [-0.8, 0.8]) b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16).rotateX(Math.PI / 2).translate(X(-52) + sx, PLAT.y + 0.4, Z(7.55)), M.hoop);
    crate(-52.4, 7.0, 0.6, PLAT.y + 0.55); crate(-51.7, 7.0, 0.5, PLAT.y + 0.55);
    for (const x of [-66, -36, -6]) { cyl(b, M.post, X(x), PLAT.y, Z(PLAT.z0 + 0.6), 0.06, 3.0, 8); boxN(b, M.post, X(x) - 0.18, PLAT.y + 3.0, Z(PLAT.z0 + 0.42), X(x) + 0.18, PLAT.y + 3.08, Z(PLAT.z0 + 0.78));
      const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.35, 1.0) }); lampMats.push(gm);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26).translate(X(x), PLAT.y + 3.27, Z(PLAT.z0 + 0.6)), gm); gl.layers.set(NOINK); root.add(gl); }
    // a fence and bushes along the far side of the line, rocks in the cuttings
    for (let x = -120; x < 16; x += 2.4) { boxN(b, M.woodD, X(x) - 0.06, 0, Z(-7.5) - 0.06, X(x) + 0.06, 1.1, Z(-7.5) + 0.06); }
    for (const y of [0.45, 0.9]) boxN(b, M.woodD, X(-120), y, Z(-7.5) - 0.03, X(16), y + 0.08, Z(-7.5) + 0.03);
    for (let k = 0; k < 26; k++) { const x = -110 + k * 9 + ((k * 37) % 5), z = -9 - ((k * 13) % 6); prop(b, kit, "plant_bushLarge", X(x), 0, Z(z), 1.2 + (k % 3) * 0.4); }
    for (let k = 0; k < 18; k++) { const x = 80 + k * 6 + ((k * 7) % 4), z = (k % 2 ? 1 : -1) * (6 + (k % 3)); prop(b, kit, "plant_bushLarge", X(x), 0, Z(z), 1.0 + (k % 3) * 0.3); }
    hillsFar(root, X(-40), Z(-150), 420, 70, "#8eb0a0", 1); hillsFar(root, X(40), Z(-230), 520, 90, "#a9c2c4", 2);
    // the town and its mills behind the line (-z), smoke stacks; trees on the hill
    for (let k = 0; k < 10; k++) house(b, X(-200 + k * 17), Z(-30 - (k % 3) * 9), 0, 10, 8, 7 + (k % 3) * 1.6, k + 1, 0);
    for (const [x, z, h] of [[-150, -62, 22], [-110, -70, 26], [-70, -58, 20]] as const) {
      box(b, M.brick, X(x) - 9, 0, Z(z) - 6, X(x) + 9, 10, Z(z) + 6, 3);
      cyl(b, M.brick, X(x + 5), 10, Z(z), 1.1, h - 10, 12);
    }
    for (let k = 0; k < 40; k++) { const x = 4 + ((k * 23) % 90), z = -100 + ((k * 41) % 140); if (Math.abs(z) < 9) continue; prop(b, kit, k % 3 ? "tree_oak" : "tree_cone", X(x), hillH(x, z), Z(z), 6 + (k % 4)); }
    // the crossing: a dirt road along z, planks between the rails, a warning sign; the wagon of barrels on the rails
    b.add(up(X(CROSS_X - 2.4), X(CROSS_X + 2.4), Z(-60), Z(60), 0.03, 4), M.dirt);
    boxN(b, M.woodD, X(CROSS_X - 2.2), BALLAST_Y + 0.08, Z(-0.66), X(CROSS_X + 2.2), RAIL_Y - 0.02, Z(0.66));
    cyl(b, M.woodD, X(CROSS_X + 3.8), 0, Z(5.2), 0.08, 3.0, 8);
    plate(root, signTex("lookout", ["LOOK OUT", "FOR THE CARS"], "#f4ecd8", "#2a1d28", 1024, 400, "900 130px Georgia, serif"), [X(CROSS_X + 3.8), 2.7, Z(5.28)], 0, 1.7, 0.66);
    const wb = new Batch(), wx = X(WAGON.x), wz0 = Z(WAGON.z - WAGON.len / 2), wz1 = Z(WAGON.z + WAGON.len / 2), by = 1.05;
    boxN(wb, M.wood, wx - WAGON.halfX, by, wz0, wx + WAGON.halfX, by + 0.1, wz1);
    for (const s of [-1, 1]) boxN(wb, M.wood, wx + s * WAGON.halfX - 0.05, by + 0.1, wz0, wx + s * WAGON.halfX + 0.05, by + 0.55, wz1);
    boxN(wb, M.wood, wx - WAGON.halfX, by + 0.1, wz0 - 0.05, wx + WAGON.halfX, by + 0.55, wz0 + 0.05);
    boxN(wb, M.woodD, wx - WAGON.halfX, by + 0.75, wz0 + 0.05, wx + WAGON.halfX, by + 0.85, wz0 + 0.35); // the seat (front = -z)
    for (const [zz, r] of [[wz1 - 0.55, 0.62], [wz0 + 0.55, 0.5]] as const) for (const s of [-1, 1]) {
      const wg = new THREE.TorusGeometry(r - 0.04, 0.05, 6, 24).rotateY(Math.PI / 2).translate(wx + s * (WAGON.halfX + 0.08), RAIL_Y + r, zz);
      wb.add(wg, M.hoop);
      for (let k = 0; k < 8; k++) wb.add(new THREE.BoxGeometry(0.04, r * 1.9, 0.05).rotateX((k * Math.PI) / 8).translate(wx + s * (WAGON.halfX + 0.08), RAIL_Y + r, zz), M.woodD);
    }
    for (const s of [-1, 1]) boxN(wb, M.woodD, wx + s * 0.45 - 0.04, by - 0.05, wz0 - 2.2, wx + s * 0.45 + 0.04, by + 0.05, wz0); // the shafts (toward -z)
    for (const [dx, dz] of [[-0.42, 1.25], [0.42, 1.25], [0, 1.95], [-0.42, 2.65], [0.42, 2.65]] as const) {
      const cx2 = wx + dx, cz2 = wz0 + dz;
      wb.add(new THREE.CylinderGeometry(0.3, 0.3, 0.78, 14).translate(cx2, by + 0.49, cz2), M.barrel);
      for (const hy of [0.25, 0.7]) wb.add(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 14).translate(cx2, by + 0.1 + hy, cz2), M.hoop);
    }
    const wg = new THREE.Group(); wb.build(wg); wg.position.set(2 * wx, 0, wz0 + wz1); wg.rotation.y = Math.PI; root.add(wg); // faces +z
    addSolid([wx - WAGON.halfX - 0.15, RAIL_Y, wz0], [wx + WAGON.halfX + 0.15, by + 1.0, wz1], "box", "wagon-bench");
  }
  const test = consist(root, ["loco", "tender", "coachOpen", "coach", "coach", "coach"], [O.pitt[0] + PARK_NOSE, RAIL_Y, O.pitt[2]]);

  label("shop");
  // =================== 3. the workshop ===================
  let rigShoe: THREE.Object3D, needle: THREE.Object3D;
  {
    const [ox, , oz] = O.shop, X = (x: number) => ox + x, Z = (z: number) => oz + z, R = SHOP;
    b.add(up(X(-200), X(200), Z(-200), Z(200), 0, 6), M.grass);
    b.add(up(X(-R.hw), X(R.hw), Z(R.z0), Z(R.z1), 0.02, 2.4), M.floor);
    box(walls, M.brick, X(-R.hw - 0.25), 0, Z(R.z0), X(-R.hw), R.h, Z(R.z1), 2.5);
    box(walls, M.brick, X(R.hw), 0, Z(R.z0), X(R.hw + 0.25), R.h, Z(R.z1), 2.5);
    // the back wall round its window
    const W0 = SHOP_WIN, zb0 = Z(R.z0 - 0.25), zb1 = Z(R.z0);
    box(walls, M.brick, X(-R.hw - 0.25), 0, zb0, X(R.hw + 0.25), W0.y0, zb1, 2.5);
    box(walls, M.brick, X(-R.hw - 0.25), W0.y1, zb0, X(R.hw + 0.25), R.h, zb1, 2.5);
    box(walls, M.brick, X(-R.hw - 0.25), W0.y0, zb0, X(W0.x0), W0.y1, zb1, 2.5);
    box(walls, M.brick, X(W0.x1), W0.y0, zb0, X(R.hw + 0.25), W0.y1, zb1, 2.5);
    for (const [x0, y0, x1, y1] of [[W0.x0 - 0.08, W0.y0 - 0.1, W0.x1 + 0.08, W0.y0], [W0.x0 - 0.08, W0.y1, W0.x1 + 0.08, W0.y1 + 0.08]] as const)
      boxN(b, M.woodD, X(x0), y0, zb1 - 0.02, X(x1), y1, zb1 + 0.06);
    const ceil = new THREE.Mesh(quad(V(X(-R.hw), R.h, Z(R.z0)), V(X(R.hw), R.h, Z(R.z0)), V(X(R.hw), R.h, Z(R.z1)), V(X(-R.hw), R.h, Z(R.z1)), 1, 1), lam("shopCeil", () => ({ color: "#6a4a34", side: THREE.DoubleSide })));
    ceil.castShadow = false; root.add(ceil);
    // the bench under the window, a vice, the brake demo rig (a red wheel, a shoe, a cylinder), the gauge on the wall
    const [bx0, by, bz] = BENCH;
    box(b, M.bench, bx0 - 2.3, by - 0.08, bz - 0.4, bx0 + 2.3, by, bz + 0.4, 0);
    for (const s of [-1, 1]) box(b, M.bench, bx0 + s * 2.1 - 0.07, 0, bz - 0.33, bx0 + s * 2.1 + 0.07, by - 0.08, bz + 0.33, 0);
    boxN(b, M.iron, bx0 - 1.95, by, bz - 0.1, bx0 - 1.6, by + 0.22, bz + 0.12);
    const rx = bx0 + 1.85;
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24).rotateX(Math.PI / 2).translate(rx, by + 0.42, bz), M.red);
    b.add(new THREE.TorusGeometry(0.31, 0.035, 8, 28).translate(rx, by + 0.42, bz + 0.045), M.iron);
    for (let k = 0; k < 6; k++) b.add(new THREE.BoxGeometry(0.5, 0.03, 0.02).rotateZ((k * Math.PI) / 6).translate(rx, by + 0.42, bz + 0.05), M.iron);
    b.add(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 24).rotateX(Math.PI / 2).translate(rx, by + 0.42, bz - 0.01), M.iron);
    boxN(b, M.iron, rx - 0.05, by, bz - 0.06, rx + 0.05, by + 0.42, bz + 0.06);
    b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.42, 14).rotateZ(Math.PI / 2).translate(rx - 0.85, by + 0.42, bz), M.brass);
    rigShoe = new THREE.Group(); rigShoe.position.set(rx - 0.38, by + 0.42, bz);
    const sm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.16), lam("rigShoe", () => ({ color: "#3a6ab8" }))); sm.castShadow = true; rigShoe.add(sm);
    const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8).rotateZ(Math.PI / 2).translate(-0.2, 0, 0), M.brass); rigShoe.add(rd);
    root.add(rigShoe);
    const gz = Z(R.z0) + 0.03, gxp = X(3.15), gyp = 1.85;
    plate(root, gaugeTex(), [gxp, gyp, gz], 0, 0.62, 0.62);
    needle = new THREE.Group(); needle.position.set(gxp, gyp, gz + 0.015);
    const nm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.01).translate(0, 0.11, 0), new THREE.MeshBasicMaterial({ color: "#1a1418" })); needle.add(nm); root.add(needle);
    boxN(b, M.iron, gxp - 0.03, 0.6, gz - 0.03, gxp + 0.03, gyp - 0.3, gz + 0.01); // its pipe down to the floor
    // pump parts and a pipe rack on the left wall, a hanging lamp
    for (let k = 0; k < 4; k++) b.add(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8).rotateZ(Math.PI / 2).translate(X(-R.hw + 1.5), 2.6 + k * 0.16, Z(R.z0 + 0.9 + k * 0.3)), M.iron);
    cyl(b, M.brass, X(0.35), 0, Z(-3.0), 0.3, 1.1, 16);
    cyl(b, M.iron, X(0.35), 1.1, Z(-3.0), 0.1, 0.45, 10);
    for (const y of [0.25, 0.8]) b.add(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16).translate(X(0.35), y, Z(-3.0)), M.iron);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.4, 1.4) }); lampMats.push(lm);
    const lb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8).translate(X(0.2), R.h - 0.7, Z(-1.6)), lm); lb.layers.set(NOINK); root.add(lb);
    boxN(b, M.iron, X(0.2) - 0.01, R.h - 0.62, Z(-1.6) - 0.01, X(0.2) + 0.01, R.h, Z(-1.6) + 0.01);
    plate(root, toolBoardTex(), [X(-3.2), 2.2, Z(R.z0) + 0.03], 0, 1.6, 1.0, false);
    glowQuad(root, "shopFloor", [[X(-1.2), 0.035, Z(R.z0 + 1.0)], [X(3.2), 0.035, Z(R.z0 + 1.0)], [X(3.9), 0.035, Z(R.z0 + 4.4)], [X(-0.6), 0.035, Z(R.z0 + 4.4)]], 0.45, true);
    glowQuad(root, "shopShaft", [[X(W0.x0), W0.y1, Z(R.z0 + 0.05)], [X(W0.x1), W0.y1, Z(R.z0 + 0.05)], [X(3.9), 0.05, Z(R.z0 + 4.4)], [X(-0.6), 0.05, Z(R.z0 + 4.4)]], 0.12);
    for (const y of [1.2, 1.7]) box(b, M.bench, X(-R.hw + 0.02), y, Z(-1.4), X(-R.hw + 0.45), y + 0.05, Z(0.6), 0);
    for (let k = 0; k < 7; k++) { const y = k < 4 ? 1.25 : 1.75, zz = -1.25 + (k % 4) * 0.5; boxN(b, lam("jar" + (k % 3), () => ({ color: ["#3a6a8a", "#a8783e", "#6a8a4a"][k % 3] })), X(-R.hw + 0.1), y, Z(zz), X(-R.hw + 0.38), y + 0.22 + (k % 2) * 0.1, Z(zz + 0.3)); }
    cyl(b, lam("stove", () => ({ color: "#2a2a30" })), X(3.4), 0.02, Z(0.6), 0.32, 0.9, 16); cyl(b, lam("stove", () => ({ color: "#2a2a30" })), X(3.4), 0.92, Z(0.6), 0.08, SHOP.h - 0.92, 8);
    // outside: the yard, a track the trains pass on, brick sheds beyond
    track(X(-200), X(200), Z(SHOP_TRACK_Z));
    for (let k = 0; k < 6; k++) house(b, X(-60 + k * 24), Z(SHOP_TRACK_Z - 16), 0, 12, 9, 7, k + 3, 0);
  }
  const shopTrain = consist(root, ["loco", "tender", "box", "box", "box", "box"], [O.shop[0] - 80, RAIL_Y, O.shop[2] + SHOP_TRACK_Z]);

  label("office");
  // =================== 4. Vanderbilt's office ===================
  {
    const [ox, , oz] = O.office, X = (x: number) => ox + x, Z = (z: number) => oz + z, R = OFFICE;
    b.add(up(X(-60), X(60), Z(-60), Z(60), 0, 6), M.grass);
    b.add(up(X(-R.hw), X(R.hw), Z(R.z0), Z(R.z1), 0.02, 3), M.carpet);
    for (const s of [-1, 1]) {
      box(walls, M.paper, X(s * R.hw), 1.2, Z(R.z0), X(s * (R.hw + 0.25)), R.h, Z(R.z1), 2);
      box(walls, M.panel, X(s * R.hw), 0, Z(R.z0), X(s * (R.hw + 0.25)), 1.2, Z(R.z1), 1.2);
    }
    // the back wall round a tall window behind the desk
    const wx0 = -1.3, wx1 = 1.3, wy0 = 1.0, wy1 = 3.5, zb0 = Z(R.z0 - 0.25), zb1 = Z(R.z0);
    box(walls, M.panel, X(-R.hw - 0.25), 0, zb0, X(R.hw + 0.25), wy0, zb1, 1.2);
    box(walls, M.paper, X(-R.hw - 0.25), wy1, zb0, X(R.hw + 0.25), R.h, zb1, 2);
    box(walls, M.paper, X(-R.hw - 0.25), wy0, zb0, X(wx0), wy1, zb1, 2);
    box(walls, M.paper, X(wx1), wy0, zb0, X(R.hw + 0.25), wy1, zb1, 2);
    // the view outside is dimmed so the lit subject, not the window, is the brightest thing (look_gap.md fix 1)
    (plate(root, nyView(), [X(0), (wy0 + wy1) / 2, zb0 - 0.6], 0, 3.2, 3.2).material as THREE.MeshBasicMaterial).color.setRGB(0.62, 0.6, 0.66);
    glowQuad(root, "officeFloor", [[X(wx0 - 0.4), 0.05, Z(R.z0 + 2.6)], [X(wx1 + 0.4), 0.05, Z(R.z0 + 2.6)], [X(wx1 + 1.2), 0.05, Z(R.z0 + 6.2)], [X(wx0 - 1.2), 0.05, Z(R.z0 + 6.2)]], 0.38, true);
    glowQuad(root, "officeShaft", [[X(wx0), wy1, zb1 + 0.05], [X(wx1), wy1, zb1 + 0.05], [X(wx1 + 1.2), 0.06, Z(R.z0 + 6.2)], [X(wx0 - 1.2), 0.06, Z(R.z0 + 6.2)]], 0.1);
    for (const [x0, y0, x1, y1] of [[wx0 - 0.1, wy0 - 0.1, wx1 + 0.1, wy0], [wx0 - 0.1, wy1, wx1 + 0.1, wy1 + 0.1], [wx0 - 0.1, wy0, wx0, wy1], [wx1, wy0, wx1 + 0.1, wy1], [-0.04, wy0, 0.04, wy1]] as const)
      boxN(b, M.gold, X(x0), y0, zb1 - 0.02, X(x1), y1, zb1 + 0.05);
    for (const s of [-1, 1]) boxN(b, lam("drapes", () => ({ color: "#4a1a22" })), X(s * 1.75) - 0.35, 0.05, zb1 + 0.02, X(s * 1.75) + 0.35, wy1 + 0.3, zb1 + 0.2);
    plate(root, portraitTex(), [X(-2.9), 2.5, zb1 + 0.03], 0, 0.9, 1.12);
    // the door on the screen-left wall (Vanderbilt points at it)
    boxN(b, M.desk, X(-R.hw) + 0.01, 0.02, Z(0.3), X(-R.hw) + 0.08, 2.4, Z(1.4));
    boxN(b, M.gold, X(-R.hw) + 0.08, 1.1, Z(1.25), X(-R.hw) + 0.13, 1.18, Z(1.33));
    // the desk, his chair, a bookcase, a lamp, the model train on the desk
    const [dx, , dz] = ODESK;
    box(b, M.desk, dx - 1.3, DESK_H - 0.07, dz - 0.6, dx + 1.3, DESK_H, dz + 0.6, 0);
    for (const s of [-1, 1]) box(b, M.desk, dx + s * 0.9 - 0.38, 0.02, dz - 0.55, dx + s * 0.9 + 0.38, DESK_H - 0.07, dz + 0.55, 0);
    boxN(b, M.gold, dx - 1.31, DESK_H - 0.08, dz + 0.6, dx + 1.31, DESK_H - 0.04, dz + 0.61);
    prop(b, kit, "bookcaseClosedWide", X(R.hw - 1.8), 0.02, Z(R.z0 + 1.0), 1.7, 0);
    prop(b, kit, "pottedPlant", X(-R.hw + 0.6), 0.02, Z(R.z0 + 0.6), 1.1);
    b.add(up(X(-2.4), X(2.4), Z(-1.0), Z(2.4), 0.045, 4.8), lam("rug", () => ({ map: rugTex() })));
    plate(root, mapTex(), [X(2.9), 2.45, Z(R.z0) + 0.03], 0, 1.3, 0.95);
    cyl(b, M.woodD, X(-2.8), 0.02, Z(R.z0 + 1.6), 0.06, 0.9, 8);
    b.add(new THREE.SphereGeometry(0.32, 20, 14).translate(X(-2.8), 1.25, Z(R.z0 + 1.6)), lam("globe", () => ({ map: globeTex() })));
    cyl(b, M.gold, X(-2.8) - 0.0, 0.92, Z(R.z0 + 1.6), 0.36, 0.03, 20);
    const [ddx, , ddz] = ODESK;
    cyl(b, M.brass, ddx - 0.8, DESK_H, ddz + 0.05, 0.05, 0.08, 10); cyl(b, M.woodD, ddx - 0.8, DESK_H + 0.08, ddz + 0.05, 0.015, 0.22, 6); // an inkwell and pen
    boxN(b, lam("papers", () => ({ color: "#f2ead6" })), ddx - 0.45, DESK_H, ddz - 0.05, ddx - 0.05, DESK_H + 0.03, ddz + 0.25);
    const model = consist(root, ["loco", "tender"], [dx + 1.2, DESK_H + 0.013, dz + 0.2]);
    model.g.scale.setScalar(0.06);
    boxN(b, M.woodD, dx + 0.3, DESK_H, dz + 0.1, dx + 1.25, DESK_H + 0.012, dz + 0.3); // its little track
    // ---- look_gap.md: warm practicals (>= 2 per interior), trims, and a dressed room (>= 12 prop types) ----
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.3, 1.2) }); lampMats.push(bulb);
    const sconce = (x: number, y: number, z: number, wallZ: boolean, sgn = 1) => {
      // a brass bracket, a glowing bulb under a small cream shade, and a warm pool on the wall around it
      if (wallZ) { boxN(b, M.brass, x - 0.03, y - 0.25, z, x + 0.03, y - 0.05, z + 0.14); }
      else boxN(b, M.brass, x, y - 0.25, z - 0.03, x + sgn * 0.14, y - 0.05, z + 0.03);
      const bx = wallZ ? x : x + sgn * 0.16, bz = wallZ ? z + 0.16 : z;
      b.add(new THREE.SphereGeometry(0.07, 14, 10).translate(bx, y, bz), bulb);
      b.add(new THREE.CylinderGeometry(0.07, 0.13, 0.14, 14, 1, true).translate(bx, y + 0.1, bz), lam("lampshade", () => ({ color: "#efd9a8", side: THREE.DoubleSide })));
      const r = 1.1, q: [number, number, number][] = wallZ
        ? [[x - r, y + r, z + 0.02], [x + r, y + r, z + 0.02], [x + r, y - r, z + 0.02], [x - r, y - r, z + 0.02]]
        : [[x + sgn * 0.02, y + r, z - r], [x + sgn * 0.02, y + r, z + r], [x + sgn * 0.02, y - r, z + r], [x + sgn * 0.02, y - r, z - r]];
      glowQuad(root, "sconce", q, 0.42);
    };
    sconce(X(-2.0), 2.35, Z(R.z0), true); sconce(X(2.0), 2.35, Z(R.z0), true);
    sconce(X(-R.hw), 2.3, Z(-1.2), false, 1); sconce(X(R.hw), 2.3, Z(-1.2), false, -1);
    // a banker's lamp on the desk: brass stem, green shade, a warm pool on the desk top
    cyl(b, M.brass, dx - 1.0, DESK_H, dz - 0.15, 0.09, 0.03, 14); cyl(b, M.brass, dx - 1.0, DESK_H + 0.03, dz - 0.15, 0.015, 0.3, 8);
    boxN(b, lam("lampGreen", () => ({ color: "#1f6b45" })), dx - 1.2, DESK_H + 0.3, dz - 0.22, dx - 0.8, DESK_H + 0.38, dz - 0.08);
    b.add(new THREE.SphereGeometry(0.04, 10, 8).translate(dx - 1.0, DESK_H + 0.28, dz - 0.15), bulb);
    glowQuad(root, "deskPool", [[dx - 1.6, DESK_H + 0.005, dz - 0.55], [dx - 0.3, DESK_H + 0.005, dz - 0.55], [dx - 0.3, DESK_H + 0.005, dz + 0.55], [dx - 1.6, DESK_H + 0.005, dz + 0.55]], 0.5, true);
    // trims: crown moulding, a chair rail on the panelling, a dark skirting on every wall-floor join (contact darkening)
    const trim = lam("trimDark", () => ({ color: "#3a2228" })), rail2 = lam("trimRail", () => ({ color: "#6b3f2a" }));
    for (const s2 of [-1, 1]) {
      boxN(b, trim, X(s2 * R.hw) - (s2 > 0 ? 0.06 : 0), 0.02, Z(R.z0), X(s2 * R.hw) + (s2 > 0 ? 0 : 0.06), 0.18, Z(R.z1));
      boxN(b, rail2, X(s2 * R.hw) - (s2 > 0 ? 0.05 : 0), 1.17, Z(R.z0), X(s2 * R.hw) + (s2 > 0 ? 0 : 0.05), 1.24, Z(R.z1));
      boxN(b, rail2, X(s2 * R.hw) - (s2 > 0 ? 0.12 : 0), R.h - 0.16, Z(R.z0), X(s2 * R.hw) + (s2 > 0 ? 0 : 0.12), R.h, Z(R.z1));
    }
    boxN(b, trim, X(-R.hw), 0.02, Z(R.z0), X(R.hw), 0.18, Z(R.z0) + 0.06);
    boxN(b, rail2, X(-R.hw), R.h - 0.16, Z(R.z0), X(R.hw), R.h, Z(R.z0) + 0.12);
    // furniture along the walls: a grandfather clock, a safe, a filing cabinet, a side table with a decanter, a coat
    // stand by the door, an umbrella stand, a waste basket, ledgers on the floor, framed certificates
    const wood = M.desk, dark = M.woodD;
    const clk = [X(R.hw - 0.45), Z(R.z0 + 2.4)] as const;
    boxN(b, dark, clk[0] - 0.25, 0.02, clk[1] - 0.2, clk[0] + 0.25, 2.1, clk[1] + 0.2);
    boxN(b, wood, clk[0] - 0.3, 2.1, clk[1] - 0.24, clk[0] + 0.3, 2.3, clk[1] + 0.24);
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24).rotateZ(Math.PI / 2).translate(clk[0] - 0.26, 1.8, clk[1]), lam("clockFace", () => ({ color: "#f3e7c6" })));
    cyl(b, M.brass, clk[0] - 0.27, 0.9, clk[1], 0.08, 0.02, 14);
    const safe = [X(R.hw - 0.5), Z(R.z0 + 3.6)] as const;
    boxN(b, lam("safe", () => ({ color: "#2c3a33" })), safe[0] - 0.35, 0.02, safe[1] - 0.35, safe[0] + 0.3, 0.85, safe[1] + 0.35);
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16).rotateZ(Math.PI / 2).translate(safe[0] - 0.37, 0.5, safe[1]), M.brass);
    boxN(b, wood, X(-R.hw + 0.05), 0.02, Z(R.z0 + 2.2), X(-R.hw + 0.55), 1.3, Z(R.z0 + 2.8)); // filing cabinet
    for (let k = 0; k < 3; k++) boxN(b, M.brass, X(-R.hw + 0.55), 0.3 + k * 0.38, Z(R.z0 + 2.45), X(-R.hw + 0.58), 0.34 + k * 0.38, Z(R.z0 + 2.55));
    const st = [X(R.hw - 0.5), Z(-0.4)] as const; // side table + decanter + two glasses
    cyl(b, dark, st[0], 0.02, st[1], 0.05, 0.7, 8); cyl(b, wood, st[0], 0.72, st[1], 0.32, 0.04, 20);
    b.add(new THREE.SphereGeometry(0.09, 14, 10).translate(st[0], 0.86, st[1]), lam("decanter", () => ({ color: "#a8552c", transparent: true, opacity: 0.85 })));
    cyl(b, lam("decanter", () => ({ color: "#a8552c", transparent: true, opacity: 0.85 })), st[0], 0.93, st[1], 0.025, 0.1, 8);
    for (const o2 of [-0.17, 0.16]) cyl(b, lam("glass", () => ({ color: "#d9e4e6", transparent: true, opacity: 0.6 })), st[0] + o2, 0.76, st[1] + 0.1, 0.035, 0.08, 10);
    const cs = [X(-R.hw + 0.45), Z(1.9)] as const; // coat stand with a coat and a top hat by the door
    cyl(b, dark, cs[0], 0.02, cs[1], 0.03, 1.85, 8); cyl(b, dark, cs[0], 0.02, cs[1], 0.22, 0.04, 12);
    boxN(b, lam("coat", () => ({ color: "#2b2e45" })), cs[0] - 0.05, 0.85, cs[1] - 0.2, cs[0] + 0.12, 1.7, cs[1] + 0.2);
    cyl(b, lam("tophat", () => ({ color: "#1a1418" })), cs[0], 1.86, cs[1], 0.13, 0.03, 16); cyl(b, lam("tophat", () => ({ color: "#1a1418" })), cs[0], 1.88, cs[1], 0.09, 0.2, 16);
    cyl(b, lam("brassBin", () => ({ color: "#8a6a2c" })), X(-R.hw + 0.4), 0.02, Z(2.5), 0.13, 0.5, 14); // umbrella stand
    cyl(b, dark, X(-R.hw + 0.4) + 0.02, 0.4, Z(2.5) + 0.02, 0.015, 0.55, 6);
    cyl(b, lam("basket", () => ({ color: "#9a7a46" })), dx + 1.55, 0.02, dz + 0.3, 0.14, 0.32, 14); // waste basket by the desk
    for (let k = 0; k < 4; k++) boxN(b, lam("ledger" + (k % 3), () => ({ color: ["#6b2a2a", "#2a4a3a", "#3a3060"][k % 3] })), dx - 1.75 + 0.01 * k, 0.02 + 0.07 * k, dz - 0.25 + 0.012 * k, dx - 1.45 + 0.01 * k, 0.09 + 0.07 * k, dz + 0.15 + 0.012 * k);
    for (const [cx, cy] of [[1.6, 2.35], [2.0, 1.75]] as const) { // framed certificates on the right wall
      boxN(b, M.gold, X(R.hw) - 0.03, cy - 0.24, Z(cx - 3.0) - 0.19, X(R.hw), cy + 0.24, Z(cx - 3.0) + 0.19);
      boxN(b, lam("paper", () => ({ color: "#efe4c8" })), X(R.hw) - 0.035, cy - 0.19, Z(cx - 3.0) - 0.14, X(R.hw) - 0.03, cy + 0.19, Z(cx - 3.0) + 0.14);
    }
    prop(b, kit, "pottedPlant", X(R.hw - 0.6), 0.02, Z(R.z0 + 0.6), 1.0);
  }

  b.build(root);
  walls.build(root, true);
  void groundAt; void BENCH;
  return { blind: blind!, freight, test, shopTrain, rigShoe: rigShoe!, rigX0: rigShoe!.position.x, needle: needle!, lampMats };
};
