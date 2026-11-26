#!/usr/bin/env python3
"""
Batch Renderer for Knot Theory V3 Sprint:
  - 6 Brand-New Vertical 9:16 Shorts (KT-S01 .. KT-S06) from Knot_Theory_V3_Ide_Terkuat.pdf
  - 1 Brand-New Widescreen 16:9 11-Minute Documentary (KT-L01) outside the 28-idea PDF
Outputs MP4 masters into /tmp/render_work/videos/ (keeping Git working tree lightweight),
writes synchronized .srt into output/, and writes <300 KB custom JPEG thumbnails into upload/thumbs/.
"""

import hashlib
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import imageio_ffmpeg
from PIL import Image

from src.knot_long_ep01 import render_long_documentary_ep01
from src.knot_shorts_engine import KnotShortDirector, align_subtitles_and_mix_short

FPS = 24


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(4 * 1024 * 1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def render_one_short(ep_code: str, split_wav: str, out_dir: str) -> dict:
    t0 = time.time()
    slug = ep_code.lower().replace("-", "_")
    srt_path = os.path.join("output", f"{slug}_shorts.srt")
    mix_wav = os.path.join(out_dir, f"{slug}_mix.wav")
    mp4_path = os.path.join(out_dir, f"{ep_code}_1080x1920_master.mp4")
    thumb_path = os.path.join("upload", "thumbs", f"{ep_code}_thumbnail.jpg")

    subs, total_dur = align_subtitles_and_mix_short(ep_code, split_wav, srt_path, mix_wav)
    director = KnotShortDirector(ep_code, subs, total_dur, ssaa=0.80)
    total_frames = int(round(total_dur * FPS))

    os.makedirs(os.path.dirname(mp4_path), exist_ok=True)
    os.makedirs(os.path.dirname(thumb_path), exist_ok=True)

    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "1080x1920", "-r", str(FPS), "-i", "-",
        "-i", mix_wav, "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", mp4_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    thumb_frame_idx = min(total_frames - 1, int(round(1.6 * FPS)))

    for idx in range(total_frames):
        frame = director.render_frame(idx / float(FPS))
        if idx == thumb_frame_idx:
            Image.fromarray(frame, mode="RGB").save(thumb_path, format="JPEG", quality=88, optimize=True)
        proc.stdin.write(frame.tobytes())

    proc.stdin.close()
    err = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(err.decode("utf-8", errors="replace"))

    sz = os.path.getsize(mp4_path)
    digest = sha256_file(mp4_path)
    dt = time.time() - t0
    print(f"[{ep_code}] Rendered {total_dur:.2f}s ({total_frames} frames) in {dt:.1f}s -> {sz/1024**2:.2f} MB | sha256={digest[:16]}...")
    return {
        "episode": ep_code,
        "video_filename": os.path.basename(mp4_path),
        "mp4_path": mp4_path,
        "thumbnail": os.path.basename(thumb_path),
        "srt_path": srt_path,
        "duration_seconds": total_dur,
        "size_bytes": sz,
        "sha256": digest,
    }


def main():
    os.environ["OMP_NUM_THREADS"] = "2"
    work_dir = "/tmp/render_work"
    vid_dir = os.path.join(work_dir, "videos")
    os.makedirs(vid_dir, exist_ok=True)
    os.makedirs("output", exist_ok=True)
    os.makedirs("upload/thumbs", exist_ok=True)

    manifest_out = {}

    for i in range(1, 7):
        ep_code = f"KT-S0{i}"
        wav_in = os.path.join(work_dir, "audio_split", f"kt_s0{i}.wav")
        manifest_out[ep_code] = render_one_short(ep_code, wav_in, vid_dir)

    t_long = time.time()
    long_mp4 = os.path.join(vid_dir, "KT-L01_1920x1080_master.mp4")
    long_srt = os.path.join("output", "kt_l01_megastruktur_kota.srt")
    long_mix = os.path.join(vid_dir, "kt_l01_mix.wav")
    long_thumb = os.path.join("upload", "thumbs", "KT-L01_thumbnail.jpg")

    long_res = render_long_documentary_ep01(
        raw_audio_dir=os.path.join(work_dir, "audio_raw"),
        srt_out_path=long_srt,
        mix_out_path=long_mix,
        mp4_out_path=long_mp4,
        thumb_out_path=long_thumb,
    )
    sz_l = os.path.getsize(long_mp4)
    sha_l = sha256_file(long_mp4)
    print(f"[KT-L01] Rendered {long_res['duration_seconds']:.2f}s (11+ min 16:9 HD) in {time.time()-t_long:.1f}s -> {sz_l/1024**2:.2f} MB | sha256={sha_l[:16]}...")
    manifest_out["KT-L01"] = {
        "episode": "KT-L01",
        "video_filename": os.path.basename(long_mp4),
        "mp4_path": long_mp4,
        "thumbnail": os.path.basename(long_thumb),
        "srt_path": long_srt,
        "duration_seconds": long_res["duration_seconds"],
        "size_bytes": sz_l,
        "sha256": sha_l,
    }

    with open(os.path.join(work_dir, "rendered_masters.json"), "w", encoding="utf-8") as f:
        json.dump(manifest_out, f, indent=2)
    print("ALL 7 BRAND-NEW VIDEOS RENDERED SUCCESSFULLY!")


if __name__ == "__main__":
    main()
