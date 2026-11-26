# usage: python scripts/words_from_voice.py <voice.wav> <SCRIPT.md> <out words.json> [language=id]
# Word timings for the voice-over: faster-whisper (word timestamps, Indonesian) gives the times, then every word of
# the narration column in SCRIPT.md is aligned to the recognised words (difflib), so words.json always carries the
# script's own spelling. Script words the recogniser missed get times interpolated between their aligned neighbours.
# Output: [{"w": word, "s": start_s, "e": end_s, "beat": n}], plus <out>_raw.json with the untouched recognition.
import difflib, json, os, re, sys

if os.environ.get("HF_CACHE_DIR"): os.environ.setdefault("HF_HOME", os.environ["HF_CACHE_DIR"])
from faster_whisper import WhisperModel

wav, script, out = sys.argv[1:4]
lang = sys.argv[4] if len(sys.argv) > 4 else "id"
norm = lambda w: re.sub(r"[^0-9a-z]", "", w.lower())

# narration column of the script table: | # | Beat | Narasi | Gambar |
words = []
for line in open(script, encoding="utf-8"):
    m = re.match(r"^\| (\d+) \|[^|]*\|([^|]*)\|", line)
    if m:
        words += [{"w": w, "beat": int(m.group(1))} for w in m.group(2).split()]

model = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = model.transcribe(wav, language=lang, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
rec = [{"w": x.word.strip(), "s": round(x.start, 3), "e": round(x.end, 3)} for s in segs for x in s.words]
json.dump(rec, open(out.replace(".json", "_raw.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

sm = difflib.SequenceMatcher(a=[norm(w["w"]) for w in words], b=[norm(r["w"]) for r in rec], autojunk=False)
for i, j, n in sm.get_matching_blocks():
    for k in range(n):
        words[i + k].update(s=rec[j + k]["s"], e=rec[j + k]["e"])
hit = sum("s" in w for w in words)
# interpolate the gaps evenly between the neighbouring aligned words
i = 0
while i < len(words):
    if "s" in words[i]:
        i += 1
        continue
    j = i
    while j < len(words) and "s" not in words[j]:
        j += 1
    t0 = words[i - 1]["e"] if i else 0.0
    t1 = words[j]["s"] if j < len(words) else rec[-1]["e"]
    step = (t1 - t0) / (j - i)
    for k in range(i, j):
        words[k].update(s=round(t0 + (k - i) * step, 3), e=round(t0 + (k - i + 1) * step, 3), guess=True)
    i = j
json.dump(words, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(words)} script words, {hit} aligned, {len(words) - hit} interpolated; recognised {len(rec)}; "
      f"speech {words[0]['s']:.2f}-{words[-1]['e']:.2f} s")
for b in sorted({w["beat"] for w in words}):
    ws = [w for w in words if w["beat"] == b]
    print(f"beat {b}: {ws[0]['s']:6.2f}-{ws[-1]['e']:6.2f}  {' '.join(w['w'] for w in ws[:5])} ...")
