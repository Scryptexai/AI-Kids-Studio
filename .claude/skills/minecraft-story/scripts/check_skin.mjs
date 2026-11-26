#!/usr/bin/env node
// Validasi skin Minecraft tanpa dependency (PNG RGBA8/RGB8).
//   node scripts/check_skin.mjs projects/<slug>/assets/skins/
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("bukan PNG");
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        w: data.readUInt32BE(0),
        h: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error("IHDR tidak ditemukan");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.color];
  if (ihdr.depth !== 8 || !channels || ihdr.interlace !== 0) {
    return { ...ihdr, pixels: null, channels };
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = ihdr.w * bpp;
  const out = Buffer.alloc(stride * ihdr.h);
  let pos = 0;
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const v = row[x];
      let val;
      if (filter === 0) val = v;
      else if (filter === 1) val = v + a;
      else if (filter === 2) val = v + b;
      else if (filter === 3) val = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[x] = val & 0xff;
    }
  }
  return { ...ihdr, pixels: out, channels, bpp, stride };
}

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("Pakai: node scripts/check_skin.mjs assets/skins/");
  process.exit(1);
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
let ok = true;

for (const name of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort()) {
  const p = path.join(dir, name);
  let png;
  try {
    png = readPng(p);
  } catch (e) {
    console.log(`[X] ${name}: ${e.message}`);
    ok = false;
    continue;
  }
  if (!(png.w === 64 && (png.h === 64 || png.h === 32))) {
    console.log(`[X] ${name}: ukuran ${png.w}x${png.h} (harus 64x64 atau 64x32)`);
    ok = false;
    continue;
  }
  if (!png.pixels) {
    console.log(`[?] ${name}: ${png.w}x${png.h} | warna ${png.color}/${png.depth}bit belum didukung, cek manual`);
    continue;
  }
  const px = (x, y) => {
    const o = y * png.stride + x * png.bpp;
    return [png.pixels[o], png.pixels[o + 1], png.pixels[o + 2], png.channels === 4 ? png.pixels[o + 3] : 255];
  };
  let arm;
  if (png.h === 32) arm = "classic (format lama 64x32 — sebaiknya convert ke 64x64)";
  else arm = px(54, 20)[3] === 0 ? "slim (Alex)" : "classic (Steve)";

  const counts = new Map();
  for (let x = 8; x < 16; x++) {
    for (let y = 8; y < 16; y++) {
      const [r, g, b, a] = px(x, y);
      if (a < 128) continue;
      const k = `${r},${g},${b}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const color = top ? hex(...top[0].split(",").map(Number)) : "transparan";
  console.log(`[OK] ${path.basename(name, ".png")}: ${png.w}x${png.h} | arm: ${arm} | warna wajah dominan: ${color}`);
}

if (!ok) process.exit(1);
