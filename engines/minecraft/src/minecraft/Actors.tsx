// Everything a VoxelSet places on the voxels: 3D mobs (mobs/), item and block props (props/), and the 2D ink cast
// (cast/). Motion comes from the frame: mobs breathe, look round or walk; dropped items spin and bob; the cast blinks
// and breathes. Anything the mob library cannot draw yet stays a pink marker box of the right height.
import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { KEY_FPS, useMcFrame } from "./mcTime";
import type { CBlock, CompiledWorld } from "./types";
import { blockGeometry } from "./geometry";
import { makeMaterial, type LoadedWorld } from "./VoxelWorld";
import { Mob, type Bend, type HeldGrip } from "./mobs/Mob";
import type { Act } from "./mobs/acts";
import { modelFor } from "./mobs/models";
import { itemMesh } from "./props/Item";
import { handCube } from "./props/HandCube";
import { CastCard, type CastDraw } from "./cast/CastCard";
import { townsfolk } from "./cast/toon";

/** the card's tint per sky preset: unlit ink cards take the scene's light colour */
export const CAST_TINT: Record<CompiledWorld["sky"]["preset"], string> = {
  day: "#ffffff", sunset: "#ffd9b8", night: "#b4c0e6", nether: "#ffb59a", cave: "#a8b0c8", end: "#d8ccf0",
};

export const hashId = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 997; };

/** a block model as an object whose origin is its bottom centre */
export const blockObject = (b: CBlock, textures: LoadedWorld["textures"]): THREE.Group => {
  const { geometry, keys } = blockGeometry(b);
  const mesh = new THREE.Mesh(geometry, keys.map((k) => makeMaterial(b, k, textures[k.tex])));
  mesh.position.set(-0.5, 0, -0.5);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
};

type Prop = CompiledWorld["props"][number];
const NONE: Prop[] = [];
/** a prop's object; items have their grip at the origin, blocks their bottom centre. unit = world units per block */
const propObject = (p: Prop, lw: LoadedWorld, unit: number, held: boolean, hand = 0.85): THREE.Object3D | null => {
  const s = p.scale ?? 1;
  if (p.sprite) return itemMesh(lw.textures[p.sprite], unit * s * (held ? hand : 0.5), held ? [-6, 2] : [0, 8]);
  if (p.model) { const g = blockObject(p.model, lw.textures); g.scale.setScalar(unit * s * (held ? 0.4 : 1)); return g; }
  return null;
};

/** tools held by the handle (blade forward and up), at the game's third-person size */
const TOOL = /(pickaxe|_axe|sword|shovel|_hoe|stick|rod|bow|trident|mace)$/;
/** a prop in a humanoid mob's right hand, sized like the game's third-person hold: tools 0.85 of a block, flat items
 *  0.55, a bucket 0.55 hanging from its handle, a torch 0.85 standing up, blocks 0.3 (the game: 0.375, read too big
 *  at eye level) */
const heldObject = (p: Prop, lw: LoadedWorld): { obj: THREE.Object3D | null; grip: HeldGrip } => {
  const s = p.scale ?? 1, name = p.item ?? p.sprite ?? "";
  if (p.sprite) {
    if (/(bucket|lantern)$/.test(name)) return { obj: itemMesh(lw.textures[p.sprite], 16 * s * 0.55, [0, 14]), grip: "hang" };
    if (/torch$/.test(name)) {
      // a torch stands UP in the fist, flame on top, kept upright in the world (the "hang" grip), held by the lower
      // stick just in front of the forearm so it never cuts through the arm
      const o = itemMesh(lw.textures[p.sprite], 16 * s * 0.85, [0, 3]);
      o.children[0].position.z = 3.2;
      return { obj: o, grip: "hang" };
    }
    if (TOOL.test(name)) return { obj: itemMesh(lw.textures[p.sprite], 16 * s * 0.85, [-6, 2]), grip: "tool" };
    return { obj: itemMesh(lw.textures[p.sprite], 16 * s * 0.55, [-6, 2]), grip: "item" };
  }
  if (p.model) {
    // bottom centre at the origin -> centred on the grip point below the fist
    const g = blockObject(p.model, lw.textures); g.scale.setScalar(16 * s * 0.3);
    const w = new THREE.Group(); w.add(g); return { obj: w, grip: "block" };
  }
  return { obj: null, grip: "tool" };
};

/** per-frame direction for a mob: path position / facing (walks while moving), look target, glowing eyes 0..1 */
export type MobCue = { at?: [number, number, number]; facing?: number; walk?: boolean; look?: [number, number, number] | null; glow?: number; glowColor?: string; aim?: number; scale?: number; hidden?: boolean; acts?: import("./mobs/acts").Act[]; frame?: number; tilt?: [number, number];
  /** N5 creeper fuse: body scale [width/depth, height] and the white flash 0..1 */
  swell?: [number, number]; white?: number;
  /** sprinting (the path key's gait "run") */
  run?: boolean;
  /** the held prop id this frame (null = empty hand; undefined = the first prop with its heldBy), its pop-in scale,
   *  and a hanging item's tip in degrees */
  held?: string | null; heldPop?: number; tip?: number;
  /** mc-raid (mobs/raid.ts; acts do the same per frame): a name tag, the glowing outline 0..1, whole-body opacity */
  tag?: string; glowing?: number; opacity?: number;
  /** first person (dir.pov): the body is hidden, the camera is its eyes */
  pov?: boolean };
/** per-frame direction for a resting prop: position, rotation (rad), hidden */
export type PropCue = { at?: [number, number, number]; rot?: [number, number, number]; hidden?: boolean };

const haloTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

/** two glowing eyes on a humanoid head (head pixel space: y down, face at z -4), opened by scaling y */
const eyeGlow = (color: string) => {
  const g = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const halo = new THREE.MeshBasicMaterial({ color, map: haloTex(), toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const x of [-2, 2]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), core); e.position.set(x, -4.5, -4.15); e.renderOrder = 30; e.name = "core"; g.add(e);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3), halo); h.position.set(x, -4.5, -4.3); h.renderOrder = 31; h.name = "halo"; g.add(h);
  }
  return g;
};

// ---------------------------------------------------------------- itw-02 Wave A (actors): place with a block, carry
/** a place act's block in the right hand this frame: shown from the wind-up (9 f before each contact) up to the
 *  contact, popping in with overshoot; gone on the contact frame (the set's own block appears there) */
const placeBlockAt = (acts: Act[] | undefined, frame: number): { block: string; pop: number } | null => {
  for (const a of acts ?? []) {
    if (a.kind !== "place" || !a.block) continue;
    const n = a.n ?? 1, P = a.every ?? 8;
    for (let i = 0; i < n; i++) {
      const u = frame - a.f - i * P;
      if (u < -9 || u >= 0) continue;
      const x = Math.min(1, (u + 9) / 4), pop = x < 0.75 ? 1.08 * (1 - Math.pow(1 - x / 0.75, 3)) : 1.08 - 0.08 * ((x - 0.75) / 0.25);
      return { block: a.block, pop: Math.max(0.001, pop) };
    }
  }
  return null;
};
/** a carried baby this frame: who holds it, how, and how far it has gone onto the hands (0..1) */
type CarryLink = { carrier: string; baby: string; mode: "high" | "arms" | "twins"; hand: "r" | "l" | "both"; w: number; facing: number };
const carryLinks = (id: string, cue: MobCue | undefined, facing: number, frame: number): CarryLink[] => {
  const out: CarryLink[] = [];
  for (const a of cue?.acts ?? []) {
    if (a.kind !== "carry") continue;
    const t = frame - a.f, len = a.len ?? 1e9;
    // picked up (a target: the hands reach it first, it leaves the floor at f) or already in the arms (eased in 6 f)
    if (t < (a.target ? 0 : -6)) continue;
    let w = a.target ? Math.min(1, t / 6 + 0.001) : Math.min(1, (t + 6) / 6);
    w = w * w * (3 - 2 * w);
    if (a.eout !== undefined && t > len) w *= 1 - Math.min(1, (t - len) / Math.max(1, a.eout));
    if (w <= 0) continue;
    const mode = a.carry ?? "high";
    if (a.baby) out.push({ carrier: id, baby: a.baby, mode, hand: mode === "twins" ? "r" : "both", w, facing });
    if (a.baby2 && mode === "twins") out.push({ carrier: id, baby: a.baby2, mode, hand: "l", w, facing });
  }
  return out;
};
/** the carrier's hand point in the world, from its posed bones: "top" = the fist's end (a baby sitting on the palms
 *  overhead), "fist" = the fist's middle, "fore" = the mid forearm */
const handPoint = (parts: Map<string, THREE.Group>, side: "r" | "l", where: "top" | "fist" | "fore"): THREE.Vector3 | null => {
  const arm = parts.get(side === "r" ? "right_arm" : "left_arm"), b = arm?.userData.bend as Bend | undefined;
  if (!b) return null;
  b.low.updateWorldMatrix(true, false);
  // low-bone space = part space - bend (4): the fist spans part y 6..10, the forearm 4..6
  return b.low.localToWorld(new THREE.Vector3(side === "r" ? -1 : 1, where === "top" ? 6 : where === "fist" ? 4.5 : 1, 0));
};

const MobActor: React.FC<{ m: CompiledWorld["mobs"][number]; lw: LoadedWorld; age: number; held: Prop[]; cue?: MobCue;
  /** itw-02: hand the posed parts to Actors (a carrier) */
  reg?: (id: string, parts: Map<string, THREE.Group>) => void }> = ({ m, lw, age, held, cue, reg }) => {
  const model = modelFor(m.mob, m.textures[0]);
  const skin = useMemo(() => m.textures.map((t) => lw.textures[t]), [m, lw]);
  const slots = useMemo(() => m.slots.map((t) => lw.textures[t]), [m, lw]);
  const lookAt = cue && cue.look !== undefined ? cue.look : m.look;
  const look = useMemo(() => (lookAt ? new THREE.Vector3(...lookAt) : null), [lookAt?.[0], lookAt?.[1], lookAt?.[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const glow = useMemo(() => (cue?.glow !== undefined ? eyeGlow(cue.glowColor ?? "#8cff5a") : null), [cue?.glow !== undefined, cue?.glowColor]); // eslint-disable-line react-hooks/exhaustive-deps
  const onParts = useCallback((parts: Map<string, THREE.Group>) => { if (glow && model) parts.get(model.head)?.add(glow); reg?.(m.id, parts); }, [glow, model, reg, m.id]);
  if (glow) {
    const k = Math.max(0, Math.min(1.15, cue?.glow ?? 0));
    for (const o of glow.children) { o.scale.set(1, o.name === "core" ? Math.max(0.001, k) : Math.max(0.001, k), 1); o.visible = k > 0.01; }
  }
  const seed = hashId(m.id);
  // mc-raid: a pillager called "barry" (or "captain...") is the raid captain with the ominous banner; barry's name tag
  const lid = m.id.toLowerCase();
  const raid = { captain: m.mob === "pillager" && (lid === "barry" || lid.startsWith("captain")), tag: cue?.tag ?? (lid === "barry" ? "Barry" : undefined), glowing: cue?.glowing, opacity: cue?.opacity, pov: cue?.pov };
  // villagers hold things smaller, tucked in their crossed arms
  // humanoids: every prop the mob holds over the shot, built once (switched by the cue); villagers hold things
  // smaller, tucked in their crossed arms
  const humanoid = model?.rig === "humanoid";
  const heldObjs = useMemo(() => new Map(held.map((p) => [p.id, humanoid ? heldObject(p, lw) : { obj: propObject(p, lw, 16, true, m.mob === "villager" ? 0.55 : 0.85), grip: "tool" as HeldGrip }])), [held, lw, m.mob, humanoid]);
  const heldId = cue?.held !== undefined ? cue.held : held[0]?.id ?? null;
  const cur0 = heldId ? heldObjs.get(heldId) : undefined;
  // itw-02: a place act's block in the hand (from the wind-up to the contact)
  const pb = humanoid ? placeBlockAt(cue?.acts, cue?.frame ?? 0) : null;
  const cubes = useMemo(() => new Map<string, THREE.Object3D>(), [lw]);
  let cube: THREE.Object3D | undefined;
  if (pb) { cube = cubes.get(pb.block); if (!cube) { cube = handCube(pb.block, lw); cubes.set(pb.block, cube); } }
  const cur = cube ? { obj: cube, grip: "block" as HeldGrip } : cur0;
  if (!model) {
    const h = lw.world.heights[m.mob] ?? lw.world.heights.default ?? 1.8;
    return (
      <mesh position={[m.at[0], m.at[1] + h / 2, m.at[2]]} castShadow>
        <boxGeometry args={[0.8, h, 0.8]} />
        <meshLambertMaterial color="#e05a8a" transparent opacity={0.75} />
      </mesh>
    );
  }
  if (cue?.hidden) return null;
  const at = cue?.at ?? m.at, sc = cue?.scale ?? 1;
  const action = cue?.walk === undefined ? m.action : cue.walk ? (cue.run ? "run" : "walk") : "idle";
  const body = <Mob model={model} skin={skin} slots={slots} at={at} facing={cue?.facing ?? m.facing} baby={m.baby} held={cur?.obj ?? null} grip={cur?.grip} heldPop={pb ? pb.pop : cue?.heldPop} tip={cue?.tip} onParts={glow || reg ? onParts : undefined} tilt={cue?.tilt} swell={cue?.swell} white={cue?.white} raid={raid}
    pose={{ age: age + seed * 7, action, seed, look, aim: cue?.aim, acts: cue?.acts, frame: cue?.frame }} />;
  // spawn pop: scale about the feet
  return sc === 1 ? body : <group position={at} scale={Math.max(0.001, sc)}><group position={[-at[0], -at[1], -at[2]]}>{body}</group></group>;
};

const RestingProp: React.FC<{ p: Prop; lw: LoadedWorld; age: number; cue?: PropCue }> = ({ p, lw, age, cue }) => {
  const obj = useMemo(() => propObject(p, lw, 1, false), [p, lw]);
  if (!obj || !p.at || cue?.hidden) return null;
  if (cue?.at) return <group position={cue.at} rotation={cue.rot ?? [0, 0, 0]}><primitive object={obj} /></group>;
  const yaw = (-p.facing * Math.PI) / 180;
  // dropped items hover, bob and spin as in the game; blocks just sit
  const item = !!p.sprite;
  const seed = hashId(p.id);
  return (
    <group position={[p.at[0], p.at[1] + (item ? 0.12 + Math.sin((age + seed) / 10) * 0.05 : 0), p.at[2]]} rotation={[0, yaw + (item ? (age + seed) / 20 : 0), 0]}>
      <primitive object={obj} />
    </group>
  );
};

/** per-frame acting for a cast member (McShort drives these from the plan's events): face, extra blink, body, held-item swing */
export type CastCue = { expr?: CastDraw["expr"]; blink?: number; act?: CastDraw["act"]; swing?: number; at?: [number, number, number];
  /** crouch squash (+) / stretch (-) */
  squash?: number;
  /** the same beat when the card holds a tool: body pose, tool turn (rad) and grip lift (m) instead of act / swing */
  tool?: { act: CastDraw["act"]; swing: number; lift: number } };
export type CastCues = (id: string, t: number) => CastCue;

const CastActor: React.FC<{ c: CompiledWorld["characters"][number]; lw: LoadedWorld; t: number; held: Prop | undefined; cue?: CastCue }> = ({ c, lw, t, held, cue }) => {
  const seed = hashId(c.id);
  const layers = useMemo(() => c.layers?.map((l) => lw.images[l]), [c, lw]);
  const heldObj = useMemo(() => (held ? propObject(held, lw, 1, true, 0.6) : null), [held, lw]);
  // a blink every ~3.4 s (offset per character), a slow breath
  const cyc = (t + (seed % 17) * 0.21) % 3.4;
  const blink = cyc < 0.12 ? Math.sin((cyc / 0.12) * Math.PI) : 0;
  const outfit = useMemo(() => (c.outfit ? { ...townsfolk(seed), dress: undefined, ...c.outfit } : undefined), [c, seed]);
  const b = Math.max(blink, cue?.blink ?? 0);
  const tool = heldObj ? cue?.tool : undefined;
  const act = tool ? { ...cue?.act, arm: undefined, armK: undefined, armRaw: undefined, ...tool.act } : cue?.act;
  const swing = tool ? tool.swing : (cue?.swing ?? 0), lift = tool?.lift ?? 0;
  const draw: CastDraw = { layers, outfit, look: c.look, seed, blink: Math.round(b * 4) / 4, phase: Math.round(t * 12) / 12, expr: cue?.expr, act };
  return (
    <CastCard at={cue?.at ?? c.at} squash={cue?.squash} draw={draw} tint={CAST_TINT[lw.world.sky.preset]} outline={c.outline ?? 0}>
      {heldObj && (
        <group position={[0.16 + lift * 0.15, 0.6 + lift, 0.04]} rotation={[0, 0, -0.25 + swing]}>
          <primitive object={heldObj} />
        </group>
      )}
    </CastCard>
  );
};

export const Actors: React.FC<{ lw: LoadedWorld; cues?: CastCues; mobCues?: (id: string, frame: number) => MobCue | undefined; propCues?: (id: string, frame: number) => PropCue | undefined }> = ({ lw, cues, mobCues, propCues }) => {
  const frame = useMcFrame();

  const t = frame / KEY_FPS, age = t * 20;
  const { world } = lw;
  const heldBy = (id: string) => world.props.find((p) => p.heldBy === id);
  const heldAll = useMemo(() => { const m = new Map<string, Prop[]>(); for (const p of world.props) if (p.heldBy) m.set(p.heldBy, [...(m.get(p.heldBy) ?? []), p]); return m; }, [world]);
  // itw-02 carry: carriers hand over their posed parts; after every mob is posed (a parent's layout effect runs after
  // its children's) each carried baby's wrapper group moves it onto the carrier's hands and turns it to its facing
  const cuesNow = world.mobs.map((m) => mobCues?.(m.id, frame));
  const links = world.mobs.flatMap((m, i) => carryLinks(m.id, cuesNow[i], cuesNow[i]?.facing ?? m.facing, frame));
  const partsReg = useRef(new Map<string, Map<string, THREE.Group>>());
  const wraps = useRef(new Map<string, THREE.Group>());
  const carriers = new Set(links.map((l) => l.carrier)), carried = new Set(links.map((l) => l.baby));
  const reg = useCallback((id: string, parts: Map<string, THREE.Group>) => { partsReg.current.set(id, parts); }, []);
  useLayoutEffect(() => {
    for (const [id, g] of wraps.current) if (!carried.has(id)) { g.position.set(0, 0, 0); g.quaternion.identity(); }
    for (const l of links) {
      const g = wraps.current.get(l.baby), parts = partsReg.current.get(l.carrier), bi = world.mobs.findIndex((x) => x.id === l.baby);
      if (!g || !parts || bi < 0) continue;
      // held high: sitting on the palms over the head (vanilla arms are too short to hold it by the sides without
      // covering the carrier's face); in the arms: on the two fists together in front of the chest (the forearms meet
      // inside the body); twins: each on a forearm, out at the side
      const where = l.mode === "high" ? "top" : l.mode === "arms" ? "fist" : "fore";
      let T: THREE.Vector3 | null;
      if (l.hand === "both") { const r = handPoint(parts, "r", where), lp = handPoint(parts, "l", where); T = r && lp ? r.add(lp).multiplyScalar(0.5) : null; }
      else T = handPoint(parts, l.hand, where);
      if (!T) continue;
      // the baby's anchor: its seat (a baby with a sit act sits on its own feet point, a standing one on its hip)
      const bc = cuesNow[bi], bm = world.mobs[bi], bAt = bc?.at ?? bm.at, bFacing = bc?.facing ?? bm.facing;
      const s = (bm.baby ? 0.5 : 1) * (bc?.scale ?? 1);
      const sits = (bc?.acts ?? []).some((a) => a.kind === "sit" && a.f <= frame);
      T.y += where === "top" ? 0.01 : 2.5 / 16;
      const A = new THREE.Vector3(bAt[0], bAt[1] + (sits ? 0 : 0.75 * s), bAt[2]);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((-(l.facing - bFacing) * Math.PI) / 180) * l.w);
      g.quaternion.copy(q);
      g.position.copy(A.clone().add(T.sub(A).multiplyScalar(l.w))).sub(A.clone().applyQuaternion(q));
    }
  });
  return (
    <>
      {world.mobs.map((m, i) => {
        const a = <MobActor key={m.id} m={m} lw={lw} age={age} held={heldAll.get(m.id) ?? NONE} cue={cuesNow[i]} reg={carriers.has(m.id) ? reg : undefined} />;
        return m.baby ? <group key={m.id} ref={(g) => { if (g) wraps.current.set(m.id, g); else wraps.current.delete(m.id); }}>{a}</group> : a;
      })}
      {world.props.filter((p) => p.at).map((p) => <RestingProp key={p.id} p={p} lw={lw} age={age} cue={propCues?.(p.id, frame)} />)}
      {world.characters.map((c) => <CastActor key={c.id} c={c} lw={lw} t={t} held={heldBy(c.id)} cue={cues?.(c.id, t)} />)}
    </>
  );
};
