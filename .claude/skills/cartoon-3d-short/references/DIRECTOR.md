---
name: cartoon-3d-short-director
description: AI director step - SCRIPT.md to a validated animation plan, preview.md and gap report (plans only; Minecraft sets and motion presets in bible/modes/minecraft.md)
---

# Director Plan (script -> validated animation plan)

Code: `src/director/` in the Remotion project. It plans only: it renders nothing and never edits story.ts.
Minecraft sets (`World: minecraft`) and motion presets (`shots[].presets`) are in `bible/modes/minecraft.md`.
Run it in the **main session** (it is a director decision, not a review; no agent, no subagent).

## When
- After `SCRIPT.md` is approved, before the thumbnail storyboard.
- Again after the voice is recorded: without `stories/<slug>/voice/words.json` every row is timed by WPM, and
  the anchors move once real word times exist.
- Again after any script edit. The draft carries the script's sha256, so an old draft is refused
  (`DRAFT_SCRIPT_CHANGED`).

## Loop (at most 3 drafts, lean mode)
Lean mode saves tokens and gives the same plan. Always pass `--lean`.
1. `npm run director -- plan stories/<slug>/SCRIPT.md --lean`
   Exit 1 with `DIRECTOR_PENDING` is expected the first time.
2. Read `src/director/director/prompt.md` once (including "Lean mode"), then
   `out/director/<slug>/director/request.json`.
3. Write `out/director/<slug>/director/draft.json` lean: leave out default fields, one entry per line, short
   rationales. Use only the script's directions, the vocabulary and the inferred-motion whitelist. Mark every
   inference; never invent a character, prop or event.
4. Rerun step 1.
   - Exit 0: the plan is written.
   - Exit 1 with `feedback.json`: each error names its draft entry (`draft`: `shots.1.events.3`). Edit only those
     entries with the Edit tool, never rewrite the whole draft, then rerun step 1.
   - `DIRECTOR_FAILED` after 2 retries: **STOP and report** the errors to the user. Delete
     `director/attempts.json` only when the user says to start again.
5. Read `out/director/<slug>/review.md`, not preview.md. "To fix or decide" lists errors, warnings, failing
   constraints, unparsed lines and unsupported actions. Each shot has one line per move with its `@"word"`.
   Check that each event lands on the word that causes it. Open `preview.md` only for a shot or constraint you need
   in full (search for `### sNN`, do not read it all). Never read the JSON to review.

Exit codes: 0 = no errors, 1 = errors or pending, 2 = usage or unreadable input.

## What the outputs feed
| Output | Used by |
|--------|---------|
| `review.md` shots (one line per move, `@"word"`) | `THUMBS.md` rows: "viewer must see ___ exactly on ___" (STORYTELLING.md) |
| `animation-plan.json` takes + camera moves | the `PLAN` takes and camera rails in `story.ts`, written by hand |
| `gap-report.json` (🚧 actions) | the pose and clip backlog for step 6 (Characters) |
| `constraints.json` "manual" rows | the sound-off review checklist |

## After story.ts exists
- Add `"<slug>": "src/videos/<name>/story.ts"` to `src/director/config/stories.json`, so `validate` checks the
  plan's takes against the `PLAN` in story.ts.
- `npm run director -- validate out/director/<slug>` is script gate 0 (QUALITY_ASSURANCE.md).
- A hand edit to `animation-plan.json`: run `validate`, then `npm run director -- preview out/director/<slug>`.

## Rules
- Nobody is ever frozen (user rule 2026-11-10, overrides the old "Idles: none"): idle breathing, sway and head tilts are automatic in cast.ts, so the plan never lists them. `src/director/config/inferred-motion.json` says the same (updated 2026-11-13).
- No captions, title cards or text in the picture; a direction that asks for one goes under `skipped` with a reason.
- `out/` is gitignored. Copy `draft.json` next to the story when the plan should be kept.
