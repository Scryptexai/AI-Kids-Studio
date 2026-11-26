# Perubahan 2026-11-26 (2): engine Minecraft ikut di repo publik

- Engine render jalur R sekarang ada di repo claude-shorts-skills, folder `engines/minecraft/`: renderer (`src/minecraft/`), validator + stager set voxel (`npm run mc`), `scripts/mccheck`, ekstraktor tekstur, dan demo. **Tanpa tekstur Mojang**: user mengekstrak sendiri dari `.jar` Minecraft Java miliknya.
- R0: kalau engine tidak ada di project, salin dari `engines/minecraft/`, ekstrak tekstur, render demo. Berhenti dan tawarkan P1 hanya kalau user tidak punya Minecraft Java atau tes engine gagal.
- Diuji di salinan bersih: `npm install`, ekstrak dari jar 1.21.5, demo, gate 0 FAIL, plant test lolos, render mp4 1080×1920 210 frame dalam 15 s.

# Perubahan 2026-11-26: jalur R (Remotion) jadi default

- SKILL.md punya bagian baru **"Jalur R — Render Remotion tanpa game"** (R0–R7). Ini jalur yang sebenarnya dipakai untuk "The Tapper" (remake) dan "Mined, Not Born": VO dikunci dulu → SHOTLIST satu dunia (W0) → BUILD_PLAN + Wave A (world, fx, actors, infra) → Wave B keying per section dengan gate `scripts/mccheck` → draft + review → suara → final 2K 60 fps + stems + captions.
- Step 0 menanyakan jalur; P1 (Scarpet + BBS + ReplayMod) tetap ada sebagai opsi. Step 5–9 hanya untuk P1.
- R0 menghentikan pekerjaan kalau engine Minecraft (`src/minecraft/`, `scripts/mccheck/`, tekstur, render GPU) tidak ada di repo, supaya Claude tidak membangun renderer pengganti seadanya.
- Tes: 55 lolos, 0 gagal. Doctor: 0 FAIL.

# Perubahan (audit 2026-11-24)

Tes: `node <skill>/tests/run_tests.mjs` → 54 lolos, 0 gagal. Tes ini tidak menjalankan Minecraft.

## Wajib kamu kerjakan setelah memasang versi ini
1. `node <skill>/scripts/install.mjs`, mulai sesi Claude Code baru, lalu `node <skill>/scripts/doctor.mjs` → 0 FAIL.
2. Copy ulang `scripts/mc/scarpet/*.sc` ke `<server>/config/carpet/scripts/`.
3. Di server: cek `/tick freeze status`, `/tick freeze on`, `/tick freeze off`. Tulis yang berfungsi ke `.rcon.json` (`tick_freeze`, `tick_unfreeze`).
4. Tes tiap app scarpet di game (SKILL.md Step 0.5 langkah 6).
5. Project lama: `off` yang merujuk **anchor** harus dikurangi 0.5 di x dan z (anchor sekarang = tengah blok), lalu compile ulang.

## Uji di game 2026-11-24 (setelah pasang)
- App scarpet diuji lewat RCON di server uji lokal: 14/14 lolos (detail di `scripts/mc/README.md`). Freeze = `tick freeze on|off` (sudah di `.rcon.json` root repo).
- `rcon.mjs`: "Too many blocks in the specified area" (fill > 32.768) sekarang dihitung gagal. Tes: 55 lolos.
- Server diubah dari peaceful ke **easy** (mob hostile hilang saat di-spawn di peaceful). `doMobSpawning` tetap false.

## Belum teruji di game
- `crowd.sc`, `actor.sc`, `env.sc`, `wall.sc` ditulis ulang/diperbaiki tanpa server untuk mengetesnya. Lihat `scripts/mc/README.md` bagian "Status uji app scarpet".
- Command freeze eksplisit (`tick freeze on|off`) belum dipastikan ada di versi Carpet-mu; karena itu dibuat bisa diatur lewat `.rcon.json`.
- Path hook berkutip (folder skill dengan spasi) teruji lewat `doctor.mjs`, belum di dalam Claude Code.

## Scarpet
- Trigonometri memakai derajat: sudut emas 137.5° (`crowd.wander`, `env.ignite`), `360 * i / n` (`wall`), `atan2` tanpa × 57.29, dan tanda yaw dibetulkan (`atan2(-dx, dz)`).
- `crowd.sc`: append `+=`, hapus entity `modify(e, 'remove')`, mob diberi tag `mcs_actor` + `PersistenceRequired` lewat NBT `spawn`, `wander`/`march` menghapus kerumunan lama dulu.
- `actor.sc`: beberapa aktor sekaligus (satu `follow` per aktor), punya `reset()`/`clear()`.
- `wall.sc`: `ring_now` tidak lagi mengubah kecepatan build secara permanen; ada `clear()`.

## shot.mjs / rcon.mjs
- Balasan error dari server (teks) sekarang dihitung gagal; shot berhenti dan exit 1.
- `kill @e[tag=mcs_actor]`, `player <nama> kill`, `forceload` boleh "gagal" (tidak ada yang perlu dikerjakan).
- Semua fake player project dikeluarkan sebelum spawn (`fakes_all` dari compile).
- Mob aktor default `NoAI:1b, Silent:1b, Invulnerable:1b`; `"ai": true` di visual.json untuk AI asli.
- Command freeze/unfreeze dari `.rcon.json`.
- Catatan kamera memuat yaw/pitch dan perintah `/tp @s …` untuk inspeksi framing.
- RCON tidak lagi menunggu 60 ms per command (hanya untuk balasan multi-paket).

## compile_shots.mjs
- Anchor = tengah blok (x+0.5, z+0.5).
- `pre` dibuka dengan `forceload add <bbox set>`.
- Key kamera punya `yaw` dan `pitch`.
- WARN kalau `fov` berubah di dalam satu shot (engine replaymod).

## Baru
- `scripts/assemble.mjs`: cek jumlah frame + resolusi tiap render, concat dengan potong tepat per shot, buat `audio/mix.wav` kalau belum ada, mux → `final.mp4` tepat 4050 frame.
- `scripts/install.mjs`: pasang agent ke `~/.claude/agents` dengan path hook sesuai lokasi skill.
- `scripts/doctor.mjs`: cek Node, ffmpeg, agent terpasang, dan hook benar-benar menolak (exit 2).

## Angka dan dokumen
- Target kata 347–368 (= VO 2:10–2:14 pada 160–165 wpm), satu sumber di `word_count.mjs`. Cek `--audio` sekarang 2:10–2:14 (dulu 2:12–2:15).
- Node 18+ di semua dokumen.
- Dihapus: `word_timing.py`, `overlap_check.py`, `check_skin.py` (duplikat versi `.mjs`).
- Step 8 tidak lagi membangun set terpisah (prep sudah membangun). Step 9: assembly = orchestrator, `packager-qa` hanya PUBLISH/captions/QA.
- Path lama di TOOLS §2, `build_schem.py`, komentar `rcon.mjs` dibetulkan.

## Belum dikerjakan
- Script alignment VO → `TIMING.md` + `words.json` (Step 7 masih manual).
- Generate camera path ReplayMod dari `camera.keys` (masih input manual per shot).
- Pemasangan skin ke client (manual, Step 4).
- Cek subject tertutup blok dan jarak kamera vs `size` di compile.
- Hook Bash untuk agent selain set-builder; pemisahan wilayah antar set-builder.
