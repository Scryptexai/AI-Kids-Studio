#!/usr/bin/env python3
"""
fetch_masters.py — unduh master MP4 dari Google Drive ke folder media/ dan salin thumbnail.

    EPISODE_SELECT=KT-S01 python3 tools/fetch_masters.py
    EPISODE_SELECT=BATCH_READY python3 tools/fetch_masters.py --media-dir media

Master MP4 (Shorts 9:16 maupun Long 16:9 10–20 menit) disimpan di Google Drive
(status sharing: Anyone with the link -> Viewer), bukan di dalam Git.
Setelah diunduh, upload_zernio.py memverifikasi size_bytes dan SHA-256 sebelum
mengirim satu byte pun ke presigned URL Zernio.
"""

import argparse
import json
import os
import pathlib
import shutil
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
META_DIR = ROOT / "upload"
THUMB_DIR = META_DIR / "thumbs"


def discover_ready_episodes():
    ready = []
    for p in sorted(META_DIR.glob("KT-*.json")):
        try:
            meta = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if meta.get("drive_file_id") and meta.get("sha256") and meta.get("size_bytes"):
            ready.append(p.stem)
    return ready


def selected_episodes(sel: str):
    sel_clean = sel.strip()
    if "," in sel_clean:
        return [x.strip() for x in sel_clean.split(",") if x.strip()]
    if sel_clean.upper() in ("ALL", "BATCH_READY"):
        return discover_ready_episodes()
    target = META_DIR / f"{sel_clean}.json"
    if not target.exists():
        sys.exit(f"::error::{sel_clean} tidak punya metadata di upload/{sel_clean}.json")
    return [sel_clean]


def gdown_download(fid: str, target: pathlib.Path) -> bool:
    try:
        import gdown
    except ImportError:
        return False
    try:
        gdown.download(id=fid, output=str(target), quiet=True, fuzzy=False)
    except Exception as exc:
        print(f"  gdown gagal: {exc}")
        return False
    return target.exists() and target.stat().st_size > 0


def direct_download(fid: str, target: pathlib.Path) -> bool:
    url = f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
    req = urllib.request.Request(url, headers={"User-Agent": "ai-kids-studio-zernio/1.0"})
    with urllib.request.urlopen(req, timeout=900) as r, open(target, "wb") as f:
        ctype = r.headers.get("Content-Type", "")
        if "text/html" in ctype:
            target.unlink(missing_ok=True)
            sys.exit(
                f"::error::Drive mengembalikan HTML untuk {fid} — file belum publik. "
                "Pastikan file di Google Drive berstatus Anyone with the link -> Viewer."
            )
        shutil.copyfileobj(r, f, length=4 * 1024 * 1024)
    return target.exists() and target.stat().st_size > 0


def fetch(fid: str, target: pathlib.Path):
    if gdown_download(fid, target):
        return
    print("  gdown tidak tersedia/gagal, mencoba unduhan langsung drive.usercontent.google.com...")
    if not direct_download(fid, target):
        sys.exit(f"::error::gagal mengunduh file Drive {fid}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--media-dir", default="media")
    args = ap.parse_args()

    sel = (os.environ.get("EPISODE_SELECT") or "BATCH_READY").strip()
    media = pathlib.Path(args.media_dir)
    media.mkdir(parents=True, exist_ok=True)

    eps = selected_episodes(sel)
    if not eps:
        print("Tidak ada episode berstatus ready dengan drive_file_id.")
        return

    for ep in eps:
        meta = json.loads((META_DIR / f"{ep}.json").read_text(encoding="utf-8"))
        video = media / meta["video"]
        if not video.exists():
            fid = meta.get("drive_file_id")
            if not fid:
                sys.exit(f"::error::{ep}: drive_file_id kosong di upload/{ep}.json")
            print(f"unduh {ep} <- Google Drive {fid}", flush=True)
            fetch(fid, video)
            if not video.exists() or video.stat().st_size == 0:
                sys.exit(f"::error::{ep}: hasil unduhan kosong")
        print(f"  {ep:8s}  {video.name}  {video.stat().st_size / 1024 ** 2:6.2f} MB")

        thumb = media / meta["thumbnail"]
        if not thumb.exists():
            src = THUMB_DIR / meta["thumbnail"]
            if not src.exists():
                sys.exit(f"::error::{ep}: thumbnail tidak ditemukan di {src.relative_to(ROOT)}")
            shutil.copy2(src, thumb)
        print(f"  {ep:8s}  {thumb.name}  {thumb.stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
