# RULES

## A. Durasi (WAJIB)
- Video final = **2:15 (135 detik)**, 30 fps = 4050 frame.
- VO 2:10–2:14 → 1–5 detik tail (musik/visual punchline/loop).
- Target **347–368 kata** (= VO 2:10–2:14 pada narator 160–165 wpm). Angka ini berasal dari `SKILL/scripts/word_count.mjs`; selalu ukur dengan script itu, jangan tebak. Yang mengikat adalah durasi audio asli (`--audio`).

## B. Struktur default (dipakai kalau FORMULA.md belum ada; kalau ada, FORMULA.md menang)
| % durasi | Detik | Beat |
|---|---|---|
| 0–4% | 0–5 | HOOK: aturan dunia di kalimat pertama ("In this town, ...") |
| 4–15% | 5–20 | Siapa protagonis + kenapa dia BEDA / melanggar aturan |
| 15–45% | 20–60 | Eskalasi 1–2: konsekuensi makin berat |
| 45–70% | 60–95 | Titik terendah / rahasia terbuka |
| 70–90% | 95–122 | TWIST (aturan dunia ternyata punya makna lain) |
| 90–100% | 122–135 | Resolusi singkat + kalimat terakhir nyambung ke hook (loop) |
- Re-hook tiap ±15–20 detik ("But here's the thing...", pertanyaan, angka, ancaman).

## C. Gaya script
- English, terdengar native American speaker, kalimat pendek, present tense, orang ketiga.
- KEY WORDS DALAM CAPS untuk penekanan AI voiceover (maks 1–2 per kalimat).
- Tidak wajib ikut mekanik Minecraft — fiktif boleh. Tapi visual tetap dunia blocky (bisa dibangun).
- Hindari: sapaan ke penonton di awal, "subscribe" di tengah, istilah gore/eksplisit.
- Format `SCRIPT.md`:
  ```
  # <Judul kerja>
  WORLD RULE: <1 kalimat>
  ## VOICEOVER
  B01 | In this town, EVERYONE is born with a timer above their head.
  B02 | ...
  ## TRANSLATION (ID)
  B01 | ...
  ## TITLES
  1. ... 2. ... 3. ...
  ```
  Satu baris `Bxx` = satu beat visual (±3–6 detik).

## D. Transformative (anti-jiplak)
- Yang BOLEH diambil dari referensi: struktur beat, panjang kalimat, jenis hook, ritme re-hook, pacing.
- Yang DILARANG: premis/aturan dunia yang sama, twist yang sama, nama karakter, frasa khas creator, urutan kejadian yang sama.
- Lolos kalau: 0 shared 6-gram, overlap 4-gram ≤ 3%, dan originality-checker menilai premis + twist berbeda.

## E. Visual
- Tiap karakter utama WAJIB pakai skin dari CAST.md; ciri skin harus kebaca di close-up pertama.
- Shot baru tiap 2–4 detik (Shorts) / 3–6 detik (long). Close-up wajah di momen emosi.
- Aspect: 9:16 (1080×1920) untuk Shorts; 16:9 kalau user minta.
- Tidak ada logo Mojang/Minecraft, brand asli, atau karakter/IP milik orang lain di set maupun skin.

## F. Building sets & LAYOUT
- Tiap set punya: nama, fungsi cerita, ukuran (x,y,z), block palette (5–8 blok), mood/lighting, sudut kamera utama.
- `LAYOUT.json` per set:
  - `origin` = pojok bawah bbox, y = lapisan tanah terbawah; `size`; `front`.
  - Anchor bernama `actor` / `landmark` / `cam_entry`, relatif ke origin, ditulis sebagai **koordinat blok (bilangan bulat)**. Anchor actor/cam = blok udara tempat kaki/kamera; tanah 1 lapis di dy 0 → aktor di dy 1.
  - Compile memakai **tengah blok** (x+0.5, z+0.5; y = dasar blok). `off [0,0,0]` = berdiri tepat di tengah blok anchor.
  - **Jarak antar set ≥ 256 blok.** Pakai grid origin `[i*512, 64, 0]`.
  - bbox memuat tanah, bangunan, dan **semua posisi kamera**.
- Aktor berdiri di udara di atas blok padat. Bunga, rumput, karpet, dan slab di titik kaki = menembus. Kamera tidak boleh di dalam blok. `compile_shots` mengecek keduanya dari file build.
- Bangun hanya sisi yang kelihatan kamera + 20% buffer (hemat waktu).
- Konsisten palette antar set satu kota (kota terasa satu dunia).

## G. Agent & kepemilikan file
- **Step 1–5 berurutan** (satu agent aktif). **Setelah GATE 5: Wave Produksi paralel**. Satu pesan berisi satu set-builder per set, visual-director, dan camera-director, semua background.
- **Satu pemilik per file.** Wilayah tiap agent ada di `ownership.json`. Tiap file agent punya bagian MILIKKU / BACA SAJA / DILARANG.
- Butuh perubahan di luar wilayah → tulis `REQUESTS/<agent>__<topik>.md` (file, alasan, perubahan). **Jangan edit.** Orchestrator memutuskan, lalu pemilik file yang mengerjakan.
- **Kunci teknis:**
  - Hook PreToolUse `Write|Edit` di frontmatter (`scripts/guard_paths.mjs`) menolak path di luar wilayah.
  - Hook Bash set-builder menolak `rcon.mjs` dan `shot.mjs --run`.
  - `scripts/check_ownership.mjs --verify` mengaudit setelah wave.
- **Selama wave tidak ada command ke server** (termasuk orchestrator). Server baru disentuh di Step 8.
- **BACA SAJA setelah GATE 5:** `SCRIPT.md`, `CAST.md`, `SHOTLIST.md`, `LAYOUT.json`, `shots/*/base.json`, `assets/skins/`. Mengubahnya berarti membuka lagi GATE 5.
- `shots/<shot>.json` adalah hasil `compile_shots.mjs`, jangan diedit tangan. Perbaiki lapisannya lalu compile ulang.
- Orchestrator tidak menulis lapisan agent. Kalau agent gagal, panggil ulang (model opus kalau sonnet gagal).
- **Kunci hanya aktif kalau agent terpasang benar.** Hook dengan path salah keluar dengan kode 1, dan Claude Code hanya memblokir pada kode 2. Jalankan `node SKILL/scripts/doctor.mjs` sebelum wave; harus 0 FAIL.

## H. Pipeline code-driven (berlaku untuk P1/P2)
- **Satu shot = empat lapisan** (`shots/<shot>/{base,world,visual,camera}.json`) → compile → `shots/<shot>.json`. Shot yang belum lolos compile belum siap produksi.
- **Posisi lewat anchor.** Aktor, kamera, dan argumen scarpet ditulis sebagai `{anchor|actor, off}` dari LAYOUT.json. Hanya `.mcfunction`, `delta`, dan `light` yang memakai koordinat absolut, dan semuanya di dalam bbox set.
- Tiap shot wajib punya tag: `[CODE]` (command + scarpet), `[BBS]` (aktor/model berpose), `[ANIM]` (Blender).
- **Determinisme**: gamerule dikunci, seed world di `MODLIST.txt`, tidak ada `rand()` di jalur kritis (pakai spiral sudut emas / offset tetap).
- `frames` dihitung compile dari `audio/TIMING.md` (+ `start_word` lewat `audio/words.json`). Key kamera memakai `t` 0..1, jadi tidak ada lapisan yang menyimpan frame.
- Animasi jalan di **20 tps** (`__on_tick`), render di **30 fps**. Jangan frame-step 1 tick per frame (gerak jadi 1.5× lambat).
- Satu shot satu take final. Take gagal tetap disimpan (`take02.mcpr`).
- Shader, time of day, dan weather tidak boleh berubah antar shot dalam satu scene.
- Command yang dijalankan harus tercatat di `captures/<shot>/commands.txt` (hasil `--dry`).
- Scarpet hanya dipanggil dengan `script in <app> run <fn>(<args>)`, string memakai kutip tunggal, dan semua argumen diisi. Take selalu lewat section `take` (unfreeze lebih dulu).
- Trigonometri scarpet (`sin`, `cos`, `atan2`) memakai **derajat**. Mob yang di-spawn app diberi tag `mcs_actor` supaya ikut dibersihkan saat prep.
- Mob aktor default `NoAI` (diam di tanda). Aktor yang harus memakai AI asli: `"ai": true` di visual.json.
- Balasan error dari server dihitung gagal oleh `shot.mjs`/`rcon.mjs`. Shot dengan command gagal belum siap direkam.

## I. Kamera
- Satu `fov` per shot (camera path ReplayMod tidak meng-keyframe FOV; compile memberi WARN kalau fov berubah). Zoom lewat posisi kamera.
- Frame 9:16 sempit: lebar = tinggi × 0.5625. Jarak kamera dihitung dari ukuran shot: `d = H / (2·tan(fov/2))` (tabel di agent camera-director). Jangan menebak.
- Subject di area aman Shorts: x 4–84 %, y 8–75 % (dicek compile di t 0 / 0.5 / 1). Eye level kecuali cerita butuh lain.
- Pakai kosakata baku di `PIPELINE.md` §7 (`push-in`, `pull-back`, `orbit`, `crane-up`, `top-down`, `whip-pan`, `parallax`, `handheld`) + shot size.
- Setiap gerak kamera harus punya alasan cerita. Kalau tidak, potong.
- Shot aerial/wide wajib punya foreground (silhouette, pohon, atap) supaya tidak terasa seperti map kosong.
