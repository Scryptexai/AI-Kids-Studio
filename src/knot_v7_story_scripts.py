"""
Knot Theory V7 — Storytelling Scripts on top of the V6 high-density 3D scenes (`src/knot_v7_story_scripts.py`)

V7 story standard (user direction, 2026-11-27):
  1. Proper STORYTELLING, not documentary narration: a protagonist / second-person "kamu", real stakes,
     in-medias-res opening, rising tension, a twist/reveal, a climax, and a quiet resolution.
  2. The first 3 seconds must hook: shot 1 is a complete, alarming statement (<= 3.0 s spoken, <= 48 chars)
     — no "Tahukah kamu", no slow setup.
  3. Intensity keeps rising until the climax (danger -> failed alternatives -> reveal -> climax -> relief).
  4. NO "Oh, jadi ..." synthesis line (sounds tacky / unnatural). The ending is a natural closing line
     that sends the viewer back into the real world ("Lain kali lewat ..., cari ...").
  5. 20 shots is the MINIMUM for execution, not a target. Use more whenever the story needs it.
  6. >= 50 distinct named 3D objects per ~60 s video (inherited from the V6 scene builders).
  7. Accuracy boundary stays in the story, spoken naturally ("Tapi ..."), and is flagged `boundary=True`
     so the HUD still shows the amber "BATAS AKURASI" badge.

Each story shot re-uses a V6 scene builder (`scene` = V6 shot id) and an animation window `p` (0..1),
so one 3D scene can appear at several story moments (e.g. before / after the crack) without new geometry.
"""

from __future__ import annotations

import re

from src.knot_v6_scripts import V6_EPISODES

V7_EPISODE_ORDER = ["KT-R07", "KT-R08", "KT-S15", "KT-S16"]
MIN_SHOTS = 20          # minimum, not a target
MIN_OBJECTS = 50
HOOK_MAX_CHARS = 48     # ~3.0 s of voice-00 speech
MAX_CHARS = 1050        # keeps the tightened VO under the 58 s Shorts cap
BANNED_PHRASES = (
    "oh, jadi", "oh jadi", "tahukah kamu", "pernahkah kamu", "di video ini", "mari kita", "batas akurasi",
    "halo semua", "kali ini kita",
)

# (scene, p_range, badge, ptr_label, text, flags)
_S = dict

STORY: dict[str, dict] = {
    # =========================================================================================
    # KT-S15 — Rem blong di turunan gunung (protagonis: Pak Darto, sopir truk 30 ton)
    # =========================================================================================
    "KT-S15": {
        "hook_banner": "REM BLONG DI TURUNAN 7 KILOMETER!",
        "title": "Rem Truk 30 Ton Blong di Turunan Gunung — Kenapa Jalur Penyelamatnya Diisi Kerikil Bulat? #Shorts",
        "cta_question": "Penyelamat jalan raya mana yang lebih jenius? (KOLAM KERIKIL BULAT vs PAGAR BAJA LENTUR)",
        "shots": [
            _S(scene="s03", p=(0.0, 1.0), badge="PEDAL REM KOSONG!", ptr="PEDAL REM NGEMPOS!",
               text="Pak Darto injak rem. Kosong!"),
            _S(scene="s02", p=(0.0, 0.5), badge="TRUK 30 TON", ptr="TROMOL REM MEMBARA",
               text="Truk tiga puluh tonnya terus meluncur."),
            _S(scene="s02", p=(0.5, 1.0), badge="TROMOL 500°C", ptr="REM SUDAH MATI!",
               text="Tromolnya membara, lima ratus derajat."),
            _S(scene="s01", p=(0.0, 1.0), badge="TURUNAN 7 KM", ptr="JALUR MERAH-PUTIH",
               text="Turunan masih tujuh kilometer."),
            _S(scene="s04", p=(0.0, 1.0), badge="SATU-SATUNYA HARAPAN", ptr="BANTING SETIR KE KIRI!",
               text="Harapan terakhir: jalur merah-putih di kiri."),
            _S(scene="s19", p=(0.0, 1.0), badge="ISINYA KERIKIL?", ptr="KERIKIL SEDALAM 1 METER",
               text="Isinya cuma kerikil. Kenapa?"),
            _S(scene="s05", p=(0.0, 1.0), badge="KALAU ASPAL...", ptr="MELUNCUR MUNDUR!",
               text="Aspal? Truk meluncur mundur."),
            _S(scene="s06", p=(0.0, 1.0), badge="KALAU PASIR...", ptr="PASIR BASAH MENGERAS",
               text="Pasir? Kena hujan, mengeras, truk terguling."),
            _S(scene="s07", p=(0.0, 1.0), badge="KALAU BATU PECAH...", ptr="SUDUT TAJAM MENGUNCI",
               text="Batu pecah? Saling mengunci, keras."),
            _S(scene="s08", p=(0.0, 1.0), badge="KERIKIL SUNGAI BULAT", ptr="KERIKIL BULAT SEDALAM 1M",
               text="Kerikil sungai bulat, sedalam semeter."),
            _S(scene="s09", p=(0.0, 1.0), badge="TAK BISA MENGUNCI", ptr="MENGGELINDING BEBAS",
               text="Tak bisa mengunci, tiap butir menggelinding."),
            _S(scene="s10", p=(0.0, 1.0), badge="BRAK! AMBLES!", ptr="BAN AMBLES SAMPAI POROS!",
               text="Ban menghantam, langsung ambles sampai poros!"),
            _S(scene="s11", p=(0.0, 1.0), badge="TENAGA TERSEDOT", ptr="JUTAAN BUTIR TERGUSUR",
               text="Jutaan butir tergusur, menyedot tenaga truk."),
            _S(scene="s12", p=(0.0, 1.0), badge="TAK PERNAH MEMADAT", ptr="PIPA DRAINASE DASAR",
               text="Pipa di dasar membuang hujan, kerikil tak memadat."),
            _S(scene="s13", p=(0.0, 0.5), badge="BERHENTI TOTAL", ptr="TERKUNCI, TAK MUNDUR",
               text="Tak lama, truk berhenti total."),
            _S(scene="s13", p=(0.5, 1.0), badge="SELAMAT", ptr="PAK DARTO SELAMAT",
               text="Pak Darto turun. Gemetar, tapi selamat."),
            _S(scene="s14", p=(0.0, 1.0), badge="DEREK & JANGKAR", ptr="DITARIK JANGKAR BAJA",
               text="Derek berjangkar baja menariknya keluar."),
            _S(scene="s15", p=(0.0, 1.0), badge="SIAP LAGI", ptr="DIGARU GEMBUR LAGI",
               text="Petugas menggaruk kerikil, siap lagi."),
            _S(scene="s16", p=(0.0, 1.0), badge="TEBING SEMPIT", ptr="TAK ADA LAHAN",
               text="Tapi di tebing sempit,", boundary=True),
            _S(scene="s17", p=(0.0, 1.0), badge="JARING BAJA", ptr="JARING BAJA PENANGKAP",
               text="jalur ini diganti jaring baja.", boundary=True),
            _S(scene="s18", p=(0.0, 1.0), badge="BATU BIASA, NYAWA NYATA", ptr="KERIKIL BULAT MENYELAMATKAN",
               text="Lain kali turun gunung, cari jalur kerikil ini.", closing=True),
            _S(scene="s20", p=(0.0, 1.0), badge="KAMU PILIH MANA?", ptr="",
               text="Lebih jenius mana: kolam kerikil, atau pagar baja lentur?"),
            _S(scene="s21", p=(0.0, 1.0), badge="TULIS DI KOMENTAR", ptr="",
               text="Tulis jawabanmu di komentar."),
            _S(scene="s22", p=(0.0, 1.0), badge="TOMBOL PUTIH!", ptr="",
               text="Tekan tombol putih, besok ada rahasia lain."),
        ],
    },
    # =========================================================================================
    # KT-S16 — Lubang di jendela pesawat (protagonis: "kamu", penumpang di kursi jendela)
    # =========================================================================================
    "KT-S16": {
        "hook_banner": "ADA LUBANG DI JENDELA PESAWATMU",
        "title": "Ada Lubang Kecil di Jendela Pesawatmu — dan Itu yang Menjaga Nyawamu #Shorts",
        "cta_question": "Detail pesawat mana yang lebih jenius? (LUBANG KECIL JENDELA vs SUMBAT RODA PESAWAT)",
        "shots": [
            _S(scene="s02", p=(0.0, 0.5), badge="LIHAT BAWAH KACA", ptr="LUBANG SEUJUNG PENA",
               text="Ada lubang di jendela pesawatmu."),
            _S(scene="s08", p=(0.0, 0.5), badge="SEKECIL UJUNG PENA", ptr="LUBANG DI KACA",
               text="Sekecil ujung pena, di bagian bawah kaca."),
            _S(scene="s01", p=(0.0, 1.0), badge="35.000 KAKI", ptr="KAMU DI SINI",
               text="Dan kamu sedang di tiga puluh lima ribu kaki."),
            _S(scene="s03", p=(0.0, 1.0), badge="LUAR: -55°C", ptr="UDARA SANGAT TIPIS",
               text="Di luar, minus lima puluh lima derajat."),
            _S(scene="s04", p=(0.0, 1.0), badge="KABIN DIPOMPA", ptr="MENEKAN JENDELA",
               text="Di dalam, kabin dipompa, menekan jendela keluar."),
            _S(scene="s05", p=(0.0, 1.0), badge="KALAU CUMA 1 KACA", ptr="SATU RETAK = BAHAYA",
               text="Kalau jendelanya satu kaca, satu retak saja bisa fatal."),
            _S(scene="s06", p=(0.0, 1.0), badge="ADA TIGA KACA", ptr="3 LAPIS AKRILIK",
               text="Tapi jendela itu bukan satu kaca. Ada tiga."),
            _S(scene="s07", p=(0.0, 1.0), badge="YANG KAMU SENTUH", ptr="CUMA TAMENG GORES",
               text="Yang kamu sentuh hanyalah tameng gores."),
            _S(scene="s08", p=(0.5, 1.0), badge="SENGAJA DIBOR", ptr="BLEED HOLE DI KACA TENGAH",
               text="Lubang itu ada di kaca tengah. Sengaja dibor."),
            _S(scene="s09", p=(0.0, 1.0), badge="UDARA MENGALIR", ptr="MENGISI CELAH LUAR",
               text="Udara kabin mengalir lewat lubang ke celah kaca luar."),
            _S(scene="s10", p=(0.0, 1.0), badge="KACA LUAR BEKERJA", ptr="MEMIKUL 100% TEKANAN",
               text="Jadi kaca luar yang menanggung seluruh tekanan,"),
            _S(scene="s11", p=(0.0, 1.0), badge="KACA TENGAH SIAGA", ptr="TANPA BEBAN, TANPA LELAH",
               text="sementara kaca tengah santai, tanpa beban."),
            _S(scene="s12", p=(0.0, 0.5), badge="KACA LUAR RETAK!", ptr="RETAK!",
               text="Lalu suatu hari, kaca luar retak!"),
            _S(scene="s12", p=(0.5, 1.0), badge="CADANGAN AMBIL ALIH", ptr="KACA TENGAH MENAHAN KABIN",
               text="Kaca tengah langsung ambil alih. Kamu tak sadar apa-apa."),
            _S(scene="s13", p=(0.0, 1.0), badge="BONUS: ANTI EMBUN", ptr="EMBUN BEKU TERUSIR",
               text="Alirannya juga mengusir embun beku."),
            _S(scene="s14", p=(0.0, 1.0), badge="CEK DI HANGGAR", ptr="LUBANG TAK BOLEH TERSUMBAT",
               text="Di hanggar, mekanik memastikan lubangnya tak tersumbat."),
            _S(scene="s15", p=(0.0, 1.0), badge="KACA KOKPIT", ptr="TANPA LUBANG",
               text="Tapi jangan cari lubang ini di kaca kokpit.", boundary=True),
            _S(scene="s16", p=(0.0, 1.0), badge="KACA PILOT", ptr="BERLAPIS + PEMANAS LISTRIK",
               text="Kaca pilot berlapis dan dipanaskan listrik.", boundary=True),
            _S(scene="s17", p=(0.0, 1.0), badge="JENDELA REDUP ELEKTRIK", ptr="TETAP BERLAPIS",
               text="Jendela redup elektrik pun tetap berlapis.", boundary=True),
            _S(scene="s18", p=(0.0, 1.0), badge="LUBANG PENJAGA", ptr="CADANGAN NYAWAMU",
               text="Lain kali duduk di kursi jendela, cari lubang kecil itu.", closing=True),
            _S(scene="s20", p=(0.0, 1.0), badge="KAMU PILIH MANA?", ptr="",
               text="Lebih jenius mana: lubang jendela, atau sumbat roda pesawat?"),
            _S(scene="s21", p=(0.0, 1.0), badge="TULIS DI KOMENTAR", ptr="",
               text="Tulis jawabanmu di komentar."),
            _S(scene="s22", p=(0.0, 1.0), badge="TOMBOL PUTIH!", ptr="",
               text="Tekan tombol putih, besok ada rahasia lain."),
        ],
    },
    # =========================================================================================
    # KT-R07 — Jalan tol yang bergerak setiap hari ("kamu" sebagai pengendara)
    # =========================================================================================
    "KT-R07": {
        "hook_banner": "JALAN TOL INI BERGERAK SETIAP HARI",
        "title": "Jalan Tol yang Kamu Lewati Bergerak Setiap Hari — Ini yang Menahannya #Shorts",
        "cta_question": "Bagian jembatan mana yang lebih jenius? (BANTALAN KARET BAJA vs SAMBUNGAN JARI BAJA)",
        "shots": [
            _S(scene="s01", p=(0.0, 1.0), badge="TOL LAYANG", ptr="GELAGAR RIBUAN TON",
               text="Jalan tol yang kamu lewati ini bergerak."),
            _S(scene="s04", p=(0.0, 1.0), badge="SIANG 38°C", ptr="BETON MEMANJANG",
               text="Siang terik, beton ribuan ton memanjang."),
            _S(scene="s05", p=(0.0, 1.0), badge="MALAM 18°C", ptr="BETON MENYUSUT",
               text="Malam dingin, ia menyusut lagi."),
            _S(scene="s07", p=(0.0, 1.0), badge="TRUK LEWAT", ptr="UJUNG GELAGAR MELENGKUNG",
               text="Tiap truk lewat, ujung gelagarnya melengkung."),
            _S(scene="s06", p=(0.0, 0.5), badge="KALAU DIBAUT MATI", ptr="KEPALA PILAR TERTARIK",
               text="Kalau dibaut mati ke pilar,"),
            _S(scene="s06", p=(0.5, 1.0), badge="PILAR RETAK!", ptr="RETAK MENJALAR!",
               text="kepala pilarnya retak, terus menjalar."),
            _S(scene="s02", p=(0.0, 1.0), badge="CELAH RAHASIA", ptr="DI CELAH INI",
               text="Jadi insinyur menyelipkan sesuatu di celah ini."),
            _S(scene="s03", p=(0.0, 1.0), badge="BLOK HITAM", ptr="SETEBAL BANTAL",
               text="Sebuah blok hitam, setebal bantal."),
            _S(scene="s08", p=(0.0, 1.0), badge="KARET BIASA?", ptr="GEPENG & ROBEK!",
               text="Karet biasa? Ditindih ribuan ton, gepeng dan robek."),
            _S(scene="s09", p=(0.0, 1.0), badge="KITA BELAH", ptr="BELAHAN BANTALAN",
               text="Rahasianya ada di dalam."),
            _S(scene="s10", p=(0.0, 1.0), badge="BAJA + KARET", ptr="BERSELANG-SELING",
               text="Pelat baja tipis dan karet, berselang-seling."),
            _S(scene="s11", p=(0.0, 1.0), badge="DIMASAK MENYATU", ptr="MESIN VULKANISASI",
               text="Dimasak menyatu di mesin vulkanisasi."),
            _S(scene="s12", p=(0.0, 1.0), badge="KAKU KE BAWAH", ptr="BAJA MENAHAN KARET",
               text="Pelat baja menahan karet agar tak mekar,"),
            _S(scene="s13", p=(0.0, 1.0), badge="LENTUR KE SAMPING", ptr="BERGESER SAAT MEMUAI",
               text="tapi tetap bergeser saat beton memuai."),
            _S(scene="s14", p=(0.0, 1.0), badge="IKUT MIRING", ptr="LENGKUNGAN DIREDAM",
               text="Saat gelagar melengkung, bantal ini ikut miring."),
            _S(scene="s19", p=(0.0, 1.0), badge="PILAR SELAMAT", ptr="BEBAS BERGERAK, TANPA RETAK",
               text="Jembatan bebas bergerak, pilarnya tetap utuh."),
            _S(scene="s15", p=(0.0, 1.0), badge="DICEK RUTIN", ptr="INSPEKSI DARI KOLONG",
               text="Teknisi rutin memeriksanya dari kolong."),
            _S(scene="s16", p=(0.0, 1.0), badge="BENTANG RAKSASA", ptr="BUTUH LEBIH DARI KARET",
               text="Tapi bentang raksasa butuh lebih dari karet.", boundary=True),
            _S(scene="s17", p=(0.0, 1.0), badge="POT BEARING", ptr="POT BAJA + TEFLON",
               text="Mereka pakai bantalan pot baja berteflon.", boundary=True),
            _S(scene="s18", p=(0.0, 1.0), badge="CARI BLOK HITAMNYA", ptr="PENAHAN JALAN TOL",
               text="Lain kali lewat kolong tol, cari blok hitam ini.", closing=True),
            _S(scene="s20", p=(0.0, 1.0), badge="KAMU PILIH MANA?", ptr="",
               text="Lebih jenius mana: bantalan karet, atau sambungan jari baja?"),
            _S(scene="s21", p=(0.0, 1.0), badge="TULIS DI KOMENTAR", ptr="",
               text="Tulis jawabanmu di komentar."),
            _S(scene="s22", p=(0.0, 1.0), badge="TOMBOL PUTIH!", ptr="",
               text="Tekan tombol putih, besok ada rahasia lain."),
        ],
    },
    # =========================================================================================
    # KT-R08 — Pipa yang bisa jebol oleh airnya sendiri (gedung 500 meter)
    # =========================================================================================
    "KT-R08": {
        "hook_banner": "PIPA INI BISA JEBOL OLEH AIRNYA SENDIRI",
        "title": "Pipa Air Gedung 500 Meter Bisa Jebol oleh Airnya Sendiri — Ini Cara Mencegahnya #Shorts",
        "cta_question": "Rahasia gedung tinggi mana yang lebih jenius? (TANGKI PEMUTUS TEKANAN vs BOLA RAKSASA ANTI-ANGIN)",
        "shots": [
            _S(scene="s06", p=(0.0, 1.0), badge="PIPA JEBOL!", ptr="SAMBUNGAN PECAH!",
               text="Pipa ini bisa jebol oleh airnya sendiri."),
            _S(scene="s01", p=(0.0, 1.0), badge="GEDUNG 500 METER", ptr="MENARA 500 METER",
               text="Di gedung lima ratus meter."),
            _S(scene="s04", p=(0.0, 1.0), badge="SATU PIPA LURUS", ptr="DARI ATAP KE DASAR",
               text="Bayangkan satu pipa lurus, atap sampai dasar."),
            _S(scene="s05", p=(0.0, 1.0), badge="TIAP 10M = +1 BAR", ptr="DI DASAR: 50 BAR!",
               text="Tiap sepuluh meter, tekanan naik satu bar. Di dasar: lima puluh!"),
            _S(scene="s06", p=(0.5, 1.0), badge="KERAN MENYEMBUR", ptr="KERAN BAWAH JEBOL",
               text="Sambungan pecah, keran lantai bawah menyembur."),
            _S(scene="s07", p=(0.0, 1.0), badge="POMPA DARI BAWAH?", ptr="MOTOR TERBAKAR!",
               text="Pompa langsung dari bawah? Motornya terbakar."),
            _S(scene="s02", p=(0.0, 1.0), badge="LANTAI ANEH", ptr="LANTAI TANPA JENDELA",
               text="Karena itu, ada lantai aneh tanpa jendela."),
            _S(scene="s08", p=(0.0, 1.0), badge="LANTAI MESIN", ptr="TIAP 30 LANTAI",
               text="Tiap tiga puluh lantai, ada lantai mesin."),
            _S(scene="s09", p=(0.0, 1.0), badge="POMPA ESTAFET", ptr="KE TANGKI TERBUKA",
               text="Pompa mengisi tangki terbuka: break tank."),
            _S(scene="s10", p=(0.0, 1.0), badge="SENTUH UDARA BEBAS", ptr="PERMUKAAN AIR TERBUKA",
               text="Permukaannya menyentuh udara bebas."),
            _S(scene="s11", p=(0.0, 1.0), badge="30 BAR → 0 BAR!", ptr="TEKANAN DIPUTUS!",
               text="Tekanan tiga puluh bar langsung kembali ke nol!"),
            _S(scene="s12", p=(0.0, 1.0), badge="ESTAFET KE ATAS", ptr="POMPA ZONA BERIKUTNYA",
               text="Pompa berikutnya mengestafet ke atas."),
            _S(scene="s13", p=(0.0, 1.0), badge="KATUP PRV", ptr="PRESSURE REDUCING VALVE",
               text="Sebelum masuk unit, air lewat katup PRV."),
            _S(scene="s14", p=(0.0, 1.0), badge="PEGAS PENJAGA", ptr="TETAP 3 BAR",
               text="Pegasnya menjaga tekanan tetap tiga bar."),
            _S(scene="s03", p=(0.0, 1.0), badge="KERAN PUNCAK", ptr="MENGALIR LEMBUT",
               text="Keran di puncak mengalir lembut,"),
            _S(scene="s15", p=(0.0, 1.0), badge="SHOWER AMAN", ptr="SAMA NYAMAN",
               text="dan shower di bawah tak menyembur."),
            _S(scene="s16", p=(0.0, 1.0), badge="ISI LANTAI GELAP", ptr="MESIN AC & HIDRAN",
               text="Lantai itu juga menyimpan AC dan hidran."),
            _S(scene="s17", p=(0.0, 1.0), badge="GEDUNG RENDAH", ptr="DI BAWAH 8 LANTAI",
               text="Tapi gedung di bawah delapan lantai", boundary=True),
            _S(scene="s18", p=(0.0, 1.0), badge="CUKUP TOREN", ptr="TOREN ATAP CUKUP",
               text="cukup memakai toren di atap.", boundary=True),
            _S(scene="s19", p=(0.0, 1.0), badge="CARI LANTAI GELAPNYA", ptr="PEMUTUS TEKANAN AIR",
               text="Lain kali lihat gedung tinggi, cari lantai gelap itu.", closing=True),
            _S(scene="s20", p=(0.0, 1.0), badge="KAMU PILIH MANA?", ptr="",
               text="Lebih jenius mana: tangki pemutus, atau bola raksasa anti-angin?"),
            _S(scene="s21", p=(0.0, 1.0), badge="TULIS DI KOMENTAR", ptr="",
               text="Tulis jawabanmu di komentar."),
            _S(scene="s22", p=(0.0, 1.0), badge="TOMBOL PUTIH!", ptr="",
               text="Tekan tombol putih, besok ada rahasia lain."),
        ],
    },
}


def _build_episode(ep_id: str) -> dict:
    """Expand a story into the V6 episode schema (+ scene_idx / p_range / boundary / closing)."""
    v6 = V6_EPISODES[ep_id]
    by_sid = {s["id"]: (i, s) for i, s in enumerate(v6["shots"])}
    st = STORY[ep_id]
    shots = []
    for k, s in enumerate(st["shots"]):
        idx, base = by_sid[s["scene"]]
        shots.append({
            "id": f"t{k + 1:02d}",
            "scene": s["scene"],
            "scene_idx": idx,
            "p_range": list(s.get("p", (0.0, 1.0))),
            "recipe": base["recipe"],
            "Badge": s["badge"],
            "text": s["text"],
            "ptr": (base["ptr"][0], s["ptr"] or base["ptr"][1]),
            "objects": list(base["objects"]),
            "boundary": bool(s.get("boundary", False)),
            "closing": bool(s.get("closing", False)),
        })
    ep = {k: v for k, v in v6.items() if k != "shots"}
    ep.update({k: st[k] for k in ("hook_banner", "title", "cta_question")})
    ep["shots"] = shots
    ep["story_version"] = "v7_storytelling"
    return ep


V7_EPISODES: dict[str, dict] = {ep: _build_episode(ep) for ep in V7_EPISODE_ORDER}


def full_narration_text(ep_id: str) -> str:
    return " ".join(s["text"].strip() for s in V7_EPISODES[ep_id]["shots"])


def verify_story_scripts() -> dict[str, dict]:
    report = {}
    for ep_id in V7_EPISODE_ORDER:
        ep = V7_EPISODES[ep_id]
        shots = ep["shots"]
        txt = full_narration_text(ep_id)
        uniq = {o for s in shots for o in s["objects"]}
        low = txt.lower()
        banned = [b for b in BANNED_PHRASES if b in low]
        hook = shots[0]["text"]
        assert len(shots) >= MIN_SHOTS, f"{ep_id}: {len(shots)} shots < minimum {MIN_SHOTS}"
        assert len(uniq) >= MIN_OBJECTS, f"{ep_id}: {len(uniq)} unique objects < {MIN_OBJECTS}"
        assert len(txt) <= MAX_CHARS, f"{ep_id}: {len(txt)} chars > {MAX_CHARS}"
        assert not banned, f"{ep_id}: banned phrase(s) {banned}"
        assert len(hook) <= HOOK_MAX_CHARS and re.search(r"[.!?]$", hook), f"{ep_id}: hook must be one complete line <= {HOOK_MAX_CHARS} chars: {hook!r}"
        assert any(s["boundary"] for s in shots), f"{ep_id}: missing accuracy-boundary shots"
        assert sum(s["closing"] for s in shots) == 1, f"{ep_id}: needs exactly one closing line"
        report[ep_id] = {"shots": len(shots), "unique_objects": len(uniq), "chars": len(txt), "hook": hook}
    return report


if __name__ == "__main__":
    for k, v in verify_story_scripts().items():
        print(f"{k}: {v['shots']} shots | {v['unique_objects']} objects | {v['chars']} chars | hook: {v['hook']}")
