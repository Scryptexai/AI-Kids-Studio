---
name: cartoon-3d-short-audio
description: Voice, SFX, music, and audio mix for cartoon 3D shorts
---

# Audio Production

User rules for the mix, SFX and language are in SKILL.md; this file holds the how.

## Core Files (`templates/audio/ (copied into the project)`)
- `timeline.py` — event table
- `sfx_gen.py` — SFX event helpers (template copy: `templates/audio/`; `door_yank` + `effort` for a locked-door pull, timed to rail `tugAt().yanks`). **Only as timing and level scaffolding**: the sound itself is a free recording (see Rules)
- `sfx.py` — SFX placement
- `music.py` — original score (procedural music is fine)
- `instruments.py` — instrument definitions
- `dsp.py` — DSP utilities
- `mix.py` — final mix

---

## Standard Mix
Music +3 dB, SFX −6 dB, voice unchanged (one standard, set in SKILL.md; no per-short bumps).

---

## Output
- `mix.wav` — 48 kHz, exact length
- Stems: voice, music, sfx
- `cues.md` — cue list

---

## Rules
- Lock picture's time constants BEFORE making sound. Any later timing change = re-run sound.
- **SFX = free recordings only** (CC0 or CC-BY; user rule 2026-11-11). Send the list first (name, source, link, license, beat); download only after the user's OK. No synthetic SFX.
- Music: original score ducked under the voice. Sampled orchestra: `vsco-instruments` memory (`<ASSETS_DIR>/vsco2ce`, `inst_vsco.py`).
- Generated SFX (Mirelo) only on request, listing the SFX first.
- Voice: one steady tone.
- Language comes from the script's preamble (`Language:`), see SKILL.md.
- **Cue list in frames (`cues.md`):** each SFX is written next to its picture event with the same global frame
  (`BALL DROP 1254 metal release`, `FROG HIT 1262 bronze clink`). SFX only where something physical happens; the same
  whoosh at most twice per short.
- **Peak offset:** a recording with a soft lead-in hits late. Find the transient (first sample above 50 % of the clip's
  peak) and start the clip `onset` samples early so the peak lands ON the contact frame, not the file start.
- **Music resolves on the final frame:** the last chord/hit lands on the last frame (or the final word's end), never
  cut mid-phrase or ending early. At the twist, the music may drop out for ~15-20 f to make the moment land
  (music only; the voice keeps flowing, no VO pause).

## Voice Pipeline
1. Record or generate `voice.wav` (e.g., `<project>/voice/`)
   - ElevenLabs: `python scripts/eleven_voice.py voices` → `request <story> --voice NAME` (prices it, spends nothing) →
     show the user → `approve` ONLY after the user says yes → `generate` → `use`. Gives words.json directly (no whisper).
2. Make word timings `words.json` (any STT with word times)
3. **Hand-fix word timings** — everything is timed to words.json
4. `words_from_voice.py` makes words.json from voice.wav + SCRIPT.md (faster-whisper, aligned to script)

---

## Palace Template Audio (`templates/audio/`)
- `score_intrigue.py` writes whole score, SFX, mix from voice.wav + words.json:
  ```bash
  python score_intrigue.py voice.wav words.json out_dir
  ```

---

## Audio Scripts
- `contact_sheet.py <dir>` — makes one sheet from stills
- `frame_check.mjs` — reports characters cut by frame edge
- `beat_sheet.py` — one frame per narration phrase, labelled with phrase

---

## Sound-Off Test (on every draft)
- `python -I scripts/beat_sheet.py draft.mp4 words.json out/<name>/beats`
- Watch draft **muted**, then give sheets + SCRIPT.md to fresh Opus agent
- Per phrase: (1) does picture show what line says, at that moment not before (no spoilers); (2) without sound, can you tell who it is and what they feel; (3) is subject centred and every character whole; (4) anything covering a face/key prop
- Fix every "no" before final