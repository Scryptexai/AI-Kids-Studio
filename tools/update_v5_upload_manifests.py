"""
Updates `upload/<EP>.json`, `upload/queue/<EP>.json`, `upload/provenance/<EP>.json`,
and `upload/drive_manifest.json` for V5 `cartoon-3d-short` rebuilt episodes that have
been uploaded + `make_public` on Google Drive (`1nBzSmuWbD_vbognbMZ4B9NQStpiuLcYn`).
"""

from __future__ import annotations
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
UPLOAD = ROOT / "upload"

DRIVE_V5_IDS = {
    "KT-S08": "1HZY-iy-_Z5GX9SttTHCp_eiWeKFvxYOn",
    "KT-S10": "1eicM7rbEQcLlm5Wl0S3pcc2QSp5bZ3Cy",
    "KT-S13": "1it8JkJBEl_etzWlYbnQyhvvvAQ43yK9y",
    "KT-S14": "1t7AFL2GlpXJg9tFuZ2MXG7vG4hjzqT3U",
    "KT-R01": "1d2gNNjHuohv2L0q8Wrjyh1qVY3Yn-mFm",
    "KT-R02": "12QpQJtHqObD40XLqGhd45uOPCmmhZiGb",
    "KT-R03": "1sJAbTK5HegLUNYa5OPoWBUJdY1hfBd3P",
    "KT-R04": "1YJn5bg0nvXsfC5FpUKh5TksZIRJQK3E2",
    "KT-R05": "1AgsUzKhOVQnQsNCFdqW2mpRg_4PYO3dJ",
    "KT-R06": "1grexD8xZRmeXLbhikwx6L9kbjzwMLmRZ",
}

REVISION = "v5_cartoon_3d_short_phrase_locked_14lufs"


def main() -> None:
    qa_summary = {
        r["episode_id"]: r
        for r in json.loads((ROOT / "output/qa/v5_batch_qa_summary.json").read_text(encoding="utf-8"))
    }
    dm_path = UPLOAD / "drive_manifest.json"
    dm = json.loads(dm_path.read_text(encoding="utf-8"))

    for ep, fid in DRIVE_V5_IDS.items():
        qa = qa_summary[ep]
        vid_name = f"{ep}_1080x1920_v5_master.mp4"
        sha = qa["sha256"]
        sz = qa["bytes"]
        dur = round(float(qa["duration_s"]), 2)

        # 1. upload/<EP>.json
        meta_p = UPLOAD / f"{ep}.json"
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        old_fid = meta.get("drive_file_id")
        meta["video"] = vid_name
        meta["drive_file_id"] = fid
        meta["size_bytes"] = sz
        meta["sha256"] = sha
        meta["render_provenance"] = {
            "engine": "ai-kids-studio-3d-cpp",
            "entrypoint": "src/knot_v5_director.py",
            "manifest": f"upload/provenance/{ep}.json",
        }
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        # 2. upload/queue/<EP>.json
        q_p = UPLOAD / "queue" / f"{ep}.json"
        q = json.loads(q_p.read_text(encoding="utf-8"))
        q["status"] = "requested"
        q["approved"] = True
        q["revision"] = REVISION
        q["master_sha256"] = sha
        q_p.write_text(json.dumps(q, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        # 3. upload/provenance/<EP>.json
        prov_p = UPLOAD / "provenance" / f"{ep}.json"
        prov = {
            "episode": ep,
            "engine": "ai-kids-studio-3d-cpp",
            "entrypoint": "src/knot_v5_director.py",
            "skill_pipeline": ["cartoon-3d-short", "captions"],
            "video_filename": vid_name,
            "master_sha256": sha,
            "size_bytes": sz,
            "duration_seconds": dur,
            "resolution": "1080x1920",
            "fps": 30,
            "loudness_lufs": -14.0,
            "voice_id": "voice-00",
            "drive_file_id": fid,
            "superseded_drive_file_id": old_fid,
            "director_version": REVISION,
        }
        prov_p.write_text(json.dumps(prov, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        # 4. upload/drive_manifest.json
        dm["episodes"][ep] = {
            "video": vid_name,
            "thumbnail": f"{ep}_thumbnail.jpg",
            "drive_file_id": fid,
            "size_bytes": sz,
            "sha256": sha,
            "duration_seconds": dur,
            "resolution": "1080x1920",
            "slot": meta.get("slot_label"),
            "scheduledFor": meta.get("scheduledFor"),
            "timezone": meta.get("timezone", "Asia/Makassar"),
            "quality_revision": REVISION,
        }
        print(f"[UPDATED {ep}] fid={fid} | {sz/1e6:.2f} MB | {dur:.2f}s | sha={sha[:12]}...")

    dm_path.write_text(json.dumps(dm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Updated upload/drive_manifest.json")


if __name__ == "__main__":
    main()
