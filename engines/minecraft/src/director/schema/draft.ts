// DirectorDraft: what the AI step writes. It holds only the director's choices; everything that can be computed
// (shot spans, narration, sourceRefs, ids, seconds, sort order) is filled in by the assembler, so the AI cannot
// get it wrong and the same draft always gives the same plan.
// Fields with a default may be left out (lean drafts): start, durationFrames and anchor null, params {},
// sourceNodeIds [], inferred false, and a shot's camera, events, continuity and skipped [].
import { z } from "zod";
import { SchemaVersion, ShotId, Slug, NodeId } from "./common.ts";
import { DraftVoxelSet, Vec3 } from "./minecraft.ts";
import { Target, Channel, Easing, ActionId, Anchor, ContinuityState, Skipped, CameraDirective } from "./plan.ts";

const timed = {
  /** first frame, relative to the shot start; null = land on `anchor` (its word's frame minus the lead) */
  start: z.int().min(0).nullable().default(null),
  /** length in frames; null = until the shot ends */
  durationFrames: z.int().min(0).nullable().default(null),
  anchor: Anchor.nullable().default(null),
  params: z.record(z.string(), z.unknown()).default({}),
  /** the AST direction nodes this comes from (n0058.3); empty only when inferred */
  sourceNodeIds: z.array(NodeId).default([]),
  inferred: z.boolean().default(false),
  rationale: z.string().min(1).max(240),
};

export const DraftEvent = z.strictObject({
  ...timed,
  target: Target,
  channel: Channel,
  action: ActionId,
  easing: Easing,
  intensity: z.number().min(0).max(1),
});
export type DraftEvent = z.infer<typeof DraftEvent>;

export const DraftCamera = z.strictObject({
  ...timed,
  shotType: CameraDirective.shape.shotType,
  movement: CameraDirective.shape.movement,
  subject: Target.nullable(),
  action: ActionId,
});
export type DraftCamera = z.infer<typeof DraftCamera>;

/** Minecraft mode: a named preset from the skill's presets/ (acting_presets, mob_presets, camera_recipes) performed in
 *  this shot. The draft names the preset and who it is on; the assembler times it (start or anchor, like an event) and
 *  director/presets.ts expands it into the shot's direction (camera keys, paths, events). It adds performance, not
 *  coverage: the shot's events still cover its directions. */
export const DraftPresetUse = z.strictObject({
  start: timed.start, durationFrames: timed.durationFrames, anchor: timed.anchor, params: timed.params, rationale: timed.rationale,
  kind: z.enum(["acting", "mob", "camera"]),
  /** the preset's name in its file: "jump_into", "spawn_drop", "whip_to_reaction" */
  preset: z.string().regex(/^[a-z0-9_]+$/),
  /** acting: the character; mob: the mobs, in phase order; camera: the subjects to frame ("gerald:head" for a face) */
  who: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*(:head)?$/)).min(1),
  /** camera: the set's camera mark the recipe starts from (default: the mark linked to this shot) */
  mark: Slug.optional(),
  /** acting/mob: the point a move ends on (jump landing, walk end, arrow hit); mob presets take one point per mob */
  to: z.union([Vec3, z.array(Vec3)]).optional(),
  /** mob: the id the mobs look at, turn to or shoot at */
  target: Slug.optional(),
});
export type DraftPresetUse = z.infer<typeof DraftPresetUse>;

export const DraftShot = z.strictObject({
  shotId: ShotId,
  take: z.string().nullable(),
  environmentId: Slug.nullable(),
  charactersPresent: z.array(Slug),
  camera: z.array(DraftCamera).default([]),
  events: z.array(DraftEvent).default([]),
  continuity: z.array(ContinuityState).default([]),
  skipped: z.array(Skipped).default([]),
  /** Minecraft mode: presets performed in this shot (reference motion by name, never invent it) */
  presets: z.array(DraftPresetUse).default([]),
});
export type DraftShot = z.infer<typeof DraftShot>;

export const DirectorDraft = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("DirectorDraft"),
  /** the script the draft was made for: must match the request */
  script: z.strictObject({ sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  /** the model that wrote it, as it names itself; null if unknown */
  model: z.string().nullable(),
  shots: z.array(DraftShot),
  /** Minecraft mode: one voxel set per minecraft environment, keyed by environment id (request.minecraft.sets) */
  minecraft: z.record(Slug, DraftVoxelSet).optional(),
});
export type DirectorDraft = z.infer<typeof DirectorDraft>;
