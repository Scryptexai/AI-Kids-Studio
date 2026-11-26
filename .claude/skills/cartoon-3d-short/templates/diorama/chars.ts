// Two cast cards for the courtyard look test: a commander (studded blue coat, silver dome helm with a red crest, big
// beard, belt, pleated red skirt) and a worker (quilted crimson jacket, messy hair with a headband, a hand drill).
// Drawn with the rail toon.ts on a canvas, then a costume texture is laid over the jacket pixels only (the reference's quilted / studded torsos), lit by cardShade so they take the scene light.
import * as THREE from "three";
import { Pen, bodyFront, Outfit, FrontOpts, INK } from "./toon";
import { cardShade, CARD_K } from "./cardshade";

export const SU = 0.00216; // metres per design unit (1000 units = 2.16 m)
const K = 1.5;             // canvas px per design unit
const TOP = 160;          // headroom above the design canvas (tall crests, raised hands)
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, (1000 + TOP) * SU); g.translate(0, (975 + TOP - (1000 + TOP) / 2) * SU, 0); return g; })();

export const COMMANDER: Outfit = { jacket: "#2d4fa6", pants: "#3a3550", boots: INK, hat: "dome", plume: "#d8302f", bigBeard: "#6a4022",
  belt: null, buttons: "#e8c45a", build: "stout", skin: "#ffffff", hbelt: "#6e4524", skirt: "#c4303a", skirtTrim: "#f2efe6" };
export const WORKER: Outfit = { jacket: "#b02a52", pants: "#3b2f3a", boots: INK, hat: "mop", hair: "#6b4424", band: "#f2efe6", hbelt: "#6e4524",
  belt: null, build: "adult", skin: "#ffffff" };

const hsv = (r: number, g: number, b: number): [number, number, number] => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
};
const hexRGB = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** costume texture on the jacket pixels only: "quilt" = diamond quilting with puffed cells and stitch dashes,
 *  "studs" = staggered gold rivets with a dark rim and a highlight */
const costume = (cv: HTMLCanvasElement, jacket: string, kind: "quilt" | "studs") => {
  const g = cv.getContext("2d")!, W = cv.width, H = cv.height, im = g.getImageData(0, 0, W, H), d = im.data;
  const [jr, jg, jb] = hexRGB(jacket), [jh, js, jv] = hsv(jr, jg, jb);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = 4 * (y * W + x);
    if (d[i + 3] < 200) continue;
    const [h, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
    const dh = Math.min(Math.abs(h - jh), 360 - Math.abs(h - jh));
    if (dh > 16 || s < 0.45 * js || v < 0.6 * jv) continue;
    const X = x / K, Y = y / K;
    let k = 1, add: [number, number, number] | null = null;
    if (kind === "quilt") {
      const S = 26, a = (X + Y) / S, b = (X - Y) / S, fa = a - Math.floor(a), fb = b - Math.floor(b);
      const ea = Math.min(fa, 1 - fa), eb = Math.min(fb, 1 - fb), e = Math.min(ea, eb);
      if (e < 0.05) k = 0.62;                                                   // seam
      else k = 0.86 + 0.32 * Math.min(1, (ea + eb) * 1.4) * 0.5;                // puffed cell, lit middle
      if (e > 0.07 && e < 0.1 && Math.floor((ea < eb ? b : a) * S / 4) % 2 === 0) add = [255, 220, 200]; // stitches
    } else {
      const S = 20, row = Math.floor(Y / S), ox = row % 2 ? S / 2 : 0;
      const cx = Math.round((X - ox) / S) * S + ox, cy = row * S + S / 2, r = Math.hypot(X - cx, Y - cy);
      if (r < 3.6) { const hl = Math.max(0, 1 - Math.hypot(X - cx + 1.2, Y - cy + 1.2) / 2.2); add = [Math.min(255, 232 + 23 * hl), Math.min(255, 192 + 50 * hl), Math.min(255, 70 + 140 * hl)]; }
      else if (r < 4.8) k = 0.45;
      else k = 0.94 + 0.06 * Math.sin(Y * 0.5);
    }
    if (add) { d[i] = add[0]; d[i + 1] = add[1]; d[i + 2] = add[2]; }
    else { d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k); }
  }
  g.putImageData(im, 0, 0);
};

/** DIORAMA signature: the drawing is a paper cutout. A white paper margin (PAPER units) is grown around the inked
 *  silhouette by stamping a white copy of the alpha around a circle, under the drawing, then a thin warm-grey cut edge
 *  (EDGE units) under that. Same trick as a hand-cut sticker. */
const PAPER = 7, EDGE = 1.6;
const tint = (cv: HTMLCanvasElement, col: string) => {
  const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
  const g = c.getContext("2d")!; g.drawImage(cv, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
};
const paperEdge = (cv: HTMLCanvasElement) => {
  const g = cv.getContext("2d")!, white = tint(cv, "#fffaf0"), grey = tint(cv, "#8e8272");
  g.save(); g.globalCompositeOperation = "destination-over";
  const ring = (src: HTMLCanvasElement, r: number) => { for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; g.drawImage(src, Math.cos(a) * r * K, Math.sin(a) * r * K); } };
  ring(white, PAPER * 0.5); ring(white, PAPER);
  ring(grey, PAPER + EDGE);
  g.restore();
};

export class Card {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; key = "";
  constructor(parent: THREE.Object3D, public o: Outfit, public kind: "quilt" | "studs") {
    this.cv = document.createElement("canvas"); this.cv.width = 600 * K; this.cv.height = (1000 + TOP) * K;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mesh = new THREE.Mesh(BODY, this.mat);
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.receiveShadow = true; this.mesh.castShadow = true; this.mesh.renderOrder = 1; // a standing paper cutout casts its own shadow
    parent.add(this.mesh);
  }
  draw(opts: FrontOpts) {
    const key = JSON.stringify(opts);
    if (key === this.key) return;
    this.key = key;
    const g = this.cv.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height); g.setTransform(K, 0, 0, K, 0, TOP * K);
    bodyFront(new Pen(g), this.o, opts);
    g.setTransform(1, 0, 0, 1, 0, 0);
    costume(this.cv, this.o.jacket, this.kind);
    paperEdge(this.cv);
    this.tex.needsUpdate = true;
  }
  /** stand at (x, z) on the ground, card turned to face the camera (yaw only) */
  place(x: number, z: number, cam: THREE.Camera, scale = 1) {
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0);
    this.mesh.scale.setScalar(scale);
  }
}
