"""
Knot Theory V7 Storytelling Director (`src/knot_v7_director.py`)

Re-uses the approved V6 high-density 3D scenes unchanged; only the story layer differs:
  - shot list / timings come from `output/v7_timings/<EP>_timings.json` (20+ story shots, minimum not target)
  - each story shot points at a V6 scene (`scene_idx`) and an animation window (`p_range`), so one scene can
    carry several story beats (e.g. "before the crack" / "after the crack") with continuous animation
  - badges, pointer labels, hook banner and A/B card come from `src.knot_v7_story_scripts.V7_EPISODES`
  - boundary beats (`boundary=True`) still raise the amber "BATAS AKURASI" HUD badge, even though the
    narration now introduces them naturally ("Tapi ...")
"""

from __future__ import annotations

import json
import pathlib
from typing import Dict, Optional

from PIL import Image, ImageDraw, ImageFont

import src.knot_v6_director as v6
from src.knot_v6_director import (
    EP_STYLE, FILL_Y, FOCUS_Y, FONT_BOLD, MIN_OBJECTS, MIN_SHOTS, ShotStateCache, V6OverlayArtist,
    _hex_rgba, _wrap, auto_frame, render_frame,
)
from src.knot_v6_objects import build_v6_shot_scene
from src.knot_v7_story_scripts import V7_EPISODES
from src.renderer3d import SceneRenderer

TIMING_DIR = "output/v7_timings"


class V7OverlayArtist(V6OverlayArtist):
    def __init__(self, ep_id: str, w: int = 1080, h: int = 1920):
        super().__init__(ep_id, w, h)
        self.ep = V7_EPISODES[ep_id]
        self.q, self.opt_a, self.opt_b = v6.parse_ab_options(self.ep["cta_question"])


class V7ShotStateCache(ShotStateCache):
    """Story shot -> V6 scene builder sampled inside the story shot's animation window."""

    def __init__(self, ep_id: str):
        super().__init__(ep_id)
        self.story = V7_EPISODES[ep_id]["shots"]

    def load(self, shot_idx: int) -> None:
        if shot_idx == self.idx:
            return
        self.idx = shot_idx
        st = self.story[shot_idx]
        scene_idx = int(st["scene_idx"])
        p0, p1 = (float(x) for x in st["p_range"])
        n = v6.N_STATES
        raw = []
        for k in range(n + 1):
            p = p0 + (p1 - p0) * (k / float(n))
            mesh, eye, tgt, fov, reg = build_v6_shot_scene(self.ep_id, scene_idx, p)
            self.episode_ids |= reg.ids
            raw.append((mesh, eye, tgt, fov, reg))
        mid_reg = raw[n // 2][4]
        fb = mid_reg.focus_bounds(list(st["objects"]))
        fy, fill_y = (0.34, 0.30) if st["recipe"] in ("ab_poll_stage", "comment_wave") else (FOCUS_Y, FILL_Y)
        self.states = [auto_frame(raw, k, fb, fy, fill_y) + (len(raw[k][4].ids),) for k in range(n + 1)]
        self.focus = fb
        self.mid_reg = mid_reg


def load_timing(root: pathlib.Path, ep_id: str) -> dict:
    timing = json.loads((root / TIMING_DIR / f"{ep_id}_timings.json").read_text(encoding="utf-8"))
    assert int(timing["shot_count"]) >= MIN_SHOTS, f"{ep_id}: only {timing['shot_count']} shots (< {MIN_SHOTS})"
    story = V7_EPISODES[ep_id]["shots"]
    assert [s["id"] for s in timing["shots"]] == [s["id"] for s in story], f"{ep_id}: timings out of sync with V7 script"
    return timing


def _thumb_shot(shots: list) -> int:
    for i, s in enumerate(shots):
        if s.get("scene") == "s03":
            return i
    return min(2, len(shots) - 1)


def render_v7_episode(ep_id: str, root: pathlib.Path, out_mp4: Optional[pathlib.Path] = None) -> dict:
    import subprocess

    timing = load_timing(root, ep_id)
    shots = timing["shots"]
    fps = int(timing["fps"])
    total = int(timing["total_frames"])
    mix_wav = root / "assets/audio/v7_mix" / f"{ep_id}_mix.wav"
    cap_mp4 = root / "output/v7_captions" / ep_id / "captions_green.mp4"
    out_mp4 = out_mp4 or (root / "output" / f"{ep_id}_master.mp4")
    thumb = root / "upload/thumbs" / f"{ep_id}_thumbnail.jpg"
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    thumb.parent.mkdir(parents=True, exist_ok=True)

    renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=0.80, shadow_res=640)
    artist = V7OverlayArtist(ep_id)
    cache = V7ShotStateCache(ep_id)

    tmp = out_mp4.with_suffix(".tmp.mp4")
    ff = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1080x1920", "-r", str(fps), "-i", "-",
        "-i", str(cap_mp4), "-i", str(mix_wav),
        "-filter_complex", "[1:v]colorkey=0x00FF00:0.24:0.0,format=rgba[cap];[0:v][cap]overlay=0:0:shortest=1[vout]",
        "-map", "[vout]", "-map", "2:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", "-shortest", str(tmp),
    ]
    proc = subprocess.Popen(ff, stdin=subprocess.PIPE)
    assert proc.stdin is not None

    hero = _thumb_shot(shots)
    thumb_f = int(round(0.5 * (shots[hero]["start_s"] + shots[hero]["end_s"]) * fps))
    per_shot_objs: Dict[str, int] = {}
    s_idx = 0
    for f in range(total):
        t = f / float(fps)
        while s_idx + 1 < len(shots) and f >= int(shots[s_idx]["frame_b"]):
            s_idx += 1
        img, raw, nobj = render_frame(renderer, artist, cache, ep_id, shots, s_idx, t)
        per_shot_objs[shots[s_idx]["id"]] = nobj
        if f == thumb_f:
            th = Image.fromarray(raw)
            td = ImageDraw.Draw(th, "RGBA")
            acc = _hex_rgba(EP_STYLE[ep_id]["accent"])
            f56 = ImageFont.truetype(FONT_BOLD, 56)
            lines = _wrap(V7_EPISODES[ep_id]["hook_banner"], f56, 900)
            td.rounded_rectangle([48, 88, 1032, 180 + 66 * len(lines)], radius=28, fill=(11, 18, 34, 232), outline=acc, width=5)
            td.text((84, 112), EP_STYLE[ep_id]["sub"], font=ImageFont.truetype(FONT_BOLD, 34), fill=acc)
            for li, ln in enumerate(lines):
                td.text((84, 166 + li * 66), ln, font=f56, fill=(255, 255, 255, 255))
            th.save(thumb, quality=92)
        proc.stdin.write(img.tobytes())
        if f % 150 == 0:
            print(f"  [{ep_id}] frame {f}/{total} shot {s_idx + 1}/{len(shots)}", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {ep_id}")
    tmp.replace(out_mp4)

    n_unique = len(cache.episode_ids)
    assert n_unique >= MIN_OBJECTS, f"{ep_id}: only {n_unique} unique 3D objects (< {MIN_OBJECTS})"
    info = {
        "episode_id": ep_id, "story_version": "v7_storytelling", "master_mp4": str(out_mp4),
        "thumbnail_jpg": str(thumb), "duration_s": timing["duration_s"], "total_frames": total, "fps": fps,
        "shots": len(shots), "unique_objects": n_unique, "objects_per_shot": per_shot_objs,
    }
    qa_dir = root / "output/qa" / ep_id
    qa_dir.mkdir(parents=True, exist_ok=True)
    (qa_dir / "v7_render_info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info
