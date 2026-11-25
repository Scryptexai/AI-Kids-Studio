# AI-Kids-Studio & Knot Theory V3 — 3D Cutaway Production + Zernio 4x/Day YouTube Scheduler

Pipeline produksi video edukasi rekayasa 3D (*Hidden Infrastructure* & *Safety Engineering*) berbahasa Indonesia yang terintegrasi penuh dari **C++/OpenMP Stylized 3D Renderer + Procedural Audio/VO + Auto-SRT** hingga **Penjadwalan Otomatis 4 Video / Hari ke YouTube via GitHub Actions → Google Drive → Zernio API**.

---

## 1.Jadwal Tayang Otomatis 4 Video / Hari (`Asia/Makassar` WITA)

| Slot Harian | Jam WITA | Format | Target Durasi | Sumber Editorial |
|---|---|---|---|---|
| **1. Pagi** | `08:00` | **Short (`1080x1920`, 9:16)** | 43–51 dtk | `Knot_Theory_V3_Ide_Terkuat.pdf` |
| **2. Siang** | `12:30` | **Short (`1080x1920`, 9:16)** | 43–51 dtk | `Knot_Theory_V3_Ide_Terkuat.pdf` |
| **3. Sore** | `16:30` | **Long Documentary (`1920x1080`, 16:9)** | **10–20 mnt** | Topik Megastruktur & Sistem Rekayasa di Luar 28 Ide PDF |
| **4. Malam** | `20:30` | **Short (`1080x1920`, 9:16)** | 43–51 dtk | `Knot_Theory_V3_Ide_Terkuat.pdf` |

Detail kalender editorial 5 hari penuh (`KT-S01`..`KT-S14` + `KT-L01`..`KT-L05`) tersedia di [`docs/KNOT_THEORY_V3_SCHEDULE.md`](docs/KNOT_THEORY_V3_SCHEDULE.md) dan [`episodes/knot_theory_v3_master_plan.json`](episodes/knot_theory_v3_master_plan.json).

---

## 2. Master Video Knot Theory V3 yang Sudah Dirender, Diverifikasi SHA-256 & Siap Tayang

Seluruh master `.mp4` disimpan di Google Drive folder [`1nBzSmuWbD_vbognbMZ4B9NQStpiuLcYn`](https://drive.google.com/drive/folders/1nBzSmuWbD_vbognbMZ4B9NQStpiuLcYn) dengan izin publik **`Anyone with the link -> Viewer`** agar runner GitHub Actions (`ubuntu-latest`) dapat menariknya otomatis tanpa membebani ukuran repositori Git:

| Kode | Slot & Jadwal (WITA) | Judul Video | Format & Durasi | Google Drive File ID |
|---|---|---|---|---|
| **`KT-S01`** | Hari 1 Pagi (`2026-11-26 08:00`) | *Angin Kencang di Peron MRT Datang Sebelum Keretanya Terlihat* | Short 9:16 • `45.75s` | `1C63SKT80Cr6qtjbTHY4rcNGv-MTDMVoF` |
| **`KT-S02`** | Hari 1 Siang (`2026-11-26 12:30`) | *Di Film Semua Sprinkler Menyala Sekaligus. Aslinya Cuma 1 Kepala!* | Short 9:16 • `48.13s` | `13P6QOBBMZPr74L7myLMJIMXZEBu_k2jw` |
| **`KT-L01`** | **Hari 1 Sore (`2026-11-26 16:30`)** | ***5 Mesin Raksasa di Bawah Kota yang Bekerja Diam-Diam Saat Badai dan Mati Lampu*** *(Luar PDF)* | **Long 16:9 • `11m 02.75s`** | `1uWXXNVKB_Op_jkFt4zRsEUCzZRXdtZkh` |
| **`KT-S03`** | Hari 1 Malam (`2026-11-26 20:30`) | *Hamparan Batu Kerikil di Gardu Listrik Ini Bukan Hiasan Taman* | Short 9:16 • `49.00s` | `1loQE6aKjxdhBZodsYYcBsHy2h3dIv7ie` |
| **`KT-S04`** | Hari 2 Pagi (`2026-11-27 08:00`) | *Sabuk Pengaman Mobil Sengaja Mengalah Sedikit Saat Tabrakan* | Short 9:16 • `50.84s` | `19zPDF22kxwqudQ7dS8_16GK0HgXkiJsX` |
| **`KT-S05`** | Hari 2 Siang (`2026-11-27 12:30`) | *Toilet Kamar Tamu Bau Setelah Lama Kosong? Bukan Pipanya yang Rusak* | Short 9:16 • `45.44s` | `18kGn8ikGzLChfVwH_kUESrmilnAQeEpA` |
| **`KT-S06`** | Hari 2 Malam (`2026-11-27 20:30`) | *Batang Setir Mobil Sengaja Dirancang Supaya Bisa Memendek* | Short 9:16 • `44.01s` | `1tzekP_kmsYCSqySS5jtWO0JEG-gh5kzr` |

*(Plus arsip awal `EP01–EP03` Shorts di folder Google Drive yang sama.)*

---

## 3. Arsitektur GitHub Actions → Google Drive → Zernio API → YouTube

- **Workflow:** [`.github/workflows/youtube-upload.yml`](.github/workflows/youtube-upload.yml)
  - `push` pada `upload/queue/*.json`
  - `schedule` cron **4x sehari** (`07:30`, `12:00`, `16:00`, `20:00` WITA — 30 menit sebelum tiap slot tayang)
  - `workflow_dispatch` manual (`BATCH_READY`, per episode `KT-S01`..`KT-L01`, atau `LOOKUP`, dengan opsi `dry_run=true/false`)
- **Fetcher Drive:** [`tools/fetch_masters.py`](tools/fetch_masters.py) — mengunduh MP4 publik dari Google Drive (`gdown` + fallback `drive.usercontent.google.com`) dan menyalin thumbnail JPEG `< 200 KB` dari `upload/thumbs/`.
- **Uploader & Scheduler Zernio:** [`tools/upload_zernio.py`](tools/upload_zernio.py)
  1. Memvalidasi provenance `ai-kids-studio-3d-cpp`, kecocokan ukuran byte + `SHA-256`, aturan editorial (hook pembuka deskripsi, judul ≤ 100 karakter, `madeForKids=false`), dan ukuran thumbnail `< 2 MB`.
  2. Meminta presigned URL (`POST https://zernio.com/api/v1/media/presign`), mengunggah MP4 & JPEG (`PUT`), lalu memanggil `POST https://zernio.com/api/v1/posts` lengkap dengan `Idempotency-Key`, `scheduledFor`, `timezone: "Asia/Makassar"`, dan `firstComment`.
  3. Menyimpan status dan `post_id` ke [`upload/published.json`](upload/published.json) agar idempoten (tidak pernah mengunggah ganda).

### Konfigurasi GitHub Secrets (Satu Kali)
Tambahkan di **GitHub Repository → Settings → Secrets and variables → Actions**:
- `ZERNIO_API_KEY`: API key dari akun Zernio Anda
- `ZERNIO_YOUTUBE_ACCOUNT_ID`: ID kanal YouTube yang terhubung di Zernio *(opsional otomatis dideteksi dari `GET /v1/accounts` bila hanya ada 1 kanal aktif)*
- `ZERNIO_PLAYLIST_ID` *(opsional)*

---

## 4. Struktur Kode Produksi

- `src/native/rasterizer.cpp` & `src/renderer3d.py` — Mesin rasterizer 3D C++/OpenMP *stylized cutaway* (shadow map, rim light, bloom).
- `src/knot_shorts_engine.py` — Mesin animasi 3D, SFX foley, & kompositor 9:16 untuk Shorts `KT-S01`..`KT-S06`.
- `src/knot_long_ep01.py` — Mesin dokumenter panjang 16:9 (`1920x1080`, 7 bab, 11+ menit) untuk `KT-L01`.
- `scripts/render_knot_v3_batch.py` — Skrip *batch render* Shorts + Long Documentary.
- `scripts/generate_zernio_manifests.py` — Generator manifest, provenance SHA-256, dan antrean `upload/queue/*.json`.
- `output/*.srt` — Berkas takarir Bahasa Indonesia tersinkronisasi untuk setiap video.
