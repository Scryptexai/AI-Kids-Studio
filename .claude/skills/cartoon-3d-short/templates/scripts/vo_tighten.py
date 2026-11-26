"""Tighten a narration take: shorten every silent gap between words without touching the words themselves.

usage: python -I scripts/vo_tighten.py <voice_dir> [--gap 0.05] [--stop 0.10] [--tail 0.35]

Reads <voice_dir>/voice_uncut.wav + words_uncut.json (made from voice.wav / words.json on the first run, so the
uncut take is never lost) and writes <voice_dir>/voice.wav + words.json (the cut take) + tighten_map.json.
- Only audio that is really quiet is removed: inside each word gap the script finds the quiet run (10 ms RMS
  below --quiet dBFS) and keeps --gap seconds of it (--stop after , . ; : ! ?), so breaths and word tails stay.
- Each splice is a short equal-power crossfade (no clicks).
- Leading silence before the first word is kept as it is; the tail after the last word is cut to --tail.
words.json keeps every field; only s / e move. tighten_map.json lists per word [uncut start, cut start] (seconds),
the anchor table a film uses to map its picture clock onto the cut voice.
"""
import json, os, shutil, sys, wave
import numpy as np

def arg(name, d):
    return float(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else d

vd = sys.argv[1]
GAP, STOP, TAIL, QUIET = arg("--gap", 0.05), arg("--stop", 0.10), arg("--tail", 0.35), arg("--quiet", -42.0)
XF = 0.008  # crossfade seconds
src_wav, src_words = os.path.join(vd, "voice_uncut.wav"), os.path.join(vd, "words_uncut.json")
if not os.path.exists(src_wav):
    shutil.copy2(os.path.join(vd, "voice.wav"), src_wav)
    shutil.copy2(os.path.join(vd, "words.json"), src_words)

w = wave.open(src_wav)
sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
assert sw == 2, "16-bit wav expected"
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, ch).astype(np.float32) / 32768
words = json.load(open(src_words, encoding="utf-8"))
mono = x.mean(axis=1)
win = int(0.01 * sr)
nwin = len(mono) // win
rms = np.sqrt((mono[: nwin * win].reshape(nwin, win) ** 2).mean(axis=1) + 1e-12)
db = 20 * np.log10(rms)

# Pauses are found in the AUDIO, not in words.json: aligner word edges are often off by 0.1-0.4 s (a "gap" can
# hold speech, a "word" can hold a pause). Every quiet run of >= MINRUN s after the first word is a pause.
MINRUN = arg("--minrun", 0.12)
runs, i = [], int(words[0]["s"] / 0.01)
while i < nwin:
    if db[i] < QUIET:
        j = i
        while j < nwin and db[j] < QUIET: j += 1
        if (j - i) * 0.01 >= MINRUN: runs.append((i * 0.01, j * 0.01))
        i = j
    else:
        i += 1

def boundary_keep(q0):
    """the word that ends nearest before the pause decides: punctuation -> STOP, else GAP"""
    prev = [wd for wd in words if wd["s"] < q0]
    return STOP if prev and prev[-1]["w"].rstrip()[-1:] in ",.;:!?" else GAP

# cuts = list of (start_s, end_s) spans of the uncut take to remove
cuts = []
last_e = words[-1]["e"]
for q0, q1 in runs:
    if q0 >= last_e: break  # the tail is handled below
    keep = boundary_keep(q0)
    if q1 - q0 > keep + 0.02:
        # keep 60 % of the kept silence after the sound before, 40 % before the next onset
        cuts.append((q0 + keep * 0.6, q1 - keep * 0.4))
end_keep = words[-1]["e"] + TAIL
if end_keep < len(mono) / sr: cuts.append((end_keep, len(mono) / sr))

def shift(t):
    """cut-take time of an uncut-take time"""
    s = 0.0
    for c0, c1 in cuts:
        if t >= c1: s += c1 - c0
        elif t > c0: s += t - c0
    return t - s

# splice
out, pos, n = [], 0, int(XF * sr)
fade = np.sin(np.linspace(0, np.pi / 2, n))[:, None]
for c0, c1 in cuts:
    a0, a1 = int(c0 * sr), int(c1 * sr)
    seg = x[pos:a0].copy()
    if out and n and len(seg) > n:  # crossfade the head of this piece with the tail of the previous one
        prev = out[-1]
        prev[-n:] = prev[-n:] * fade[::-1] + seg[:n] * fade
        seg = seg[n:]
    out.append(seg)
    pos = a1
seg = x[pos:].copy()
if out and n and len(seg) > n:
    prev = out[-1]; prev[-n:] = prev[-n:] * fade[::-1] + seg[:n] * fade; seg = seg[n:]
out.append(seg)
y = np.concatenate(out)
o = wave.open(os.path.join(vd, "voice.wav"), "wb")
o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr)
o.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes()); o.close()

new = []
for wd in words:
    d = dict(wd); d["s"] = round(shift(wd["s"]), 3); d["e"] = round(shift(wd["e"]), 3); new.append(d)
json.dump(new, open(os.path.join(vd, "words.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump({"cuts": [[round(a, 3), round(b, 3)] for a, b in cuts],
           "anchors": [[wd["s"], nw["s"]] for wd, nw in zip(words, new)],
           "uncut_len": round(len(x) / sr, 3), "cut_len": round(len(y) / sr, 3)},
          open(os.path.join(vd, "tighten_map.json"), "w"), indent=1)
removed = sum(b - a for a, b in cuts)
print(f"{len(cuts)} cuts, removed {removed:.2f} s: {len(x)/sr:.2f} s -> {len(y)/sr:.2f} s")
gaps = [round(b["s"] - a["e"], 2) for a, b in zip(new, new[1:])]
print("largest gaps now:", sorted(gaps)[-6:])
