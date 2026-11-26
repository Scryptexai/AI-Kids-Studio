# Staging gate: gate.py

This gate checks a built Minecraft-mode short before anyone renders it. It evaluates the same camera (`camAt`, or McShort's `MovingCam`) and the same figure paths (`pathAt`) that the render uses. It tests them against an occupancy grid of the staged sets, then reports FAIL and WARN lines with the shot, the frame range, the figure and the numbers.

```
python scripts/mccheck/gate.py --base public/mc-preview/tapper/short
python scripts/mccheck/gate.py --base mc-preview/mc-cobblegen/short --shots 07,36 --step 2 -v
```

- `--base` is the short folder that holds `plan.json` and `direction.json`. You can give it as a path, relative to the repo, to `public/`, or to `public/mc-preview/`. The sets are found the way McShort finds them: `<base>/../<environmentId>/world.json`, plus `backdrop.json`.
- `--shots` takes shot ids separated by commas. The default is all shots.
- `--step` is the sampling step in frames (default 3). Every camera, mob and cast key frame is also checked, along with the first and last frame of each shot. The tail that runs under the next shot's dissolve is checked too.
- `-v` also prints the WARN details. The table always counts them.
- Exit code is 1 on any FAIL and 0 otherwise. A run takes about 5 s for 38 to 68 shots once the grids are cached.

## Rules

| rule | what | severity |
|---|---|---|
| CAM_SOLID | camera inside a solid block, or within 0.25 m of a solid face | FAIL |
| BLOCKED | a solid block between the lens and a figure's head (0.9 h) and chest (0.62 h) | FAIL for the lead; WARN for others or if only one is blocked. Skipped for a figure with an active `glowing` act and for phasers (vex) |
| WALL | 70 % or more of a 5x9 ray grid hits a solid block within 2.0 m | FAIL, unless the shot is tagged `block_ecu` |
| FLOAT / SUNK | feet more than 0.15 m above, or below, the solid top under them | FAIL, unless `airborne`. Automatic airborne: jump arcs, any frame whose y changes by more than 0.03 m against f±1 (falls keyed frame by frame), RaidFx `flows` in swim/float/fall, and flyers (vex, phantom, bat, ghast, allay, bee, parrot, blaze, wither, ender_dragon, happy_ghast). A `bed` act lies down |
| CLIP | body box (0.8 x the half width, knees (chest when airborne) to crown) inside a solid block | FAIL when a clipped point is visible from the lens; WARN when blocks hide it. No check for phasers (vex) |
| FACING | moving more than 0.05 m/frame with the facing more than 60 deg off the motion | FAIL (a run under 6 frames is a WARN), unless `backstep` |
| OUT_OF_SET | a keyed figure outside the set bounds (on screen or not), or a figure on screen with nothing under it | FAIL |
| OUT_OF_SET (camera) | camera below the set | FAIL |
| OUT_OF_SET (camera) | camera outside the xz bounds | FAIL with no backdrop; WARN over a backdrop |
| HEAD_CUT | head box over the top or bottom edge (keyed figure), or over a side edge (the lead) | FAIL, unless `exit` |
| HEAD_CUT (others) | other figures, or set extras, crossing an edge | WARN |
| BEHIND | the lead behind the lens | FAIL |
| BEHIND (others) | another keyed figure straddling the lens plane | WARN |
| SAFE_ZONE | a figure's box outside x 4-84 %, y 8-75 % | WARN |
| SMALL | the lead under 4 % of the frame height | WARN, unless the shot is tagged `wide` |

The lead is the `lead:<id>` tag if there is one, else the first `cast` entry. Failing both, it is the keyed mob with the most screen height summed over the shot, or the first keyed mob if none is ever on screen.

Facing convention: `0` faces +z, `-90` faces +x, `90` faces -x, `180` faces -z. This was checked against `Mob.tsx` (`yawRad = -facing`) and `shots_lib.fwd`.

## Tags (field name: `direction.json` > `shots.<shotId>.tags`, a list of strings)

```json
"tags": ["block_ecu", "wide", "airborne:ruby", "backstep:hobb@40-63", "exit:petra", "ignore:mason2", "lead:keeper"]
```

| tag | scope | effect |
|---|---|---|
| `block_ecu` | shot | an intended block close-up: no WALL check |
| `wide` | shot | an intended tiny figure: no SMALL warning |
| `airborne[:id][@a-b]` | figure | jumping, falling or flying: no FLOAT, SUNK or "nothing under the feet" |
| `backstep[:id][@a-b]` | figure | an intended walk backwards or sideways: no FACING check |
| `exit[:id][@a-b]` | figure | entering or leaving through the frame edge: no HEAD_CUT FAIL |
| `ignore[:id][@a-b]` | figure | skip the figure entirely |
| `lead:id` | shot | names the lead figure |

How the parts of a figure tag work:
- With no `:id`, the tag applies to every figure.
- `@a-b` limits the tag to shot-local frames a to b, inclusive.
- Ids are mob ids from `direction.mobs`, cast ids from `direction.cast`, or world mob and character ids.

Flows (2026-11-25): a figure with `raid.flows.<id>` keys follows the flow, not its mob keys (port of RaidFx `flowAt`, straight segments). A first-person `pov` actor is hidden from f0 to f1.

## Files

- `gate.py` (copied from projects/itw-01/anim/check_staging.py, 2026-11-25) is the gate. It holds the shot loop, the figures, the block changes and the report.
- `check/motion.py` holds ports of `direction.ts` (`seg`, `EASE`, `camAt` with smoothing, cuts, handheld drift, shakes and rumble, plus `pathAt`), McShort's `MovingCam`, and a pinhole `View` with a vertical fov at 1080x1920. Keep it in step with `src/minecraft/direction.ts`.
- `check/world.py` builds the occupancy grid from `world.json`. The cell codes are:
  - AIR
  - SOLID
  - CLEAR: glass and ice; these block bodies but not the view
  - PART: model blocks, solid only inside their rotated element boxes
  - FLUID
  - SOFT: plants, torches, ladders, carpets, rails and the like
  - BURIED: compile drops cells with an opaque full cube on all six sides, so they are inferred back
  The grid is cached as `.npz` in `check/.cache/`, keyed by the path, mtime, size and VERSION. Old caches are removed automatically. Delete the folder at any time.
- Block changes inside a shot are applied per frame:
  - `waves`, `dig`, `contacts`, `blockfx.gone`, `shatter`, `booms.cells`
  - `cutaway` and `doors`: hidden, but still count as support
- `check/probe.py` shows what is at a point: `python scripts/mccheck/check/probe.py public/mc-preview/<set> x y z` prints the column's cell codes, the block ids and the PART boxes.
- `check/plant_test.py` is the regression test. It writes a scratch short to `public/mc-preview/tapper/checktest/` with 15 planted shots: 2 clean controls, camera in a block, walking backwards, floating, walking out of the set, standing over nothing, a wall ECU, a head cut, clipping into a log, a blocked view, the lead behind the lens, plus tagged versions of the backstep, airborne and block_ecu shots. It exits 1 if any shot misses its rule.

## Known limits

- **World:** the world is static apart from the FX lists above. Pistons, redstone, fire and moving blocks are not simulated. `cutaway` and `doors` are only approximated as "hidden".
- **Bodies:** a body is a box, so arms, held items, tilt and lying poses are not tested for CLIP. Cast cards (`direction.cast`) are checked for position and framing but not for FACING.
- **Buried inference:** a sealed room with 1-block walls and nothing in it cannot be told apart from buried solid. Any wall cell that proves the room is air keeps it air. Rooms with a door, glass, a torch or any non-opaque block are always air.
- **Default camera:** a shot without `direction.cam` uses an approximated `MovingCam` on the set camera that lists the shot.
- **Lead:** without `lead:` or `cast`, the lead is guessed. Tag it when a shot has several keyed figures.
- **SAFE_ZONE:** this check is noisy on close-ups, which is why it is a WARN.
