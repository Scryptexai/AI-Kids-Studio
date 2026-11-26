// Mob box models, written the way the game writes them (Java ModelPart / CubeListBuilder, 26.4 layouts checked against
// the textures): model space is in pixels, y DOWN, the mob faces -z. Mob.tsx turns that into the world (180 deg about x,
// feet at y 0, 1 block = 16 px). A cube is texOffs(u, v) + addBox(x, y, z, w, h, d) [+ CubeDeformation g] [+ mirror].
// PartPose: offset (pivot) and rotation applied Z, Y, X like ModelPart.translateAndRotate.

export type V3 = [number, number, number];
export type Cube = { uv: [number, number]; o: V3; s: V3; g?: number; mirror?: boolean; /** texture slot (0 = the mob's skin) */ layer?: number };
export type Part = { name: string; at?: V3; rot?: V3; cubes: Cube[]; kids?: Part[];
  /** a joint across the part at this pixel y (part space): the mesh bends there (elbow / knee), see Mob.tsx */
  bend?: number };
export type Rig = "quadruped" | "humanoid" | "villager" | "horse" | "creeper" | "illager" | "ravager" | "vex";
export type MobModel = {
  /** texture size in pixels (UVs are divided by it) */
  tex: [number, number];
  rig: Rig;
  parts: Part[];
  /** the part that turns to look */
  head: string;
  /** extra fixed texture slots (slot 1, 2 ...): manifest texture keys, with an optional tint */
  slots?: { tex: string; tint?: string }[];
  /** the texture used when the placement gives no variant */
  defaultTexture: string;
  /** textures this geometry is right for (other variants of the mob have another model in this version) */
  textures: (t: string) => boolean;
  /** the renderer's model scale about the feet (WitchRenderer 0.9375); default 1 */
  scale?: number;
  /** an extra idle on top of the rig's (Mob.tsx poseMob): "witch" = nose wiggle, head bob, robe sway, hat drag;
   *  "chicken" = head bob + pecks, wing ruffles, flapping on a run */
  idle?: "witch" | "chicken";
  /** recolour the skin's red pixels to this colour (keeps their shading): red belongs to one character in a short */
  noRed?: string;
  /** legs' walk swing factor for a villager rig (default 0.5; the witch 0.28 so the legs stay inside the robe) */
  legSwing?: number;
  /** illagers: what the arms do when no act says otherwise: "crossbow" (pillager, crossbow carried at the ready),
   *  "axe" (vindicator, the raised axe), "crossed" (evoker, the folded arms) */
  arms?: "crossbow" | "axe" | "crossed";
};

const c = (u: number, v: number, o: V3, s: V3, extra: Partial<Cube> = {}): Cube => ({ uv: [u, v], o, s, ...extra });
const PI = Math.PI;

// ---- quadrupeds (QuadrupedModel: legs right_hind, left_hind, right_front, left_front)
const legs4 = (uv: [number, number], size: V3, o: V3, y: number, xs: number, zh: number, zf: number, g = 0, layer = 0, mirrorLeft = true): Part[] => [
  { name: "right_hind_leg", at: [-xs, y, zh], cubes: [c(uv[0], uv[1], o, size, { g, layer })] },
  { name: "left_hind_leg", at: [xs, y, zh], cubes: [c(uv[0], uv[1], o, size, { g, layer, mirror: mirrorLeft })] },
  { name: "right_front_leg", at: [-xs, y, zf], cubes: [c(uv[0], uv[1], o, size, { g, layer })] },
  { name: "left_front_leg", at: [xs, y, zf], cubes: [c(uv[0], uv[1], o, size, { g, layer, mirror: mirrorLeft })] },
];

/** 1.21.5+ cow (temperate): new head with muzzle and horns, udder on the body */
const COW: MobModel = {
  tex: [64, 64], rig: "quadruped", head: "head", defaultTexture: "entity/cow/cow_temperate",
  textures: (t) => t === "entity/cow/cow_temperate",
  parts: [
    { name: "head", at: [0, 4, -8], cubes: [c(0, 0, [-4, -4, -6], [8, 8, 6]), c(1, 33, [-3, 1, -7], [6, 3, 1]), c(22, 0, [-5, -5, -5], [1, 3, 1]), c(22, 0, [4, -5, -5], [1, 3, 1])] },
    { name: "body", at: [0, 5, 2], rot: [PI / 2, 0, 0], cubes: [c(18, 4, [-6, -10, -7], [12, 18, 10]), c(52, 0, [-2, 2, -8], [4, 6, 1])] },
    ...legs4([0, 16], [4, 12, 4], [-2, 0, -2], 12, 4, 7, -5),
  ],
};

const PIG: MobModel = {
  tex: [64, 64], rig: "quadruped", head: "head", defaultTexture: "entity/pig/pig_temperate",
  textures: (t) => t === "entity/pig/pig_temperate",
  parts: [
    { name: "head", at: [0, 12, -6], cubes: [c(0, 0, [-4, -4, -8], [8, 8, 8]), c(16, 16, [-2, 0, -9], [4, 3, 1])] },
    { name: "body", at: [0, 11, 2], rot: [PI / 2, 0, 0], cubes: [c(28, 8, [-5, -10, -7], [10, 16, 8])] },
    ...legs4([0, 16], [4, 6, 4], [-2, 0, -2], 18, 3, 7, -5),
  ],
};

/** sheep + its wool (SheepFurModel, slot 1, white) */
const SHEEP: MobModel = {
  tex: [64, 32], rig: "quadruped", head: "head", defaultTexture: "entity/sheep/sheep",
  textures: (t) => t === "entity/sheep/sheep",
  slots: [{ tex: "entity/sheep/sheep_wool", tint: "#ffffff" }],
  parts: [
    { name: "head", at: [0, 6, -8], cubes: [c(0, 0, [-3, -4, -6], [6, 6, 8]), c(0, 0, [-3, -4, -4], [6, 6, 6], { g: 0.6, layer: 1 })] },
    { name: "body", at: [0, 5, 2], rot: [PI / 2, 0, 0], cubes: [c(28, 8, [-4, -10, -7], [8, 16, 6]), c(28, 8, [-4, -10, -7], [8, 16, 6], { g: 1.75, layer: 1 })] },
    ...legs4([0, 16], [4, 12, 4], [-2, 0, -2], 12, 3, 7, -5).map((p) => ({ ...p, cubes: [...p.cubes, { ...p.cubes[0], s: [4, 6, 4] as V3, g: 0.5, layer: 1 }] })),
  ],
};

const HORSE: MobModel = {
  tex: [64, 64], rig: "horse", head: "head_parts", defaultTexture: "entity/horse/horse_brown",
  textures: (t) => /^entity\/horse\/horse_(white|creamy|chestnut|brown|black|gray|darkbrown)$/.test(t),
  parts: [
    { name: "body", at: [0, 11, 5], cubes: [c(0, 32, [-5, -8, -17], [10, 10, 22], { g: 0.05 })],
      kids: [{ name: "tail", at: [0, -5, 2], rot: [PI / 6, 0, 0], cubes: [c(42, 36, [-1.5, 0, 0], [3, 14, 4])] }] },
    { name: "head_parts", at: [0, 4, -12], rot: [PI / 6, 0, 0], cubes: [c(0, 35, [-2.05, -6, -2], [4, 12, 7])],
      kids: [
        { name: "head", cubes: [c(0, 13, [-3, -11, -2], [6, 5, 7])] },
        { name: "mane", cubes: [c(56, 36, [-1, -11, 5.01], [2, 16, 2])] },
        { name: "upper_mouth", cubes: [c(0, 25, [-2, -11, -7], [4, 5, 5])] },
        { name: "left_ear", cubes: [c(19, 16, [0.55, -13, 4], [2, 3, 1], { g: -0.001 })] },
        { name: "right_ear", cubes: [c(19, 16, [-2.55, -13, 4], [2, 3, 1], { g: -0.001 })] },
      ] },
    { name: "left_hind_leg", at: [4, 14, 7], cubes: [c(48, 21, [-3, -1.01, -1], [4, 11, 4], { mirror: true })] },
    { name: "right_hind_leg", at: [-4, 14, 7], cubes: [c(48, 21, [-1, -1.01, -1], [4, 11, 4])] },
    { name: "left_front_leg", at: [4, 14, -12], cubes: [c(48, 21, [-3, -1.01, -1.9], [4, 11, 4], { mirror: true })] },
    { name: "right_front_leg", at: [-4, 14, -12], cubes: [c(48, 21, [-1, -1.01, -1.9], [4, 11, 4])] },
  ],
};

const CREEPER: MobModel = {
  tex: [64, 32], rig: "creeper", head: "head", defaultTexture: "entity/creeper/creeper",
  textures: (t) => t === "entity/creeper/creeper",
  parts: [
    { name: "head", at: [0, 6, 0], cubes: [c(0, 0, [-4, -8, -4], [8, 8, 8])] },
    { name: "body", at: [0, 6, 0], cubes: [c(16, 16, [-4, 0, -2], [8, 12, 4])] },
    ...legs4([0, 16], [4, 6, 4], [-2, 0, -2], 18, 2, 4, -4, 0, 0, false),
  ],
};

/** HumanoidModel (zombie: left limbs mirror the right ones) and PlayerModel (own left limbs + the outer layer) */
const humanoid = (player: false | "wide" | "slim"): Part[] => {
  const armW = player === "slim" ? 3 : 4, armY = player === "slim" ? 2.5 : 2;
  const rArm = c(40, 16, [-(armW - 1), -2, -2], [armW, 12, 4]);
  const lArm = player ? c(32, 48, [-1, -2, -2], [armW, 12, 4]) : c(40, 16, [-1, -2, -2], [4, 12, 4], { mirror: true });
  const rLeg = c(0, 16, [-2, 0, -2], [4, 12, 4]);
  const lLeg = player ? c(16, 48, [-2, 0, -2], [4, 12, 4]) : c(0, 16, [-2, 0, -2], [4, 12, 4], { mirror: true });
  const outer = (cu: Cube, u: number, v: number, g = 0.25): Cube[] => (player ? [cu, { ...cu, uv: [u, v], g, mirror: false }] : [cu]);
  return [
    { name: "head", cubes: [c(0, 0, [-4, -8, -4], [8, 8, 8]), c(32, 0, [-4, -8, -4], [8, 8, 8], { g: 0.5 })] },
    { name: "body", cubes: outer(c(16, 16, [-4, 0, -2], [8, 12, 4]), 16, 32) },
    { name: "right_arm", at: [-5, armY, 0], cubes: outer(rArm, 40, 32), bend: 4 },
    { name: "left_arm", at: [5, armY, 0], cubes: outer(lArm, 48, 48), bend: 4 },
    { name: "right_leg", at: [-1.9, 12, 0], cubes: outer(rLeg, 0, 32), bend: 6 },
    { name: "left_leg", at: [1.9, 12, 0], cubes: outer(lLeg, 0, 48), bend: 6 },
  ];
};

const ZOMBIE: MobModel = { tex: [64, 64], rig: "humanoid", head: "head", defaultTexture: "entity/zombie/zombie", textures: (t) => t === "entity/zombie/zombie", parts: humanoid(false) };
/** the player's act items (mc-raid R9): off-hand shield, ominous bottle, totem, a sword; staged as slots, looked up by key.
 *  itw-02 adds the family pickaxes (stone / iron / gold) at the end (sets staged before keep their five slots) */
export const PLAYER_ITEM_TEX = ["entity/shield/shield_base_nopattern", "item/ominous_bottle", "item/totem_of_undying", "item/iron_sword", "item/bell",
  "item/stone_pickaxe", "item/iron_pickaxe", "item/golden_pickaxe"];
const PLAYER_WIDE: MobModel = { tex: [64, 64], rig: "humanoid", head: "head", defaultTexture: "entity/player/wide/steve", textures: (t) => t.startsWith("entity/player/wide/"), parts: humanoid("wide"),
  slots: PLAYER_ITEM_TEX.map((tex) => ({ tex })) };
const PLAYER_SLIM: MobModel = { ...PLAYER_WIDE, defaultTexture: "entity/player/slim/alex", textures: (t) => t.startsWith("entity/player/slim/"), parts: humanoid("slim") };

/** SkeletonModel: the humanoid head and body, thin 2x12x2 limbs (left ones mirrored), 64x32 skin */
const SKELETON: MobModel = {
  tex: [64, 32], rig: "humanoid", head: "head", defaultTexture: "entity/skeleton/skeleton", textures: (t) => t === "entity/skeleton/skeleton",
  parts: [
    { name: "head", cubes: [c(0, 0, [-4, -8, -4], [8, 8, 8]), c(32, 0, [-4, -8, -4], [8, 8, 8], { g: 0.5 })] },
    { name: "body", cubes: [c(16, 16, [-4, 0, -2], [8, 12, 4])] },
    { name: "right_arm", at: [-5, 2, 0], cubes: [c(40, 16, [-1, -2, -1], [2, 12, 2])], bend: 4 },
    { name: "left_arm", at: [5, 2, 0], cubes: [c(40, 16, [-1, -2, -1], [2, 12, 2], { mirror: true })], bend: 4 },
    { name: "right_leg", at: [-2, 12, 0], cubes: [c(0, 16, [-1, 0, -1], [2, 12, 2])], bend: 6 },
    { name: "left_leg", at: [2, 12, 0], cubes: [c(0, 16, [-1, 0, -1], [2, 12, 2], { mirror: true })], bend: 6 },
  ],
};

/** VillagerModel; the skin is base + type (biome clothes) + profession (+ level badge), stacked in one texture */
const VILLAGER: MobModel = {
  tex: [64, 64], rig: "villager", head: "head", defaultTexture: "entity/villager/villager",
  textures: (t) => t === "entity/villager/villager" || /^entity\/villager\/(type|profession|profession_level)\//.test(t),
  parts: [
    { name: "head", cubes: [c(0, 0, [-4, -10, -4], [8, 10, 8])], kids: [
      { name: "hat", cubes: [c(32, 0, [-4, -10, -4], [8, 10, 8], { g: 0.51 })], kids: [
        { name: "hat_rim", rot: [-PI / 2, 0, 0], cubes: [c(30, 47, [-8, -8, -6], [16, 16, 1])] }] },
      { name: "nose", at: [0, -2, 0], cubes: [c(24, 0, [-1, -1, -6], [2, 4, 2])] },
    ] },
    // the jacket bends at the hips (bend 12) so a villager sitting up in bed keeps its lap over its legs
    { name: "body", cubes: [c(16, 20, [-4, 0, -3], [8, 12, 6])], kids: [{ name: "jacket", cubes: [c(0, 38, [-4, 0, -3], [8, 20, 6], { g: 0.5 })], bend: 12 }] },
    { name: "arms", at: [0, 3, -1], rot: [-0.75, 0, 0], cubes: [c(44, 22, [-8, -2, -2], [4, 8, 4]), c(44, 22, [4, -2, -2], [4, 8, 4], { mirror: true }), c(40, 38, [-4, 2, -2], [8, 4, 4])] },
    { name: "right_leg", at: [-2, 12, 0], cubes: [c(0, 22, [-2, 0, -2], [4, 12, 4])] },
    { name: "left_leg", at: [2, 12, 0], cubes: [c(0, 22, [-2, 0, -2], [4, 12, 4], { mirror: true })] },
  ],
};

/** WitchModel (1.20.1; the 26.4 texture is byte-identical, 64x128): VillagerModel.createBodyModel() with the head
 *  replaced, so the villager's hat and hat rim are gone; the new head carries the stepped hat (brim, then three tiers,
 *  each tilted back a little more off its top corner) and the nose with the mole on it. Body, robe (the villager
 *  "jacket"), crossed arms and legs are the villager's. WitchRenderer scales by 0.9375.
 *  Our additions, never seen from outside: thin "fill" cubes under each hat tier and behind the nose (inset 0.05 px,
 *  reaching into the part below) so a tilt, the nose wiggle or the hat drag never opens a gap; and the robe bends at
 *  the hips (bend 12) for the sway, its hem staying clear of the legs. */
const WITCH: MobModel = {
  tex: [64, 128], rig: "villager", head: "head", defaultTexture: "entity/witch/witch", textures: (t) => t === "entity/witch/witch",
  scale: 0.9375, idle: "witch", legSwing: 0.28,
  parts: [
    { name: "head", cubes: [c(0, 0, [-4, -10, -4], [8, 10, 8])], kids: [
      // the hat: brim 10x2x10 just over the crown, then a sway joint on the brim's top centre carrying the tiers
      { name: "hat", at: [-5, -10.03125, -5], cubes: [c(0, 64, [0, 0, 0], [10, 2, 10])], kids: [
        { name: "hat_sway", at: [5.25, 0, 5.5], cubes: [], kids: [
          { name: "hat2", at: [-3.5, -4, -3.5], rot: [-0.05235988, 0, 0.02617994],
            cubes: [c(0, 76, [0, 0, 0], [7, 4, 7]), c(0, 76, [0.05, 3.9, 0.05], [6.9, 1.0, 6.9])], kids: [
              { name: "hat3", at: [1.75, -4, 2], rot: [-0.10471976, 0, 0.05235988],
                cubes: [c(0, 87, [0, 0, 0], [4, 4, 4]), c(0, 87, [0.05, 3.9, 0.05], [3.9, 1.0, 3.9])], kids: [
                  { name: "hat4", at: [1.75, -2, 2], rot: [-0.20943952, 0, 0.10471976],
                    cubes: [c(0, 95, [0, 0, 0], [1, 2, 1], { g: 0.25 }), c(0, 95, [0.05, 1.9, 0.05], [0.9, 0.8, 0.9])] }] }] }] }] },
      // the big nose (pivot inside the head, as the game wiggles it) with the mole on its lower front
      { name: "nose", at: [0, -2, 0], cubes: [c(24, 0, [-1, -1, -6], [2, 4, 2]), c(24, 0, [-0.95, -0.95, -4.6], [1.9, 3.9, 1.3])], kids: [
        { name: "mole", at: [0, -2, 0], cubes: [c(0, 0, [0, 3, -6.75], [1, 1, 1], { g: -0.25 })] }] },
    ] },
    { name: "body", cubes: [c(16, 20, [-4, 0, -3], [8, 12, 6])], kids: [{ name: "jacket", cubes: [c(0, 38, [-4, 0, -3], [8, 20, 6], { g: 0.5 })], bend: 12 }] },
    { name: "arms", at: [0, 3, -1], rot: [-0.75, 0, 0], cubes: [c(44, 22, [-8, -2, -2], [4, 8, 4]), c(44, 22, [4, -2, -2], [4, 8, 4], { mirror: true }), c(40, 38, [-4, 2, -2], [8, 4, 4])] },
    { name: "right_leg", at: [-2, 12, 0], cubes: [c(0, 22, [-2, 0, -2], [4, 12, 4])] },
    { name: "left_leg", at: [2, 12, 0], cubes: [c(0, 22, [-2, 0, -2], [4, 12, 4], { mirror: true })] },
  ],
};

/** ChickenModel (1.21.5+ temperate / warm; the cold chicken has another model): the wattle ("red_thing") is left out
 *  and the comb / face reds are recoloured to the beak ochre (Ruby is the only red). Two legs on the quadruped rig's
 *  hind-leg names, so they swing on a walk; wings and pecks come from the "chicken" idle (Mob.tsx). */
const CHICKEN: MobModel = {
  tex: [64, 32], rig: "quadruped", head: "head", defaultTexture: "entity/chicken/chicken_temperate",
  textures: (t) => /^entity\/chicken\/chicken_(temperate|warm)$/.test(t), idle: "chicken", noRed: "#b98a3e",
  parts: [
    { name: "head", at: [0, 15, -4], cubes: [c(0, 0, [-2, -6, -2], [4, 6, 3])], kids: [{ name: "beak", cubes: [c(14, 0, [-2, -4, -4], [4, 2, 2])] }] },
    { name: "body", at: [0, 16, 0], rot: [PI / 2, 0, 0], cubes: [c(0, 9, [-3, -4, -3], [6, 8, 6])] },
    { name: "right_hind_leg", at: [-2, 19, 1], cubes: [c(26, 0, [-1, 0, -3], [3, 5, 3])] },
    { name: "left_hind_leg", at: [1, 19, 1], cubes: [c(26, 0, [-1, 0, -3], [3, 5, 3])] },
    { name: "right_wing", at: [-4, 13, 0], cubes: [c(24, 13, [0, 0, -3], [1, 4, 6])] },
    { name: "left_wing", at: [4, 13, 0], cubes: [c(24, 13, [-1, 0, -3], [1, 4, 6])] },
  ],
};

// ---- raid mobs (mc-raid Wave A)
/** IllagerModel (1.21, 64x64): the villager body without the villager's hat layer (only the illusioner draws it);
 *  the robe (texOffs 0,38, g 0.5) is drawn from every illager skin (the pillager's is a short coat skirt, the evoker's a
 *  full robe) and bends at the hips (bend 12) for the sway. The crossed "arms" part and the two separate arms both
 *  exist; Mob.tsx shows one set or the other, as IllagerModel does. IllagerRenderer scales by 0.9375. */
const illager = (): Part[] => [
  { name: "head", cubes: [c(0, 0, [-4, -10, -4], [8, 10, 8])], kids: [{ name: "nose", at: [0, -2, 0], cubes: [c(24, 0, [-1, -1, -6], [2, 4, 2])] }] },
  { name: "body", cubes: [c(16, 20, [-4, 0, -3], [8, 12, 6])], kids: [{ name: "jacket", cubes: [c(0, 38, [-4, 0, -3], [8, 20, 6], { g: 0.5 })], bend: 12 }] },
  { name: "arms", at: [0, 3, -1], rot: [-0.75, 0, 0], cubes: [c(44, 22, [-8, -2, -2], [4, 8, 4]), c(44, 22, [4, -2, -2], [4, 8, 4], { mirror: true }), c(40, 38, [-4, 2, -2], [8, 4, 4])] },
  { name: "right_leg", at: [-2, 12, 0], cubes: [c(0, 22, [-2, 0, -2], [4, 12, 4])] },
  { name: "left_leg", at: [2, 12, 0], cubes: [c(0, 22, [-2, 0, -2], [4, 12, 4], { mirror: true })] },
  { name: "right_arm", at: [-5, 2, 0], cubes: [c(40, 46, [-3, -2, -2], [4, 12, 4])] },
  { name: "left_arm", at: [5, 2, 0], cubes: [c(40, 46, [-1, -2, -2], [4, 12, 4], { mirror: true })] },
];
/** the crossbow's sprites: standby, pulling 0-2, charged (Mob.tsx looks the slots up by key; a set staged before
 *  these existed simply draws no crossbow / banner) */
export const CROSSBOW_TEX = ["item/crossbow_standby", "item/crossbow_pulling_0", "item/crossbow_pulling_1", "item/crossbow_pulling_2", "item/crossbow_arrow"];
/** Raid.getOminousBannerInstance: a white banner with these patterns (texture, dye colour), bottom first */
export const OMINOUS_BANNER: [string, string][] = [
  ["entity/banner/base", "#f9fffe"], ["entity/banner/rhombus", "#169c9c"], ["entity/banner/stripe_bottom", "#9d9d97"],
  ["entity/banner/stripe_center", "#474f52"], ["entity/banner/border", "#9d9d97"], ["entity/banner/stripe_middle", "#1d1d21"],
  ["entity/banner/half_horizontal", "#9d9d97"], ["entity/banner/circle", "#9d9d97"], ["entity/banner/border", "#1d1d21"],
];
export const BANNER_BASE = "entity/banner/banner_base";
const BANNER_TEX = [BANNER_BASE, ...new Set(OMINOUS_BANNER.map(([t]) => t))];
const PILLAGER: MobModel = {
  tex: [64, 64], rig: "illager", head: "head", defaultTexture: "entity/illager/pillager", textures: (t) => t === "entity/illager/pillager",
  scale: 0.9375, legSwing: 0.28, arms: "crossbow", parts: illager(),
  slots: [...CROSSBOW_TEX, ...BANNER_TEX].map((tex) => ({ tex })),
};
const VINDICATOR: MobModel = {
  tex: [64, 64], rig: "illager", head: "head", defaultTexture: "entity/illager/vindicator", textures: (t) => t === "entity/illager/vindicator",
  scale: 0.9375, legSwing: 0.28, arms: "axe", parts: illager(), slots: [{ tex: "item/iron_axe" }],
};
const EVOKER: MobModel = {
  tex: [64, 64], rig: "illager", head: "head", defaultTexture: "entity/illager/evoker", textures: (t) => t === "entity/illager/evoker",
  scale: 0.9375, legSwing: 0.28, arms: "crossed", parts: illager(),
};

/** RavagerModel (128x128): neck -> head (nose block, horns, the jaw "mouth"), the body turned 90 deg about x, four
 *  37 px legs from y -13 down to the floor */
const RAVAGER: MobModel = {
  tex: [128, 128], rig: "ravager", head: "head", defaultTexture: "entity/illager/ravager", textures: (t) => t === "entity/illager/ravager",
  parts: [
    { name: "neck", at: [0, -7, 5.5], cubes: [c(68, 73, [-5, -1, -18], [10, 10, 18])], kids: [
      { name: "head", at: [0, 16, -17], cubes: [c(0, 0, [-8, -20, -14], [16, 20, 16]), c(0, 0, [-2, -6, -18], [4, 8, 4])], kids: [
        { name: "right_horn", at: [-10, -14, -8], rot: [1.0995574, 0, 0], cubes: [c(74, 55, [0, -14, -2], [2, 14, 4])] },
        { name: "left_horn", at: [8, -14, -8], rot: [1.0995574, 0, 0], cubes: [c(74, 55, [0, -14, -2], [2, 14, 4], { mirror: true })] },
        { name: "mouth", at: [0, -2, 2], cubes: [c(0, 36, [-8, 0, -16], [16, 3, 16])] },
      ] }] },
    { name: "body", at: [0, 1, 2], rot: [PI / 2, 0, 0], cubes: [c(0, 55, [-7, -10, -7], [14, 16, 20]), c(0, 91, [-6, 6, -7], [12, 13, 18])] },
    { name: "right_hind_leg", at: [-8, -13, 18], cubes: [c(96, 0, [-4, 0, -4], [8, 37, 8])] },
    { name: "left_hind_leg", at: [8, -13, 18], cubes: [c(96, 0, [-4, 0, -4], [8, 37, 8], { mirror: true })] },
    { name: "right_front_leg", at: [-8, -13, -5], cubes: [c(64, 0, [-4, 0, -4], [8, 37, 8])] },
    { name: "left_front_leg", at: [8, -13, -5], cubes: [c(64, 0, [-4, 0, -4], [8, 37, 8], { mirror: true })] },
  ],
};

/** VexModel (1.20+, 32x32): a root lifted 2.5 px, head, a small body with the robe tail (g -0.2), two short arms and
 *  two wings (zero-width boxes: one face carries the wing, the other is clear). The sword is item/iron_sword; the
 *  charging face (vex_charging) is swapped in by the "charge" act. */
const VEX: MobModel = {
  tex: [32, 32], rig: "vex", head: "head", defaultTexture: "entity/illager/vex", textures: (t) => t === "entity/illager/vex" || t === "entity/illager/vex_charging",
  slots: [{ tex: "item/iron_sword" }, { tex: "entity/illager/vex_charging" }],
  parts: [
    { name: "vex_root", at: [0, -2.5, 0], cubes: [], kids: [
      { name: "head", at: [0, 20, 0], cubes: [c(0, 0, [-2.5, -5, -2.5], [5, 5, 5])] },
      { name: "body", at: [0, 20, 0], cubes: [c(0, 10, [-1.5, 0, -1], [3, 4, 2]), c(0, 16, [-1.5, 1, -1], [3, 5, 2], { g: -0.2 })], kids: [
        { name: "right_arm", at: [-1.75, 0.25, 0], cubes: [c(23, 0, [-1.25, -0.5, -1], [2, 4, 2], { g: -0.1 })] },
        { name: "left_arm", at: [1.75, 0.25, 0], cubes: [c(23, 6, [-0.75, -0.5, -1], [2, 4, 2], { g: -0.1 })] },
        { name: "left_wing", at: [0.5, 1, 1], cubes: [c(16, 14, [0, 0, 0], [0, 5, 8], { mirror: true })] },
        { name: "right_wing", at: [-0.5, 1, 1], cubes: [c(16, 14, [0, 0, 0], [0, 5, 8])] },
      ] },
    ] },
  ],
};

/** mob id -> model; player picks wide/slim from the texture path */
export const MOB_MODELS: Record<string, MobModel> = {
  cow: COW, pig: PIG, sheep: SHEEP, horse: HORSE, creeper: CREEPER, zombie: ZOMBIE, skeleton: SKELETON, villager: VILLAGER, player: PLAYER_WIDE,
  witch: WITCH, chicken: CHICKEN, pillager: PILLAGER, vindicator: VINDICATOR, evoker: EVOKER, ravager: RAVAGER, vex: VEX,
};
/** the texture of a model slot by its key (undefined when the set was staged without it) */
export const slotIndex = (model: MobModel, key: string) => (model.slots ?? []).findIndex((s) => s.tex === key);
export const modelFor = (mob: string, texture: string): MobModel | null =>
  mob === "player" && texture.startsWith("entity/player/slim/") ? PLAYER_SLIM : (MOB_MODELS[mob] ?? null);
export const BUILT_MOBS = Object.keys(MOB_MODELS);

/** the textures a placement draws with, bottom first: [variant or default, ...overlays] as full manifest keys */
export const mobTextureStack = (mob: string, variant: string | undefined, overlays: string[] | undefined, known: string[]): string[] => {
  const full = (t: string) => known.find((k) => k === t || k.endsWith(`/${t}`)) ?? t;
  const m = MOB_MODELS[mob];
  const base = variant ? full(variant) : (m?.defaultTexture ?? known[0]);
  return [base, ...(overlays ?? []).map(full)];
};
