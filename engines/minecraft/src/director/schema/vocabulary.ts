// Action Vocabulary: what the real project can perform, each entry pointing at the code that does it.
import { z } from "zod";
import { SchemaVersion } from "./common.ts";

export const ParamSpec = z.strictObject({
  type: z.enum(["number", "integer", "string", "boolean", "enum", "vec3"]),
  enum: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  required: z.boolean(),
  description: z.string().optional(),
});
export type ParamSpec = z.infer<typeof ParamSpec>;

export const VocabEntry = z.strictObject({
  id: z.string().regex(/^[a-z]+(\.[a-z0-9_]+)+$/),
  channel: z.enum(["body", "face", "gaze", "object", "physics", "fx", "camera"]),
  /** "<file>#<symbol>" in the scanned source, or "none" */
  implementedBy: z.string().min(1),
  params: z.record(z.string(), ParamSpec),
  /** skill style rules: ok, restricted (limited use), forbidden */
  style: z.enum(["ok", "restricted", "forbidden"]),
  styleNote: z.string().nullable(),
  description: z.string().min(1),
  /** "global": from templates/rail/, usable by any story. "story-specific": exists only in one story's fork */
  scope: z.enum(["global", "story-specific"]),
  /** the story slug when scope is "story-specific", else null */
  story: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).nullable(),
}).refine((e) => (e.scope === "story-specific") === (e.story !== null), { message: "story is set exactly when scope is story-specific", path: ["story"] });
export type VocabEntry = z.infer<typeof VocabEntry>;

export const VocabularyDoc = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("Vocabulary"),
  sources: z.array(z.strictObject({ file: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  entries: z.array(VocabEntry),
});
export type VocabularyDoc = z.infer<typeof VocabularyDoc>;
