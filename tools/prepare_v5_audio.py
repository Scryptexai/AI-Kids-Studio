"""
Prepare V5 Audio, Exact DP Beat/Word Timings, -14 LUFS 48kHz Sound-Designed Mixes,
and `captions` Skill Green-Screen Clips for all 12 Rebuilt PDF Shorts.
"""

from __future__ import annotations
import json
import math
import os
import pathlib
import re
import subprocess
import sys

import numpy as np
from scipy import signal

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / ".claude/skills/cartoon-3d-short/templates/audio"))

import dsp  # type: ignore
from src.knot_v5_scripts import V5_REBUILD_ORDER, V5_SHORTS_SPECS

VO_DIR = ROOT / "assets/audio/v5_vo"
VO48_DIR = ROOT / "assets/audio/v5_vo48"
MIX_DIR = ROOT / "assets/audio/v5_mix"
TIMING_DIR = ROOT / "output/v5_timings"
CAP_DIR = ROOT / "output/v5_captions"
CAPTIONS_PY = ROOT / ".claude/skills/cartoon-3d-short/templates/scripts/captions.py"

for d in (VO48_DIR, MIX_DIR, TIMING_DIR, CAP_DIR):
    d.mkdir(parents=True, exist_ok=True)


def to_48k_mono(src: pathlib.Path, dst: pathlib.Path, ss: float | None = None, to: float | None = None) -> None:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.4f}"]
    if to is not None:
        cmd += ["-to", f"{to:.4f}"]
    cmd += ["-i", str(src), "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(dst)]
    subprocess.run(cmd, check=True)
    pr = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(dst)],
        capture_output=True, text=True, check=True
    )
    d = float(pr.stdout.strip())
    if d > 54.2:
        tempo = min(1.08, max(1.04, d / 53.5))
        tmp = dst.with_suffix(".tempo.wav")
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(dst), "-af", f"atempo={tempo:.4f}", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(tmp)],
            check=True,
        )
        tmp.replace(dst)


def detect_speech_islands(wav_path: pathlib.Path, noise_db: float = -38.0, min_sil: float = 0.14) -> tuple[float, list[tuple[float, float]]]:
    pr = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(wav_path)],
        capture_output=True, text=True, check=True
    )
    dur = float(pr.stdout.strip())

    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(wav_path), "-af", f"silencedetect=noise={noise_db}dB:d={min_sil}", "-f", "null", "-"],
        capture_output=True, text=True, check=True
    )
    log = proc.stderr
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", log)]

    silences: list[tuple[float, float]] = []
    for i, st in enumerate(starts):
        en = ends[i] if i < len(ends) else dur
        silences.append((st, en))

    islands: list[tuple[float, float]] = []
    cur = 0.0
    for st, en in silences:
        if st - cur > 0.04:
            islands.append((cur, st))
        cur = en
    if dur - cur > 0.04:
        islands.append((cur, dur))
    return dur, islands


def split_paired_wav(pair_wav: pathlib.Path, ep_a: str, ep_b: str) -> None:
    """
    Find the short 'Bagian dua.' island (~0.65s - 1.75s) near the middle (35%..65% of file)
    surrounded by two silences, and export clean 48kHz WAVs for ep_a and ep_b.
    """
    dur, islands = detect_speech_islands(pair_wav, noise_db=-38.0, min_sil=0.16)
    lo, hi = dur * 0.36, dur * 0.64
    candidates = [
        (idx, s, e)
        for idx, (s, e) in enumerate(islands)
        if lo <= 0.5 * (s + e) <= hi and 0.45 <= (e - s) <= 1.85 and 0 < idx < len(islands) - 1
    ]
    if not candidates:
        raise RuntimeError(f"Could not find 'Bagian dua.' marker in {pair_wav}; islands={islands}")
    # Pick shortest island closest to center
    mid = dur * 0.50
    idx, ms, me = min(candidates, key=lambda t: ((t[2] - t[1]) * 2.0 + abs(0.5 * (t[1] + t[2]) - mid)))
    prev_end = islands[idx - 1][1]
    next_start = islands[idx + 1][0]

    a_end = min(ms - 0.04, prev_end + 0.18)
    b_start = max(me + 0.04, next_start - 0.08)

    out_a = VO48_DIR / f"{ep_a}_vo.wav"
    out_b = VO48_DIR / f"{ep_b}_vo.wav"
    to_48k_mono(pair_wav, out_a, ss=0.0, to=a_end)
    to_48k_mono(pair_wav, out_b, ss=b_start, to=dur)
    print(f"Split {pair_wav.name}: {ep_a} [0..{a_end:.2f}s], marker [{ms:.2f}..{me:.2f}s], {ep_b} [{b_start:.2f}..{dur:.2f}s]")


def count_syllables_id(text: str) -> int:
    # Expand numbers slightly & count vowel nuclei for Indonesian + English acronyms
    s = text.lower()
    acronyms = re.findall(r"\b(?:mcb|eps|prv|sni|asme|bbm|tmd)\b", s)
    bonus = sum(len(a) * 2 for a in acronyms)
    vowels = len(re.findall(r"[aiueo]+", s))
    return max(1, vowels + bonus)


def split_beat_clauses(beat_idx: int, text: str) -> list[dict]:
    # Protect decimal dots inside standards like A17.1 before splitting clauses
    safe = re.sub(r"(?<=\d)\.(?=\d)", "<DOT>", text)
    parts = re.findall(r"[^,:;—.!?]+[,:;—.!?]*", safe)
    clauses = []
    for p in parts:
        p = p.replace("<DOT>", ".").strip()
        if not p:
            continue
        clauses.append({
            "beat_idx": beat_idx,
            "text": p,
            "syllables": count_syllables_id(p),
        })
    return clauses


def align_clauses_to_islands(clauses: list[dict], islands: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """
    Global DP grouping M speech islands into N clauses (or merging adjacent clauses when spoken without pause).
    Returns exact (start_s, end_s) for each clause.
    """
    N = len(clauses)
    M = len(islands)
    total_syl = sum(c["syllables"] for c in clauses)
    total_spk = sum(e - s for s, e in islands)
    sec_per_syl = total_spk / max(1, total_syl)

    # DP over (i in 0..N, j in 0..M) allowing:
    #  - 1 clause -> k islands (1 <= k <= 4)
    #  - k clauses -> 1 island (1 <= k <= 4) when punctuation wasn't paused
    INF = 1e18
    dp = [[INF] * (M + 1) for _ in range(N + 1)]
    back: list[list[tuple[int, int] | None]] = [[None] * (M + 1) for _ in range(N + 1)]
    dp[0][0] = 0.0

    for i in range(N + 1):
        for j in range(M + 1):
            if dp[i][j] >= INF:
                continue
            # 1 clause -> k islands
            if i < N:
                exp_d = clauses[i]["syllables"] * sec_per_syl
                for k in range(1, min(5, M - j + 1)):
                    act_d = sum(islands[j + u][1] - islands[j + u][0] for u in range(k))
                    gap_pen = 0.35 * (k - 1)
                    err = abs(act_d - exp_d) / max(0.25, exp_d) + gap_pen
                    if dp[i][j] + err < dp[i + 1][j + k]:
                        dp[i + 1][j + k] = dp[i][j] + err
                        back[i + 1][j + k] = (i, j)
            # k clauses -> 1 island
            if j < M:
                act_d = islands[j][1] - islands[j][0]
                for k in range(2, min(5, N - i + 1)):
                    exp_d = sum(clauses[i + u]["syllables"] * sec_per_syl for u in range(k))
                    merge_pen = 0.28 * (k - 1)
                    err = abs(act_d - exp_d) / max(0.25, exp_d) + merge_pen
                    if dp[i][j] + err < dp[i + k][j + 1]:
                        dp[i + k][j + 1] = dp[i][j] + err
                        back[i + k][j + 1] = (i, j)

    if dp[N][M] >= INF:
        # Fallback proportional across full span
        s0, e0 = islands[0][0], islands[-1][1]
        out = []
        cur = s0
        for c in clauses:
            d = (e0 - s0) * (c["syllables"] / total_syl)
            out.append((cur, cur + d))
            cur += d
        return out

    steps: list[tuple[int, int, int, int]] = []
    ci, cj = N, M
    while ci > 0 or cj > 0:
        pi, pj = back[ci][cj]  # type: ignore
        steps.append((pi, ci, pj, cj))
        ci, cj = pi, pj
    steps.reverse()

    clause_spans: list[tuple[float, float]] = [(0.0, 0.0)] * N
    for i0, i1, j0, j1 in steps:
        seg_start = islands[j0][0]
        seg_end = islands[j1 - 1][1]
        if i1 - i0 == 1:
            clause_spans[i0] = (seg_start, seg_end)
        else:
            sub_syl = sum(clauses[u]["syllables"] for u in range(i0, i1))
            cur = seg_start
            span_d = seg_end - seg_start
            for u in range(i0, i1):
                d = span_d * (clauses[u]["syllables"] / max(1, sub_syl))
                clause_spans[u] = (cur, cur + d)
                cur += d
    return clause_spans


def words_from_clause_spans(clauses: list[dict], spans: list[tuple[float, float]]) -> list[dict]:
    words_out: list[dict] = []
    for c, (cs, ce) in zip(clauses, spans):
        toks = [t for t in c["text"].split() if t.strip()]
        if not toks:
            continue
        syls = [max(1, count_syllables_id(t)) for t in toks]
        tot = sum(syls)
        dur = max(0.06, ce - cs)
        cur = cs
        for idx, (tok, sy) in enumerate(zip(toks, syls)):
            wd = dur * (sy / tot)
            we = ce if idx == len(toks) - 1 else cur + wd * 0.96
            words_out.append({
                "w": tok,
                "s": round(cur, 3),
                "e": round(max(cur + 0.04, we), 3),
            })
            cur += wd
    return words_out


def fmt_srt_ts(sec: float) -> str:
    ms_total = max(0, int(round(sec * 1000)))
    hh = ms_total // 3600000
    rem = ms_total % 3600000
    mm = rem // 60000
    rem %= 60000
    ss = rem // 1000
    ms = rem % 1000
    return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"


def write_srt_from_captions(captions_json: pathlib.Path, srt_path: pathlib.Path) -> None:
    chunks = json.loads(captions_json.read_text(encoding="utf-8"))
    lines = []
    for i, ch in enumerate(chunks, 1):
        lines.append(f"{i}\n{fmt_srt_ts(ch['s'])} --> {fmt_srt_ts(ch['e'])}\n{ch['text']}\n")
    srt_path.write_text("\n".join(lines), encoding="utf-8")


def build_sound_designed_mix(ep_id: str, vo_wav: pathlib.Path, beats: list[dict], out_wav: pathlib.Path) -> float:
    """
    Build 48 kHz stereo -14.0 LUFS mix:
      - Clean voice-00 center channel with gentle presence shelf
      - Warm cinematic documentary underscore (ducked under voice)
      - Beat-locked physical transient cues at each beat cut (whoosh, metallic click, sub thump, chime)
    """
    vo_raw, sr = dsp.read_wav(str(vo_wav))
    assert sr == dsp.SR
    vo_mono = vo_raw[0]
    pad_tail = int(0.45 * dsp.SR)
    n = len(vo_mono) + pad_tail
    dur = n / dsp.SR

    vo = np.zeros(n, dtype=np.float64)
    vo[:len(vo_mono)] = vo_mono
    vo = dsp.hp(vo, 85.0, order=2)
    vo = dsp.peq(vo, 3200.0, 2.0, q=1.1)
    vo_st = np.stack([vo, vo])

    # Warm stereo curiosity bed (C minor9 / Fadd9 pulse, ducked -18 dB under voice)
    t = np.arange(n) / dsp.SR
    seed = sum(ord(ch) for ch in ep_id)
    rng = np.random.default_rng(seed)
    freqs = [110.0, 164.81, 220.0, 261.63, 329.63]
    bed_l = np.zeros(n, dtype=np.float64)
    bed_r = np.zeros(n, dtype=np.float64)
    for k, f0 in enumerate(freqs):
        lfo = 0.55 + 0.45 * np.sin(dsp.TAU * (0.11 + 0.03 * k) * t + k * 0.9)
        tone = np.sin(dsp.TAU * f0 * t) * lfo * (0.28 / (1 + 0.35 * k))
        pan = 0.3 + 0.4 * ((k % 2) * 2 - 1) * 0.5
        bed_l += tone * (1.0 - 0.25 * pan)
        bed_r += tone * (1.0 + 0.25 * pan)
    # Subtle rhythmic tick at 120 BPM (0.5s)
    pulse_env = np.exp(-((t % 0.5) / 0.045)) * 0.06
    tick = dsp.bp(rng.standard_normal(n), 900.0, 2600.0) * pulse_env
    bed = np.stack([dsp.lp(bed_l, 950.0) + tick, dsp.lp(bed_r, 950.0) + tick])
    # Duck bed when voice is active
    env_win = int(0.08 * dsp.SR)
    vo_abs = np.convolve(np.abs(vo), np.ones(env_win) / env_win, mode="same")
    duck = 1.0 / (1.0 + 9.0 * np.clip(vo_abs / 0.08, 0.0, 1.5))
    bed *= (0.085 * (0.38 + 0.62 * duck))

    # Beat-locked foley/transient accents (-12 dB beneath voice)
    sfx_l = np.zeros(n, dtype=np.float64)
    sfx_r = np.zeros(n, dtype=np.float64)

    def add_cue(start_s: float, kind: str) -> None:
        i0 = max(0, min(n - 1, int(start_s * dsp.SR)))
        m = min(int(0.55 * dsp.SR), n - i0)
        if m < 200:
            return
        lt = np.arange(m) / dsp.SR
        if kind == "hook":
            # Crisp sub impact + airy whoosh
            sub = np.sin(dsp.TAU * (92.0 * np.exp(-lt * 5.5) + 38.0) * lt) * np.exp(-lt * 7.0) * 0.28
            wh = dsp.bp(rng.standard_normal(m), 500.0, 3200.0) * np.exp(-((lt - 0.07) ** 2) / 0.004) * 0.14
            sig = sub + wh
        elif kind == "closer":
            # Bright 'aha' harmonic chime (E5 + B5)
            sig = (
                np.sin(dsp.TAU * 659.25 * lt) * np.exp(-lt * 6.0) * 0.12
                + np.sin(dsp.TAU * 987.77 * lt) * np.exp(-lt * 8.5) * 0.08
            )
        elif kind == "cta":
            # Tactile white-button click + warm rise
            clk = dsp.bp(rng.standard_normal(m), 1200.0, 4800.0) * np.exp(-lt * 45.0) * 0.20
            pop = np.sin(dsp.TAU * 523.25 * lt) * np.exp(-lt * 12.0) * 0.10
            sig = clk + pop
        else:
            # Subtle mechanical camera-cut transient
            sig = (
                np.sin(dsp.TAU * 145.0 * np.exp(-lt * 9.0) * lt) * np.exp(-lt * 14.0) * 0.14
                + dsp.bp(rng.standard_normal(m), 700.0, 2400.0) * np.exp(-lt * 22.0) * 0.08
            )
        sfx_l[i0:i0 + m] += sig * 0.95
        sfx_r[i0:i0 + m] += sig * 1.05

    for idx, b in enumerate(beats):
        kind = "hook" if idx == 0 else ("closer" if b["id"] == "closer" else ("cta" if b["id"] == "cta" else "cut"))
        add_cue(float(b["start_s"]), kind)

    mix = vo_st + bed + np.stack([sfx_l, sfx_r])
    # Fade last 180ms cleanly
    fade_n = int(0.18 * dsp.SR)
    mix[:, -fade_n:] *= np.linspace(1.0, 0.0, fade_n)

    # Normalize to -14.0 LUFS integrated with soft ceiling at -1.2 dBTP
    mix = dsp.norm_to(mix, -14.0, mode="integrated")
    peak_lin = dsp.dbg(-1.3)
    mix = np.tanh(mix / peak_lin) * peak_lin
    mix = dsp.norm_to(mix, -14.0, mode="integrated")
    # Final safety clip at -1.0 dBFS
    lim = dsp.dbg(-1.05)
    mix = np.clip(mix, -lim, lim)

    dsp.write_wav(str(out_wav), mix, bits=16)
    lufs = dsp.integrated(mix)
    tp = dsp.true_peak(mix)
    print(f"  [{ep_id}] mix={dur:.2f}s | LUFS={lufs:.2f} | TP={tp:.2f} dBTP")
    return dur


def main() -> None:
    # 1. Split paired WAVs & convert dedicated WAVs to 48kHz mono
    split_paired_wav(VO_DIR / "PAIR_S08_S10.wav", "KT-S08", "KT-S10")
    split_paired_wav(VO_DIR / "PAIR_S13_R02.wav", "KT-S13", "KT-R02")

    for ep_id in V5_REBUILD_ORDER:
        dst = VO48_DIR / f"{ep_id}_vo.wav"
        if ep_id in {"KT-S08", "KT-S10", "KT-S13", "KT-R02"}:
            assert dst.exists(), f"Missing split wav {dst}"
        else:
            src = VO_DIR / f"{ep_id}_vo.wav"
            to_48k_mono(src, dst)

    # 2. Align clauses/beats, build words.json, mix -14 LUFS audio, and render captions_green.mp4
    for ep_id in V5_REBUILD_ORDER:
        spec = V5_SHORTS_SPECS[ep_id]
        vo_wav = VO48_DIR / f"{ep_id}_vo.wav"
        vo_dur, islands = detect_speech_islands(vo_wav, noise_db=-38.0, min_sil=0.14)

        clauses: list[dict] = []
        for b_idx, beat in enumerate(spec["beats"]):
            clauses.extend(split_beat_clauses(b_idx, beat["text"]))

        spans = align_clauses_to_islands(clauses, islands)
        words = words_from_clause_spans(clauses, spans)

        # Compute contiguous beat intervals covering [0, total_dur] with zero dead frames
        raw_beats = []
        for b_idx, beat in enumerate(spec["beats"]):
            b_spans = [sp for cl, sp in zip(clauses, spans) if cl["beat_idx"] == b_idx]
            bs = b_spans[0][0]
            be = b_spans[-1][1]
            raw_beats.append({
                "index": b_idx,
                "id": beat["id"],
                "callout": beat["callout"],
                "cam": beat["cam"],
                "text": beat["text"],
                "speech_start_s": round(bs, 3),
                "speech_end_s": round(be, 3),
            })

        total_dur = round(vo_dur + 0.45, 3)
        assert total_dur < 57.5, f"{ep_id} exceeds Shorts safety cap: {total_dur}s"

        for i, rb in enumerate(raw_beats):
            if i == 0:
                rb["start_s"] = 0.0
            else:
                # Cut right in the natural breath midpoint between previous beat speech_end and current speech_start
                prev_end = raw_beats[i - 1]["speech_end_s"]
                cur_start = rb["speech_start_s"]
                cut = round(0.5 * (prev_end + cur_start), 3)
                raw_beats[i - 1]["end_s"] = cut
                rb["start_s"] = cut
        raw_beats[-1]["end_s"] = total_dur

        mix_wav = MIX_DIR / f"{ep_id}_mix.wav"
        actual_dur = build_sound_designed_mix(ep_id, vo_wav, raw_beats, mix_wav)
        raw_beats[-1]["end_s"] = round(actual_dur, 3)

        words_path = TIMING_DIR / f"{ep_id}_words.json"
        words_path.write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")

        timing_payload = {
            "episode_id": ep_id,
            "duration_s": round(actual_dur, 3),
            "fps": 30,
            "total_frames": int(round(actual_dur * 30)),
            "speech_islands": len(islands),
            "clauses": len(clauses),
            "beats": raw_beats,
        }
        (TIMING_DIR / f"{ep_id}_timings.json").write_text(
            json.dumps(timing_payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            f"  [{ep_id}] {len(clauses)} clauses -> {len(islands)} islands | "
            f"beats={[(b['id'], round(b['start_s'],2), round(b['end_s'],2)) for b in raw_beats]}"
        )

    # 3. Run captions.py 3-at-a-time (--max-width 0.63 guarantees zero safe-zone warnings)
    jobs = []
    for ep_id in V5_REBUILD_ORDER:
        tp = json.loads((TIMING_DIR / f"{ep_id}_timings.json").read_text(encoding="utf-8"))
        words_path = TIMING_DIR / f"{ep_id}_words.json"
        ep_cap_dir = CAP_DIR / ep_id
        ep_cap_dir.mkdir(parents=True, exist_ok=True)
        jobs.append((ep_id, words_path, ep_cap_dir, tp["duration_s"]))

    active: list[tuple[str, pathlib.Path, subprocess.Popen]] = []
    idx = 0
    while idx < len(jobs) or active:
        while idx < len(jobs) and len(active) < 3:
            ep_id, wp, cd, dur_s = jobs[idx]
            idx += 1
            p = subprocess.Popen(
                [
                    sys.executable,
                    str(CAPTIONS_PY),
                    str(wp),
                    str(cd),
                    "--w", "1080",
                    "--h", "1920",
                    "--fps", "30",
                    "--max-width", "0.63",
                    "--dur", f"{dur_s:.3f}",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            active.append((ep_id, cd, p))
        still = []
        for ep_id, cd, p in active:
            rc = p.poll()
            if rc is None:
                still.append((ep_id, cd, p))
            else:
                out_txt = p.stdout.read() if p.stdout else ""
                if rc != 0:
                    raise RuntimeError(f"captions.py failed for {ep_id}:\n{out_txt}")
                warns = [ln for ln in out_txt.splitlines() if "WARNING" in ln]
                hdr = next((ln for ln in out_txt.splitlines() if ln.startswith("font ")), "")
                print(f"  [captions {ep_id}] {hdr} | warnings={len(warns)}")
                for wln in warns:
                    print("   ", wln)
                srt_slug = ep_id.lower().replace("-", "_")
                write_srt_from_captions(cd / "captions.json", ROOT / "output" / f"{srt_slug}_shorts.srt")
        active = still
        if active:
            import time
            time.sleep(0.4)


if __name__ == "__main__":
    main()
