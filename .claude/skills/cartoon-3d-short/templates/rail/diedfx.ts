// Cast and effect cards of "The Thief Who Died on Time": Clementine Rook (red bun, one loose curl, beauty mark), Inspector
// Ambrose Pike (tall, long nose, one thick brow, trench coat), the doctor (glasses, head mirror, stethoscope) who is
// also the gravedigger and Clementine's sister, Dr Gutsmuth (1822), the officers and the crowd; plus cards drawn with the
// cast's Pen: the golden owl (with its emerald eye, or winking), the Gazette page, mugshots, the CAUGHT stamp, lilies,
// the hand mirror, a flat-lying body, the coffin's emerald glow, a sausage, a beer, soup, glows and flashes.
import { Pen, Outfit, INK, SKINS, bodyFront, Expr } from "./toon";

// ---------------- cast ----------------
const RED = "#c8452a";
export const CLEM: Outfit = { jacket: "#24222c", pants: "#1c1a22", boots: "#141218", hat: "hair", hair: RED, hairdo: "bun", hairTop: 0.4, curl: "#e2582e",
  mole: true, skin: SKINS[0] };
/** in the coffin: pale, a black dress, eyes shut (drawn lying flat) */
export const CLEM_DEAD: Outfit = { ...CLEM, skin: "#ece6e8", jacket: "#1e1c26", dress: "#1e1c26" };
const POLICE = { jacket: "#2b3f7a", pants: "#1f2a4a", boots: "#14141a", hat: "police", cap: "#1f2a4a", buttons: "#e6e6ea" } as const;
/** disguised among the guards: the cap, and the red curl still poking out */
export const CLEM_COP: Outfit = { ...POLICE, curl: "#e2582e", mole: true, skin: SKINS[0] };
export const PIKE: Outfit = { jacket: "#8a6a44", pants: "#3a3440", boots: "#2a1e18", belt: "#5a4430", hat: "hair", hair: "#2a2026", hairTop: 0.36,
  build: "tall", unibrow: true, longNose: true, buttons: "#4a3626", skin: SKINS[1] };
export const DOCTOR: Outfit = { jacket: "#f2f0ea", pants: "#3a3d4a", boots: "#2a2a33", hat: "cap", cap: "#e8e6e0", glasses: true, stetho: true, headMirror: true,
  buttons: "#c9ccd2", skin: SKINS[0] };
export const DIGGER: Outfit = { jacket: "#6a5040", pants: "#3a3028", boots: "#2a1e18", hat: "cap", cap: "#4a3828", glasses: true, skin: SKINS[0] };
/** the gravedigger with her cap off: the same red bun and curl as Clementine */
export const DIGGER_HAIR: Outfit = { ...DIGGER, hat: "hair", hair: RED, hairdo: "bun", hairTop: 0.4, curl: "#e2582e", headMirror: true };
export const GUTSMUTH: Outfit = { jacket: "#3a3046", pants: "#2a2430", boots: "#1a1418", hat: "tophat", moustache: "#e8e2d8", beard: "#e8e2d8", build: "stout",
  bowtie: "#f2efe6", skin: SKINS[1] };
export const HELPER: Outfit = { jacket: "#7a4a3a", pants: "#3a3028", boots: "#2a1e18", hat: "cap", cap: "#5a4636", skin: SKINS[2] };
/** the officers vary a little (skin, moustache, glasses) so the curl is the only giveaway */
export const officer = (v: number): Outfit => ({ ...POLICE, skin: SKINS[(v * 3 + 1) % 4], moustache: v % 4 === 2 ? "#2a1d18" : undefined, glasses: v % 5 === 3 });
/** the townsfolk in the square: hats and coats in muted night colours */
export const folk = (v: number): Outfit => ({
  jacket: ["#7a4a5a", "#4a6a7a", "#6a6a4a", "#5a4a7a", "#7a5a3a", "#4a5a6a"][v % 6], pants: "#33303a", boots: "#2a2420", skin: SKINS[(v * 5 + 2) % 4],
  hat: v % 3 === 0 ? "tophat" : v % 3 === 1 ? "bonnet" : "hair", hair: ["#2a1d18", "#5a3b2a", "#8a6a4a"][v % 3], dress: v % 3 === 1 ? ["#9a5a6a", "#5a7a9a", "#8a7a4a"][v % 3] : undefined,
  moustache: v % 5 === 2 ? "#2a1d18" : undefined, glasses: v % 7 === 4,
});

// ---------------- cards ----------------
const txt = (p: Pen, s: string, x: number, y: number, size: number, col = INK, font = "Georgia, 'Times New Roman', serif", w = 900, align: CanvasTextAlign = "center") => {
  const g = p.g; g.fillStyle = col; g.font = `${w} ${size}px ${font}`; g.textAlign = align; g.textBaseline = "middle"; g.fillText(s, x, y);
};
/** the golden owl on its plinth (400 x 520): eyes [left, right]: "emerald" | "gold" | "wink" (empty, squinting socket) */
export const fxOwl = (p: Pen, left: "emerald" | "wink", glint = 0) => {
  const gold = "#e3b23c", goldD = "#a8781e", goldL = "#ffe08a";
  // body: a tall egg with ear tufts, folded wings, feet on a little plinth
  p.poly([[110, 470], [290, 470], [300, 512], [100, 512]], "#5a4a3a", 6);
  p.ell(200, 300, 128, 170, gold, 7);
  p.ell(170, 270, 70, 110, goldL, 0);
  for (const s of [-1, 1]) {
    p.poly([[200 + s * 70, 150], [200 + s * 118, 70], [200 + s * 126, 170]], gold, 7);
    p.ell(200 + s * 108, 330, 44, 110, goldD, 6, 0, 360, s * 10);
  }
  for (let r = 0; r < 4; r++) for (let k = -2; k <= 2; k++) p.arc(200 + k * 26 + (r % 2) * 13, 330 + r * 28, 12, 9, 20, 160, 3, goldD);
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) p.stroke([[200 + s * 40 + k * 12, 462], [200 + s * 40 + k * 14, 478]], 7, "#8a6226");
  // facial disc and eyes
  for (const s of [-1, 1]) p.ell(200 + s * 52, 210, 56, 54, goldL, 5);
  p.poly([[188, 236], [212, 236], [200, 270]], "#8a6226", 4);
  // right eye: gold
  p.ell(252, 210, 32, 32, goldD, 5); p.ell(252, 210, 14, 14, INK, 0);
  if (left === "emerald") {
    p.ell(148, 210, 36, 36, "#1f9a54", 6); p.ell(148, 210, 22, 22, "#3ed47e", 0); p.poly([[132, 196], [150, 188], [160, 206]], "#b8ffd4", 0);
    if (glint > 0) { const g = p.g; g.globalAlpha = Math.min(1, glint); p.poly([[148, 150], [154, 204], [208, 210], [154, 216], [148, 270], [142, 216], [88, 210], [142, 204]], "#ffffff", 0); g.globalAlpha = 1; }
  } else { // the empty socket reads as a wink: a dark crescent, the lid of gold pressed down over it
    p.ell(148, 214, 34, 22, "#3a2a14", 5);
    p.arc(148, 204, 38, 22, 200, 340, 9, goldD);
  }
};
/** the Larkport Gazette page lying on the desk (720 x 960): masthead, an obituary in a black frame with her portrait
 *  (correction = the correction notice instead) */
export const fxGazette = (p: Pen, clem: Outfit, mode: boolean | "front" = false) => {
  const g = p.g, correction = mode === true;
  g.fillStyle = "#efe7d2"; g.fillRect(0, 0, 720, 960);
  g.strokeStyle = "#cfc4a8"; g.lineWidth = 3; g.strokeRect(6, 6, 708, 948);
  txt(p, "THE LARKPORT GAZETTE", 360, 64, 52, "#1c1418");
  p.stroke([[30, 104], [690, 104]], 5, "#1c1418"); p.stroke([[30, 116], [690, 116]], 2, "#1c1418");
  if (mode === "front") { // the front page: a big headline, a picture of the town hall, columns (no spoilers)
    txt(p, "MONDAY EDITION", 360, 200, 70, "#1c1418");
    p.poly([[60, 260], [660, 260], [660, 560], [60, 560]], "#d6cbb2", 5);
    p.poly([[200, 520], [200, 380], [360, 300], [520, 380], [520, 520]], "#b9ad94", 4);
    for (let i = 0; i < 4; i++) p.stroke([[240 + i * 80, 400], [240 + i * 80, 520]], 10, "#8f846e");
    for (let c = 0; c < 2; c++) for (let i = 0; i < 11; i++) p.stroke([[50 + c * 330, 610 + i * 30], [330 + c * 330 - ((i * 7) % 5) * 22, 610 + i * 30]], 6, "#b9b0a0");
    return;
  }
  // filler columns
  for (let c = 0; c < 2; c++) for (let i = 0; i < 26; i++) p.stroke([[40 + c * 340, 150 + i * 30], [320 + c * 340 - ((i * 7) % 5) * 22, 150 + i * 30]], 6, "#b9b0a0");
  // the box
  p.poly([[110, 190], [610, 190], [610, 860], [110, 860]], "#f7f1e2", 0);
  g.strokeStyle = "#141014"; g.lineWidth = correction ? 8 : 18; g.strokeRect(110, 190, 500, 670);
  if (!correction) {
    txt(p, "OBITUARY", 360, 250, 52, "#141014");
    // portrait in an oval
    g.save(); g.beginPath(); g.ellipse(360, 420, 110, 130, 0, 0, 7); g.clip();
    g.fillStyle = "#d8cdb4"; g.fillRect(240, 280, 240, 280);
    g.translate(360 - 300 * 0.95, 290 - 150 * 0.95); g.scale(0.95, 0.95); bodyFront(p, clem, { mode: "stand", expr: "sly" as Expr, light: -2.1, seed: 3 });
    g.restore();
    g.strokeStyle = "#141014"; g.lineWidth = 8; g.beginPath(); g.ellipse(360, 420, 110, 130, 0, 0, 7); g.stroke();
    txt(p, "CLEMENTINE ROOK", 360, 610, 40, "#141014");
    txt(p, "THIEF", 360, 664, 40, "#7a1c22");
    txt(p, "DIED FRIDAY", 360, 742, 54, "#141014");
    txt(p, "9 P.M.", 360, 810, 64, "#a8222a");
  } else {
    txt(p, "CORRECTION", 360, 262, 60, "#a8222a");
    txt(p, "The late", 360, 380, 50, "#141014", "Georgia, serif", 700);
    txt(p, "Clementine Rook", 360, 450, 54, "#141014");
    txt(p, "is NOT late.", 360, 540, 56, "#141014");
    p.stroke([[200, 580], [520, 580]], 6, "#a8222a");
    for (let i = 0; i < 6; i++) p.stroke([[170, 640 + i * 30], [550 - (i % 2) * 60, 640 + i * 30]], 6, "#b9b0a0");
  }
};
/** a crumpled ball of newspaper (200 x 200) */
export const fxPaperBall = (p: Pen) => {
  const pts: [number, number][] = [];
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, r = 76 + (k % 3) * 12 - (k % 2) * 8; pts.push([100 + Math.cos(a) * r, 100 + Math.sin(a) * r]); }
  p.poly(pts, "#efe7d2", 6);
  for (const [a, b] of [[[60, 80], [120, 110]], [[90, 50], [100, 120]], [[130, 70], [80, 150]], [[50, 120], [140, 140]]] as const) p.stroke([a as [number, number], b as [number, number]], 3, "#9a907e");
};
/** a mugshot on the corkboard (300 x 380): her face with a height chart, a number board, a red pin; stamped CAUGHT */
export const fxMugshot = (p: Pen, clem: Outfit, n: number, stamp: number) => {
  const g = p.g;
  g.fillStyle = "#f4f0e4"; g.fillRect(0, 0, 300, 380);
  g.fillStyle = "#c9c4b4"; g.fillRect(16, 16, 268, 290);
  g.strokeStyle = "#8a8474"; g.lineWidth = 2; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(16, 40 + k * 48); g.lineTo(284, 40 + k * 48); g.stroke(); }
  g.save(); g.beginPath(); g.rect(16, 16, 268, 290); g.clip();
  g.translate(150 - 300 * 1.0, 16 - 150 * 1.0); g.scale(1.0, 1.0); bodyFront(p, clem, { mode: "stand", expr: n === 1 ? "sly" : "grin", light: -2.1, seed: 3 }); g.restore();
  p.poly([[70, 250], [230, 250], [230, 300], [70, 300]], "#1c1a22", 3);
  txt(p, `No. 00${n}`, 150, 276, 30, "#f4f0e4", "monospace");
  txt(p, n === 1 ? "1st TRY" : "2nd TRY", 150, 344, 34, "#3a3036");
  p.ell(150, 10, 12, 12, "#c0262f", 3);
  if (stamp > 0) { // CAUGHT, slammed in at an angle (stamp 0..1 = pop in)
    g.save(); g.translate(150, 170); g.rotate(-0.32); const k = 1 + 0.4 * (1 - stamp); g.scale(k, k); g.globalAlpha = Math.min(1, stamp * 1.5);
    g.strokeStyle = "#c0262f"; g.lineWidth = 10; g.strokeRect(-128, -42, 256, 84);
    txt(p, "CAUGHT", 0, 4, 64, "#c0262f", "Arial, Helvetica, sans-serif"); g.restore();
  }
};
/** the owl's photo pinned on the board (240 x 240) */
export const fxOwlPhoto = (p: Pen) => {
  const g = p.g; g.fillStyle = "#f4f0e4"; g.fillRect(0, 0, 240, 240); g.fillStyle = "#2a2440"; g.fillRect(14, 14, 212, 180);
  g.save(); g.translate(120 - 200 * 0.34, 22); g.scale(0.34, 0.34); fxOwl(p, "emerald"); g.restore();
  txt(p, "OWL'S EYE", 120, 216, 26, "#3a3036", "Arial, Helvetica, sans-serif");
  p.ell(120, 8, 10, 10, "#c0262f", 3);
};
/** a white lily (220 x 220): six petals, yellow stamens; a long stem below for the one on her chest */
export const fxLily = (p: Pen, stem = false) => {
  if (stem) p.stroke([[110, 120], [116, 218]], 9, "#3f8a3a");
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3, x = 110 + Math.cos(a) * 52, y = 104 + Math.sin(a) * 46;
    p.poly([[110, 104], [110 + Math.cos(a - 0.35) * 40, 104 + Math.sin(a - 0.35) * 36], [x, y], [110 + Math.cos(a + 0.35) * 40, 104 + Math.sin(a + 0.35) * 36]], "#fbf8f2", 4);
  }
  for (let k = 0; k < 5; k++) p.ell(110 + Math.cos(k * 1.3) * 16, 100 + Math.sin(k * 1.3) * 12, 5, 5, "#e8b23a", 2);
};
/** a bunch of lilies with leaves (360 x 240) */
export const fxLilies = (p: Pen, seed = 0) => {
  for (let i = 0; i < 6; i++) p.poly([[60 + i * 50, 230], [40 + i * 52, 120], [80 + i * 46, 150]], "#3f8a3a", 4);
  for (let i = 0; i < 5; i++) {
    const x = 50 + i * 64 + ((i * 37 + seed * 11) % 20), y = 70 + ((i * 53 + seed * 7) % 60);
    p.g.save(); p.g.translate(x - 55, y - 52); p.g.scale(0.5, 0.5); fxLily(p); p.g.restore();
  }
};
/** her body lying in the coffin, seen from above (600 x 1000, like a standing card): eyes shut, hand on the chest */
export const fxLying = (p: Pen, o: Outfit, expr: Expr = "dead", seed = 3) => bodyFront(p, o, { mode: "stand", expr, blink: expr === "dead" ? 0 : 0, arm: "chest", light: -2.1, seed });
/** a soft coloured glow (256 x 256) */
export const fxGlowCol = (p: Pen, rgb: string, a = 0.6) => {
  const g = p.g, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.35, `rgba(${rgb},${a * 0.4})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
};
/** a four-ray glint (200 x 200) */
export const fxSparkle = (p: Pen, t: number, col = "#fff6d0") => {
  const k = 0.6 + 0.4 * Math.abs(Math.sin(t * 5.3)), c = 100;
  p.poly([[c, c - 90 * k], [c + 12, c - 12], [c + 90 * k, c], [c + 12, c + 12], [c, c + 90 * k], [c - 12, c + 12], [c - 90 * k, c], [c - 12, c - 12]], col, 0);
  p.ell(c, c, 16, 16, "#ffffff", 0);
};
/** the cut emerald on its own (200 x 160), for the coffin's hidden drawer */
export const fxEmerald = (p: Pen) => {
  p.poly([[50, 30], [150, 30], [186, 74], [140, 140], [60, 140], [14, 74]], "#2fbf6a", 6);
  p.poly([[72, 44], [128, 44], [150, 74], [50, 74]], "#8af0b0", 3);
  p.stroke([[14, 74], [186, 74]], 3, "#1f8a4a");
};
/** a sausage (180 x 80) and a beer mug (140 x 180) and a bowl of soup (200 x 120) for the 1822 lunch */
export const fxSausage = (p: Pen) => { p.band([[24, 44], [156, 36]], "#b8623a", 40, 5, "round"); p.stroke([[60, 30], [70, 50]], 3, "#e08a5a"); p.stroke([[110, 28], [120, 48]], 3, "#e08a5a"); };
export const fxBeer = (p: Pen) => {
  p.poly([[20, 40], [104, 40], [100, 170], [24, 170]], "#e8a83a", 6);
  p.ell(62, 36, 48, 22, "#fbf8f0", 5);
  p.arc(110, 100, 22, 34, -90, 90, 9);
};
export const fxSoup = (p: Pen) => {
  p.poly([[16, 40], [184, 40], [150, 112], [50, 112]], "#e8e2d6", 6);
  p.ell(100, 40, 84, 18, "#d8a04a", 5);
};
/** a speech-free "?" puff (240 x 240) */
export const fxQuestion = (p: Pen) => {
  p.ell(120, 104, 96, 84, "#ffffff", 8);
  p.poly([[70, 168], [52, 228], [112, 180]], "#ffffff", 8);
  txt(p, "?", 120, 110, 130, "#c0262f", "Arial, Helvetica, sans-serif");
};
/** a pocket of mist / dust (256 x 256) */
export const fxDust = (p: Pen, k: number) => {
  const g = p.g;
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28, r = 40 + 70 * k; g.fillStyle = `rgba(200,190,170,${0.5 * (1 - k)})`; g.beginPath(); g.arc(128 + Math.cos(a) * r, 150 + Math.sin(a) * r * 0.5, 30 + 20 * k, 0, 7); g.fill(); }
};
/** the count bubble over Pike (360 x 220): "201?" */
export const fxCount = (p: Pen) => {
  p.ell(180, 96, 168, 88, "#fffaf0", 7);
  p.poly([[150, 176], [190, 176], [160, 214]], "#fffaf0", 6); p.poly([[148, 168], [192, 168], [170, 178]], "#fffaf0", 0);
  txt(p, "201?", 180, 126, 104, "#a8222a");
};
/** the hand mirror held under her nose (200 x 260): clear glass, no fog */
export const fxHandMirror = (p: Pen) => {
  p.band([[100, 250], [100, 170]], "#8a5a34", 18, 5, "round");
  p.ell(100, 92, 84, 84, "#c9a24e", 7); p.ell(100, 92, 64, 64, "#e4f2fa", 0);
  p.poly([[60, 70], [90, 52], [70, 100]], "#ffffff", 0);
};
/** the stamp thud ring (256 x 256) */
export const fxRing = (p: Pen, k: number, col = "#ffffff") => {
  const g = p.g; g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = col; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 30 + 90 * k, 0, 7); g.stroke(); g.globalAlpha = 1;
};
export { INK };
