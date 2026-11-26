# mccheck: keying toolkit for Minecraft-mode shorts (2026-11-25)

Two command-line tools that answer keying questions in a few lines instead of grep/cat of `src/`, dumps of
`direction.json` or a rendered still. They exist to cut keying-agent tokens: in mc-raid most agent calls were
lookups, and each one re-read a context of up to ~229k tokens.

| tool | what |
|---|---|
| `gate.py` | the staging gate: camera, collisions, ground, framing and occlusion checked numerically on every shot, ~7 s for a 40-shot short. Rules and tags: `check/README.md` |
| `mcq.py` | one-question queries: words at shot frames, a shot's keys, what is on screen at a frame, a set's bounds, the ground at a point, the direction.json fields and acts |
| `check/` | the gate's modules (`motion.py` = direction.ts ports, `world.py` = occupancy grid, `probe.py`) and `plant_test.py` |

```
python scripts/mccheck/mcq.py                         usage
python scripts/mccheck/mcq.py words  mc-raid/short 12
python scripts/mccheck/mcq.py at     mc-raid/short 12 0,20,40
python scripts/mccheck/mcq.py keys   flows
python scripts/mccheck/mcq.py gate   mc-raid/short 12,13 -v
python scripts/mccheck/check/plant_test.py            must print ALL PLANTED CASES BEHAVE
```

## Workflow for a keying agent
1. Before keying a shot: `mcq words` (what the line says, when) and `mcq shot` (what is already keyed).
2. Need a field or act name: `mcq keys` / `mcq acts`, not the renderer source.
3. Need a position: `mcq set`, `mcq ground`, `mcq probe`; to check a frame: `mcq at`.
4. After each edit: `mcq gate <base> <sids>`. Fix every FAIL or tag it as intended (`exit`, `airborne`,
   `backstep`, `block_ecu`, `wide`, `ignore`), with the reason in the shot notes.
5. Only a clean gate earns a still render. Render contact boards (several frames per image), at most 3 passes
   per shot; the still is for look and acting, the gate already proved placement.

## Changing the gate
After any change to `gate.py` or `check/`, run `check/plant_test.py`. Add a planted case for each new rule or
exception (P10t-P12t were added with the 2026-11-25 exceptions). Baselines 2026-11-25: tapper 0 FAIL,
mc-cobblegen 2, mc-bunker 10, mc-raid 29 (head cuts on fast moves, FACING nits, and two intended shots that
need tags).
