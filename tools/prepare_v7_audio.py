"""
Prepare V7 storytelling audio: tighten + tempo-safe VO (<58 s), DP shot timings for the 20+ story shots,
-14.0 LUFS 48 kHz sound-designed mixes, and `captions` skill word-pop clips (`--max-width 0.63`).

Clone of `tools/prepare_v6_audio.py` driven by `src.knot_v7_story_scripts.V7_EPISODES`; writes into the
`v7_*` directories so V6 artefacts stay intact. Each timing shot also carries `scene`, `scene_idx`,
`p_range`, `boundary` and `closing` for the V7 director.
"""

from __future__ import annotations
import json
import pathlib
import subprocess
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / ".claude/skills/cartoon-3d-short/templates/audio"))

import dsp  # type: ignore
from src.knot_v7_story_scripts import V7_EPISODE_ORDER, V7_EPISODES
from tools.prepare_v5_audio import (
    CAPTIONS_PY,
    align_clauses_to_islands,
    detect_speech_islands,
    split_beat_clauses,
    words_from_clause_spans,
    write_srt_from_captions,
)
from tools.prepare_v6_audio import build_v6_mix, convert_vo_safe_duration

VO_DIR = ROOT / "assets/audio/v7_vo"
VO48_DIR = ROOT / "assets/audio/v7_vo48"
MIX_DIR = ROOT / "assets/audio/v7_mix"
TIMING_DIR = ROOT / "output/v7_timings"
CAP_DIR = ROOT / "output/v7_captions"

for d in (VO48_DIR, MIX_DIR, TIMING_DIR, CAP_DIR):
    d.mkdir(parents=True, exist_ok=True)


def build_v7_mix(ep_id: str, vo_wav: pathlib.Path, shots: list[dict], out_wav: pathlib.Path) -> float:
    """V6 mix chain; story beats map to SFX: hook impact, failure thuds, climax chime, CTA click."""
    staged = []
    for i, sh in enumerate(shots):
        rec = sh["recipe"]
        if sh.get("closing"):
            rec = "cut_" + rec.replace("oh_jadi", "close")
        staged.append({**sh, "recipe": rec})
    return build_v6_mix(ep_id, vo_wav, staged, out_wav)


def main() -> None:
    for ep_id in V7_EPISODE_ORDER:
        spec = V7_EPISODES[ep_id]
        src_vo = VO_DIR / f"{ep_id}_vo.wav"
        vo48 = VO48_DIR / f"{ep_id}_vo.wav"
        d_vo = convert_vo_safe_duration(src_vo, vo48, target_max_s=55.0)
        print(f"  [{ep_id}] tightened VO = {d_vo:.2f}s")
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
                "scene": sh["scene"],
                "scene_idx": sh["scene_idx"],
                "p_range": sh["p_range"],
                "boundary": sh["boundary"],
                "closing": sh["closing"],
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
        actual_dur = build_v7_mix(ep_id, vo48, raw_shots, mix_wav)
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
    for ep_id in V7_EPISODE_ORDER:
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
