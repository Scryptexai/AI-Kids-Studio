"""Regression test for gate.py: plants known-bad shots in a scratch short and proves each one FAILs with the
right rule (and that the tags let a deliberate shot through).

  python scripts/mccheck/check/plant_test.py         (writes public/mc-preview/_checktest/, exit 1 on a miss)

The scratch short uses a copy of mc-cobblegen's sky island set cg-a-i0 (grass top at y 0 over x -5..4, z -3..2 plus a
strip x 2..4 to z -6; dirt face at z -3 down to y -3; an oak log column in cell x 3 z 1, y 0..4; leaves above).
"""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import gate as check_staging  # noqa: E402

ROOT = HERE.parents[2]
SRC = ROOT / "public/mc-preview/demo/cg-a-i0"  # staged by demo/build_demo.py
OUT = ROOT / "public/mc-preview/_checktest"
ENV = "cg-a-i0"
N = 30

WIDE = [{"f": 0, "pos": [-0.5, 1.4, -4.5], "look": [-0.5, 1.0, 0.5], "fov": 60}, {"f": N, "pos": [-0.5, 1.4, -4.3], "look": [-0.5, 1.0, 0.5], "fov": 60}]
STAND = [{"f": 0, "at": [-0.5, 0, 0.5], "facing": 180}, {"f": N, "at": [-0.5, 0, 0.5], "facing": 180}]
WALK_OK = [{"f": 0, "at": [-1.5, 0, 0.5], "facing": -90}, {"f": N - 1, "at": [0.5, 0, 0.5], "facing": -90, "ease": "linear"}]
WALK_BACK = [{"f": 0, "at": [-1.5, 0, 0.5], "facing": 90}, {"f": N - 1, "at": [0.5, 0, 0.5], "facing": 90, "ease": "linear"}]


def at(x, y, z, facing=180):
    return [{"f": 0, "at": [x, y, z], "facing": facing}, {"f": N, "at": [x, y, z], "facing": facing}]


def cam(pos, look, fov=40):
    return [{"f": 0, "pos": pos, "look": look, "fov": fov}, {"f": N, "pos": pos, "look": look, "fov": fov}]


# id: (direction, rules that must FAIL, rules that must NOT fail)
CASES = {
    "C0": ({"cam": WIDE, "mobs": {"ruby": WALK_OK}}, [], ["*"]),                                  # control: clean walk
    "C1": ({"cam": WIDE, "mobs": {"ruby": STAND}}, [], ["*"]),                                    # control: standing
    "P1": ({"cam": cam([-0.5, -0.5, -3], [-0.5, 1.0, 0.5]), "mobs": {"ruby": STAND}}, ["CAM_SOLID"], []),
    "P2": ({"cam": WIDE, "mobs": {"ruby": WALK_BACK}}, ["FACING"], []),
    "P2t": ({"cam": WIDE, "mobs": {"ruby": WALK_BACK}, "tags": ["backstep:ruby"]}, [], ["FACING"]),
    "P3": ({"cam": WIDE, "mobs": {"ruby": at(-0.5, 0.6, 0.5)}}, ["FLOAT"], []),
    "P3t": ({"cam": WIDE, "mobs": {"ruby": at(-0.5, 0.6, 0.5)}, "tags": ["airborne:ruby"]}, [], ["FLOAT"]),
    "P4": ({"cam": cam([1, 1.4, -6], [3, 1, 0.5], 50), "mobs": {"ruby": [{"f": 0, "at": [2.5, 0, -2], "facing": -90}, {"f": N - 1, "at": [9, 0, -2], "facing": -90, "ease": "linear"}]}}, ["OUT_OF_SET"], []),
    "P4b": ({"cam": cam([2.5, 1.4, -6], [5.5, 1, -2], 50), "mobs": {"ruby": at(5.5, 0, -2, -90)}}, ["OUT_OF_SET"], []),   # inside the bounds, nothing under
    "P5": ({"cam": cam([-0.5, -1.5, -4.4], [-0.5, -1.5, 0.5]), "mobs": {"ruby": STAND}}, ["WALL"], []),
    "P5t": ({"cam": cam([-0.5, -1.5, -4.4], [-0.5, -1.5, 0.5]), "mobs": {"ruby": STAND}, "tags": ["block_ecu"]}, [], ["WALL"]),
    "P6": ({"cam": cam([-0.5, 1.0, -0.6], [-0.5, 1.0, 0.5]), "mobs": {"ruby": STAND}}, ["HEAD_CUT"], []),
    "P7": ({"cam": cam([1.5, 1.4, -3], [2.8, 1.0, 1.5]), "mobs": {"ruby": at(2.8, 0, 1.5)}}, ["CLIP"], []),
    "P8": ({"cam": cam([3.5, 1.2, 3.8], [3.5, 1.2, -3]), "mobs": {"ruby": at(3.5, 0, -3, 0)}}, ["BLOCKED"], []),
    "P9": ({"cam": cam([-0.5, 1.4, 3.0], [-0.5, 1.4, 6.0]), "mobs": {"ruby": STAND}}, ["BEHIND"], []),   # lead behind the lens
    # 2026-11-25 rules: a fall keyed frame by frame (every sample lands on a key) is airborne, not FLOAT
    "P10t": ({"cam": WIDE, "mobs": {"ruby": [{"f": i, "at": [-0.5, round(1.5 - 0.05 * i, 3), 0.5], "facing": 180, "ease": "linear"} for i in range(0, N + 1, 3)]}}, [], ["FLOAT"]),
    # a flow (RaidFx flows) moves the figure: falling down a column is airborne; its mob keys are ignored
    "P11t": ({"cam": WIDE, "mobs": {"ruby": at(-0.5, 0.6, 0.5)}, "flows": {"ruby": [{"f": 0, "at": [-0.5, 1.6, 0.5], "mode": "float"}, {"f": N, "at": [-0.5, 0.2, 0.5], "mode": "fall"}]}}, [], ["FLOAT"]),
    # the Glowing act shows the lead through the wall on purpose (P8 without it FAILs)
    "P12t": ({"cam": cam([3.5, 1.2, 3.8], [3.5, 1.2, -3]), "mobs": {"ruby": at(3.5, 0, -3, 0)}, "acts": {"ruby": [{"f": 0, "kind": "glowing", "len": N + 12}]}}, [], ["BLOCKED"]),
}


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / ENV).mkdir(parents=True)
    for f in ("world.json", "backdrop.json"):
        if (SRC / f).exists():
            shutil.copyfile(SRC / f, OUT / ENV / f)
    shots, dirs = [], {}
    for i, (sid, (d, _, _)) in enumerate(CASES.items()):
        a = i * N
        shots.append({"shotId": sid, "startFrame": a, "endFrame": a + N, "environmentId": ENV, "charactersPresent": [],
                      "cameraDirectives": [{"action": "camera.hold"}], "animationEvents": [], "continuityState": []})
        dirs[sid] = d
    (OUT / "short").mkdir()
    (OUT / "short/plan.json").write_text(json.dumps({"fps": 30, "shots": shots}, indent=1), encoding="utf-8")
    (OUT / "short/direction.json").write_text(json.dumps({"shots": dirs}, indent=1), encoding="utf-8")


def main():
    build()
    lines = []
    check_staging.run(OUT / "short", out=lines.append, verbose=True)
    print("\n".join(lines))
    fails = {}
    for ln in lines:
        p = ln.split()
        if len(p) > 4 and p[0] == "FAIL":
            fails.setdefault(p[1], set()).add(p[4])
    bad = 0
    print("\nplanted-shot results:")
    for sid, (_, must, mustnt) in CASES.items():
        got = fails.get(sid, set())
        miss = [r for r in must if r not in got]
        extra = sorted(got) if "*" in mustnt else [r for r in mustnt if r in got]
        ok = not miss and not extra
        bad += not ok
        print(f"  {sid:4s} expect FAIL {must or '-'} {'(no FAIL)' if '*' in mustnt else ('no ' + str(mustnt) if mustnt else '')}: got {sorted(got) or 'none'} -> {'OK' if ok else 'MISS'}")
    print("ALL PLANTED CASES BEHAVE" if not bad else f"{bad} CASES MISBEHAVE")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
