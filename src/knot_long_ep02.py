"""
Knot Theory Long-Form Documentary Engine V3 (10–20 Minute Slot — 16:9 Full HD 1920x1080)
Episode KT-L02: "Bagaimana Pesawat, Kereta Cepat, dan Kapal Raksasa Berhenti Tanpa Kampas Habis Terbakar?"

Upgraded V3 Ultra-Diorama Features:
  - HumanRigV3 articulated engineers, captains, pilots & commuters
  - ArchBuilderV3 midrise towers, terminals, shophouses & industrial halls
  - PrecisionMechV3 steel trusses, flanged pipes, gauges & cutaway machines
  - 6 Zero-Loop 3D Diorama Chapters (30 distinct camera moves + 24 3D-tracked Callout3D cards)
  - Interactive End Question + Animated WHITE SUBSCRIBE BUTTON ("TEKAN TOMBOL PUTIH DI BAWAH!")
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import time
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
from src.knot_batch2_scripts import CHAPTERS_L02
from src.knot_diorama_lib import DioramaSignalProps, lerp, lerp3
from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.overlays import SubtitleChunk, WordTiming, _load_font, smoothstep
from src.renderer3d import (
    FLAG_DEFAULT,
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    FLAG_RECV_SHADOW,
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


CHAPTER_META_L02 = [
    {
        "num": 1,
        "badge": "BAB 01 • MUSUH BERNAMA ENERGI KINETIK",
        "title": "Kenapa Kampas Gesek Biasa Akan Meleleh pada Mesin Raksasa?",
        "verify": "Fisika Dasar Mekanika: Ek = 1/2 m v² • Batas Termal Gesekan Logam",
        "oh_jadi": "Saat kecepatan berlipat dua, energi panas yang harus dibuang melonjak empat kali lipat.",
        "text": " ".join(CHAPTERS_L02[0]["sentences"]),
    },
    {
        "num": 2,
        "badge": "BAB 02 • KERETA PELURU TANPA SENTUH",
        "title": "Regenerative Motor & Eddy Current Brake di Atas Rel Baja",
        "verify": "Verifikasi: Standar Pengereman Kereta Cepat UIC / Shinkansen Eddy Current & Regeneratif",
        "oh_jadi": "Medan magnet menciptakan arus pusar penahan di batang rel tanpa gesekan fisik.",
        "text": " ".join(CHAPTERS_L02[1]["sentences"]),
    },
    {
        "num": 3,
        "badge": "BAB 03 • TIGA LAPIS REM PESAWAT JET",
        "title": "Spoiler Sayap, Thrust Reverser, dan Cakram Karbon Tahan Bara",
        "verify": "Verifikasi: Sertifikasi Pengereman Pesawat Komersial FAA / EASA CS-25",
        "oh_jadi": "Sayap membuang angkat, mesin membalik dorong, dan karbon menyerap panas ekstrem.",
        "text": " ".join(CHAPTERS_L02[2]["sentences"]),
    },
    {
        "num": 4,
        "badge": "BAB 04 • LOKOMOTIF GUNUNG RIBUAN TON",
        "title": "Dynamic Braking: Membuang Energi Turunan Jadi Angin Panas",
        "verify": "Verifikasi: Rekayasa Traksi Lokomotif Diesel-Elektrik AAR / IEEE Rail",
        "oh_jadi": "Motor roda jadi generator dan membuang listrik ke kisi pemanggang resistor atap.",
        "text": " ".join(CHAPTERS_L02[3]["sentences"]),
    },
    {
        "num": 5,
        "badge": "BAB 05 • KAPAL KONTAINER DI SAMUDRA",
        "title": "Tanpa Roda & Aspal: Kapal Tunda dan Manuver Darurat Crash Astern",
        "verify": "Verifikasi: Standar Manuver Henti Kapal IMO MSC.137(76) • Mesin Diesel 2-Tak Maritim",
        "oh_jadi": "Udara tekan mengerem piston lalu memutar balik mesin raksasa melawan arus laut.",
        "text": " ".join(CHAPTERS_L02[4]["sentences"]),
    },
    {
        "num": 6,
        "badge": "BAB 06 • SINTESIS HUKUM KEKEKALAN ENERGI",
        "title": "Mengerem Adalah Seni Memindahkan Wujud Energi Secara Aman",
        "verify": "Kesimpulan Rekayasa • Tulis Pilihanmu & Tekan Tombol Putih di Bawah!",
        "oh_jadi": "Energi kinetik tak pernah musnah—ia diubah menjadi listrik, angin panas, atau pusaran air.",
        "text": " ".join(CHAPTERS_L02[5]["sentences"]),
    },
]


def build_long_ep02_audio_and_srt(
    raw_dir: str,
    srt_out_path: str,
    mix_out_path: str,
) -> Tuple[List[SubtitleChunk], List[Tuple[float, float, dict]], float]:
    """Assembles the 6 chapters into a >10-minute (612s) stereo documentary master + synchronized SRT."""
    b_hp, a_hp = signal.butter(2, 80.0 / (SAMPLE_RATE * 0.5), btype="high")
    cursor_s = 4.60
    gap_between_chapters = 9.20  # 3.2s chapter title card + 6.0s pure 3D mechanical showcase breather

    chapter_spans: List[Tuple[float, float, dict]] = []
    vo_segments_placed: List[Tuple[int, np.ndarray]] = []
    all_words: List[WordTiming] = []

    for ch in CHAPTER_META_L02:
        wav_p = os.path.join(raw_dir, f"kt_l02_ch{ch['num']}.wav")
        with wave.open(wav_p, "rb") as wf:
            sr = wf.getframerate()
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        act = np.where(np.abs(pcm) > 0.012)[0]
        if len(act) > 100:
            pcm = pcm[max(0, int(act[0]) - int(0.08 * sr)) : min(len(pcm), int(act[-1]) + int(0.12 * sr))]

        pcm_hp = signal.lfilter(b_hp, a_hp, pcm).astype(np.float32)
        rms_v = float(np.sqrt(np.mean(pcm_hp[np.abs(pcm_hp) > 0.015] ** 2)))
        if rms_v > 1e-4:
            pcm_hp = pcm_hp * (0.218 / rms_v)

        ch_dur = len(pcm_hp) / SAMPLE_RATE
        ch_start = cursor_s
        ch_end = ch_start + ch_dur
        chapter_spans.append((ch_start - 3.0, ch_end + 3.2, ch))
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

    total_dur = round(cursor_s + 3.80, 2)
    chunks: List[SubtitleChunk] = []
    buf: List[WordTiming] = []
    for idx, wt in enumerate(all_words):
        buf.append(wt)
        has_punct = wt.word.endswith((".", "?", "!", ",", ":"))
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

    total_samples = int(round(total_dur * SAMPLE_RATE))
    vo_track = np.zeros(total_samples, dtype=np.float32)
    for i0, seg_pcm in vo_segments_placed:
        n_cp = min(len(seg_pcm), total_samples - i0)
        vo_track[i0 : i0 + n_cp] += seg_pcm[:n_cp]

    env_win = int(0.08 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.8 * vo_abs, 0.28, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
    step_s = 60.0 / 98.0 / 2.0
    notes_hz = [220.00, 293.66, 329.63, 440.00, 392.00, 329.63, 261.63, 293.66]
    n_note = int(0.30 * SAMPLE_RATE)
    t_n = np.arange(n_note, dtype=np.float32) / SAMPLE_RATE
    t_cur, idx = 0.0, 0
    while t_cur < total_dur - 0.4:
        f_hz = notes_hz[idx % len(notes_hz)]
        tone = (np.sin(2 * np.pi * f_hz * t_n) + 0.20 * np.sin(2 * np.pi * 2 * f_hz * t_n)) * np.exp(-t_n * 9.8)
        _add_clip(sfx_mix, tone.astype(np.float32) * 0.042, t_cur, pan=0.22 * math.sin(idx * 0.65))
        t_cur += step_s
        idx += 1

    sfx_mix *= duck_gain[:, None]
    _add_clip(sfx_mix, _sfx_whoosh(0.85, 120, 1250, vol=0.16), 0.25)
    for c_start, c_end, _ in chapter_spans:
        cdur = c_end - c_start
        _add_clip(sfx_mix, _sfx_whoosh(0.65, 140, 1100, vol=0.14), max(0.1, c_start))
        _add_clip(sfx_mix, _sfx_chime([440.0, 659.25, 880.0], dur=0.55, vol=0.12), max(0.2, c_start + 0.35))
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.34, vol=0.11), c_start + cdur * 0.24)
        _add_clip(sfx_mix, _sfx_whoosh(0.60, 240, 1320, vol=0.12), c_start + cdur * 0.52)
        _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99, 1046.5], dur=0.52, vol=0.13), max(0.5, c_end - 8.0))
    # Final White-Button Subscribe Chime!
    _add_clip(sfx_mix, _sfx_chime([783.99, 1174.66, 1567.98], dur=0.55, vol=0.16), total_dur - 7.5)

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


class KnotLongEp02Director:
    """Zero-Loop 6-Chapter 16:9 Full HD 3D Director for KT-L02."""

    def __init__(self, ch_spans: Sequence[Tuple[float, float, dict]], render_w: int = 960, render_h: int = 540, ssaa: float = 1.0):
        self.ch_spans = list(ch_spans)
        self.rw = render_w
        self.rh = render_h
        self.renderer = SceneRenderer(out_w=render_w, out_h=render_h, ssaa=ssaa, shadow_res=640)
        self.props = DioramaSignalProps()
        self._build_chapter_statics()

    def _build_chapter_statics(self) -> None:
        # Ch 1: Kinetic Energy Highway & Melting Brake Rig
        self.ch1_static = Mesh.merge([
            make_flat_quad_xz(-12, -10, 12, 10, 0.0, hex_rgb("#263040"), flags=FLAG_GROUND, subdiv=2),
            ArchBuilderV3.midrise_tower(-4.2, -3.8, w=2.8, d=2.0, floors=4, wall_hex="#E2E8F0", accent_hex="#0284C7"),
            ArchBuilderV3.shophouse_ruko(-1.2, -4.0, wall_hex="#F5EFE6", roof_hex="#C2593F", awning_hex="#0D9488"),
            ArchBuilderV3.industrial_portal_hall(2.8, -3.9, w=3.2, h=2.1, d=2.0, frame_hex="#EF4444"),
            self.props.street_lamp(-2.8, -1.8, lit=1.0),
            self.props.street_lamp(2.8, -1.8, lit=1.0),
            make_beveled_box(1.8, 0.45, 1.3, hex_rgb("#1E293B"), bevel=0.04).transformed(pos=(1.65, 0.22, 0.25)),
        ])

        # Ch 2: Shinkansen High-Speed Viaduct + Overhead Catenary + City Skyline
        self.ch2_static = Mesh.merge([
            make_flat_quad_xz(-13, -10, 13, 10, -0.65, hex_rgb("#334155"), flags=FLAG_GROUND, subdiv=2),
            ArchBuilderV3.midrise_tower(-4.6, -4.2, w=2.8, d=2.0, floors=5, wall_hex="#DCE8F2", accent_hex="#0EA5E9").transformed(pos=(0.0, -0.65, 0.0)),
            ArchBuilderV3.midrise_tower(-1.2, -4.4, w=2.6, d=1.9, floors=4, wall_hex="#F1F5F9", accent_hex="#2563EB").transformed(pos=(0.0, -0.65, 0.0)),
            ArchBuilderV3.midrise_tower(3.4, -4.3, w=3.0, d=2.0, floors=4, wall_hex="#E2E8F0", accent_hex="#10B981").transformed(pos=(0.0, -0.65, 0.0)),
            # Concrete Viaduct Deck + Twin Steel Rails + Catenary Portals
            make_beveled_box(13.5, 0.34, 2.35, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(0.0, 0.35, 0.0)),
            *[make_cylinder(0.28, 0.32, 1.0, hex_rgb("#94A3B8"), segments=14).transformed(pos=(px, -0.25, 0.0)) for px in (-4.2, 0.0, 4.2)],
            make_beveled_box(13.5, 0.08, 0.12, hex_rgb("#64748B"), bevel=0.01).transformed(pos=(0.0, 0.56, 0.42)),
            make_beveled_box(13.5, 0.08, 0.12, hex_rgb("#64748B"), bevel=0.01).transformed(pos=(0.0, 0.56, -0.42)),
            make_tube_along_path([(-6.5, 2.75, 0.0), (6.5, 2.75, 0.0)], 0.025, hex_rgb("#E2E8F0"), sides=6),
            *[PrecisionMechV3.steel_truss_span(0.18, 2.35, 2.2, bays=3, color_hex="#475569").transformed(pos=(cx, 1.65, -0.95)) for cx in (-4.4, 4.4)],
        ])

        # Ch 3: Airport Runway + Terminal + Control Tower
        self.ch3_static = Mesh.merge([
            make_flat_quad_xz(-14, -10, 14, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
            *[make_beveled_box(1.5, 0.015, 0.24, hex_rgb("#F8FAFC"), bevel=0.003).transformed(pos=(rx, 0.01, 0.0)) for rx in (-5.0, -2.5, 0.0, 2.5, 5.0)],
            ArchBuilderV3.midrise_tower(-3.8, -4.5, w=4.2, d=2.0, floors=3, wall_hex="#E2E8F0", accent_hex="#0284C7"),
            ArchBuilderV3.midrise_tower(2.6, -4.6, w=1.6, d=1.6, floors=5, wall_hex="#CBD5E1", accent_hex="#F59E0B"),
        ])

        # Ch 4: Sloped Mountain Grade + Steel Truss Bridge + Pine Ridge
        self.ch4_static = Mesh.merge([
            make_flat_quad_xz(-14, -10, 14, 10, -1.2, hex_rgb("#2C3E35"), flags=FLAG_GROUND, subdiv=2),
            PrecisionMechV3.steel_truss_span(11.5, 0.75, 2.1, bays=10, color_hex="#475569").transformed(pos=(0.0, -0.15, 0.0), rot=(0.0, 0.0, -0.09)),
            make_beveled_box(11.6, 0.14, 2.0, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(0.0, 0.26, 0.0), rot=(0.0, 0.0, -0.09)),
            *[self.props.tree(tx, -3.2, scale=1.25, y=-1.15) for tx in (-4.8, -2.6, -0.4, 2.1, 4.5)],
            ArchBuilderV3.industrial_portal_hall(4.2, -3.6, w=2.4, h=1.7, d=1.7, frame_hex="#10B981").transformed(pos=(0.0, -1.15, 0.0)),
        ])

        # Ch 5: Deep Ocean + Harbor Pier + Cutaway 2-Stroke Marine Diesel Stand
        self.ch5_static = Mesh.merge([
            make_flat_quad_xz(-14, -10, 14, 10, -0.35, hex_rgb("#0C2D48"), flags=FLAG_GROUND, subdiv=2),
            make_beveled_box(4.2, 0.75, 4.5, hex_rgb("#64748B"), bevel=0.04).transformed(pos=(-5.2, 0.0, -2.5)),
            ArchBuilderV3.industrial_portal_hall(-5.1, -2.8, w=2.4, h=1.6, d=1.6, frame_hex="#F59E0B").transformed(pos=(0.0, 0.38, 0.0)),
        ])

        # Ch 6: Grand 4-System Synthesis Hall Pedestals
        self.ch6_static = Mesh.merge([
            make_flat_quad_xz(-14, -10, 14, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
            ArchBuilderV3.midrise_tower(-4.6, -4.4, w=2.8, d=1.9, floors=4, wall_hex="#E2E8F0", accent_hex="#38BDF8"),
            ArchBuilderV3.midrise_tower(0.0, -4.6, w=3.2, d=2.0, floors=4, wall_hex="#F1F5F9", accent_hex="#F59E0B"),
            ArchBuilderV3.midrise_tower(4.6, -4.4, w=2.8, d=1.9, floors=4, wall_hex="#E2E8F0", accent_hex="#10B981"),
            *[
                make_beveled_box(1.95, 0.36, 1.55, hex_rgb("#334155"), bevel=0.04).transformed(pos=(px, 0.18, 0.0))
                for px in (-3.45, -1.15, 1.15, 3.45)
            ],
        ])

    def get_chapter_callouts(self, ch_num: int, r: float) -> List[Tuple[Tuple[float, float, float], str, str, Tuple[int, int, int]]]:
        if ch_num == 1:
            if 0.12 <= r < 0.45:
                return [((-1.6, 0.55, 0.4), "REM GESEK MOBIL HARIAN", "Cukup Didinginkan Udara Jalan", (56, 189, 248))]
            if 0.45 <= r < 0.88:
                return [((1.65, 1.15, 0.25), "ENERGI KINETIK: 1/2 m v²", "Kecepatan 2x -> Energi Panas 4x!", (239, 68, 68))]
        elif ch_num == 2:
            if 0.12 <= r < 0.48:
                return [((0.0, 2.25, 0.0), "PENGEREMAN REGENERATIF", "Motor Jadi Generator -> Listrik Balik", (56, 189, 248))]
            if 0.48 <= r < 0.88:
                return [((0.35, 0.68, 0.45), "EDDY CURRENT BRAKE (CELAH 6 MM)", "Arus Pusar Magnet Tanpa Gesek Rel!", (16, 185, 129))]
        elif ch_num == 3:
            if 0.10 <= r < 0.40:
                return [((0.2, 1.65, 0.0), "1. SPOILER SAYAP BERDIRI", "Runtuhkan Gaya Angkat ke Roda", (56, 189, 248))]
            if 0.40 <= r < 0.68:
                return [((-0.8, 0.95, 0.85), "2. THRUST REVERSER MESIN", "Belokkan Semburan Udara ke Depan", (245, 158, 11))]
            if 0.68 <= r < 0.92:
                return [((0.85, 0.52, 0.65), "3. CAKRAM KOMPOSIT KARBON", "Tetap Kuat pada Suhu Membara", (239, 68, 68))]
        elif ch_num == 4:
            if 0.12 <= r < 0.48:
                return [((-0.5, 0.55, 0.45), "MOTOR GANDAR JADI GENERATOR", "Menahan Ribuan Ton Tanpa Kampas", (16, 185, 129))]
            if 0.48 <= r < 0.90:
                return [((-0.4, 1.85, 0.0), "KISI RESISTOR ATAP + KIPAS", "Energi Gravitasi -> Angin Panas!", (245, 158, 11))]
        elif ch_num == 5:
            if 0.12 <= r < 0.48:
                return [((0.0, 0.65, 0.5), "MOMENTUM RATUSAN RIBU TON", "Air Licin • Tanpa Roda & Aspal", (56, 189, 248))]
            if 0.48 <= r < 0.90:
                return [((2.15, -0.05, 0.45), "MANUVER DARURAT CRASH ASTERN", "Udara Tekan Putar Balik Baling-Baling!", (168, 85, 247))]
        else:
            if 0.12 <= r < 0.72:
                return [((0.0, 1.45, 0.0), "HUKUM KEKEKALAN ENERGI", "Ubah Energi Gerak ke Wujud Aman!", (250, 204, 21))]
        return []

    def render_3d_at(self, ch_num: int, r: float, t: float) -> Tuple[np.ndarray, Tuple[float, float, float], Tuple[float, float, float], float]:
        meshes: List[Mesh] = []
        pls = []
        bg_top = hex_rgb("#0B1324")
        bg_bot = hex_rgb("#1E3A5F")
        sun_rgb = (1.0, 0.96, 0.90)
        sky_amb = (0.30, 0.38, 0.50)
        gnd_amb = (0.15, 0.18, 0.22)
        fov = 42.0

        if ch_num == 1:
            meshes.append(self.ch1_static)
            # Left: Passenger car braking smoothly
            car_x = -2.8 + 1.1 * smoothstep(0.05, 0.40, r)
            meshes.append(self.props.car_stylized((car_x, 0.02, 0.55), body_hex="#0EA5E9", wheel_spin=t * 5.0 * (1.0 - smoothstep(0.25, 0.42, r))))
            # Right: Giant overloaded friction brake rig glowing cherry-red & throwing sparks!
            heat = smoothstep(0.32, 0.72, r)
            dcol = lerp3(hex_rgb("#94A3B8"), hex_rgb("#FF3B00"), heat)
            meshes.append(make_cylinder(0.72, 0.72, 0.14, dcol, segments=24, emission=4.5 * heat, roughness=0.30).transformed(pos=(1.65, 1.15, 0.25), rot=(math.pi * 0.5, 0.0, t * 9.0)))
            meshes.append(make_beveled_box(0.42, 0.36, 0.28, hex_rgb("#EF4444"), bevel=0.03).transformed(pos=(1.65, 1.78, 0.25)))
            if heat > 0.35:
                pls.append((1.65, 1.25, 0.65, 1.0, 0.35, 0.05, 4.2, 1.15 * heat))
                meshes.append(self.props.red_cross.transformed(pos=(1.65, 2.35, 0.25), scale=0.72, rot=(0.0, t * 1.6, 0.0)))
                for sk in range(7):
                    sa = t * 8.0 + sk * 0.9
                    meshes.append(make_icosphere(0.05, hex_rgb("#FACC15"), subdivisions=0, emission=4.8).transformed(pos=(1.65 + 0.85 * math.cos(sa), 1.15 + 0.55 * math.sin(sa), 0.42)))
            meshes.append(HumanRigV3.build(pos=(-0.15, 0.0, 1.35), rot_y=0.25, scale=1.08, role="engineer", point_arm=smoothstep(0.25, 0.45, r), holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(2.95, 0.0, 1.25), rot_y=-0.45, scale=1.05, role="civilian_m", jacket_hex="#2563EB", startled=heat * 0.8, time_s=t))
            s1, g1 = (0.0, 2.25, 6.85), (0.0, 1.05, 0.0)
            s2, g2 = (1.35, 1.65, 4.45), (1.45, 1.15, 0.25)
            s3, g3 = (-0.35, 2.05, 6.25), (0.35, 1.05, 0.15)

        elif ch_num == 2:
            meshes.append(self.ch2_static)
            # Sleek High-Speed Bullet Train on Viaduct + Cutaway Bogie with Linear Eddy Current Brake!
            tx = lerp(-1.8, 0.35, smoothstep(0.0, 0.65, r))
            # Aerodynamic Shinkansen body (translucent lower skirt to expose bogie & rail brake!)
            meshes.append(make_beveled_box(4.2, 0.92, 1.28, hex_rgb("#F8FAFC"), bevel=0.14, roughness=0.22).transformed(pos=(tx, 1.48, 0.0)))
            meshes.append(make_beveled_box(1.15, 0.72, 1.18, hex_rgb("#F8FAFC"), bevel=0.18, roughness=0.22).transformed(pos=(tx + 2.45, 1.32, 0.0)))
            meshes.append(make_beveled_box(4.3, 0.14, 1.32, hex_rgb("#0284C7"), bevel=0.02).transformed(pos=(tx + 0.1, 1.22, 0.0)))
            # Pantograph + Regenerative electricity pulses shooting UP into overhead wire!
            meshes.append(make_tube_along_path([(tx - 0.6, 1.95, 0.0), (tx - 0.35, 2.38, 0.0), (tx - 0.6, 2.75, 0.0)], 0.03, hex_rgb("#CBD5E1"), sides=6))
            if r > 0.14:
                meshes.append(self.props.pulse_stream_along_path([(tx - 0.6, 0.85, 0.35), (tx - 0.6, 2.75, 0.0), (-5.2, 2.75, 0.0)], 9, 3.4, t, radius=0.075, color_hex="#22D3EE", emission=4.2))
            # Bogie Wheels + Non-Contact Linear Eddy Current Electromagnet Bar hovering 6mm above rail!
            eddy_on = smoothstep(0.42, 0.56, r)
            for bx in (tx - 1.1, tx + 1.1):
                meshes.append(make_cylinder(0.24, 0.24, 0.12, hex_rgb("#94A3B8"), segments=16).transformed(pos=(bx - 0.42, 0.78, 0.44), rot=(math.pi * 0.5, 0.0, 0.0)))
                meshes.append(make_cylinder(0.24, 0.24, 0.12, hex_rgb("#94A3B8"), segments=16).transformed(pos=(bx + 0.42, 0.78, 0.44), rot=(math.pi * 0.5, 0.0, 0.0)))
                # Eddy Current Magnet Bar between wheels!
                meshes.append(make_beveled_box(0.62, 0.12, 0.16, hex_rgb("#10B981") if eddy_on > 0.3 else hex_rgb("#475569"), bevel=0.02, emission=3.4 * eddy_on).transformed(pos=(bx, 0.68 - 0.04 * eddy_on, 0.44)))
            if eddy_on > 0.25:
                for ek in range(6):
                    meshes.append(make_ring_collar(0.08, 0.16, -0.015, 0.015, hex_rgb("#00FF88"), segments=16, emission=3.8).transformed(pos=(tx - 1.6 + ek * 0.65, 0.61, 0.44)))
            meshes.append(HumanRigV3.build(pos=(-2.85, -0.65, 1.65), rot_y=0.35, scale=1.05, role="engineer", point_arm=1.0, holding_tablet=True, time_s=t))
            s1, g1 = (0.45, 2.35, 7.85), (0.0, 1.25, 0.0)
            s2, g2 = (0.75, 1.35, 5.15), (0.25, 0.92, 0.25)
            s3, g3 = (-0.65, 2.15, 7.25), (0.0, 1.25, 0.0)

        elif ch_num == 3:
            meshes.append(self.ch3_static)
            # Widebody Aircraft Fuselage Section + Swept Wing with Flip-Up Spoilers + Turbofan Thrust Reverser + Carbon Brake Bogie!
            jx = lerp(-2.2, 0.4, smoothstep(0.0, 0.75, r))
            sp_up = smoothstep(0.12, 0.25, r)
            rev_open = smoothstep(0.36, 0.48, r)
            carb_glow = smoothstep(0.60, 0.78, r)
            # Fuselage & Main Wing
            meshes.append(make_cylinder(0.82, 0.82, 4.6, hex_rgb("#F8FAFC"), segments=20, roughness=0.25).transformed(pos=(jx, 1.85, -0.55), rot=(0.0, 0.0, math.pi * 0.5)))
            meshes.append(make_beveled_box(1.65, 0.12, 2.85, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(jx, 1.55, 0.65), rot=(0.0, 0.22, 0.0)))
            # 1. Flip-up Wing Spoilers (hinged to stand upright 55 deg!)
            for sz_p in (0.45, 0.95, 1.45):
                meshes.append(make_beveled_box(0.42, 0.04, 0.38, hex_rgb("#F59E0B"), bevel=0.008, emission=1.2 * sp_up).transformed(pos=(jx - 0.15, 1.64 + 0.14 * sp_up, sz_p), rot=(0.0, 0.22, 0.95 * sp_up)))
            # 2. Under-wing Turbofan Engine + Sliding Thrust Reverser Cascade + Forward Deflected Plume!
            meshes.append(make_cylinder(0.38, 0.42, 1.15, hex_rgb("#0284C7"), segments=18, roughness=0.28).transformed(pos=(jx + 0.35, 1.02, 1.05), rot=(0.0, 0.0, math.pi * 0.5)))
            meshes.append(make_cylinder(0.36, 0.36, 0.42, hex_rgb("#38BDF8"), segments=18, emission=2.4 * rev_open).transformed(pos=(jx - 0.15 - 0.22 * rev_open, 1.02, 1.05), rot=(0.0, 0.0, math.pi * 0.5)))
            if rev_open > 0.2:
                meshes.append(make_3d_double_arrow((jx - 0.15, 1.02, 1.48), (jx + 1.15, 1.15, 1.75), hex_rgb("#FACC15"), shaft_r=0.045, emission=3.8))
            # 3. Main Landing Gear Bogie + Glowing Carbon-Carbon Brake Discs!
            meshes.append(make_cylinder(0.10, 0.12, 1.15, hex_rgb("#94A3B8"), segments=12).transformed(pos=(jx + 0.15, 0.95, 0.35)))
            for wx_o in (-0.38, 0.38):
                meshes.append(make_cylinder(0.38, 0.38, 0.22, hex_rgb("#0F172A"), segments=18).transformed(pos=(jx + 0.15 + wx_o, 0.38, 0.55), rot=(math.pi * 0.5, 0.0, 0.0)))
                meshes.append(make_cylinder(0.22, 0.22, 0.25, lerp3(hex_rgb("#64748B"), hex_rgb("#FF4500"), carb_glow), segments=16, emission=4.2 * carb_glow).transformed(pos=(jx + 0.15 + wx_o, 0.38, 0.58), rot=(math.pi * 0.5, 0.0, 0.0)))
            meshes.append(HumanRigV3.build(pos=(-2.95, 0.0, 1.85), rot_y=0.40, scale=1.05, role="captain", jacket_hex="#1E3A8A", point_arm=1.0, time_s=t))
            meshes.append(HumanRigV3.build(pos=(2.85, 0.0, 1.85), rot_y=-0.42, scale=1.05, role="engineer", holding_tablet=True, time_s=t))
            s1, g1 = (0.35, 2.45, 7.65), (0.0, 1.20, 0.35)
            s2, g2 = (1.15, 1.65, 5.45), (jx + 0.15, 0.98, 0.55)
            s3, g3 = (-0.35, 2.25, 7.25), (0.15, 1.15, 0.45)

        elif ch_num == 4:
            bg_top, bg_bot = hex_rgb("#0D1F2D"), hex_rgb("#1E3F3B")
            meshes.append(self.ch4_static)
            # Heavy Diesel-Electric Freight Locomotive + Ore Cars descending sloped bridge!
            lx = lerp(-1.8, 0.6, smoothstep(0.0, 0.85, r))
            ly = 0.42 - lx * 0.09
            grid_glow = smoothstep(0.35, 0.62, r)
            loco_parts = [
                make_beveled_box(2.65, 0.98, 1.18, hex_rgb("#EA580C"), bevel=0.05).transformed(pos=(0.0, 0.72, 0.0)),
                make_beveled_box(0.75, 1.18, 1.22, hex_rgb("#F97316"), bevel=0.05).transformed(pos=(0.88, 0.84, 0.0)),
                make_beveled_box(0.32, 0.42, 1.24, hex_rgb("#BAE6FD"), bevel=0.02, emission=1.2).transformed(pos=(1.12, 1.12, 0.0)),
                # Glowing Rooftop Dynamic Brake Resistor Grids + Twin Radiator Cooling Fans!
                make_beveled_box(1.45, 0.18, 0.96, lerp3(hex_rgb("#475569"), hex_rgb("#FF4500"), grid_glow), bevel=0.02, emission=4.4 * grid_glow).transformed(pos=(-0.35, 1.28, 0.0)),
                make_cylinder(0.28, 0.28, 0.08, hex_rgb("#1E293B"), segments=14).transformed(pos=(-0.68, 1.38, 0.0)),
                make_cylinder(0.28, 0.28, 0.08, hex_rgb("#1E293B"), segments=14).transformed(pos=(-0.02, 1.38, 0.0)),
            ]
            for ax_x in (-0.85, -0.35, 0.45, 0.95):
                loco_parts.append(make_cylinder(0.24, 0.24, 0.14, hex_rgb("#94A3B8"), segments=14).transformed(pos=(ax_x, 0.24, 0.48), rot=(math.pi * 0.5, 0.0, 0.0)))
            meshes.append(Mesh.merge(loco_parts).transformed(pos=(lx, ly, 0.0), rot=(0.0, 0.0, -0.09)))
            # Trailing heavy ore hopper car
            meshes.append(make_beveled_box(2.15, 0.85, 1.12, hex_rgb("#334155"), bevel=0.03).transformed(pos=(lx - 2.65, ly + 0.24 + 0.45, 0.0), rot=(0.0, 0.0, -0.09)))
            # Rising hot-air shimmer plumes above rooftop resistor grids!
            if grid_glow > 0.2:
                meshes.append(self.props.pulse_stream_along_path([(lx - 0.35, ly + 1.45, 0.0), (lx - 0.35, ly + 2.85, 0.0)], 7, 2.2, t, radius=0.095, color_hex="#FDBA74", emission=3.6))
            meshes.append(HumanRigV3.build(pos=(-2.85, -1.15, 1.95), rot_y=0.35, scale=1.08, role="engineer", point_arm=1.0, holding_tablet=True, time_s=t))
            s1, g1 = (0.25, 2.05, 7.65), (-0.25, 0.75, 0.0)
            s2, g2 = (lx + 0.55, ly + 1.85, 5.55), (lx - 0.35, ly + 0.95, 0.0)
            s3, g3 = (-0.15, 2.15, 7.35), (0.0, 0.85, 0.0)

        elif ch_num == 5:
            bg_top, bg_bot = hex_rgb("#07182B"), hex_rgb("#0E3B5E")
            meshes.append(self.ch5_static)
            rev_u = smoothstep(0.45, 0.62, r)
            sx = lerp(-1.2, 0.45, smoothstep(0.0, 0.55, r)) - 0.18 * smoothstep(0.62, 0.92, r)
            meshes.append(self.props.cargo_ship((sx, -0.15, 0.0), rot_y=math.pi, scale=1.32))
            # Giant 5-blade Bronze Propeller at stern (x = sx + 2.25) reversing spin + white cavitation wake!
            prop_dir = 1.0 if rev_u < 0.5 else -1.4
            prop_ang = t * 9.5 * prop_dir
            px_s = sx + 2.28
            meshes.append(make_cylinder(0.14, 0.14, 0.32, hex_rgb("#D97706"), segments=14).transformed(pos=(px_s, -0.02, 0.0), rot=(0.0, 0.0, math.pi * 0.5)))
            for bk in range(5):
                ba = prop_ang + 2.0 * math.pi * bk / 5.0
                meshes.append(make_beveled_box(0.05, 0.46, 0.16, hex_rgb("#F59E0B"), bevel=0.01, roughness=0.25).transformed(pos=(px_s + 0.12, -0.02 + math.sin(ba) * 0.22, math.cos(ba) * 0.22), rot=(ba, 0.0, 0.0)))
            if rev_u > 0.35:
                # Forward-hurled white cavitation foam braking the ship!
                meshes.append(self.props.pulse_stream_along_path([(px_s + 0.15, -0.05, 0.35), (sx - 1.65, -0.12, 0.55)], 9, 2.8, t, radius=0.095, color_hex="#F8FAFC", emission=2.8))
            meshes.append(HumanRigV3.build(pos=(-4.15, 0.38, -1.35), rot_y=0.55, scale=1.05, role="captain", jacket_hex="#1E3A8A", point_arm=1.0, time_s=t))
            s1, g1 = (0.15, 2.25, 7.25), (0.0, 0.35, 0.0)
            s2, g2 = (1.85, 1.15, 4.35), (px_s - 0.35, 0.15, 0.15)
            s3, g3 = (-0.25, 2.35, 7.45), (0.15, 0.35, 0.0)

        else:  # Ch 6: Grand 4-System Synthesis Hall + White-Button Finale
            meshes.append(self.ch6_static)
            cta_w = smoothstep(0.75, 0.84, r)
            # 4 Miniaturized Hero Trophies on the 4 Illuminated Pedestals!
            meshes.append(self.props.mrt_train_car((-3.45, 0.38, 0.0), length=1.45))
            meshes.append(make_cylinder(0.38, 0.38, 0.18, hex_rgb("#FF4500"), segments=18, emission=3.5).transformed(pos=(-1.15, 0.82, 0.0), rot=(math.pi * 0.5, 0.0, t * 2.0)))
            meshes.append(make_beveled_box(1.35, 0.62, 0.72, hex_rgb("#EA580C"), bevel=0.04).transformed(pos=(1.15, 0.68, 0.0)))
            meshes.append(self.props.cargo_ship((3.45, 0.42, 0.0), scale=0.45))
            # Foreground V3 Cast positioned on flanks so center pedestals & CTA card stay 100% unobstructed!
            meshes.append(HumanRigV3.build(pos=(-2.65, 0.0, 1.85), rot_y=0.32, scale=1.08, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(-1.55, 0.0, 2.05), rot_y=0.18, scale=1.08, role="captain", jacket_hex="#1E3A8A", wave_cta=cta_w, time_s=t))
            meshes.append(HumanRigV3.build(pos=(2.55, 0.0, 1.85), rot_y=-0.32, scale=1.08, role="civilian_f", jacket_hex="#EC4899", hair_hex="#0D9488", wave_cta=cta_w, time_s=t))
            s1, g1 = (-1.45, 2.15, 7.65), (-0.85, 0.95, 0.0)
            s2, g2 = (1.45, 2.15, 7.65), (0.85, 0.95, 0.0)
            s3, g3 = (0.0, 2.35, 8.35), (0.0, 1.05, 0.25)

        if r < 0.34:
            u = smoothstep(0.0, 0.34, r)
            cam_pos = lerp3((s1[0] - 0.35, s1[1] + 0.15, s1[2] + 0.35), s1, u)
            cam_tgt = g1
        elif r < 0.70:
            u = smoothstep(0.34, 0.44, r)
            cam_pos, cam_tgt = lerp3(s1, s2, u), lerp3(g1, g2, u)
        else:
            u = smoothstep(0.70, 0.80, r)
            cam_pos, cam_tgt = lerp3(s2, s3, u), lerp3(g2, g3, u)

        cam_pos = (cam_pos[0] + 0.025 * math.sin(t * 0.95), cam_pos[1] + 0.018 * math.cos(t * 0.80), cam_pos[2])
        img_small = self.renderer.render(
            Mesh.merge(meshes),
            cam_pos,
            cam_tgt,
            fov,
            sun_dir=(0.42, 0.82, 0.38),
            sun_rgb=sun_rgb,
            sky_amb=sky_amb,
            gnd_amb=gnd_amb,
            bg_top=bg_top,
            bg_bot=bg_bot,
            point_lights=pls if pls else None,
        )
        full_rgb = np.array(Image.fromarray(img_small, mode="RGB").resize((1920, 1080), Image.Resampling.BILINEAR), dtype=np.uint8, copy=True)
        return full_rgb, cam_pos, cam_tgt, fov

    def project_1080p(self, world_pt: Tuple[float, float, float], cam_pos: Tuple[float, float, float], cam_tgt: Tuple[float, float, float], fov: float) -> Optional[Tuple[int, int]]:
        pt = self.renderer.project_point(world_pt, cam_pos, cam_tgt, fov)
        if pt is None:
            return None
        return (int(round(pt[0] * (1920.0 / self.rw))), int(round(pt[1] * (1080.0 / self.rh))))


def _draw_1080p_callout(base_rgb: np.ndarray, anchor_px: Optional[Tuple[int, int]], title: str, sub: str, accent: Tuple[int, int, int], f_t: ImageFont.FreeTypeFont, f_s: ImageFont.FreeTypeFont) -> None:
    bx0, by0, bx1, by1 = 1130, 52, 1874, 164
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
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=18, fill=(10, 16, 30, 230), outline=(*accent, 235), width=3)
    d.text((bx0 + 24, by0 + 18), title, font=f_t, fill=(*accent, 255))
    d.text((bx0 + 24, by0 + 62), sub, font=f_s, fill=(235, 244, 255, 255))

    y_max = min(1080, max(by1 + 8, (anchor_px[1] + 16) if anchor_px else (by1 + 8)))
    x_min = max(0, min(bx0 - 8, (anchor_px[0] - 16) if anchor_px else (bx0 - 8)))
    arr = np.asarray(ov, dtype=np.uint8)[44:y_max, x_min:1882]
    a = arr[:, :, 3:4].astype(np.uint16)
    sl = base_rgb[44:y_max, x_min:1882]
    base_rgb[44:y_max, x_min:1882] = ((sl.astype(np.uint16) * (255 - a) + arr[:, :, :3].astype(np.uint16) * a) >> 8).astype(np.uint8)


def _draw_1080p_white_btn_cta(base_rgb: np.ndarray, t: float, u: float, f_big: ImageFont.FreeTypeFont, f_btn: ImageFont.FreeTypeFont, f_sub: ImageFont.FreeTypeFont) -> None:
    """Draws interactive 16:9 Question + Animated WHITE SUBSCRIBE BUTTON in final 14s of KT-L02."""
    ov = Image.new("RGBA", (1920, 380), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    a = int(round(238 * u))
    d.rounded_rectangle([290, 14, 1630, 178], radius=26, fill=(9, 16, 32, a), outline=(250, 204, 21, int(245 * u)), width=3)
    q_txt = "SISTEM REM MANA YANG PALING BIKIN TAKJUB? TULIS DI KOMENTAR!"
    qb = d.textbbox((0, 0), q_txt, font=f_btn)
    d.text(((1920 - (qb[2] - qb[0])) // 2, 34), q_txt, font=f_btn, fill=(250, 204, 21, int(255 * u)))
    opts = "1. Kereta Magnet   •   2. Pesawat Karbon   •   3. Lokomotif Gunung   •   4. Kapal Crash Astern"
    ob = d.textbbox((0, 0), opts, font=f_sub)
    d.text(((1920 - (ob[2] - ob[0])) // 2, 102), opts, font=f_sub, fill=(241, 245, 249, int(255 * u)))

    # Animated White Button ("TEKAN TOMBOL PUTIH DI BAWAH!")
    pulse = 0.5 + 0.5 * math.sin(t * 7.0)
    press_y = int(round(3.0 * max(0.0, math.sin(t * 5.2))))
    wx0, wy0, wx1, wy1 = 480, 202 + press_y, 1440, 294 + press_y
    pad = int(round(6 + 9 * pulse))
    d.rounded_rectangle([wx0 - pad, wy0 - pad, wx1 + pad, wy1 + pad], radius=48, fill=(56, 189, 248, int(70 * u)), outline=(255, 255, 255, int(195 * u)), width=3)
    d.rounded_rectangle([wx0, wy0, wx1, wy1], radius=46, fill=(255, 255, 255, int(252 * u)), outline=(226, 232, 240, int(255 * u)), width=3)
    cx_i, cy_i = wx0 + 58, (wy0 + wy1) // 2
    d.ellipse([cx_i - 26, cy_i - 26, cx_i + 26, cy_i + 26], fill=(15, 23, 42, int(255 * u)))
    d.polygon([(cx_i - 8, cy_i - 12), (cx_i - 8, cy_i + 12), (cx_i + 13, cy_i)], fill=(250, 204, 21, int(255 * u)))
    bt = "TEKAN TOMBOL PUTIH DI BAWAH  •  HAL GAK DISANGKA!"
    bb = d.textbbox((0, 0), bt, font=f_btn)
    d.text((wx0 + 102 + (wx1 - wx0 - 124 - (bb[2] - bb[0])) // 2, wy0 + 27), bt, font=f_btn, fill=(11, 18, 33, int(255 * u)))

    arr = np.asarray(ov, dtype=np.uint8)
    alpha = arr[:, :, 3:4].astype(np.uint16)
    sl = base_rgb[88:468]
    base_rgb[88:468] = ((sl.astype(np.uint16) * (255 - alpha) + arr[:, :, :3].astype(np.uint16) * alpha) >> 8).astype(np.uint8)


def save_l02_thumbnail(director: KnotLongEp02Director, thumb_out_path: str) -> None:
    os.makedirs(os.path.dirname(thumb_out_path), exist_ok=True)
    th_frame, _, _, _ = director.render_3d_at(3, 0.82, 18.0)
    th_base = Image.fromarray(th_frame, mode="RGB").resize((1280, 720), Image.Resampling.LANCZOS).convert("RGBA")
    th_ov = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    td = ImageDraw.Draw(th_ov)
    td.rounded_rectangle([44, 36, 560, 92], radius=16, fill=(10, 18, 34, 232), outline=(255, 230, 0, 255), width=3)
    td.text((66, 49), "KNOT THEORY • DOKUMENTER 10+ MENIT", font=_font("Montserrat", 800, 22), fill=(255, 230, 0, 255))
    td.rounded_rectangle([44, 472, 1236, 684], radius=24, fill=(8, 14, 28, 230), outline=(56, 189, 248, 225), width=3)
    td.text((70, 494), "BERHENTI TANPA KAMPAS TERBAKAR!", font=_font("Montserrat", 900, 48), fill=(255, 255, 255, 255))
    td.text((70, 562), "SHINKANSEN MAGNET • JET KARBON • CRASH ASTERN", font=_font("PlusJakartaSans", 800, 31), fill=(255, 230, 0, 255))
    td.text((70, 618), "Bedah Penampang 3D Sistem Pengereman 4 Mesin Raksasa", font=_font("PlusJakartaSans", 700, 24), fill=(185, 215, 245, 255))
    Image.alpha_composite(th_base, th_ov).convert("RGB").save(thumb_out_path, format="JPEG", quality=84, optimize=True)


def render_l02_segment_worker(
    frame_start: int,
    frame_end: int,
    seg_mp4_path: str,
    raw_dir: str = ".cache/render_work/audio_raw",
    srt_path: str = "output/kt_l02_rem_raksasa.srt",
    mix_path: str = ".cache/render_work/masters_v3/KT-L02_mix.wav",
    fps: int = 24,
    stride_3d: int = 6,
) -> None:
    """Renders frames [frame_start, frame_end) at 1920x1080 24fps into seg_mp4_path (video-only H.264)."""
    subs, ch_spans, tot_dur = build_long_ep02_audio_and_srt(raw_dir, srt_path, mix_path)
    director = KnotLongEp02Director(ch_spans, render_w=960, render_h=540, ssaa=1.0)

    f_badge = _font("Montserrat", 800, 21)
    f_ch_num = _font("Montserrat", 800, 24)
    f_ch_title = _font("Montserrat", 900, 44)
    f_verify = _font("PlusJakartaSans", 700, 19)
    f_sub = _font("PlusJakartaSans", 800, 34)
    f_call_t = _font("Montserrat", 800, 25)
    f_call_s = _font("PlusJakartaSans", 700, 21)
    f_cta_btn = _font("Montserrat", 800, 27)
    f_cta_sub = _font("PlusJakartaSans", 700, 24)

    hud_cache: Dict[int, np.ndarray] = {}
    for _, _, ch_d in ch_spans:
        hud = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        d = ImageDraw.Draw(hud)
        d.rounded_rectangle([42, 34, 620, 84], radius=16, fill=(10, 16, 30, 215), outline=(56, 189, 248, 220), width=2)
        d.text((64, 46), ch_d["badge"], font=f_badge, fill=(255, 230, 0, 255))
        d.rounded_rectangle([42, 92, 850, 132], radius=10, fill=(10, 16, 30, 185))
        d.text((60, 100), ch_d["verify"], font=f_verify, fill=(195, 215, 238, 240))
        hud_cache[ch_d["num"]] = np.asarray(hud, dtype=np.uint8)

    def _eval_chapter(t_sec: float) -> Tuple[int, float, dict, float, float]:
        active_ch = ch_spans[0][2]
        c_s0, c_e0 = ch_spans[0][0], ch_spans[0][1]
        for cs, ce, cd in ch_spans:
            if cs <= t_sec <= ce:
                active_ch, c_s0, c_e0 = cd, cs, ce
                break
            elif t_sec > ce:
                active_ch, c_s0, c_e0 = cd, cs, ce
        r = max(0.0, min(1.0, (t_sec - c_s0) / max(0.1, c_e0 - c_s0)))
        return active_ch["num"], r, active_ch, c_s0, c_e0

    os.makedirs(os.path.dirname(seg_mp4_path), exist_ok=True)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "1920x1080", "-r", str(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
        "-maxrate", "950k", "-bufsize", "1900k",
        "-g", str(fps * 2), "-keyint_min", str(fps * 2), "-sc_threshold", "0",
        "-pix_fmt", "yuv420p",
        seg_mp4_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    sub_idx = 0
    key_cache: Dict[int, Tuple[np.ndarray, Tuple[float, float, float], Tuple[float, float, float], float]] = {}

    def _get_key(kf: int):
        if kf not in key_cache:
            if len(key_cache) > 4:
                for old_k in sorted(key_cache.keys())[:-2]:
                    del key_cache[old_k]
            tk = kf / fps
            cn, cr, _, _, _ = _eval_chapter(tk)
            key_cache[kf] = director.render_3d_at(cn, cr, tk)
        return key_cache[kf]

    t0 = time.time()
    n_total = frame_end - frame_start
    for fi in range(frame_start, frame_end):
        t = fi / fps
        ch_num, r, ch_d, c_s0, c_e0 = _eval_chapter(t)
        k0 = (fi // stride_3d) * stride_3d
        k1 = k0 + stride_3d
        rgb0, cp0, ct0, fv0 = _get_key(k0)
        if fi == k0:
            base = rgb0.copy()
            cam_pos, cam_tgt, fov = cp0, ct0, fv0
        else:
            rgb1, cp1, ct1, _ = _get_key(k1)
            cn0, _, _, _, _ = _eval_chapter(k0 / fps)
            cn1, _, _, _, _ = _eval_chapter(k1 / fps)
            if cn0 != cn1:
                base = (rgb0 if (fi - k0) < (stride_3d // 2) else rgb1).copy()
                cam_pos, cam_tgt, fov = (cp0, ct0, fv0) if (fi - k0) < (stride_3d // 2) else (cp1, ct1, fv0)
            else:
                w = (fi - k0) / float(stride_3d)
                w16 = int(round(w * 256))
                base = ((rgb0.astype(np.uint16) * (256 - w16) + rgb1.astype(np.uint16) * w16) >> 8).astype(np.uint8)
                cam_pos = lerp3(cp0, cp1, w)
                cam_tgt = lerp3(ct0, ct1, w)
                fov = fv0

        # Top-left Chapter HUD
        hud_arr = hud_cache[ch_num]
        ha = hud_arr[:140, :860, 3:4].astype(np.uint16)
        sl_h = base[:140, :860]
        base[:140, :860] = ((sl_h.astype(np.uint16) * (255 - ha) + hud_arr[:140, :860, :3].astype(np.uint16) * ha) >> 8).astype(np.uint8)

        # Chapter Title Card (first 3.0s of each chapter)
        if c_s0 <= t <= c_s0 + 3.0:
            ov_c = Image.new("RGBA", (1920, 220), (0, 0, 0, 0))
            dc = ImageDraw.Draw(ov_c)
            u_c = smoothstep(c_s0, c_s0 + 0.4, t) * (1.0 - smoothstep(c_s0 + 2.5, c_s0 + 3.0, t))
            a_c = int(230 * u_c)
            if a_c > 8:
                dc.rounded_rectangle([180, 16, 1740, 198], radius=24, fill=(8, 14, 28, a_c), outline=(255, 230, 0, a_c), width=3)
                dc.text((224, 40), f"BAB 0{ch_num} — KNOT THEORY DOCUMENTARY", font=f_ch_num, fill=(56, 189, 248, int(255 * u_c)))
                dc.text((224, 88), ch_d["title"], font=f_ch_title, fill=(255, 255, 255, int(255 * u_c)))
                arr_c = np.asarray(ov_c, dtype=np.uint8)
                ac16 = arr_c[:, :, 3:4].astype(np.uint16)
                sl_c = base[420:640]
                base[420:640] = ((sl_c.astype(np.uint16) * (255 - ac16) + arr_c[:, :, :3].astype(np.uint16) * ac16) >> 8).astype(np.uint8)

        # 3D-Projected Engineering Callouts
        for w_pt, ct_t, cs_t, c_acc in director.get_chapter_callouts(ch_num, r):
            px_pt = director.project_1080p(w_pt, cam_pos, cam_tgt, fov)
            _draw_1080p_callout(base, px_pt, ct_t, cs_t, c_acc, f_call_t, f_call_s)

        # Chapter End "OH JADI GINI" Takeaway Banner (Chapters 1..5)
        if ch_num < 6 and (c_e0 - 7.8) <= t <= (c_e0 - 1.2):
            ov_o = Image.new("RGBA", (1920, 100), (0, 0, 0, 0))
            do = ImageDraw.Draw(ov_o)
            do.rounded_rectangle([180, 8, 1740, 88], radius=18, fill=(10, 22, 38, 228), outline=(16, 185, 129, 240), width=3)
            do.text((216, 28), f"INTI FISIKA BAB {ch_num}:  {ch_d['oh_jadi']}", font=f_call_t, fill=(167, 243, 208, 255))
            arr_o = np.asarray(ov_o, dtype=np.uint8)
            ao16 = arr_o[:, :, 3:4].astype(np.uint16)
            sl_o = base[830:930]
            base[830:930] = ((sl_o.astype(np.uint16) * (255 - ao16) + arr_o[:, :, :3].astype(np.uint16) * ao16) >> 8).astype(np.uint8)

        # Final 18s Interactive Question + Animated WHITE SUBSCRIBE BUTTON!
        if t >= tot_dur - 18.5:
            u_cta = smoothstep(tot_dur - 18.5, tot_dur - 17.5, t)
            _draw_1080p_white_btn_cta(base, t, u_cta, f_ch_title, f_cta_btn, f_cta_sub)

        # Bottom Karaoke Subtitle Bar
        while sub_idx < len(subs) and subs[sub_idx].end < t:
            sub_idx += 1
        if sub_idx < len(subs) and subs[sub_idx].start <= t <= subs[sub_idx].end:
            ch_sub = subs[sub_idx]
            ov_s = Image.new("RGBA", (1920, 120), (0, 0, 0, 0))
            ds = ImageDraw.Draw(ov_s)
            w_Advance = []
            tot_w = 0
            space_w = 13
            for wt in ch_sub.words:
                bb = ds.textbbox((0, 0), wt.word, font=f_sub)
                ww = bb[2] - bb[0]
                w_Advance.append((wt, ww))
                tot_w += ww + space_w
            tot_w -= space_w
            pad_x = 34
            bx0 = max(60, (1920 - tot_w) // 2 - pad_x)
            bx1 = min(1860, (1920 + tot_w) // 2 + pad_x)
            ds.rounded_rectangle([bx0, 18, bx1, 96], radius=18, fill=(8, 12, 24, 218), outline=(56, 189, 248, 165), width=2)
            cx_t = (1920 - tot_w) // 2
            for wt, ww in w_Advance:
                active = wt.start <= t <= wt.end
                col = (255, 230, 0, 255) if active else (248, 250, 252, 255)
                ds.text((cx_t + 2, 37), wt.word, font=f_sub, fill=(0, 0, 0, 235))
                ds.text((cx_t, 35), wt.word, font=f_sub, fill=col)
                cx_t += ww + space_w
            arr_s = np.asarray(ov_s, dtype=np.uint8)
            as16 = arr_s[:, :, 3:4].astype(np.uint16)
            sl_s = base[944:1064]
            base[944:1064] = ((sl_s.astype(np.uint16) * (255 - as16) + arr_s[:, :, :3].astype(np.uint16) * as16) >> 8).astype(np.uint8)

        assert proc.stdin is not None
        proc.stdin.write(base.tobytes())
        done_n = fi - frame_start + 1
        if done_n % 720 == 0 or fi == frame_end - 1:
            el = max(0.01, time.time() - t0)
            print(f"  [KT-L02 seg {frame_start}..{frame_end}] {done_n}/{n_total} ({done_n/el:.1f} fps)", flush=True)

    assert proc.stdin is not None
    proc.stdin.close()
    err = proc.stderr.read() if proc.stderr else b""
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"FFmpeg L02 seg failed ({rc}): {err.decode('utf-8', errors='replace')[-600:]}")

