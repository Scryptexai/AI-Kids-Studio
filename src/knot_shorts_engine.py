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
        "hook_main": "DATANG SEBELUM KERETA TERLIHAT",
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
        "hook_main": "SPRINKLER TAK MENYALA SERENTAK",
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
        "hook_main": "SABUK SENGAJA MENGALAH SEDIKIT",
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
        "hook_main": "SETIR SENGAJA BISA MEMENDEK!",
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

    # Episode-timed Foley accents
    _add_clip(sfx_mix, _sfx_whoosh(0.55, 180, 1450, vol=0.14), 0.35)
    _add_clip(sfx_mix, _sfx_whoosh(0.50, 140, 1150, vol=0.13), total_dur * 0.26)
    _add_clip(sfx_mix, _sfx_chime([587.33, 880.0], dur=0.35, vol=0.12), total_dur * 0.45)
    if ep_code in ("KT-S02", "KT-S03", "KT-S06"):
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.36, vol=0.12), 2.40)
    _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99, 1046.5], dur=0.52, vol=0.14), total_dur - 6.8)

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


# ==============================================================================
# 3D STYLIZED DIORAMA DIRECTOR FOR KT-S01 .. KT-S06
# ==============================================================================

class KnotShortDirector:
    def __init__(self, ep_code: str, subtitles: Sequence[SubtitleChunk], total_dur: float, ssaa: float = 1.0):
        self.ep_code = ep_code
        self.spec = SHORTS_SPECS[ep_code]
        self.total_dur = total_dur
        self.subtitles = list(subtitles)
        self.renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=ssaa, shadow_res=768)

        self.cta_start = max(total_dur - 3.6, total_dur * 0.90)
        self.compositor = OverlayCompositor(
            width=1080,
            height=1920,
            seg_names=self.spec["seg_names"],
            hook_sub=self.spec["hook_sub"],
            hook_main=self.spec["hook_main"],
            cta_start=self.cta_start,
            cta_q1=self.spec["cta_q1"],
            cta_q2=self.spec["cta_q2"],
            cta_opt_left=self.spec["cta_left"],
            cta_opt_right=self.spec["cta_right"],
        )
        self.callouts = self._build_callouts()
        self._init_static_meshes()

    def _build_callouts(self) -> List[Callout3D]:
        d = self.total_dur
        c = self.ep_code
        if c == "KT-S01":
            return [
                Callout3D(1.0, d * 0.23, (-0.75, 1.35, 1.8), (540, 275), "ANGIN DATANG DULUAN!", "Bukan Sekadar Hembusan AC Stasiun", (0, 228, 255)),
                Callout3D(d * 0.26, d * 0.56, (0.0, 1.15, -0.5), (540, 270), "EFEK PISTON KERETA", "Bodi Rapat Mendorong Kolom Udara", (255, 230, 0)),
                Callout3D(d * 0.58, d * 0.85, (-1.15, 2.85, -0.8), (540, 270), "SHAFT PELEPAS TEKANAN", "Sebagian Udara Naik, Sisanya ke Peron", (0, 245, 136)),
            ]
        if c == "KT-S02":
            return [
                Callout3D(0.8, d * 0.22, (0.0, 2.45, 0.0), (540, 275), "MITOS ADEGAN FILM!", "Aslinya Tak Menyembur Serentak", (255, 58, 76)),
                Callout3D(d * 0.25, d * 0.52, (0.0, 2.35, 0.0), (540, 270), "SEGEL AMPUL KACA PANAS", "Asap Saja Tidak Memicu Sprinkler", (255, 230, 0)),
                Callout3D(d * 0.54, d * 0.85, (0.0, 1.85, 0.0), (540, 270), "HANYA 1 TITIK TERBUKA!", "Cairan Memuai • Kaca Pecah Lokal", (0, 228, 255)),
            ]
        if c == "KT-S03":
            return [
                Callout3D(0.9, d * 0.22, (0.0, 0.35, 0.5), (540, 275), "BUKAN HIASAN TAMAN!", "Batu Pecah di Bawah Gardu Induk", (255, 230, 0)),
                Callout3D(d * 0.25, d * 0.53, (0.0, 0.18, 0.2), (540, 270), "GRADIEN TEGANGAN TANAH", "Arus Gangguan Menyebar dari Pusat", (255, 58, 76)),
                Callout3D(d * 0.55, d * 0.86, (1.05, 0.65, 1.0), (540, 270), "PENYEKAT TEGANGAN LANGKAH", "Hambatan Tinggi • Area Tetap Terlarang!", (0, 245, 136)),
            ]
        if c == "KT-S04":
            return [
                Callout3D(0.9, d * 0.24, (0.0, 1.25, 0.2), (540, 275), "SENGAJA MENGALAH SEDIKIT!", "Bukan Sabuk Kendor atau Rusak", (255, 230, 0)),
                Callout3D(d * 0.26, d * 0.52, (-0.55, 1.45, -0.15), (540, 270), "TAHAP 1: PRETENSIONER", "Menarik Rapat Tubuh ke Kursi", (0, 228, 255)),
                Callout3D(d * 0.54, d * 0.86, (0.55, 1.45, 0.2), (540, 270), "TAHAP 2: TORSION BAR", "Terpuntir Terukur • Gaya Dada Turun", (0, 245, 136)),
            ]
        if c == "KT-S05":
            return [
                Callout3D(0.9, d * 0.23, (-0.35, 1.05, 0.2), (540, 275), "BAU SETELAH LAMA KOSONG?", "Bukan Berarti Pipa Pecah", (255, 230, 0)),
                Callout3D(d * 0.25, d * 0.55, (-0.25, 0.45, 0.25), (540, 270), "SEGEL AIR LEHER ANGSA", "Menguap Saat Lama Tak Disiram", (0, 228, 255)),
                Callout3D(d * 0.57, d * 0.86, (0.85, 2.15, -0.1), (540, 270), "PIPA VENTILASI KE ATAP", "Cegah Tekanan Hisap Menyedot Segel", (0, 245, 136)),
            ]
        return [
            Callout3D(0.9, d * 0.24, (0.15, 1.18, 0.0), (540, 275), "SENGAJA BISA MEMENDEK!", "Kolom Kemudi Keselamatan Modern", (255, 230, 0)),
            Callout3D(d * 0.26, d * 0.52, (-0.35, 1.05, 0.0), (540, 270), "POROS KAKU ZAMAN DULU", "Berisiko Terdorong Mundur ke Kabin", (255, 58, 76)),
            Callout3D(d * 0.54, d * 0.86, (0.05, 1.12, 0.0), (540, 270), "TABUNG TELESKOPIK & KISI", "Menyusut Terkendali Serap Energi", (0, 245, 136)),
        ]

    def _init_static_meshes(self):
        c = self.ep_code
        if c == "KT-S01":
            # MRT underground station + cutaway circular bore tunnel + vertical relief shaft
            parts = [
                make_flat_quad_xz(-5.0, -7.5, 5.0, 5.5, 0.0, hex_rgb("#262D3B"), flags=FLAG_GROUND),
                # Platform slab (left side) + yellow tactile line
                make_beveled_box(2.1, 0.65, 8.0, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(-1.85, 0.325, 1.0)),
                make_beveled_box(0.14, 0.67, 7.8, hex_rgb("#FACC15"), bevel=0.01, emission=0.8).transformed(pos=(-0.92, 0.335, 1.0)),
                # Rails in track bed
                make_beveled_box(0.08, 0.09, 12.5, hex_rgb("#94A3B8"), bevel=0.01).transformed(pos=(0.35, 0.05, -1.0)),
                make_beveled_box(0.08, 0.09, 12.5, hex_rgb("#94A3B8"), bevel=0.01).transformed(pos=(1.15, 0.05, -1.0)),
                # Cutaway soil block + tunnel arch back wall + relief vent shaft
                make_beveled_box(6.5, 3.8, 7.2, hex_rgb("#5C4033"), bevel=0.04, roughness=0.9).transformed(pos=(0.2, 1.9, -4.4)),
                make_beveled_box(2.3, 2.5, 7.3, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.75, 1.25, -4.35)),
                # Relief ventilation shaft chimney going up to street
                make_beveled_box(0.85, 2.4, 0.85, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(-1.15, 2.55, -1.2)),
                make_beveled_box(1.15, 0.14, 1.15, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(-1.15, 3.80, -1.2)),
            ]
            self.base_mesh = Mesh.merge(parts)

        elif c == "KT-S02":
            # Office room diorama with ceiling pipe grid + desks
            parts = [
                make_flat_quad_xz(-4.5, -4.5, 4.5, 4.5, 0.0, hex_rgb("#334155"), flags=FLAG_GROUND),
                make_beveled_box(7.2, 3.0, 0.16, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(0.0, 1.5, -2.4)),
                make_beveled_box(7.2, 0.16, 4.8, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(0.0, 2.92, 0.0)),
                # Red fire main pipe across ceiling
                make_tube_along_path([(-2.8, 2.74, 0.0), (2.8, 2.74, 0.0)], 0.055, hex_rgb("#DC2626"), sides=10),
            ]
            for dx in (-1.8, 0.0, 1.8):
                parts.append(make_beveled_box(1.1, 0.62, 0.7, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(dx, 0.31, -0.3)))
                parts.append(make_beveled_box(0.55, 0.38, 0.06, hex_rgb("#1E293B"), bevel=0.01).transformed(pos=(dx, 0.82, -0.35)))
                parts.append(make_cylinder(0.08, 0.06, 0.18, hex_rgb("#D97706"), segments=10).transformed(pos=(dx, 2.64, 0.0)))
            # Trash bin under center sprinkler
            parts.append(make_cylinder(0.24, 0.19, 0.44, hex_rgb("#475569"), segments=12).transformed(pos=(0.0, 0.22, 0.45)))
            self.base_mesh = Mesh.merge(parts)

        elif c == "KT-S03":
            # Electrical substation yard: left bare wet soil vs right crushed granite gravel bed + transformer
            parts = [
                make_flat_quad_xz(-5.0, -4.5, 0.0, 4.5, 0.0, hex_rgb("#4A3525"), flags=FLAG_GROUND),
                make_flat_quad_xz(0.0, -4.5, 5.0, 4.5, 0.0, hex_rgb("#7C8594"), flags=FLAG_GROUND),
                make_beveled_box(4.8, 0.18, 4.8, hex_rgb("#94A3B8"), bevel=0.03, roughness=0.92).transformed(pos=(2.45, 0.09, 0.4)),
                # High-voltage transformer in back center
                make_beveled_box(1.7, 1.85, 1.3, hex_rgb("#475569"), bevel=0.04).transformed(pos=(0.0, 0.95, -1.6)),
            ]
            for ix in (-0.5, 0.0, 0.5):
                parts.append(make_cylinder(0.11, 0.08, 0.85, hex_rgb("#78350F"), segments=10).transformed(pos=(ix, 2.25, -1.6)))
            # Crushed stone chunks on right side
            rng = np.random.default_rng(11)
            for _ in range(38):
                gx = float(rng.uniform(0.35, 2.6))
                gz = float(rng.uniform(-0.8, 2.2))
                parts.append(make_icosphere(0.065, hex_rgb("#CBD5E1"), subdivisions=0, roughness=0.9).transformed(pos=(gx, 0.19, gz)))
            self.base_mesh = Mesh.merge(parts)

        elif c == "KT-S04":
            # Car seat + B-pillar retractor housing + crash test dummy torso cutaway
            parts = [
                make_flat_quad_xz(-4.5, -4.5, 4.5, 4.5, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND),
                make_beveled_box(2.8, 0.18, 3.4, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.0, 0.09, 0.2)),
                # Bucket seat
                make_beveled_box(0.95, 0.24, 0.95, hex_rgb("#475569"), bevel=0.04).transformed(pos=(-0.25, 0.48, -0.15)),
                make_beveled_box(0.92, 1.25, 0.24, hex_rgb("#475569"), bevel=0.04).transformed(pos=(-0.25, 1.15, -0.55), rot=(-0.12, 0.0, 0.0)),
                # B-pillar & retractor drum
                make_beveled_box(0.26, 2.05, 0.30, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(-0.88, 1.12, -0.35)),
                # Dashboard front
                make_beveled_box(1.5, 0.85, 0.55, hex_rgb("#334155"), bevel=0.04).transformed(pos=(-0.15, 0.88, 1.25)),
            ]
            self.base_mesh = Mesh.merge(parts)

        elif c == "KT-S05":
            # Guest bathroom cutaway: toilet bowl + floor slab + P-trap curve + vertical stack & roof vent
            parts = [
                make_flat_quad_xz(-4.5, -4.5, 4.5, 4.5, -0.8, hex_rgb("#1E293B"), flags=FLAG_GROUND),
                make_beveled_box(4.6, 0.18, 2.8, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(0.0, 0.95, 0.0)),
                make_beveled_box(4.6, 2.2, 0.16, hex_rgb("#F1F5F9"), bevel=0.02).transformed(pos=(0.0, 2.05, -1.2)),
                # Porcelain toilet above slab
                make_cylinder(0.28, 0.22, 0.44, hex_rgb("#F8FAFC"), segments=14, roughness=0.2).transformed(pos=(-0.65, 1.26, 0.15)),
                make_beveled_box(0.48, 0.55, 0.26, hex_rgb("#F8FAFC"), bevel=0.03, roughness=0.2).transformed(pos=(-0.65, 1.62, -0.12)),
                # P-trap pipe loop under slab + main sewer stack + roof vent pipe
                make_tube_along_path(
                    [(-0.65, 1.02, 0.15), (-0.65, 0.28, 0.15), (-0.28, 0.22, 0.15), (-0.05, 0.58, 0.15), (0.85, 0.48, 0.15)],
                    0.11, hex_rgb("#64748B"), sides=12, alpha=0.38, flags=FLAG_DOUBLE_SIDED,
                ),
                # Vertical sewer + roof vent stack
                make_tube_along_path([(0.85, -0.75, 0.15), (0.85, 3.25, 0.15)], 0.12, hex_rgb("#475569"), sides=12, alpha=0.45, flags=FLAG_DOUBLE_SIDED),
                make_beveled_box(1.8, 0.14, 1.6, hex_rgb("#C2410C"), bevel=0.02).transformed(pos=(0.85, 2.95, 0.15), rot=(0.0, 0.0, -0.18)),
            ]
            self.base_mesh = Mesh.merge(parts)

        else:  # KT-S06
            # Car front chassis + firewall + steering wheel cabin cutaway
            parts = [
                make_flat_quad_xz(-4.5, -4.5, 4.5, 4.5, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND),
                make_beveled_box(4.2, 0.18, 2.2, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.0, 0.28, 0.0)),
                make_beveled_box(0.14, 1.35, 2.1, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(-0.45, 0.95, 0.0)),
                # Seat on right (+X)
                make_beveled_box(0.75, 0.22, 0.85, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.95, 0.55, 0.0)),
                make_beveled_box(0.22, 1.05, 0.82, hex_rgb("#475569"), bevel=0.03).transformed(pos=(1.28, 1.12, 0.0), rot=(0.0, 0.0, -0.15)),
            ]
            self.base_mesh = Mesh.merge(parts)

    def _segment_index(self, t: float) -> int:
        r = t / max(1.0, self.total_dur)
        if r < 0.23:
            return 1
        if r < 0.53:
            return 2
        if r < 0.84:
            return 3
        return 4

    def render_frame(self, t: float) -> np.ndarray:
        seg_idx = self._segment_index(t)
        r = t / max(1.0, self.total_dur)
        meshes: List[Mesh] = [self.base_mesh]
        pls = []

        c = self.ep_code
        bg_top, bg_bot = (0.14, 0.24, 0.42), (0.32, 0.52, 0.74)
        sun_rgb = (0.80, 0.78, 0.72)

        if c == "KT-S01":
            bg_top, bg_bot = (0.08, 0.14, 0.26), (0.18, 0.30, 0.48)
            # Train moving along track Z from -6.2 -> +1.8 in loop/timeline
            z_train = lerp(-5.8, 0.8, (t % 9.0) / 9.0) if r >= 0.22 else lerp(-6.8, -3.6, r / 0.22)
            meshes.append(make_beveled_box(1.48, 1.72, 3.2, hex_rgb("#E2E8F0"), bevel=0.08, roughness=0.3).transformed(pos=(0.75, 0.98, z_train)))
            meshes.append(make_beveled_box(1.52, 0.28, 3.22, hex_rgb("#0284C7"), bevel=0.02, emission=0.8).transformed(pos=(0.75, 1.05, z_train)))
            for hx in (0.35, 1.15):
                meshes.append(make_icosphere(0.11, hex_rgb("#FEF08A"), subdivisions=1, emission=4.2).transformed(pos=(hx, 0.78, z_train + 1.62)))
            pls.append((0.75, 1.1, z_train + 2.1, 0.4, 0.85, 1.0, 4.5, 0.9))

            # Glowing cyan air-piston compression rings & wind streamlines ahead of train
            for k in range(5):
                wz = z_train + 1.85 + k * 0.68 + 0.35 * ((t * 3.5) % 1.0)
                meshes.append(make_ring_collar(0.55, 0.66, -0.04, 0.04, hex_rgb("#00E5FF"), segments=20, emission=3.4).transformed(pos=(0.75, 1.05, wz), rot=(math.pi * 0.5, 0.0, 0.0)))
            if r >= 0.52:
                # Relief air rising up shaft
                for k in range(4):
                    sy = 1.4 + ((t * 2.4 + k * 0.25) % 1.0) * 2.5
                    meshes.append(make_icosphere(0.11, hex_rgb("#00FF88"), subdivisions=1, emission=3.8).transformed(pos=(-1.15, sy, -1.2)))
            # Passenger on platform with wind-blown scarf
            meshes.append(make_beveled_box(0.38, 1.15, 0.28, hex_rgb("#F97316"), bevel=0.04).transformed(pos=(-1.35, 1.22, 1.8)))
            meshes.append(make_icosphere(0.20, hex_rgb("#FDE68A"), subdivisions=1).transformed(pos=(-1.35, 1.98, 1.8)))
            scarf_pts = [(-1.35, 1.75, 1.8), (-1.35, 1.82 + 0.08 * math.sin(t * 14.0), 2.25), (-1.35, 1.88 + 0.12 * math.cos(t * 16.0), 2.68)]
            meshes.append(make_tube_along_path(scarf_pts, 0.055, hex_rgb("#38BDF8"), sides=8, emission=1.6))

            cam_pos = lerp3((-1.25, 2.05, 5.25), (3.65, 2.85, 3.85), smoothstep(0.18, 0.34, r))
            cam_tgt = lerp3((-0.25, 1.35, 0.40), (-0.15, 1.45, -1.20), smoothstep(0.18, 0.34, r))
            fov = 45.0

        elif c == "KT-S02":
            if r < 0.22:
                # Movie myth: all 3 sprinklers spraying simultaneously!
                for dx in (-1.8, 0.0, 1.8):
                    meshes.append(make_cylinder(0.05, 0.52, 1.85, hex_rgb("#38BDF8"), segments=12, alpha=0.45, emission=2.2, flags=FLAG_DOUBLE_SIDED).transformed(pos=(dx, 1.62, 0.0)))
                cam_pos, cam_tgt, fov = (0.0, 1.85, 4.85), (0.0, 1.55, -0.2), 46.0
            elif r < 0.54:
                # Real fire under center sprinkler ONLY; bulb glows bright red
                fl_s = 0.22 + 0.05 * math.sin(t * 18.0)
                meshes.append(make_icosphere(fl_s, hex_rgb("#FF4500"), subdivisions=1, emission=4.2).transformed(pos=(0.0, 0.58, 0.45)))
                meshes.append(make_cylinder(0.035, 0.035, 0.14, hex_rgb("#FF1E38"), segments=10, emission=4.0).transformed(pos=(0.0, 2.52, 0.0)))
                pls.append((0.0, 0.85, 0.45, 1.0, 0.45, 0.1, 3.5, 0.95))
                cam_pos, cam_tgt, fov = (1.55, 2.05, 3.65), (0.0, 1.75, 0.15), 43.0
            else:
                # Macro zoom on center sprinkler bulb shattering & spraying ONLY center!
                shatter = smoothstep(0.56, 0.63, r)
                if shatter < 0.5:
                    meshes.append(make_cylinder(0.055, 0.055, 0.22, hex_rgb("#FF1E38"), segments=12, emission=4.5).transformed(pos=(0.0, 2.46, 0.0)))
                else:
                    for k in range(6):
                        ang = k * math.pi / 3.0
                        rad = 0.12 + shatter * 0.55
                        meshes.append(make_icosphere(0.035, hex_rgb("#FF2A44"), subdivisions=0, emission=3.5).transformed(pos=(rad * math.cos(ang), 2.45 - shatter * 0.4, rad * math.sin(ang))))
                    meshes.append(make_cylinder(0.06, 0.68, 2.05, hex_rgb("#00E5FF"), segments=16, alpha=0.52, emission=2.8, flags=FLAG_DOUBLE_SIDED).transformed(pos=(0.0, 1.50, 0.0)))
                cam_pos = lerp3((0.85, 2.35, 1.85), (1.85, 1.95, 4.15), smoothstep(0.76, 0.88, r))
                cam_tgt = lerp3((0.0, 2.35, 0.0), (0.0, 1.55, 0.0), smoothstep(0.76, 0.88, r))
                fov = 42.0

        elif c == "KT-S03":
            # Fault lightning + concentric voltage gradient rings on ground
            if r >= 0.20:
                for k in range(4):
                    rad = 0.55 + ((t * 1.15 + k * 0.25) % 1.0) * 2.85
                    col_r = hex_rgb("#FF2A44") if k % 2 == 0 else hex_rgb("#FACC15")
                    meshes.append(make_ring_collar(rad, rad + 0.09, 0.015, 0.035, col_r, segments=28, emission=3.4).transformed(pos=(0.0, 0.0, -0.6)))
            if r >= 0.45:
                # Left worker silhouette on bare wet soil (red step-voltage arc!) vs right on gravel (safe green shield!)
                for side_x, col_h, safe in ((-1.45, "#EF4444", False), (1.45, "#10B981", True)):
                    by = 0.18 if safe else 0.0
                    meshes.append(make_beveled_box(0.18, 0.62, 0.20, hex_rgb("#334155"), bevel=0.02).transformed(pos=(side_x - 0.18, by + 0.31, 0.8)))
                    meshes.append(make_beveled_box(0.18, 0.62, 0.20, hex_rgb("#334155"), bevel=0.02).transformed(pos=(side_x + 0.18, by + 0.31, 1.15)))
                    meshes.append(make_beveled_box(0.44, 0.62, 0.26, hex_rgb(col_h), bevel=0.03, emission=1.2).transformed(pos=(side_x, by + 0.92, 0.98)))
                    if not safe:
                        arc_pts = [(side_x - 0.18, 0.08, 0.8), (side_x, 0.82, 0.98), (side_x + 0.18, 0.08, 1.15)]
                        meshes.append(make_tube_along_path(arc_pts, 0.038, hex_rgb("#FF2A44"), sides=8, emission=4.2))
            cam_pos = lerp3((0.0, 2.25, 5.15), (0.0, 3.35, 5.45), smoothstep(0.20, 0.50, r))
            cam_tgt = (0.0, 0.85, 0.25)
            fov = 45.0

        elif c == "KT-S04":
            # Dummy torso leaning forward in two controlled stages + torsion bar twist + airbag
            lean = 0.0
            if 0.22 <= r < 0.50:
                lean = -0.08 * smoothstep(0.22, 0.34, r)  # Pretensioner pulls snug back
            elif r >= 0.50:
                lean = lerp(-0.08, 0.42, smoothstep(0.50, 0.72, r))  # Load limiter controlled give into airbag
            tx_d, ty_d, tz_d = -0.25, 1.08, -0.15 + lean * 0.55
            meshes.append(make_beveled_box(0.48, 0.68, 0.30, hex_rgb("#FACC15"), bevel=0.05).transformed(pos=(tx_d, ty_d, tz_d), rot=(lean, 0.0, 0.0)))
            meshes.append(make_icosphere(0.22, hex_rgb("#FDE047"), subdivisions=1).transformed(pos=(tx_d, ty_d + 0.52, tz_d + lean * 0.32)))
            # Diagonal belt strap
            belt_col = hex_rgb("#00E5FF") if r < 0.50 else hex_rgb("#00FF88")
            b_pts = [(-0.82, 1.68, -0.32), (tx_d, ty_d + 0.15, tz_d + 0.18), (0.22, 0.55, -0.12)]
            meshes.append(make_tube_along_path(b_pts, 0.042, belt_col, sides=8, emission=2.8))

            # Highlighted 3D Torsion Bar cylinder on right side + peak force comparison bars
            twist = smoothstep(0.50, 0.78, r)
            meshes.append(make_cylinder(0.14, 0.14, 0.95, hex_rgb("#00FF88") if twist > 0.1 else hex_rgb("#94A3B8"), segments=12, emission=2.2 * twist).transformed(pos=(0.95, 1.35, 0.1), rot=(0.0, t * 3.0 * twist, math.pi * 0.5)))
            if r >= 0.52:
                # Inflating white airbag cushion + comparison force bars
                ab_r = 0.38 * smoothstep(0.52, 0.64, r)
                meshes.append(make_icosphere(ab_r, hex_rgb("#F8FAFC"), subdivisions=1, emission=0.6).transformed(pos=(-0.22, 1.28, 0.82)))
                meshes.append(make_beveled_box(0.24, 1.35, 0.24, hex_rgb("#FF2A44"), bevel=0.02, emission=2.4).transformed(pos=(0.75, 0.68, -0.55)))
                meshes.append(make_beveled_box(0.24, 0.72, 0.24, hex_rgb("#00FF88"), bevel=0.02, emission=2.4).transformed(pos=(1.15, 0.36, -0.55)))

            cam_pos = lerp3((1.95, 1.65, 3.65), (1.75, 1.55, 3.25), smoothstep(0.25, 0.60, r))
            cam_tgt = (0.15, 1.10, 0.05)
            fov = 44.0

        elif c == "KT-S05":
            # P-trap water level: full -> evaporates (gas rises!) -> restored with roof vent air balance!
            if r < 0.26:
                water_lvl = 0.18
            elif r < 0.55:
                water_lvl = lerp(0.95, 0.08, smoothstep(0.30, 0.50, r))
            else:
                water_lvl = 0.95

            if water_lvl > 0.15:
                meshes.append(make_icosphere(0.13 * water_lvl, hex_rgb("#00E5FF"), subdivisions=1, emission=3.0).transformed(pos=(-0.38, 0.26, 0.15)))
            else:
                # Sewer odor green spheres rising into bathroom
                for k in range(5):
                    gy = 0.25 + ((t * 0.9 + k * 0.2) % 1.0) * 1.65
                    meshes.append(make_icosphere(0.085, hex_rgb("#A3E635"), subdivisions=1, emission=3.4).transformed(pos=(-0.60 + 0.08 * math.sin(t * 4 + k), gy, 0.15)))
            if r >= 0.56:
                # Fresh blue vent air descending from roof stack to equalize pressure
                for k in range(5):
                    vy = 3.15 - ((t * 1.2 + k * 0.2) % 1.0) * 2.4
                    meshes.append(make_icosphere(0.08, hex_rgb("#38BDF8"), subdivisions=1, emission=3.6).transformed(pos=(0.85, vy, 0.15)))

            cam_pos = lerp3((-0.15, 1.75, 4.15), (0.10, 1.35, 4.55), smoothstep(0.20, 0.50, r))
            cam_tgt = (0.05, 1.15, 0.10)
            fov = 45.0

        else:  # KT-S06
            # Collapsible steering column vs rigid shaft
            if r < 0.50:
                push = 0.48 * smoothstep(0.26, 0.45, r)
                col_s = hex_rgb("#FF2A44") if r >= 0.24 else hex_rgb("#94A3B8")
                meshes.append(make_tube_along_path([(-1.35 + push, 0.72, 0.0), (0.35 + push, 1.22, 0.0)], 0.065, col_s, sides=10, emission=2.4 if r >= 0.24 else 0.0))
                wx = 0.38 + push
            else:
                comp = smoothstep(0.54, 0.78, r)
                # Telescoping green/cyan accordion sleeves collapsing safely while wheel stays put!
                x_front = lerp(-1.45, -0.65, comp)
                meshes.append(make_tube_along_path([(x_front, 0.72, 0.0), (-0.25, 1.02, 0.0)], 0.085, hex_rgb("#00E5FF"), sides=10, emission=2.6))
                meshes.append(make_tube_along_path([(-0.25, 1.02, 0.0), (0.32, 1.20, 0.0)], 0.062, hex_rgb("#00FF88"), sides=10, emission=2.8))
                for k in range(4):
                    mx = lerp(x_front + 0.15, -0.25, (k + 0.5) / 4.0)
                    my = lerp(0.76, 1.02, (k + 0.5) / 4.0)
                    meshes.append(make_ring_collar(0.08, 0.13, -0.02, 0.02, hex_rgb("#FFE600"), segments=14, emission=3.0).transformed(pos=(mx, my, 0.0), rot=(0.0, 0.0, 1.28)))
                wx = 0.32
                ab_r = 0.26 * smoothstep(0.62, 0.75, r)
                if ab_r > 0.03:
                    meshes.append(make_icosphere(ab_r, hex_rgb("#F8FAFC"), subdivisions=1, emission=0.8).transformed(pos=(0.45, 1.25, 0.0)))

            # Steering wheel ring
            meshes.append(make_ring_collar(0.24, 0.30, -0.025, 0.025, hex_rgb("#E2E8F0"), segments=20).transformed(pos=(wx, 1.22, 0.0), rot=(0.0, 0.0, 1.25)))
            cam_pos = lerp3((0.15, 1.65, 3.85), (-0.05, 1.45, 3.45), smoothstep(0.25, 0.60, r))
            cam_tgt = (-0.15, 1.02, 0.0)
            fov = 44.0

        cam_pos = (cam_pos[0] + 0.02 * math.sin(t * 1.2), cam_pos[1] + 0.015 * math.cos(t * 0.95), cam_pos[2])
        scene_mesh = Mesh.merge(meshes)
        frame_3d = self.renderer.render(
            scene_mesh, cam_pos, cam_tgt, fov,
            sun_dir=(0.42, 0.82, 0.38), sun_rgb=sun_rgb,
            sky_amb=(0.50, 0.58, 0.70), gnd_amb=(0.30, 0.32, 0.38),
            bg_top=bg_top, bg_bot=bg_bot, point_lights=pls if pls else None,
        )
        active_callouts = [
            (cal, self.renderer.project_point(cal.world_target, cam_pos, cam_tgt, fov))
            for cal in self.callouts if cal.start <= t <= cal.end
        ]
        return self.compositor.composite(frame_3d, t, seg_idx, self.subtitles, active_callouts)
