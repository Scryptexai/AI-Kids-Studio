#!/usr/bin/env node
// Minimal RCON client — no dependencies.
// Usage:
//   node rcon.mjs "time set day"
//   node rcon.mjs --file projects/<slug>/sets/<set>/build/<set>.mcfunction
//   node rcon.mjs --check
// Config: flags > env (MC_RCON_HOST/PORT/PASS) > .rcon.json di cwd > default localhost:25575
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const TYPE_AUTH = 3;
const TYPE_EXEC = 2;
const TYPE_RESPONSE = 0;

// RCON tidak punya kode error: command yang gagal tetap dibalas sebagai teks biasa.
// failureOf() mengenali balasan gagal dari Minecraft / Carpet / scarpet. null = dianggap berhasil.
// "No blocks were filled" sengaja TIDAK dihitung gagal (build ulang set yang sama = idempoten).
const FAIL_PATTERNS = [
  /Unknown or incomplete command/i, /Incorrect argument for command/i, /<--\[HERE\]/,
  /Unknown (block|entity|item|function|game ?rule|dimension|scoreboard)/i,
  /is not loaded/i, /Expected (whitespace|integer|float|double|literal|'|")/i, /Invalid (integer|float|double|name|UUID|block|position|NBT)/i,
  /Could not/i, /Unable to/i, /Failed to/i, /An unexpected error/i, /Error while/i, /Exception/i,
  /No (entity|player) was found/i, /already logged on/i, /Can only manipulate existing players/i,
  /No chunks were (marked|removed)/i,
  /Too many blocks in the specified area/i,
  /not found/i, /butuh minimal/i, /bad path/i, /uneven sizes/i, /Unknown function/i, /\bat pos \d+/i,
];
export function failureOf(response) {
  const r = String(response ?? "");
  const hit = FAIL_PATTERNS.find((re) => re.test(r));
  return hit ? r.trim().split(/\r?\n/)[0].slice(0, 200) : null;
}

export class Rcon {
  constructor(opts = {}) {
    this.host = opts.host ?? "127.0.0.1";
    this.port = Number(opts.port ?? 25575);
    this.password = opts.password ?? "";
    this.timeout = Number(opts.timeout ?? 15000);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.authed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port });
      const fail = (err) => reject(err);
      this.socket.once("error", fail);
      this.socket.setTimeout(this.timeout, () => {
        this.socket.destroy();
        reject(new Error(`RCON timeout ${this.host}:${this.port}`));
      });
      this.socket.once("connect", () => {
        this.socket.removeListener("error", fail);
        this.socket.on("error", (e) => this.#rejectAll(e));
        this.socket.on("close", () => this.#rejectAll(new Error("RCON socket closed")));
        this.socket.on("data", (chunk) => this.#onData(chunk));
        this.#auth().then(resolve, reject);
      });
    });
  }

  #auth() {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => reject(new Error("RCON auth timeout")), this.timeout);
      this.pending.set(id, {
        parts: [],
        settle: (err, body) => {
          clearTimeout(timer);
          if (err) return reject(err);
          if (id === -1 || body === null) return reject(new Error("RCON auth failed (wrong password?)"));
          this.authed = true;
          resolve(this);
        },
        auth: true,
      });
      this.#write(id, TYPE_AUTH, this.password);
    });
  }

  #write(id, type, body) {
    const payload = Buffer.from(body ?? "", "utf8");
    const buf = Buffer.alloc(14 + payload.length);
    buf.writeInt32LE(10 + payload.length, 0);
    buf.writeInt32LE(id, 4);
    buf.writeInt32LE(type, 8);
    payload.copy(buf, 12);
    this.socket.write(buf);
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + len) break;
      const id = this.buffer.readInt32LE(4);
      const type = this.buffer.readInt32LE(8);
      const body = this.buffer.subarray(12, 4 + len - 2).toString("utf8");
      this.buffer = this.buffer.subarray(4 + len);
      this.#onPacket(id, type, body);
    }
  }

  #onPacket(id, type, body) {
    // auth failure comes back with id -1
    const req = this.pending.get(id) ?? (id === -1 ? this.pending.get(this.nextId - 1) : null);
    if (!req) return;
    if (type === TYPE_RESPONSE || req.auth) {
      if (req.auth) {
        this.pending.delete(id === -1 ? this.nextId - 1 : id);
        return req.settle(id === -1 ? new Error("auth rejected") : null, id === -1 ? null : "");
      }
      if (body.length === 0) {
        this.pending.delete(id);
        clearTimeout(req.idle);
        return req.settle(null, req.parts.join("\n"));
      }
      req.parts.push(body);
      clearTimeout(req.idle);
      // Server memecah balasan panjang jadi paket penuh (4096 byte). Paket yang tidak penuh = paket terakhir,
      // jadi tidak perlu menunggu (tanpa ini tiap command makan ≥ 60 ms → build set ribuan command jadi menit).
      if (Buffer.byteLength(body, "utf8") < 4000) {
        this.pending.delete(id);
        return req.settle(null, req.parts.join(""));
      }
      req.idle = setTimeout(() => {
        this.pending.delete(id);
        req.settle(null, req.parts.join(""));
      }, 60);
    }
  }

  #rejectAll(err) {
    for (const [id, req] of this.pending) {
      clearTimeout(req.idle);
      req.settle(err, null);
      this.pending.delete(id);
    }
  }

  send(command) {
    if (!this.authed) return Promise.reject(new Error("RCON not authenticated"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RCON command timeout: ${command}`));
      }, this.timeout);
      this.pending.set(id, {
        parts: [],
        settle: (err, body) => {
          clearTimeout(timer);
          err ? reject(err) : resolve(body);
        },
      });
      this.#write(id, TYPE_EXEC, command);
    });
  }

  close() {
    if (this.socket) this.socket.end();
  }
}

// ---------- CLI ----------
export function resolveConfig(flags = {}) {
  let fileCfg = {};
  const cfgPath = path.resolve(".rcon.json");
  if (fs.existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return {
    host: flags.host ?? process.env.MC_RCON_HOST ?? fileCfg.host ?? "127.0.0.1",
    port: flags.port ?? process.env.MC_RCON_PORT ?? fileCfg.port ?? 25575,
    password: flags.password ?? process.env.MC_RCON_PASS ?? fileCfg.password ?? "",
  };
}

function loadConfig(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" || a === "-f") flags.file = argv[++i];
    else if (a === "--host") flags.host = argv[++i];
    else if (a === "--port") flags.port = argv[++i];
    else if (a === "--pass" || a === "--password") flags.password = argv[++i];
    else if (a === "--check") flags.check = true;
    else if (a === "--quiet" || a === "-q") flags.quiet = true;
    else if (a === "--continue-on-error") flags.continueOnError = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else positional.push(a);
  }
  return { ...flags, ...resolveConfig(flags), positional };
}

function readCommands(cfg) {
  if (cfg.file) {
    return fs
      .readFileSync(cfg.file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));
  }
  if (cfg.positional.length) return cfg.positional;
  return null;
}

const HELP = `RCON client (tanpa dependency)

  node rcon.mjs "<command>"              satu command
  node rcon.mjs --file build.mcfunction  banyak command per baris
  node rcon.mjs --check                  tes koneksi + auth

Opsi: --host 127.0.0.1  --port 25575  --pass <password>
      --quiet  --continue-on-error
Env : MC_RCON_HOST / MC_RCON_PORT / MC_RCON_PASS
File: .rcon.json {"host":"127.0.0.1","port":25575,"password":"..."}
`;

async function main() {
  const cfg = loadConfig(process.argv.slice(2));
  if (cfg.help) return console.log(HELP);

  const commands = readCommands(cfg);
  if (!cfg.check && !commands) {
    console.error(HELP);
    process.exit(1);
  }

  const rcon = new Rcon(cfg);
  try {
    await rcon.connect();
    if (!cfg.quiet) console.error(`# connected ${cfg.host}:${cfg.port}`);
    if (cfg.check) {
      const res = await rcon.send("list");
      console.log(res || "(no response)");
      return;
    }
    let failed = 0;
    for (const cmd of commands) {
      try {
        const res = await rcon.send(cmd);
        const bad = failureOf(res);
        if (bad) throw new Error(`server menolak: ${bad}`);
        if (!cfg.quiet) console.log(`> ${cmd}${res ? `\n${res}` : ""}`);
      } catch (err) {
        failed++;
        console.error(`! ${cmd}\n  ${err.message}`);
        if (!cfg.continueOnError) break;
      }
    }
    if (failed) process.exitCode = 1;
  } finally {
    rcon.close();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1]).replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("rcon.mjs")) main().catch((e) => {
  console.error(`RCON error: ${e.message}`);
  process.exit(1);
});
