// Shot timing, from real voice word timestamps when they exist, otherwise from a words-per-minute estimate.
import { z } from "zod";
import { SchemaVersion, ShotId, NodeId, Fps, spanShape } from "./common.ts";

export const TimingConfig = z.strictObject({
  fps: Fps,
  /** words per minute for the estimate (fallback only) */
  wpm: z.number().positive(),
  /** silence after a row's narration: between estimated rows, and after the last word of the voice */
  paddingSec: z.number().min(0),
  minShotSec: z.number().min(0),
  /** the picture leads its word by this many frames (story.ts LEADF) */
  leadFrames: z.int().min(0),
  /** allowed |sum of shots - total| in seconds */
  toleranceSec: z.number().min(0),
});
export type TimingConfig = z.infer<typeof TimingConfig>;

export const TimedWord = z.strictObject({ w: z.string().min(1), ...spanShape });
export type TimedWord = z.infer<typeof TimedWord>;

/** a time in the voice: seconds and the frame it rounds to (frame = round(sec x fps)) */
const At = z.strictObject({ sec: z.number().min(0), frame: z.int().min(0) });

/**
 * an `on "word"` cue of a picture clause, resolved against the row's words. Never guessed: a phrase that is not in the
 * row, or is in it more than once, is left unresolved with the candidates listed.
 */
export const AnchorTiming = z.strictObject({
  nodeId: NodeId,
  phrase: z.string().min(1),
  status: z.enum(["resolved", "not_found", "repeated", "no_timing"]),
  /** first word start and last word end of the phrase */
  start: At.nullable(),
  end: At.nullable(),
  /** the frame the picture lands: start.frame - leadFrames (story.ts L()) */
  pictureFrame: z.int().min(0).nullable(),
  /** for not_found: row words that look alike; for repeated: every occurrence */
  candidates: z.array(z.strictObject({ words: z.string().min(1), start: At })),
  /** set when the time comes from the mix's cue sheet (a sound nobody says) instead of words.json; then a sound
   *  cue's not_found candidates are the cue sheet's sounds inside the row */
  timedBy: z.enum(["cue_sheet"]).optional(),
});
export type AnchorTiming = z.infer<typeof AnchorTiming>;

export const ShotTiming = z.strictObject({
  shotId: ShotId,
  ...spanShape,
  durationSec: z.number().min(0),
  durationFrames: z.int().min(0),
  /** words.json words of this row, or the script's narration words for an estimated row */
  wordCount: z.int().min(0),
  /** where this row's times come from; an estimated row says why */
  source: z.enum(["words_json", "wpm_estimate"]),
  fallbackReason: z.string().min(1).nullable(),
  /** absolute times; empty for an estimated row */
  words: z.array(TimedWord),
  anchors: z.array(AnchorTiming),
});
export type ShotTiming = z.infer<typeof ShotTiming>;

export const TimingDoc = z.strictObject({
  schemaVersion: SchemaVersion,
  kind: z.literal("Timing"),
  source: z.enum(["words_json", "wpm_estimate", "mixed"]),
  sourceFile: z.string().nullable(),
  /** the mix's sound cue sheet, when one was read: it times sound cues nobody says ("cut on the clunk") */
  sfxCueFile: z.string().nullable().optional(),
  config: TimingConfig,
  shots: z.array(ShotTiming),
  totalSec: z.number().min(0),
  totalFrames: z.int().min(0),
});
export type TimingDoc = z.infer<typeof TimingDoc>;
