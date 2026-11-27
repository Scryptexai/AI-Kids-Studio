"""
Knot Theory V6 High-Density Shorts Director (`src/knot_v6_director.py`)

V6 standard (per ~55-60s Short):
  - 22 clause-locked shots (>= 20 enforced) from `output/v6_timings/<EP>_timings.json`
  - 67-79 distinct named multi-part 3D objects (>= 50 enforced) via `SceneObjectRegistry`
  - Every shot re-built at 14 animated sub-states (geometry animation) while the camera is
    interpolated continuously between sub-state camera keys at a true 30 fps (zero frozen spans)
  - Shorts safe-zone HUD: shot badge + progress, 3D world->screen pointer callout, hook banner,
    amber "BATAS AKURASI" badge, A/B comment card, and pulsing WHITE SUBSCRIBE button
  - `captions_green.mp4` colorkey composite + `-14.0 LUFS` 48 kHz stereo mix in one ffmpeg pass
"""

from __future__ import annotations

import json
import math
import pathlib
import re
import subprocess
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from src.knot_v6_objects import build_v6_shot_scene
from src.knot_v6_scripts import V6_EPISODES
from src.renderer3d import SceneRenderer

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
N_STATES = 14  # animated geometry sub-states per shot (camera is continuous)
MIN_SHOTS = 20
MIN_OBJECTS = 50

EP_STYLE: Dict[str, dict] = {
    "KT-R07": {"accent": "#F59E0B", "sub": "TEKNIK JEMBATAN", "bg": ((0.20, 0.45, 0.78), (0.62, 0.80, 0.95))},
    "KT-R08": {"accent": "#38BDF8", "sub": "TEKNIK GEDUNG TINGGI", "bg": ((0.12, 0.30, 0.58), (0.52, 0.72, 0.92))},
    "KT-S15": {"accent": "#F97316", "sub": "KESELAMATAN JALAN RAYA", "bg": ((0.22, 0.46, 0.76), (0.70, 0.83, 0.94))},
    "KT-S16": {"accent": "#22D3EE", "sub": "TEKNIK PESAWAT", "bg": ((0.10, 0.36, 0.72), (0.58, 0.80, 0.97))},
}


def _hex_rgba(h: str, a: int = 255) -> Tuple[int, int, int, int]:
    s = h.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def _ease_io(u: float) -> float:
    u = max(0.0, min(1.0, u))
    return u * u * (3.0 - 2.0 * u)


def _lerp3(a, b, u: float) -> Tuple[float, float, float]:
    return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)


def parse_ab_options(cta_question: str) -> Tuple[str, str, str]:
    """'Question? (OPTION A vs OPTION B)' -> (question, A, B)."""
    m = re.search(r"\((.+?)\s+vs\s+(.+?)\)\s*$", cta_question)
    if not m:
        return cta_question, "A", "B"
    return cta_question[: m.start()].strip(), m.group(1).strip(), m.group(2).strip()


def _wrap(text: str, font: ImageFont.FreeTypeFont, max_w: int) -> List[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if font.getlength(trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


class V6OverlayArtist:
    """Safe-zone HUD (top >= 8.5%, right <= 82%, HUD bottom <= 69% so captions at 70-74% stay clear)."""

    def __init__(self, ep_id: str, w: int = 1080, h: int = 1920):
        self.ep = V6_EPISODES[ep_id]
        self.style = EP_STYLE[ep_id]
        self.acc = _hex_rgba(self.style["accent"])
        self.w, self.h = w, h
        self.f_cat = ImageFont.truetype(FONT_BOLD, 22)
        self.f_hook = ImageFont.truetype(FONT_BOLD, 38)
        self.f_call = ImageFont.truetype(FONT_BOLD, 29)
        self.f_ptr = ImageFont.truetype(FONT_BOLD, 24)
        self.f_q = ImageFont.truetype(FONT_BOLD, 28)
        self.f_opt = ImageFont.truetype(FONT_BOLD, 22)
        self.f_btn = ImageFont.truetype(FONT_BOLD, 32)
        self.q, self.opt_a, self.opt_b = parse_ab_options(self.ep["cta_question"])

    def draw(self, rgb: np.ndarray, shot: dict, idx: int, n: int, u: float, t: float,
             proj: Optional[Tuple[int, int]]) -> Image.Image:
        pil = Image.fromarray(rgb)
        dr = ImageDraw.Draw(pil, "RGBA")
        acc = self.acc
        badge = shot.get("badge") or shot.get("Badge") or ""
        recipe = shot.get("recipe", "")
        is_boundary = bool(shot.get("boundary")) or shot["text"].lower().startswith("batas akurasi")

        # 1) Header: hook banner on shot 1, step badge + progress afterwards.
        if idx == 0:
            lines = _wrap(self.ep["hook_banner"], self.f_hook, 760)
            hh = 70 + 46 * len(lines)
            dr.rounded_rectangle([64, 164, 882, 164 + hh], radius=22, fill=(11, 18, 34, 226), outline=acc, width=3)
            dr.text((90, 180), f"KNOT THEORY  •  {self.style['sub']}", font=self.f_cat, fill=acc)
            for li, ln in enumerate(lines):
                dr.text((90, 216 + li * 46), ln, font=self.f_hook, fill=(255, 255, 255, 255))
        else:
            hdr_acc = _hex_rgba("#FACC15") if is_boundary else (148, 163, 184, 160)
            dr.rounded_rectangle([64, 164, 876, 246], radius=20, fill=(11, 18, 34, 218), outline=hdr_acc, width=3 if is_boundary else 2)
            label = ("BATAS AKURASI  •  " + badge) if is_boundary and "BATAS" not in badge.upper() else badge
            txt = f"{idx + 1:02d}/{n:02d}  •  {label}"
            while self.f_call.getlength(txt) > 760 and len(txt) > 8:
                txt = txt[:-2]
            dr.text((88, 182), txt, font=self.f_call, fill=(248, 250, 252, 255))
            prog = int(764 * ((idx + u) / max(1, n)))
            dr.rounded_rectangle([88, 228, 852, 235], radius=3, fill=(51, 65, 85, 200))
            dr.rounded_rectangle([88, 228, 88 + max(12, prog), 235], radius=3, fill=acc)

        # 2) 3D world->screen pointer callout (not on interactive end-cards).
        ptr = shot.get("ptr")
        if recipe not in ("ab_poll_stage", "comment_wave", "cta_white_stage") and proj is not None and ptr:
            label = ptr[1]
            px, py = proj
            px = max(90, min(860, px))
            py = max(320, min(1180, py))
            grow = _ease_io(min(1.0, u * 4.0))
            if grow > 0.02:
                bw = int(self.f_ptr.getlength(label)) + 44
                bx = max(68, min(882 - bw, px - bw // 2))
                by = py - 120 if py > 470 else py + 70
                by = max(272, min(1150, by))
                a = int(235 * grow)
                dr.line([(px, py), (bx + bw // 2, by + 25)], fill=acc[:3] + (a,), width=4)
                r = int(6 + 6 * grow + 3 * math.sin(t * 7.0))
                dr.ellipse([px - r, py - r, px + r, py + r], fill=acc[:3] + (a,), outline=(255, 255, 255, a), width=3)
                dr.rounded_rectangle([bx, by, bx + bw, by + 50], radius=14, fill=(15, 23, 42, int(232 * grow)), outline=acc[:3] + (a,), width=2)
                dr.text((bx + 22, by + 11), label, font=self.f_ptr, fill=(255, 255, 255, a))

        # 3) Interactive A/B comment card.
        if recipe in ("ab_poll_stage", "comment_wave"):
            ql = _wrap(self.q, self.f_q, 760)[:3]
            y0 = 900
            dr.rounded_rectangle([64, y0, 882, y0 + 70 + 38 * len(ql) + 84], radius=24, fill=(11, 18, 34, 232), outline=acc, width=3)
            for li, ln in enumerate(ql):
                dr.text((92, y0 + 22 + li * 38), ln, font=self.f_q, fill=(248, 250, 252, 255))
            oy = y0 + 40 + 38 * len(ql)
            for k, (opt, fillc, outc, x0) in enumerate((
                (self.opt_a, (30, 58, 138, 235), (56, 189, 248, 255), 90),
                (self.opt_b, (124, 45, 18, 235), (251, 146, 60, 255), 482),
            )):
                pulse = 3 if (recipe == "ab_poll_stage" and int(t * 2.0) % 2 == k) else 0
                dr.rounded_rectangle([x0 - pulse, oy - pulse, x0 + 374 + pulse, oy + 84 + pulse], radius=16, fill=fillc, outline=outc, width=2 + pulse)
                ol = _wrap(f"{'AB'[k]}: {opt}", self.f_opt, 340)[:2]
                for li, ln in enumerate(ol):
                    dr.text((x0 + 18, oy + 14 + li * 28), ln, font=self.f_opt, fill=(255, 255, 255, 255))
            if recipe == "comment_wave":
                dr.rounded_rectangle([250, 1220, 700, 1280], radius=18, fill=(15, 23, 42, 230), outline=(255, 255, 255, 220), width=2)
                dr.text((278, 1233), "TULIS DI KOMENTAR  ↓", font=self.f_ptr, fill=(255, 255, 255, 255))

        # 4) Pulsing WHITE SUBSCRIBE button.
        if recipe == "cta_white_stage":
            pulse = int(10 * (0.5 + 0.5 * math.sin(t * 8.5)))
            bx0, by0, bx1, by1 = 120 - pulse // 2, 1100 - pulse // 3, 826 + pulse // 2, 1186 + pulse // 3
            dr.rounded_rectangle([bx0, by0, bx1, by1], radius=24, fill=(255, 255, 255, 255), outline=acc, width=4)
            lbl = "▶  TEKAN TOMBOL PUTIH!"
            tw = self.f_btn.getlength(lbl)
            dr.text((473 - tw / 2, by0 + 24), lbl, font=self.f_btn, fill=(15, 23, 42, 255))
            ay = 1200 + int(8 * abs(math.sin(t * 7.0)))
            dr.polygon([(473, ay + 26), (451, ay), (495, ay)], fill=(255, 255, 255, 255))
        return pil


FILL_X = 0.86          # hero group spans <= 86% of the portrait frame width
FILL_Y = 0.50          # ... and <= 50% of frame height (band between header and caption zone)
FOCUS_Y = 0.43         # hero group centred at 43% frame height
ELEV_MIN, ELEV_MAX = math.radians(9.0), math.radians(40.0)


def _cam_axes(dir_v: np.ndarray):
    fwd = -dir_v
    right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
    right /= max(1e-6, float(np.linalg.norm(right)))
    up = np.cross(right, fwd)
    return fwd, right, up


def auto_frame(raw: List[tuple], k: int, fb, focus_y: float = FOCUS_Y, fill_y: float = FILL_Y) -> Tuple:
    """
    Re-frame a builder camera so every narrated hero object of the shot is fully visible:
    keeps the builder's view direction & push/orbit motion, clamps elevation to 9-40 deg,
    solves the camera distance from the 8 projected corners of the hero bounding box,
    and positions the group between the header badge and the caption band.
    """
    mesh, eye, tgt, fov, _ = raw[k]
    fov = max(40.0, float(fov))
    if fb is None:
        return mesh, eye, tgt, fov
    lo, hi = np.asarray(fb[0], dtype=np.float64), np.asarray(fb[1], dtype=np.float64)
    c = 0.5 * (lo + hi)
    tan_x = math.tan(math.radians(fov * 0.5))
    tan_y = tan_x * 16.0 / 9.0

    def direction(e, t):
        v = np.asarray(e, dtype=np.float64) - np.asarray(t, dtype=np.float64)
        horiz = math.hypot(v[0], v[2])
        yaw = math.atan2(v[2], v[0]) if horiz > 1e-4 else math.pi * 0.5
        elev = min(ELEV_MAX, max(ELEV_MIN, math.atan2(v[1], max(1e-4, horiz))))
        return np.array([math.cos(elev) * math.cos(yaw), math.sin(elev), math.cos(elev) * math.sin(yaw)]), float(np.linalg.norm(v))

    mid = raw[len(raw) // 2]
    dir_m, d_mid = direction(mid[1], mid[2])
    fwd, right, up = _cam_axes(dir_m)
    d_fit = 0.5
    for cx in (lo[0], hi[0]):
        for cy in (lo[1], hi[1]):
            for cz in (lo[2], hi[2]):
                q = np.array([cx, cy, cz]) - c
                zf = float(np.dot(q, fwd))
                d_fit = max(d_fit,
                            abs(float(np.dot(q, right))) / (FILL_X * tan_x) - zf,
                            abs(float(np.dot(q, up))) / (fill_y * tan_y) - zf)
    scale = max(0.85, d_fit / max(0.3, d_mid))

    dir_v, d_k = direction(eye, tgt)
    dist = max(0.3, d_k) * scale
    t_new = np.asarray(tgt, dtype=np.float64) + 0.9 * (c - np.asarray(mid[2], dtype=np.float64))
    _, _, up_k = _cam_axes(dir_v)
    t_new = t_new - up_k * ((0.5 - focus_y) * 2.0 * tan_y * dist)
    e_new = t_new + dir_v * dist
    return mesh, tuple(e_new), tuple(t_new), fov


class ShotStateCache:
    """Builds N_STATES animated geometry states per shot; validates object completeness."""

    def __init__(self, ep_id: str):
        self.ep_id = ep_id
        self.idx = -1
        self.states: List[tuple] = []
        self.episode_ids: set = set()

    def load(self, shot_idx: int) -> None:
        if shot_idx == self.idx:
            return
        self.idx = shot_idx
        raw = []
        for k in range(N_STATES + 1):
            p = k / float(N_STATES)
            mesh, eye, tgt, fov, reg = build_v6_shot_scene(self.ep_id, shot_idx, p)
            self.episode_ids |= reg.ids
            raw.append((mesh, eye, tgt, fov, reg))
        mid_reg = raw[N_STATES // 2][4]
        required = V6_EPISODES[self.ep_id]["shots"][shot_idx]["objects"]
        fb = mid_reg.focus_bounds(list(required))
        recipe = V6_EPISODES[self.ep_id]["shots"][shot_idx]["recipe"]
        fy, fill_y = (0.34, 0.30) if recipe in ("ab_poll_stage", "comment_wave") else (FOCUS_Y, FILL_Y)
        self.states = [auto_frame(raw, k, fb, fy, fill_y) + (len(raw[k][4].ids),) for k in range(N_STATES + 1)]
        self.focus = fb
        self.mid_reg = mid_reg

    def at(self, u: float):
        f = max(0.0, min(1.0, u)) * N_STATES
        k0 = min(N_STATES - 1, int(f))
        w = f - k0
        m0, e0, t0, fv0, nobj = self.states[k0]
        _, e1, t1, fv1, _ = self.states[k0 + 1]
        mesh = self.states[int(round(f))][0]
        return mesh, _lerp3(e0, e1, w), _lerp3(t0, t1, w), fv0 + (fv1 - fv0) * w, nobj


def _drift(eye, tgt, t: float, u: float):
    """Tiny continuous hand-held orbit drift so no two frames are ever identical."""
    ang = 0.035 * math.sin(t * 0.9) + 0.02 * (u - 0.5)
    dx, dz = eye[0] - tgt[0], eye[2] - tgt[2]
    ca, sa = math.cos(ang), math.sin(ang)
    return (tgt[0] + dx * ca + dz * sa, eye[1] + 0.02 * math.sin(t * 1.3), tgt[2] - dx * sa + dz * ca)


def load_timing(root: pathlib.Path, ep_id: str) -> dict:
    timing = json.loads((root / "output/v6_timings" / f"{ep_id}_timings.json").read_text(encoding="utf-8"))
    assert int(timing["shot_count"]) >= MIN_SHOTS, f"{ep_id}: only {timing['shot_count']} shots (< {MIN_SHOTS})"
    return timing


def render_frame(renderer: SceneRenderer, artist: V6OverlayArtist, cache: ShotStateCache, ep_id: str,
                 shots: List[dict], s_idx: int, t: float) -> Tuple[Image.Image, np.ndarray, int]:
    s = shots[s_idx]
    cache.load(s_idx)
    dur = max(0.05, float(s["end_s"]) - float(s["start_s"]))
    u = max(0.0, min(1.0, (t - float(s["start_s"])) / dur))
    mesh, eye, tgt, fov, nobj = cache.at(u)
    eye = _drift(eye, tgt, t, u)
    bg_top, bg_bot = EP_STYLE[ep_id]["bg"]
    rgb = renderer.render(mesh, cam_pos=eye, cam_target=tgt, fov_x_deg=fov, bg_top=bg_top, bg_bot=bg_bot)
    proj = renderer.project_point(tuple(s["ptr"][0]), eye, tgt, fov) if s.get("ptr") else None
    return artist.draw(rgb, s, s_idx, len(shots), u, t, proj), rgb, nobj


def render_v6_episode(ep_id: str, root: pathlib.Path, out_mp4: Optional[pathlib.Path] = None) -> dict:
    timing = load_timing(root, ep_id)
    shots = timing["shots"]
    fps = int(timing["fps"])
    total = int(timing["total_frames"])
    mix_wav = root / "assets/audio/v6_mix" / f"{ep_id}_mix.wav"
    cap_mp4 = root / "output/v6_captions" / ep_id / "captions_green.mp4"
    out_mp4 = out_mp4 or (root / "output" / f"{ep_id}_master.mp4")
    thumb = root / "upload/thumbs" / f"{ep_id}_thumbnail.jpg"
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    thumb.parent.mkdir(parents=True, exist_ok=True)

    renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=0.80, shadow_res=640)
    artist = V6OverlayArtist(ep_id)
    cache = ShotStateCache(ep_id)

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

    hero = min(2, len(shots) - 1)
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
            lines = _wrap(V6_EPISODES[ep_id]["hook_banner"], ImageFont.truetype(FONT_BOLD, 56), 900)
            td.rounded_rectangle([48, 88, 1032, 180 + 66 * len(lines)], radius=28, fill=(11, 18, 34, 232), outline=acc, width=5)
            td.text((84, 112), EP_STYLE[ep_id]["sub"], font=ImageFont.truetype(FONT_BOLD, 34), fill=acc)
            for li, ln in enumerate(lines):
                td.text((84, 166 + li * 66), ln, font=ImageFont.truetype(FONT_BOLD, 56), fill=(255, 255, 255, 255))
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
        "episode_id": ep_id, "master_mp4": str(out_mp4), "thumbnail_jpg": str(thumb),
        "duration_s": timing["duration_s"], "total_frames": total, "fps": fps,
        "shots": len(shots), "unique_objects": n_unique, "objects_per_shot": per_shot_objs,
    }
    qa_dir = root / "output/qa" / ep_id
    qa_dir.mkdir(parents=True, exist_ok=True)
    (qa_dir / "v6_render_info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info


def render_storyboard(ep_id: str, root: pathlib.Path, out_jpg: pathlib.Path, cols: int = 6, tile_w: int = 270) -> pathlib.Path:
    """22-shot contact sheet of mid-shot frames (HUD on, captions off) for visual inspection."""
    timing = load_timing(root, ep_id)
    shots = timing["shots"]
    renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=0.62, shadow_res=512)
    artist = V6OverlayArtist(ep_id)
    cache = ShotStateCache(ep_id)
    tile_h = int(tile_w * 16 / 9)
    rows = math.ceil(len(shots) / cols)
    sheet = Image.new("RGB", (cols * tile_w, rows * (tile_h + 26)), (8, 12, 22))
    sd = ImageDraw.Draw(sheet)
    f_lbl = ImageFont.truetype(FONT_BOLD, 15)
    for i, s in enumerate(shots):
        t = 0.55 * float(s["start_s"]) + 0.45 * float(s["end_s"])
        img, _, nobj = render_frame(renderer, artist, cache, ep_id, shots, i, t)
        tile = img.resize((tile_w, tile_h), Image.LANCZOS)
        x, y = (i % cols) * tile_w, (i // cols) * (tile_h + 26)
        sheet.paste(tile, (x, y))
        sd.text((x + 6, y + tile_h + 4), f"{s['id']} · {nobj} obj · {s['recipe'][:18]}", font=f_lbl, fill=(226, 232, 240))
    out_jpg.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_jpg, quality=88)
    return out_jpg
