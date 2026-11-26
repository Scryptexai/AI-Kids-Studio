---
name: minecraft-shorts
description: Write ~30-60 s Minecraft short scripts (narration EN + ID, in-game test list, footage prep; the user records and voices them) for the user's Minecraft channel with two proven script formulas. (1) "What happens if...?" rule-collision test (melZerry loyalty-trident short, 16.9M views): a known mechanic, the one condition it relies on removed, two questions, test on camera, twist ending. (2) Formula C "How you built X" evolution ladder: a primitive build that one mob keeps beating, rung by rung, until it becomes a known build (mob farm, iron farm, ice highway), ending "Congratulations, you have built a ___". Covers idea mining + novelty check, EN + ID narration, in-game test protocol with fallback lines, Replay Mod shot list, titles. Use when the user asks for a Minecraft short/idea/script, "formula minecraft", "what happens if minecraft", "formula trident", "formula C minecraft", "how you invented minecraft", or "minecraft ladder".
---

# Minecraft shorts

Two formulas. Pick by what the user asks for. If unsure, offer one idea of each.

| Formula | When | File |
|---|---|---|
| **What-if** (rule-collision test) | a single surprising game behaviour you can test in an hour | `references/formula-what-if.md` |
| **Ladder** (Formula C "How you built X") | a known build that can be shown growing in 4-6 stages | `references/formula-ladder.md` |

Reference analysis (the trident short + its creator's own breakdown + channel hits): `references/ANALYSIS.md`.

## How they differ
- What-if is **high-variance**: the same channel ranges from 559 to 16.9M views. A hit needs an answer nobody
  expected, so it's a lottery ticket per idea. Cheap to make (one test, ~30 s).
- Ladder is **steadier**: retention comes from the build changing every few seconds and from a struggle every player
  knows. It needs more recording (one build in 5-6 stages) and every rung must be a true game rule.
- A healthy channel mixes both. The ladder is the base, and a what-if goes out whenever a strong twist turns up.

## Scope: script only (user decision 2026-11-12)
The user records the footage and does the voice-over by hand. Claude delivers ONE `SCRIPT.md` per short with:
0. **Full narration** at the top: one EN and one ID ```text block with the whole narration as continuous text
   (no [T] markers), generated from the table so the user can copy it in one go for the voice-over.
1. **Narration table:** # · EN · ID · picture on the word. Lines that depend on the game are marked [T1]...
2. **Test table:** what to test, the expected result (with source), and the ready alternative line (EN + ID) if the
   game shows something else. The user tests first; the script then follows what really happens in-game.
3. **Footage prep:** setup + commands, location, builds in order (stages), shot list (record / camera / notes),
   overlays (numbers and icons only), and a done-checklist.
No voice generation, captions or render steps unless the user asks. Info is straight to the point; the script itself
keeps curiosity going (every fix → a new "But/Except", false reliefs, numbers answered one line later, a running gag).
Length 30-60 s (longer is fine if the ladder needs it).

## Two languages: every short in English AND Indonesian (user decision 2026-11-12)
- **One picture edit, two voice-overs.** Record and cut once, timed to the EN VO, then fit the ID VO to the same beats.
- Write EN first, then ID per beat. Keep ID at **≤ ~1.3× the EN syllables per beat** (Indonesian is spoken faster in
  syllables/s, so 1.3× lands at about the same length). Tighten any ID line above that. Check with a quick syllable
  count, then by reading both aloud.
- ID register: casual gamer Indonesian (kamu, nggak, bikin, ngejar). Keep the community's English game terms
  (spawning floor, mob farm, XP, creeper, villager); don't translate them.
- **No words in the picture.** On-screen overlays are numbers/icons only (block counters, hearts), so one edit works
  for both. Chat/death messages are the game's own text, and they stay as recorded.
- Each language gets its own title (EN title + ID title written together).
- If a joke only works in one language, find an equal one for the other (same beat length), don't translate it word for word.

## Shared rules (both formulas)
- **Test in-game before the script is final.** Note edition + version. Never script a result you haven't seen.
- Novelty check: search YouTube (`python -m yt_dlp --flat-playlist --print "%(view_count)s | %(title)s"
  "ytsearch8:minecraft <idea>"`) and drop ideas already done with big views.
- Every line's picture lands on its word; intro cuts < 1 s; Replay Mod camera paths; two identical skins when two players are needed.
- Narration flows with no pauses (the user records the VO by hand).
- Edit notes only if asked: recorded SFX only, one intrigue music bed (license checked), final named by the title.
- Ideas and scripts live in `stories/minecraft-what-if/` (what-if) and `stories/minecraft-ladder/` (ladder).
