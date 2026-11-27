"""
Writes Zernio upload manifests for V7 storytelling Shorts (V6 3D scenes + V7 story scripts) after the masters are on Google Drive
(folder `1nBzSmuWbD_vbognbMZ4B9NQStpiuLcYn`, `anyone` reader):

  upload/<EP>.json            (metadata built from src/knot_v7_story_scripts.py narration)
  upload/queue/<EP>.json      (status=requested, approved=true -> push triggers youtube-upload.yml)
  upload/provenance/<EP>.json (engine / entrypoint / sha256 / density QA)
  upload/drive_manifest.json  (episode entry)

Usage: .venv/bin/python tools/update_v7_upload_manifests.py KT-R07=<drive_id> KT-R08=<drive_id> ...
A changed sha256 makes tools/upload_zernio.py supersede (DELETE) the previous Zernio post automatically.
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.knot_v7_story_scripts import V7_EPISODES  # noqa: E402

UPLOAD = ROOT / "upload"
REVISION = "v7_storytelling_20plus_shots_50plus_objects_14lufs"
HASHTAGS = "#KnotTheory #InfrastrukturTersembunyi #CaraKerjaMesin #SainsSehariHari #Shorts"


def build_description(ep: dict) -> tuple[str, str]:
    """Story recap (hook first) -> accuracy note -> closing line -> reference -> question -> CTA -> hashtags.
    V7: no "Oh, jadi" synthesis line anywhere."""
    shots = ep["shots"]
    texts = [s["text"].strip() for s in shots]
    b_idx = [i for i, s in enumerate(shots) if s.get("boundary")]
    c_idx = next(i for i, s in enumerate(shots) if s.get("closing"))
    hook = texts[0]
    body_end = b_idx[0] if b_idx else c_idx
    body = " ".join(texts[:body_end])
    b_txt = " ".join(texts[b_idx[0]:b_idx[-1] + 1]) if b_idx else ""
    if b_txt.startswith("Tapi "):
        b_txt = b_txt[5:6].upper() + b_txt[6:]
    boundary = f"Batas akurasi: {b_txt}" if b_txt else ""
    desc = "\n\n".join(p for p in [
        body,
        boundary,
        texts[c_idx],
        f"Referensi: {ep['reference']}",
        f"Pertanyaan diskusi: {ep['cta_question']}",
        "Tekan tombol putih di bawah agar mendapatkan hal-hal yang gak disangka setiap hari!",
        HASHTAGS,
    ] if p)
    assert desc.startswith(hook)
    assert "oh, jadi" not in desc.lower() and "oh jadi" not in desc.lower()
    return hook, desc


def main() -> None:
    pairs = dict(a.split("=", 1) for a in sys.argv[1:])
    qa = {r["episode_id"]: r for r in json.loads((ROOT / "output/qa/v7_batch_qa_summary.json").read_text(encoding="utf-8"))}
    dm_path = UPLOAD / "drive_manifest.json"
    dm = json.loads(dm_path.read_text(encoding="utf-8"))

    for ep_id, fid in pairs.items():
        ep = V7_EPISODES[ep_id]
        r = qa[ep_id]
        vid_name = f"{ep_id}_1080x1920_v7_master.mp4"
        dur = round(float(r["duration_s"]), 2)
        hook, desc = build_description(ep)

        meta_p = UPLOAD / f"{ep_id}.json"
        old = json.loads(meta_p.read_text(encoding="utf-8")) if meta_p.exists() else {}
        meta = {
            "episode": ep_id,
            "slot_label": ep["slot_label"],
            "video": vid_name,
            "thumbnail": f"{ep_id}_thumbnail.jpg",
            "drive_file_id": fid,
            "size_bytes": r["bytes"],
            "sha256": r["sha256"],
            "title": ep["title"],
            "hook": hook,
            "description": desc,
            "tags": ep["tags"],
            "categoryId": "28",
            "visibility": "public",
            "madeForKids": False,
            "containsSyntheticMedia": False,
            "defaultLanguage": "id",
            "defaultAudioLanguage": "id",
            "first_comment": f"{ep['cta_question']} — Tulis jawabanmu di komentar & tekan tombol putih di bawah ya!",
            "scheduledFor": ep["scheduledFor"],
            "timezone": "Asia/Makassar",
            "render_provenance": {
                "engine": "ai-kids-studio-3d-cpp",
                "entrypoint": "src/knot_v7_director.py",
                "manifest": f"upload/provenance/{ep_id}.json",
            },
        }
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        q_p = UPLOAD / "queue" / f"{ep_id}.json"
        q = {
            "episode": ep_id,
            "status": "requested",
            "approved": True,
            "slot": ep["slot_label"],
            "scheduledFor": ep["scheduledFor"],
            "timezone": "Asia/Makassar",
            "visibility": "public",
            "revision": REVISION,
            "master_sha256": r["sha256"],
        }
        q_p.write_text(json.dumps(q, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        prov = {
            "episode": ep_id,
            "engine": "ai-kids-studio-3d-cpp",
            "entrypoint": "src/knot_v7_director.py",
            "scene_builders": "src/knot_v6_objects.py",
            "script": "src/knot_v7_story_scripts.py",
            "skill_pipeline": ["cartoon-3d-short", "captions"],
            "video_filename": vid_name,
            "master_sha256": r["sha256"],
            "size_bytes": r["bytes"],
            "duration_seconds": dur,
            "resolution": "1080x1920",
            "fps": 30,
            "loudness_lufs": -14.0,
            "voice_id": "voice-00",
            "shots": r.get("shots"),
            "unique_3d_objects": r.get("unique_objects"),
            "density_qa": "tools/v7_density_qa.py",
            "drive_file_id": fid,
            "superseded_drive_file_id": old.get("drive_file_id"),
            "director_version": REVISION,
        }
        (UPLOAD / "provenance" / f"{ep_id}.json").write_text(json.dumps(prov, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        dm["episodes"][ep_id] = {
            "video": vid_name,
            "thumbnail": f"{ep_id}_thumbnail.jpg",
            "drive_file_id": fid,
            "size_bytes": r["bytes"],
            "sha256": r["sha256"],
            "duration_seconds": dur,
            "resolution": "1080x1920",
            "slot": ep["slot_label"],
            "scheduledFor": ep["scheduledFor"],
            "timezone": "Asia/Makassar",
            "quality_revision": REVISION,
        }
        print(f"[UPDATED {ep_id}] fid={fid} | {r['bytes'] / 1e6:.2f} MB | {dur:.2f}s | shots={r.get('shots')} objects={r.get('unique_objects')}")

    dm_path.write_text(json.dumps(dm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
