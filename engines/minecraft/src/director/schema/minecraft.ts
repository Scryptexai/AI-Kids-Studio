// Minecraft environment mode: one VoxelSet per set (environment). The world is voxels + 3D mobs + item/block props;
// the cast stays ink 2D billboards placed on the voxels. Every block, mob and item must exist in the asset manifest
// (mc-assets/manifest.json, written by tools/mc_extract.py); validate/minecraft.ts checks that.
// Coordinates are Minecraft blocks: 1 unit = 1 block = 1 m, y up. A block at [x, y, z] fills x..x+1, y..y+1, z..z+1.
import { z } from "zod";
import { SchemaVersion, Slug, ShotId } from "./common.ts";

export const ENVIRONMENT_TYPES = ["painted", "minecraft"] as const;
export const EnvironmentType = z.enum(ENVIRONMENT_TYPES);
export type EnvironmentType = z.infer<typeof EnvironmentType>;

export const THEMES = ["village", "forest", "cave", "desert", "nether", "end", "castle"] as const;
export const Theme = z.enum(THEMES);
export type Theme = z.infer<typeof Theme>;

export const SKY_PRESETS = ["day", "sunset", "night", "nether", "cave", "end"] as const;
export const SkyPreset = z.enum(SKY_PRESETS);

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour like #91BD59");
export const Vec3i = z.tuple([z.int(), z.int(), z.int()]);
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** a block id from the manifest, optionally with state properties: oak_log, oak_log[axis=x], "air" clears */
export const BlockRef = z.string().regex(/^[a-z0-9_]+(\[[a-z0-9_]+=[a-z0-9_]+(,[a-z0-9_]+=[a-z0-9_]+)*\])?$/, "a block id like oak_log or oak_log[axis=x]");
/** a palette value: a BlockRef, or a theme preset role "@village.wall" (config/minecraft-palettes.json) */
export const PaletteValue = z.union([BlockRef, z.string().regex(/^@[a-z]+\.[a-z_]+$/, "a preset role like @village.wall")]);
/** short palette keys keep layouts readable: "g" grass, "w" wall */
export const PaletteKey = z.string().regex(/^[A-Za-z0-9_]{1,24}$/);

const box = { from: Vec3i, to: Vec3i, block: PaletteKey };
/** applied in order; a later op overwrites earlier blocks. from/to are inclusive block corners, from <= to on every axis */
export const VoxelOp = z.discriminatedUnion("op", [
  /** a solid box */
  z.strictObject({ op: z.literal("fill"), ...box }),
  /** a box shell: floor, roof and four walls */
  z.strictObject({ op: z.literal("hollow"), ...box }),
  /** four walls only (no floor, no roof) */
  z.strictObject({ op: z.literal("walls"), ...box }),
  /** one block */
  z.strictObject({ op: z.literal("block"), at: Vec3i, block: PaletteKey }),
  /** inside the box, swap every `block` for `with` */
  z.strictObject({ op: z.literal("replace"), ...box, with: PaletteKey }),
]);
export type VoxelOp = z.infer<typeof VoxelOp>;

export const Sky = z.strictObject({
  preset: SkyPreset,
  /** overrides for the preset's colours and fog distances (blocks) */
  skyColor: Hex.optional(),
  fogColor: Hex.optional(),
  fogNear: z.number().min(0).optional(),
  fogFar: z.number().min(0).optional(),
});

/** facing in degrees about y: 0 = toward +z (south, Minecraft's yaw 0), 90 = toward -x (west) */
const Facing = z.number().min(-360).max(360);

export const MobPlacement = z.strictObject({
  /** instance id, unique in the set ("gerald") */
  id: Slug,
  /** manifest mob id: cow, zombie, villager, player ... */
  mob: z.string().regex(/^[a-z0-9_]+$/),
  /** a texture of that mob: full key (entity/cow/cow_warm) or its file name (cow_warm); default: the first */
  variant: z.string().regex(/^[a-z0-9_/]+$/).optional(),
  baby: z.boolean().optional(),
  /** textures drawn over the base, bottom first (villager clothes and job): "type/plains", "profession/farmer" */
  overlays: z.array(z.string().regex(/^[a-z0-9_/]+$/)).optional(),
  /** feet position (blocks); x/z are usually a block centre (n + 0.5) */
  at: Vec3,
  facing: Facing,
  /** idle (default; never frozen: breathing, head look-around) or walk (walk cycle in place) */
  action: z.enum(["idle", "walk"]).optional(),
  /** the head turns toward this: an instance id (mob or character) or a point */
  lookAt: z.union([Slug, Vec3]).optional(),
  /** a script character this mob plays (Gerald the zombie): the character id from characters.json */
  character: Slug.optional(),
});
export type MobPlacement = z.infer<typeof MobPlacement>;

export const PropPlacement = z.strictObject({
  id: Slug,
  /** exactly one of item (a flat item sprite or a block item) or block (a small block model, e.g. a TNT on a table) */
  item: z.string().regex(/^[a-z0-9_]+$/).optional(),
  block: BlockRef.optional(),
  /** where it rests; null when a character or mob holds it */
  at: Vec3.nullable(),
  /** the character or mob instance holding it */
  heldBy: Slug.nullable(),
  facing: Facing,
  scale: z.number().positive().max(4).optional(),
}).refine((p) => (p.item === undefined) !== (p.block === undefined), { message: "a prop is exactly one of item or block", path: ["item"] })
  .refine((p) => (p.at === null) !== (p.heldBy === null), { message: "a prop either rests somewhere (at) or is held (heldBy)", path: ["at"] });
export type PropPlacement = z.infer<typeof PropPlacement>;

export const CharacterPlacement = z.strictObject({
  /** a character id from characters.json */
  id: Slug,
  /** feet position (blocks) */
  at: Vec3,
  /** billboards face the lens; this only flips the card (which way the profile looks) */
  look: z.enum(["camera", "left", "right"]),
  /** layered PNGs under public/ (bottom first, 600 x 1000 design frame, soles at y 975); default: a toon figure */
  layers: z.array(z.string().regex(/^[A-Za-z0-9_\-./]+\.png$/)).optional(),
  /** a thick ink outline round the whole card, in design units (0 = none) */
  outline: z.number().min(0).max(30).optional(),
  /** the toon figure's clothes (no layers): colours, and hat "hair" (hair colour in hair) or "cap" (colour in cap);
   *  anything left out comes from the default townsfolk look */
  outfit: z.strictObject({
    jacket: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), pants: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), boots: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), skin: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    hat: z.enum(["hair", "cap", "tophat", "bonnet", "diamond_helmet"]).optional(), armor: z.enum(["diamond"]).optional(), hair: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), cap: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).optional(),
});
export type CharacterPlacement = z.infer<typeof CharacterPlacement>;

/** a named camera mark: the preview still and the start of the plan's camera moves */
export const CameraMark = z.strictObject({
  id: Slug,
  position: Vec3,
  lookAt: Vec3,
  /** vertical FOV in degrees; the readable-face close-ups zoom with FOV, not by flying in (ricks camera) */
  fov: z.number().min(5).max(120),
  /** the plan shots this mark frames (the director links every minecraft shot to a mark) */
  shots: z.array(ShotId).optional(),
});
export type CameraMark = z.infer<typeof CameraMark>;

export const VoxelSet = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("VoxelSet"),
  /** the environment id from environments.json */
  id: Slug,
  theme: Theme.nullable(),
  /** the manifest the set was written against (mcVersion of manifest.json) */
  mcVersion: z.string().min(1),
  palette: z.record(PaletteKey, PaletteValue),
  ops: z.array(VoxelOp).min(1),
  sky: Sky,
  mobs: z.array(MobPlacement),
  props: z.array(PropPlacement),
  characters: z.array(CharacterPlacement),
  cameras: z.array(CameraMark).min(1),
});
export type VoxelSet = z.infer<typeof VoxelSet>;

/**
 * what the director writes per minecraft set (DirectorDraft.minecraft[<environment id>]): a VoxelSet without the
 * fields the assembler fills (schemaVersion, kind, id, mcVersion). palette may be left out or partial: an op's block
 * key that the palette does not define is the theme's preset role of that name ("ground" -> @village.ground), else a
 * manifest block id ("oak_log").
 */
export const DraftVoxelSet = z.strictObject({
  theme: Theme.nullable(),
  palette: z.record(PaletteKey, PaletteValue).default({}),
  ops: z.array(VoxelOp).min(1),
  sky: Sky,
  mobs: z.array(MobPlacement).default([]),
  props: z.array(PropPlacement).default([]),
  characters: z.array(CharacterPlacement).default([]),
  cameras: z.array(CameraMark).min(1),
});
export type DraftVoxelSet = z.infer<typeof DraftVoxelSet>;

/** config/minecraft-palettes.json: per theme, a role -> block id table the director builds sets from */
export const PalettePresets = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("PalettePresets"),
  themes: z.record(Theme, z.record(z.string().regex(/^[a-z_]+$/), BlockRef)),
});
export type PalettePresets = z.infer<typeof PalettePresets>;
