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

SEG_STARTS_EP3 = {1: 0.30, 2: 11.50, 3: 24.10, 4: 42.00}
TOTAL_DURATION_EP3 = 58.50

CLAUSE_SPECS_EP3 = {
    1: [
        (0.04, 2.18, "Pas listrik di rumahmu mati total,"),
        (2.50, 6.74, "kenapa air dari keran PDAM sering kali masih bisa ngalir lancar?"),
        (7.16, 10.16, "Rahasianya ada di menara air raksasa ini."),
    ],
    2: [
        (0.16, 3.08, "Menara air ini nggak butuh listrik buat dorong air ke rumahmu,"),
        (3.40, 4.86, "karena dia pakai gravitasi."),
        (5.30, 9.48, "Listrik cuma dipakai sekali di awal buat mompa air naik ke tangki di atas sana,"),
        (9.64, 11.06, "biasanya pas tengah malam."),
    ],
    3: [
        (0.16, 1.74, "Begitu airnya udah di atas,"),
        (2.12, 5.00, "berat air itu sendiri nyiptain tekanan besar ke bawah."),
        (5.58, 7.54, "Setiap 10 meter ketinggian,"),
        (7.88, 9.84, "tekanannya nambah sekitar 1 bar."),
        (10.22, 14.34, "Makanya air otomatis kedorong kencang lewat pipa bawah tanah ke semua rumah,"),
        (14.70, 16.12, "bahkan sampai lantai dua."),
    ],
    4: [
        (0.04, 2.98, "Kalau kota cuma ngandelin pompa listrik langsung tanpa menara,"),
        (3.46, 5.96, "pas jam sibuk pagi hari semua orang mandi barengan,"),
        (6.32, 7.46, "pompanya bakal jebol."),
        (8.14, 11.08, "Menara air ini jadi 'baterai air' cadangan buat satu kota."),
    ],
}


def build_subtitles_ep03(audio_dir: str, srt_out_path: str) -> List[SubtitleChunk]:
    all_words: List[WordTiming] = []
    for seg_i in range(1, 5):
        wav_path = os.path.join(audio_dir, f"vo_seg{seg_i}.wav")
        sr = SAMPLE_RATE
        pcm = None
        if os.path.exists(wav_path):
            with wave.open(wav_path, "rb") as wf:
                sr = wf.getframerate()
                pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

        seg_offset = SEG_STARTS_EP3[seg_i]
        for c_start, c_end, text in CLAUSE_SPECS_EP3[seg_i]:
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


def _sfx_power_down(dur: float = 0.65, vol: float = 0.20) -> np.ndarray:
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    f_drop = 260.0 * np.exp(-t * 4.8) + 32.0
    ph = np.cumsum(2 * np.pi * f_drop / SAMPLE_RATE)
    hum = (0.7 * np.sin(ph) + 0.3 * np.sin(2.0 * ph)) * np.exp(-t * 3.8)
    rng = np.random.default_rng(301)
    clunk = rng.standard_normal(n).astype(np.float32) * np.exp(-t * 45.0) * 0.55
    return (hum + clunk).astype(np.float32) * vol * _env_adsr(n, 0.003, 0.08)


def _sfx_water_flow(dur: float = 3.8, vol: float = 0.065) -> np.ndarray:
    rng = np.random.default_rng(302)
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    b, a = signal.butter(2, [650.0 / (SAMPLE_RATE * 0.5), 3400.0 / (SAMPLE_RATE * 0.5)], btype="band")
    filtered = signal.lfilter(b, a, rng.standard_normal(n).astype(np.float32)).astype(np.float32)
    return filtered * (0.78 + 0.22 * np.sin(2 * np.pi * 6.5 * t)) * vol * _env_adsr(n, 0.20, 0.30)


def _sfx_tank_fill_rise(dur: float = 5.4, vol: float = 0.08) -> np.ndarray:
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    ph = np.cumsum(2 * np.pi * np.linspace(190.0, 520.0, n, dtype=np.float32) / SAMPLE_RATE)
    return (np.sin(ph) * (0.55 + 0.45 * np.sin(2 * np.pi * 5.0 * t))).astype(np.float32) * vol * _env_adsr(n, 0.35, 0.45)


def _sfx_pump_overload_breakdown(dur: float = 5.8, vol: float = 0.12) -> np.ndarray:
    rng = np.random.default_rng(309)
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    t_fail = dur - 1.1
    f_mot = 95.0 + 55.0 * np.clip(t / max(0.1, t_fail), 0.0, 1.0)
    ph = np.cumsum(2 * np.pi * f_mot / SAMPLE_RATE)
    buzz = np.tanh(2.4 * np.sin(ph) * (0.65 + 0.35 * np.sin(2 * np.pi * 16.0 * t))) * (t < t_fail).astype(np.float32)
    dt_f = np.maximum(0.0, t - t_fail)
    after = (t >= t_fail).astype(np.float32)
    hiss = rng.standard_normal(n).astype(np.float32) * np.exp(-dt_f * 2.8) * after * 0.9
    pop = np.sin(2 * np.pi * 140.0 * dt_f) * np.exp(-dt_f * 22.0) * after * 1.4
    return (0.55 * buzz + hiss + pop).astype(np.float32) * vol * _env_adsr(n, 0.15, 0.20)


def build_master_audio_ep03(audio_dir: str, out_wav_path: str) -> str:
    total_samples = int(round(TOTAL_DURATION_EP3 * SAMPLE_RATE))
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
        i0 = int(round(SEG_STARTS_EP3[seg_i] * SAMPLE_RATE))
        n = min(len(pcm), total_samples - i0)
        vo_track[i0 : i0 + n] += pcm[:n]

    env_win = int(0.06 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.6 * vo_abs, 0.38, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
    step_s = 60.0 / 118.0 / 2.0
    notes_hz = [261.63, 329.63, 392.00, 523.25, 493.88, 392.00, 329.63, 392.00]
    n_note = int(0.22 * SAMPLE_RATE)
    t_n = np.arange(n_note, dtype=np.float32) / SAMPLE_RATE
    t_cur, idx = 0.0, 0
    while t_cur < TOTAL_DURATION_EP3 - 0.3:
        f = notes_hz[idx % len(notes_hz)]
        pluck = (np.sin(2 * np.pi * f * t_n) + 0.25 * np.sin(3 * np.pi * f * t_n)) * np.exp(-t_n * 16.5)
        _add_clip(sfx_mix, pluck.astype(np.float32) * 0.048, t_cur, pan=0.18 * math.sin(idx * 0.9))
        t_cur += step_s
        idx += 1

    sfx_mix *= duck_gain[:, None]
    _add_clip(sfx_mix, _sfx_power_down(0.68, vol=0.22), 1.42)
    _add_clip(sfx_mix, _sfx_water_flow(4.1, vol=0.075), 2.80, pan=0.12)
    _add_clip(sfx_mix, _sfx_whoosh(0.55, 160, 1400, vol=0.14), 7.42, pan=-0.1)
    _add_clip(sfx_mix, _sfx_tank_fill_rise(dur=5.6, vol=0.075), 17.00, pan=-0.15)
    _add_clip(sfx_mix, _sfx_chime([659.25, 987.77, 1318.5], dur=0.45, vol=0.13), 22.75, pan=-0.1)
    _add_clip(sfx_mix, _sfx_water_flow(6.6, vol=0.080), 34.50, pan=0.08)
    _add_clip(sfx_mix, _sfx_pump_overload_breakdown(dur=5.9, vol=0.11), 43.60)
    _add_clip(sfx_mix, _sfx_buzzer_wrong(0.45, vol=0.16), 48.45)
    _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99, 1046.5], dur=0.65, vol=0.14), 50.20, pan=-0.1)
    _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99], dur=0.45, vol=0.13), 53.60)

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
