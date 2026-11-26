# Look gap study (2026-11-06): 5 reference shorts at 1080p vs our Stopped by Thin Air + Died on Time
Private study. 14 reference frames vs 14 of ours, caption band 55-80 % masked. Covers only what is NEW or still unmet
beyond references/reports/{lighting,textures,outlines,grade,depth}.md. Global stats (luma, sat, contrast, detail) already match.

## Measured (median, reference vs ours)
| Item | Reference | Ours |
|---|---|---|
| Props per frame (interior / wide) | 12-15 / 20+ | 5-7 / 3-5 |
| Large flat untextured area fraction | 0.23 | 0.29 (worst 0.59) |
| Depth layers per shot | 3.5 | 2 |
| Shots with foreground framing element | ~80 % | ~25 % |
| Hue families per frame | 6.5 | 5 |
| Corner / centre luma | 0.66 | 1.10 |
| Subject box / surroundings luma | ~2.0 (1.2-3.5) | 0.8 (0.62-1.5) |
| Background luma behind face | 0.27-0.43 | 0.47-0.56 |
| Warm practicals in interior/night shot | 2-6 | 0-1 |
| Darkest 10 % colour, day interior | plum #2e1226 / #21152b (luma ~.11) | brown/olive #43281e / #50582c (~.20) |
| Axis-aligned strong edges (interiors) | 0.53-0.55 | 0.68-0.76 |
| Small bright accents per frame (2-30 px) | 135-541 | 67-69 |
| Shots with particles/haze | ~90 % | ~30 % |
| Subject placement | off-centre, partly overlapped by FG | centred, nothing in front (~6/10) |

## Top 8 fixes (ranked)
1. **Light pool on subject, dark edges**: `shade.ts twoTone` uniform `uPool` (xyz, r), albedo x mix(0.55,1.12,smoothstep(1.8r,0.6r,d)), r 2.5 m interior / 6 m exterior, set per shot from CAMS. Target corner/centre <= 0.65, BG median <= 0.40, face 0.85-0.95.
2. **Warm practicals**: >= 2 per interior, >= 4 per night shot. Emissive core Color(3.0,2.3,1.2) + bloom, glowQuad pool on floor/wall k 0.35-0.5, r 1.2 m, #ffb45a.
3. **Set density**: interiors >= 12 prop types + 6-10 small items along every wall-floor line; wides >= 20 objects (poles every 12 m, fences, farmhouse, haystacks, tree clusters every 40 m, lane, rocks, distant town). Flat fraction <= 0.20, hue families >= 6.
4. **Foreground layer**: >= 60 % of shots, object 0.5-1.5 m from lens covering 8-20 % at an edge, blurred; subject at 35-40 % or 60-65 % width.
5. **Shape language**: RoundedBoxGeometry bevel 0.03-0.06 m on furniture; baseboard 0.15, crown 0.12, chair rail at 0.9 m, window frames/sills/mullions 0.08; jitter yaw ±3°, tilt ±1.5°, posts lean ±2°. Axis-aligned edges <= 0.55.
6. **Paint every flat material**: woodGrain (2-3 tones ±8 %, top band +15 %, bottom 20 % dirt −15 %), metalStreak. Calm brick: mortar #d8c4a4 -> #b98a6c, less jitter, pattern sd 0.135 -> <= 0.09 (let light carry variation). (15 of 33 airbrake materials had no map.)
7. **Accents and motes**: studs/nailheads 0.02 m #ffe7a8, one highlight streak per metal object, 80-150 motes in light shafts (2-4 px @1080, alpha .3-.6, 0.05 m/s); snow/embers at night. >= 150 accents per frame.
8. **Plum shadows, dark contacts**: day shade [.30,.29,.36] -> [.24,.20,.34], golden shade blue +.03; darkest 10 % ~#2a1a2e; 0.25 m multiply band x0.6 at every wall-floor join.

Comparisons: ref_private/study/look/cmp_{interior,wide,closeup,night}.jpg, subj_boxes.jpg; scripts meas.py, subj.py, speck.py, wall.py.
