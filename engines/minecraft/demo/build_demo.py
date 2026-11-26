"""Build the demo: a small village yard (a cottage, trees, a path, flowers), a player and a villager, two shots.
Proves the whole chain on your machine: your extracted textures -> mc-stage -> McShort.

  python demo/build_demo.py
  npx remotion still src/index.ts McDemo out/demo.png --frame=150
  npx remotion render src/index.ts McDemo out/demo.mp4

Writes (all git-ignored, they hold Mojang textures):
  public/mc-preview/demo/demo-yard/   the staged set (world.json + only the textures it uses)
  public/mc-preview/demo/cg-a-i0/     a small sky island (scripts/mccheck/check/plant_test.py uses it)
  public/mc-preview/demo/short/       plan.json + direction.json + a silent voice.wav (McShort needs one; swap in your VO)
  public/mc-preview/_fx/              shared fx textures (scripts/mc_fx_textures.py)
Needs your manifest first:  python -I tools/mc_extract.py --jar <your Minecraft client .jar>
"""
import json
import random
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / "demo"
STAGE = ROOT / "public/mc-preview/demo"
SHORT = STAGE / "short"
FPS = 30


def node_stage(voxel: Path, out: Path):
    r = subprocess.run(["node", "src/director/mc.ts", "mc-stage", str(voxel), "--out", str(out)], cwd=ROOT, capture_output=True, text=True)
    print(r.stdout.strip())
    if r.returncode:
        print(r.stderr.strip())
        raise SystemExit(f"mc-stage failed for {voxel.name}")


# ------------------------------------------------------------------ the set
def yard():
    pal = {"g": "grass_block", "d": "dirt", "p": "dirt_path", "c": "cobblestone", "w": "oak_planks", "l": "oak_log",
           "r": "spruce_planks", "gl": "glass", "a": "air", "lv": "oak_leaves", "sg": "short_grass", "po": "poppy",
           "da": "dandelion", "tn": "wall_torch[facing=north]",
           "sn": "spruce_stairs[facing=south,half=bottom,shape=straight]",
           "ss": "spruce_stairs[facing=north,half=bottom,shape=straight]"}
    ops = []
    fill = lambda a, b, k: ops.append({"op": "fill", "from": list(a), "to": list(b), "block": k})
    blk = lambda a, k: ops.append({"op": "block", "at": list(a), "block": k})
    # ground: grass on dirt, far enough out that the fog hides the edge
    fill((-40, -3, -40), (40, -2, 40), "d")
    fill((-40, -1, -40), (40, -1, 40), "g")
    # path from the camera side to the door (x -1..1)
    fill((-1, -1, -30), (1, -1, 3), "p")
    # cottage x -4..4, z 4..10: cobblestone base, plank walls, log corners
    fill((-4, -1, 4), (4, -1, 10), "w")
    ops.append({"op": "walls", "from": [-4, 0, 4], "to": [4, 0, 10], "block": "c"})
    ops.append({"op": "walls", "from": [-4, 1, 4], "to": [4, 3, 10], "block": "w"})
    for x in (-4, 4):
        for z in (4, 10):
            fill((x, 0, z), (x, 3, z), "l")
    # door opening, windows, torch by the door
    fill((0, 0, 4), (0, 1, 4), "a")
    for x in (-2, 2):
        fill((x, 1, 4), (x, 2, 4), "gl")
    for z in (6, 8):
        blk((-4, 2, z), "gl")
        blk((4, 2, z), "gl")
    blk((-1, 2, 3), "tn")
    # gable ends, then the stair roof (ridge along x)
    for k, (z0, z1) in enumerate([(4, 10), (5, 9), (6, 8), (7, 7)]):
        for x in (-4, 4):
            fill((x, 4 + k, z0), (x, 4 + k, z1), "w")
    for k in range(4):
        fill((-5, 4 + k, 3 + k), (5, 4 + k, 3 + k), "sn")
        fill((-5, 4 + k, 11 - k), (5, 4 + k, 11 - k), "ss")
    fill((-5, 8, 7), (5, 8, 7), "r")
    # trees: leaves first, the trunk wins where they overlap
    trees = [(-10, 9), (9, 13), (-15, -4), (14, -9), (-7, 20), (18, 6)]
    for x, z in trees:
        fill((x - 2, 3, z - 2), (x + 2, 4, z + 2), "lv")
        fill((x - 1, 5, z - 1), (x + 1, 6, z + 1), "lv")
        fill((x, 0, z), (x, 4, z), "l")
    # flowers and grass tufts, kept off the path, the house, the trees and where the actors stand
    rng = random.Random(7)
    keep_out = lambda x, z: (-2 <= x <= 2) or (-5 <= x <= 5 and 3 <= z <= 11) or any(abs(x - tx) <= 1 and abs(z - tz) <= 1 for tx, tz in trees) or (1 <= x <= 5 and -4 <= z <= 2)
    for _ in range(260):
        x, z = rng.randint(-26, 26), rng.randint(-26, 26)
        if not keep_out(x, z):
            blk((x, 0, z), rng.choice(["sg", "sg", "sg", "po", "da"]))
    return {
        "schemaVersion": "1.0.0", "kind": "VoxelSet", "id": "demo-yard", "theme": "village", "mcVersion": "any",
        "palette": pal, "ops": ops, "sky": {"preset": "day", "fogNear": 28, "fogFar": 75},
        "mobs": [
            {"id": "hero", "mob": "player", "variant": "wide/steve", "at": [0.5, 0, -6.5], "facing": 0, "action": "idle"},
            {"id": "vil", "mob": "villager", "at": [3.5, 0, -1.5], "facing": 180, "action": "idle"},
        ],
        "props": [], "characters": [],
        "cameras": [
            {"id": "wide", "position": [8.0, 2.6, -15.0], "lookAt": [0.0, 2.4, 5.0], "fov": 50},
            {"id": "close", "position": [-3.45, 1.62, -9.36], "lookAt": [2.0, 0.8, -2.2], "fov": 36},
        ],
    }


# ------------------------------------------------------------------ the short
def yaw(dx, dz):  # Minecraft yaw that looks along (dx, dz)
    import math
    return round(math.degrees(math.atan2(-dx, dz)), 1)


def short():
    A, B, END = 0, 105, 210
    to_vil = yaw(3.5 - 0.5, -1.5 + 3.5)
    to_hero = yaw(0.5 - 3.5, -3.5 + 1.5)
    shots = {
        "A": {  # wide: the hero walks up the path, the villager waves
            "cam": [{"f": 0, "pos": [3.0, 2.6, -21.0], "look": [0.9, 1.8, -3.0], "fov": 50},
                    {"f": B - A, "pos": [3.2, 2.0, -13.0], "look": [1.6, 1.3, -2.0], "fov": 48}],
            "mobs": {"hero": [{"f": 0, "at": [0.5, 0, -9.5], "facing": 0},
                              {"f": 85, "at": [0.5, 0, -3.5], "facing": 0},
                              {"f": 100, "at": [0.5, 0, -3.5], "facing": to_vil}],
                     "vil": [{"f": 0, "at": [3.5, 0, -1.5], "facing": 200}, {"f": 60, "at": [3.5, 0, -1.5], "facing": to_hero}]},
            "acts": {"vil": [{"f": 62, "kind": "wave", "len": 16}]},
        },
        "B": {  # over the shoulder: they talk; the hero points at the cottage
            "cam": [{"f": 0, "pos": [-3.45, 1.62, -9.36], "look": [2.0, 0.8, -2.2], "fov": 36},
                    {"f": END - B, "pos": [-3.2, 1.62, -9.0], "look": [2.0, 0.8, -2.2], "fov": 36}],
            "mobs": {"hero": [{"f": 0, "at": [0.5, 0, -3.5], "facing": to_vil}],
                     "vil": [{"f": 0, "at": [3.5, 0, -1.5], "facing": to_hero}]},
            "acts": {"vil": [{"f": 4, "kind": "talk", "len": 30}, {"f": 78, "kind": "nod"}],
                     "hero": [{"f": 36, "kind": "doubleTake", "len": 6}, {"f": 50, "kind": "point", "target": [0.5, 2.0, 6.0], "len": 14}]},
        },
    }
    plan_shots = []
    for sid, (s, e) in {"A": (A, B), "B": (B, END)}.items():
        plan_shots.append({"shotId": sid, "take": None, "startSec": s / FPS, "endSec": e / FPS, "startFrame": s, "endFrame": e,
                           "environmentId": "demo-yard", "charactersPresent": [], "narrationText": "",
                           "cameraDirectives": [{"id": f"c{sid}", "startFrame": s, "endFrame": e, "action": "camera.hold", "anchor": None, "params": {}, "sourceRefs": []}],
                           "animationEvents": [], "continuityState": [], "skipped": []})
    plan = {"schemaVersion": "1.0.0", "kind": "AnimationPlan", "script": {"file": "", "sha256": ""}, "fps": FPS,
            "generatedBy": {"backend": "skill", "model": "demo"}, "shots": plan_shots}
    SHORT.mkdir(parents=True, exist_ok=True)
    (SHORT / "plan.json").write_text(json.dumps(plan, indent=1), encoding="utf-8")
    (SHORT / "direction.json").write_text(json.dumps({"shots": shots}, indent=1), encoding="utf-8")
    with wave.open(str(SHORT / "voice.wav"), "wb") as w:  # silent stand-in for the voice-over
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes(b"\0\0" * int(48000 * END / FPS))
    print(f"wrote {SHORT.relative_to(ROOT).as_posix()}/ plan.json, direction.json, voice.wav ({END} frames)")


def main():
    r = subprocess.run([sys.executable, "scripts/mc_fx_textures.py"], cwd=ROOT)
    if r.returncode:
        raise SystemExit("mc_fx_textures.py failed (is the manifest there? see the README)")
    work = ROOT / "out/demo-sets"
    work.mkdir(parents=True, exist_ok=True)
    y = work / "demo-yard.voxel.json"
    y.write_text(json.dumps(yard(), indent=1), encoding="utf-8")
    node_stage(y, STAGE / "demo-yard")
    island = json.loads((HERE / "sets/cg-a-i0.voxel.json").read_text(encoding="utf-8"))
    i = work / "cg-a-i0.voxel.json"
    i.write_text(json.dumps(island, indent=1), encoding="utf-8")
    node_stage(i, STAGE / "cg-a-i0")
    short()


if __name__ == "__main__":
    main()
