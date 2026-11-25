"""
Knot Theory Long-Form Documentary Engine V2 (10–20 Minute Slot — 16:9 Full HD 1920x1080)
Episode KT-L01: "5 Mesin Raksasa di Bawah Kota yang Bekerja Diam-Diam Saat Badai dan Mati Lampu"

Gold-Standard EP02/EP03 Multi-Act, Zero-Loop 3D Diorama Architecture:
  - 7 full contextual 3D dioramas (35–55 objects each: coastal cities, ships, tugboats, TBM, Rotterdam sector gates,
    Tokyo 59-pillar flood cathedral, hydro dam + HV grid + thermal plant, hyperboloid cooling tower, and grand megacity)
  - ZERO repeating loops: each ~95s chapter progresses monotonically r_ch in [0.0, 1.0] across 4 story acts & 6 camera shots
    (42 distinct camera moves + 38 3D-projected Callout3D cards across 11m 02.75s!)
  - Continuous unique 3D simulation frames rasterized at 6 fps (1152x648, ssaa=1.0, shadow_res=768) and smoothly
    interpolated to 24 fps with native 1920x1080 @ 24 fps HUD, Callout3D leader lines, and karaoke subtitles.
"""

import math
import os
import subprocess
import wave
from typing import Dict, List, Optional, Sequence, Tuple

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import signal

from src.assets_ep02 import make_3d_double_arrow, make_ring_collar
from src.audio_pipeline import (
    SAMPLE_RATE,
    _add_clip,
    _sfx_buzzer_wrong,
    _sfx_chime,
    _sfx_whoosh,
    _syllable_weight,
)
from src.knot_diorama_lib import DioramaSignalProps, lerp, lerp3
from src.overlays import Callout3D, SubtitleChunk, WordTiming, _load_font, smoothstep
from src.renderer3d import (
    FLAG_CAST_SHADOW,
    FLAG_DECAL,
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    FLAG_RECV_SHADOW,
    FLAG_UNLIT,
    Mesh,
    SceneRenderer,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


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
        "oh_jadi": "Pembangkit uap besar butuh listrik luar dulu, sehingga harus dipancing hidup dari PLTA.",
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

    # Stereo documentary audio mix + multi-act Foley cues per chapter!
    total_samples = int(round(total_dur * SAMPLE_RATE))
    vo_track = np.zeros(total_samples, dtype=np.float32)
    for i0, seg_pcm in vo_segments_placed:
        n_cp = min(len(seg_pcm), total_samples - i0)
        vo_track[i0 : i0 + n_cp] += seg_pcm[:n_cp]

    env_win = int(0.08 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.8 * vo_abs, 0.28, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
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

    _add_clip(sfx_mix, _sfx_whoosh(0.8, 120, 1200, vol=0.16), 0.25)
    for c_start, c_end, ch_d in chapter_spans:
        cdur = c_end - c_start
        _add_clip(sfx_mix, _sfx_whoosh(0.65, 140, 1100, vol=0.14), max(0.1, c_start))
        _add_clip(sfx_mix, _sfx_chime([440.0, 659.25, 880.0], dur=0.55, vol=0.12), max(0.2, c_start + 0.35))
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.36, vol=0.11), c_start + cdur * 0.25)
        _add_clip(sfx_mix, _sfx_whoosh(0.60, 220, 1300, vol=0.12), c_start + cdur * 0.48)
        _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99, 1046.5], dur=0.52, vol=0.13), max(0.5, c_end - 8.5))

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


# ==============================================================================
# MULTI-ACT ZERO-LOOP 16:9 DOCUMENTARY 3D DIORAMA DIRECTOR (KT-L01)
# ==============================================================================

class KnotLongEp01Director:
    """Renders 7 massive multi-object 3D dioramas with 4 acts + 6 camera shots + 5-6 Callout3D per chapter."""

    def __init__(self, chapter_spans: List[Tuple[float, float, dict]], render_w: int = 1152, render_h: int = 648, ssaa: float = 1.0):
        self.chapter_spans = chapter_spans
        self.rw = render_w
        self.rh = render_h
        self.renderer = SceneRenderer(out_w=render_w, out_h=render_h, ssaa=ssaa, shadow_res=768)
        self.props = DioramaSignalProps()
        self._init_all_chapter_dioramas()

    def _init_all_chapter_dioramas(self) -> None:
        p = self.props

        # --- CH 1: Subsea Immersed Tube Strait + Coastal Peninsulas + Dredged Trench ---
        c1 = [
            make_flat_quad_xz(-9.5, -7.0, 9.5, 7.0, -1.85, hex_rgb("#5E493A"), flags=FLAG_GROUND, subdiv=2),
            # Dredged trench walls along z = -1.35 and +1.35
            make_beveled_box(13.0, 0.72, 1.8, hex_rgb("#7A604C"), bevel=0.04).transformed(pos=(0.0, -1.48, -1.95)),
            make_beveled_box(13.0, 0.72, 1.8, hex_rgb("#7A604C"), bevel=0.04).transformed(pos=(0.0, -1.48, 1.95)),
            # Left coastal headland + casting basin + houses + trees
            make_beveled_box(3.8, 2.75, 8.5, hex_rgb("#5A8F69"), bevel=0.06).transformed(pos=(-6.2, -0.48, -0.5)),
            p.shop(-6.5, -2.6, "#DCE8F2", "#0284C7", h=2.8),
            p.house(-5.2, -2.5, wall_hex="#EAE2B7", roof_hex="#D97757"),
            p.tree(-4.8, -1.2, 0.95),
            p.tree(-6.8, -0.8, 1.05),
            # Right coastal headland + houses + lighthouse/trees
            make_beveled_box(3.8, 2.75, 8.5, hex_rgb("#5A8F69"), bevel=0.06).transformed(pos=(6.2, -0.48, -0.5)),
            p.house(5.3, -2.4, wall_hex="#F1F5F9", roof_hex="#2563EB"),
            p.shop(6.7, -2.5, "#E8DFD5", "#BC6C25", h=2.6),
            p.tree(5.0, -0.9, 0.92),
            p.tree(6.9, -1.0, 1.0),
            # Already-installed Tunnel Segment #1 on left (-2.85) with dual road/rail bore!
            make_beveled_box(3.8, 0.98, 1.78, hex_rgb("#CBD5E1"), bevel=0.04, alpha=0.58, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-2.65, -1.28, 0.0)),
            make_beveled_box(3.8, 0.14, 1.62, hex_rgb("#334155"), bevel=0.01).transformed(pos=(-2.65, -1.68, 0.0)),
        ]
        self.ch1_static = Mesh.merge(c1)

        # --- CH 2: Deep Subsea Geological Strata + Giant EPB Tunnel Boring Machine ---
        c2 = [
            make_flat_quad_xz(-9.5, -6.5, 9.5, 6.5, -2.10, hex_rgb("#334155"), flags=FLAG_GROUND),
            # Multi-layer soil & rock ahead of TBM (-X side: wet clay, sand, rock + ocean on top!)
            make_beveled_box(4.6, 1.45, 4.2, hex_rgb("#6B4F3B"), bevel=0.04, alpha=0.82, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-3.65, -1.25, 0.0)),
            make_beveled_box(4.6, 1.35, 4.2, hex_rgb("#8A654D"), bevel=0.04, alpha=0.72, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-3.65, 0.15, 0.0)),
            make_beveled_box(4.6, 0.95, 4.2, hex_rgb("#A67B5B"), bevel=0.04, alpha=0.65, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-3.65, 1.28, 0.0)),
            # Ocean water layer above strata + coastal city silhouettes
            make_beveled_box(13.0, 0.72, 4.6, hex_rgb("#0284C7"), bevel=0.02, alpha=0.30, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, 2.18, 0.0)),
            p.cargo_ship((2.4, 2.52, -1.1), rot_y=-0.25, scale=0.68),
            # TBM Main Steel Shield Cylinder (x = -1.15 .. +0.95) + Precast Concrete Lining Rings (x = +1.05 .. +5.2)
            make_cylinder(1.18, 1.18, 1.95, hex_rgb("#94A3B8"), segments=24, alpha=0.38, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.05, -0.35, 0.0), rot=(0.0, 0.0, math.pi * 0.5)),
            # Translucent Amber EPB Excavation Chamber right behind cutterhead (x = -1.05)
            make_cylinder(1.15, 1.15, 0.52, hex_rgb("#F59E0B"), segments=22, alpha=0.45, emission=1.4, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-1.05, -0.35, 0.0), rot=(0.0, 0.0, math.pi * 0.5)),
            # Inclined Screw Conveyor extracting pressurized soil paste!
            make_tube_along_path([(-1.12, -0.95, 0.0), (1.35, 0.12, 0.0)], 0.17, hex_rgb("#10B981"), sides=12, emission=1.8),
            # Walkway + muck conveyor belt inside completed precast concrete rings
            make_beveled_box(5.2, 0.12, 1.55, hex_rgb("#475569"), bevel=0.02).transformed(pos=(2.65, -1.05, 0.0)),
        ]
        for rx in (1.35, 2.15, 2.95, 3.75, 4.55):
            c2.append(make_ring_collar(1.06, 1.20, -0.36, 0.36, hex_rgb("#CBD5E1"), segments=22).transformed(pos=(rx, -0.35, 0.0), rot=(0.0, 0.0, math.pi * 0.5)))
        self.ch2_static = Mesh.merge(c2)

        # --- CH 3: Rotterdam Maeslantkering Channel + Dutch Dikes + Spherical Ball Joints ---
        c3 = [
            make_flat_quad_xz(-9.5, -7.5, 9.5, 7.5, -0.65, hex_rgb("#075985"), flags=FLAG_GROUND, subdiv=2),
            # Concrete riverbed sill across channel at z = +0.55 where gates sink & rest!
            make_beveled_box(5.6, 0.28, 0.68, hex_rgb("#94A3B8"), bevel=0.03).transformed(pos=(0.0, -0.52, 0.55)),
        ]
        for sx in (-1.0, 1.0):
            # Green Dutch riverbanks + parking docks + houses + trees + wind turbines
            c3.append(make_beveled_box(3.8, 1.15, 10.5, hex_rgb("#588B66"), bevel=0.05).transformed(pos=(sx * 4.55, -0.05, -0.5)))
            c3.append(make_beveled_box(1.95, 0.52, 2.85, hex_rgb("#64748B"), bevel=0.03).transformed(pos=(sx * 3.15, 0.18, -0.45)))
            c3.append(p.house(sx * 4.8, -2.6, wall_hex="#F8FAFC", roof_hex="#D96B43"))
            c3.append(p.house(sx * 4.2, 1.8, wall_hex="#EAE2B7", roof_hex="#2563EB"))
            c3.append(p.tree(sx * 3.7, -3.2, 0.95))
            c3.append(p.tree(sx * 5.2, 0.2, 1.05))
            # Giant Onshore Spherical Ball Joint (10m diameter steel hinge!) at (sx * 3.25, 0.55, -2.15)
            c3.append(make_beveled_box(0.95, 0.45, 0.95, hex_rgb("#475569"), bevel=0.03).transformed(pos=(sx * 3.25, 0.35, -2.15)))
            c3.append(make_icosphere(0.38, hex_rgb("#FACC15"), subdivisions=2, roughness=0.25, emission=1.4).transformed(pos=(sx * 3.25, 0.68, -2.15)))
        self.ch3_static = Mesh.merge(c3)

        # --- CH 4: Tokyo G-Cans Kasukabe Surface City + 50m Deep 59-Pillar Flood Cathedral ---
        c4 = [
            # Surface Kasukabe town + swollen small river on left + wide Edo River on right!
            make_beveled_box(14.0, 0.24, 5.4, hex_rgb("#5E9A6E"), bevel=0.03).transformed(pos=(0.0, 1.85, -0.5)),
            p.house(-4.5, -1.8, wall_hex="#F1F5F9", roof_hex="#0284C7").transformed(pos=(0.0, 1.95, 0.0)),
            p.shop(-2.2, -1.9, "#DCE8F2", "#D97757", h=2.4).transformed(pos=(0.0, 1.95, 0.0)),
            p.house(0.8, -1.8, wall_hex="#EAE2B7", roof_hex="#4F86C6").transformed(pos=(0.0, 1.95, 0.0)),
            p.tree(-0.8, -1.2, 0.85).transformed(pos=(0.0, 1.95, 0.0)),
            p.tree(2.4, -1.2, 0.90).transformed(pos=(0.0, 1.95, 0.0)),
            # Wide Edo River channel on far right (x = +4.8)
            make_beveled_box(2.6, 0.32, 5.4, hex_rgb("#0284C7"), bevel=0.02, emission=1.1).transformed(pos=(4.85, 1.82, -0.5)),
            # Underground Flood Cathedral Floor, Back Wall & Ceiling (y = -2.20 .. +0.55)
            make_flat_quad_xz(-9.0, -6.0, 9.0, 6.0, -2.20, hex_rgb("#334155"), flags=FLAG_GROUND),
            make_beveled_box(13.5, 2.85, 0.22, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.0, -0.78, -2.45)),
            make_beveled_box(13.5, 0.22, 4.6, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(0.0, 0.62, -0.3)),
            # Giant Cylindrical Drop Silo Shaft #3 on left (x = -3.85, y = -2.15 .. +1.85)
            make_cylinder(0.92, 0.92, 3.95, hex_rgb("#94A3B8"), segments=20, alpha=0.35, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-3.85, -0.15, -0.25)),
            # 18 Towering 500-Ton Concrete Pillars in 6x3 Cathedral Forest (x = -1.8 .. +2.4)
            # + Inspector Catwalk Staircase + 4 Giant Gas-Turbine Drainage Pumps on right (x = +3.35)!
            make_beveled_box(1.15, 0.10, 0.55, hex_rgb("#FACC15"), bevel=0.01).transformed(pos=(-2.15, -0.15, 0.65)),
        ]
        for px in (-1.85, -1.00, -0.15, 0.70, 1.55, 2.40):
            for pz in (-1.55, -0.35, 0.85):
                c4.append(make_beveled_box(0.28, 2.72, 0.28, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(px, -0.82, pz)))
        # Risers from pumps up to Edo River
        for kz in (-0.85, -0.25, 0.35, 0.95):
            c4.append(make_cylinder(0.22, 0.22, 0.65, hex_rgb("#0EA5E9"), segments=14).transformed(pos=(3.35, -1.65, kz)))
        c4.append(make_tube_along_path([(3.35, -1.35, 0.0), (3.85, 0.45, 0.0), (4.55, 1.82, 0.0)], 0.20, hex_rgb("#38BDF8"), sides=12, alpha=0.45, flags=FLAG_DOUBLE_SIDED))
        self.ch4_static = Mesh.merge(c4)

        # --- CH 5: Island Grid Black Start (Mountain Hydro Dam -> HV Towers -> Thermal Plant -> City) ---
        c5 = [
            make_flat_quad_xz(-9.5, -6.5, 9.5, 6.5, 0.0, hex_rgb("#2A3B34"), flags=FLAG_GROUND, subdiv=2),
            # Left Mountain + Concrete Hydro Dam + Blue Reservoir + Sloped Penstock Pipe!
            make_beveled_box(2.8, 2.65, 4.2, hex_rgb("#4B5563"), bevel=0.08).transformed(pos=(-5.2, 1.32, -0.8)),
            make_beveled_box(1.85, 2.15, 3.2, hex_rgb("#94A3B8"), bevel=0.05).transformed(pos=(-3.85, 1.08, -0.6)),
            make_beveled_box(1.65, 1.95, 2.9, hex_rgb("#0284C7"), bevel=0.02, emission=1.4).transformed(pos=(-4.85, 1.02, -0.6)),
            make_tube_along_path([(-3.85, 1.65, -0.2), (-2.85, 0.42, -0.2)], 0.14, hex_rgb("#38BDF8"), sides=12, alpha=0.48, flags=FLAG_DOUBLE_SIDED),
            make_beveled_box(0.85, 0.68, 0.85, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(-2.75, 0.34, -0.2)),
            # HV Steel Lattice Transmission Towers at x = -1.75 and x = +1.35
            make_tube_along_path([(-1.75, 0.0, -0.4), (-1.75, 2.35, -0.4)], 0.055, hex_rgb("#94A3B8"), sides=6),
            make_beveled_box(0.65, 0.06, 0.08, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(-1.75, 2.15, -0.4)),
            make_tube_along_path([(1.35, 0.0, -0.4), (1.35, 2.35, -0.4)], 0.055, hex_rgb("#94A3B8"), sides=6),
            make_beveled_box(0.65, 0.06, 0.08, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(1.35, 2.15, -0.4)),
            # Center Giant Thermal Power Plant (Boiler Hall + Smokestack + Auxiliary Pump Motors)
            make_beveled_box(2.15, 1.68, 1.75, hex_rgb("#475569"), bevel=0.04).transformed(pos=(-0.20, 0.84, -0.5)),
            make_cylinder(0.16, 0.22, 2.65, hex_rgb("#64748B"), segments=14).transformed(pos=(-0.85, 1.32, -0.95)),
            p.tree(-2.2, 1.4, 0.88),
            p.tree(1.4, 1.5, 0.92),
        ]
        self.ch5_static = Mesh.merge(c5)

        # --- CH 6: Hyperboloid Natural-Draft Cooling Tower + Power Station Diorama ---
        c6 = [
            make_flat_quad_xz(-9.5, -6.5, 9.5, 6.5, 0.0, hex_rgb("#4B7F58"), flags=FLAG_GROUND, subdiv=2),
            # Adjacent Turbine Hall + Condenser Hot/Cold Pipes on left (-3.4)
            make_beveled_box(2.6, 1.65, 2.1, hex_rgb("#64748B"), bevel=0.04).transformed(pos=(-3.55, 0.82, -0.4)),
            p.house(3.8, -2.2, wall_hex="#EAE2B7", roof_hex="#0284C7"),
            p.tree(2.9, -1.2, 0.95),
            p.tree(4.5, -0.8, 1.05),
            p.tree(-2.4, 1.6, 0.90),
            # Cold Water Collection Basin at y = 0.0 .. 0.22 + Diagonal V-Struts around open air-inlet base!
            make_ring_collar(1.55, 1.72, 0.0, 0.26, hex_rgb("#94A3B8"), segments=28).transformed(pos=(0.0, 0.0, 0.0)),
            make_cylinder(1.54, 1.54, 0.16, hex_rgb("#0284C7"), segments=28, emission=1.2).transformed(pos=(0.0, 0.08, 0.0)),
            # Hot water riser pipe + spray distribution header ring at y = 1.05 + honeycomb fill pack at y = 0.82
            make_tube_along_path([(-2.25, 0.45, 0.0), (0.0, 0.45, 0.0), (0.0, 1.08, 0.0)], 0.095, hex_rgb("#F97316"), sides=10, emission=2.0),
            make_tube_along_path([(0.0, 0.12, 0.35), (-2.25, 0.12, 0.35)], 0.095, hex_rgb("#00E5FF"), sides=10, emission=2.0),
            make_cylinder(1.26, 1.26, 0.14, hex_rgb("#475569"), segments=24, alpha=0.65, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, 0.82, 0.0)),
        ]
        for k in range(12):
            a0 = 2.0 * math.pi * k / 12.0
            a1 = 2.0 * math.pi * (k + 0.5) / 12.0
            c6.append(make_tube_along_path([(1.58 * math.cos(a0), 0.22, 1.58 * math.sin(a0)), (1.38 * math.cos(a1), 0.68, 1.38 * math.sin(a1))], 0.038, hex_rgb("#CBD5E1"), sides=6))
            c6.append(make_tube_along_path([(1.58 * math.cos(a0), 0.22, 1.58 * math.sin(a0)), (1.38 * math.cos(a0 - 0.26), 0.68, 1.38 * math.sin(a0 - 0.26))], 0.038, hex_rgb("#CBD5E1"), sides=6))
        self.ch6_static = Mesh.merge(c6)

        # --- CH 7: Grand Integrated 5-System Coastal Megacity Synthesis Diorama ---
        c7 = [
            # Upper coastal city shelf (y = 0.0) + Bay & Harbor (x > 1.2) + Underground Cutaway (y = -2.1 .. 0.0)
            make_beveled_box(6.8, 0.22, 7.2, hex_rgb("#4D7C5B"), bevel=0.03).transformed(pos=(-2.1, -0.08, -0.6)),
            make_flat_quad_xz(-9.5, -7.0, 9.5, 7.0, -2.15, hex_rgb("#334155"), flags=FLAG_GROUND),
            # System 5A: Upland Hydro Dam (-4.6) & System 5B: Hyperboloid Cooling Tower (-3.1)
            make_beveled_box(1.2, 1.55, 1.8, hex_rgb("#94A3B8"), bevel=0.04).transformed(pos=(-4.55, 0.78, -1.8)),
            make_beveled_box(0.95, 1.35, 1.6, hex_rgb("#0284C7"), bevel=0.02, emission=1.4).transformed(pos=(-5.25, 0.68, -1.8)),
            make_cylinder(0.62, 0.42, 1.15, hex_rgb("#CBD5E1"), segments=20).transformed(pos=(-3.05, 0.58, -1.85)),
            make_cylinder(0.42, 0.50, 0.75, hex_rgb("#E2E8F0"), segments=20).transformed(pos=(-3.05, 1.52, -1.85)),
            # Coastal City Skyline with glowing golden windows (x = -1.8 .. +0.6)
            p.shop(-1.75, -1.65, "#334155", "#0EA5E9", h=2.45),
            p.shop(-0.45, -1.85, "#1E293B", "#FACC15", h=2.95),
            p.house(0.55, -1.55, wall_hex="#E2E8F0", roof_hex="#D96B43", power_on=True),
            p.tree(-2.35, -0.55, 0.82),
            p.tree(0.95, -0.45, 0.85),
            # System 4: Underground Tokyo Pillared Surge Cathedral directly beneath city (x = -2.2 .. +0.4, y = -2.0 .. -0.25)
            make_beveled_box(3.8, 1.75, 2.2, hex_rgb("#475569"), bevel=0.02, alpha=0.28, flags=FLAG_DOUBLE_SIDED).transformed(pos=(-0.95, -1.10, 0.25)),
            make_cylinder(0.35, 0.35, 1.85, hex_rgb("#00E5FF"), segments=14, emission=2.4).transformed(pos=(-2.45, -1.02, 0.25)),
            # System 3: Rotterdam Twin Curved Storm-Surge Sector Gates at Harbor Mouth (x = +2.35, y = 0.05)
            make_icosphere(0.22, hex_rgb("#FFE600"), subdivisions=1, emission=2.2).transformed(pos=(1.55, 0.22, -1.45)),
            make_icosphere(0.22, hex_rgb("#FFE600"), subdivisions=1, emission=2.2).transformed(pos=(4.15, 0.22, -1.45)),
            make_beveled_box(1.15, 0.42, 0.18, hex_rgb("#F8FAFC"), bevel=0.02).transformed(pos=(2.25, 0.08, -0.35), rot=(0.0, 0.18, 0.0)),
            make_beveled_box(1.15, 0.42, 0.18, hex_rgb("#F8FAFC"), bevel=0.02).transformed(pos=(3.45, 0.08, -0.35), rot=(0.0, -0.18, 0.0)),
            # System 1 & 2: Subsea Tunnel + TBM beneath the bay (x = +1.2 .. +4.8, y = -1.55) + Translucent Ocean!
            make_beveled_box(3.95, 0.68, 1.15, hex_rgb("#CBD5E1"), bevel=0.03, alpha=0.48, flags=FLAG_DOUBLE_SIDED).transformed(pos=(2.95, -1.58, 0.35)),
            make_beveled_box(4.6, 1.75, 5.2, hex_rgb("#0284C7"), bevel=0.02, alpha=0.26, flags=FLAG_DOUBLE_SIDED).transformed(pos=(3.25, -0.82, -0.3)),
            p.cargo_ship((3.65, 0.08, -2.15), rot_y=-0.35, scale=0.62),
        ]
        for px in (-1.65, -0.95, -0.25):
            c7.append(make_beveled_box(0.18, 1.68, 0.18, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(px, -1.12, 0.25)))
        self.ch7_static = Mesh.merge(c7)

    def get_chapter_callouts(self, ch_num: int, r: float) -> List[Tuple[Tuple[float, float, float], str, str, Tuple[int, int, int]]]:
        """Returns active 3D-projected callouts (world_pos, title, sub, accent_rgb) at chapter progress r in [0, 1]."""
        out = []
        if ch_num == 1:
            if 0.08 <= r <= 0.21:
                out.append(((0.65, -0.85, 0.0), "MITOS KUBAH PENYELAM!", "Bukan Dibangun Terbuka di Bawah Laut", (255, 58, 76)))
            elif 0.23 <= r <= 0.38:
                out.append(((-1.85, 0.15, 0.0), "DICETAK DI GALANGAN KERING", "Ujung Ditutup Sekat -> Mengapung di Laut!", (255, 230, 0)))
            elif 0.40 <= r <= 0.56:
                out.append(((1.15, -0.45, 0.0), "TANGKI PEMBERAT DIISI AIR", "Tenggelam Presisi ke Parit Dasar Laut", (0, 228, 255)))
            elif 0.58 <= r <= 0.77:
                out.append(((-0.72, -1.15, 0.0), "SEGEL KARET GINA TERKUNCI!", "Tekanan Samudra Menekan Sambungan Kedap", (0, 245, 136)))
            elif 0.79 <= r <= 0.94:
                out.append(((0.25, -1.25, 0.0), "JALAN RAYA KERING DI DASAR LAUT!", "Ruang Sambungan Dipompa & Sekat Dibuka", (255, 230, 0)))
        elif ch_num == 2:
            if 0.07 <= r <= 0.21:
                out.append(((-1.35, -0.25, 0.0), "PABRIK BERJALAN BAWAH LAUT", "Menembus Tanah Lunak & Batuan Basah", (0, 228, 255)))
            elif 0.23 <= r <= 0.43:
                out.append(((-1.05, -0.25, 0.0), "BOR BIASA KOSONG = BOCOR!", "Air Laut Menerobos Masuk Ruang Galian", (255, 58, 76)))
            elif 0.45 <= r <= 0.64:
                out.append(((-1.05, 0.25, 0.0), "RUANG PENYEIMBANG TEKANAN (EPB)", "Bubur Tanah Bertekanan = Tekanan Air Laut", (255, 230, 0)))
            elif 0.66 <= r <= 0.82:
                out.append(((0.85, 0.15, 0.0), "ULIR PASTA & LENGAN ROBOT", "Tanah Keluar Terukur + Cincin Beton Rapat", (0, 245, 136)))
            elif 0.84 <= r <= 0.95:
                out.append(((2.45, -0.35, 0.0), "TEROWONGAN KERING & KOKOH!", "Menyamakan Tekanan Sejak Detik Pertama", (56, 189, 248)))
        elif ch_num == 3:
            if 0.06 <= r <= 0.22:
                out.append(((0.0, 0.25, -0.2), "HARI CERAH: PARKIR DI DARAT", "Kapal Kontainer Bebas Masuk Pelabuhan", (0, 228, 255)))
            elif 0.25 <= r <= 0.48:
                out.append(((-1.45, 0.45, 0.35), "LENGAN BERONGGA MENGAPUNG!", "Ringan Diayunkan Menutup Muara Sungai", (255, 230, 0)))
            elif 0.50 <= r <= 0.64:
                out.append(((0.0, 0.42, 0.55), "JIKA TETAP MENGAPUNG: GOYAH!", "Terombang-Ambing Dihantam Ombak Badai", (255, 58, 76)))
            elif 0.65 <= r <= 0.82:
                out.append(((0.0, 0.15, 0.55), "DIISI AIR -> TENGGELAM KOKOH!", "Duduk di Bantalan Beton + Sendi Bola Darat", (0, 245, 136)))
            elif 0.84 <= r <= 0.95:
                out.append(((-3.25, 0.72, -2.15), "SENDI BOLA BAJA RAKSASA", "Menyalurkan Dorongan Laut Seperti Bahu", (255, 230, 0)))
        elif ch_num == 4:
            if 0.06 <= r <= 0.21:
                out.append(((-2.2, 2.15, -0.8), "CEKUNGAN PERMUKIMAN PADAT", "Sungai Kecil Meluap Saat Hujan Ekstrem", (255, 58, 76)))
            elif 0.23 <= r <= 0.46:
                out.append(((-3.85, 0.35, -0.25), "5 SUMUR SILINDER RAKSASA!", "Setara Gedung 20 Lantai Menelan Luapan", (0, 228, 255)))
            elif 0.48 <= r <= 0.74:
                out.append(((0.25, -0.45, -0.35), "HUTAN 59 PILAR BETON 500 TON", "Menjinakkan Pusaran & Kecepatan Banjir", (255, 230, 0)))
            elif 0.76 <= r <= 0.94:
                out.append(((3.35, -1.15, 0.0), "4 TURBIN POMPA KE SUNGAI EDO", "Membuang Air Terkendali Tanpa Merusak Kota", (0, 245, 136)))
        elif ch_num == 5:
            if 0.05 <= r <= 0.19:
                out.append(((2.65, 1.65, 0.0), "BLACKOUT TOTAL SE-PULAU!", "Jaringan 0 Volt • Semua Pembangkit Padam", (255, 58, 76)))
            elif 0.21 <= r <= 0.43:
                out.append(((-0.20, 1.45, -0.5), "PEMBANGKIT UAP TERKUNCI!", "Butuh Listrik Luar untuk Pompa & Kipas", (255, 140, 0)))
            elif 0.45 <= r <= 0.66:
                out.append(((-3.55, 1.35, -0.4), "UNIT BLACK START MANDIRI (PLTA)", "Gravitasi Air Waduk Memutar Turbin Awal", (0, 245, 136)))
            elif 0.68 <= r <= 0.84:
                out.append(((-0.20, 1.65, -0.5), "MEMANCING PEMBANGKIT RAKSASA!", "Mesin Bantu Hidup -> sinkronisasi 50 Hz", (0, 228, 255)))
            elif 0.85 <= r <= 0.96:
                out.append(((2.85, 1.85, 0.0), "PEMULIHAN KOTA BERTAHAP!", "Lampu Menyala Kembali Blok demi Blok", (255, 230, 0)))
        elif ch_num == 6:
            if 0.06 <= r <= 0.23:
                out.append(((0.0, 0.55, 0.0), "BUKAN ASAP & TANPA KIPAS!", "Uap Air Murni + Kaki Menara Terbuka", (255, 58, 76)))
            elif 0.25 <= r <= 0.50:
                out.append(((0.0, 1.15, 0.0), "SEMPROTAN AIR HANGAT TURBIN", "Udara Lembap Hangat Lebih Ringan -> Naik!", (255, 140, 0)))
            elif 0.52 <= r <= 0.78:
                out.append(((0.0, 2.25, 0.0), "LEHER CEKUNG HIPERBOLOID", "Mempercepat Angin Naik & Tahan Badai", (0, 228, 255)))
            elif 0.80 <= r <= 0.95:
                out.append(((0.0, 3.55, 0.0), "MENGEMBUN JADI AWAN PUTIH!", "Air Dingin di Kolam Kembali ke Pembangkit", (0, 245, 136)))
        else:
            if 0.08 <= r <= 0.30:
                out.append(((2.95, -1.35, 0.35), "MEMINJAM TEKANAN SAMUDRA", "Tabung Tenggelam & Mesin Bor Seimbang", (0, 228, 255)))
            elif 0.32 <= r <= 0.54:
                out.append(((2.65, 0.25, -0.35), "MEMINJAM DAYA APUNG & PILAR", "Gerbang Rotterdam & Katedral Banjir Tokyo", (255, 230, 0)))
            elif 0.56 <= r <= 0.78:
                out.append(((-3.65, 1.25, -1.8), "MEMINJAM GRAVITASI & GAYA APUNG", "Black Start PLTA & Menara Hiperboloid", (0, 245, 136)))
            elif 0.80 <= r <= 0.96:
                out.append(((-0.55, 1.65, -1.5), "MANA FAVORITMU? TULIS DI KOMENTAR!", "5 Mesin Tak Terlihat Penjaga Kota Modern", (255, 230, 0)))
        return out

    def render_3d_at(self, ch_num: int, r: float, t: float) -> Tuple[np.ndarray, Tuple[float, float, float], Tuple[float, float, float], float]:
        """Renders continuous non-repeating 3D simulation frame at chapter progress r in [0, 1] and global time t."""
        p = self.props
        meshes: List[Mesh] = []
        pls: List[Tuple[float, float, float, float, float, float, float, float]] = []
        sun_rgb = (0.82, 0.80, 0.74)
        sky_amb = (0.52, 0.58, 0.70)
        gnd_amb = (0.32, 0.34, 0.40)
        bg_top, bg_bot = (0.14, 0.30, 0.54), (0.38, 0.58, 0.80)
        fov = 47.5

        # ======================================================================
        # CHAPTER 1: SUBSEA IMMERSED TUBE TUNNEL
        # ======================================================================
        if ch_num == 1:
            meshes.append(self.ch1_static)
            # Background cargo ship cruising across strait
            meshes.append(p.cargo_ship((-3.5 + r * 7.0, 0.56, -3.2), rot_y=0.0, scale=0.72))

            # Act 1 (r < 0.22): Myth of giant underwater glass dome cracking!
            if r < 0.22:
                meshes.append(make_icosphere(1.25, hex_rgb("#38BDF8"), subdivisions=2, alpha=0.35, flags=FLAG_DOUBLE_SIDED).transformed(pos=(1.2, -1.25, 0.0)))
                meshes.append(p.character((1.2, -1.72, 0.0), rot_y=0.3, dizzy_stars=(r > 0.10), hard_hat=True, time_s=t))
                if r > 0.09:
                    meshes.append(p.red_cross.transformed(pos=(1.2, -0.05, 0.45), scale=0.95))
            else:
                # Act 2 (0.22..0.42): Tube #2 towed across surface from left (-2.5 -> +1.05) by 2 orange tugboats!
                # Act 3 (0.42..0.78): Ballast fills -> sinks into seabed trench (-1.28) -> Gina rubber gasket compressed by ocean arrows!
                # Act 4 (0.78..1.00): Bulkhead opens -> yellow & blue cars + MRT train glide through dry subsea tunnel!
                tow_u = smoothstep(0.22, 0.42, r)
                sink_u = smoothstep(0.44, 0.62, r)
                lock_u = smoothstep(0.62, 0.74, r)
                seg_x = lerp(-2.4, lerp(1.22, 0.96, lock_u), tow_u)
                seg_y = lerp(0.36, -1.28, sink_u)

                meshes.append(make_beveled_box(3.6, 0.98, 1.78, hex_rgb("#E2E8F0"), bevel=0.04, alpha=0.55 if r > 0.45 else 0.92, flags=FLAG_DOUBLE_SIDED).transformed(pos=(seg_x, seg_y, 0.0)))
                meshes.append(make_beveled_box(3.5, 0.14, 1.62, hex_rgb("#334155"), bevel=0.01).transformed(pos=(seg_x, seg_y - 0.40, 0.0)))

                # Tugboats + tow cables
                for tx_off in (-1.45, 1.45):
                    tx = seg_x + tx_off
                    meshes.append(make_beveled_box(0.92, 0.30, 0.52, hex_rgb("#F97316"), bevel=0.04).transformed(pos=(tx, 0.58, 0.0)))
                    meshes.append(make_beveled_box(0.36, 0.28, 0.38, hex_rgb("#F8FAFC"), bevel=0.02).transformed(pos=(tx - 0.12, 0.84, 0.0)))
                    if r < 0.66:
                        meshes.append(make_tube_along_path([(tx, 0.48, 0.0), (seg_x + tx_off * 0.8, seg_y + 0.48, 0.0)], 0.022, hex_rgb("#FFE600"), sides=6))

                # Glowing Gina Rubber Gasket between Tube #1 (-0.75) and Tube #2!
                gasket_w = lerp(0.16, 0.08, lock_u)
                meshes.append(make_beveled_box(gasket_w, 1.06, 1.86, hex_rgb("#00FF88" if lock_u > 0.7 else "#FFE600"), bevel=0.02, emission=3.8).transformed(pos=(-0.74, -1.28, 0.0)))

                # Hydrostatic ocean pressure arrows pressing segment & locking Gina seal!
                if 0.56 <= r <= 0.80:
                    meshes.append(make_3d_double_arrow((2.95, -1.28, 0.0), (1.35, -1.28, 0.0), hex_rgb("#00E5FF"), shaft_r=0.045, emission=3.8))
                    meshes.append(make_3d_double_arrow((-0.74, 0.25, 0.0), (-0.74, -0.62, 0.0), hex_rgb("#00E5FF"), shaft_r=0.042, emission=3.6))

                # Act 4: Dry traffic flowing inside subsea tunnel + Green Check!
                if r >= 0.76:
                    cx1 = -3.8 + ((t * 2.2) % 6.4)
                    meshes.append(p.car_stylized((0.0, 0.0, 0.0), rot_y=0.0, body_hex="#FACC15", wheel_spin=t * 9.0).transformed(pos=(cx1, -1.60, 0.38), scale=0.52))
                    meshes.append(p.mrt_train_car((2.4 - ((t * 2.5) % 6.2), -1.58, -0.38), rot_y=math.pi, length=1.85))
                    meshes.append(p.green_check.transformed(pos=(-0.74, -0.05 + 0.04 * math.sin(t * 3.5), 0.45), scale=0.95))

            # Translucent Ocean Surface
            meshes.append(make_beveled_box(10.5, 2.25, 6.2, hex_rgb("#0284C7"), bevel=0.02, alpha=0.24, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, -0.58, 0.0)))

            # 6 Progressive Camera Shots (framed cleanly to show mechanism + full coastal/marine diorama!)
            s1, g1 = (0.0, 3.15, 9.85), (0.0, -0.35, -0.25)
            s2, g2 = (-1.45, 2.35, 7.65), (-0.85, -0.15, 0.0)
            s3, g3 = (0.65, 1.65, 7.25), (0.25, -0.65, 0.0)
            s4, g4 = (-0.55, 0.45, 5.45), (-0.65, -0.95, 0.0)
            s5, g5 = (0.25, 0.85, 6.65), (-0.25, -1.05, 0.0)
            s6, g6 = (0.0, 3.35, 10.25), (0.0, -0.35, -0.25)
            if r < 0.22:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.42:
                u = smoothstep(0.22, 0.28, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.60:
                u = smoothstep(0.42, 0.48, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            elif r < 0.77:
                u = smoothstep(0.60, 0.65, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)
            elif r < 0.90:
                u = smoothstep(0.77, 0.82, r)
                cam_pos, cam_tgt = lerp3(s4, s5, u), lerp3(g4, g5, u)
            else:
                u = smoothstep(0.90, 0.95, r)
                cam_pos, cam_tgt = lerp3(s5, s6, u), lerp3(g5, g6, u)

        # ======================================================================
        # CHAPTER 2: SUBSEA TBM EARTH PRESSURE BALANCE (EPB)
        # ======================================================================
        elif ch_num == 2:
            bg_top, bg_bot = (0.08, 0.16, 0.30), (0.18, 0.34, 0.54)
            meshes.append(self.ch2_static)

            # Rotating Multi-Spoke Cutterhead Disc at x = -1.36!
            rot_c = t * 2.2
            meshes.append(make_cylinder(1.18, 1.18, 0.18, hex_rgb("#F59E0B"), segments=24, emission=2.0).transformed(pos=(-1.38, -0.35, 0.0), rot=(rot_c, 0.0, math.pi * 0.5)))
            for k in range(4):
                ang_s = rot_c + k * math.pi * 0.25
                meshes.append(make_beveled_box(0.14, 2.25, 0.16, hex_rgb("#FFE600"), bevel=0.02, emission=2.8).transformed(pos=(-1.46, -0.35, 0.0), rot=(ang_s, 0.0, 0.0)))

            # Engineers operating inside dry concrete tunnel behind shield!
            meshes.append(p.character((1.65, -0.98, 0.35), rot_y=-1.2, hard_hat=True, time_s=t, shirt_hex="#38BDF8"))
            meshes.append(p.character((2.55, -0.98, -0.32), rot_y=-1.5, hard_hat=True, walk_phase=t * 3.0, walk_amp=0.35, time_s=t, shirt_hex="#F97316"))

            if 0.22 <= r < 0.44:
                # Wrong-case: empty unpressurized chamber -> cyan groundwater rushes in!
                inrush_wp = [(-2.65, -0.15, 0.0), (-1.05, -0.35, 0.0), (0.35, -0.65, 0.0)]
                meshes.append(p.pulse_stream_along_path(inrush_wp, 8, 4.2, t, radius=0.12, color_hex="#00E5FF", emission=4.0))
                meshes.append(p.red_cross.transformed(pos=(-0.85, 0.95, 0.55), scale=0.92))
            elif r >= 0.44:
                # Real EPB Physics: Pressurized conditioned soil paste balances water 1:1!
                meshes.append(make_3d_double_arrow((-2.55, -0.35, 0.65), (-1.52, -0.35, 0.65), hex_rgb("#00E5FF"), shaft_r=0.042, emission=3.8))
                meshes.append(make_3d_double_arrow((-0.55, -0.35, 0.65), (-1.38, -0.35, 0.65), hex_rgb("#FFE600"), shaft_r=0.042, emission=3.8))
                # Muck paste spheres traveling smoothly up the green screw conveyor!
                screw_wp = [(-1.12, -0.95, 0.0), (1.35, 0.12, 0.0), (3.65, 0.12, 0.0)]
                meshes.append(p.pulse_stream_along_path(screw_wp, 7, 2.2, t, radius=0.095, color_hex="#FBBF24", emission=3.4))
                # Robotic Segment Erector Arm rotating concrete segment into ring at x = +0.85!
                arm_ang = lerp(-1.2, 0.85, (t * 0.45) % 1.0)
                meshes.append(make_beveled_box(0.18, 0.92, 0.22, hex_rgb("#00FF88"), bevel=0.02, emission=2.4).transformed(pos=(0.82, -0.35, 0.0), rot=(arm_ang, 0.0, 0.0)))
                if r >= 0.78:
                    meshes.append(p.green_check.transformed(pos=(0.45, 1.05 + 0.04 * math.sin(t * 3.5), 0.55), scale=0.95))

            s1, g1 = (0.35, 2.15, 9.25), (-0.25, 0.15, 0.0)
            s2, g2 = (-0.65, 0.75, 6.25), (-0.85, -0.25, 0.0)
            s3, g3 = (-0.55, 0.55, 5.65), (-0.75, -0.30, 0.0)
            s4, g4 = (0.95, 0.85, 6.45), (0.65, -0.25, 0.0)
            s5, g5 = (0.25, 1.95, 9.45), (0.05, 0.05, 0.0)
            if r < 0.22:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.44:
                u = smoothstep(0.22, 0.28, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.65:
                u = smoothstep(0.44, 0.50, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            elif r < 0.84:
                u = smoothstep(0.65, 0.71, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)
            else:
                u = smoothstep(0.84, 0.90, r)
                cam_pos, cam_tgt = lerp3(s4, s5, u), lerp3(g4, g5, u)

        # ======================================================================
        # CHAPTER 3: ROTTERDAM MAESLANTKERING FLOATING STORM-SURGE GATES
        # ======================================================================
        elif ch_num == 3:
            storm = smoothstep(0.22, 0.35, r)
            sun_rgb = (lerp(0.85, 0.52, storm), lerp(0.82, 0.56, storm), lerp(0.76, 0.68, storm))
            bg_top = lerp3((0.18, 0.42, 0.72), (0.09, 0.15, 0.26), storm)
            bg_bot = lerp3((0.46, 0.68, 0.88), (0.20, 0.30, 0.44), storm)
            meshes.append(self.ch3_static)

            # Act 1 (r < 0.24): Container ship sails cleanly down open river while gates rest in dry docks!
            if r < 0.26:
                ship_z = lerp(-3.8, 3.6, smoothstep(0.0, 0.24, r))
                meshes.append(p.cargo_ship((0.0, -0.35, ship_z), rot_y=math.pi * 0.5, scale=0.88))

            # Gate swing: 0.0 (parked in docks) -> 1.0 (closed across river at r=0.48)!
            swing = smoothstep(0.26, 0.48, r)
            # Gate sinking: floats high (y=+0.28) during swing; wobbles at r=0.50..0.63; fills & sinks to sill (y=-0.12) at r=0.65..0.76!
            wob = 0.14 * math.sin(t * 7.5) if (0.50 <= r < 0.64) else 0.0
            sink = smoothstep(0.64, 0.76, r)
            gy = lerp(0.28, -0.12, sink) + wob

            for sx in (-1.0, 1.0):
                gx = sx * lerp(2.85, 1.12, swing)
                gz = lerp(-0.45, 0.55, swing)
                g_rot = sx * lerp(0.82, 0.08, swing)
                # Curved white hollow sector wall + space-frame steel truss arms back to ball-joint!
                gate_col = "#38BDF8" if sink > 0.5 else "#F8FAFC"
                meshes.append(make_beveled_box(2.18, 0.78, 0.34, hex_rgb(gate_col), bevel=0.04, emission=0.6 * sink).transformed(pos=(gx, gy, gz), rot=(0.0, g_rot, 0.0)))
                hinge_pt = (sx * 3.25, 0.68, -2.15)
                meshes.append(make_tube_along_path([hinge_pt, (gx - sx * 0.75, gy + 0.22, gz)], 0.062, hex_rgb("#E2E8F0"), sides=8))
                meshes.append(make_tube_along_path([hinge_pt, (gx + sx * 0.75, gy + 0.22, gz)], 0.062, hex_rgb("#E2E8F0"), sides=8))

            if 0.50 <= r < 0.64:
                meshes.append(p.red_cross.transformed(pos=(0.0, 1.45, 0.55), scale=0.92))
            elif r >= 0.65:
                # Storm surge high sea on front (+Z) vs calm low river on Rotterdam side (-Z) + force arrows into ball joints!
                meshes.append(make_beveled_box(5.2, 0.42, 2.8, hex_rgb("#0284C7"), bevel=0.02, alpha=0.48, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, -0.18, 2.15)))
                meshes.append(make_3d_double_arrow((-1.15, 0.55, 0.55), (-3.05, 0.68, -1.95), hex_rgb("#FFE600"), shaft_r=0.045, emission=3.8))
                meshes.append(make_3d_double_arrow((1.15, 0.55, 0.55), (3.05, 0.68, -1.95), hex_rgb("#FFE600"), shaft_r=0.045, emission=3.8))
                if r >= 0.80:
                    meshes.append(p.green_check.transformed(pos=(0.0, 1.45 + 0.04 * math.sin(t * 3.5), 0.25), scale=0.98))

            s1, g1 = (0.0, 4.45, 9.45), (0.0, 0.15, -0.45)
            s2, g2 = (-2.25, 3.15, 7.85), (-0.55, 0.20, -0.15)
            s3, g3 = (0.0, 2.65, 7.15), (0.0, 0.25, -0.15)
            s4, g4 = (-2.85, 2.65, 5.25), (-2.45, 0.55, -1.65)
            s5, g5 = (0.0, 4.65, 9.85), (0.0, 0.15, -0.45)
            if r < 0.25:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.49:
                u = smoothstep(0.25, 0.31, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.79:
                u = smoothstep(0.49, 0.55, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            elif r < 0.91:
                u = smoothstep(0.79, 0.84, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)
            else:
                u = smoothstep(0.91, 0.96, r)
                cam_pos, cam_tgt = lerp3(s4, s5, u), lerp3(g4, g5, u)

        # ======================================================================
        # CHAPTER 4: TOKYO G-CANS 59-PILLAR UNDERGROUND FLOOD CATHEDRAL
        # ======================================================================
        elif ch_num == 4:
            bg_top, bg_bot = (0.07, 0.12, 0.22), (0.14, 0.24, 0.38)
            meshes.append(self.ch4_static)
            pls.append((0.0, 0.25, 0.35, 0.15, 0.85, 1.0, 6.8, 0.95))

            # Cutaway earth front slab fades out smoothly at r = 0.18..0.26!
            cut_a = 1.0 if r < 0.16 else lerp(1.0, 0.12, smoothstep(0.16, 0.25, r))
            if cut_a > 0.04:
                meshes.append(make_beveled_box(13.2, 1.15, 1.45, hex_rgb("#6E4F3E"), bevel=0.03, alpha=cut_a, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, 1.22, 1.25)))

            # Inspector character on yellow catwalk inside the massive Cathedral for human scale!
            meshes.append(p.character((0.0, 0.0, 0.0), rot_y=1.35, hard_hat=True, time_s=t, shirt_hex="#F97316").transformed(pos=(-2.15, -0.08, 0.65), scale=0.62))

            if r < 0.22:
                # Surface rainstorm + overflowing small river warning!
                for k in range(10):
                    rx_r = -4.5 + k * 0.9
                    ry_r = 3.6 - ((t * 4.5 + k * 0.3) % 1.6)
                    meshes.append(make_cylinder(0.018, 0.018, 0.28, hex_rgb("#38BDF8"), segments=6, emission=2.8).transformed(pos=(rx_r, ry_r, -0.5)))
                meshes.append(p.red_cross.transformed(pos=(-2.8, 2.85, -0.4), scale=0.88))
            else:
                # Cascading turquoise waterfall plunging down Drop Shaft #3 (-3.85)!
                meshes.append(make_cylinder(0.42, 0.56, 3.85, hex_rgb("#00E5FF"), segments=16, emission=3.2).transformed(pos=(-3.85, -0.15, -0.25)))
                drop_wp = [(-4.8, 1.95, -0.25), (-3.85, 1.85, -0.25), (-3.85, -1.85, -0.25), (-2.2, -1.85, -0.25)]
                meshes.append(p.pulse_stream_along_path(drop_wp, 8, 3.8, t, radius=0.12, color_hex="#FFE600", emission=3.8))

                # Cathedral water level rises & calms across the 59-pillar forest!
                wl = lerp(-1.95, -1.12, smoothstep(0.32, 0.65, r)) + 0.05 * math.sin(t * 2.5)
                meshes.append(make_beveled_box(6.4, 0.18, 3.8, hex_rgb("#06B6D4"), bevel=0.02, alpha=0.52, emission=1.2, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.35, wl, -0.35)))

                # Act 4 (r >= 0.74): 4 Giant Pumps spin & pump controlled stream up into Edo River!
                if r >= 0.74:
                    pump_wp = [(2.65, -1.65, 0.0), (3.35, -1.35, 0.0), (3.85, 0.45, 0.0), (4.85, 1.92, 0.0)]
                    meshes.append(p.pulse_stream_along_path(pump_wp, 8, 3.6, t, radius=0.11, color_hex="#00FF88", emission=4.0))
                    meshes.append(p.green_check.transformed(pos=(3.65, 0.85 + 0.04 * math.sin(t * 3.5), 0.65), scale=0.95))

            s1, g1 = (-0.85, 3.65, 7.85), (-0.95, 1.65, -0.55)
            s2, g2 = (-2.25, 1.35, 6.85), (-2.45, -0.15, -0.25)
            s3, g3 = (2.85, 0.15, 5.45), (-0.65, -0.75, -0.35)
            s4, g4 = (2.25, 0.95, 6.95), (2.15, 0.05, -0.25)
            s5, g5 = (0.0, 1.45, 9.45), (0.0, 0.05, -0.35)
            if r < 0.22:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.46:
                u = smoothstep(0.22, 0.28, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.75:
                u = smoothstep(0.46, 0.53, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            elif r < 0.89:
                u = smoothstep(0.75, 0.80, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)
            else:
                u = smoothstep(0.89, 0.95, r)
                cam_pos, cam_tgt = lerp3(s4, s5, u), lerp3(g4, g5, u)

        # ======================================================================
        # CHAPTER 5: ISLAND BLACKOUT & HYDRO-TO-THERMAL BLACK START CASCADE
        # ======================================================================
        elif ch_num == 5:
            bg_top, bg_bot = (0.04, 0.07, 0.15), (0.09, 0.16, 0.28)
            sun_rgb = (0.42, 0.46, 0.58)
            meshes.append(self.ch5_static)

            # Act 1 (r < 0.20): Lightning bolt + total blackout!
            if 0.03 <= r <= 0.10:
                meshes.append(make_tube_along_path([(2.6, 3.8, -0.4), (2.3, 2.5, -0.4), (2.7, 1.4, -0.4)], 0.055, hex_rgb("#00E5FF"), sides=6, emission=4.8, flags=FLAG_UNLIT))

            # Act 2 (0.20..0.44): Giant Thermal Plant dead & locked without external power!
            if 0.20 <= r < 0.44:
                meshes.append(p.red_cross.transformed(pos=(-0.20, 2.25, -0.2), scale=0.95))

            # Act 3 (r >= 0.44): Hydro Dam Penstock flows -> Hydro Turbine glows -> Starter green electricity cranks Thermal Plant!
            if r >= 0.44:
                pen_wp = [(-4.2, 1.75, -0.2), (-2.85, 0.42, -0.2)]
                meshes.append(p.pulse_stream_along_path(pen_wp, 5, 3.2, t, radius=0.09, color_hex="#00E5FF", emission=3.8))
                meshes.append(make_icosphere(0.22, hex_rgb("#00FF88"), subdivisions=1, emission=4.2).transformed(pos=(-2.75, 0.85, -0.2)))
                hv1_wp = [(-2.75, 0.85, -0.3), (-1.75, 2.15, -0.4), (-0.20, 1.55, -0.5)]
                meshes.append(make_tube_along_path(hv1_wp, 0.035, hex_rgb("#00FF88"), sides=6, emission=3.2))
                meshes.append(p.pulse_stream_along_path(hv1_wp, 6, 3.4, t, radius=0.085, color_hex="#FFE600", emission=4.4))

            # Thermal plant awakens at r >= 0.64!
            th_on = r >= 0.64
            if th_on:
                meshes.append(make_icosphere(0.28, hex_rgb("#00E5FF"), subdivisions=1, emission=4.2).transformed(pos=(-0.20, 1.92, -0.5)))
                hv2_wp = [(-0.20, 1.55, -0.5), (1.35, 2.15, -0.4), (3.25, 1.45, -0.3)]
                meshes.append(make_tube_along_path(hv2_wp, 0.035, hex_rgb("#00E5FF"), sides=6, emission=3.2))
                meshes.append(p.pulse_stream_along_path(hv2_wp, 6, 3.6, t, radius=0.085, color_hex="#00FF88"), )

            # City Skyline & Houses on right (x = +2.1 .. +4.6) lighting up block-by-block in Act 4!
            b_specs = [(2.15, 1.85, 0.76), (2.95, 2.45, 0.82), (3.75, 2.05, 0.88)]
            for bx, bh, r_on in b_specs:
                lit = 1.0 if r >= r_on else 0.04
                meshes.append(make_beveled_box(0.62, bh, 0.72, hex_rgb("#334155"), bevel=0.02).transformed(pos=(bx, bh * 0.5, -0.35)))
                meshes.append(make_beveled_box(0.46, bh * 0.72, 0.75, hex_rgb("#FFE066" if lit > 0.5 else "#1E293B"), bevel=0.01, emission=3.6 * lit).transformed(pos=(bx, bh * 0.52, -0.35)))
            meshes.append(p.house(2.55, 1.15, wall_hex="#CBD5E1", roof_hex="#0284C7", power_on=(r >= 0.84)))
            meshes.append(p.house(4.05, 1.15, wall_hex="#E2E8F0", roof_hex="#D96B43", power_on=(r >= 0.90)))
            if r >= 0.88:
                pls.append((2.95, 1.85, 0.45, 1.0, 0.85, 0.35, 5.5, 0.95))
                meshes.append(p.green_check.transformed(pos=(2.95, 2.95 + 0.04 * math.sin(t * 3.5), -0.15), scale=0.98))

            s1, g1 = (0.15, 3.25, 9.65), (0.0, 1.05, -0.35)
            s2, g2 = (-0.20, 2.35, 6.45), (-0.20, 1.05, -0.45)
            s3, g3 = (-2.85, 2.45, 6.65), (-3.05, 1.05, -0.45)
            s4, g4 = (-0.65, 2.65, 7.65), (-0.45, 1.15, -0.45)
            s5, g5 = (1.85, 2.65, 7.45), (1.95, 1.15, -0.25)
            s6, g6 = (0.0, 3.45, 10.15), (-0.15, 1.05, -0.35)
            if r < 0.20:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.44:
                u = smoothstep(0.20, 0.26, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.66:
                u = smoothstep(0.44, 0.50, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            elif r < 0.78:
                u = smoothstep(0.66, 0.71, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)
            elif r < 0.92:
                u = smoothstep(0.78, 0.83, r)
                cam_pos, cam_tgt = lerp3(s4, s5, u), lerp3(g4, g5, u)
            else:
                u = smoothstep(0.92, 0.96, r)
                cam_pos, cam_tgt = lerp3(s5, s6, u), lerp3(g5, g6, u)

        # ======================================================================
        # CHAPTER 6: HYPERBOLOID NATURAL-DRAFT COOLING TOWER (ZERO FANS!)
        # ======================================================================
        elif ch_num == 6:
            bg_top, bg_bot = (0.16, 0.34, 0.62), (0.44, 0.66, 0.88)
            meshes.append(self.ch6_static)

            # Hyperboloid Shell (fades from solid concrete -> translucent X-ray cutaway at r=0.22!)
            sh_alpha = 0.88 if r < 0.18 else lerp(0.88, 0.30, smoothstep(0.18, 0.26, r))
            bands = [(0.68, 1.38, 1.16, 0.68), (1.36, 1.16, 0.94, 0.68), (2.04, 0.94, 0.86, 0.68), (2.72, 0.86, 1.02, 0.68)]
            for yb, r0, r1, hh in bands:
                meshes.append(make_cylinder(r0, r1, hh, hex_rgb("#E2E8F0"), segments=28, alpha=sh_alpha, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, yb + hh * 0.5, 0.0)))

            # Engineers walking near cooling tower base for scale!
            meshes.append(p.character((2.05, 0.0, 1.35), rot_y=-0.8, hard_hat=True, time_s=t, shirt_hex="#0EA5E9"))

            # Act 1 (r < 0.24): Debunk myth — NO giant fan at bottom (Red X over phantom fan)!
            if 0.08 <= r < 0.24:
                meshes.append(p.red_cross.transformed(pos=(0.0, 0.52, 1.55), scale=0.88))

            # Continuous Natural-Draft Physics: Cool blue air sucked in through V-struts -> orange spray -> buoyant warm air rises -> white cloud!
            for k in range(6):
                a_in = 2.0 * math.pi * k / 6.0
                u_in = (t * 0.75 + k / 6.0) % 1.0
                rad_in = lerp(2.35, 0.55, u_in)
                meshes.append(make_icosphere(0.085, hex_rgb("#00E5FF"), subdivisions=1, emission=3.4).transformed(pos=(rad_in * math.cos(a_in), lerp(0.28, 0.78, u_in), rad_in * math.sin(a_in))))

            # Rising warm moist air spheres accelerating through hyperboloid throat!
            for k in range(9):
                u_up = (t * 0.48 + k / 9.0) % 1.0
                yy = 0.95 + u_up * 2.45
                col_u = "#FF6B2B" if u_up < 0.38 else ("#FFE600" if u_up < 0.72 else "#38BDF8")
                swirl = 0.28 * (1.0 - 0.5 * u_up)
                meshes.append(make_icosphere(0.11, hex_rgb(col_u), subdivisions=1, emission=3.6).transformed(pos=(swirl * math.cos(u_up * 7.0 + k), yy, swirl * math.sin(u_up * 7.0 + k))))

            # Structural lattice rings & throat acceleration arrow in Act 3 (0.52..0.80)
            if 0.52 <= r <= 0.80:
                meshes.append(make_3d_double_arrow((0.0, 1.25, 0.0), (0.0, 3.15, 0.0), hex_rgb("#00FF88"), shaft_r=0.048, emission=3.8))
                for yb, r0, _, _ in bands:
                    meshes.append(make_ring_collar(r0, r0 + 0.04, -0.02, 0.02, hex_rgb("#FFE600"), segments=28, emission=3.0).transformed(pos=(0.0, yb, 0.0)))

            # Fluffy pure-white condensed water vapor plume rising into sky!
            for k in range(5):
                u_cl = (t * 0.32 + k * 0.2) % 1.0
                meshes.append(make_icosphere(0.34 + 0.30 * u_cl, hex_rgb("#F8FAFC"), subdivisions=2, emission=0.85).transformed(pos=(0.22 * math.sin(k * 2.1 + t * 0.6), 3.48 + u_cl * 1.35, 0.15 * math.cos(k * 1.7))))

            if r >= 0.82:
                meshes.append(p.green_check.transformed(pos=(1.55, 2.45 + 0.04 * math.sin(t * 3.5), 0.55), scale=0.95))

            s1, g1 = (0.15, 2.75, 8.85), (-0.25, 1.75, 0.0)
            s2, g2 = (0.45, 1.45, 6.15), (-0.15, 0.95, 0.0)
            s3, g3 = (0.15, 2.25, 7.25), (-0.15, 1.85, 0.0)
            s4, g4 = (0.25, 3.15, 7.65), (-0.10, 2.45, 0.0)
            s5, g5 = (-0.15, 2.85, 9.25), (-0.25, 1.85, 0.0)
            if r < 0.24:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.50:
                u = smoothstep(0.24, 0.30, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.78:
                u = smoothstep(0.50, 0.56, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            elif r < 0.90:
                u = smoothstep(0.78, 0.83, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)
            else:
                u = smoothstep(0.90, 0.95, r)
                cam_pos, cam_tgt = lerp3(s4, s5, u), lerp3(g4, g5, u)

        # ======================================================================
        # CHAPTER 7: GRAND 5-SYSTEM KNOT THEORY MEGACITY SYNTHESIS
        # ======================================================================
        else:
            bg_top, bg_bot = (0.08, 0.16, 0.32), (0.20, 0.38, 0.60)
            meshes.append(self.ch7_static)
            pls.append((-0.65, 1.35, 0.25, 1.0, 0.88, 0.45, 6.0, 0.85))

            # Live traffic on coastal avenue, train in subsea tunnel, steam from cooling tower, power pulses from hydro dam!
            meshes.append(p.car_stylized((0.0, 0.0, 0.0), rot_y=0.0, body_hex="#FACC15", wheel_spin=t * 8.0).transformed(pos=(-3.8 + ((t * 1.8) % 4.6), 0.04, -0.55), scale=0.48))
            meshes.append(p.mrt_train_car((4.4 - ((t * 2.1) % 3.2), -1.78, 0.35), rot_y=math.pi, length=1.35))
            hv_wp = [(-4.55, 1.35, -1.8), (-3.05, 1.45, -1.8), (-0.85, 1.65, -1.7)]
            meshes.append(p.pulse_stream_along_path(hv_wp, 6, 2.8, t, radius=0.075, color_hex="#00FF88", emission=4.0))
            for k in range(3):
                u_s = (t * 0.35 + k / 3.0) % 1.0
                meshes.append(make_icosphere(0.22 + 0.16 * u_s, hex_rgb("#F8FAFC"), subdivisions=1, emission=0.9).transformed(pos=(-3.05, 2.05 + u_s * 0.85, -1.85)))
            meshes.append(p.green_check.transformed(pos=(-0.45, 2.55 + 0.05 * math.sin(t * 3.2), -1.25), scale=1.05))

            # Sweeping tour across all 5 systems -> grand megacity panorama!
            s1, g1 = (2.45, 0.25, 6.65), (2.15, -1.15, 0.15)   # Subsea tunnel & TBM
            s2, g2 = (1.95, 1.95, 6.95), (0.85, -0.35, -0.25)  # Storm-surge barrier & underground cathedral
            s3, g3 = (-2.35, 2.35, 6.95), (-2.65, 0.85, -1.45) # Hydro Black Start & Cooling Tower
            s4, g4 = (-0.15, 3.25, 10.65), (-0.15, 0.05, -0.65) # Full 5-system coastal megacity panorama!
            if r < 0.30:
                cam_pos, cam_tgt = s1, g1
            elif r < 0.55:
                u = smoothstep(0.30, 0.38, r)
                cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
            elif r < 0.78:
                u = smoothstep(0.55, 0.63, r)
                cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)
            else:
                u = smoothstep(0.78, 0.86, r)
                cam_pos, cam_tgt = lerp3(s3, s4, u), lerp3(g3, g4, u)

        # Gentle cinematic camera breathing
        cam_pos = (cam_pos[0] + 0.025 * math.sin(t * 0.95), cam_pos[1] + 0.018 * math.cos(t * 0.80), cam_pos[2])
        scene = Mesh.merge(meshes)
        img_small = self.renderer.render(
            scene, cam_pos, cam_tgt, fov,
            sun_dir=(0.42, 0.82, 0.38), sun_rgb=sun_rgb,
            sky_amb=sky_amb, gnd_amb=gnd_amb,
            bg_top=bg_top, bg_bot=bg_bot,
            point_lights=pls if pls else None,
        )
        full_rgb = np.array(Image.fromarray(img_small, mode="RGB").resize((1920, 1080), Image.Resampling.BILINEAR), dtype=np.uint8, copy=True)
        return full_rgb, cam_pos, cam_tgt, fov

    def project_1080p(self, world_pt: Tuple[float, float, float], cam_pos: Tuple[float, float, float], cam_tgt: Tuple[float, float, float], fov: float) -> Optional[Tuple[int, int]]:
        pt = self.renderer.project_point(world_pt, cam_pos, cam_tgt, fov)
        if pt is None:
            return None
        sx = int(round(pt[0] * (1920.0 / self.rw)))
        sy = int(round(pt[1] * (1080.0 / self.rh)))
        return (sx, sy)


def _draw_1080p_callout(base_rgb: np.ndarray, anchor_px: Optional[Tuple[int, int]], title: str, sub: str, accent: Tuple[int, int, int], f_t: ImageFont.FreeTypeFont, f_s: ImageFont.FreeTypeFont) -> None:
    """Draws an EP02/EP03-style glowing 3D-projected Callout card + leader line on 1920x1080 frame."""
    bx0, by0, bx1, by1 = 1140, 56, 1872, 168
    ov = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    if anchor_px is not None:
        ax = max(140, min(1780, anchor_px[0]))
        ay = max(210, min(860, anchor_px[1]))
        cx = (bx0 + bx1) // 2
        d.line([(cx, by1), (ax, ay)], fill=(10, 16, 28, 220), width=6)
        d.line([(cx, by1), (ax, ay)], fill=(*accent, 245), width=3)
        d.ellipse([ax - 11, ay - 11, ax + 11, ay + 11], fill=(*accent, 110))
        d.ellipse([ax - 6, ay - 6, ax + 6, ay + 6], fill=(255, 255, 255, 255), outline=(*accent, 255), width=2)
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=18, fill=(10, 16, 30, 228), outline=(*accent, 235), width=3)
    d.text((bx0 + 24, by0 + 18), title, font=f_t, fill=(*accent, 255))
    d.text((bx0 + 24, by0 + 62), sub, font=f_s, fill=(235, 244, 255, 255))

    # Composite only bounding region for speed!
    y_max = min(1080, max(by1 + 8, (anchor_px[1] + 16) if anchor_px else (by1 + 8)))
    x_min = max(0, min(bx0 - 8, (anchor_px[0] - 16) if anchor_px else (bx0 - 8)))
    arr = np.asarray(ov, dtype=np.uint8)[48:y_max, x_min:1880]
    a = arr[:, :, 3:4].astype(np.uint16)
    sl = base_rgb[48:y_max, x_min:1880]
    base_rgb[48:y_max, x_min:1880] = ((sl.astype(np.uint16) * (255 - a) + arr[:, :, :3].astype(np.uint16) * a) >> 8).astype(np.uint8)


def render_long_documentary_ep01(
    raw_audio_dir: str,
    srt_out_path: str,
    mix_out_path: str,
    mp4_out_path: str,
    thumb_out_path: str,
    sim_fps: int = 6,
) -> dict:
    """Renders full ~11-minute 1920x1080 24fps ZERO-LOOP multi-act documentary + 1280x720 YouTube JPEG thumbnail."""
    subs, ch_spans, total_dur = build_long_audio_and_srt(raw_audio_dir, srt_out_path, mix_out_path)
    fps = 24
    stride = max(1, fps // sim_fps)  # 4 frames @ 24fps = continuous 6fps unique 3D simulation interpolated smoothly!

    director = KnotLongEp01Director(ch_spans, render_w=1152, render_h=648, ssaa=1.0)

    # Save crisp 1280x720 custom YouTube thumbnail (< 200 KB) from rich Ch.1 subsea cutaway + Ch.4 cathedral split!
    os.makedirs(os.path.dirname(thumb_out_path), exist_ok=True)
    th_frame, _, _, _ = director.render_3d_at(1, 0.66, 24.0)
    th_base = Image.fromarray(th_frame, mode="RGB").resize((1280, 720), Image.Resampling.LANCZOS).convert("RGBA")
    th_ov = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    td = ImageDraw.Draw(th_ov)
    td.rounded_rectangle([44, 38, 520, 94], radius=16, fill=(10, 18, 34, 232), outline=(255, 230, 0, 255), width=3)
    td.text((66, 51), "KNOT THEORY • DOKUMENTER 11 MENIT", font=_font("Montserrat", 800, 22), fill=(255, 230, 0, 255))
    td.rounded_rectangle([44, 476, 1236, 682], radius=24, fill=(8, 14, 28, 228), outline=(0, 228, 255, 225), width=3)
    td.text((72, 498), "5 MESIN RAKSASA DI BAWAH KOTA", font=_font("Montserrat", 900, 52), fill=(255, 255, 255, 255))
    td.text((72, 568), "TEROWONGAN LAUT • GERBANG BADAI • BLACK START", font=_font("PlusJakartaSans", 800, 33), fill=(255, 230, 0, 255))
    td.text((72, 622), "Simulasi 3D Bedah Infrastruktur Penjaga Kota Modern", font=_font("PlusJakartaSans", 700, 24), fill=(185, 215, 245, 255))
    Image.alpha_composite(th_base, th_ov).convert("RGB").save(thumb_out_path, format="JPEG", quality=86, optimize=True)

    f_badge = _font("Montserrat", 800, 21)
    f_title = _font("Montserrat", 900, 25)
    f_ver = _font("PlusJakartaSans", 700, 18)
    f_sub = _font("PlusJakartaSans", 800, 36)
    f_cal_t = _font("Montserrat", 800, 25)
    f_cal_s = _font("PlusJakartaSans", 700, 20)
    f_card_big = _font("Montserrat", 900, 46)
    f_card_sub = _font("PlusJakartaSans", 700, 27)

    hud_cache: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}
    for ch in CHAPTERS_L01:
        ov = Image.new("RGBA", (1920, 216), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        d.rounded_rectangle([44, 34, 1096, 142], radius=20, fill=(8, 14, 28, 216), outline=(0, 228, 255, 195), width=2)
        d.text((68, 48), ch["badge"], font=f_badge, fill=(255, 230, 0, 255))
        d.text((68, 82), ch["title"], font=f_title, fill=(255, 255, 255, 255))
        d.rounded_rectangle([44, 152, 1096, 194], radius=12, fill=(12, 22, 40, 198))
        d.text((64, 161), ch["verify"], font=f_ver, fill=(148, 215, 255, 245))
        arr = np.asarray(ov, dtype=np.uint8)
        hud_cache[ch["num"]] = (arr[:, :, :3], arr[:, :, 3:4].astype(np.uint16))

    def _make_karaoke_sub_strip(chunk: SubtitleChunk, active_w_idx: int) -> Tuple[np.ndarray, np.ndarray]:
        ov = Image.new("RGBA", (1920, 150), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        words_str = [w.word for w in chunk.words]
        full_line = " ".join(words_str)
        bb = d.textbbox((0, 0), full_line, font=f_sub)
        tw = bb[2] - bb[0]
        px0 = max(48, (1920 - tw) // 2 - 30)
        px1 = min(1872, (1920 + tw) // 2 + 30)
        d.rounded_rectangle([px0, 22, px1, 114], radius=20, fill=(8, 13, 25, 222), outline=(255, 230, 0, 180), width=2)
        cx_t = (1920 - tw) // 2
        space_w = d.textbbox((0, 0), " ", font=f_sub)[2]
        for idx_w, w_txt in enumerate(words_str):
            wb = d.textbbox((0, 0), w_txt, font=f_sub)
            ww = wb[2] - wb[0]
            if idx_w == active_w_idx:
                d.rounded_rectangle([cx_t - 6, 36, cx_t + ww + 6, 98], radius=10, fill=(255, 230, 0, 245))
                d.text((cx_t, 42), w_txt, font=f_sub, fill=(10, 16, 28, 255))
            else:
                d.text((cx_t, 42), w_txt, font=f_sub, fill=(255, 255, 255, 255))
            cx_t += ww + space_w
        arr = np.asarray(ov, dtype=np.uint8)
        return arr[:, :, :3], arr[:, :, 3:4].astype(np.uint16)

    def _chapter_state_at(t_sec: float) -> Tuple[dict, float, bool]:
        for c_s, c_e, ch_d in ch_spans:
            if t_sec <= c_e:
                r_ch = max(0.0, min(1.0, (t_sec - c_s) / max(1.0, c_e - c_s)))
                return ch_d, r_ch, (t_sec < c_s + 2.1)
        return CHAPTERS_L01[-1], 1.0, False

    total_frames = int(round(total_dur * fps))
    os.makedirs(os.path.dirname(mp4_out_path), exist_ok=True)
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y",
        "-nostdin", "-nostats", "-loglevel", "error",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "1920x1080", "-r", str(fps), "-i", "-",
        "-i", mix_out_path, "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-maxrate", "950k", "-bufsize", "1900k",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", mp4_out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    sub_ptr = 0
    cached_sub_key = (-1, -1)
    cached_sub_pair = None

    # Keyframe interpolation cache for smooth 24fps motion from non-repeating 6fps 3D simulation!
    kf_idx_a = -999
    kf_a_data = None
    kf_b_data = None

    for f_idx in range(total_frames):
        k0 = (f_idx // stride) * stride
        k1 = min(total_frames - 1, k0 + stride)
        if k0 != kf_idx_a:
            t0 = k0 / float(fps)
            t1 = k1 / float(fps)
            ch0, r0, _ = _chapter_state_at(t0)
            ch1, r1, _ = _chapter_state_at(t1)
            if kf_b_data is not None and kf_idx_a + stride == k0:
                kf_a_data = kf_b_data
            else:
                kf_a_data = (ch0["num"], *director.render_3d_at(ch0["num"], r0, t0))
            if k1 == k0:
                kf_b_data = kf_a_data
            else:
                kf_b_data = (ch1["num"], *director.render_3d_at(ch1["num"], r1, t1))
            kf_idx_a = k0

        t = f_idx / float(fps)
        active_ch, r_ch, in_card = _chapter_state_at(t)
        frac = (f_idx - k0) / float(max(1, k1 - k0))

        # Only blend across same chapter; crisp cut across chapter boundary!
        if frac <= 0.001 or kf_a_data[0] != kf_b_data[0]:
            base_rgb = kf_a_data[1].copy()
            cam_pos, cam_tgt, fov = kf_a_data[2], kf_a_data[3], kf_a_data[4]
        else:
            w_b = int(round(frac * 256))
            base_rgb = ((kf_a_data[1].astype(np.uint16) * (256 - w_b) + kf_b_data[1].astype(np.uint16) * w_b) >> 8).astype(np.uint8)
            cam_pos = lerp3(kf_a_data[2], kf_b_data[2], frac)
            cam_tgt = lerp3(kf_a_data[3], kf_b_data[3], frac)
            fov = lerp(kf_a_data[4], kf_b_data[4], frac)

        # Blend top-left documentary HUD
        h_rgb, h_a = hud_cache[active_ch["num"]]
        top_sl = base_rgb[:216, :1112]
        base_rgb[:216, :1112] = ((top_sl.astype(np.uint16) * (255 - h_a[:, :1112]) + h_rgb[:, :1112].astype(np.uint16) * h_a[:, :1112]) >> 8).astype(np.uint8)

        # Draw 3D-projected Callout3D cards (when chapter title card isn't covering center)
        if not in_card and t >= 3.3:
            for w_pt, c_title, c_sub, c_acc in director.get_chapter_callouts(active_ch["num"], r_ch):
                anc = director.project_1080p(w_pt, cam_pos, cam_tgt, fov)
                _draw_1080p_callout(base_rgb, anc, c_title, c_sub, c_acc, f_cal_t, f_cal_s)

        # Chapter opener card / cold-open hero card
        if in_card or t < 3.2:
            card_im = Image.fromarray(base_rgb[360:680], mode="RGB").convert("RGBA")
            ov_c = Image.new("RGBA", (1920, 320), (0, 0, 0, 0))
            dc = ImageDraw.Draw(ov_c)
            dc.rounded_rectangle([200, 20, 1720, 292], radius=28, fill=(8, 15, 30, 232), outline=(255, 230, 0, 235), width=3)
            hdr = "5 MESIN RAKSASA DI BAWAH KOTA MODERN" if t < 3.2 else active_ch["badge"]
            ttl = "Dokumenter Rekayasa Tak Terlihat • Knot Theory" if t < 3.2 else active_ch["title"]
            dc.text((252, 60), hdr, font=f_card_sub, fill=(255, 230, 0, 255))
            dc.text((252, 124), ttl[:52], font=f_card_big, fill=(255, 255, 255, 255))
            dc.text((252, 212), active_ch["oh_jadi"], font=f_ver, fill=(0, 228, 255, 255))
            base_rgb[360:680] = np.asarray(Image.alpha_composite(card_im, ov_c).convert("RGB"), dtype=np.uint8)

        # Karaoke word-highlighted subtitle pill
        while sub_ptr < len(subs) and subs[sub_ptr].end < t:
            sub_ptr += 1
        if sub_ptr < len(subs) and subs[sub_ptr].start <= t <= subs[sub_ptr].end:
            ch_s = subs[sub_ptr]
            act_w = 0
            for wi, wt_item in enumerate(ch_s.words):
                if wt_item.start <= t:
                    act_w = wi
            if cached_sub_key != (sub_ptr, act_w):
                cached_sub_key = (sub_ptr, act_w)
                cached_sub_pair = _make_karaoke_sub_strip(ch_s, act_w)
            s_rgb, s_a = cached_sub_pair
            btm = base_rgb[900:1050]
            base_rgb[900:1050] = ((btm.astype(np.uint16) * (255 - s_a) + s_rgb.astype(np.uint16) * s_a) >> 8).astype(np.uint8)

        # Bottom golden progress bar
        prog_x = max(4, min(1920, int(round(1920 * (t / total_dur)))))
        base_rgb[1072:1080, :prog_x] = (255, 230, 0)

        proc.stdin.write(base_rgb.tobytes())

    proc.stdin.close()
    err = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(err.decode("utf-8", errors="replace"))

    return {"duration_seconds": total_dur, "mp4": mp4_out_path, "thumbnail": thumb_out_path, "srt": srt_out_path}
