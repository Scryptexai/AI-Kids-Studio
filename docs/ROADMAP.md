# Roadmap

Status per 2026-11-08. Tahap diselesaikan berurutan; tidak ada tahap yang ditandai selesai tanpa bukti yang bisa dijalankan ulang.

| Tahap | Isi | Status |
|---|---|---|
| **P0** | Bootstrap, doctor, dependency manifest, recovery | ✅ selesai & teruji |
| **P1** | Asset manifest, schema, validasi, klien Drive | ✅ selesai (klien Drive belum diuji live) |
| **P2** | Audit & benchmark 4 engine TTS | 🟡 audit selesai; **benchmark inference terblokir** (bobot tidak dapat diunduh) |
| **P3** | Voice adapter, registry, GUI audition, approval | 🟡 registry + adapter + gate selesai; **GUI belum** |
| **P4** | Renderer 2.5D (Remotion + @sparticuz/chromium) | ⬜ belum |
| **P5** | Sinkronisasi audio ↔ timeline, subtitle | 🟡 retiming & subtitle derivasi selesai; mux audio belum |
| **P6** | Pipeline episode lengkap → MP4 | ⬜ belum |
| **P7** | GitHub Actions render + backup + publishing | 🟡 workflow validate ada; render/publish belum |

---

## Langkah berikutnya, berurutan

### 1. Buka blokir suara produksi (butuh keputusan Anda)

Pilih salah satu:

* **(a) Remote engine** — jalankan VoxCPM 2 di mesin dengan akses HuggingFace, implementasikan kontrak `docs/VOICE-PIPELINE.md#4`, set `TTS_HTTP_ENDPOINT`. Studio tidak perlu diubah.
* **(b) Egress HF** — izinkan `huggingface.co` + `cdn-lfs.huggingface.co`, lalu benchmark lokal (butuh RAM ≥ 8 GB).
* **(c) Bobot di disk** — letakkan checkpoint di sandbox dan set `VOXCPM_WEIGHTS_PATH`.

Tanpa salah satu dari ini, P2/P3 tidak bisa maju ke kualitas produksi.

### 2. Renderer spike (P4) — risiko yang harus diuji dulu

Sebelum menulis banyak kode render:

1. Pasang `remotion` + `@remotion/cli` (npm, diperbolehkan).
2. **Jangan** biarkan Remotion mengunduh browser (host unduhannya diblokir) — arahkan ke binary `@sparticuz/chromium` lewat `--browser-executable`.
3. Render 1 komposisi 3 detik 1280×720 dari `library/worlds/bobby-forest.world.json`.
4. Ukur waktu render & RAM di 2 vCPU. Jika > 3× durasi video, putuskan: turunkan resolusi/fps, atau render di CI mesin lebih besar.

Jika langkah 3 gagal, jangan lanjut menulis scene engine — cari renderer lain lebih dulu.

### 3. Aset visual (paralel, tidak memblokir)

19 aset visual masih "pending art" di manifest: 5 background, 3 karakter base, 6 props, 5 ambience. Semua sudah punya slot, ID, dan path. Begitu file ada di path yang benar, `npm run assets:manifest && npm run validate` otomatis mengubahnya dari warning jadi checksum tracked.

### 4. GUI casting internal (P3)

Halaman minimum: Character Library, Voice Library, Voice Audition (pilih karakter → engine → teks → generate → play/compare → approve). Server internal, bind `0.0.0.0`, tanpa autentikasi publik yang longgar. Gunakan API yang sama dengan script (`scripts/lib/*`), jangan menduplikasi logika gate.

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
