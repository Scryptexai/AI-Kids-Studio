import math
import os
import wave
from typing import List

import numpy as np
from scipy import signal

from src.audio_pipeline import (
    SAMPLE_RATE,
    _add_clip,
    _env_adsr,
    _sfx_buzzer_wrong,
    _sfx_chime,
    _sfx_whoosh,
    _syllable_weight,
)
from src.overlays import SubtitleChunk, WordTiming

SEG_STARTS_EP2 = {1: 0.30, 2: 10.00, 3: 25.50, 4: 39.50}
TOTAL_DURATION_EP2 = 55.50

CLAUSE_SPECS_EP2 = {
    1: [
        (0.18, 1.90, "Coba perhatiin jalanan di kotamu."),
        (2.60, 5.14, "Hampir semua tutup gorong-gorong itu bentuknya bulat."),
        (5.76, 8.74, "Kenapa nggak kotak atau segitiga aja biar gampang bikinnya?"),
    ],
    2: [
        (0.16, 1.44, "Jawabannya simpel:"),
        (1.92, 3.92, "supaya nggak jatuh ke dalam lubang."),
        (4.54, 7.04, "Coba bayangin kalau tutupnya bentuk persegi."),
        (7.68, 9.38, "Lebar sisinya memang sama,"),
        (9.78, 12.42, "tapi garis diagonalnya jauh lebih panjang."),
    ],
    3: [
        (0.16, 1.16, "Kalau tutupnya bulat,"),
        (1.52, 4.46, "diameter dari sudut mana pun selalu sama persis."),
        (4.94, 6.92, "Mau diputar, dimiringin,"),
        (7.14, 9.04, "atau digoyangin kayak gimana pun,"),
        (9.40, 12.30, "tutupnya nggak akan pernah muat masuk ke lubangnya sendiri."),
    ],
    4: [
        (0.18, 3.58, "Selain itu, tutup besi ini beratnya bisa puluhan kilo."),
        (4.32, 4.90, "Karena bulat,"),
        (5.32, 7.86, "petugas cukup menggelindingkannya buat mindahin,"),
        (8.12, 9.06, "nggak perlu diangkat."),
        (9.74, 12.16, "Simpel, tapi nyelamatin banyak orang."),
    ],
}


def build_subtitles_ep02(audio_dir: str, srt_out_path: str) -> List[SubtitleChunk]:
    all_words: List[WordTiming] = []
    for seg_i in range(1, 5):
        wav_path = os.path.join(audio_dir, f"vo_seg{seg_i}.wav")
        sr = SAMPLE_RATE
        pcm = None
        if os.path.exists(wav_path):
            with wave.open(wav_path, "rb") as wf:
                sr = wf.getframerate()
                pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

        seg_offset = SEG_STARTS_EP2[seg_i]
        for c_start, c_end, text in CLAUSE_SPECS_EP2[seg_i]:
            words = text.split()
            if not words:
                continue
            if pcm is not None:
                i0, i1 = max(0, int(c_start * sr)), min(len(pcm), int(c_end * sr))
                sl = np.abs(pcm[i0:i1])
                if len(sl) > 400:
                    thr = max(0.015, float(np.percentile(sl, 85)) * 0.08)
                    act = np.where(sl > thr)[0]
                    if len(act) > 10:
                        c_start = (i0 + int(act[0])) / sr
                        c_end = (i0 + int(act[-1])) / sr

            weights = np.array([_syllable_weight(w) for w in words], dtype=np.float64)
            weights /= np.sum(weights)
            dur = max(0.20, c_end - c_start)
            cur = seg_offset + c_start
            for w_str, frac in zip(words, weights):
                wd = dur * float(frac)
                all_words.append(WordTiming(word=w_str, start=cur, end=cur + wd))
                cur += wd

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
    return chunks


def _sfx_metal_clang(dur: float = 0.42, base_f: float = 420.0, vol: float = 0.18) -> np.ndarray:
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    sig = np.zeros(n, dtype=np.float32)
    for k, r in enumerate([1.0, 1.58, 2.31, 2.92, 3.76]):
        sig += (0.55 ** k) * np.sin(2 * np.pi * base_f * r * t) * np.exp(-t * (10.0 + 4.0 * k))
    rng = np.random.default_rng(77)
    click = rng.standard_normal(n).astype(np.float32) * np.exp(-t * 65.0) * 0.45
    return (sig + click).astype(np.float32) * vol * _env_adsr(n, 0.002, 0.05)


def _sfx_helmet_bonk(vol: float = 0.20) -> np.ndarray:
    n = int(0.48 * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    f_bonk = 340.0 + 180.0 * np.exp(-t * 28.0)
    ph = np.cumsum(2 * np.pi * f_bonk / SAMPLE_RATE)
    bonk = np.sin(ph) * np.exp(-t * 14.0) + 0.45 * np.sin(2 * np.pi * 690.0 * t) * np.exp(-t * 11.0)
    return bonk.astype(np.float32) * vol * _env_adsr(n, 0.002, 0.05)


def _sfx_iron_roll(dur: float = 6.8, vol: float = 0.065) -> np.ndarray:
    rng = np.random.default_rng(202)
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    b, a = signal.butter(2, [75.0 / (SAMPLE_RATE * 0.5), 310.0 / (SAMPLE_RATE * 0.5)], btype="band")
    rumble = signal.lfilter(b, a, rng.standard_normal(n).astype(np.float32)).astype(np.float32)
    return rumble * (0.72 + 0.28 * np.sin(2 * np.pi * 2.4 * t)) * vol * _env_adsr(n, 0.25, 0.40)


def build_master_audio_ep02(audio_dir: str, out_wav_path: str) -> str:
    total_samples = int(round(TOTAL_DURATION_EP2 * SAMPLE_RATE))
    vo_track = np.zeros(total_samples, dtype=np.float32)
    b_hp, a_hp = signal.butter(2, 80.0 / (SAMPLE_RATE * 0.5), btype="high")

    for seg_i in range(1, 5):
        wav_path = os.path.join(audio_dir, f"vo_seg{seg_i}.wav")
        if not os.path.exists(wav_path):
            continue
        with wave.open(wav_path, "rb") as wf:
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        pcm = signal.lfilter(b_hp, a_hp, pcm).astype(np.float32)
        rms = float(np.sqrt(np.mean(pcm[np.abs(pcm) > 0.015] ** 2)))
        if rms > 1e-4:
            pcm = pcm * (0.21 / rms)
        i0 = int(round(SEG_STARTS_EP2[seg_i] * SAMPLE_RATE))
        n = min(len(pcm), total_samples - i0)
        vo_track[i0 : i0 + n] += pcm[:n]

    env_win = int(0.06 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.6 * vo_abs, 0.38, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
    step_s = 60.0 / 120.0 / 2.0
    notes_hz = [349.23, 440.00, 523.25, 659.25, 587.33, 523.25, 440.00, 523.25]
    n_note = int(0.22 * SAMPLE_RATE)
    t_n = np.arange(n_note, dtype=np.float32) / SAMPLE_RATE
    t_cur, idx = 0.0, 0
    while t_cur < TOTAL_DURATION_EP2 - 0.3:
        f = notes_hz[idx % len(notes_hz)]
        pluck = (np.sin(2 * np.pi * f * t_n) + 0.24 * np.sin(4 * np.pi * f * t_n)) * np.exp(-t_n * 17.0)
        _add_clip(sfx_mix, pluck.astype(np.float32) * 0.050, t_cur, pan=0.18 * math.sin(idx * 0.85))
        t_cur += step_s
        idx += 1

    sfx_mix *= duck_gain[:, None]
    _add_clip(sfx_mix, _sfx_whoosh(0.45, 220, 1500, vol=0.11), 2.05)
    _add_clip(sfx_mix, _sfx_chime([659.25, 987.77], dur=0.32, vol=0.12), 2.95)
    _add_clip(sfx_mix, _sfx_whoosh(0.55, 110, 950, vol=0.13), 10.25)
    _add_clip(sfx_mix, _sfx_chime([587.33, 880.0], dur=0.30, vol=0.12), 17.75, pan=-0.1)
    _add_clip(sfx_mix, _sfx_buzzer_wrong(0.35, vol=0.13), 19.85, pan=0.1)
    _add_clip(sfx_mix, _sfx_whoosh(0.75, 180, 1800, vol=0.18), 23.30)
    _add_clip(sfx_mix, _sfx_helmet_bonk(vol=0.24), 24.25)
    _add_clip(sfx_mix, _sfx_chime([1046.5, 1318.5, 1568.0, 2093.0], dur=0.55, vol=0.13), 24.42)
    for imp_t, pf in ((32.10, 440.0), (34.00, 470.0), (35.90, 425.0)):
        _add_clip(sfx_mix, _sfx_metal_clang(0.36, base_f=pf, vol=0.18), imp_t)
    _add_clip(sfx_mix, _sfx_iron_roll(dur=6.9, vol=0.075), 44.60, pan=0.05)
    _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99], dur=0.45, vol=0.13), 52.00)

    master = sfx_mix.copy()
    master[:, 0] += vo_track
    master[:, 1] += vo_track
    peak = float(np.max(np.abs(master)))
    if peak > 0.94:
        master = np.tanh(master * 1.12) * 0.89

    pcm16 = np.clip(master * 32767.0, -32768, 32767).astype(np.int16)
    os.makedirs(os.path.dirname(out_wav_path), exist_ok=True)
    with wave.open(out_wav_path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm16.tobytes())
    return out_wav_path
