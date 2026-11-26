#!/usr/bin/env node
// Regresi pipeline: node ~/.claude/skills/minecraft-story/tests/run_tests.mjs
// Menyalin tests/demo/projects/demo ke folder temp, lalu merusaknya satu per satu dan mengecek tiap cek menangkapnya.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = path.join(SKILL, "tests", "demo", "projects", "demo");
const node = (args, input) => spawnSync(process.execPath, args, { encoding: "utf8", input });
let pass = 0, failN = 0;
const ok = (name, cond, out = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failN++; console.log(`  ✗ ${name}\n${out.split("\n").map((l) => "      " + l).join("\n")}`); }
};

function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcs-test-"));
  const p = path.join(root, "projects", "demo");
  fs.cpSync(DEMO, p, { recursive: true });
  for (const f of fs.readdirSync(path.join(p, "shots"))) if (f.endsWith(".json")) fs.rmSync(path.join(p, "shots", f));
  fs.rmSync(path.join(p, ".wave"), { recursive: true, force: true });
  return p;
}
const J = (p, rel) => JSON.parse(fs.readFileSync(path.join(p, rel), "utf8"));
const W = (p, rel, obj) => fs.writeFileSync(path.join(p, rel), typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
const compile = (p, ...a) => { const r = node([path.join(SKILL, "scripts/compile_shots.mjs"), p, ...a]); return { code: r.status, out: r.stdout + r.stderr }; };
const own = (p, ...a) => { const r = node([path.join(SKILL, "scripts/check_ownership.mjs"), p, ...a]); return { code: r.status, out: r.stdout + r.stderr }; };

console.log("compile_shots");
{
  const p = fresh(); const r = compile(p);
  ok("fixture bersih lolos", r.code === 0 && /total 4050\/4050/.test(r.out), r.out);
  const s = J(p, "shots/s02.json");
  ok("start_word 'door' memotong s02 di detik 3.0 (frame 90)", s.start_frame === 90 && s.frames === 96, JSON.stringify(s).slice(0, 200));
  ok("key kamera t → frame", s.camera.keys[1].f === 96);
  ok("output ditandai compiled + timing vo", s.compiled === true && s.timing === "vo");
  const s1 = J(p, "shots/s01.json"), s3 = J(p, "shots/s03.json");
  ok("anchor = tengah blok (off 0 → x.5, z.5)", JSON.stringify(s1.actors[0].at) === "[12.5,65,10.5]", JSON.stringify(s1.actors));
  ok("pre memuat chunk set (forceload)", s3.pre[0] === "forceload add 512 0 528 16", s3.pre[0]);
  ok("fakes_all berisi semua fake player project", JSON.stringify(s3.fakes_all) === '["Ruby"]', JSON.stringify(s3.fakes_all));
  const k = s.camera.keys[0];
  ok("key kamera punya yaw/pitch (kamera di -z melihat ke +z, sedikit menunduk)", k.yaw === 0 && k.pitch > 0 && k.pitch < 10, JSON.stringify(k));
}
{
  const p = fresh(); const c = J(p, "shots/s01/camera.json"); c.keys[1].fov = 30; W(p, "shots/s01/camera.json", c); const r = compile(p);
  ok("fov berubah di dalam shot → WARN", /WARN s01: camera\.keys: fov berubah/.test(r.out), r.out);
}
const mut = (name, fn, re, extra = []) => {
  const p = fresh(); fn(p); const r = compile(p, ...extra);
  ok(name, r.code === 1 && re.test(r.out), r.out);
};
mut("aktor berdiri di bunga → menembus blok", (p) => { const v = J(p, "shots/s01/visual.json"); v.actors[0].off = [-8, 0, 0]; W(p, "shots/s01/visual.json", v); }, /actor ruby: blok cornflower di kaki/);
mut("aktor melayang", (p) => { const v = J(p, "shots/s01/visual.json"); v.actors[0].off = [0, 2, 0]; W(p, "shots/s01/visual.json", v); }, /tidak ada lantai/);
mut("kamera di dalam pintu", (p) => { const c = J(p, "shots/s01/camera.json"); c.keys[0].pos = { anchor: "ruby_door", off: [0, 0, 0] }; W(p, "shots/s01/camera.json", c); }, /kamera key 0 di dalam blok oak_door/);
mut("kamera di luar bbox", (p) => { const c = J(p, "shots/s02/camera.json"); c.keys[0].pos.off = [0, 0, -14]; W(p, "shots/s02/camera.json", c); }, /kamera key 0 .* di luar bbox/);
mut("key di lapisan yang salah", (p) => { const v = J(p, "shots/s01/visual.json"); v.camera = {}; W(p, "shots/s01/visual.json", v); }, /visual\.json: key "camera" bukan milik lapisan ini/);
mut("jarak set < 256", (p) => { const l = J(p, "LAYOUT.json"); l.sets.well.origin = [100, 64, 0]; W(p, "LAYOUT.json", l); }, /jarak set street ↔ well/);
mut("subject di luar area aman Shorts", (p) => { const c = J(p, "shots/s03/camera.json"); c.keys.forEach((k) => (k.look.off = [2.5, -0.6, 0])); W(p, "shots/s03/camera.json", c); }, /di luar area aman Shorts/);
mut("start_word tidak ada di beat", (p) => { const b = J(p, "shots/s02/base.json"); b.start_word = { word: "dragon", nth: 1 }; W(p, "shots/s02/base.json", b); }, /start_word "dragon"/);
mut("lapisan hilang", (p) => fs.rmSync(path.join(p, "shots/s02/camera.json")), /camera\.json \(camera-director\)/);
mut("anchor tidak dikenal", (p) => { const v = J(p, "shots/s03/visual.json"); v.actors[0].anchor = "ruby_mark"; W(p, "shots/s03/visual.json", v); }, /anchor "ruby_mark" tidak ada di set well/);
mut("delta di luar bbox", (p) => { const w = J(p, "shots/s01/world.json"); w.delta = ["setblock 600 65 5 minecraft:stone"]; W(p, "shots/s01/world.json", w); }, /command di luar bbox set street/);
mut("koordinat relatif (~) ditolak", (p) => { const w = J(p, "shots/s01/world.json"); w.delta = ["setblock ~ ~ ~ minecraft:stone"]; W(p, "shots/s01/world.json", w); }, /koordinat harus absolut/);
{
  const p = fresh(); fs.rmSync(path.join(p, "audio/TIMING.md")); const r = compile(p);
  ok("tanpa TIMING.md → estimasi est_frames", /ESTIMASI/.test(r.out) && J(p, "shots/s01.json").timing === "estimate", r.out);
}

console.log("check_ownership");
{
  const p = fresh(); own(p, "--snapshot");
  const c = J(p, "shots/s01/camera.json"); c.move = "static"; W(p, "shots/s01/camera.json", c);
  fs.mkdirSync(path.join(p, "sets/street/build"), { recursive: true }); W(p, "sets/street/SPEC.md", "# street");
  fs.mkdirSync(path.join(p, "REQUESTS")); W(p, "REQUESTS/set-builder__street.md", "anchor cam_front 1 blok ke kiri");
  const r = own(p, "--verify");
  ok("perubahan di wilayah sendiri → PASS", r.code === 0, r.out);
}
{
  const p = fresh(); own(p, "--snapshot"); const l = J(p, "LAYOUT.json"); l.spacing = 300; W(p, "LAYOUT.json", l);
  const r = own(p, "--verify"); ok("LAYOUT.json diubah → FAIL baca saja", r.code === 1 && /BACA SAJA/.test(r.out), r.out);
}
{
  const p = fresh(); own(p, "--snapshot"); const w = J(p, "shots/s01/world.json"); w.set = "well"; W(p, "shots/s01/world.json", w);
  const r = own(p, "--verify"); ok("world.json set salah → FAIL", r.code === 1 && /set-builder salah shot/.test(r.out), r.out);
}
{
  const p = fresh(); own(p, "--snapshot"); W(p, "NOTES.md", "x");
  const r = own(p, "--verify"); ok("file tanpa pemilik → FAIL", r.code === 1 && /NOTES\.md: bukan milik/.test(r.out), r.out);
}
{
  const p = fresh(); own(p, "--snapshot"); fs.mkdirSync(path.join(p, "sets/castle")); W(p, "sets/castle/SPEC.md", "x");
  const r = own(p, "--verify"); ok("folder set di luar LAYOUT → FAIL", r.code === 1 && /folder set "castle"/.test(r.out), r.out);
}

console.log("guard_paths (hook)");
const guard = (agent, input, bash) => node([path.join(SKILL, "scripts/guard_paths.mjs"), agent, ...(bash ? ["--bash"] : [])], JSON.stringify(input)).status;
const fp = (rel) => ({ tool_name: "Write", tool_input: { file_path: `C:\\shorts\\projects\\demo\\${rel.replace(/\//g, "\\")}` } });
ok("camera-director → camera.json boleh", guard("camera-director", fp("shots/s01/camera.json")) === 0);
ok("camera-director → visual.json ditolak", guard("camera-director", fp("shots/s01/visual.json")) === 2);
ok("visual-director → LOOK.md boleh", guard("visual-director", fp("LOOK.md")) === 0);
ok("set-builder → LAYOUT.json ditolak", guard("set-builder", fp("LAYOUT.json")) === 2);
ok("set-builder → sets/street/build/x.mcfunction boleh", guard("set-builder", fp("sets/street/build/x.mcfunction")) === 0);
ok("set-builder → REQUESTS/set-builder__street.md boleh", guard("set-builder", fp("REQUESTS/set-builder__street.md")) === 0);
ok("storyboard-director → shots/s01.json (hasil compile) ditolak", guard("storyboard-director", fp("shots/s01.json")) === 2);
ok("tulis di luar projects/ ditolak", guard("visual-director", { tool_name: "Write", tool_input: { file_path: "C:\\tmp\\x.md" } }) === 2);
ok("set-builder Bash rcon ditolak", guard("set-builder", { tool_name: "Bash", tool_input: { command: "node C:/x/scripts/mc/rcon.mjs --file a" } }, true) === 2);
ok("set-builder Bash shot --run ditolak", guard("set-builder", { tool_name: "Bash", tool_input: { command: "node shot.mjs projects/demo/shots/s01.json --run --only prep" } }, true) === 2);
ok("set-builder Bash generator boleh", guard("set-builder", { tool_name: "Bash", tool_input: { command: "node sets/street/street.mjs > sets/street/build/street.mcfunction" } }, true) === 0);

console.log("shot.mjs");
{
  const p = fresh(); compile(p);
  const r = node([path.join(SKILL, "scripts/mc/shot.mjs"), path.join(p, "shots/s03.json"), "--dry", "--no-log"]);
  const lines = r.stdout.split("\n").filter((l) => l.startsWith("["));
  const iU = lines.findIndex((l) => l === "[take] tick unfreeze"), iS = lines.findIndex((l) => l.startsWith("[take] script in crowd run wander("));
  ok("take: unfreeze sebelum scarpet", iU >= 0 && iS > iU, r.stdout);
  ok("script load ada di prep (section load)", lines.some((l) => l === "[load] script load crowd"));
  ok("string scarpet pakai kutip tunggal", lines.some((l) => l.includes("wander('minecraft:villager', 3, [520.5, 65, 8.5], 5, 2)")), r.stdout);
  ok("aktor dapat CustomName + Rotation", lines.some((l) => /summon minecraft:villager .*CustomName:'"kid1"',Rotation:\[-90f,0f\]/.test(l)), r.stdout);
  ok("mob default NoAI (tidak jalan pergi saat unfreeze)", lines.some((l) => /summon minecraft:villager .*NoAI:1b,Silent:1b,Invulnerable:1b/.test(l)), r.stdout);
  const iK = lines.findIndex((l) => l === "[actors] player Ruby kill"), iSm = lines.findIndex((l) => l.startsWith("[actors] summon"));
  ok("fake player shot lain dikeluarkan sebelum summon", iK >= 0 && iSm > iK, r.stdout);
  ok("pre: forceload lebih dulu, tick freeze terakhir", lines[0].startsWith("[pre] forceload add") && lines.filter((l) => l.startsWith("[pre]")).pop() === "[pre] tick freeze", r.stdout);
  ok("catatan kamera memuat perintah /tp inspeksi", /inspeksi framing .*\/tp @s [\d. -]+/.test(r.stdout), r.stdout);
  {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mcs-cfg-"));
    fs.writeFileSync(path.join(cwd, ".rcon.json"), JSON.stringify({ tick_freeze: "tick freeze on", tick_unfreeze: "tick freeze off" }));
    const o = spawnSync(process.execPath, [path.join(SKILL, "scripts/mc/shot.mjs"), path.join(p, "shots/s03.json"), "--dry", "--no-log"], { encoding: "utf8", cwd }).stdout;
    ok(".rcon.json bisa mengganti command freeze/unfreeze", o.includes("[pre] tick freeze on") && o.includes("[take] tick freeze off"), o);
  }
  const raw = node([path.join(SKILL, "scripts/mc/shot.mjs"), path.join(p, "shots/s03/base.json"), "--dry", "--no-log"]);
  ok("file bukan hasil compile ditolak", raw.status === 1 && /bukan hasil compile/.test(raw.stderr), raw.stderr);
}

console.log("rcon.mjs (deteksi balasan gagal)");
{
  const { failureOf } = await import(pathToFileURL(path.join(SKILL, "scripts/mc/rcon.mjs")).href);
  ok("'Unknown or incomplete command' = gagal", !!failureOf("Unknown or incomplete command, see below for error\ntick unfreeze<--[HERE]"));
  ok("'That position is not loaded' = gagal", !!failureOf("That position is not loaded"));
  ok("balasan scarpet 'actor not found' = gagal", !!failureOf(" = actor not found: ruby"));
  ok("'Successfully filled' = berhasil", failureOf("Successfully filled 320 block(s)") === null);
  ok("'No blocks were filled' = berhasil (build ulang)", failureOf("No blocks were filled") === null);
  ok("'Too many blocks' (fill > 32768) = gagal", failureOf("Too many blocks in the specified area (maximum 32768, specified 33489)") !== null);
  ok("'Summoned new Villager' = berhasil", failureOf("Summoned new Villager") === null);
}

console.log(`\n${pass} lolos, ${failN} gagal`);
process.exit(failN ? 1 : 0);
