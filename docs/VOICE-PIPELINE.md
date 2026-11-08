# Voice Pipeline

Bagaimana suara karakter dipilih, disetujui, disimpan, dan dipakai ulang.

---

## 1. Model data

```
Character ID → Voice Alias → Engine → Model → Voice Profile → Generation Parameters
```

| Lapisan | Disimpan di | Sifat |
|---|---|---|
| Character | `library/characters/<id>.character.json` | visual + `voice.voiceAlias` |
| Voice Alias | `audio/voices/registry.json` | **permanen**, unik, tidak berubah saat ganti engine |
| Engine + Model | registry + `audio/engines/engines.json` | boleh berubah lewat migrasi tercatat |
| Profil & parameter | registry | immutable setelah `approved`; perubahan = `version + 1` |
| Hasil generate | `audio/generated/...` (derived) + `audio/manifests/dialogue-<ep>.json` | dapat dibuat ulang |

Alias internal contoh: `bobby_warm_01`, `pip_spark_01`, `coco_soft_01` — sengaja tidak memakai nama engine/speaker supaya migrasi tidak merusak identitas.

---

## 2. Status profil

```
draft → auditioning → approved → (migrated | retired)
                    ↘ rejected
```

Aturan yang **dipaksakan oleh kode**, bukan sekadar konvensi:

- `scripts/voice/generate.mjs` menolak semua baris dialog jika profil karakter belum `approved` (exit code 5).
- `scripts/voice/validate.mjs` gagal jika: alias duplikat, `approved` tanpa `speakerId`/`engine`/`sampleAudio`, checksum sample tidak cocok, atau satu karakter punya lebih dari satu profil `approved`.
- `scripts/episode/validate.mjs` menampilkan **voice gate** dan (dengan `--strict`) menolak episode yang punya karakter bersuara tanpa profil approved.
- Engine di luar `voicePolicy.productionEngines` ditolak untuk dialog produksi kecuali `--allow-unapproved` (khusus smoke test, dan hasilnya ditandai `smokeTest: true`).

---

## 3. Alur casting (yang akan diotomasi GUI di P3)

1. Pilih karakter (mis. `bobby`) dan alias (`bobby_warm_01`).
2. Pilih engine. Gunakan **teks audition yang sama** untuk semua kandidat agar perbandingan adil:
   > "Halo teman-teman! Senang sekali bertemu kalian hari ini. Ayo kita mulai petualangan baru!"
3. Generate ≥ 3 kandidat dengan parameter berbeda (pitch, rate, style).
4. Dengarkan, bandingkan (play/pause/compare).
5. Setujui satu kandidat → tulis `status: approved`, `sampleAudio`, `sampleChecksum`, `approvedAt`, `approvedBy`, dan entri `history`.
6. Simpan snapshot `audio/voices/history/registry.r<N>.json`.

Sampai GUI ada, langkah 1–6 dilakukan dengan mengedit registry + menjalankan `npm run voice:generate` sebagai alat audition (output WAV di `audio/generated/`).

Contoh uji pipeline hari ini (bukan suara produksi):

```bash
npm run voice:generate -- --episode ep-001 --engine espeak --allow-unapproved --speaker "id+m3" --reflow
```

---

## 4. Remote execution (jalur produksi yang direkomendasikan)

Sandbox studio ini **tidak punya GPU dan tidak bisa mengunduh bobot model**. Engine neural dijalankan di tempat bobot itu ada, studio memanggilnya lewat HTTP.

### Kontrak server (v1)

```
POST {TTS_HTTP_ENDPOINT}
Content-Type: application/json

{ "text": "Halo teman-teman!", "speakerId": "bobby_v1", "language": "id",
  "params": { "speed": 1.0, "pitch": 1.05, "style": "cheerful" }, "format": "wav" }
```

Respons sukses:

```
200 OK
Content-Type: audio/wav
X-Engine-Version: voxcpm-2.0.3
X-Model-Version: VoxCPM2-bf16
<bytes WAV PCM 16-bit mono>
```

Respons gagal: status non-2xx + `{ "error": "..." }`.

### Konfigurasi

```bash
export TTS_HTTP_ENDPOINT=https://gpu-box.internal/synthesize
export TTS_HTTP_TOKEN=...        # opsional, dikirim sebagai Bearer
npm run voice:engines            # memastikan engine terbaca 'available'
```

### Contoh server minimal (Python, di mesin yang punya VoxCPM 2)

```python
# pip install voxcpm flask   (jalankan di mesin dengan akses HuggingFace/ModelScope)
from flask import Flask, request, send_file, jsonify
from voxcpm import VoxCPM   # sesuaikan dengan API resmi versi yang dipakai
import io, tempfile, os

app = Flask(__name__)
model = VoxCPM.from_pretrained("openbmb/VoxCPM2")   # bobot diunduh di mesin ini

@app.post("/synthesize")
def synthesize():
    body = request.get_json(force=True)
    text, speaker, params = body["text"], body.get("speakerId"), body.get("params", {})
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out = f.name
    model.generate(text=text, speaker=speaker, out=out, **params)  # API sesuai dokumentasi resmi
    data = open(out, "rb").read(); os.unlink(out)
    resp = app.response_class(data, mimetype="audio/wav")
    resp.headers["X-Engine-Version"] = "voxcpm-2.0.3"
    resp.headers["X-Model-Version"] = "VoxCPM2"
    return resp
```

Ini **kerangka**, bukan kode yang sudah diverifikasi: nama fungsi `VoxCPM.from_pretrained/generate` harus dicocokkan dengan API resmi versi yang dipakai. Yang sudah pasti benar adalah kontrak HTTP di sisi studio.

---

## 5. Migrasi engine tanpa merusak identitas

1. Buat profil **baru** (`voiceAlias` sama, `version + 1`, `engine` baru) dengan status `auditioning`.
2. Hasilkan teks yang sama dengan engine lama dan baru.
3. Bandingkan durasi, RMS, dan penilaian manusia (A/B).
4. Jika disetujui: set profil baru `approved`, set profil lama `migrated`, catat di `history` dengan `note` + `revision`.
5. Regenerasi dialog episode baru dengan `npm run voice:generate`; episode lama tidak diubah tanpa persetujuan.

---

## 6. Validasi kualitas audio

Setiap output diperiksa (`config/studio.config.json → quality`):

| Pemeriksaan | Ambang default |
|---|---|
| durasi minimum | 0,25 s |
| durasi maksimum | 60 s |
| RMS minimum | 0,005 (mendeteksi audio terlalu pelan) |
| output senyap | peak < 0,01 → gagal |

Metadata tiap baris (teks, karakter, alias, engine+versi, model+versi, parameter, durasi, sample rate, waktu generate, RTF, checksum) ditulis ke `audio/manifests/dialogue-<episode>.json`.

---

## 7. Benchmark plan (saat bobot tersedia)

Ukuran kecil, dilakukan bertahap — **jangan** mengunduh semua model sekaligus:

| Tahap | Aksi | Batas |
|---|---|---|
| B1 | 1 kalimat pendek × 1 engine | < 5 menit |
| B2 | 7 kalimat variasi (dialog, tanya, gembira, sedih, terkejut, kalimat panjang, nama sulit) | < 30 menit |
| B3 | 3 profil berbeda untuk 1 karakter → uji perbedaan identitas | < 30 menit |
| B4 | 1 paragraf panjang → uji konsistensi antar segmen | < 30 menit |
| B5 | ulangi B2 di hari berbeda → uji determinisme | — |

Metrik wajib dicatat: berhasil/gagal, waktu generate, RTF, RAM puncak (`/usr/bin/time -v`), penilaian kejelasan & naturalness Bahasa Indonesia, konsistensi identitas, dan perbedaan antar karakter. Jangan menilai engine dari satu sampel.
