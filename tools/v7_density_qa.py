"""
V7 Illustration-Density QA Gate (`tools/v7_density_qa.py`) — V7 story shots on V6 scenes

Hard gates per episode (fails with exit code 1):
  1. shots >= 20 in `output/v7_timings/<EP>_timings.json`
  2. distinct named 3D objects instantiated across the episode >= 50
  3. every narrated object listed for a shot is built (SceneObjectRegistry assertion)
  4. >= 85% of each shot's narrated objects project on-screen (inside the 1080x1920 frame)
     with the final auto-framed camera at mid-shot
  5. mean 3D geometry coverage of the frame >= 35% (no near-empty frames)

Usage: .venv/bin/python tools/v7_density_qa.py KT-R07 KT-R08 KT-S15 KT-S16
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

import src.knot_v6_director as director  # noqa: E402
from src.knot_v6_director import MIN_OBJECTS, MIN_SHOTS, _drift  # noqa: E402
from src.knot_v7_director import V7ShotStateCache as ShotStateCache, load_timing  # noqa: E402
from src.knot_v7_story_scripts import V7_EPISODES  # noqa: E402
from src.renderer3d import SceneRenderer  # noqa: E402

ONSCREEN_MIN = 0.85
COVERAGE_MIN = 0.35


def qa_episode(ep_id: str, renderer: SceneRenderer) -> dict:
    timing = load_timing(ROOT, ep_id)
    shots = timing["shots"]
    cache = ShotStateCache(ep_id)
    rows, fails = [], []
    for i, s in enumerate(shots):
        cache.load(i)
        t = 0.5 * (float(s["start_s"]) + float(s["end_s"]))
        mesh, eye, tgt, fov, nobj = cache.at(0.5)
        eye = _drift(eye, tgt, t, 0.5)
        renderer.render(mesh, cam_pos=eye, cam_target=tgt, fov_x_deg=fov)
        coverage = float((renderer.z_buf < 1e20).mean())
        mid_reg = cache.mid_reg
        req = V7_EPISODES[ep_id]["shots"][i]["objects"]
        on, checked = 0, 0
        for oid in req:
            b = mid_reg.object_bounds(oid)
            if b is None:  # pure ground/sky plane: always visible as backdrop
                continue
            checked += 1
            c = tuple(float(x) for x in 0.5 * (b[0] + b[1]))
            pt = renderer.project_point(c, eye, tgt, fov)
            if pt is not None and 0 <= pt[0] < 1080 and 0 <= pt[1] < 1920:
                on += 1
        ratio = on / max(1, checked)
        rows.append({"shot": s["id"], "objects_in_shot": nobj, "narrated": len(req),
                     "onscreen_ratio": round(ratio, 3), "coverage": round(coverage, 3)})
        if ratio < ONSCREEN_MIN:
            fails.append(f"{s['id']}: only {on}/{checked} narrated objects on-screen")
    n_unique = len(cache.episode_ids)
    mean_cov = float(np.mean([r["coverage"] for r in rows]))
    if len(shots) < MIN_SHOTS:
        fails.append(f"shots {len(shots)} < {MIN_SHOTS}")
    if n_unique < MIN_OBJECTS:
        fails.append(f"unique objects {n_unique} < {MIN_OBJECTS}")
    if mean_cov < COVERAGE_MIN:
        fails.append(f"mean coverage {mean_cov:.2f} < {COVERAGE_MIN}")
    return {"episode_id": ep_id, "shots": len(shots), "unique_objects": n_unique,
            "mean_coverage": round(mean_cov, 3),
            "min_onscreen_ratio": min(r["onscreen_ratio"] for r in rows),
            "pass": not fails, "fails": fails, "per_shot": rows}


def main() -> None:
    eps = sys.argv[1:] or list(V7_EPISODES.keys())
    director.N_STATES = 4  # QA only needs mid-shot states; camera framing is identical
    renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=0.4, shadow_res=256)
    out_dir = ROOT / "output/qa"
    out_dir.mkdir(parents=True, exist_ok=True)
    results, ok = [], True
    for ep in eps:
        r = qa_episode(ep, renderer)
        results.append(r)
        ok &= r["pass"]
        print(f"[{'PASS' if r['pass'] else 'FAIL'} {ep}] shots={r['shots']} unique_objects={r['unique_objects']} "
              f"min_onscreen={r['min_onscreen_ratio']:.2f} mean_coverage={r['mean_coverage']:.2f} {r['fails']}", flush=True)
    (out_dir / "v7_density_qa.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
