# Production Playbook: Hidden Infrastructure (3D Stylized Shorts)

Dokumen ini adalah panduan operasional standar (*Standard Operating Procedure*) untuk memproduksi konten video pendek (YouTube Shorts, TikTok, Reels) bergaya **3D Stylized Low-Poly** dengan teknik **Color-Coding dan Cutaway** (mengadaptasi gaya visual kanal *Kalau Boleh Tau*).

---

## Bagian 1: Cara Membaca Playbook & Aturan Eksekusi Agent

Setiap episode dalam *playbook* ini dipecah per segmen waktu (total durasi target: **55–65 detik**, rasio aspek **9:16 Vertikal / 1080x1920**). Agent wajib mengeksekusi setiap segmen menggunakan 3 komponen utama:

1. `script : narator` — Teks *voice-over* (VO) berbahasa Indonesia kasual-edukatif. Ritme cepat, tanpa basa-basi, dan menggunakan struktur *Problem → Solution → New Problem*.
2. `adegan recomend` — Deskripsi visual, pergerakan kamera, dan interaksi objek yang harus tampil di layar selama narasi dibacakan.
3. `teknis` — Instruksi teknis eksekusi 3D (aset yang dibutuhkan, *shader/color-coding*, animasi *keyframe*, serta *overlay* UI/teks).

### Standar Visual Wajib (Style Guide)

- **Geometri:** *Low-to-mid poly*, sudut sedikit tumpul (*bevel* ringan), proporsi seperti mainan/miniatur diorama.
- **Pencahayaan:** Terang merata (*sunlight* + *ambient occlusion*), tanpa bayangan hitam pekat agar komponen mekanis terbaca jelas.
- **Color-Coding:** Objek latar belakang menggunakan warna netral/pastel (abu-abu aspal, hijau daun kalem). Komponen yang sedang dijelaskan wajib diberi material **Emission / Highlight** warna kontras (kuning menyala, merah, atau biru neon).

### Standar Naskah Storytelling V7 (WAJIB untuk semua konten baru, menggantikan struktur naskah V5/V6)

Naskah ditulis sebagai **cerita**, bukan narasi dokumenter. Visual tetap mengikuti standar kepadatan V6 di bawah.

| Aturan | Wajib |
| :--- | :--- |
| **3 detik pertama** | Shot 1 = satu kalimat lengkap yang langsung mengejutkan / berbahaya, **≤ 48 karakter (≤ 3 detik ucapan)**. Masuk di tengah aksi (*in medias res*). Dilarang: "Tahukah kamu", "Pernahkah kamu", "Di video ini", "Halo semua", pembukaan pelan. |
| **Tokoh & taruhan** | Ada protagonis (mis. "Pak Darto", sopir truk) atau "kamu" yang mengalami langsung, dengan taruhan nyata (nyawa, gedung, pesawat). |
| **Intensitas terus naik** | Bahaya → alternatif yang gagal satu per satu → pengungkapan rahasia → klimaks (detik paling menegangkan) → lega. Kalimat pendek, ritme makin rapat menjelang klimaks. |
| **Tanpa "Oh, jadi ..."** | Kalimat sintesis "Oh, jadi ..." **dihapus** (terdengar norak dan tidak natural). Penutup memakai satu kalimat alami yang membawa penonton kembali ke dunia nyata: "Lain kali lewat …, cari …". |
| **Batas akurasi** | Tetap ada, tetapi diucapkan natural di dalam cerita ("Tapi …"), bukan "Batas akurasi: …". Shot-nya diberi `boundary=True` sehingga HUD tetap menampilkan badge amber **BATAS AKURASI**. |
| **Jumlah shot** | **20 shot adalah batas MINIMUM, bukan target.** Tambah shot sesuai kebutuhan cerita (V7: 22–24 shot). Satu adegan 3D boleh dipakai untuk beberapa ketukan cerita dengan jendela animasi `p` berbeda (sebelum/sesudah retak, dll.). |
| **Panjang naskah** | ≤ 1.050 karakter agar VO yang dirapatkan (jeda 0,16 dtk, `atempo` ≤ 1,16) tetap < 58 detik. |
| **Akhir video** | Penutup → pertanyaan A/B "Lebih jenius mana: X, atau Y?" → "Tulis jawabanmu di komentar." → "Tekan tombol putih, besok ada rahasia lain." |

Pipeline V7:
1. `src/knot_v7_story_scripts.py` — naskah cerita per shot (`scene` = adegan 3D V6, `p` = jendela animasi, `badge`, `ptr`, `boundary`, `closing`); `verify_story_scripts()` menolak hook > 48 karakter, frasa terlarang (termasuk "oh, jadi"), < 20 shot, < 50 objek, tanpa shot batas akurasi, atau penutup ≠ 1.
2. `tools/prepare_v7_audio.py` — VO `voice-00` dari `assets/audio/v7_vo/`, timing shot, mix `-14.0 LUFS`, caption `--max-width 0.63`.
3. `src/knot_v7_director.py` — memakai builder 3D V6 apa adanya dengan `scene_idx` + `p_range` per shot cerita.
4. `tools/render_v7_batch.py` → `short_qa.py` → `tools/v7_density_qa.py`; cek 360px `tools/v7_phone_check.py`; manifest `tools/update_v7_upload_manifests.py` (deskripsi tanpa "Oh, jadi").

### Standar Kepadatan Ilustrasi V6 (WAJIB untuk semua konten baru — visual)

Setiap klausa narasi wajib punya shot sendiri, dan setiap kata benda / alat / konteks / mekanisme yang disebut wajib dibangun sebagai objek 3D bernama — tidak boleh ada narasi yang lewat tanpa ilustrasi.

| Aturan | Short ~60 detik | Long Video |
| :--- | :--- | :--- |
| Jumlah shot minimum | **≥ 20 shot — MINIMUM, bukan target** (V6: 22, V7: 22–24; tambah sesuai konteks) | proporsional: ≥ 20 shot per 60 detik |
| Objek 3D bernama yang berbeda | **≥ 50 objek** per video (V6: 72–84) | proporsional: ≥ 50 per 60 detik |
| Objek narasi per shot terlihat di layar | ≥ 85% (kamera auto-framing) | sama |
| Objek per shot | ≥ 10 (shot close-up/studio diberi properti konteks yang relevan, prefix `ctx_`) | sama |

Pipeline V6:
1. `src/knot_v6_scripts.py` — naskah per klausa (1 klausa = 1 shot) + daftar `objects` per shot; `verify_script_density()` menolak naskah < 20 shot / < 50 objek.
2. `tools/prepare_v6_audio.py` — VO `voice-00`, timing shot frame-exact, mix `-14.0 LUFS` 48 kHz stereo, caption word-pop `--max-width 0.63`.
3. `src/knot_v6_objects.py` — `SceneObjectRegistry` + builder 3D per shot; `build_v6_shot_scene` gagal (assert) bila ada objek narasi yang tidak dibangun. `add_context_props` menambah properti konteks relevan pada shot yang < 10 objek.
4. `src/knot_v6_director.py` — 14 sub-state animasi geometri per shot, kamera kontinu 30 fps dengan auto-framing (semua objek narasi muat di antara badge atas dan zona caption), callout pointer 3D→layar, kartu A/B, tombol putih.
5. `tools/render_v6_batch.py` — render (maks 2 worker) → `short_qa.py` → `tools/v6_density_qa.py` (gerbang ≥ 20 shot, ≥ 50 objek, ≥ 85% objek narasi on-screen).
6. Storyboard per shot (`output/qa/v6_storyboards/`) + cek 360px wajib dilihat sebelum unggah, lalu `tools/update_v6_upload_manifests.py`.

---

## Bagian 2: Tools yang Wajib Di-install & Digunakan

| Kategori | Tool Wajib | Fungsi dalam Pipeline |
| :--- | :--- | :--- |
| **3D Engine** | **Blender 4.x** (Render Engine: **EEVEE**) / **Native 3D Stylized Engine** | Modeling *low-poly*, animasi *keyframe*, *shader color-coding*, dan *rendering* cepat. |
| **Automasi 3D** | **Blender Python API (`bpy`)** | Menjalankan skrip otomatis untuk generate aset dasar, *camera panning*, dan *highlight* material. |
| **Aset & Karakter** | **Mixamo** / **Poly Haven** / **Sketchfab (CC0)** | Mengambil *base mesh* karakter *blocky*, kendaraan *low-poly*, dan tekstur jalan raya. |
| **Voice Over (TTS)** | **ElevenLabs** / **Edge-TTS** / **Studio TTS** | Generate suara narator Indonesia yang natural dengan *pacing* cepat. |
| **Video & Subtitle** | **FFmpeg** + **Whisper / Acoustic Aligner** | Menggabungkan *render* 3D, audio VO, *sound effects* (SFX), dan *auto-subtitle* dinamis di tengah-atas/bawah layar. |

---

## Bagian 3: Naskah & Breakdown Produksi

### Episode 1: Kenapa Lampu Merah Bisa Tau Ada Motor Nunggu?

**Topik:** *Inductive Loop Sensor* di bawah aspal jalan.

#### Segmen 1: Hook (00:00 – 00:08)
- **script : narator:** *"Pernah nggak kamu berhenti di lampu merah tengah malam, jalanan sepi banget, tapi tiba-tiba lampunya langsung berubah jadi hijau? Kok bisa?"*
- **adegan recomend:** Kamera *high-angle* menyorot persimpangan jalan raya malam hari yang sepi. Satu karakter *blocky* naik motor *low-poly* berhenti tepat di belakang garis putih. Lampu merah di atas tiba-tiba berkedip lalu berubah menjadi hijau.
- **teknis:**
  - **Asset:** `Road_Intersection_LowPoly`, `Traffic_Light`, `Scooter_Model`, `Character_Blocky`.
  - **Lighting:** *Night setup* (lampu jalan oranye redup + *emission* merah ke hijau pada lampu lalu lintas).
  - **Kamera:** *Smooth zoom-in* ke arah motor dan garis putih.

#### Segmen 2: Mitos vs Fakta (00:08 – 00:18)
- **script : narator:** *"Banyak yang ngira di atas tiang itu ada kamera pengintai yang ngelihatin kita. Padahal bukan. Rahasianya ada tepat di bawah ban motormu."*
- **adegan recomend:** Kamera bergerak naik menyorot tiang lampu merah (muncul ikon kamera CCTV dengan tanda silang merah ❌). Lalu kamera menukik tajam ke bawah, menembus aspal (*cutaway*).
- **teknis:**
  - **Asset:** `CCTV_Icon_3D`, `Red_Cross_UI`.
  - **Animasi:** Gunakan *boolean modifier* atau transparansi (*alpha blend*) pada lapisan aspal jalan agar bagian bawah aspal terlihat jelas.

#### Segmen 3: Mekanisme Utama (00:18 – 00:35)
- **script : narator:** *"Di dalam aspal itu ditanam gulungan kabel tembaga yang dialiri listrik. Namanya Inductive Loop. Kabel ini ngebentuk medan magnet tak kasat mata di atas jalanan."*
- **adegan recomend:** Aspal menjadi semi-transparan. Terlihat kotak/oktagon kabel tembaga menyala di bawah garis berhenti. Gelombang medan magnet berbentuk kubah transparan berwarna biru muda muncul dari kabel tersebut ke permukaan jalan.
- **teknis:**
  - **Asset:** `Copper_Coil_Loop` (dibuat dari *curve/bevel* berbentuk persegi panjang dengan sudut tumpul).
  - **Shader:** Beri material *Emission* kuning-oranye pada kabel. Untuk medan magnet, gunakan *wireframe/fresnel shader* biru transparan yang berdenyut (*animate scale/opacity*).
  - **UI Overlay:** Muncul teks penunjuk: `INDUCTIVE LOOP`.

#### Segmen 4: Interaksi Logam & Sinyal (00:35 – 00:50)
- **script : narator:** *"Begitu motor atau mobil kamu lewat, bodi logam kendaraanmu bakal mengganggu medan magnet tadi. Perubahan frekuensi ini langsung dideteksi sensor, lalu ngirim sinyal ke kotak kontrol buat nyalain lampu hijau."*
- **adegan recomend:** Motor melaju masuk ke area kubah biru. Seketika bagian logam/mesin motor menyala merah (*highlight*), kubah biru berubah warna jadi merah/oranye bergetar. Garis cahaya (*data pulse*) meluncur cepat dari kabel bawah tanah masuk ke tiang lampu merah.
- **teknis:**
  - **Color-Coding:** Ubah warna *emission* medan magnet dari biru ke oranye saat motor masuk ke *bounding box* area sensor.
  - **VFX:** Gunakan kurva jalur kabel (*bezier curve*) dengan animasi *bevel factor* untuk efek aliran listrik/sinyal yang mengalir ke kotak kontrol lampu merah.

#### Segmen 5: Twist / Masalah Baru & Penutup (00:50 – 01:00)
- **script : narator:** *"Tapi, karena sensor ini butuh logam yang cukup besar, sepeda atau motor yang terlalu tipis kadang nggak kebaca. Makanya ada marka garis kotak di aspal biar kamu tau harus berhenti di mana. Di daerahmu lampu merahnya pakai sensor, atau pakai tukang parkir?"*
- **adegan recomend:** Karakter naik sepeda kecil lewat di pinggir garis, kubah biru tidak bereaksi sama sekali (lampu tetap merah). Lalu kamera kembali *zoom-out* memperlihatkan garis kotak sensor di aspal.
- **teknis:**
  - **Asset:** `Bicycle_LowPoly`.
  - **Ending:** *Freeze frame* ringan dengan teks pertanyaan di layar untuk memancing komentar.

---

### Episode 2: Kenapa Tutup Gorong-Gorong Selalu Bulat?

**Topik:** Geometri *Manhole Cover* (Kenapa bentuk lain berbahaya).

#### Segmen 1: Hook (00:00 – 00:07)
- **script : narator:** *"Coba perhatiin jalanan di kotamu. Hampir semua tutup gorong-gorong itu bentuknya bulat. Kenapa nggak kotak atau segitiga aja biar gampang bikinnya?"*
- **adegan recomend:** Kamera *top-down* menyorot jalan aspal dengan karakter *blocky* berjalan santai melewati tutup gorong-gorong besi bulat. Tutup tersebut diberi *outline* kuning menyala.
- **teknis:** Asset `Street_Sidewalk`, `Manhole_Round`, `Character_Blocky`. Transisi cepat ke *top-down view*.

#### Segmen 2: Simulasi Kegagalan / Masalah (00:07 – 00:25)
- **script : narator:** *"Jawabannya simpel: supaya nggak jatuh ke dalam lubang. Coba bayangin kalau tutupnya bentuk persegi. Lebar sisinya memang sama, tapi garis diagonalnya jauh lebih panjang."*
- **adegan recomend:** Tutup bulat berubah menjadi bentuk persegi, diputar miring secara diagonal (45°), lalu dijatuhkan dan lolos masuk ke dalam lubang gorong-gorong.
- **teknis:** Asset `Manhole_Square`, `Underground_Pipe_Cutaway`. Garis hijau pada sisi (`100 cm`) dan merah pada diagonal (`141 cm`).

#### Segmen 3: Solusi Geometri Bulat (00:25 – 00:42)
- **script : narator:** *"Kalau tutupnya bulat, diameter dari sudut mana pun selalu sama persis. Mau diputar, dimiringin, atau digoyangin kayak gimana pun, tutupnya nggak akan pernah muat masuk ke lubangnya sendiri."*
- **adegan recomend:** Tutup bulat dicoba dimasukkan miring ke segala arah namun selalu mentok di bibir lubang (*rim*).
- **teknis:** Highlight kuning pada *lip/rim* dalam yang lebih kecil 5 cm dari diameter tutup + efek getaran/percikan ringan.

#### Segmen 4: Keunggulan Tambahan & Penutup (00:42 – 00:55)
- **script : narator:** *"Selain itu, tutup besi ini beratnya bisa puluhan kilo. Karena bulat, petugas cukup menggelindingkannya buat mindahin, nggak perlu diangkat. Simpel, tapi nyelamatin banyak orang."*
- **adegan recomend:** Karakter pekerja *blocky* memiringkan tutup bulat lalu menggelindingkannya seperti roda.
- **teknis:** Rig rotasi roda sederhana pada `Manhole_Round` disinkronkan dengan *walk cycle* karakter.

---

### Episode 3: Bagaimana Menara Air Mengalirkan Air Tanpa Listrik?

**Topik:** Prinsip Gravitasi & Tekanan Hidrostatis pada *Water Tower*.

#### Segmen 1: Hook (00:00 – 00:08)
- **script : narator:** *"Pas listrik di rumahmu mati total, kenapa air dari keran PDAM sering kali masih bisa ngalir lancar? Rahasianya ada di menara air raksasa ini."*
- **adegan recomend:** Diorama kota kecil *low-poly*. Lampu rumah padam bersamaan, tapi di *cutaway* rumah keran wastafel tetap mengucurkan air biru cerah. Kamera *zoom-out* cepat ke Menara Air tinggi.
- **teknis:** Asset `Mini_City_Houses`, `Water_Tower_LowPoly`, `Sink_Cutaway`. Matikan *emission* jendela rumah serentak.

#### Segmen 2: Cara Kerja Pompa & Gravitasi (00:08 – 00:26)
- **script : narator:** *"Menara air ini nggak butuh listrik buat dorong air ke rumahmu, karena dia pakai gravitasi. Listrik cuma dipakai sekali di awal buat mompa air naik ke tangki di atas sana, biasanya pas tengah malam."*
- **adegan recomend:** *Cutaway* menara air. Pipa kiri menyala hijau, panah air naik mengisi tangki hingga penuh.
- **teknis:** Tangki *glass shader* transparan + silinder air biru dengan animasi skala pengisian (*fill animation*).

#### Segmen 3: Tekanan ke Rumah-Rumah (00:26 – 00:45)
- **script : narator:** *"Begitu airnya udah di atas, berat air itu sendiri nyiptain tekanan besar ke bawah. Setiap 10 meter ketinggian, tekanannya nambah sekitar 1 bar. Makanya air otomatis kedorong kencang lewat pipa bawah tanah ke semua rumah, bahkan sampai lantai dua."*
- **adegan recomend:** Pipa *outlet* menyala biru terang, air mengalir turun ke jaringan pipa bawah tanah bercabang hingga naik ke keran lantai 2 rumah.
- **teknis:** UI Overlay garis ukur vertikal (`± 30 Meter = 3 Bar`) + animasi aliran air pada pipa bawah tanah.

#### Segmen 4: Kenapa Nggak Pakai Pompa Langsung? (00:45 – 00:58)
- **script : narator:** *"Kalau kota cuma ngandelin pompa listrik langsung tanpa menara, pas jam sibuk pagi hari semua orang mandi barengan, pompanya bakal jebol. Menara air ini jadi 'baterai air' cadangan buat satu kota."*
- **adegan recomend:** Perbandingan cepat: pompa listrik kecil bergetar hebat lalu berasap hitam (❌), beralih ke menara air kokoh mengalirkan air tenang (✅).
- **teknis:** VFX partikel asap hitam *low-poly* pada pompa listrik serta *overlay* indikator status sistem stabil pada menara air.
