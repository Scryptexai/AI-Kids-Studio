---
name: cartoon-3d-short-storytelling
description: Script structure, Formula B, and narrative rules for cartoon 3D shorts
---

# Storytelling & Script Structure

## Beat Formula (from Bridge short)
~3.7 words/s, 55-70 s. Formula:

1. **Hook** — absurd fact in one line ("Seventy-four soldiers knocked down an iron bridge just by walking across it.")
2. **Setting** — year, place, pride
3. **Action** — escalation over 3-4 beats, each bigger
4. **Snap** — the moment it breaks
5. **Deadpan double line** — "Luckily ... / Unluckily ..."
6. **Explanation** — one physics idea through everyday analogy (kid on a swing)
7. **Consequence** — the rule it created
8. **Callback twist** — the ending

**Never describe on screen what the viewer already sees.**

---

## Formula B: "Weird Choice That Was Right"
(From 22M-view railroad/thermal-expansion short, 2026-11-06; full breakdown in `references/formula-weird-choice.md`)
~3 words/s, 170-200 words, 60-66 s.

1. **Weird act hook** (0-3 s): protagonist does something that looks destructive, with specific number
2. **Context, stakes, danger** (3-11 s): binary race ("whoever finishes first gets everything") + physical danger planted for climax
3. **Mocked** (11-21 s): youngest/weakest character; authority explodes with quotable line; protagonist refuses to change. **Never explain why.**
4. **Loses first** (21-36 s): rival's "perfect" way wins; side-by-side sensory contrast; catchy mocking nickname; public switches sides
5. **Something weird happens** (36-47 s): natural cause arrives; 2-step measurable proof with everyday objects (coin, then paper); authority misreads it (dramatic irony)
6. **Meanwhile** (47-54 s): parallel cut to rival; threat personified with sound
7. **Climax and cut** (54-65 s): superlative ("hottest day anyone can remember"); quick shot of protagonist vindicated; rival's disaster with simile; **end mid-impact, no outro** (loops)

**Rules:**
- Never name the science term (viewers name it in comments)
- Every sentence = one shot
- Only 2 dialogue lines, both from the wrong authority
- Camera deltas: `references/motion-camera.md` §5

---

## Formula C: "How You Invented X" (evolution ladder)
(From two ~14M-view shorts, 2026-11-12; full breakdown in `references/formula-evolution-ladder.md`)
~3 words/s, 160-200 words, 55-65 s (or ~100 words for 30-35 s).

1. **Hook** (0-3 s): "If you [primitive act] to [goal], you have a [primitive name]." Second person, no names or dates
2. **Rungs** ×4-7 (5-8 s each): "But [force beats it, visibly]. So you [verb + material + where]. This is a [name]."
3. **Twist rung**: "That [feature] isn't [odd] by mistake." The hidden reason, in one line
4. **Cosy tag**: a list of three, the last one funny (a researched real fact)
5. **Payoff**: "Congratulations, you have built a [object]." Matches the title, so it loops

**Rules:**
- Alternate So / But / Except, never "and then"
- One antagonist for the whole ladder; each attack is cleverer than the last
- Every failure is physical and drawable; every fix is a verb + material + placement
- One set that grows (staged props on word times); a pull-back to the finished object at the end

---

## Script File Requirements
- `SCRIPT.md`: facts with sources at top, then script
- `sources.md` (MANDATORY, added 2026-11-16): one row per factual claim in the script (dates, numbers, names, cause
  and effect, every joke fact): `claim | source title | link | what the source says`. At least one source the user can
  open; two for the hook and the twist. A claim with no row gets cut or rewritten. No number, date or name appears on
  screen (props, signs, paper) unless it is in sources.md. The user checks the sources before the voice is made.
- `words.json`: word timings from voice.wav (any STT with word times)
- Hand-fix word timings — everything timed to words.json
- Put in project folder (e.g., `<project>/voice/`)

---

## Thumbnail Storyboard (MANDATORY, before any 3D)
Start from `out/director/<slug>/review.md` (see `references/DIRECTOR.md`): each shot there gives the phrase,
the events anchored on its words (`@"word"`) and the camera moves. Copy, do not invent; a 🚧 action still needs a pose.
Write `out/<name>/THUMBS.md`: one row per narration phrase:
- phrase + key word
- "viewer must see ___ exactly on ___"
- subject
- shot size (wide / MS / CU / insert)
- camera angle and move
- action
- light (day / golden / night / flashback amber)

Draw Canvas2D thumbnails: grey boxes for set, coloured silhouettes for characters, arrow for camera move.
Make contact sheet: `python scripts/contact_sheet.py`

**Tests:**
- Small-size: view at ~200 px wide — silhouette & action must read
- Contrast: no two consecutive shots with same size/angle/brightness
- Colour script: dominant colour per act here, not at the end

**STOP** and send to user for approval. Only then build sets/characters.
3D storyboard gate (8.5) checks build against approved thumbnails.

---

## Colour Script (set in shot plan, not at the end)
- Night = deep blue/violet
- Flashback/secret = warm candle-lit amber with darker edge (reads as "memory")
- Resolution/last beat = golden lift (late ZoomBlur `warm`/`gold` uniforms in Bridge.tsx)