---
name: cartoon-3d-short-minecraft
description: Minecraft environment mode - voxel world from local Minecraft assets, ink 2D cast as billboards (Phases 1-4 built 2026-11-12)
---

# Minecraft environment mode

Same pipeline (SCRIPT.md -> director -> validated plan -> three.js/R3F/Remotion render), but each set is a voxel
world built only from Minecraft assets. The cast stays **ink 2D billboards**. Animals, mobs, props and the world are 3D.

**Engine:** the renderer, validator, stager and keying gate this file describes are in this repo at
[`engines/minecraft/`](../../../../engines/minecraft) (a runnable Remotion project). It ships **without textures**:
extract them from your own Minecraft Java jar with `tools/mc_extract.py` (the `manifest` path is in
`src/director/config/minecraft.json`). Paths below (`src/minecraft/...`, `npm run director -- mc-*`) are that project's;
there the CLI is `npm run mc -- mc-validate|mc-stage|mc-preview`.

## Status
| Phase | What | State |
|---|---|---|
| 1 | Extractor + manifest + VoxelSet schema + validator + palette presets | **done 2026-11-12**, branch `minecraft-env/phase-1` |
| 2 | Voxel renderer (R3F InstancedMesh per block type, NearestFilter, per-face textures, cutout/translucent, sky + fog) + still preview | **done 2026-11-12**, same branch |
| 3 | Mob library (box models UV-mapped to vanilla textures; idle bob, walk, head look-at) + prop library + 2D cast billboards (shadow blob, sky tint, thick outline) | **done 2026-11-12**, same branch |
| 4 | Director writes `minecraft/<set>.voxel.json` from SCRIPT.md end to end (brief, draft sets, retry loop, plan links, framing check) | **done 2026-11-12**, same branch |

## Rules (same as the skill)
- Only the cast is 2D. Mobs, animals, props and the world are 3D.
- **Ask before downloading any asset**: what, source, size, then wait. Mojang files come only from the user's own
  `.minecraft` folder; never download them.
- The assets are Mojang's. Videos (monetised too) are fine; **never redistribute** them: the library stays in
  `<ASSETS_DIR>/minecraft` (not a git repo), and a render copies only the textures it uses into `public/`.
- Cross dissolves between sets stay. The ink-painted camera rules apply: set the lens deliberately and zoom with FOV so faces read.
- No clipping: the validator fails a floating or buried body, or a camera inside a block.
- OPEN: language and captions. The skill says English only, but the user's Minecraft channel is EN + ID
  (`minecraft-shorts` skill). Ask which channel a Minecraft-mode short is for before writing its script.

## Assets
- Source: `~/AppData/Roaming/.minecraft/versions/26.4-snapshot-6/26.4-snapshot-6.jar` (the user chose it 2026-11-12).
  The sounds are in `.minecraft/assets` (index `36`).
- Build or rebuild:
  `python -I <ASSETS_DIR>/tools/mc_extract.py --jar <jar> [--pack <zip|folder>]... [--assets-dir <.minecraft/assets> --index 36 --sounds]`.
  It takes about 3 s, writes 9 MB, and only reads the jar.
- Library layout: `vanilla/<ver>/textures/{block,entity,item,particle,colormap}`, `vanilla/<ver>/sky`,
  `packs/<pack>/textures/...`, `sounds/` (opt-in; recordings, but still list them to the user before use), `manifest.json`, `MANIFEST.md`.
- Resource packs override textures only (later `--pack` wins). The local packs are not HD: Bare Bones is a
  simplified look, and Fresh Animations is OptiFine CEM animation data, not textures.
- `manifest.json`:
  - `blocks`: shape, render layer, tint, default state, every state's model.
  - `models`: resolved elements with per-face texture, uv, rotation, tint and cull.
  - `items`, `mobs` (texture variants), `particles`, `sky`, `sounds`, `textures` (file, size, layer, animation).
  - `jar.sha256`: the validator reports `MANIFEST_STALE` when the jar changes.
- Block shapes: `cube` (431, including grass with its overlay), `cross` (108 plants), `fluid` (water and lava),
  `model` (stairs, slabs, torches ...), `multipart` (fences, panes), `none` (chests and other entity-drawn blocks).
- Tints use plains colours (grass #91BD59, foliage #77AB2F, water #3F76E4). Spruce and birch leaves use their fixed colours.

## VoxelSet (`out/director/<slug>/minecraft/<environment id>.voxel.json`)
- Schema: `src/director/schema/minecraft.ts`.
- Samples in `src/director/__fixtures__/minecraft/`:
  - `village-yard.voxel.json`: a house, a tree, a pond, flowers, a cow, a farmer villager, a walking zombie, a held
    sword, a TNT block, a character and two cameras;
  - `mob-zoo.voxel.json`: all 8 built mobs, walking and looking, held items, a dropped apple, an outlined card.
- Units: 1 block = 1 m, y up. `[x,y,z]` is a block corner. Feet stand at the block top (`y` whole) and the body
  centre at `n + 0.5`.
- `palette`: short key -> block id (`oak_log[axis=x]`), `air`, or a preset role (`@village.wall`).
- `ops` run in order: `fill`, `hollow` (shell), `walls` (no floor or roof), `block`, `replace`.
- `sky.preset`: day, sunset, night, nether, cave, end (colour and fog overrides are allowed).
- `mobs[]`: id, mob, variant, baby, at, facing; optional `overlays` (villager clothes and job, bottom first:
  `["type/plains", "profession/farmer"]`), `action` (`idle` default, or `walk`), `lookAt` (an instance id or a point).
- `props[]`: item or block; `at` or `heldBy`.
- `characters[]`: id, at, look; optional `layers` (PNGs under `public/`, bottom first, in the 600 x 1000 design
  frame with soles at y 975; none = a toon figure) and `outline` (thick ink outline, design units, about 8). `cameras[]`: id, position, lookAt, fov; at least one, used for the preview still.
- Environments get `environmentType: "minecraft"`. Every such environment needs a set (`MISSING_VOXEL_SET`).
- Theme presets (`src/director/config/minecraft-palettes.json`): village, forest, cave, desert, nether, end,
  castle. Every role must be a block the renderer can draw; a test checks that against the real manifest.
- Renderer limits (`src/director/config/minecraft.json`):
  - `supportedShapes` (cube, cross and fluid today);
  - `builtMobs` (cow, pig, sheep, horse, creeper, zombie, villager, player; any other mob warns `MOB_NOT_BUILT`
    and is drawn as a pink box);
  - `maxBlocks` 300k, `maxExtent` 256, and body heights.

## Rendering (Phase 2)
- Compile: `src/director/minecraft/compile.ts` turns a VoxelSet + the manifest into a `CompiledWorld`
  (`src/minecraft/types.ts`). It contains one entry per palette key, with elements, uvs, tint, blockstate rotation,
  light level and positions. Blocks buried on all six sides by opaque cubes are dropped. Only the textures the set
  uses are copied.
- `npm run director -- mc-stage <set.voxel.json>` writes `public/mc-preview/<id>/world.json` and `tex/`.
  `public/mc-preview/` is git-ignored (Mojang textures).
- `npm run director -- mc-preview <set.voxel.json> [--cam <id>] [--scale 0.5] [--frame n] [--no-markers]` validates,
  stages, then renders one PNG per camera to `out/mc-preview/<id>/<camera>.png`. It takes about 15 s and uses
  Chrome + ANGLE, like frame_check.
- Renderer `src/minecraft/` (`VoxelWorld.tsx`, `geometry.ts`, composition `McPreview` in Root.tsx):
  - one InstancedMesh per opaque or cutout block type; translucent blocks (water, glass) are one merged mesh, with
    faces against the same block or an opaque cube removed;
  - NearestFilter, no mipmaps, sRGB; animated textures step at 20 ticks/s;
  - the game's face shade (up 1, down 0.5, N/S 0.8, E/W 0.6) is baked into vertex colours, under a hemisphere light
    plus a shadow-casting sun;
  - the grass overlay uses polygonOffset (no z-fighting). Plants are double-sided and lit like a top face;
  - light blocks are emissive, and the dark presets add point lights at the 12 brightest;
  - sky presets (`SKY` in VoxelWorld.tsx) set the background, fog, hemisphere, sun and block-light strength.
- **Load the world OUTSIDE ThreeCanvas** and mount the canvas once it has loaded. Async state that arrives inside a
  canvas that is already up never redraws, and the stills come out black.
- Blockstate rotation follows the game (tests): y=90 turns north to east, and x=90 turns up to north.
- Not drawn yet: `model` and `multipart` shapes (stairs, slabs, torches, fences). The geometry already handles
  element rotation and rescale, so once they are checked visually, add them to `supportedShapes`.

## Mobs, props and cast (Phase 3)
- `src/minecraft/Actors.tsx` draws everything a set places (`VoxelWorld actors={<Actors lw={lw} />}`). Motion runs
  off the frame: nothing is ever frozen.
- Mobs (`src/minecraft/mobs/`):
  - `models.ts` holds the game's ModelPart trees in pixels (y down, facing -z): cow and pig (temperate geometry
    only; 1.21.5+ warm and cold have other models), sheep (+ wool slot), horse (7 coat colours), creeper, zombie,
    villager (base + type + profession stacked into one skin), and player wide/slim with the outer layers.
  - `cube.ts` gives each cube the game's box UVs (tests pin the front and top rects and the mirror).
  - `Mob.tsx`: root = 180 deg about x, y 1.5, scale 1/16, parts rotate ZYX. It uses the game's walk formula
    (`cos(t*0.6662)*1.4`), the humanoid arm bob, and zombie arms raised. The head turns to `lookAt` (clamped
    +-1.2 yaw, +-0.6 pitch) or slowly looks round.
  - Held props go to the right hand (humanoid), out of the crossed arms (villager), or the mouth (animals).
  - Babies are not built: they warn `MOB_BABY_NOT_BUILT` and draw as half-size adults. A texture that needs another
    model warns `MOB_VARIANT_NOT_BUILT`.
- Props (`src/minecraft/props/Item.tsx`):
  - an item is its sprite extruded 1 px thick, with side walls per open pixel edge (as the game does);
  - a block item (tnt) or a `block` prop is the block model;
  - resting items hover, bob and spin like dropped items, and blocks sit;
  - items with a special renderer (chest) are `PROP_NOT_DRAWABLE`.
- Cast (`src/minecraft/cast/CastCard.tsx`, toon kit copied from templates/rail as `cast/toon.ts`):
  - the card is 2.16 m tall with the soles at the `at` point;
  - it turns about y only, so it faces the lens from any orbit;
  - unlit, tinted per sky preset (`CAST_TINT` in Actors.tsx), with a contact blob and an alpha-tested sun shadow;
  - it blinks about every 3.4 s;
  - a held item sits at the hand, at (0.16, 0.6) m in card space.
- Compile resolves the skins (`textures` = the stack, `slots`), look points (a mob's eye at 0.85 of its height,
  a character's face at 1.8 m), item `sprite` and block `model`, and passes the cast `layers` through.
- `src/minecraft/package.json` says `"type": "module"`, because the director imports `mobs/models.ts` at run time.

## Director (Phase 4): SCRIPT.md -> voxel sets
- **Opt in** with a preamble line `World: minecraft` (it can share a line: `Language: English. World: minecraft.`):
  every set becomes `environmentType: "minecraft"`. Without it, a set whose name or text says "Minecraft" is one.
  A minecraft script with no Sets section gets one set, `world`, for every row (`MINECRAFT_DEFAULT_SET`).
- `npm run director -- plan <SCRIPT.md> --lean` as usual. `request.json` gains `minecraft`:
  - the manifest version;
  - rules: units, feet on blocks, FOV close-ups;
  - `blocks`: every block the renderer draws (cube, cross, fluid shapes);
  - built `mobs` with `variants`, plus villager `overlays`;
  - the item rule, theme preset roles and sky presets;
  - one brief per set: theme guessed from its words, sky from its time of day (time beats the cave theme), rows,
    characters, key props.
- The draft adds `minecraft: { <env id>: DraftVoxelSet }`. This is a VoxelSet without schemaVersion, kind, id and
  mcVersion, which the assembler fills in.
  - An op's block key that the palette lacks becomes the theme role (`ground` -> `@village.ground`), else the block
    id (`oak_log`).
  - `mobs`, `props` and `characters` default to empty.
  - Two new fields: `CameraMark.shots` (the rows a mark frames) and `MobPlacement.character` (a mob plays a script
    character, e.g. Gerald the zombie).
  - prompt.md has a "Minecraft mode" section.
- The sets are checked **in the same retry loop** (`director/minecraft.ts`). The validator's issues come back in
  `feedback.json` with draft paths (`minecraft.village-yard.mobs.1.at`). The plan links come back too, and point at
  the shot:
  - `MC_SHOT_WITHOUT_CAMERA`: every minecraft row needs a mark;
  - `MC_CAMERA_UNKNOWN_SHOT`, `MC_CAMERA_WRONG_SET`;
  - `MC_CHARACTER_NOT_PLACED`: a character the row shows must be a card or a mob with `character`;
  - `MC_CHARACTER_CUT_BY_FRAME`: projects the head (top and sides at eye level) through each mark's 9:16 frame, and
    the feet in wide shots;
  - `CHARACTER_PLACED_TWICE`;
  - warning `MC_CLOSEUP_TOO_WIDE`: a close-up must frame under 2.2 blocks of height at the face;
  - `MC_SET_UNKNOWN`, `MC_SET_NOT_MINECRAFT`.
- When the draft passes, `plan` writes `minecraft/<id>.voxel.json` per set, removes sets left by an earlier run, and
  checks the files again. `director validate` checks the plan links against the files.
- Stills: `npm run director -- mc-preview out/director/<slug>/minecraft/<set>.voxel.json`. Do not pass
  `--no-markers`, because it also hides the mobs and the cast.
- Not yet drawable as voxels: model and multipart blocks (fences, doors, torches). A torch can stand as a `block`
  prop (`wall_torch[facing=south]`), which compiles from the block model.
- The test story is `src/director/__fixtures__/minecraft-story/` ("Gerald Wants a Hug": 5 rows, village yard and
  cave mouth at night, committed `director-draft.json`).

## Motion presets (2026-11-13)
Motion is referenced by name, never invented. The library is in `presets/` in this skill (the code reads
`$CARTOON_PRESETS` first). Every value in it was tuned in the eleven Mob Farm hook rounds.

| File | What it holds |
|------|---------------|
| `expressions/<emotion>.json` | One layer set per emotion: face (the toon.ts `EXPR_FACES` numbers, kept equal by a test), body beats, timing (lead 3, morph 7, blink on swap, minimum hold), what it reads as, what to avoid. |
| `acting_presets.json` | Card gestures: chop_quick, chop_heavy, startle_hop, gulp_fear, nod_commit, jump_into, flinch_recoil, idea_pop, triumph_pump, blink. Each gives its events, expressions and path keys with anticipation, follow-through and easing. |
| `mob_presets.json` | spawn_drop, eyes_snap, stagger_wander, wall_bump, turn_to_look, menace_approach, bow_draw_fire. Each gives phase offsets (staggered), walk speed, sway, eye keys, bursts and arrows. |
| `camera_recipes.json` | cold_open_strike, crane_up_reveal, overhead_drift, dive_push_in, whip_to_reaction, hard_cut_hold, low_creep, jump_follow, group_tableau, push_in_end. Each gives keys relative to a camera mark and its subject, plus a fovCurve, easing and intended use. |
| `REVIEW_RUBRIC.md` | 7 categories, the scale, the pass rule (every category >= 8.5), the one-round rule for new projects. |

**From draft to renderer:**
1. The draft gives `shots[].presets`: `{kind, preset, who, mark?, to?, target?, start|anchor, durationFrames?}`. The
   request lists the menu in `request.presets`, and prompt.md explains it in its "Presets" section.
2. `src/director/director/presets.ts` expands each use. Bad names or params go back as draft feedback: PRESET_UNKNOWN,
   PRESET_PARAM_MISSING, PRESET_WHO_UNKNOWN, PRESET_MARK_UNKNOWN.
3. `plan` writes `minecraft/direction.src.json`.
4. To aim it, run:
   `node scripts/mc-direct.mts out/director/<slug>/minecraft/direction.src.json public/mc-preview public/mc-preview/<story>/direction.json`.

**Still by hand:** the set dressing (sky, rim light, mist, dark volumes, dig).

**Fold lessons back:** when a review finds a fix that would help any short, put it into the preset and its `notes`.

## Checking
- `npm run director -- mc-validate <file.voxel.json | out/director/<slug>>`: exit 0 means no errors. Error codes:
  - `UNKNOWN_BLOCK`, `UNKNOWN_BLOCK_STATE`, `UNSUPPORTED_SHAPE`, `UNKNOWN_THEME`, `UNKNOWN_PRESET_ROLE`, `UNKNOWN_PALETTE_KEY`;
  - `VOXEL_BAD_BOX`, `VOXEL_TOO_BIG`;
  - `UNKNOWN_MOB`, `MOB_NO_TEXTURE`, `UNKNOWN_MOB_VARIANT`, `UNKNOWN_MOB_OVERLAY`, `UNKNOWN_LOOK_TARGET`;
  - `UNKNOWN_ITEM`, `PROP_NOT_DRAWABLE`, `UNKNOWN_HOLDER`;
  - warnings: `MOB_NOT_BUILT`, `MOB_VARIANT_NOT_BUILT`, `MOB_BABY_NOT_BUILT`;
  - `FLOATING_MOB`, `FLOATING_CHARACTER`, `INSIDE_BLOCK`, `CAMERA_INSIDE_BLOCK`, `DUPLICATE_ID`;
  - `UNKNOWN_CHARACTER`, `UNKNOWN_ENVIRONMENT`, `ENVIRONMENT_NOT_MINECRAFT`, `MISSING_VOXEL_SET`;
  - `MANIFEST_STALE`, `MANIFEST_MISSING`.
- `director plan` and `director validate` run the same checks whenever the output folder has `minecraft/`, or an
  environment is minecraft. Painted stories never load the manifest.
- Tests: `src/director/test/minecraft.test.ts` (validator), `minecraft-compile.test.ts` (compiler, uvs, rotation,
  geometry) and `minecraft-mobs.test.ts` (box UVs, winding, mirror, model bounds, skins, props, mob checks) and `minecraft-director.test.ts` (extraction opt-in, theme/sky guesses, framing, plan end to end with draft-path feedback; needs the real manifest), using a small manifest slice with model elements in `__fixtures__/minecraft/manifest.json`.
