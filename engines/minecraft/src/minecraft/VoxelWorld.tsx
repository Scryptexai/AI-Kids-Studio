// The voxel world renderer (inside a ThreeCanvas): sky + fog + light rig per preset, one InstancedMesh per block
// type (opaque, cutout), one merged neighbour-culled mesh per translucent block type (water, glass). Pixel-art
// textures: nearest magnification, mipmapped minification (no distant shimmer). Animated textures (water, lava, fire) step at the game's 20 ticks/s.
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { continueRender, delayRender, staticFile } from "remotion";
import { KEY_FPS, useMcFrame } from "./mcTime";
import type { CBlock, CompiledWorld, CTexture, Dir } from "./types";
import { DIR_VEC, QuadBuilder, blockGeometry, fluidGeometry, stateMatrix, type FluidCell, type GroupKey } from "./geometry";
import { Backdrop, SkyDome, backdropSpec, type BackdropSpec } from "./Backdrop";

export type SkyLook = { sky: string; fog: string; fogNear: number; fogFar: number; hemiSky: string; hemiGround: string; hemi: number; sun: string; sunI: number; sunDir: [number, number, number]; blockLight: number };
export const SKY: Record<CompiledWorld["sky"]["preset"], SkyLook> = {
  day: { sky: "#86b5ff", fog: "#bcd6ff", fogNear: 40, fogFar: 140, hemiSky: "#eef4ff", hemiGround: "#b0a080", hemi: 2.2, sun: "#fff4dc", sunI: 2.0, sunDir: [-0.45, 1, -0.6], blockLight: 0 },
  sunset: { sky: "#f39a63", fog: "#f6b98a", fogNear: 30, fogFar: 120, hemiSky: "#ffcfa8", hemiGround: "#5a3d36", hemi: 1.1, sun: "#ffb070", sunI: 2.4, sunDir: [-1, 0.35, -0.3], blockLight: 4 },
  // storybook moonlit night: dark sky, but faces, blocks and mobs read (a strong side moon models the cubes)
  night: { sky: "#1a2654", fog: "#22305e", fogNear: 40, fogFar: 140, hemiSky: "#9aaef0", hemiGround: "#2c2a48", hemi: 1.25, sun: "#d4e0ff", sunI: 1.35, sunDir: [0.7, 1, 0.55], blockLight: 10 },
  nether: { sky: "#3a0c0c", fog: "#4a1410", fogNear: 10, fogFar: 60, hemiSky: "#ff8a5c", hemiGround: "#3a0806", hemi: 0.9, sun: "#ff9a6a", sunI: 0.3, sunDir: [0.2, 1, 0.3], blockLight: 10 },
  cave: { sky: "#07080b", fog: "#0b0d12", fogNear: 8, fogFar: 45, hemiSky: "#6d7a96", hemiGround: "#141414", hemi: 0.35, sun: "#a0b0d0", sunI: 0, sunDir: [0, 1, 0], blockLight: 12 },
  end: { sky: "#16101f", fog: "#1d1528", fogNear: 25, fogFar: 110, hemiSky: "#c6b6e8", hemiGround: "#2a2338", hemi: 0.9, sun: "#e8dcff", sunI: 0.4, sunDir: [0.3, 1, 0.2], blockLight: 8 },
};

export type LoadedWorld = { world: CompiledWorld; dir: string; textures: Record<string, THREE.Texture>; images: Record<string, HTMLImageElement>; /** <dir>/backdrop.json, if the set has one */ backdrop?: BackdropSpec | null };

/** load <public>/<dir>/world.json and its textures (holds the render until done) */
export const useMcWorld = (dir: string): LoadedWorld | null => {
  const [handle] = useState(() => delayRender(`mc world ${dir}`, { timeoutInMilliseconds: 120000 }));
  const [loaded, setLoaded] = useState<LoadedWorld | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const world = (await (await fetch(staticFile(`${dir}/world.json`))).json()) as CompiledWorld;
      // optional: the land beyond the set (Backdrop.tsx)
      const backdrop = await fetch(staticFile(`${dir}/backdrop.json`)).then((r) => (r.ok ? (r.json() as Promise<BackdropSpec>) : null)).catch(() => null);
      const loader = new THREE.TextureLoader();
      const entries = await Promise.all(Object.entries(world.textures).map(async ([k, t]) => {
        const tex = await loader.loadAsync(staticFile(`${dir}/${t.file}`));
        tex.magFilter = THREE.NearestFilter;
        // mipmapped minification (as the game does): distant grass no longer shimmers / sparkles while the camera
        // moves; close-ups stay pixel-sharp (mag is nearest). Animated strips keep nearest (mips would bleed frames).
        const anim = t.frames > 1;
        tex.minFilter = anim ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = !anim;
        tex.anisotropy = anim ? 1 : 16;
        tex.colorSpace = THREE.SRGBColorSpace;
        if (t.frames > 1) tex.repeat.set(1, 1 / t.frames);
        return [k, tex] as const;
      }));
      // cast card layers (PNGs under public/)
      const paths = [...new Set(world.characters.flatMap((c) => c.layers ?? []))];
      const imgs = await Promise.all(paths.map((src) => new Promise<[string, HTMLImageElement]>((ok, bad) => {
        const im = new Image();
        im.onload = () => ok([src, im]);
        im.onerror = () => bad(new Error(`cast layer ${src} did not load`));
        im.src = staticFile(src);
      })));
      if (!live) return;
      setLoaded({ world, dir, textures: Object.fromEntries(entries), images: Object.fromEntries(imgs), backdrop });
      continueRender(handle);
    })().catch((e) => { console.error("MCWORLD|", e); throw e; });
    return () => { live = false; };
  }, [dir, handle]);
  return loaded;
};

/** the animation frame of a texture at a video frame (20 game ticks per second) */
export const animFrame = (t: CTexture, frame: number, fps: number) => Math.floor(((frame / fps) * 20) / Math.max(1, t.frametime)) % t.frames;

/** every flat element of the block carries the face for its other side too (vanilla cross models do) */
const OPP: Record<Dir, Dir> = { north: "south", south: "north", east: "west", west: "east", up: "down", down: "up" };
const hasBothFaces = (block: CBlock) => block.elements.every((e) => (Object.keys(e.faces) as Dir[]).every((d) => !!e.faces[OPP[d]]));

export const makeMaterial = (block: CBlock, key: GroupKey, tex: THREE.Texture): THREE.Material => {
  const translucent = block.layer === "translucent";
  const m = new THREE.MeshLambertMaterial({
    map: tex, vertexColors: true,
    transparent: translucent, depthWrite: !translucent,
    alphaTest: block.layer === "cutout" || key.overlay ? 0.5 : 0, alphaToCoverage: block.layer === "cutout",
    // one-sided, plants too, like the game: a cross element is a zero-thickness plane that carries BOTH faces
    // (north + south, mirrored uvs) on the same plane. Drawn double-sided, the two mirrored copies z-fought: fine
    // striped / checker patches all over grass and flowers (2026-11-23). Each face now shows only from its own side.
    side: block.shape === "cross" && !hasBothFaces(block) ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (key.overlay) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
  if (block.light > 0) { m.emissive = new THREE.Color("#ffffff"); m.emissiveMap = tex; m.emissiveIntensity = 0.9 * (block.light / 15); }
  return m;
};

const isOpaqueCube = (b: CBlock | undefined) => !!b && b.shape === "cube" && b.layer === "opaque";
/** a neighbour that hides a cube's face: an opaque full cube, or grass (cutout only for its side overlay) */
const occludes = (b: CBlock | undefined) => isOpaqueCube(b) || (!!b && b.shape === "cube" && b.id === "grass_block");

const BlockMeshes: React.FC<{ lw: LoadedWorld; exclude?: Set<string> }> = ({ lw, exclude }) => {
  const { textures } = lw;
  // blocks with per-frame states (BlockFx.tsx) are drawn there, not in the merged meshes
  const exKey = exclude && exclude.size ? [...exclude].sort().join("|") : "";
  const world = useMemo(() => {
    if (!exKey) return lw.world;
    const ex = new Set(exKey.split("|"));
    return { ...lw.world, blocks: lw.world.blocks.map((b) => {
      const pos: number[] = [];
      for (let i = 0; i < b.positions.length; i += 3) if (!ex.has(`${b.positions[i]},${b.positions[i + 1]},${b.positions[i + 2]}`)) pos.push(b.positions[i], b.positions[i + 1], b.positions[i + 2]);
      return { ...b, positions: pos };
    }).filter((b) => b.positions.length) };
  }, [lw.world, exKey]);
  const meshes = useMemo(() => {
    const at = new Map<string, CBlock>();
    for (const b of world.blocks) for (let i = 0; i < b.positions.length; i += 3) at.set(`${b.positions[i]},${b.positions[i + 1]},${b.positions[i + 2]}`, b);
    let fullAt: Map<string, CBlock> | null = null;
    const full = () => {
      if (fullAt) return fullAt;
      fullAt = new Map();
      for (const b of lw.world.blocks) for (let i = 0; i < b.positions.length; i += 3) fullAt.set(`${b.positions[i]},${b.positions[i + 1]},${b.positions[i + 2]}`, b);
      return fullAt;
    };
    const out: React.ReactNode[] = [];
    // fluids: all levels of one fluid in one sloped mesh (geometry.ts fluidGeometry)
    const fluids = new Map<string, { block: CBlock; cells: FluidCell[] }>();
    for (const b of world.blocks) {
      if (b.shape !== "fluid") continue;
      const f = fluids.get(b.id) ?? { block: b, cells: [] };
      for (let i = 0; i < b.positions.length; i += 3) f.cells.push({ x: b.positions[i], y: b.positions[i + 1], z: b.positions[i + 2], level: b.level ?? 0 });
      fluids.set(b.id, f);
    }
    for (const [id, f] of fluids) {
      const still = `block/${id}_still`, flow = `block/${id}_flow`;
      if (!textures[flow]) continue; // older compiled worlds: the box fluid below
      // solids from the FULL set: a cell drawn by an fx layer (a block popping in next to the lake) still holds the
      // fluid level up, so the surface does not slope down into it
      const solid = (x: number, y: number, z: number) => { const k = `${x},${y},${z}`, nb = at.get(k) ?? full().get(k); return !!nb && nb.shape !== "fluid"; };
      const { geometry, keys } = fluidGeometry(f.cells, solid, f.block.tint ?? "#ffffff", still, flow);
      const mats = keys.map((k) => makeMaterial(f.block, k, textures[k.tex]));
      out.push(<mesh key={`fluid:${id}`} geometry={geometry} material={mats} receiveShadow renderOrder={1} />);
    }
    for (const b of world.blocks) {
      const n = b.positions.length / 3;
      if (b.shape === "fluid" && textures[`block/${b.id}_flow`]) continue;
      if (b.layer === "translucent") {
        // merged, with faces between two of the same block (or against an opaque cube) removed
        const q = new QuadBuilder();
        for (let i = 0; i < n; i++) {
          const p: [number, number, number] = [b.positions[3 * i], b.positions[3 * i + 1], b.positions[3 * i + 2]];
          q.add(b, p, (d: Dir) => {
            const v = DIR_VEC[d], nb = at.get(`${p[0] + v[0]},${p[1] + v[1]},${p[2] + v[2]}`);
            return !(nb === b || isOpaqueCube(nb));
          });
        }
        const { geometry, keys } = q.build();
        const mats = keys.map((k) => makeMaterial(b, k, textures[k.tex]));
        out.push(<mesh key={b.key} geometry={geometry} material={mats} receiveShadow renderOrder={1} />);
        continue;
      }
      // full cubes: one instanced mesh per face direction, holding only the instances whose face there is open.
      // Drawing every face of every cube left the hidden side faces between two ground blocks z-fighting along
      // their shared top edge (thin dark seam lines on flat ground near the camera's line of sight).
      const parts: { geometry: THREE.BufferGeometry; keys: GroupKey[]; pos: number[]; dir: string }[] = [];
      if (b.shape === "cube") {
        const st = new THREE.Matrix3().setFromMatrix4(stateMatrix(b.rotX, b.rotY));
        const worldDir = (d: Dir) => new THREE.Vector3(...DIR_VEC[d]).applyMatrix3(st).round();
        for (const [wd, v] of Object.entries(DIR_VEC) as [Dir, [number, number, number]][]) {
          const pos: number[] = [];
          for (let i = 0; i < n; i++) {
            const x = b.positions[3 * i], y = b.positions[3 * i + 1], z = b.positions[3 * i + 2];
            if (!occludes(at.get(`${x + v[0]},${y + v[1]},${z + v[2]}`))) pos.push(x, y, z);
          }
          if (!pos.length) continue;
          const q = new QuadBuilder();
          q.add(b, [0, 0, 0], (d) => worldDir(d).equals(new THREE.Vector3(...v)));
          const { geometry, keys } = q.build();
          if (keys.length) parts.push({ geometry, keys, pos, dir: wd });
        }
      } else parts.push({ ...blockGeometry(b), pos: b.positions, dir: "all" });
      for (const part of parts) {
        const mats = part.keys.map((k) => makeMaterial(b, k, textures[k.tex]));
        const cnt = part.pos.length / 3;
        const mesh = new THREE.InstancedMesh(part.geometry, mats, cnt);
        const m = new THREE.Matrix4();
        for (let i = 0; i < cnt; i++) mesh.setMatrixAt(i, m.makeTranslation(part.pos[3 * i], part.pos[3 * i + 1], part.pos[3 * i + 2]));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = b.shape !== "cross";
        mesh.receiveShadow = true;
        if (b.layer === "cutout") mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textures[part.keys[0].tex], alphaTest: 0.5 });
        out.push(<primitive key={`${b.key}:${part.dir}`} object={mesh} />);
      }
    }
    return out;
  }, [world, textures, lw.world]);
  return <>{meshes}</>;
};

/** step animated textures to this frame */
const TextureClock: React.FC<{ lw: LoadedWorld }> = ({ lw }) => {
  const frame = useMcFrame();
  for (const [k, t] of Object.entries(lw.world.textures)) {
    if (t.frames <= 1) continue;
    const f = animFrame(t, frame, KEY_FPS);
    lw.textures[k].offset.set(0, 1 - (f + 1) / t.frames);
  }
  return null;
};

const mixC = (a: string, b: string, k: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
const sm01 = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** G3 time-lapse: `cycle` = days elapsed (fractional). Each day: sun rises east, crosses, sets west (0..0.55),
 *  dusk -> moonlit night (0.55..0.9) -> dawn. Returns the preset blended toward night, with the sun moving. */
export const cycleLook = (base: SkyLook, cycle: number): SkyLook => {
  const p = ((cycle % 1) + 1) % 1, n = SKY.night;
  const k = sm01(0.5, 0.62, p) * (1 - sm01(0.9, 1.0, p));
  const a = Math.min(1, p / 0.55) * Math.PI;                     // sun arc east -> west
  const sunDir: [number, number, number] = k > 0.5 ? n.sunDir : [Math.cos(a) * 1.2, 0.25 + Math.sin(a), -0.45];
  const L = (x: number, y: number) => x + (y - x) * k;
  return { ...base, sky: mixC(base.sky, n.sky, k), fog: mixC(base.fog, n.fog, k), hemiSky: mixC(base.hemiSky, n.hemiSky, k),
    hemiGround: mixC(base.hemiGround, n.hemiGround, k), hemi: L(base.hemi, n.hemi), sun: mixC(base.sun, n.sun, k),
    sunI: L(base.sunI, n.sunI) * (1 - 0.85 * Math.sin(Math.PI * k)), sunDir, blockLight: L(base.blockLight, n.blockLight) };
};

/** N4 storm: dark grey overcast, flat low light (no shadows to speak of), fog closing in */
export const STORM: SkyLook = { sky: "#59626e", fog: "#6c7480", fogNear: 18, fogFar: 90, hemiSky: "#b8c2cc", hemiGround: "#4a4a48", hemi: 1.35, sun: "#c8d0dc", sunI: 0.3, sunDir: [-0.45, 1, -0.6], blockLight: 0 };
/** weather over a shot: storm 0..1 (the look blends to STORM), glow 0..1 (a lightning flicker lights sky and fill) */
export type Weather = { storm: number; glow: number };
const weatherLook = (base: SkyLook, w: Weather): SkyLook => {
  const k = w.storm, L = (x: number, y: number) => x + (y - x) * k;
  let out = k <= 0 ? base : { ...base, sky: mixC(base.sky, STORM.sky, k), fog: mixC(base.fog, STORM.fog, k), hemiSky: mixC(base.hemiSky, STORM.hemiSky, k),
    hemiGround: mixC(base.hemiGround, STORM.hemiGround, k), hemi: L(base.hemi, STORM.hemi), sun: mixC(base.sun, STORM.sun, k), sunI: L(base.sunI, STORM.sunI), blockLight: L(base.blockLight, STORM.blockLight) };
  if (w.glow > 0) out = { ...out, sky: mixC(out.sky, "#c9d3e8", 0.75 * w.glow), fog: mixC(out.fog, "#b9c4da", 0.6 * w.glow), hemiSky: mixC(out.hemiSky, "#eef3ff", w.glow), hemi: out.hemi + 2.6 * w.glow };
  return out;
};

/** a per-shot light override (Wave B, a dark room): `to` replaces the look's values, blended by k (0 = untouched) */
export type LightOverride = { to: Partial<SkyLook>; k: number };
const overrideLook = (base: SkyLook, o: LightOverride): SkyLook => {
  const k = Math.max(0, Math.min(1, o.k)), out = { ...base } as Record<string, unknown>;
  for (const [key, v] of Object.entries(o.to)) {
    const b = (base as Record<string, unknown>)[key];
    if (v === undefined) continue;
    out[key] = typeof v === "number" && typeof b === "number" ? b + (v - b) * k : typeof v === "string" && typeof b === "string" ? mixC(b, v, k) : k >= 0.5 ? v : b;
  }
  return out as SkyLook;
};

const Lights: React.FC<{ lw: LoadedWorld; cycle?: number; weather?: Weather; light?: LightOverride }> = ({ lw, cycle, weather, light }) => {
  const world = lw.world;
  const far = !!backdropSpec(lw);
  const base = cycle === undefined ? SKY[world.sky.preset] : cycleLook(SKY[world.sky.preset], cycle);
  const wk = weather && (weather.storm > 0 || weather.glow > 0) ? weather : null;
  const look0 = wk ? weatherLook(base, wk) : base;
  const lo = light && light.k > 0 ? light : null;
  const look = lo ? overrideLook(look0, lo) : look0;
  const { scene } = useThree();
  const own = cycle === undefined && !wk && !(lo && (lo.to.sky || lo.to.fog));
  const sky = own ? world.sky.skyColor ?? look.sky : look.sky, fog = own ? world.sky.fogColor ?? look.fog : look.fog;
  // with land beyond the set the fog reaches further: hills read as layers fading into the horizon
  let fogNear = (lo?.to.fogNear !== undefined ? look.fogNear : world.sky.fogNear) ?? (far ? look.fogNear + 5 : look.fogNear), fogFar = (lo?.to.fogFar !== undefined ? look.fogFar : world.sky.fogFar) ?? (far ? look.fogFar + 50 : look.fogFar);
  if (wk) { fogNear += (STORM.fogNear - fogNear) * wk.storm; fogFar += (STORM.fogFar - fogFar) * wk.storm; }
  useLayoutEffect(() => {
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(fog, fogNear, fogFar);
  }, [scene, sky, fog, fogNear, fogFar]);
  const [mn, mx] = [world.bounds.min, world.bounds.max];
  const c = new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
  const r = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 0.75 + 2;
  const sunPos = c.clone().addScaledVector(new THREE.Vector3(...look.sunDir).normalize(), r * 2);
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.copy(c);
  // light blocks: real point lights in the dark presets (the brightest dozen)
  const glows = useMemo(() => {
    if (!look.blockLight) return [];
    const list: { p: [number, number, number]; l: number }[] = [];
    for (const b of world.blocks) if (b.light > 0) for (let i = 0; i < b.positions.length; i += 3) list.push({ p: [b.positions[i] + 0.5, b.positions[i + 1] + 0.5, b.positions[i + 2] + 0.5], l: b.light });
    return list.sort((a, b) => b.l - a.l).slice(0, 12);
  }, [world, look.blockLight > 0]);
  return (
    <>
      <primitive object={target} />
      <SkyDome sky={sky} fog={fog} />
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemi]} />
      {look.sunI > 0 && (
        <directionalLight position={sunPos.toArray()} target={target} color={look.sun} intensity={look.sunI} castShadow
          shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.02}
          shadow-camera-left={-r} shadow-camera-right={r} shadow-camera-top={r} shadow-camera-bottom={-r} shadow-camera-near={0.5} shadow-camera-far={r * 4} />
      )}
      {glows.map((g, i) => <pointLight key={i} position={g.p} color="#ffd9a0" intensity={look.blockLight * (g.l / 15)} distance={g.l} decay={1.6} />)}
    </>
  );
};

export type CamShot = { position: [number, number, number]; lookAt: [number, number, number]; fov: number };
export const CameraRig: React.FC<{ shot: CamShot }> = ({ shot }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...shot.position);
    cam.fov = shot.fov;
    cam.near = 0.05;
    cam.far = 400;
    cam.lookAt(...shot.lookAt);
    cam.updateProjectionMatrix();
  });
  return null;
};

/** the world; `actors` adds the set's mobs, props and cast (Actors.tsx) */
export const VoxelWorld: React.FC<{ lw: LoadedWorld; actors?: React.ReactNode; exclude?: Set<string>; /** G3 time-lapse: days elapsed */ cycle?: number; /** N4 storm / lightning */ weather?: Weather; /** Wave B per-shot light override */ light?: LightOverride }> = ({ lw, actors, exclude, cycle, weather, light }) => (
  <>
    <Lights lw={lw} cycle={cycle} weather={weather} light={light} />
    <TextureClock lw={lw} />
    <BlockMeshes lw={lw} exclude={exclude} />
    <Backdrop lw={lw} storm={weather?.storm} glow={weather?.glow} />
    {actors}
  </>
);
