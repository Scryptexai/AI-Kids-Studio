// WATER through a wall (The Tapper): a drip that beads on a face and slides down it, a trickle running down a face,
// spray arcs (droplets, a translucent sheet, mist and a faint rainbow) and a jet that punches straight out. Pure
// functions of the frame: every droplet's birth frame and velocity come from its index and the seed (a strength key
// sets how many are born per frame), so out-of-order and 60 fps renders agree.
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { keyed } from "./direction";
import { FACE, c01, facePoint, faceRot, rnd, smooth, softDot, type FaceDir, type V3 } from "./fxCommon";

const WATER = "#9fcff5";

// ---------------------------------------------------------------- drips
export type DripSpec = {
  /** where the bead forms: a world point ON the face */
  at: V3; face: FaceDir;
  /** frame the (first) bead starts to swell */
  f: number;
  /** frames the bead swells before it lets go (default 10) */
  grow?: number;
  /** blocks it slides down the face (default 0.8) over `slideLen` frames (default 16, slow start, speeding up) */
  slide?: number; slideLen?: number;
  /** blocks it then falls free (0 = it stops at the end of the slide and sits, default 0) */
  fall?: number;
  /** a new bead every `every` frames (0 = just one), until frame `until` */
  every?: number; until?: number;
  /** bead size in blocks (default 0.07) */
  size?: number;
  /** a darker wet streak left on the face (default true), fading over `streakFade` frames (default 40) */
  streak?: boolean; streakFade?: number;
};

const DROP_GEO = new THREE.SphereGeometry(1, 12, 10);
const STREAK_GEO = new THREE.PlaneGeometry(1, 1);

const DripOne: React.FC<{ s: DripSpec; frame: number }> = ({ s, frame }) => {
  const grow = s.grow ?? 10, slideLen = s.slideLen ?? 16, slide = s.slide ?? 0.8, fall = s.fall ?? 0, size = s.size ?? 0.07;
  const fallLen = fall > 0 ? Math.sqrt((2 * fall) / 20) * 30 : 0;
  const life = grow + slideLen + fallLen + (fall > 0 ? 0 : 1e6);
  const F = FACE[s.face], rot = faceRot(s.face);
  const out: React.ReactNode[] = [];
  const n = s.every ? Math.floor(((s.until ?? s.f + s.every * 20) - s.f) / s.every) + 1 : 1;
  for (let k = 0; k < n; k++) {
    const b = s.f + k * (s.every ?? 0), u = frame - b;
    if (u < 0) continue;
    const streakFade = s.streakFade ?? 40;
    // the bead: swell, then slide (ease-in), then fall
    let y = s.at[1], sc = 1, out2 = 0.6, stretch = 1;
    if (u < grow) { sc = 0.25 + 0.75 * smooth(u / grow); stretch = 1 + 0.2 * (u / grow); }
    else if (u < grow + slideLen) { const w = (u - grow) / slideLen; y -= slide * w * w; stretch = 1.35 + 0.3 * w; }
    else if (fall > 0 && u < grow + slideLen + fallLen) { const t = (u - grow - slideLen) / 30; y -= slide + 0.5 * 20 * t * t + 1.2 * t; out2 = 0.6 + t * 1.5; stretch = 1.7; }
    else if (fall > 0) { /* gone */ }
    const alive = u < life;
    const pos: V3 = [s.at[0] + F.n[0] * size * out2, y, s.at[2] + F.n[2] * size * out2];
    if (alive) {
      out.push(
        <group key={`d${k}`} position={pos} scale={[size * sc, size * sc * stretch, size * sc]}>
          <mesh geometry={DROP_GEO} renderOrder={12}>
            <meshPhongMaterial color={WATER} specular="#ffffff" shininess={90} transparent opacity={0.82} depthWrite={false} />
          </mesh>
          {/* the bead's highlight: a tiny bright dot up-left (catches the bloom) */}
          <mesh geometry={DROP_GEO} position={[-0.35 * F.u[0] - 0.35 * F.u[2], 0.35, 0.5 * F.n[2] + 0.5 * F.n[0]]} scale={0.28} renderOrder={13}>
            <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </group>,
      );
    }
    // the wet streak from the bead's start down to where it is (or got to)
    if (s.streak !== false && u >= grow) {
      const reach = Math.min(slide, slide * c01((u - grow) / slideLen) ** 2);
      const age = u - grow - slideLen, k2 = age > 0 ? 1 - c01(age / streakFade) : 1;
      if (reach > 0.01 && k2 > 0.01) {
        const sp = facePoint(s.face, s.face[1] === "z" ? (s.at[2]) : s.at[0], (s.face[1] === "z" ? s.at[0] : s.at[2]), s.at[1] - reach / 2, 0.004);
        out.push(
          <mesh key={`s${k}`} geometry={STREAK_GEO} position={sp} rotation={rot} scale={[size * 1.3, reach + size, 1]} renderOrder={5}>
            <meshBasicMaterial color="#0e1a26" transparent opacity={0.32 * k2} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>,
        );
      }
    }
  }
  return <>{out}</>;
};

// ---------------------------------------------------------------- trickles
export type TrickleSpec = {
  /** the top point ON the face where the water comes out */
  from: V3; face: FaceDir;
  /** the y it runs down to (the foot of the wall) */
  toY: number;
  /** frame it starts (the front runs down over `grow` frames, default 18) and frame it dries up (front leaves the top) */
  f0: number; f1?: number; grow?: number;
  /** ribbon width in blocks (default 0.14) */
  width?: number;
  /** a small splash where it lands (default true) */
  splash?: boolean;
  seed?: number;
};

const stripeTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 16; c.height = 64;
    const g = c.getContext("2d")!;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) {
      const edge = x < 3 || x > 12;
      const streak = Math.sin(y * 0.55 + x * 1.7) * 0.5 + Math.sin(y * 0.21 - x) * 0.5;
      const v = edge ? 0.35 : 0.7 + 0.3 * streak;
      const a = edge ? 0.55 : 0.85;
      g.fillStyle = `rgba(${Math.round(150 + 105 * c01(v))},${Math.round(200 + 55 * c01(v))},255,${a})`;
      g.fillRect(x, y, 1, 1);
    }
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

const TrickleOne: React.FC<{ s: TrickleSpec; frame: number }> = ({ s, frame }) => {
  const grow = s.grow ?? 18, w = s.width ?? 0.14, top = s.from[1], len = top - s.toY, seed = s.seed ?? 3;
  // its own texture copy (offset per frame), shared material
  const mat = useMemo(() => {
    const t = stripeTex().clone(); t.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: true, side: THREE.DoubleSide });
  }, []);
  const geos = useMemo<THREE.BufferGeometry[]>(() => [], [frame]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const g of geos) g.dispose(); }, [geos]);
  const u = frame - s.f0;
  if (u < 0) return null;
  const front = Math.min(len, len * smooth(u / grow) * (1 + 0.15 * c01(u / grow)));
  const tail = s.f1 !== undefined && frame > s.f1 ? Math.min(len, len * smooth((frame - s.f1) / grow)) : 0;
  if (front - tail < 0.01) return null;
  mat.map!.offset.set(0, frame * 0.09);
  mat.map!.repeat.set(1, (front - tail) * 2);
  // a gently meandering ribbon: a strip of quads following u = u0 + sin(...)
  const plane = s.face[1] === "z" ? s.from[2] : s.from[0], u0 = s.face[1] === "z" ? s.from[0] : s.from[2];
  const geo = new THREE.BufferGeometry();
  const N = 24, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, y = top - tail - (front - tail) * k;
    const mu = u0 + Math.sin((top - y) * 1.9 + seed) * 0.05 + Math.sin((top - y) * 4.3 + seed * 2) * 0.02;
    const ww = w * (0.8 + 0.25 * Math.sin((top - y) * 3 + seed));
    const a = facePoint(s.face, plane, mu - ww / 2, y, 0.012), b = facePoint(s.face, plane, mu + ww / 2, y, 0.012);
    pos.push(...a, ...b); uv.push(0, 1 - k, 1, 1 - k);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geos.push(geo);
  const splash: React.ReactNode[] = [];
  if (s.splash !== false && front >= len - 0.01) {
    for (let k = 0; k < 6; k++) {
      const ph = ((frame * 1.0 + k * 3.3) % 10) / 10, sd = Math.floor((frame + k * 3.3) / 10) * 13 + k;
      const dx = (rnd(sd, 1) - 0.5) * 0.4, out = 0.05 + rnd(sd, 2) * 0.3, h = 0.12 + rnd(sd, 3) * 0.18;
      const p = facePoint(s.face, plane, u0 + dx * ph, s.toY + 4 * h * ph * (1 - ph), out * ph + 0.03);
      splash.push(<mesh key={k} geometry={DROP_GEO} position={p} scale={0.022 * (1 - ph * 0.5)} renderOrder={12}>
        <meshBasicMaterial color="#d9efff" transparent opacity={0.85 * (1 - ph)} depthWrite={false} />
      </mesh>);
    }
  }
  return (
    <>
      <mesh geometry={geo} material={mat} renderOrder={6} />
      {splash}
    </>
  );
};

// ---------------------------------------------------------------- sprays and jets
export type SpraySpec = {
  /** the nozzle: a world point at the crack, ON the face */
  from: V3;
  /** main direction out of the wall (any length), e.g. [0.15, 0.55, -1] out of a -z face and up */
  dir: V3;
  /** "spray" = wide arcs of droplets with a sheet (16B); "jet" = a tight fast rod that punches out (19B) */
  kind?: "spray" | "jet";
  /** [frame, strength 0..1] keys (eased): rate, speed and spread scale with it; 0 = off */
  keys: [number, number][];
  /** blocks/s at strength 1 (spray 9, jet 15) */
  speed?: number;
  /** cone half-angle in degrees (spray 16, jet 3) */
  spread?: number;
  /** droplets born per frame at strength 1 (spray 36, jet 20) */
  rate?: number;
  /** frames a droplet lives (spray 34, jet 24) */
  life?: number;
  /** droplet size in blocks (spray 0.022, jet 0.05) */
  size?: number;
  /** gravity in blocks/s^2 (default 20) */
  gravity?: number;
  /** droplets die below this y (a ground / pool) */
  floor?: number;
  /** soft white mist puffs where the arcs come down: from frame `f`, `n` puffs (default 10), size (default 2.5) */
  mist?: { f: number; n?: number; size?: number; opacity?: number };
  /** a faint rainbow in the mist (orange to violet, never red): fades in from f over 24 f; centre, radius, facing yaw */
  rainbow?: { f: number; at: V3; radius?: number; yaw?: number; opacity?: number };
  /** several parallel streams (16B "arcs"): extra nozzles offset along the face (blocks) */
  fan?: number[];
  seed?: number;
};

const DEF = { spray: { speed: 9, spread: 16, rate: 36, life: 34, size: 0.022 }, jet: { speed: 15, spread: 3, rate: 20, life: 24, size: 0.05 } };
const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

const rainbowTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = 128; c.height = 4;
    const g = c.getContext("2d")!, gr = g.createLinearGradient(0, 0, 128, 0);
    // inner violet -> outer orange (no red band: the only red in the film is Ruby)
    gr.addColorStop(0, "rgba(150,110,255,0)"); gr.addColorStop(0.18, "rgba(150,110,255,0.8)"); gr.addColorStop(0.36, "rgba(90,150,255,0.9)");
    gr.addColorStop(0.54, "rgba(110,230,140,0.9)"); gr.addColorStop(0.72, "rgba(255,240,110,0.9)"); gr.addColorStop(0.88, "rgba(255,175,80,0.8)"); gr.addColorStop(1, "rgba(255,175,80,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 4);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

const CAP = 6000;
const SprayOne: React.FC<{ s: SpraySpec; frame: number; si: number }> = ({ s, frame, si }) => {
  const kind = s.kind ?? "spray", d = DEF[kind];
  const speed = s.speed ?? d.speed, spread = ((s.spread ?? d.spread) * Math.PI) / 180, rate = s.rate ?? d.rate, life = s.life ?? d.life, size = s.size ?? d.size;
  const g = s.gravity ?? 20, seed = (s.seed ?? 11) + si * 101, fan = s.fan?.length ? s.fan : [0];
  const dir = norm(s.dir);
  // a frame basis around dir
  const side = norm(Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [dir[2], 0, -dir[0]]);
  const up: V3 = [dir[1] * side[2] - dir[2] * side[1], dir[2] * side[0] - dir[0] * side[2], dir[0] * side[1] - dir[1] * side[0]];
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(DROP_GEO, new THREE.MeshPhongMaterial({ color: "#cfe9ff", emissive: "#4a7fb0", emissiveIntensity: 0.5, specular: "#ffffff", shininess: 80, transparent: true, opacity: 0.85, depthWrite: false }), CAP);
    m.frustumCulled = false; m.renderOrder = 14;
    return m;
  }, []);
  const geos = useMemo<THREE.BufferGeometry[]>(() => [], [frame]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const g of geos) g.dispose(); }, [geos]);
  const strength = (f: number) => c01(keyed(s.keys, f, 0));
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  let n = 0;
  const now = strength(frame);
  // every droplet born in the last `life` whole frames
  for (let e = Math.floor(frame) - life; e <= Math.floor(frame); e++) {
    const st = strength(e);
    if (st <= 0.01) continue;
    const cnt = Math.round(rate * st);
    for (let j = 0; j < cnt && n < CAP; j++) {
      const sd = seed * 7919 + e * 131 + j;
      const born = e + rnd(sd, 1);                          // spread births across the frame
      const a = frame - born;
      if (a < 0 || a > life) continue;
      const t = a / 30, fi = fan[Math.floor(rnd(sd, 9) * fan.length)];
      // a cone around dir, narrower and faster at full strength
      const ang = spread * Math.sqrt(rnd(sd, 2)) * (0.6 + 0.4 * st), th = rnd(sd, 3) * Math.PI * 2;
      const sp = speed * (0.55 + 0.45 * st) * (0.8 + 0.35 * rnd(sd, 4));
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const v: V3 = [0, 1, 2].map((k) => (dir[k] * ca + (side[k] * Math.cos(th) + up[k] * Math.sin(th)) * sa) * sp) as V3;
      const o: V3 = [s.from[0] + side[0] * fi, s.from[1] + side[1] * fi, s.from[2] + side[2] * fi];
      const p = new THREE.Vector3(o[0] + v[0] * t, o[1] + v[1] * t - 0.5 * g * t * t, o[2] + v[2] * t);
      if (s.floor !== undefined && p.y < s.floor) continue;
      const vel = new THREE.Vector3(v[0], v[1] - g * t, v[2]);
      const vl = vel.length();
      q.setFromUnitVectors(zAxis, vel.normalize());
      const sz = size * (0.6 + 0.6 * rnd(sd, 5)) * (a > life * 0.75 ? 1 - (a - life * 0.75) / (life * 0.25) : 1);
      // stretched along the velocity (a streak reads as fast water)
      mx.compose(p, q, new THREE.Vector3(sz, sz, sz * (1 + vl * 0.2)));
      mesh.setMatrixAt(n++, mx);
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  // the jet's solid rod: a tube along the main trajectory, its front punching out at the jet speed
  let rod: React.ReactNode = null;
  if (kind === "jet" && now > 0.02) {
    const on = s.keys.find(([, v]) => v > 0.01)?.[0] ?? 0;
    const sinceOn = Math.max(0, frame - on) / 30;
    const T = Math.min(life / 30, sinceOn + 0.001);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (T * i) / 16, sp = speed * (0.55 + 0.45 * now);
      pts.push(new THREE.Vector3(s.from[0] + dir[0] * sp * t, s.from[1] + dir[1] * sp * t - 0.5 * g * t * t, s.from[2] + dir[2] * sp * t));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 24, 0.09 + 0.07 * now, 8, false), core = new THREE.TubeGeometry(curve, 24, 0.035 + 0.03 * now, 6, false);
    geos.push(geo, core);
    rod = (
      <>
        <mesh geometry={geo} renderOrder={13}><meshPhongMaterial color="#d8eeff" emissive="#6a9ccc" emissiveIntensity={0.6} transparent opacity={0.8} depthWrite={false} shininess={90} /></mesh>
        <mesh geometry={core} renderOrder={14}><meshBasicMaterial color="#ffffff" transparent opacity={0.7} toneMapped={false} depthWrite={false} /></mesh>
      </>
    );
  }
  // the sheet: a few translucent ribbons along the main arcs (the spray reads as streams at a wide shot)
  let sheet: React.ReactNode = null;
  if (kind === "spray" && now > 0.02) {
    const sp = speed * (0.55 + 0.45 * now), T = life / 30;
    sheet = fan.map((fi, k) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = (T * i) / 20;
        const wob = Math.sin(frame * 0.7 + i * 0.9 + k) * 0.03 * i;
        const p = new THREE.Vector3(s.from[0] + side[0] * (fi + wob) + dir[0] * sp * t, s.from[1] + dir[1] * sp * t - 0.5 * g * t * t, s.from[2] + side[2] * (fi + wob) + dir[2] * sp * t);
        if (s.floor !== undefined && p.y < s.floor) break;
        pts.push(p);
      }
      if (pts.length < 3) return null;
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.05 + 0.06 * now, 6, false);
      geos.push(geo);
      return <mesh key={`sh${k}`} geometry={geo} renderOrder={13}><meshPhongMaterial color="#e2f2ff" emissive="#5d8fbf" emissiveIntensity={0.5} transparent opacity={0.45 * now} depthWrite={false} /></mesh>;
    });
  }
  // mist puffs where the arcs land (drifting, breathing)
  const mist: React.ReactNode[] = [];
  if (s.mist && frame >= s.mist.f - 20) {
    const mk = c01((frame - s.mist.f) / 20) * Math.max(now, 0.15 * c01((frame - s.mist.f) / 20));
    const nM = s.mist.n ?? 10, sz = s.mist.size ?? 2.5, sp = speed * (0.55 + 0.45 * Math.max(now, 0.3));
    for (let k = 0; k < nM; k++) {
      const t = (life / 30) * (0.45 + 0.6 * rnd(seed, 200 + k));
      const fi = fan[k % fan.length];
      const x = s.from[0] + side[0] * fi + dir[0] * sp * t + Math.sin(frame / 37 + k) * 0.6;
      const z = s.from[2] + side[2] * fi + dir[2] * sp * t + Math.cos(frame / 41 + k) * 0.6;
      const ss = sz * (0.7 + 0.6 * rnd(seed, 300 + k)) * (1 + 0.08 * Math.sin(frame / 13 + k));
      // centred high enough that the puff's soft lower edge, not its sprite square, meets the ground
      const y = Math.max(s.floor ?? -1e9, s.from[1] + dir[1] * sp * t - 0.5 * g * t * t) + Math.max(0.6, ss * 0.36) + Math.sin(frame / 29 + k * 2) * 0.2;
      mist.push(<sprite key={`m${k}`} position={[x, y, z]} scale={[ss, ss * 0.7, 1]} renderOrder={16}>
        <spriteMaterial map={softDot()} color="#f4f8ff" transparent opacity={(s.mist.opacity ?? 0.32) * mk} depthWrite={false} />
      </sprite>);
    }
  }
  // the rainbow: a thin arc of bands, additive, faint
  let bow: React.ReactNode = null;
  if (s.rainbow && frame > s.rainbow.f) {
    const k = smooth((frame - s.rainbow.f) / 24) * Math.max(0.25, now), r = s.rainbow.radius ?? 6;
    const geo = ringGeo(r);
    bow = (
      <mesh geometry={geo} position={s.rainbow.at} rotation={[0, ((s.rainbow.yaw ?? 180) * Math.PI) / 180, 0]} renderOrder={17}>
        <meshBasicMaterial map={rainbowTex()} transparent opacity={(s.rainbow.opacity ?? 0.28) * k} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} fog={false} />
      </mesh>
    );
  }
  return (
    <>
      {n > 0 && <primitive object={mesh} />}
      {rod}{sheet}{mist}{bow}
    </>
  );
};

/** a half ring whose u runs across the band (inner -> outer), cached per radius */
const rings = new Map<number, THREE.BufferGeometry>();
const ringGeo = (r: number) => {
  let g = rings.get(r);
  if (g) return g;
  const w = r * 0.12, N = 48, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (0.08 + 0.84 * (i / N));
    for (const [rr, u] of [[r - w, 0], [r, 1]] as const) { pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0); uv.push(u, 0.5); }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  rings.set(r, g);
  return g;
};

export const Water: React.FC<{ drips?: DripSpec[]; trickles?: TrickleSpec[]; sprays?: SpraySpec[] }> = ({ drips, trickles, sprays }) => {
  const frame = useMcFrame();
  return (
    <>
      {drips?.map((s, i) => <DripOne key={`d${i}`} s={s} frame={frame} />)}
      {trickles?.map((s, i) => <TrickleOne key={`t${i}`} s={s} frame={frame} />)}
      {sprays?.map((s, i) => <SprayOne key={`s${i}`} s={s} frame={frame} si={i} />)}
    </>
  );
};
