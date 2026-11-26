"""Staging gate for a Minecraft-mode short (McShort): reads a built short folder (plan.json + direction.json, the
staged sets are its siblings: <parent>/<environmentId>/world.json) and checks every shot on sampled frames
(every --step frames, every key frame, first and last, plus the tail that runs under the next shot's dissolve).

  python projects/itw-01/anim/check_staging.py --base public/mc-preview/tapper/short
  python projects/itw-01/anim/check_staging.py --base mc-preview/mc-cobblegen/short --shots 07,12 --step 2 -v

Rules (FAIL = exit 1; usage, tag names and limits: projects/itw-01/anim/check/README.md):
  CAM_SOLID   camera inside a solid block or within 0.25 of a solid face                         FAIL
  BLOCKED     a solid block between the lens and the lead's head AND chest (FAIL) / one of them, or another figure  WARN
              (none for a figure with the Glowing act or a vex)
  WALL        >= 70 % of a 5x9 ray grid hits a solid block closer than 2.0 m (unless "block_ecu")  FAIL
  FLOAT/SUNK  feet more than 0.15 above / below the solid top under them (unless "airborne")       FAIL
  CLIP        the body box (0.8 x the mob's half width, knees to crown) inside a solid block       FAIL
  FACING      moving > 0.05 m/frame with facing > 60 deg off the motion (unless "backstep")        FAIL (< 6 f: WARN)
  OUT_OF_SET  a figure outside the set's block bounds or with nothing under it                     FAIL
              the camera outside the bounds: FAIL without a backdrop, else WARN (over backdrop land / void)
  SAFE_ZONE   figure box (feet to crown, shoulders +-0.32) outside x 4-84 %, y 8-75 %              WARN
  HEAD_CUT    head box over the top / bottom edge (keyed figure) or a side edge (the lead)        FAIL
              (unless "exit"); other figures crossing a side edge, set extras: WARN
  BEHIND      the lead figure behind the lens (FAIL); another keyed figure straddling it            WARN
  (lead = tag "lead:<id>", else the first cast entry, else the keyed mob with the most screen time)
  SMALL       the lead figure under 4 % of the frame height (unless "wide")                        WARN

Tags: direction.json shots.<id>.tags = ["block_ecu", "wide", "airborne:ruby", "backstep:hobb@40-63", "exit:petra",
"ignore:mason2", "lead:keeper"] (a figure tag without ":id" means every figure; "@a-b" limits it to shot frames a..b).
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from check.motion import View, ang_diff, cam_at, hash_id, moving_cam, path_at, seg, yaw_of  # noqa: E402
from check.world import AIR, BURIED, CLEAR, PART, SOLID, grid  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PHASERS = {"vex"}                 # flies through blocks (no CLIP, no BLOCKED)
FLYERS = {"vex", "phantom", "bat", "ghast", "allay", "bee", "parrot", "blaze", "wither", "ender_dragon", "happy_ghast"}


def flow_at(keys, f):
    """RaidFx.tsx flowAt (straight lines in place of its Catmull-Rom; fall = gravity from rest); swim / float / fall = airborne"""
    n, i = len(keys), 1
    while i < n and f >= keys[i]["f"]:
        i += 1
    if f <= keys[0]["f"] or i >= n:
        k = keys[0] if f <= keys[0]["f"] else keys[-1]
        return {"at": list(k["at"]), "facing": k.get("facing"), "hidden": False, "scale": None,
                "airborne": k.get("mode", "walk") in ("swim", "float", "fall"), "tilt": None}
    a, b = keys[i - 1], keys[i]
    mode = b.get("mode", "swim")
    t = max(0.0, min(1.0, (f - a["f"]) / max(1e-6, b["f"] - a["f"])))
    if mode == "fall":
        h = 1 - (1 - t) ** 3
        at = [a["at"][0] + (b["at"][0] - a["at"][0]) * h, a["at"][1] + (b["at"][1] - a["at"][1]) * t * t, a["at"][2] + (b["at"][2] - a["at"][2]) * h]
    else:
        at = [x + (y - x) * t for x, y in zip(a["at"], b["at"])]
    return {"at": at, "facing": b.get("facing", a.get("facing")), "hidden": False, "scale": None,
            "airborne": mode in ("swim", "float", "fall"), "tilt": None}


GHOST = 7                     # override state: drawn hidden (cutaway, door): no view block, no collision, still support

CARD_H = 2.16
WIDTH = {"player": 0.6, "zombie": 0.6, "skeleton": 0.6, "villager": 0.6, "witch": 0.6, "creeper": 0.6, "enderman": 0.6,
         "cow": 0.9, "pig": 0.9, "sheep": 0.9, "horse": 1.4, "chicken": 0.4, "wolf": 0.6, "iron_golem": 1.4, "spider": 1.4}
ZONE = (0.04, 0.84, 0.08, 0.75)
DISSOLVE = 12


# ------------------------------------------------------------------ tags
class Tags:
    def __init__(self, raw):
        self.shot, self.fig = set(), defaultdict(list)          # fig[(tag, id or "*")] = [(a, b) | None]
        for t in raw or []:
            name, _, rest = t.partition(":")
            who, _, rng = rest.partition("@")
            if not rest and name in ("block_ecu", "wide"):
                self.shot.add(name)
                continue
            if not who and "@" in t:
                name, _, rng = t.partition("@")
            span = tuple(int(v) for v in rng.split("-")) if rng else None
            self.fig[(name, who or "*")].append(span)

    def has(self, name, who=None, f=None):
        if who is None:
            return name in self.shot
        for key in ((name, who), (name, "*")):
            for span in self.fig.get(key, []):
                if span is None or f is None or span[0] <= f <= span[1]:
                    return True
        return False

    def lead(self):
        for (n, who), _ in self.fig.items():
            if n == "lead" and who != "*":
                return who
        return None


# ------------------------------------------------------------------ block changes over a shot
def box_cells(fr, to):
    lo, hi = [min(a, b) for a, b in zip(fr, to)], [max(a, b) for a, b in zip(fr, to)]
    return [(x, y, z) for x in range(int(lo[0]), int(hi[0]) + 1) for y in range(int(lo[1]), int(hi[1]) + 1) for z in range(int(lo[2]), int(hi[2]) + 1)]


def spec_cells(s):
    out = [tuple(int(v) for v in c[:3]) for c in s.get("cells") or []]
    if s.get("at"):
        out.append(tuple(int(v) for v in s["at"][:3]))
    if s.get("from") and s.get("to") and isinstance(s["from"], list):
        out += box_cells(s["from"], s["to"])
    return out


def changes(d, root):
    """[(cell, f0, f1, state)]: blocks the shot's effects add, remove or hide (state: AIR, SOLID, CLEAR, GHOST)"""
    BIG = 10 ** 6
    ch = []

    def src_state(src, cell):
        if src in (None, "air"):
            return AIR
        if src == "base":
            return None
        p = root / src / "world.json"
        if not p.exists():
            return SOLID
        g = grid(p)
        c, _ = g.lookup(np.array([cell]))
        return {SOLID: SOLID, BURIED: SOLID, PART: SOLID, CLEAR: CLEAR}.get(int(c[0]), AIR)

    for w in d.get("waves") or []:
        cells = w.get("cells") or []
        n, f0 = len(cells), w.get("f0", 0)
        f1 = w.get("f1", f0)
        for i, c in enumerate(cells):
            fc = c[3] if len(c) > 3 else f0 + ((f1 - f0) * i / (n - 1) if n > 1 else 0)
            cell = tuple(int(v) for v in c[:3])
            old, new = src_state(w.get("from", "air"), cell), src_state(w.get("to", "base"), cell)
            if old is not None:
                ch.append((cell, -BIG, fc, old))
            if new is not None:
                ch.append((cell, fc, BIG, new))
    dig = d.get("dig")
    if dig:
        for b in dig.get("blocks") or []:
            ch.append((tuple(b[:3]), -BIG, b[3], SOLID))
            ch.append((tuple(b[:3]), b[3], BIG, AIR))
    for c in d.get("contacts") or []:
        ch.append((tuple(int(v) for v in c["at"]), c["f"], c.get("until", BIG), SOLID))
    for s in d.get("blockfx") or []:
        if s.get("gone") is not None:
            for cell in spec_cells(s):
                ch.append((cell, s["gone"], BIG, AIR))
    for s in d.get("shatter") or []:
        for cell in spec_cells(s):
            ch.append((cell, s["f"], BIG, AIR))
    for b in d.get("booms") or []:
        for c in b.get("cells") or []:
            ch.append((tuple(int(v) for v in c[:3]), b["f"], BIG, AIR))
    for c in d.get("cutaway") or []:
        for cell in spec_cells(c):
            ch.append((cell, c.get("f0", -BIG), c.get("f1", BIG), GHOST))
    for dr in d.get("doors") or []:
        x, y, z = (int(v) for v in dr["at"])
        ch += [((x, y, z), -BIG, BIG, GHOST), ((x, y + 1, z), -BIG, BIG, GHOST)]
    return ch


class Scene:
    """the set at one frame: the grid plus the shot's block changes active on that frame"""

    def __init__(self, g, ch, f):
        self.g = g
        self.ov = {}
        for cell, a, b, st in ch:
            if a <= f < b:
                if st == GHOST or self.ov.get(cell) != GHOST:
                    self.ov[cell] = st

    def codes(self, P):
        C = np.floor(P).astype(np.int64)
        code, kid = self.g.lookup(C)
        if self.ov:
            for i, c in enumerate(map(tuple, C)):
                st = self.ov.get(c)
                if st is not None:
                    code[i], kid[i] = st, -1
        return code, kid

    def collide(self, P):
        code, kid = self.codes(P)
        hit = np.isin(code, (SOLID, CLEAR, BURIED))
        part = code == PART
        if part.any():
            hit[part] = self.g.inbox(P[part], kid[part])
        return hit, code

    def blocks_view(self, P):
        code, kid = self.codes(P)
        hit = np.isin(code, (SOLID, BURIED))
        part = code == PART
        if part.any():
            hit[part] = self.g.inbox(P[part], kid[part])
        return hit

    def top(self, cx, cy, cz, x, z):
        st = self.ov.get((cx, cy, cz))
        if st is not None:
            return cy + 1.0 if st in (SOLID, CLEAR, GHOST) else None
        return self.g.top_at(cx, cy, cz, x, z)

    def support(self, x, z, feet):
        """the highest solid top under (x, z) at or below feet + 0.15 (None: nothing down to the bottom)"""
        cy = math.floor(feet + 0.15)
        for y in range(cy, int(self.g.bmin[1]) - 2, -1):
            t = self.top(math.floor(x), y, math.floor(z), x, z)
            if t is not None and t <= feet + 0.15 + 1e-6:
                return t
        return None


def segment_hit(scene, a, b, stop_short=0.3, step=0.05, start=0.05):
    """first point on a->b (stopping `stop_short` before b) inside a view-blocking block: distance or None"""
    a, b = np.asarray(a, float), np.asarray(b, float)
    v = b - a
    L = float(np.linalg.norm(v))
    if L <= start + stop_short:
        return None
    t = np.arange(start, L - stop_short, step)
    P = a + np.outer(t / L, v)
    hit = scene.blocks_view(P)
    if hit.any():
        return float(t[np.argmax(hit)])
    return None


# ------------------------------------------------------------------ figures
def figures(d, meta):
    """{id: {kind, mob, keys, static, h, hw}} for every mob / cast card the shot can show"""
    figs = {}
    heights = meta.get("heights", {})
    for m in meta.get("mobs", []):
        figs[m["id"]] = {"kind": "mob", "mob": m["mob"], "keys": None, "static": m, "h": heights.get(m["mob"], heights.get("default", 1.8)),
                         "hw": WIDTH.get(m["mob"], 0.6) / 2}
    for c in meta.get("characters", []):
        figs[c["id"]] = {"kind": "cast", "mob": "card", "keys": None, "static": c, "h": CARD_H, "hw": 0.3}
    for kind, sect in (("mob", "mobs"), ("cast", "cast")):
        for fid, keys in (d.get(sect) or {}).items():
            fg = figs.setdefault(fid, {"kind": kind, "mob": "player" if kind == "mob" else "card", "static": None,
                                       "h": CARD_H if kind == "cast" else 1.8, "hw": 0.3})
            fg["keys"] = keys
    for fid, acts in (d.get("acts") or {}).items():
        if fid in figs:
            figs[fid]["acts"] = acts
    return figs


def fig_state(fg, f, d, fid):
    """position / facing / flags of a figure this frame, or None when it is not drawn"""
    fl = (d.get("flows") or {}).get(fid)
    if fl:
        p = flow_at(fl, f)
    elif fg["keys"]:
        p = path_at(fg["keys"], f)
        # a key frame sits between two segments (raw 0 / 1): a figure still rising or falling there is airborne too
        if not p["airborne"] and not p["hidden"]:
            ys = [q["at"][1] for q in (path_at(fg["keys"], f - 1), path_at(fg["keys"], f + 1)) if q]
            if ys and max(abs(y - p["at"][1]) for y in ys) > 0.03:
                p["airborne"] = True
    elif fg["static"]:
        s = fg["static"]
        p = {"at": list(s["at"]), "facing": s.get("facing"), "hidden": False, "scale": None, "airborne": False}
    else:
        return None
    if p["hidden"] or p["at"][1] < -30:
        return None
    if fg["mob"] in FLYERS:
        p["airborne"] = True
    for pv in d.get("pov") or []:                       # first person: the actor's own body is not drawn
        if pv.get("actor") == fid and f >= pv["f0"] and f < pv.get("f1", 10 ** 9):
            return None
    lying = False
    for a in fg.get("acts") or []:
        k = a.get("kind")
        if k == "spawn" and f < a["f"]:
            return None
        if k == "poof":
            if f >= a["f"] + a.get("len", 10):
                return None
            if f >= a["f"]:
                lying = True
        if k in ("fallBack", "sit", "bed") and f >= a["f"]:
            lying = True
    for b in d.get("booms") or []:
        if b.get("mob") == fid and f >= b["f"]:
            return None
    p["lying"] = lying
    p["glowing"] = any(a.get("kind") == "glowing" and a["f"] <= f < a["f"] + a.get("len", 10 ** 9) for a in fg.get("acts") or [])
    p["h"] = fg["h"] * (p["scale"] if p.get("scale") is not None else 1)
    return p


# ------------------------------------------------------------------ one shot
class Issues:
    def __init__(self):
        self.rows = []       # (sev, rule, who, f, msg, worst)

    def add(self, sev, rule, who, f, msg, worst=0.0):
        self.rows.append((sev, rule, who, f, msg, worst))

    def grouped(self, gap):
        """consecutive samples of the same (sev, rule, who) merged into ranges"""
        by = defaultdict(list)
        for r in self.rows:
            by[(r[0], r[1], r[2])].append(r)
        out = []
        for (sev, rule, who), rs in by.items():
            rs.sort(key=lambda r: r[3])
            run = [rs[0]]
            for r in rs[1:]:
                if r[3] - run[-1][3] <= gap:
                    run.append(r)
                else:
                    out.append((sev, rule, who, run))
                    run = [r]
            out.append((sev, rule, who, run))
        out.sort(key=lambda x: (x[3][0][3], x[1]))
        return out


def frames_of(d, n, tail, step):
    fs = set(range(0, n + tail, step)) | {0, n - 1, n + tail - 1}
    for k in d.get("cam") or []:
        fs.add(k["f"])
    for sect in ("mobs", "cast"):
        for keys in (d.get(sect) or {}).values():
            for k in keys:
                fs.add(k["f"])
    return sorted(f for f in fs if 0 <= f < n + tail)


def on_screen(V, at, h):
    fp, hp = V.project(at), V.project([at[0], at[1] + h, at[2]])
    if not fp or not hp:
        return 0.0
    y0, y1 = max(hp[1], 0), min(fp[1], 1)
    return max(0.0, y1 - y0) if -0.05 < fp[0] < 1.05 or -0.05 < hp[0] < 1.05 else 0.0


def lead_by_screen(d, figs, frames, setcam, n, seed):
    """no lead tag and no cast: the keyed mob with the most screen height summed over the shot (the first keyed mob
    when none is ever on screen, so a lead stuck behind the lens still FAILs)"""
    best, score = None, -1.0
    for fid, fg in figs.items():
        if not fg["keys"]:
            continue
        sc = 0.0
        for f in frames[::2]:
            s = fig_state(fg, f, d, fid)
            c = cam_at(d, f, seed) if d.get("cam") else (moving_cam(setcam, f, n, seed) if setcam else None)
            if s and c:
                sc += on_screen(View(*c), s["at"], s["h"])
        if sc > score:
            best, score = fid, sc
    return best


def check_shot(sid, shot, d, nxt, root, step):
    env = shot["environmentId"]
    wp = root / env / "world.json"
    iss = Issues()
    if not wp.exists():
        iss.add("FAIL", "NO_SET", "-", 0, f"set {env} not staged at {wp}")
        return iss, 0
    g = grid(wp)
    meta = g.meta()
    tags = Tags(d.get("tags"))
    n = shot["endFrame"] - shot["startFrame"]
    tail = 0
    if nxt is not None and nxt["cameraDirectives"] and nxt["cameraDirectives"][0].get("action") == "camera.dissolve":
        tail = max(1, round(nxt.get("_dir", {}).get("dissolve", DISSOLVE)))
    ch = changes(d, root)
    figs = figures(d, meta)
    seed = hash_id(sid)
    setcam = next((c for c in meta.get("cameras", []) if sid in (c.get("shots") or [])), (meta.get("cameras") or [None])[0])
    backdrop = g.backdrop
    has_backdrop = bool(backdrop) and not backdrop.get("off")
    frames = frames_of(d, n, tail, step)
    lead = tags.lead() or next(iter(d.get("cast") or {}), None) or lead_by_screen(d, figs, frames, setcam, n, seed)

    # ---- facing, every frame (cheap: paths only)
    for fid, fg in figs.items():
        if fg["kind"] != "mob" or not fg["keys"] or tags.has("ignore", fid):
            continue
        for f in range(0, n + tail):
            if tags.has("backstep", fid, f):
                continue
            s0, s1, s = fig_state(fg, f - 0.5, d, fid), fig_state(fg, f + 0.5, d, fid), fig_state(fg, f, d, fid)
            if not (s0 and s1 and s) or s["lying"] or s.get("facing") is None:
                continue
            dx, dz = s1["at"][0] - s0["at"][0], s1["at"][2] - s0["at"][2]
            sp = math.hypot(dx, dz)
            if sp <= 0.05:
                continue
            mv = yaw_of(dx, dz)
            diff = ang_diff(s["facing"], mv)
            if diff > 60:
                iss.add("FAIL", "FACING", fid, f, f"facing {s['facing']:.0f} but moving toward yaw {mv:.0f} ({diff:.0f} deg off, {sp:.2f} m/f)", diff)

    for f in frames:
        c = cam_at(d, f, seed) if d.get("cam") else (moving_cam(setcam, f, n, seed) if setcam else None)
        if not c:
            iss.add("FAIL", "NO_CAMERA", "-", f, "no direction camera and no set camera")
            break
        pos, look, fov = c
        V = View(pos, look, fov)
        sc = Scene(g, ch, f)
        P0 = np.array([pos])
        # ---- 1 camera in solid / too close to a face
        hit, code = sc.collide(P0)
        inside = bool(hit[0])
        if inside:
            iss.add("FAIL", "CAM_SOLID", "camera", f, f"camera at ({pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}) inside a solid block (cell {[math.floor(v) for v in pos]})", 1)
        else:
            near = None
            for r in (0.08, 0.16, 0.25):
                dirs = np.array([[x, y, z] for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)], float)
                dirs /= np.linalg.norm(dirs, axis=1)[:, None]
                h, _ = sc.collide(P0 + dirs * r)
                if h.any():
                    near = r
                    break
            if near:
                iss.add("FAIL", "CAM_SOLID", "camera", f, f"camera within {near:.2f} m of a solid face (near-clip risk)", 1 - near)
        # ---- 6 camera out of set
        if pos[1] < g.bmin[1]:
            iss.add("FAIL", "OUT_OF_SET", "camera", f, f"camera below the set (y {pos[1]:.1f} < {g.bmin[1]})", 1)
        elif not g.in_bounds_xz(pos[0], pos[2]):
            sev = "WARN" if has_backdrop else "FAIL"
            if sev == "FAIL" or f == frames[0]:
                iss.add(sev, "OUT_OF_SET", "camera", f, f"camera outside the set bounds x {g.bmin[0]}..{g.bmax[0]} z {g.bmin[2]}..{g.bmax[2]}"
                        + (f" (over the {backdrop.get('mode', 'land')} backdrop)" if has_backdrop else " and no backdrop"), 0)
        # ---- 3 wall fills the frame
        if not tags.has("block_ecu") and not inside:
            near_hits = 0
            for gx in range(5):
                for gy in range(9):
                    rd = V.ray((gx + 0.5) / 5, (gy + 0.5) / 9)
                    t = np.arange(0.05, 2.0, 0.05)
                    if sc.blocks_view(np.array(pos) + np.outer(t, rd)).any():
                        near_hits += 1
            if near_hits >= 0.7 * 45:
                iss.add("FAIL", "WALL", "camera", f, f"{near_hits}/45 rays hit a solid block within 2.0 m (wall fills the frame)", near_hits / 45)
        # ---- figures
        for fid, fg in figs.items():
            if tags.has("ignore", fid, f):
                continue
            s = fig_state(fg, f, d, fid)
            if not s:
                continue
            at, h = s["at"], s["h"]
            keyed = bool(fg["keys"])
            # 6 out of set (keyed figures, on screen or not)
            if keyed and not g.in_bounds_xz(at[0], at[2]):
                iss.add("FAIL", "OUT_OF_SET", fid, f, f"feet ({at[0]:.1f}, {at[1]:.1f}, {at[2]:.1f}) outside the set x {g.bmin[0]}..{g.bmax[0]} z {g.bmin[2]}..{g.bmax[2]}", 1)
                continue
            # screen box
            feet_p, head_p = V.project(at), V.project([at[0], at[1] + h, at[2]])
            if feet_p is None or head_p is None:
                if fid == lead:
                    iss.add("FAIL", "BEHIND", fid, f, "the lead figure is behind the lens", 1)
                elif keyed and (feet_p is not None or head_p is not None or V.depth(at) > -3):
                    iss.add("WARN", "BEHIND", fid, f, "keyed figure (partly) behind the lens", 0.5)
                continue
            hwf, hwh = 0.32 / feet_p[2] / V.tw / 2, 0.32 / head_p[2] / V.tw / 2
            x0, x1 = min(feet_p[0] - hwf, head_p[0] - hwh), max(feet_p[0] + hwf, head_p[0] + hwh)
            y0, y1 = head_p[1], feet_p[1]
            if x1 < 0 or x0 > 1 or y1 < 0 or y0 > 1:
                continue                                     # off frame: not shown
            # 6 nothing under it / 4 feet
            airborne = s["airborne"] or s["lying"] or tags.has("airborne", fid, f)
            hw = fg["hw"]
            sup = [sc.support(at[0] + ox, at[2] + oz, at[1]) for ox, oz in ((0, 0), (hw * .7, hw * .7), (-hw * .7, hw * .7), (hw * .7, -hw * .7), (-hw * .7, -hw * .7))]
            if all(t is None for t in sup):
                if not airborne or not keyed:
                    iss.add("FAIL", "OUT_OF_SET", fid, f, f"nothing under the feet at ({at[0]:.1f}, {at[1]:.1f}, {at[2]:.1f})", 1)
            elif not airborne:
                top = max(t for t in sup if t is not None)
                gap = at[1] - top
                if gap > 0.15:
                    iss.add("FAIL", "FLOAT", fid, f, f"feet {gap:.2f} above the solid top under them (y {at[1]:.2f}, top {top:.2f})", gap)
            if not s["lying"]:
                hit, _ = sc.collide(np.array([[at[0], at[1] + 0.16, at[2]]]))
                if hit[0] and not airborne:
                    iss.add("FAIL", "SUNK", fid, f, f"feet sunk more than 0.15 into a block at ({at[0]:.2f}, {at[1]:.2f}, {at[2]:.2f})", 0.16)
                else:
                    r = hw * 0.8
                    # a hop up a block: the legs brush the riser on the way up (as in the game); test from the knees
                    ys = np.arange(at[1] + (0.9 if airborne else 0.3), at[1] + h - 0.1, 0.3)
                    if fg["mob"] in PHASERS:
                        ys = ys[:0]
                    B = np.array([[at[0] + ox, y, at[2] + oz] for y in ys for ox in (-r, 0, r) for oz in (-r, 0, r)])
                    if len(B):
                        hb, _ = sc.collide(B)
                        if hb.any():
                            q = B[np.argmax(hb)]
                            # a clip the lens cannot see (behind a crest or a wall more than 0.6 m in front of it) is a WARN
                            seen = any(segment_hit(sc, pos, b, stop_short=0.6) is None for b in B[hb])
                            iss.add("FAIL" if seen else "WARN", "CLIP", fid, f, f"body inside a block at cell {[math.floor(v) for v in q]} ({hb.sum()}/{len(B)} body points)", hb.sum() / len(B))
            # 2 blocked view
            if inside:
                continue
            hd = segment_hit(sc, pos, [at[0], at[1] + h * 0.9, at[2]])
            ch_ = segment_hit(sc, pos, [at[0], at[1] + h * 0.62, at[2]])
            if s.get("glowing") or fg["mob"] in PHASERS:
                pass                                         # the Glowing outline shows through walls; a vex flies through them
            elif hd is not None and ch_ is not None:
                # the lead hidden = the line's subject is gone (FAIL); anyone else behind a wall is staging (WARN)
                iss.add("FAIL" if fid == lead else "WARN", "BLOCKED", fid, f, f"head and chest hidden by a block ({hd:.1f} m / {ch_:.1f} m from the lens)", 1)
            elif hd is not None or ch_ is not None:
                iss.add("WARN", "BLOCKED", fid, f, f"{'head' if hd is not None else 'chest'} hidden by a block {(hd if hd is not None else ch_):.1f} m from the lens", 0.5)
            # 7 safe zone / head cut
            neck = V.project([at[0], at[1] + h - 0.5, at[2]])
            if neck:
                hx0, hx1 = head_p[0] - hwh * 0.8, head_p[0] + hwh * 0.8
                top_cut, side_cut = head_p[1] < 0 or neck[1] > 1, hx0 < 0 or hx1 > 1
                if (top_cut or side_cut) and not tags.has("exit", fid, f):
                    # top / bottom: framed with the head off (FAIL for keyed figures); side: walking in / out of the
                    # frame (FAIL only for the lead)
                    sev = "FAIL" if keyed and (top_cut or fid == lead) else "WARN"
                    iss.add(sev, "HEAD_CUT", fid, f, f"head cut by the frame edge (head x {hx0:.2f}-{hx1:.2f}, y {head_p[1]:.2f}-{neck[1]:.2f})", 1)
                    continue
            if x0 < ZONE[0] or x1 > ZONE[1] or y0 < ZONE[2] or y1 > ZONE[3]:
                iss.add("WARN", "SAFE_ZONE", fid, f, f"box x {x0:.2f}-{x1:.2f} y {y0:.2f}-{y1:.2f} (zone x 0.04-0.84, y 0.08-0.75)",
                        max(ZONE[0] - x0, x1 - ZONE[1], ZONE[2] - y0, y1 - ZONE[3]))
            # 8 lead too small
            if fid == lead and not tags.has("wide") and (y1 - y0) < 0.04:
                iss.add("WARN", "SMALL", fid, f, f"lead figure {100 * (y1 - y0):.1f} % of the frame height (< 4 %)", 0.04 - (y1 - y0))
    return iss, len(frames)


# ------------------------------------------------------------------ main
def resolve_base(b):
    p = Path(b)
    for c in (p, ROOT / p, ROOT / "public" / p, ROOT / "public/mc-preview" / p):
        if (c / "plan.json").exists():
            return c.resolve()
    raise SystemExit(f"no plan.json under {b}")


def run(base, only=None, step=3, verbose=False, out=print):
    base = resolve_base(base)
    plan = json.loads((base / "plan.json").read_text(encoding="utf-8"))
    dpath = base / "direction.json"
    direction = json.loads(dpath.read_text(encoding="utf-8"))["shots"] if dpath.exists() else {}
    root = base.parent
    shots = plan["shots"]
    for s in shots:
        s["_dir"] = direction.get(s["shotId"], {})
    results = []
    for i, s in enumerate(shots):
        sid = s["shotId"]
        if only and sid not in only:
            continue
        iss, nf = check_shot(sid, s, s["_dir"], shots[i + 1] if i + 1 < len(shots) else None, root, step)
        results.append((sid, s, iss, nf))
    # ---- table
    out(f"staging check: {base}  ({len(results)} shots, step {step})")
    out(f"{'shot':6s} {'set':28s} {'frames':>10s}  result")
    total_fail = total_warn = 0
    details = []
    for sid, s, iss, nf in results:
        groups = iss.grouped(gap=step)
        groups = [(("WARN" if sev == "FAIL" and rule == "FACING" and run[-1][3] - run[0][3] < 6 else sev), rule, who, run) for sev, rule, who, run in groups]
        nfail = sum(1 for g in groups if g[0] == "FAIL")
        nwarn = sum(1 for g in groups if g[0] == "WARN")
        total_fail += nfail
        total_warn += nwarn
        res = "OK" if not groups else ", ".join(x for x in (f"FAIL {nfail}" if nfail else "", f"WARN {nwarn}" if nwarn else "") if x)
        rules = sorted({f"{g[1]}" for g in groups if g[0] == "FAIL"}) or sorted({g[1] for g in groups})
        out(f"{sid:6s} {s['environmentId'][:28]:28s} {s['startFrame']:5d}-{s['endFrame'] - 1:<5d} {res}{'  (' + ' '.join(rules) + ')' if groups else ''}")
        for sev, rule, who, run in groups:
            worst = max(run, key=lambda r: r[5])
            a, b = run[0][3], run[-1][3]
            fr = f"f{a:g}" if a == b else f"f{a:g}-{b:g}"
            details.append((sev, f"{sev} {sid} {fr:11s} {who:10s} {rule:10s} {worst[4]}" + (f"  [worst f{worst[3]:g}]" if a != b else "")))
    out("")
    for sev, line in details:
        if sev == "FAIL" or verbose:
            out(line)
    if not verbose and total_warn:
        out(f"({total_warn} WARN lines hidden; -v shows them)")
    out(f"\nTOTAL: {total_fail} FAIL, {total_warn} WARN over {len(results)} shots -> {'FAIL' if total_fail else 'PASS'}")
    return total_fail, total_warn, results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, help="the short's folder with plan.json + direction.json (e.g. public/mc-preview/tapper/short)")
    ap.add_argument("--shots", default="", help="comma list of shot ids (default all)")
    ap.add_argument("--step", type=int, default=3, help="sample every N frames (plus key frames, first and last)")
    ap.add_argument("-v", "--verbose", action="store_true", help="print WARN details too")
    a = ap.parse_args()
    only = set(x.strip() for x in a.shots.split(",") if x.strip()) or None
    nf, _, _ = run(a.base, only, a.step, a.verbose)
    sys.exit(1 if nf else 0)


if __name__ == "__main__":
    main()
