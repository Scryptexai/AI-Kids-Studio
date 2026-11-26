// Single source of truth for every director document: zod schemas, TS types, and the JSON Schema export.
import { z } from "zod";
import { ScriptAST } from "./ast.ts";
import { CharactersDoc, EnvironmentsDoc, PropsDoc } from "./profiles.ts";
import { ConstraintsDoc } from "./constraints.ts";
import { TimingDoc } from "./timing.ts";
import { AnimationPlan } from "./plan.ts";
import { VocabularyDoc } from "./vocabulary.ts";
import { ValidationReport, GapReport } from "./report.ts";
import { DirectorDraft } from "./draft.ts";
import { VoxelSet } from "./minecraft.ts";

export * from "./common.ts";
export * from "./ast.ts";
export * from "./profiles.ts";
export * from "./constraints.ts";
export * from "./timing.ts";
export * from "./plan.ts";
export * from "./vocabulary.ts";
export * from "./report.ts";
export * from "./draft.ts";
export * from "./minecraft.ts";

/** every top-level output: its schema and its file name in out/director/<slug>/ */
export const DOCUMENTS = {
  ScriptAST: { schema: ScriptAST, file: "script-ast.json" },
  Characters: { schema: CharactersDoc, file: "characters.json" },
  Environments: { schema: EnvironmentsDoc, file: "environments.json" },
  Props: { schema: PropsDoc, file: "props.json" },
  Constraints: { schema: ConstraintsDoc, file: "constraints.json" },
  Timing: { schema: TimingDoc, file: "timing.json" },
  AnimationPlan: { schema: AnimationPlan, file: "animation-plan.json" },
  Vocabulary: { schema: VocabularyDoc, file: "vocabulary.json" },
  ValidationReport: { schema: ValidationReport, file: "validation-report.json" },
  GapReport: { schema: GapReport, file: "gap-report.json" },
  /** written by the AI step (skill backend), not by the pipeline */
  DirectorDraft: { schema: DirectorDraft, file: "director/draft.json" },
  /** Minecraft mode: one per set, minecraft/<environment id>.voxel.json (the file name below is the pattern) */
  VoxelSet: { schema: VoxelSet, file: "minecraft/<set>.voxel.json" },
} as const;
export type DocumentKind = keyof typeof DOCUMENTS;

/** JSON Schema (draft 2020-12) for each document, keyed by kind; stable key order */
export const jsonSchemas = (): Record<DocumentKind, unknown> =>
  Object.fromEntries(
    (Object.keys(DOCUMENTS) as DocumentKind[]).sort().map((k) => [k, z.toJSONSchema(DOCUMENTS[k].schema, { io: "input", unrepresentable: "any" })]),
  ) as Record<DocumentKind, unknown>;

/** stable JSON text: 2-space indent, LF, trailing newline (outputs must be byte-identical across runs) */
export const stableJson = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
