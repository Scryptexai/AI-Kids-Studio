// Light presets per time of day. The sun is CAMERA-RELATIVE and frozen per shot (world.ts update()):
// az = degrees from the shot camera's forward axis (0 = sun straight ahead = backlight, +90 = screen right,
// 180 = behind camera), el = elevation. lit/shade/lift are LINEAR RGB multipliers for shade.ts (may exceed 1).
// Field names follow lighting.md 9.1 exactly (the CHAR and POST agents read them); values are tuned on renders.
type C3 = [number, number, number];
export type LightPreset = {
  az: number; el: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number;      // world two-tone (shade.ts)
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3; // character cards (cast.ts)
  blob: C3; actorShadow: boolean;                                                    // contact blobs / card shadows
  top: string; hor: string; skyCurve: C3; fog: string; fogNear: number; fogFar: number; sunDisc: string; // depth.md 6.5
  sunCol: string; sunI: number; sky: string; ground: string; hemiI: number;         // three lights (unpatched mats only)
  bias: number; normalBias: number;
};
export type LightName = "day" | "golden" | "night" | "sick" | "amber" | "grey" | "dawn";
export const LIGHTS: Record<LightName, LightPreset> = {
  day: {
    az: 75, el: 48,
    lit: [1.58, 1.5, 1.33], shade: [0.3, 0.29, 0.36], lift: [0.05, 0.06, 0.11], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.94, 0.92], charShade: 0.84, charGrad: 0.14, bodyGrad: 0.34, sideTint: [0.92, 0.90, 0.96],
    blob: [0.62, 0.58, 0.58], actorShadow: false,
    top: "#3e7fd2", hor: "#b8d0ec", skyCurve: [0.0, 0.5, 0.6], fog: "#b8d0ec", fogNear: 25, fogFar: 300, sunDisc: "#000000",
    sunCol: "#fff3e0", sunI: 2.8, sky: "#dcecff", ground: "#b49a78", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  golden: {
    az: 6, el: 7,
    lit: [1.5, 0.68, 0.24], shade: [0.15, 0.15, 0.3], lift: [0.04, 0.06, 0.17], lambert: 0.35, sideK: 0.82, term: 0.07,
    charTint: [1.0, 0.78, 0.56], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.85, 0.80, 0.95],
    blob: [0.75, 0.74, 0.9], actorShadow: true,
    top: "#6a4f8c", hor: "#ffd08a", skyCurve: [0.05, 0.6, 1.0], fog: "#efb489", fogNear: 50, fogFar: 380, sunDisc: "#ffcf9e",
    sunCol: "#ffab5e", sunI: 5.5, sky: "#d8b0b8", ground: "#8a6a60", hemiI: 0.5,
    bias: -0.0006, normalBias: 0.03,
  },
  // moonlight: a cool key from high behind-left, deep blue-violet shade, lanterns carry the warmth (bloom on their cards)
  night: {
    az: -40, el: 38,
    // dark blue, never black (user rule 2026-11-11): moonlight keys, orange torches give the contrast
    lit: [0.36, 0.44, 0.82], shade: [0.09, 0.11, 0.25], lift: [0.035, 0.045, 0.1], lambert: 0.35, sideK: 0.84, term: 0.15,
    charTint: [0.66, 0.71, 0.96], charShade: 0.74, charGrad: 0.16, bodyGrad: 0.32, sideTint: [0.72, 0.75, 0.98],
    blob: [0.4, 0.42, 0.6], actorShadow: false,
    top: "#070b1f", hor: "#1b2650", skyCurve: [0.0, 0.5, 0.8], fog: "#22305e", fogNear: 14, fogFar: 140, sunDisc: "#dfe8ff",
    sunCol: "#c8d6ff", sunI: 2.0, sky: "#4a5c98", ground: "#2e2a4c", hemiI: 0.5,
    bias: -0.0004, normalBias: 0.02,
  },
  // the Great Stink, June 1858: a hot hazy day, the sun through yellow-grey murk, olive shade (still bright and painted)
  sick: {
    az: 70, el: 45,
    lit: [1.5, 1.44, 1.02], shade: [0.27, 0.28, 0.2], lift: [0.06, 0.06, 0.03], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.95, 0.82], charShade: 0.84, charGrad: 0.14, bodyGrad: 0.32, sideTint: [0.92, 0.92, 0.84],
    blob: [0.6, 0.6, 0.5], actorShadow: false,
    top: "#8c9a6a", hor: "#d9d2a0", skyCurve: [0.0, 0.5, 0.6], fog: "#b9b98a", fogNear: 15, fogFar: 160, sunDisc: "#fff2b0",
    sunCol: "#fff0c0", sunI: 2.6, sky: "#e4e0b8", ground: "#9a8a62", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  // lantern-lit brick tunnel: a warm orange key, deep brown-violet shade, short fog that swallows the far end
  amber: {
    az: 40, el: 30,
    lit: [1.6, 1.05, 0.55], shade: [0.16, 0.11, 0.13], lift: [0.05, 0.03, 0.03], lambert: 0.35, sideK: 0.8, term: 0.12,
    charTint: [1.0, 0.82, 0.62], charShade: 0.84, charGrad: 0.14, bodyGrad: 0.3, sideTint: [0.86, 0.78, 0.8],
    blob: [0.55, 0.45, 0.45], actorShadow: false,
    top: "#2a1a14", hor: "#5a3a24", skyCurve: [0.0, 0.5, 0.8], fog: "#3a2618", fogNear: 8, fogFar: 60, sunDisc: "#000000",
    sunCol: "#ffb060", sunI: 3.0, sky: "#6a4a30", ground: "#3a2820", hemiI: 0.4,
    bias: -0.0004, normalBias: 0.02,
  },
  // the centuries of failed sieges (shot "win"): flat overcast, cold grey-blue, soft shadows, desaturated but painted
  grey: {
    az: 60, el: 40,
    lit: [1.05, 1.1, 1.22], shade: [0.3, 0.33, 0.42], lift: [0.06, 0.07, 0.11], lambert: 0.3, sideK: 0.86, term: 0.25,
    charTint: [0.88, 0.92, 1.0], charShade: 0.86, charGrad: 0.12, bodyGrad: 0.3, sideTint: [0.9, 0.92, 0.98],
    blob: [0.6, 0.62, 0.7], actorShadow: false,
    top: "#5c6a84", hor: "#a8b4c4", skyCurve: [0.0, 0.5, 0.6], fog: "#9aa6b8", fogNear: 20, fogFar: 220, sunDisc: "#000000",
    sunCol: "#dfe6f2", sunI: 1.8, sky: "#c4ccd8", ground: "#7a7a80", hemiI: 0.6,
    bias: -0.00025, normalBias: 0.015,
  },
  // sunrise over the Golden Horn: a low pink-gold sun, rose sky, lilac shade
  dawn: {
    az: 20, el: 9,
    lit: [1.5, 0.92, 0.7], shade: [0.2, 0.18, 0.34], lift: [0.06, 0.05, 0.14], lambert: 0.35, sideK: 0.82, term: 0.09,
    charTint: [1.0, 0.84, 0.78], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.26, sideTint: [0.88, 0.82, 0.96],
    blob: [0.72, 0.68, 0.86], actorShadow: true,
    top: "#7a8cc4", hor: "#ffc4a8", skyCurve: [0.05, 0.6, 1.0], fog: "#f0b8b0", fogNear: 50, fogFar: 380, sunDisc: "#ffe0b8",
    sunCol: "#ffc090", sunI: 4.6, sky: "#e8c0c8", ground: "#8a7070", hemiI: 0.55,
    bias: -0.0006, normalBias: 0.03,
  },
};

/** world-only look per light (sky stops by elevation in degrees, river colours, cloud palette). All colours are
 *  ON-SCREEN targets under the current PBR-Neutral tone map; world.ts pre-inverts the tone map (shade.ts untone). */
export type WorldLook = {
  sky: { c: string[]; e: number[] };                         // 5 stops: c[i] at elevation e[i] (deg), smoothstep between
  water: { near: string; mid: string; far: string; crest: string; trough: string; glint: string; shade: C3 };
  bounce: C3;                                                 // shade.ts uBounce: albedo x bounce on shaded faces turned to the lens
  sat: number;                                                // shade.ts uSat: world albedo saturation (1 = as painted)
  cloud: { lit: string; mid: string; shade: string };
};
export const LOOK: Record<LightName, WorldLook> = {
  day: {
    // depth.md 2.2: horizon #9fb6e6 just above the skyline, upper sky #5e93d9 at ~20 deg (grade: frame top #5997e2)
    sky: { c: ["#b8d0ec", "#9cbfea", "#6a9fe0", "#4f8cdb", "#3373cc"], e: [0, 3, 8, 16, 40] },
    water: { near: "#22a7b6", mid: "#167fb2", far: "#1a5596", crest: "#7ddfe8", trough: "#0e4a80", glint: "#ffffff", shade: [0.5, 0.56, 0.72] },
    cloud: { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" },
    bounce: [0, 0, 0],
    sat: 0.96,
  },
  golden: {
    // sunset, not dusk: #ffd08a horizon, peach/orange through ~10 deg, warm rose at 20, muted warm mauve only near the top
    // (the golden grade adds ~+11/255 blue to shadows/mids, so these lean warm)
    sky: { c: ["#ffc47c", "#f7ae78", "#e8967c", "#c4848e", "#8a6f8a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#1e3a6e", mid: "#355f96", far: "#d4a48e", crest: "#d9a088", trough: "#16294f", glint: "#ffe2b0", shade: [0.42, 0.46, 0.72] },
    cloud: { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" },
    bounce: [0.04, 0.02, 0.0],
    sat: 1.1,
  },
  night: {
    sky: { c: ["#1b2650", "#162050", "#101840", "#0b1132", "#060a20"], e: [0, 4, 10, 22, 50] },
    water: { near: "#13254a", mid: "#1a3260", far: "#2b3a6e", crest: "#5d74a8", trough: "#0b1530", glint: "#dfe8ff", shade: [0.4, 0.44, 0.6] },
    cloud: { lit: "#56649a", mid: "#3c4878", shade: "#27305a" },
    bounce: [0, 0, 0],
    sat: 1.0,
  },
  sick: {
    sky: { c: ["#dcd4a2", "#cfca98", "#b7bb8a", "#a0ab80", "#7f9070"], e: [0, 3, 8, 16, 40] },
    water: { near: "#6a6038", mid: "#55502e", far: "#8a8458", crest: "#a89a62", trough: "#3a3420", glint: "#fff6c8", shade: [0.55, 0.55, 0.45] },
    cloud: { lit: "#f4eccc", mid: "#d8d2aa", shade: "#aeae88" },
    bounce: [0.03, 0.03, 0.0],
    sat: 0.95,
  },
  amber: {
    sky: { c: ["#5a3a24", "#4a3020", "#3a261a", "#2a1c14", "#1a120e"], e: [0, 4, 10, 22, 50] },
    water: { near: "#3a2a1a", mid: "#2e2216", far: "#4a3420", crest: "#c08850", trough: "#1a120c", glint: "#ffd090", shade: [0.5, 0.42, 0.4] },
    cloud: { lit: "#8a6040", mid: "#6a4a34", shade: "#4a3428" },
    bounce: [0.05, 0.025, 0.0],
    sat: 1.05,
  },
  grey: {
    sky: { c: ["#aab6c6", "#9eabbe", "#8a99b0", "#7686a2", "#5c6a84"], e: [0, 3, 8, 16, 40] },
    water: { near: "#3a5a70", mid: "#34506a", far: "#7a8ca0", crest: "#9aaabc", trough: "#203448", glint: "#e8eef6", shade: [0.55, 0.58, 0.68] },
    cloud: { lit: "#dfe4ec", mid: "#bcc4d2", shade: "#949eb2" },
    bounce: [0, 0, 0.01],
    sat: 0.72,
  },
  dawn: {
    sky: { c: ["#ffc8a4", "#f8b4a4", "#e2a4b4", "#b0a0c8", "#7a8cc4"], e: [0, 4, 10, 20, 40] },
    water: { near: "#2a4a7a", mid: "#4a6aa0", far: "#e8b4a8", crest: "#f0c0b0", trough: "#1a3058", glint: "#fff0d8", shade: [0.45, 0.46, 0.7] },
    cloud: { lit: "#ffd8c4", mid: "#f0b0b4", shade: "#a4a0cc" },
    bounce: [0.04, 0.02, 0.02],
    sat: 1.08,
  },
};
