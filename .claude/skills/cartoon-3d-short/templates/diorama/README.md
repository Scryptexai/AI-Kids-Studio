# Diorama template: our own style (paper cutouts in a toy model)

This is the house style the user approved on 2026-11-11, built from the court template:
- **Characters** are paper cutouts: the toon card with a white paper margin and a thin warm-grey cut edge. They stand in the world and cast their own shadow.
- **World:** a warm, saturated miniature. Soft moulded stones, warm late sun, strong macro-lens depth of field.
- **Cameras** look down into the model, like a person leaning over a table maquette.

The set is the court gate courtyard (tower corner, arch with a light shaft, pavilion, shed, fences, board, grass). There are two shots and two characters, the same as court round 7, so the template can be compared with it.

The full knob table, court vs diorama, is in `references/PBR_LOOK.md` → "Own style: diorama". Read that file first. Every PBR trap applies here too.

| File | Owns (differences from court in bold) |
|---|---|
| `Court.tsx` | `camAt` shots, **`A_Y`/`BC_Y`/`BL_Y` high cameras**, marks, **`TRAMPLED` spots from the marks**, `rig`, `layersAt` dissolve, walk-in, acting, post chain (**lens before N8AO**, `cInf` 15-17, `maxCoC` 30, sat +0.4-0.6, contrast −0.02, bloom 0.8) |
| `world.ts` | IBL, **warm sun (1.0, 0.86, 0.68) × 3.5**, **warm front fill on the backlit preset**, masonry (**bevel 0.15**), arch, pavilion, grass (**`grassAt` honours `TRAMPLED`**), props |
| `chars.ts` | `Card` with **`paperEdge`** (7-unit white margin plus a 1.6-unit cut edge) and **`castShadow`**, costume overlay, outfits |
| `toon.ts`, `tex.ts`, `cardshade.ts`, `shade.ts`, `lensblur.ts` | same as court |
| `sandbox_index.tsx` | Remotion entry (composition `Diorama`, 120 f, 1080x1920) |

## Start a new short in this style
1. Copy this folder to `src/videos/<name>/` and `sandbox_index.tsx` to `src/sandboxes/<name>/index.tsx`, fixing its import path.
2. Copy `templates/scripts/diorama-stills.mjs` to `scripts/<name>-stills.mjs`, setting its entry path. Also copy `hdr_sky.py`.
3. Put the HDRI and sky jpg into `public/<name>/` and update the two `staticFile` paths in `world.ts`. They read `court/…` now.
4. Replace the set in `world.ts`, keeping IBL, sun, fill, grass and `TRAMPLED`. Replace `camAt`/`MARKS`, and push a `TRAMPLED` spot for every place a character stands on grass.
5. Camera rules:
   - Wides and two-shots go high (2.7-3.1 m, about 20° down).
   - Face close-ups go at about 1.6 m.
   - No hard cuts inside a place.
   - Check feet and prop bases against the bottom edge on a 10-frame strip.
6. Do not add world ink. Do not drop `paperEdge`: it is the signature.

## Known gaps
- The cutout shadow is faint when the sun is high and behind. Use a lower, more side-on sun for shots where it should read.
- No paper thickness yet (only a problem in 3/4 views).
