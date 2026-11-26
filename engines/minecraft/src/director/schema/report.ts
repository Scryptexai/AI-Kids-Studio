// Validation report and gap report.
import { z } from "zod";
import { SchemaVersion, Severity, ShotId, NodeId, LineRange } from "./common.ts";

export const IssueLocation = z.strictObject({
  document: z.string().optional(),
  /** JSON path inside the document, e.g. shots[3].animationEvents[1].action */
  path: z.string().optional(),
  shotId: ShotId.optional(),
  eventId: z.string().optional(),
  nodeId: NodeId.optional(),
  sourceLines: LineRange.optional(),
});

export const Issue = z.strictObject({
  severity: Severity,
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  message: z.string().min(1),
  location: IssueLocation,
});
export type Issue = z.infer<typeof Issue>;

export const ValidationReport = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("ValidationReport"),
  summary: z.strictObject({ errors: z.int().min(0), warnings: z.int().min(0), info: z.int().min(0) }),
  issues: z.array(Issue),
});
export type ValidationReport = z.infer<typeof ValidationReport>;

export const GapReport = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("GapReport"),
  unsupported: z.array(
    z.strictObject({
      action: z.string().regex(/^unsupported:/),
      channel: z.string().min(1),
      count: z.int().min(1),
      shotIds: z.array(ShotId),
      eventIds: z.array(z.string()),
    }),
  ),
  /** props the script has that the held-prop library does not draw: Phase 2 assets, never planned as if they existed */
  unmappedProps: z.array(z.strictObject({ propId: z.string().min(1), name: z.string().min(1), shotIds: z.array(ShotId) })),
});
export type GapReport = z.infer<typeof GapReport>;
