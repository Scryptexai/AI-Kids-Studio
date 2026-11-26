"""Delivery extras for an editor: captions (.srt), a shot list as a CMX3600 EDL, and the audio stems.

usage: python -I scripts/export_extras.py <words.json> <shots.json> <mix_dir> <out_dir> [--title NAME] [--fps 30]

- captions.srt: one cue per narration phrase (split at , . : ? !), from the word timings. Not burned into the video
  (the shorts carry no captions); upload it to YouTube / TikTok or use it in the editor.
- shots.edl: one event per shot (name, start, end) of the finished video, reel = the video file, so Premiere,
  DaVinci Resolve or CapCut can cut the final mp4 back into its shots. shots.json comes from scripts/dump_shots.mjs.
- stems/: voice.wav, music.wav, sfx.wav and mix.wav copied from the audio mix folder.
"""
import json, os, shutil, sys

args = sys.argv[1:]
def opt(k, d):
    return args[args.index(k) + 1] if k in args else d
words_path, shots_path, mix_dir, out = args[:4]
FPS, TITLE = int(opt("--fps", "30")), opt("--title", "SHORT")
os.makedirs(out, exist_ok=True)

def srt_t(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
def tc(f):
    s, fr = divmod(int(f), FPS); m, s = divmod(s, 60); h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}:{fr:02d}"

words = json.load(open(words_path, encoding="utf-8"))
cues, cur = [], []
for w in words:
    cur.append(w)
    if w["w"][-1] in ",.:?!":
        cues.append(cur); cur = []
if cur:
    cues.append(cur)
with open(os.path.join(out, "captions.srt"), "w", encoding="utf-8") as fh:
    for i, c in enumerate(cues, 1):
        end = c[-1]["e"] + 0.15
        if i < len(cues):
            end = min(end, cues[i][0]["s"] - 0.02)  # never overlap the next cue
        fh.write(f"{i}\n{srt_t(c[0]['s'])} --> {srt_t(end)}\n{' '.join(x['w'] for x in c)}\n\n")

shots = json.load(open(shots_path, encoding="utf-8"))
with open(os.path.join(out, "shots.edl"), "w", encoding="utf-8") as fh:
    fh.write(f"TITLE: {TITLE}\nFCM: NON-DROP FRAME\n\n")
    for i, s in enumerate(shots, 1):
        a, b = s["a"], s["b"]
        fh.write(f"{i:03d}  AX       V     C        {tc(a)} {tc(b)} {tc(a)} {tc(b)}\n")
        fh.write(f"* FROM CLIP NAME: {TITLE}.mp4\n* COMMENT: {s['name']}\n\n")

os.makedirs(os.path.join(out, "stems"), exist_ok=True)
for name in ("voice.wav", "music.wav", "sfx.wav", "mix.wav"):
    p = os.path.join(mix_dir, name)
    if os.path.exists(p):
        shutil.copy2(p, os.path.join(out, "stems", name))
print(f"{len(cues)} captions, {len(shots)} shots, stems -> {out}")
