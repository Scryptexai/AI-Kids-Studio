import math
import os
import re
import wave
from typing import List, Sequence

import numpy as np
from scipy import signal

from src.overlays import SubtitleChunk, WordTiming

SAMPLE_RATE = 44100
TOTAL_DURATION_EP1 = 59.00

SEG_STARTS_EP1 = {
    1: 0.30,
    2: 9.60,
    3: 19.10,
    4: 32.60,
    5: 46.60,
}

CLAUSE_SPECS_EP1 = {
    1: [
        (0.10, 3.30, "Pernah nggak kamu berhenti di lampu merah tengah malam,"),
        (3.55, 5.15, "jalanan sepi banget,"),
        (5.40, 8.20, "tapi tiba-tiba lampunya langsung berubah jadi hijau?"),
        (8.45, 9.05, "Kok bisa?"),
    ],
    2: [
        (0.10, 4.35, "Banyak yang ngira di atas tiang itu ada kamera pengintai yang ngelihatin kita."),
        (4.65, 5.65, "Padahal bukan."),
        (6.00, 8.85, "Rahasianya ada tepat di bawah ban motormu."),
    ],
    3: [
        (0.10, 4.65, "Di dalam aspal itu ditanam gulungan kabel tembaga yang dialiri listrik."),
        (4.95, 6.95, "Namanya Inductive Loop."),
        (7.30, 12.15, "Kabel ini ngebentuk medan magnet tak kasat mata di atas jalanan."),
    ],
    4: [
        (0.10, 2.35, "Begitu motor atau mobil kamu lewat,"),
        (2.65, 6.20, "bodi logam kendaraanmu bakal mengganggu medan magnet tadi."),
        (6.55, 9.55, "Perubahan frekuensi ini langsung dideteksi sensor,"),
        (9.85, 13.35, "lalu ngirim sinyal ke kotak kontrol buat nyalain lampu hijau."),
    ],
    5: [
        (0.10, 3.15, "Tapi, karena sensor ini butuh logam yang cukup besar,"),
        (3.45, 6.90, "sepeda atau motor yang terlalu tipis kadang nggak kebaca."),
        (7.25, 11.45, "Makanya ada marka garis kotak di aspal biar kamu tau harus berhenti di mana."),
    ],
}


def _syllable_weight(word: str) -> float:
    clean = re.sub(r"[^a-zA-Z0-9]", "", word.lower())
    if not clean:
        return 1.0
    vowels = len(re.findall(r"[aiueo]+", clean))
    return max(1.0, float(vowels) + 0.25 * len(clean))


def _env_adsr(n: int, attack_s: float = 0.01, release_s: float = 0.08) -> np.ndarray:
    env = np.ones(n, dtype=np.float32)
    na = min(n // 2, max(1, int(attack_s * SAMPLE_RATE)))
    nr = min(n // 2, max(1, int(release_s * SAMPLE_RATE)))
    env[:na] = np.linspace(0.0, 1.0, na, dtype=np.float32)
    env[-nr:] = np.linspace(1.0, 0.0, nr, dtype=np.float32)
    return env


def _add_clip(stereo_buf: np.ndarray, mono_clip: np.ndarray, start_s: float, pan: float = 0.0):
    i0 = max(0, int(round(start_s * SAMPLE_RATE)))
    if i0 >= len(stereo_buf):
        return
    n = min(len(mono_clip), len(stereo_buf) - i0)
    if n <= 0:
        return
    p = max(-1.0, min(1.0, pan))
    gl = math.sqrt(0.5 * (1.0 - p))
    gr = math.sqrt(0.5 * (1.0 + p))
    stereo_buf[i0 : i0 + n, 0] += mono_clip[:n] * gl
    stereo_buf[i0 : i0 + n, 1] += mono_clip[:n] * gr


def _sfx_whoosh(dur: float = 0.45, f0: float = 200.0, f1: float = 1400.0, vol: float = 0.12) -> np.ndarray:
    rng = np.random.default_rng(42)
    n = int(dur * SAMPLE_RATE)
    t = np.linspace(0.0, 1.0, n, dtype=np.float32)
    noise = rng.standard_normal(n).astype(np.float32)
    b, a = signal.butter(2, [min(0.45, f0 / (SAMPLE_RATE * 0.5)), min(0.48, f1 / (SAMPLE_RATE * 0.5))], btype="band")
    swept = signal.lfilter(b, a, noise).astype(np.float32)
    bell = np.power(np.maximum(0.0, np.sin(np.pi * t)), 1.4).astype(np.float32)
    return swept * bell * vol * 2.5


def _sfx_chime(freqs: Sequence[float], dur: float = 0.38, vol: float = 0.12) -> np.ndarray:
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    sig = np.zeros(n, dtype=np.float32)
    for idx, f in enumerate(freqs):
        delay = int(idx * 0.045 * SAMPLE_RATE)
        if delay < n:
            tn = t[: n - delay]
            sig[delay:] += np.sin(2.0 * np.pi * float(f) * tn) * np.exp(-tn * 9.5)
    sig /= max(1, len(freqs))
    return sig.astype(np.float32) * vol * _env_adsr(n, 0.004, 0.06)


def _sfx_buzzer_wrong(dur: float = 0.40, vol: float = 0.14) -> np.ndarray:
    n = int(dur * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    sig = 0.6 * np.tanh(2.5 * np.sin(2 * np.pi * 145.0 * t)) + 0.4 * np.tanh(2.5 * np.sin(2 * np.pi * 153.0 * t))
    return sig.astype(np.float32) * vol * _env_adsr(n, 0.01, 0.08)


def build_subtitles_ep01(audio_dir: str, srt_out_path: str) -> List[SubtitleChunk]:
    all_words: List[WordTiming] = []
    for seg_i in range(1, 6):
        wav_path = os.path.join(audio_dir, f"vo_seg{seg_i}.wav")
        sr = SAMPLE_RATE
        pcm = None
        if os.path.exists(wav_path):
            with wave.open(wav_path, "rb") as wf:
                sr = wf.getframerate()
                pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

        seg_offset = SEG_STARTS_EP1[seg_i]
        for c_start, c_end, text in CLAUSE_SPECS_EP1[seg_i]:
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


def build_master_audio_ep01(audio_dir: str, out_wav_path: str) -> str:
    total_samples = int(round(TOTAL_DURATION_EP1 * SAMPLE_RATE))
    vo_track = np.zeros(total_samples, dtype=np.float32)
    b_hp, a_hp = signal.butter(2, 80.0 / (SAMPLE_RATE * 0.5), btype="high")

    for seg_i in range(1, 6):
        wav_path = os.path.join(audio_dir, f"vo_seg{seg_i}.wav")
        if not os.path.exists(wav_path):
            continue
        with wave.open(wav_path, "rb") as wf:
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        pcm = signal.lfilter(b_hp, a_hp, pcm).astype(np.float32)
        rms = float(np.sqrt(np.mean(pcm[np.abs(pcm) > 0.015] ** 2)))
        if rms > 1e-4:
            pcm = pcm * (0.21 / rms)
        i0 = int(round(SEG_STARTS_EP1[seg_i] * SAMPLE_RATE))
        n = min(len(pcm), total_samples - i0)
        vo_track[i0 : i0 + n] += pcm[:n]

    env_win = int(0.06 * SAMPLE_RATE)
    vo_abs = np.convolve(np.abs(vo_track), np.ones(env_win, dtype=np.float32) / env_win, mode="same")
    duck_gain = np.clip(1.0 - 2.6 * vo_abs, 0.38, 1.0).astype(np.float32)

    sfx_mix = np.zeros((total_samples, 2), dtype=np.float32)
    step_s = 60.0 / 116.0 / 2.0
    notes_hz = [220.0, 261.63, 329.63, 392.0, 329.63, 293.66]
    n_note = int(0.22 * SAMPLE_RATE)
    t_n = np.arange(n_note, dtype=np.float32) / SAMPLE_RATE
    t_cur, idx = 0.0, 0
    while t_cur < TOTAL_DURATION_EP1 - 0.3:
        f = notes_hz[idx % len(notes_hz)]
        pluck = (np.sin(2 * np.pi * f * t_n) + 0.25 * np.sin(3 * np.pi * f * t_n)) * np.exp(-t_n * 17.0)
        _add_clip(sfx_mix, pluck.astype(np.float32) * 0.048, t_cur, pan=0.18 * math.sin(idx))
        t_cur += step_s
        idx += 1

    sfx_mix *= duck_gain[:, None]
    _add_clip(sfx_mix, _sfx_chime([587.33, 880.0], dur=0.4, vol=0.14), 6.8, pan=-0.15)
    _add_clip(sfx_mix, _sfx_buzzer_wrong(0.42, vol=0.16), 13.8, pan=-0.1)
    _add_clip(sfx_mix, _sfx_whoosh(0.55, 160, 1400, vol=0.14), 16.5, pan=0.0)
    _add_clip(sfx_mix, _sfx_chime([523.25, 659.25, 783.99], dur=0.45, vol=0.13), 24.0, pan=0.0)
    _add_clip(sfx_mix, _sfx_whoosh(0.45, 300, 1900, vol=0.15), 41.2, pan=-0.1)
    _add_clip(sfx_mix, _sfx_chime([659.25, 987.77, 1318.5], dur=0.48, vol=0.14), 43.2, pan=-0.15)

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
