import math
from typing import List, Tuple

import numpy as np

from src.assets_ep02 import make_3d_double_arrow, make_ring_collar
from src.renderer3d import (
    FLAG_CAST_SHADOW,
    FLAG_DECAL,
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    FLAG_RECV_SHADOW,
    Mesh,
    _make_mesh_from_tris,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


def make_pitched_roof(w: float, h: float, d: float, color: Tuple[float, float, float]) -> Mesh:
    hx, hz = w * 0.5, d * 0.5
    p_bl_f, p_br_f, p_top_f = (-hx, 0.0, hz), (hx, 0.0, hz), (0.0, h, hz)
    p_bl_b, p_br_b, p_top_b = (-hx, 0.0, -hz), (hx, 0.0, -hz), (0.0, h, -hz)
    tris = [
        (p_bl_f, p_br_f, p_top_f), (p_br_b, p_bl_b, p_top_b),
        (p_bl_b, p_bl_f, p_top_f), (p_bl_b, p_top_f, p_top_b),
        (p_br_f, p_br_b, p_top_b), (p_br_f, p_top_b, p_top_f),
        (p_bl_b, p_br_b, p_br_f), (p_bl_b, p_br_f, p_bl_f),
    ]
    return _make_mesh_from_tris(tris, color, roughness=0.72, outward_center=(0.0, h * 0.3, 0.0))


class Episode3Assets:
    """Stylized Low-Poly 3D Assets for Episode 3 ('Bagaimana Menara Air Mengalirkan Air Tanpa Listrik?')."""

    TOWER_X = -1.75
    TOWER_Z = 0.00
    HOUSE_X = 1.55
    HOUSE_Z = 0.00
    PIPE_Z = 0.22

    def __init__(self):
        self.diorama_base = self._build_diorama_base()
        self.water_tower_structure = self._build_water_tower_structure()
        self.water_tower_glass = self._build_water_tower_glass()
        self.hero_house_cutaway = self._build_hero_house_cutaway()
        self.red_cross_3d = self._build_3d_cross()
        self.green_check_3d = self._build_3d_checkmark()

    def _build_tree(self, x: float, z: float, scale: float = 1.0) -> Mesh:
        return Mesh.merge([
            make_cylinder(0.08 * scale, 0.06 * scale, 0.55 * scale, hex_rgb("#6E4C36"), segments=8).transformed(pos=(x, 0.275 * scale, z)),
            make_icosphere(0.42 * scale, hex_rgb("#4C8E6B"), subdivisions=1, roughness=0.78).transformed(pos=(x, 0.78 * scale, z)),
            make_icosphere(0.30 * scale, hex_rgb("#5CA37D"), subdivisions=1, roughness=0.78).transformed(pos=(x + 0.16 * scale, 0.98 * scale, z + 0.06 * scale)),
        ])

    def _build_diorama_base(self) -> Mesh:
        parts = []
        grass = hex_rgb("#5E9A6E")
        road = hex_rgb("#3C4454")
        soil = hex_rgb("#785240")
        sub_rock = hex_rgb("#5B6373")

        parts.append(make_flat_quad_xz(-5.4, -5.8, 5.4, -0.35, 0.0, grass, flags=FLAG_GROUND, subdiv=3))
        parts.append(make_flat_quad_xz(-5.4, -0.35, -3.2, 1.15, 0.0, grass, flags=FLAG_GROUND, subdiv=2))
        parts.append(make_flat_quad_xz(3.2, -0.35, 5.4, 1.15, 0.0, grass, flags=FLAG_GROUND, subdiv=2))

        parts.append(make_flat_quad_xz(-5.4, 1.15, -3.2, 2.25, 0.004, road, flags=FLAG_GROUND, subdiv=2))
        parts.append(make_flat_quad_xz(3.2, 1.15, 5.4, 2.25, 0.004, road, flags=FLAG_GROUND, subdiv=2))
        for dx in (-4.2, 4.2):
            parts.append(make_flat_quad_xz(dx - 0.38, 1.66, dx + 0.38, 1.76, 0.008, hex_rgb("#FBBF24"), flags=FLAG_DECAL))

        parts.append(make_beveled_box(10.8, 1.05, 5.85, soil, bevel=0.03, roughness=0.92).transformed(pos=(0.0, -0.54, -2.875)))
        parts.append(make_beveled_box(10.8, 0.36, 5.85, sub_rock, bevel=0.02, roughness=0.90).transformed(pos=(0.0, -1.24, -2.875)))
        for fx in (-4.3, 4.3):
            parts.append(make_beveled_box(2.2, 1.05, 2.20, soil, bevel=0.03, roughness=0.92).transformed(pos=(fx, -0.54, 1.15)))
            parts.append(make_beveled_box(2.2, 0.36, 2.20, sub_rock, bevel=0.02, roughness=0.90).transformed(pos=(fx, -1.24, 1.15)))

        for tx, tz, sc in ((-3.55, 0.45, 0.95), (-0.45, -1.35, 0.88), (3.35, 0.35, 0.95), (3.85, -1.8, 1.05)):
            parts.append(self._build_tree(tx, tz, scale=sc))

        return Mesh.merge(parts)

    def build_front_ground_cutaway(self, cutaway_alpha: float = 1.0) -> Mesh:
        parts = []
        grass = hex_rgb("#5E9A6E")
        soil_front = hex_rgb("#875D49")
        sub_rock = hex_rgb("#5B6373")
        flags = FLAG_GROUND if cutaway_alpha >= 0.99 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)

        if cutaway_alpha > 0.05:
            road = hex_rgb("#3C4454")
            parts.append(make_flat_quad_xz(-3.2, -0.35, 3.2, 1.15, 0.0, grass, alpha=cutaway_alpha, flags=flags, subdiv=2))
            parts.append(make_flat_quad_xz(-3.2, 1.15, 3.2, 2.25, 0.004, road, alpha=cutaway_alpha, flags=flags, subdiv=2))
            for dx in (-2.0, 0.0, 2.0):
                parts.append(make_flat_quad_xz(dx - 0.38, 1.66, dx + 0.38, 1.76, 0.008, hex_rgb("#FBBF24"), alpha=cutaway_alpha, flags=FLAG_DECAL))
            parts.append(make_beveled_box(6.4, 1.05, 1.85, soil_front, bevel=0.02, alpha=cutaway_alpha, roughness=0.90).transformed(pos=(0.0, -0.54, 1.32)))
            parts.append(make_beveled_box(6.4, 0.36, 1.85, sub_rock, bevel=0.02, alpha=cutaway_alpha, roughness=0.90).transformed(pos=(0.0, -1.24, 1.32)))
        return Mesh.merge(parts)

    def build_mini_city_houses(self, power_on: float = 1.0) -> Mesh:
        parts = []
        win_off = np.array(hex_rgb("#283244"), dtype=np.float32)
        win_on = np.array(hex_rgb("#FFE066"), dtype=np.float32)
        win_col = tuple((win_off * (1.0 - power_on) + win_on * power_on).tolist())
        win_emit = 3.2 * power_on

        specs = [
            (-3.45, -2.55, 1.45, 1.25, 1.35, "#D8E2DC", "#C86D51"),
            (-1.55, -3.10, 1.55, 1.55, 1.35, "#E8DFD5", "#5C7AEA"),
            (0.25, -2.65, 1.50, 1.30, 1.35, "#DCE8F2", "#D97757"),
            (2.25, -2.95, 1.65, 1.65, 1.40, "#EAE2B7", "#4F86C6"),
            (3.85, -2.45, 1.40, 1.20, 1.30, "#E2ECE9", "#BC6C25"),
        ]
        for hx, hz, w, h, d, wall_hex, roof_hex in specs:
            parts.append(make_beveled_box(w, h, d, hex_rgb(wall_hex), bevel=0.03, roughness=0.80).transformed(pos=(hx, h * 0.5, hz)))
            parts.append(make_pitched_roof(w + 0.16, 0.58, d + 0.14, hex_rgb(roof_hex)).transformed(pos=(hx, h, hz)))
            for wx_off in (-w * 0.24, w * 0.24):
                parts.append(
                    make_beveled_box(0.28, 0.30, 0.05, win_col, bevel=0.01, emission=win_emit, roughness=0.25).transformed(
                        pos=(hx + wx_off, h * 0.56, hz + d * 0.5 + 0.01)
                    )
                )

        cx, cz = self.HOUSE_X, self.HOUSE_Z
        for fy in (1.12, 2.34):
            parts.append(make_icosphere(0.075, win_col, subdivisions=1, emission=win_emit * 1.1).transformed(pos=(cx + 0.35, fy, cz)))
        parts.append(make_beveled_box(0.05, 0.38, 0.42, win_col, bevel=0.01, emission=win_emit).transformed(pos=(cx + 0.93, 1.92, cz - 0.05)))
        return Mesh.merge(parts)

    def _build_water_tower_structure(self) -> Mesh:
        parts = []
        tx, tz = self.TOWER_X, self.TOWER_Z
        steel_col = hex_rgb("#6D7A8E")
        steel_dark = hex_rgb("#485366")
        roof_col = hex_rgb("#3B7A9E")
        concrete = hex_rgb("#8C96A6")

        parts.append(make_beveled_box(1.95, 0.12, 1.95, concrete, bevel=0.02, roughness=0.85).transformed(pos=(tx, 0.06, tz)))
        for sx in (-1.0, 1.0):
            for sz in (-1.0, 1.0):
                parts.append(make_tube_along_path([(tx + sx * 0.72, 0.08, tz + sz * 0.72), (tx + sx * 0.52, 3.06, tz + sz * 0.52)], 0.065, steel_col, sides=8, roughness=0.48))

        for by, br in ((1.10, 0.65), (2.10, 0.58)):
            c_pts = [(tx - br, by, tz - br), (tx + br, by, tz - br), (tx + br, by, tz + br), (tx - br, by, tz + br)]
            parts.append(make_tube_along_path(c_pts, 0.038, steel_dark, closed=True, sides=6, roughness=0.5))

        parts.append(make_cylinder(1.06, 1.02, 0.12, steel_dark, segments=24, roughness=0.48).transformed(pos=(tx, 3.05, tz)))
        parts.append(make_ring_collar(0.88, 0.95, 4.52, 4.60, steel_dark, segments=24, roughness=0.45).transformed(pos=(tx, 0.0, tz)))
        parts.append(make_cylinder(1.04, 0.06, 0.54, roof_col, segments=24, roughness=0.52).transformed(pos=(tx, 4.85, tz)))
        parts.append(make_icosphere(0.075, hex_rgb("#EF4444"), subdivisions=1, emission=1.4).transformed(pos=(tx, 5.16, tz)))

        parts.append(make_beveled_box(0.56, 0.46, 0.56, hex_rgb("#CBD5E1"), bevel=0.02, roughness=0.75).transformed(pos=(tx - 0.92, 0.23, tz + 0.18)))
        parts.append(make_beveled_box(0.62, 0.08, 0.62, roof_col, bevel=0.015, roughness=0.6).transformed(pos=(tx - 0.92, 0.49, tz + 0.18)))
        return Mesh.merge(parts)

    def _build_water_tower_glass(self) -> Mesh:
        return make_cylinder(
            0.91, 0.91, 1.44, hex_rgb("#BAE6FD"), segments=24, alpha=0.24, roughness=0.15, flags=FLAG_DOUBLE_SIDED
        ).transformed(pos=(self.TOWER_X, 3.82, self.TOWER_Z))

    def build_tank_water(self, fill_frac: float, time_s: float = 0.0) -> Mesh:
        f = max(0.03, min(1.0, fill_frac))
        tx, tz = self.TOWER_X, self.TOWER_Z
        h = 1.36 * f
        y_bot = 3.12
        return Mesh.merge([
            make_cylinder(0.85, 0.85, h, hex_rgb("#0EA5E9"), segments=24, emission=0.75, roughness=0.15, flags=FLAG_CAST_SHADOW | FLAG_RECV_SHADOW).transformed(pos=(tx, y_bot + h * 0.5, tz)),
            make_cylinder(0.855, 0.855, 0.045, hex_rgb("#38BDF8"), segments=24, emission=1.75, roughness=0.10).transformed(pos=(tx, y_bot + h, tz)),
        ])

    def _build_hero_house_cutaway(self) -> Mesh:
        parts = []
        cx, cz = self.HOUSE_X, self.HOUSE_Z
        w, d = 1.90, 1.35
        slab_col = hex_rgb("#647084")
        parts.append(make_beveled_box(w + 0.08, 0.14, d + 0.08, slab_col, bevel=0.02).transformed(pos=(cx, 0.06, cz)))
        parts.append(make_beveled_box(w, 0.10, d, slab_col, bevel=0.015).transformed(pos=(cx, 1.33, cz)))
        parts.append(make_beveled_box(w + 0.06, 0.09, d + 0.06, slab_col, bevel=0.015).transformed(pos=(cx, 2.56, cz)))
        parts.append(make_pitched_roof(w + 0.24, 0.68, d + 0.20, hex_rgb("#D96B43")).transformed(pos=(cx, 2.60, cz)))

        parts.append(make_beveled_box(w, 1.18, 0.10, hex_rgb("#F6EFE8"), bevel=0.015).transformed(pos=(cx, 0.71, cz - d * 0.5 + 0.05)))
        parts.append(make_beveled_box(w, 1.16, 0.10, hex_rgb("#DCEBF7"), bevel=0.015).transformed(pos=(cx, 1.96, cz - d * 0.5 + 0.05)))
        for sx in (-1.0, 1.0):
            parts.append(make_beveled_box(0.11, 2.48, d, hex_rgb("#E8DFD5"), bevel=0.015).transformed(pos=(cx + sx * (w * 0.5 - 0.05), 1.32, cz)))

        for floor_y in (0.12, 1.38):
            sx_sink, sz_sink = cx - 0.18, cz + 0.12
            parts.append(make_beveled_box(0.56, 0.42, 0.42, hex_rgb("#A98467"), bevel=0.02, roughness=0.75).transformed(pos=(sx_sink, floor_y + 0.21, sz_sink)))
            parts.append(make_beveled_box(0.62, 0.10, 0.46, hex_rgb("#F8FAFC"), bevel=0.02, roughness=0.25).transformed(pos=(sx_sink, floor_y + 0.46, sz_sink)))
            f_pts = [(sx_sink - 0.18, floor_y + 0.51, sz_sink), (sx_sink - 0.18, floor_y + 0.74, sz_sink), (sx_sink - 0.06, floor_y + 0.78, sz_sink), (sx_sink + 0.02, floor_y + 0.69, sz_sink)]
            parts.append(make_tube_along_path(f_pts, 0.026, hex_rgb("#94A3B8"), sides=8, roughness=0.25))
        return Mesh.merge(parts)

    def build_faucet_streams(self, floor1_flow: float = 1.0, floor2_flow: float = 0.0, time_s: float = 0.0) -> Mesh:
        parts = []
        sx_sink, sz_sink = self.HOUSE_X - 0.18, self.HOUSE_Z + 0.12
        water_col = hex_rgb("#00E5FF")
        for floor_y, fl in ((0.12, floor1_flow), (1.38, floor2_flow)):
            if fl <= 0.04:
                continue
            r = (0.024 + 0.004 * math.sin(time_s * 18.0)) * fl
            parts.append(make_cylinder(r * 1.15, r * 0.85, 0.20, water_col, segments=10, emission=2.8, roughness=0.1, flags=FLAG_DOUBLE_SIDED).transformed(pos=(sx_sink + 0.02, floor_y + 0.60, sz_sink)))
            splash_r = (0.14 + 0.02 * math.sin(time_s * 14.0)) * fl
            parts.append(make_cylinder(splash_r, splash_r, 0.022, water_col, segments=14, emission=2.4, roughness=0.1).transformed(pos=(sx_sink + 0.02, floor_y + 0.52, sz_sink)))
        return Mesh.merge(parts)

    def build_pipes_and_pulses(
        self,
        inlet_highlight: float = 0.0,
        outlet_highlight: float = 0.0,
        pump_pulses: bool = False,
        gravity_pulses: bool = False,
        time_s: float = 0.0,
    ) -> Mesh:
        parts = []
        tx, hx, pz = self.TOWER_X, self.HOUSE_X, self.PIPE_Z
        base_grey = np.array(hex_rgb("#5E6A7D"), dtype=np.float32)
        green_hi = np.array(hex_rgb("#00FF88"), dtype=np.float32)
        blue_hi = np.array(hex_rgb("#00D4FF"), dtype=np.float32)

        in_col = tuple((base_grey * (1.0 - inlet_highlight) + green_hi * inlet_highlight).tolist())
        in_pts = [(tx - 0.92, 0.35, pz), (tx - 0.98, 0.35, pz), (tx - 0.98, 4.44, pz), (tx - 0.55, 4.44, pz)]
        parts.append(make_tube_along_path(in_pts, 0.052, in_col, sides=10, emission=2.6 * inlet_highlight, roughness=0.35))

        if pump_pulses:
            for k in range(5):
                u = ((time_s * 0.68) + k * 0.20) % 1.0
                parts.append(make_icosphere(0.078, hex_rgb("#6EE7B7"), subdivisions=1, emission=3.8).transformed(pos=(tx - 0.98, 0.45 + u * 3.95, pz)))

        out_col = tuple((base_grey * (1.0 - outlet_highlight) + blue_hi * outlet_highlight).tolist())
        out_emit = 2.6 * outlet_highlight
        main_pts = [(tx + 0.35, 3.05, pz), (tx + 0.35, -0.52, pz), (hx - 0.52, -0.52, pz), (hx - 0.52, 2.08, pz)]
        parts.append(make_tube_along_path(main_pts, 0.055, out_col, sides=10, emission=out_emit, roughness=0.35))
        parts.append(make_tube_along_path([(hx - 0.52, 0.62, pz), (hx - 0.35, 0.62, pz)], 0.038, out_col, sides=8, emission=out_emit))
        parts.append(make_tube_along_path([(hx - 0.52, 1.88, pz), (hx - 0.35, 1.88, pz)], 0.038, out_col, sides=8, emission=out_emit))
        parts.append(make_tube_along_path([(0.15, -0.52, pz), (0.15, 0.05, pz), (0.15, 0.05, -1.8)], 0.040, out_col, sides=8, emission=out_emit))

        if gravity_pulses:
            waypoints = np.array(main_pts, dtype=np.float32)
            segs = np.linalg.norm(waypoints[1:] - waypoints[:-1], axis=1)
            cum = np.concatenate([[0.0], np.cumsum(segs)])
            tot_len = float(cum[-1])
            for k in range(8):
                d_cur = (((time_s * 3.4) + k * (tot_len / 8.0)) % tot_len)
                idx = max(0, min(len(segs) - 1, int(np.searchsorted(cum, d_cur, side="right")) - 1))
                frac = (d_cur - float(cum[idx])) / max(1e-5, float(segs[idx]))
                p_cur = waypoints[idx] * (1.0 - frac) + waypoints[idx + 1] * frac
                parts.append(make_icosphere(0.082, hex_rgb("#7DD3FC"), subdivisions=1, emission=4.0).transformed(pos=(float(p_cur[0]), float(p_cur[1]), float(p_cur[2]))))

        return Mesh.merge(parts)

    def build_electric_pump_overload(self, overload_amt: float, time_s: float) -> Mesh:
        parts = []
        jx = 0.035 * overload_amt * math.sin(time_s * 58.0)
        jy = 0.025 * overload_amt * math.cos(time_s * 67.0)
        px, py, pz = -0.10 + jx, 0.0 + jy, 0.65

        body_base = np.array(hex_rgb("#3B82F6"), dtype=np.float32)
        body_hot = np.array(hex_rgb("#FF2A44"), dtype=np.float32)
        p_col = tuple((body_base * (1.0 - overload_amt) + body_hot * overload_amt).tolist())
        p_emit = 2.5 * overload_amt

        parts.append(make_beveled_box(0.95, 0.08, 0.68, hex_rgb("#64748B"), bevel=0.015).transformed(pos=(-0.10, 0.04, 0.65)))
        parts.append(make_cylinder(0.22, 0.22, 0.48, p_col, segments=14, emission=p_emit, roughness=0.4).transformed(pos=(px - 0.12, py + 0.30, pz), rot=(0.0, 0.0, math.pi * 0.5)))
        parts.append(make_cylinder(0.26, 0.26, 0.22, hex_rgb("#475569"), segments=14, emission=p_emit * 0.6).transformed(pos=(px + 0.20, py + 0.30, pz), rot=(0.0, 0.0, math.pi * 0.5)))
        parts.append(make_cylinder(0.09, 0.09, 0.05, hex_rgb("#F8FAFC"), segments=12, emission=1.2).transformed(pos=(px + 0.20, py + 0.64, pz), rot=(math.pi * 0.5, 0.0, 0.0)))

        if overload_amt > 0.25:
            smoke_dark, smoke_mid = hex_rgb("#2B303A"), hex_rgb("#454C59")
            for i in range(7):
                u = ((time_s * 0.85) + i * (1.0 / 7.0)) % 1.0
                sr = (0.09 + 0.16 * u) * math.sin(math.pi * min(1.0, u * 1.15))
                if sr > 0.02:
                    parts.append(
                        make_icosphere(sr, smoke_dark if (i % 2 == 0) else smoke_mid, subdivisions=1, roughness=0.95).transformed(
                            pos=(-0.10 + 0.18 * math.sin(u * 5.0 + i * 1.7), 0.65 + u * 1.35, 0.65 + 0.12 * math.cos(u * 4.2 + i))
                        )
                    )
        return Mesh.merge(parts)

    def _build_3d_cross(self) -> Mesh:
        return Mesh.merge([
            make_beveled_box(0.62, 0.13, 0.10, hex_rgb("#FF2A44"), bevel=0.02, emission=3.4).transformed(rot=(0.0, 0.0, math.pi * 0.25)),
            make_beveled_box(0.62, 0.13, 0.10, hex_rgb("#FF2A44"), bevel=0.02, emission=3.4).transformed(rot=(0.0, 0.0, -math.pi * 0.25)),
        ])

    def _build_3d_checkmark(self) -> Mesh:
        return Mesh.merge([
            make_beveled_box(0.32, 0.13, 0.10, hex_rgb("#00F59B"), bevel=0.02, emission=3.4).transformed(pos=(-0.12, -0.06, 0.0), rot=(0.0, 0.0, -math.pi * 0.25)),
            make_beveled_box(0.58, 0.13, 0.10, hex_rgb("#00F59B"), bevel=0.02, emission=3.4).transformed(pos=(0.14, 0.08, 0.0), rot=(0.0, 0.0, math.pi * 0.25)),
        ])
