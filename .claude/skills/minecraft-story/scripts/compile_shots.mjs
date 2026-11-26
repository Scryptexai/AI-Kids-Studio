#!/usr/bin/env node
// Gabung lapisan shot → shots/<shot>.json yang siap dijalankan shot.mjs.
//   node ~/.claude/skills/minecraft-story/scripts/compile_shots.mjs projects/<slug> [--shot s01,s02] [--partial] [--dry]
//
// Lapisan (satu pemilik per file, lihat ownership.json):
//   shots/<shot>/base.json    storyboard-director   (set, tag, size, subject, must_see, start_word, ...)
//   shots/<shot>/world.json   set-builder           (build file/schem, delta commands)
//   shots/<shot>/visual.json  visual-director       (time, weather, light, actors, scarpet)
//   shots/<shot>/camera.json  camera-director       (move, keys dengan t 0..1 relatif anchor)
// + LAYOUT.json (origin, size, front, anchors per set) + audio/TIMING.md (+ audio/words.json opsional).
//
// Cek: key di luar lapisannya, set/anchor tidak dikenal, t tidak valid, kamera & aktor & command blok di luar bbox set,
// jarak antar set < spacing, total frame ≠ 4050, framing subject (area aman Shorts) dan must_see di frame.
// Tanpa audio/TIMING.md → frame dari base.est_frames, output ditandai "timing": "estimate".
import fs from "node:fs";
import path from "node:path";

// ---------- schema per lapisan ----------
const LAYER_KEYS = {
  base: ["shot", "order", "title", "beat", "set", "tag", "size", "subject", "must_see", "cast", "action", "intent", "start_word", "transition", "sfx", "est_frames", "notes"],
  world: ["set", "build", "delta", "notes"],
  visual: ["time", "weather", "light", "actors", "scarpet", "notes"],
  camera: ["engine", "move", "size", "keys", "notes"],
};
const LAYER_OWNER = { base: "storyboard-director", world: "set-builder", visual: "visual-director", camera: "camera-director" };
const TAGS = ["[CODE]", "[BBS]", "[ANIM]"];
const SIZES = ["EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU"];
const MOVES = ["static", "push-in", "pull-back", "orbit", "crane-up", "top-down", "whip-pan", "parallax", "handheld"];
const FRONTS = ["-z", "+z", "-x", "+x"];
const SAFE = { x0: 4, x1: 84, y0: 8, y1: 75 }; // % frame, Shorts UI
const AIRS = new Set(["air", "cave_air", "void_air", "light", "structure_void"]); // blok yang boleh ditembus aktor/kamera
const _setCache = {};
const GAMERULES = [
  "gamerule doDaylightCycle false", "gamerule doWeatherCycle false", "gamerule doMobSpawning false",
  "gamerule randomTickSpeed 0", "gamerule doFireTick false", "gamerule doMobLoot false", "gamerule doTileDrops false",
];

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { project: null, shots: null, partial: false, dry: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--shot") opt.shots = argv[++i].split(",").map((s) => s.trim().toLowerCase());
  else if (a === "--partial") opt.partial = true;
  else if (a === "--dry") opt.dry = true;
  else if (a === "-h" || a === "--help") { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\nimport")[0]); process.exit(0); }
  else opt.project = a;
}
if (!opt.project) { console.error("pakai: compile_shots.mjs projects/<slug> [--shot s01] [--partial] [--dry]"); process.exit(1); }
const P = path.resolve(opt.project);
const rd = (rel) => JSON.parse(fs.readFileSync(path.join(P, rel), "utf8"));
const has = (rel) => fs.existsSync(path.join(P, rel));

// ---------- vec helpers ----------
const add = (a, b) => a.map((v, i) => v + (b?.[i] ?? 0));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const nrm = (a) => { const l = len(a) || 1; return a.map((v) => v / l); };
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const r3 = (v) => Math.round(v * 1000) / 1000;
const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const FACING_YAW = { "+z": 0, "-x": 90, "-z": 180, "+x": -90 }; // Minecraft yaw: 0 = selatan (+z)
const yawToward = (from, to) => { const d = sub(to, from); return r3((Math.atan2(-d[0], d[2]) * 180) / Math.PI); };
const pitchToward = (from, to) => { const d = sub(to, from); return r3((-Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180) / Math.PI); }; // Minecraft: + = menunduk
const CENTER = [0.5, 0, 0.5]; // anchor = TENGAH blok (x, z); y = dasar blok. off [0,0,0] → aktor berdiri di tengah blok.

// ---------- global ----------
const issues = []; // {shot, level: FAIL|WARN, msg}
const fail = (shot, msg) => issues.push({ shot, level: "FAIL", msg });
const warn = (shot, msg) => issues.push({ shot, level: "WARN", msg });

if (!has("LAYOUT.json")) { console.error("LAYOUT.json tidak ada — storyboard-director belum selesai (GATE 5)."); process.exit(1); }
const layout = rd("LAYOUT.json");
const FPS = layout.fps ?? 30;
const TOTAL = layout.total_frames ?? 4050;
const SPACING = layout.spacing ?? 256;
const sets = layout.sets ?? {};

// ---------- LAYOUT checks ----------
const bbox = {};
for (const [name, s] of Object.entries(sets)) {
  if (!isVec(s.origin) || !isVec(s.size)) { fail("LAYOUT", `set ${name}: origin/size harus [x,y,z]`); continue; }
  if (!FRONTS.includes(s.front)) fail("LAYOUT", `set ${name}: front harus salah satu ${FRONTS.join(" ")}`);
  bbox[name] = { min: s.origin, max: add(s.origin, s.size) };
  for (const [an, a] of Object.entries(s.anchors ?? {})) {
    if (!isVec(a.at)) fail("LAYOUT", `set ${name} anchor ${an}: at harus [dx,dy,dz]`);
    else if (!inBox(add(s.origin, a.at), bbox[name])) fail("LAYOUT", `set ${name} anchor ${an} di luar bbox set`);
    if (!["actor", "landmark", "cam_entry"].includes(a.kind)) fail("LAYOUT", `set ${name} anchor ${an}: kind harus actor|landmark|cam_entry`);
  }
}
const names = Object.keys(bbox);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = bbox[names[i]], b = bbox[names[j]];
  const gx = Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0], 0);
  const gz = Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2], 0);
  const gap = Math.max(gx, gz);
  if (gap < SPACING) fail("LAYOUT", `jarak set ${names[i]} ↔ ${names[j]} = ${gap} blok (< ${SPACING})`);
}
function inBox(p, b, pad = 0) { return p.every((v, i) => v >= b.min[i] - pad && v <= b.max[i] + pad); }

// ---------- shots ----------
const shotDir = path.join(P, "shots");
let shotNames = fs.existsSync(shotDir) ? fs.readdirSync(shotDir).filter((d) => fs.statSync(path.join(shotDir, d)).isDirectory()) : [];
const loaded = [];
for (const sh of shotNames) {
  const L = {};
  for (const layer of Object.keys(LAYER_KEYS)) {
    const rel = `shots/${sh}/${layer}.json`;
    if (!has(rel)) continue;
    try { L[layer] = rd(rel); } catch (e) { fail(sh, `${rel}: JSON rusak (${e.message})`); }
  }
  if (!L.base) { fail(sh, "base.json tidak ada"); continue; }
  loaded.push({ sh, L });
}
loaded.sort((a, b) => (a.L.base.order ?? 1e9) - (b.L.base.order ?? 1e9) || a.sh.localeCompare(b.sh));
// semua fake player di project: shot.mjs mengeluarkan mereka di tiap prep (fake player tidak kena `kill @e[tag=mcs_actor]`)
const FAKES_ALL = [...new Set(loaded.flatMap(({ L }) => (L.visual?.actors ?? []).filter((a) => a?.fake).map((a) => String(a.fake))))].sort();

// ---------- timing ----------
const timing = readTiming();
const frameOf = assignFrames(loaded, timing);

// ---------- compile per shot ----------
const out = [];
for (const { sh, L } of loaded) {
  if (opt.shots && !opt.shots.includes(sh.toLowerCase())) continue;
  const missing = Object.keys(LAYER_KEYS).filter((l) => !L[l]);
  if (missing.length) {
    const msg = `lapisan belum ada: ${missing.map((l) => `${l}.json (${LAYER_OWNER[l]})`).join(", ")}`;
    if (opt.partial) warn(sh, msg); else fail(sh, msg);
    continue;
  }
  for (const [layer, obj] of Object.entries(L)) {
    for (const k of Object.keys(obj)) if (!LAYER_KEYS[layer].includes(k)) fail(sh, `${layer}.json: key "${k}" bukan milik lapisan ini (milik: ${ownerOfKey(k)})`);
  }
  const { base, world, visual, camera } = L;
  if (base.shot && base.shot.toLowerCase() !== sh.toLowerCase()) fail(sh, `base.shot "${base.shot}" ≠ nama folder`);
  const setName = base.set;
  const S = sets[setName];
  if (!S) { fail(sh, `set "${setName}" tidak ada di LAYOUT.json`); continue; }
  if (world.set !== setName) fail(sh, `world.json set "${world.set}" ≠ base.json set "${setName}"`);
  if (!TAGS.includes(base.tag)) fail(sh, `base.tag harus ${TAGS.join(" / ")}`);
  if (!SIZES.includes(base.size)) fail(sh, `base.size harus ${SIZES.join(" / ")}`);
  const box = bbox[setName];
  const anchorPos = (name) => { const a = S.anchors?.[name]; return a && isVec(a.at) ? add(add(S.origin, a.at), CENTER) : null; };

  // actors
  const actors = [];
  const actorPos = {};
  for (const a of visual.actors ?? []) {
    if (!a.id) { fail(sh, "visual.actors[]: id wajib"); continue; }
    const base0 = anchorPos(a.anchor);
    if (!base0) { fail(sh, `actor ${a.id}: anchor "${a.anchor}" tidak ada di set ${setName}`); continue; }
    const at = add(base0, a.off ?? [0, 0, 0]).map(r3);
    if (!inBox(at, box)) fail(sh, `actor ${a.id} di ${at.join(",")} di luar bbox set ${setName}`);
    actorPos[a.id] = at;
    let yaw = a.yaw;
    if (yaw == null && a.facing) yaw = FACING_YAW[a.facing];
    if (yaw == null && a.face) { const tgt = anchorPos(a.face) ?? null; if (tgt) yaw = yawToward(at, tgt); else fail(sh, `actor ${a.id}: face "${a.face}" bukan anchor`); }
    actors.push({ id: a.id, ...(a.fake ? { fake: a.fake } : { type: a.type ?? "minecraft:villager" }), at, yaw: yaw ?? 0, ...(a.ai ? { ai: true } : {}), ...(a.nbt ? { nbt: a.nbt } : {}), ...(a.skin ? { skin: a.skin } : {}) });
  }
  for (const c of base.cast ?? []) if (!actorPos[c]) fail(sh, `cast "${c}" (base.json) tidak ditempatkan di visual.actors`);
  const resolveRef = (ref, what) => {
    if (!ref) { fail(sh, `${what}: kosong`); return null; }
    let p = null;
    if (ref.anchor) p = anchorPos(ref.anchor);
    else if (ref.actor) p = actorPos[ref.actor] ? add(actorPos[ref.actor], [0, 1.62, 0]) : null;
    if (!p) { fail(sh, `${what}: anchor/actor "${ref.anchor ?? ref.actor}" tidak dikenal`); return null; }
    return add(p, ref.off ?? [0, 0, 0]).map(r3);
  };

  // camera
  const keys = camera.keys ?? [];
  if (!MOVES.includes(camera.move)) fail(sh, `camera.move harus salah satu ${MOVES.join(" ")}`);
  if (keys.length < 2) fail(sh, "camera.keys minimal 2");
  const frames = frameOf[sh]?.frames ?? 0;
  const camKeys = [];
  keys.forEach((k, i) => {
    if (typeof k.t !== "number" || k.t < 0 || k.t > 1) fail(sh, `camera.keys[${i}].t harus 0..1`);
    if (i > 0 && !(k.t > keys[i - 1].t)) fail(sh, `camera.keys[${i}].t harus naik`);
    const pos = resolveRef(k.pos, `camera.keys[${i}].pos`);
    const look = resolveRef(k.look, `camera.keys[${i}].look`);
    if (pos && !inBox(pos, box)) fail(sh, `kamera key ${i} di ${pos.join(",")} di luar bbox set ${setName}`);
    const aim = pos && look && len(sub(look, pos)) > 1e-6 ? { yaw: yawToward(pos, look), pitch: pitchToward(pos, look) } : {};
    camKeys.push({ t: k.t, f: Math.round((k.t ?? 0) * frames), pos, look, ...aim, fov: k.fov ?? 70 });
  });
  if ((camera.engine ?? "replaymod") === "replaymod" && new Set(camKeys.map((k) => k.fov)).size > 1)
    warn(sh, "camera.keys: fov berubah di dalam shot — camera path ReplayMod tidak punya keyframe FOV (cek versimu); pakai satu fov per shot, zoom lewat posisi");
  if (keys.length && keys[0].t !== 0) fail(sh, "camera.keys pertama harus t 0");
  if (keys.length && keys[keys.length - 1].t !== 1) fail(sh, "camera.keys terakhir harus t 1");

  // world commands
  const light = visual.light ?? [];
  const delta = world.delta ?? [];
  for (const c of [...light, ...delta]) checkCmdInBox(sh, c, box, setName);
  const build = world.build ?? {};
  if (build.file && !has(build.file)) warn(sh, `world.build.file belum ada: ${build.file}`);
  if (build.file && !build.file.replace(/\\/g, "/").startsWith(`sets/${setName}/`)) fail(sh, `world.build.file harus di sets/${setName}/`);

  // occupancy: aktor berdiri di udara di atas lantai padat, kamera di udara (dari file build + delta + light)
  const blocks = build.file && has(build.file) ? baseBlocks(setName, build.file, box) : null;
  if (blocks) {
    const over = new Map();
    for (const c of [...delta, ...light]) applyCmd(over, c);
    const at = (x, y, z) => { const k = `${x},${y},${z}`; return over.has(k) ? over.get(k) : blocks.get(k) ?? "air"; };
    const fl = Math.floor;
    for (const [id, p] of Object.entries(actorPos)) {
      const [x, y, z] = [fl(p[0]), fl(p[1]), fl(p[2])];
      for (const dy of [0, 1]) { const b = at(x, y + dy, z); if (!isAir(b)) fail(sh, `actor ${id}: blok ${b} di ${dy ? "kepala" : "kaki"} (${x},${y + dy},${z}) — aktor menembus blok`); }
      if (isAir(at(x, y - 1, z))) fail(sh, `actor ${id}: tidak ada lantai di bawah kaki (${x},${y - 1},${z}) — melayang`);
    }
    camKeys.forEach((k, i) => {
      if (!k.pos) return;
      const b = at(fl(k.pos[0]), fl(k.pos[1]), fl(k.pos[2]));
      if (!isAir(b)) fail(sh, `kamera key ${i} di dalam blok ${b} (${k.pos.map(fl).join(",")})`);
    });
  } else if (build.mode === "schem") warn(sh, "mode schem: cek blok (aktor/kamera menembus) dilewati");

  // scarpet: arg {anchor, off} / {actor, off} → [x,y,z]
  const scarpet = (visual.scarpet ?? []).map((s, i) => {
    if (!s.app || !s.fn) fail(sh, `visual.scarpet[${i}]: app & fn wajib`);
    const res = (v) => Array.isArray(v) ? v.map(res) : v && typeof v === "object" ? resolveRef(v, `scarpet[${i}] arg`) : v;
    const args = (s.args ?? []).map(res);
    JSON.stringify(args).replace(/\[(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\]/g, (m, x, y, z) => {
      if (!inBox([+x, +y, +z], box, 2)) warn(sh, `scarpet ${s.app}.${s.fn}: posisi ${x},${y},${z} di luar bbox`);
      return m;
    });
    return { app: s.app, fn: s.fn, args };
  });

  // framing
  if (camKeys.every((k) => k.pos && k.look)) checkFraming(sh, base, camKeys, actorPos, anchorPos);

  if (!Number.isInteger(visual.time) || visual.time < 0 || visual.time > 24000) fail(sh, "visual.time harus tick 0..24000");
  if (!["clear", "rain", "thunder"].includes(visual.weather)) fail(sh, "visual.weather harus clear|rain|thunder");

  const compiled = {
    compiled: true,
    _note: "HASIL compile_shots.mjs — jangan edit. Ubah lapisan di shots/<shot>/*.json lalu compile ulang.",
    shot: sh, title: base.title ?? "", tag: base.tag, size: base.size, set: setName,
    start_frame: frameOf[sh]?.start ?? 0, frames, fps: FPS, timing: timing ? "vo" : "estimate",
    pre: [forceload(box), ...GAMERULES, `time set ${visual.time}`, `weather ${visual.weather}`, "tick freeze"],
    fakes_all: FAKES_ALL,
    build: { mode: build.mode ?? "file", ...(build.file ? { file: build.file } : {}), ...(build.schem ? { schem: build.schem } : {}), origin: S.origin, commands: [...delta, ...light] },
    actors,
    scarpet,
    camera: { engine: camera.engine ?? "replaymod", move: camera.move, size: camera.size ?? base.size, keys: camKeys },
    post: [],
    render: { w: 1080, h: 1920, fps: FPS, out: `captures/${sh}/render.mp4` },
  };
  out.push({ sh, compiled });
}

// total frames
const sum = Object.values(frameOf).reduce((s, x) => s + x.frames, 0);
if (loaded.length && !opt.shots) {
  if (sum !== TOTAL) (timing ? fail : warn)("TOTAL", `total frame ${sum} ≠ ${TOTAL}${timing ? "" : " (estimasi)"}`);
}

// ---------- write + report ----------
const failedShots = new Set(issues.filter((i) => i.level === "FAIL").map((i) => i.shot));
if (!opt.dry) {
  for (const { sh, compiled } of out) {
    const dst = path.join(P, "shots", `${sh}.json`);
    if (failedShots.has(sh)) { if (fs.existsSync(dst)) fs.rmSync(dst); continue; } // jangan tinggalkan hasil lama yang basi
    fs.writeFileSync(dst, JSON.stringify(compiled, null, 2) + "\n");
  }
  fs.mkdirSync(path.join(P, ".wave"), { recursive: true });
  fs.writeFileSync(path.join(P, ".wave", "compile.json"), JSON.stringify({ at: new Date().toISOString(), timing: timing ? "vo" : "estimate", total: sum, issues }, null, 2));
}
console.log(`compile_shots: ${out.length} shot, timing ${timing ? "VO (audio/TIMING.md)" : "ESTIMASI (est_frames)"}, total ${sum}/${TOTAL} frame`);
console.log("shot      set               frames  status");
for (const { sh } of loaded) {
  if (opt.shots && !opt.shots.includes(sh.toLowerCase())) continue;
  const st = failedShots.has(sh) ? "FAIL" : issues.some((i) => i.shot === sh) ? "WARN" : "OK";
  console.log(`${sh.padEnd(9)} ${String(loaded.find((x) => x.sh === sh).L.base.set).padEnd(17)} ${String(frameOf[sh]?.frames ?? "?").padStart(6)}  ${st}`);
}
for (const i of issues) console.log(`  ${i.level} ${i.shot}: ${i.msg}`);
process.exitCode = failedShots.size ? 1 : 0;

// ================= helpers =================
// chunk set harus dimuat sebelum fill/summon lewat RCON (set berjarak ratusan blok dari player)
function forceload(box) { return `forceload add ${Math.floor(box.min[0])} ${Math.floor(box.min[2])} ${Math.ceil(box.max[0])} ${Math.ceil(box.max[2])}`; }
// ---- blok dari .mcfunction (fill / setblock) ----
function isAir(b) { return AIRS.has(b); }
function blockId(tok) { return String(tok).replace(/^minecraft:/, "").replace(/[[{].*$/, ""); }
function baseBlocks(setName, file, box) {
  if (_setCache[setName + file]) return _setCache[setName + file];
  const m = new Map();
  const lines = fs.readFileSync(path.join(P, file), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  let outside = 0;
  for (const l of lines) {
    const r = applyCmd(m, l);
    if (r && r.pts.some((p) => !inBox(p, box))) outside++;
  }
  if (outside) fail(setName, `${file}: ${outside} command di luar bbox set`);
  return (_setCache[setName + file] = m);
}
/** terapkan fill/setblock ke Map "x,y,z" → id blok. Return {pts} atau null kalau bukan command blok. */
function applyCmd(m, cmd) {
  const t = String(cmd).trim().replace(/^\//, "").split(/\s+/);
  if (t[0] === "setblock") {
    const [x, y, z] = t.slice(1, 4).map(Number);
    if (![x, y, z].every(Number.isFinite)) return null;
    m.set(`${x},${y},${z}`, blockId(t[4]));
    return { pts: [[x, y, z]] };
  }
  if (t[0] !== "fill") return null;
  const n = t.slice(1, 7).map(Number);
  if (!n.every(Number.isFinite)) return null;
  const id = blockId(t[7]);
  const mode = t[8] ?? "replace";
  const [x0, x1] = [Math.min(n[0], n[3]), Math.max(n[0], n[3])];
  const [y0, y1] = [Math.min(n[1], n[4]), Math.max(n[1], n[4])];
  const [z0, z1] = [Math.min(n[2], n[5]), Math.max(n[2], n[5])];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 2_000_000) return { pts: [[x0, y0, z0], [x1, y1, z1]] };
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const shell = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
    const k = `${x},${y},${z}`;
    if (mode === "hollow") m.set(k, shell ? id : "air");
    else if (mode === "outline") { if (shell) m.set(k, id); }
    else if (mode === "keep") { if (isAir(m.get(k) ?? "air")) m.set(k, id); }
    else m.set(k, id);
  }
  return { pts: [[x0, y0, z0], [x1, y1, z1]] };
}

function ownerOfKey(k) {
  for (const [l, ks] of Object.entries(LAYER_KEYS)) if (ks.includes(k)) return `${l}.json / ${LAYER_OWNER[l]}`;
  return "tidak ada (key tidak dikenal)";
}

function checkCmdInBox(sh, cmd, box, setName) {
  const t = String(cmd).trim().replace(/^\//, "").split(/\s+/);
  const nums = (a) => a.map(Number);
  let pts = [];
  if (t[0] === "setblock") pts = [nums(t.slice(1, 4))];
  else if (t[0] === "fill") pts = [nums(t.slice(1, 4)), nums(t.slice(4, 7))];
  else { warn(sh, `command bukan setblock/fill, tidak dicek bbox: ${cmd}`); return; }
  if (pts.some((p) => p.some((v) => !Number.isFinite(v)))) { fail(sh, `koordinat harus absolut (tanpa ~): ${cmd}`); return; }
  for (const p of pts) if (!inBox(p, box)) fail(sh, `command di luar bbox set ${setName}: ${cmd}`);
}

function readTiming() {
  if (!has("audio/TIMING.md")) return null;
  const toSec = (s) => { s = s.trim(); const m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/); return m ? +m[1] * 60 + +m[2] : +s; };
  const beats = {};
  for (const line of fs.readFileSync(path.join(P, "audio/TIMING.md"), "utf8").split(/\r?\n/)) {
    const c = line.split("|").map((x) => x.trim()).filter(Boolean);
    if (c.length >= 3 && /^B\d+$/i.test(c[0])) beats[c[0].toUpperCase()] = { s: toSec(c[1]), e: toSec(c[2]) };
  }
  const words = has("audio/words.json") ? rd("audio/words.json") : null;
  return { beats, words };
}

function assignFrames(list, tm) {
  const res = {};
  if (!tm) {
    let f = 0;
    for (const { sh, L } of list) {
      const n = L.base.est_frames ?? 0;
      if (!n) warn(sh, "base.est_frames kosong (estimasi 0)");
      res[sh] = { start: f, frames: n }; f += n;
    }
    return res;
  }
  // start detik tiap shot: shot pertama di beat = awal beat; shot berikut = start_word (words.json) atau bagi rata
  const byBeat = {};
  for (const x of list) {
    const b = String(x.L.base.beat ?? "").toUpperCase();
    if (!tm.beats[b]) { fail(x.sh, `beat "${x.L.base.beat}" tidak ada di audio/TIMING.md`); continue; }
    (byBeat[b] ??= []).push(x);
  }
  const starts = [];
  for (const [b, xs] of Object.entries(byBeat)) {
    const { s, e } = tm.beats[b];
    xs.forEach((x, i) => {
      let t = s + ((e - s) * i) / xs.length;
      if (i > 0 && x.L.base.start_word) {
        const sw = typeof x.L.base.start_word === "string" ? { word: x.L.base.start_word, nth: 1 } : x.L.base.start_word;
        if (!tm.words) warn(x.sh, "start_word ada tapi audio/words.json tidak ada — beat dibagi rata");
        else {
          const clean = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, "");
          const hits = tm.words.filter((w) => w.s >= s - 0.05 && w.s < e && clean(w.w) === clean(sw.word));
          const hit = hits[(sw.nth ?? 1) - 1];
          if (hit) t = hit.s; else fail(x.sh, `start_word "${sw.word}" #${sw.nth ?? 1} tidak ditemukan di beat ${b}`);
        }
      }
      starts.push({ sh: x.sh, f: Math.round(t * FPS) });
    });
  }
  starts.sort((a, b) => a.f - b.f);
  if (starts.length) starts[0].f = 0; // hook mulai di frame 0
  starts.forEach((x, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].f : TOTAL; // jeda antar beat ikut shot sebelumnya; tail ikut shot terakhir
    res[x.sh] = { start: x.f, frames: end - x.f };
    if (end - x.f < 15) warn(x.sh, `shot sangat pendek: ${end - x.f} frame`);
  });
  return res;
}

function project(cam, p) {
  const f = nrm(sub(cam.look, cam.pos));
  let r = cross(f, [0, 1, 0]);
  if (len(r) < 1e-6) r = [1, 0, 0]; // top-down murni
  r = nrm(r);
  const u = cross(r, f);
  const d = sub(p, cam.pos);
  const z = dot(d, f);
  if (z <= 0.05) return null; // di belakang kamera
  const tv = Math.tan(((cam.fov ?? 70) * Math.PI) / 360);
  const nx = dot(d, r) / (z * tv * (9 / 16));
  const ny = dot(d, u) / (z * tv);
  return { x: ((nx + 1) / 2) * 100, y: ((1 - ny) / 2) * 100, dist: len(d) };
}

function camAt(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < t) i++;
  const a = keys[i], b = keys[i + 1] ?? a;
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  return { pos: lerp(a.pos, b.pos, k), look: lerp(a.look, b.look, k), fov: a.fov + (b.fov - a.fov) * k };
}

function checkFraming(sh, base, keys, actorPos, anchorPos) {
  const close = ["CU", "ECU", "MCU"].includes(base.size);
  let subj = null;
  if (base.subject && actorPos[base.subject]) subj = add(actorPos[base.subject], [0, close ? 1.62 : 1.0, 0]);
  else if (base.subject) subj = anchorPos(base.subject);
  if (base.subject && !subj) { fail(sh, `subject "${base.subject}" bukan actor di visual.json atau anchor set`); return; }
  for (const t of [0, 0.5, 1]) {
    const cam = camAt(keys, t);
    if (subj) {
      const s = project(cam, subj);
      if (!s) fail(sh, `t=${t}: subject ${base.subject} di belakang kamera`);
      else {
        if (s.x < SAFE.x0 || s.x > SAFE.x1 || s.y < SAFE.y0 || s.y > SAFE.y1)
          fail(sh, `t=${t}: subject ${base.subject} di layar (${s.x.toFixed(0)}%, ${s.y.toFixed(0)}%) — di luar area aman Shorts x ${SAFE.x0}–${SAFE.x1}%, y ${SAFE.y0}–${SAFE.y1}%`);
        if (s.dist < 1.0) warn(sh, `t=${t}: kamera ${s.dist.toFixed(2)} blok dari subject (terlalu dekat?)`);
      }
    }
  }
  for (const m of base.must_see ?? []) {
    const p = actorPos[m] ? add(actorPos[m], [0, 1, 0]) : anchorPos(m);
    if (!p) { fail(sh, `must_see "${m}" bukan actor/anchor`); continue; }
    const seen = [0, 0.5, 1].some((t) => { const s = project(camAt(keys, t), p); return s && s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100; });
    if (!seen) warn(sh, `must_see "${m}" tidak masuk frame di t 0 / 0.5 / 1`);
  }
}
