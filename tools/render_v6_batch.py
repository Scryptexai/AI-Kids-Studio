"""
Batch V6 Renderer & QA Runner (`tools/render_v6_batch.py`)
  Phase 1: up to 2 independent render worker subprocesses (`OMP_NUM_THREADS=1`) -> output/<EP>_master.mp4
  Phase 2: sequential `short_qa.py` gate (black / frozen-span checks against output/v6_timings/<EP>_shots.json)
  Phase 3: `tools/v6_density_qa.py` illustration-density gate (>=20 shots, >=50 objects, on-screen ratio)
"""

from __future__ import annotations
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

V6_ORDER = ["KT-R07", "KT-R08", "KT-S15", "KT-S16"]

SHORT_QA_PY = ROOT / ".claude/skills/cartoon-3d-short/templates/scripts/short_qa.py"


def sha256_file(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_fresh_valid_master(ep_id: str, min_mtime: float) -> bool:
    mp4 = ROOT / "output" / f"{ep_id}_master.mp4"
    tp_path = ROOT / "output/v6_timings" / f"{ep_id}_timings.json"
    if not mp4.exists() or mp4.stat().st_size < 1_000_000 or mp4.stat().st_mtime < min_mtime:
        return False
    expected = json.loads(tp_path.read_text(encoding="utf-8"))["duration_s"]
    pr = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(mp4)],
        capture_output=True, text=True,
    )
    if pr.returncode != 0:
        return False
    try:
        actual = float(pr.stdout.strip())
    except ValueError:
        return False
    return abs(actual - expected) < 0.35


def run_render_only(ep_id: str) -> None:
    from src.knot_v6_director import render_v6_episode

    t0 = time.time()
    info = render_v6_episode(ep_id, ROOT)
    dt = time.time() - t0
    mp4_path = pathlib.Path(info["master_mp4"])
    print(f"[RENDERED {ep_id}] {dt:.1f}s | {mp4_path.stat().st_size / 1e6:.2f} MB", flush=True)


def run_qa_single(ep_id: str) -> dict:
    mp4_path = ROOT / "output" / f"{ep_id}_master.mp4"
    thumb_jpg = ROOT / "upload/thumbs" / f"{ep_id}_thumbnail.jpg"
    tp = json.loads((ROOT / "output/v6_timings" / f"{ep_id}_timings.json").read_text(encoding="utf-8"))
    shots_json = ROOT / "output/v6_timings" / f"{ep_id}_shots.json"
    qa_dir = ROOT / "output/qa" / ep_id
    qa_dir.mkdir(parents=True, exist_ok=True)

    pr = subprocess.run(
        [sys.executable, str(SHORT_QA_PY), str(mp4_path), str(qa_dir), str(shots_json)],
        capture_output=True, text=True, check=True,
    )
    qa_out = pr.stdout.strip()
    assert "black []" in qa_out, f"{ep_id} failed black-frame gate:\n{qa_out}"
    assert "frozen spans >=12f []" in qa_out, f"{ep_id} failed frozen-frame gate:\n{qa_out}"

    res = {
        "episode_id": ep_id,
        "master_mp4": str(mp4_path),
        "thumbnail_jpg": str(thumb_jpg),
        "duration_s": tp["duration_s"],
        "total_frames": tp["total_frames"],
        "fps": 30,
        "bytes": mp4_path.stat().st_size,
        "sha256": sha256_file(mp4_path),
        "qa_headline": " | ".join(qa_out.splitlines()[:4]),
    }
    (qa_dir / "v6_result.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(f"[QA PASS {ep_id}] {res['bytes']/1e6:.2f} MB | {res['qa_headline']}", flush=True)
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--render-only", default=None)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--episodes", nargs="*", default=None)
    ap.add_argument("--min-mtime", type=float, default=0.0)
    args = ap.parse_args()

    if args.render_only:
        run_render_only(args.render_only)
        return

    targets = args.episodes if args.episodes else list(V6_ORDER)
    todo = [ep for ep in targets if not is_fresh_valid_master(ep, args.min_mtime)]
    max_w = max(1, min(2, args.workers))
    env = os.environ.copy()
    env["OMP_NUM_THREADS"] = "1"

    print(f"=== PHASE 1: RENDERING {len(todo)}/{len(targets)} EPISODES ({max_w} workers) ===", flush=True)
    print("  Already fresh:", [ep for ep in targets if ep not in todo], flush=True)
    t_start = time.time()
    active: list[tuple[str, subprocess.Popen]] = []
    idx = 0

    while idx < len(todo) or active:
        while idx < len(todo) and len(active) < max_w:
            ep = todo[idx]
            idx += 1
            p = subprocess.Popen(
                [sys.executable, "-u", str(pathlib.Path(__file__).resolve()), "--render-only", ep],
                cwd=str(ROOT),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            active.append((ep, p))
            print(f"  -> spawned {ep} (pid={p.pid})", flush=True)

        still = []
        for ep, p in active:
            rc = p.poll()
            if rc is None:
                still.append((ep, p))
            else:
                out = p.stdout.read() if p.stdout else ""
                if rc != 0:
                    raise RuntimeError(f"Render worker {ep} failed (rc={rc}):\n{out}")
                print(out.strip(), flush=True)
        active = still
        if active:
            time.sleep(1.0)

    print(f"\n=== PHASE 2: SEQUENTIAL `short_qa.py` GATE ACROSS ALL {len(targets)} EPISODES ===", flush=True)
    results = []
    for ep in targets:
        results.append(run_qa_single(ep))

    print("\n=== PHASE 3: V6 ILLUSTRATION-DENSITY GATE ===", flush=True)
    subprocess.run([sys.executable, str(ROOT / "tools/v6_density_qa.py"), *targets], cwd=str(ROOT), check=True)
    dq = {r["episode_id"]: r for r in json.loads((ROOT / "output/qa/v6_density_qa.json").read_text(encoding="utf-8"))}
    for r in results:
        d = dq[r["episode_id"]]
        r.update({"shots": d["shots"], "unique_objects": d["unique_objects"], "density_pass": d["pass"]})

    summary_path = ROOT / "output/qa/v6_batch_qa_summary.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nALL {len(results)} V6 EPISODES RENDERED & QA-PASSED in {time.time() - t_start:.1f}s!", flush=True)


if __name__ == "__main__":
    main()
