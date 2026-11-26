
# Minecraft "What happens if...?" (rule-collision test)

Reference: `melZerry`, "What happens to a loyalty trident after you LEAVE the game???" (31 s, 16.9M views,
373K likes, on a 26K-sub channel, uploaded 2026-07-06). The same channel repeats the format for most of its hits:
fly to the other side of the RING WORLD (4.9M), water builds PRESSURE (4.6M), A Bed Of Two Worlds (2.7M),
sleep in a bed HALF OUTSIDE THE WORLD BORDER (1.5M). Full breakdown + the creator's own notes:
`references/ANALYSIS.md`. Read it once before the first script.

## The formula in one line
**A mechanic everyone knows + the one condition it silently depends on, removed → "what happens?" → test it → the
answer is half expected, half weird.**

Loyalty trident *relies on* the thrower being there to return to. Remove the thrower (leave the game) → nobody knows.
That missing condition is the idea. Not "a cool build", not "a fact": a **collision between a rule and an edge case**.

## Why it works (what the numbers say)
- Stayed-to-watch held **~83-84 %** for the whole push, not only on day one. The hook appeals to *everybody* who has
  touched Minecraft, not just experts. That's why the swipe rate never dropped as reach grew.
- Average view duration ~29 s on a ~31 s video. Nobody leaves before the answer, because the answer is the last line.
- ~30 s was long enough for YouTube to rate it as "more content" while still being nearly fully watched.
- Viewers guess before the reveal, so comments fill up with guesses and "now try X" (a free idea pipeline, credit
  fans in the title like the channel does: "(Thx to @name for the idea)").

## Idea gate (an idea must pass ALL six, or drop it)
1. **Known mechanic.** A 10-year-old player knows what it normally does (trident, ender pearl, bed, totem, elytra,
   mace, shield, tamed wolf, minecart, nether portal, water/lava, TNT, beacon, villager, boat, lead).
2. **One hidden condition, removed.** The mechanic assumes something (owner present, same dimension, chunk loaded,
   inside the border, gravity, daytime, normal tick rate, survival mode, one-at-a-time) and we take *that one* away.
3. **Nobody already knows.** Search YouTube + Reddit for "minecraft [mechanic] [condition]". If a top short already
   answers it, skip it or find a second disruption on top of it.
4. **Two questions fall out of it** (trident: "where does it go?" + "does it still kill?").
5. **Testable in under an hour** (vanilla commands, a second account/LAN client, maybe one well-known mod like
   Pehkui). The result must be *visible* on screen: chat death message, item in hand, block that changed, number.
6. **The answer has a twist.** At least one of the two answers is not what most people would guess. If both
   answers are boring, the short is boring: don't record it, pick another.

Disruption bank to cross with the mechanics above: leave/disconnect, die mid-action, change dimension, world border
(half in/half out), chunk unload / far away, `/tick rate 1` or `/tick freeze`, switch game mode, Peaceful,
sleep/skip night, two at once, stacked x200, giant/tiny (Pehkui), build limit/void, inside another block,
cross-portal, block it off with walls, the owner is the target.

## Script: 6 beats, ~30 s, ~120-130 words (≈4 words/s, fast and continuous, no pauses)
Write beats 1-4 BEFORE recording. Write 5-6 only AFTER the test, from what really happened. Never script a
result you haven't seen. The comments will catch a fake, and versions differ (state Java/Bedrock + version
in the description).

| # | Beat | Time | Words | Job | Template |
|---|---|---|---|---|---|
| 1 | HOOK-Q | 0-4 s | ~22 | Familiar action + the disruption + "what happens?" in the first sentence. No intro, no "hey guys". | "If you **[do known action]** and then **[disruption]**, what will happen to **[target/item]**?" |
| 2 | NORMAL RULE | 4-9 s | ~20 | Say what *normally* happens so every viewer can predict. This is the line that makes the hook universal. | "Because normally, when you [action], it will [result A] and then [result B]." |
| 3 | TWO QUESTIONS | 9-13 s | ~18 | Split it into two open loops; the viewer makes a guess here. | "So what happens if [B can't happen]? And will it still [A]?" |
| 4 | TEST SETUP | 13-18 s | ~20 | How you test it fairly + a trick that makes it visible (slow-mo tick rate, second account, creative). Credibility. | "To test this, I [set tick rate to 1 / used my other account / ...] and [did the action]." |
| 5 | RESULT 1 | 18-25 s | ~25 | Answer the first question with proof on screen (quote the chat/death message exactly). | "After it hit, [what the screen showed]... and the [item] just [did X] until I [next step]," |
| 6 | TWIST + END | 25-30 s | ~15 | The weird answer, as the LAST words. Cut within 0.3 s. No outro, no "subscribe". Ideally the last line flows back into the hook for a loop. | "...to which I found that [twist]." |

Voice rules: first person ("I tested", "my other account"), second person in the hook ("if you..."), casual
connectors ("So,", "Anyways,", "to which I found"), one continuous run (user rule: no pauses). Beats 5→6 can be one
running sentence, which drags the viewer into the reveal.

### Indonesian version of the same beats
1. "Kalau kamu **[aksi]** terus langsung **[gangguan]**, apa yang bakal terjadi sama **[target]**?"
2. "Soalnya biasanya, kalau kamu [aksi], dia bakal [hasil A] terus [hasil B]."
3. "Jadi gimana kalau [B nggak bisa terjadi]? Dan apa dia masih bakal [A]?"
4. "Buat ngetes ini, aku [setup] terus [aksi] ke akun keduaku."
5. "Setelah kena, [bukti di layar]... dan [item]-nya cuma [diam / ...] sampai aku [langkah],"
6. "...dan ternyata [twist]."
Indonesian runs ~10-15 % more syllables: keep it ≤ 115 words and check the 30 s fit by reading it aloud at speed.

## Title + metadata
- Title = the hook as a question, one KEYWORD in caps, triple "???": "What happens to a loyalty trident after you
  LEAVE the game???" / "What if you sleep in a bed HALF OUTSIDE the world border?"
- Description: one plain sentence + edition and version ("Java 1.21.x"). Tags: minecraft, minecraft tips, minecraft
  glitches (the reference used only these three).
- Final mp4 is named by the title, Windows-safe (user rule, `final-named-by-title`).

## Test protocol (record everything, decide later)
1. Fresh flat/void world, Peaceful off, keep inventory off unless that's the test. Note the edition + version.
2. Two players: main + second account (LAN client). Same skin twice reads like "clones" and the creator says that
   two-identical-players framing helped.
3. Slow it down so the moment is readable: `/tick rate 1` (Java) or `/tick freeze` + `/tick step`. Record the
   real-speed version too.
4. Run the test **3 times** (results can be random). Screenshot the chat each time; that chat line is the proof shot.
5. If the answer is boring, try the second disruption from the bank before giving up on the mechanic.

## Shots + edit (from the creator's breakdown)
- Record with **Replay Mod** (Java): fly a camera path over the recorded test afterwards. Cinematic paths are what set
  the channel apart from plain gameplay.
- **Intro: cuts under 1 s each** for the first ~3 s (but not chaos). Open on an *approach* shot moving toward the
  subject ("getting into the video").
- Unusual angles: top-down camera sliding over the bed/player; side-on two-shot of the two players.
- If the script raises a side question ("what if you block it off?"), **show it, then answer it**. Never leave a
  visual question open.
- Fast-forward build timelapses make good hook clips (fast building = instant motion).
- Every line gets its picture at that moment (user rule `word-synced-visuals`). The death message is shown when
  it's said.
- Sound: a "rev"/whoosh hit on the hook + small hits on reveals; one mysterious "what's going to happen?" bed
  track all the way through (the creator names a track they call "I Think I Was There". Check its license before
  use). User rules apply: recorded SFX only, list them first; music +2 dB.

## Handoff to the user's pipeline
- Voice: the user's own voice, or ElevenLabs via `scripts/eleven_voice.py`, only with the user's OK (never spend
  credits unasked).
- Captions: always deliver the green-screen captions clip with the final, using the `captions` skill.
- Model use: draft ideas/scripts on Sonnet; idea gate + twist judgement on Opus if two ideas tie.

## Checklist before you call a script done
- [ ] Hook names the mechanic AND the disruption in the first ~4 s, ending in "?"
- [ ] Normal-rule line present (beat 2)
- [ ] Exactly two questions in beat 3
- [ ] Results written from a real test, edition + version noted
- [ ] Last words = the twist; nothing after it
- [ ] 115-130 words, read aloud ≤ 31 s
- [ ] Title = hook question + 1 CAPS keyword + ???
