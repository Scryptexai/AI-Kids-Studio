# PIPELINE — dari lapisan shot ke frame

Dokumen operasional. Dibaca mulai Step 5. Semua path file project relatif ke `projects/<slug>/`.
`SKILL` = `~/.claude/skills/minecraft-story`, dan semua script dipanggil dengan path absolut.

## 1. Arsitektur

```
SCRIPT.md + CAST.md
        │  Step 5 (storyboard-director)
        ▼
SHOTLIST.md  LAYOUT.json  shots/<shot>/base.json         ── GATE 5 → BACA SAJA
        │  Step 6 Wave Produksi (paralel, tanpa server)
        ├── set-builder ×N  ─► sets/<set>/**  shots/<shot>/world.json
        ├── visual-director ─► LOOK.md        shots/<shot>/visual.json
        └── camera-director ─► shots/<shot>/camera.json
        │
        ▼
check_ownership.mjs --verify ─► compile_shots.mjs ─► shots/<shot>.json (compiled) ─► continuity-checker ── GATE 6
        │  Step 7: audio/TIMING.md + words.json → compile ulang (timing vo) ── GATE 7
        ▼
shot.mjs --only prep ─► RCON ─► server: forceload, gamerule, fill/setblock, summon, script load
shot.mjs --only take ─► unfreeze + script in <app> run <fn>(…)  (ReplayMod sedang merekam)
        │
        ├── ReplayMod camera path (camera.keys: pos + yaw/pitch, f/30 detik) ─► render ─► captures/<shot>/render.mp4
        ▼
assemble.mjs (cek frame per shot → concat → mux mix.wav) ─► final.mp4 2:15 ─► caption (skill captions)
```

| Lapisan | Pemilik | Dikerjakan oleh |
|---|---|---|
| Storyboard, set, anchor | storyboard-director | `base.json`, `LAYOUT.json` |
| World & blok | set-builder | `.mcfunction` (fill/setblock) via RCON, atau WorldEdit paste |
| Waktu, cuaca, cahaya, aktor, mob massal | visual-director | gamerule/time/weather, summon, Scarpet |
| Kamera | camera-director | ReplayMod camera path |
| Gabung + cek | `compile_shots.mjs` | hasil `shots/<shot>.json` |
| Take & render | orchestrator | `shot.mjs`, ReplayMod |
| Audio mix, assembly | orchestrator | `audio/mix.wav`, `assemble.mjs` → `final.mp4` |
| Caption/overlay | packager-qa + skill `captions` | Remotion |

## 2. Struktur folder project

```
projects/<slug>/
  LAYOUT.json  SHOTLIST.md  LOOK.md  CAST.md  SCRIPT.md
  shots/
    s07/base.json  s07/world.json  s07/visual.json  s07/camera.json
    s07.json                       ← hasil compile, jangan edit
  sets/<set>/  SPEC.md  <set>.mjs  build/<set>.mcfunction  (<set>.py, <set>.schem opsional)
  scarpet/     app .sc milik project (copy dari SKILL/scripts/mc/scarpet/)
  REQUESTS/    <agent>__<topik>.md
  .wave/       snapshot.json (check_ownership), compile.json (laporan compile)
  captures/<shot>/  take01.mcpr  render.mp4  commands.txt (hasil --dry)
  audio/       vo.wav  TIMING.md  words.json  music/  sfx/  mix.wav
  MODLIST.txt
```

Nama shot huruf kecil tanpa spasi (`s07`, `s12b`). Nama folder lapisan = nama shot.

## 3. Lapisan & format hasil compile

### 3a. `LAYOUT.json` (storyboard-director)
```json
{ "version": 1, "fps": 30, "total_frames": 4050, "spacing": 256,
  "sets": {
    "well": { "origin": [512, 64, 0], "size": [16, 10, 16], "front": "-z",
      "anchors": {
        "well":     { "kind": "landmark",  "at": [8, 1, 8] },
        "kid_mark": { "kind": "actor",     "at": [5, 1, 8], "facing": "+x" },
        "cam_low":  { "kind": "cam_entry", "at": [6, 2, 2] } } } } }
```
- `origin` = pojok bawah bbox (y = lapisan tanah terbawah). `at` relatif ke origin, **koordinat blok (bilangan bulat)**.
- Anchor `actor`/`cam_entry` = blok udara tempat kaki/kamera berada (tanah di dy 0 → aktor dy 1).
- Compile mengubah anchor jadi **tengah blok**: world = origin + at + [0.5, 0, 0.5]. `off [0,0,0]` = tepat di tengah blok; `off` hanya untuk bergeser dari situ.
- Jarak antar bbox ≥ `spacing` (256). Grid origin `[i*512, 64, 0]`.

### 3b. `base.json` (storyboard-director)
`shot order title beat set tag size subject must_see cast action intent start_word transition sfx est_frames notes`
- `start_word {word, nth}`: shot mulai di kata ke-nth dalam beat (butuh `audio/words.json`).

### 3c. `world.json` (set-builder)
`set build delta notes`
```json
{ "set": "well", "build": { "mode": "file", "file": "sets/well/build/well.mcfunction" }, "delta": [] }
```
- `build.mode`: `file` (default) | `schem` (WorldEdit paste, butuh player online). File harus di `sets/<set>/`.
- `delta` = setblock/fill khusus shot, dengan koordinat absolut di dalam bbox (`~` ditolak).

### 3d. `visual.json` (visual-director)
`time weather light actors scarpet notes`
```json
{ "time": 6000, "weather": "clear",
  "light": ["setblock 520 66 4 minecraft:light[level=12]"],
  "actors": [ { "id": "kid1", "type": "minecraft:villager", "anchor": "kid_mark", "off": [0, 0, 0],
                "face": "well", "nbt": "{Age:-24000}" } ],
  "scarpet": [ { "app": "crowd", "fn": "wander",
                 "args": ["minecraft:villager", 3, { "anchor": "well", "off": [0, 0, 0] }, 5, 2] } ] }
```
- Arah aktor: `facing` (`+z`…), `face` (anchor/aktor yang dilihat), atau `yaw`. Tanpa semuanya, dipakai `facing` anchor.
- `actors[].fake` = Carpet fake player (`player <nama> spawn at …`). Prep mengeluarkan semua fake player project (`player <nama> kill`) sebelum spawn.
- Mob aktor default `NoAI:1b, Silent:1b, Invulnerable:1b` (diam di tanda). `"ai": true` = pakai AI asli (akan berjalan sendiri).
- Argumen scarpet `{anchor|actor, off}` diubah compile jadi `[x, y, z]`.

### 3e. `camera.json` (camera-director)
`engine move size keys notes`
```json
{ "engine": "replaymod", "move": "parallax", "size": "MS",
  "keys": [ { "t": 0, "pos": { "anchor": "kid_mark", "off": [-0.1, 0.6, -6.5] }, "look": { "actor": "kid1", "off": [0.6, -0.6, 0] }, "fov": 60 },
            { "t": 1, "pos": { "anchor": "kid_mark", "off": [0.5, 0.6, -6.5] }, "look": { "actor": "kid1", "off": [0.6, -0.6, 0] }, "fov": 60 } ] }
```
- `t` 0..1 naik, key pertama 0, terakhir 1. Frame dihitung compile dari timing.
- `{actor}` = titik mata aktor (kaki + 1.62). `fov` vertikal, default 70. **Satu fov per shot** (fov berubah → WARN).
- Compile menambahkan `yaw`/`pitch` (derajat Minecraft: yaw 0 = +z, 90 = −x; pitch + = menunduk) ke tiap key, untuk ReplayMod dan `/tp`.

### 3f. Hasil compile `shots/<shot>.json` (dibuat `compile_shots.mjs`)
```json
{ "compiled": true, "shot": "s03", "set": "well", "size": "MS",
  "start_frame": 186, "frames": 3864, "fps": 30, "timing": "vo",
  "pre": ["forceload add 512 0 528 16", "gamerule doDaylightCycle false", "…", "time set 6000", "weather clear", "tick freeze"],
  "fakes_all": ["Ruby"],
  "build": { "mode": "file", "file": "sets/well/build/well.mcfunction", "origin": [512, 64, 0],
             "commands": ["setblock 520 66 4 minecraft:light[level=12]"] },
  "actors": [ { "id": "kid1", "type": "minecraft:villager", "at": [517.5, 65, 8.5], "yaw": -90, "nbt": "{Age:-24000}" } ],
  "scarpet": [ { "app": "crowd", "fn": "wander", "args": ["minecraft:villager", 3, [520.5, 65, 8.5], 5, 2] } ],
  "camera": { "engine": "replaymod", "move": "parallax", "size": "MS",
              "keys": [ { "t": 0, "f": 0, "pos": [517.4, 65.6, 2], "look": [518.1, 66.02, 8.5], "yaw": -6.147, "pitch": -3.676, "fov": 60 },
                        { "t": 1, "f": 3864, "pos": [518, 65.6, 2], "look": [518.1, 66.02, 8.5], "yaw": -0.881, "pitch": -3.697, "fov": 60 } ] },
  "post": [], "render": { "w": 1080, "h": 1920, "fps": 30, "out": "captures/s03/render.mp4" } }
```

### 3g. Yang dicek `compile_shots.mjs`
```
node SKILL/scripts/compile_shots.mjs projects/<slug> [--shot s01,s02] [--partial] [--dry]
```
- LAYOUT: anchor di dalam bbox, jarak set ≥ spacing.
- Lapisan lengkap (`--partial` = lapisan hilang hanya WARN), key milik lapisan yang benar, set sama di semua lapisan, anchor dan aktor dikenal, semua `cast` ditempatkan.
- Aktor: blok di kaki dan kepala udara, ada lantai padat di bawah. Dibaca dari file build + delta.
- Kamera: di dalam bbox dan di udara. Subject di area aman Shorts (x 4–84 %, y 8–75 %) pada t 0 / 0.5 / 1, `must_see` terlihat.
- Command delta/light/build absolut dan di dalam bbox.
- Timing:
  - Dari `audio/TIMING.md` (+ `start_word` dari `audio/words.json`).
  - Tanpa TIMING.md dipakai `est_frames` (`timing: "estimate"`).
  - Total harus 4050. Dengan timing VO, meleset = FAIL.
- Kamera ReplayMod dengan `fov` berbeda antar key → WARN.
- Laporan per shot OK / WARN / FAIL ditulis ke `.wave/compile.json`. Tiap FAIL menyebut file dan pemiliknya. Shot yang FAIL tidak punya file hasil compile.

### 3h. `check_ownership.mjs`
```
node SKILL/scripts/check_ownership.mjs projects/<slug> --snapshot        # sebelum wave
node SKILL/scripts/check_ownership.mjs projects/<slug> --verify          # sesudah wave
```
`--verify` menandai FAIL kalau:
- ada file berubah, baru, atau terhapus yang bukan milik agent wave,
- ada file BACA SAJA yang berubah,
- `world.json` menunjuk set yang beda dari `base.json`,
- ada folder `sets/<x>/` yang tidak ada di LAYOUT.

## 4. Alur satu shot (Step 8)

Set tidak dibangun terpisah: `prep` memuat chunk set (`forceload add`, baris pertama `pre`) lalu mengirim file build + delta.
`shot.mjs` membaca balasan server: balasan error ("Unknown or incomplete command", "is not loaded", error scarpet, …) = **ERR**, shot berhenti (kecuali `--continue`). `kill`/`player … kill`/`forceload` yang "gagal" karena tidak ada yang perlu dikerjakan diabaikan.
Command freeze diambil dari `.rcon.json` (`tick_freeze`, `tick_unfreeze`) — di Carpet 1.20.1 `tick freeze` polos adalah toggle.

1. **Dry run**
   `node SKILL/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --dry`
   Baca `captures/s12/commands.txt`.
2. **Prep**
   `node SKILL/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --run --only prep`
   - `prep` = `pre,build,actors,load`.
   - Hasilnya: chunk dimuat, dunia beku, aktor + kerumunan lama dibersihkan (`kill @e[tag=mcs_actor]`), fake player lama dikeluarkan, set + delta + aktor siap, app scarpet ter-load.
3. **Inspeksi framing** (manual): ketik `/tp @s <pos> <yaw> <pitch>` yang tercetak di `captures/<shot>/commands.txt`.
   - Salah → perbaiki lapisan pemiliknya (panggil ulang agentnya), compile ulang, ulangi 2.
   - Jangan edit `s12.json`.
4. **Take**
   - Start recording ReplayMod.
   - `node SKILL/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --run --only take`
   - `take` = unfreeze → `script in <app> run <fn>(<args>)`.
   - Tunggu `frames / 30 + 1` detik → stop → `captures/s12/take01.mcpr`.
5. **Kamera**: Camera Path ReplayMod dari `camera.keys` (`pos`, `yaw`, `pitch`; detik = `f / 30`). Panjang path = `frames / 30` detik atau sedikit lebih.
6. **Render**: 1080×1920, 30 fps, shader aktif, FOV game = `fov` shot → `captures/s12/render.mp4`.
7. **Catat**: satu baris di `captures/NOTES.md` (shot, take yang dipakai, masalah, keputusan).

Section shot.mjs: `pre build actors load take post`. Grup: `prep` = pre,build,actors,load. (`scarpet` = alias lama untuk load,take.)

### 4b. Shot `[BBS]` dan `[ANIM]`
- `[BBS]`:
  1. Jalankan prep seperti biasa.
  2. Aktor BBS diatur di film BBS (pose/replay).
  3. Take direkam dengan BBS + ReplayMod sekaligus. Posisi aktor tetap dari `actors[].at` hasil compile.
- `[ANIM]` (P2): ekspor set (`.schem`) → Blender/MCprep. Kamera memakai `camera.keys` yang sama, dengan frame dari hasil compile.

## 5. Scarpet — pemakaian

Lokasi app: `<server>/config/carpet/scripts/*.sc`.

**Satu-satunya bentuk panggilan:**
```
/script load crowd
/script in crowd run wander('minecraft:villager', 3, [520, 65, 8], 5, 2)
```
- String pakai **kutip tunggal**. List pakai `[a, b, c]`.
- **Semua argumen diisi**. App tidak memakai default.
- `sin`/`cos`/`atan2` scarpet memakai **derajat**. Append ke list: `l += x` (bukan `l + [x]`). Hapus entity: `modify(e, 'remove')`.
- Jangan pakai `script run call('app','fn')` atau `script invoke`. Pakai satu bentuk saja supaya log dan dokumentasi seragam.
- Di shot JSON: `{ "app": "crowd", "fn": "wander", "args": [...] }`. shot.mjs membuat command-nya sendiri. String biasa ditolak.

Template di `SKILL/scripts/mc/scarpet/`:
| App | Fungsi |
|---|---|
| `crowd.sc` | spawn kerumunan, jalan berbaris, wander, stop, despawn |
| `wall.sc` | bangun tembok lingkaran bertahap (untuk timelapse), plus bibir tembok |
| `env.sc` | nyalakan api bertahap, naikkan level air, pasang obor massal |
| `actor.sc` | gerakkan entity (boleh beberapa sekaligus, satu `follow` per aktor) sepanjang waypoint, hadapkan ke arah gerak |

Contoh panggilan lengkap ada di header tiap `.sc`.

Prinsip penulisan app:
- Semua state di `global_*`, reset lewat `reset()`.
- Gerak di `__on_tick` (20 tps), bukan di `task`/timer.
- Tanpa `rand()` untuk hal yang harus sama tiap take.
- Selalu sediakan `stop()` dan `clear()`.
- Mob yang di-spawn app diberi tag `mcs_actor` (NBT `Tags`) supaya `kill @e[tag=mcs_actor]` di prep membersihkannya.

## 6. Determinisme (wajib)

| Gamerule / setting | Nilai saat take |
|---|---|
| `doDaylightCycle` | `false` (set `time` manual) |
| `doWeatherCycle` | `false` |
| `doMobSpawning` | `false` (spawn manual) |
| `randomTickSpeed` | `0` |
| `doFireTick` | `false` kecuali shot api; kalau `true`, api tidak deterministik → rekam sekali |
| `doMobLoot` / `doTileDrops` | `false` |
| Physics Mod | matikan untuk shot freeze |
| Shader | sama di semua take |

Semua gamerule ini otomatis masuk `pre` lewat compile. Seed world dicatat di `MODLIST.txt`.

## 7. Kamera — kosakata & framing

`camera.json.move` memakai kosakata berikut. Key memakai `t` 0..1, posisi `{anchor|actor, off}`.

| Istilah | Key |
|---|---|
| `static` | 2 key sama (t 0 dan 1) |
| `push-in` | 2 key, pos maju ke subject, look tetap |
| `pull-back` | 2 key, pos mundur |
| `orbit` | 4–6 key melingkar, look tetap ke target |
| `crane-up` | 2–3 key, y naik, look turun ke subject |
| `top-down` | 2 key, y tinggi, look tepat di bawah |
| `whip-pan` | 2 key rapat (selisih t ≤ 6/frames), look pindah jauh |
| `parallax` | 2 key, geser lateral pelan, look tetap |
| `handheld` | key tiap ~0.1 t dengan offset kecil (±0.05) |

**Framing 9:16.** Lebar frame = tinggi × 0.5625. Jarak `d = H / (2·tan(fov/2))`, dengan H = tinggi frame (blok) di jarak subject:

| Size | H (blok) | d @fov 70 | d @fov 50 | d @fov 30 |
|---|---|---|---|---|
| ECU | 0.5 | 0.36 | 0.54 | 0.93 |
| CU | 0.9 | 0.64 | 0.97 | 1.68 |
| MCU | 1.3 | 0.93 | 1.39 | 2.43 |
| MS | 2.0 | 1.43 | 2.14 | 3.73 |
| MWS | 2.8 | 2.0 | 3.0 | 5.2 |
| WS | 5 | 3.6 | 5.4 | 9.3 |
| EWS | 15+ | 10.7+ | 16+ | 28+ |

Kamera eye level (y mata aktor ±0.3) kecuali cerita butuh lain. Sumbu 180° dijaga dalam satu scene. Semua gerak harus punya alasan cerita.

## 8. Render & assembly

1. Render per shot → `captures/<shot>/render.mp4` (H.264, 1080×1920, 30 fps, CRF 16–18).
2. Cek: `node SKILL/scripts/assemble.mjs projects/<slug> --check`
   - render kurang frame dari `frames` → FAIL (render ulang shot itu); lebih → dipotong di akhir (WARN).
3. Gabung + mux: `node SKILL/scripts/assemble.mjs projects/<slug>` → `final.mp4`
   - urutan `start_frame`, tiap shot dipotong tepat `frames`, total dicek = 4050.
   - audio `audio/mix.wav` (dibuat dari `vo.wav` + `audio/music/` kalau belum ada), dipanjangkan dengan senyap sampai 2:15. Tidak memakai `-shortest`.
4. Caption: skill `captions` → green-screen layer (selalu diserahkan).
5. QA akhir:
   - durasi **tepat 2:15.0**,
   - audio tidak clip,
   - caption tidak menutup UI Shorts.

## 9. Troubleshooting

| Gejala | Sebab | Fix |
|---|---|---|
| RCON `Connection refused` | server belum selesai start / rcon mati | tunggu "Done", cek `enable-rcon` |
| Command jalan tapi tidak ada efek | world salah / `execute` salah dimensi | `execute in minecraft:overworld run ...` |
| `//paste` "no world edit session" | tidak ada player context | `execute as <player> at @s run //paste` |
| Scarpet error di log | app belum di-load / nama fungsi salah / argumen kurang | `--only prep` (load), lalu `script in <app> run <fn>(semua argumen)` |
| Mob diam saat take | dunia masih beku | jalankan lewat `--only take` (unfreeze lebih dulu); cek `tick_unfreeze` di `.rcon.json` |
| Dunia malah jalan setelah prep kedua | `tick freeze` polos = toggle di Carpet 1.20.1 | isi `tick_freeze`/`tick_unfreeze` di `.rcon.json` dengan bentuk eksplisit |
| `ERR … is not loaded` | chunk set belum dimuat | jalankan section `pre` (forceload) dulu; jangan kirim file build langsung tanpa prep |
| Kerumunan menumpuk / tembok hanya busur | app scarpet memakai radian | scarpet memakai derajat — pakai app dari skill versi ini |
| Aktor jalan pergi dari tanda | mob punya AI | default sudah `NoAI`; hapus `"ai": true` di visual.json |
| assemble FAIL "kurang N frame" | camera path/render lebih pendek dari shot | panjangkan path ke `frames/30` detik, render ulang shot itu |
| Animasi 1.5× lebih lambat | frame-step 1 tick per frame render | gerakkan di `__on_tick`, render 30 fps |
| Mob hilang di tengah take | despawn | `PersistenceRequired:1b` (otomatis untuk aktor), `doMobSpawning false` |
| Aktor dobel | take sebelumnya belum dibersihkan | prep selalu `kill @e[tag=mcs_actor]`; jangan summon manual |
| Shot ditolak shot.mjs | bukan hasil compile | `compile_shots.mjs projects/<slug>` |
| Replay tidak bisa dibuka | versi ReplayMod beda | satu versi ReplayMod per project |
