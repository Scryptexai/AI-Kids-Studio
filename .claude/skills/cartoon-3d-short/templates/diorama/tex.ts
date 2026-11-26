// Procedural textures for the courtyard look test (Stage 3, reference "cart" short): stone, wood, dirt ground,
// perforated board, banner. Everything is drawn into canvases at load time, seeded, so every render is identical.
import * as THREE from "three";

// ---------------- seeded random + value noise ----------------
export const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const vnoise = (x: number, y: number, s = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x: number, y: number, oct = 4, s = 0) => {
  let sum = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 17); n += amp; amp *= 0.5; f *= 2.03; }
  return sum / n;
};

const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const toTex = (c: HTMLCanvasElement, srgb = true, repeat = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};
/** per-pixel painter: fn(x, y) -> [r, g, b] in 0..255 */
const paint = (w: number, h: number, fn: (x: number, y: number) => [number, number, number]) => {
  const c = canvas(w, h), g = c.getContext("2d")!, im = g.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, gg, b] = fn(x, y), i = 4 * (y * w + x);
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
};
const cl = (v: number) => Math.max(0, Math.min(255, v));

// ---------------- stone ----------------
/** cut limestone: soft blotches, fine grain, sparse pits and a few chips. Tileable enough at block scale. */
export const stoneTex = () => {
  const N = 512;
  const c = paint(N, N, (x, y) => {
    const big = fbm(x / 110, y / 110, 3, 3), mid = fbm(x / 26, y / 26, 3, 9), fine = vnoise(x / 2.2, y / 2.2, 21);
    let v = 0.86 + 0.16 * (big - 0.5) + 0.1 * (mid - 0.5) + 0.07 * (fine - 0.5);
    const pit = hash(x, y, 77);
    if (pit > 0.9965) v -= 0.22;
    else if (pit < 0.002) v += 0.08;
    const warm = 0.03 + 0.02 * (fbm(x / 60, y / 60, 2, 40) - 0.5);
    return [cl(255 * (v + warm)), cl(255 * (v + 0.006)), cl(255 * (v - warm - 0.03))];
  });
  return toTex(c);
};

/** bump for the stone (grey, linear): the same blotches + grain, stronger */
export const stoneBump = () => {
  const N = 512;
  const c = paint(N, N, (x, y) => {
    const v = 0.5 + 0.35 * (fbm(x / 18, y / 18, 4, 5) - 0.5) + 0.25 * (vnoise(x / 2.5, y / 2.5, 8) - 0.5);
    const k = cl(255 * v);
    return [k, k, k];
  });
  return toTex(c, false);
};

// ---------------- wood ----------------
/** weathered planks running along u; `planks` boards across v, dark seams between them */
export const woodTex = (base: [number, number, number], planks = 4, seed = 1) => {
  const W = 512, H = 512, r = rng(seed), off = Array.from({ length: planks }, () => r() * 100), tone = Array.from({ length: planks }, () => 0.85 + r() * 0.25);
  const c = paint(W, H, (x, y) => {
    const p = Math.min(planks - 1, Math.floor((y / H) * planks)), py = (y / H) * planks - p;
    const grain = Math.sin((y * 0.9 + 6 * fbm(x / 60 + off[p], y / 9, 3, seed)) * 1.7) * 0.5 + 0.5;
    let v = tone[p] * (0.82 + 0.12 * grain + 0.1 * (fbm(x / 40 + off[p], y / 40, 3, seed + 3) - 0.5));
    if (py < 0.035 || py > 0.965) v *= 0.35; // seam
    const knot = fbm(x / 14 + off[p], y / 14, 2, seed + 9);
    if (knot > 0.78) v *= 0.75;
    return [cl(base[0] * v), cl(base[1] * v), cl(base[2] * v)];
  });
  return toTex(c);
};

// ---------------- ground ----------------
/** 40 x 40 m ground canvas (2 cm/px) centred on (cx, cz): packed dirt with pebbles, greener where grass grows. */
export const groundTex = (size: number, px: number, cx: number, cz: number, grassAt: (x: number, z: number) => number) => {
  const c = paint(px, px, (i, j) => {
    const x = cx - size / 2 + (i / px) * size, z = cz - size / 2 + (j / px) * size;
    const n = fbm(x * 0.6, z * 0.6, 3, 2), f = vnoise(x * 18, z * 18, 4), peb = hash(Math.floor(x * 30), Math.floor(z * 30), 9);
    let r = 132, g = 108, b = 78;
    const v = 0.78 + 0.3 * (n - 0.5) + 0.12 * (f - 0.5) + (peb > 0.985 ? 0.25 : 0);
    const m = grassAt(x, z);
    r = r * v; g = g * v; b = b * v;
    // under the grass: dark olive soil
    r = r + (52 - r) * m * 0.85; g = g + (70 - g) * m * 0.85; b = b + (24 - b) * m * 0.85;
    return [cl(r), cl(g), cl(b)];
  });
  const t = toTex(c, true, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};

// ---------------- perforated board ----------------
export const boardTex = () => {
  const W = 512, H = 448;
  const c = paint(W, H, (x, y) => {
    const grain = Math.sin((y * 0.35 + 8 * fbm(x / 70, y / 12, 3, 31)) * 2.1) * 0.5 + 0.5;
    const v = 0.86 + 0.08 * grain + 0.1 * (fbm(x / 30, y / 6, 3, 31) - 0.5);
    return [cl(226 * v), cl(194 * v), cl(132 * v)];
  });
  const g = c.getContext("2d")!;
  for (let j = 0; j < 14; j++) for (let i = 0; i < 16; i++) {
    const x = 26 + i * 29 + (j % 2) * 14, y = 24 + j * 29;
    if (x > W - 20) continue;
    g.fillStyle = "#1c130b"; g.beginPath(); g.ellipse(x, y, 7, 7, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(90,60,30,0.6)"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, 8, 8, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(255,240,200,0.35)"; g.beginPath(); g.ellipse(x + 1.2, y + 1.8, 6.5, 2.2, 0, 0, Math.PI); g.fill();
  }
  return toTex(c, true, false);
};

// ---------------- banner (our own emblem: a white crane on one leg) ----------------
export const bannerTex = () => {
  const W = 256, H = 640, c = canvas(W, H), g = c.getContext("2d")!;
  g.fillStyle = "#1f3fae"; g.fillRect(0, 0, W, H);
  // cloth weave + soft vertical folds
  const im = g.getImageData(0, 0, W, H), d = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = 4 * (y * W + x), k = 0.92 + 0.08 * Math.sin(x * 0.09) + 0.05 * (vnoise(x / 1.5, y / 1.5, 3) - 0.5);
    d[i] = cl(d[i] * k); d[i + 1] = cl(d[i + 1] * k); d[i + 2] = cl(d[i + 2] * k);
  }
  g.putImageData(im, 0, 0);
  g.strokeStyle = "#e3b23c"; g.lineWidth = 9; g.strokeRect(14, 10, W - 28, H - 70);
  g.strokeStyle = "#11286e"; g.lineWidth = 3; g.strokeRect(22, 18, W - 44, H - 86);
  // crane
  g.fillStyle = "#f6f4ee"; g.strokeStyle = "#f6f4ee"; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.ellipse(128, 262, 48, 30, -0.35, 0, Math.PI * 2); g.fill();               // body
  g.beginPath(); g.moveTo(80, 270); g.lineTo(36, 300); g.lineTo(70, 250); g.fill();           // tail
  g.lineWidth = 11; g.beginPath(); g.moveTo(150, 240); g.quadraticCurveTo(178, 190, 150, 150); g.quadraticCurveTo(136, 128, 150, 112); g.stroke(); // neck
  g.beginPath(); g.ellipse(158, 108, 14, 11, 0, 0, Math.PI * 2); g.fill();                    // head
  g.lineWidth = 5; g.beginPath(); g.moveTo(168, 106); g.lineTo(204, 116); g.stroke();          // beak
  g.fillStyle = "#c0353a"; g.beginPath(); g.ellipse(156, 99, 6, 4, 0, 0, Math.PI * 2); g.fill(); // crown
  g.strokeStyle = "#f6f4ee"; g.lineWidth = 6;
  g.beginPath(); g.moveTo(128, 290); g.lineTo(130, 380); g.stroke();                            // leg
  g.beginPath(); g.moveTo(130, 380); g.lineTo(112, 388); g.moveTo(130, 380); g.lineTo(148, 388); g.stroke();
  g.beginPath(); g.moveTo(120, 286); g.lineTo(104, 320); g.lineTo(126, 330); g.stroke();      // tucked leg
  // wing feathers
  g.fillStyle = "#1f3fae"; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(112 + k * 14, 258 + k * 4, 16, 3, -0.4, 0, Math.PI * 2); g.fill(); }
  // gold chevron
  g.strokeStyle = "#e3b23c"; g.lineWidth = 16; g.lineCap = "butt"; g.lineJoin = "miter";
  g.beginPath(); g.moveTo(70, 500); g.lineTo(128, 462); g.lineTo(186, 500); g.stroke();
  // fringe
  for (let x = 16; x < W - 14; x += 5) { g.strokeStyle = x % 10 ? "#d8a838" : "#9a7424"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, H - 62); g.lineTo(x + 1, H - 6); g.stroke(); }
  g.clearRect(0, H - 6, W, 6);
  return toTex(c, true, false);
};
