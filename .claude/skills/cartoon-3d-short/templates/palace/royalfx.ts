// Palace cast and the story's 2D effect cards (Tiga Jenderal): outfits for the kings, the prince, the patih, the three
// generals and the extras, plus painted cards drawn with the same Pen as the characters: the old king's portrait, the
// three-fortress map, candle flames and lantern glows, galloping riders, letters and scrolls lying on a desk.
import { Pen, Outfit, bodyFront, INK, SKINS, mix, shade } from "./toon";

// ---------------- cast ----------------
// Javanese court dress: beskap jackets, batik jarik (knee length for soldiers, over dark trousers), keris in the sash
const J = { beskap: true, keris: true, boots: "#3a2a22", pants: "#2e2a30" } as const;
export const SURYA: Outfit = { ...J, jacket: "#f2ead8", jarik: "#8a5a34", hat: "crown", sash: "#c9a24e", moustache: "#f2efe8", beard: "#f2efe8", skin: SKINS[1], build: "stout" };
export const BASKARA: Outfit = { ...J, jacket: "#5e2753", jarik: "#7a4a2a", hat: "crown", sash: "#d9b25a", moustache: "#2a1d18", skin: SKINS[2] };
export const ARYA: Outfit = { ...J, jacket: "#2f8a8f", jarik: "#6b4a2b", hat: "diadem", sash: "#e3b23c", skin: SKINS[0] };
export const KALANG: Outfit = { ...J, jacket: "#24402c", jarik: "#5a3b2a", hat: "blangkon", cap: "#4a3326", batik: "#d9b25a", sash: "#8a6a3a", moustache: "#1e1612", skin: SKINS[3] };
export const WIRATAMA: Outfit = { ...J, jacket: "#9a3434", jarik: "#5a3b2a", jarikShort: true, hat: "helm", plume: "#f2efe8", sash: "#d9b25a", sword: true,
  moustache: "#dedad2", skin: SKINS[1], build: "stout" };
export const SEKAR: Outfit = { ...J, jacket: "#2f6aa8", jarik: "#3a3550", jarikShort: true, hat: "hair", hair: "#2a1b14", hairdo: "braid", sash: "#d9b25a", sword: true, skin: SKINS[2] };
export const BAYU: Outfit = { ...J, jacket: "#d07a2e", jarik: "#5a3b2a", jarikShort: true, hat: "helm", plume: "#f0c53c", sash: "#f1efe6", sword: true, skin: SKINS[3] };
export const COURIER: Outfit = { ...J, keris: false, jacket: "#9a7b4f", jarik: "#6b4a2b", jarikShort: true, hat: "blangkon", cap: "#6b4a2b", sash: "#5a3b2a", skin: SKINS[1] };
export const MAID: Outfit = { jacket: "#d9b98a", jarik: "#9a4e3c", pants: "#3b3f52", boots: "#4a3426", hat: "hair", hair: "#2a1b14", hairdo: "bun", sash: "#8a3b4a", beskap: true, skin: SKINS[3] };
export const GUARD: Outfit = { ...J, keris: false, jacket: "#4f6a3a", jarik: "#5a3b2a", jarikShort: true, hat: "helm", plume: "#4f6a3a", sash: "#f1efe6", spear: true, skin: SKINS[1] };
/** Raja Surya's old court (removed one by one) and the new men who take their seats */
export const OLD_COURT: Outfit[] = [
  { ...J, jacket: "#3f6fb5", jarik: "#6b4a2b", hat: "blangkon", cap: "#2f3a5a", sash: "#d9b25a", moustache: "#dedad2", skin: SKINS[0] },
  { ...J, jacket: "#8c3b4a", jarik: "#5a3b2a", jarikShort: true, hat: "helm", plume: "#8c3b4a", sash: "#d9b25a", moustache: "#4a3020", skin: SKINS[2] },
  { ...J, jacket: "#5d7a3a", jarik: "#5a3b2a", jarikShort: true, hat: "helm", plume: "#f2efe8", sash: "#f1efe6", sword: true, moustache: "#2a201a", skin: SKINS[3] },
];
export const NEW_COURT: Outfit[] = [
  { ...J, jacket: "#4a2448", jarik: "#3a1c38", hat: "blangkon", cap: "#3a1c38", batik: "#b98ad0", sash: "#b98ad0", skin: SKINS[1] },
  { ...J, jacket: "#5a3a6b", jarik: "#3a2a3a", jarikShort: true, hat: "helm", plume: "#6b2d5c", sash: "#d9b25a", skin: SKINS[0] },
  { ...J, jacket: "#6b2d5c", jarik: "#3a2a3a", jarikShort: true, hat: "helm", plume: "#d9b25a", sash: "#f1efe6", sword: true, skin: SKINS[2] },
];
/** townsfolk of the kingdom (coronation crowd) */
export const FOLK: Outfit[] = [0, 1, 2, 3, 4, 5].map((v) => {
  const coats = ["#3f6fb5", "#8c3b4a", "#5d7a3a", "#b5653f", "#2f5f6a", "#c9a24e"];
  const o: Outfit = { jacket: coats[v], pants: "#3b3f52", boots: "#4a3426", skin: SKINS[v % 4], jarik: ["#6b4a2b", "#5a3b2a", "#7a4a2a"][v % 3] };
  return v % 3 === 0 ? { ...o, hat: "caping", jarikShort: true } : v % 3 === 1 ? { ...o, hat: "blangkon", cap: shade(coats[(v + 2) % 6], 0.7), beskap: true, jarikShort: true }
    : { ...o, hat: "hair", hair: "#2a1b14", hairdo: "bun", beskap: true, sash: ["#c25a7a", "#5a8fc2", "#d9a441"][v % 3] };
});

// ---------------- painted cards ----------------
/** Raja Surya's portrait in a gold frame (500 x 640) */
export const fxPortrait = (p: Pen) => {
  p.poly([[20, 20], [480, 20], [480, 620], [20, 620]], "#b8862c", 10);
  p.poly([[52, 52], [448, 52], [448, 588], [52, 588]], "#5a2230", 8);
  const g = p.g;
  g.save();
  g.beginPath(); g.rect(56, 56, 388, 528); g.clip();
  g.translate(250 - 300 * 0.82, 70 - 60 * 0.82); g.scale(0.82, 0.82);
  bodyFront(new Pen(g), SURYA, { mode: "stand", expr: "smile_closed", seed: 4 });
  g.restore();
  for (const [x, y] of [[20, 20], [480, 20], [480, 620], [20, 620]]) p.ell(x, y, 16, 16, "#e3b23c", 6);
};

/** the patih's map (800 x 600): the palace in the middle, fortresses north / south / east; hi = 1 N, 2 S, 3 E lit red */
export const fxMap = (p: Pen, hi: number) => {
  p.poly([[30, 40], [770, 24], [780, 570], [24, 584]], "#ead7a6", 8);
  for (const [x, y] of [[150, 120], [620, 470], [180, 470], [640, 150]]) { // little hills
    p.arc(x, y, 34, 22, 200, 340, 5, "#9c845a"); p.arc(x + 40, y + 8, 26, 16, 200, 340, 5, "#9c845a");
  }
  const C: [number, number] = [400, 330];
  const fort = (x: number, y: number) => {
    p.poly([[x - 34, y + 26], [x + 34, y + 26], [x + 34, y - 14], [x - 34, y - 14]], "#b9b2a4", 5);
    for (const dx of [-34, -12, 10]) p.poly([[x + dx, y - 14], [x + dx + 14, y - 14], [x + dx + 14, y - 28], [x + dx, y - 28]], "#b9b2a4", 5);
  };
  const forts: [number, number][] = [[400, 100], [400, 520], [670, 330]];
  forts.forEach(([x, y]) => fort(x, y));
  // the palace: a little pendopo roof
  p.poly([[C[0] - 50, C[1] + 22], [C[0] + 50, C[1] + 22], [C[0] + 30, C[1] - 8], [C[0] - 30, C[1] - 8]], "#b5653f", 5);
  p.poly([[C[0] - 30, C[1] - 8], [C[0] + 30, C[1] - 8], [C[0], C[1] - 34]], "#b5653f", 5);
  forts.forEach(([x, y], i) => {
    const on = hi === i + 1, col = on ? "#c0353a" : "#6a5a44", w = on ? 12 : 6;
    const dx = x - C[0], dy = y - C[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    const a: [number, number] = [C[0] + ux * 60, C[1] + uy * 60], b: [number, number] = [x - ux * 54, y - uy * 54];
    const n = 9;
    for (let k = 0; k < n; k += 2) p.stroke([[a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)], [a[0] + (b[0] - a[0]) * ((k + 1) / n), a[1] + (b[1] - a[1]) * ((k + 1) / n)]], w, col);
    p.poly([[b[0] + ux * 22, b[1] + uy * 22], [b[0] - uy * 16, b[1] + ux * 16], [b[0] + uy * 16, b[1] - ux * 16]], col, 0);
    if (on) p.arc(x, y, 62, 56, 0, 360, 8, "#c0353a");
  });
  // compass rose (an arrow north, no letters)
  p.poly([[96, 520], [110, 470], [124, 520], [110, 508]], "#6a5a44", 4);
};

/** candle / lantern flame (120 x 200); t flickers it */
export const fxFlame = (p: Pen, t: number) => {
  const k = 1 + 0.08 * Math.sin(t * 31) + 0.05 * Math.sin(t * 17 + 1);
  p.poly([[60, 190], [28, 140], [40, 100], [60, 190 - 170 * k], [80, 100], [92, 140]].map(([x, y]) => [x, y] as [number, number]), "#ffb23c", 0);
  p.poly([[60, 186], [44, 150], [52, 122], [60, 186 - 110 * k], [68, 122], [76, 150]], "#fff1b0", 0);
};

/** soft warm glow (256 x 256), drawn as a see-through card */
export const fxGlow = (p: Pen, col = "255,190,110") => {
  const g = p.g, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(0.35, `rgba(${col},0.22)`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
};

/** a galloping horse with a soldier on it, side view facing screen right (900 x 700); ph = gallop phase 0..1 */
export const fxRider = (p: Pen, ph: number, coat: string, plume: string) => {
  const two = Math.PI * 2, bob = 10 * Math.sin(two * ph * 2), horse = "#7a4b2e", dark = shade(horse, 0.7);
  const leg = (x: number, y: number, a: number, col: string) => {
    const kx = x + Math.sin(a) * 80, ky = y + Math.cos(a) * 80, fx = kx + Math.sin(a * 0.4) * 80, fy = ky + 80;
    p.stroke([[x, y], [kx, ky], [fx, fy]], 26, INK); p.stroke([[x, y], [kx, ky], [fx, fy]], 18, col);
    p.ell(fx, fy + 6, 14, 8, INK, 0);
  };
  const by = 380 + bob;
  leg(300, by + 40, 0.7 * Math.sin(two * ph + 1.4), dark); leg(600, by + 40, 0.7 * Math.sin(two * ph + 0.6), dark);
  p.ell(450, by, 190, 80, horse, 10); // body
  p.poly([[590, by - 40], [700, by - 170], [770, by - 150], [800, by - 110], [720, by - 60], [650, by + 10]], horse, 10); // neck + head
  p.poly([[700, by - 168], [660, by - 120], [640, by - 60], [610, by - 50], [640, by - 150]], "#2a1d18", 6); // mane
  p.dot(745, by - 140, 8);
  p.poly([[262, by - 30], [170, by + 30], [150, by + 120], [200, by + 60], [270, by + 10]], "#2a1d18", 8); // tail
  leg(320, by + 40, 0.7 * Math.sin(two * ph + 3.0), horse); leg(580, by + 40, 0.7 * Math.sin(two * ph + 2.2), horse);
  // rider: a bean torso and head leaning forward, helm with plume
  p.ell(470, by - 130, 46, 70, coat, 9, 0, 360, 18);
  p.ell(500, by - 230, 46, 44, "#f5c9a0", 9);
  p.ell(495, by - 258, 46, 26, "#b8873a", 8, 180, 360);
  p.ell(470, by - 300, 16, 32, plume, 6, 0, 360, -30);
  p.dot(528, by - 232, 6);
  p.stroke([[480, by - 120], [600, by - 110], [700, by - 130]], 10, INK); // arm + reins
};

/** a rider galloping away from the lens (600 x 700): the horse's rump and swinging hind legs, the rider's back */
export const fxRiderBack = (p: Pen, ph: number, coat: string, plume: string) => {
  const two = Math.PI * 2, bob = 12 * Math.sin(two * ph * 2), horse = "#7a4b2e";
  for (const [x, o] of [[235, 0], [365, 0.5]] as const) { // hind legs, alternating
    const up = Math.max(0, Math.sin(two * (ph + o))) * 70;
    p.stroke([[x, 430 + bob], [x + (x < 300 ? -8 : 8), 560 - up * 0.6], [x, 660 - up]], 34, INK);
    p.stroke([[x, 430 + bob], [x + (x < 300 ? -8 : 8), 560 - up * 0.6], [x, 660 - up]], 24, shade(horse, 0.85));
    p.ell(x, 664 - up, 18, 9, INK, 0);
  }
  p.ell(300, 400 + bob, 150, 120, horse, 10);                                   // rump
  p.poly([[300, 330 + bob], [280, 470 + bob], [300, 560 + bob], [320, 470 + bob]], "#2a1d18", 7); // tail
  p.ell(300, 210 + bob, 74, 96, coat, 9);                                       // rider's back
  p.stroke([[240, 220 + bob], [150, 290 + bob]], 22, mix(coat, INK, 0.5)); p.stroke([[360, 220 + bob], [450, 290 + bob]], 22, mix(coat, INK, 0.5));
  p.ell(300, 100 + bob, 58, 54, "#b8873a", 9);                                  // helm from behind
  p.ell(296, 34 + bob, 14, 30, plume, 6, 0, 360, -12);
};

/** cracked plaster round a hole in a wall (400 x 400): chips and dark cracks radiating from the middle */
export const fxCracks = (p: Pen) => {
  const C = 200;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3 * Math.sin(i * 7.1), r0 = 70, r1 = 110 + 70 * Math.abs(Math.sin(i * 3.3));
    const pts: [number, number][] = [];
    for (let k = 0; k <= 4; k++) { const r = r0 + ((r1 - r0) * k) / 4, j = (k % 2 ? 0.12 : -0.1) * Math.sin(i + k); pts.push([C + Math.cos(a + j) * r, C + Math.sin(a + j) * r]); }
    p.stroke(pts, 5, "#4a3a34");
  }
};

/** a letter lying flat on a desk (300 x 380), optional red seal */
export const fxLetter = (p: Pen, seal = true, lines = 7) => {
  p.poly([[20, 24], [280, 14], [286, 362], [16, 368]], "#f3ead2", 6);
  for (let i = 0; i < lines; i++) p.stroke([[50, 62 + i * 36], [250 - (i % 3) * 30, 58 + i * 36]], 6, "#6a5a4c");
  if (seal) p.ell(220, 318, 26, 26, "#b8323a", 5);
};
/** a rolled scroll tied with a red ribbon (360 x 120) */
export const fxScroll = (p: Pen, tie = "#b8323a") => {
  p.poly([[40, 30], [320, 30], [320, 90], [40, 90]], "#e8d6a8", 6);
  for (const x of [32, 328]) p.ell(x, 60, 18, 36, "#8a5a34", 5);
  p.band([[170, 26], [170, 94]], tie, 12, 3);
};
/** a quill (200 x 420) */
export const fxQuill = (p: Pen) => {
  p.poly([[100, 400], [92, 120], [60, 40], [100, 10], [140, 60], [116, 130]], "#f2efe8", 6);
  p.stroke([[100, 400], [104, 30]], 4, "#8a8a8a");
};
/** frangipani (kamboja) blossom (160 x 160): five cream petals, a yellow heart */
export const fxKamboja = (p: Pen) => {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.ell(80 + Math.cos(a) * 38, 80 + Math.sin(a) * 38, 34, 20, "#fbf5e6", 4, 0, 360, (a * 180) / Math.PI);
  }
  p.ell(80, 80, 16, 16, "#f0c53c", 3);
};
/** gold coins spilling (240 x 140) */
export const fxCoins = (p: Pen) => {
  for (const [x, y] of [[60, 90], [110, 80], [160, 96], [90, 50], [140, 44]]) p.ell(x, y, 30, 18, mix("#e3b23c", "#ffffff", 0.1), 5);
};
