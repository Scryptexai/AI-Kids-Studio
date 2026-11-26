---
name: cartoon-3d-short-world
description: World building, lighting, sets, and environment for cartoon 3D shorts
---

# World, Sets & Lighting

## Core Files
- `lights.ts` — LIGHTS + LOOK sky/river/cloud palette per light
- `shade.ts` — two-tone shading and `untone()`
- `build.ts` — town, houses, Kenney CC0 props, recoloured, sight-line culling
- `paint.ts` — HD Canvas2D painted textures with seams as dark tints
- `world.ts` — sky shader, fog = horizon colour, river, per-frame posing, sun frozen per shot, camera-relative
- `grade.ts` — colour grading

---

## Build Order (Pipeline Step 5)
1. **Set density & lighting FROM THE START** — not as late pass
   - Art review scored 4-5/10 on "cheap look" when skipped

2. **Three layers in EVERY set:**
   - Foreground (blurred) — frames the shot
   - Midground — where action happens
   - Hazy silhouette background

3. **Story props** — fill each set with props that say where we are (stacks, signs, laundry, pots, litter). Use `E:\assets-library`, recoloured to shot palette.

4. **Layered textures** — base colour → variation → stains/wear → dark edges in corners. **No large flat surface anywhere.**

5. **Lighting that tells the story:**
   - Pools of light from windows/lamps
   - Rim light separates characters from background
   - Darkness steers eye to subject

6. **Atmosphere in motion** — ≥ 1 moving detail per set (dust in light shafts, smoke, falling leaves, birds, flags, laundry in wind)

7. **Shapes** — slightly crooked, exaggerated (leaning roofs, walls off-true, curving streets), not perfect boxes

---

## Hero Shot First
- Polish ONE key shot to max → get user + Opus art review approval (target ≥ 6/10)
- Save stills to `out/<name>/hero/`
- Every other shot matched to hero for texture density, lighting, dressing

## Hero Prop (the thing the story is about, 2026-11-16)
- The object the story is about (lamp, jar, brake valve, air conditioner) is ALWAYS a real 3D build, never a flat card
  or a painted texture. Real-world scale, bevelled edges, wear and dirt in the crevices, its own material.
- Build it alone first: a 6-angle look sheet (front, 3/4 both sides, side, top, close-up) on a neutral floor under the
  set's light, saved to `out/<name>/hero_prop/sheet.png`. Fix it until it reads at phone size, then place it at its mark.
- It gets at least one close-up with its own light and its own moment in the shot plan.

---

## Measured Targets (2026-11-06 gap study, `references/reports/look_gap.md`)
| Metric | Target |
|--------|--------|
| Corner ÷ centre luma | ≤ 0.65 |
| Subject ÷ surroundings luma | ~2.0 |
| Background behind face | ≤ 0.40 |
| Interiors: prop types | ≥ 12 |
| Wides: objects | ≥ 20 |
| Foreground framing element | ≥ 60% of shots |
| Warm practical lights (interior) | ≥ 2 |
| Warm practical lights (night) | ≥ 4 |
| Flat untextured area | ≤ 0.20 |
| Axis-aligned edges | ≤ 0.55 |
| Small bright accents/frame | ≥ 150 |
| Darkest tones | Plum ~#2a1a2e (never brown/olive) |

---

## Light Presets (from bridge, `templates/bridge/lights.ts`)
**Day:**
- Sun az 75 / el 48, frozen per shot, camera-relative
- Lit: [1.58, 1.5, 1.33]
- Shade: [0.30, 0.29, 0.36] (cool tint ONLY in shade)
- Lift: [0.05, 0.06, 0.11]
- Sky: top #3e7fd2 → horizon #b8d0ec
- Fog = horizon, 25→300 m
- uSat 1.08, ~15% blue haze past 60 m

**Golden:**
- Sun az 6 / el 7 (backlit low sun)
- Key toward #FFB36B ×1.5
- Violet-blue shade (facade ≈ #444380)
- Sky: #ffc47c → #8a6f8a
- Peach fog only past 50 m
- Sun disc #ffcf9e + bloom
- Contact blobs + real card shadows

---

## Albedos (`paint.ts`/`build.ts`)
- Muted brick / cream / ochre / terracotta houses with plinth, cornice, sills, hoods, door step, chimney + pot, heights 7 / 8.4 / 9.8 m
- Warm grey/beige stone (saturation −35% from "storybook")
- Ochre wood deck C* ~51-58 with near-black seams
- Iron: dark and desaturated
- **Never lemon, never lavender lit faces**

---

## Palace Template Additions (`templates/palace/`)
- `layout.ts` — every mark (hall, walls, desks, tomb)
- `palace.ts` — compound: pendopo joglo roof, loose brick wall, alley, candi bentar gate, kitchen, barracks, desks, tomb, town, hill fortress. Lanterns = HDR cards
- `royalfx.ts` — outfits + card drawings (portrait, map, flame, glow, rider, letter, scroll, quill, cracks, kamboja, coins)
- `lights.ts`/`grade.ts` — night preset
- `world.ts` — wall-fixed fx cards (`wallYaw`), frameCheck hook

---

## Asset Library (`E:\assets-library`)
- 29 Kenney kits, 2,676 CC0 low-poly GLB models
- Search: `python -I <ASSETS_DIR>/tools/use_assets.py x --search <words>`
- Copy ONLY what short uses into `public/<video>/`
- Scale to real metres: check `size_m` (furniture/road ~half size, nature trees ~1.2m)
- Recolour by material name to shot palette
- Keep on default layer for ink outline
- Add kits: add under `kenney/`, run `python -I tools/build_catalog.py`, ask user before downloading (Kenney signed links)

---

## Gotchas
- Kenney nature-kit materials are teal → recolour by material name in `build.ts`
- Cameras end up inside houses → sight-line culler in `build.ts`/`world.ts` removes anything blocking camera ray
- Ink in same merged effect pass as DOF gets overwritten → Ink must be its own pass BEFORE blur
- Pixel-sized post params must scale with resolution: stills at 0.5, final at 1.3333333333333333. R3F clamps dpr ≥ 1, so `--scale 0.5` stills render 1080x1920 buffer