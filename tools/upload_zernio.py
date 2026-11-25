#!/usr/bin/env python3
"""
upload_zernio.py — unggah & jadwalkan episode YouTube (Shorts & Long 10–20 menit) lewat API Zernio.

Arsitektur (identik dengan jalur produksi Zernio):
  1. GET  /accounts atau /profiles       -> deteksi accountId YouTube otomatis
  2. POST /media/presign                 -> minta presigned uploadUrl untuk MP4
  3. PUT  <uploadUrl>                    -> unggah byte MP4 mentah ke storage Zernio
  4. POST /media/presign                 -> minta presigned uploadUrl untuk JPEG thumbnail
  5. PUT  <uploadUrl>                    -> unggah byte JPEG thumbnail
  6. POST /posts (+ Idempotency-Key)     -> buat post YouTube (scheduledFor + timezone atau publishNow)

Kredensial (disuntikkan dari GitHub Secrets, tidak pernah disimpan di repo):
  ZERNIO_API_KEY (atau fallback ZERNIO_KEY)
  ZERNIO_YOUTUBE_ACCOUNT_ID
  ZERNIO_PLAYLIST_ID (opsional)
"""

import argparse
import hashlib
import json
import mimetypes
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
META_DIR = ROOT / "upload"
QUEUE_DIR = META_DIR / "queue"
LOG_DIR = META_DIR / "upload-log"
LEDGER = META_DIR / "published.json"

API = os.environ.get("ZERNIO_API_BASE", "https://zernio.com/api/v1").rstrip("/")
VIDEO_LIMIT = 5 * 1024 ** 3
THUMB_LIMIT = 2 * 1024 ** 2

CLICHE = ("misteri", "ternyata", "fakta mengejutkan", "jangan percaya", "auto")
WARNS = []


def fail(msg: str):
    print(f"::error::{msg}" if os.environ.get("GITHUB_ACTIONS") else f"GAGAL: {msg}")
    raise SystemExit(1)


def get_api_key() -> str:
    return (os.environ.get("ZERNIO_API_KEY", "").strip()
            or os.environ.get("ZERNIO_KEY", "").strip())


def api_post(path: str, payload: dict, key: str, timeout: int = 120, extra_headers=None, attempts: int = 4):
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    headers.update(extra_headers or {})

    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(f"{API}{path}", data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read().decode("utf-8") or "{}")
                data["_http_status"] = r.status
                return data
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:900]
            retry_after = e.headers.get("Retry-After") if e.headers else None
            if e.code in (409, 429, 500, 502, 503, 504) and attempt < attempts:
                wait = float(retry_after) if (retry_after or "").strip().isdigit() else 2 ** attempt
                print(f"  HTTP {e.code} · coba lagi dalam {wait:.0f} dtk ({attempt}/{attempts}) · {detail[:160]}")
                time.sleep(wait)
                continue
            if e.code == 401:
                fail(f"POST {path} -> 401 Unauthorized. ZERNIO_API_KEY salah atau dicabut. {detail}")
            if e.code == 403:
                fail(f"POST {path} -> 403 Forbidden pada accountId tersebut. {detail}")
            fail(f"POST {path} -> HTTP {e.code}: {detail}")
        except urllib.error.URLError as e:
            if attempt < attempts:
                wait = 2 ** attempt
                print(f"  jaringan gagal ({e.reason}) · coba lagi dalam {wait} dtk")
                time.sleep(wait)
                continue
            fail(f"POST {path} -> jaringan gagal: {e.reason}")


def api_get(path: str, key: str, timeout: int = 60):
    req = urllib.request.Request(
        f"{API}{path}", method="GET",
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        fail(f"GET {path} -> HTTP {e.code}: {detail}")


def api_delete(path: str, key: str, timeout: int = 60):
    req = urllib.request.Request(
        f"{API}{path}", method="DELETE",
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return {"_http_status": r.status, "body": r.read().decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        fail(f"DELETE {path} -> HTTP {e.code}: {detail}")


def put_file(upload_url: str, path: pathlib.Path):
    data = path.read_bytes()
    req = urllib.request.Request(
        upload_url, data=data, method="PUT",
        headers={
            "Content-Type": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            "Content-Length": str(len(data)),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=1200) as r:
            if r.status not in (200, 201, 204):
                fail(f"PUT {upload_url[:60]}... -> HTTP {r.status}")
    except urllib.error.HTTPError as e:
        fail(f"PUT unggah media -> HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")


def upload_media(path: pathlib.Path, key: str, kind: str) -> str:
    size = path.stat().st_size
    limit = VIDEO_LIMIT if kind == "video" else THUMB_LIMIT
    if size > limit:
        fail(f"{path.name}: {size / 1024 ** 2:.1f} MB melebihi batas {limit / 1024 ** 2:.0f} MB ({kind})")
    ctype = "video/mp4" if kind == "video" else "image/jpeg"
    presigned = api_post("/media/presign", {"filename": path.name, "contentType": ctype, "size": size}, key)
    put_file(presigned["uploadUrl"], path)
    print(f"  {kind:9s} {path.name}  {size / 1024 ** 2:6.2f} MB -> {presigned['publicUrl']}")
    return presigned["publicUrl"]


def idempotency_key(ep: str, meta: dict, suffix: str = "") -> str:
    basis = (meta.get("sha256") or "") + "|" + meta.get("title", "") + "|" + suffix
    digest = hashlib.sha256(basis.encode("utf-8")).hexdigest()[:32]
    return f"aiks-{ep.lower()}-{digest}"


def discover_accounts(key: str, platform: str = "youtube"):
    out = []
    for path in ("/accounts", "/profiles"):
        try:
            data = api_get(path, key)
        except SystemExit:
            continue
        raw = data.get("accounts") or data.get("profiles") or data.get("data") or []
        if isinstance(raw, dict):
            raw = raw.get("accounts") or raw.get("profiles") or []
        for item in raw if isinstance(raw, list) else []:
            if not isinstance(item, dict):
                continue
            if (item.get("platform") or "").lower() == platform:
                out.append(item)
            for child in (item.get("platforms") or item.get("accounts") or []):
                if isinstance(child, dict) and (child.get("platform") or "").lower() == platform:
                    merged = {**item, **child}
                    merged.setdefault("profileName", item.get("name"))
                    out.append(merged)
        if out:
            break
    seen, uniq = set(), []
    for acc in out:
        aid = acc.get("accountId") or acc.get("_id") or acc.get("id")
        if not aid or aid in seen:
            continue
        if acc.get("isActive") is False or acc.get("status") == "inactive":
            continue
        seen.add(aid)
        uniq.append({
            "accountId": aid,
            "name": acc.get("username") or acc.get("name") or acc.get("handle") or "?",
            "profile": acc.get("profileName") or acc.get("profile") or "-",
        })
    return uniq


def resolve_account(key: str, want: str = None, platform: str = "youtube") -> str:
    want = (want or os.environ.get("ZERNIO_YOUTUBE_ACCOUNT_ID", "")).strip()
    accounts = discover_accounts(key, platform)
    ids = {a["accountId"] for a in accounts}
    if want and want in ids:
        return want
    if want and not ids:
        print(f"  ! daftar akun tidak terbaca; memakai ZERNIO_YOUTUBE_ACCOUNT_ID={want}")
        return want
    if not accounts:
        fail(f"Tidak ada akun {platform} yang aktif pada API key Zernio ini.")
    chosen = accounts[0]
    print(f"  akun {platform} dipakai: {chosen['accountId']} ({chosen['name']})")
    return chosen["accountId"]


def check_account():
    key = get_api_key()
    if not key:
        fail("ZERNIO_API_KEY kosong. Tambahkan di GitHub Settings -> Secrets and variables -> Actions.")
    accounts = discover_accounts(key)
    if not accounts:
        fail("API key aktif, tetapi belum ada kanal YouTube yang tersambung di Zernio.")
    want = os.environ.get("ZERNIO_YOUTUBE_ACCOUNT_ID", "").strip()
    for acc in accounts:
        mark = "  <- dipakai" if acc["accountId"] == want else ""
        print(f"    {acc['accountId']}  {acc['name']}  [{acc['profile']}]{mark}")
    print("  Kredensial Zernio siap.")


def cancel_post(post_id: str) -> int:
    key = get_api_key()
    if not key:
        fail("ZERNIO_API_KEY kosong.")
    res = api_delete(f"/posts/{post_id}", key)
    print(f"  HTTP {res['_http_status']} · {res['body'][:300]}")
    return 0


def lookup(limit: int = 20):
    key = get_api_key()
    if not key:
        fail("ZERNIO_API_KEY kosong.")
    data = api_get(f"/posts?limit={limit}", key)
    raw = data.get("posts") or data.get("data") or []
    if isinstance(raw, dict):
        raw = raw.get("posts") or []
    dump = {
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "posts": [],
    }
    for post in raw if isinstance(raw, list) else []:
        if not isinstance(post, dict):
            continue
        yt = next((p for p in post.get("platforms", []) if isinstance(p, dict) and (p.get("platform") or "").lower() == "youtube"), {})
        dump["posts"].append({
            "id": post.get("_id") or post.get("id"),
            "status": post.get("status"),
            "scheduledFor": post.get("scheduledFor"),
            "createdAt": post.get("createdAt") or post.get("publishedAt"),
            "title": post.get("title") or (yt.get("platformSpecificData") or {}).get("title"),
            "url": yt.get("platformPostUrl"),
        })
    out = META_DIR / "zernio-posts.json"
    out.write_text(json.dumps(dump, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {len(dump['posts'])} post disimpan ke {out.relative_to(ROOT)}")
    return dump


def load_ledger() -> dict:
    if not LEDGER.exists():
        return {}
    try:
        d = json.loads(LEDGER.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def save_ledger(ledger: dict):
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_meta(ep: str) -> dict:
    p = META_DIR / f"{ep}.json"
    if not p.exists():
        fail(f"metadata tidak ditemukan: {p.relative_to(ROOT)}")
    return json.loads(p.read_text(encoding="utf-8"))


def sha256_path(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(4 * 1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def validate_studio_provenance(meta: dict) -> list:
    errs = []
    prov = meta.get("render_provenance")
    if not isinstance(prov, dict):
        return ["render_provenance wajib ada pada metadata upload"]
    if prov.get("engine") != "ai-kids-studio-3d-cpp":
        errs.append("engine render wajib 'ai-kids-studio-3d-cpp'")
    ep_entrypoint = prov.get("entrypoint", "")
    if not ep_entrypoint or not (ROOT / ep_entrypoint).is_file():
        errs.append(f"entrypoint render tidak ditemukan di repo: {ep_entrypoint}")
    manifest_rel = prov.get("manifest", "")
    if not manifest_rel or not (ROOT / manifest_rel).is_file():
        errs.append(f"manifest provenance tidak ditemukan: {manifest_rel}")
    else:
        mp = json.loads((ROOT / manifest_rel).read_text(encoding="utf-8"))
        if mp.get("master_sha256") != meta.get("sha256"):
            errs.append("master_sha256 di provenance tidak cocok dengan sha256 metadata")
    return errs


def validate(meta: dict, media_dir: pathlib.Path, check_media: bool = True):
    errs = validate_studio_provenance(meta)
    title = meta.get("title", "")
    if not title.strip():
        errs.append("judul kosong")
    if len(title) > 100:
        errs.append(f"judul {len(title)} karakter (batas YouTube 100)")
    low_t = title.lower()
    for c in CLICHE:
        if c in low_t:
            WARNS.append(f"judul memuat kata klise '{c}'")
    if title.isupper():
        errs.append("judul huruf besar semua dilarang")

    hook = meta.get("hook", "")
    if not hook.strip():
        errs.append("hook kosong")
    desc = meta.get("description", "")
    if len(desc) > 5000:
        errs.append(f"deskripsi {len(desc)} karakter (batas 5000)")
    if desc and hook and not desc.startswith(hook):
        errs.append("deskripsi wajib dibuka persis dengan kalimat hook")

    tags = meta.get("tags") or []
    if sum(len(t) for t in tags) > 500:
        errs.append("total panjang tags melebihi 500 karakter")
    if meta.get("madeForKids") is True:
        errs.append("madeForKids=true mematikan kolom komentar diskusi")

    if check_media:
        video = media_dir / meta["video"]
        if not video.exists():
            errs.append(f"file video tidak ada: {video}")
        else:
            sz = video.stat().st_size
            if sz <= 0:
                errs.append("file video 0 byte")
            if meta.get("size_bytes") and sz != meta["size_bytes"]:
                errs.append(f"ukuran {meta['video']} ({sz}) != size_bytes metadata ({meta['size_bytes']})")
            elif meta.get("sha256") and sha256_path(video) != meta["sha256"]:
                errs.append(f"sha256 {meta['video']} tidak cocok dengan metadata")
        thumb = media_dir / meta["thumbnail"]
        if not thumb.exists():
            errs.append(f"file thumbnail tidak ada: {thumb}")
        elif thumb.stat().st_size > THUMB_LIMIT:
            errs.append(f"thumbnail > 2 MB ({thumb.stat().st_size / 1024 ** 2:.2f} MB)")

    if errs:
        for e in errs:
            print(f"::error::{e}" if os.environ.get("GITHUB_ACTIONS") else f"  x {e}")
        raise SystemExit(1)


def build_payload(meta: dict, video_url: str, thumb_url: str, visibility: str = None, schedule: dict = None) -> dict:
    account = os.environ.get("ZERNIO_YOUTUBE_ACCOUNT_ID", "").strip()
    playlist = os.environ.get("ZERNIO_PLAYLIST_ID", "").strip()
    psd = {
        "title": meta["title"],
        "visibility": visibility or meta.get("visibility", "public"),
        "categoryId": str(meta.get("categoryId", "28")),
        "madeForKids": bool(meta.get("madeForKids", False)),
        "containsSyntheticMedia": bool(meta.get("containsSyntheticMedia", True)),
    }
    if playlist:
        psd["playlistId"] = playlist
    if meta.get("first_comment"):
        psd["firstComment"] = meta["first_comment"]

    sched_for = (schedule or {}).get("scheduledFor") or meta.get("scheduledFor")
    tz = (schedule or {}).get("timezone") or meta.get("timezone") or "Asia/Makassar"
    if sched_for:
        when = {"scheduledFor": sched_for, "timezone": tz}
    else:
        when = {"publishNow": True}

    return {
        **when,
        "content": meta["description"],
        "tags": meta.get("tags", []),
        "mediaItems": [{"type": "video", "url": video_url, "thumbnail": thumb_url}],
        "platforms": [{"platform": "youtube", "accountId": account, "platformSpecificData": psd}],
    }


def run_episode(ep: str, media_dir: pathlib.Path, send: bool, visibility: str = None, check_media: bool = True, request: dict = None, force: bool = False) -> dict:
    WARNS.clear()
    meta = load_meta(ep)
    sched_info = (request or {}).get("scheduledFor") or meta.get("scheduledFor") or "publishNow"
    print(f"\n=== {ep} [{meta.get('slot_label', 'VIDEO')}] · {meta['title']} ({sched_info}) ===")
    validate(meta, media_dir, check_media)

    key = get_api_key()
    visibility = visibility or (request or {}).get("visibility")
    force = force or bool((request or {}).get("force"))
    ledger = load_ledger()

    if send and ep in ledger and not force:
        print(f"::notice title=DILEWATI-{ep}::{ep} sudah tercatat di published.json ({ledger[ep].get('status')})")
        return {"episode": ep, "skipped": True, **ledger[ep]}

    for w in WARNS:
        print(f"  ! peringatan gaya: {w}")

    if not send:
        payload = build_payload(meta, f"<publicUrl {meta['video']}>", f"<publicUrl {meta['thumbnail']}>", visibility, schedule=request)
        payload["platforms"][0]["accountId"] = os.environ.get("ZERNIO_YOUTUBE_ACCOUNT_ID", "").strip() or "<auto-discover GET /v1/accounts>"
        print("  dry-run OK. Payload POST /v1/posts:")
        print("\n".join("    " + ln for ln in json.dumps(payload, ensure_ascii=False, indent=2).splitlines()))
        return {"episode": ep, "dry_run": True, "scheduledFor": payload.get("scheduledFor"), "payload": payload}

    if not key:
        fail("ZERNIO_API_KEY kosong — tambahkan di GitHub Secrets")
    account = resolve_account(key, (request or {}).get("accountId"))
    os.environ["ZERNIO_YOUTUBE_ACCOUNT_ID"] = account

    video_url = upload_media(media_dir / meta["video"], key, "video")
    thumb_url = upload_media(media_dir / meta["thumbnail"], key, "thumbnail")

    payload = build_payload(meta, video_url, thumb_url, visibility, schedule=request)
    idem = idempotency_key(ep, meta, suffix=str(payload.get("scheduledFor") or "now"))
    print(f"  POST /v1/posts · Idempotency-Key: {idem}")
    result = api_post("/posts", payload, key, extra_headers={"Idempotency-Key": idem})
    post = (result or {}).get("post", {})
    yt = next((p for p in post.get("platforms", []) if p.get("platform") == "youtube"), {})

    out = {
        "episode": ep,
        "dry_run": False,
        "title": meta["title"],
        "slot": meta.get("slot_label"),
        "post_id": post.get("_id"),
        "status": post.get("status"),
        "scheduled_for": payload.get("scheduledFor"),
        "timezone": payload.get("timezone"),
        "youtube_url": yt.get("platformPostUrl"),
        "video_url_in_zernio": video_url,
        "idempotency_key": idem,
        "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    ledger[ep] = {k: v for k, v in out.items() if k != "dry_run"}
    save_ledger(ledger)
    print(f"  SUKSES [{out['status']}]: post_id={out['post_id']} · jadwal={out.get('scheduled_for') or 'SEKARANG'} · url={out.get('youtube_url') or '(muncul saat rilis)'}")
    return out


def discover_ready_queue_requests():
    reqs = []
    ledger = load_ledger()
    for p in sorted(QUEUE_DIR.glob("*.json")):
        q = json.loads(p.read_text(encoding="utf-8"))
        ep = q.get("episode")
        if q.get("status") != "requested" or q.get("approved") is not True or not ep:
            continue
        meta_p = META_DIR / f"{ep}.json"
        if not meta_p.exists():
            continue
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        if not (meta.get("drive_file_id") and meta.get("sha256") and meta.get("size_bytes")):
            continue
        if ep in ledger and not q.get("force"):
            continue
        reqs.append((ep, q))
    # Sort chronologically by scheduledFor
    reqs.sort(key=lambda pair: pair[1].get("scheduledFor") or "")
    return reqs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode", nargs="?", help="KT-S01, KT-L01, ...")
    ap.add_argument("--batch-ready", action="store_true", help="proses semua antrean upload/queue/*.json yang approved & siap")
    ap.add_argument("--media-dir", default="media")
    ap.add_argument("--send", action="store_true", help="kirim sungguhan ke Zernio (tanpa flag ini = dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="validasi & cetak payload tanpa kirim ke Zernio")
    ap.add_argument("--visibility", choices=["public", "unlisted", "private"])
    ap.add_argument("--request", help="path ke berkas upload/queue/<EP>.json")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--lookup", action="store_true")
    ap.add_argument("--cancel", metavar="POST_ID")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--text-only", action="store_true")
    args = ap.parse_args()

    if args.lookup:
        lookup()
        return 0
    if args.cancel:
        return cancel_post(args.cancel)
    if args.check:
        check_account()
        return 0
    if args.text_only and args.send:
        fail("--text-only tidak boleh digabung dengan --send")

    media_dir = pathlib.Path(args.media_dir)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    results = []

    if args.batch_ready:
        pairs = discover_ready_queue_requests()
        if not pairs:
            print("Tidak ada antrean baru yang siap dikirim (semua sudah terjadwal atau menunggu render).")
            return 0
        for ep, q in pairs:
            results.append(run_episode(ep, media_dir, args.send, args.visibility, not args.text_only, q, args.force))
    elif args.request:
        q = json.loads(pathlib.Path(args.request).read_text(encoding="utf-8"))
        ep = q.get("episode")
        if not ep:
            fail(f"{args.request}: field 'episode' kosong")
        results.append(run_episode(ep, media_dir, args.send, args.visibility, not args.text_only, q, args.force))
    elif args.episode:
        q_default = QUEUE_DIR / f"{args.episode}.json"
        q = json.loads(q_default.read_text(encoding="utf-8")) if q_default.exists() else {}
        results.append(run_episode(args.episode, media_dir, args.send, args.visibility, not args.text_only, q, args.force))
    else:
        fail("sebutkan kode episode (mis. KT-S01), --request, atau --batch-ready")

    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    log = LOG_DIR / f"{stamp}{'' if args.send else '-dryrun'}.json"
    log.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nlog tersimpan: {log.relative_to(ROOT)}")

    if os.environ.get("GITHUB_STEP_SUMMARY"):
        lines = [
            "## Jadwal & Upload YouTube via Zernio (4 Slot / Hari)",
            "",
            "| Episode | Slot | Jadwal (WITA) | Status | Link / Post ID |",
            "|---|---|---|---|---|",
        ]
        for r in results:
            st = "dry-run" if r.get("dry_run") else (r.get("status") or "skipped")
            lnk = r.get("youtube_url") or r.get("post_id") or "—"
            lines.append(f"| {r['episode']} | {r.get('slot') or '-'} | {r.get('scheduled_for') or r.get('scheduledFor') or 'now'} | {st} | {lnk} |")
        pathlib.Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
