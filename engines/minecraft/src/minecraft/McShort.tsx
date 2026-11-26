// A whole Minecraft-mode short: plays the director's animation plan across the staged voxel sets.
// Shots in plan order, each on the set camera that lists it; a "camera.dissolve" shot fades in over the one before
// (the outgoing shot runs on under it), with the voice underneath. The camera is never locked off: it settles in fast
// at the cut (eased, no jolt), then creeps in and drifts. The cast act out the plan's events (swing / reach, blink,
// expression changes eased with a blink) over idle life (breath lean, head tilt, hat drag); mobs keep their own idle.
import React, { useLayoutEffect } from "react";
import * as THREE from "three";
import { AbsoluteFill, Audio, Easing, Freeze, Sequence, interpolate, staticFile, type CalculateMetadataFunction } from "remotion";
import { KEY_FPS, useMcFrame, useMcScale } from "./mcTime";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { McPost } from "./McPost";
import { BlockFx, Outline, fxKeys } from "./BlockFx";
import { Shatter, shatterCells } from "./Shatter";
import { Pour, Waves, sourceSets, waveKeys, type WorldMap } from "./Build";
import { Buttons, Doors, buttonKeys, doorKeys } from "./Doors";
import { NO_FX, useFxTextures, type FxTex } from "./fxTextures";
import { Hud, SpeedLines } from "./Overlays";
import { Fires, LavaFx, fireKeys } from "./Fire";
import { Bolt, Rain } from "./Weather";
import { Booms, boomKeys } from "./Boom";
import { VoxelWorld, useMcWorld, type LoadedWorld } from "./VoxelWorld";
import { Actors, blockObject, hashId, type CastCue, type CastCues, type MobCue, type PropCue } from "./Actors";
import { boomCue, camAt, flashAt, glowAt, heldAt, keyed, keysAt, pathAt, stormAt, type Direction, type ShotDirection } from "./direction";
import type { CompiledWorld, WaveAFx, WaveBFx } from "./types";
import { Fluids, SoftOutlines, cutKeysAt, fluidKeys } from "./Fluids";
import { Items, liveItems, type MobDrop } from "./Items";
import { GhostPistons, Pistons, Redstone, ghostParts, pistonKeys, redstoneKeys } from "./Redstone";
import { Chests } from "./Chest";
import { TapperLayers, TapperScreen, hasTapperFx, tapperBlockFx, tapperFilter, tapperMobCue, tapperWorld } from "./TapperFx";
import { poofDrops, poofFrame } from "./mobs/life";
import type { Expr } from "./cast/toon";
import { povFrame, povHides } from "./FirstPerson";
import { MountainLayers, hasMountainFx, mountainKeys, mountainWaves, shimmerAt } from "./MountainFx";
import { NO_RAID, RaidHud, RaidScene, arrowActs, flowAt, hasRaidScene, imagineAt, keepAt, raidKeys, raidLight, shockWaves, usesRaidFx, useRaidTextures, type Pose, type RaidTex } from "./RaidFx";

type Ev = { startFrame: number; endFrame: number; action: string; params: Record<string, unknown>; target: { kind: string; id: string }; intensity?: number };
type PlanShot = {
  shotId: string; startFrame: number; endFrame: number; environmentId: string; charactersPresent: string[];
  cameraDirectives: { action: string; movement?: string }[]; animationEvents: Ev[];
  continuityState: { characterId: string; emotion?: string }[];
};
export type Plan = { fps: number; shots: PlanShot[] };
/** base: the staged folder holding plan.json + voice.wav; the sets are its siblings (mc-preview/<set>/world.json).
 *  outFps: the video's frame rate (default plan.fps); plan / direction frames stay in plan.fps (KEY_FPS) and every
 *  component reads fractional key frames (mcTime.ts), so a 60 fps render keeps the same timing with real in-betweens */
export type McShortProps = { base: string; plan: Plan | null; tail: number; direction?: Direction | null; only?: string[] | null; outFps?: number | null };
export const McShortDefaults: McShortProps = { base: "mc-preview/mob-farm", plan: null, tail: 20, direction: null, only: null, outFps: null };

/** frames a dissolve takes */
const DISSOLVE = 12;

export const mcShortMetadata: CalculateMetadataFunction<McShortProps> = async ({ props }) => {
  const plan = (await (await fetch(staticFile(`${props.base}/plan.json`))).json()) as Plan;
  if (plan.fps !== KEY_FPS) throw new Error(`McShort: plan.fps ${plan.fps} but the Minecraft components are keyed at ${KEY_FPS}`);
  let direction: Direction | null = null;
  try { const r = await fetch(staticFile(`${props.base}/direction.json`)); if (r.ok) direction = (await r.json()) as Direction; } catch { /* no direction: plan cameras */ }
  // only: render just these shots (a section, e.g. the hook), ending at the last one
  const shots = props.only?.length ? plan.shots.filter((s) => props.only!.includes(s.shotId)) : plan.shots;
  const end = Math.max(...shots.map((s) => s.endFrame));
  const fps = props.outFps ?? plan.fps;
  return { durationInFrames: Math.round(((end + props.tail) * fps) / plan.fps), fps, props: { ...props, plan: { ...plan, shots }, direction } };
};

const EMOTION: Record<string, Expr> = {
  focused: "determined", shock: "shock", happy: "smile", sad: "sad", neutral: "neutral", hopeful: "smile_closed", scared: "fear", angry: "angry",
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const k = clamp01(v); return k * k * (3 - 2 * k); };
const bump = (f: number, a: number, b: number) => (f < a || f > b ? 0 : Math.sin(((f - a) / (b - a)) * Math.PI));
const overshoot = Easing.out(Easing.back(2.2));

/** the cast's acting for one shot: events over the shot's base emotion, on top of idle life */
const shotCues = (shot: PlanShot, fps: number, dir?: ShotDirection): CastCues => (id, t) => {
  const f = t * fps, seed = hashId(id);
  const evs = (dir?.events ?? shot.animationEvents).filter((e) => e.target.id === id);
  const base = EMOTION[shot.continuityState.find((c) => c.characterId === id)?.emotion ?? "neutral"] ?? "neutral";
  const cue: CastCue = {};
  // idle life: a slow breath lean, a head that tilts, hat and hair trailing the head
  let lean = Math.sin(t * 1.7 + seed) * 1.6, headTilt = Math.sin(t * 1.1 + seed * 0.7) * 2.5;
  const drag = Math.sin(t * 1.1 + seed * 0.7 - 0.6) * 3;
  let expr: CastCue["expr"] = base, blink = 0;
  for (const e of evs) {
    if (e.action === "face.blink") blink = Math.max(blink, bump(f, e.startFrame, e.startFrame + 5));
    if (e.action === "face.expr" && f >= e.startFrame - 3) {
      const k = smooth((f - e.startFrame + 3) / 7);
      expr = k >= 1 ? (e.params.expr as Expr) : { from: expr, to: e.params.expr as Expr, k };
      blink = Math.max(blink, bump(f, e.startFrame - 1, e.startFrame + 4));
    }
    if (e.action === "body.reach_forward") {
      // one continuous arc: wind up (ease in, hold a beat at the top), strike with overshoot, settle back to rest
      // params.wind / params.rest shorten the wind-up and the settle (quick repeated chops)
      const a = e.startFrame - Number(e.params?.wind ?? 9), s0 = e.startFrame, h = Math.max(e.endFrame, s0 + 3), r = h + Number(e.params?.rest ?? 12);
      if (f >= a && f <= r) {
        const amt = e.intensity ?? 1;
        const up = f < s0 ? smooth((f - a) / (s0 - 2 - a)) : 0;                       // 0 -> 1, top held 2 frames
        const k = f >= s0 ? overshoot(clamp01((f - s0) / (h - s0))) : 0;              // strike 0 -> 1 (past 1)
        const rest = f > h ? 1 - smooth((f - h) / (r - h)) : 1;                        // strike pose -> rest
        const top = f < s0 ? up : 0, down = f < s0 ? 0 : (f <= h ? k : rest);
        const wind = f < s0 ? up : f <= h ? 1 - Math.min(1, k) : 0;                      // how high it still is
        cue.swing = (-0.7 * wind + 1.5 * down) * amt;
        lean += (-5 * wind + 8 * down) * amt;
        headTilt += 3 * down - 2 * top;
        cue.act = { arm: "reach", armK: Math.max(0.15 * wind, down), armRaw: true };
        // holding a tool: raised overhead on the wind-up, chopped down past rest on the strike
        // params.lift (0-1) scales the wind-up height: low keeps the tool beside the head on quick chops (the card faces the lens)
        const L = Number(e.params?.lift ?? 1);
        cue.tool = { act: { arm: "up", armK: wind * L, armRaw: true }, swing: (1.4 * wind * L - 1.1 * down) * amt, lift: 0.55 * wind * L };
      }
    }
  }
  for (const e of evs) if (e.action === "body.flinch" && f >= e.startFrame - 1 && f <= e.endFrame + 10) {
    // hit: snap back with overshoot, arms up to cover, settle
    const k = f <= e.startFrame + 3 ? overshoot(clamp01((f - e.startFrame + 1) / 4)) : 1 - smooth((f - e.startFrame - 3) / (e.endFrame + 10 - e.startFrame - 3));
    const amt = e.intensity ?? 1;
    lean -= 14 * k * amt; headTilt -= 8 * k * amt;
    cue.act = { arm: "up", armK: 0.8 * k, armRaw: true };
    cue.tool = { act: { arm: "up", armK: 0.8 * k, armRaw: true }, swing: 0.9 * k, lift: 0.3 * k };
    blink = Math.max(blink, bump(f, e.startFrame - 1, e.startFrame + 5));
  }
  // small beats: a nod (lean forward and back, n times) and a gulp (a quick squash down, a blink, head dips)
  let beat = 0;
  for (const e of evs) {
    if (e.action === "body.nod" && f >= e.startFrame && f <= e.endFrame) {
      const n = Number(e.params.n ?? 2), k = (f - e.startFrame) / Math.max(1, e.endFrame - e.startFrame);
      lean += 9 * (e.intensity ?? 1) * Math.max(0, Math.sin(k * Math.PI * n)); headTilt += 2 * Math.sin(k * Math.PI * n);
    }
    if (e.action === "body.gulp" && f >= e.startFrame && f <= e.startFrame + 10) {
      beat += 0.11 * (e.intensity ?? 1) * bump(f, e.startFrame, e.startFrame + 10);
      headTilt -= 4 * bump(f, e.startFrame, e.startFrame + 10);
      blink = Math.max(blink, bump(f, e.startFrame + 1, e.startFrame + 6));
    }
    if (e.action === "body.raise" && f >= e.startFrame - 2 && f <= e.endFrame + 8) {
      // a pop: arm (and tool) up with overshoot, held, then down; "pump" repeats a short punch on the way
      const up = overshoot(clamp01((f - e.startFrame + 2) / 5)), down = smooth((f - e.endFrame) / 8), k = f > e.endFrame ? 1 - down : up;
      const pump = e.params.pump ? 0.25 * Math.abs(Math.sin(((f - e.startFrame) / 4) * Math.PI)) : 0;
      cue.act = { arm: "up", armK: Math.max(0, k - pump), armRaw: true };
      cue.tool = { act: { arm: "up", armK: Math.max(0, k - pump), armRaw: true }, swing: -0.4 * k, lift: 0.5 * k };
      lean -= 4 * k; beat += 0.05 * bump(f, e.startFrame - 2, e.startFrame + 4);
    }
    if (e.action === "body.chuckle" && f >= e.startFrame && f <= e.endFrame) {
      const k = Math.min(1, (f - e.startFrame) / 3, (e.endFrame - f) / 3);
      beat += 0.05 * k * Math.abs(Math.sin(((f - e.startFrame) / 3.2) * Math.PI)); headTilt += 3 * k * Math.sin(((f - e.startFrame) / 6.4) * Math.PI);
    }
    if (e.action === "body.glance_down" && f >= e.startFrame - 3 && f <= e.endFrame + 4) {
      const k = Math.min(smooth((f - e.startFrame + 3) / 5), 1 - smooth((f - e.endFrame) / 4));
      lean += 16 * k * (e.intensity ?? 1); headTilt -= 5 * k;
    }
  }
  const p = pathAt(dir?.cast?.[id], f);
  if (beat) { cue.squash = beat; lean += 30 * beat; }
  if (p) {
    cue.at = p.at;
    // crouch before a jump / squash on landing: lean in, arms swing back
    if (p.squash) { cue.squash = p.squash + beat; lean += 40 * Math.max(0, p.squash); }
    // in the air: arms up, leaning into the jump
    const key = dir!.cast![id].find((k, i, ks) => i > 0 && f >= ks[i - 1].f && f < k.f && k.arc);
    if (key) {
      const ks = dir!.cast![id], i = ks.indexOf(key), raw = clamp01((f - ks[i - 1].f) / (key.f - ks[i - 1].f));
      const air = Math.sin(raw * Math.PI);
      lean += 9 * air; cue.act = { arm: "up", armK: 0.9 * air, armRaw: true };
      cue.tool = { act: { arm: "up", armK: 0.5 * air, armRaw: true }, swing: -0.5 * air, lift: 0.05 * air };   // tool trails low, never across the face
    }
  }
  cue.expr = expr; cue.blink = blink;
  cue.act = { ...cue.act, lean, headTilt, drag };
  return cue;
};

type CamShot = CompiledWorld["cameras"][number] & { shots?: string[] };
const ease = Easing.bezier(0.45, 0, 0.55, 1);

/** the set camera's pose at a frame (pure): settles in over the first frames (fast, eased), then a slow push and drift */
const movingPose = (cam: CamShot, len: number, seed: number, frame: number): Pose => {
  const pos = new THREE.Vector3(...cam.position), look = new THREE.Vector3(...cam.lookAt);
  const fwd = look.clone().sub(pos), dist = fwd.length();
  fwd.normalize();
  const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const settle = 1 - Easing.out(Easing.cubic)(clamp01(frame / 16));
  const creep = ease(clamp01(frame / Math.max(1, len)));
  const dir = seed % 2 ? 1 : -1;
  const back = dist * (0.06 * settle - 0.045 * creep);
  const lateral = dist * (0.035 * dir * settle - 0.02 * dir * creep) + Math.sin(frame / 41 + seed) * dist * 0.004;
  const p = pos.clone().addScaledVector(fwd, -back).addScaledVector(side, lateral);
  p.y += Math.sin(frame / 53 + seed * 1.3) * dist * 0.003;
  return { pos: p.toArray() as [number, number, number], look: cam.lookAt as [number, number, number], fov: cam.fov };
};

/** the set camera, never locked off (movingPose) */
const MovingCam: React.FC<{ cam: CamShot; len: number; seed: number }> = ({ cam, len, seed }) => {
  const { camera } = useThree();
  const frame = useMcFrame();
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera, s = movingPose(cam, len, seed, frame);
    c.position.set(...s.pos);
    c.fov = s.fov;
    c.near = 0.05; c.far = 400;
    c.lookAt(new THREE.Vector3(...s.look));
    c.updateProjectionMatrix();
  });
  return null;
};

/** the direction's keyframed camera (FOV punches, shakes, handheld drift) */
const DirectedCam: React.FC<{ dir: ShotDirection; seed: number }> = ({ dir, seed }) => {
  const { camera } = useThree();
  const frame = useMcFrame();
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera, s = camAt(dir, frame, seed)!;
    c.position.set(...s.pos); c.fov = s.fov; c.near = 0.05; c.far = 400;
    c.lookAt(new THREE.Vector3(...s.look));
    c.updateProjectionMatrix();
  });
  return null;
};

/** darkness poured into a hole: a dim box (no depth write, so glowing eyes still show through) */
const Dark: React.FC<{ min: [number, number, number]; max: [number, number, number]; opacity: number; keys?: [number, number][] }> = ({ min, max, opacity, keys }) => {
  const frame = useMcFrame();
  return (
  <mesh position={[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]} renderOrder={20}>
    <boxGeometry args={[max[0] - min[0], max[1] - min[1], max[2] - min[2]]} />
    <meshBasicMaterial color="#02030a" transparent opacity={keyed(keys, frame, opacity)} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>
  );
};

/** a black veil just in front of the lens: darkens the whole picture but the glowing eyes (higher render order) */
const Veil: React.FC<{ keys: [number, number][] }> = ({ keys }) => {
  const { camera } = useThree();
  const frame = useMcFrame();
  const ref = React.useRef<THREE.Mesh>(null);
  const o = keyed(keys, frame, 0);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    camera.updateMatrixWorld();
    m.position.copy(camera.position).add(new THREE.Vector3(0, 0, -0.2).applyQuaternion(camera.quaternion));
    m.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} renderOrder={25} visible={o > 0.005} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial color="#02030a" transparent opacity={o} depthTest={false} depthWrite={false} fog={false} />
    </mesh>
  );
};

/** a cool back light that rims the silhouettes (no shadows) */
const Rim: React.FC<{ from: [number, number, number]; color?: string; i: number }> = ({ from, color = "#9fc4ff", i }) => {
  const target = React.useMemo(() => new THREE.Object3D(), []);
  return <><primitive object={target} /><directionalLight position={from} target={target} color={color} intensity={i} /></>;
};

/** night dressing: a square Minecraft-style moon with a soft glow and a field of stars, outside the fog */
const NightSky: React.FC<{ moon?: [number, number, number]; stars?: number }> = ({ moon, stars = 260 }) => {
  const starGeo = React.useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < stars; i++) {
      const r = (k: number) => { const x = Math.sin((i + 1) * 91.17 + k * 47.3) * 43758.5453; return x - Math.floor(x); };
      const az = r(1) * Math.PI * 2, el = Math.asin(0.05 + r(2) * 0.95);
      pts.push(Math.cos(el) * Math.cos(az) * 180, Math.sin(el) * 180, Math.cos(el) * Math.sin(az) * 180);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); return g;
  }, [stars]);
  const m = moon ? new THREE.Vector3(...moon).normalize().multiplyScalar(170) : null;
  return (
    <>
      <points geometry={starGeo} renderOrder={-1}><pointsMaterial color="#dfe8ff" size={2.2} sizeAttenuation={false} fog={false} toneMapped={false} transparent opacity={0.85} depthWrite={false} /></points>
      {m && (
        <group position={m.toArray()} onUpdate={(g) => g.lookAt(0, 0, 0)}>
          <mesh renderOrder={-1}><planeGeometry args={[46, 46]} /><meshBasicMaterial color="#9fb4ff" map={glowTex()} fog={false} toneMapped={false} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
          <mesh renderOrder={-1}><planeGeometry args={[11, 11]} /><meshBasicMaterial color="#f3f0d8" fog={false} toneMapped={false} depthWrite={false} /></mesh>
          <mesh position={[-1.8, 1.4, 0.05]} renderOrder={-1}><planeGeometry args={[2.6, 2.2]} /><meshBasicMaterial color="#d6d2b8" fog={false} toneMapped={false} depthWrite={false} /></mesh>
          <mesh position={[2.2, -2, 0.05]} renderOrder={-1}><planeGeometry args={[2, 2]} /><meshBasicMaterial color="#d6d2b8" fog={false} toneMapped={false} depthWrite={false} /></mesh>
        </group>
      )}
    </>
  );
};
/** low ground mist: seeded soft sprites drifting slowly; they fade near the lens so none fills the frame */
// cam: this frame's directed camera (the three camera is only moved in a layout effect, so reading it here would lag a frame)
const Mist: React.FC<{ y: number; pitY?: number; n?: number; color?: string; opacity?: number; cam?: { pos: [number, number, number]; look: [number, number, number] } | null }> = ({ y, pitY, n = 70, color = "#9fb0d8", opacity = 0.16, cam }) => {
  const frame = useMcFrame();
  const { camera } = useThree();
  const cp = cam ? new THREE.Vector3(...cam.pos) : camera.position.clone();
  const fw = cam ? new THREE.Vector3(...cam.look).sub(cp).normalize() : camera.getWorldDirection(new THREE.Vector3());
  const puffs = React.useMemo(() => {
    const r = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    return Array.from({ length: n }, (_, i) => {
      const inPit = pitY !== undefined && i % 4 === 0;
      const x = inPit ? -3.5 + r(i, 1) * 8 : -20 + r(i, 1) * 40, z = inPit ? -3.5 + r(i, 2) * 8 : -20 + r(i, 2) * 40;
      return { x, z, y: (inPit ? pitY! : y) + r(i, 3) * 0.35, s: (inPit ? 2.2 : 3.5) + r(i, 4) * 3, ph: r(i, 5) * 6.28, sp: 0.004 + r(i, 6) * 0.006 };
    });
  }, [n, y, pitY]);
  const mats = React.useMemo(() => puffs.map(() => new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, opacity, fog: true })), [puffs, color, opacity]);
  return (
    <>
      {puffs.map((p, i) => {
        const x = p.x + Math.sin(frame * p.sp + p.ph) * 0.8 + frame * 0.004, z = p.z + Math.cos(frame * p.sp * 0.7 + p.ph) * 0.5;
        const rel = new THREE.Vector3(x, p.y, z).sub(cp), d = rel.length(), depth = rel.dot(fw);
        // fade by distance AND by depth in front of the lens, so a big puff never pops as its centre passes the camera plane
        const k = Math.max(0, Math.min(1, (d - p.s * 0.6) / p.s)) * Math.max(0, Math.min(1, (depth - p.s * 0.3) / p.s));
        if (k <= 0.01) return null;
        const m = mats[i]; m.opacity = opacity * k;
        return <sprite key={i} position={[x, p.y, z]} scale={[p.s, p.s * 0.45, 1]} material={m} renderOrder={15} />;
      })}
    </>
  );
};

/** blocks broken one by one (a pit being dug): each block stands until its frame, cracks for 3 frames (darkens and
 *  jitters), then pops (shrinks in 2 frames) — the Burst list carries the debris. top = the y the grass layer sits on */
const Dig: React.FC<{ lw: LoadedWorld; blocks: [number, number, number, number][]; top?: string; fill?: string }> = ({ lw, blocks, top = "grass_block", fill = "dirt" }) => {
  const frame = useMcFrame();
  const maxY = Math.max(...blocks.map((b) => b[1]));
  const proto = React.useMemo(() => {
    const find = (id: string) => lw.world.blocks.find((b) => b.id === id || b.key === id);
    const mk = (id: string) => { const b = find(id); return b ? blockObject(b, lw.textures) : null; };
    return { top: mk(top), fill: mk(fill) };
  }, [lw, top, fill]);
  return (
    <>
      {blocks.map(([x, y, z, f], i) => {
        if (frame >= f + 2) return null;
        const src = y === maxY ? proto.top : proto.fill;
        if (!src) return null;
        const crack = Math.max(0, Math.min(1, (frame - (f - 3)) / 3)), pop = Math.max(0, (frame - f) / 2);
        const s = 1 - pop * 0.9, j = crack > 0 && pop === 0 ? Math.sin(frame * 9.1 + i) * 0.03 * crack : 0;
        return <primitive key={i} object={cloneOnce(src, i)} position={[x + 0.5 + j, y + (1 - s) * 0.5, z + 0.5]} scale={s} />;
      })}
    </>
  );
};
const clones = new WeakMap<THREE.Object3D, THREE.Object3D[]>();
const cloneOnce = (src: THREE.Object3D, i: number) => { let a = clones.get(src); if (!a) { a = []; clones.set(src, a); } return (a[i] ??= src.clone()); };

/** a glowing streak along a prop's last frames of flight (bright, so the bloom catches it) */
const Trail: React.FC<{ keys: PathKeys; color?: string; len?: number }> = ({ keys, color = "#fff4d0", len = 6 }) => {
  const frame = useMcFrame();
  const out = [];
  for (let i = 1; i <= len * 2; i++) {
    const a = pathAt(keys, frame - i / 2), now = pathAt(keys, frame);
    if (!a || !now || a.hidden || now.hidden) continue;
    if (Math.hypot(a.at[0] - now.at[0], a.at[1] - now.at[1], a.at[2] - now.at[2]) < 0.02) continue;
    const k = 1 - i / (len * 2 + 1);
    out.push(<mesh key={i} position={a.at} renderOrder={26}><sphereGeometry args={[0.05 * k + 0.015, 8, 6]} /><meshBasicMaterial color={color} transparent opacity={0.85 * k} toneMapped={false} depthWrite={false} fog={false} /></mesh>);
  }
  return <>{out}</>;
};
type PathKeys = NonNullable<ShotDirection["props"]>[string];

const glowTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.4, "rgba(255,255,255,0.3)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c); return t;
  };
})();

/** debris cubes: seeded velocities, gravity, spin, fade by shrinking (Minecraft block-break particles) */
const Burst: React.FC<{ f: number; at: [number, number, number]; colors: string[]; n?: number; speed?: number; size?: number }> = ({ f, at, colors, n = 14, speed = 3.2, size = 0.09 }) => {
  const frame = useMcFrame();
  const t = (frame - f) / 30;
  if (t < 0 || t > 0.9) return null;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const r = (k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const a = r(1) * Math.PI * 2, up = 0.5 + r(2) * 0.8, sp = speed * (0.5 + r(3) * 0.7);
    const vx = Math.cos(a) * sp * 0.6, vz = Math.sin(a) * sp * 0.6, vy = up * sp;
    const y = Math.max(0, vy * t - 0.5 * 14 * t * t);
    const s = size * (0.6 + r(4) * 0.8) * (1 - Math.max(0, (t - 0.5) / 0.4));
    parts.push(
      <mesh key={i} position={[at[0] + vx * t, at[1] + y, at[2] + vz * t]} rotation={[t * 9 * r(5), t * 7 * r(6), 0]}>
        <boxGeometry args={[s, s, s]} />
        <meshLambertMaterial color={colors[i % colors.length]} />
      </mesh>,
    );
  }
  return <>{parts}</>;
};

/** body sizes for the poof drop point (half width, height), mobs/life.ts */
const MOB_BODY: Record<string, { hw: number; h: number }> = { zombie: { hw: 0.5, h: 2.0 }, player: { hw: 0.5, h: 2.0 }, skeleton: { hw: 0.5, h: 2.0 }, witch: { hw: 0.47, h: 2.4 }, creeper: { hw: 0.4, h: 1.7 },
  pillager: { hw: 0.5, h: 2.0 }, vindicator: { hw: 0.5, h: 2.0 }, evoker: { hw: 0.5, h: 2.0 }, ravager: { hw: 1.0, h: 2.2 }, vex: { hw: 0.3, h: 0.8 } };

const ShotView: React.FC<{ shot: PlanShot; lw: LoadedWorld; fps: number; fadeIn: number; dir?: ShotDirection; worlds?: WorldMap; fx?: FxTex; rt?: RaidTex; /** itw-02 direction-wide fog default */ atmoAll?: import("./types").AtmoSpec | false; /** itw-02 direction-wide imagineKeep */ keepTexAll?: string[] }> = ({ shot, lw, fps, fadeIn, dir, worlds = {}, fx = NO_FX, rt = NO_RAID, atmoAll, keepTexAll }) => {
  const frame = useMcFrame();
  const scale = useMcScale();
  const cams = lw.world.cameras as CamShot[];
  const cam = cams.find((c) => c.shots?.includes(shot.shotId)) ?? cams[0];
  const opacity = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp", easing: ease }) : 1;
  const cues = shotCues(shot, fps, dir);
  // Wave A (mc-cobblegen): fluids, contacts, cutaways, soft outlines (spec types in types.ts)
  const wa = dir as (ShotDirection & WaveAFx) | undefined;
  // Wave B (mc-cobblegen): items, pistons, redstone, ghost pistons, chests, light override, rims (types.ts)
  const wb = dir as (ShotDirection & WaveBFx) | undefined;
  const items = React.useMemo(() => {
    if (!wb) return [];
    const drops: MobDrop[] = [];
    for (const [id, acts] of Object.entries(dir?.acts ?? {})) for (const a of acts) {
      if (a.kind !== "poof" || !a.drop) continue;
      // where the mob is drawn at the poof: its flow (R13) when one moves it then, else its keys, else the set
      const P = poofFrame(a), wm = lw.world.mobs.find((m) => m.id === id), p = pathAt(dir?.mobs?.[id], P), fl = flowAt(dir?.flows?.[id], P, hashId(id));
      const at = fl?.at ?? p?.at ?? wm?.at, facing = fl?.facing ?? p?.facing ?? wm?.facing ?? 0;
      if (!at) continue;
      const kind = wm?.mob ?? "zombie", size = MOB_BODY[kind] ?? MOB_BODY.zombie;
      const e = poofDrops([a], at, facing, size, kind === "zombie" || kind === "player" || kind === "skeleton").find((x) => x.f === P);
      if (e?.item) drops.push({ mob: id, f: e.f, at: e.at, item: e.item });
    }
    const specs = [...(wb.items ?? []), ...ghostParts(wb.ghostPistons)];
    return specs.length || drops.length ? liveItems(specs, drops) : [];
  }, [dir, lw]); // eslint-disable-line react-hooks/exhaustive-deps
  /** an actor's feet this frame: its mob path, else where the set puts it (mob or cast) */
  const actorAt = (id: string, f: number): [number, number, number] | null =>
    flowAt(dir?.flows?.[id], f, hashId(id))?.at ?? pathAt(dir?.mobs?.[id], f)?.at ?? lw.world.mobs.find((m) => m.id === id)?.at ?? lw.world.characters.find((c) => c.id === id)?.at ?? null;
  // mc-raid Wave A (RaidFx.tsx): shock breaks join the shot's waves; arrow hits are hurt acts; this shot's camera pose
  const allWaves = React.useMemo(() => { const w = [...(dir?.waves ?? []), ...shockWaves(dir), ...mountainWaves(dir)]; return w.length ? w : undefined; }, [dir]);
  const hitActs = React.useMemo(() => arrowActs(dir), [dir]);
  const shotLen = shot.endFrame - shot.startFrame, shotSeed = hashId(shot.shotId);
  const poseAt = (f: number): Pose => (dir?.cam?.length ? camAt(dir, f, shotSeed)! : movingPose(cam, shotLen, shotSeed, f));
  const cut = cutKeysAt(wa?.cutaway, frame), cutSig = cut.join("|");
  // The Tapper fx (TapperFx.tsx): off for every shot without its fields
  const tfx = hasTapperFx(dir);
  // itw-02 mountain fx (MountainFx.tsx): off for every shot without its fields
  const mfx = hasMountainFx(dir);
  const bfx = React.useMemo(() => (tfx ? tapperBlockFx(dir) : dir?.blockfx), [dir, tfx]);
  const lwFx = React.useMemo(() => (tfx ? tapperWorld(lw, dir) : lw), [lw, dir, tfx]);
  const exclude = React.useMemo(() => {
    const s = fxKeys(bfx);
    for (const sp of dir?.shatter ?? []) for (const c of shatterCells(sp)) s.add(c.join(","));
    for (const k of [...waveKeys(allWaves, lw), ...doorKeys(dir?.doors), ...buttonKeys(dir?.buttons), ...fireKeys(dir?.fires), ...boomKeys(dir?.booms), ...raidKeys(dir), ...mountainKeys(dir)]) s.add(k);
    if (wa) for (const k of [...fluidKeys(wa, lw), ...(cutSig ? cutSig.split("|") : [])]) s.add(k);
    if (wb) for (const k of [...pistonKeys(wb.pistons), ...redstoneKeys(wb.redstone)]) s.add(k);
    return s;
  }, [dir, lw, cutSig, bfx, allWaves]); // eslint-disable-line react-hooks/exhaustive-deps
  const mobCues0 = (id: string, f: number): MobCue | undefined => {
    const p = pathAt(dir?.mobs?.[id], f), eye = dir?.eyes?.find((e) => e.mob === id), boom = boomCue(dir, id, f);
    const acts = hitActs[id] ? [...(dir?.acts?.[id] ?? []), ...hitActs[id]] : dir?.acts?.[id];
    const held = heldAt(dir?.held?.[id], f), tip = dir?.tip?.[id], fl = flowAt(dir?.flows?.[id], f, hashId(id));
    const pov = povHides(dir, id, f);
    if (!p && !eye && !acts && !boom && !held && !tip && !fl && !pov) return undefined;
    const cue: MobCue = p ? { at: p.at, facing: p.facing, walk: p.moving, aim: p.aim, hidden: p.hidden, ...(p.scale !== undefined ? { scale: p.scale } : {}), ...(p.look !== undefined ? { look: p.look } : {}), ...(p.tilt ? { tilt: p.tilt } : {}) } : {};
    // R13 a farm flow drives the body (path keys may still hide / scale it)
    if (fl) { cue.at = fl.at; cue.facing = fl.facing; cue.walk = fl.walk; }
    if (acts) { cue.acts = acts; cue.frame = f; }
    if (p?.gait === "run") cue.run = true;
    if (pov) cue.pov = true;
    if (held) { cue.held = held.item; cue.heldPop = held.pop; }
    if (tip) cue.tip = keyed(tip, f, 0);
    if (eye?.keys) { cue.glow = keyed(eye.keys, f, 0) * (0.94 + 0.06 * Math.sin(f / 4)); cue.glowColor = eye.color; }
    else if (eye) { const tease = eye.tease ?? 0; cue.glow = f < eye.open - 1 ? tease * (0.85 + 0.15 * Math.sin(f / 5)) : tease + (1 - tease) * overshoot(clamp01((f - eye.open + 1) / 5)); cue.glowColor = eye.color; }
    // N5 a creeper's fuse: swell and white flashes, gone at the blast
    if (boom) { if (boom.swell) cue.swell = boom.swell; if (boom.white) cue.white = boom.white; if (boom.hidden) cue.hidden = true; }
    return cue;
  };
  const mobCues = tfx ? (id: string, f: number) => tapperMobCue(dir, id, f, mobCues0(id, f), lw.world.mobs.find((m) => m.id === id)?.at ?? null) : mobCues0;
  const propCues = (id: string, f: number): PropCue | undefined => {
    const p = pathAt(dir?.props?.[id], f);
    return p ? { at: p.at, rot: p.rot, hidden: p.hidden } : undefined;
  };
  const storm = stormAt(dir, frame), glow = glowAt(dir, frame), flash = flashAt(dir, frame);
  const dcam = dir?.cam?.length ? camAt(dir, frame, hashId(shot.shotId)) : null;
  // an imagined picture: slight desaturation + warm tint, a slow wobble, a warm soft vignette
  const dream = dir?.dream ? keyed(dir.dream, frame, 0) : 0;
  const lightOv = raidLight(dir, frame) ?? (wb?.light ? (() => { const { keys, ...to } = wb.light!; return { to, k: keys?.length ? keyed(keys, frame, 0) : 1 }; })() : undefined);
  // R11 the imagined freeze: the kept actors move on in colour, the rest hold still at `still` and grey out (McPost)
  const imag0 = imagineAt(dir, frame), keepTex = dir?.imagineKeep ?? keepTexAll;
  const imag = imag0 && keepTex?.length ? { ...imag0, keepTex } : imag0;
  const keepIds = dir?.imagine?.keep ?? [], keepSig = keepIds.join("|");
  const split = React.useMemo(() => {
    if (!dir?.imagine) return null;
    const only = (keep: boolean, ids: string[]) => ({ ...lwFx, world: { ...lwFx.world,
      mobs: lwFx.world.mobs.filter((m) => ids.includes(m.id) === keep), characters: lwFx.world.characters.filter((c) => ids.includes(c.id) === keep),
      props: lwFx.world.props.filter((pr) => ids.includes(pr.id) === keep) } });
    return { rest: only(false, keepIds), kept: keepIds.map((id) => ({ id, lw: only(true, [id]) })) };
  }, [lwFx, keepSig, !!dir?.imagine]); // eslint-disable-line react-hooks/exhaustive-deps
  const still = dir?.imagine?.still;
  const rimLights = wb?.rims?.map((r, i) => {
    const a = actorAt(r.actor, frame);
    if (!a) return null;
    const cp = dcam?.pos ?? cam.position, dx = a[0] - cp[0], dz = a[2] - cp[2], l = Math.hypot(dx, dz) || 1, back = r.back ?? 1.1;
    return <pointLight key={`rim${i}`} position={[a[0] + (dx / l) * back, a[1] + (r.up ?? 1.7), a[2] + (dz / l) * back]} color={r.color ?? "#8fb4ff"} intensity={(r.i ?? 3) * (1 - (r.flicker ?? 0) * (0.5 + 0.3 * Math.sin(frame * 0.9 + i) + 0.2 * Math.sin(frame * 2.3 + 1 + i)))} distance={r.reach ?? 4.5} decay={1.4} />;
  });
  const dreamStyle: React.CSSProperties = dream > 0.002 ? {
    filter: `saturate(${1 - 0.3 * dream}) sepia(${0.22 * dream}) brightness(${1 + 0.04 * dream})`,
    transform: `scale(${1 + 0.025 * dream}) rotate(${0.35 * dream * Math.sin(frame / 7)}deg) translate(${2.5 * dream * Math.sin(frame / 9)}px, ${2 * dream * Math.cos(frame / 11)}px)`,
  } : {};
  const tFilter = tfx ? tapperFilter(dir, frame) : "";
  if (tFilter) dreamStyle.filter = dreamStyle.filter ? `${dreamStyle.filter} ${tFilter}` : tFilter;
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={dreamStyle}>
      <ThreeCanvas width={1080} height={1920} flat shadows="soft" gl={{ antialias: true, stencil: false }} camera={{ fov: cam.fov, near: 0.05, far: 400, position: cam.position }}>
        {dir?.cam?.length ? <DirectedCam dir={dir} seed={hashId(shot.shotId)} /> : <MovingCam cam={cam} len={shot.endFrame - shot.startFrame} seed={hashId(shot.shotId)} />}
        <VoxelWorld lw={lw} exclude={exclude} cycle={dir?.cycle ? keysAt(dir.cycle, frame) : undefined} weather={storm > 0 || glow > 0 ? { storm, glow } : undefined} light={lightOv} actors={<>{dir?.fires && <Fires lw={lw} specs={dir.fires} fx={fx} />}{(dir?.embers || dir?.lavapops) && <LavaFx embers={dir.embers} pops={dir.lavapops} fx={fx} />}{dir?.storm && <Rain lw={lw} spec={dir.storm} k={storm} fx={fx} cam={dcam} />}{dir?.bolts?.map((b, i) => <Bolt key={`bolt${i}`} spec={b} />)}{dir?.booms && <Booms lw={lw} worlds={worlds} specs={dir.booms} fx={fx} />}{bfx && <BlockFx lw={lw} specs={bfx} />}{dir?.shatter?.map((sp, i) => <Shatter key={`sh${i}`} lw={lw} spec={sp} />)}{dir?.outlines?.map((o, i) => <Outline key={`o${i}`} {...o} />)}{allWaves && <Waves lw={lw} worlds={worlds} specs={allWaves} fx={fx} />}{dir?.pours?.map((p, i) => <Pour key={`pour${i}`} spec={p} fx={fx} />)}{(wa?.fluids?.length || wa?.contacts?.length) ? <Fluids lw={lw} worlds={worlds} dir={wa} cut={cut} fx={fx} /> : null}{wa?.softOutlines && <SoftOutlines specs={wa.softOutlines} />}{wb?.pistons?.length ? <Pistons specs={wb.pistons} lw={lw} worlds={worlds} fx={fx} /> : null}{wb?.redstone?.length ? <Redstone specs={wb.redstone} pistons={wb.pistons ?? []} fx={fx} /> : null}{wb?.ghostPistons?.length ? <GhostPistons specs={wb.ghostPistons} lw={lw} worlds={worlds} fx={fx} /> : null}{items.length ? <Items items={items} lw={lw} worlds={worlds} fx={fx} actorAt={actorAt} rt={rt} /> : null}<Chests lw={lw} specs={wb?.chests} fx={fx} />{rimLights}{dir?.doors && <Doors lw={lw} worlds={worlds} specs={dir.doors} fx={fx} />}{dir?.buttons && <Buttons lw={lw} worlds={worlds} specs={dir.buttons} />}{split ? <><Freeze frame={Math.round((still ?? 0) * scale)} active={still !== undefined && frame >= still}><Actors lw={split.rest} cues={cues} mobCues={mobCues} propCues={propCues} /></Freeze>{split.kept.map((k) => <group key={`keep-${k.id}`} userData={{ raidKeep: keepAt(dir, k.id, frame) }}><Actors lw={k.lw} cues={cues} mobCues={mobCues} propCues={propCues} /></group>)}</> : <Actors lw={lwFx} cues={cues} mobCues={mobCues} propCues={propCues} />}{hasRaidScene(dir) && <RaidScene d={dir!} lw={lw} rt={rt} poseAt={poseAt} />}{tfx && <TapperLayers d={dir} lw={lw} actorAt={actorAt} cam={dcam?.pos ?? cam.position} />}{mfx && <MountainLayers d={dir!} lw={lw} worlds={worlds} fx={fx} cam={dcam?.pos ?? cam.position} exclude={exclude} />}{dir?.dark?.map((d, i) => <Dark key={i} {...d} />)}{dir?.bursts?.map((b, i) => <Burst key={`b${i}`} {...b} />)}{dir?.rim && <Rim {...dir.rim} />}{dir?.sky && <NightSky {...dir.sky} />}{dir?.veil && <Veil keys={dir.veil} />}{dir?.mist && <Mist {...dir.mist} cam={camAt(dir, frame, hashId(shot.shotId))} />}{dir?.dig && <Dig lw={lw} {...dir.dig} />}{dir?.trails?.map((tr) => dir.props?.[tr.prop] ? <Trail key={tr.prop} keys={dir.props[tr.prop]} color={tr.color} len={tr.len} /> : null)}</>} />
        {dir?.cam?.length || dir?.imagine ? <McPost focus={() => { const s = camAt(dir, frame, hashId(shot.shotId)); return s ? new THREE.Vector3(...s.focus) : null; }} cInf={dir.dof ?? 9} moon={dir.sky?.moon} storm={storm} imagine={imag} bare={!dir.cam?.length} fp={dir.pov?.length ? povFrame(dir, lw, frame, hashId(shot.shotId)) : undefined} shimmer={dir.shimmers?.length ? shimmerAt(dir, frame) : undefined} atmo={dir.atmo ?? atmoAll} /> : null}
      </ThreeCanvas>
      </AbsoluteFill>
      {dream > 0.002 && <AbsoluteFill style={{ background: "radial-gradient(ellipse 62% 48% at 50% 45%, rgba(255,170,80,0) 55%, rgba(255,150,60,0.35) 82%, rgba(120,50,10,0.6) 100%)", opacity: dream, mixBlendMode: "normal" }} />}
      {tfx && <TapperScreen d={dir} />}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
      {dir?.speedlines && <SpeedLines {...dir.speedlines} />}
      {dir?.hud?.map((h, i) => <Hud key={`hud${i}`} {...h} />)}
      {dir && <RaidHud d={dir} f={frame} pose={poseAt(frame)} actorAt={(id, f) => actorAt(id, still !== undefined && f >= still && !keepIds.includes(id) ? still : f)} />}
    </AbsoluteFill>
  );
};

const parentOf = (dir: string) => dir.split("/").slice(0, -1).join("/");

/** every set loads OUTSIDE the canvases, once, before any shot mounts (a mounted canvas does not redraw on async state) */
const Worlds: React.FC<{ root: string; sets: string[]; children: (w: Record<string, LoadedWorld>) => React.ReactNode }> = ({ root, sets, children }) => {
  // one loader per set, in a fixed order (the set list never changes for a composition)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const loaded = sets.map((s) => useMcWorld(`${root}/${s}`));
  if (loaded.some((l) => !l)) return null;
  return <>{children(Object.fromEntries(sets.map((s, i) => [s, loaded[i]!])))}</>;
};

export const McShort: React.FC<McShortProps> = ({ base, plan, tail, direction }) => {
  const scale = useMcScale();                                     // output frames per key frame
  const fx = useFxTextures();
  const rt = useRaidTextures(usesRaidFx(direction?.shots));
  if (!plan) return <AbsoluteFill style={{ background: "#000" }} />;
  // the shots' sets, plus the sets a direction borrows blocks from (wave sources, an old door)
  const borrowed = plan.shots.flatMap((s) => { const d = direction?.shots[s.shotId]; return d ? sourceSets(...(d.waves ?? []).flatMap((w) => [w.from, w.to]), ...(d.doors ?? []).map((x) => x.set), ...(d.buttons ?? []).map((x) => x.set), ...(d.booms ?? []).map((x) => x.src)) : []; });
  const sets = [...new Set([...plan.shots.map((s) => s.environmentId), ...borrowed])];
  const shots = plan.shots;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Worlds root={parentOf(base)} sets={sets}>
        {(w) => shots.map((s, i) => {
          const next = shots[i + 1];
          const nextDissolves = next?.cameraDirectives[0]?.action === "camera.dissolve";
          const xd = (id: string) => Math.max(1, Math.round(direction?.shots[id]?.dissolve ?? DISSOLVE));
          const fadeIn = i > 0 && s.cameraDirectives[0]?.action === "camera.dissolve" ? xd(s.shotId) : 0;
          const len = s.endFrame - s.startFrame + (nextDissolves ? xd(next.shotId) : 0) + (next ? 0 : tail);
          return (
            <Sequence key={s.shotId} from={Math.round(s.startFrame * scale)} durationInFrames={Math.round(len * scale)} name={s.shotId}>
              <ShotView shot={s} lw={w[s.environmentId]} fps={KEY_FPS} fadeIn={fadeIn} dir={direction?.shots[s.shotId]} worlds={w} fx={fx ?? NO_FX} rt={rt} atmoAll={direction?.atmo} keepTexAll={direction?.imagineKeep} />
            </Sequence>
          );
        })}
      </Worlds>
      <Audio src={staticFile(`${base}/voice.wav`)} />
    </AbsoluteFill>
  );
};
