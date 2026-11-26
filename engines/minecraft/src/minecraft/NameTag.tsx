// A name tag the game's way (EntityRenderer.renderNameTag): white text in the game's font (ascii.png glyphs, 1 px
// advance gap, space 4 px), on a box of black at 25 % opacity from x -1 to the text width and 10 px tall, 0.025 blocks
// per font pixel, always facing the camera, drawn on top of everything (depth test off). Its depth is written so the
// depth-of-field keeps it sharp.
import React, { useMemo } from "react";
import * as THREE from "three";

/** ascii 32..126: "width:rows" (8 rows top to bottom, one hex byte each, bit x = column x) */
const GLYPHS = [
  "3:0000000000000000", "1:0101010101000100", "3:0505000000000000", "5:0a0a1f0a1f0a0a00", "5:041e010e100f0400", "5:1109080402121100", "5:040a04160d091600", "1:0101000000000000",
  "3:0402010101020400", "3:0102040404020100", "3:0502050000000000", "5:0004041f04040000", "1:0000000000000101", "5:0000001f00000000", "1:0000000000000100", "5:1008080402020100",
  "5:0e11191513110e00", "5:0406040404041f00", "5:0e11100c02111f00", "5:0e11100c10110e00", "5:181412111f101000", "5:1f010f1010110e00", "5:0c02010f11110e00", "5:1f11100804040400",
  "5:0e11110e11110e00", "5:0e11111e10080600", "1:0000010000000100", "1:0000010000000101", "4:0804020102040800", "5:00001f00001f0000", "4:0102040804020100", "5:0e11100804000400",
  "6:001e212d253d011e", "5:0e111f1111111100", "5:0f110f1111110f00", "5:0e11010101110e00", "5:0f11111111110f00", "5:1f01070101011f00", "5:1f01070101010100", "5:1e01191111110e00",
  "5:11111f1111111100", "3:0702020202020700", "5:1010101010110e00", "5:1109070911111100", "5:0101010101011f00", "5:111b151111111100", "5:1113151911111100", "5:0e11111111110e00",
  "5:0f110f0101010100", "5:0e11111111091600", "5:0f110f1111111100", "5:1e010e1010110e00", "5:1f04040404040400", "5:1111111111110e00", "5:111111110a0a0400", "5:11111111151b1100",
  "5:110a040a11111100", "5:110a040404040400", "5:1f10080402011f00", "3:0701010101010700", "5:0102020408081000", "3:0704040404040700", "5:040a110000000000", "5:000000000000001f",
  "2:0102000000000000", "5:00000e101e111e00", "5:01010d1311110f00", "5:00000e1101110e00", "5:1010161911111e00", "5:00000e111f011e00", "4:0c020f0202020200", "5:00001e11111e100f",
  "5:01010d1311111100", "1:0100010101010100", "5:100010101011110e", "4:0101090503050900", "2:0101010101010200", "5:00000b1515111100", "5:00000f1111111100", "5:00000e1111110e00",
  "5:00000d13110f0101", "5:00001619111e1010", "5:00000d1301010100", "5:00001e010e100f00", "3:0202070202020400", "5:0000111111111e00", "5:00001111110a0400", "5:0000111115151e00",
  "5:0000110a040a1100", "5:00001111111e100f", "5:00001f0804021f00", "3:0402020102020400", "1:0101010101010100", "3:0102020402020100", "6:2619000000000000",
];

const glyph = (ch: string) => {
  const c = ch.charCodeAt(0);
  const g = c >= 32 && c <= 126 ? GLYPHS[c - 32] : GLYPHS["?".charCodeAt(0) - 32];
  const [w, hex] = g.split(":");
  return { w: Number(w), rows: Array.from({ length: 8 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)) };
};

/** the text width in font pixels (each glyph advances its width + 1) */
export const tagWidth = (text: string) => [...text].reduce((s, ch) => s + glyph(ch).w + 1, 0);

const texCache = new Map<string, THREE.Texture>();
const tagTexture = (text: string) => {
  const hit = texCache.get(text);
  if (hit) return hit;
  const W = tagWidth(text) + 1, H = 10, S = 4;
  const cv = document.createElement("canvas"); cv.width = W * S; cv.height = H * S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 0, W * S, H * S);
  g.fillStyle = "#ffffff";
  let x = 1;
  for (const ch of text) {
    const gl = glyph(ch);
    gl.rows.forEach((row, y) => { for (let b = 0; b < 8; b++) if (row & (1 << b)) g.fillRect((x + b) * S, (y + 1) * S, S, S); });
    x += gl.w + 1;
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(text, t);
  return t;
};

/** `at` = the point the tag's bottom edge sits on (world); `size` = scale on the game's 0.025 blocks per font pixel */
export const NameTag: React.FC<{ text: string; at: [number, number, number]; size?: number; opacity?: number }> = ({ text, at, size = 1, opacity = 1 }) => {
  const sprite = useMemo(() => {
    // drawn over everything (depth func always) but it still writes its own depth: with the depth test off WebGL writes
    // no depth, and the lens blur / fog then treat the tag as the far background behind it (letters blurred away)
    const m = new THREE.SpriteMaterial({ map: tagTexture(text), transparent: true, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, fog: false, toneMapped: false });
    const s = new THREE.Sprite(m);
    s.center.set(0.5, 0);
    s.renderOrder = 1100;
    s.frustumCulled = false;
    return s;
  }, [text]);
  const W = tagWidth(text) + 1, u = 0.025 * size;
  sprite.scale.set(W * u, 10 * u, 1);
  (sprite.material as THREE.SpriteMaterial).opacity = opacity;
  sprite.visible = opacity > 0.01;
  return <primitive object={sprite} position={at} />;
};
