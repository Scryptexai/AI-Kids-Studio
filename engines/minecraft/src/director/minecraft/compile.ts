// VoxelSet + asset manifest -> CompiledWorld (world.json) + the textures it uses, copied into a public/ folder.
// The renderer reads only world.json, never the 4 MB manifest. Run validate first: compile assumes a valid set.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CompiledWorld, CBlock, CElement, CFace, CTexture, Dir } from "../../minecraft/types.ts";
import { VoxelSet } from "../schema/index.ts";
import { MOB_MODELS, mobTextureStack } from "../../minecraft/mobs/models.ts";
import {
  expand, findState, parseBlockRef, resolvePaletteValue, shapeAt, loadMcConfig, loadPresets, manifestPath, type McManifest, type McConfig,
} from "../validate/minecraft.ts";

/** light a block gives off (Minecraft light levels); the manifest has no light data, so it is listed here */
export const LIGHT: Record<string, number> = {
  glowstone: 15, sea_lantern: 15, shroomlight: 15, lava: 15, jack_o_lantern: 15, lantern: 15, beacon: 15,
  ochre_froglight: 15, pearlescent_froglight: 15, verdant_froglight: 15, campfire: 15, redstone_lamp: 0,
  torch: 14, wall_torch: 14, end_rod: 14, soul_lantern: 10, soul_torch: 10, crying_obsidian: 10, magma_block: 3,
};

type MFace = { tex: string | null; uv?: number[]; rot?: number; tint?: number; cull?: string };
type MElement = { from: number[]; to: number[]; rotation?: CElement["rotation"]; shade?: boolean; faces: Record<string, MFace> };
type MModel = { shape: string; elements: MElement[] };

/** Minecraft's default face uv when a model gives none (texture pixels, v down) */
export const defaultUv = (d: Dir, f: number[], t: number[]): [number, number, number, number] => {
  const [x1, y1, z1] = f, [x2, y2, z2] = t;
  switch (d) {
    case "north": return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case "south": return [x1, 16 - y2, x2, 16 - y1];
    case "west": return [z1, 16 - y2, z2, 16 - y1];
    case "east": return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
    case "up": return [x1, z1, x2, z2];
    case "down": return [x1, 16 - z2, x2, 16 - z1];
  }
};

const DIRS: Dir[] = ["down", "up", "north", "south", "west", "east"];
const NEIGHBOURS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const convertElements = (els: MElement[]): CElement[] =>
  els.map((e) => {
    const faces: CElement["faces"] = {};
    for (const d of DIRS) {
      const f = e.faces[d];
      if (!f || !f.tex) continue;
      const face: CFace = { tex: f.tex, uv: (f.uv as CFace["uv"]) ?? defaultUv(d, e.from, e.to) };
      if (f.rot) face.rot = f.rot as CFace["rot"];
      if (f.tint !== undefined) face.tint = true;
      if (f.cull) face.cull = f.cull as Dir;
      faces[d] = face;
    }
    const out: CElement = { from: e.from as CElement["from"], to: e.to as CElement["to"], faces };
    if (e.rotation) out.rotation = e.rotation;
    if (e.shade === false) out.shade = false;
    return out;
  });

export type CompileResult = { world: CompiledWorld; textureFiles: { from: string; to: string }[] };

/** pure: the compiled world and the texture copies it needs (paths are library-relative -> world-relative) */
export const compileSet = (setRaw: unknown, m: McManifest, cfg: McConfig = loadMcConfig()): CompileResult => {
  const set = VoxelSet.parse(setRaw);
  const presets = loadPresets();
  const grid = expand(set.ops, set.palette as Record<string, string>);
  const models = m.models as unknown as Record<string, MModel>;

  // ---- palette keys -> blocks
  const info = new Map<string, { id: string; shape: string; layer: string; model: string | null; rotX: number; rotY: number; level: number } | null>();
  for (const [k, raw] of Object.entries(set.palette)) {
    const rv = resolvePaletteValue(raw, presets);
    if ("error" in rv) throw new Error(`palette "${k}": ${rv.error}`);
    if (rv.ref === "air") { info.set(k, null); continue; }
    const p = parseBlockRef(rv.ref)!;
    const b = m.blocks[p.id];
    if (!b) throw new Error(`palette "${k}": unknown block ${p.id} (run mc-validate first)`);
    const state = findState(b, p.props);
    const st = state !== null && b.states ? (b.states[state] as { model: string; x?: number; y?: number }) : null;
    info.set(k, { id: p.id, shape: shapeAt(m, b, state), layer: b.layer, model: st?.model ?? null, rotX: st?.x ?? 0, rotY: st?.y ?? 0, level: Number(p.props.level ?? 0) });
  }
  const isOpaqueCube = (k: string | undefined) => { const i = k ? info.get(k) : null; return !!i && i.shape === "cube" && i.layer === "opaque"; };

  // ---- positions per key; a block with an opaque full cube on all six sides can never be seen
  const positions = new Map<string, number[]>();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [pos, k] of grid) {
    const [x, y, z] = pos.split(",").map(Number);
    [x, y, z].forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v + 1); });
    if (NEIGHBOURS.every(([dx, dy, dz]) => isOpaqueCube(grid.get(`${x + dx},${y + dy},${z + dz}`)))) continue;
    const arr = positions.get(k) ?? [];
    arr.push(x, y, z);
    positions.set(k, arr);
  }

  // ---- blocks
  const blocks: CBlock[] = [];
  const texKeys = new Set<string>();
  const slotKeys = new Set<string>();
  for (const [k, pos] of [...positions].sort(([a], [b]) => a.localeCompare(b))) {
    const i = info.get(k);
    if (!i) continue;
    const bdef = m.blocks[i.id] as unknown as { tint: { color: string | null } | null };
    let elements: CElement[] = [];
    if (i.shape === "fluid") {
      const still = `block/${i.id}_still`;
      elements = [{ from: [0, 0, 0], to: [16, 14, 16], faces: Object.fromEntries(DIRS.map((d) => [d, { tex: still, uv: [0, 0, 16, 16], tint: i.id === "water", cull: d }])) }];
      // the renderer's sloped surface and falls (VoxelWorld fluidGeometry); without it the box above is drawn
      if ((m as unknown as { textures: Record<string, unknown> }).textures?.[`block/${i.id}_flow`]) texKeys.add(`block/${i.id}_flow`);
    } else {
      const mm = i.model ? models[i.model] : null;
      if (!mm) throw new Error(`palette "${k}": ${i.id} has no model in the manifest`);
      elements = convertElements(mm.elements);
    }
    for (const e of elements) for (const f of Object.values(e.faces)) if (f) texKeys.add(f.tex);
    blocks.push({
      key: k, id: i.id, shape: i.shape as CBlock["shape"], layer: i.layer as CBlock["layer"],
      tint: bdef.tint?.color ?? null, rotX: i.rotX, rotY: i.rotY, elements, light: LIGHT[i.id] ?? 0, positions: pos,
      ...(i.shape === "fluid" ? { level: i.level } : {}),
    });
  }

  // ---- mobs: skins (texture stack + model slots) and the head's look target
  const eyeOf = (id: string): [number, number, number] | null => {
    const mob = set.mobs.find((x) => x.id === id);
    if (mob) { const h = (cfg.heights[mob.mob] ?? cfg.heights.default) * (mob.baby ? 0.5 : 1); return [mob.at[0], mob.at[1] + h * 0.85, mob.at[2]]; }
    const c = set.characters.find((x) => x.id === id);
    // the cast's face: about 0.83 of the 2.16 m card
    if (c) return [c.at[0], c.at[1] + 1.8, c.at[2]];
    return null;
  };
  const mobs: CompiledWorld["mobs"] = set.mobs.map((mob) => {
    const known = m.mobs[mob.mob]?.textures ?? [];
    const textures = mobTextureStack(mob.mob, mob.variant, mob.overlays, known);
    const slots = (MOB_MODELS[mob.mob]?.slots ?? []).map((s) => s.tex);
    for (const t of [...textures, ...slots]) texKeys.add(t);
    for (const t of slots) slotKeys.add(t);
    const look = mob.lookAt === undefined ? null : typeof mob.lookAt === "string" ? eyeOf(mob.lookAt) : (mob.lookAt as [number, number, number]);
    const { overlays: _o, lookAt: _l, action, ...rest } = mob;
    return { ...rest, action: action ?? "idle", look, textures, slots } as CompiledWorld["mobs"][number];
  });

  // ---- props: item sprites, or block models (a block prop, or an item that is a block: tnt)
  const blockModel = (id: string, model: string | null, rotX: number, rotY: number, ctx: string): CBlock => {
    const mm = model ? models[model] : null;
    if (!mm) throw new Error(`${ctx}: ${id} has no model in the manifest`);
    const elements = convertElements(mm.elements);
    for (const e of elements) for (const f of Object.values(e.faces)) if (f) texKeys.add(f.tex);
    const bdef = m.blocks[id] as unknown as { tint: { color: string | null } | null; layer: string } | undefined;
    return {
      key: `prop:${id}`, id, shape: "model", layer: (bdef?.layer ?? "cutout") as CBlock["layer"], tint: bdef?.tint?.color ?? null,
      rotX, rotY, elements, light: LIGHT[id] ?? 0, positions: [],
    };
  };
  const items = m.items as unknown as Record<string, { kind: string; layers?: string[]; blockModel?: string }>;
  const props: CompiledWorld["props"] = set.props.map((p) => {
    const out: CompiledWorld["props"][number] = { ...(p as CompiledWorld["props"][number]) };
    if (p.block !== undefined) {
      const r = parseBlockRef(p.block)!;
      const b = m.blocks[r.id];
      if (!b) throw new Error(`prop "${p.id}": unknown block ${r.id} (run mc-validate first)`);
      const state = findState(b, r.props);
      const st = state !== null && b.states ? (b.states[state] as { model: string; x?: number; y?: number }) : null;
      out.model = blockModel(r.id, st?.model ?? null, st?.x ?? 0, st?.y ?? 0, `prop "${p.id}"`);
    } else if (p.item !== undefined) {
      const it = items[p.item];
      if (!it) throw new Error(`prop "${p.id}": unknown item ${p.item}`);
      if (it.blockModel) out.model = blockModel(p.item, it.blockModel, 0, 0, `prop "${p.id}"`);
      else if (it.layers?.length) { out.sprite = it.layers[0]; texKeys.add(it.layers[0]); }
      else throw new Error(`prop "${p.id}": item ${p.item} has no sprite or block model (special renderer: not drawable)`);
    }
    return out;
  });

  // ---- textures
  const mtex = (m as unknown as { textures: Record<string, { file: string; w: number; h: number; anim?: { frames: number; frametime: number } }> }).textures;
  const textures: Record<string, CTexture> = {};
  const textureFiles: CompileResult["textureFiles"] = [];
  // textures that moved between game versions (key the engine uses -> older names), tried in order
  const ALIASES: Record<string, string[]> = { "entity/shield/shield_base_nopattern": ["entity/shield_base_nopattern"] };
  const slotFallback = [...slotKeys].map((k) => mtex[k]).find(Boolean);
  for (const t of [...texKeys].sort()) {
    let src = mtex[t] ?? (ALIASES[t] ?? []).map((a) => mtex[a]).find(Boolean);
    // a hand item this game version lacks (slots are only drawn when an act holds them): stand in another slot's
    // texture so the slot order stays the same
    if (!src && slotKeys.has(t) && slotFallback) { console.warn(`texture ${t} is not in this game version; that hand item will look wrong`); src = slotFallback; }
    if (!src) throw new Error(`texture ${t} is not in the manifest`);
    const file = `tex/${t}.png`;
    textures[t] = { file, w: src.w, h: src.h, frames: src.anim?.frames ?? 1, frametime: src.anim?.frametime ?? 1 };
    textureFiles.push({ from: src.file, to: file });
  }

  const world: CompiledWorld = {
    kind: "CompiledWorld", id: set.id, mcVersion: m.mcVersion, sky: set.sky,
    bounds: { min: lo as CompiledWorld["bounds"]["min"], max: hi as CompiledWorld["bounds"]["max"] },
    textures, blocks,
    mobs, props,
    characters: set.characters as CompiledWorld["characters"], cameras: set.cameras as CompiledWorld["cameras"],
    heights: cfg.heights,
  };
  return { world, textureFiles };
};

/** compile and write <outDir>/world.json + <outDir>/tex/...; returns the world */
export const stageSet = (setRaw: unknown, m: McManifest, outDir: string, libraryRoot = dirname(manifestPath())): CompiledWorld => {
  const { world, textureFiles } = compileSet(setRaw, m);
  for (const t of textureFiles) {
    const dest = join(outDir, t.to);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(libraryRoot, t.from), dest);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "world.json"), JSON.stringify(world));
  return world;
};
