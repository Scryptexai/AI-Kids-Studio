// Production constraints: every note is either a machine-checkable rule or `manual_review`.
import { z } from "zod";
import { SchemaVersion, ShotId, SourceRef } from "./common.ts";

export const ConstraintKind = z.enum(["visibility_window", "spoiler_guard", "forbidden_element", "ordering", "style", "override", "other"]);
export type ConstraintKind = z.infer<typeof ConstraintKind>;

/** a subject (character, prop or environment id) must not be seen before a shot or a narration word */
const VisibilityWindow = z.strictObject({
  kind: z.literal("visibility_window"),
  subject: z.string().min(1),
  notBeforeShot: ShotId.nullable(),
  /** finer than a shot: not before this phrase is spoken in that shot */
  notBeforeWord: z.strictObject({ shotId: ShotId, phrase: z.string().min(1) }).nullable(),
  notAfterShot: ShotId.nullable(),
});
/** a subject may be on screen, but no event may animate it (it is "not shown working") before a shot or word */
const ActionWindow = z.strictObject({
  kind: z.literal("action_window"),
  subject: z.string().min(1),
  notBeforeShot: ShotId.nullable(),
  notBeforeWord: z.strictObject({ shotId: ShotId, phrase: z.string().min(1) }).nullable(),
});
/** something that must never be on screen (or, for narration_term, never said) */
const ForbiddenElement = z.strictObject({
  kind: z.literal("forbidden_element"),
  element: z.enum(["title_card", "caption", "text_overlay", "on_screen_label", "narration_term"]),
  scope: z.enum(["picture", "narration", "all"]),
});
/** vocabulary actions that must not be used (e.g. handheld float) */
const ForbiddenAction = z.strictObject({ kind: z.literal("forbidden_action"), actions: z.array(z.string().min(1)).min(1) });
/** how shots join: between sets, or inside one set */
const Transition = z.strictObject({
  kind: z.literal("transition"),
  between: z.enum(["sets", "same_set"]),
  style: z.enum(["dissolve", "dip_to_black", "hard_cut"]),
  frames: z.int().min(0).nullable(),
  forbidStyles: z.array(z.enum(["dissolve", "dip_to_black", "hard_cut"])),
});
/** the voice pauses before a phrase */
const PauseBefore = z.strictObject({ kind: z.literal("pause_before"), shotId: ShotId, phrase: z.string().min(1), minSec: z.number().min(0).nullable() });
/** the picture freezes on a word: no event may start after the frame that word is spoken, and motion already under way
 *  may settle for at most `settleFrames` frames after it (story.ts's hit curves overshoot and settle) */
const FreezeAt = z.strictObject({ kind: z.literal("freeze_at"), shotId: ShotId, phrase: z.string().min(1), settleFrames: z.int().min(0) });
/** no impact anywhere in the shot: no strike landing, burst, flash, kick or cut (config/impact-actions.json) */
const NoImpact = z.strictObject({ kind: z.literal("no_impact"), shotId: ShotId });
/** a term the narration must never say (case-insensitive, whole words) */
const UnsaidTerm = z.strictObject({ kind: z.literal("unsaid_term"), term: z.string().min(1) });
/** the story's own script lifts one of the user's standing rules for this story only; `allows` lists what it permits
 *  (for no_title_cards: the card texts, e.g. "MALAM", "09.00"); empty = all of that kind */
const StandingOverride = z.strictObject({ kind: z.literal("standing_override"), standingRule: z.enum(["no_title_cards"]), allows: z.array(z.string().min(1)) });
/** event `first` must happen before event `then` (subjects or action ids) */
const Ordering = z.strictObject({ kind: z.literal("ordering"), first: z.string().min(1), then: z.string().min(1) });

export const Rule = z.discriminatedUnion("kind", [VisibilityWindow, ActionWindow, ForbiddenElement, ForbiddenAction, Transition, PauseBefore, Ordering, FreezeAt, NoImpact, UnsaidTerm, StandingOverride]);
export type Rule = z.infer<typeof Rule>;

export const Constraint = z
  .strictObject({
    id: z.string().regex(/^c\d{2,}$/),
    text: z.string().min(1),
    sourceRefs: z.array(SourceRef).min(1),
    /** the row a shot-level constraint comes from (a parenthetical negative in its Picture cell); null for notes */
    shotId: ShotId.nullable(),
    kind: ConstraintKind,
    rule: Rule.nullable(),
    enforcement: z.enum(["rule", "manual_review"]),
  })
  .refine((c) => (c.enforcement === "rule") === (c.rule !== null), {
    message: "enforcement must be 'rule' exactly when a rule is given",
    path: ["enforcement"],
  });
export type Constraint = z.infer<typeof Constraint>;

export const ConstraintsDoc = z.strictObject({ schemaVersion: SchemaVersion, kind: z.literal("Constraints"), constraints: z.array(Constraint) });
export type ConstraintsDoc = z.infer<typeof ConstraintsDoc>;
