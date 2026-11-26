---
name: cartoon-3d-short-camera
description: Camera choreography, framing, and motion rules for cartoon 3D shorts
---

# Camera & Motion

Full rules, numbers and Formula B camera deltas: `references/motion-camera.md` (read for every shot with a character or an action).

## Core Principles

### 1. Framing Comes First (9:16 is Narrow)
- Subject must be centred and whole, and inside the Shorts safe zone (top 8 %, right 16 %, bottom 25 %, left 4 % stay clear of heads and key props)
- No face/key prop covered by anything (lamp, glow, door, hand)
- Check every shot before render draft

### 2. Camera Grammar
- **Hard cuts** on big jumps
- **Everything else** = smootherstep glide 18-40 frames, peak ≤ 25 px/frame at 720p
- **Every hold** creeps: 0.15-0.35%/frame push-in, 0.6%/frame on punch words
- **No static hold** ≥ 4 frames
- **Rolls**: 4-5°
- **No hand-held float**
- **Impact shakes**: flip sign every frame, decay over 7 frames
- **DOF**: on ~1/3 screen time (CU, MS, inserts), cInf 10-16 px at 1080, focus on eyes. Establishing/wide stay sharp.
- **Foreground props** (`FOREGROUND` in story.ts) in ~1/3 shots — must be recognisable, not cut-off blobs

### 3. Character Acting (Camera Relation)
- Every visual reaction lands 0-3 frames **before** its word
- Camera deltas for Formula B: see `references/motion-camera.md` §5
- Lean limits: close-ups keep lean at 12-14°. At 22-26° head leaves frame. Use 25-30° only when camera framed for it (MS/wider, room on lean side)

### 4. Pre-Render Checklist (every shot)
- Frame check: `frame_check.mjs` reports characters cut by frame edge
- Subject centred, whole
- No spoilers ahead of voice
- Can tell who/what they feel without sound
- No face/key prop covered

---

## Formula B Camera Mode (Weird Choice That Was Right)
From `references/motion-camera.md` §5 / `references/formula-weird-choice.md`:
- Camera deltas specific to the 7-beat Formula B structure
- Each beat has prescribed camera behaviour
- Read both files when doing Formula B story

---

## Story.ts Camera Data Structure
```ts
SHOTS: id, a/b frames, light (day/golden), crowd mode, tau story time
XFADE: crossfades at place/time changes
FLASH_AT: white flash after hook
CAMS: per-shot keys {f, dur?, cut?, s: f => {pos, look, fov, roll}}
KICKS: impact flip-shakes
DOF/dofAt: lens blur per beat
FOREGROUND: near framing props
```

---

## Readability Traps (verifier caught)
- Swing drawn as one rope behind kid = reads as HANGING → use two ropes to wide plank, kid between, A-frames
- Props < 2m to lens = huge cut-off blobs at edge → re-check every prop when camera moves
- Foreground bush cut by frame = "green ball" → recognisable or gone
- Flags: red + yellow star/diamond = Vietnam's → period-correct (St George's cross for England 1831)
- Painted signs lit by side sun = grey-blue unreadable → give sign face unlit material
- Golden rim as offset outer copy = picture frame hats → inner rim only, head/torso only
- Balcony rails at chest height through torsos → lens ~2.5m up so rails cross legs
- Flat holds ≥12f = freezes in QA → every hold needs creeping push-in