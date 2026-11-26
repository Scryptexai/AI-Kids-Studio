---
name: cartoon-3d-short-pbr-look
description: The "PBR world, no world ink" look (2D cards in a lit, photographic-ish 3D world), proven by the 6-round court look test 2026-11-11
---

# PBR look: lit 2D cards in a PBR world, no world ink

This is the second house look, next to the painted/inked rail look. It was proven on 2026-11-11 by the court look test.
- The test matched a privately studied reference short, one set and two shots, over 7 rounds.
- The score went from 4 to **7.6/10** on average.
- Template: `templates/court/`. Report and sheets stay in the project's `ref_private/` and are never published.

Use it when the story wants a sunny, tactile, "real miniature" world: stone, grass, wood and light shafts.
Use rail (ink lines, painted albedo) for the flatter storybook look.

## What makes the look (in order of impact, measured)
1. **No world ink.** Edges come from geometry: bevelled instanced stones, AO in joints, shadow, and DOF. Ink stays on the character cards only.
2. **IBL from a real HDRI, plus one shadowing sun.**
   - Poly Haven CC0, 2k `.hdr` for light.
   - Sky dome from the 8k file: cut the top half with `scripts/hdr_sky.py`.
   - `scene.environmentIntensity = 1.55`.
   - Sun `DirectionalLight(1.0,0.95,0.86) 3.2`, 4096 PCFSoft shadow map.
   - One preset per shot: `"back"` (backlit courtyard) or `"front"` (raking across masonry). The reference relights every shot; so do we.
3. **Instanced bevelled masonry.**
   - About 1,500 `RoundedBox` stones, bevel 7.5 cm, standing 6 cm proud of a dark mortar core.
   - Per-instance UV offset on a procedural stone texture plus bump.
   - Interlocking tower corners, so there is no z-fighting.
   - The albedo must be **warm cream-grey, not neutral grey**. Shot saturation comes from albedo, not from the grade: the grade alone moved sat 0.17 → 0.22, warm albedo moved it to 0.30.
4. **Dense instanced grass with wind**, about 320k blades, root `#22400c` → mid `#57a020` → tip `#cde246`. Tall foreground grass frames most shots.
5. **Post chain** (Court.tsx):
   - N8AO: radius 0.9, falloff 0.6, intensity 2.2.
   - LensBlur (thin lens): `maxCoC 20`, `cInf` 5-7 per shot.
   - Bloom ADD: threshold 1.0, intensity 0.6, mip size pinned to 1920 tall.
   - Neutral tone map.
   - HueSaturation per shot: A +0.38, B −0.12.
   - Contrast +0.06.
   - Vignette 0.32 / 0.42.
6. **Lit character cards.**
   - Drawn with `toon.ts` on a canvas, then lit by `cardshade.ts`, so they take the scene light.
   - The face stays white. They are never flat emissive.
   - A costume overlay is painted on jacket-hue pixels only: `"quilt"` (diamond quilting) or `"studs"` (gold rivets).
   - Card height comes from `SU = 0.00216` m per unit.

## New toon.ts features (court copy; port to rail when a short needs them)
- Hats:
  - `"mop"`: thick curly hair with a headband (`o.band`) and knot.
  - `"dome"`: silver helm with gold rib, a studded rim and a finial.
  - The dome's crest is one swept-back horsehair brush with a ragged edge, coloured by `o.plume`.
- `bigBeard` (a shaggy beard below the mouth).
- `hbelt` (a horizontal belt with a gold buckle).
- `skirt` and `skirtTrim` (a pleated tunic skirt).
- Prop `"drill"`: two-hand brace drill; `reach` turns the crank.
- FrontOpts `crouch` 0..1: hips drop, knees bow, feet spread.
- FrontOpts `turn` 0..1 (with `facing`): a cheated 3/4 body. Face, buttons and buckle slide to the facing side, the far shoulder tucks in, the belly bulges forward, and both feet point the facing way.
- **Canvas headroom.** A tall crest is clipped at the canvas top. chars.ts keeps `TOP = 160` units of headroom; the plane is translated to match.

## Composition tools
- **No hard cuts.** Inside one place the camera moves continuously: a push-in, or a pull-back that reveals the next character as they walk in.
  - A change of place is an 8 f cross dissolve. `layersAt()` stacks two `ThreeCanvas` layers, each rendering its own shot, with rising opacity.
- **Frame the subject AND its object.** The hook is a medium shot with the character left of centre and the prop (board) right, turned edge-on so it fits.
  - Check every shot against the analysis camera table. Nobody and nothing important may be cut by the frame, except while entering it.
- **Rigid layout transform (`rig` in Court.tsx).**
  - To swing a camera (for example, to see into a tunnel at about 28°) without re-blocking, author the layout for camera B0/L0.
  - Then rotate every placed thing (characters, props, a `world.fences` group) about the camera, and map it onto B1/L1.
  - The two-shot holds while the background changes.
- **Per-shot marks** (`MARKS`): character, prop and shed positions, plus saturation, per shot. The world stays one set.
- **`camAt(shot, f)`** returns position, look, fov, focus and `cInf`. Shot B keys are authored in the layout frame and carried through `rig`.

## Traps (each cost a round)
- **Judging a look test from two still frames.** It hid a hard cut and a hook with the subject on the frame edge, both against our own analysis, and the user caught it.
  - Always render a 10-frame strip across the whole clip as well, and check each shot's framing and transitions.
- **Too much DOF on the background.** `cInf` 7 smeared the masonry: edge density was 0.148 vs the reference's 0.180. `cInf` 3.5 gives 0.183.
- **The far opening is a glow, not a street.**
  - The reference shows a bright, slightly overexposed warm haze with drifting smoke wisps.
  - Use an additive veil × about 1.05 so it blooms, and a backdrop × 1.15.
  - Keep the camera angle into the tunnel ≤ about 22°, or the far opening hides behind the jamb.
- **Additive light-shaft "blob".**
  - A wide additive cone (radii 1.0/1.7, uK 3.6) filled the whole arch opening with flat light.
  - Lowering lights does not fix it. Debug with lens and bloom off.
  - Use a narrow cone (0.5/0.95, uK 1.5) with strong dust streaks (`0.2 + 0.8*n²`).
- **A flat "outside" card at a tunnel end** reads as a picture.
  - Use an additive veil in the opening plus a warm haze plane about 7 m beyond, and let the paving continue outside.
  - Still open: a really lit street and wall.
- **Bare sky through openings** after removing a card: put a backdrop behind it.
- **Shot B too far** (camera z 7.2): characters get tiny and the grass dominates. Keep the two-shot at about 6 m with the camera at 1.5 m.
- **Foreground covers action.** A `crouch` is mostly hidden by grass, so show legs in a wider or higher shot when the pose matters.
- **Lens blur after N8AO blurs in-focus cards.** With N8AO ahead of the lens, the lens reads alpha-tested cards at background depth.
  - Put the lens passes BEFORE N8AO in the composer (fixed in the template 2026-11-11).
  - It only softens at `cInf` 3.5, but is obvious at 12+.
  - Debug a blurred subject with `{"post":{"ao":false}}` before touching focus maths.
- **TS "used before declaration"**: module-level `const` helpers must sit above the tables that call them.

## Look-match loop used (repeat for any new reference look)
1. `ANALISA.md`: script, sets, assets, characters, visual. Pick ONE set holding every look element.
2. Build the set in a sandbox (`src/sandboxes/<n>/index.tsx` → `src/videos/<n>/`); register it in `.claude/launch.json` for the Studio.
3. Each round:
   - Run `node scripts/court-stills.mjs out/<n>/roundN 0.5 <frames>`.
   - Then run `python scripts/look_compare.py out/<n>/roundN sheet.jpg <frame:refTime>...`. Reference frames come from `$LOOK_REF`.
   - This prints luma, sat, contrast and edge density, ours vs ref.
4. Score 9 aspects 0-10: masonry, sky, grass, composition, props, arch/light, character light, character design, post.
   - Write a fix list. One round fixes that list only.
   - Keep the report table: round | change | result.
5. Stop when every aspect is ≥ 7 and the user agrees, or after 6 rounds.

Final court numbers (270x480, ours vs ref, round 7):
- **Shot A:** luma 0.56/0.58, sat 0.35/0.36, contrast 0.22/0.19, edges 0.227/0.258.
- **Shot B:** luma 0.35/0.33, sat 0.39/0.34, contrast 0.25/0.21, edges 0.183/0.180.

Also render a strip across the clip (`court-stills.mjs ... 2,9,30,45,55,70,80,92,105,118`) and check it before scoring.

## Known gaps (start here next time)
- A drawn 3/4 torso. `turn` only slides features.
- Contrast is a little high: 0.22-0.25 vs 0.19-0.21.

## Own style: diorama (approved by the user 2026-11-11, template `templates/diorama/`)
Our house style is paper-cutout cards in a toy model. It is built from the court template with the knobs below. Court r7 → diorama:

| Knob | Court r7 | Diorama |
|---|---|---|
| Card edge | ink only | `paperEdge`: white 7-unit margin + warm-grey 1.6-unit cut edge |
| Card shadow | receive | receive + cast |
| Stone bevel | 0.075 (paving 0.12) | 0.15 (paving 0.2), 3 segments |
| Sun | (1.0, 0.95, 0.86) × 3.2 | (1.0, 0.86, 0.68) × 3.5 |
| Fill | none | warm front (1.0, 0.78, 0.55) × 1.1, no shadow, backlit preset only |
| DOF | `cInf` 5 / 3.5, `maxCoC` 20 | `cInf` 15 / 17, `maxCoC` 30, `nearScale` 1.4 |
| Grade | sat 0.42 / −0.12, contrast +0.06, bloom 0.6, vignette 0.32/0.42 | sat 0.6 / 0.38, contrast −0.02, bloom 0.8, vignette 0.30/0.50 |
| Camera | eye level 1.2-1.5 m | wides 2.7-3.1 m, about 20° down; close-ups about 1.6 m |
| Ground | grass to the feet | `TRAMPLED` dirt spots at every mark |

Notes:
- **Paper margin.** `paperEdge` stamps a white copy of the card alpha around a circle under the drawing (7 units), with a warm-grey cut edge (1.6 units).
- **Cards cast shadows.**
- **Bevel and sun.** Stone bevel 0.15, warm sun (1.0, 0.86, 0.68).
- **DOF and grade.** `cInf` 15-17 with `maxCoC` 30, sat +0.4-0.6, contrast −0.02, bloom 0.8.
- **The scale cue is the camera (t7).**
  - Wides: 2.7-3.1 m high, about 20° down. Trampled dirt spots (`TRAMPLED` in `grassAt`) let the cutouts stand whole on visible ground.
  - Backlit shots get a warm front fill (1.0, 0.78, 0.55) × 1.1 without shadow, so the shade side stays cream.
  - Re-check feet and prop bases against the bottom edge on the strip.

## Assets needed (not in the skill)
- `public/court/src/kloofendal_48d_partly_cloudy_puresky_2k.hdr` (Poly Haven, CC0).
- `public/court/sky8k.jpg`, made with `python scripts/hdr_sky.py <8k.hdr> public/court/sky8k.jpg`.
- Packages: `@react-three/postprocessing` 3.x, `postprocessing` 6.36+, `n8ao`, `@remotion/three`.
