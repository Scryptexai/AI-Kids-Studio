#!/usr/bin/env node
// Eksekusi satu shot hasil compile (shots/<shot>.json) → command RCON. Jalankan dari root project (.rcon.json dibaca dari cwd).
//   node ~/.claude/skills/minecraft-story/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --dry
//   node .../shot.mjs ... --run --only prep      (= pre,build,actors,load: dunia beku, set + aktor siap, app scarpet ter-load)
//   node .../shot.mjs ... --run --only take      (= tick unfreeze, lalu panggil scarpet) ← mulai rekam ReplayMod SEBELUM ini
//   node .../shot.mjs ... --run --only post
// Scarpet dipanggil dengan satu bentuk saja: `script in <app> run <fn>(<args>)`.
// Format shot: lihat PIPELINE.md §3 (dibuat oleh scripts/compile_shots.mjs, jangan ditulis tangan).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Rcon, resolveConfig, failureOf } from "./rcon.mjs";

const COMPILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "compile_shots.mjs").replace(/\\/g, "/");
// Command yang boleh "gagal" tanpa menghentikan shot (tidak ada yang dibersihkan / chunk sudah dimuat).
const SOFT = [/^kill @e\[tag=mcs_actor\]/, /^player \S+ kill$/, /^forceload /];
const isSoft = (cmd) => SOFT.some((re) => re.test(cmd));

/** Override command freeze dari .rcon.json: { "tick_freeze": "tick freeze on", "tick_unfreeze": "tick freeze off" }.
 *  Carpet 1.20.1: `tick freeze` = TOGGLE dan `tick unfreeze` belum tentu ada — cek di server lalu isi dua key ini. */
function freezeCfg() {
  try {
    const c = JSON.parse(fs.readFileSync(path.resolve(".rcon.json"), "utf8"));
    return { freeze: c.tick_freeze ?? "tick freeze", unfreeze: c.tick_unfreeze ?? "tick unfreeze" };
  } catch { return { freeze: "tick freeze", unfreeze: "tick unfreeze" }; }
}

const SECTIONS = ["pre", "build", "actors", "load", "take", "post"];
const GROUPS = { prep: ["pre", "build", "actors", "load"], scarpet: ["load", "take"] }; // "scarpet" = alias lama

const HELP = `shot.mjs — jalankan satu shot hasil compile

  node shot.mjs <shots/<shot>.json> [--dry] [--run] [--only prep|take|post|pre,build,actors,load,take,post]

Section:
  pre      forceload chunk set, gamerule determinisme, time, weather, tick freeze
  build    isi build file (.mcfunction) / paste schem + delta & light commands
  actors   bersihkan aktor + fake player lama, lalu summon / fake player di posisi hasil compile
           (CustomName = id aktor; mob default NoAI+Silent+Invulnerable, kecuali actor "ai": true)
  load     script load <app> (di prep, supaya tidak makan waktu take)
  take     tick unfreeze → script in <app> run <fn>(...)
  post     command sesudah take
  prep     = pre,build,actors,load

Opsi:
  --dry        cetak command + tulis captures/<shot>/commands.txt (default)
  --run        kirim ke server via RCON
  --only a,b   batasi section
  --no-log     jangan tulis commands.txt
  --continue   lanjut walau ada command gagal (balasan error dari server dihitung gagal)
  --raw        izinkan file yang bukan hasil compile_shots.mjs (tidak disarankan)
`;

function parseArgs(argv) {
  const out = { file: null, dry: true, run: false, only: null, log: true, cont: false, raw: false, rcon: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") out.dry = true;
    else if (a === "--run") { out.run = true; out.dry = false; }
    else if (a === "--only") out.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--raw") out.raw = true;
    else if (a === "--no-log") out.log = false;
    else if (a === "--continue") out.cont = true;
    else if (a === "--host") out.rcon.host = argv[++i];
    else if (a === "--port") out.rcon.port = argv[++i];
    else if (a === "--pass" || a === "--password") out.rcon.password = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else out.file = a;
  }
  return out;
}

const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
const vec = (v) => (Array.isArray(v) ? v.map(num).join(" ") : "0 0 0");

function scarpetArg(v) {
  if (Array.isArray(v)) return `[${v.map(scarpetArg).join(", ")}]`;
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; // string scarpet = kutip tunggal
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null) return "null";
  return num(v);
}

/** gabung NBT bawaan aktor (nama, arah, persistence, tag) dengan NBT dari shot */
function actorNbt(a) {
  const own = [
    ...(a.id ? [`CustomName:'"${String(a.id).replace(/'/g, "")}"'`] : []),
    `Rotation:[${num(a.yaw ?? 0)}f,${num(a.pitch ?? 0)}f]`,
    "PersistenceRequired:1b",
    ...(a.ai ? [] : ["NoAI:1b", "Silent:1b", "Invulnerable:1b"]), // tanpa ini mob jalan pergi begitu dunia di-unfreeze
    'Tags:["mcs_actor"]',
  ];
  let extra = String(a.nbt ?? "").trim();
  if (extra.startsWith("{")) extra = extra.slice(1, -1).trim();
  return `{${[...own, ...(extra ? [extra] : [])].join(",")}}`;
}

function buildCommands(shot, projectDir, warn) {
  const out = [];
  const fz = freezeCfg();

  for (const c of shot.pre ?? []) out.push({ section: "pre", cmd: c === "tick freeze" ? fz.freeze : c });

  // ---- build ----
  const build = shot.build ?? {};
  if (build.mode === "schem" && build.schem) {
    const name = path.basename(build.schem).replace(/\.schem$/, "");
    const who = build.as ?? "@p";
    out.push({ section: "build", cmd: `execute as ${who} at ${who} run //schem load ${name}` });
    out.push({
      section: "build",
      cmd: `execute as ${who} at ${who} positioned ${vec(build.origin)} run //paste -a`,
    });
    warn.push("mode schem: butuh player online + WorldEdit; origin dipakai sebagai posisi paste");
  } else if (build.file) {
    const p = path.isAbsolute(build.file) ? build.file : path.join(projectDir, build.file);
    if (!fs.existsSync(p)) {
      warn.push(`build.file tidak ada: ${p}`);
    } else {
      fs.readFileSync(p, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
        .forEach((c) => out.push({ section: "build", cmd: c }));
    }
  }
  // delta per shot + light: SELALU sesudah set dasar (file/schem)
  for (const c of build.commands ?? []) out.push({ section: "build", cmd: c });

  // ---- actors ----
  out.push({ section: "actors", cmd: "kill @e[tag=mcs_actor]" }); // bersihkan aktor + kerumunan take sebelumnya
  // fake player tidak kena kill di atas: keluarkan semua fake player project (dari shot mana pun) sebelum spawn
  const fakes = new Set([...(shot.fakes_all ?? []), ...(shot.actors ?? []).filter((a) => a.fake).map((a) => a.fake)]);
  for (const f of fakes) out.push({ section: "actors", cmd: `player ${f} kill` });
  for (const a of shot.actors ?? []) {
    if (a.fake) {
      out.push({
        section: "actors",
        cmd: `player ${a.fake} spawn at ${vec(a.at)} facing ${num(a.yaw ?? 0)} ${num(a.pitch ?? 0)}`,
      });
      continue;
    }
    out.push({ section: "actors", cmd: `summon ${a.type ?? "minecraft:villager"} ${vec(a.at)} ${actorNbt(a)}` });
  }

  // ---- scarpet: load di prep, panggil di take (setelah unfreeze) ----
  const calls = (shot.scarpet ?? []).map((s) => {
    if (typeof s === "string") throw new Error(`scarpet harus objek {app, fn, args}, bukan string: ${s}`);
    const fn = s.fn ?? s.call; // `call` = nama lama
    if (!s.app || !fn) throw new Error(`scarpet butuh app + fn: ${JSON.stringify(s)}`);
    return { app: s.app, fn, args: (s.args ?? []).map(scarpetArg).join(", ") };
  });
  for (const app of new Set(calls.map((c) => c.app))) out.push({ section: "load", cmd: `script load ${app}` });
  out.push({ section: "take", cmd: fz.unfreeze });
  for (const c of calls) out.push({ section: "take", cmd: `script in ${c.app} run ${c.fn}(${c.args})` });

  for (const c of shot.post ?? []) out.push({ section: "post", cmd: c });

  return out;
}

function cameraNotes(shot) {
  const cam = shot.camera;
  if (!cam) return [];
  const fps = shot.fps ?? 30;
  const lines = [`# camera engine: ${cam.engine ?? "replaymod"}`];
  for (const k of cam.keys ?? []) {
    lines.push(
      `#   key f${k.f} (t=${num((k.f ?? 0) / fps)}s) pos ${vec(k.pos)} look ${vec(k.look)}` +
        (k.yaw != null ? ` yaw ${num(k.yaw)} pitch ${num(k.pitch ?? 0)}` : "") +
        (k.fov ? ` fov ${num(k.fov)}` : "")
    );
  }
  const k0 = (cam.keys ?? [])[0];
  if (k0?.pos && k0.yaw != null) lines.push(`#   inspeksi framing (ketik di chat client): /tp @s ${vec(k0.pos)} ${num(k0.yaw)} ${num(k0.pitch ?? 0)}`);
  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const shotPath = path.resolve(args.file);
  if (!fs.existsSync(shotPath)) {
    console.error(`Shot tidak ada: ${shotPath}`);
    process.exit(1);
  }
  const shot = JSON.parse(fs.readFileSync(shotPath, "utf8"));
  const m = shotPath.replace(/\\/g, "/").match(/^(.*)\/shots\//);
  const projectDir = m ? path.resolve(m[1]) : process.cwd();

  if (!shot.compiled && !args.raw) {
    console.error(
      `${path.basename(shotPath)} bukan hasil compile. Jalankan dulu:\n` +
        `  node ${COMPILE} ${path.relative(process.cwd(), projectDir) || "."}\n` +
        `(atau --raw kalau memang sengaja)`
    );
    process.exit(1);
  }

  const warn = [];
  let list = buildCommands(shot, projectDir, warn);
  if (args.only) {
    if (args.only.includes("scarpet")) warn.push("--only scarpet = alias lama → load,take (take sudah termasuk tick unfreeze)");
    const keep = new Set(args.only.flatMap((s) => GROUPS[s] ?? [s]));
    const unknown = [...keep].filter((s) => !SECTIONS.includes(s));
    if (unknown.length) {
      console.error(`section tidak dikenal: ${unknown.join(", ")} (pilihan: ${SECTIONS.join(", ")}, prep)`);
      process.exit(1);
    }
    list = list.filter((x) => keep.has(x.section));
  }

  const fps = shot.fps ?? 30;
  const seconds = shot.frames ? (shot.frames / fps).toFixed(2) : "?";
  console.log(`# shot ${shot.shot ?? path.basename(shotPath)} — ${shot.title ?? ""}`);
  console.log(`# ${shot.frames ?? 0} frames @ ${fps}fps = ${seconds}s | ${list.length} commands`);
  for (const w of warn) console.log(`# WARN ${w}`);
  for (const line of cameraNotes(shot)) console.log(line);

  if (args.log) {
    const dir = path.join(projectDir, "captures", shot.shot ?? path.basename(shotPath, ".json"));
    fs.mkdirSync(dir, { recursive: true });
    const body = [...cameraNotes(shot), ...list.map((x) => x.cmd)].join("\n") + "\n";
    fs.writeFileSync(path.join(dir, "commands.txt"), body);
    console.log(`# log: ${path.relative(projectDir, path.join(dir, "commands.txt"))}`);
  }

  if (args.dry) {
    for (const x of list) console.log(`[${x.section}] ${x.cmd}`);
    return;
  }

  const rcon = new Rcon(resolveConfig(args.rcon));
  await rcon.connect();
  let failed = 0;
  try {
    for (const x of list) {
      try {
        const res = await rcon.send(x.cmd);
        const bad = failureOf(res);
        if (bad && isSoft(x.cmd)) { console.log(`--  [${x.section}] ${x.cmd} -> ${bad} (diabaikan)`); continue; }
        if (bad) throw new Error(`server menolak: ${bad}`);
        console.log(`ok  [${x.section}] ${x.cmd}${res ? ` -> ${res}` : ""}`);
      } catch (err) {
        failed++;
        console.error(`ERR [${x.section}] ${x.cmd}\n    ${err.message}`);
        if (!args.cont) break;
      }
    }
  } finally {
    rcon.close();
  }
  if (failed) {
    console.error(`\n${failed} command GAGAL — shot ini belum siap. Perbaiki penyebabnya lalu ulangi section yang sama.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`shot.mjs error: ${e.message}`);
  process.exit(1);
});
