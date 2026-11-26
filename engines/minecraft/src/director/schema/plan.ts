// AnimationPlan: per shot, the coordinated body/face/gaze/object/fx events and camera directives.
// Event and camera times are relative to the shot start; shot times are absolute.
import { z } from "zod";
import { SchemaVersion, ShotId, Slug, SourceRef, NodeId, Fps, spanShape } from "./common.ts";

export const Channel = z.enum(["body", "face", "gaze", "object", "physics", "fx"]);
export type Channel = z.infer<typeof Channel>;
export const Easing = z.enum(["linear", "smooth", "glide", "hit", "ease_out", "step"]);

/** a vocabulary id, or "unsupported:<name>" for an action the project cannot perform yet */
export const ActionId = z.string().regex(/^(unsupported:[a-z0-9_.-]+|[a-z]+(\.[a-z0-9_]+)+)$/, "a vocabulary id like face.expr or unsupported:<name>");

export const Target = z.strictObject({
  kind: z.enum(["character", "prop", "environment"]),
  /** character or prop id; null for the environment as a whole */
  id: Slug.nullable(),
});
export type Target = z.infer<typeof Target>;

/** the narration phrase an event or move lands on (k-th occurrence in the shot's narration) */
export const Anchor = z.strictObject({ phrase: z.string().min(1), occurrence: z.int().min(1) });

const eventCore = {
  id: z.string().regex(/^s\d{2,}-(ev|cam)\d{2,}$/),
  ...spanShape,
  anchor: Anchor.nullable(),
  params: z.record(z.string(), z.unknown()),
  sourceRefs: z.array(SourceRef),
  inferred: z.boolean(),
  rationale: z.string().min(1).max(240),
};

export const AnimationEvent = z.strictObject({
  ...eventCore,
  target: Target,
  channel: Channel,
  action: ActionId,
  easing: Easing,
  intensity: z.number().min(0).max(1),
});
export type AnimationEvent = z.infer<typeof AnimationEvent>;

export const CameraDirective = z.strictObject({
  ...eventCore,
  shotType: z.enum(["wide", "medium", "close", "extreme_close", "ots", "pov", "insert"]),
  movement: z.enum(["static", "dolly", "truck", "pan", "tilt", "orbit", "push_in", "pull_out", "handheld", "shake"]),
  subject: Target.nullable(),
  /** the vocabulary entry that performs this move (camera.rail, camera.kick, ...) or unsupported:<name> */
  action: ActionId,
});
export type CameraDirective = z.infer<typeof CameraDirective>;

export const ContinuityState = z.strictObject({
  characterId: Slug,
  zone: z.string().nullable(),
  heldProps: z.array(Slug),
  emotion: z.string().nullable(),
  facing: z.enum(["camera", "left", "right", "away"]).nullable(),
});
export type ContinuityState = z.infer<typeof ContinuityState>;

export const Skipped = z.strictObject({ nodeId: NodeId, reason: z.string().min(1) });

export const ShotPlan = z.strictObject({
  shotId: ShotId,
  /** the story.ts flying take this row belongs to (one per set/time), if known */
  take: z.string().nullable(),
  ...spanShape,
  environmentId: Slug.nullable(),
  charactersPresent: z.array(Slug),
  narrationText: z.string(),
  cameraDirectives: z.array(CameraDirective),
  animationEvents: z.array(AnimationEvent),
  /** per character present, at the end of the shot */
  continuityState: z.array(ContinuityState),
  /** direction nodes deliberately not turned into events */
  skipped: z.array(Skipped),
});
export type ShotPlan = z.infer<typeof ShotPlan>;

export const AnimationPlan = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("AnimationPlan"),
  script: z.strictObject({ file: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  fps: Fps,
  generatedBy: z.strictObject({ backend: z.string().min(1), model: z.string().nullable() }),
  shots: z.array(ShotPlan),
});
export type AnimationPlan = z.infer<typeof AnimationPlan>;
