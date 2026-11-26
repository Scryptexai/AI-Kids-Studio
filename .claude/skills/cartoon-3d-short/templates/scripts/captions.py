# usage: python scripts/captions.py <words.json> <out_dir> [--start 0] [--dur 10] [--preview film.mp4] [options]
# Word-synced captions on a GREEN SCREEN, rendered as their own clip for After Effects (key it with Keylight).
#   words.json = [{"w": word, "s": start_s, "e": end_s}, ...] from scripts/words_from_voice.py (the voice's own timings)
#   - groups the narration into chunks of at most --max-words words (default 3): a chunk also ends after . , ! ? ; :
#     and on a pause in the voice, so a caption never spans two sentences
#   - each chunk appears on the frame its first word is spoken and stays until the next chunk (or leaves shortly
#     after its last word when the voice pauses)
#   - white UPPERCASE text, solid black outline, HARD black drop shadow (no blur: a soft shadow turns green-grey on
#     the key and leaves a fringe), centred, at --y of the frame height (0.715 = the spot under the chest, as agreed, kept off the Shorts bottom UI)
#   - the script's punctuation is kept (MONA LISA. / PARIS, / 1911.); --strip-punct drops trailing . , ; :
#   - a short pop (scale 0.85 -> 1.06 -> 1) on each new chunk; --no-pop for a static cut
# Outputs in <out_dir>: captions_green.mp4 (pure #00FF00, film size/fps, silent), captions.json (chunk timings),
# and with --preview <film.mp4>: captions_preview.mp4 = the film with the green clip keyed on top, same span, with sound.
# --alpha also writes captions_alpha.mov (ProRes 4444 with real transparency, no keying needed).
import argparse, json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("words"); ap.add_argument("out")
ap.add_argument("--start", type=float, default=0.0, help="seconds into the film")
ap.add_argument("--dur", type=float, default=None, help="seconds to render (default: to the last word + 1 s)")
ap.add_argument("--w", type=int, default=1440); ap.add_argument("--h", type=int, default=2560); ap.add_argument("--fps", type=int, default=30)
# a heavy sans that exists on this OS (Windows, macOS, Linux); --font overrides
FONT_CANDIDATES = [
    "C:/Windows/Fonts/ariblk.ttf",                                   # Windows: Arial Black
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",            # macOS
    "/Library/Fonts/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf",       # Linux (ttf-mscorefonts)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",          # Linux (most distros)
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
]
ap.add_argument("--font", default=next((f for f in FONT_CANDIDATES if os.path.exists(f)), None),
                help="TTF/OTF font file (default: the first heavy sans found on this OS)")
ap.add_argument("--size", type=float, default=0.032, help="font size as a fraction of the frame height")
ap.add_argument("--y", type=float, default=0.715, help="caption centre (capitals middle) as a fraction of the frame height")
ap.add_argument("--max-words", type=int, default=3)
ap.add_argument("--max-width", type=float, default=0.68,
                help="widest caption as a fraction of the frame width (0.68 = 16 %% clear each side, off the Shorts buttons)")
ap.add_argument("--gap", type=float, default=0.30, help="a voice pause this long (s) starts a new chunk")
ap.add_argument("--hold", type=float, default=0.25, help="seconds a chunk stays after its last word when the voice pauses")
ap.add_argument("--lead", type=int, default=0, help="frames the caption appears before its word")
ap.add_argument("--strip-punct", action="store_true", help="drop trailing . , ; : (default keeps the script's punctuation)")
ap.add_argument("--no-pop", action="store_true");ap.add_argument("--lower", action="store_true", help="keep the script's case")
ap.add_argument("--preview", default=None, help="film mp4 to key the captions over for a check")
ap.add_argument("--alpha", action="store_true")
a = ap.parse_args()
if not a.font or not os.path.exists(a.font):
    sys.exit(f"captions.py: no font found ({a.font!r}). Pass one with --font /path/to/font.ttf")

GREEN = (0, 255, 0)
W, H, FPS = a.w, a.h, a.fps
words = [w for w in json.load(open(a.words, encoding="utf-8")) if w["w"].strip()]
end_t = a.start + a.dur if a.dur else words[-1]["e"] + 1.0

# YouTube Shorts overlays (conservative): action buttons down the right 16 %, title/channel/music over the bottom
# 25 %, search/menu bar over the top 8 %. Captions must stay clear of all three.
SAFE_RIGHT, SAFE_BOTTOM, SAFE_TOP = 0.16, 0.25, 0.08
size = round(a.size * H)
font = ImageFont.truetype(a.font, size)
stroke = max(2, round(size * 0.11))
shadow = (round(size * 0.05), round(size * 0.07))
text_w = lambda t, f=font: (lambda b: b[2] - b[0])(f.getbbox(t, stroke_width=stroke)) + shadow[0]

# ---------------- chunks ----------------
clean = lambda w: re.sub(r"^[\"'(\[]+|[\"')\]]+$", "", w)
bare = lambda w: re.sub(r"[^\w]", "", w).lower()

# a single word wider than a caption (TWENTY-ONE-YEAR-OLD) is split at its hyphens into two halves that each fit,
# timed by character share, instead of being shrunk to an unreadable size
def split_long(w):
    t, parts = clean(w["w"]), w["w"].split("-")
    if len(parts) < 2 or text_w(t if a.lower else t.upper()) * 1.06 <= a.max_width * W: return [w]
    best = min(range(1, len(parts)), key=lambda k: abs(len("-".join(parts[:k])) - len("-".join(parts[k:]))))
    a_txt, b_txt = "-".join(parts[:best]) + "-", "-".join(parts[best:])
    m = w["s"] + (w["e"] - w["s"]) * len(a_txt) / (len(a_txt) + len(b_txt))
    return [dict(w, w=a_txt, e=m), dict(w, w=b_txt, s=m)]
words = [p for w in words for p in split_long(w)]
# words a caption should not END on (English + Indonesian): "WITH THE" / "DENGAN SI" read as unfinished
GLUE = set("a an the of to in on at for with and or but by from as into onto is was are were his her its their my "
           "your our yang di ke dari dan atau untuk dengan si sang para itu ini pada oleh akan sudah juga tapi".split())

# 1) phrases: the voice's own breaks (punctuation or a pause); a caption never crosses one
phrases, cur = [], []
for w in words:
    if cur and (re.search(r"[.,!?;:]$", cur[-1]["w"]) or w["s"] - cur[-1]["e"] > a.gap):
        phrases.append(cur); cur = []
    cur.append(w)
if cur: phrases.append(cur)

# 2) each phrase is cut into chunks of <= max_words by the cheapest split: no chunk ends on a glue word,
#    no name is torn in two (Mona | Lisa), no lonely single word, no flash shorter than 0.3 s, fewer chunks preferred
def cost(ph, i, j):
    c = ph[i:j]
    txt = " ".join(clean(x["w"]) for x in c)
    k = 1.0 + (40 if text_w(txt if a.lower else txt.upper()) * 1.06 > a.max_width * W and j - i > 1 else 0)
    if j - i == 1 and len(ph) > 1: k += 2
    if bare(c[-1]["w"]) in GLUE and j < len(ph): k += 4
    if j < len(ph) and ph[j]["w"][:1].isupper() and c[-1]["w"][:1].isupper() and j - 1 > 0: k += 4
    if c[-1]["e"] - c[0]["s"] < 0.30: k += 2
    return k

chunks = []
for ph in phrases:
    n = len(ph)
    best = [0.0] + [1e9] * n; cut = [0] * (n + 1)
    for j in range(1, n + 1):
        for i in range(max(0, j - a.max_words), j):
            v = best[i] + cost(ph, i, j)
            if v < best[j]: best[j], cut[j] = v, i
    seg, j = [], n
    while j: seg.append(ph[cut[j]:j]); j = cut[j]
    chunks += seg[::-1]

out = []
for k, c in enumerate(chunks):
    s = c[0]["s"]
    nxt = chunks[k + 1][0]["s"] if k + 1 < len(chunks) else None
    e = c[-1]["e"] + a.hold
    if nxt is not None and nxt - c[-1]["e"] <= a.gap: e = nxt          # continuous speech: butt up to the next chunk
    if nxt is not None: e = min(e, nxt)
    txt = " ".join(clean(x["w"]) for x in c)
    if a.strip_punct: txt = re.sub(r"[.,;:]+$", "", txt)               # the script's punctuation stays unless asked
    out.append({"text": txt if a.lower else txt.upper(), "s": round(s, 3), "e": round(e, 3),
                "f0": max(0, round(s * FPS) - a.lead), "f1": round(e * FPS)})
os.makedirs(a.out, exist_ok=True)
json.dump(out, open(os.path.join(a.out, "captions.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------------- one sprite per chunk ----------------
def sprite(text):
    f = font
    while True:  # a single long word may still be too wide: shrink it (pop overshoot 1.06 included) to fit
        l, t, r, b = f.getbbox(text, stroke_width=stroke)
        if (r - l + shadow[0]) * 1.06 <= W * a.max_width or f.size < 20: break
        f = ImageFont.truetype(a.font, int(f.size * 0.95))
        print(f"  shrunk to {f.size}px to fit: {text}")
    # the sprite is centred on the CAPITALS' middle, so a comma or a Q never shifts a caption up or down
    _, ct, _, cb = f.getbbox("H")
    mid = (ct + cb) / 2
    pad = stroke + max(shadow) + 4
    half = max(mid - t, b + shadow[1] - mid) + pad
    im = Image.new("RGBA", (r - l + 2 * pad, int(2 * half)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = pad - l, half - mid
    d.text((ox + shadow[0], oy + shadow[1]), text, font=f, fill=(0, 0, 0, 255), stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
    d.text((ox, oy), text, font=f, fill=(255, 255, 255, 255), stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
    return im

sprites = [sprite(c["text"]) for c in out]
# safe-zone check on the INK (outline + shadow) at the pop's largest scale (1.06)
cy_ = round(a.y * H)
x1, y0, y1 = 0, H, 0
for c, sp in zip(out, sprites):
    l, t, r, b = sp.getbbox()
    ix1 = W / 2 + (r - sp.width / 2) * 1.06
    iy0, iy1 = cy_ + (t - sp.height / 2) * 1.06, cy_ + (b - sp.height / 2) * 1.06
    x1, y0, y1 = max(x1, ix1), min(y0, iy0), max(y1, iy1)
    if ix1 > W * (1 - SAFE_RIGHT) or iy1 > H * (1 - SAFE_BOTTOM) or iy0 < H * SAFE_TOP:
        print(f"  WARNING outside the Shorts safe zone: {c['text']}")
print(f"font {size}px; ink reaches {x1 / W:.1%} of width (buttons from {1 - SAFE_RIGHT:.0%}) and "
      f"{y0 / H:.1%}-{y1 / H:.1%} of height (bottom UI from {1 - SAFE_BOTTOM:.0%})")

def pop(n):  # scale for the n-th frame of a chunk
    if a.no_pop: return 1.0
    keys = [0.85, 0.97, 1.06, 1.03, 1.0]
    return keys[n] if n < len(keys) else 1.0

# ---------------- frames -> ffmpeg ----------------
f_start, f_end = round(a.start * FPS), round(end_t * FPS)
green_path = os.path.join(a.out, "captions_green.mp4")
enc = [["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-preset", "medium", "-crf", "8", "-pix_fmt", "yuv444p", "-tune", "animation", green_path]]
if a.alpha:
    enc.append(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", os.path.join(a.out, "captions_alpha.mov")])
procs = [subprocess.Popen(c, stdin=subprocess.PIPE) for c in enc]
cy = round(a.y * H)
blank_g = Image.new("RGB", (W, H), GREEN).tobytes()
blank_a = Image.new("RGBA", (W, H), (0, 0, 0, 0)).tobytes()
for f in range(f_start, f_end):
    k = next((i for i, c in enumerate(out) if c["f0"] <= f < c["f1"]), None)
    if k is None:
        procs[0].stdin.write(blank_g)
        if a.alpha: procs[1].stdin.write(blank_a)
        continue
    sp = sprites[k]
    sc = pop(f - out[k]["f0"])
    if sc != 1.0: sp = sp.resize((max(1, round(sp.width * sc)), max(1, round(sp.height * sc))), Image.LANCZOS)
    pos = (W // 2 - sp.width // 2, cy - sp.height // 2)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); lay.paste(sp, pos)
    g = Image.new("RGB", (W, H), GREEN); g.paste(lay, (0, 0), lay)
    procs[0].stdin.write(g.tobytes())
    if a.alpha: procs[1].stdin.write(lay.tobytes())
for p in procs:
    p.stdin.close(); p.wait()

shown = [c for c in out if c["f1"] > f_start and c["f0"] < f_end]
print(f"{len(out)} chunks total, {len(shown)} in {a.start:.2f}-{end_t:.2f} s -> {green_path}")
for c in shown: print(f"  {c['s']:6.2f}-{c['e']:6.2f}  {c['text']}")

# ---------------- keyed preview over the film ----------------
if a.preview:
    prev = os.path.join(a.out, "captions_preview.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(a.start), "-t", str(end_t - a.start), "-i", a.preview,
                    "-i", green_path, "-filter_complex",
                    "[1:v]colorkey=0x00FF00:0.30:0.08,despill=type=green[c];[0:v][c]overlay=0:0:shortest=1[v]",
                    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", prev],
                   check=True)
    print("preview ->", prev)
