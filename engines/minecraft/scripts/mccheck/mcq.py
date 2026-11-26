"""mcq: short answers while keying a Minecraft-mode short, so an agent asks one question per call instead of
grepping the renderer, dumping JSON or rendering a still to find out where something is.

  python scripts/mccheck/mcq.py words  <base> <sid>               the shot's words at shot-local frames (+ length, range)
  python scripts/mccheck/mcq.py shot   <base> <sid>               set, frames, transition, fields, every figure's keys in brief
  python scripts/mccheck/mcq.py at     <base> <sid> <f>[,f...]    camera + every figure on that frame: feet, ground under
                                                                  them, screen box %, height %, safe zone, hidden by blocks
  python scripts/mccheck/mcq.py set    <set>                      bounds, cameras, placed mobs / cast, block ids by count
  python scripts/mccheck/mcq.py probe  <set> x y z                the column at a point: cell codes, block ids, boxes, tops
  python scripts/mccheck/mcq.py ground <set> x z [y]              the solid top a figure at x z stands on (below y)
  python scripts/mccheck/mcq.py keys   [name]                     direction.json fields (from src/minecraft types): names,
                                                                  or one field's doc + type (+ the fields of its key type)
  python scripts/mccheck/mcq.py acts   [kind]                     act kinds, or the Act fields that mention one kind
  python scripts/mccheck/mcq.py gate   <base> [sid,sid] [-v]      the staging gate (gate.py): FAIL / WARN lines

<base>: the short folder with plan.json + direction.json (mc-raid/short-a, public/mc-preview/mc-raid/short ...).
<set>:  a staged set id (mr-a20) or its folder. Frames are shot-local (0 = the shot's first frame).
Words come from projects/<story>/audio/words.json (<story> = the base's parent folder); MCQ_WORDS=<path> overrides.
"""
import json
import math
import os
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gate  # noqa: E402
from check.motion import View, cam_at, hash_id, moving_cam  # noqa: E402
from check.world import grid  # noqa: E402

ROOT = gate.ROOT
SRC = ROOT / "src/minecraft"
ZONE = (0.04, 0.84, 0.08, 0.75)


# ------------------------------------------------------------------ lookups
def base_of(b):
    for c in (Path(b), ROOT / b, ROOT / "public" / b, ROOT / "public/mc-preview" / b):
        if (c / "plan.json").exists():
            return c.resolve()
    raise SystemExit(f"no plan.json under {b} (try <story>/<base>, e.g. mc-raid/short-a)")


def set_of(s):
    p = Path(s)
    for c in (p, ROOT / s, ROOT / "public/mc-preview" / s):
        if (c / "world.json").exists():
            return c / "world.json"
    hits = sorted((ROOT / "public/mc-preview").glob(f"*/{s}/world.json"))
    if hits:
        return hits[0]
    raise SystemExit(f"no staged set {s} (public/mc-preview/<story>/{s}/world.json)")


def load(base):
    plan = json.loads((base / "plan.json").read_text(encoding="utf-8"))
    dp = base / "direction.json"
    dirs = json.loads(dp.read_text(encoding="utf-8"))["shots"] if dp.exists() else {}
    return plan, dirs


def shot_of(plan, sid):
    for i, s in enumerate(plan["shots"]):
        if s["shotId"] == sid:
            return i, s
    raise SystemExit(f"no shot {sid}; shots: {' '.join(s['shotId'] for s in plan['shots'])}")


def words_file(base):
    if os.environ.get("MCQ_WORDS"):
        return Path(os.environ["MCQ_WORDS"])
    for story in (base.parent.name, base.name):
        p = ROOT / "projects" / story / "audio/words.json"
        if p.exists():
            return p
    raise SystemExit(f"no projects/{base.parent.name}/audio/words.json: set MCQ_WORDS=<words.json>")


r2 = lambda v: [round(x, 2) for x in v]


# ------------------------------------------------------------------ commands
def cmd_words(base, sid):
    base = base_of(base)
    plan, _ = load(base)
    _, s = shot_of(plan, sid)
    fps = plan.get("fps", 30)
    a, b = s["startFrame"], s["endFrame"]
    ws = json.loads(words_file(base).read_text(encoding="utf-8"))
    inside = [(w["w"], round(w["s"] * fps) - a) for w in ws if a - 6 <= round(w["s"] * fps) < b]
    print(f"{sid}: frames {a}-{b - 1} ({b - a} f)  " + "  ".join(f"{t}@{max(0, f)}" for t, f in inside))


def cmd_shot(base, sid):
    base = base_of(base)
    plan, dirs = load(base)
    i, s = shot_of(plan, sid)
    d = dirs.get(sid, {})
    nxt = plan["shots"][i + 1] if i + 1 < len(plan["shots"]) else None
    trans = {"camera.dissolve": "dissolve", "camera.hold": "cut"}.get((s.get("cameraDirectives") or [{}])[0].get("action"), "?")
    tail = dirs.get(nxt["shotId"], {}).get("dissolve", 12) if nxt and (nxt.get("cameraDirectives") or [{}])[0].get("action") == "camera.dissolve" else 0
    print(f"{sid}: set {s['environmentId']}  frames {s['startFrame']}-{s['endFrame'] - 1} ({s['endFrame'] - s['startFrame']} f)  in: {trans}"
          f"{' ' + str(d['dissolve']) + ' f' if 'dissolve' in d else ''}  tail under next: {tail} f")
    print("  text: " + (s.get("narrationText") or "")[:200])
    print("  fields: " + ", ".join(f"{k}[{len(v)}]" if isinstance(v, (list, dict)) else f"{k}={v}" for k, v in d.items()))
    if d.get("tags"):
        print("  tags: " + " ".join(d["tags"]))
    for k in d.get("cam") or []:
        print(f"  cam f{k['f']:g} pos {r2(k['pos'])} look {r2(k['look'])} fov {k['fov']:.0f} {k.get('ease', 'inOut')}{' CUT' if k.get('cut') else ''}")
    for sect in ("mobs", "cast", "flows"):
        for fid, keys in (d.get(sect) or {}).items():
            k0, k1 = keys[0], keys[-1]
            hid = sum(1 for k in keys if k.get("hidden"))
            print(f"  {sect[:-1]} {fid}: {len(keys)} keys f{k0['f']:g}..f{k1['f']:g}  {r2(k0['at'])} -> {r2(k1['at'])}"
                  f"  facing {k0.get('facing', '-')} -> {k1.get('facing', '-')}{f'  hidden keys {hid}' if hid else ''}")
    for fid, acts in (d.get("acts") or {}).items():
        print(f"  acts {fid}: " + ", ".join(f"{a['kind']}@{a['f']:g}" + (f"+{a['len']}" if "len" in a else "") for a in acts))


def figure_rows(base, sid, f):
    """camera + per-figure rows for one shot-local frame (the gate's own camera, paths and grid)"""
    plan, dirs = load(base)
    _, s = shot_of(plan, sid)
    d = dirs.get(sid, {})
    root = base.parent
    g = grid(root / s["environmentId"] / "world.json")
    meta = g.meta()
    n = s["endFrame"] - s["startFrame"]
    seed = hash_id(sid)
    setcam = next((c for c in meta.get("cameras", []) if sid in (c.get("shots") or [])), (meta.get("cameras") or [None])[0])
    c = cam_at(d, f, seed) if d.get("cam") else (moving_cam(setcam, f, n, seed) if setcam else None)
    if not c:
        raise SystemExit("no camera (no direction cam and no set camera)")
    pos, look, fov = c
    V = View(pos, look, fov)
    sc = gate.Scene(g, gate.changes(d, root), f)
    figs = gate.figures(d, meta)
    rows = []
    for fid, fg in figs.items():
        st = gate.fig_state(fg, f, d, fid)
        if not st:
            rows.append((fid, fg["mob"], None))
            continue
        at, h = st["at"], st["h"]
        fp, hp = V.project(at), V.project([at[0], at[1] + h, at[2]])
        sup = sc.support(at[0], at[2], at[1])
        box = None
        if fp and hp:
            hwf, hwh = 0.32 / fp[2] / V.tw / 2, 0.32 / hp[2] / V.tw / 2
            box = (min(fp[0] - hwf, hp[0] - hwh), max(fp[0] + hwf, hp[0] + hwh), hp[1], fp[1], fp[2])
        hd = gate.segment_hit(sc, pos, [at[0], at[1] + h * 0.9, at[2]]) if box else None
        flags = [k for k in ("airborne", "lying", "glowing") if st.get(k)]
        rows.append((fid, fg["mob"], {"at": at, "facing": st.get("facing"), "h": h, "sup": sup, "box": box, "head_hidden": hd, "flags": flags}))
    return pos, look, fov, rows


def cmd_at(base, sid, frames):
    base = base_of(base)
    for f in [float(x) for x in frames.split(",")]:
        pos, look, fov, rows = figure_rows(base, sid, f)
        print(f"{sid} f{f:g}: cam pos {r2(pos)} look {r2(look)} fov {fov:.1f}")
        for fid, mob, r in rows:
            if r is None:
                print(f"  {fid:12s} {mob:10s} not drawn (hidden / not spawned / gone)")
                continue
            at, sup, box = r["at"], r["sup"], r["box"]
            ground = "nothing under" if sup is None else (f"on ground {sup:g}" if abs(at[1] - sup) <= 0.15 else f"{at[1] - sup:+.2f} vs ground {sup:g}")
            if box is None:
                scr = "behind the lens"
            elif box[1] < 0 or box[0] > 1 or box[3] < 0 or box[2] > 1:
                scr = "off frame"
            else:
                x0, x1, y0, y1, z = box
                out = [n for n, bad in (("L", x0 < ZONE[0]), ("R", x1 > ZONE[1]), ("T", y0 < ZONE[2]), ("B", y1 > ZONE[3])) if bad]
                scr = (f"screen x {100 * x0:.0f}-{100 * x1:.0f} y {100 * y0:.0f}-{100 * y1:.0f} % (h {100 * (y1 - y0):.0f} %, {z:.1f} m)"
                       f" {'SAFE' if not out else 'outside zone ' + ''.join(out)}{'  head hidden by block' if r['head_hidden'] is not None else ''}")
            fc = f"{r['facing']:.0f}" if r["facing"] is not None else "-"
            print(f"  {fid:12s} {mob:10s} feet {r2(at)} facing {fc:>4s}  {ground}  {scr}{'  [' + ','.join(r['flags']) + ']' if r['flags'] else ''}")


def cmd_set(s):
    wp = set_of(s)
    w = json.loads(wp.read_text(encoding="utf-8"))
    g = grid(wp)
    print(f"set {w['id']}  bounds {g.bmin.tolist()}..{g.bmax.tolist()}  sky {w.get('sky', {}).get('preset')}"
          f"  backdrop {'yes' if (wp.parent / 'backdrop.json').exists() else 'no'}")
    for c in w.get("cameras", []):
        print(f"  camera {c['id']}: pos {r2(c['position'])} look {r2(c['lookAt'])} fov {c['fov']}{'  shots ' + ','.join(c['shots']) if c.get('shots') else ''}")
    for m in w.get("mobs", []):
        print(f"  mob {m['id']} ({m['mob']}) at {r2(m['at'])} facing {m.get('facing')}")
    for c in w.get("characters", []):
        print(f"  cast {c['id']} at {r2(c['at'])} facing {c.get('facing')}")
    cnt = Counter()
    for b in w["blocks"]:
        cnt[b["id"]] += len(b["positions"]) // 3
    print("  blocks: " + ", ".join(f"{k} {v}" for k, v in cnt.most_common(25)) + (f" (+{len(cnt) - 25} more ids)" if len(cnt) > 25 else ""))


def cmd_probe(s, x, y, z):
    sys.argv = ["probe", str(set_of(s).parent), x, y, z]
    from check import probe
    probe.main()


def cmd_ground(s, x, z, y=None):
    g = grid(set_of(s))
    x, z = float(x), float(z)
    y = float(y) if y is not None else float(g.bmax[1])
    sc = gate.Scene(g, [], 0)
    t = sc.support(x, z, y)
    print(f"ground at x {x:g} z {z:g} below y {y:g}: " + ("nothing (open to the bottom of the set)" if t is None else f"{t:g}  (feet y = {t:g})"))


# ------------------------------------------------------------------ type docs (parsed from src/minecraft, never stale)
def type_blocks():
    """{type name: [(field, type text, doc)]} for every `export type X = ... { ... }` in src/minecraft/*.ts"""
    out = {}
    for fp in sorted(SRC.glob("*.ts")) + sorted(SRC.glob("mobs/*.ts")):
        txt = fp.read_text(encoding="utf-8")
        for m in re.finditer(r"export type (\w+)\s*=\s*([^{;]*?)\{", txt):
            name, i, depth = m.group(1), m.end(), 1
            j = i
            while j < len(txt) and depth:
                depth += {"{": 1, "}": -1}.get(txt[j], 0)
                j += 1
            body, fields = txt[i:j - 1], []
            k, doc = 0, ""
            while k < len(body):
                if body.startswith("/**", k):
                    e = body.find("*/", k)
                    doc = re.sub(r"\s*\n\s*\*\s?", " ", body[k + 3:e]).strip(" *")
                    k = e + 2
                    continue
                if body.startswith("//", k):
                    k = body.find("\n", k) + 1 or len(body)
                    continue
                fm = re.match(r"\s*(\w+)\??\s*:\s*", body[k:])
                if fm:
                    k += fm.end()
                    st, dep = k, 0
                    while k < len(body) and not (dep == 0 and body[k] in ";\n" and body[st:k].strip()):
                        dep += {"{": 1, "[": 1, "(": 1, "<": 1, "}": -1, "]": -1, ")": -1, ">": -1}.get(body[k], 0)
                        k += 1
                    fields.append((fm.group(1), re.sub(r"\s+", " ", body[st:k]).strip(), doc))
                    doc = ""
                k += 1
            out.setdefault(name, fields)
            out[name + "__extends"] = re.findall(r"(?:import\(\"[./\w]+\"\)\.)?(\w+)\s*&", m.group(2))
    return out


def cmd_keys(name=None):
    T = type_blocks()
    top = ["ShotDirection"] + T.get("ShotDirection__extends", [])
    if not name:
        for t in top:
            print(f"{t}: " + ", ".join(f[0] for f in T.get(t, [])))
        print("(mcq keys <name> for one field; mobs/cast keys = PathKey, acts = Act)")
        return
    hits = [(t, f) for t, fs in T.items() if not t.endswith("__extends") for f in fs if f[0] == name]
    if name in T:
        hits.append((name, (name, "type", "")))
    if not hits:
        raise SystemExit(f"no field {name}")
    shown = set()
    for t, (fname, ty, doc) in hits[:6]:
        if ty == "type":
            print(f"type {name}:")
        else:
            print(f"{t}.{fname}: {ty}" + (f"\n    {doc}" if doc else ""))
        for ref in re.findall(r"\b([A-Z]\w+)\b", ty if ty != "type" else name):
            if ref in T and ref not in shown and ref not in ("Record", "V3"):
                shown.add(ref)
                for f2, ty2, doc2 in T[ref]:
                    print(f"    {ref}.{f2}: {ty2}" + (f"  // {doc2[:140]}" if doc2 else ""))


def cmd_acts(kind=None):
    txt = (SRC / "mobs/acts.ts").read_text(encoding="utf-8")
    union = re.search(r"export type ActKind =(.*?);", re.sub(r"//[^\n]*", "", txt), re.S).group(1)
    kinds = list(dict.fromkeys(re.findall(r'"(\w+)"', union)))
    if not kind:
        print("act kinds: " + " ".join(kinds))
        print("Act fields: " + ", ".join(f[0] for f in type_blocks().get("Act", [])))
        print("(mcq acts <kind>: the fields that mention it; formats per story in projects/<story>/FX.md)")
        return
    if kind not in kinds:
        raise SystemExit(f"no act kind {kind}")
    for f, ty, doc in type_blocks().get("Act", []):
        if f in ("f", "kind", "len", "ein", "eout") or re.search(rf"\b{kind}\b", doc):
            print(f"  {f}: {ty}" + (f"  // {doc[:200]}" if doc else ""))
    for fp in sorted((SRC / "mobs").glob("*.ts")):
        for ln in fp.read_text(encoding="utf-8").splitlines():
            if re.search(rf"^\s*//.*\b{kind}\b", ln):
                print(f"  {fp.name}: {ln.strip()[:200]}")


def main():
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help"):
        print(__doc__)
        return
    c, rest = a[0], a[1:]
    try:
        if c == "words":
            cmd_words(*rest)
        elif c == "shot":
            cmd_shot(*rest)
        elif c == "at":
            cmd_at(*rest)
        elif c == "set":
            cmd_set(*rest)
        elif c == "probe":
            cmd_probe(*rest)
        elif c == "ground":
            cmd_ground(*rest)
        elif c == "keys":
            cmd_keys(*rest)
        elif c == "acts":
            cmd_acts(*rest)
        elif c == "gate":
            only = set(rest[1].split(",")) if len(rest) > 1 and not rest[1].startswith("-") else None
            nf, _, _ = gate.run(rest[0], only, 3, "-v" in rest)
            sys.exit(1 if nf else 0)
        else:
            raise SystemExit(f"unknown command {c}\n{__doc__}")
    except TypeError as e:
        raise SystemExit(f"{c}: wrong arguments ({e})\n{__doc__}")


if __name__ == "__main__":
    main()
