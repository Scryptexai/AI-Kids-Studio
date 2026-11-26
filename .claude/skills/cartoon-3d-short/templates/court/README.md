# Court template: PBR world, lit 2D cards, no world ink

This is the set from the 2026-11-11 look test: a gate courtyard by day. It has:
- a tower corner with bevelled masonry;
- a gate arch with a ribbed tunnel, a portcullis, a side door and a dusty light shaft;
- a red pavilion, banners with our own crane emblem, a shed, fences, a perforated board and dense grass.

There are two shots and two characters: a commander (dome helm with crest, studded coat, beard, skirt) and a worker (quilted jacket, mop hair with a headband, hand drill).

How the look works and what each number does: `references/PBR_LOOK.md`.

| File | Owns |
|---|---|
| `Court.tsx` | `camAt` shots, marks, `rig` layout transform, `layersAt` dissolve (two canvases), walk-in, acting, post chain, lens focus |
| `world.ts` | HDRI/IBL, sun presets, masonry, arch + tunnel, pavilion, banners, ground, paving, grass, shed, fences, board |
| `tex.ts` | procedural canvas textures (stone, bump, wood, ground, board, banner) and noise |
| `chars.ts` | `Card` (canvas → lit plane, `TOP` headroom), costume overlay (quilt / studs), outfits |
| `toon.ts` | character drawing (rail toon + mop/dome hats, crest, bigBeard, hbelt, skirt, drill, crouch) |
| `cardshade.ts`, `shade.ts` | card lighting (scene light on the cards, white face kept) |
| `lensblur.ts` | thin-lens DOF effect |
| `sandbox_index.tsx` | Remotion entry (composition `Court`, 120 f, 1080x1920) |

## Start a new short in this look
1. Copy this folder to `src/videos/<name>/` and the sandbox entry to `src/sandboxes/<name>/index.tsx`, fixing its import path.
2. Copy these scripts into `scripts/`: `templates/scripts/court-stills.mjs` (change its entry path), `look_compare.py` and `hdr_sky.py`.
3. Put the HDRI and sky jpg into `public/<name>/` and update the two `staticFile` paths in `world.ts`.
4. Replace the set in `world.ts`, keeping the IBL, sun and grass systems. Replace `camAt`/`MARKS`. Keep the post chain and the dissolve.
   Never use a hard cut inside a place: move the camera. A change of place gets an 8 f dissolve.
5. Do not add world ink. Do not use rail's `ink.ts` with this template.
