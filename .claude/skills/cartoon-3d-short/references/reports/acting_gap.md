# Acting gap study (2026-11-06): 5 reference shorts at 1080p vs our Stopped by Thin Air + Died on Time
Private study. 30 fps strips + head tracking. Some numbers estimated by eye (pose counts, keys/s, fall angles).
Main finding: the gap is not squash or idle noise. The reference uses BIG, FAST rotation/translation keys that
OVERSHOOT then HOLD, plus props/fx that keep moving after the body stops. Ours: small sine loops + smoothstep, no overshoot,
frozen fallen cards.

## Measured
| Metric | Reference | Ours |
|---|---|---|
| Distinct body poses per short | 7-11 (~9) | ~5 + 6 arm variants |
| Body pose keys/s, acting lead | 2-3 | ~0.2-0.3 |
| Lean amplitude | lean-in ~28° in 4 f; haul ~35°; laugh rock ±6° | ±5° stance; one -14° |
| Move curve | fast-out 4 f, hold 3 f, return 6 f, overshoot ~28 % of move, hold 5, settle 5 | smoothstep 3-6 f, no overshoot |
| Anticipation | dip ~25 % of move over 4 f before the accent | only 3 f card squash on swaps |
| Head drift while talking | 15-24 % W over 1.6 s, moving 83 % of frames | ±5° sine over 5.3 s |
| Fall | 12 f accelerating rotation to ~85°, contact, dust 15 f+, hat flies 25 f+, dazed face flicker every 3-6 f | static card at ±60°, nothing moves |
| Body squash/stretch | ~0 (laugh = 10 % W bounce; startle = eyes 1.6-2x + glow) | 3.5 % / 5.5 % on every swap (off-style) |
| Arm reach (hand from torso centre) | 1.3-1.6 W | max ~0.6 W; `point` ends across chest |
| Speaker expression swaps | ~3.7/s, mouth shape every 2-3 f | ~0.3-0.7/s |
| Near extras | laugh, bounce, turn to speaker | still |

## Missing poses (ranked by reference use)
1. Two-handed work on a prop (pour, crank, steer, dig, drag, pull cart) ~12
2. Sitting variants (chair + prop, feet on desk, throne, card table, rocking chair) ~9
3. Lying / sprawled (coffin, bed, face-down, pile) ~8
4. Strong lean (lean-in 25-30°, haul 35°, hand planted on wall) ~6
5. Full-length reach / aim / touch (arm level, 1.5 W) ~4
6. Peeking (round a door frame, head out of the ground) ~4
7. Group laugh rock ~2
8. Crouch ready; sleeping head on hand 1-2 each

## Top 8 fixes (1 is the prerequisite)
1. **Overshoot key curve** in cast.ts for every tilt/armK/headTilt/look change instead of smooth():
   `const hit=(n:number,d=4,os=0.28,s=8)=>n<=0?0:n<d?1-(1-n/d)**2:n<d+s?1+os*Math.sin(Math.PI*(n-d)/s)*(1-(n-d)/s):1;`
2. **Whole-body lean to ±30°** (toon.ts bodyFront `lean` opt): rotate upper body about hips, knee control by -side*lean*0.4u, hips slide 0.15HH*sin(lean), feet planted; lean-ins keyed 28° over 4 f.
3. **Real reach + new arm kinds**: fix `point` (hand at [tcx+1.2T.a+1.0HH, S[1]-0.05HH]); add reach, lean (hand on wall), haul (two hands fwd/down), shrug (hands at shoulder height, 1.1 W out), chin; elbow overshoot 10 % for 3 f.
4. **Talk drive** in stand(): head nod ±5 % W per word onset, 6 % dip 4 f before stressed words; new headTilt ±8° per phrase via hit(); speaker expression swaps every 0.3-0.5 s from word timings; listener mirrors 30 % 2-3 f later.
5. **Fall action + `lie` mode**: rotation 85*(n/12)^2 over 12 f, 4° bounce 3 f, dust puff 16 f, then lying body with face changing every 4-6 f. Never a frozen card.
6. **Secondary follow-through**: hat lags tilt 2 f, overshoots 30 %; on falls/startles the hat detaches and flies 20-25 f; held sweat drop on nervous/shock sliding 0.1 W/s; 3-5 f speed lines on moves > 10 % W/f.
7. **Near-extras acting**: front rank / within 2 W of a lead: head turns to speaker staggered 1-3 f; laughs = 10 % W bounce, 8 f period, ±6° rock. Far extras stay still.
8. **Retune swap pop**: squash 1.5 %, stretch 2 %; move the energy into a 4-6 % W translation pop + 3° roll with hit(); `eyePop` 1.6-2.0 for 6-10 f on startles; tongue-out mouth.

Strips: ref_private/study/acting/ r_japan_13.jpg, r_draw_17.jpg, r_jar_43.jpg vs o_air_51.jpg, o_air_49.jpg, o_air_22.jpg. Scripts: acting/py/.
