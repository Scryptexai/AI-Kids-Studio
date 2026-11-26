# usage: python scripts/court/hdr_sky.py <in.hdr> <out.jpg> [exposure=1.0] [rows=0.5]
# Decodes a Radiance RGBE (.hdr, RLE scanlines), keeps the top `rows` fraction (the sky above the horizon), applies a
# soft filmic curve and writes an sRGB JPG for the background sky dome (lighting still comes from the small .hdr).
import sys, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
expo = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
keep = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
b = open(src, "rb").read()
i = b.index(b"\n\n") + 2
j = b.index(b"\n", i); dims = b[i:j].split(); H, W = int(dims[1]), int(dims[3]); p = j + 1
Hk = int(H * keep)
out = np.zeros((Hk, W, 4), np.uint8)
buf = np.frombuffer(b, np.uint8)
for y in range(Hk):
    assert buf[p] == 2 and buf[p + 1] == 2, "not RLE"
    p += 4
    for c in range(4):
        x = 0; row = out[y, :, c]
        while x < W:
            n = int(buf[p]); p += 1
            if n > 128:
                n -= 128; row[x:x + n] = buf[p]; p += 1
            else:
                row[x:x + n] = buf[p:p + n]; p += n
            x += n
e = out[..., 3].astype(np.int32)
f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)[..., None]
rgb = out[..., :3] * f * expo
# AgX-ish soft shoulder, then sRGB
rgb = rgb / (1.0 + rgb * 0.18)
rgb = np.clip(rgb, 0, 1) ** (1 / 2.2)
Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(dst, quality=92)
print(W, H, "->", W, Hk, "max", float(f.max()))
