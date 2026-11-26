// Minecraft environment mode: checks VoxelSets against the asset manifest (only blocks, mobs and items that exist),
// the renderer's supported shapes, the palette presets, and the physical rules: feet on a solid block, nobody inside a
// block, no camera inside a block (the user's no-clipping rule). Deterministic; every issue says where it is.
import { createHash } from "node:crypto";
import { MOB_MODELS, mobTextureStack } from "../../minecraft/mobs/models.ts";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VoxelSet, PalettePresets, type Issue, type VoxelOp, type CharactersDoc, type EnvironmentsDoc,
} from "../schema/index.ts";

// ---------------------------------------------------------------- manifest + config

export type McBlock = {
  name: string;
  shape: string;
  layer: "opaque" | "cutout" | "translucent";
  defaultState: string | null;
  states: Record<string, { model: string }> | null;
  multipart: unknown[] | null;
};
export type McManifest = {
  kind: "MinecraftManifest";
  mcVersion: string;
  jar: { path: string; sha256: string };
  blocks: Record<string, McBlock>;
  models: Record<string, { shape: string }>;
  items: Record<string, { name: string; kind: string }>;
  mobs: Record<string, { name: string; textures: string[] }>;
};
export type McConfig = {
  manifest: string;
  supportedShapes: string[];
  builtMobs: string[];
  maxBlocks: number;
  maxExtent: number;
  heights: Record<string, number>;
};

const CONFIG_URL = new URL("../config/minecraft.json", import.meta.url);
const PRESETS_URL = new URL("../config/minecraft-palettes.json", import.meta.url);

export const loadMcConfig = (): McConfig => JSON.parse(readFileSync(CONFIG_URL, "utf8")) as McConfig;
export const loadPresets = () => PalettePresets.parse(JSON.parse(readFileSync(PRESETS_URL, "utf8")));
/** project root (engines/minecraft); a relative manifest path in the config is read from here */
const ROOT_URL = new URL("../../../", import.meta.url);
export const manifestPath = (cfg = loadMcConfig()) => {
  const p = process.env.MC_MANIFEST || cfg.manifest;
  return isAbsolute(p) ? p : fileURLToPath(new URL(p, ROOT_URL));
};

const manifestCache = new Map<string, McManifest>();

/** our own player skins: <library>/custom/skins/<wide|slim>/<name>.png become textures
 *  entity/player/<wide|slim>/<name> of the "player" mob (variant "ruby" picks it). Kept outside the extracted
 *  manifest so a re-extract never loses them. */
const addCustomSkins = (m: McManifest, root: string) => {
  const tex = (m as unknown as { textures: Record<string, unknown> }).textures;
  const player = m.mobs.player;
  if (!tex || !player) return;
  for (const arm of ["wide", "slim"]) {
    const dir = join(root, "custom", "skins", arm);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".png")) continue;
      const key = `entity/player/${arm}/${basename(f, ".png")}`;
      tex[key] = { file: `custom/skins/${arm}/${f}`, src: "custom", w: 64, h: 64, layer: "cutout" };
      if (!player.textures.includes(key)) player.textures.push(key);
    }
  }
};
export const loadManifest = (path = manifestPath()): McManifest => {
  const hit = manifestCache.get(path);
  if (hit) return hit;
  if (!existsSync(path)) throw new Error(`Minecraft manifest not found: ${path} (extract your own: python -I tools/mc_extract.py --jar <your Minecraft client .jar>)`);
  const m = JSON.parse(readFileSync(path, "utf8")) as McManifest;
  if (m.kind !== "MinecraftManifest") throw new Error(`${path} is not a MinecraftManifest`);
  addCustomSkins(m, join(path, ".."));
  manifestCache.set(path, m);
  return m;
};

/** MANIFEST_STALE: the jar the manifest was made from changed (or is gone). Hashing 40 MB takes ~0.1 s. */
export const manifestFreshness = (m: McManifest): Issue | null => {
  const loc = { document: "manifest.json" };
  if (!m.jar?.path || !existsSync(m.jar.path) || !statSync(m.jar.path).isFile())
    return { severity: "info", code: "MANIFEST_JAR_MISSING", message: `the manifest's jar ${m.jar?.path} is not on this machine; freshness not checked`, location: loc };
  const sha = createHash("sha256").update(readFileSync(m.jar.path)).digest("hex");
  return sha === m.jar.sha256 ? null
    : { severity: "error", code: "MANIFEST_STALE", message: `${m.jar.path} changed since the manifest was written; rerun mc_extract.py`, location: loc };
};

// ---------------------------------------------------------------- block refs

export const parseBlockRef = (ref: string) => {
  const m = ref.match(/^([a-z0-9_]+)(?:\[(.*)\])?$/);
  if (!m) return null;
  const props: Record<string, string> = {};
  for (const kv of (m[2] ?? "").split(",").filter(Boolean)) {
    const [k, v] = kv.split("=");
    props[k] = v;
  }
  return { id: m[1], props };
};

/** the blockstate key that has every given property, or null; no properties = the default state */
export const findState = (b: McBlock, props: Record<string, string>): string | null => {
  // fluids: the game's level=0..15 (0 source, 1-7 flowing, 8+ falling) is drawn by the renderer, not a model state
  if (b.shape === "fluid") return Object.entries(props).every(([k, v]) => k === "level" && /^(\d|1[0-5])$/.test(v)) ? "" : null;
  if (!b.states) return Object.keys(props).length ? null : "";
  const want = Object.entries(props);
  if (!want.length) return b.defaultState;
  const def = new Set((b.defaultState ?? "").split(","));
  const fits = Object.keys(b.states).filter((key) => {
    const have = new Set(key.split(","));
    return want.every(([k, v]) => have.has(`${k}=${v}`));
  });
  // among the matches, the one closest to the default state
  fits.sort((a, c) => c.split(",").filter((kv) => def.has(kv)).length - a.split(",").filter((kv) => def.has(kv)).length);
  return fits[0] ?? null;
};

/** what a block looks like at a state: its shape (cube, cross, model ...) */
export const shapeAt = (m: McManifest, b: McBlock, state: string | null) => {
  if (b.shape === "fluid" || b.shape === "multipart" || !b.states || state === null) return b.shape;
  const model = b.states[state]?.model;
  return (model && m.models[model]?.shape) || b.shape;
};

/** blocks a body can stand on, and that a body or the lens must not be inside */
export const SOLID_SHAPES = new Set(["cube", "model", "multipart"]);

// ---------------------------------------------------------------- voxel expansion

const span = (a: number, b: number) => ({ lo: Math.min(a, b), hi: Math.max(a, b) });
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const volume = (op: Exclude<VoxelOp, { op: "block" }>) =>
  (Math.abs(op.to[0] - op.from[0]) + 1) * (Math.abs(op.to[1] - op.from[1]) + 1) * (Math.abs(op.to[2] - op.from[2]) + 1);

/** run the ops: position -> palette key. "air" (a palette value) removes. Call only on a set whose ops passed the size check. */
export const expand = (ops: VoxelOp[], palette: Record<string, string>) => {
  const grid = new Map<string, string>();
  const put = (x: number, y: number, z: number, k: string) => (palette[k] === "air" ? grid.delete(key(x, y, z)) : grid.set(key(x, y, z), k));
  for (const op of ops) {
    if (op.op === "block") { put(...op.at, op.block); continue; }
    const X = span(op.from[0], op.to[0]), Y = span(op.from[1], op.to[1]), Z = span(op.from[2], op.to[2]);
    for (let x = X.lo; x <= X.hi; x++) for (let y = Y.lo; y <= Y.hi; y++) for (let z = Z.lo; z <= Z.hi; z++) {
      const edgeX = x === X.lo || x === X.hi, edgeY = y === Y.lo || y === Y.hi, edgeZ = z === Z.lo || z === Z.hi;
      if (op.op === "fill") put(x, y, z, op.block);
      else if (op.op === "hollow") { if (edgeX || edgeY || edgeZ) put(x, y, z, op.block); }
      else if (op.op === "walls") { if (edgeX || edgeZ) put(x, y, z, op.block); }
      else if (op.op === "replace") { if (grid.get(key(x, y, z)) === op.block) put(x, y, z, op.with); }
    }
  }
  return grid;
};

// ---------------------------------------------------------------- validation

export type McValidateInput = {
  set: unknown;
  /** the file name, for issue locations */
  document: string;
  manifest: McManifest;
  config?: McConfig;
  presets?: PalettePresets;
  /** characters.json of the story, when there is one: placed characters must exist in it */
  characters?: CharactersDoc | null;
  /** environments.json of the story, when there is one: the set id must be a minecraft environment */
  environments?: EnvironmentsDoc | null;
};

/** a palette value -> the block ref it names ("@village.wall" through the presets), or an error message */
export const resolvePaletteValue = (raw: string, presets: PalettePresets): { ref: string; theme?: string } | { error: string; code: string } => {
  if (!raw.startsWith("@")) return { ref: raw };
  const [theme, role] = raw.slice(1).split(".");
  const table = (presets.themes as Record<string, Record<string, string> | undefined>)[theme];
  if (!table) return { code: "UNKNOWN_THEME", error: `no theme "${theme}" in config/minecraft-palettes.json` };
  if (!table[role]) return { code: "UNKNOWN_PRESET_ROLE", error: `theme ${theme} has no role "${role}" (roles: ${Object.keys(table).join(", ")})` };
  return { ref: table[role], theme };
};

export const validateVoxelSet = (input: McValidateInput): Issue[] => {
  const issues: Issue[] = [];
  const add = (severity: Issue["severity"], code: string, message: string, path?: string) =>
    issues.push({ severity, code, message, location: { document: input.document, ...(path ? { path } : {}) } });

  const parsed = VoxelSet.safeParse(input.set);
  if (!parsed.success) {
    for (const z of parsed.error.issues) add("error", "VOXEL_SCHEMA", z.message, z.path.map(String).join(".") || "$");
    return issues;
  }
  const set = parsed.data;
  const m = input.manifest;
  const cfg = input.config ?? loadMcConfig();
  const presets = input.presets ?? loadPresets();
  const supported = new Set(cfg.supportedShapes);

  if (set.mcVersion !== m.mcVersion)
    add("warning", "MANIFEST_VERSION", `the set was written for ${set.mcVersion}, the manifest is ${m.mcVersion}; block names are checked against ${m.mcVersion}`, "mcVersion");

  if (input.environments) {
    const env = input.environments.environments.find((e) => e.id === set.id);
    if (!env) add("error", "UNKNOWN_ENVIRONMENT", `set "${set.id}" is not in environments.json`, "id");
    else if (env.environmentType !== "minecraft") add("error", "ENVIRONMENT_NOT_MINECRAFT", `environment "${set.id}" has environmentType ${env.environmentType ?? "painted (default)"}, not minecraft`, "id");
  }

  // ---- palette: every value a real block (or a preset role that is one), at a state the renderer can draw
  /** palette key -> resolved block (id + state + shape), or null when it is air or broken */
  const resolved = new Map<string, { id: string; state: string | null; shape: string; layer: string } | null>();
  for (const [k, raw] of Object.entries(set.palette)) {
    const path = `palette.${k}`;
    const rv = resolvePaletteValue(raw, presets);
    if ("error" in rv) { add("error", rv.code, `palette "${k}": ${rv.error}`, path); resolved.set(k, null); continue; }
    const ref = rv.ref;
    if (rv.theme && set.theme && set.theme !== rv.theme) add("info", "MIXED_THEME", `palette "${k}" uses @${rv.theme} in a ${set.theme} set`, path);
    if (ref === "air") { resolved.set(k, null); continue; }
    const p = parseBlockRef(ref);
    const b = p && m.blocks[p.id];
    if (!p || !b) { add("error", "UNKNOWN_BLOCK", `palette "${k}": block "${ref}" is not in the manifest (${m.mcVersion})`, path); resolved.set(k, null); continue; }
    const state = findState(b, p.props);
    if (state === null) {
      add("error", "UNKNOWN_BLOCK_STATE", `palette "${k}": ${p.id} has no state ${JSON.stringify(p.props)}${b.states ? ` (e.g. ${Object.keys(b.states).slice(0, 3).join(" | ")})` : " (it has no variants)"}`, path);
      resolved.set(k, null);
      continue;
    }
    const shape = shapeAt(m, b, state);
    if (!supported.has(shape))
      add("error", "UNSUPPORTED_SHAPE", `palette "${k}": ${p.id} is a "${shape}" block; the voxel renderer draws ${[...supported].join(", ")} today`, path);
    resolved.set(k, { id: p.id, state, shape, layer: b.layer });
  }

  // ---- ops: known keys, from <= to, size limits (before expanding anything)
  const used = new Set<string>();
  let total = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const grow = (p: readonly number[]) => p.forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
  set.ops.forEach((op, i) => {
    const path = `ops.${i}`;
    for (const k of op.op === "replace" ? [op.block, op.with] : [op.block]) {
      used.add(k);
      if (!(k in set.palette)) add("error", "UNKNOWN_PALETTE_KEY", `op ${i} (${op.op}) uses palette key "${k}", which the palette does not define`, path);
    }
    if (op.op === "block") { grow(op.at); total += 1; return; }
    if (op.from.some((v, a) => v > op.to[a])) add("error", "VOXEL_BAD_BOX", `op ${i} (${op.op}): from ${JSON.stringify(op.from)} must be <= to ${JSON.stringify(op.to)} on every axis`, path);
    grow(op.from); grow(op.to);
    if (op.op !== "replace") total += volume(op);
  });
  for (const k of Object.keys(set.palette)) if (!used.has(k)) add("warning", "UNUSED_PALETTE_KEY", `palette key "${k}" is never used`, `palette.${k}`);
  const extent = Math.max(...hi.map((h, i) => h - lo[i] + 1));
  if (extent > cfg.maxExtent) add("error", "VOXEL_TOO_BIG", `the set spans ${extent} blocks on one axis (max ${cfg.maxExtent})`, "ops");
  if (total > cfg.maxBlocks * 4) add("error", "VOXEL_TOO_BIG", `the ops write ${total} blocks (max ${cfg.maxBlocks * 4} writes, ${cfg.maxBlocks} kept)`, "ops");
  if (issues.some((i) => i.code === "VOXEL_TOO_BIG" || i.code === "VOXEL_BAD_BOX")) return issues;

  const grid = expand(set.ops, set.palette as Record<string, string>);
  if (grid.size > cfg.maxBlocks) add("error", "VOXEL_TOO_BIG", `the set has ${grid.size} blocks (max ${cfg.maxBlocks})`, "ops");
  const solidAt = (x: number, y: number, z: number) => {
    const k = grid.get(key(x, y, z));
    const r = k ? resolved.get(k) : null;
    return r ? SOLID_SHAPES.has(r.shape) : false;
  };
  const blockAt = (x: number, y: number, z: number) => grid.get(key(x, y, z));

  // ---- bodies: feet on a solid block, body not inside one
  const ids = new Set<string>();
  const unique = (id: string, path: string) => { if (ids.has(id)) add("error", "DUPLICATE_ID", `"${id}" is used twice in this set`, path); ids.add(id); };
  const EPS = 0.02;
  const checkBody = (what: "MOB" | "CHARACTER", label: string, at: readonly number[], height: number, path: string) => {
    const [x, y, z] = at;
    const bx = Math.floor(x), bz = Math.floor(z);
    const onTop = Math.abs(y - Math.round(y)) < EPS;
    const footY = onTop ? Math.round(y) : Math.floor(y);
    // on a full block: the block below the feet; part-way up a block (a slab, a step): that block itself, if it is a partial model
    const support = onTop ? solidAt(bx, footY - 1, bz) : resolved.get(blockAt(bx, footY, bz) ?? "")?.shape === "model";
    if (!support) add("error", `FLOATING_${what}`, `${label} at ${JSON.stringify(at)} has no solid block under its feet (block ${JSON.stringify([bx, onTop ? footY - 1 : footY, bz])} is ${blockAt(bx, onTop ? footY - 1 : footY, bz) ?? "air"})`, path);
    for (let yy = onTop ? footY : footY + 1; yy < y + height - EPS; yy++) {
      if (solidAt(bx, yy, bz)) { add("error", "INSIDE_BLOCK", `${label} at ${JSON.stringify(at)} is inside block "${blockAt(bx, yy, bz)}" at ${JSON.stringify([bx, yy, bz])} (height ${height})`, path); break; }
    }
  };

  const castIds = input.characters ? new Set(input.characters.characters.map((c) => c.id)) : null;
  set.mobs.forEach((mob, i) => {
    const path = `mobs.${i}`;
    unique(mob.id, path);
    if (mob.character !== undefined) {
      if (castIds && !castIds.has(mob.character)) add("error", "UNKNOWN_CHARACTER", `mob "${mob.id}" plays "${mob.character}", who is not in characters.json`, `${path}.character`);
      if (set.characters.some((c) => c.id === mob.character) || set.mobs.some((x, j) => j < i && x.character === mob.character))
        add("error", "CHARACTER_PLACED_TWICE", `"${mob.character}" is placed twice in this set (a card and a mob, or two mobs)`, `${path}.character`);
    }
    const def = m.mobs[mob.mob];
    if (!def) { add("error", "UNKNOWN_MOB", `mob "${mob.mob}" is not in the manifest (${m.mcVersion})`, `${path}.mob`); return; }
    if (!def.textures.length) { add("error", "MOB_NO_TEXTURE", `mob "${mob.mob}" has no texture in the manifest`, `${path}.mob`); return; }
    if (mob.variant && !def.textures.some((t) => t === mob.variant || t.endsWith(`/${mob.variant}`)))
      add("error", "UNKNOWN_MOB_VARIANT", `mob "${mob.mob}" has no texture "${mob.variant}" (has ${def.textures.slice(0, 6).map((t) => t.split("/").pop()).join(", ")}${def.textures.length > 6 ? ", ..." : ""})`, `${path}.variant`);
    if (!cfg.builtMobs.includes(mob.mob))
      add("warning", "MOB_NOT_BUILT", `mob "${mob.mob}" is in the manifest but the mob library cannot draw it yet (drawn as a marker box)`, `${path}.mob`);
    else {
      const model = MOB_MODELS[mob.mob];
      const tex = mobTextureStack(mob.mob, mob.variant, undefined, def.textures)[0];
      if (model && !(mob.mob === "player" ? /^entity\/player\/(wide|slim)\//.test(tex) : model.textures(tex)))
        add("warning", "MOB_VARIANT_NOT_BUILT", `mob "${mob.id}": texture ${tex} needs another model in ${m.mcVersion}; drawn on the ${model.defaultTexture.split("/").pop()} model, it will look wrong`, `${path}.variant`);
      if (mob.baby) add("warning", "MOB_BABY_NOT_BUILT", `mob "${mob.id}": baby models are not built; drawn as a half-size adult`, `${path}.baby`);
    }
    (mob.overlays ?? []).forEach((o, j) => {
      if (!def.textures.some((t) => t === o || t.endsWith(`/${o}`)))
        add("error", "UNKNOWN_MOB_OVERLAY", `mob "${mob.id}": no texture "${o}" for ${mob.mob} (overlays like type/plains, profession/farmer)`, `${path}.overlays.${j}`);
    });
    if (typeof mob.lookAt === "string" && !set.mobs.some((x) => x.id === mob.lookAt) && !set.characters.some((x) => x.id === mob.lookAt))
      add("error", "UNKNOWN_LOOK_TARGET", `mob "${mob.id}" looks at "${mob.lookAt}", who is not placed in this set`, `${path}.lookAt`);
    const h = (cfg.heights[mob.mob] ?? cfg.heights.default) * (mob.baby ? 0.5 : 1);
    checkBody("MOB", `mob "${mob.id}"`, mob.at, h, `${path}.at`);
  });

  set.characters.forEach((c, i) => {
    const path = `characters.${i}`;
    unique(c.id, path);
    if (castIds && !castIds.has(c.id)) add("error", "UNKNOWN_CHARACTER", `character "${c.id}" is not in characters.json`, `${path}.id`);
    checkBody("CHARACTER", `character "${c.id}"`, c.at, cfg.heights.character, `${path}.at`);
  });

  set.props.forEach((p, i) => {
    const path = `props.${i}`;
    unique(p.id, path);
    if (p.item !== undefined && !m.items[p.item]) add("error", "UNKNOWN_ITEM", `item "${p.item}" is not in the manifest (${m.mcVersion})`, `${path}.item`);
    else if (p.item !== undefined) {
      const it = m.items[p.item] as { layers?: string[]; blockModel?: string };
      if (!it.blockModel && !it.layers?.length)
        add("error", "PROP_NOT_DRAWABLE", `item "${p.item}" has a special renderer in the game (no sprite, no block model); use a block prop or another item`, `${path}.item`);
    }
    if (p.block !== undefined) {
      const r = parseBlockRef(p.block);
      const b = r && m.blocks[r.id];
      if (!r || !b) add("error", "UNKNOWN_BLOCK", `prop block "${p.block}" is not in the manifest (${m.mcVersion})`, `${path}.block`);
      else if (findState(b, r.props) === null) add("error", "UNKNOWN_BLOCK_STATE", `prop block ${p.block}: no such state`, `${path}.block`);
    }
    if (p.heldBy !== null && !set.mobs.some((x) => x.id === p.heldBy) && !set.characters.some((x) => x.id === p.heldBy))
      add("error", "UNKNOWN_HOLDER", `prop "${p.id}" is held by "${p.heldBy}", who is not placed in this set`, `${path}.heldBy`);
    if (p.at) {
      const [x, y, z] = p.at;
      if (solidAt(Math.floor(x), Math.floor(y + 0.01), Math.floor(z))) add("error", "INSIDE_BLOCK", `prop "${p.id}" at ${JSON.stringify(p.at)} is inside a block`, `${path}.at`);
    }
  });

  set.cameras.forEach((c, i) => {
    const path = `cameras.${i}`;
    unique(c.id, path);
    const [x, y, z] = c.position;
    if (solidAt(Math.floor(x), Math.floor(y), Math.floor(z))) add("error", "CAMERA_INSIDE_BLOCK", `camera "${c.id}" at ${JSON.stringify(c.position)} is inside block "${blockAt(Math.floor(x), Math.floor(y), Math.floor(z))}"`, `${path}.position`);
    if (c.position.every((v, a) => v === c.lookAt[a])) add("error", "CAMERA_NO_DIRECTION", `camera "${c.id}" looks at its own position`, `${path}.lookAt`);
  });

  return issues;
};

/** palette presets: every role a real block the renderer can draw (run against the real manifest) */
export const validatePresets = (m: McManifest, presets = loadPresets(), cfg = loadMcConfig()): Issue[] => {
  const issues: Issue[] = [];
  for (const [theme, roles] of Object.entries(presets.themes)) {
    for (const [role, ref] of Object.entries(roles ?? {})) {
      const loc = { document: "config/minecraft-palettes.json", path: `themes.${theme}.${role}` };
      const p = parseBlockRef(ref);
      const b = p && m.blocks[p.id];
      if (!p || !b) { issues.push({ severity: "error", code: "UNKNOWN_BLOCK", message: `@${theme}.${role}: "${ref}" is not in the manifest (${m.mcVersion})`, location: loc }); continue; }
      const st = findState(b, p.props);
      const shape = st === null ? b.shape : shapeAt(m, b, st);
      if (st === null) issues.push({ severity: "error", code: "UNKNOWN_BLOCK_STATE", message: `@${theme}.${role}: ${ref} has no such state`, location: loc });
      else if (!cfg.supportedShapes.includes(shape)) issues.push({ severity: "error", code: "UNSUPPORTED_SHAPE", message: `@${theme}.${role}: ${ref} is a "${shape}" block`, location: loc });
    }
  }
  return issues;
};

// ---------------------------------------------------------------- a story folder

/**
 * every minecraft/<id>.voxel.json in an output folder (or one file), checked against the manifest and, when the folder
 * has them, characters.json and environments.json. A minecraft environment without a set is MISSING_VOXEL_SET.
 */
export const validateMinecraftPath = (o: {
  path: string;
  manifest?: McManifest;
  characters?: CharactersDoc | null;
  environments?: EnvironmentsDoc | null;
  checkFreshness?: boolean;
}): Issue[] => {
  const issues: Issue[] = [];
  const m = o.manifest ?? loadManifest();
  if (o.checkFreshness !== false) { const f = manifestFreshness(m); if (f) issues.push(f); }
  issues.push(...validatePresets(m));
  const isFile = statSync(o.path).isFile();
  const dir = isFile ? null : (existsSync(join(o.path, "minecraft")) ? join(o.path, "minecraft") : o.path);
  const files = isFile ? [o.path] : readdirSync(dir!).filter((f) => f.endsWith(".voxel.json")).sort().map((f) => join(dir!, f));
  const seen = new Set<string>();
  for (const f of files) {
    const document = isFile ? basename(f) : `minecraft/${basename(f)}`;
    let set: unknown;
    try { set = JSON.parse(readFileSync(f, "utf8")); }
    catch (e) { issues.push({ severity: "error", code: "VOXEL_UNREADABLE", message: `${basename(f)}: ${(e as Error).message}`, location: { document } }); continue; }
    const id = (set as { id?: unknown })?.id;
    if (typeof id === "string") {
      seen.add(id);
      if (basename(f) !== `${id}.voxel.json`) issues.push({ severity: "warning", code: "VOXEL_FILE_NAME", message: `${basename(f)} holds set "${id}"; name it ${id}.voxel.json`, location: { document } });
    }
    issues.push(...validateVoxelSet({ set, document, manifest: m, characters: o.characters, environments: o.environments }));
  }
  for (const e of o.environments?.environments ?? [])
    if (e.environmentType === "minecraft" && !seen.has(e.id))
      issues.push({ severity: "error", code: "MISSING_VOXEL_SET", message: `environment "${e.id}" is minecraft but there is no minecraft/${e.id}.voxel.json`, location: { document: "environments.json" } });
  if (!files.length && !o.environments?.environments.some((e) => e.environmentType === "minecraft"))
    issues.push({ severity: "warning", code: "NO_VOXEL_SETS", message: `no *.voxel.json in ${o.path}`, location: {} });
  return issues;
};
