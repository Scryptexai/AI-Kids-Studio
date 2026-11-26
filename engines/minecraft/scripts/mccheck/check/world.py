"""Occupancy grid of a staged Minecraft world (public/mc-preview/.../<env>/world.json), built once and cached as .npz.

Cell codes (block coords: a cell [x,y,z] fills x..x+1, y..y+1, z..z+1):
  0 AIR      nothing (or an unknown cell)
  1 SOLID    full cube that blocks the view (stone, dirt, grass, logs, leaves ...)
  2 CLEAR    full cube you can see through but not walk through (glass, ice, tinted glass, barrier)
  3 PART     model block (slab, stairs, door, dirt path, lantern, bell ...): solid inside its element boxes only
  4 FLUID    water / lava: not solid
  5 SOFT     not solid: plants (cross), torches, vines, ladders, carpets, rails, signs, buttons, snow layers ...
  6 BURIED   not in world.json but solid: compile drops blocks with an opaque full cube on all six sides, so the
             inside of a thick mass is missing from the file; we infer it back (enclosed pockets of missing cells
             whose every neighbour is an opaque cube, and that no wall block proves to be air)
"""
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np

VERSION = 3
AIR, SOLID, CLEAR, PART, FLUID, SOFT, BURIED = 0, 1, 2, 3, 4, 5, 6
CACHE = Path(__file__).parent / ".cache"

# ids that never stop a body (you walk through / stand in them), whatever their model
SOFT_ID = re.compile(r"(torch|vine|ladder|carpet|rail|sign|banner|button|lever|pressure_plate|tripwire|redstone_wire|"
                     r"cobweb|sugar_cane|scaffolding|^fire$|soul_fire|^snow$|flower_pot|candle|lichen|moss_carpet|"
                     r"sculk_vein|glow_lichen|string|frogspawn|lily_pad|kelp|seagrass|_coral_fan|nether_portal|light$|"
                     r"structure_void|item_frame|painting|head$|skull$|_bars$|chain$)")
# full cubes you see through
CLEAR_ID = re.compile(r"(glass|^ice$|frosted_ice|barrier|slime_block|honey_block)")


def _rot_box(b, rx, ry):
    """an element box (0..1 coords) under the blockstate rotation (x first, then y; 90 deg steps, as geometry.ts)"""
    pts = [[b[0], b[1], b[2]], [b[3], b[4], b[5]]]
    out = []
    for x, y, z in pts:
        x, y, z = x - 0.5, y - 0.5, z - 0.5
        for _ in range((rx // 90) % 4):           # makeRotationX(-90): (x, y, z) -> (x, z, -y)
            y, z = z, -y
        for _ in range((ry // 90) % 4):           # makeRotationY(-90): (x, y, z) -> (-z, y, x)
            x, z = -z, x
        out.append([x + 0.5, y + 0.5, z + 0.5])
    lo = [min(out[0][i], out[1][i]) for i in range(3)]
    hi = [max(out[0][i], out[1][i]) for i in range(3)]
    return lo + hi


def _classify(b):
    """(code, boxes) for a compiled block"""
    bid, shape, layer = b["id"], b["shape"], b["layer"]
    if shape == "fluid":
        return FLUID, None
    if shape == "cross" or SOFT_ID.search(bid):
        return SOFT, None
    if shape == "cube":
        return (CLEAR if (layer == "translucent" or CLEAR_ID.search(bid)) else SOLID), None
    boxes = []
    for e in b.get("elements") or []:
        fr, to = [v / 16 for v in e["from"]], [v / 16 for v in e["to"]]
        bx = _rot_box(fr + to, int(b.get("rotX", 0)), int(b.get("rotY", 0)))
        if min(bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]) > 0.02:
            boxes.append(bx)
    if not boxes:
        return SOFT, None
    vol = sum((x[3] - x[0]) * (x[4] - x[1]) * (x[5] - x[2]) for x in boxes)
    hi = max(x[4] for x in boxes)
    if vol < 0.04 and hi < 0.2:        # a flat thing on the floor
        return SOFT, None
    return PART, boxes


class Grid:
    def __init__(self, path):
        self._meta = None
        self.path = Path(path)
        self.id = self.path.parent.name
        st = self.path.stat()
        tag = hashlib.md5(f"{self.path.resolve()}|{st.st_mtime_ns}|{st.st_size}|{VERSION}".encode()).hexdigest()[:16]
        cache = CACHE / f"{self.id}-{tag}.npz"
        meta_p = self.path.parent / "backdrop.json"
        self.backdrop = json.loads(meta_p.read_text(encoding="utf-8")) if meta_p.exists() else None
        if cache.exists():
            z = np.load(cache, allow_pickle=False)
            self.code, self.kid, self.opq, self.boxes = z["code"], z["kid"], z["opq"], z["boxes"]
            self.o = z["o"]
            self.bmin, self.bmax = z["bmin"], z["bmax"]
        else:
            self._build()
            CACHE.mkdir(exist_ok=True)
            for old in CACHE.glob(f"{self.id}-*.npz"):
                old.unlink()
            np.savez_compressed(cache, code=self.code, kid=self.kid, opq=self.opq, boxes=self.boxes, o=self.o, bmin=self.bmin, bmax=self.bmax)

    # -------------------------------------------------------------- build
    def _build(self):
        w = json.loads(self.path.read_text(encoding="utf-8"))
        self._meta = w
        self.bmin = np.array(w["bounds"]["min"], dtype=np.int32)
        self.bmax = np.array(w["bounds"]["max"], dtype=np.int32)
        self.o = self.bmin - 1
        shape = tuple((self.bmax - self.bmin + 2).tolist())
        code = np.zeros(shape, np.uint8)
        kid = np.full(shape, -1, np.int16)
        opq = np.zeros(shape, bool)
        present = np.zeros(shape, bool)
        boxes = []
        for b in w["blocks"]:
            pos = np.array(b["positions"], dtype=np.int64).reshape(-1, 3)
            if not len(pos):
                continue
            idx = tuple((pos - self.o).T)
            c, bx = _classify(b)
            code[idx] = c
            present[idx] = True
            if c == PART:
                kid[idx] = len(boxes)
                boxes.append(bx)
            if b["shape"] == "cube" and b["layer"] == "opaque":
                opq[idx] = True
        # boxes as one padded array (K, E, 6); padding = an empty box
        E = max([len(x) for x in boxes] + [1])
        arr = np.tile(np.array([1, 1, 1, 0, 0, 0], np.float32), (max(len(boxes), 1), E, 1))
        for i, bl in enumerate(boxes):
            arr[i, :len(bl)] = bl
        self.boxes = arr
        # ---- infer buried solid: enclosed components of missing cells with only opaque cubes around them
        from scipy import ndimage
        missing = ~present
        lab, n = ndimage.label(missing)
        if n > 1:
            edge = set(np.unique(np.concatenate([lab[0].ravel(), lab[-1].ravel(), lab[:, 0].ravel(), lab[:, -1].ravel(), lab[:, :, 0].ravel(), lab[:, :, -1].ravel()])).tolist())
            st6 = ndimage.generate_binary_structure(3, 1)
            for i, sl in enumerate(ndimage.find_objects(lab), start=1):
                if i in edge or sl is None:
                    continue
                # a window one cell bigger than the component
                win = tuple(slice(max(s.start - 2, 0), s.stop + 2) for s in sl)
                comp = lab[win] == i
                ring = ndimage.binary_dilation(comp, st6) & ~comp
                if not opq[win][ring].all():
                    continue             # touches a non-opaque block: an air pocket (a buried cell needs 6 opaque sides)
                # a wall cell next to it whose other neighbours are all opaque/this pocket would have been dropped if
                # the pocket were solid: then the pocket is a sealed room
                solidish = opq[win] | comp
                cnt = sum(np.roll(solidish, s, axis=a) for a in range(3) for s in (-1, 1))
                if (ring & (cnt >= 6)).any():
                    continue
                cw = code[win]
                cw[comp] = BURIED
                code[win] = cw
                ow = opq[win]
                ow[comp] = True
                opq[win] = ow
        self.code, self.kid, self.opq = code, kid, opq

    def meta(self):
        if self._meta is None:
            self._meta = json.loads(self.path.read_text(encoding="utf-8"))
        return self._meta

    # -------------------------------------------------------------- queries (points: (m, 3) float arrays)
    def cells(self, P):
        return np.floor(P).astype(np.int64)

    def lookup(self, C):
        """codes and kids of cells C (m, 3); outside the grid = AIR"""
        L = C - self.o
        ok = np.all((L >= 0) & (L < np.array(self.code.shape)), axis=1)
        code = np.zeros(len(C), np.uint8)
        kid = np.full(len(C), -1, np.int16)
        if ok.any():
            i = tuple(L[ok].T)
            code[ok] = self.code[i]
            kid[ok] = self.kid[i]
        return code, kid

    def inbox(self, P, kid):
        """for PART cells: is the point inside one of the block's element boxes"""
        out = np.zeros(len(P), bool)
        m = kid >= 0
        if m.any():
            loc = (P[m] - np.floor(P[m]))[:, None, :]
            B = self.boxes[kid[m]]
            out[m] = np.any(np.all((loc >= B[:, :, :3] - 1e-6) & (loc <= B[:, :, 3:] + 1e-6), axis=2), axis=1)
        return out

    def top_at(self, cx, cy, cz, x, z):
        """the top of the solid surface in cell (cx, cy, cz) under the point (x, z), or None"""
        L = np.array([cx, cy, cz]) - self.o
        if np.any(L < 0) or np.any(L >= np.array(self.code.shape)):
            return None
        c = self.code[tuple(L)]
        if c in (SOLID, CLEAR, BURIED):
            return cy + 1.0
        if c == PART:
            lx, lz = x - cx, z - cz
            tops = [b[4] for b in self.boxes[self.kid[tuple(L)]] if b[0] - 1e-6 <= lx <= b[3] + 1e-6 and b[2] - 1e-6 <= lz <= b[5] + 1e-6 and b[3] > b[0]]
            return cy + max(tops) if tops else None
        return None

    def in_bounds_xz(self, x, z, margin=0.0):
        return self.bmin[0] - margin <= x <= self.bmax[0] + margin and self.bmin[2] - margin <= z <= self.bmax[2] + margin


_GRIDS = {}


def grid(path):
    p = str(Path(path).resolve())
    if p not in _GRIDS:
        _GRIDS[p] = Grid(p)
    return _GRIDS[p]
