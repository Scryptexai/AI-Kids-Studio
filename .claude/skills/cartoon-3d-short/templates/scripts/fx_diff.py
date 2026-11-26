"""Pixel diff of two same-size images for the FX gate: prints JSON {pct, mean}.
pct  = % of pixels where any channel differs by more than 3/255
mean = mean absolute difference over all channels (0-255)"""
import json, sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.int16)
b = np.asarray(Image.open(sys.argv[2]).convert("RGB"), dtype=np.int16)
if a.shape != b.shape:
    sys.exit(f"size mismatch {a.shape} vs {b.shape}")
d = np.abs(a - b)
print(json.dumps({"pct": float((d.max(axis=2) > 3).mean() * 100), "mean": float(d.mean())}))
