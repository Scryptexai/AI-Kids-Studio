"""
Knot Theory V3 — Unified 3D Stylized Cutaway & Simulation Shorts Engine (KT-S01 .. KT-S06)
Implements the top 6 selected Shorts from Knot_Theory_V3_Ide_Terkuat.pdf (Pages 3–5):
  - KT-S01: Piston Effect Terowongan MRT (Hidden Infrastructure)
  - KT-S02: Sprinkler Ampul Kaca vs Mitos Film (Safety Engineering)
  - KT-S03: Kerikil Gardu Listrik & Tegangan Langkah (Hidden Infrastructure)
  - KT-S04: Sabuk Pengaman Sengaja Mengalah / Load Limiter (Safety Engineering)
  - KT-S05: Segel Air P-Trap & Pipa Vent Toilet (Hidden Infrastructure)
  - KT-S06: Batang Setir Mobil Collapsible Memendek (Safety Engineering)
"""

import math
import os
import wave
from typing import Dict, List, Sequence, Tuple

import numpy as np
from scipy import signal

from src.assets_ep02 import make_3d_double_arrow, make_ring_collar
from src.audio_pipeline import (
    SAMPLE_RATE,
    _add_clip,
    _env_adsr,
    _sfx_buzzer_wrong,
    _sfx_chime,
    _sfx_whoosh,
    _syllable_weight,
)
from src.overlays import Callout3D, OverlayCompositor, SubtitleChunk, WordTiming, smoothstep
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


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp3(a: Tuple[float, float, float], b: Tuple[float, float, float], t: float) -> Tuple[float, float, float]:
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


# ==============================================================================
# EPISODE SPECIFICATIONS (Matches exact recorded voice-00 narrations + PDF V3)
# ==============================================================================

SHORTS_SPECS: Dict[str, dict] = {
    "KT-S01": {
        "pdf_id": "01 (asli 25)",
        "category": "HIDDEN INFRASTRUCTURE",
        "hook_sub": "ANGIN PERON STASIUN BAWAH TANAH",
        "hook_main": "TIBA DULUAN DARI KERETA!",
        "seg_names": {
            1: "KT.01 • ANGIN SEBELUM KERETA",
            2: "02 • EFEK PISTON TEROWONGAN",
            3: "03 • SHAFT PELEPAS TEKANAN",
            4: "04 • OH, JADI BEGITU!",
        },
        "cta_q1": "Pernah ngerasain angin kencang",
        "cta_q2": "di peron MRT sebelum keretanya datang?",
        "cta_left": "SERING BANGET",
        "cta_right": "BARU NGEH!",
        "sentences": [
            "Angin kencang di peron stasiun bawah tanah ini selalu datang sebelum lampu keretanya terlihat.",
            "Banyak yang mengira itu hembusan pendingin stasiun.",
            "Padahal bodi kereta hampir memenuhi seluruh penampang terowongan sempit.",
            "Saat melaju, kereta bekerja seperti piston di dalam tabung suntik: udara di depannya terdorong maju sepanjang terowongan, sementara udara di belakangnya tersedot masuk.",
            "Sebagian dilepas lewat cerobong ventilasi ke jalan, sisanya keluar duluan menyapu peron.",
            "Hembusan di stasiun memang ikut dipengaruhi kipas ventilasi mekanis dan bentuk ruangnya.",
            "Oh, jadi kereta mendorong udara seperti piston raksasa, makanya anginnya tiba sebelum keretanya muncul.",
        ],
    },
    "KT-S02": {
        "pdf_id": "02 (asli 08)",
        "category": "SAFETY ENGINEERING",
        "hook_sub": "ADEGAN FILM VS DUNIA NYATA",
        "hook_main": "TAK MENYEMBUR SERENTAK!",
        "seg_names": {
            1: "KT.02 • MITOS SPRINKLER FILM",
            2: "02 • SEGEL AMPUL KACA PANAS",
            3: "03 • PECAH SATU TITIK SAJA",
            4: "04 • OH, JADI BEGITU!",
        },
        "cta_q1": "Dulu kamu kira semua sprinkler",
        "cta_q2": "gedung nyala barengan kayak di film?",
        "cta_left": "IYA KIRA GITU",
        "cta_right": "UDAH TAU",
        "sentences": [
            "Di film aksi, begitu satu korek menyala, semua sprinkler di gedung langsung menyembur bersamaan.",
            "Aslinya, hal itu hampir tidak pernah terjadi.",
            "Pada sprinkler otomatis standar, tiap kepala di plafon bekerja mandiri karena disegel ampul kaca kecil berisi cairan peka panas.",
            "Asap tebal saja tidak memicunya.",
            "Hanya kepala tepat di dekat titik api yang cairannya memuai karena panas, memecahkan ampul kaca, lalu membuka katup air di satu titik itu saja.",
            "Pengecualiannya hanya sistem khusus tipe deluge berlubang terbuka di area berisiko tinggi.",
            "Oh, jadi tiap kepala sprinkler punya sensor panas sendiri, sehingga hanya yang kepanasan yang menyala tanpa membanjiri gedung.",
        ],
    },
    "KT-S03": {
        "pdf_id": "03 (asli 11)",
        "category": "HIDDEN INFRASTRUCTURE",
        "hook_sub": "HAMPARAN BATU DI GARDU LISTRIK",
        "hook_main": "KERIKIL INI BUKAN HIASAN!",
        "seg_names": {
            1: "KT.03 • KERIKIL GARDU LISTRIK",
            2: "02 • GRADIEN TEGANGAN TANAH",
            3: "03 • TEGANGAN LANGKAH DUA KAKI",
            4: "04 • OH, JADI BEGITU!",
        },
        "cta_q1": "Sering lihat hamparan kerikil",
        "cta_q2": "abu-abu di dalam pagar gardu PLN?",
        "cta_left": "SERING LIHAT",
        "cta_right": "BARU SADAR",
        "sentences": [
            "Hamparan batu kerikil di halaman gardu listrik ini bukan dipasang untuk hiasan taman.",
            "Saat terjadi gangguan arus besar yang bocor ke tanah di dalam gardu, arus menyebar di permukaan bumi dan membentuk gradien tegangan dari pusat gangguan ke arah luar.",
            "Kalau seseorang melangkah di atas tanah basah biasa, selisih tegangan di antara dua kakinya bisa mendorong arus berbahaya lewat tubuh.",
            "Lapisan batu pecah yang resistif bekerja sebagai penyekat di bawah sepatu, sekaligus melancarkan resapan air hujan dan menahan gulma.",
            "Kerikil ini hanya salah satu lapis pengaman pembumian, jadi area gardu tetap terlarang dimasuki warga umum.",
            "Oh, jadi lapisan kerikil itu memperkecil tegangan di antara dua kaki saat ada gangguan listrik ke tanah.",
        ],
    },
    "KT-S04": {
        "pdf_id": "04 (asli 16)",
        "category": "SAFETY ENGINEERING",
        "hook_sub": "RAHASIA KESELAMATAN TABRAKAN",
        "hook_main": "SABUK SENGAJA MENGALAH!",
        "seg_names": {
            1: "KT.04 • SABUK SENGAJA MENGALAH",
            2: "02 • TAHAP 1: PRETENSIONER",
            3: "03 • TAHAP 2: TORSION BAR",
            4: "04 • OH, JADI BEGITU!",
        },
        "cta_q1": "Baru tahu kalau sabuk mobil",
        "cta_q2": "punya batang puntir pelepas beban?",
        "cta_left": "BARU TAHU!",
        "cta_right": "SUDAH PAHAM",
        "sentences": [
            "Sabuk pengaman mobil modern justru sengaja dirancang mengalah sedikit saat tabrakan keras.",
            "Kedengarannya keliru, padahal mekanismenya bekerja dalam dua tahap cepat.",
            "Di awal benturan, penarik awal atau pretensioner mengencangkan sabuk agar tubuh menempel rapat ke kursi dan pengunci menahan beban.",
            "Namun bila sabuk menahan kaku sepenuhnya, gaya puncak pada tulang dada bisa terlalu tinggi.",
            "Karena itu batang puntir atau load limiter di dalam gulungan sengaja terpuntir terukur, melepaskan sedikit sabuk sambil menyerap energi bersama kantung udara.",
            "Tidak semua mobil memiliki kedua fitur ini, jadi sabuk wajib selalu dipakai dengan benar tanpa modifikasi.",
            "Oh, jadi sabuk yang melepas sedikit itu disengaja untuk menurunkan gaya puncak ke dada.",
        ],
    },
    "KT-S05": {
        "pdf_id": "05 (asli 07+27)",
        "category": "HIDDEN INFRASTRUCTURE",
        "hook_sub": "KAMAR TAMU LAMA KOSONG JADI BAU?",
        "hook_main": "BUKAN PIPANYA YANG RUSAK!",
        "seg_names": {
            1: "KT.05 • MISTERI BAU SALURAN",
            2: "02 • SEGEL AIR LEHER ANGSA",
            3: "03 • PIPA NAPAS KE ATAP",
            4: "04 • OH, JADI BEGITU!",
        },
        "cta_q1": "Pernah ngalamin kamar mandi",
        "cta_q2": "yang jarang dipakai tiba-tiba bau?",
        "cta_left": "PERNAH BANGET",
        "cta_right": "JADI PAHAM!",
        "sentences": [
            "Toilet kamar tamu tiba-tiba bau selokan setelah lama kosong? Sering kali bukan pipanya yang rusak.",
            "Di bawah kloset dan saluran buang ada lekukan pipa leher angsa atau P-trap yang menyimpan genangan air kecil.",
            "Genangan inilah segel rapat penahan gas dari pipa limbah.",
            "Bila lama tak dipakai, air segel menguap dan jalurnya terbuka.",
            "Selain itu ada pipa ventilasi ke atap yang memasok udara agar aliran deras tidak menyedot segel air keluar akibat tekanan hisap.",
            "Bau juga bisa dari kebocoran atau sumbatan, namun menyiram air berkala menjaga segel terisi.",
            "Oh, jadi bau muncul karena air di leher angsa menguap, dan pipa atap menjaga segel itu tetap ada.",
        ],
    },
    "KT-S06": {
        "pdf_id": "06 (asli 28)",
        "category": "SAFETY ENGINEERING",
        "hook_sub": "DESAIN KOLOM KEMUDI MODERN",
        "hook_main": "SETIR SENGAJA MEMENDEK!",
        "seg_names": {
            1: "KT.06 • SETIR BISA MEMENDEK",
            2: "02 • BAHAYA POROS BESI KAKU",
            3: "03 • KOLOM TELESKOPIK LIPAT",
            4: "04 • OH, JADI BEGITU!",
        },
        "cta_q1": "Sangka nggak kalau batang setir",
        "cta_q2": "dirancang amblas terukur saat tabrakan?",
        "cta_left": "NGGAK SANGKA",
        "cta_right": "KEREN TEKNIKNYA",
        "sentences": [
            "Batang setir mobil sengaja dirancang supaya bisa memendek saat tabrakan depan.",
            "Pada konstruksi poros besi kaku zaman dulu, benturan keras di depan mobil berisiko mendorong batang kemudi mundur ke arah pengemudi, sementara tubuh pengemudi melaju ke depan.",
            "Untuk meredamnya, kolom kemudi modern dibuat bertingkat dengan tabung teleskopik, kisi baja lipat, atau pin geser yang sengaja menyusut terkendali saat menyerap energi tumbukan.",
            "Sistem ini bekerja bersama sabuk pengaman dan kantung udara, serta desainnya bervariasi menurut model mobil.",
            "Oh, jadi kolom setir sengaja menyusut untuk menyerap energi supaya tidak terdorong kaku ke dada.",
        ],
    },
}


def align_subtitles_and_mix_short(
    ep_code: str,
    vo_wav_path: str,
    srt_out_path: str,
    mix_out_path: str,
) -> Tuple[List[SubtitleChunk], float]:
    """Aligns sentences to silence pauses in vo_wav_path, writes .srt, and builds stereo Foley+BGM+VO mix."""
    spec = SHORTS_SPECS[ep_code]
    with wave.open(vo_wav_path, "rb") as wf:
        sr = wf.getframerate()
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

    # Trim leading/trailing dead air > 0.15s, then place VO starting cleanly at t=0.20s
    act = np.where(np.abs(pcm) > 0.012)[0]
    if len(act) > 100:
        lead = max(0, int(act[0]) - int(0.08 * sr))
        tail = min(len(pcm), int(act[-1]) + int(0.12 * sr))
        pcm = pcm[lead:tail]

    vo_start_s = 0.20
    vo_dur_s = len(pcm) / sr
    total_dur = round(vo_start_s + vo_dur_s + 2.10, 2)

    # Detect natural sentence pauses for accurate subtitle alignment
    win = int(0.035 * sr)
    rms = np.sqrt(np.convolve(pcm ** 2, np.ones(win, dtype=np.float32) / win, mode="same"))
    is_sil = rms < 0.008
    pauses: List[Tuple[float, float]] = []
    cur = None
    for idx, val in enumerate(is_sil):
        if val and cur is None:
            cur = idx
        elif not val and cur is not None:
            d = (idx - cur) / sr
            if d >= 0.22:
                pauses.append(((cur + idx) / (2.0 * sr), d))
            cur = None

    sents = spec["sentences"]
    tot_chars = sum(len(s) for s in sents)
    bounds = [0.0]
    cum_c = 0
    for s in sents[:-1]:
        cum_c += len(s)
        exp_t = vo_dur_s * (cum_c / tot_chars)
        cands = [p for p in pauses if abs(p[0] - exp_t) <= 3.2 and p[0] > bounds[-1] + 1.2]
        if cands:
            best = min(cands, key=lambda p: abs(p[0] - exp_t) - 0.5 * p[1])
            bounds.append(best[0])
        else:
            bounds.append(max(bounds[-1] + 1.0, exp_t))
    bounds.append(vo_dur_s)

    all_words: List[WordTiming] = []
    for s_idx, sent in enumerate(sents):
        t0, t1 = bounds[s_idx], bounds[s_idx + 1]
        i0, i1 = max(0, int(t0 * sr)), min(len(pcm), int(t1 * sr))
        sl = np.abs(pcm[i0:i1])
        if len(sl) > 300:
            a_idx = np.where(sl > 0.014)[0]
            if len(a_idx) > 10:
                t0 = (i0 + int(a_idx[0])) / sr
                t1 = (i0 + int(a_idx[-1])) / sr
        words = sent.split()
        weights = np.array([_syllable_weight(w) for w in words], dtype=np.float64)
        weights /= np.sum(weights)
        dur = max(0.25, t1 - t0)
        cur_t = vo_start_s + t0
        for w_str, frac in zip(words, weights):
            wd = dur * float(frac)
            all_words.append(WordTiming(word=w_str, start=cur_t, end=cur_t + wd))
            cur_t += wd

    chunks: List[SubtitleChunk] = []
    buf: List[WordTiming] = []
    for idx, wt in enumerate(all_words):
        buf.append(wt)
        has_punct = wt.word.endswith((".", "?", ",", ":"))
        next_gap = (all_words[idx + 1].start - wt.end) if (idx + 1 < len(all_words)) else 1.0
        if len(buf) >= 5 or sum(len(x.word) for x in buf) >= 28 or (has_punct and len(buf) >= 2) or next_gap > 0.22:
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
        for i, ch in enumerate(chunks, 1):
            f.write(f"{i}\n{fmt_srt(ch.start)} --> {fmt_srt(ch.end)}\n{' '.join(w.word for w in ch.words)}\n\n")

    # Build stereo master mix (44.1 kHz)
    total_samples = int(round(total_dur * SAMPLE_RATE))
    vo_track = np.zeros(total_samples, dtype=np.float32)
    b_hp, a_hp = signal.butter(2, 80.0 / (SAMPLE_RATE * 0.5), btype="high")
    pcm_hp = signal.lfilter(b_hp, a_hp, pcm).astype(np.float32)
    rms_vo = float(np.sqrt(np.mean(pcm_hp[np.abs(pcm_hp) > 0.015] ** 2)))
    if rms_vo > 1e-4:
        pcm_hp = pcm_hp * (0.22 / rms_vo)
    s_i0 = int(round(vo_start_s * SAMPLE_RATE))
    n_copy = min(len(pcm_hp), total_samples - s_i0)
    vo_track[s_i0 : s_i0 + n_copy] = pcm_hp[:n_copy]

    env_win = int(0.06 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.7 * vo_abs, 0.34, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
    # Subtle inquisitive marimba/synth pulse bed
    step_s = 60.0 / 122.0 / 2.0
    notes_hz = [293.66, 369.99, 440.00, 587.33, 554.37, 440.00, 369.99, 440.00]
    n_note = int(0.20 * SAMPLE_RATE)
    t_n = np.arange(n_note, dtype=np.float32) / SAMPLE_RATE
    t_cur, idx = 0.0, 0
    while t_cur < total_dur - 0.25:
        f_hz = notes_hz[idx % len(notes_hz)]
        pluck = (np.sin(2 * np.pi * f_hz * t_n) + 0.22 * np.sin(3 * np.pi * f_hz * t_n)) * np.exp(-t_n * 17.5)
        _add_clip(sfx_mix, pluck.astype(np.float32) * 0.044, t_cur, pan=0.16 * math.sin(idx * 0.8))
        t_cur += step_s
        idx += 1

    sfx_mix *= duck_gain[:, None]


    # Multi-Act Foley Accents Synced to KnotShortDirectorV2 Choreography!
    _add_clip(sfx_mix, _sfx_whoosh(0.55, 180, 1450, vol=0.14), 0.25)
    _add_clip(sfx_mix, _sfx_whoosh(0.52, 220, 1280, vol=0.13), total_dur * 0.18)
    _add_clip(sfx_mix, _sfx_chime([587.33, 880.0], dur=0.35, vol=0.12), total_dur * 0.36)
    _add_clip(sfx_mix, _sfx_whoosh(0.48, 260, 1380, vol=0.12), total_dur * 0.56)

    # Episode-specific physics SFX
    t_imp = np.arange(int(0.32 * SAMPLE_RATE), dtype=np.float32) / SAMPLE_RATE
    thud = (np.sin(2 * np.pi * 68.0 * t_imp) * np.exp(-t_imp * 18.0) + 0.35 * np.random.default_rng(7).normal(0, 1, len(t_imp)) * np.exp(-t_imp * 28.0)).astype(np.float32)

    if ep_code == "KT-S01":
        _add_clip(sfx_mix, _sfx_whoosh(0.95, 110, 680, vol=0.15), total_dur * 0.10)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.34, vol=0.11), total_dur * 0.61)
        _add_clip(sfx_mix, _sfx_whoosh(0.75, 240, 1200, vol=0.14), total_dur * 0.73)
    elif ep_code == "KT-S02":
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.38, vol=0.12), total_dur * 0.08)
        pop = (np.sin(2 * np.pi * 1650.0 * t_imp) * np.exp(-t_imp * 45.0)).astype(np.float32)
        _add_clip(sfx_mix, pop * 0.16, total_dur * 0.56)
        _add_clip(sfx_mix, _sfx_whoosh(0.85, 600, 1900, vol=0.12), total_dur * 0.57)
    elif ep_code == "KT-S03":
        _add_clip(sfx_mix, _sfx_whoosh(0.55, 420, 1650, vol=0.13), total_dur * 0.19)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.38, vol=0.13), total_dur * 0.50)
    elif ep_code == "KT-S04":
        _add_clip(sfx_mix, thud * 0.18, total_dur * 0.14)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.35, vol=0.12), total_dur * 0.38)
    elif ep_code == "KT-S05":
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.35, vol=0.11), total_dur * 0.36)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.35, vol=0.11), total_dur * 0.51)
        _add_clip(sfx_mix, _sfx_whoosh(0.65, 320, 980, vol=0.12), total_dur * 0.65)
    elif ep_code == "KT-S06":
        _add_clip(sfx_mix, thud * 0.18, total_dur * 0.25)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.36, vol=0.12), total_dur * 0.27)
        _add_clip(sfx_mix, thud * 0.16, total_dur * 0.47)
    elif ep_code in ("KT-S07", "KT-S09", "KT-S11", "KT-S13"):
        _add_clip(sfx_mix, _sfx_whoosh(0.85, 140, 880, vol=0.14), total_dur * 0.14)
        _add_clip(sfx_mix, thud * 0.14, total_dur * 0.45)
        _add_clip(sfx_mix, _sfx_whoosh(0.70, 260, 1280, vol=0.13), total_dur * 0.62)
    elif ep_code in ("KT-S08", "KT-S10", "KT-S12", "KT-S14"):
        _add_clip(sfx_mix, thud * 0.17, total_dur * 0.44)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.32, vol=0.11), total_dur * 0.28)
        _add_clip(sfx_mix, _sfx_chime([659.25, 987.77], dur=0.38, vol=0.13), total_dur * 0.58)
    elif ep_code.startswith("KT-R"):
        _add_clip(sfx_mix, thud * 0.16, total_dur * 0.26)
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.32, vol=0.11), total_dur * 0.30)
        _add_clip(sfx_mix, _sfx_whoosh(0.65, 220, 1320, vol=0.13), total_dur * 0.50)
        _add_clip(sfx_mix, _sfx_chime([659.25, 987.77], dur=0.38, vol=0.13), total_dur * 0.60)

    _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99, 1046.5], dur=0.55, vol=0.14), total_dur * 0.82)
    # Crisp White-Button Subscribe Chime Pop during CTA!
    _add_clip(sfx_mix, _sfx_chime([783.99, 1174.66, 1567.98], dur=0.42, vol=0.15), total_dur * 0.90)

    master = sfx_mix.copy()
    master[:, 0] += vo_track
    master[:, 1] += vo_track
    peak = float(np.max(np.abs(master)))
    if peak > 0.94:
        master = np.tanh(master * 1.12) * 0.89

    os.makedirs(os.path.dirname(mix_out_path), exist_ok=True)
    pcm16 = np.clip(master * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(mix_out_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm16.tobytes())

    return chunks, total_dur


from src.knot_batch2_scripts import SHORTS_BATCH2_SPECS
from src.knot_batch3_scripts import SHORTS_BATCH3_SPECS
from src.knot_director_batch2 import KnotShortDirectorBatch2
from src.knot_director_batch3 import KnotShortDirectorBatch3
from src.knot_director_v2 import KnotShortDirectorV2

SHORTS_SPECS.update(SHORTS_BATCH2_SPECS)
SHORTS_SPECS.update(SHORTS_BATCH3_SPECS)


class KnotShortDirector:
    """Unified factory/wrapper dispatching KT-S01..S06 (V2), KT-S07..S14 (V3), and KT-R01..R08 (V4)."""

    def __new__(cls, ep_code: str, subtitles: Sequence[SubtitleChunk], total_dur: float, ssaa: float = 1.0):
        spec = SHORTS_SPECS[ep_code]
        if ep_code in SHORTS_BATCH3_SPECS:
            return KnotShortDirectorBatch3(ep_code, spec, subtitles, total_dur, ssaa=ssaa)
        if ep_code in SHORTS_BATCH2_SPECS:
            return KnotShortDirectorBatch2(ep_code, spec, subtitles, total_dur, ssaa=ssaa)
        return KnotShortDirectorV2(ep_code, spec, subtitles, total_dur, ssaa=ssaa)
