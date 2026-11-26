// Shared helpers for The Tapper's fx layers (Crack, Water, BlockText, Book, Glint, Crowd, TapperFx): seeded noise,
// block-face frames (a point given as (u, v) on one side of a block wall), and a 5x7 pixel font drawn onto canvases
// (carved lintel, painted sign, chalk pages). Pure: nothing here reads the clock.
import * as THREE from "three";

export type V3 = [number, number, number];
/** the side of a block a face effect sits on: "-z" = the face looking toward -z (the dam's outer face at z = 40) */
export type FaceDir = "-z" | "+z" | "-x" | "+x";

/** a seeded random in [0, 1) */
export const rnd = (s: number, k: number) => { const x = Math.sin(s * 127.1 + k * 311.7 + 0.123) * 43758.5453; return x - Math.floor(x); };
export const c01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
export const backOut = (t: number, s = 2.0) => { const u = c01(t) - 1; return 1 + (s + 1) * u * u * u + s * u * u; };

/** a face's frame: n = outward normal, u = the face's horizontal axis (world +x on z faces, world +z on x faces),
 *  plane(cell) = the face's coordinate along its normal axis for that block */
export const FACE: Record<FaceDir, { n: V3; u: V3; axis: 0 | 2; side: 0 | 1 }> = {
  "-z": { n: [0, 0, -1], u: [1, 0, 0], axis: 2, side: 0 },
  "+z": { n: [0, 0, 1], u: [1, 0, 0], axis: 2, side: 1 },
  "-x": { n: [-1, 0, 0], u: [0, 0, 1], axis: 0, side: 0 },
  "+x": { n: [1, 0, 0], u: [0, 0, 1], axis: 0, side: 1 },
};
/** the face plane coordinate of a block on that side (z faces: z or z + 1; x faces: x or x + 1) */
export const facePlane = (cell: V3, face: FaceDir) => cell[FACE[face].axis] + FACE[face].side;
/** a world point from face coords: u along the face (world x or z), v = world y, off = distance out of the face */
export const facePoint = (face: FaceDir, plane: number, u: number, v: number, off = 0): V3 => {
  const F = FACE[face];
  return F.axis === 2 ? [u, v, plane + F.n[2] * off] : [plane + F.n[0] * off, v, u];
};
/** the u coordinate of a world point on a face */
export const faceU = (face: FaceDir, p: V3) => (FACE[face].axis === 2 ? p[0] : p[2]);
/** rotation that turns a +z-facing plane to face along the face normal */
export const faceRot = (face: FaceDir): V3 => {
  switch (face) {
    case "-z": return [0, Math.PI, 0];
    case "+z": return [0, 0, 0];
    case "-x": return [0, -Math.PI / 2, 0];
    case "+x": return [0, Math.PI / 2, 0];
  }
};
/** Minecraft yaw (deg; 0 faces +z, -90 faces +x) -> the unit forward vector */
export const yawFwd = (yaw: number): V3 => { const r = (yaw * Math.PI) / 180; return [-Math.sin(r), 0, Math.cos(r)]; };

/** a soft round sprite texture (white centre -> clear edge) */
export const softDot = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(255,255,255,0.4)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c); return t;
  };
})();

/** a canvas as a crisp (nearest) sRGB texture */
export const pixelTex = (c: HTMLCanvasElement, nearest = true) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; }
  return t;
};

// ------------------------------------------------------------------ 5x7 pixel font (own design, chunky, readable small)
const G: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01111 10000 10000 10000 10000 10000 01111", D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01111 10000 10000 10011 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "11111 00100 00100 00100 00100 00100 11111", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 11001 10101 10011 10001 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10011 10101 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00110 01000 10000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100", ",": "00000 00000 00000 00000 01100 00100 01000",
  "!": "00100 00100 00100 00100 00100 00000 00100", "?": "01110 10001 00001 00110 00100 00000 00100",
  "'": "00100 00100 01000 00000 00000 00000 00000", "-": "00000 00000 00000 01110 00000 00000 00000",
  ":": "00000 01100 01100 00000 01100 01100 00000", " ": "00000 00000 00000 00000 00000 00000 00000",
};
/** pixel rows of one glyph (unknown chars draw as a space) */
export const glyph = (ch: string): string[] => (G[ch.toUpperCase()] ?? G[" "]).split(" ");

/** a laid-out text: lines of words, each word's glyph pixels in font units (x right, y down), the block size */
export type TextLayout = { w: number; h: number; words: { line: number; px: [number, number][] }[] };
/** lay out text: 5x7 glyphs, 1 unit between letters, 3 between words, 3 between lines; centred lines */
export const layoutText = (text: string): TextLayout => {
  const lines = text.toUpperCase().split("\n").map((l) => l.trim().split(/\s+/).filter(Boolean));
  const wordW = (w: string) => w.length * 6 - 1;
  const lineW = lines.map((ws) => ws.reduce((a, w) => a + wordW(w), 0) + Math.max(0, ws.length - 1) * 3);
  const W = Math.max(1, ...lineW), H = lines.length * 7 + (lines.length - 1) * 3;
  const words: TextLayout["words"] = [];
  lines.forEach((ws, li) => {
    let x = Math.floor((W - lineW[li]) / 2);
    const y0 = li * 10;
    for (const w of ws) {
      const px: [number, number][] = [];
      [...w].forEach((ch, ci) => glyph(ch).forEach((row, ry) => [...row].forEach((b, rx) => { if (b === "1") px.push([x + ci * 6 + rx, y0 + ry]); })));
      words.push({ line: li, px });
      x += wordW(w) + 3;
    }
  });
  return { w: W, h: H, words };
};
