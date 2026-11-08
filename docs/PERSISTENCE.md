# Persistence & Recovery

Sandbox bisa hilang kapan saja. Dokumen ini menjelaskan apa yang disimpan di mana, dan bagaimana memulihkannya.

---

## 1. Pembagian tanggung jawab penyimpanan

| Jenis data | Tempat | Alasan |
|---|---|---|
| Source code, scripts, schemas | **Git** | kecil, perlu versi & review |
| Konfigurasi (`config/*.json`) | **Git** | deterministik, bukan rahasia |
| Voice registry + history | **Git** | identitas suara harus pulih sempurna |
| Scene / episode / world / character JSON | **Git** | sumber kebenaran produksi |
| Manifest aset + checksum | **Git** | menghubungkan ID ↔ file |
| Prompt & catatan produksi | **Git** | dokumentasi |
| Gambar karakter, background, props (PNG) | **Drive** | binary, ukuran sedang–besar |
| Audio referensi & sample suara | **Drive** | binary |
| Model checkpoint (`.pth`, `.onnx`, `.safetensors`) | **Drive**/di luar repo | sangat besar |
| Video hasil render (MP4) | **Drive** | besar, tidak perlu di git |
| Audio dialog hasil generate | **derived** — dibuang, dibuat ulang | reproducible |
| Kredensial (service account, token) | **GitHub Secrets / env** | **tidak pernah** di repo |

Aturan praktis: `manifests/assets.json` mencatat `storage: git|drive` per aset. Yang `drive` **wajib** punya `drive.fileId`; `assets:validate` memberi peringatan jika belum.

---

## 2. Google Drive

### Kenapa bukan konektor chat

Konektor Drive di sesi chat hanya bisa dipakai oleh agen, **tidak** oleh GitHub Actions atau script lokal. Menurut §11 brief, otomasi memerlukan kredensialnya sendiri.

### Setup (sekali saja)

1. Buat service account di Google Cloud, aktifkan **Google Drive API**.
2. Buat key JSON, unduh.
3. Buat folder Drive untuk aset studio, lalu **share folder itu ke email service account** (sebagai Editor).
4. Simpan kredensial:
   * lokal: `export GDRIVE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json`
   * GitHub Actions: repository secret `GDRIVE_SERVICE_ACCOUNT_JSON` (isi JSON-nya, bukan path)
5. Set `GDRIVE_FOLDER_ID` ke ID folder tersebut.

### Perintah

```bash
npm run assets:restore -- --check   # lihat apa yang hilang, tanpa mengunduh
npm run assets:restore              # unduh + verifikasi checksum
npm run assets:restore -- --force   # paksa unduh ulang
```

Restore memverifikasi SHA-256 setelah unduh; file yang checksum-nya tidak cocok **dihapus** dan dilaporkan, bukan diterima diam-diam.

### Status kejujuran

`scripts/lib/drive.mjs` mengimplementasikan auth service-account (JWT RS256), `list`, `download`, `upload` terhadap Drive REST v3 **tanpa dependency tambahan**. Kode ini **belum diuji terhadap akun Drive sungguhan** karena sandbox ini tidak memiliki kredensial. Jangan menganggapnya terverifikasi sebelum `assets:restore` benar-benar jalan dengan kredensial Anda.

---

## 3. Git

```bash
npm run assets:manifest   # sebelum commit, agar checksum sinkron
npm run validate
git add -A && git commit -m "..."
```

Aturan:

* Jangan pernah commit: `.env`, service account JSON, `*.pem`, token, `node_modules`, `.tools`, media hasil render, model.
* `.gitignore` sudah menutup semuanya; jangan dilemahkan tanpa alasan.
* Jika suatu saat butuh menyimpan binary di git, gunakan Git LFS — tetapi defaultnya: **Drive**.

---

## 4. Recovery lengkap setelah reset

```bash
git clone <repo> && cd AI-Kids-Studio
npm install
npm run bootstrap            # dependency + build eSpeak NG + direktori runtime
export GDRIVE_SERVICE_ACCOUNT_JSON=...   # dan GDRIVE_FOLDER_ID
npm run assets:restore
npm run validate             # schema, checksum, referensi, voice gate
npm run voice:engines        # engine mana yang benar-benar siap
```

Kriteria selesai: `validate` lulus tanpa error, dan `voice:engines` melaporkan setidaknya satu engine `available`.

Audio dialog **tidak** dipulihkan — sengaja. Itu derived artefak; dibuat ulang dengan:

```bash
npm run voice:generate -- --episode ep-001
```

---

## 5. Backup rutin yang disarankan

| Frekuensi | Aksi |
|---|---|
| setiap perubahan kode | commit + push (branch `arena/...`) |
| setiap aset baru | `assets:manifest` → commit manifest → upload file ke Drive |
| setiap approval suara | snapshot `audio/voices/history/registry.r<N>.json` + commit |
| setiap render selesai | upload MP4 ke Drive, catat fileId di manifest |
| mingguan | `doctor` → simpan `manifests/environment.json` untuk diff environment |
