// Cast and effect cards of "Stopped by Thin Air": George Westinghouse (22, a coil of red hose on his shoulder; 26 in
// 1872 with a fuller moustache), Commodore Vanderbilt (white mutton chops, top hat, fur collar), Dan Tate the engineer
// (striped cap, red neckerchief, soot), the teamster (straw hat), the railroad bosses (bowlers), the brakemen (flat
// caps, lanterns); plus cards drawn with the cast's Pen: the horse, the NO letters, gold coins, a flying cap, a bowler
// on the floor, the air blast from a parted hose, sparks.
import { Pen, Outfit, INK, SKINS } from "./toon";

// ---------------- cast ----------------
export const GEORGE: Outfit = { jacket: "#8a5a34", pants: "#3a3440", boots: "#2a1e18", hat: "hair", hair: "#3a2418", hairTop: 0.38, moustache: "#3a2418",
  hoseCoil: "#c8322e", buttons: "#e0b040", skin: SKINS[0] };
/** 1872: four years on, the same waistcoat, a fuller moustache and no hose */
export const GEORGE72: Outfit = { ...GEORGE, hoseCoil: undefined, build: "stout", moustache: "#2e1c12" };
export const VANDY: Outfit = { jacket: "#1e1c26", pants: "#2a2830", boots: "#141218", hat: "tophat", chops: "#f6f4ee", fur: "#8a6a50", build: "stout",
  buttons: "#c9a24e", skin: SKINS[1] };
/** in a rage: the face goes red */
export const VANDY_RED: Outfit = { ...VANDY, skin: "#ec7a64" };
export const TATE: Outfit = { jacket: "#2e4470", pants: "#283a60", boots: "#1e1a18", hat: "rail", scarf: "#c8322e", moustache: "#1a1412", skin: "#e2b08a" };
export const TEAMSTER: Outfit = { jacket: "#6a7a4a", pants: "#4a5a7a", boots: "#3a2a20", hat: "straw", moustache: "#7a5232", skin: SKINS[2] };
export const boss = (v: number): Outfit => ({
  jacket: ["#2a2a3a", "#3a2e2a", "#2e3a34", "#3a3046"][v % 4], pants: "#26242c", boots: "#141218", hat: "bowler", cap: ["#2a2630", "#4a3a2a", "#2a2630", "#3a3036"][v % 4],
  moustache: v % 2 ? "#3a2a20" : undefined, beard: v === 2 ? "#5a4a3a" : undefined, glasses: v === 3, monocle: v === 0, build: v % 2 ? "stout" : "adult",
  buttons: "#c9a24e", skin: SKINS[(v * 3 + 1) % 4],
});
/** a boss with his bowler knocked off (on the floor after the stop) */
export const bossBare = (v: number): Outfit => ({ ...boss(v), hat: "hair", hair: ["#2a1d18", "#5a3b2a", "#8a8070", "#2a1d18"][v % 4], hairTop: 0.36 });
export const brakeman = (v: number): Outfit => ({ jacket: ["#4a3a2e", "#3a4a52", "#5a4632"][v % 3], pants: "#2e2a30", boots: "#1e1a18", hat: "cap",
  cap: ["#3a3440", "#2e3a4a", "#4a3a2a"][v % 3], moustache: v === 2 ? "#3a2a1e" : undefined, skin: SKINS[(v * 2 + 1) % 4] });
export const brakemanBare = (v: number): Outfit => ({ ...brakeman(v), hat: "hair", hair: "#3a2a1e", hairTop: 0.36 });

// ---------------- cards ----------------
const txt = (p: Pen, s: string, x: number, y: number, size: number, col = INK, font = "Georgia, 'Times New Roman', serif", w = 900) => {
  const g = p.g; g.fillStyle = col; g.font = `${w} ${size}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, x, y);
};
/** the horse in profile facing right (640 x 460, hooves at y 440): "plant" = legs braced, head up, ears back */
export const fxHorse = (p: Pen, plant: boolean, blink: number) => {
  const coat = "#8a5232", dark = "#5a3420", mane = "#2e1c14";
  const hoofY = 440, bodyY = plant ? 210 : 200;
  // legs: far pair darker, near pair; braced when planted (front legs out forward, back legs out behind)
  const leg = (x: number, dx: number, col: string) => {
    p.stroke([[x, bodyY + 40], [x + dx * 0.5, bodyY + 140], [x + dx, hoofY - 20]], 26, INK); p.stroke([[x, bodyY + 40], [x + dx * 0.5, bodyY + 140], [x + dx, hoofY - 20]], 19, col);
    p.poly([[x + dx - 16, hoofY - 22], [x + dx + 16, hoofY - 22], [x + dx + 18, hoofY], [x + dx - 18, hoofY]], "#2a2228", 4);
  };
  const fb = plant ? 34 : 0;
  leg(180, -fb - 6, dark); leg(430, fb + 4, dark);
  // tail, body, neck, head
  p.stroke([[110, bodyY], [80, bodyY + 60], [92, bodyY + 150]], 30, INK); p.stroke([[110, bodyY], [80, bodyY + 60], [92, bodyY + 150]], 22, mane);
  p.ell(300, bodyY + 30, 190, 82, coat, 6);
  const hx = plant ? 545 : 560, hy = plant ? 95 : 120;
  p.poly([[420, bodyY - 20], [470, bodyY - 70], [hx - 20, hy + 10], [hx + 10, hy + 40], [500, bodyY + 30], [440, bodyY + 40]], coat, 6);
  p.ell(hx + 20, hy + 40, 50, 34, coat, 6, 0, 360, plant ? -30 : 30);
  p.ell(hx + 52, hy + (plant ? 18 : 60), 20, 18, "#a87050", 4);
  p.dot(hx + 58, hy + (plant ? 14 : 58), 4, INK);
  // mane along the neck, ears (laid back when planted), the eye
  for (let k = 0; k < 6; k++) { const t = k / 5, x = 440 + (hx - 30 - 440) * t, y = bodyY - 40 + (hy - bodyY + 30) * t; p.ell(x - 6, y - 10, 18, 26, mane, 3, 0, 360, -40); }
  for (const s of [0, 14]) p.poly(plant ? [[hx - 4 + s, hy + 4], [hx - 40 + s, hy - 18], [hx - 2 + s, hy - 8]] : [[hx + s, hy + 2], [hx - 8 + s, hy - 40], [hx + 14 + s, hy - 2]], coat, 4);
  if (blink > 0.6) p.stroke([[hx + 12, hy + 26], [hx + 30, hy + 26]], 5, INK);
  else { p.ell(hx + 20, hy + 26, 10, plant ? 13 : 10, "#ffffff", 3); p.dot(hx + 23, hy + 26, 5, INK); }
  if (plant) p.stroke([[hx + 6, hy + 8], [hx + 30, hy + 14]], 5, INK); // a stubborn brow
  // the near legs and the harness strap
  leg(230, -fb, coat); leg(470, fb, coat);
  p.band([[400, bodyY - 30], [420, bodyY + 90]], "#3a2a20", 14, 3);
  p.band([[260, bodyY - 48], [270, bodyY + 104]], "#3a2a20", 16, 3);
};
/** a rejection letter pinned to the wall (300 x 380): letterhead lines, then a big red NO stamped across (stamp 0..1) */
export const fxLetterNo = (p: Pen, i: number, stamp: number) => {
  const g = p.g;
  g.fillStyle = "#f4ecd6"; g.fillRect(10, 10, 280, 360); g.strokeStyle = "#a89a7a"; g.lineWidth = 4; g.strokeRect(10, 10, 280, 360);
  txt(p, ["N.Y. CENTRAL", "ERIE R.R.", "B. & O.", "READING R.R."][i % 4], 150, 46, 26, "#2a2228");
  p.stroke([[30, 70], [270, 70]], 3, "#2a2228");
  for (let k = 0; k < 7; k++) p.stroke([[34, 100 + k * 26], [262 - ((k * 37) % 70), 100 + k * 26]], 5, "#a8a090");
  p.ell(150, 6, 12, 12, "#c8322e", 3); // the pin
  if (stamp > 0) {
    const s = 1 + 0.6 * (1 - stamp);
    g.save(); g.translate(150, 230); g.rotate(-0.22); g.scale(s, s); g.globalAlpha = Math.min(1, stamp * 1.4);
    g.strokeStyle = "#c8222a"; g.lineWidth = 12; g.strokeRect(-110, -62, 220, 124);
    txt(p, "NO", 0, 6, 112, "#c8222a"); g.restore();
  }
};
/** a stack of gold coins on the desk (240 x 200) */
export const fxCoins = (p: Pen) => {
  for (const [x, n] of [[70, 6], [130, 9], [190, 4]] as const) for (let k = 0; k < n; k++) p.ell(x, 180 - k * 16, 44, 14, k === n - 1 ? "#ffe08a" : "#e3b23c", 3);
};
/** a flat cap flying (200 x 140), side view: a low domed crown, a band, a long peak; a pale edge so it reads at night */
export const fxCap = (p: Pen, col: string) => {
  const crown: [number, number][] = [[22, 96], [28, 66], [62, 44], [120, 38], [160, 50], [176, 74], [176, 96]];
  p.stroke([...crown, crown[0]], 16, "#dfe8f6");
  p.poly(crown, col, 6);
  p.band([[24, 92], [176, 92]], "#1e1a22", 12, 3);
  p.poly([[156, 88], [198, 104], [192, 118], [146, 100]], "#1e1a22", 6);
};
/** a bowler hat lying on the floor (200 x 140) */
export const fxBowler = (p: Pen, col: string) => {
  p.ell(100, 106, 88, 22, col, 5); p.ell(100, 76, 56, 46, col, 5, 180, 360); p.band([[46, 92], [154, 92]], "#141218", 10, 2);
};
/** the air blasting out of a parted hose (400 x 260, blowing to the right): white streaks and dust puffs, phase t */
export const fxBlast = (p: Pen, t: number) => {
  const g = p.g;
  for (let k = 0; k < 9; k++) {
    const y = 130 + (k - 4) * 22 * (0.6 + 0.4 * Math.sin(t * 6 + k)), len = 140 + 120 * ((k * 0.37 + t * 2.3) % 1);
    g.globalAlpha = 0.85 - 0.06 * Math.abs(k - 4);
    p.stroke([[20, 130 + (k - 4) * 4], [20 + len * 0.5, y], [20 + len, y + (k - 4) * 6]], 10 - Math.abs(k - 4), "#f4f8ff");
  }
  g.globalAlpha = 0.7;
  for (let k = 0; k < 6; k++) { const u = (k / 6 + t * 1.7) % 1; p.ell(60 + u * 320, 130 + Math.sin(k * 2.1) * 50 * u, 20 + 40 * u, 16 + 30 * u, "#e8eef6", 0); }
  g.globalAlpha = 1;
};
/** a fan of sparks from a wheel (220 x 160, the wheel contact at the bottom middle), phase t */
export const fxSparks = (p: Pen, t: number) => {
  for (let k = 0; k < 11; k++) {
    const a = Math.PI * (0.08 + 0.84 * ((k * 0.41 + t * 3.1) % 1)), r = 40 + 90 * ((k * 0.73 + t * 2.3) % 1);
    const x = 110 + Math.cos(a) * r, y = 150 - Math.sin(a) * r * 0.9;
    p.stroke([[110 + Math.cos(a) * r * 0.6, 150 - Math.sin(a) * r * 0.54], [x, y]], 5, k % 3 ? "#ffd04a" : "#fff6c8");
  }
};
/** the whistle cord hanging in the cab (80 x 400): a rope with a wooden T handle */
export const fxCord = (p: Pen) => {
  p.stroke([[40, 0], [42, 330]], 10, INK); p.stroke([[40, 0], [42, 330]], 6, "#d8c08a");
  p.band([[14, 340], [70, 340]], "#8a5a34", 20, 4, "round");
};
/** a shop price tag on a string (260 x 180): "$$$" in red */
export const fxPriceTag = (p: Pen) => {
  p.poly([[40, 30], [240, 30], [240, 160], [40, 160], [10, 95]], "#f4ecd6", 6);
  p.ell(36, 95, 9, 9, INK, 0);
  txt(p, "$$$", 145, 98, 84, "#c8222a");
};
/** a small pressure dial (200 x 200), needle 0..1 */
export const fxDial = (p: Pen, k: number) => {
  p.ell(100, 100, 92, 92, "#e3b23c", 6); p.ell(100, 100, 76, 76, "#fbf6e6", 3);
  const a = Math.PI * (0.75 + 1.5 * k);
  p.stroke([[100, 100], [100 + Math.cos(a) * 64, 100 + Math.sin(a) * 64]], 9, "#c8222a");
  p.ell(100, 100, 10, 10, INK, 0);
};
/** the brass brake-valve model on its own (200 x 220), handle up, for the flip */
export const fxValve = (p: Pen) => {
  p.poly([[40, 100], [160, 100], [160, 200], [40, 200]], "#e3b23c", 6);
  p.band([[40, 150], [160, 150]], "#a8781e", 10, 3);
  p.band([[100, 100], [112, 40]], "#3a3036", 12, 4, "round");
  p.ell(114, 30, 26, 18, "#c8322e", 6);
};
export { txt };
