// itw-02 Wave A (actors): the per-frame state Mob.tsx adds for the new acts (acts.ts poses the limbs):
//   tumble   the body leaves its path: ballistic bounces between tread points (feet points, world) with a forward roll,
//            a squash on every contact, a slam against the last point (a wall), then an optional roll on to `to`
//            (through a hole), lying flat at the end. A held lantern swings like a pendulum (`swing`, degrees).
//   sneeze   a dust puff from the face at the act's frame (mob-local motes, drawn with the mob's other motes)
//   peek     the mob's silhouette glows through walls (a gold ore with a baby inside): `peekGlow` below
// Pure functions of the frame.
import * as THREE from "three";
import { tumbleTimes, type Act } from "./acts";
import type { Puff } from "./life";
import type { RootPose } from "./raid";

const sm = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI));
const rnd = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const env = (t: number, ein: number, len: number, eout: number) =>
  (t < -ein ? 0 : t < 0 ? (ein > 0 ? sm((t + ein) / ein) : 1) : t <= len ? 1 : eout > 0 ? 1 - sm((t - len) / eout) : 0);

export type Itw2State = {
  /** the body off its path (tumble) */
  root: RootPose | null;
  /** mob-local particles (sneeze dust) */
  motes: Puff[];
  /** a hanging held item's extra swing (degrees, + = top forward) */
  swing: number;
  /** the see-through glow 0..1 and its colour */
  peek: number; peekColor: string;
};
const NONE: Itw2State = { root: null, motes: [], swing: 0, peek: 0, peekColor: "#ffd35a" };

/** how far the body reaches below the hip at this forward pitch (blocks, adult; the box corners of the player) */
const PTS: [number, number][] = [[-0.75, 0.125], [-0.75, -0.125], [1.25, 0.25], [1.25, -0.25], [0.75, 0.25], [0.75, -0.25]];
const below = (p: number) => { let m = 0; for (const [y, z] of PTS) m = Math.max(m, -(y * Math.cos(p) - z * Math.sin(p))); return m; };
/** lying flat: hip above the floor */
const LIE = 4 / 16 + 0.01;

const tumbleRoot = (A: Act[], frame: number, s: number): { root: RootPose; swing: number } | null => {
  const tb = A.filter((a) => a.kind === "tumble" && (a.path?.length ?? 0) >= 2 && frame >= a.f).pop();
  if (!tb || !tb.path) return null;
  const P = tb.path, n = P.length, { fs, slamEnd, rollStart, rollEnd } = tumbleTimes(tb);
  const H = tb.height ?? 0.5, TURN = 0.7 * 2 * Math.PI;
  const yawOf = (i: number) => { const a = P[Math.min(i, n - 2)], b = P[Math.min(i, n - 2) + 1]; return Math.atan2(b[0] - a[0], b[2] - a[2]); };
  // the roll angle at each contact; at the wall it eases to lying face down (the next pi/2 + k 2pi)
  const pitchAt = (i: number) => i * TURN;
  const lieP = (() => { const p = pitchAt(n - 1), k = Math.ceil((p - Math.PI / 2) / (2 * Math.PI)); return Math.PI / 2 + k * 2 * Math.PI; })();
  let hip: THREE.Vector3, pitch: number, yaw: number, squash = 0, floor: number, lie = 0;
  const lastF = fs[n - 1];
  if (frame < lastF) {
    let i = 0;
    while (i < n - 2 && frame >= fs[i + 1]) i++;
    const u = c01((frame - fs[i]) / Math.max(1, fs[i + 1] - fs[i]));
    // the slip: the first segment starts upright and leaves slowly (feet first), later ones are full bounces
    const ue = i === 0 ? u * u : u;
    pitch = pitchAt(i) + (pitchAt(i + 1) - pitchAt(i)) * ue;
    const a = new THREE.Vector3(...P[i]), b = new THREE.Vector3(...P[i + 1]);
    const ya = a.y + (i === 0 ? 0.75 : below(pitchAt(i))) * s, yb = b.y + below(pitchAt(i + 1)) * s;
    hip = a.clone().lerp(b, u); hip.y = ya + (yb - ya) * u + H * s * 4 * u * (1 - u) * (i === 0 ? 0.6 : 1);
    // keep the body clear of the treads under it mid-flight
    const lo = Math.max(a.y, b.y) - (Math.abs(a.y - b.y) * u) + below(pitch) * s;
    if (hip.y < lo) hip.y = lo;
    yaw = yawOf(i);
    const yp = yawOf(Math.max(0, i - 1));
    if (i > 0 && u < 0.3) yaw = yp + Math.atan2(Math.sin(yaw - yp), Math.cos(yaw - yp)) * sm(u / 0.3);
    floor = b.y;
    for (let j = 1; j < n; j++) squash = Math.max(squash, bump((frame - fs[j] + 1) / 5));
  } else if (frame < rollStart || !tb.to) {
    // the slam: squashed on the last point, slumping flat (face down), a shake, then still
    const u = frame - lastF, k = sm(u / 6);
    pitch = pitchAt(n - 1) + (lieP - pitchAt(n - 1)) * k + 0.08 * Math.sin(u * 1.3) * Math.exp(-u / 5);
    const p = new THREE.Vector3(...P[n - 1]);
    hip = p.clone(); hip.y = p.y + (below(pitchAt(n - 1)) * (1 - k) + LIE * k) * s;
    yaw = yawOf(n - 2); floor = p.y; squash = bump((u + 1) / 6); lie = k;
    void slamEnd;
  } else {
    // the roll on through: forward rolls along the floor from the wall point to `to`, lying at the end
    const u = c01((frame - rollStart) / Math.max(1, rollEnd - rollStart)), ue = sm(u);
    const a = new THREE.Vector3(...P[n - 1]), b = new THREE.Vector3(...tb.to);
    pitch = lieP + 2 * Math.PI * ue;
    hip = a.clone().lerp(b, ue);
    hip.y = a.y + (b.y - a.y) * ue + (u < 1 ? below(pitch) : LIE) * s;
    yaw = Math.atan2(b.x - a.x, b.z - a.z); floor = hip.y - below(pitch) * s; lie = u >= 1 ? 1 : 0.5;
  }
  // the lantern swings hard on every bounce and settles after
  const t = frame - tb.f, end = rollEnd - tb.f;
  const swing = 55 * Math.sin(t * 0.55) * (t < end ? 1 : Math.exp(-(t - end) / 18));
  return { root: { hip: hip.toArray() as [number, number, number], pitch, yaw, legRel: 0, squash, floor, lie }, swing };
};

/** the sneeze's dust: 12 puffs out of the face at f, drifting forward and up, shrinking over 18 f (mob-local) */
const sneezeMotes = (A: Act[], frame: number, out: Puff[]) => {
  for (const a of A) {
    if (a.kind !== "sneeze") continue;
    const t = frame - a.f;
    if (t < 0 || t > 20) continue;
    const c = a.color ? new THREE.Color(a.color) : null;
    for (let j = 0; j < 12; j++) {
      const d = rnd(a.f, j) * 3, u = (t - d) / (14 + 6 * rnd(a.f, j + 20));
      if (u < 0 || u >= 1) continue;
      const ang = rnd(a.f, j + 40) * Math.PI * 2, sp = 0.25 + 0.35 * rnd(a.f, j + 60), e = 1 - Math.pow(1 - u, 2);
      const g = 0.78 + 0.18 * rnd(a.f, j + 80);
      out.push({ p: [Math.cos(ang) * sp * 0.6 * e, 1.6 + Math.sin(ang) * sp * 0.4 * e + 0.15 * u, 0.36 + 0.9 * e], s: 0.1 * (1 - u) + 0.03, g, c: c ? [c.r * g, c.g * g, c.b * g] : undefined });
    }
  }
};

/** the itw-02 state for this frame (NONE when no act needs it) */
export const itw2State = (acts: Act[] | undefined, frame: number, s: number): Itw2State => {
  if (!acts?.some((a) => a.kind === "tumble" || a.kind === "sneeze" || a.kind === "peek")) return NONE;
  const st: Itw2State = { root: null, motes: [], swing: 0, peek: 0, peekColor: "#ffd35a" };
  const tr = tumbleRoot(acts, frame, s);
  if (tr) { st.root = tr.root; st.swing = tr.swing; }
  sneezeMotes(acts, frame, st.motes);
  for (const a of acts) {
    if (a.kind !== "peek") continue;
    const t = frame - a.f, k = env(t, a.ein ?? 8, a.len ?? 1e9, a.eout ?? 10) * (a.amt ?? 1) * (0.86 + 0.14 * Math.sin(t * 0.3));
    if (k > st.peek) { st.peek = k; if (a.color) st.peekColor = a.color; }
  }
  return st;
};

// ------------------------------------------------------------------ the peek glow
type PeekState = { k: { value: number }; color: { value: THREE.Color }; proxies: THREE.Mesh[] };
const peekMaterial = (src: THREE.MeshLambertMaterial, k: { value: number }, color: { value: THREE.Color }) => {
  const m = new THREE.MeshBasicMaterial({ map: src.map, alphaTest: Math.max(0.1, src.alphaTest), side: THREE.FrontSide, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uK = k; sh.uniforms.uCol = color;
    sh.fragmentShader = "uniform float uK;\nuniform vec3 uCol;\n" + sh.fragmentShader.replace("#include <dithering_fragment>",
      // a warm see-through silhouette: the glow colour lit a little by the skin's own shading
      "#include <dithering_fragment>\n  float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11));\n  gl_FragColor = vec4(uCol * (0.75 + 0.5 * lum), 0.62 * uK);");
  };
  m.customProgramCacheKey = () => "itw2-peek-glow";
  return m;
};
/** a mob's see-through glow this frame (k 0..1; 0 hides it): proxies of its skin meshes drawn over everything */
export const peekGlow = (root: THREE.Object3D, k: number, color: string) => {
  let st = root.userData.peek as PeekState | undefined;
  if (k <= 0.001) { if (st) for (const p of st.proxies) p.visible = false; return; }
  if (!st) {
    st = { k: { value: 0 }, color: { value: new THREE.Color(color) }, proxies: [] };
    const fresh: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh, mat = m.material as THREE.MeshLambertMaterial | undefined;
      if (m.isMesh && !m.userData.glowProxy && !m.userData.peekProxy && mat && !Array.isArray(mat) && mat.isMeshLambertMaterial && mat.map && !mat.userData.item) fresh.push(m);
    });
    for (const src of fresh) {
      const pm = peekMaterial(src.material as THREE.MeshLambertMaterial, st.k, st.color);
      let p: THREE.Mesh;
      if ((src as THREE.SkinnedMesh).isSkinnedMesh) { const sp = new THREE.SkinnedMesh(src.geometry, pm); sp.bind((src as THREE.SkinnedMesh).skeleton, new THREE.Matrix4()); p = sp; }
      else p = new THREE.Mesh(src.geometry, pm);
      p.userData.peekProxy = true; p.userData.glowProxy = true;
      p.renderOrder = 990; p.frustumCulled = false; p.castShadow = false; p.receiveShadow = false;
      src.add(p); st.proxies.push(p);
    }
    root.userData.peek = st;
  }
  st.k.value = Math.min(1, k); st.color.value.set(color);
  for (const p of st.proxies) p.visible = true;
};
