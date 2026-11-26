# usage: python scripts/contact_sheet.py <dir> [per_sheet=16] [cols=8]
# Lays the <dir>/x_<frame>.jpg stills out in frame order on sheet1.jpg, sheet2.jpg, ... (270 x 480 tiles, numbered).
import glob, os, re, sys
from PIL import Image, ImageDraw

d = sys.argv[1]
per = int(sys.argv[2]) if len(sys.argv) > 2 else 16
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 8
frame = lambda p: int(re.findall(r"(\d+)\.jpg$", p)[0])
fs = sorted(glob.glob(os.path.join(d, "x_*.jpg")), key=frame)
W, H = 270, 480
for part in range((len(fs) + per - 1) // per):
    sel = fs[part * per:(part + 1) * per]
    rows = (len(sel) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W, rows * H), "black")
    for i, f in enumerate(sel):
        im = Image.open(f).convert("RGB").resize((W, H))
        g = ImageDraw.Draw(im)
        g.rectangle([0, 0, 84, 18], fill="black")
        g.text((3, 3), "%d: f%d" % (part * per + i + 1, frame(f)), fill="white")
        sheet.paste(im, ((i % cols) * W, (i // cols) * H))
    sheet.save(os.path.join(d, "sheet%d.jpg" % (part + 1)), quality=85)
print("sheets:", (len(fs) + per - 1) // per)
