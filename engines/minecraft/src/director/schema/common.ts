// Shared building blocks for every director document. Every top-level document carries `schemaVersion`.
import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0" as const;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

/** [startLine, endLine], 1-based, inclusive */
export const LineRange = z
  .tuple([z.int().min(1), z.int().min(1)])
  .refine(([a, b]) => a <= b, { message: "start line must be <= end line" });
export type LineRange = z.infer<typeof LineRange>;

/** script row id: s01, s02, ... (row "#" of the Script table, zero-padded) */
export const ShotId = z.string().regex(/^s\d{2,}$/, "shot ids look like s01");
/**
 * AST node id: n0058 (a whole line, by first line number), n0058.2 (clause 2 of a cell on line 58), or n0058.2b (a
 * second node made from that same clause: one clause may be an edit and a constraint, or a sound and an fx)
 */
export const NodeId = z.string().regex(/^n\d{4}(\.\d+[b-z]?)?$/, "node ids look like n0058, n0058.2 or n0058.2b");
/** stable kebab-case slug: characters, environments, props */
export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "ids are kebab-case slugs");

/** points back into the script: which file, which lines, which AST node */
export const SourceRef = z.strictObject({
  file: z.string().min(1),
  lines: LineRange,
  nodeId: NodeId.optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** a profile field: its value, where the script says it, and whether it was inferred rather than stated */
export const sourced = <T extends z.ZodType>(value: T) =>
  z.strictObject({ value, sourceRefs: z.array(SourceRef).min(1), inferred: z.boolean() });
export const SourcedString = sourced(z.string().min(1));
export type SourcedString = z.infer<typeof SourcedString>;

export const Severity = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof Severity>;

export const Fps = z.int().min(1).max(240);
/** seconds and frames of a time span; frames use the story.ts convention: start inclusive, end exclusive */
export const spanShape = {
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  startFrame: z.int().min(0),
  endFrame: z.int().min(0),
};
