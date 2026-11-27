"""
Prepare V6 Audio, Exact 22-23 Micro-Shot DP Timings, -14.0 LUFS 48kHz Sound-Designed Mixes,
and `captions` Skill Green-Screen Clips for V6 High-Density Shorts (`KT-R07`, `KT-R08`, `KT-S15`, `KT-S16`).
"""

from __future__ import annotations
import json
import pathlib
import subprocess
import sys
import time

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / ".claude/skills/cartoon-3d-short/templates/audio"))

import dsp  # type: ignore
from src.knot_v6_scripts import V6_EPISODE_ORDER, V6_EPISODES
from tools.prepare_v5_audio import (
    CAPTIONS_PY,
    align_clauses_to_islands,
    detect_speech_islands,
    split_beat_clauses,
    words_from_clause_spans,
    write_srt_from_captions,
)

VO_DIR = ROOT / "assets/audio/v6_vo"
VO48_DIR = ROOT / "assets/audio/v6_vo48"
MIX_DIR = ROOT / "assets/audio/v6_mix"
TIMING_DIR = ROOT / "output/v6_timings"
CAP_DIR = ROOT / "output/v6_captions"

for d in (VO48_DIR, MIX_DIR, TIMING_DIR, CAP_DIR):
    d.mkdir(parents=True, exist_ok=True)


def convert_vo_safe_duration(src: pathlib.Path, dst: pathlib.Path, target_max_s: float = 55.2) -> float:
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(dst)],
        check=True,
    )
    # Trim excessive >0.20s TTS inter-sentence pauses to crisp 0.16s natural breaths (keeps 1.0x pitch/rate!)
    _, islands = detect_speech_islands(dst, noise_db=-38.0, min_sil=0.18)
    raw, sr = dsp.read_wav(str(dst))
    mono = raw[0]
    pieces = []
    gap = np.zeros(int(0.16 * sr), dtype=np.float64)
    for k, (s, e) in enumerate(islands):
        i0 = max(0, int((s - 0.025) * sr))
        i1 = min(len(mono), int((e + 0.025) * sr))
        seg = mono[i0:i1].copy()
        fn = min(240, len(seg) // 4)
        if fn > 8:
            seg[:fn] *= np.linspace(0.0, 1.0, fn)
            seg[-fn:] *= np.linspace(1.0, 0.0, fn)
        pieces.append(seg)
        if k < len(islands) - 1:
            pieces.append(gap)
    tight = np.concatenate(pieces) if pieces else mono
    dsp.write_wav(str(dst), tight[None, :], bits=16)
    d = len(tight) / sr
    if d > target_max_s:
        tempo = min(1.16, max(1.02, d / (target_max_s - 0.6)))
        tmp = dst.with_suffix(".tempo.wav")
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(dst), "-af", f"atempo={tempo:.4f}", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(tmp)],
            check=True,
        )
        tmp.replace(dst)
        pr2 = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(dst)],
            capture_output=True, text=True, check=True,
        )
        d = float(pr2.stdout.strip())
    return d


def build_v6_mix(ep_id: str, vo_wav: pathlib.Path, shots: list[dict], out_wav: pathlib.Path) -> float:
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

    t = np.arange(n) / dsp.SR
    seed = sum(ord(ch) for ch in ep_id) + 600
    rng = np.random.default_rng(seed)
    freqs = [110.0, 164.81, 220.0, 261.63, 329.63]
    bed_l = np.zeros(n, dtype=np.float64)
    bed_r = np.zeros(n, dtype=np.float64)
    for k, f0 in enumerate(freqs):
        lfo = 0.55 + 0.45 * np.sin(dsp.TAU * (0.12 + 0.03 * k) * t + k * 0.8)
        tone = np.sin(dsp.TAU * f0 * t) * lfo * (0.26 / (1 + 0.35 * k))
        pan = 0.3 + 0.4 * ((k % 2) * 2 - 1) * 0.5
        bed_l += tone * (1.0 - 0.25 * pan)
        bed_r += tone * (1.0 + 0.25 * pan)
    pulse_env = np.exp(-((t % 0.5) / 0.045)) * 0.055
    tick = dsp.bp(rng.standard_normal(n), 950.0, 2700.0) * pulse_env
    bed = np.stack([dsp.lp(bed_l, 950.0) + tick, dsp.lp(bed_r, 950.0) + tick])
    env_win = int(0.08 * dsp.SR)
    vo_abs = np.convolve(np.abs(vo), np.ones(env_win) / env_win, mode="same")
    duck = 1.0 / (1.0 + 9.5 * np.clip(vo_abs / 0.08, 0.0, 1.5))
    bed *= (0.080 * (0.36 + 0.64 * duck))

    sfx_l = np.zeros(n, dtype=np.float64)
    sfx_r = np.zeros(n, dtype=np.float64)

    for idx, sh in enumerate(shots):
        i0 = max(0, min(n - 1, int(float(sh["start_s"]) * dsp.SR)))
        m = min(int(0.36 * dsp.SR), n - i0)
        if m < 200:
            continue
        lt = np.arange(m) / dsp.SR
        rec = sh["recipe"]
        if idx == 0:
            sig = (
                np.sin(dsp.TAU * (92.0 * np.exp(-lt * 5.5) + 38.0) * lt) * np.exp(-lt * 7.5) * 0.24
                + dsp.bp(rng.standard_normal(m), 500.0, 3200.0) * np.exp(-((lt - 0.06) ** 2) / 0.003) * 0.12
            )
        elif "fail_" in rec:
            sig = (
                np.sin(dsp.TAU * 130.0 * np.exp(-lt * 8.0) * lt) * np.exp(-lt * 10.0) * 0.16
                + dsp.bp(rng.standard_normal(m), 350.0, 1800.0) * np.exp(-lt * 14.0) * 0.11
            )
        elif "oh_jadi" in rec:
            sig = (
                np.sin(dsp.TAU * 659.25 * lt) * np.exp(-lt * 6.5) * 0.11
                + np.sin(dsp.TAU * 987.77 * lt) * np.exp(-lt * 9.0) * 0.07
            )
        elif "cta_white" in rec:
            sig = (
                dsp.bp(rng.standard_normal(m), 1400.0, 5000.0) * np.exp(-lt * 48.0) * 0.18
                + np.sin(dsp.TAU * 523.25 * lt) * np.exp(-lt * 12.0) * 0.09
            )
        else:
            # Light crisp shutter/whoosh for each 2.4s shot cut
            sig = (
                np.sin(dsp.TAU * 155.0 * np.exp(-lt * 12.0) * lt) * np.exp(-lt * 18.0) * 0.085
                + dsp.bp(rng.standard_normal(m), 800.0, 2800.0) * np.exp(-lt * 28.0) * 0.055
            )
        pan_alt = -0.06 if idx % 2 == 0 else 0.06
        sfx_l[i0:i0 + m] += sig * (1.0 - pan_alt)
        sfx_r[i0:i0 + m] += sig * (1.0 + pan_alt)

    mix = vo_st + bed + np.stack([sfx_l, sfx_r])
    fade_n = int(0.18 * dsp.SR)
    mix[:, -fade_n:] *= np.linspace(1.0, 0.0, fade_n)

    mix = dsp.norm_to(mix, -14.0, mode="integrated")
    peak_lin = dsp.dbg(-1.3)
    mix = np.tanh(mix / peak_lin) * peak_lin
    mix = dsp.norm_to(mix, -14.0, mode="integrated")
    lim = dsp.dbg(-1.05)
    mix = np.clip(mix, -lim, lim)

    dsp.write_wav(str(out_wav), mix, bits=16)
    lufs = dsp.integrated(mix)
    tp = dsp.true_peak(mix)
    print(f"  [{ep_id}] mix={dur:.2f}s | shots={len(shots)} | LUFS={lufs:.2f} | TP={tp:.2f} dBTP")
    return dur


def main() -> None:
    for ep_id in V6_EPISODE_ORDER:
        spec = V6_EPISODES[ep_id]
        src_vo = VO_DIR / f"{ep_id}_vo.wav"
        vo48 = VO48_DIR / f"{ep_id}_vo.wav"
        convert_vo_safe_duration(src_vo, vo48, target_max_s=55.0)
        vo_dur, islands = detect_speech_islands(vo48, noise_db=-38.0, min_sil=0.11)

        clauses: list[dict] = []
        for s_idx, sh in enumerate(spec["shots"]):
            clauses.extend(split_beat_clauses(s_idx, sh["text"]))

        spans = align_clauses_to_islands(clauses, islands)
        words = words_from_clause_spans(clauses, spans)

        raw_shots = []
        for s_idx, sh in enumerate(spec["shots"]):
            s_spans = [sp for cl, sp in zip(clauses, spans) if cl["beat_idx"] == s_idx]
            bs = s_spans[0][0]
            be = s_spans[-1][1]
            raw_shots.append({
                "index": s_idx,
                "id": sh["id"],
                "recipe": sh["recipe"],
                "badge": sh["Badge"],
                "text": sh["text"],
                "ptr": [list(sh["ptr"][0]), sh["ptr"][1]],
                "objects": sh["objects"],
                "speech_start_s": round(bs, 3),
                "speech_end_s": round(be, 3),
            })

        total_dur = round(vo_dur + 0.45, 3)
        assert total_dur < 58.0, f"{ep_id} exceeds Shorts cap: {total_dur}s"

        for i, rs in enumerate(raw_shots):
            if i == 0:
                rs["start_s"] = 0.0
            else:
                prev_end = raw_shots[i - 1]["speech_end_s"]
                cur_start = rs["speech_start_s"]
                cut = round(0.5 * (prev_end + cur_start), 3)
                # Ensure minimum 0.9s per shot so cuts never flash-strobe
                if cut - raw_shots[i - 1]["start_s"] < 0.90:
                    cut = round(raw_shots[i - 1]["start_s"] + 0.95, 3)
                raw_shots[i - 1]["end_s"] = cut
                rs["start_s"] = cut
        raw_shots[-1]["end_s"] = total_dur

        mix_wav = MIX_DIR / f"{ep_id}_mix.wav"
        actual_dur = build_v6_mix(ep_id, vo48, raw_shots, mix_wav)
        raw_shots[-1]["end_s"] = round(actual_dur, 3)
        total_frames = int(round(actual_dur * 30))

        # Frame-exact contiguous shot ranges for short_qa.py & beat_sheet.py
        qa_shots = []
        for i, rs in enumerate(raw_shots):
            fa = 0 if i == 0 else qa_shots[-1]["b"]
            fb = total_frames if i == len(raw_shots) - 1 else max(fa + 18, int(round(rs["end_s"] * 30)))
            rs["frame_a"] = fa
            rs["frame_b"] = fb
            qa_shots.append({
                "id": i + 1,
                "name": f"{rs['id']}_{rs['recipe']}",
                "a": fa,
                "b": fb,
                "note": rs["badge"],
            })

        (TIMING_DIR / f"{ep_id}_words.json").write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
        (TIMING_DIR / f"{ep_id}_shots.json").write_text(json.dumps({"shots": qa_shots}, ensure_ascii=False, indent=2), encoding="utf-8")
        (TIMING_DIR / f"{ep_id}_timings.json").write_text(
            json.dumps({
                "episode_id": ep_id,
                "duration_s": round(actual_dur, 3),
                "fps": 30,
                "total_frames": total_frames,
                "shot_count": len(raw_shots),
                "shots": raw_shots,
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # Render captions_green.mp4 via installed `captions` skill (--max-width 0.63 -> 0 safe-zone warnings)
    for ep_id in V6_EPISODE_ORDER:
        tp = json.loads((TIMING_DIR / f"{ep_id}_timings.json").read_text(encoding="utf-8"))
        wp = TIMING_DIR / f"{ep_id}_words.json"
        cd = CAP_DIR / ep_id
        cd.mkdir(parents=True, exist_ok=True)
        pr = subprocess.run(
            [
                sys.executable, str(CAPTIONS_PY), str(wp), str(cd),
                "--w", "1080", "--h", "1920", "--fps", "30",
                "--max-width", "0.63", "--dur", f"{tp['duration_s']:.3f}",
            ],
            capture_output=True, text=True, check=True,
        )
        warns = [ln for ln in pr.stdout.splitlines() if "WARNING" in ln]
        print(f"  [captions {ep_id}] shots={tp['shot_count']} | dur={tp['duration_s']}s | warnings={len(warns)}")
        assert len(warns) == 0, f"Safe-zone caption warning on {ep_id}: {warns}"
        srt_slug = ep_id.lower().replace("-", "_")
        write_srt_from_captions(cd / "captions.json", ROOT / "output" / f"{srt_slug}_shorts.srt")


if __name__ == "__main__":
    main()
