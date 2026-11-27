"""
360px phone-check contact sheet of the FINAL master (captions + HUD composited), one frame per shot.
Usage: .venv/bin/python tools/v6_phone_check.py KT-R07 [KT-R08 ...]  -> output/qa/<EP>/v6_phone_check.jpg
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def grab(mp4: pathlib.Path, t: float, w: int = 360) -> Image.Image:
    h = int(w * 16 / 9)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", str(mp4), "-frames:v", "1",
         "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout
    return Image.frombytes("RGB", (w, h), raw)


def sheet(ep: str, cols: int = 8) -> pathlib.Path:
    timing = json.loads((ROOT / "output/v6_timings" / f"{ep}_timings.json").read_text(encoding="utf-8"))
    mp4 = ROOT / "output" / f"{ep}_master.mp4"
    shots = timing["shots"]
    w, h = 360, 640
    rows = (len(shots) + cols - 1) // cols
    out = Image.new("RGB", (cols * w, rows * (h + 28)), (8, 12, 22))
    d = ImageDraw.Draw(out)
    f = ImageFont.truetype(FONT, 17)
    for i, s in enumerate(shots):
        t = 0.35 * float(s["start_s"]) + 0.65 * float(s["end_s"])
        x, y = (i % cols) * w, (i // cols) * (h + 28)
        out.paste(grab(mp4, t), (x, y))
        d.text((x + 6, y + h + 5), f"{s['id']} @ {t:.1f}s · {s['recipe'][:20]}", font=f, fill=(226, 232, 240))
    p = ROOT / "output/qa" / ep / "v6_phone_check.jpg"
    p.parent.mkdir(parents=True, exist_ok=True)
    out.save(p, quality=86)
    return p


if __name__ == "__main__":
    for ep in sys.argv[1:]:
        print(sheet(ep))
