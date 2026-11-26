---
name: cartoon-3d-short-mode-painted
description: Painted look (templates rail, bridge, palace): ink, lens, bloom, grade numbers and world-ink rules
---

# Mode: painted (rail / bridge / palace)

Black ink lines on a hand-painted 3D world, lit 2D cards with their own plum ink. This is the original look.
Other modes: `pbr.md` (court, diorama), `minecraft.md` (voxel).

## Composer order
`ink → lens pre → lens main → bloom → NEUTRAL tone map → grade` (MSAA 4). Every pixel parameter scales with output height / 1920.
Ink must be its own pass BEFORE the blur, or the blur overwrites it.

## Effect numbers
| Effect | Config | Toggle |
|--------|--------|--------|
| Ink lines | #030303 (near-black #0b0a0c), 5.1 px near (6 m) → 3.3 px far (90 m) at 1080x1920, creases ×0.8 from 35°, depth jumps 1 %, fog tint 0.3 far | `ink` |
| Lens blur | cInf px at 1080: hook/CU 15-16, CU 12-14, MS 10-12, park 7, golden sway 5, wides/aerials 0. Focus on the eyes (front row) | `lens` |
| Bloom | thr 1.0, int 0.5, 6 levels, radius 0.6 | `bloom` |
| Colour grade | NEUTRAL tone map → grade | `grade` |
| Zoom blur | only when Bridge.tsx has it (or a dim/colour script) | `zoom` |

## World ink rules
- Lines on silhouettes, depth jumps and normal creases only; none on wall/floor joins or the horizon.
- Character cards are on the `NOINK` layer: never outlined by world ink; they carry their own plum ink
  (#201628–#2f1d28, thicker on the bottom / shadow side).

## Look values
Day/golden light presets, albedos and measured targets: `bible/environment.md`. Character specs: `bible/characters.md`.
