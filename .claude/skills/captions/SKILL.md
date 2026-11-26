---
name: captions
description: Make word-synced captions for a short as a SEPARATE green-screen clip (plus optional ProRes 4444 alpha) for After Effects - white uppercase text, black outline, hard drop shadow, 2-3 words at a time, centred low on the frame, kept clear of the YouTube Shorts UI, timed to the narration voice. Use when the user asks for captions, subtitles, "caption greenscreen", "teks ikut suara", or "captions skill" for any short.
---

# Captions (green screen, voice-synced, Shorts-safe)

The user edits captions further in After Effects, so captions are NEVER burned into the film. Deliver a separate
clip on pure green (#00FF00), same size, fps and frame count as the film, which they key with Keylight.

## Look (agreed 2026-11-11, from the user's "LOCKED" reference frame)
- Position: centred horizontally; the middle of the capitals at **71.5 % of the frame height** (under the
  character's chest). The middle of the capitals is the anchor, so a comma or a Q never moves a caption.
- White, UPPERCASE, Arial Black, **3.2 % of frame height** (82 px at 2560). It was 4 % at first, and the user
  asked for smaller so the Shorts UI never covers it. Black outline; **hard** black drop shadow down-right.
  The shadow is solid on purpose: a blurred/semi-transparent shadow keys into a green-grey fringe.
- **Punctuation is kept** as in the script (MONA LISA. / PARIS, / 1911.). The user asked for it.
  `--strip-punct` removes trailing . , ; :
- **2-3 words max** per caption. A caption never crosses a sentence/comma or a pause in the voice, never ends on
  a glue word (the, of, with, yang, di, dengan ...), never splits a name (Mona | Lisa), avoids lone single words.
- Each caption appears on the frame its first word is spoken (a 5-frame pop 0.85 -> 1.06 -> 1) and holds until the
  next one. After a pause in the voice it leaves 0.25 s after its last word.

## YouTube Shorts safe zone (must hold for every caption, at the pop's 1.06 peak)
Conservative overlay areas:
- action buttons: right 16 % of the width
- title/channel/music: bottom 25 % of the height
- top bar: top 8 % of the height

The script measures every caption's ink, prints `WARNING outside the Shorts safe zone: <text>` for any that cross a
zone, and prints the reach (should be about "83.8 % of width, 69.8-74.0 % of height"). Chunks are split so they fit
`--max-width 0.68`. A single long word is shrunk to fit. Never deliver with a WARNING: lower `--size`, or raise
`--y` a little.

## Model (token saving, approved 2026-11-12)
Run captions on **Haiku 5.5** (remotion-renderer agent with `model: "haiku"`, or a Haiku session): the script does the
timing, splitting and safe-zone checks and prints them as text. Sonnet only to judge a new caption look; Opus only to
change `scripts/captions.py` logic.

## Steps
1. Word timings: the short's `stories/<slug>/voice/words.json`. It is made by `scripts/words_from_voice.py`
   (faster-whisper aligned to the script's spelling). If it is missing, make it first:
   `python scripts/words_from_voice.py <voice.wav> <SCRIPT.md> <words.json> [en|id]`.
   The times must match the film's audio (the final's voice starts at 0 s).
2. Test span first (the user wants to SEE a short test before a full render):
   ```
   python scripts/captions.py stories/<slug>/voice/words.json out/<slug>/captions --start 0 --dur 10 \
     --preview "out/<slug>/final/<Title>.mp4" --alpha
   ```
   It prints every caption with its times and the safe-zone check, and writes:
   - `captions_green.mp4`
   - `captions_alpha.mov`
   - `captions.json`
   - `captions_preview.mp4` (film + keyed captions + sound, for checking only)
3. Check:
   - Pull frames of the widest captions from the preview with the Shorts zones drawn in red (ffmpeg `drawbox`:
     x=iw*0.84 from y=ih*0.45, y=ih*0.75 to the bottom, the top ih*0.08), `hstack` them into one sheet, and look.
   - Look at one full-res crop for green fringe.
   - Send the user `captions_preview.mp4`, `captions_green.mp4` and the printed caption list.
4. After the user's OK, render full length with `--dur <film frames / fps>` so the clip has exactly the film's frame
   count (check with `ffprobe -count_packets`).

## Knobs (scripts/captions.py)
- `--y 0.715`: position
- `--size 0.032`: font size
- `--max-width 0.68`: widest caption
- `--font <ttf>`
- `--max-words 3`
- `--gap 0.30`: pause that breaks a phrase
- `--hold 0.25`
- `--lead 0`: frames early
- `--no-pop`
- `--lower`: keep case
- `--strip-punct`
- `--key-color FFD21F`: the script's KEY WORDS (CAPS in words.json) in yellow, the rest white (mc-cobblegen 2026-11-24, user choice)
- `--alpha`: ProRes 4444
- `--keep "the snail hole"` (repeatable): never split this phrase across captions; a 4-word caption is allowed only for it and must still fit `--max-width`. Read the full caption list after every full render and fix names or phrases that got split. If a breath of just over 0.30 s splits a phrase, raise `--gap` to 0.35.

## AE notes for the user
- **Green clip:** use Keylight with Screen Colour = pure green. It is yuv444 crf 8, so edges stay clean.
- **Alpha .mov:** needs no key at all (drop it on top). With `--key-color` prefer it: a green despill (Keylight too) pushes yellow toward orange; the preview then uses the alpha clip.
- **captions.json:** lists each caption's text and in/out seconds, for rebuilding them as text layers.
