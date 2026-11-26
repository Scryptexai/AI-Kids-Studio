"""What is at a point / column of a staged set (debug helper for check_staging findings).

  python scripts/mccheck/check/probe.py public/mc-preview/dam-plaza 2 0.2 2.5       the cell and the column under it
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check.world import grid  # noqa: E402

NAMES = {0: "air", 1: "SOLID", 2: "CLEAR", 3: "PART", 4: "fluid", 5: "soft", 6: "BURIED"}


def blocks_at(world, cell):
    out = []
    for b in world["blocks"]:
        p = b["positions"]
        for i in range(0, len(p), 3):
            if p[i] == cell[0] and p[i + 1] == cell[1] and p[i + 2] == cell[2]:
                out.append(f"{b['id']}[{b['shape']}/{b['layer']} rot {b.get('rotX', 0)},{b.get('rotY', 0)}]")
    return out


def main():
    d = Path(sys.argv[1])
    wp = d if d.suffix == ".json" else d / "world.json"
    x, y, z = map(float, sys.argv[2:5])
    g = grid(wp)
    w = g.meta()
    print(f"set {g.id} bounds {g.bmin.tolist()}..{g.bmax.tolist()}")
    cx, cz = math.floor(x), math.floor(z)
    for cy in range(math.floor(y) + 2, max(math.floor(y) - 6, int(g.bmin[1]) - 1), -1):
        code, kid = g.lookup(np.array([[cx, cy, cz]]))
        extra = ""
        if code[0] == 3:
            extra = " boxes " + str([[round(float(v), 3) for v in b] for b in g.boxes[kid[0]] if b[3] > b[0]])
        print(f"  cell [{cx},{cy},{cz}] {NAMES[int(code[0])]:6s} {blocks_at(w, (cx, cy, cz))}{extra}  top_at={g.top_at(cx, cy, cz, x, z)}")


if __name__ == "__main__":
    main()
