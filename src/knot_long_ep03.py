"""
Knot Theory Long-Form Documentary Engine V4 (10+ Minute Slot — 16:9 Full HD 1920x1080)
Episode KT-L03: "5 Sistem Darurat Bandara & Pesawat Komersial yang Bekerja Diam-Diam Menjaga Nyawa Penumpang"

V4 Multi-Scene Interior + Exterior Aviation Upgrade:
  - True sculpted Commercial Airliner exterior (`V4HeroModels.commercial_airliner`)
  - Cutaway Passenger Cabin Interior (`V4HeroModels.airliner_cabin_interior`) with seated passengers, windows, bleed air, outflow valve & drop-down oxygen masks
  - Flight-Deck Cockpit Interior (`V4HeroModels.airliner_cockpit_interior`) with Captain & First Officer, PFD/ND screens & Cat III Autoland windshield view
  - 6 Zero-Loop Chapters switching dynamically between Exterior Airport/Sky & Interior Cabin/Cockpit/Wing Cutaways
  - Interactive End Poll + Animated WHITE SUBSCRIBE BUTTON ("TEKAN TOMBOL PUTIH DI BAWAH!")
"""

from __future__ import annotations

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
from src.knot_batch3_scripts import CHAPTERS_L03
from src.knot_diorama_lib import DioramaSignalProps, lerp, lerp3
from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.knot_v4_models import V4HeroModels
from src.overlays import SubtitleChunk, WordTiming, _load_font, smoothstep
from src.renderer3d import (
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


CHAPTER_META_L03 = [
    {
        "num": 1,
        "badge": "BAB 01 • PERTAHANAN BERLAPIS PENERBANGAN",
        "title": "Ilusi Ketenangan Kabin di Ketinggian 11 Kilometer",
        "verify": "Standar Redundansi Penerbangan Sipil ICAO / FAA / EASA",
        "oh_jadi": "Keselamatan pesawat dijaga berlapis-lapis sistem cadangan otomatis, bukan satu alat tunggal.",
        "text": " ".join(CHAPTERS_L03[0]["sentences"]),
    },
    {
        "num": 2,
        "badge": "BAB 02 • EMAS ARRESTOR BED UJUNG LANDASAN",
        "title": "Beton Rapuh yang Sengaja Remuk Menangkap Roda Pesawat",
        "verify": "Verifikasi: FAA AC 150/5220-22B Engineered Materials Arresting Systems (EMAS)",
        "oh_jadi": "Blok semen berpori sengaja hancur terukur menyerap energi gerak ratusan ton tanpa mematahkan roda.",
        "text": " ".join(CHAPTERS_L03[1]["sentences"]),
    },
    {
        "num": 3,
        "badge": "BAB 03 • BLEED AIR & OUTFLOW VALVE KABIN",
        "title": "Bagaimana Kabin Pesawat Bernapas di Udara Tipis Membeku?",
        "verify": "Fisika Tekanan Kabin Setara Ketinggian ~2.400 Meter & Masker Oksigen Darurat",
        "oh_jadi": "Udara kompresor mesin didinginkan ke kabin lalu diatur keluarannya oleh katup Outflow Valve di ekor.",
        "text": " ".join(CHAPTERS_L03[2]["sentences"]),
    },
    {
        "num": 4,
        "badge": "BAB 04 • OBIGGS NITROGEN TANGKI SAYAP",
        "title": "Mematikan Segitiga Api di Ruang Uap Avtur dengan Nitrogen",
        "verify": "Regulasi FAA Fuel Tank Flammability Reduction (FTFR) • Membran OBIGGS",
        "oh_jadi": "Membran pemisah udara menyuntikkan nitrogen ke ruang kosong tangki agar uap bahan bakar mustahil tersulut.",
        "text": " ".join(CHAPTERS_L03[3]["sentences"]),
    },
    {
        "num": 5,
        "badge": "BAB 05 • ILS CAT III & AUTOLAND KABUT TEBAL",
        "title": "Mendarat Tepat di Garis Tengah Saat Jarak Pandang Hampir Nol",
        "verify": "Standar Pendaratan Instrumen ICAO Kategori III (Localizer, Glide Slope & Radio Altimeter)",
        "oh_jadi": "Dua berkas gelombang radio dan altimeter radar memandu komputer Autoland menyentuh landasan mulus.",
        "text": " ".join(CHAPTERS_L03[4]["sentences"]),
    },
    {
        "num": 6,
        "badge": "BAB 06 • RAM AIR TURBINE (RAT) & PENUTUP",
        "title": "Kincir Angin Darurat Terakhir di Perut Pesawat",
        "verify": "Rasio Melayang Aerodinamis Pesawat & Turbin Darurat Hidrolik-Listrik RAT",
        "oh_jadi": "Saat tenaga utama padam, terpaan angin luncur memutar kincir RAT untuk menghidupkan kemudi & kokpit.",
        "text": " ".join(CHAPTERS_L03[5]["sentences"]),
    },
]


def build_long_ep03_audio_and_srt(
    raw_dir: str = ".cache/render_work/audio_raw_b3",
    srt_out_path: str = "output/kt_l03_darurat_pesawat.srt",
    mix_out_path: str = ".cache/render_work/masters_b3/KT-L03_mix.wav",
    skip_mix_write: bool = False,
) -> Tuple[List[SubtitleChunk], List[Tuple[float, float, dict]], float]:
    """Builds 618s+ (>10:15) stereo master WAV + SRT for KT-L03 with non-looping visual showcases."""
    b_hp, a_hp = signal.butter(2, 85.0 / (SAMPLE_RATE * 0.5), btype="high")
    gap_between_chapters = 16.20  # Pure-visual 3D aviation showcase transitions so total > 618s (10m18s)!
    cursor_s = 4.20

    all_words: List[WordTiming] = []
    chapter_spans: List[Tuple[float, float, dict]] = []
    vo_segments_placed: List[Tuple[int, np.ndarray]] = []

    for ch in CHAPTER_META_L03:
        wav_p = os.path.join(raw_dir, f"kt_l03_ch{ch['num']}.wav")
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
        # Span covers full chapter + pure-visual engineering showcase transition!
        chapter_spans.append((ch_start - 3.2, ch_end + gap_between_chapters - 3.2, ch))
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
        has_punct = wt.word.endswith((".", "?", "!", ",", ":"))
        next_gap = (all_words[idx + 1].start - wt.end) if (idx + 1 < len(all_words)) else 1.0
        if len(buf) >= 9 or sum(len(x.word) for x in buf) >= 54 or (has_punct and len(buf) >= 4) or next_gap > 0.35:
            chunks.append(SubtitleChunk(words=list(buf), start=buf[0].start, end=buf[-1].end))
            buf.clear()
    if buf:
        chunks.append(SubtitleChunk(words=list(buf), start=buf[0].start, end=buf[-1].end))

    if skip_mix_write and os.path.exists(mix_out_path) and os.path.exists(srt_out_path):
        return chunks, chapter_spans, total_dur

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
        _add_clip(sfx_mix, _sfx_buzzer_wrong(0.34, vol=0.11), c_start + cdur * 0.28)
        _add_clip(sfx_mix, _sfx_whoosh(0.60, 240, 1320, vol=0.12), c_start + cdur * 0.54)
        _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99, 1046.5], dur=0.52, vol=0.13), max(0.5, c_end - 8.5))
    _add_clip(sfx_mix, _sfx_chime([783.99, 1174.66, 1567.98], dur=0.55, vol=0.16), total_dur - 12.0)

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


class KnotLongEp03Director:
    """Multi-Scene Exterior + Interior V4 Aviation Director for KT-L03 (Zero Scene Looping!)."""

    def __init__(self, ch_spans: Sequence[Tuple[float, float, dict]], render_w: int = 960, render_h: int = 540, ssaa: float = 1.0):
        self.ch_spans = list(ch_spans)
        self.rw = render_w
        self.rh = render_h
        self.renderer = SceneRenderer(out_w=render_w, out_h=render_h, ssaa=ssaa, shadow_res=640)
        self.props = DioramaSignalProps()
        self._build_statics()

    def _build_statics(self) -> None:
        # Airport Apron & Runway with Terminal + ATC Control Tower
        self.airport_apron = Mesh.merge([
            make_flat_quad_xz(-22, -16, 22, 16, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
            *[make_beveled_box(1.5, 0.02, 0.24, hex_rgb("#F8FAFC"), bevel=0.004).transformed(pos=(rx, 0.01, 0.0)) for rx in range(-14, 16, 3)],
            ArchBuilderV3.midrise_tower(-4.2, -5.6, w=5.6, d=2.2, floors=3, wall_hex="#E2E8F0", accent_hex="#0284C7"),
            ArchBuilderV3.midrise_tower(3.8, -5.8, w=1.6, d=1.6, floors=5, wall_hex="#CBD5E1", accent_hex="#F59E0B"),
            *[make_icosphere(0.06, hex_rgb("#38BDF8"), subdivisions=0, emission=3.0).transformed(pos=(lx, 0.06, lz)) for lx in range(-12, 14, 4) for lz in (-2.2, 2.2)],
        ])

        # Runway End + EMAS Arrestor Bed Foundation + Sea/Cliff Beyond
        self.emas_runway = Mesh.merge([
            make_flat_quad_xz(-22, -14, 22, 14, -0.35, hex_rgb("#0C2D48"), flags=FLAG_GROUND, subdiv=2),
            make_beveled_box(12.0, 0.36, 5.2, hex_rgb("#1E293B"), bevel=0.02).transformed(pos=(-5.5, -0.17, 0.0)),
            *[make_beveled_box(1.3, 0.02, 0.22, hex_rgb("#F8FAFC"), bevel=0.004).transformed(pos=(rx, 0.02, 0.0)) for rx in (-10, -7, -4, -1)],
            *[make_icosphere(0.07, hex_rgb("#EF4444"), subdivisions=0, emission=4.0).transformed(pos=(0.45, 0.08, rz)) for rz in (-2.0, -1.0, 0.0, 1.0, 2.0)],
            make_beveled_box(8.2, 0.24, 4.8, hex_rgb("#475569"), bevel=0.02).transformed(pos=(4.6, -0.23, 0.0)),
        ])

        # Foggy ILS Runway with Glowing Green/Gold Approach Strobe Array (ALSF-2) & Localizer Antenna
        self.ils_runway = Mesh.merge([
            make_flat_quad_xz(-24, -16, 24, 16, 0.0, hex_rgb("#263244"), flags=FLAG_GROUND, subdiv=2),
            make_beveled_box(22.0, 0.03, 4.4, hex_rgb("#1E293B"), bevel=0.005).transformed(pos=(0.0, 0.015, 0.0)),
            *[make_beveled_box(1.4, 0.02, 0.22, hex_rgb("#F8FAFC"), bevel=0.004).transformed(pos=(rx, 0.035, 0.0)) for rx in range(-8, 12, 3)],
            *[make_beveled_box(0.28, 0.06, 0.14, hex_rgb("#22C55E"), bevel=0.01, emission=4.2).transformed(pos=(-7.5, 0.06, gz)) for gz in (-1.8, -0.9, 0.0, 0.9, 1.8)],
            *[make_beveled_box(0.55, 0.14, 0.18, hex_rgb("#EF4444"), bevel=0.02, emission=2.2).transformed(pos=(9.2, 0.22, az)) for az in (-1.5, -0.5, 0.5, 1.5)],
        ])

    def get_chapter_callouts(self, ch_num: int, r: float) -> List[Tuple[Tuple[float, float, float], str, str, Tuple[int, int, int]]]:
        if ch_num == 1:
            if 0.08 <= r < 0.36:
                return [((0.4, 1.35, 0.0), "REDUNDANSI PENERBANGAN MODERN", "5 Sistem Darurat Bekerja Diam-Diam", (56, 189, 248))]
            if 0.38 <= r < 0.72:
                return [((0.0, 1.35, -0.35), "KABIN TENANG DI 11 KILOMETER", "Suhu Luar -50°C • Udara Tipis", (250, 204, 21))]
        elif ch_num == 2:
            if 0.08 <= r < 0.38:
                return [((0.45, 0.35, 0.0), "BATAS UJUNG LANDASAN LICIN", "Risiko Overrun Ratusan Ton!", (239, 68, 68))]
            if 0.40 <= r < 0.88:
                return [((2.8, 0.25, 0.45), "EMAS: BETON SEMEN BERPORI", "Sengaja Remuk Serap Energi Roda!", (250, 204, 21))]
        elif ch_num == 3:
            if 0.08 <= r < 0.38:
                return [((0.25, 0.95, 1.15), "BLEED AIR KOMPRESOR MESIN", "Udara Bersih Didinginkan ke Kabin", (56, 189, 248))]
            if 0.40 <= r < 0.76:
                return [((2.35, 0.58, -0.35), "KATUP OUTFLOW VALVE OTOMATIS", "Jaga Tekanan Kabin Setara 2.400m", (34, 197, 94))]
            if 0.76 <= r < 0.94:
                return [((0.0, 1.68, -0.35), "MASKER OKSIGEN DARURAT", "Turun Otomatis Saat Tekanan Drop", (250, 204, 21))]
        elif ch_num == 4:
            if 0.10 <= r < 0.40:
                return [((0.0, 1.15, 0.0), "TANGKI TENGAH SAYAP (CENTER TANK)", "Dekat Mesin Pendingin • Uap Avtur", (245, 158, 11))]
            if 0.42 <= r < 0.88:
                return [((0.35, 1.25, 0.25), "MEMBRAN OBIGGS -> GAS NITROGEN", "Kadar Oksigen < 9% • Anti-Ledakan!", (34, 197, 94))]
        elif ch_num == 5:
            if 0.08 <= r < 0.38:
                return [((-1.5, 1.35, 0.0), "SINAR RADIO LOCALIZER & GLIDE SLOPE", "Jalur Miring 3° Tembus Kabut Pekat", (56, 189, 248))]
            if 0.40 <= r < 0.80:
                return [((0.0, 0.95, 0.20), "KOKPIT CAT III DUAL AUTOLAND", "Altimeter Radar Pandu Flare Mulus!", (34, 197, 94))]
        else:
            if 0.08 <= r < 0.42:
                return [((-0.15, 0.55, 0.0), "RAM AIR TURBINE (RAT) TERJUN!", "Angin 800 km/jam -> Listrik & Hidrolik", (56, 189, 248))]
            if 0.42 <= r < 0.68:
                return [((0.0, 0.95, 0.20), "LAYAR KOKPIT UTAMA TETAP HIDUP", "Kemudi Sayap & Ekor Terkendali", (250, 204, 21))]
        return []

    def render_3d_at(self, ch_num: int, r: float, t: float) -> Tuple[np.ndarray, Tuple[float, float, float], Tuple[float, float, float], float]:
        meshes: List[Mesh] = []
        pls = []
        bg_top, bg_bot = hex_rgb("#0B192C"), hex_rgb("#1E3E62")
        sun_rgb = (1.0, 0.96, 0.90)
        sky_amb = (0.32, 0.40, 0.52)
        gnd_amb = (0.16, 0.19, 0.24)
        fov = 43.0

        if ch_num == 1:
            if 0.36 <= r < 0.72:
                # SCENE 1B: CUT INSIDE THE PASSENGER CABIN AT 35,000 FT!
                bg_top, bg_bot = hex_rgb("#0369A1"), hex_rgb("#7DD3FC")
                meshes.append(V4HeroModels.airliner_cabin_interior(time_s=t, bleed_flow=0.4, outflow_open=0.5, masks_drop=0.0))
                u = smoothstep(0.36, 0.72, r)
                cam_pos = lerp3((-0.95, 1.52, 5.25), (0.65, 1.48, 4.95), u)
                cam_tgt = (0.15, 1.12, -0.65)
            elif r < 0.36:
                # SCENE 1A: EXTERIOR INTERNATIONAL AIRPORT APRON WITH COMMERCIAL AIRLINER & CREW!
                meshes.append(self.airport_apron)
                meshes.append(V4HeroModels.commercial_airliner(pos=(0.0, 1.05, 0.0), rot=(0.0, -0.28, 0.0), scale=1.08, gear_down=True, fan_spin=t * 9.0))
                meshes.append(HumanRigV3.build(pos=(-2.15, 0.0, 2.35), rot_y=0.35, scale=1.02, role="captain", jacket_hex="#1E3A8A", time_s=t))
                meshes.append(HumanRigV3.build(pos=(2.25, 0.0, 2.35), rot_y=-0.35, scale=1.02, role="engineer", point_arm=1.0, holding_tablet=True, time_s=t))
                u = smoothstep(0.0, 0.36, r)
                cam_pos = lerp3((4.85, 2.55, 6.85), (2.65, 2.05, 5.95), u)
                cam_tgt = (0.0, 1.05, -0.25)
            else:
                # SCENE 1C: EXTERIOR TAKE-OFF CLIMB INTO STRATOSPHERE!
                bg_top, bg_bot = hex_rgb("#071326"), hex_rgb("#0284C7")
                u = smoothstep(0.72, 1.0, r)
                meshes.append(V4HeroModels.commercial_airliner(pos=(lerp(-1.2, 0.8, u), lerp(1.2, 2.4, u), 0.0), rot=(0.06 * math.sin(t), -0.22, 0.18), scale=1.10, gear_down=False, fan_spin=t * 12.0))
                cam_pos = lerp3((3.65, 1.85, 6.45), (2.45, 2.65, 5.85), u)
                cam_tgt = (0.0, 1.85, 0.0)

        elif ch_num == 2:
            # EMAS CRUSHABLE CELLULAR CEMENT ARRESTOR BED AT RUNWAY END!
            meshes.append(self.emas_runway)
            jet_x = lerp(-5.2, 3.35, smoothstep(0.05, 0.72, r))
            sink_y = 0.24 * smoothstep(0.36, 0.72, r)
            meshes.append(V4HeroModels.commercial_airliner(pos=(jet_x, 1.05 - sink_y, 0.0), scale=1.02, gear_down=True, spoiler_up=1.0, fan_spin=t * 7.0))

            # Modular Yellow/Grey Cellular Cement EMAS Blocks (X = 1.0 .. 7.8): blocks behind jet_x+1.5 are CRUSHED!
            for bx_i in range(14):
                bx = 1.05 + bx_i * 0.48
                for bz in (-1.35, -0.45, 0.45, 1.35):
                    crushed = smoothstep(bx - 0.35, bx + 0.25, jet_x + 1.55) if abs(bz) < 0.95 else 0.0
                    bh = lerp(0.34, 0.09, crushed)
                    bcol = lerp3(hex_rgb("#FACC15"), hex_rgb("#38BDF8"), crushed)
                    meshes.append(make_beveled_box(0.42, bh, 0.82, bcol, bevel=0.015, emission=1.4 * crushed).transformed(pos=(bx, -0.11 + bh * 0.5, bz)))

            meshes.append(HumanRigV3.build(pos=(1.65, 0.0, 2.25), rot_y=-0.25, scale=1.0, role="engineer", point_arm=1.0, holding_tablet=True, time_s=t))
            if r < 0.38:
                cam_pos, cam_tgt = lerp3((-1.2, 2.65, 7.65), (1.85, 2.25, 6.45), smoothstep(0.0, 0.38, r)), (jet_x + 1.2, 0.85, 0.0)
            elif r < 0.76:
                cam_pos, cam_tgt = lerp3((1.85, 2.25, 6.45), (3.45, 1.45, 4.35), smoothstep(0.38, 0.56, r)), (jet_x + 0.6, 0.45, 0.0)
            else:
                cam_pos, cam_tgt = lerp3((3.45, 1.45, 4.35), (4.85, 2.45, 6.95), smoothstep(0.76, 0.92, r)), (3.25, 0.75, 0.0)

        elif ch_num == 3:
            if r < 0.38:
                # SCENE 3A: EXTERIOR CRUISING JETLINER TURBOFAN BLEED-AIR INTAKE!
                bg_top, bg_bot = hex_rgb("#071326"), hex_rgb("#0369A1")
                meshes.append(V4HeroModels.commercial_airliner(pos=(0.0, 1.25, 0.0), rot=(0.0, -0.25, 0.0), scale=1.12, gear_down=False, fan_spin=t * 12.0))
                meshes.append(self.props.pulse_stream_along_path([(0.95, 0.92, 1.22), (0.15, 0.92, 1.15), (-0.15, 1.25, 0.45)], 7, 3.2, t, radius=0.055, color_hex="#38BDF8", emission=3.8))
                u = smoothstep(0.0, 0.38, r)
                cam_pos = lerp3((2.85, 1.75, 4.95), (1.45, 1.35, 3.65), u)
                cam_tgt = (0.15, 1.05, 0.85)
            else:
                # SCENE 3B & 3C: CUT INSIDE THE PASSENGER CABIN — BLEED AIR + OUTFLOW VALVE + OXYGEN MASKS!
                bg_top, bg_bot = hex_rgb("#0284C7"), hex_rgb("#BAE6FD")
                drop_masks = smoothstep(0.76, 0.84, r)
                outflow_u = (0.65 + 0.25 * math.sin(t * 2.5)) * (1.0 - drop_masks)
                meshes.append(V4HeroModels.airliner_cabin_interior(time_s=t, bleed_flow=1.0 - 0.5 * drop_masks, outflow_open=outflow_u, masks_drop=drop_masks))
                if r < 0.76:
                    cam_pos = lerp3((-0.65, 1.50, 5.25), (1.15, 1.25, 4.45), smoothstep(0.38, 0.68, r))
                    cam_tgt = (0.85, 0.95, -0.55)
                else:
                    cam_pos = lerp3((1.15, 1.25, 4.45), (-0.25, 1.55, 4.85), smoothstep(0.76, 0.88, r))
                    cam_tgt = (0.0, 1.28, -0.55)

        elif ch_num == 4:
            if r < 0.36:
                # SCENE 4A: EXTERIOR CRUISING JETLINER HIGHLIGHTING CENTER WING TANK!
                bg_top, bg_bot = hex_rgb("#091930"), hex_rgb("#1E40AF")
                meshes.append(V4HeroModels.commercial_airliner(pos=(0.0, 1.35, 0.0), rot=(0.12, -0.35, 0.0), scale=1.10, gear_down=False, fan_spin=t * 11.0))
                meshes.append(make_ring_collar(0.45, 0.62, -0.04, 0.04, hex_rgb("#F59E0B"), segments=22, emission=3.2).transformed(pos=(-0.15, 1.15, 0.0)))
                cam_pos = lerp3((3.25, 0.85, 5.45), (1.85, 0.95, 4.25), smoothstep(0.0, 0.36, r))
                cam_tgt = (-0.15, 1.20, 0.0)
            else:
                # SCENE 4B: OPEN CUTAWAY CENTER-WING FUEL TANK + OBIGGS NITROGEN SEPARATION MODULE!
                n2_active = smoothstep(0.46, 0.62, r)
                meshes.append(make_flat_quad_xz(-14, -10, 14, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2))
                # Cutaway Wing Box Tank Frame + Golden Jet-A1 Fuel Liquid Layer at bottom
                meshes.append(make_beveled_box(3.4, 1.35, 1.45, hex_rgb("#334155"), bevel=0.04).transformed(pos=(0.0, 1.15, -0.75)))
                meshes.append(make_beveled_box(3.2, 0.42, 1.25, hex_rgb("#D97706"), bevel=0.02, emission=0.4).transformed(pos=(0.0, 0.72, -0.10)))
                # OBIGGS Hollow-Fiber Membrane Cylinder on Left feeding Inert Nitrogen (Green/Cyan) into Tank Headspace!
                meshes.append(make_cylinder(0.24, 0.24, 1.15, hex_rgb("#0284C7"), segments=18, emission=1.2).transformed(pos=(-2.35, 1.25, 0.0), rot=(0.0, 0.0, math.pi * 0.5)))
                if n2_active < 0.45:
                    # Flammable Oxygen + Fuel Vapor Hazard!
                    meshes.append(self.props.red_cross.transformed(pos=(0.0, 1.42, 0.25), scale=0.68, rot=(0.0, t * 2.0, 0.0)))
                else:
                    # Inert Nitrogen-Enriched Air (< 9% O2) flooding tank headspace + O2 vented overboard!
                    meshes.append(self.props.pulse_stream_along_path([(-1.75, 1.28, 0.10), (-0.5, 1.32, 0.10), (1.15, 1.30, 0.10)], 9, 2.8, t, radius=0.07, color_hex="#22C55E", emission=3.6))
                    meshes.append(self.props.pulse_stream_along_path([(-2.35, 1.02, 0.15), (-2.95, 0.55, 0.35)], 4, 2.4, t, radius=0.045, color_hex="#EF4444", emission=2.8))
                meshes.append(HumanRigV3.build(pos=(2.35, 0.0, 1.35), rot_y=-0.38, scale=1.05, role="engineer", point_arm=1.0, holding_tablet=True, time_s=t))
                cam_pos = lerp3((-0.45, 1.85, 5.45), (0.25, 1.65, 4.65), smoothstep(0.36, 0.85, r))
                cam_tgt = (-0.25, 1.15, 0.0)

        elif ch_num == 5:
            # FOGGY ZERO-VISIBILITY ILS CAT III AUTOLAND — EXTERIOR BEAMS -> COCKPIT FLIGHT DECK -> TOUCHDOWN!
            bg_top, bg_bot = hex_rgb("#475569"), hex_rgb("#94A3B8")
            if 0.38 <= r < 0.78:
                # SCENE 5B: CUT INSIDE THE COCKPIT FLIGHT DECK LOOKING OUT AT ILS APPROACH STROBES!
                rwy_lights = Mesh.merge([
                    *[make_beveled_box(0.38, 0.05, 0.12, hex_rgb("#22C55E"), bevel=0.01, emission=4.2).transformed(pos=(sx * 0.95, 0.55 - k * 0.14, -2.8 - k * 1.35)) for k in range(6) for sx in (-1.0, 1.0)],
                    *[make_beveled_box(0.48, 0.05, 0.10, hex_rgb("#FEF08A"), bevel=0.01, emission=4.8).transformed(pos=(0.0, 0.55 - k * 0.14, -2.8 - k * 1.35)) for k in range(6)],
                    make_tube_along_path([(0.0, 0.62, -2.6), (0.0, -0.25, -10.5)], 0.035, hex_rgb("#22D3EE"), sides=8, emission=3.6),
                ])
                meshes.append(V4HeroModels.airliner_cockpit_interior(time_s=t, autoland_on=1.0))
                meshes.append(rwy_lights)
                u = smoothstep(0.38, 0.78, r)
                cam_pos = lerp3((-0.28, 1.66, 2.45), (0.28, 1.64, 2.38), u)
                cam_tgt = (0.0, 0.88, -3.2)
                fov = 48.0
            else:
                # SCENE 5A & 5C: EXTERIOR FOGGY RUNWAY + TWIN ILS LOCALIZER & 3° GLIDE-SLOPE BEAMS!
                meshes.append(self.ils_runway)
                meshes.append(make_tube_along_path([(9.0, 0.25, 0.0), (-9.5, 0.25, 0.0)], 0.05, hex_rgb("#22D3EE"), sides=8, emission=3.8))
                meshes.append(make_tube_along_path([(-5.5, 0.15, 0.0), (-11.5, 2.65, 0.0)], 0.05, hex_rgb("#FACC15"), sides=8, emission=3.8))
                if r < 0.38:
                    u = smoothstep(0.0, 0.38, r)
                    jx, jy = lerp(-9.5, -5.8, u), lerp(2.35, 1.35, u)
                    meshes.append(V4HeroModels.commercial_airliner(pos=(jx, jy, 0.0), rot=(0.0, 0.0, 0.06), scale=0.95, gear_down=True, fan_spin=t * 8.0))
                    cam_pos, cam_tgt = (-2.2, 2.55, 7.25), (jx + 1.8, 1.15, 0.0)
                else:
                    u = smoothstep(0.78, 1.0, r)
                    jx, jy = lerp(-5.2, 1.5, u), lerp(1.18, 1.02, smoothstep(0.78, 0.88, r))
                    meshes.append(V4HeroModels.commercial_airliner(pos=(jx, jy, 0.0), rot=(0.0, 0.0, 0.08 * (1.0 - u)), scale=1.0, gear_down=True, spoiler_up=smoothstep(0.86, 0.94, r), fan_spin=t * 7.0))
                    cam_pos, cam_tgt = (3.65, 2.15, 6.45), (jx, 0.95, 0.0)

        else:
            # CHAPTER 6: RAM AIR TURBINE (RAT) DEPLOYMENT -> COCKPIT POWER RESTORED -> GRAND HANGAR WHITE-BUTTON CTA!
            cta_w = smoothstep(0.76, 0.84, r)
            if r < 0.42:
                # SCENE 6A: GLIDING COMMERCIAL AIRLINER + BELLY RAM AIR TURBINE DEPLOYMENT!
                bg_top, bg_bot = hex_rgb("#050B18"), hex_rgb("#172554")
                rat_u = smoothstep(0.10, 0.22, r)
                meshes.append(V4HeroModels.commercial_airliner(pos=(0.0, 1.25, 0.0), rot=(0.05 * math.sin(t), -0.25, -0.05), scale=1.12, gear_down=False, rat_deployed=rat_u, fan_spin=t * 2.2))
                if rat_u > 0.4:
                    meshes.append(self.props.pulse_stream_along_path([(-0.12, 0.48, 0.0), (1.85, 1.35, 0.0)], 6, 3.6, t, radius=0.05, color_hex="#22D3EE", emission=4.0))
                u = smoothstep(0.0, 0.42, r)
                cam_pos = lerp3((3.45, 0.95, 5.45), (1.35, 0.65, 3.35), u)
                cam_tgt = (0.0, 0.85, 0.0)
            elif r < 0.68:
                # SCENE 6B: COCKPIT ESSENTIAL DISPLAYS POWERED BY RAT!
                bg_top, bg_bot = hex_rgb("#0B192C"), hex_rgb("#1E3E62")
                meshes.append(V4HeroModels.airliner_cockpit_interior(time_s=t, autoland_on=1.0))
                cam_pos = lerp3((-0.20, 1.62, 2.38), (0.20, 1.62, 2.38), smoothstep(0.42, 0.68, r))
                cam_tgt = (0.0, 0.92, -1.5)
                fov = 47.0
            else:
                # SCENE 6C: GRAND AIRPORT HANGAR FINALE + WAVING CREW + WHITE-BUTTON CTA!
                meshes.append(self.airport_apron)
                meshes.append(V4HeroModels.commercial_airliner(pos=(0.0, 1.05, -0.65), rot=(0.0, -0.22, 0.0), scale=1.05, gear_down=True, rat_deployed=1.0, fan_spin=t * 6.0))
                meshes.append(HumanRigV3.build(pos=(-2.65, 0.0, 2.05), rot_y=0.32, scale=1.08, role="captain", jacket_hex="#1E3A8A", wave_cta=cta_w, time_s=t))
                meshes.append(HumanRigV3.build(pos=(2.65, 0.0, 2.05), rot_y=-0.32, scale=1.08, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))
                meshes.append(HumanRigV3.build(pos=(1.65, 0.0, 2.25), rot_y=-0.22, scale=1.05, role="civilian_f", jacket_hex="#EC4899", hair_hex="#0D9488", wave_cta=cta_w, time_s=t))
                cam_pos = lerp3((1.45, 2.25, 7.25), (0.0, 2.45, 7.85), smoothstep(0.68, 0.80, r))
                cam_tgt = (0.0, 1.15, -0.25)

        cam_pos = (cam_pos[0] + 0.022 * math.sin(t * 0.95), cam_pos[1] + 0.015 * math.cos(t * 0.80), cam_pos[2])
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
    bx0, by0, bx1, by1 = 1110, 52, 1876, 164
    if anchor_px is not None:
        ax = max(140, min(1780, anchor_px[0]))
        ay = max(210, min(860, anchor_px[1]))
        x0 = max(0, min(bx0 - 8, ax - 16))
        y1 = min(1080, max(by1 + 8, ay + 16))
    else:
        ax, ay = None, None
        x0, y1 = bx0 - 8, by1 + 8
    y0, x1 = 44, 1884
    ov = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    if ax is not None and ay is not None:
        cx = (bx0 + bx1) // 2 - x0
        by1_l = by1 - y0
        ax_l, ay_l = ax - x0, ay - y0
        d.line([(cx, by1_l), (ax_l, ay_l)], fill=(10, 16, 28, 220), width=6)
        d.line([(cx, by1_l), (ax_l, ay_l)], fill=(*accent, 245), width=3)
        d.ellipse([ax_l - 11, ay_l - 11, ax_l + 11, ay_l + 11], fill=(*accent, 110))
        d.ellipse([ax_l - 6, ay_l - 6, ax_l + 6, ay_l + 6], fill=(255, 255, 255, 255), outline=(*accent, 255), width=2)
    d.rounded_rectangle([bx0 - x0, by0 - y0, bx1 - x0, by1 - y0], radius=18, fill=(10, 16, 30, 230), outline=(*accent, 235), width=3)
    d.text((bx0 - x0 + 24, by0 - y0 + 18), title, font=f_t, fill=(*accent, 255))
    d.text((bx0 - x0 + 24, by0 - y0 + 62), sub, font=f_s, fill=(235, 244, 255, 255))

    arr = np.asarray(ov, dtype=np.uint8)
    a = arr[:, :, 3:4].astype(np.uint16)
    sl = base_rgb[y0:y1, x0:x1]
    base_rgb[y0:y1, x0:x1] = ((sl.astype(np.uint16) * (255 - a) + arr[:, :, :3].astype(np.uint16) * a) >> 8).astype(np.uint8)


def _draw_1080p_white_btn_cta(base_rgb: np.ndarray, t: float, u: float, f_btn: ImageFont.FreeTypeFont, f_sub: ImageFont.FreeTypeFont) -> None:
    ov = Image.new("RGBA", (1920, 380), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    a = int(round(238 * u))
    d.rounded_rectangle([260, 14, 1660, 178], radius=26, fill=(9, 16, 32, a), outline=(250, 204, 21, int(245 * u)), width=3)
    q_txt = "SISTEM DARURAT PESAWAT MANA PALING CERDAS? TULIS DI KOMENTAR!"
    qb = d.textbbox((0, 0), q_txt, font=f_btn)
    d.text(((1920 - (qb[2] - qb[0])) // 2, 34), q_txt, font=f_btn, fill=(250, 204, 21, int(255 * u)))
    opts = "1. Beton EMAS   •   2. Katup Kabin   •   3. Nitrogen OBIGGS   •   4. Autoland & Kincir RAT"
    ob = d.textbbox((0, 0), opts, font=f_sub)
    d.text(((1920 - (ob[2] - ob[0])) // 2, 102), opts, font=f_sub, fill=(241, 245, 249, int(255 * u)))

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


def save_l03_thumbnail(director: KnotLongEp03Director, thumb_out_path: str) -> None:
    os.makedirs(os.path.dirname(thumb_out_path), exist_ok=True)
    th_frame, _, _, _ = director.render_3d_at(6, 0.16, 12.0)
    th_base = Image.fromarray(th_frame, mode="RGB").resize((1280, 720), Image.Resampling.LANCZOS).convert("RGBA")
    th_ov = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    td = ImageDraw.Draw(th_ov)
    td.rounded_rectangle([44, 36, 560, 92], radius=16, fill=(10, 18, 34, 232), outline=(255, 230, 0, 255), width=3)
    td.text((66, 49), "KNOT THEORY • DOKUMENTER 10+ MENIT", font=_font("Montserrat", 800, 22), fill=(255, 230, 0, 255))
    td.rounded_rectangle([44, 472, 1236, 684], radius=24, fill=(8, 14, 28, 230), outline=(56, 189, 248, 225), width=3)
    td.text((70, 494), "5 SISTEM DARURAT RAHASIA PESAWAT!", font=_font("Montserrat", 900, 46), fill=(255, 255, 255, 255))
    td.text((70, 562), "BETON EMAS • NITROGEN SAYAP • AUTOLAND • KINCIR RAT", font=_font("PlusJakartaSans", 800, 29), fill=(255, 230, 0, 255))
    td.text((70, 618), "Bedah 3D Eksterior, Kabin Penumpang & Kokpit Penerbangan Modern", font=_font("PlusJakartaSans", 700, 24), fill=(185, 215, 245, 255))
    Image.alpha_composite(th_base, th_ov).convert("RGB").save(thumb_out_path, format="JPEG", quality=84, optimize=True)


def render_l03_segment_worker(
    frame_start: int,
    frame_end: int,
    seg_mp4_path: str,
    raw_dir: str = ".cache/render_work/audio_raw_b3",
    srt_path: str = "output/kt_l03_darurat_pesawat.srt",
    mix_path: str = ".cache/render_work/masters_b3/KT-L03_mix.wav",
    fps: int = 24,
    stride_3d: int = 8,
) -> None:
    """Renders frames [frame_start, frame_end) at 1920x1080 24fps into seg_mp4_path."""
    subs, ch_spans, tot_dur = build_long_ep03_audio_and_srt(raw_dir, srt_path, mix_path, skip_mix_write=True)
    director = KnotLongEp03Director(ch_spans, render_w=854, render_h=480, ssaa=1.0)

    f_badge = _font("Montserrat", 800, 21)
    f_ch_num = _font("Montserrat", 800, 24)
    f_ch_title = _font("Montserrat", 900, 42)
    f_verify = _font("PlusJakartaSans", 700, 19)
    f_sub = _font("PlusJakartaSans", 800, 34)
    f_call_t = _font("Montserrat", 800, 25)
    f_call_s = _font("PlusJakartaSans", 700, 21)
    f_cta_btn = _font("Montserrat", 800, 26)
    f_cta_sub = _font("PlusJakartaSans", 700, 24)

    hud_cache: Dict[int, np.ndarray] = {}
    for _, _, ch_d in ch_spans:
        hud = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        d = ImageDraw.Draw(hud)
        d.rounded_rectangle([42, 34, 650, 84], radius=16, fill=(10, 16, 30, 215), outline=(56, 189, 248, 220), width=2)
        d.text((64, 46), ch_d["badge"], font=f_badge, fill=(255, 230, 0, 255))
        d.rounded_rectangle([42, 92, 880, 132], radius=10, fill=(10, 16, 30, 185))
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
            if cn0 != cn1 or abs(fv0 - _) > 1.5:
                base = (rgb0 if (fi - k0) < (stride_3d // 2) else rgb1).copy()
                cam_pos, cam_tgt, fov = (cp0, ct0, fv0) if (fi - k0) < (stride_3d // 2) else (cp1, ct1, _)
            else:
                w = (fi - k0) / float(stride_3d)
                w16 = int(round(w * 256))
                base = ((rgb0.astype(np.uint16) * (256 - w16) + rgb1.astype(np.uint16) * w16) >> 8).astype(np.uint8)
                cam_pos = lerp3(cp0, cp1, w)
                cam_tgt = lerp3(ct0, ct1, w)
                fov = fv0

        hud_arr = hud_cache[ch_num]
        ha = hud_arr[:140, :890, 3:4].astype(np.uint16)
        sl_h = base[:140, :890]
        base[:140, :890] = ((sl_h.astype(np.uint16) * (255 - ha) + hud_arr[:140, :890, :3].astype(np.uint16) * ha) >> 8).astype(np.uint8)

        if c_s0 + 3.2 <= t <= c_s0 + 6.2:
            ov_c = Image.new("RGBA", (1920, 220), (0, 0, 0, 0))
            dc = ImageDraw.Draw(ov_c)
            u_c = smoothstep(c_s0 + 3.2, c_s0 + 3.6, t) * (1.0 - smoothstep(c_s0 + 5.7, c_s0 + 6.2, t))
            a_c = int(230 * u_c)
            if a_c > 8:
                dc.rounded_rectangle([160, 16, 1760, 198], radius=24, fill=(8, 14, 28, a_c), outline=(255, 230, 0, a_c), width=3)
                dc.text((204, 40), f"BAB 0{ch_num} — KNOT THEORY AVIATION DOCUMENTARY", font=f_ch_num, fill=(56, 189, 248, int(255 * u_c)))
                dc.text((204, 88), ch_d["title"], font=f_ch_title, fill=(255, 255, 255, int(255 * u_c)))
                arr_c = np.asarray(ov_c, dtype=np.uint8)
                ac16 = arr_c[:, :, 3:4].astype(np.uint16)
                sl_c = base[420:640]
                base[420:640] = ((sl_c.astype(np.uint16) * (255 - ac16) + arr_c[:, :, :3].astype(np.uint16) * ac16) >> 8).astype(np.uint8)

        for w_pt, ct_t, cs_t, c_acc in director.get_chapter_callouts(ch_num, r):
            px_pt = director.project_1080p(w_pt, cam_pos, cam_tgt, fov)
            _draw_1080p_callout(base, px_pt, ct_t, cs_t, c_acc, f_call_t, f_call_s)

        if ch_num < 6 and (c_e0 - 9.0) <= t <= (c_e0 - 1.5):
            ov_o = Image.new("RGBA", (1920, 100), (0, 0, 0, 0))
            do = ImageDraw.Draw(ov_o)
            do.rounded_rectangle([140, 8, 1780, 88], radius=18, fill=(10, 22, 38, 228), outline=(16, 185, 129, 240), width=3)
            do.text((176, 28), f"INTI FISIKA BAB {ch_num}:  {ch_d['oh_jadi']}", font=_font("Montserrat", 800, 21), fill=(167, 243, 208, 255))
            arr_o = np.asarray(ov_o, dtype=np.uint8)
            ao16 = arr_o[:, :, 3:4].astype(np.uint16)
            sl_o = base[830:930]
            base[830:930] = ((sl_o.astype(np.uint16) * (255 - ao16) + arr_o[:, :, :3].astype(np.uint16) * ao16) >> 8).astype(np.uint8)

        if t >= tot_dur - 22.0:
            u_cta = smoothstep(tot_dur - 22.0, tot_dur - 20.5, t)
            _draw_1080p_white_btn_cta(base, t, u_cta, f_cta_btn, f_cta_sub)

        while sub_idx < len(subs) and subs[sub_idx].end < t:
            sub_idx += 1
        if sub_idx < len(subs) and subs[sub_idx].start <= t <= subs[sub_idx].end:
            ch_sub = subs[sub_idx]
            act_wi = -1
            for wi, wt in enumerate(ch_sub.words):
                if wt.start <= t <= wt.end:
                    act_wi = wi
                    break
            s_key = (sub_idx, act_wi)
            if getattr(director, "_last_sub_key", None) != s_key:
                ov_s = Image.new("RGBA", (1920, 120), (0, 0, 0, 0))
                ds = ImageDraw.Draw(ov_s)
                w_adv = []
                tot_w = 0
                space_w = 13
                for wt in ch_sub.words:
                    bb = ds.textbbox((0, 0), wt.word, font=f_sub)
                    ww = bb[2] - bb[0]
                    w_adv.append((wt, ww))
                    tot_w += ww + space_w
                tot_w -= space_w
                pad_x = 34
                bx0 = max(60, (1920 - tot_w) // 2 - pad_x)
                bx1 = min(1860, (1920 + tot_w) // 2 + pad_x)
                ds.rounded_rectangle([bx0, 18, bx1, 96], radius=18, fill=(8, 12, 24, 218), outline=(56, 189, 248, 165), width=2)
                cx_t = (1920 - tot_w) // 2
                for wi, (wt, ww) in enumerate(w_adv):
                    col = (255, 230, 0, 255) if wi == act_wi else (248, 250, 252, 255)
                    ds.text((cx_t + 2, 37), wt.word, font=f_sub, fill=(0, 0, 0, 235))
                    ds.text((cx_t, 35), wt.word, font=f_sub, fill=col)
                    cx_t += ww + space_w
                director._last_sub_arr = np.asarray(ov_s, dtype=np.uint8)
                director._last_sub_key = s_key
            arr_s = director._last_sub_arr
            as16 = arr_s[:, :, 3:4].astype(np.uint16)
            sl_s = base[944:1064]
            base[944:1064] = ((sl_s.astype(np.uint16) * (255 - as16) + arr_s[:, :, :3].astype(np.uint16) * as16) >> 8).astype(np.uint8)

        assert proc.stdin is not None
        proc.stdin.write(base.tobytes())
        done_n = fi - frame_start + 1
        if done_n % 720 == 0 or fi == frame_end - 1:
            el = max(0.01, time.time() - t0)
            print(f"  [KT-L03 seg {frame_start}..{frame_end}] {done_n}/{n_total} ({done_n/el:.1f} fps)", flush=True)

    assert proc.stdin is not None
    proc.stdin.close()
    err = proc.stderr.read() if proc.stderr else b""
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"FFmpeg L03 seg failed ({rc}): {err.decode('utf-8', errors='replace')[-600:]}")
