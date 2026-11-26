// ScriptAST: the deterministic parse of a SCRIPT.md. Every non-blank line belongs to at least one node;
// lines the parser does not understand become `unknown` nodes and are listed in `unparsed`.
import { z } from "zod";
import { SchemaVersion, LineRange, NodeId, ShotId, Severity } from "./common.ts";

export const NodeType = z.enum([
  "narration", "picture", "animation", "camera", "sound", "edit", "production_note", "character_def", "location_def", "meta", "unknown",
]);
export type NodeType = z.infer<typeof NodeType>;

/** finer label inside a type (null when the type says it all) */
export const NodeSubtype = z.enum([
  // meta
  "title", "logline", "key_values", "fact", "word_count", "logic_check", "section_heading", "table_header",
  "table_separator", "beat_label", "narration_heading", "prose",
  // narration
  "line", "dialogue", "recording_copy",
  // picture (what the Picture column shows, including negative directions)
  "description", "environment_ref", "negative", "fx",
  // camera (lens moves and framing)
  "move", "framing", "shake",
  // sound (kept in the AST, not animated in Phase 1)
  "sfx", "silence",
  // edit (cuts, freezes, flashes, loops; kept in the AST, not animated in Phase 1)
  "cut", "freeze", "flash", "transition",
  // animation
  "action",
  // production notes
  "dramatised", "heading_rule", "note",
  // character_def / location_def
  "entry",
]);
export type NodeSubtype = z.infer<typeof NodeSubtype>;

export const SectionKind = z.enum([
  "preamble", "facts", "characters", "script", "narration_block", "sets", "production_notes", "logic_check", "other",
]);
export type SectionKind = z.infer<typeof SectionKind>;

export const SectionId = z.string().regex(/^sec\d{2}$/);

export const AstNode = z.strictObject({
  id: NodeId,
  type: NodeType,
  subtype: NodeSubtype.nullable(),
  /** exact source text (a full line, a joined multi-line entry, or one clause of a table cell) */
  raw: z.string(),
  /** whitespace-collapsed, markdown emphasis removed */
  text: z.string(),
  sourceLines: LineRange,
  /** 1-based column of `raw` in its first line */
  column: z.int().min(1),
  section: SectionId,
  shot: ShotId.nullable(),
  /** quoted narration phrases this direction is pinned to: (on "axe"), ("a man rides a platform") */
  anchors: z.array(z.string().min(1)),
  /** set when more than one classification rule matched: all candidates, the first node's type first */
  ambiguity: z.strictObject({ candidates: z.array(NodeType).min(2), reason: z.string().min(1) }).nullable(),
  /** a further node made from the same clause (one clause may emit several nodes): the clause's first node */
  facetOf: NodeId.nullable(),
  /** the node's text is a parenthetical inside its clause: "(no outcome shown)" */
  fromParenthetical: z.boolean(),
  /** the clause has no anchor of its own and continues the clause before it (after a spaced dash): anchors taken from there */
  anchorsFrom: NodeId.nullable(),
  /** an edit timed to a sound rather than a word: "cut on the clunk" gives "clunk" */
  soundCue: z.string().min(1).nullable(),
});
export type AstNode = z.infer<typeof AstNode>;

export const Section = z.strictObject({
  id: SectionId,
  kind: SectionKind,
  heading: z.string().nullable(),
  sourceLines: LineRange,
});
export type Section = z.infer<typeof Section>;

export const ShotNode = z.strictObject({
  id: ShotId,
  /** 1-based position of the row in the script table */
  number: z.int().min(1),
  /** the `#` cell as written ("4", "2b") */
  label: z.string(),
  /** the Beat cell */
  beat: z.string(),
  sourceLines: LineRange,
  /** the Narration cell, split into spoken line / quoted dialogue segments */
  narrationNodeIds: z.array(NodeId),
  /** the Narration cell as written (markdown removed, whitespace collapsed) */
  narrationText: z.string(),
  /** picture / animation / camera clause nodes of this row, in reading order */
  directionNodeIds: z.array(NodeId),
});
export type ShotNode = z.infer<typeof ShotNode>;

export const Diagnostic = z.strictObject({
  severity: Severity,
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  message: z.string().min(1),
  line: z.int().min(1),
  column: z.int().min(1),
});
export type Diagnostic = z.infer<typeof Diagnostic>;

export const Unparsed = z.strictObject({ nodeId: NodeId, line: z.int().min(1), text: z.string(), reason: z.string().min(1) });

export const ScriptAST = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("ScriptAST"),
  source: z.strictObject({
    file: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    lineCount: z.int().min(0),
    lineEnding: z.enum(["lf", "crlf", "mixed", "none"]),
    bom: z.boolean(),
  }),
  title: z.string().nullable(),
  /** the script's language: declared in a "Language:" / "Bahasa:" line, else detected from the narration's words */
  language: z.strictObject({
    code: z.enum(["en", "id", "unknown"]),
    source: z.enum(["declared", "detected"]),
    evidence: z.string().min(1),
  }),
  sections: z.array(Section),
  shots: z.array(ShotNode),
  nodes: z.array(AstNode),
  unparsed: z.array(Unparsed),
  diagnostics: z.array(Diagnostic),
});
export type ScriptAST = z.infer<typeof ScriptAST>;
