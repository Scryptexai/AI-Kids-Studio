// The Tapper's own hand props, drawn here as 16x16 pixel-art sprites (no Mojang art): a coin pouch (full / half),
// a cone megaphone, bread and a sandwich, a fishing rod, a torch, a lantern, a chisel, a hammer, chalk, a cap and a
// coin. Used through ShotDirection.held as "fx:<name>" (McShort adds them to the world as props held by that mob), or
// as flying / resting props through ShotDirection.fxProps. Each internal item name is picked so Actors' grip rules
// hold it right: names ending in rod / torch / stick are held by the handle like a tool, "...bucket" hangs (the lantern),
// the rest are flat items. No red anywhere (house rule: red belongs to Ruby).
import * as THREE from "three";

/** palette letters -> colours */
const P: Record<string, string> = {
  k: "#1b1612", // outline
  b: "#7a5230", B: "#a4733f", t: "#c9965a", // leather / wood: dark, mid, light
  y: "#e8c34a", Y: "#fff0a0", o: "#c88a1e", // gold / flame yellow, highlight, orange-gold
  g: "#7d7f86", G: "#b7bac2", w: "#f2efe6", // iron grey, light iron, white
  c: "#e9d3a0", C: "#f6e7c3", n: "#b98a4c", // bread crust light, crumb, crust dark
  l: "#6cab45", L: "#9bd46a", // lettuce
  s: "#3f6fbf", S: "#77a5e6", // blue (cap, megaphone band)
  m: "#d9d9d9", // chalk
  f: "#ffb347", F: "#fff3c4", // flame orange, flame core
};

/** 16 rows of 16 chars ('.' = clear), drawn top-down */
const ART: Record<string, string[]> = {
  pouch: [
    "................", "................", "......kkkk......", ".....kyyyyk.....", "......kbbk......", ".....kbtBbk.....",
    "....kbBttBbk....", "...kbBBttBBbk...", "...kbBBBBBBbk...", "..kbBBBtBBBBbk..", "..kbBBBBBBBBbk..", "..kbbBBBBBBbbk..",
    "...kbbBBBBbbk...", "....kkbbbbkk....", "......kkkk......", "................"],
  pouch_half: [
    "................", "................", "................", "................", "................", "......kkkk......",
    ".....kbtBbk.....", "....kbBttBbk....", "...kbBBttBBbk...", "...kbBBBBBBbk...", "..kbbBBBBBBbbk..", "..kbbbBBBBbbbk..",
    "...kkbbbbbbkk...", "....kkkkkkkk....", "................", "................"],
  megaphone: [
    "................", "...........kk...", "..........kwwk..", ".........kwGwk..", "........kwGGwk..", ".......kwGGGwk..",
    "......kwGGGGwk..", ".....kkssssssk..", "....kwGGGGGwk...", "...kwGGGGwk.....", "..kgggGGwk......", ".kgkkggwk.......",
    "kgk..kkk........", "kk..............", "................", "................"],
  sandwich: [
    "................", "................", "................", "................", "....kkkkkkkk....", "..kknnccccnnkk..",
    ".kncccCCCCcccnk.", ".kllLlLLlLLlllk.", ".kwwyywwyywwyyk.", ".knncccCCCccnnk.", "..kknnnnnnnnkk..", "....kkkkkkkk....",
    "................", "................", "................", "................"],
  bread: [
    "................", "................", "................", "................", "......kkkk......", "....kknnnnkk....",
    "...knncnncnnk...", "..knccnccnccnk..", "..kncCccCccCnk..", "..knnccnccnnnk..", "...kknnnnnnkk...", ".....kkkkkk.....",
    "................", "................", "................", "................"],
  rod: [
    "...............k", "..............kG", ".............kG.", "............kb..", "...........kb...", "..........kb....",
    ".........kB.....", "........kB......", ".......kB.......", "......kB........", ".....kb.........", "....kgk.........",
    "...kbg..........", "..kbk...........", ".kbk............", "kk.............."],
  torch: [
    "................", "................", "......kk........", ".....kFfk.......", ".....kfFfk......", "......kfk.......",
    "......kbk.......", ".......bk.......", ".......Bk.......", "........B.......", "........b.......", "........bk......",
    ".........b......", ".........k......", "................", "................"],
  lantern: [
    "......kkkk......", "......k..k......", "......kkkk......", ".....kggggk.....", "....kgkkkkgk....", "....kgfFFfgk....",
    "....kgFYYFgk....", "....kgfFFfgk....", "....kgfFFfgk....", "....kgkkkkgk....", ".....kggggk.....", "......kkkk......",
    "................", "................", "................", "................"],
  chisel: [
    "................", "................", "...........kk...", "..........kGGk..", ".........kGGk...", "........kGgk....",
    ".......kGgk.....", "......kggk......", ".....kBbk.......", "....kBbk........", "...kBbk.........", "..kbbk..........",
    "..kbk...........", "..kk............", "................", "................"],
  hammer: [
    "................", "........kkkk....", ".......kgGGgk...", "......kgGGGgk...", ".....kggGGgk....", "......kkgbkk....",
    ".......kBbk.....", "......kBbk......", ".....kBbk.......", "....kBbk........", "...kBbk.........", "..kbbk..........",
    "..kbk...........", "..kk............", "................", "................"],
  chalk: [
    "................", "................", "................", "................", "................", "..........kk....",
    ".........kmwk...", "........kmmk....", ".......kmmk.....", "......kmmk......", ".....kmmk.......", "....kmmk........",
    "....kkk.........", "................", "................", "................"],
  cap: [
    "................", "................", "................", "................", "................", "......kkkk......",
    "....kksssskk....", "...ksSSssssk....", "..ksSssssssskk..", "..kssssssssssk..", "..kkkkkkkkkksskk", "...........kkkk.",
    "................", "................", "................", "................"],
  coin: [
    "................", "................", "................", "................", "................", "......kkkk......",
    ".....kyYYyk.....", "....kyYyyoyk....", "....kyyoyoyk....", "....kyyyooyk....", ".....kyooyk.....", "......kkkk......",
    "................", "................", "................", "................"],
};

/** fx item name -> the internal item name Actors' grip rules read (see the file comment) */
export const FX_ITEM: Record<string, string> = {
  pouch: "fx_pouch", pouch_half: "fx_pouch_half", megaphone: "fx_megaphone", sandwich: "fx_sandwich", bread: "fx_bread",
  rod: "fx_fishing_rod", torch: "fx_torch", lantern: "fx_lantern_bucket", chisel: "fx_chisel_stick", hammer: "fx_hammer_stick",
  chalk: "fx_chalk", cap: "fx_cap", coin: "fx_coin",
};
export const FX_NAMES = Object.keys(ART);

const cache = new Map<string, THREE.CanvasTexture>();
/** the item's sprite texture (cached; tint recolours the blue cap / band, never to red) */
export const fxItemTexture = (name: string, tint?: string): THREE.CanvasTexture => {
  const key = `${name}|${tint ?? ""}`;
  let t = cache.get(key);
  if (t) return t;
  const rows = ART[name] ?? ART.coin;
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d")!;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    let col = P[ch] ?? "#ff00ff";
    if (tint && (ch === "s" || ch === "S")) col = ch === "S" ? shade(tint, 1.25) : tint;
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  cache.set(key, t);
  return t;
};
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
};
/** a lit item glows: the torch flame / lantern core */
export const FX_GLOW: Record<string, string> = { torch: "#ffb347", lantern: "#ffc66b" };
