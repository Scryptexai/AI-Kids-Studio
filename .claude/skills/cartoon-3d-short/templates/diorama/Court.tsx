// Stage-3 look test: one courtyard set rendered like the reference "cart" short (PBR world, no world ink, lit 2D
// character cards, AO + soft DOF + emissive bloom + Neutral tone map). Two shots: A = the opener (worker at the board,
// tower corner behind, ref 0.3 s), B = the commander two-shot with the gate arch and its light shaft (ref 8.5-12 s).
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect } from "postprocessing";
import { World, Kit, loadKit, TRAMPLED } from "./world";
import { Card, COMMANDER, WORKER } from "./chars";
import { LensBlur } from "./lensblur";
import { CHAR } from "./shade";
import type { Expr } from "./toon";

export const COURT_FRAMES = 120;
const SHOT_B = 45;
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** rigid move of the B layout: authored for camera B0 looking at L0, shown from camera B1 looking at L1 */
const B0 = V(-1.45, 1.5, 6.0), L0 = V(-0.3, 3.4, -9), B1 = V(-3.0, 1.5, 5.6), L1 = V(1.75, 3.4, -9);
const yawOf = (c: THREE.Vector3, l: THREE.Vector3) => Math.atan2(l.x - c.x, -(l.z - c.z));
const RIG = -(yawOf(B1, L1) - yawOf(B0, L0));
const rig = (x: number, z: number): [number, number] => {
  const c = Math.cos(RIG), sn = Math.sin(RIG), dx = x - B0.x, dz = z - B0.z;
  return [B1.x + dx * c + dz * sn, B1.z - dx * sn + dz * c];
};
type Marks = { worker: [number, number]; boss: [number, number]; board: [number, number, number]; shed: [number, number, number]; sat: number };
const MARKS: Marks[] = [
  { worker: [-2.05, -4.4], boss: [-0.45, 2.3], board: [-1.35, -4.4, 0.75], shed: [-6.4, -3.8, 0.3], sat: 0.6 },  // A: at the tower corner
  { worker: [-0.5, 1.3], boss: [-1.4, 2.35], board: [0.05, 1.2, 0.95], shed: [-3.9, -2.0, 0], sat: 0.38 },     // B: the two-shot, shed at left
];
// diorama: worn dirt where the cast stands (A: worker + board; B: worker + board, and the commander's mark), in world xz
TRAMPLED.push([-1.75, -4.4, 1.1], [...rig(-0.25, 1.25), 1.0], [...rig(-1.4, 2.35), 0.8]);
/** place changes are an 8 f cross dissolve (the reference has almost no hard cuts); inside a place the camera moves */
const XF = 8;
const layersAt = (f: number): { shot: 0 | 1; alpha: number }[] =>
  f >= SHOT_B - XF / 2 && f < SHOT_B + XF / 2 ? [{ shot: 0, alpha: 1 }, { shot: 1, alpha: (f - (SHOT_B - XF / 2) + 1) / (XF + 1) }] : [{ shot: f < SHOT_B ? 0 : 1, alpha: 1 }];
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
const seg = (f: number, f0: number, f1: number) => ease((f - f0) / (f1 - f0));
/** B in the authored frame (the layout's frame), carried into the world by rig(): MS on the worker, pull back 60-92 */
const BC0 = V(-0.95, 1.25, 4.4), BL0 = V(2.05, 1.8, -9);
const RIGV = (v: THREE.Vector3) => { const [x, z] = rig(v.x, v.z); return V(x, v.y, z); };
/** the commander's walk in from the left (authored frame) */
const BOSS_IN0 = 62, BOSS_IN1 = 86, BOSS_FROM: [number, number] = [-3.3, 1.9];
/** DIORAMA scale cue: the camera sits above the cutouts and looks down (a person looking into a model).
 *  A: 2.7 m high, about 20 deg down. B: rises from 2.2 to 2.9 m during the pull-back, look point near the ground. */
const A_Y = 2.7, A_LY = -0.4, BC_Y = [2.2, 3.1], BL_Y = [-2.2, -0.9];
type Cam = { pos: THREE.Vector3; look: THREE.Vector3; fov: number; focus: THREE.Vector3; cInf: number };
const camAt = (shot: 0 | 1, f: number): Cam => {
  if (shot === 0) { // hook: low MS, worker left of centre, board right, a slow push-in
    const k = ease(f / (SHOT_B + XF / 2));
    return { pos: lerpV(V(-3.2, A_Y, -1.3), V(-3.0, A_Y, -1.75), k), look: lerpV(V(1.0, A_LY, -9.5), V(0.9, A_LY, -9.5), k), fov: 48,
      focus: V(MARKS[0].worker[0], 1.0, MARKS[0].worker[1]), cInf: 15 }; // diorama: macro-lens depth of field
  }
  const u = seg(f, 60, 92), d = seg(f, 92, COURT_FRAMES);
  const pos = lerpV(BC0, B0, u).add(V(0.06 * d + 0.4 * u, 0, -0.25 * d + 1.4 * u)) /* diorama: wider end, both cutouts whole */, look = lerpV(BL0, L0, u);
  pos.y = BC_Y[0] + (BC_Y[1] - BC_Y[0]) * u; look.y = BL_Y[0] + (BL_Y[1] - BL_Y[0]) * u; // diorama: from above, looking down
  const w = MARKS[1].worker, bo = MARKS[1].boss;
  const focus = lerpV(V(w[0], 1.1, w[1]), V(bo[0], 1.4, bo[1]), seg(f, 70, 92));
  return { pos: RIGV(pos), look: RIGV(look), fov: 46, focus: RIGV(focus), cInf: 17 };
};

/** test toggles via inputProps { post: { ao: false, ... } } */
type Post = { ao: boolean; lens: boolean; bloom: boolean; grade: boolean };
const toggles = (): Post => ({ ao: true, lens: true, bloom: true, grade: true, ...((getInputProps() as { post?: Partial<Post> }).post ?? {}) });

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.8, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, mipmapBlur: true, levels: 6, radius: 0.7 });
  const mip = b.mipmapBlurPass, setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("court kit", { timeoutInMilliseconds: 120000 }));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const word = (f: number, seq: [number, Expr][]) => { let e = seq[0][1]; for (const [at, x] of seq) if (f >= at) e = x; return e; };
const fwd = new THREE.Vector3(), fp = new THREE.Vector3();

const Inner: React.FC<{ kit: Kit; shot: 0 | 1 }> = ({ kit, shot }) => {
  const f = useCurrentFrame();
  const { camera, scene, gl } = useThree();
  const on = useMemo(toggles, []);
  const world = useMemo(() => new World(kit, gl, scene), [kit, gl, scene]);
  const cast = useMemo(() => ({ boss: new Card(world.root, COMMANDER, "studs"), worker: new Card(world.root, WORKER, "quilt") }), [world]);
  const fx = useMemo(() => ({
    lens: new LensBlur({ maxCoC: 30, nearScale: 1.4 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    sat: new HueSaturationEffect({ saturation: -0.04 }),
    con: new BrightnessContrastEffect({ contrast: -0.02 }),
    vig: new VignetteEffect({ offset: 0.3, darkness: 0.5 }),
  }), []);
  const post = useMemo(() => {
    const list: [boolean, object][] = [[on.bloom, fx.bloom], [true, fx.tone], [on.grade, fx.sat], [on.grade, fx.con], [on.grade, fx.vig]];
    return (
      <EffectComposer multisampling={4}>
        <>
          {/* lens first: with N8AO ahead of it the lens read the alpha-tested cards at background depth and blurred
              in-focus characters (hidden at court's cInf 3.5, obvious at the diorama's 12-15) */}
          {on.lens && <primitive object={fx.lens.pre} dispose={null} />}
          {on.lens && <primitive object={fx.lens.main} dispose={null} />}
          {on.ao && <N8AO aoRadius={0.9} distanceFalloff={0.6} intensity={2.2} aoSamples={16} denoiseSamples={8} denoiseRadius={8} halfRes={false} />}
          {list.filter(([u]) => u).map(([, o], i) => <primitive key={i} object={o} dispose={null} />)}
        </>
      </EffectComposer>
    );
  }, [fx, on]);

  // ---- camera ----
  const cam = camera as THREE.PerspectiveCamera;
  const isB = shot === 1, m = MARKS[shot], c = camAt(shot, f);
  cam.position.copy(c.pos);
  cam.lookAt(fp.copy(c.look));
  if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  world.update(f, cam, isB ? "back" : "front");
  CHAR.uCharTint.value.set(1, 0.98, 0.95); CHAR.uCharShade.value = 0.88;

  // ---- acting (lively: talk flaps, small sways, expression changes on words) ----
  const walk = seg(f, BOSS_IN0, BOSS_IN1), walking = isB && f < BOSS_IN1 + 2;
  const talkB = isB && f > BOSS_IN1 + 2 ? Math.max(0, Math.sin(f * 1.15)) * (Math.sin(f * 0.21) > -0.3 ? 1 : 0.2) : 0;
  cast.boss.draw({ mode: walking ? "stroll" : "stand", phase: (f - BOSS_IN0) / 16, turn: 0.8, expr: word(f, [[0, "stern"], [88, "skeptic"], [104, "suspicious"]]),
    arm: walking ? undefined : "hips", armK: 1, talk: talkB, facing: 1,
    lean: Math.sin(f * 0.09) * 1.5, headTilt: Math.sin(f * 0.13) * 2, blink: f % 70 > 66 ? 1 : 0, seed: 3 });
  cast.worker.draw({ mode: "stand", expr: word(f, [[0, "skeptic"], [30, "smug"], [80, "skeptic"]]), prop: "drill", reach: Math.sin(f * 0.7), crouch: 0.7, turn: 0.8, talk: !isB ? Math.max(0, Math.sin(f * 1.3)) * 0.6 : 0,
    facing: 1, lean: 13 + Math.sin(f * 0.7) * 1.2, headTilt: -6 + Math.sin(f * 0.17) * 2, drag: Math.sin(f * 0.7 - 0.6) * 3, blink: f % 83 > 79 ? 1 : 0, seed: 7 });
  const P = (x: number, z: number): [number, number] => (isB ? rig(x, z) : [x, z]), Y = isB ? RIG : 0;
  const bossAt: [number, number] = isB ? [BOSS_FROM[0] + (m.boss[0] - BOSS_FROM[0]) * walk, BOSS_FROM[1] + (m.boss[1] - BOSS_FROM[1]) * walk] : m.boss;
  cast.boss.place(...P(...bossAt), cam, 1.05);
  cast.worker.place(...P(...m.worker), cam, 0.92);
  const bd = P(m.board[0], m.board[1]), sd = P(m.shed[0], m.shed[1]);
  world.board.position.set(bd[0], 0, bd[1]); world.board.rotation.y = m.board[2] + Y; world.board.scale.setScalar(0.8);
  world.shed.position.set(sd[0], 0, sd[1]); world.shed.rotation.y = m.shed[2] + Y;
  // fences: the same rigid move (rotation about the origin, then the offset that maps B0 onto B1)
  world.fences.rotation.y = Y;
  { const [ox, oz] = P(0, 0); world.fences.position.set(isB ? ox : 0, 0, isB ? oz : 0); }
  fx.sat.saturation = m.sat;
  cast.boss.mesh.visible = isB;
  world.extras.visible = isB;

  // ---- thin-lens focus ----
  cam.getWorldDirection(fwd);
  fx.lens.focus = Math.max(0.3, c.focus.clone().sub(cam.position).dot(fwd));
  fx.lens.cInf = c.cInf;

  return (
    <>
      <primitive object={world.root} dispose={null} />
      {post}
    </>
  );
};

const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
export const CourtTest: React.FC = () => {
  const kit = useKit();
  const f = useCurrentFrame();
  if (!kit) return null;
  // a dissolve stacks the next shot's canvas over the last one, its opacity rising frame by frame
  return (
    <AbsoluteFill style={{ background: "#9cc4ea" }}>
      {layersAt(f).map((l) => (
        <AbsoluteFill key={l.shot} style={{ opacity: l.alpha }}>
          <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows="soft"
            gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }} camera={{ fov: 40, near: 0.1, far: 1500 }}>
            <Inner kit={kit} shot={l.shot} />
          </ThreeCanvas>
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};
