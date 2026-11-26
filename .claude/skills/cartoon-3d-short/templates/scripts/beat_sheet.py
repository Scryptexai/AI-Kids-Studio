"""Beat sheet: one frame per narration phrase, labelled with the phrase, for the sound-off test and the Opus inspection.

usage: python -I scripts/beat_sheet.py <video.mp4> <words.json> <out_dir> [--at 0.6] [--cols 6]

For each phrase of words.json (split at , . : ? !) it pulls the frame at `at` of the way through the phrase (default 60 %,
after the reaction has landed) and draws the phrase text above it. Look at the sheets with the sound OFF: every phrase must
read from the picture alone (who, what changed, what they feel). Then hand the sheets plus the script to a fresh Opus
agent with the questions in SKILL.md ("Sound-off test and Opus inspection") and fix what it flags.
Writes beats_<n>.jpg (24 phrases per sheet) and beats.md (phrase list with frames and times).
"""
import json, os, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
def opt(k, d):
    return args[args.index(k) + 1] if k in args else d
video, words_path, out = args[0], args[1], args[2]
AT, COLS, FPS = float(opt("--at", "0.6")), int(opt("--cols", "6")), 30
os.makedirs(out, exist_ok=True)

words = json.load(open(words_path, encoding="utf-8"))
phrases, cur = [], []
for w in words:
    cur.append(w)
    if w["w"][-1] in ",.:?!":
        phrases.append(cur); cur = []
if cur:
    phrases.append(cur)

rows = []
for i, ph in enumerate(phrases):
    s, e = ph[0]["s"], ph[-1]["e"]
    f = round((s + (e - s) * AT) * FPS)
    png = os.path.join(out, f"b_{i:03d}.png")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", video, "-vf", f"select=eq(n\\,{f})", "-frames:v", "1", png], check=True)
    rows.append((i, f, s, " ".join(x["w"] for x in ph), png))

W, H, TXT = 300, 533, 64
try:
    font = ImageFont.truetype("arial.ttf", 17)
except OSError:
    font = ImageFont.load_default()
per = COLS * 4
for k in range(0, len(rows), per):
    chunk = rows[k:k + per]
    n_rows = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new("RGB", (W * COLS, (H + TXT) * n_rows), (16, 16, 18))
    d = ImageDraw.Draw(sheet)
    for j, (i, f, s, text, png) in enumerate(chunk):
        x, y = (j % COLS) * W, (j // COLS) * (H + TXT)
        sheet.paste(Image.open(png).convert("RGB").resize((W, H)), (x, y + TXT))
        d.text((x + 6, y + 4), f"{i + 1}. f{f} {s:.2f}s", fill=(255, 220, 80), font=font)
        for li, line in enumerate(textwrap.wrap(text, 32)[:2]):
            d.text((x + 6, y + 22 + li * 19), line, fill=(235, 235, 235), font=font)
    sheet.save(os.path.join(out, f"beats_{k // per + 1}.jpg"), quality=88)

with open(os.path.join(out, "beats.md"), "w", encoding="utf-8") as fh:
    fh.write("| # | frame | time | phrase |\n|---|---|---|---|\n")
    for i, f, s, text, _ in rows:
        fh.write(f"| {i + 1} | {f} | {s:.2f} | {text} |\n")
print(f"{len(rows)} phrases -> {out}")
