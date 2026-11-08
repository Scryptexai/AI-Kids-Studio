# Roadmap

Status per 2026-11-08. Tahap diselesaikan berurutan; tidak ada tahap yang ditandai selesai tanpa bukti yang bisa dijalankan ulang.

| Tahap | Isi | Status |
|---|---|---|
| **P0** | Bootstrap, doctor, dependency manifest, recovery | ✅ selesai & teruji |
| **P1** | Asset manifest, schema, validasi, klien Drive | ✅ selesai (klien Drive belum diuji live) |
| **P2** | Audit & benchmark 4 engine TTS | 🟡 audit selesai; **benchmark inference terblokir** (bobot tidak dapat diunduh) |
| **P3** | Voice adapter, registry, GUI audition, approval | ✅ `npm run studio` — casting console, approval/migration gates, 11 tests (produksi menunggu engine) |
| **P4** | Renderer 2.5D | ✅ selesai dengan backend **SVG+resvg**; Remotion terblokir (3 shared library hilang) — lihat `docs/RENDERER.md` |
| **P5** | Sinkronisasi audio ↔ timeline, subtitle | ✅ retiming, subtitle, mux audio + loudnorm −16 LUFS |
| **P6** | Pipeline episode lengkap → MP4 | 🟡 episode → MP4 berjalan (34,75 s); storyboard/script otomatis belum |
| **P7** | GitHub Actions render + backup + publishing | 🟡 workflow validate ada; render/publish belum |

---

## Langkah berikutnya, berurutan

### 1. Buka blokir suara produksi (butuh keputusan Anda)

Pilih salah satu:

* **(a) Remote engine** — jalankan VoxCPM 2 di mesin dengan akses HuggingFace, implementasikan kontrak `docs/VOICE-PIPELINE.md#4`, set `TTS_HTTP_ENDPOINT`. Studio tidak perlu diubah.
* **(b) Egress HF** — izinkan `huggingface.co` + `cdn-lfs.huggingface.co`, lalu benchmark lokal (butuh RAM ≥ 8 GB).
* **(c) Bobot di disk** — letakkan checkpoint di sandbox dan set `VOXCPM_WEIGHTS_PATH`.

Tanpa salah satu dari ini, P2/P3 tidak bisa maju ke kualitas produksi.

### 2. Renderer (P4) — selesai, dengan temuan

Spike dijalankan dan hasilnya: **Remotion tidak bisa dipakai di sandbox ini.** Chromium gagal start
karena `libnss3`, `libnspr4`, `libnssutil3` tidak ada; apt, deb.debian.org, autotools, dan CDN browser
semuanya tertutup. Backend pengganti **SVG + resvg + ffmpeg** dibangun dan terbukti: episode 34,75 s
dirender dalam ~3 menit (RTF ≈ 5 di 2 vCPU). Detail benchmark dan batasannya di `docs/RENDERER.md`.

Berikutnya untuk renderer: art karakter final (rig sudah siap menerima layer gambar), prop final,
dan — bila mesin dengan library lengkap tersedia — backend Remotion sebagai pembanding.

### 3. Aset visual (paralel, tidak memblokir)

19 aset visual masih "pending art" di manifest: 5 background, 3 karakter base, 6 props, 5 ambience. Semua sudah punya slot, ID, dan path. Begitu file ada di path yang benar, `npm run assets:manifest && npm run validate` otomatis mengubahnya dari warning jadi checksum tracked.

### 4. GUI casting internal (P3) — selesai

`npm run studio` → `http://0.0.0.0:4173`. Character Library, Voice Library, engine probe langsung,
audition (teks identik untuk semua kandidat), approve/reject, history append-only. Server
mengimpor `scripts/lib/*` sehingga gate tidak diduplikasi. Detail + batasan di
`docs/STUDIO-GUI.md`.

Sisa P3 (tidak memblokir): pemutar A/B berdampingan, layar migrasi engine, autentikasi internal.
Yang benar-benar memblokir produksi bukan GUI-nya, melainkan belum adanya engine produksi yang
lolos audit — lihat `docs/AUDIT-2026-11-08.md`.

### 5. Sinkronisasi audio (P5)

Sudah ada: durasi per baris, retiming `--reflow`, subtitle diturunkan dari dialog.
Berikutnya: mux track dialog + ambience per scene dengan ffmpeg, normalisasi loudness (EBU R128, target −16 LUFS untuk YouTube), lalu ekspor `scene.wav`.

### 6. Episode → MP4 (P6)

Compose scene render + audio track → MP4 H.264/AAC sesuai `episode.output`. Wajib ada quality gate: durasi, ada audio, resolusi, tidak ada frame hitam panjang.

### 7. Otomasi (P7)

`validate.yml` sudah ada. Berikutnya: `render.yml` (manual dispatch, artifact upload), `backup.yml` (assets → Drive), `publish.yml` (hanya setelah render & validasi lulus).

---

## Yang **tidak** akan dilakukan

* Mengubah proyek menjadi game/aplikasi interaktif.
* Menjadikan website casting sebagai produk.
* Memakai TTS internal sebagai engine produksi diam-diam.
* Menyatakan Bahasa Indonesia didukung tanpa dokumentasi **dan** pengujian.
* Menandai tahap selesai hanya karena aplikasi bisa dijalankan.
