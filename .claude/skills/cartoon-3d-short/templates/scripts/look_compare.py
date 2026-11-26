# usage: python scripts/look_compare.py <roundDir> <out.jpg> [frame:refTime ...]
# reference frames: $LOOK_REF/f_<time>.jpg (default ref_private/study/cart/full), extracted with ffmpeg; never published
# side-by-side ours | reference per pair, 432x768 each, plus simple metrics printed per pair
import sys, os
from PIL import Image, ImageStat
import numpy as np
rd, out = sys.argv[1], sys.argv[2]
pairs = [a.split(':') for a in (sys.argv[3:] or ['9:0.3', '82:10.6'])]
W, H = 432, 768
sheet = Image.new('RGB', (len(pairs) * (2 * W + 16), H), 'white')
def metrics(im):
    a = np.asarray(im.convert('RGB').resize((270, 480))).astype(float) / 255
    l = a @ [0.2126, 0.7152, 0.0722]
    mx, mn = a.max(2), a.min(2); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    gy, gx = np.gradient(l); edge = (np.hypot(gx, gy) > 0.08).mean()
    return f"luma {l.mean():.2f} sat {sat.mean():.2f} contrast {l.std():.2f} edges {edge:.3f}"
for i, (f, t) in enumerate(pairs):
    a = Image.open(f"{rd}/f{int(f):03d}.png").convert('RGB')
    b = Image.open(os.path.join(os.environ.get("LOOK_REF", "ref_private/study/cart/full"), f"f_{t}.jpg")).convert('RGB')
    print(f"frame {f} vs ref {t}s\n  ours {metrics(a)}\n  ref  {metrics(b)}")
    x = i * (2 * W + 16)
    sheet.paste(a.resize((W, H)), (x, 0)); sheet.paste(b.resize((W, H)), (x + W + 4, 0))
sheet.save(out, quality=90)
