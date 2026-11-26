"""Shorten a narration by trimming long pauses (and optionally speeding it up), and re-time words.json to match.

    python scripts/trim_voice.py <voice.wav> <words.json> <out_prefix> [--line 0.40] [--word 0.22] [--tempo 1.0]

Writes <out_prefix>.wav and <out_prefix>_words.json. Nothing is overwritten in place: install the result yourself
(back up voice.wav / words.json first). Pauses are found in the AUDIO (ffmpeg silencedetect, -40 dB, >= 0.2 s), so
the cut never lands inside a word. A pause between two script lines (words.json "beat" changes) keeps up to --line
seconds, a pause inside a line keeps up to --word seconds; the kept part is the middle of the pause (soft edges stay).
--tempo > 1 speeds the result up with ffmpeg atempo (pitch unchanged) and divides every word time by it.
Lead-in silence is cut to 0.15 s, the tail to 0.30 s.
"""
import argparse, json, re, subprocess, sys, wave
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("wav"); ap.add_argument("words"); ap.add_argument("out")
ap.add_argument("--line", type=float, default=0.40)
ap.add_argument("--word", type=float, default=0.22)
ap.add_argument("--tempo", type=float, default=1.0)
ap.add_argument("--db", type=float, default=-40)
a = ap.parse_args()

# ---- read audio (any format -> 16-bit PCM via ffmpeg if needed)
def read(path):
    try:
        w = wave.open(path, "rb")
        if w.getsampwidth() != 2: raise wave.Error("not 16-bit")
    except wave.Error:
        tmp = a.out + "_pcm16.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-c:a", "pcm_s16le", tmp], check=True)
        w = wave.open(tmp, "rb")
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, ch)
    return sr, ch, x

sr, ch, x = read(a.wav)
dur = len(x) / sr

# ---- silences in the audio
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.wav, "-af", f"silencedetect=noise={a.db}dB:d=0.2", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
starts = [float(v) for v in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(v) for v in re.findall(r"silence_end: ([\d.]+)", log)]
if len(ends) < len(starts): ends.append(dur)
sil = list(zip(starts, ends))

words = json.load(open(a.words, encoding="utf-8"))
def beat_at(t, side):
    """the beat of the last word ending before t (side=-1) / first word starting after t (side=+1)"""
    if side < 0:
        c = [w for w in words if w["e"] <= t + 0.05]
        return c[-1]["beat"] if c else None
    c = [w for w in words if w["s"] >= t - 0.05]
    return c[0]["beat"] if c else None

# ---- cuts: [(from, to)] removed from the original timeline
cuts = []
for s0, s1 in sil:
    d = s1 - s0
    if s0 <= 0.01: keep = 0.15; cuts.append((0.0, max(0.0, s1 - keep))) if d > keep else None; continue
    if s1 >= dur - 0.01: keep = 0.30; cuts.append((s0 + keep, dur)) if d > keep else None; continue
    b0, b1 = beat_at(s0, -1), beat_at(s1, +1)
    keep = a.line if (b0 is not None and b1 is not None and b0 != b1) else a.word
    if d > keep:
        m = (s0 + s1) / 2
        cuts.append((m - (d - keep) / 2, m + (d - keep) / 2))
cuts = [c for c in cuts if c and c[1] > c[0]]

def shift(t):
    """new time of original time t"""
    gone = 0.0
    for c0, c1 in cuts:
        if t >= c1: gone += c1 - c0
        elif t > c0: gone += t - c0
    return (t - gone) / a.tempo

# ---- splice with 8 ms crossfades at every cut
fade = int(0.008 * sr)
keep_iv, prev = [], 0.0
for c0, c1 in cuts: keep_iv.append((prev, c0)); prev = c1
keep_iv.append((prev, dur))
out = np.zeros((0, ch), dtype=np.float32)
for s0, s1 in keep_iv:
    seg = x[int(s0 * sr):int(s1 * sr)].astype(np.float32)
    if len(seg) == 0: continue
    if len(out) >= fade and len(seg) >= fade:
        r = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
        out[-fade:] = out[-fade:] * (1 - r) + seg[:fade] * r
        seg = seg[fade:]
    out = np.concatenate([out, seg])
y = np.clip(out, -32768, 32767).astype(np.int16)

trim_path = a.out + ("_notempo.wav" if a.tempo != 1.0 else ".wav")
with wave.open(trim_path, "wb") as w:
    w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr); w.writeframes(y.tobytes())
if a.tempo != 1.0:
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", trim_path, "-af", f"atempo={a.tempo}", "-c:a", "pcm_s16le", a.out + ".wav"], check=True)

nw = [{**w, "s": round(shift(w["s"]), 3), "e": round(shift(w["e"]), 3)} for w in words]
json.dump(nw, open(a.out + "_words.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
new_dur = len(y) / sr / a.tempo
print(f"{len(cuts)} pauses trimmed, {sum(c1 - c0 for c0, c1 in cuts):.2f} s cut; {dur:.2f} s -> {new_dur:.2f} s"
      f" (last word ends {nw[-1]['e']:.2f} s) -> {a.out}.wav, {a.out}_words.json", file=sys.stderr)
