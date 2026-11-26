"""Extract Minecraft textures, block models and sounds from a LOCAL client jar (your own copy of
Minecraft Java) into <project>/mc-assets,
and write manifest.json (every block, entity/mob, item, particle, sky texture and sound event that is available).

Read only on the inputs: never writes into .minecraft, never downloads anything. Run with `python -I`.

  python -I tools/mc_extract.py --jar <client.jar>
      [--assets-dir <.minecraft/assets> --index 36 --sounds]   copy sound files (big, opt-in)
      [--pack <zip|folder>] ...                                 resource packs that override vanilla textures (later wins)
      [--out mc-assets]                                         default: mc-assets next to tools/

The assets are Mojang's: fine to use in videos, never redistribute them (keep them out of git and out of public repos).
"""
from __future__ import annotations

import argparse, datetime, hashlib, io, json, re, shutil, sys, zipfile
from pathlib import Path

from PIL import Image

NS = "assets/minecraft/"
# texture folders we copy, and where they land under vanilla/<ver>/ (layout: textures/*, sky; sounds/ at the root)
TEX_DIRS = {"block": "textures/block", "entity": "textures/entity", "item": "textures/item",
            "particle": "textures/particle", "colormap": "textures/colormap", "environment": "sky"}
SAFE = re.compile(r"^[a-z0-9_./-]+$")

# biome tints (plains) and the blocks Minecraft colours with a fixed value instead of the colormap
TINT = {"grass": "#91BD59", "foliage": "#77AB2F", "dry_foliage": "#A0A06B", "water": "#3F76E4"}
FIXED_TINT = {"spruce_leaves": "#619961", "birch_leaves": "#80A755", "lily_pad": "#208030"}
SPECIAL_TINT = ("redstone_wire", "_stem", "attached_")

# mobs whose textures are not in entity/<id>/ or entity/<id>.png
MOB_TEXTURE_ALIASES = {
    "player": ["player/wide/", "player/slim/"],
    "mooshroom": ["cow/mooshroom_"],
    "horse": ["horse/horse_"],
    "donkey": ["horse/donkey"], "mule": ["horse/mule"],
    "skeleton_horse": ["horse/horse_skeleton"], "zombie_horse": ["horse/horse_zombie"],
    "husk": ["zombie/husk"], "drowned": ["zombie/drowned"],
    "stray": ["skeleton/stray"], "wither_skeleton": ["skeleton/wither_skeleton"], "bogged": ["skeleton/bogged"],
    "cave_spider": ["spider/cave_spider"], "elder_guardian": ["guardian_elder"],
    "zombified_piglin": ["piglin/zombified_piglin"], "piglin_brute": ["piglin/piglin_brute"],
    "iron_golem": ["iron_golem/"], "ender_dragon": ["enderdragon/"],
    "glow_squid": ["squid/glow_squid"], "trader_llama": ["llama/"],
    "elder_guardian": ["guardian/guardian_elder"], "guardian": ["guardian/guardian"],
    "evoker": ["illager/evoker"], "illusioner": ["illager/illusioner"], "pillager": ["illager/pillager"],
    "vindicator": ["illager/vindicator"], "ravager": ["illager/ravager"], "vex": ["illager/vex"],
    "polar_bear": ["bear/polarbear"], "ocelot": ["cat/ocelot"], "magma_cube": ["slime/magmacube"],
    "cod": ["fish/cod"], "salmon": ["fish/salmon"], "pufferfish": ["fish/pufferfish"], "tropical_fish": ["fish/tropical_"],
    "zoglin": ["hoglin/zoglin"], "frostbite": ["zombie/frostbite"], "parched": ["skeleton/parched"],
    "camel": ["camel/camel", "camel/camel_baby"], "camel_husk": ["camel/camel_husk"],
    "zombie_nautilus": ["nautilus/zombie_nautilus"], "armor_stand": ["armorstand/"], "giant": ["zombie/zombie"],
    "killer_bunny": ["rabbit/caerbannog"],
}
# property values Minecraft uses when a block is just placed: picks the default blockstate variant
DEFAULT_PROPS = {"facing": "north", "half": "bottom", "shape": "straight", "axis": "y", "snowy": "false",
                 "waterlogged": "false", "powered": "false", "open": "false", "lit": "false", "type": "bottom",
                 "age": "0", "hinge": "left", "face": "floor", "attachment": "floor", "in_wall": "false",
                 "occupied": "false", "part": "foot", "stage": "0", "rotation": "0", "level": "0", "power": "0",
                 "east": "none", "west": "none", "north": "none", "south": "none", "up": "false", "down": "false"}


def default_state(keys: list[str]) -> str:
    if "" in keys:
        return ""
    def score(k: str) -> int:
        return sum(1 for kv in k.split(",") if "=" in kv and DEFAULT_PROPS.get(kv.split("=")[0]) == kv.split("=")[1])
    return max(keys, key=score)  # max keeps the first of equal scores


def rel_key(ref: str) -> str:
    """'minecraft:block/stone' or 'block/stone' -> 'block/stone'"""
    return ref.split(":", 1)[1] if ":" in ref else ref


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    if path.is_dir():
        for p in sorted(path.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(path)).replace("\\", "/").encode())
                h.update(p.read_bytes())
    else:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
    return h.hexdigest()


class Source:
    """a jar/zip or a folder, read with assets/minecraft/... names"""

    def __init__(self, path: Path):
        self.path = path
        self.zip = zipfile.ZipFile(path) if path.is_file() else None
        if self.zip:
            self.names = [n for n in self.zip.namelist() if not n.endswith("/")]
        else:
            self.names = [str(p.relative_to(path)).replace("\\", "/") for p in path.rglob("*") if p.is_file()]
        self.nameset = set(self.names)

    def read(self, name: str) -> bytes:
        return self.zip.read(name) if self.zip else (self.path / name).read_bytes()


def texture_info(data: bytes, meta: bytes | None) -> dict:
    im = Image.open(io.BytesIO(data))
    w, h = im.size
    a = im.convert("RGBA").getchannel("A")
    lo, _ = a.getextrema()
    partial = sum(a.histogram()[1:255]) > 0
    layer = "opaque" if lo == 255 else ("translucent" if partial else "cutout")
    info: dict = {"w": w, "h": h, "layer": layer}
    if meta:
        try:
            an = json.loads(meta).get("animation")
            if an is not None:
                fw = an.get("width", w)
                fh = an.get("height", fw if "width" in an else w)
                info["anim"] = {"frames": max(1, h // fh), "frametime": an.get("frametime", 1),
                                "interpolate": bool(an.get("interpolate", False))}
                info["h"] = fh
        except (ValueError, AttributeError):
            pass
    return info


def copy_texture(src: Source, name: str, dest: Path) -> dict:
    data = src.read(name)
    meta = src.read(name + ".mcmeta") if (name + ".mcmeta") in src.nameset else None
    info = texture_info(data, meta)  # raises on a broken png before anything is written
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    if meta:
        (dest.parent / (dest.name + ".mcmeta")).write_bytes(meta)
    return info


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jar", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "mc-assets")
    ap.add_argument("--pack", action="append", type=Path, default=[])
    ap.add_argument("--assets-dir", type=Path)
    ap.add_argument("--index")
    ap.add_argument("--sounds", action="store_true")
    ap.add_argument("--version", help="defaults to the jar's file name")
    args = ap.parse_args()

    jar = Source(args.jar)
    ver = args.version or args.jar.stem
    vroot = args.out / "vanilla" / ver
    names = jar.nameset

    def rel_out(p: Path) -> str:
        return str(p.relative_to(args.out)).replace("\\", "/")

    def jjson(path: str):
        return json.loads(jar.read(NS + path))

    # ---------- textures ----------
    textures: dict[str, dict] = {}
    for n in jar.names:
        if not (n.startswith(NS + "textures/") and n.endswith(".png")):
            continue
        sub = n[len(NS + "textures/"):]
        top = sub.split("/", 1)[0]
        if top not in TEX_DIRS or not SAFE.match(sub):
            continue
        dest = vroot / TEX_DIRS[top] / sub.split("/", 1)[1]
        info = copy_texture(jar, n, dest)
        textures[sub[:-4]] = {"file": rel_out(dest), "src": "vanilla", **info}

    # ---------- resource packs override textures (later pack wins) ----------
    packs = []
    for pp in args.pack:
        pk = Source(pp)
        pname = re.sub(r"[^A-Za-z0-9_.-]+", "-", pp.stem).strip("-").lower()
        proot = args.out / "packs" / pname
        count = 0
        for n in pk.names:
            i = n.find(NS + "textures/")
            if i < 0 or not n.endswith(".png"):
                continue
            sub = n[i + len(NS + "textures/"):]
            top = sub.split("/", 1)[0]
            if top not in TEX_DIRS or "/" not in sub or not SAFE.match(sub) or ".." in sub:
                continue
            dest = proot / TEX_DIRS[top] / sub.split("/", 1)[1]
            try:
                info = copy_texture(pk, n, dest)
            except Exception as e:  # a broken png in a pack must not stop the run
                print(f"skip {pname}:{sub}: {e}", file=sys.stderr)
                continue
            textures[sub[:-4]] = {"file": rel_out(dest), "src": f"pack:{pname}", **info}
            count += 1
        packs.append({"name": pname, "path": str(pp), "sha256": sha256_of(pp), "textures": count})

    # ---------- block models (parents followed, texture refs resolved) ----------
    model_cache: dict[str, dict | None] = {}

    def load_model(ref: str) -> dict | None:
        key = rel_key(ref)
        if key in model_cache:
            return model_cache[key]
        if NS + "models/" + key + ".json" not in names:
            model_cache[key] = None
            return None
        stack = [jjson("models/" + key + ".json")]
        parents: list[str] = []
        while "parent" in stack[-1] and len(stack) < 16:
            par = rel_key(stack[-1]["parent"])
            parents.append(par)
            if NS + "models/" + par + ".json" not in names:
                break
            stack.append(jjson("models/" + par + ".json"))
        tex: dict[str, str] = {}
        forced: set[str] = set()
        elements = None
        for m in reversed(stack):  # parent first, child overrides
            for k, v in m.get("textures", {}).items():
                if isinstance(v, dict):
                    if v.get("force_translucent"):
                        forced.add(k)
                    v = v.get("sprite", "")
                tex[k] = v
            if "elements" in m:
                elements = m["elements"]

        def resolve(t: str) -> str | None:
            for _ in range(10):
                if not t.startswith("#"):
                    break
                t = tex.get(t[1:], "")
            return rel_key(t) if t and not t.startswith("#") else None

        def is_forced(t: str) -> bool:
            for _ in range(10):
                if not t.startswith("#"):
                    return False
                if t[1:] in forced:
                    return True
                t = tex.get(t[1:], "")
            return False

        out_el = []
        for e in elements or []:
            faces = {}
            for d, f in e.get("faces", {}).items():
                tname = f.get("texture", "")
                face: dict = {"tex": resolve(tname)}
                if "uv" in f: face["uv"] = f["uv"]
                if f.get("rotation"): face["rot"] = f["rotation"]
                if "tintindex" in f: face["tint"] = f["tintindex"]
                if "cullface" in f: face["cull"] = f["cullface"]
                if is_forced(tname): face["translucent"] = True
                faces[d] = face
            el: dict = {"from": e["from"], "to": e["to"], "faces": faces}
            if "rotation" in e: el["rotation"] = e["rotation"]
            out_el.append(el)
        cross = key in ("block/cross", "block/tinted_cross") or any(
            p in ("block/cross", "block/tinted_cross", "block/flower_pot_cross") for p in parents)
        if not out_el:
            shape = "none"
        elif (len(out_el[0]["faces"]) == 6 and  # a full cube, maybe with full-box overlay layers (grass block sides)
              all(e["from"] == [0, 0, 0] and e["to"] == [16, 16, 16] and "rotation" not in e for e in out_el)):
            shape = "cube"
        elif cross:
            shape = "cross"
        else:
            shape = "model"
        res = {"shape": shape, "elements": out_el, "particle": resolve("#particle")}
        model_cache[key] = res
        return res

    # ---------- blocks (from blockstates; display names from en_us.json) ----------
    lang = jjson("lang/en_us.json")
    blocks: dict[str, dict] = {}
    used_models: set[str] = set()
    rank = {"opaque": 0, "cutout": 1, "translucent": 2}
    for n in sorted(names):
        if not (n.startswith(NS + "blockstates/") and n.endswith(".json")):
            continue
        bid = n[len(NS + "blockstates/"):-5]
        bs = json.loads(jar.read(n))
        states: dict[str, dict] = {}
        parts = None
        default = None
        if "variants" in bs:
            for sk, v in bs["variants"].items():
                v0 = v[0] if isinstance(v, list) else v
                st: dict = {"model": rel_key(v0["model"])}
                for k in ("x", "y"):
                    if v0.get(k): st[k] = v0[k]
                if v0.get("uvlock"): st["uvlock"] = True
                if isinstance(v, list) and len(v) > 1: st["randomVariants"] = len(v)
                states[sk] = st
            default = default_state(list(states))
        else:
            parts = []
            for p in bs.get("multipart", []):
                a = p["apply"][0] if isinstance(p["apply"], list) else p["apply"]
                part: dict = {"model": rel_key(a["model"])}
                if "when" in p: part["when"] = p["when"]
                for k in ("x", "y", "uvlock"):
                    if a.get(k): part[k] = a[k]
                parts.append(part)
        models_here = [s["model"] for s in states.values()] + [p["model"] for p in parts or []]
        for m in models_here:
            used_models.add(m)
            load_model(m)
        if bid in ("water", "lava"):
            shape = "fluid"
        elif parts is not None:
            shape = "multipart"
        else:
            dm = model_cache.get(states[default]["model"])
            shape = dm["shape"] if dm else "none"
        texs: set[str] = set()
        tinted = forced = False
        for m in models_here:
            mm = model_cache.get(m)
            if not mm:
                continue
            for e in mm["elements"]:
                for f in e["faces"].values():
                    if f["tex"]: texs.add(f["tex"])
                    tinted |= "tint" in f
                    forced |= bool(f.get("translucent"))
        if shape == "fluid":
            texs = {f"block/{bid}_still", f"block/{bid}_flow"}
            tinted = bid == "water"
        layer = "opaque"
        for t in texs:
            ti = textures.get(t)
            if ti and rank[ti["layer"]] > rank[layer]:
                layer = ti["layer"]
        if forced or bid == "water":
            layer = "translucent"
        tint = None
        if tinted:
            if bid in FIXED_TINT: tint = {"kind": "fixed", "color": FIXED_TINT[bid]}
            elif bid == "water": tint = {"kind": "water", "color": TINT["water"]}
            elif any(s in bid for s in SPECIAL_TINT): tint = {"kind": "special", "color": None}
            elif "leaves" in bid or bid in ("vine", "mangrove_roots"): tint = {"kind": "foliage", "color": TINT["foliage"]}
            elif bid == "leaf_litter": tint = {"kind": "dry_foliage", "color": TINT["dry_foliage"]}
            else: tint = {"kind": "grass", "color": TINT["grass"]}
        entry: dict = {"name": lang.get(f"block.minecraft.{bid}", bid), "shape": shape, "layer": layer, "tint": tint,
                       "defaultState": default, "states": states if parts is None else None, "multipart": parts,
                       "textures": sorted(texs)}
        missing = sorted(t for t in texs if t not in textures)
        if missing:
            entry["missingTextures"] = missing
        blocks[bid] = entry

    models = {k: model_cache[k] for k in sorted(used_models) if model_cache.get(k)}

    # ---------- items ----------
    def first_model(node):
        if isinstance(node, dict):
            t = node.get("type", "")
            if rel_key(t) == "model" and isinstance(node.get("model"), str):
                return node["model"], "model"
            if rel_key(t) == "special":
                return node.get("base"), "special"
            for v in node.values():
                r = first_model(v)
                if r[0]:
                    return r
        elif isinstance(node, list):
            for v in node:
                r = first_model(v)
                if r[0]:
                    return r
        return None, None

    items: dict[str, dict] = {}
    for n in sorted(names):
        if not (n.startswith(NS + "items/") and n.endswith(".json")):
            continue
        iid = n[len(NS + "items/"):-5]
        mref, kind = first_model(json.loads(jar.read(n)).get("model"))
        entry = {"name": lang.get(f"item.minecraft.{iid}", lang.get(f"block.minecraft.{iid}", iid)),
                 "kind": kind or "unknown"}
        if mref:
            key = rel_key(mref)
            entry["model"] = key
            if key.startswith("block/"):
                entry["blockModel"] = key
            else:
                layers: dict[str, str] = {}
                cur = key
                for _ in range(8):  # follow parents for layer0/layer1/layer2
                    if NS + "models/" + cur + ".json" not in names:
                        break
                    m = jjson("models/" + cur + ".json")
                    for L in ("layer0", "layer1", "layer2"):
                        v = m.get("textures", {}).get(L)
                        if isinstance(v, dict): v = v.get("sprite")
                        if v and L not in layers: layers[L] = rel_key(v)
                    if "parent" not in m:
                        break
                    cur = rel_key(m["parent"])
                entry["layers"] = [layers[k] for k in sorted(layers)]
        items[iid] = entry

    # ---------- entities / mobs (ids from en_us.json entity.minecraft.*) ----------
    ent_tex = sorted(k[len("entity/"):] for k in textures if k.startswith("entity/"))
    mobs: dict[str, dict] = {}
    for lk, lv in lang.items():
        m = re.fullmatch(r"entity\.minecraft\.([a-z0-9_]+)", lk)
        if not m:
            continue
        eid = m.group(1)
        pref = MOB_TEXTURE_ALIASES.get(eid)
        if pref:
            found = [t for t in ent_tex if any(t.startswith(p) for p in pref)]
        else:
            found = [t for t in ent_tex if t == eid or t.startswith(eid + "/")]
            # entity/<id>/ can hold other mobs (zombie/husk): keep files named after the mob, plus sub-folders (layers)
            named = [t for t in found if t.split("/")[-1].startswith(eid)]
            if named:
                found = named + [t for t in found if t not in named and t.count("/") >= 2]
        mobs[eid] = {"name": lv, "textures": ["entity/" + t for t in found]}

    particles = sorted(k[len("particle/"):] for k in textures if k.startswith("particle/"))
    sky = sorted(k for k in textures if k.startswith("environment/"))

    # ---------- sounds (opt-in; these are recordings, still list them to the user before use) ----------
    sounds = None
    if args.sounds:
        if not (args.assets_dir and args.index):
            print("--sounds needs --assets-dir and --index", file=sys.stderr)
            return 2
        idx = json.loads((args.assets_dir / "indexes" / f"{args.index}.json").read_text())["objects"]

        def obj(h: str) -> Path:
            return args.assets_dir / "objects" / h[:2] / h

        sj = json.loads(obj(idx["minecraft/sounds.json"]["hash"]).read_bytes())
        sounds = {}
        sroot = args.out / "sounds"
        for ev, spec in sj.items():
            files = []
            for s in spec.get("sounds", []):
                if isinstance(s, dict) and s.get("type") == "event":
                    continue
                nm = rel_key(s if isinstance(s, str) else s.get("name", ""))
                key = f"minecraft/sounds/{nm}.ogg"
                if key not in idx or not SAFE.match(nm) or ".." in nm:
                    continue
                dest = sroot / (nm + ".ogg")
                if not dest.exists():
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(obj(idx[key]["hash"]), dest)
                files.append(rel_out(dest))
            if files:
                sounds[ev] = files

    counts = {"blocks": len(blocks), "models": len(models), "items": len(items), "mobs": len(mobs),
              "textures": len(textures), "particles": len(particles),
              "sounds": len(sounds) if sounds is not None else None}
    manifest = {
        "kind": "MinecraftManifest", "schemaVersion": 1,
        "mcVersion": ver, "jar": {"path": str(args.jar), "sha256": sha256_of(args.jar)},
        "packs": packs, "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "tints": TINT, "counts": counts,
        "blocks": blocks, "models": models, "items": items, "mobs": mobs,
        "particles": particles, "sky": sky, "sounds": sounds, "textures": textures,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    write_catalog(args.out / "MANIFEST.md", manifest)
    shapes: dict[str, int] = {}
    for b in blocks.values():
        shapes[b["shape"]] = shapes.get(b["shape"], 0) + 1
    print(json.dumps({**counts, "blockShapes": shapes, "packs": [p["name"] for p in packs]}))
    return 0


def write_catalog(path: Path, m: dict) -> None:
    """a readable name list (what the director may use), grouped"""
    by_shape: dict[str, list[str]] = {}
    for bid, b in m["blocks"].items():
        by_shape.setdefault(b["shape"], []).append(bid)
    lines = [f"# Minecraft asset manifest ({m['mcVersion']})", "",
             f"Generated {m['generatedAt']} by tools/mc_extract.py. Packs: "
             + (", ".join(p["name"] for p in m["packs"]) or "none") + ".", "",
             "Counts: " + ", ".join(f"{k} {v}" for k, v in m["counts"].items() if v is not None), ""]
    for shape in ("cube", "cross", "fluid", "model", "multipart", "none"):
        ids = sorted(by_shape.get(shape, []))
        lines += [f"## Blocks, shape `{shape}` ({len(ids)})", "", ", ".join(ids), ""]
    mobs = sorted(k for k, v in m["mobs"].items() if v["textures"])
    lines += [f"## Mobs with textures ({len(mobs)})", "", ", ".join(mobs), ""]
    lines += [f"## Items ({len(m['items'])})", "", ", ".join(sorted(m["items"])), ""]
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
