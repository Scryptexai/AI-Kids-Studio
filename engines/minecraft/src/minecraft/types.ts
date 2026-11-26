// The compiled world: what the voxel renderer reads (public/<dir>/world.json). Written by
// src/director/minecraft/compile.ts from a VoxelSet + the asset manifest. Shared by the director (Node) and the renderer
// (Remotion bundle): no imports here.

export type Dir = "down" | "up" | "north" | "south" | "west" | "east";

export type CFace = {
  /** texture key in CompiledWorld.textures */
  tex: string;
  /** [u1, v1, u2, v2] in texture pixels (0..16); filled from the element box when the model gives none */
  uv: [number, number, number, number];
  rot?: 0 | 90 | 180 | 270;
  /** this face takes the block's tint colour */
  tint?: boolean;
  /** the face is skipped when the neighbour on that side is an opaque full cube */
  cull?: Dir;
};

export type CElement = {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: { origin: [number, number, number]; axis: "x" | "y" | "z"; angle: number; rescale?: boolean };
  faces: Partial<Record<Dir, CFace>>;
  /** Minecraft's directional face shade (default true) */
  shade?: boolean;
};

export type CBlock = {
  /** palette key from the VoxelSet */
  key: string;
  id: string;
  shape: "cube" | "cross" | "model" | "fluid";
  layer: "opaque" | "cutout" | "translucent";
  /** sRGB hex for tinted faces, or null */
  tint: string | null;
  /** blockstate rotation in degrees (Minecraft rotates x first, then y; both clockwise seen from +axis... see geometry.ts) */
  rotX: number;
  rotY: number;
  elements: CElement[];
  /** light level 0..15 the block gives off (glowstone 15); drawn emissive, lights the night/cave presets */
  light: number;
  /** block positions, flat [x, y, z, x, y, z, ...] (whole blocks); hidden blocks removed */
  positions: number[];
  /** fluids: the game's level (0 source, 1-7 flowing thinner, 8+ falling); the renderer slopes the surface from it */
  level?: number;
};

export type CTexture = {
  /** path under the world folder (staticFile(dir + "/" + file)) */
  file: string;
  w: number;
  /** frame height (= w for a still texture) */
  h: number;
  frames: number;
  /** game ticks per frame (20 ticks = 1 s) */
  frametime: number;
};

export type CompiledWorld = {
  kind: "CompiledWorld";
  id: string;
  mcVersion: string;
  sky: { preset: "day" | "sunset" | "night" | "nether" | "cave" | "end"; skyColor?: string; fogColor?: string; fogNear?: number; fogFar?: number };
  bounds: { min: [number, number, number]; max: [number, number, number] };
  textures: Record<string, CTexture>;
  blocks: CBlock[];
  /** mobs with their skins resolved: textures = the stack drawn into one skin (bottom first), slots = the model's
   *  extra texture slots (sheep wool); all are keys in `textures`. look = the head's target point, if any */
  mobs: {
    id: string; mob: string; variant?: string; baby?: boolean; at: [number, number, number]; facing: number;
    action: "idle" | "walk"; look: [number, number, number] | null; textures: string[]; slots: string[];
  }[];
  /** props: an item sprite (texture key, extruded) or a block model (positions empty: placed by the prop layer) */
  props: {
    id: string; item?: string; block?: string; at: [number, number, number] | null; heldBy: string | null; facing: number; scale?: number;
    sprite?: string; model?: CBlock;
  }[];
  /** cast cards: layers are paths under public/ (staticFile), drawn bottom first; none = a toon figure */
  characters: { id: string; at: [number, number, number]; look: "camera" | "left" | "right"; layers?: string[]; outline?: number; outfit?: { jacket?: string; pants?: string; boots?: string; skin?: string; hat?: "hair" | "cap" | "tophat" | "bonnet" | "diamond_helmet"; armor?: "diamond"; hair?: string; cap?: string } }[];
  cameras: { id: string; position: [number, number, number]; lookAt: [number, number, number]; fov: number }[];
  /** body heights (blocks) for the preview markers */
  heights: Record<string, number>;
};

// ================================================================ Wave A (mc-cobblegen): fluids, contact, cutaway
// Per-shot direction fields (direction.json shots.<id>), drawn by src/minecraft/Fluids.tsx and read by McShort as
// `ShotDirection & WaveAFx`. All frames are KEY frames (30 fps; mcTime.ts). Cells are whole blocks [x, y, z].
// README with examples: projects/mc-cobblegen/FX.md, section "Wave A: fluids".
//
//   fluids:   [{ kind: "lava", source: [8,-1,4], start: 10, spread: 2 }]            lava creeping west down a trench
//             [{ kind: "lava", source: [1,-1,0], f0: 15, path: [[1,-1,1],[1,-1,2]],   a bucket pour (pair with a
//                scoop: { f: 80, to: [1.4,0.9,-0.2] } }]                             lava `pours` entry) + scoop back
//   contacts: [{ f: 40, at: [6,-1,4], until: 70, crack: 10 }, { f: 82, at: [6,-1,4] }] cobble forms, is mined, re-forms
//             [{ f: 60, at: [8,-1,4], block: "obsidian", clear: [[7,-1,4]] }]          the source turns to obsidian
//   cutaway:  [{ from: [4,-2,5], to: [8,-1,5], f0: 0, f1: 90 }]                        near trench wall hidden
//   softOutlines: [{ from: [5,-2,4], to: [5,-2,4], color: "#bfe6ff", f: 20 }]          glowing hole outline

/** a fluid body: one source block and the cells its flow reaches (Minecraft levels: each step sideways is one level
 *  thinner, lava -2 (source + 3 cells), water -1 (source + 7 cells); a step down is a fall: full height, then it
 *  spreads again at the bottom). The cells come from `path` (in order) or, without one, from the game's own spread
 *  over the shot's set (`spread` cells out, down into any hole first, never sideways off a falling cell). */
export type FluidSpec = {
  kind: "lava" | "water";
  /** the source block (full height 8/9, still texture) */
  source: [number, number, number];
  /** frame the source appears: it swells from a puddle to a full block over `grow` frames (a pour landing, ice
   *  melting). Default: there from before the shot */
  f0?: number;
  /** frames the source takes to swell in (default 4) */
  grow?: number;
  /** frame the flow starts leaving the source (default f0 + grow; with neither: already spread before the shot) */
  start?: number;
  /** frames per cell (default lava 12, water 5); a fall takes rate * 0.35 (at least 2) */
  rate?: number;
  /** frames a cell takes to fill as the front creeps in from its upstream face (default min(rate, 8)) */
  fill?: number;
  /** explicit cells in flow order, each beside (or right below) the one before: [x,y,z] (timed by `rate`) or
   *  [x,y,z,f] (it starts entering on f). Leave out to let the fluid spread by the game's rules */
  path?: number[][];
  /** without `path`: how many cells out it spreads sideways (default lava 3, water 7) */
  spread?: number;
  /** game level per path cell (default from the steps: +2 lava / +1 water sideways, 8 = falling) */
  levels?: number[];
  /** scooped back into a bucket: from f the flow recedes from its far end toward the source, then the source shrinks
   *  and rises as a stream into `to` (the bucket mouth); all gone at f + len (default len 16) */
  scoop?: { f: number; to: [number, number, number]; len?: number };
  /** frame the source is taken away (the flowing cells then dry up from the source outward). A contact on the
   *  source does this by itself */
  drain?: number;
  /** lava only: strength of the warm flickering light the lava casts (default 1, 0 = none) */
  light?: number;
};

/** a block forming where lava meets water: a hiss (white smoke burst) and the block pops in (0.6 -> 1.08 -> 1),
 *  glowing hot for a moment; the fluid cell it lands in is gone from that frame. Repeatable: list one entry per
 *  block that forms (a mined block lets the fluid flow back in from `until`). */
export type ContactSpec = {
  /** the frame it forms (f < 0: already there when the shot opens, no hiss) */
  f: number;
  at: [number, number, number];
  /** block id (default "cobblestone"; "obsidian" on a lava source). Taken from any loaded set, else built from the
   *  shared fx textures (cobblestone, obsidian) */
  block?: string;
  /** the frame it is mined: it breaks into motes of its colour, the fluid flows back into the cell */
  until?: number;
  /** frames of crack stages (the game's destroy_stage 0..9) before `until` (default 0 = none) */
  crack?: number;
  /** other fluid cells that fizzle out on f (a small puff each), e.g. flowing lava the water ran over */
  clear?: number[][];
  /** the hiss burst (default true) */
  hiss?: boolean;
  /** frames the new block glows hot orange (default 8, 0 = none) */
  hot?: number;
};

/** cells hidden from the picture in a frame range (a cutaway: the near trench wall, so the trench reads from the side).
 *  Cells: a list and / or a box from..to (inclusive). Hidden on [f0, f1) (default the whole shot). */
export type CutawaySpec = { cells?: number[][]; from?: [number, number, number]; to?: [number, number, number]; f0?: number; f1?: number };

/** a soft glowing outline around a box of blocks: BlockFx's Outline plus an additive halo, gently pulsing */
export type SoftOutlineSpec = {
  from: [number, number, number]; to: [number, number, number]; color: string;
  /** fades on over 8 f from f, off over 8 f from out */
  f: number; out?: number;
  /** core bar width (default 0.04) and halo width (default 0.16) in blocks */
  width?: number; halo?: number;
  /** breathing pulse (default true) */
  pulse?: boolean;
};

/** the Wave A fields of a shot direction */
export type WaveAFx = { fluids?: FluidSpec[]; contacts?: ContactSpec[]; cutaway?: CutawaySpec[]; softOutlines?: SoftOutlineSpec[] };

// ================================================================ Wave B (mc-cobblegen): items, piston, redstone, ghosts
// Per-shot direction fields (direction.json shots.<id>), drawn by src/minecraft/Items.tsx (items) and
// src/minecraft/Redstone.tsx (pistons, redstone, ghostPistons); McShort reads them as `ShotDirection & WaveBFx`.
// KEY frames (30 fps; mcTime.ts), cells whole blocks [x, y, z], points in blocks. README: projects/mc-cobblegen/FX.md,
// section "Wave B".
//
//   items:   [{ item: "cobblestone", f: 72, cell: [6,-1,4], moves: [{ f: 86, to: [7.3,-1,4.5] }], burn: 92 }]
//                                                 mined cobble pops out, slides into the lava next door, burns
//            [{ item: "cobblestone", f: 40, cell: [6,-1,4], pickup: { f: 60, by: "ruby" } }]   picked up by Ruby
//            [{ mob: "witch", pickup: { f: 330, by: "ruby" } }]   the witch's poof drop (acts poof `drop`), picked up
//            [{ item: "redstone", f: 20, from: [5.5,1,3.5], land: [5.2,1.6,3.5], ghost: true, until: 70 }]   a ghost part
//   pistons: [{ at: [6,-1,3], facing: "south", clock: { f0: 30, period: 16, f1: 100 }, refill: {}, max: 12 }]
//   redstone:[{ dust: [[6,0,1],[6,0,2],[6,0,3]], repeaters: [{ at: [5,0,1], dir: "east" }], piston: 0, pop: 14 }]
//   ghostPistons: [{ at: [6,-1,3], facing: "south", f0: 4, push: 14, apart: 40, fade: 80 }]
//   chests:  [{ at: [1,0,1], facing: "east" }]            (set `chest` blocks draw facing north without an entry)
//   light:   { hemi: 0.15, sunI: 0, blockLight: 0, keys: [[0,1]] }                  a dark room (shots 24-25)
//   rims:    [{ actor: "witch" }, { actor: "z1", i: 2.5 }]                           cool back light per mob
// Real sets (anchors.json): piston [-2,-1,-1] facing "north", line [-2,-1,-2] (the cobble spot) .. [-2,-1,-14];
//   redstone: [{ dust: [[-3,0,0],[-1,0,0],[-1,0,1],[-3,0,1],[-1,0,-1],[-2,0,-1]],
//                repeaters: [{ at: [-2,0,0], dir: "east" }, { at: [-2,0,1], dir: "west" }], piston: 0 }]

/** an item entity (a dropped item): the item's sprite extruded one pixel (vanilla's flat item, half a block wide) or,
 *  for a block, a quarter-size cube; it spins and bobs on the ground like the game's (bob 0.1 up and down, ~1 rad/s
 *  spin). Life: it pops out (a toss up and over to `land`, one small bounce), rests, follows `moves`, and ends by
 *  `burn`, `pickup` or `until` (or stays). */
export type ItemSpec = {
  /** item id: an item texture (item/<id>: redstone, iron_ingot, any item a set holds) or a block id (a mini cube:
   *  cobblestone, smooth_stone, any cube block of a loaded set), or `ominous_banner` (the banner model, mc-raid).
   *  Optional when `mob` is given (the act's drop) */
  item?: string;
  /** the frame it pops out (default: the mob's poof frame) */
  f?: number;
  /** a mined block: it pops out of this cell's centre; `land` defaults to the cell's own floor (the block is gone) */
  cell?: [number, number, number];
  /** or a start point (world blocks) */
  from?: [number, number, number];
  /** the floor point it comes to rest on (its bottom; y = the floor's top) */
  land?: [number, number, number];
  /** toss: frames to land (default from the height: 8 + 6 * sqrt(drop)), apex above the start (default 0.45) */
  toss?: number; arc?: number;
  /** later moves from where it rests: slides along the floor, or falls off an edge when `to` is lower ("fall": it slides
   *  to the edge at `edge` (0..1 of the move, default 0.45), then drops under gravity and bounces once).
   *  len default: 12 f per block (min 6). kind "hop": a small parabolic hop to `to` */
  moves?: { f: number; to: [number, number, number]; len?: number; kind?: "slide" | "fall" | "hop"; edge?: number }[];
  /** the frame it touches lava: a hop, flames on it, it chars and sinks with a fizz (white-grey smoke puff, dark smoke
   *  squares, two sparks) and is gone by burn + 12 */
  burn?: number;
  /** flies into an actor (mob / cast id; its body centre, followed while it moves) over `len` frames (default 5),
   *  easing in (slow start, fast arrival), and is gone. height: the point on the body (default 0.9 above the feet) */
  pickup?: { f: number; by: string; len?: number; height?: number };
  /** just vanishes (shrinks out over 3 f; a ghost fades over 10 f) */
  until?: number;
  /** a mob's poof drop: takes f / from / land / item from that mob's `poof` act with `drop` (mobs/life.ts poofDrops),
   *  so the rest of this entry (pickup, moves ...) applies to it. Without an entry every poof drop still appears and rests */
  mob?: string;
  /** imagined: half-transparent, desaturated, a soft glow; it floats (no gravity) from `from` to `land` and hovers */
  ghost?: boolean;
  /** size multiplier (default 1) */
  size?: number;
  /** spin speed multiplier (default 1 = vanilla ~1 rad/s, ghosts 0.5); 0 = no spin, held at `yaw` */
  spin?: number;
  /** yaw in radians when it does not spin (default 0 = the flat sprite faces the -z cameras) */
  yaw?: number;
};

export type Facing = "north" | "south" | "east" | "west" | "up" | "down";

/** a vanilla piston at a cell, pushing toward `facing`. Each push: the head slides out one block over `ext` frames
 *  (linear, like the game), holds, slides back over `ret`. The line of blocks in front (from the cell next to the head)
 *  moves one cell with it. With `refill` a new block forms in the front cell after each retract (a hiss, like a
 *  Wave A contact), so the line grows one block per push; blocks pushed to index >= `max` drop off the far end. */
export type PistonSpec = {
  at: [number, number, number];
  facing: Facing;
  /** the frame the piston pops in (0.6 -> 1.08 -> 1, a dust puff); default: there from the start */
  pop?: number;
  /** push frames (the head starts moving out) ... */
  pushes?: number[];
  /** ... or a clock: a push every `period` frames from f0 while < f1 (default f1: f0 + 40 periods) */
  clock?: { f0: number; period: number; f1?: number };
  /** head out / held / back frames (default 2 / min(6, period/2 - 2) / 2) */
  ext?: number; hold?: number; ret?: number;
  /** blocks in the line before the first push (default 1: the block at the cobble spot), and their id (cobblestone) */
  line?: { n?: number; block?: string };
  /** a new block forms in the front cell `delay` frames after the head is back (default 1), with a hiss (default true).
   *  Leave the front cell out of the Wave A fluids / contacts: this replaces the contact there */
  refill?: { block?: string; delay?: number; hiss?: boolean };
  /** the longest line (default 12, the game's push limit): a block pushed to index max drops off */
  max?: number;
  /** how a block leaves the far end: "fall" (tips off, falls, spins, gone in ~18 f; default), "pop" (breaks into motes) */
  drop?: "fall" | "pop";
  /** a line block mined on f: index k (0 = the front cell), `crack` frames of crack stages first */
  mine?: { f: number; k: number; crack?: number }[];
};

/** redstone dust (flat pieces that join their neighbours: dust, repeater ends, `connect` cells) and repeaters, ticking
 *  in sync with a piston: each pulse lights the repeaters in turn (both torches + the lit top), then the dust from dark
 *  red to bright red (one power step dimmer per dust cell, like the game's falloff), with a few red dust particles. */
export type RedstoneSpec = {
  /** dust cells, in signal order (the air cell the dust lies in: one above the block it sits on) */
  dust?: number[][];
  /** repeaters, in signal order: `dir` = the way the signal leaves (the arrow), delay 1..4 (the lever position) */
  repeaters?: { at: [number, number, number]; dir: "north" | "south" | "east" | "west"; delay?: number }[];
  /** the pulse frames (when the signal reaches the piston) ... or follow pistons[piston] (its push frames) */
  pulses?: number[];
  piston?: number;
  /** frames between the repeaters lighting in turn (default 2); the last one lights `lead` frames before the pulse
   *  (default 2), the dust 1 frame after it */
  step?: number; lead?: number;
  /** frames each part stays lit (default half the pulse spacing, min 4) */
  lit?: number;
  /** the circuit pops in part by part from this frame (repeaters, then dust, 1 f apart); default: there from the start */
  pop?: number;
  /** extra cells the dust joins visually */
  connect?: number[][];
};

/** an imagined (ghost) piston: half-transparent, desaturated, softly glowing; fades in, can push a ghost block out one
 *  cell, then comes apart: the body drifts apart and fades in a puff of pale squares while its missing parts float out
 *  as ghost items (default: a greyed redstone dust and an iron ingot) that bob and then fade. */
export type GhostPistonSpec = {
  at: [number, number, number];
  facing: Facing;
  /** fades in over 6 f (rising a little, scale 0.85 -> 1) */
  f0: number;
  /** the frame the head pushes out (3 f, stays out); `block` = the ghost block in front that slides one cell with it
   *  (default "cobblestone"; null = none) */
  push?: number;
  block?: string | null;
  /** the frame it comes apart */
  apart?: number;
  /** the floating parts (default redstone and iron_ingot, either side of the piston, ~1.3 above it); f = the frame each
   *  shows (default apart + 2, apart + 10) */
  parts?: { item: string; to?: [number, number, number]; f?: number; spin?: number; yaw?: number }[];
  /** the frame the parts (and the ghost block) fade out over 12 f */
  fade?: number;
  /** body opacity (default 0.6) */
  opacity?: number;
};

/** the Wave B fields of a shot direction */
/** a chest (the set's `chest` blocks are drawn facing north without an entry; an entry turns one, or adds one that
 *  pops in on `pop`) */
export type ChestSpec = { at: [number, number, number]; facing?: "north" | "south" | "east" | "west"; pop?: number };

/** a per-shot light override (a dark room): the set's sky preset with these values replacing its own. `keys`
 *  ([frame, k] pairs, eased) blend from the preset (0) to the override (1); without keys it is fully on */
export type LightSpec = {
  hemi?: number; hemiSky?: string; hemiGround?: string; sunI?: number; sun?: string;
  /** the background / fog colours (the sky seen through an open side) */
  sky?: string; fog?: string; fogNear?: number; fogFar?: number;
  /** point-light strength of the set's light blocks (torches, glowstone) */
  blockLight?: number;
  keys?: [number, number][];
};
/** a cool rim light on one actor (mob or cast id): a point light behind it (away from the camera) and above, following
 *  it, so it reads against a dark room. i default 3, color "#8fb4ff", back 1.1, up 1.7, reach (distance) 4.5 */
export type RimSpec = { actor: string; color?: string; i?: number; back?: number; up?: number; reach?: number;
  /** 0..1 (default 0): the intensity breathes like a lava glow, i * (1 - flicker * n(frame)), n smooth 0..1 */
  flicker?: number };

export type WaveBFx = { items?: ItemSpec[]; pistons?: PistonSpec[]; redstone?: RedstoneSpec[]; ghostPistons?: GhostPistonSpec[];
  chests?: ChestSpec[]; light?: LightSpec; rims?: RimSpec[] };

// ================================================================ Wave A (mc-raid): raid HUD, bell, arrows, shocks,
// village boundary, imagined freeze, farm flow, vex rings, standing ominous banner. Per-shot direction fields
// (direction.json shots.<id>), drawn by src/minecraft/RaidFx.tsx (HUD = DOM over the picture; the rest in the scene)
// and McPost (the imagined look). KEY frames (30 fps), points in blocks, cells whole blocks. Shots without these
// fields render exactly as before. README with examples: projects/mc-raid/FX.md, section "Wave A: fx".

/** the game's boss bar "Raid" (red, 10 notches) at the top of the picture (y 9-12 %, x 14-74 %: clear of the Shorts UI) */
export type RaidBarSpec = {
  /** the frame it slams in from above (7 f, overshoot, a white hit on the bar, a small jolt); default: there already */
  in?: number;
  /** the frame it lifts away and fades (8 f) */
  out?: number;
  /** bar progress [frame, 0..1] keys (eased): the raiders' health; 0 = empty, a refill = keys back up to 1 (default 1) */
  fill?: [number, number][];
  /** pulse frames: the bar flares bright with a red glow and a small swell (12 f) */
  pulse?: number[];
  /** the title (default "Raid"; letters R a i d e V c t o r y - and space are drawn) */
  label?: string;
};
/** the Bad Omen / Raid Omen icon over an actor's head (a readability cheat, user-approved): stamps on, can flip to the
 *  other omen, can fly up into the boss bar */
export type OmenSpec = {
  /** mob / cast id */
  actor: string;
  /** the stamp frame: it drops onto the head (5 f) and lands with a thud squash and a little ring */
  stamp: number;
  /** "bad" (default) or "raid": the icon it starts as */
  kind?: "bad" | "raid";
  /** a card flip (8 f) to the other icon, with a glint */
  flip?: number;
  /** it flies up into the boss bar (10 f) and is gone (key the bar's `in` or a `pulse` at fly + 10) */
  fly?: number;
  /** where it flies to, in % of the picture [x, y] (default the bar's centre [44, 11]) */
  to?: [number, number];
  /** keep the icon's top at or below this % of the picture height (e.g. 14, clear of the Shorts top bar): a head
   *  high in frame pushes the icon down onto it; the fly starts from there. Default off */
  minY?: number;
  /** fade out over 6 f */
  out?: number;
  /** icon size in px at 1080x1920 (default 96 = 6 px per sprite pixel) and the height above the feet (default 2.35) */
  size?: number; up?: number;
};
/** a thin glowing line drawn from the boss bar down to an actor (draws on in `len` f, then pulses gently) */
export type RaidLinkSpec = { actor: string; f: number; len?: number; out?: number; color?: string;
  /** the actor point it ends on, height above the feet (default 2.1: just over the head) */
  up?: number;
  /** the start in % of the picture (default the bar's bottom centre [44, 11.8]) */
  from?: [number, number] };
/** R7 the village bell (vanilla bell_floor model: two stone posts, a dark oak bar, the gold bell body). The set's bell
 *  cell is hidden and drawn here so it can swing. Each ring: the vanilla swing (decays over 50 ticks) and a ring wave */
export type BellSpec = {
  /** the bell's cell */
  at: [number, number, number];
  /** blockstate facing (default "north": the bar runs east-west) and attachment (default "floor") */
  facing?: "north" | "south" | "east" | "west";
  attach?: "floor" | "ceiling";
  /** ring frames */
  rings?: number[];
  /** the side it is struck from (default: facing); swing multiplier on the vanilla angle (default 2) */
  from?: "north" | "south" | "east" | "west";
  swing?: number;
  /** the ring wave: "air" (a ring facing the lens, default), "ground" (a ripple across the ground), "both";
   *  radius in blocks (default 6), colour (default "#fff1b8") */
  wave?: "air" | "ground" | "both";
  radius?: number; color?: string;
  /** the ground y for the ripple (default at[1] - 1) */
  ground?: number;
};
/** R8 an arrow: a straight (or slightly arcing) flight with a bright streak, stuck in a block face with the vanilla
 *  quiver, or a hit on a mob (hurt act: red flash, recoil, hop), or a whip past the lens */
export type ArrowSpec = {
  /** launch frame and position (the bow / crossbow) */
  f: number; from: [number, number, number];
  /** where the TIP lands: a point on a block face (stuck) or on the mob (hit) */
  to?: [number, number, number];
  /** flight frames (default 6) and a gravity arc height in blocks (default 0) */
  n?: number; arc?: number;
  /** how far the tip sinks into the block (default 0.12; nothing shows past the face) */
  depth?: number;
  /** a mob hit: that mob gets a hurt act at f + n (knocked back `dist`, default 0.35); the arrow vanishes */
  hit?: string; dist?: number;
  /** the stuck arrow is gone from this frame */
  until?: number;
  /** a whip past the lens instead of `to`: it passes `side` blocks right (- = left) and `up` above the lens centre
   *  at f + n (defaults 0.35, 0.12) and flies on out of the picture */
  lens?: { side?: number; up?: number };
  /** streak colour (default "#fff4d8") */
  color?: string;
};
/** R10 a crash / roar: cells break on the passing shockwave (the existing break-mote wave, one cell at a time by
 *  distance), an expanding ring and a camera shake */
export type ShockSpec = {
  f: number; at: [number, number, number];
  /** cells that break as the wave reaches them (leaves, wheat) */
  cells?: number[][];
  /** wave speed (blocks per frame, default 0.7) and the ring's last radius (default 8) */
  speed?: number; radius?: number;
  /** "ground" (a dust ring on the ground at at[1]), "air" (a faint white ring facing the lens), "both" (default) */
  rings?: "ground" | "air" | "both";
  color?: string;
  /** camera shake [amp, len] (default [0.3, 12]); false = none (only with a keyed `cam`) */
  shake?: [number, number] | false;
  /** motes per broken cell (default 6) */
  motes?: number;
};
/** R11 the village boundary: a glowing rectangle on the ground (a bright strip + a low curtain of light) */
export type BoundsSpec = {
  /** corners [x, z] in block edges (x -14..14 covers cells -14..13) and the ground top y (default 0) */
  min: [number, number]; max: [number, number]; y?: number;
  /** traces on from the south-west corner both ways round, meeting at the far corner, over [f0, f1]; default: drawn */
  trace?: [number, number];
  /** pulse frames (14 f flare) */
  pulse?: number[];
  /** shrinks to a new rectangle (eased, len default 18) */
  shrink?: { f: number; len?: number; min: [number, number]; max: [number, number] };
  /** fades out over 8 f */
  out?: number;
  color?: string;
  /** curtain height (default 0.55) and strip width (default 0.16) */
  height?: number; width?: number;
};
/** R11 the imagined look with colour exceptions: everything desaturates and cools (ghost: paler still) EXCEPT the
 *  kept actors (their colour stays; `keepKeys` can fade one in or out), the boundary and the DOM HUD. With `still`
 *  everything but the kept actors freezes from that frame (the actors hold their pose). */
export type ImagineSpec = {
  /** [frame, 0..1] keys (eased) of the look */
  keys: [number, number][];
  keep?: string[];
  /** per kept actor [frame, 0..1] colour keys (default 1) */
  keepKeys?: Record<string, [number, number][]>;
  /** [frame, 0..1] keys: pale ghost blocks */
  ghost?: [number, number][];
  /** the frame the rest of the cast freezes */
  still?: number;
  /** world cells [x, y, z] that keep their colour too (the bed): drawn by the fx out of the merged mesh; their colour
   *  keys are keepKeys["cells"] */
  keepCells?: number[][];
};
/** R13 a mob carried along a curve (the farm flow): keys in time, a smooth Catmull-Rom path through them. `mode` is the
 *  way it moves on the segment ENDING at this key: "walk" (legs), "swim" (legs, bobbing), "float" (bobbing, no legs),
 *  "fall" (gravity from rest: slow then fast, legs still). `facing` overrides the travel direction on that segment. */
export type FlowKey = { f: number; at: [number, number, number]; mode?: "walk" | "swim" | "float" | "fall"; facing?: number };
/** a vex passing through a block face: a ring spreads on the face with a few sparks */
export type FaceRingSpec = {
  f: number;
  /** a point on the face (world) and its outward side */
  at: [number, number, number];
  face: "north" | "south" | "east" | "west" | "up" | "down";
  color?: string; len?: number; r?: number;
};
/** a standing banner (vanilla standing banner: pole, bar, flag; the ominous pattern) with a gentle flap */
export type BannerSpec = {
  /** the cell it stands in */
  at: [number, number, number];
  /** Minecraft yaw its front faces (default 0 = +z, south) */
  yaw?: number;
  /** flap multiplier on the vanilla sway (default 3) */
  wind?: number;
  /** pops in on this frame (0.6 -> 1.08 -> 1, 6 f) */
  pop?: number;
};
export type RaidFxDir = {
  raidBar?: RaidBarSpec;
  omens?: OmenSpec[];
  raidLinks?: RaidLinkSpec[];
  /** the red-violet raid sky: [frame, 0..1] keys (eased); 1 = raid on, 0.5 = between waves */
  raidSky?: [number, number][];
  bells?: BellSpec[];
  arrows?: ArrowSpec[];
  shocks?: ShockSpec[];
  bounds?: BoundsSpec[];
  imagine?: ImagineSpec;
  flows?: Record<string, FlowKey[]>;
  faceRings?: FaceRingSpec[];
  banners?: BannerSpec[];
  /** first person (FirstPerson.ts): from f0 the actor's own body is hidden (the lens sits at its eyes, a camera key)
   *  and its right arm + held item draw in camera space over the picture; `out` lowers the arm out of the frame
   *  over 6 f; the body shows again from f1 */
  pov?: PovSpec[];
};
export type PovSpec = { actor: string; f0: number; f1?: number; out?: number };

// ===== Wave A (itw-02 "Mined, Not Born"): fx layer, MountainFx.tsx (owner: fx agent). Formats: projects/itw-02/FX.md "## fx"
type MV3 = [number, number, number];
/** R1 a mined cell: destroy stages over the block, chips / sparks per hit, a burst that removes it (base -> air) */
export type MineSpec = {
  at: MV3;
  /** stepped [frame, stage 0..9 | -1 none] keys (wins over run / hits) */
  stages?: [number, number][];
  /** stages climb s0 -> s1 (default 0 -> 9) evenly over [f0, f1] (a long careful tap series) */
  run?: [number, number, number?, number?];
  /** pick hits: a frame, or { f, stage (the stage it leaves), sparks, n chips }; with no stages / run each hit adds an
   *  even share of 0..9 up to the break */
  hits?: (number | { f: number; stage?: number; sparks?: boolean | string; n?: number })[];
  /** the cell bursts on this frame (motes of its colour) and is air after */
  break?: number;
  motes?: number;
  /** sparks on every hit (true = warm white, or a colour); default chips only */
  sparks?: boolean | string;
  /** the face hit (default: the side facing the camera) */
  face?: "-x" | "+x" | "-y" | "+y" | "-z" | "+z";
  /** chip colour (default the block's average colour) */
  chip?: string;
  /** a hot glow showing through the cracks: [frame, 0..1] keys (eased), colour default lava orange */
  glow?: [number, number][];
  glowColor?: string;
};
/** R4 steam / hot wind along a polyline (deterministic particles, born at `rate` per frame while `keys` > 0) */
export type SteamSpec = {
  /** "wind" streaks + grit, "steam" big smoke puffs, "jet" fast steam, "wisp" a soft thin curl (default "steam") */
  kind?: "wind" | "steam" | "jet" | "wisp";
  /** world points, first = the source */
  path: MV3[];
  /** strength [frame, 0..1] keys (eased); default 1 */
  keys?: [number, number][];
  /** the head runs from the start to the end of the path between these frames (a flue run); default no limit */
  front?: [number, number];
  /** blocks per frame along the path */
  speed?: number;
  /** particles per frame at strength 1 */
  rate?: number;
  /** spread across the path in blocks */
  width?: number;
  /** puff size / streak length */
  size?: number;
  /** wind: share of particles that are dark grit cubes (default 0.3) */
  grit?: number;
  /** past the path end the particles keep going this many blocks, growing and drifting by `drift` (blocks / frame) */
  plume?: number;
  drift?: MV3;
  color?: string;
  opacity?: number;
  /** imagined / memory: kept in colour under the imagined look (raidKeep), slightly softer */
  ghost?: boolean;
  seed?: number;
};
/** R5 a rising lava column: fills a WxD column upward cell by cell, glowing front and a point light at the top */
export type LavaColumnSpec = {
  /** the bottom cell's min corner */
  from: MV3;
  /** [w along x, d along z] (default [2, 2]) */
  size?: [number, number];
  /** [frame, top y] keys (linear): the lava's top surface in world y; going down = drain */
  level: [number, number][];
  /** rise in surges (each cell gulps up) instead of a steady fill (default true) */
  gulp?: boolean;
  /** point light intensity at the front (default 3) and the front glow 0..1 (default 1) */
  light?: number;
  front?: number;
  /** the lava cools over: a block cap (default cobblestone) at y from frame f, glowing hot, fading over len (30 f) */
  crust?: { f: number; y: number; block?: string; len?: number };
};
/** R6 gold cap melting: the cells glow, squash to a slab with a wobble and drip gold (lava look tinted gold) */
export type MeltSpec = {
  cells: MV3[];
  /** block id (default "gold_block": from the set, else the fx textures, else a flat gold) */
  block?: string;
  /** orange glow [frame, 0..1] keys (eased) */
  glow?: [number, number][];
  /** squash [f0, f1]: height 1 -> `to` (default 0.5) */
  squash: [number, number];
  to?: number;
  /** drips per cell (default 3), colour default "#ffcf3a" */
  drips?: number;
  dripColor?: string;
};
/** R6 an iron lid of two hinged halves over a WxD mouth; the halves rotate up (inner edges rise) and glow red-hot */
export type LidSpec = {
  /** the mouth's min cell; the lid lies on its top face (y + 1) unless y is given */
  at: MV3;
  size?: [number, number];
  y?: number;
  /** hinge axis: "x" = hinges run along x on the two z edges (default), "z" = along z on the two x edges */
  axis?: "x" | "z";
  /** [frame, degrees] keys (eased) each half rotates up */
  bend?: [number, number][];
  /** [frame, 0..1] keys (eased) iron -> red-hot -> orange */
  glow?: [number, number][];
  /** texture key from the set (default "block/iron_block"; flat iron grey without it); plate thickness (0.19) */
  tex?: string;
  thick?: number;
  /** pops in on this frame (hammered on); hidden from this frame */
  pop?: number;
  hide?: number;
};
/** R6 heat shimmer: a screen-space heat haze over a world box (McPost, directed-camera shots) plus faint wisps */
export type ShimmerSpec = { min: MV3; max: MV3; keys: [number, number][]; wisps?: boolean; amount?: number };
/** R7 a pile of cells heaving: jolts, a heave up and a settle; lava light through the gaps */
export type HeaveSpec = {
  cells: MV3[];
  /** the heave frame */
  f: number;
  /** blocks up at the peak (0.6), frames up + settle (16), how much stays raised (0.12) */
  up?: number;
  len?: number;
  rest?: number;
  /** small jolts before (frames) */
  jolts?: number[];
  /** lava light seeping through the gaps [frame, 0..1] keys (eased) */
  glow?: [number, number][];
  /** camera shake [amp, len] on the heave (default [0.28, 12]); false = none */
  shake?: [number, number] | false;
};
/** R8 carved letters on a tread's top face (BlockText on +y) */
export type TreadTextSpec = {
  text: string;
  /** centre of the text on the tread top (y = the tread's top face) */
  at: MV3;
  /** where the letters' tops point (default "+z": read walking down a stair that descends toward +z) */
  top?: "+z" | "-z" | "+x" | "-x";
  height?: number;
  mode?: "carved" | "painted" | "chalk";
  lights?: { word: number; f: number; level?: number }[];
  flashes?: { word: number; f: number }[];
  glow?: string;
  appear?: number;
};
/** R8 small carved words (from the warning's own words, 1 or 2 per row, letter height 0.11) on the top face of tread cells */
export type TreadLinesSpec = { cells: MV3[]; top?: "+z" | "-z" | "+x" | "-x"; rows?: number; seed?: number };
/** R9 a glowing route drawn on along a polyline (x-ray over the rock by default) */
export type TraceSpec = { path: MV3[]; f0: number; f1: number; out?: number; color?: string; width?: number; xray?: boolean };
/** R9 heat tint spreading from a point through the rock: a tint on the cells' visible faces (no geometry change) */
export type HeatTintSpec = {
  at: MV3;
  f0: number; f1: number;
  radius: number;
  /** the face side tinted (default "-x": the cutaway plane seen from -x) */
  face?: "-x" | "+x" | "-z" | "+z" | "+y";
  color?: string;
  opacity?: number;
  /** fades out from this frame (12 f) */
  out?: number;
  /** only cells inside this box (inclusive cells) */
  min?: MV3; max?: MV3;
};
/** a white outline per cell: each lights on its frame (pop), fades at `off`, snuffs (flash + shrink + motes) */
export type CellOutlineSpec = {
  cells: MV3[];
  /** one frame for all, a frame per cell, or f0 with `every` frames between cells */
  on: number | number[];
  every?: number;
  off?: number | number[];
  snuff?: { i: number; f: number }[];
  color?: string;
  width?: number;
  xray?: boolean;
};
/** gravel trickling down a face along a polyline (falling, hopping motes) */
export type GravelSpec = { path: MV3[]; f0: number; f1: number; rate?: number; width?: number; size?: number; color?: string; speed?: number; seed?: number };
/** dust falling from a ceiling area (x/z box at y = max[1]) down to min[1] */
export type DustSpec = { min: MV3; max: MV3; f0: number; f1: number; keys?: [number, number][]; rate?: number; size?: number; color?: string; seed?: number };
/** McPost height fog per shot (itw-02 underground). Absent = the old fog, except a camera 2+ blocks under `groundY` (0)
 *  fades into the cave look by itself. Any object turns on the floor clamp: the fog stops thickening below groundY
 *  (only `under` x the ground density down there), so a cutaway does not fill the void under the town with blue. */
export type AtmoSpec = {
  /** the fog's floor in world y (default 0, the town ground) */
  groundY?: number;
  /** ground-level fog per block (default 0.035, storm adds 0.03) and the fall-off with height (0.32 per block) */
  density?: number;
  falloff?: number;
  /** share of the ground density below groundY (default 0.35) */
  under?: number;
  /** fog colour (default night blue "#1b2a4a") and moon-scatter glow (default 1) */
  color?: string;
  glow?: number;
  /** the cave look: a thin dark haze, no blue, no moon glow. true = always, false = never, default = by camera depth
   *  (full at 4 blocks under groundY, none above 2 under) */
  cave?: boolean;
  /** cave haze per block (default 0.018) and colour (default "#0c0b0e") */
  caveDensity?: number;
  caveColor?: string;
};
export type MountainFxDir = {
  /** McPost fog for this shot (see AtmoSpec); false = no atmosphere pass */
  atmo?: AtmoSpec | false;
  /** itw-02 imagined look (R11 `imagine`): texture names kept in full colour like a kept actor (substring of the
   *  texture file name: "lava" = lava_still + lava_flow, "magma", "redstone_ore" = both ores). Absent = every block
   *  greys (mc-raid). A direction-wide default can sit at the top of direction.json. */
  imagineKeep?: string[];
  mines?: MineSpec[];
  steams?: SteamSpec[];
  lavaColumns?: LavaColumnSpec[];
  melts?: MeltSpec[];
  lids?: LidSpec[];
  shimmers?: ShimmerSpec[];
  heaves?: HeaveSpec[];
  treadTexts?: TreadTextSpec[];
  treadLines?: TreadLinesSpec[];
  traces?: TraceSpec[];
  heatTints?: HeatTintSpec[];
  cellOutlines?: CellOutlineSpec[];
  gravels?: GravelSpec[];
  dusts?: DustSpec[];
};
