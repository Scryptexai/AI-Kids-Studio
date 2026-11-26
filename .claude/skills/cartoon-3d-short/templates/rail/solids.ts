// Scene registry for the "no clipping, no z-fighting" check (the user's standing rule): every box, cylinder, Kenney
// prop and horizontal floor plate the set builders make is recorded here with its world-space extent.
//   - groundAt(x, z, y): the surface a character standing near height y rests on (feet go exactly ON it)
//   - zfightReport(): pairs of coplanar, same-facing, overlapping faces (flicker) -> "ZFIGHT|..." lines
//   - collide(x, y0, y1, z, r): solids a character column passes through -> names
import type { V3 } from "./layout";

export type Solid = { n: string; a: V3; b: V3; kind: "box" | "cyl" | "prop" };
export type Plate = { n: string; y: number; x0: number; x1: number; z0: number; z1: number };
export const SOLIDS: Solid[] = [];
export const PLATES: Plate[] = [];
/** start a fresh registry (each World builds the sets once; a new World must not add a second copy) */
export const resetSolids = () => { SOLIDS.length = 0; PLATES.length = 0; tag = "set"; };
let tag = "set";
/** name the things recorded next (a readable label in the reports) */
export const label = (n: string) => { const p = tag; tag = n; return p; };
export const addSolid = (a: V3, b: V3, kind: Solid["kind"] = "box", n = tag) => SOLIDS.push({ n, a: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], b: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])], kind });
export const addPlate = (x0: number, x1: number, z0: number, z1: number, y: number, n = tag) => PLATES.push({ n, y, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });

const E = 1e-4;
/** highest walkable surface under (x, z) at or below y + step (floors, ground layers, step and landing tops) */
export const groundAt = (x: number, z: number, y = 0, step = 0.6) => {
  let g = y < -0.5 ? -Infinity : 0; // underground (the tunnel) nothing is assumed at y = 0
  for (const p of PLATES) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.y <= y + step) g = Math.max(g, p.y);
  for (const s of SOLIDS) if (s.kind === "box" && x >= s.a[0] && x <= s.b[0] && z >= s.a[2] && z <= s.b[2] && s.b[1] <= y + step && s.b[1] - s.a[1] < 0.9 && s.b[1] < 0.6)
    g = Math.max(g, s.b[1]);
  return Number.isFinite(g) ? g : 0;
};
/** solids that a vertical column (radius r round x,z, from y0 to y1) passes through */
export const collide = (x: number, y0: number, y1: number, z: number, r: number) =>
  SOLIDS.filter((s) => x + r > s.a[0] + E && x - r < s.b[0] - E && z + r > s.a[2] + E && z - r < s.b[2] - E && y1 > s.a[1] + E && y0 < s.b[1] - E);

/** Kenney props standing on the floor (bottom below 0.3 m) must rest exactly on the surface under their centre */
export const propReport = (): string[] => {
  const out: string[] = [];
  for (const s of SOLIDS) if (s.kind === "prop" && s.a[1] < 0.3) {
    const cx = (s.a[0] + s.b[0]) / 2, cz = (s.a[2] + s.b[2]) / 2, g = groundAt(cx, cz, s.a[1]);
    if (Math.abs(s.a[1] - g) > 0.002) out.push(`PROPFLOOR|${s.n}@${cx.toFixed(2)},${cz.toFixed(2)}|bottom ${s.a[1].toFixed(3)} ground ${g.toFixed(3)}`);
  }
  // props through walls, furniture or each other (deeper than 5 mm on every axis); cylinders (bars, poles) included
  const D = 0.005, props = SOLIDS.filter((s) => s.kind === "prop");
  for (const p of props) for (const s of SOLIDS) {
    if (s === p || (s.kind === "prop" && SOLIDS.indexOf(s) < SOLIDS.indexOf(p))) continue;
    if (p.n.includes(":") && s.n.includes(":") && Math.abs(SOLIDS.indexOf(s) - SOLIDS.indexOf(p)) === 1) continue; // one tree's trunk and canopy
    const d = [0, 1, 2].map((k) => Math.min(p.b[k], s.b[k]) - Math.max(p.a[k], s.a[k]));
    if (d.every((v) => v > D)) out.push(`PROPCLIP|${p.n}@${p.a.map((v) => v.toFixed(2))}|${s.n}@${s.a.map((v) => v.toFixed(2))}|depth ${Math.min(...d).toFixed(3)}`);
  }
  return out;
};
/** coplanar overlapping faces facing the same way: box-box (6 face directions), plate-plate, plate-box top */
export const zfightReport = (): string[] => {
  const out: string[] = [];
  const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-4;
  const boxes = SOLIDS.filter((s) => s.kind === "box");
  // faces: axis k, side (0 = min face, normal -k; 1 = max face, normal +k)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    for (let k = 0; k < 3; k++) for (const side of [0, 1]) {
      const ca = side ? A.b[k] : A.a[k], cb = side ? B.b[k] : B.a[k];
      if (Math.abs(ca - cb) > 5e-4) continue;
      const u = (k + 1) % 3, v = (k + 2) % 3;
      if (k === 1 && side === 0) continue; // boxes have no bottom faces (boxGeo)
      if (ov(A.a[u], A.b[u], B.a[u], B.b[u]) && ov(A.a[v], A.b[v], B.a[v], B.b[v]))
        out.push(`ZFIGHT|${A.n}@${A.a.map((v) => v.toFixed(2))}|${B.n}@${B.a.map((v) => v.toFixed(2))}|${"xyz"[k]}${side ? "+" : "-"}|${ca.toFixed(4)}`);
    }
  }
  for (let i = 0; i < PLATES.length; i++) {
    const P = PLATES[i];
    for (let j = i + 1; j < PLATES.length; j++) {
      const Q = PLATES[j];
      if (Math.abs(P.y - Q.y) < 5e-4 && ov(P.x0, P.x1, Q.x0, Q.x1) && ov(P.z0, P.z1, Q.z0, Q.z1)) out.push(`ZFIGHT|${P.n}@${P.x0.toFixed(2)},${P.z0.toFixed(2)}|${Q.n}@${Q.x0.toFixed(2)},${Q.z0.toFixed(2)}|plates|${P.y.toFixed(4)}`);
    }
    for (const B of boxes) if (Math.abs(B.b[1] - P.y) < 5e-4 && ov(P.x0, P.x1, B.a[0], B.b[0]) && ov(P.z0, P.z1, B.a[2], B.b[2]))
      out.push(`ZFIGHT|${P.n}@${P.x0.toFixed(2)},${P.z0.toFixed(2)}|${B.n}@${B.a.map((v) => v.toFixed(2))}|plate-top|${P.y.toFixed(4)}`);
  }
  return out;
};
