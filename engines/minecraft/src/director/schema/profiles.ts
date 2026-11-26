// Characters, environments and props, extracted strictly from the script. A field the script does not state is null.
import { z } from "zod";
import { SchemaVersion, Slug, ShotId, SourceRef, SourcedString } from "./common.ts";
import { EnvironmentType } from "./minecraft.ts";

/** a shot where something is seen or mentioned, and why we think so */
export const Appearance = z.strictObject({ shotId: ShotId, sourceRefs: z.array(SourceRef).min(1), inferred: z.boolean() });
export type Appearance = z.infer<typeof Appearance>;

export const CharacterProfile = z.strictObject({
  id: Slug,
  displayName: z.string().min(1),
  /** a uniform crowd ("The crowd", "Officers") rather than one person */
  isGroup: z.boolean(),
  /** other names the script uses for this character; role phrases ("the boss") are inferred */
  aliases: z.array(SourcedString),
  description: SourcedString.nullable(),
  age: SourcedString.nullable(),
  visualTraits: z.array(SourcedString),
  marker: SourcedString.nullable(),
  defaultMood: SourcedString.nullable(),
  firstAppearanceShot: ShotId.nullable(),
  appearances: z.array(Appearance),
  sourceRefs: z.array(SourceRef).min(1),
});
export type CharacterProfile = z.infer<typeof CharacterProfile>;

/** a set detail the script gives for some of its rows only ("morning for 13") */
export const EnvironmentOverride = z.strictObject({
  shotIds: z.array(ShotId).min(1),
  /** timeOfDay or lighting when the words say so (TIME_OF_DAY / LIGHTING), otherwise look (a colour or grade note) */
  field: z.enum(["timeOfDay", "lighting", "look"]),
  value: z.string().min(1),
  sourceRefs: z.array(SourceRef).min(1),
});
export type EnvironmentOverride = z.infer<typeof EnvironmentOverride>;

export const EnvironmentProfile = z.strictObject({
  id: Slug,
  name: z.string().min(1),
  /** the set's text without its per-row details (those are in overrides) */
  description: SourcedString.nullable(),
  /** only from explicit time-of-day words */
  timeOfDay: SourcedString.nullable(),
  /** only from explicit lighting or time-of-day words ("dark wood" is set description, not lighting) */
  lighting: SourcedString.nullable(),
  overrides: z.array(EnvironmentOverride),
  keyProps: z.array(SourcedString),
  /** "minecraft": the set is a VoxelSet (minecraft/<id>.voxel.json); absent = the painted three.js world */
  environmentType: EnvironmentType.optional(),
  shotsUsedIn: z.array(Appearance),
  sourceRefs: z.array(SourceRef).min(1),
});
export type EnvironmentProfile = z.infer<typeof EnvironmentProfile>;

export const PropProfile = z.strictObject({
  id: Slug,
  name: z.string().min(1),
  /** the character this prop is described with (a marker), if the script says so */
  ownerId: Slug.nullable(),
  appearances: z.array(Appearance),
  sourceRefs: z.array(SourceRef).min(1),
  /** true when the noun was taken to be a prop by inference (the script never lists props) */
  inferred: z.boolean(),
  /**
   * the held prop in the project's library (toon.ts Prop) this prop is drawn with: same name ("exact") or a listed
   * alias in config/prop-aliases.json ("alias", always inferred). null: nothing in the library; it is in the gap report.
   */
  libraryProp: z.strictObject({ name: z.string().min(1), via: z.enum(["exact", "alias"]), inferred: z.boolean(), why: z.string().min(1) }).nullable(),
});
export type PropProfile = z.infer<typeof PropProfile>;

export const CharactersDoc = z.strictObject({ schemaVersion: SchemaVersion, kind: z.literal("Characters"), characters: z.array(CharacterProfile) });
export const EnvironmentsDoc = z.strictObject({ schemaVersion: SchemaVersion, kind: z.literal("Environments"), environments: z.array(EnvironmentProfile) });
export const PropsDoc = z.strictObject({ schemaVersion: SchemaVersion, kind: z.literal("Props"), props: z.array(PropProfile) });
export type CharactersDoc = z.infer<typeof CharactersDoc>;
export type EnvironmentsDoc = z.infer<typeof EnvironmentsDoc>;
export type PropsDoc = z.infer<typeof PropsDoc>;
