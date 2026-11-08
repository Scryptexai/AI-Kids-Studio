# Kids AI Studio

**Studio produksi internal untuk serial video animasi anak** — bukan game, bukan aplikasi konsumen, bukan produk TTS.

Tujuannya satu: menghasilkan episode animasi anak 2.5D yang **konsisten** (dunia, karakter, gerakan, suara) dan **dapat diproduksi ulang** dari data, bukan dari kerja manual per episode.

> Status saat ini: **P0, P1, dan P4 (renderer) selesai dan teruji** — episode `ep-001` sudah dirender menjadi MP4 34,75 s (H.264/AAC, 1280×720). GUI casting dan engine TTS produksi belum ada: engine TTS produksi tidak dapat dijalankan di sandbox ini, lihat [`docs/AUDIT-2026-11-08.md`](docs/AUDIT-2026-11-08.md) dan [`docs/RENDERER.md`](docs/RENDERER.md).

---

## Quick start (recovery dari sandbox kosong)

```bash
npm install
npm run bootstrap     # dependency + build eSpeak NG (engine smoke-test) dari source
npm run validate      # schema + checksum aset + voice gate
npm run doctor        # laporan host / jaringan / engine → manifests/environment.json
```

Setelah reset sandbox, lengkapnya:

```bash
git clone <repo> && cd AI-Kids-Studio
npm install
npm run bootstrap
npm run assets:restore   # unduh aset besar dari Google Drive (butuh kredensial)
npm run validate
```

---

## Peta perintah

| Perintah | Fungsi | Status |
|---|---|---|
| `npm run bootstrap` | pasang dependency, build eSpeak NG, siapkan direktori | ✅ jalan |
| `npm run doctor` | audit host + jaringan + engine, tulis `manifests/environment.json` | ✅ jalan |
| `npm run assets:manifest` | hitung SHA-256 semua aset → `manifests/assets.json` | ✅ jalan |
| `npm run assets:validate` | validasi checksum & referensi aset (`--strict`) | ✅ jalan |
| `npm run assets:restore` | pulihkan aset dari Drive (`--check` untuk dry-run) | ✅ kode siap, ⚠️ belum diuji live |
| `npm run voice:engines` | matriks engine TTS + probe langsung | ✅ jalan |
| `npm run voice:audition` | 3–4 kandidat suara untuk 1 karakter, teks sama, + manifest perbandingan | ✅ jalan |
| `npm run voice:generate` | hasilkan dialog dari voice registry yang disetujui | ✅ jalan |
| `npm run voice:validate` | validasi registry suara | ✅ jalan |
| `npm run episode:validate` | validasi episode + scene + voice gate | ✅ jalan |
| `npm run episode:render` | render episode → MP4 (H.264/AAC) | ✅ jalan |
| `npm run render:preview` | satu frame PNG untuk cek komposisi (detik, bukan menit) | ✅ jalan |
| `npm test` | unit test | ✅ 10 test |

Tidak ada script kosong di daftar ini, dan tidak ada perintah yang mengaku sukses tanpa melakukan pekerjaan.

---

## Yang sudah nyata vs yang belum

**Sudah bekerja dan terukur**

- Build eSpeak NG dari source di dalam sandbox (tanpa apt, tanpa GPU) — Indonesian voice `id` terverifikasi, RTF **0,0041**.
- Voice registry **versioned** dengan gate approval: pipeline menolak menghasilkan dialog jika profil belum `approved`, dan **tidak pernah** mengganti engine/speaker secara diam-diam.
- 6 JSON Schema (character, voice, world, scene, episode, asset) — validasi silang antar world/character/scene/registry.
- Asset manifest dengan checksum SHA-256 dan penanda `storage: git|drive`.
- Timing otomatis: `--reflow` menyusun dialog berurutan, memperbarui subtitle, dan memperpanjang scene bila audio tidak muat.
- 3 karakter + 1 dunia (Bobby Forest, 5 lokasi, 6 prop, 9 animasi, 4 preset kamera) + 2 scene episode contoh.
- **Renderer 2.5D**: scene JSON → SVG → frame → MP4, kamera multi-keyframe, rig karakter beranimasi (idle/walk/run/jump/talk/wave/laugh/cry/surprise), subtitle berjangka waktu, mix audio dialog + ambience dengan normalisasi −16 LUFS, concat antar-scene. Terukur: **RTF ≈ 5** di 2 vCPU.
- 21 unit test (parser WAV, schema, voice gate, kamera, determinisme frame).

**Belum ada (jangan diasumsikan ada)**

- GUI casting/audition internal — P3 ✅ (`npm run studio` → http://0.0.0.0:4173)
- Remotion sebagai backend renderer — **terblokir** di sandbox ini (3 shared library hilang); lihat `docs/RENDERER.md`.
- Engine TTS produksi yang benar-benar berjalan — bobot model tidak dapat diunduh di sini (P2).
- Upload otomatis ke Drive / GitHub Actions render — P7.

---

## Struktur

```text
apps/renderer/        scene-svg, rigs, audio-mix, render (SVG → MP4)
audio/engines/      definisi engine + adapter (espeak, http-remote, voxcpm, xtts, openvoice, rvc)
audio/voices/       registry.json — identitas suara permanen (versioned)
audio/voices/history/  snapshot registry per perubahan approval
audio/manifests/    metadata tiap baris dialog yang dihasilkan
config/             studio.config.json (kebijakan voice, format audio)
docs/               audit, pipeline suara, renderer, persistence, roadmap
library/            characters, worlds (sumber kebenaran aset)
manifests/          assets.json (checksum) + environment.json
projects/ep-001/    episode.json + scenes/*.json
schemas/            JSON Schema 2020-12
scripts/            bootstrap, doctor, assets/*, voice/*, episode/*
tests/              unit test node:test
.tools/             binary engine hasil build (tidak di-commit)
```

---

## Prinsip yang dipegang

1. Voice identity disimpan sebagai **data**, bukan nama speaker sementara. `characterId → alias → engine → model → profil → parameter`.
2. Profil yang sudah `approved` **tidak boleh** berubah otomatis; perubahan = versi baru + catatan history.
3. Tidak ada fallback TTS diam-diam. Engine tidak tersedia → proses berhenti dengan pesan yang menyebutkan solusinya.
4. Media besar tidak masuk git; manifest + Drive adalah jalurnya.
5. Kredensial hanya dari environment, tidak pernah dari repository.

Lihat [`docs/VOICE-PIPELINE.md`](docs/VOICE-PIPELINE.md) dan [`docs/PERSISTENCE.md`](docs/PERSISTENCE.md).
