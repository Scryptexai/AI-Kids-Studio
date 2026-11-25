#!/usr/bin/env python3
"""
End-to-end multi-core 3D Shorts Renderer for Episode 1:
"Kenapa Lampu Merah Bisa Tau Ada Motor Nunggu?" (Inductive Loop Sensor)
"""

import multiprocessing as mp
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import imageio_ffmpeg

from src.audio_pipeline import TOTAL_DURATION_EP1, build_master_audio_ep01, build_subtitles_ep01
from src.episode1_director import Episode1Director

FPS = 24
TOTAL_FRAMES = int(round(TOTAL_DURATION_EP1 * FPS))
_WORKER = None


def _init_worker(subs, omp_threads: str):
    os.environ["OMP_NUM_THREADS"] = omp_threads
    global _WORKER
    _WORKER = Episode1Director(subtitles=subs, ssaa=1.18)


def _render_one(idx: int) -> bytes:
    return _WORKER.render_frame(idx / float(FPS)).tobytes()


def main():
    t0 = time.time()
    os.makedirs("output", exist_ok=True)
    audio_dir = "assets/audio/ep01"
    srt_path = "output/ep01_lampu_merah_shorts.srt"
    mix_wav = "assets/audio/ep01/master_ep01_mix.wav"
    out_mp4 = "output/ep01_lampu_merah_shorts.mp4"

    subs = build_subtitles_ep01(audio_dir, srt_path)
    build_master_audio_ep01(audio_dir, mix_wav)
    _ = Episode1Director(subtitles=subs, ssaa=1.18)

    cpu_cnt = os.cpu_count() or 4
    n_workers = max(2, min(4, cpu_cnt // 2))
    omp_t = str(max(1, cpu_cnt // n_workers))

    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "1080x1920", "-r", str(FPS), "-i", "-",
        "-i", mix_wav, "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", out_mp4,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    ctx = mp.get_context("spawn")
    with ctx.Pool(processes=n_workers, initializer=_init_worker, initargs=(subs, omp_t)) as pool:
        for fb in pool.imap(_render_one, range(TOTAL_FRAMES), chunksize=6):
            proc.stdin.write(fb)
    proc.stdin.close()
    err = proc.stderr.read()
    if proc.wait() != 0:
        raise RuntimeError(err.decode("utf-8", errors="replace"))
    print(f"Done in {time.time() - t0:.1f}s -> {out_mp4}")


if __name__ == "__main__":
    main()
