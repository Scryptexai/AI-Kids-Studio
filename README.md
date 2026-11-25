# AI-Kids-Studio — Hidden Infrastructure (3D Stylized Shorts)

Pipeline produksi otomatis end-to-end untuk konten video pendek vertikal (**9:16 / 1080x1920**) bergaya **3D Stylized Low-Poly Diorama** dengan teknik **Color-Coding & Architectural Cutaway** (terinspirasi gaya visual *Kalau Boleh Tau*).

---

## Daftar Episode Season 1 (`docs/PLAYBOOK.md`)

1. **Episode 1 — *Kenapa Lampu Merah Bisa Tau Ada Motor Nunggu?*** (*Inductive Loop Sensor*)
   - Manifest: `episodes/ep01_lampu_merah.json`
   - CLI Renderer: `scripts/render_ep01.py` | Blender 4.x: `blender/ep01_inductive_loop_bpy.py`
   - Subtitle Tersinkronisasi: `output/ep01_lampu_merah_shorts.srt`
   - Hasil Render `.mp4` (Google Drive): [ep01_lampu_merah_shorts.mp4](https://drive.google.com/file/d/1gV4JXRUxfz-z5uL3coLjMoOjCi2_medT/view?usp=drivesdk)

2. **Episode 2 — *Kenapa Tutup Gorong-Gorong Selalu Bulat?*** (*Geometri Manhole Cover*)
   - Manifest: `episodes/ep02_tutup_gorong.json`
   - CLI Renderer: `scripts/render_ep02.py` | Blender 4.x: `blender/ep02_manhole_cover_bpy.py`
   - Subtitle Tersinkronisasi: `output/ep02_tutup_gorong_shorts.srt`
   - Hasil Render `.mp4` (Google Drive): [ep02_tutup_gorong_shorts.mp4](https://drive.google.com/file/d/1Sbp4MSpDAOcHIfALZwbmXTTcmH-cYVO0/view?usp=drivesdk)

3. **Episode 3 — *Bagaimana Menara Air Mengalirkan Air Tanpa Listrik?*** (*Water Tower & Tekanan Hidrostatis*)
   - Manifest: `episodes/ep03_menara_air.json`
   - CLI Renderer: `scripts/render_ep03.py` | Blender 4.x: `blender/ep03_water_tower_bpy.py`
   - Subtitle Tersinkronisasi: `output/ep03_menara_air_shorts.srt`
   - Hasil Render `.mp4` (Google Drive): [ep03_menara_air_shorts.mp4](https://drive.google.com/file/d/1xNjpnnGfPxEMfYhm6pd8Cu6Is5Br_YLl/view?usp=drivesdk)

---

## Struktur Repositori

```text
AI-Kids-Studio/
├── docs/
│   └── PLAYBOOK.md                     # SOP & Naskah Lengkap (Episode 1, 2, & 3)
├── episodes/
│   ├── ep01_lampu_merah.json           # Manifest Episode 1
│   ├── ep02_tutup_gorong.json          # Manifest Episode 2
│   └── ep03_menara_air.json            # Manifest Episode 3
├── assets/
│   └── fonts/                          # Font Plus Jakarta Sans & Montserrat (Bold/ExtraBold/Black)
├── src/
│   ├── native/rasterizer.cpp           # Native C++ OpenMP 3D Z-buffer + Shadow Map + Fresnel engine
│   ├── renderer3d.py                   # Wrapper 3D Stylized Renderer + Multi-scale EEVEE HDR Bloom
│   ├── overlays.py                     # UI Callout 3D-tracked, Dynamic Shorts Subtitles, & CTA Card
│   ├── assets3d.py / episode1_director.py / audio_pipeline.py
│   ├── assets_ep02.py / episode2_director.py / audio_ep02.py
│   └── assets_ep03.py / episode3_director.py / audio_ep03.py
├── blender/
│   ├── ep01_inductive_loop_bpy.py      # Skrip otomasi Blender 4.x (bpy) Episode 1
│   ├── ep02_manhole_cover_bpy.py       # Skrip otomasi Blender 4.x (bpy) Episode 2
│   └── ep03_water_tower_bpy.py         # Skrip otomasi Blender 4.x (bpy) Episode 3
├── scripts/
│   ├── render_ep01.py                  # CLI render full video MP4 + SRT Episode 1
│   ├── render_ep02.py                  # CLI render full video MP4 + SRT Episode 2
│   └── render_ep03.py                  # CLI render full video MP4 + SRT Episode 3
├── output/
│   ├── ep01_lampu_merah_shorts.srt     # Subtitle SRT Episode 1
│   ├── ep02_tutup_gorong_shorts.srt    # Subtitle SRT Episode 2
│   └── ep03_menara_air_shorts.srt      # Subtitle SRT Episode 3
└── requirements.txt
```

---

## Cara Setup & Menjalankan Pipeline

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Letakkan klip VO Bahasa Indonesia di assets/audio/ep01..03/vo_seg*.wav, lalu jalankan:
.venv/bin/python scripts/render_ep01.py
.venv/bin/python scripts/render_ep02.py
.venv/bin/python scripts/render_ep03.py
```

## Eksekusi di Blender 4.x (Workstation Lokal)

```bash
blender --background --python blender/ep01_inductive_loop_bpy.py
blender --background --python blender/ep02_manhole_cover_bpy.py
blender --background --python blender/ep03_water_tower_bpy.py
```
