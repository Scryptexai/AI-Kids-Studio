"""Stage the shared Minecraft fx textures (crack stages, water, smoke, splash, generic particles, raid props) into
public/mc-preview/_fx/ with an index.json. McShort loads them once for every shot (doors, pours, waves); RaidFx
loads public/mc-preview/_fx/raid/.

The PNGs come from YOUR OWN extracted library (tools/mc_extract.py): the manifest named in
src/director/config/minecraft.json, or env MC_MANIFEST. They are Mojang's: never commit or share them.

Run:  python scripts/mc_fx_textures.py          (idempotent)
"""
import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/mc-preview/_fx"
RAID = OUT / "raid"

KEYS = ([f"block/destroy_stage_{i}" for i in range(10)] + ["block/water_still", "block/water_flow", "item/water_bucket"]
        + [f"particle/big_smoke_{i}" for i in range(12)] + [f"particle/generic_{i}" for i in range(8)]
        + [f"particle/splash_{i}" for i in range(4)]
        # fire, rain, explosions, lava embers
        + ["block/fire_0", "block/fire_1", "environment/rain", "particle/lava", "particle/flame", "particle/flash"]
        + [f"particle/explosion_{i}" for i in range(16)]
        # fluid cells, lava pour / scoop, contact blocks
        + ["block/lava_still", "block/lava_flow", "item/lava_bucket", "item/bucket", "block/cobblestone", "block/obsidian"]
        # item entities, piston, redstone dust + repeaters, ghost parts
        + ["block/piston_side", "block/piston_top", "block/piston_bottom", "block/piston_inner", "block/smooth_stone",
           "block/redstone_dust_dot", "block/redstone_dust_line0", "block/redstone_dust_line1", "block/repeater",
           "block/repeater_on", "block/redstone_torch", "block/redstone_torch_off", "item/redstone", "item/iron_ingot",
           "entity/chest/normal"])

# RaidFx.tsx RAID_TEX (arrows, bell, ominous banner layers)
RAID_KEYS = ["entity/projectiles/arrow", "entity/bell/bell_body", "block/dark_oak_planks", "block/stone",
             "entity/banner/banner_base", "entity/banner/base", "entity/banner/rhombus", "entity/banner/stripe_bottom",
             "entity/banner/stripe_center", "entity/banner/border", "entity/banner/stripe_middle",
             "entity/banner/half_horizontal", "entity/banner/circle"]


# textures that moved between game versions: key the engine uses -> older names, tried in order
ALIASES = {"entity/banner/banner_base": ["entity/banner_base"], "entity/shield/shield_base_nopattern": ["entity/shield_base_nopattern"]}


def find(textures: dict, k: str):
    for name in [k, *ALIASES.get(k, [])]:
        if name in textures:
            return textures[name]
    return None


def manifest_path() -> Path:
    env = os.environ.get("MC_MANIFEST")
    if env:
        return Path(env)
    cfg = json.loads((ROOT / "src/director/config/minecraft.json").read_text(encoding="utf-8"))
    p = Path(cfg["manifest"])
    return p if p.is_absolute() else ROOT / p


def main():
    mp = manifest_path()
    if not mp.exists():
        raise SystemExit(f"no manifest at {mp}: run  python -I tools/mc_extract.py --jar <your Minecraft client .jar>")
    m = json.loads(mp.read_text(encoding="utf-8"))
    lib = mp.parent
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"water": m["tints"]["water"], "textures": {}}
    missing = []
    for k in KEYS:
        t = find(m["textures"], k)
        if not t:
            missing.append(k)
            continue
        dst = OUT / (k.replace("/", "__") + ".png")
        shutil.copyfile(lib / t["file"], dst)
        a = t.get("anim") or {}
        index["textures"][k] = {"file": dst.name, "frames": a.get("frames", 1), "frametime": a.get("frametime", 1)}
    (OUT / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")

    RAID.mkdir(parents=True, exist_ok=True)
    raid = {}
    for k in RAID_KEYS:
        t = find(m["textures"], k)
        if not t:
            missing.append(k)
            continue
        rel = k.replace("/", "__") + ".png"
        shutil.copyfile(lib / t["file"], RAID / rel)
        raid[k] = {"file": rel}
    (RAID / "index.json").write_text(json.dumps({"textures": raid}, indent=1), encoding="utf-8")

    print("staged", len(index["textures"]), "fx +", len(raid), "raid textures ->", OUT.relative_to(ROOT).as_posix())
    if missing:
        print("not in this game version (the effects that use them draw without):", ", ".join(missing))


if __name__ == "__main__":
    main()
