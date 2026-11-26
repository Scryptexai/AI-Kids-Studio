"""Helper set-builder (Minecraft Java 1.20.1). pip install mcschematic
Contoh di projects/<slug>/sets/<set>/<set>.py:
    import sys; sys.path.insert(0, "<SKILL>/scripts")   # <SKILL> = folder skill minecraft-story
    from build_schem import *
    s = new()
    floor(s, 0, 0, 0, 12, 10, "minecraft:spruce_planks")
    hollow_box(s, 0, 1, 0, 12, 5, 10, "minecraft:stone_bricks")
    roof_gable(s, 0, 6, 0, 12, 10, "minecraft:dark_oak_stairs", "minecraft:dark_oak_planks")
    save(s, "projects/<slug>/sets/bakery", "bakery")
Koordinat: x kanan, y atas, z ke belakang. Ukuran (w,h,d) inklusif dari origin."""
import mcschematic

def new(): return mcschematic.MCSchematic()

def box(s, x, y, z, w, h, d, block):
    for i in range(w):
        for j in range(h):
            for k in range(d): s.setBlock((x+i, y+j, z+k), block)

def hollow_box(s, x, y, z, w, h, d, block, open_front=False):
    for i in range(w):
        for j in range(h):
            for k in range(d):
                edge = i in (0, w-1) or k in (0, d-1)
                if edge and not (open_front and k == 0): s.setBlock((x+i, y+j, z+k), block)

def floor(s, x, y, z, w, d, block): box(s, x, y, z, w, 1, d, block)
def pillar(s, x, y, z, h, block): box(s, x, y, z, 1, h, 1, block)

def line(s, x, y, z, length, axis, block):
    for n in range(length):
        s.setBlock((x+n, y, z) if axis == "x" else (x, y+n, z) if axis == "y" else (x, y, z+n), block)

def roof_gable(s, x, y, z, w, d, stair, fill):
    """Atap pelana sepanjang sumbu z, miring ke kiri/kanan."""
    for lvl in range((w + 1) // 2):
        l, r = x + lvl, x + w - 1 - lvl
        for k in range(d):
            if l == r: s.setBlock((l, y+lvl, z+k), fill); continue
            s.setBlock((l, y+lvl, z+k), f"{stair}[facing=east]")
            s.setBlock((r, y+lvl, z+k), f"{stair}[facing=west]")
            if k in (0, d-1):
                for i in range(l+1, r): s.setBlock((i, y+lvl, z+k), fill)

def save(s, folder, name):
    s.save(folder, name, mcschematic.Version.JE_1_20_1)
    print(f"Saved {folder}/{name}.schem (JE 1.20.1)")
