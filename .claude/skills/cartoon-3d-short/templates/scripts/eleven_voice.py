"""ElevenLabs voice-over for a story, with a request -> approve -> generate gate so no credits are spent unasked.

usage: python scripts/eleven_voice.py <command> ...
  quota                                  plan, characters used / left this period (free)
  voices   [--search TEXT]               voices in your account: name, id, accent, gender (free)
  models                                 text-to-speech models and their languages (free)
  preview  VOICE                         download the voice's free preview clip to out/voice-previews/
  request  STORY [--voice VOICE] [--model ID] [--stability X] [--similarity X] [--style X] [--speed X]
                 [--seed N] [--lang CODE] [--gap MS] [--redo 3,5]
           first request defaults: voice iFanz English American Voice, eleven_v4, stability 0.5, similarity 0.5
           -> writes stories/STORY/voice/elevenlabs_request.json and prints what WOULD be generated and what it
              costs. Spends nothing. Clears any earlier approval. Edit the json to change a beat's spoken "text"
              (e.g. add <break time="0.4s" />) or its "gap_after_ms", then run request again to re-price it.
  approve  STORY                         stamp the current request as approved (only after the user says yes)
  generate STORY                         generate exactly the approved beats, stitch voice_eleven.wav + words_eleven.json
  use      STORY                         make voice_eleven.wav / words_eleven.json the story's voice.wav / words.json
                                         (the old ones are kept as *_before_eleven_<time>.*)

API key: ELEVENLABS_API_KEY in the environment or in the project .env (git-ignored).
One request per beat (the rows of SCRIPT.md, or the lines of narration.txt), with the neighbouring lines passed as
previous_text / next_text so the read flows. Beats are cached by (voice, model, settings, seed, text, take): changing
one beat's text or --redo only re-buys that beat. Word times come from ElevenLabs' character alignment, so
words_eleven.json has the script's own spelling and needs no whisper pass.
"""
import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, time, wave
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
API = "https://api.elevenlabs.io"
RATE = 48000  # project audio rate
HALF_PRICE = ("eleven_flash", "eleven_turbo")  # these models cost 0.5 credit per character
# the user's chosen defaults for a story's first request (2026-11-10); flags override, later requests keep the json's
DEFAULT_VOICE = ("4cKmhJBYU2m9UMhzDe1O", "iFanz English American Voice")
DEFAULT_MODEL = "eleven_v4"
DEFAULT_SETTINGS = {"stability": 0.5, "similarity_boost": 0.5}


# ---------------------------------------------------------------- api
def api_key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    env = ROOT / ".env"
    if not k and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*ELEVENLABS_API_KEY\s*=\s*['\"]?([^'\"\s]+)", line)
            if m:
                k = m.group(1)
    if not k:
        sys.exit(f"No API key. Put a line  ELEVENLABS_API_KEY=...  in {env}  (it is git-ignored).")
    return k


def call(method, path, **kw):
    r = requests.request(method, API + path, headers={"xi-api-key": api_key()}, timeout=180, **kw)
    if r.status_code >= 400:
        try:
            d = r.json().get("detail", r.text)
        except ValueError:
            d = r.text
        sys.exit(f"ElevenLabs {r.status_code} on {path}: {d}")
    return r.json()


def all_voices():
    return call("GET", "/v1/voices")["voices"]


def find_voice(q):
    try:
        vs = all_voices()
    except SystemExit as e:  # key without voices_read: a raw voice id still works for text-to-speech
        if re.fullmatch(r"[A-Za-z0-9]{20}", q):
            print(f"(cannot list voices: {e}; using {q} as the voice id)")
            return {"voice_id": q, "name": q}
        raise
    hit = [v for v in vs if v["voice_id"] == q] or [v for v in vs if v["name"].lower() == q.lower()] \
        or [v for v in vs if q.lower() in v["name"].lower()]
    if len(hit) != 1:
        names = ", ".join(f'{v["name"]} ({v["voice_id"]})' for v in (hit or vs))
        sys.exit(f'{"No" if not hit else "More than one"} voice matches "{q}". Candidates: {names}')
    return hit[0]


def subscription():
    s = call("GET", "/v1/user/subscription")
    left = s["character_limit"] - s["character_count"]
    reset = time.strftime("%Y-%m-%d", time.localtime(s.get("next_character_count_reset_unix") or 0))
    return s, left, reset


# ---------------------------------------------------------------- story text
def story_dir(name):
    d = ROOT / "stories" / name
    if not d.is_dir():
        sys.exit(f"No story folder {d}")
    return d


def script_beats(d):
    """[(beat, narration)] from the SCRIPT.md table (| # | Beat | Narration | Picture |), else narration.txt lines."""
    sm = d / "SCRIPT.md"
    beats = []
    if sm.exists():
        for line in sm.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^\| (\d+) \|[^|]*\|([^|]*)\|", line)
            if m:
                beats.append((int(m.group(1)), m.group(2).strip()))
    if not beats and (d / "narration.txt").exists():
        lines = [l.strip() for l in (d / "narration.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
        beats = list(enumerate(lines, 1))
    if not beats:
        sys.exit(f"No narration found in {d} (SCRIPT.md table or narration.txt)")
    return beats


def h(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def beat_key(req, b):
    return h([req["voice_id"], req["model_id"], req.get("voice_settings"), req.get("seed"), req.get("language_code"),
              req["output_format"], b["text"], b.get("take", 1)])


def req_path(d):
    return d / "voice" / "elevenlabs_request.json"


def cache_dir(d):
    return d / "voice" / "eleven"


def cached(d, b, key):
    return (cache_dir(d) / f"b{b['beat']:02d}_{key}.json").exists()


_rates = {}


def credits(req, chars):
    """credits for chars on the request's model: the account's real model rate, else the old flash/turbo rule."""
    m = req["model_id"]
    if m not in _rates:
        try:
            r = next((x.get("model_rates") or {} for x in call("GET", "/v1/models") if x["model_id"] == m), {})
            _rates[m] = r.get("character_cost_multiplier", 1) * r.get("cost_discount_multiplier", 1) if r else None
        except SystemExit:
            _rates[m] = None
        if _rates[m] is None:
            _rates[m] = 0.5 if m.startswith(HALF_PRICE) else 1
    return chars * _rates[m]


def pending(d, req):
    return [b for b in req["beats"] if not cached(d, b, beat_key(req, b))]


# ---------------------------------------------------------------- commands
def cmd_quota(a):
    s, left, reset = subscription()
    print(f'plan {s["tier"]}: {s["character_count"]:,} / {s["character_limit"]:,} characters used, '
          f"{left:,} left, resets {reset}")


def cmd_voices(a):
    vs = all_voices()
    if a.search:
        q = a.search.lower()
        vs = [v for v in vs if q in json.dumps([v["name"], v.get("labels"), v.get("description")]).lower()]
    for v in sorted(vs, key=lambda v: (v.get("category") != "cloned", v["category"] or "", v["name"])):
        lb = v.get("labels") or {}
        tags = ", ".join(x for x in [lb.get("gender"), lb.get("age"), lb.get("accent"), lb.get("language"),
                                     lb.get("descriptive") or lb.get("description"), lb.get("use_case")] if x)
        print(f'{v["name"][:28]:28}  {v["voice_id"]}  {v.get("category") or "":12}  {tags}')
    print(f"{len(vs)} voices")


def cmd_models(a):
    for m in call("GET", "/v1/models"):
        if m.get("can_do_text_to_speech"):
            langs = ", ".join(l["name"] for l in m.get("languages", [])[:12])
            more = len(m.get("languages", [])) - 12
            print(f'{m["model_id"]:28} {m["name"]}\n{"":28} {langs}{f" +{more} more" if more > 0 else ""}')


def cmd_preview(a):
    v = find_voice(a.voice)
    if not v.get("preview_url"):
        sys.exit(f'{v["name"]} has no preview clip.')
    out = ROOT / "out" / "voice-previews" / f'{re.sub(r"[^A-Za-z0-9_-]+", "_", v["name"])}.mp3'
    out.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(v["preview_url"], timeout=60)
    r.raise_for_status()
    out.write_bytes(r.content)
    print(f'{v["name"]} ({v["voice_id"]}) preview saved: {out}')


def cmd_request(a):
    d = story_dir(a.story)
    p = req_path(d)
    old = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    if a.voice:
        v = find_voice(a.voice)
        voice_id, voice_name = v["voice_id"], v["name"]
    elif old:
        voice_id, voice_name = old["voice_id"], old["voice_name"]
    else:
        voice_id, voice_name = DEFAULT_VOICE
    req = {"story": a.story, "voice_id": voice_id, "voice_name": voice_name,
           "model_id": a.model or old.get("model_id", DEFAULT_MODEL),
           "output_format": old.get("output_format", "mp3_44100_128"),
           "seed": a.seed if a.seed is not None else old.get("seed", 1234),
           "lead_in_ms": old.get("lead_in_ms", 250)}
    vs = dict(old.get("voice_settings") or ({} if old else DEFAULT_SETTINGS))
    for k, x in [("stability", a.stability), ("similarity_boost", a.similarity), ("style", a.style), ("speed", a.speed)]:
        if x is not None:
            vs[k] = x
    if vs:
        req["voice_settings"] = vs
    lang = a.lang if a.lang is not None else old.get("language_code")
    if lang:
        req["language_code"] = lang
    olds = {b["beat"]: b for b in old.get("beats", [])}
    redo = {int(x) for x in a.redo.split(",")} if a.redo else set()
    req["beats"] = []
    for n, txt in script_beats(d):
        o = olds.get(n, {})
        same = o.get("script") == txt  # keep hand edits to "text" while the script line is unchanged
        b = {"beat": n, "script": txt, "text": o["text"] if same else txt,
             "gap_after_ms": a.gap if a.gap is not None else o.get("gap_after_ms", 250),
             "take": o.get("take", 1) + (1 if n in redo else 0)}
        req["beats"].append(b)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(req, ensure_ascii=False, indent=1), encoding="utf-8")

    todo = pending(d, req)
    chars = sum(len(b["text"]) for b in todo)
    print(f'REQUEST  {a.story}  ->  {p.relative_to(ROOT)}')
    print(f'voice  {voice_name} ({voice_id})   model {req["model_id"]}   seed {req["seed"]}'
          f'{"   lang " + lang if lang else ""}')
    print("settings " + (json.dumps(vs) if vs else "(the voice's own saved settings)"))
    for b in req["beats"]:
        mark = "NEW " if b in todo else "kept"
        print(f' {mark} {b["beat"]:2}  {len(b["text"]):4} ch  +{b["gap_after_ms"]}ms  {b["text"]}')
    print(f"\nto generate: {len(todo)} of {len(req['beats'])} beats, {chars:,} characters "
          f"~ {credits(req, chars):,.0f} credits")
    try:
        _, left, reset = subscription()
        print(f"account: {left:,} characters left (resets {reset})")
    except SystemExit as e:
        print(f"(could not read quota: {e})")
    print("Nothing generated. Approve with:  python scripts/eleven_voice.py approve " + a.story)


def cmd_approve(a):
    d = story_dir(a.story)
    req = json.loads(req_path(d).read_text(encoding="utf-8"))
    req.pop("approved", None)
    todo = pending(d, req)
    req["approved"] = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "request": h(req),
                       "keys": [beat_key(req, b) for b in todo]}
    req_path(d).write_text(json.dumps(req, ensure_ascii=False, indent=1), encoding="utf-8")
    chars = sum(len(b["text"]) for b in todo)
    print(f"approved {len(todo)} beats, {chars:,} characters ~ {credits(req, chars):,.0f} credits")


def decode(src, fmt):
    """audio bytes from ElevenLabs -> 48 kHz mono int16 bytes"""
    if fmt.startswith("pcm_"):
        args = ["-f", "s16le", "-ar", fmt.split("_")[1], "-ac", "1", "-i", "pipe:0"]
    else:
        args = ["-i", "pipe:0"]
    r = subprocess.run(["ffmpeg", "-v", "error", *args, "-ar", str(RATE), "-ac", "1", "-f", "s16le", "pipe:1"],
                       input=src, capture_output=True, check=True)
    return r.stdout


def trim_tail(pcm, keep_ms, floor_db=-45):
    """cut the clip's trailing silence down to keep_ms (newer models end every clip with ~0.3-0.5 s of air,
    which doubles the beat gap); the start is left alone so the alignment times stay valid."""
    a = memoryview(pcm).cast("h")
    thr = int(32768 * 10 ** (floor_db / 20))
    last = len(a) - 1
    while last > 0 and abs(a[last]) < thr:
        last -= 1
    end = min(len(a), last + 1 + int(RATE * keep_ms / 1000))
    return pcm[: end * 2]


def words_from_alignment(script, al, offset):
    """script words of one beat, timed from the character alignment (robust to break tags / normalisation)."""
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    s = "".join(chars)
    idx = []  # string position -> char index
    for i, c in enumerate(chars):
        idx += [i] * len(c)
    out, cur = [], 0
    for w in script.split():
        pos = s.find(w, cur)
        if pos < 0:  # fall back to the bare letters of the word
            core = re.sub(r"^\W+|\W+$", "", w)
            pos = s.find(core, cur) if core else -1
            w_len = len(core)
        else:
            w_len = len(w)
        if pos < 0:
            out.append({"w": w, "s": None, "e": None})
            continue
        i0, i1 = idx[pos], idx[pos + w_len - 1]
        while i1 > i0 and not chars[i1].isalnum():  # end on the last letter, not on trailing punctuation/silence
            i1 -= 1
        out.append({"w": w, "s": round(st[i0] + offset, 3), "e": round(en[i1] + offset, 3)})
        cur = pos + w_len
    return out


def cmd_generate(a):
    d = story_dir(a.story)
    req = json.loads(req_path(d).read_text(encoding="utf-8"))
    ap = req.pop("approved", None)
    if not ap or ap["request"] != h(req):
        sys.exit("This request is not approved (or was changed after approval). Run request, show it, then approve.")
    cache_dir(d).mkdir(parents=True, exist_ok=True)
    beats = req["beats"]
    for i, b in enumerate(beats):
        key = beat_key(req, b)
        if cached(d, b, key):
            continue
        if key not in ap["keys"]:
            sys.exit(f"beat {b['beat']} is not cached and not in the approval. Run request + approve again.")
        body = {"text": b["text"], "model_id": req["model_id"], "seed": req["seed"]}
        if req.get("voice_settings"):
            body["voice_settings"] = req["voice_settings"]
        if req.get("language_code"):
            body["language_code"] = req["language_code"]
        if i:
            body["previous_text"] = beats[i - 1]["text"]
        if i + 1 < len(beats):
            body["next_text"] = beats[i + 1]["text"]
        print(f"beat {b['beat']:2}: generating {len(b['text'])} ch ...", flush=True)
        r = call("POST", f'/v1/text-to-speech/{req["voice_id"]}/with-timestamps',
                 params={"output_format": req["output_format"]}, json=body)
        stem = cache_dir(d) / f"b{b['beat']:02d}_{key}"
        ext = "pcm" if req["output_format"].startswith("pcm_") else "mp3"
        stem.with_suffix("." + ext).write_bytes(base64.b64decode(r["audio_base64"]))
        stem.with_suffix(".json").write_text(json.dumps({"text": b["text"], "alignment": r["alignment"]},
                                                        ensure_ascii=False), encoding="utf-8")
    stitch(d, req)


def stitch(d, req):
    pcm = bytearray(b"\0\0" * int(RATE * req["lead_in_ms"] / 1000))
    words = []
    for b in req["beats"]:
        stem = cache_dir(d) / f"b{b['beat']:02d}_{beat_key(req, b)}"
        audio = stem.with_suffix(".pcm" if req["output_format"].startswith("pcm_") else ".mp3")
        al = json.loads(stem.with_suffix(".json").read_text(encoding="utf-8"))["alignment"]
        t0 = len(pcm) / 2 / RATE
        ws = words_from_alignment(b["script"], al, t0)
        pcm += trim_tail(decode(audio.read_bytes(), req["output_format"]), req.get("tail_keep_ms", 120))
        # the alignment's last characters still count the trailing air that trim_tail cut: clamp to the clip end,
        # or the beat's last word ends after the next beat starts (the director then drops that row to WPM)
        t1 = round(len(pcm) / 2 / RATE, 3)
        for w in ws:
            w["beat"] = b["beat"]
            if w["e"] is not None:
                w["e"] = min(w["e"], t1)
            if w["s"] is not None:
                w["s"] = min(w["s"], w["e"] if w["e"] is not None else t1)
        words += ws
        pcm += b"\0\0" * int(RATE * b["gap_after_ms"] / 1000)
    # words the alignment could not place: spread evenly between their placed neighbours
    for i, w in enumerate(words):
        if w["s"] is None:
            j = i
            while j < len(words) and words[j]["s"] is None:
                j += 1
            t0 = words[i - 1]["e"] if i else 0.0
            t1 = words[j]["s"] if j < len(words) else len(pcm) / 2 / RATE
            step = (t1 - t0) / (j - i)
            for k in range(i, j):
                words[k].update(s=round(t0 + (k - i) * step, 3), e=round(t0 + (k - i + 1) * step, 3), guess=True)
    out_wav, out_words = d / "voice" / "voice_eleven.wav", d / "voice" / "words_eleven.json"
    with wave.open(str(out_wav), "wb") as f:
        f.setnchannels(1), f.setsampwidth(2), f.setframerate(RATE), f.writeframes(bytes(pcm))
    words = [{"w": w["w"], "beat": w["beat"], "s": w["s"], "e": w["e"], **({"guess": True} if w.get("guess") else {})}
             for w in words]
    out_words.write_text(json.dumps(words, ensure_ascii=False, indent=1), encoding="utf-8")
    guessed = sum(1 for w in words if w.get("guess"))
    print(f"{out_wav.relative_to(ROOT)}  {len(pcm) / 2 / RATE:.2f} s;  {out_words.relative_to(ROOT)}  "
          f"{len(words)} words ({guessed} interpolated)")


def cmd_use(a):
    d = story_dir(a.story)
    v = d / "voice"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    for src, dst in [("voice_eleven.wav", "voice.wav"), ("words_eleven.json", "words.json")]:
        if not (v / src).exists():
            sys.exit(f"{v / src} missing; run generate first")
        if (v / dst).exists():
            keep = v / f"{Path(dst).stem}_before_eleven_{stamp}{Path(dst).suffix}"
            shutil.copy2(v / dst, keep)
            print(f"kept old {dst} as {keep.name}")
        shutil.copy2(v / src, v / dst)
        print(f"{src} -> {dst}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("quota")
    sp.add_parser("voices").add_argument("--search")
    sp.add_parser("models")
    sp.add_parser("preview").add_argument("voice")
    r = sp.add_parser("request")
    r.add_argument("story")
    r.add_argument("--voice")
    r.add_argument("--model")
    for k in ("stability", "similarity", "style", "speed"):
        r.add_argument("--" + k, type=float)
    r.add_argument("--seed", type=int)
    r.add_argument("--lang", help="ISO 639-1 code, only for models that accept it (flash/turbo v2.5)")
    r.add_argument("--gap", type=int, help="pause after every beat, ms (default 250; per beat in the json)")
    r.add_argument("--redo", help="beats to buy a new take of, e.g. 3,5")
    for c in ("approve", "generate", "use"):
        sp.add_parser(c).add_argument("story")
    a = ap.parse_args()
    globals()["cmd_" + a.cmd](a)


if __name__ == "__main__":
    main()
