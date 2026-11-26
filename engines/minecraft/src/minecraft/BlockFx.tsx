// Block states over time (The Tapper's visual language, usable by any short): blocks named in a shot's `blockfx`
// leave the merged world mesh (VoxelWorld `exclude`) and are drawn one by one here, so each can change on its frame:
//   SOLID  - as built
//   GLASSY - washed out, see-through, cool rim, white motes drifting up (fades in over 10 f from `glassy`)
//   GONE   - breaks into motes of its own colour that rise and fade (12 f), then empty (from `gone`)
//   TAP    - white flash on all faces (2 f full, 4 f fade), 1.06 pop with overshoot, colour back to full, one square
//            ring expanding 1.5 blocks (8 f); a tap on a glassy block makes it solid again
//   RE-GLASSY - `reglassy` frames after a tap fade it back to GLASSY (same 10 f fade), e.g. a chain across a box
// and patch outlines: a thin glowing frame around a box of blocks (ownership), fading on over 8 f.
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { blockObject } from "./Actors";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock } from "./types";

type V3 = [number, number, number];
export type BlockFxSpec = {
  /** one block [x,y,z], or a box from..to (inclusive) */
  at?: V3; from?: V3; to?: V3;
  /** frame the block starts turning glassy */
  glassy?: number;
  /** frame it breaks away (glassy first if glassy < gone) */
  gone?: number;
  /** frames a palm touches it (tap -> solid again, flash, pop, ring) */
  taps?: number[];
  /** frames it fades back to GLASSY after a tap (each after a tap; same 10 f fade as `glassy`) */
  reglassy?: number[];
  /** per-block delay in frames across a box (staggered fades), default 0 */
  stagger?: number;
};
export type OutlineSpec = { from: V3; to: V3; color: string; f: number; out?: number; width?: number };

export const fxCells = (s: BlockFxSpec): V3[] => {
  if (s.at) return [s.at];
  const out: V3[] = [];
  const a = s.from!, b = s.to!;
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) out.push([x, y, z]);
  return out;
};
/** "x,y,z" keys of every block a shot's fx touches (for VoxelWorld exclude) */
export const fxKeys = (specs: BlockFxSpec[] | undefined) => new Set((specs ?? []).flatMap(fxCells).map((c) => c.join(",")));

const c01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = c01(v); return k * k * (3 - 2 * k); };
const backOut = (t: number) => { const s = 2.2, u = c01(t) - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/** the average colour of a texture (the block's mote colour) */
export const avgColor = (() => {
  const cache = new Map<string, string>();
  return (tex: THREE.Texture | undefined, key: string): string => {
    if (cache.has(key)) return cache.get(key)!;
    let out = "#9a9a9a";
    const img = tex?.image as HTMLImageElement | undefined;
    if (img && img.width) {
      const c = document.createElement("canvas"); c.width = 16; c.height = 16;
      const g = c.getContext("2d")!; g.drawImage(img, 0, 0, img.width, Math.min(img.height, img.width), 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      if (n) out = `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`;
    }
    cache.set(key, out);
    return out;
  };
})();

/** state of one block at frame f: glassy amount 0..1, gone progress (null = standing), flash 0..1, pop scale, ring 0..1 */
const stateAt = (s: BlockFxSpec, f: number, delay: number) => {
  const taps = (s.taps ?? []).map((t) => t + delay).filter((t) => t <= f);
  const lastTap = taps.length ? Math.max(...taps) : -1e9;
  const g0 = s.glassy !== undefined ? s.glassy + delay : null, gone = s.gone !== undefined ? s.gone + delay : null;
  // the latest fade to glassy so far: the first `glassy`, or a later `reglassy` (absent: exactly the old behaviour)
  const re = (s.reglassy ?? []).map((t) => t + delay).filter((t) => t <= f);
  const lastRe = re.length ? Math.max(...re) : null;
  const gs = lastRe !== null && (g0 === null || lastRe > g0) ? lastRe : g0;
  let glassy = gs !== null && f >= gs ? smooth((f - gs) / 10) : 0;
  if (lastTap > (gs ?? -1e9)) glassy *= 1 - c01((f - lastTap) / 2);           // a tap snaps it back to solid
  const goneK = gone !== null && f >= gone && lastTap < gone ? (f - gone) / 12 : null;
  const since = f - lastTap;
  const flash = since < 0 || since > 6 ? 0 : since <= 2 ? 1 : 1 - (since - 2) / 4;
  const pop = since < 0 || since > 8 ? 1 : 1 + 0.06 * Math.sin(Math.PI * c01(since / 8)) * (since < 4 ? backOut(since / 4) : 1);
  const ring = since < 0 || since > 8 ? null : since / 8;
  return { glassy, goneK, flash, pop, ring };
};

const RING_GEO = (() => {
  const shape = new THREE.Shape(); shape.moveTo(-0.5, -0.5); shape.lineTo(0.5, -0.5); shape.lineTo(0.5, 0.5); shape.lineTo(-0.5, 0.5); shape.lineTo(-0.5, -0.5);
  const hole = new THREE.Path(); hole.moveTo(-0.46, -0.46); hole.lineTo(-0.46, 0.46); hole.lineTo(0.46, 0.46); hole.lineTo(0.46, -0.46); hole.lineTo(-0.46, -0.46);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
})();
const MOTE_GEO = new THREE.BoxGeometry(1, 1, 1);
const EDGE_GEO = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));

const FxBlock: React.FC<{ src: THREE.Group; cell: V3; s: BlockFxSpec; delay: number; color: string; seed: number }> = ({ src, cell, s, delay, color, seed }) => {
  const frame = useMcFrame();
  // own copy with own materials (opacity / flash per block)
  const obj = useMemo(() => {
    const g = src.clone(true);
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => { const c = (x as THREE.MeshLambertMaterial).clone(); c.userData.base = c.color.clone(); return c; }); });
    return g;
  }, [src]);
  const st = stateAt(s, frame, delay);
  const [x, y, z] = cell;
  const gone = st.goneK !== null;
  const motes: React.ReactNode[] = [];
  if (gone && st.goneK! < 1) {
    // break into 8 small squares of its own colour that rise and fade
    for (let i = 0; i < 8; i++) {
      const t = st.goneK!, sz = (0.16 + rnd(seed + i, 1) * 0.1) * (1 - t * 0.7);
      const px = x + 0.2 + rnd(seed + i, 2) * 0.6, pz = z + 0.2 + rnd(seed + i, 3) * 0.6, py = y + 0.2 + rnd(seed + i, 4) * 0.6 + t * (0.8 + rnd(seed + i, 5) * 0.6);
      motes.push(<mesh key={`m${i}`} geometry={MOTE_GEO} position={[px, py, pz]} scale={sz} rotation={[t * 3 * rnd(seed + i, 6), t * 4, 0]}>
        <meshBasicMaterial color={color} transparent opacity={1 - t} toneMapped={false} depthWrite={false} />
      </mesh>);
    }
  } else if (!gone && st.glassy > 0.05) {
    // glassy shimmer: tiny white squares drifting up, about one every 20 frames
    for (let i = 0; i < 3; i++) {
      const per = 60, ph = (frame + rnd(seed, i + 7) * per) % per, t = ph / per;
      motes.push(<mesh key={`s${i}`} geometry={MOTE_GEO} position={[x + 0.15 + rnd(seed, i) * 0.7, y + 0.6 + t * 1.1, z + 0.15 + rnd(seed, i + 3) * 0.7]} scale={0.05}>
        <meshBasicMaterial color="#eef6ff" transparent opacity={st.glassy * 0.9 * Math.sin(Math.PI * t)} toneMapped={false} depthWrite={false} />
      </mesh>);
    }
  }
  if (!gone) {
    const gl = st.glassy;
    obj.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      for (const mat of m.material as THREE.MeshLambertMaterial[]) {
        const base = mat.userData.base as THREE.Color;
        mat.color.copy(base).lerp(new THREE.Color("#c6d6f2"), gl * 0.6);
        mat.transparent = gl > 0.01; mat.opacity = 1 - 0.55 * gl; mat.depthWrite = gl < 0.5;
        mat.emissive = new THREE.Color(st.flash > 0 ? "#ffffff" : "#bcd4ff");
        mat.emissiveIntensity = st.flash > 0 ? st.flash * 0.55 : gl * 0.25;
      }
    });
  }
  return (
    <>
      {!gone && <primitive object={obj} position={[x + 0.5, y + 0.5 - 0.5 * st.pop, z + 0.5]} scale={st.pop} />}
      {!gone && st.glassy > 0.05 && (
        <lineSegments geometry={EDGE_GEO} position={[x + 0.5, y + 0.5, z + 0.5]}>
          <lineBasicMaterial color="#dff0ff" transparent opacity={0.8 * st.glassy} toneMapped={false} />
        </lineSegments>
      )}
      {st.ring !== null && !gone && (
        // the tap ring: a square outline growing from the block to 1.5 blocks, fading (faces the camera side: +z and -z both)
        [0, Math.PI / 2].map((ry) => (
          <mesh key={ry} geometry={RING_GEO} position={[x + 0.5, y + 0.5, z + 0.5]} rotation={[0, ry, 0]} scale={1 + 0.5 * st.ring!}>
            <meshBasicMaterial color="#ffffff" transparent opacity={(1 - st.ring!) * 0.9} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
          </mesh>
        ))
      )}
      {motes}
    </>
  );
};

/** every fx block of a shot (blocks are looked up in the compiled world by position) */
export const BlockFx: React.FC<{ lw: LoadedWorld; specs: BlockFxSpec[] }> = ({ lw, specs }) => {
  const byPos = useMemo(() => {
    const m = new Map<string, CBlock>();
    for (const b of lw.world.blocks) for (let i = 0; i < b.positions.length; i += 3) m.set(`${b.positions[i]},${b.positions[i + 1]},${b.positions[i + 2]}`, b);
    return m;
  }, [lw]);
  const protos = useMemo(() => new Map<string, THREE.Group>(), [lw]);
  const items: React.ReactNode[] = [];
  specs.forEach((s, si) => fxCells(s).forEach((cell, ci) => {
    const b = byPos.get(cell.join(","));
    if (!b) return;
    let src = protos.get(b.key);
    if (!src) { src = blockObject(b, lw.textures); protos.set(b.key, src); }
    const tex = b.elements[0]?.faces.north?.tex ?? b.elements[0]?.faces.up?.tex;
    items.push(<FxBlock key={`${si}:${ci}`} src={src} cell={cell} s={s} delay={ci * (s.stagger ?? 0)} color={avgColor(tex ? lw.textures[tex] : undefined, b.key)} seed={si * 97 + ci * 13} />);
  }));
  return <>{items}</>;
};

/** a thin glowing frame around a box of blocks (ownership): 12 bars, fading on over 8 frames (and off at `out`) */
export const Outline: React.FC<OutlineSpec> = ({ from, to, color, f, out, width = 0.05 }) => {
  const frame = useMcFrame();
  const k = smooth((frame - f) / 8) * (out !== undefined ? 1 - smooth((frame - out) / 8) : 1);
  if (k <= 0.01) return null;
  const a = [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.min(from[2], to[2])];
  const b = [Math.max(from[0], to[0]) + 1, Math.max(from[1], to[1]) + 1, Math.max(from[2], to[2]) + 1];
  const pad = 0.02, w = width;
  const lo = a.map((v) => v - pad), hi = b.map((v) => v + pad);
  const bars: { p: V3; s: V3 }[] = [];
  const mid = (i: number) => (lo[i] + hi[i]) / 2, len = (i: number) => hi[i] - lo[i];
  for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) bars.push({ p: [mid(0), y, z], s: [len(0) + w, w, w] });
  for (const x of [lo[0], hi[0]]) for (const z of [lo[2], hi[2]]) bars.push({ p: [x, mid(1), z], s: [w, len(1) + w, w] });
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) bars.push({ p: [x, y, mid(2)], s: [w, w, len(2) + w] });
  return (
    <>
      {bars.map((bb, i) => (
        <mesh key={i} position={bb.p} scale={bb.s} geometry={MOTE_GEO} renderOrder={22}>
          <meshBasicMaterial color={color} transparent opacity={k} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
};
