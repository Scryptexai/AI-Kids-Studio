# Review rubric (cartoon 3D shorts, Minecraft mode first)

The rubric the Mob Farm hook was judged on (r3-r11, 2026-11-13). Use it for every review of a draft clip.

## Reviewer setup
- **Reviewer:** one fresh `general-purpose` reviewer with model `fable`. It has never seen earlier versions and
  judges only what is on screen. It is read-only.
- **Inputs:**
  - the clip and its frame count;
  - a contact sheet (4 fps grid);
  - the narration with the absolute frame of every word onset;
  - the intended picture in 3-6 lines;
  - the house rules below.
- **Frames:** it pulls frames with ffmpeg into the scratchpad and looks at them. It checks densely around the key
  words and at every cut or camera move.
- **Report:** under 900 words.
  - the score table with the average and PASS or FAIL;
  - evidence for each category, with frame numbers;
  - the top 6 fixes, ranked by score impact, each with a frame range and a concrete change.

## Categories (score 0-10, one decimal)
| # | Category | 10 means |
|---|----------|----------|
| 1 | Camera | Fast but smooth, with an expoOut or backOut feel. No jerks, no pops and no sweep through a wall. Hard cuts only where intended. Never static. |
| 2 | Mobs alive | Every mob idles, walks with sway, reacts to the hero and is staggered (never in sync). Spawns land on their words. |
| 3 | Hero acting | Lively and never frozen. Anticipation and overshoot on every move. Expressions read at Shorts size. The face is never covered by a tool or prop. |
| 4 | Word-sync | Each word's picture shows what is said at that moment. Impacts land on their word (±2 frames). No spoilers. |
| 5 | Framing & safe zone | No character cut by the frame (except a deliberate close-up). Heads clear of the Shorts UI: top 8 %, right 16 %, bottom 25 %, left 4 %. Nothing hides behind the set. |
| 6 | Look | Rich and lit, not muddy or black. Readable night. No clipping, no z-fighting, feet on the ground. No title cards and no text. |
| 7 | Hook strength | A viewer would stop scrolling in the first 2 seconds. Frame 0 is already moving and striking. |

## Pass condition
- **Pass:** every category is at least 8.5 (the one threshold, `references/QUALITY_ASSURANCE.md`).
- **Strict:** the reviewer must not inflate. A pass with an open issue in Framing or Word-sync is a fail.

## Scoring scale
- **9.5-10:** broadcast quality. Nothing to fix that a viewer would notice.
- **9.0-9.4:** one small flaw that you only see frame by frame.
- **8.0-8.9:** good, with 1-3 issues a viewer could notice on a second watch.
- **7.0-7.9:** a visible flaw that a casual viewer notices.
- **Below 7:** broken: a cut character, a frozen figure, a camera through a wall, an unreadable face, or a missed key word.

## How many rounds (2026-11-13 rule)
- **New projects** get **one lightweight round on the key scenes only**:
  - which scenes: the hook (the first ~7 s), the payoff, and at most one other scene the user names;
  - who scores: one fable reviewer, using this rubric;
  - what gets fixed: categories below 8.5 get fixed once, from the reviewer's ranked fixes;
  - after that: show the user the table and the clip, with **no re-review loop**.
- **Why one round:** the plans start from the presets (expressions/, acting_presets.json, mob_presets.json,
  camera_recipes.json), which already carry the fixes from the Mob Farm loop. The 11-round loop scored 8.03 at r8,
  7.6 at r10 and 8.49 at r11, so more rounds cost a lot and gave little.
- **The full loop** (a fresh reviewer each round until it passes) runs only when the user asks for it.
- **Lessons:** when a round finds a fix that would help any short, fold it back into the presets and their `notes`,
  so the next plan starts from it.
