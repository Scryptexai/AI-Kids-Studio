"""
Knot Theory Long-Form Documentary Engine (10–20 Minute Slot — 16:9 Full HD 1920x1080)
Episode KT-L01: "5 Mesin Raksasa di Bawah Kota yang Bekerja Diam-Diam Saat Badai dan Mati Lampu"
(Outside the 28-idea Shorts PDF, designed specifically for the daily Sore 10–20 minute Long Video slot.)
"""

import math
import os
import subprocess
import wave
from typing import Dict, List, Sequence, Tuple

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import signal

from src.assets_ep02 import make_ring_collar
from src.audio_pipeline import SAMPLE_RATE, _add_clip, _env_adsr, _sfx_chime, _sfx_whoosh, _syllable_weight
from src.overlays import SubtitleChunk, WordTiming, _load_font


def _font(family: str, weight: int, size: int) -> ImageFont.FreeTypeFont:
    mapping = {
        ("Montserrat", 900): "Montserrat_900Black.ttf",
        ("Montserrat", 800): "Montserrat_800ExtraBold.ttf",
        ("Montserrat", 700): "Montserrat_700Bold.ttf",
        ("PlusJakartaSans", 800): "PlusJakartaSans_800ExtraBold.ttf",
        ("PlusJakartaSans", 700): "PlusJakartaSans_700Bold.ttf",
        ("PlusJakartaSans", 600): "PlusJakartaSans_600SemiBold.ttf",
    }
    return _load_font(mapping.get((family, weight), "PlusJakartaSans_700Bold.ttf"), size)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t
from src.renderer3d import (
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    Mesh,
    SceneRenderer,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)

CHAPTERS_L01 = [
    {
        "num": 1,
        "badge": "BAB 01 • TEROWONGAN TABUNG TENGGELAM",
        "title": "Jalan Raya Kering di Dasar Samudra (Immersed Tube)",
        "verify": "Verifikasi: PIANC / ITA Subsea Tunnel Guidelines • Fehmarnbelt & Marmaray",
        "oh_jadi": "Tekanan air laut luar justru dipakai mengunci segel karet antar-tabung beton.",
        "text": (
            "Pernah terpikir bagaimana insinyur membangun terowongan jalan raya dan kereta tepat di bawah dasar laut tanpa air lautnya tumpah masuk menenggelamkan pekerja? "
            "Banyak orang membayangkan penyelam memasang kubah raksasa di dalam air, atau mengira lautnya harus dibendung dan dikeringkan dulu. "
            "Padahal di bawah kota pesisir dan selat sibuk dunia, ada lima mesin dan struktur raksasa tak terlihat yang bekerja memakai hukum fisika yang tampak terbalik dari dugaan kita. "
            "Mari kita mulai dari dasar laut. "
            "Di Selat Bosporus Turki maupun proyek Fehmarnbelt yang menghubungkan Denmark dan Jerman, terowongan beton tidak selalu digali di dalam batu dasar laut. "
            "Potongan terowongan sepanjang hampir dua lapangan sepak bola justru dicetak kering di galangan darat terlebih dahulu. "
            "Kedua ujung tabung beton puluhan ribu ton itu ditutup sekat kedap air sehingga tabung raksasa tersebut bisa mengapung di permukaan laut seperti kapal selam berongga. "
            "Kapal tunda kemudian menariknya ke posisi tepat di tengah selat, lalu tangki pemberat di dalamnya diisi air secara perlahan sampai tabung beton tenggelam duduk presisi di parit dasar laut yang sudah dikeruk. "
            "Begitu ujungnya menempel pada segmen sebelumnya, tekanan air laut dari luar justru membantu menekan segel karet raksasa hingga terkunci kedap sempurna. "
            "Air yang terjebak di ruang sambungan tinggal dipompa keluar, sekat dibuka, dan jadilah jalan raya kering di dasar samudra."
        ),
    },
    {
        "num": 2,
        "badge": "BAB 02 • MESIN BOR PENYEIMBANG TEKANAN",
        "title": "Tunnel Boring Machine (Earth Pressure Balance)",
        "verify": "Verifikasi: ITA Working Group Mechanized Tunnelling • Standar Geoteknik Bawah Air",
        "oh_jadi": "Ruang bor depan sengaja dipenuhi bubur tanah bertekanan agar air laut tak bisa masuk.",
        "text": (
            "Lalu bagaimana jika terowongan harus menembus lapisan tanah lunak dan batuan basah jauh di bawah dasar laut atau sungai besar kota, tempat parit terbuka tidak mungkin dikeruk dari atas? "
            "Di sinilah pabrik berjalan bawah tanah bernama Tunnel Boring Machine tipe penyeimbang tekanan tanah bekerja. "
            "Berbeda dari bor biasa yang membiarkan ruang di depannya kosong, ruang kepala pemotong paling depan pada mesin ini sengaja dibiarkan penuh berisi adonan tanah galian dan busa pengondisi yang bertekanan tinggi. "
            "Sensor terus menjaga agar tekanan bubur tanah di ruang depan seimbang dengan tekanan air laut dan tanah di depannya. "
            "Karena tekanannya sama kuat, air tanah tidak punya celah untuk menerobos masuk ke ruang kerja di belakang perisai baja. "
            "Tanah galian dikeluarkan sedikit demi sedikit lewat ulir bertekanan seperti pasta gigi, sementara lengan robot di belakangnya menyusun cincin dinding beton kedap air satu per satu. "
            "Tentu pemilihan antara tabung tenggelam dan mesin bor sangat bergantung pada kedalaman laut serta struktur geologi tiap selat, sehingga tidak ada satu metode tunggal untuk semua lokasi. "
            "Oh, jadi terowongan bawah laut tetap kering bukan karena melawan samudra dengan ruang hampa, melainkan karena menyamakan tekanan di ujung galian sejak detik pertama. "
            "Namun menjaga bawah laut tetap kering belum cukup bila permukaan lautnya sendiri bangkit menerjang kota saat badai."
        ),
    },
    {
        "num": 3,
        "badge": "BAB 03 • GERBANG BADAI MENGAPUNG",
        "title": "Maeslantkering: Mengapung Ringan Lalu Menenggelamkan Diri",
        "verify": "Verifikasi: Rijkswaterstaat Delta Works Belanda • Protokol Pasang Badai Laut Utara",
        "oh_jadi": "Lengan baja seukuran Menara Eiffel mengapung saat bergeser, lalu diisi air agar kokoh.",
        "text": (
            "Lihat gerbang baja putih bernama Maeslantkering di pintu pelabuhan Rotterdam, Belanda ini. "
            "Panjang tiap lengannya hampir setara tinggi Menara Eiffel. "
            "Di hari cerah biasa, kedua lengan melengkung ini parkir di dermaga kering tepi sungai agar kapal kontainer raksasa bebas keluar masuk pelabuhan. "
            "Namun saat sistem cuaca otomatis mendeteksi gelombang pasang badai Laut Utara akan menembus batas aman kota, gerbang ini melakukan manuver yang tampak melawan intuisi. "
            "Dermaga parkirnya digenangi air, dan ternyata lengan baja raksasa itu berongga sehingga langsung mengapung ringan seperti ponton. "
            "Mesin penggerak yang relatif kecil pun sanggup mengayunkan keduanya menutup sungai. "
            "Tetapi struktur yang mengapung tentu akan terguncang hebat bila dihantam ombak badai. "
            "Karena itu, tepat saat kedua ujungnya bertemu di tengah sungai, katup air dibuka agar rongga bajanya terisi puluhan ribu ton air hingga tenggelam duduk kokoh di bantalan beton dasar sungai. "
            "Seluruh dorongan laut disalurkan ke dua sendi bola baja raksasa di darat yang bekerja seperti engsel tulang bahu. "
            "Sistem sekompleks ini hanya ekonomis di muara pelabuhan vital dan wajib diuji fungsi rutin tiap tahun. "
            "Oh, jadi gerbang badai raksasa sengaja dibuat mengapung dulu agar ringan digeser, lalu menenggelamkan dirinya sendiri agar sekuat bendungan."
        ),
    },
    {
        "num": 4,
        "badge": "BAB 04 • KATEDRAL BANJIR BAWAH TANAH",
        "title": "G-Cans Tokyo: Hutan 59 Pilar Peredam Tenaga Banjir",
        "verify": "Verifikasi: MLIT Edogawa River Office Jepang • Kasukabe Underground Discharge Channel",
        "oh_jadi": "Katedral berpilar 500 ton menjinakkan kecepatan banjir sebelum dipompa ke sungai besar.",
        "text": (
            "Setelah menahan badai dari arah laut, kota modern masih menghadapi ancaman kedua dari atas langit: hujan ekstrem yang meluapkan sungai-sungai kecil di kawasan permukiman padat yang tanahnya cekung seperti sisi timur raya Tokyo. "
            "Ketika saluran kota penuh sementara sungai besar di hilir juga tinggi permukaannya, air hujan tidak bisa mengalir sendiri dengan gravitasi. "
            "Tepat lima puluh meter di bawah lapangan olahraga dan jalanan Kasukabe, para insinyur membangun saluran pembuangan luar bawah tanah yang dijuluki katedral banjir bawah tanah. "
            "Saat sungai-sungai kecil mencapai batas meluap, air dialihkan terjun masuk ke lima sumur silinder beton raksasa yang masing-masing cukup dalam untuk menelan gedung dua puluh lantai. "
            "Air deras itu merambat lewat terowongan bawah tanah sepanjang lebih dari enam kilometer menuju satu ruang peredam tekanan raksasa yang ditopang lima puluh sembilan pilar beton seberat lima ratus ton per tiang. "
            "Ruang katedral berpilar ini berfungsi menjinakkan pusaran dan meredam lonjakan tekanan air sebelum empat turbin pompa raksasa membuangnya secara terkendali ke Sungai Edo yang jauh lebih lebar. "
            "Fasilitas raksasa ini tetap memiliki batas kapasitas desain terhadap curah hujan ekstrem dan bukan pengganti tata ruang resapan air di permukaan. "
            "Oh, jadi katedral beton di bawah kota Tokyo itu bukan sekadar kolam penampung, melainkan peredam tenaga banjir agar air ganas bisa dipompa keluar dengan aman."
        ),
    },
    {
        "num": 5,
        "badge": "BAB 05 • PEMULIHAN JARINGAN BLACK START",
        "title": "Dari Mana Listrik Pertama Datang Saat Satu Pulau Padam Total?",
        "verify": "Verifikasi: IEEE Power & Energy Society • Kode Jaringan & Prosedur Pemulihan Blackout",
        "oh_jadi": "Pembangkit uap besar butuh listrik luar dulu, sehingga harus dipancing berantai dari PLTA.",
        "text": (
            "Air banjir sudah dikendalikan, tetapi bagaimana bila badai memicu krisis keempat, yakni padam listrik total atau blackout yang mematikan seluruh pembangkit di satu pulau secara serentak? "
            "Banyak yang mengira petugas tinggal menekan tombol nyala di pembangkit besar dan lampu kota langsung hidup kembali. "
            "Kenyataannya jauh lebih rumit. "
            "Pembangkit listrik tenaga uap maupun gas ratusan megawatt justru butuh pasokan listrik besar dari jaringan luar lebih dulu untuk memutar pompa air ketel, pompa pendingin, kipas udara pembakaran, serta kendali katupnya. "
            "Saat jaringan luar padam nol volt, pembangkit raksasa terkunci tak bisa menyalakan dirinya sendiri. "
            "Untuk memecah kebuntuan ini, jaringan listrik menyiapkan unit khusus berkemampuan Black Start, umumnya pembangkit tenaga air di bendungan atau turbin gas kecil berstarter mandiri. "
            "Di pembangkit air, operator cukup membuka katup pipa pesat dengan tenaga baterai atau hidrolik, membiarkan gravitasi air waduk memutar turbin tanpa listrik luar. "
            "Listrik perdana ini dikirim lewat jalur khusus untuk menghidupkan mesin bantu pembangkit besar terdekat, lalu beban kota disambung bertahap sambil menjaga frekuensi lima puluh hertz. "
            "Skema pemulihan tiap wilayah berbeda mengikuti komposisi pembangkitnya. "
            "Oh, jadi saat mati lampu total se-pulau, pembangkit raksasa harus dipancing hidup berantai dari pembangkit kecil yang mandiri."
        ),
    },
    {
        "num": 6,
        "badge": "BAB 06 • MENARA PENDINGIN TANPA KIPAS",
        "title": "Menara Hiperboloid: Mesin Penarik Angin Murni Gaya Apung",
        "verify": "Verifikasi: Termodinamika Siklus Rankine & Rekayasa Cangkang Beton Hiperboloid",
        "oh_jadi": "Kepulan putih itu uap air murni, tersedot ke atas tanpa kipas oleh udara hangat yang ringan.",
        "text": (
            "Begitu pembangkit termal raksasa kembali bekerja, kita sering melihat menara beton raksasa melengkung cekung yang mengepulkan awan putih tebal ke langit. "
            "Dua salah paham sering muncul di sini: banyak yang mengira itu cerobong asap polusi batu bara, dan mengira ada kipas listrik raksasa di dasarnya yang meniup uap naik. "
            "Faktanya, kepulan putih itu adalah uap air murni yang mengembun di udara sejuk, sedangkan menara pendingin aliran alami ini tidak memakai satu pun kipas listrik. "
            "Air hangat bekas mendinginkan uap turbin disemprotkan menjadi butiran hujan halus di bagian bawah menara dan memanaskan udara di sekitarnya. "
            "Karena udara hangat yang lembap lebih ringan daripada udara kering yang sejuk di luar, kolom udara hangat itu otomatis membubung naik ke atas akibat gaya apung, persis prinsip balon udara panas. "
            "Aliran naik ini terus menyedot udara segar lewat celah tiang terbuka di kaki menara. "
            "Leher hiperboloid yang menyempit mempercepat angin ke atas sekaligus membuat cangkang beton tipis sangat kokoh menahan terpaan badai dengan bahan jauh lebih hemat dibanding tabung lurus. "
            "Memang tidak semua pembangkit memakai menara tipe ini; pembangkit pesisir sering memakai air laut langsung atau menara berkipas mekanis. "
            "Oh, jadi menara melengkung raksasa itu adalah mesin penarik angin alami yang digerakkan perbedaan berat udara hangat dan bentuk geometrinya."
        ),
    },
    {
        "num": 7,
        "badge": "BAB 07 • SINTESIS KNOT THEORY",
        "title": "Meminjam Hukum Alam untuk Menjaga Kota Tetap Hidup",
        "verify": "Keselamatan & Batas Desain: Tiap Infrastruktur Mengikuti Geologi & Standar Lokal",
        "oh_jadi": "Rekayasa terkuat tidak melawan alam secara buta, melainkan meminjam tenaganya sendiri.",
        "text": (
            "Jika kita melihat kembali kelima sistem raksasa tadi dari dekat, terlihat satu prinsip rekayasa yang sama indahnya. "
            "Infrastruktur paling tangguh di dunia jarang mengandalkan paksaan tenaga kasar semata, melainkan meminjam hukum alam itu sendiri untuk menjaga kota tetap selamat. "
            "Terowongan bawah laut tetap kering karena memanfaatkan tekanan air laut untuk mengunci segel karet tabung tenggelam dan menyeimbangkan tekanan lumpur di depan mesin bor. "
            "Gerbang pasang surut Rotterdam memakai daya apung untuk berayun ringan, lalu memakai massa air puluhan ribu ton sebagai jangkar saat badai menerjang. "
            "Katedral bawah tanah Tokyo mematahkan kecepatan banjir di hutan pilar beton sebelum memompanya ke sungai besar. "
            "Jaringan listrik yang padam total dibangunkan kembali dari tetes gravitasi waduk lewat prosedur Black Start, dan menara pendingin hiperboloid memindahkan ribuan ton udara tiap jam tanpa kipas berkat udara hangat yang ringan. "
            "Seluruh rekayasa ini bekerja hening di balik layar keseharian kita, dirancang spesifik mengikuti batasan geologi, cuaca, serta standar keselamatan tiap kawasan, dan tetap membutuhkan perawatan disiplin agar selalu siap saat dibutuhkan. "
            "Dari lima mesin raksasa tak terlihat tadi, mekanisme mana yang paling membuatmu berkata oh jadi begitu cara kerjanya? "
            "Bagikan pendapatmu di kolom komentar di bawah, dan sampai bertemu pada penelusuran mekanisme berikutnya."
        ),
    },
]


def build_long_audio_and_srt(
    raw_dir: str,
    srt_out_path: str,
    mix_out_path: str,
) -> Tuple[List[SubtitleChunk], List[Tuple[float, float, dict]], float]:
    """Assembles the 7 chapters into an ~11-minute stereo documentary master + synchronized SRT."""
    b_hp, a_hp = signal.butter(2, 80.0 / (SAMPLE_RATE * 0.5), btype="high")
    cursor_s = 3.60  # Cold-open cinematic title card
    gap_between_chapters = 5.40

    chapter_spans: List[Tuple[float, float, dict]] = []
    vo_segments_placed: List[Tuple[int, np.ndarray]] = []
    all_words: List[WordTiming] = []

    for ch in CHAPTERS_L01:
        wav_p = os.path.join(raw_dir, f"kt_l01_ch{ch['num']}.wav")
        with wave.open(wav_p, "rb") as wf:
            sr = wf.getframerate()
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        act = np.where(np.abs(pcm) > 0.012)[0]
        if len(act) > 100:
            pcm = pcm[max(0, int(act[0]) - int(0.08 * sr)) : min(len(pcm), int(act[-1]) + int(0.12 * sr))]

        pcm_hp = signal.lfilter(b_hp, a_hp, pcm).astype(np.float32)
        rms_v = float(np.sqrt(np.mean(pcm_hp[np.abs(pcm_hp) > 0.015] ** 2)))
        if rms_v > 1e-4:
            pcm_hp = pcm_hp * (0.215 / rms_v)

        ch_dur = len(pcm_hp) / SAMPLE_RATE
        ch_start = cursor_s
        ch_end = ch_start + ch_dur
        chapter_spans.append((ch_start - 2.4, ch_end + 1.8, ch))
        vo_segments_placed.append((int(round(ch_start * SAMPLE_RATE)), pcm_hp))

        # Word timings weighted by Indonesian syllables across chapter sentences
        words = ch["text"].split()
        weights = np.array([_syllable_weight(w) for w in words], dtype=np.float64)
        weights /= np.sum(weights)
        w_cur = ch_start
        for w_str, frac in zip(words, weights):
            wd = ch_dur * float(frac)
            all_words.append(WordTiming(word=w_str, start=w_cur, end=w_cur + wd))
            w_cur += wd

        cursor_s = ch_end + gap_between_chapters

    total_dur = round(cursor_s + 2.50, 2)
    chunks: List[SubtitleChunk] = []
    buf: List[WordTiming] = []
    for idx, wt in enumerate(all_words):
        buf.append(wt)
        has_punct = wt.word.endswith((".", "?", ",", ":"))
        next_gap = (all_words[idx + 1].start - wt.end) if (idx + 1 < len(all_words)) else 1.0
        if len(buf) >= 9 or sum(len(x.word) for x in buf) >= 54 or (has_punct and len(buf) >= 4) or next_gap > 0.35:
            chunks.append(SubtitleChunk(words=list(buf), start=buf[0].start, end=buf[-1].end))
            buf.clear()
    if buf:
        chunks.append(SubtitleChunk(words=list(buf), start=buf[0].start, end=buf[-1].end))

    os.makedirs(os.path.dirname(srt_out_path), exist_ok=True)
    def fmt_srt(sec: float) -> str:
        ms = int(round(sec * 1000))
        hh, ms = divmod(ms, 3600000)
        mm, ms = divmod(ms, 60000)
        ss, ms = divmod(ms, 1000)
        return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"

    with open(srt_out_path, "w", encoding="utf-8") as f:
        for i, ch_sub in enumerate(chunks, 1):
            f.write(f"{i}\n{fmt_srt(ch_sub.start)} --> {fmt_srt(ch_sub.end)}\n{' '.join(w.word for w in ch_sub.words)}\n\n")

    # Stereo documentary audio mix
    total_samples = int(round(total_dur * SAMPLE_RATE))
    vo_track = np.zeros(total_samples, dtype=np.float32)
    for i0, seg_pcm in vo_segments_placed:
        n_cp = min(len(seg_pcm), total_samples - i0)
        vo_track[i0 : i0 + n_cp] += seg_pcm[:n_cp]

    env_win = int(0.08 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.8 * vo_abs, 0.28, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
    # Warm documentary ambient arpeggio + sub pad
    step_s = 60.0 / 96.0 / 2.0
    notes_hz = [220.00, 261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66]
    n_note = int(0.32 * SAMPLE_RATE)
    t_n = np.arange(n_note, dtype=np.float32) / SAMPLE_RATE
    t_cur, idx = 0.0, 0
    while t_cur < total_dur - 0.4:
        f_hz = notes_hz[idx % len(notes_hz)]
        tone = (np.sin(2 * np.pi * f_hz * t_n) + 0.18 * np.sin(2 * np.pi * 2 * f_hz * t_n)) * np.exp(-t_n * 9.5)
        _add_clip(sfx_mix, tone.astype(np.float32) * 0.042, t_cur, pan=0.22 * math.sin(idx * 0.65))
        t_cur += step_s
        idx += 1

    sfx_mix *= duck_gain[:, None]

    # Chapter transition chimes & whooshes
    _add_clip(sfx_mix, _sfx_whoosh(0.8, 120, 1200, vol=0.16), 0.25)
    for c_start, c_end, _ in chapter_spans:
        _add_clip(sfx_mix, _sfx_whoosh(0.65, 140, 1100, vol=0.14), max(0.1, c_start))
        _add_clip(sfx_mix, _sfx_chime([440.0, 659.25, 880.0], dur=0.55, vol=0.12), max(0.2, c_start + 0.35))
        _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99], dur=0.45, vol=0.11), max(0.5, c_end - 8.5))

    master = sfx_mix.copy()
    master[:, 0] += vo_track
    master[:, 1] += vo_track
    peak = float(np.max(np.abs(master)))
    if peak > 0.94:
        master = np.tanh(master * 1.10) * 0.89

    os.makedirs(os.path.dirname(mix_out_path), exist_ok=True)
    pcm16 = np.clip(master * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(mix_out_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm16.tobytes())

    return chunks, chapter_spans, total_dur


def _build_chapter_3d_frame(renderer: SceneRenderer, ch_num: int, phase: float) -> np.ndarray:
    """Renders 1 frame (960x540 -> upscaled cleanly to 1920x1080) of chapter ch_num at loop phase in [0, 1)."""
    ang = 2.0 * math.pi * phase
    meshes: List[Mesh] = []
    pls = []
    bg_top, bg_bot = (0.07, 0.13, 0.24), (0.16, 0.30, 0.48)

    if ch_num == 1:
        # Immersed Tube Tunnel sinking into seabed trench + Gina rubber gasket
        meshes.append(make_flat_quad_xz(-7.0, -6.0, 7.0, 6.0, -1.6, hex_rgb("#5C4636"), flags=FLAG_GROUND))
        # Dredged trench walls
        meshes.append(make_beveled_box(12.0, 0.65, 1.4, hex_rgb("#785E49"), bevel=0.04).transformed(pos=(0.0, -1.25, -1.55)))
        meshes.append(make_beveled_box(12.0, 0.65, 1.4, hex_rgb("#785E49"), bevel=0.04).transformed(pos=(0.0, -1.25, 1.55)))
        # Already placed tunnel left + sinking segment right
        meshes.append(make_beveled_box(3.4, 0.95, 1.65, hex_rgb("#CBD5E1"), bevel=0.04).transformed(pos=(-2.1, -1.05, 0.0)))
        sink_y = -0.15 - 0.88 * (0.5 - 0.5 * math.cos(ang))
        meshes.append(make_beveled_box(3.2, 0.95, 1.65, hex_rgb("#E2E8F0"), bevel=0.04).transformed(pos=(1.35, sink_y, 0.0)))
        # Glowing yellow Gina gasket ring at joint
        meshes.append(make_beveled_box(0.14, 1.02, 1.72, hex_rgb("#FFE600"), bevel=0.02, emission=3.5).transformed(pos=(-0.34, -1.05, 0.0)))
        # Tugboats on surface + translucent ocean plane
        for tx in (-0.2, 2.8):
            meshes.append(make_beveled_box(0.85, 0.28, 0.45, hex_rgb("#F97316"), bevel=0.03).transformed(pos=(tx, 0.92, 0.0)))
        meshes.append(make_flat_quad_xz(-7.0, -6.0, 7.0, 6.0, 0.82, hex_rgb("#0284C7"), alpha=0.28, flags=FLAG_DOUBLE_SIDED))
        cam_pos, cam_tgt = (0.4 + 0.5 * math.sin(ang), 1.45, 5.65), (-0.1, -0.45, 0.0)

    elif ch_num == 2:
        # Subsea TBM Earth Pressure Balance cutterhead + pressurized chamber + concrete rings
        meshes.append(make_flat_quad_xz(-7.0, -6.0, 7.0, 6.0, -1.5, hex_rgb("#475569"), flags=FLAG_GROUND))
        meshes.append(make_beveled_box(3.4, 3.2, 3.2, hex_rgb("#6B4F3B"), bevel=0.05).transformed(pos=(-2.4, 0.1, 0.0)))
        # Cutterhead rotating + amber pressurized EPB chamber
        meshes.append(make_cylinder(1.12, 1.12, 0.28, hex_rgb("#F59E0B"), segments=20, emission=2.2).transformed(pos=(-0.62, 0.0, 0.0), rot=(0.0, ang, math.pi * 0.5)))
        meshes.append(make_cylinder(1.08, 1.08, 1.85, hex_rgb("#94A3B8"), segments=20).transformed(pos=(0.45, 0.0, 0.0), rot=(0.0, 0.0, math.pi * 0.5)))
        # Installed tunnel lining rings + screw conveyor
        meshes.append(make_cylinder(1.06, 1.06, 2.8, hex_rgb("#CBD5E1"), segments=20, alpha=0.45, flags=FLAG_DOUBLE_SIDED).transformed(pos=(2.8, 0.0, 0.0), rot=(0.0, 0.0, math.pi * 0.5)))
        meshes.append(make_tube_along_path([(-0.5, -0.25, 0.0), (2.4, 0.35, 0.0)], 0.16, hex_rgb("#00FF88"), sides=10, emission=2.4))
        # Blue hydrostatic arrows opposing amber EPB arrows
        for ky in (-0.55, 0.0, 0.55):
            meshes.append(make_icosphere(0.11, hex_rgb("#00E5FF"), subdivisions=1, emission=3.6).transformed(pos=(-1.35 + 0.18 * math.sin(ang * 2), ky, 0.85)))
        cam_pos, cam_tgt = (0.65, 1.25, 5.25), (0.25, 0.0, 0.0)

    elif ch_num == 3:
        # Maeslantkering Rotterdam twin curved floating storm-surge sector gates
        bg_top, bg_bot = (0.12, 0.22, 0.36), (0.28, 0.44, 0.62)
        meshes.append(make_flat_quad_xz(-7.5, -6.0, 7.5, 6.0, -0.35, hex_rgb("#0369A1"), flags=FLAG_GROUND))
        # Riverbanks & giant spherical ball joints on left & right
        for sx in (-1.0, 1.0):
            meshes.append(make_beveled_box(2.2, 0.55, 7.0, hex_rgb("#4D7C5B"), bevel=0.04).transformed(pos=(sx * 3.8, -0.05, 0.0)))
            meshes.append(make_icosphere(0.36, hex_rgb("#FFE600"), subdivisions=1, emission=2.0).transformed(pos=(sx * 2.95, 0.35, -1.65)))
            swing = 0.42 * (0.5 - 0.5 * math.cos(ang))
            gx = sx * lerp(2.15, 1.08, swing / 0.42)
            meshes.append(make_beveled_box(2.05, 0.68, 0.28, hex_rgb("#F8FAFC"), bevel=0.03, emission=0.4).transformed(pos=(gx, 0.32 - 0.14 * swing, 0.35), rot=(0.0, sx * (0.45 - swing), 0.0)))
            # Truss arms back to ball joint
            meshes.append(make_tube_along_path([(sx * 2.95, 0.35, -1.65), (gx, 0.42, 0.35)], 0.065, hex_rgb("#E2E8F0"), sides=8))
        cam_pos, cam_tgt = (0.0 + 0.6 * math.sin(ang), 3.15, 5.85), (0.0, 0.15, -0.25)

    elif ch_num == 4:
        # Tokyo G-Cans Underground Cathedral: 59 concrete pillars + giant drop silo + calmed turquoise surge
        bg_top, bg_bot = (0.06, 0.10, 0.18), (0.12, 0.22, 0.34)
        meshes.append(make_flat_quad_xz(-7.5, -6.5, 7.5, 6.5, -1.2, hex_rgb("#334155"), flags=FLAG_GROUND))
        # Giant drop shaft on left with falling cyan waterfall
        meshes.append(make_cylinder(0.85, 0.85, 3.8, hex_rgb("#64748B"), segments=18, alpha=0.42, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-2.85, 0.7, -0.5)))
        meshes.append(make_cylinder(0.38, 0.52, 3.6, hex_rgb("#00E5FF"), segments=14, emission=3.0).transformed(pos=(-2.85, 0.65, -0.5)))
        # Cathedral pillars grid
        for px in (-1.0, 0.2, 1.4, 2.6):
            for pz in (-1.4, 0.0, 1.4):
                meshes.append(make_beveled_box(0.34, 2.65, 0.34, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(px, 0.12, pz)))
        # Calmed rising/falling turquoise water sheet
        wy = -0.82 + 0.22 * math.sin(ang)
        meshes.append(make_flat_quad_xz(-3.6, -2.5, 3.8, 2.5, wy, hex_rgb("#06B6D4"), alpha=0.55, flags=FLAG_DOUBLE_SIDED))
        pls.append((-2.2, 0.6, 0.2, 0.0, 0.85, 1.0, 5.5, 0.95))
        cam_pos, cam_tgt = (3.65, 0.95 + 0.2 * math.sin(ang), 4.45), (-0.35, -0.05, -0.15)

    elif ch_num == 5:
        # Grid Black Start: Hydro dam on left -> glowing green starter transmission -> Thermal plant center -> City right
        bg_top, bg_bot = (0.05, 0.08, 0.18), (0.10, 0.18, 0.32)
        meshes.append(make_flat_quad_xz(-7.5, -6.0, 7.5, 6.0, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND))
        # Hydro dam + reservoir (-X)
        meshes.append(make_beveled_box(1.5, 1.85, 2.4, hex_rgb("#64748B"), bevel=0.04).transformed(pos=(-3.2, 0.92, -0.4)))
        meshes.append(make_beveled_box(1.2, 1.55, 2.2, hex_rgb("#0284C7"), bevel=0.02, emission=1.5).transformed(pos=(-4.1, 0.78, -0.4)))
        # Thermal power station (center)
        on_th = 0.5 + 0.5 * math.sin(ang - 0.8)
        meshes.append(make_beveled_box(1.8, 1.45, 1.5, hex_rgb("#475569"), bevel=0.04).transformed(pos=(-0.15, 0.72, -0.3)))
        meshes.append(make_icosphere(0.24, hex_rgb("#00FF88"), subdivisions=1, emission=3.8 * on_th).transformed(pos=(-0.15, 1.65, -0.3)))
        # Transmission pulse line
        meshes.append(make_tube_along_path([(-2.45, 1.2, -0.3), (-0.15, 1.4, -0.3), (2.65, 1.1, -0.2)], 0.055, hex_rgb("#00FF88"), sides=8, emission=3.4))
        px_p = lerp(-2.45, 2.65, phase)
        meshes.append(make_icosphere(0.15, hex_rgb("#FFE600"), subdivisions=1, emission=4.5).transformed(pos=(px_p, 1.32, -0.25)))
        # City skyline buildings (+X) lighting up sequentially
        for idx_b, (bx, bh) in enumerate(((1.8, 1.6), (2.55, 2.2), (3.3, 1.85))):
            lit = 1.0 if phase > (0.35 + idx_b * 0.18) else 0.12
            meshes.append(make_beveled_box(0.58, bh, 0.65, hex_rgb("#334155"), bevel=0.02).transformed(pos=(bx, bh * 0.5, 0.1)))
            meshes.append(make_beveled_box(0.42, bh * 0.68, 0.68, hex_rgb("#FFE066"), bevel=0.01, emission=3.4 * lit).transformed(pos=(bx, bh * 0.52, 0.1)))
        cam_pos, cam_tgt = (0.0, 2.55, 6.25), (-0.15, 0.85, -0.2)

    elif ch_num == 6:
        # Hyperboloid Natural Draft Cooling Tower cutaway: waisted shell + warm spray + rising buoyant air + white vapor plume
        bg_top, bg_bot = (0.14, 0.28, 0.52), (0.38, 0.58, 0.80)
        meshes.append(make_flat_quad_xz(-7.5, -6.0, 7.5, 6.0, 0.0, hex_rgb("#3F624D"), flags=FLAG_GROUND))
        # Stacked hyperboloid rings (wide base -> narrow throat -> flared top)
        radii = [(0.25, 1.45, 1.22), (1.05, 1.22, 0.96), (1.85, 0.96, 0.86), (2.65, 0.86, 1.02)]
        for yb, r0, r1 in radii:
            meshes.append(make_cylinder(r0, r1, 0.80, hex_rgb("#CBD5E1"), segments=24, alpha=0.44, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, yb + 0.40, 0.0)))
        # Base warm water basin + spray mist + rising warm orange-cyan buoyancy spheres + pure white steam cloud
        meshes.append(make_cylinder(1.48, 1.48, 0.18, hex_rgb("#0284C7"), segments=24, emission=1.2).transformed(pos=(0.0, 0.09, 0.0)))
        for k in range(6):
            u = (phase + k / 6.0) % 1.0
            yy = 0.35 + u * 2.85
            col_b = hex_rgb("#FB923C") if u < 0.45 else hex_rgb("#38BDF8")
            meshes.append(make_icosphere(0.12, col_b, subdivisions=1, emission=3.5).transformed(pos=(0.25 * math.sin(u * 6 + k), yy, 0.25 * math.cos(u * 6 + k))))
        for k in range(4):
            u = (phase + k * 0.25) % 1.0
            meshes.append(make_icosphere(0.32 + 0.28 * u, hex_rgb("#F8FAFC"), subdivisions=1, emission=0.9).transformed(pos=(0.18 * math.sin(k * 2.0), 3.25 + u * 1.15, 0.0)))
        cam_pos, cam_tgt = (2.85 * math.sin(0.35 * math.sin(ang)), 2.15, 5.65), (0.0, 1.85, 0.0)

    else:
        # Grand 5-System Knot Theory Synthesis Panorama
        meshes.append(make_flat_quad_xz(-8.0, -6.5, 8.0, 6.5, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND))
        icons = [
            (-3.2, "#00E5FF", 1.1),
            (-1.6, "#FFE600", 1.45),
            (0.0, "#06B6D4", 1.85),
            (1.6, "#00FF88", 1.45),
            (3.2, "#38BDF8", 1.1),
        ]
        for ix, hx_c, h_v in icons:
            bob = 0.12 * math.sin(ang + ix)
            meshes.append(make_beveled_box(0.95, h_v, 0.95, hex_rgb("#334155"), bevel=0.04).transformed(pos=(ix, h_v * 0.5, 0.0)))
            meshes.append(make_icosphere(0.28, hex_rgb(hx_c), subdivisions=1, emission=3.6).transformed(pos=(ix, h_v + 0.42 + bob, 0.0)))
        meshes.append(make_tube_along_path([(-3.2, 0.3, 0.65), (3.2, 0.3, 0.65)], 0.05, hex_rgb("#FFE600"), sides=8, emission=3.0))
        cam_pos, cam_tgt = (0.8 * math.sin(ang), 2.45, 6.45), (0.0, 1.05, 0.0)

    scene = Mesh.merge(meshes)
    img_small = renderer.render(
        scene, cam_pos, cam_tgt, 43.0,
        sun_dir=(0.40, 0.82, 0.40), sun_rgb=(0.80, 0.78, 0.72),
        sky_amb=(0.48, 0.56, 0.68), gnd_amb=(0.28, 0.30, 0.36),
        bg_top=bg_top, bg_bot=bg_bot, point_lights=pls if pls else None,
    )
    return np.asarray(Image.fromarray(img_small, mode="RGB").resize((1920, 1080), Image.Resampling.BILINEAR), dtype=np.uint8)


def render_long_documentary_ep01(
    raw_audio_dir: str,
    srt_out_path: str,
    mix_out_path: str,
    mp4_out_path: str,
    thumb_out_path: str,
) -> dict:
    """Renders full ~11-minute 1920x1080 24fps MP4 documentary + 1280x720 YouTube JPEG thumbnail."""
    subs, ch_spans, total_dur = build_long_audio_and_srt(raw_audio_dir, srt_out_path, mix_out_path)
    fps = 24
    loop_frames = 60  # 2.5s seamless loop per chapter @ 24fps = 420 3D frames total!

    renderer = SceneRenderer(out_w=960, out_h=540, ssaa=1.0, shadow_res=768)
    bank: Dict[int, List[np.ndarray]] = {}
    for ch_num in range(1, 8):
        bank[ch_num] = [_build_chapter_3d_frame(renderer, ch_num, k / float(loop_frames)) for k in range(loop_frames)]

    # Save crisp 1280x720 custom YouTube thumbnail (< 300 KB)
    os.makedirs(os.path.dirname(thumb_out_path), exist_ok=True)
    th_base = Image.fromarray(bank[1][15], mode="RGB").resize((1280, 720), Image.Resampling.LANCZOS).convert("RGBA")
    th_ov = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    td = ImageDraw.Draw(th_ov)
    td.rounded_rectangle([44, 42, 510, 98], radius=16, fill=(10, 18, 34, 230), outline=(255, 230, 0, 255), width=3)
    td.text((66, 55), "KNOT THEORY • DOKUMENTER 11 MENIT", font=_font("Montserrat", 800, 22), fill=(255, 230, 0, 255))
    td.rounded_rectangle([44, 470, 1236, 678], radius=24, fill=(8, 14, 28, 225), outline=(0, 228, 255, 220), width=3)
    td.text((72, 495), "5 MESIN RAKSASA DI BAWAH KOTA", font=_font("Montserrat", 900, 52), fill=(255, 255, 255, 255))
    td.text((72, 565), "TEROWONGAN LAUT • GERBANG BADAI • BLACK START", font=_font("PlusJakartaSans", 800, 34), fill=(255, 230, 0, 255))
    td.text((72, 620), "Bekerja Diam-Diam Tanpa Terlihat Saat Badai & Mati Lampu", font=_font("PlusJakartaSans", 700, 24), fill=(185, 215, 245, 255))
    Image.alpha_composite(th_base, th_ov).convert("RGB").save(thumb_out_path, format="JPEG", quality=88, optimize=True)

    # Pre-cache static chapter HUD overlays (7 chapters) + cold open + subtitle chunk RGBA strips
    f_badge = _font("Montserrat", 800, 23)
    f_title = _font("Montserrat", 900, 34)
    f_ver = _font("PlusJakartaSans", 700, 20)
    f_sub = _font("PlusJakartaSans", 800, 38)
    f_card_big = _font("Montserrat", 900, 54)
    f_card_sub = _font("PlusJakartaSans", 700, 30)

    hud_cache: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}
    for ch in CHAPTERS_L01:
        ov = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        # Top-left documentary header pill + verification ribbon
        d.rounded_rectangle([48, 38, 860, 152], radius=20, fill=(8, 14, 28, 212), outline=(0, 228, 255, 190), width=2)
        d.text((74, 52), ch["badge"], font=f_badge, fill=(255, 230, 0, 255))
        d.text((74, 84), ch["title"], font=f_title, fill=(255, 255, 255, 255))
        d.rounded_rectangle([48, 164, 860, 206], radius=12, fill=(12, 22, 40, 195))
        d.text((68, 173), ch["verify"], font=f_ver, fill=(148, 215, 255, 245))
        arr = np.asarray(ov, dtype=np.uint8)
        hud_cache[ch["num"]] = (arr[:, :, :3], arr[:, :, 3:4].astype(np.uint16))

    def _make_sub_strip(text_line: str) -> Tuple[np.ndarray, np.ndarray]:
        ov = Image.new("RGBA", (1920, 160), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        bb = d.textbbox((0, 0), text_line, font=f_sub)
        tw = bb[2] - bb[0]
        px0 = max(60, (1920 - tw) // 2 - 32)
        px1 = min(1860, (1920 + tw) // 2 + 32)
        d.rounded_rectangle([px0, 26, px1, 118], radius=20, fill=(8, 13, 25, 218), outline=(255, 230, 0, 175), width=2)
        d.text(((1920 - tw) // 2, 46), text_line, font=f_sub, fill=(255, 255, 255, 255))
        arr = np.asarray(ov, dtype=np.uint8)
        return arr[:, :, :3], arr[:, :, 3:4].astype(np.uint16)

    total_frames = int(round(total_dur * fps))
    os.makedirs(os.path.dirname(mp4_out_path), exist_ok=True)
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "1920x1080", "-r", str(fps), "-i", "-",
        "-i", mix_out_path, "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-maxrate", "900k", "-bufsize", "1800k",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", mp4_out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    sub_ptr = 0
    cached_sub_idx = -1
    cached_sub_pair = None

    for f_idx in range(total_frames):
        t = f_idx / float(fps)
        # Determine active chapter
        active_ch = CHAPTERS_L01[-1]
        in_card = False
        for c_s, c_e, ch_d in ch_spans:
            if t <= c_e:
                active_ch = ch_d
                if t < c_s + 2.2:
                    in_card = True
                break

        base_rgb = bank[active_ch["num"]][f_idx % loop_frames].copy()

        # Blend top HUD
        h_rgb, h_a = hud_cache[active_ch["num"]]
        top_slice = base_rgb[:220]
        base_rgb[:220] = ((top_slice.astype(np.uint16) * (255 - h_a[:220]) + h_rgb[:220].astype(np.uint16) * h_a[:220]) >> 8).astype(np.uint8)

        # Chapter opener card highlight
        if in_card or t < 3.2:
            card_im = Image.fromarray(base_rgb[360:680], mode="RGB").convert("RGBA")
            ov_c = Image.new("RGBA", (1920, 320), (0, 0, 0, 0))
            dc = ImageDraw.Draw(ov_c)
            dc.rounded_rectangle([210, 20, 1710, 290], radius=28, fill=(8, 15, 30, 232), outline=(255, 230, 0, 235), width=3)
            hdr = "5 MESIN RAKSASA DI BAWAH KOTA MODERN" if t < 3.2 else active_ch["badge"]
            ttl = "Dokumenter Rekayasa Tak Terlihat • Knot Theory" if t < 3.2 else active_ch["title"]
            dc.text((260, 62), hdr, font=f_card_sub, fill=(255, 230, 0, 255))
            dc.text((260, 128), ttl[:52], font=f_card_big, fill=(255, 255, 255, 255))
            dc.text((260, 212), active_ch["oh_jadi"], font=f_ver, fill=(0, 228, 255, 255))
            base_rgb[360:680] = np.asarray(Image.alpha_composite(card_im, ov_c).convert("RGB"), dtype=np.uint8)

        # Advance subtitle pointer O(1)
        while sub_ptr < len(subs) and subs[sub_ptr].end < t:
            sub_ptr += 1
        if sub_ptr < len(subs) and subs[sub_ptr].start <= t <= subs[sub_ptr].end:
            if cached_sub_idx != sub_ptr:
                cached_sub_idx = sub_ptr
                cached_sub_pair = _make_sub_strip(" ".join(w.word for w in subs[sub_ptr].words))
            s_rgb, s_a = cached_sub_pair
            btm = base_rgb[890:1050]
            base_rgb[890:1050] = ((btm.astype(np.uint16) * (255 - s_a) + s_rgb.astype(np.uint16) * s_a) >> 8).astype(np.uint8)

        # Bottom timeline progress bar
        prog_x = max(4, min(1920, int(round(1920 * (t / total_dur)))))
        base_rgb[1072:1080, :prog_x] = (255, 230, 0)

        proc.stdin.write(base_rgb.tobytes())

    proc.stdin.close()
    err = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(err.decode("utf-8", errors="replace"))

    return {"duration_seconds": total_dur, "mp4": mp4_out_path, "thumbnail": thumb_out_path, "srt": srt_out_path}
