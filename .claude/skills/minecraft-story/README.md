# Install (Windows)

1. Folder skill: `~/.claude/skills/minecraft-story`. Semua script dipanggil dengan path absolut `~/.claude/skills/minecraft-story/scripts/...` (disebut `SKILL/` di dokumen lain).
2. **Pasang ke-9 agent**: `node ~/.claude/skills/minecraft-story/scripts/install.mjs`, lalu mulai sesi Claude Code baru.
   - Script ini menyalin `agents\*.md` ke `~/.claude/agents/` dan menyesuaikan path hook kalau folder skill ada di tempat lain.
   - Cek: `node ~/.claude/skills/minecraft-story/scripts/doctor.mjs` → harus `0 FAIL`. Path hook yang salah tidak memblokir apa pun (kode keluar 1, bukan 2), jadi cek ini wajib.
   - Agentnya: formula-analyst, script-writer, originality-checker, storyboard-director, set-builder, visual-director, camera-director, continuity-checker, packager-qa.
   - Hook kepemilikan (`scripts/guard_paths.mjs`) ada di frontmatter tiap agent, jadi hanya aktif kalau agent dipanggil sebagai subagent terpasang.
   - Setelah mengubah `agents\*.md` atau memindah folder skill, jalankan `install.mjs` lagi.
3. Node 18+ (semua script), `ffmpeg/ffprobe` di PATH.
4. Python + `pip install mcschematic` hanya untuk mode `.schem` (opsional).
5. Minecraft: dua instance **Java 1.20.1 + Fabric** (`TOOLS.md` §0). **Hanya untuk jalur P1.** Jalur R (default) tidak butuh game berjalan, tapi butuh engine Minecraft Remotion (`engines/minecraft/` di repo claude-shorts-skills) dan tekstur yang diekstrak dari `.jar` Minecraft Java milikmu sendiri (`SKILL.md`, Jalur R, R0).
   - `MC-Story Server`: dedicated server lokal + Carpet + WorldEdit, `enable-rcon=true`, world superflat.
   - `MC-Story Client`: Sodium + Iris + BBS + ReplayMod + skin loader, connect ke `localhost`.
6. Sekali per mesin (ulangi kalau app `.sc` di skill berubah): copy `scripts/mc/scarpet/*.sc` ke `<server>/config/carpet/scripts/`.
7. Di root repo: isi `.rcon.json`, termasuk command freeze yang berfungsi di servermu (SKILL.md Step 0.5):
   ```json
   { "host": "127.0.0.1", "port": 25575, "password": "ganti-ini",
     "tick_freeze": "tick freeze on", "tick_unfreeze": "tick freeze off" }
   ```
8. Tes app scarpet di game (SKILL.md Step 0.5 langkah 6), lalu `doctor.mjs --rcon`.

**Tes pipeline (tanpa server):**
```
node ~/.claude/skills/minecraft-story/tests/run_tests.mjs
```
Hasil harus `0 gagal`. Tes memakai fixture `tests/demo/projects/demo` (2 set, 3 shot).
Tes ini tidak menjalankan Minecraft: app scarpet dan command Carpet hanya teruji di game (langkah 8).

# Prompt pembuka

```
/minecraft-story
Mulai project baru: <slug-project>.
Ide: <ide cerita / "bebas, kasih 5 konsep">.
Path produksi: R (render Remotion, tanpa game). Pakai P1 (in-game: Scarpet + BBS + ReplayMod) kalau engine Minecraft tidak ada di repo.
Script referensi aku taruh di projects/<slug-project>/refs/ (atau aku paste di bawah).
Jalankan step by step sesuai SKILL.md, berhenti di setiap GATE.
Durasi wajib 2:15. Transformative, jangan mirip referensi.
```

Lanjut tiap gate cukup: `lanjut` / `revisi: ...`

# File penting

| File | Isi |
|---|---|
| `SKILL.md` | alur step + gate, Wave Produksi paralel |
| `RULES.md` | durasi, struktur, gaya script, set & LAYOUT, kepemilikan file, kamera |
| `PIPELINE.md` | arsitektur, skema lapisan + hasil compile, alur take, scarpet, framing |
| `TOOLS.md` | daftar mod/tool + pembagian server/client + konflik |
| `ownership.json` | wilayah tulis tiap agent (sumber tunggal untuk hook + audit) |
| `scripts/compile_shots.mjs` | gabung lapisan → `shots/<shot>.json`, timing VO, cek clipping/bbox/framing |
| `scripts/check_ownership.mjs` | snapshot + audit kepemilikan sesudah wave |
| `scripts/guard_paths.mjs` | hook PreToolUse: tolak tulisan di luar wilayah agent |
| `scripts/mc/` | RCON client (mengenali balasan error), shot runner (prep/take), app scarpet |
| `scripts/assemble.mjs` | cek frame tiap render → concat → mux `mix.wav` → `final.mp4` 4050 frame |
| `scripts/install.mjs` / `doctor.mjs` | pasang agent dengan path hook yang benar / cek instalasi + kunci |
| `scripts/word_count.mjs` | hitung kata & durasi VO (sumber angka target: 347–368 kata, VO 2:10–2:14) |
| `tests/run_tests.mjs` | regresi pipeline |
