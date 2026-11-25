"""Generate Zernio upload manifests, provenance records, Drive manifest, and approved 4x/day queue."""
from __future__ import annotations

import json
import os
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DRIVE_IDS = {
    "KT-S01": "1C63SKT80Cr6qtjbTHY4rcNGv-MTDMVoF",
    "KT-S02": "13P6QOBBMZPr74L7myLMJIMXZEBu_k2jw",
    "KT-S03": "1loQE6aKjxdhBZodsYYcBsHy2h3dIv7ie",
    "KT-S04": "19zPDF22kxwqudQ7dS8_16GK0HgXkiJsX",
    "KT-S05": "18kGn8ikGzLChfVwH_kUESrmilnAQeEpA",
    "KT-S06": "1tzekP_kmsYCSqySS5jtWO0JEG-gh5kzr",
    "KT-L01": "1uWXXNVKB_Op_jkFt4zRsEUCzZRXdtZkh",
}


def wav_dur(path: str) -> float:
    with wave.open(path, "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def fmt_mmss(sec: float) -> str:
    sec_i = int(round(sec))
    return f"{sec_i // 60:02d}:{sec_i % 60:02d}"


def main() -> None:
    hashes = json.load(open("/tmp/render_work/all7_hashes.json", "r", encoding="utf-8"))

    ch_titles = [
        "Terowongan Tenggelam di Dasar Laut (Immersed Tube Tunnel)",
        "Mesin Bor Terowongan Bawah Laut (TBM Earth Pressure Balance)",
        "Gerbang Badai Raksasa yang Mengapung & Tenggelam (Maeslantkering)",
        "Katedral Banjir Bawah Tanah Tokyo (G-Cans Kasukabe)",
        "Menyalakan Pembangkit Saat Kota Gelap Total (Grid Black Start)",
        "Menara Pendingin Hiperboloid Raksasa Tanpa Kipas",
        "Benang Merah Rekayasa: Mengalah Terukur pada Fisika Alam",
    ]
    cur_t = 3.2
    chapter_lines = ["00:00 Cold Open — Saat Badai & Mati Lampu Menghantam Kota"]
    for idx, title in enumerate(ch_titles, start=1):
        chapter_lines.append(f"{fmt_mmss(cur_t)} Bab {idx}: {title}")
        d = wav_dur(f"/tmp/render_work/audio_raw/kt_l01_ch{idx}.wav")
        cur_t += 2.2 + d + 2.8

    s01_hook = "Pernah merasakan hembusan angin kencang di peron bawah tanah padahal lampu kereta belum kelihatan?"
    s02_hook = "Adegan film sering menampilkan satu ruangan basah kuyup hanya karena satu korek api dinyalakan."
    l01_hook = "Saat badai besar menghantam pesisir atau listrik satu provinsi padam total, ada mesin raksasa di bawah kota yang bekerja diam-diam agar jutaan orang tetap aman."
    s03_hook = "Kenapa halaman gardu induk tegangan tinggi hampir selalu ditutup hamparan batu pecah kasar, bukan rumput taman?"
    s04_hook = "Banyak orang mengira sabuk pengaman terbaik harus mengunci sekeras besi tanpa bergerak sedikit pun."
    s05_hook = "Kamar mandi yang bersih dan berbulan-bulan tidak dipakai justru tiba-tiba bau saluran pembuangan?"
    s06_hook = "Pada mobil generasi awal, batang kemudi dibuat dari satu poros besi kaku utuh dari roda depan ke arah pengemudi."

    episodes_meta = [
        {
            "id": "KT-S01",
            "slot": "PAGI_SHORT",
            "scheduledFor": "2026-11-26T08:00:00",
            "resolution": "1080x1920",
            "duration_seconds": round(wav_dur("/tmp/render_work/videos/kt_s01_mix.wav"), 2),
            "title": "Angin Kencang di Peron MRT Datang Sebelum Keretanya Terlihat #Shorts",
            "hook": s01_hook,
            "description": (
                f"{s01_hook}\n\n"
                "Kereta yang melaju di terowongan sempit bekerja persis seperti piston di dalam tabung suntik "
                "(Piston Effect). Kolom udara di depan moncong kereta terdorong jauh mendahului kereta. "
                "Tanpa cerobong pelepas tekanan (draught relief shaft) di dekat stasiun, angin itu bisa jauh lebih "
                "kuat mendorong penumpang di peron.\n\n"
                "Batas Akurasi: Pada stasiun dengan pintu sekat peron tertutup penuh (full-height PSD), efek hembusan "
                "di peron jauh lebih kecil dibanding peron terbuka.\n"
                "Referensi: Prinsip efek piston terowongan & standar ventilasi transit bawah tanah NFPA 130.\n\n"
                "#KnotTheory #InfrastrukturTersembunyi #TeknikSipil #MRT #SainsSehariHari #Shorts"
            ),
            "tags": ["Knot Theory", "efek piston kereta", "angin peron MRT", "infrastruktur tersembunyi", "teknik sipil", "NFPA 130", "edukasi sains", "shorts indonesia"],
            "first_comment": "Pernah ngerasain angin hangat ini waktu nunggu MRT di stasiun bawah tanah? Tulis stasiunnya di kolom komentar!",
        },
        {
            "id": "KT-S02",
            "slot": "SIANG_SHORT",
            "scheduledFor": "2026-11-26T12:30:00",
            "resolution": "1080x1920",
            "duration_seconds": round(wav_dur("/tmp/render_work/videos/kt_s02_mix.wav"), 2),
            "title": "Di Film Semua Sprinkler Menyala Sekaligus. Aslinya Cuma 1 Kepala! #Shorts",
            "hook": s02_hook,
            "description": (
                f"{s02_hook} "
                "Padahal pada gedung kantor dan hotel biasa, sprinkler standar bekerja sendiri-sendiri!\n\n"
                "Setiap kepala sprinkler ditahan oleh tabung kaca kecil berisi cairan peka panas. Saat api memanaskan "
                "satu titik, hanya cairan di ampul kaca tepat di atas api yang memuai, memecahkan segel kaca, dan "
                "menyiram titik api tersebut—sementara kepala lain tetap tertutup agar tekanan pipa fokus.\n\n"
                "Batas Akurasi: Sistem serentak (deluge system) memang ada, tetapi khusus untuk hanggar pesawat, "
                "kilang kimia, atau gudang bahan mudah meledak.\n"
                "Referensi: Standar sistem sprinkler otomatis NFPA 13.\n\n"
                "#KnotTheory #SafetyEngineering #PemadamKebakaran #FaktaFilm #TeknikMesin #Shorts"
            ),
            "tags": ["Knot Theory", "cara kerja sprinkler", "fakta vs film", "safety engineering", "NFPA 13", "pemadam kebakaran gedung", "shorts indonesia"],
            "first_comment": "Film apa yang paling sering kamu lihat adegan semua sprinkler nyala barengan gara-gara pemantik kecil?",
        },
        {
            "id": "KT-L01",
            "slot": "SORE_LONG",
            "scheduledFor": "2026-11-26T16:30:00",
            "resolution": "1920x1080",
            "duration_seconds": 662.75,
            "title": "5 Mesin Raksasa di Bawah Kota yang Bekerja Diam-Diam Saat Badai dan Mati Lampu",
            "hook": l01_hook,
            "description": (
                f"{l01_hook}\n\n"
                "Di episode dokumenter panjang Knot Theory ini, kita membedah penampang 3D cara kerja 5 sistem "
                "rekayasa skala besar yang jarang terlihat mata:\n\n"
                + "\n".join(chapter_lines)
                + "\n\n"
                "Batas Akurasi & Referensi Teknis:\n"
                "• Terowongan tabung tenggelam memakai segel karet Gina & Omega memanfaatkan tekanan hidrostatik laut (PIANC / FHWA).\n"
                "• Mesin bor TBM bawah laut memakai ruang tekan lumpur/tanah (EPB & Slurry Shield) agar dasar laut tidak runtuh.\n"
                "• Gerbang badai Maeslantkering Rotterdam mengapung saat bergeser dan tenggelam dengan air pemberat saat mengunci.\n"
                "• Katedral bawah tanah G-Cans Kasukabe menahan lonjakan momentum air banjir sebelum dipompa ke Sungai Edo.\n"
                "• Prosedur Black Start memulihkan jaringan transmisi bertahap mulai dari pembangkit mandiri tanpa listrik luar.\n\n"
                "#KnotTheory #DokumenterSains #RekayasaSipil #InfrastrukturRaksasa #CaraKerjaMesin #EdukasiTeknik"
            ),
            "tags": [
                "Knot Theory", "dokumenter teknik", "infrastruktur bawah tanah", "terowongan bawah laut",
                "mesin bor TBM", "Maeslantkering Rotterdam", "G-Cans Tokyo", "black start listrik PLN",
                "menara pendingin hiperboloid", "cara kerja megastruktur"
            ],
            "first_comment": "Dari 5 sistem raksasa di video ini—Terowongan Tenggelam, TBM Bawah Laut, Gerbang Badai Mengapung, Katedral Banjir Tokyo, atau Black Start Listrik—mana yang menurutmu paling jenius?",
        },
        {
            "id": "KT-S03",
            "slot": "MALAM_SHORT",
            "scheduledFor": "2026-11-26T20:30:00",
            "resolution": "1080x1920",
            "duration_seconds": round(wav_dur("/tmp/render_work/videos/kt_s03_mix.wav"), 2),
            "title": "Hamparan Batu Kerikil di Gardu Listrik Ini Bukan Hiasan Taman #Shorts",
            "hook": s03_hook,
            "description": (
                f"{s03_hook}\n\n"
                "Saat gangguan arus besar bocor ke tanah, permukaan tanah membentuk gradien tegangan berjarak "
                "(step & touch potential). Lapisan kerikil batu pecah yang kering memiliki tahanan listrik permukaan "
                "sangat tinggi sebagai isolator tambahan di bawah sepatu teknisi, sekaligus mencegah genangan air "
                "dan rumput liar.\n\n"
                "Batas Akurasi: Kerikil bekerja sebagai pengaman tambahan bersama kisi tembaga pembumian (grounding grid) "
                "yang ditanam di bawah tanah.\n"
                "Referensi: Standar keselamatan pembumian gardu induk IEEE Std 80.\n\n"
                "#KnotTheory #TeknikElektro #GarduInduk #SafetyEngineering #Infrastruktur #Shorts"
            ),
            "tags": ["Knot Theory", "kerikil gardu listrik", "tegangan langkah", "IEEE Std 80", "teknik elektro", "gardu induk PLN", "shorts indonesia"],
            "first_comment": "Baru tahu fungsi asli kerikil di gardu listrik atau sudah pernah dengar istilah Tegangan Langkah sebelumnya?",
        },
        {
            "id": "KT-S04",
            "slot": "PAGI_SHORT",
            "scheduledFor": "2026-11-27T08:00:00",
            "resolution": "1080x1920",
            "duration_seconds": round(wav_dur("/tmp/render_work/videos/kt_s04_mix.wav"), 2),
            "title": "Sabuk Pengaman Mobil Sengaja Mengalah Sedikit Saat Tabrakan #Shorts",
            "hook": s04_hook,
            "description": (
                f"{s04_hook} "
                "Padahal sabuk modern bekerja dalam dua tahap pintar!\n\n"
                "1. Pretensioner menarik kencang sabuk dalam hitungan milidetik pertama benturan.\n"
                "2. Load Limiter (batang puntir torsion bar di dalam gulungan) sengaja memuntir terukur dan mengulur "
                "sedikit pita sabuk sebelum beban puncak mematahkan tulang dada—sambil mengarahkan tubuh ke bantalan airbag.\n\n"
                "Batas Akurasi: Uluran terukur ini hanya beberapa sentimeter dan dihitung bersama ruang kerja airbag depan.\n"
                "Referensi: Regulasi sabuk keselamatan UN ECE R16 & uji keselamatan Euro NCAP.\n\n"
                "#KnotTheory #KeselamatanMobil #TeknikOtomotif #SafetyEngineering #CaraKerja #Shorts"
            ),
            "tags": ["Knot Theory", "cara kerja sabuk pengaman", "pretensioner load limiter", "keselamatan mobil", "teknik otomotif", "shorts indonesia"],
            "first_comment": "Setuju nggak kalau prinsip 'mengalah sedikit secara terukur supaya tidak patah' itu salah satu ide paling brilian di dunia teknik?",
        },
        {
            "id": "KT-S05",
            "slot": "SIANG_SHORT",
            "scheduledFor": "2026-11-27T12:30:00",
            "resolution": "1080x1920",
            "duration_seconds": round(wav_dur("/tmp/render_work/videos/kt_s05_mix.wav"), 2),
            "title": "Toilet Kamar Tamu Bau Setelah Lama Kosong? Bukan Pipanya yang Rusak #Shorts",
            "hook": s05_hook,
            "description": (
                f"{s05_hook} "
                "Sering kali bukan karena pipa pecah!\n\n"
                "Lekukan pipa berbentuk huruf U (P-Trap) di bawah wastafel, floor drain, dan kloset sengaja menyimpan "
                "genangan air kecil sebagai pintu kedap gas selokan. Jika terlalu lama tidak disiram, air itu menguap "
                "habis sehingga gas saluran bebas naik. Sementara pipa ventilasi ke atap menjaga tekanan udara pipa "
                "agar segel air tidak tersedot habis saat menyiram.\n\n"
                "Batas Akurasi: Jika bau tetap muncul meski rutin dipakai dan disiram air, barulah periksa kebocoran sambungan atau vent tersumbat.\n"
                "Referensi: Uniform Plumbing Code (UPC) & SNI Sistem Plambing.\n\n"
                "#KnotTheory #RumahTangga #Plambing #TeknikSipil #InfrastrukturTersembunyi #Shorts"
            ),
            "tags": ["Knot Theory", "kamar mandi bau got", "cara kerja P-trap", "pipa ventilasi kloset", "sistem plambing rumah", "shorts indonesia"],
            "first_comment": "Solusi paling gampang buat kamar mandi tamu yang jarang dipakai: cukup tuang segelas air ke floor drain & wastafel seminggu sekali!",
        },
        {
            "id": "KT-S06",
            "slot": "MALAM_SHORT",
            "scheduledFor": "2026-11-27T20:30:00",
            "resolution": "1080x1920",
            "duration_seconds": round(wav_dur("/tmp/render_work/videos/kt_s06_mix.wav"), 2),
            "title": "Batang Setir Mobil Sengaja Dirancang Supaya Bisa Memendek #Shorts",
            "hook": s06_hook,
            "description": (
                f"{s06_hook}\n\n"
                "Mobil modern memakai Collapsible Steering Column: poros teleskopik berlapis dengan selubung kisi baja "
                "dan pin geser yang kuat saat memutar setir sehari-hari, tetapi sengaja menyelip memendek menyerap energi "
                "saat dihantam dorongan aksial tabrakan depan.\n\n"
                "Batas Akurasi: Mekanisme ini bekerja sebagai satu kesatuan sistem bersama zona remuk depan (crumple zone), "
                "sabuk pengaman, dan airbag.\n"
                "Referensi: Standar keselamatan kolom kemudi FMVSS 204 & UN Regulation No. 12.\n\n"
                "#KnotTheory #TeknikOtomotif #SafetyEngineering #MobilModern #SainsPopuler #Shorts"
            ),
            "tags": ["Knot Theory", "collapsible steering column", "kolom setir mobil", "keselamatan tabrakan", "FMVSS 204", "teknik otomotif", "shorts indonesia"],
            "first_comment": "Bagian mobil mana lagi yang menurutmu sengaja dirancang 'remuk atau memendek' demi menyelamatkan penumpangnya?",
        },
    ]

    os.makedirs(os.path.join(ROOT, "upload", "provenance"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "upload", "queue"), exist_ok=True)

    drive_manifest = {
        "project": "Knot Theory Editorial Sprint V3",
        "timezone": "Asia/Makassar",
        "drive_folder_id": "1nBzSmuWbD_vbognbMZ4B9NQStpiuLcYn",
        "daily_schedule_pattern": {
            "slot_1_pagi": "08:00:00 (Short 9:16)",
            "slot_2_siang": "12:30:00 (Short 9:16)",
            "slot_3_sore": "16:30:00 (Long 10-20m 16:9, outside PDF)",
            "slot_4_malam": "20:30:00 (Short 9:16)",
        },
        "episodes": {},
    }

    for meta in episodes_meta:
        ep_id = meta["id"]
        h_info = hashes[ep_id]
        vid_fn = h_info["video"]
        thumb_fn = f"{ep_id}_thumbnail.jpg"
        sz = h_info["size_bytes"]
        sha = h_info["sha256"]
        drive_id = DRIVE_IDS[ep_id]
        entry_py = "src/knot_long_ep01.py" if ep_id == "KT-L01" else "src/knot_shorts_engine.py"

        drive_manifest["episodes"][ep_id] = {
            "video": vid_fn,
            "thumbnail": thumb_fn,
            "drive_file_id": drive_id,
            "size_bytes": sz,
            "sha256": sha,
            "duration_seconds": meta["duration_seconds"],
            "resolution": meta["resolution"],
            "slot": meta["slot"],
            "scheduledFor": meta["scheduledFor"],
            "timezone": "Asia/Makassar",
        }

        prov_rel = f"upload/provenance/{ep_id}.json"
        prov_obj = {
            "episode": ep_id,
            "engine": "ai-kids-studio-3d-cpp",
            "entrypoint": entry_py,
            "video_filename": vid_fn,
            "master_sha256": sha,
            "size_bytes": sz,
            "duration_seconds": meta["duration_seconds"],
            "resolution": meta["resolution"],
            "fps": 24,
            "voice_id": "voice-00",
            "drive_file_id": drive_id,
        }
        with open(os.path.join(ROOT, prov_rel), "w", encoding="utf-8") as f:
            json.dump(prov_obj, f, indent=2, ensure_ascii=False)

        manifest_obj = {
            "episode": ep_id,
            "slot_label": meta["slot"],
            "video": vid_fn,
            "thumbnail": thumb_fn,
            "drive_file_id": drive_id,
            "size_bytes": sz,
            "sha256": sha,
            "title": meta["title"],
            "hook": meta["hook"],
            "description": meta["description"],
            "tags": meta["tags"],
            "categoryId": "28",
            "visibility": "public",
            "madeForKids": False,
            "containsSyntheticMedia": False,
            "defaultLanguage": "id",
            "defaultAudioLanguage": "id",
            "first_comment": meta["first_comment"],
            "scheduledFor": meta["scheduledFor"],
            "timezone": "Asia/Makassar",
            "render_provenance": {
                "engine": "ai-kids-studio-3d-cpp",
                "entrypoint": entry_py,
                "manifest": prov_rel,
            },
        }
        with open(os.path.join(ROOT, "upload", f"{ep_id}.json"), "w", encoding="utf-8") as f:
            json.dump(manifest_obj, f, indent=2, ensure_ascii=False)

        queue_obj = {
            "episode": ep_id,
            "status": "requested",
            "approved": True,
            "slot": meta["slot"],
            "scheduledFor": meta["scheduledFor"],
            "timezone": "Asia/Makassar",
            "visibility": "public",
        }
        with open(os.path.join(ROOT, "upload", "queue", f"{ep_id}.json"), "w", encoding="utf-8") as f:
            json.dump(queue_obj, f, indent=2, ensure_ascii=False)

    with open(os.path.join(ROOT, "upload", "drive_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(drive_manifest, f, indent=2, ensure_ascii=False)

    pub_path = os.path.join(ROOT, "upload", "published.json")
    if not os.path.isfile(pub_path):
        with open(pub_path, "w", encoding="utf-8") as f:
            json.dump({}, f, indent=2)

    print(f"Successfully generated manifests, provenance, and 4x/day queue for {len(episodes_meta)} videos!")


if __name__ == "__main__":
    main()
