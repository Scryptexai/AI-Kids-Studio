---
name: minecraft-story
description: Bikin video storytelling Minecraft format "In this world / In this town" (fiktif, wajib 2:15) dari analisa script referensi → script VO → skin karakter → lalu salah satu dari dua jalur render. Jalur R (DEFAULT) = render penuh di Remotion + three.js tanpa membuka game (VO lock → SHOTLIST satu dunia → Wave A build → Wave B keying per section → draft + review → suara → final 2K 60 fps). Jalur P1 = take di game (LAYOUT + lapisan → compile → Scarpet + BBS + ReplayMod). Pakai saat user minta video cerita Minecraft "in this world/town".
---

# Minecraft Story — "In This World / In This Town"

Kamu adalah ORCHESTRATOR.
- **Step 1–4 berurutan** dan sama untuk semua jalur.
- Setelah GATE 4 pilih jalur render (ditanya di Step 0):
  - **Jalur R — Remotion (DEFAULT)**: gambar dirender penuh oleh renderer Minecraft milik repo (three.js + Remotion, composition `McShort`). Tidak perlu game, server, atau mod. Lanjut ke bagian **"Jalur R"** di akhir file ini; Step 5–9 di bawah TIDAK dipakai.
  - **Jalur P1 — take di game**: Step 5–9 di bawah (LAYOUT + lapisan + compile, Scarpet + BBS + ReplayMod).
- Setiap GATE = berhenti, tunjukkan hasil, tunggu user bilang "lanjut" atau memberi revisi.

Baca `RULES.md` sebelum mulai. Jalur P1: baca `PIPELINE.md` sebelum Step 5 dan `TOOLS.md` sebelum Step 8.

**Path absolut.** Semua script dipanggil dari folder skill:
`SKILL = ~/.claude/skills/minecraft-story` → `node SKILL/scripts/...`.
Jalankan dari root repo (tempat `projects/` dan `.rcon.json`).
Folder skill di tempat lain? `node <folder-skill>/scripts/install.mjs` menulis ulang path di agent yang dipasang; `SKILL` di dokumen ini = folder itu.

## Prinsip pipeline (jalur P1; jalur R punya aturannya sendiri di bagian "Jalur R")
1. **Yang bisa dikodekan, dikodekan.** World, blok, mob, prop, kamera, dan render berupa file + command.
2. **Satu shot = empat lapisan, satu pemilik per lapisan.**
   - Lapisannya: `shots/<shot>/{base,world,visual,camera}.json`.
   - `compile_shots.mjs` menggabungkannya jadi `shots/<shot>.json`, satu-satunya file yang dijalankan.
   - Hasil compile tidak pernah diedit tangan.
3. **Satu sistem koordinat.** `LAYOUT.json` (dari storyboard-director) memuat origin, bbox, arah depan, dan anchor bernama tiap set. Semua agent menunjuk posisi lewat anchor, bukan angka tebakan.
4. **Kepemilikan ketat.**
   - `ownership.json` mendefinisikan wilayah tiap agent.
   - Hook di frontmatter agent menolak tulisan di luar wilayah.
   - `check_ownership.mjs` mengaudit hasil setelah wave.
   - Butuh perubahan di luar wilayah → tulis ke `REQUESTS/`.
5. **Deterministik.** Gamerule dikunci, seed dicatat, animasi jalan di 20 tps, render 30 fps.
6. **VO dikunci sebelum take.** Key kamera memakai `t` 0..1, jadi timing VO hanya mengubah frame lewat compile ulang. Isi lapisan tidak perlu diubah.

## Struktur project (buat di awal)
```
projects/<slug>/
  refs/  FORMULA.md  SCRIPT.md  ORIGINALITY.md  CAST.md  assets/skins/
  SHOTLIST.md        # storyboard + SET LIST (storyboard-director)
  LAYOUT.json        # origin/bbox/front/anchor per set (storyboard-director) — BACA SAJA setelah GATE 5
  LOOK.md            # waktu/cuaca/cahaya/shader per scene (visual-director)
  shots/
    <shot>/base.json     # storyboard-director — BACA SAJA setelah GATE 5
    <shot>/world.json    # set-builder
    <shot>/visual.json   # visual-director
    <shot>/camera.json   # camera-director
    <shot>.json          # HASIL compile_shots.mjs — jangan edit
  sets/<set>/        # SPEC.md, <set>.mjs, build/<set>.mcfunction (set-builder untuk set itu)
  REQUESTS/          # <agent>__<topik>.md — permintaan lintas wilayah; orchestrator merangkum ke REQUESTS.md
  CONTINUITY.md      # hasil continuity-checker (ditulis orchestrator)
  .wave/             # snapshot.json, compile.json (dibuat script)
  scarpet/  captures/<shot>/  audio/  PUBLISH.md  MODLIST.txt
```

## Peta agent & model
| Step | Agent | Model | Tulis (MILIKKU) |
|---|---|---|---|
| 1 | formula-analyst | opus | FORMULA.md |
| 2 | script-writer | opus | SCRIPT.md |
| 3 | originality-checker | sonnet | ORIGINALITY.md |
| 5 | storyboard-director | sonnet | SHOTLIST.md, LAYOUT.json, shots/*/base.json |
| 6 | set-builder (×1 per set) | sonnet | sets/<set>/**, shots/<shot>/world.json (shot di set itu) |
| 6 | visual-director | sonnet | LOOK.md, shots/*/visual.json |
| 6 | camera-director | sonnet | shots/*/camera.json |
| 6 | continuity-checker | sonnet | — (Read/Glob/Grep saja; hasil di balasan) |
| 9 | packager-qa | haiku | PUBLISH.md, captions.srt, QA.md |
Step 0, 4, 7, 8 dikerjakan orchestrator.

Jalur R memakai agent Step 1–3 dan `packager-qa` dari tabel ini. Step 5–8 diganti agent build dan keying yang dipanggil dengan brief per proyek (lihat "Jalur R").

**Agent harus terpasang.** File sumber ada di `SKILL/agents/`. Pasang dengan `node SKILL/scripts/install.mjs` (menyalin ke `~/.claude/agents/` dan menyesuaikan path hook), mulai sesi baru, lalu `node SKILL/scripts/doctor.mjs` → harus **0 FAIL**. Kalau agent tidak muncul sebagai tipe subagent atau path hook salah, kunci kepemilikan tidak jalan (tanpa peringatan). Jangan jalankan wave tanpa kunci.

**Subagent sonnet gagal?** Ulangi agent yang sama dengan `model: opus`. Jangan kerjakan lapisannya sendiri di orchestrator, karena itu melanggar kepemilikan.

---

## Step 0 — Intake
Tanya (sekaligus, singkat):
1. Script referensi (minimal 2, ideal 3–5). Simpan ke `refs/`.
2. Ide cerita / tema (atau "bebas" → nanti kasih 5 konsep).
3. Path produksi:
   - **R — Render Remotion (DEFAULT)**: tanpa game. Syarat: engine Minecraft ada di repo (cek R0 di bagian "Jalur R").
   - **P1 — Code-driven in-game**: Scarpet + BBS + ReplayMod. Butuh Minecraft Java **1.20.1 + Fabric** + **dedicated server lokal** (RCON) + client terpisah (TOOLS.md §0).
   - **P2 — Hybrid**: P1 + Blender/MCprep untuk shot `[ANIM]`.
   - **P3 — Blender penuh.**
   - **P4 — Mine-imator** (mesin lemah).
4. Suara VO: suara user sendiri (kirim wav) atau ElevenLabs (minta OK sebelum memakai kredit).

## Step 0.5 — Setup stack (sekali per mesin)
**Jalur R:** jalankan R0 (cek engine) di bagian "Jalur R", lalu lewati sisa Step 0.5.

**Jalur P1:** ikuti `TOOLS.md` §8:
1. Server 1.20.1 Fabric (Carpet + WorldEdit, `enable-rcon=true`), lalu tes `node SKILL/scripts/mc/rcon.mjs --check`.
2. Client 1.20.1 Fabric (Iris + BBS + ReplayMod + skin loader) → connect `localhost`.
3. Copy `SKILL/scripts/mc/scarpet/*.sc` ke `<server>/config/carpet/scripts/`.
4. Isi `.rcon.json` di root repo. World server: **superflat** (`level-type=minecraft\:flat`, `generate-structures=false`) supaya terrain asli tidak masuk bbox set.
5. **Kunci command freeze.** Di Carpet 1.20.1 `tick freeze` adalah TOGGLE dan `tick unfreeze` belum tentu ada. Di server: `/tick freeze status`, coba `/tick freeze on` dan `/tick freeze off`. Tulis yang berfungsi ke `.rcon.json`:
   `"tick_freeze": "tick freeze on", "tick_unfreeze": "tick freeze off"`. `shot.mjs` memakai dua key itu.
6. **Tes tiap app scarpet di game** (berdiri di area kosong, ganti koordinat dengan posisimu):
   - `/script load crowd` → `/script in crowd run wander('minecraft:villager',12,[x,y,z],8,2)` → 12 villager tersebar melingkar (bukan menumpuk) → `/script in crowd run clear()` → semua hilang.
   - `/script in crowd run march('minecraft:pillager',6,[x,y,z],[x+20,y,z],0.055)` → barisan bergerak ke +x dan menghadap arah jalan → `clear()`.
   - `/script load wall` → `/script in wall run ring_now([x,y,z],10,4,'minecraft:stone_bricks',1)` → lingkaran penuh.
   - `/script load env` → `/script in env run torches([x,y,z],[x+8,y,z+8],4)`.
   - `/script load actor` → summon 1 villager bernama `tes` → `/script in actor run follow('tes',[[x,y,z],[x+5,y,z]],0.06)`.
   Ada error di chat/log? Perbaiki app-nya dulu (catat di `scripts/mc/README.md`).
7. `node SKILL/scripts/doctor.mjs --rcon` → 0 FAIL.

Kalau langkah 5–7 gagal, jangan lanjut ke Step 8.

Cek pipeline tanpa server: `node SKILL/tests/run_tests.mjs` → harus "0 gagal".

## Step 1 — Analisa formula → `formula-analyst`
Hasilnya `FORMULA.md`: beat map + timing %, pola hook, ritme, device retensi, dan daftar JANGAN DITIRU. **GATE 1.**

## Step 2 — Konsep + Script → `script-writer`
1. 5 konsep (logline + aturan dunia + twist). **GATE 2a**: user pilih.
2. `SCRIPT.md` (format RULES §C). Cek dengan `node SKILL/scripts/word_count.mjs projects/<slug>/SCRIPT.md`. Target 347–368 kata (VO 2:10–2:14).
3. Tampilkan script English (KEY WORDS CAPS), terjemahan Indonesia, dan 3 judul.

## Step 3 — Cek transformative → `originality-checker`
Jalankan `node SKILL/scripts/overlap_check.mjs projects/<slug>/SCRIPT.md projects/<slug>/refs/`.
Gagal kalau: ada 6-gram yang sama, overlap 4-gram > 3%, atau premis/twist sama. Maksimal 2 loop revisi. **GATE 3** (script terkunci).

## Step 4 — Skin karakter (orchestrator)
1. Dari SCRIPT.md: karakter utama + peran + 1 kalimat visual. **Id aktor = slug nama** (`ruby`, `kid1`).
2. User upload skin PNG per karakter (nama file = id).
3. Validasi: `node SKILL/scripts/check_skin.mjs projects/<slug>/assets/skins/`.
4. Tulis `CAST.md`: id | file skin | nama fake player / aktor BBS | tipe arm | warna dominan | ciri yang harus kelihatan.
5. **Jalur P1 saja.** Jalur R mendaftarkan skin di renderer (agent `infra` di Wave A), tidak lewat client. Pasang skin ke client (manual, sekali per karakter): untuk fake player lewat skin lokal CustomSkinLoader (file bernama nama fake player; lokasi folder: lihat dokumentasi CustomSkinLoader), untuk aktor BBS lewat form BBS. Nama fake player di CAST.md = nama yang dipakai visual-director (`"fake"`).

**GATE 4.**

## Step 5 — Storyboard + LAYOUT → `storyboard-director`
Hasilnya:
- `SHOTLIST.md`, termasuk **SET LIST** dengan zona berkoordinat.
- `LAYOUT.json`: origin, bbox, front, dan anchor `actor` / `landmark` / `cam_entry` per set. Jarak antar set ≥ 256 blok.
- `shots/<shot>/base.json` per shot.

Sebelum GATE 5, orchestrator menjalankan
`node SKILL/scripts/compile_shots.mjs projects/<slug> --partial --dry`.
Semua FAIL dengan label `LAYOUT` harus nol.

Tunjukkan ke user:
- tabel shot,
- daftar set + anchor,
- 3 shot paling sulit.

**GATE 5.** Setelah ini `LAYOUT.json`, `base.json`, `SHOTLIST.md`, `SCRIPT.md` dan `CAST.md` jadi BACA SAJA.

## Step 6 — Wave Produksi (paralel)
0. **Kunci aktif?** `node SKILL/scripts/doctor.mjs` → 0 FAIL. Kalau FAIL: `install.mjs`, sesi baru, ulangi.
1. **Snapshot**: `node SKILL/scripts/check_ownership.mjs projects/<slug> --snapshot`
2. **Spawn dalam SATU pesan**, semua `run_in_background`:
   - satu `set-builder` per set di LAYOUT (prompt baris pertama `SET: <set>`, lalu slug project),
   - satu `visual-director`,
   - satu `camera-director`.

   Prompt hanya berisi slug + (untuk set-builder) nama set. Semua aturan ada di file agent.
3. **Selama wave tidak ada yang mengirim command ke server**, termasuk orchestrator. Agent hanya menghasilkan file.
4. Setelah semua agent selesai:
   - `node SKILL/scripts/check_ownership.mjs projects/<slug> --verify`. Kalau FAIL, kembalikan file itu dan ulangi agent pemiliknya.
   - Rangkum `REQUESTS/*.md` ke `REQUESTS.md`. Setujui atau tolak tiap permintaan bersama user.
   - Permintaan yang disetujui dikerjakan oleh **pemilik file itu** (panggil ulang agentnya), bukan oleh peminta.
   - Perubahan LAYOUT/base berarti membuka lagi GATE 5 untuk file itu.
5. **Compile**: `node SKILL/scripts/compile_shots.mjs projects/<slug>`. Sebelum Step 7, timing masih estimasi.
   - Tiap FAIL menyebut file dan pemiliknya, jadi panggil ulang agent pemilik itu saja.
   - Maksimal 2 putaran, lalu tanya user.
6. **Continuity**: panggil `continuity-checker`. Tulis balasannya ke `CONTINUITY.md`, lalu kirim FAIL ke pemilik masing-masing (maksimal 2 putaran).
7. **GATE 6**: tunjukkan hasil compile (OK/WARN/FAIL per shot), tabel continuity, SPEC tiap set, dan REQUESTS terbuka.

## Step 7 — VO & timing lock (orchestrator)
1. Generate VO dari SCRIPT.md (minta OK user sebelum memakai kredit).
2. Ukur: `node SKILL/scripts/word_count.mjs projects/<slug>/SCRIPT.md --audio projects/<slug>/audio/vo.wav`. Target VO 2:10–2:14.
3. Tulis `audio/TIMING.md` (`| B01 | mulai | selesai | durasi |`, detik) dan `audio/words.json` (`[{w,s,e}]`) untuk `start_word`.
4. **Compile ulang**: `compile_shots.mjs projects/<slug>`. Sekarang `timing: "vo"` dan total harus tepat 4050 frame.
5. Musik + SFX list dari SHOTLIST.md (rekaman saja; tunjukkan daftar dulu). Musik ditaruh di `audio/music/`.
   `audio/mix.wav` = milik orchestrator: taruh mix buatan sendiri di situ, atau biarkan `assemble.mjs` (Step 9) membuatnya dari `vo.wav` + file pertama di `audio/music/`.

`TIMING.md` dan `words.json` harus dari timestamp kata audio asli (alignment, mis. Whisper word timestamps), bukan dibagi rata.

**GATE 7** (timing terkunci).

## Step 8 — Take & render (orchestrator, code-driven)
Detail di `PIPELINE.md` §4. Per shot:
1. Client berdiri di set shot itu (mode spectator). Set tidak perlu dibangun terpisah: `prep` memuat chunk (`forceload`) dan membangun set.
2. **Dry run**: `node SKILL/scripts/mc/shot.mjs projects/<slug>/shots/<shot>.json --dry`, lalu baca `captures/<shot>/commands.txt`.
3. **Prep**: `--run --only prep` (pre, build, actors, load). Dunia beku, set dan aktor siap, app scarpet ter-load.
   - Ada baris `ERR` atau "command GAGAL" → shot belum siap. Perbaiki penyebabnya, ulangi prep. Jangan lanjut ke take.
4. **Inspeksi framing** (manual, cepat): ketik perintah `/tp @s …` yang tercetak di `commands.txt` (posisi + yaw/pitch `camera.keys[0]`).
   - Salah → perbaiki di **lapisan pemiliknya**.
   - Lalu compile ulang dan ulangi langkah 3.
5. **Take**: mulai rekam ReplayMod → `--run --only take` (unfreeze, lalu scarpet) → tunggu `frames/30 + 1` detik → stop → `captures/<shot>/take01.mcpr`.
6. **Kamera**: ReplayMod camera path dari `camera.keys`: tiap key punya `pos`, `yaw`, `pitch` dan `f` (detik = f/30). Satu `fov` per shot, diatur di opsi game sebelum render.
7. **Render**: 1080×1920, 30 fps, shader aktif → `captures/<shot>/render.mp4`.
8. **Catat** satu baris di `captures/NOTES.md`.

Shot `[BBS]` dan `[ANIM]`: lihat PIPELINE.md §4b.

## Step 9 — Assembly (orchestrator) → Packaging & QA (`packager-qa`)
1. **Cek render**: `node SKILL/scripts/assemble.mjs projects/<slug> --check`. Tiap shot harus punya `render.mp4` 1080×1920 dengan jumlah frame ≥ `frames`. Shot FAIL → render ulang shot itu saja.
2. **Gabung + mux**: `node SKILL/scripts/assemble.mjs projects/<slug>` → `final.mp4`, tepat 4050 frame (2:15.0), audio dari `audio/mix.wav`. Laporan di `.wave/assemble.json`. Ganti nama file jadi judul upload setelah QA.
3. `packager-qa`: `PUBLISH.md`, `captions.srt`, `QA.md`. Caption green-screen pakai skill `captions` (selalu diserahkan).

---

## Jalur R — Render Remotion tanpa game (DEFAULT)
Jalur ini dipakai untuk "The Tapper" (remake) dan "Mined, Not Born". Gambarnya 100% dari renderer Minecraft milik repo (three.js + Remotion, composition `McShort`), bukan rekaman game. Tidak perlu Minecraft, server, RCON, Carpet, BBS, atau ReplayMod.
- Step 1–4 sama seperti di atas.
- Step 5–9 (LAYOUT.json, lapisan `shots/<shot>/*.json`, `compile_shots.mjs`, scarpet, `shot.mjs`, `assemble.mjs`) **tidak dipakai**.
- Aturan user tetap berlaku untuk setiap shot: tidak pernah beku (idle pada semua figur, termasuk figuran), antisipasi + overshoot, tidak tembus dan tidak z-fighting, kaki di atas blok, figur di zona aman Shorts (x 4–84 %, y 8–75 %), kamera setinggi mata kecuali subjeknya tinggi, kamera cepat tapi halus (eased), gambar = isi kalimat tepat pada katanya, tanpa kartu judul/tanggal/tempat, botak kecuali cerita butuh rambut, **tanpa depth of field** (lens McPost mati).

### R0 — Cek engine (sekali per repo)
Di root repo harus ada semuanya:
- `src/minecraft/` dengan `McShort.tsx`, `VoxelWorld.tsx`, `McPost.tsx`, `Actors.tsx`, `mobs/`, dan composition `McShort` terdaftar di `src/Root.tsx`;
- `scripts/mccheck/` (`mcq.py` untuk query, `gate.py` untuk staging gate);
- tekstur di `public/mc-preview/`, di-stage dari Minecraft Java milik user sendiri (tekstur Mojang jangan di-commit atau dibagikan);
- `remotion.config.ts` dengan `Config.setChromiumOpenGlRenderer("angle")` (render GPU; software GL kira-kira 20x lebih lambat).

Ada yang tidak ada → pakai engine dari repo publik [claude-shorts-skills](https://github.com/fahniazz/claude-shorts-skills), folder `engines/minecraft/` (project Remotion siap pakai, **tanpa tekstur**):
1. Salin folder itu jadi project kerja, lalu `npm install` (versi paket di `package.json` jangan di-upgrade: `@react-three/postprocessing` yang lebih baru membuat frame hitam).
2. Tekstur dari Minecraft Java milik user sendiri: `python -I tools/mc_extract.py --jar <versions/<ver>/<ver>.jar>` → `mc-assets/` (tidak di-commit, tidak dibagikan). Butuh Python + Pillow + numpy.
3. Tes: `python demo/build_demo.py`, lalu `npx remotion render src/index.ts McDemo out/demo.mp4`. Lihat beberapa frame-nya. Rumah, pohon, dan dua figur harus tampil dengan tekstur asli.
4. Struktur project baru mengikuti engine itu: CLI `npm run mc -- mc-stage|mc-preview|mc-validate`, set di `public/mc-preview/<story>/<set>/`, base `<story>/short` (plan.json + direction.json + voice.wav), satu composition `McShort` per cerita di `src/Root.tsx`. `demo/build_demo.py` adalah contoh lengkap terkecil.

User tidak punya Minecraft Java (tidak ada `.jar`) atau engine gagal dites → **BERHENTI**, jelaskan, lalu tawarkan jalur P1. **Jangan** membangun renderer pengganti seadanya (rumah = satu kotak besar dengan tekstur di-stretch, langit warna polos, dunia seperti pulau melayang): hasilnya tidak akan mirip video contoh.

### R1 — Kunci VO dulu (setelah GATE 4, sebelum shotlist)
Di jalur R, Step 7 pindah ke sini, karena setiap cue di shotlist memakai frame kata dari VO.
1. VO: suara user (wav) atau ElevenLabs (minta OK sebelum memakai kredit). VO mengalir tanpa jeda panjang. Kalau perlu, potong jeda dengan lembut berdasarkan suaranya, bukan berdasarkan timing kata.
2. `audio/words.json` (`[{w,s,e}]`) dari alignment audio asli (faster-whisper word timestamps), bukan dibagi rata. Untuk ElevenLabs, cek kata di akhir kalimat (sering mulai 0.3–0.6 s terlalu lambat) dan koreksi. Frame = `round(s*30)`.
3. `audio/TIMING.md` per beat.
4. Durasi video = durasi VO terkunci. Target panjang tetap mengikuti RULES.md §A; ukur dengan `word_count.mjs --audio`.

**GATE 7** (VO dan timing terkunci).

### R2 — SHOTLIST satu dunia (orchestrator)
Tulis `SHOTLIST.md`, dikunci ke `words.json`. Isinya:
- **Global rules**: aturan user di atas + aturan khusus cerita (warna terlarang, hitungan literal, dll.).
- **World frame W0**: SATU dunia bersama untuk semua shot (tanpa set palsu per shot). Isinya zona dengan koordinat, arah hadap, kamera bernama, titik berdiri, dan tabel **Stages per zone** (varian blok per tahap cerita: lubang S0–S3, retakan, siang/malam, cutaway).
- **Cast**: id kanonik per figur (sama di semua section).
- **Shots**: tabel id | frames | Trans (XD = dissolve 12 f, SD = dissolve 6 f, HC = hard cut) | LOOK (grade: pagi, malam, flashback, imagine) | kamera | cue `@word(f)` (gambar jatuh TEPAT di frame kata itu) | aksi.
- **New build items** (R1..Rn): fitur renderer yang belum ada (mob baru, efek, pose).
- **Hardest shots**, **Risks**, dan **Draft-render checks** (frame kunci yang dinilai pertama).

Cek setiap cue cocok dengan `words.json`. Disarankan: minta skor dari reviewer di agent/sesi baru (target ≥ 8.0, lalu terapkan editnya). Tunjukkan tabel shot, peta W0, dan 3 shot tersulit. **GATE 5.** Setelah ini SHOTLIST.md, SCRIPT.md, CAST.md, dan audio/ jadi BACA SAJA.

### R3 — BUILD_PLAN + Wave A: build (paralel, 4 agent Opus, background)
Tulis `BUILD_PLAN.md`: sumber kebenaran (read only), aturan user, dan tabel kepemilikan. Spawn dalam SATU pesan, `run_in_background`, `model: opus`. Tiap brief = BUILD_PLAN.md + barisnya sendiri.

| Agent | Milik (boleh tulis) | Membangun |
|---|---|---|
| `world` | `projects/<slug>/sets/**`, backdrop di `src/minecraft/`, `public/mc-preview/<slug>/<set>/`, `out/<slug>/sets/` | generator dunia W0 + semua varian tahap, backdrop sampai tepi dunia tidak pernah terlihat, `sets/anchors.json` (semua anchor, titik berdiri, kamera bernama), `variants.json`, `SETS.md`, still bukti dari tiap kamera bernama |
| `fx` | file efek di `src/minecraft/` (`McShort.tsx`, `McPost.tsx`, `Weather.tsx`, `Fluids.tsx`, file efek baru), bloknya sendiri di `types.ts` | efek dari New build items, setiap key baru disambungkan ke McShort, didokumentasikan di `FX.md` (bagian fx), composition tes `<Slug>FxTest` |
| `actors` | `src/minecraft/Actors.tsx`, `mobs/**`, `props/**`, `FirstPerson.ts`, `Crowd.tsx`, bloknya sendiri di `types.ts` | pose, akting, mob, prop, kerumunan; `FX.md` (bagian actors), composition tes `<Slug>ActorTest` |
| `infra` | `projects/<slug>/anim/**`, composition di `src/Root.tsx`, registrasi skin | `shots_lib.py` (timing `L/C/N`, helper kamera, cast), `build_shots.py` (merge section), `render_key/clip/60.mjs`, key frames + contact board, placeholder semua shot di kamera anchor (timeline penuh bisa dirender), pembagian section + `anim/KEYING_BRIEF.md` |

Aturan Wave A:
- File renderer bersama hanya **ditambah** (backward compatible): short lama harus tetap render sama. `npx tsc --noEmit` harus bersih.
- `types.ts` dipakai bersama: hanya Edit kecil di blok yang diberi komentar pemiliknya, tidak pernah Write seluruh file.
- Butuh perubahan di file orang lain → tulis `REQUESTS/<agent>__<topik>.md` dan cari jalan sementara. Orchestrator yang meneruskan ke pemiliknya.
- Hook kepemilikan jalur P1 tidak berlaku di sini. Kepemilikan dijaga lewat brief, `REQUESTS/`, assert di `build_shots.py`, dan cek `git status`/diff oleh orchestrator setelah wave.
- Repo yang sudah punya proyek jalur R: salin infra dari proyek terbaru (`BUILD_PLAN.md`, `anim/`, `KEYING_BRIEF.md`), jangan tulis dari nol.

### R4 — Wave B: keying per section (paralel, Opus)
Bagi shot jadi 4–6 section (sekitar 12–15 shot per section). Section n memiliki modul `anim/sec_<a>_<b>.py`, `anim/build_s<n>.py`, base `key-<n>`, cast `k<n>-*`, dan still di `out/<slug>/key-<n>/`. Brief = `KEYING_BRIEF.md` + nomor section.

Alur per shot:
1. `python scripts/mccheck/mcq.py words <slug>/key-<n> <sid>`: kata-kata shot itu pada frame lokal shot.
2. Key shot (frame lokal shot, cue lewat `L(sid, word)`, tidak pernah frame diketik tangan).
3. `python projects/<slug>/anim/build_s<n>.py`.
4. Gate: `mcq.py gate <slug>/key-<n> <sid> -v`. Setiap FAIL diperbaiki atau di-tag dengan alasan (`exit`, `airborne`, `wide`, ...). Kamera di dalam blok, kaki melayang, figur keluar zona aman = FAIL.
5. Baru setelah gate bersih: still + contact board (zona aman magenta, garis caption 71.5 % cyan), lalu dibaca dan diperbaiki.
6. **Maksimal 3 putaran still per shot**; setelah itu daftar yang masih terbuka, jangan diulang terus.

Satu GPU dipakai bersama: render hanya shot yang berubah, satu perintah render sekaligus, scale 0.4. Setelah semua section selesai, orchestrator menjalankan `build_shots.py` → base `short`, gate seluruh short 0 FAIL.

### R5 — Draft + review
1. Draft 30 fps dengan GPU (`--gl=angle`) + VO.
2. Satu review oleh agent baru (Opus) pada hook, tengah, payoff, dan "Draft-render checks": skor per kategori + daftar perbaikan per shot.
3. Perbaikan dikerjakan pemilik section (atau pemilik Wave A kalau masalahnya di renderer), lalu merge ulang.
4. Maksimal 2 putaran review, lalu laporkan ke user.

### R6 — Suara
1. Daftar SFX dulu (`audio/SFX_LIST.md`): sound Minecraft dan rekaman gratis (CC0) saja, **bukan SFX sintetis**. Tunjukkan ke user dan tunggu OK.
2. Cue SFX dibangun dari frame direction (setiap hit/langkah/blok jatuh tepat di frame-nya). Musik di `audio/music/`.
3. Mix -14 LUFS integrated, true peak ≤ -1 dBTP, musik di-duck di bawah suara. Stems: `vo`, `sfx`, `music`, `mix_no_music`, `mix`.

### R7 — Final + paket
1. Final **2K 60 fps**: key tetap di 30 fps, render 60 fps, scale 4/3 (1440×2560), `--gl=angle`.
2. File di `out/<slug>/final/`, nama file = judul upload (aman untuk Windows), plus `stems/`.
3. Caption green-screen: skill `captions` dengan `--fps 60` (selalu diserahkan).
4. `packager-qa` untuk PUBLISH.md. Beri tahu agent itu bahwa ini jalur R: lewati cek `render.mp4` per shot dan cek 4050 frame; durasi = durasi VO terkunci.
