"""
Rich Low-Poly Stylized 3D Diorama Prop & Character Library for Knot Theory V3.
Built on the exact visual standard of Episode 2 (Manhole Cover) & Episode 3 (Water Tower):
  - Multi-layered cutaway earth slabs (grass / asphalt / striped curbstones / soil / bedrock)
  - Articulated blocky characters (walking, startled/ducking, pushing, fluttering scarf, crash dummy)
  - City houses, shops with awnings, trees, cars, trains, ships, office furniture, transformers, HV towers
  - Translucent glass/pipe cutaways, 3D checkmarks, 3D crosses, dimension arrows, sparks, smoke & fluid pulses
"""

from __future__ import annotations

import math
from typing import List, Sequence, Tuple

import numpy as np

from src.assets_ep02 import Episode2Assets, make_3d_double_arrow, make_ring_collar
from src.assets_ep03 import Episode3Assets, make_pitched_roof
from src.renderer3d import (
    FLAG_CAST_SHADOW,
    FLAG_DECAL,
    FLAG_DEFAULT,
    FLAG_DEPTH_BIAS,
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    FLAG_RECV_SHADOW,
    FLAG_UNLIT,
    Mesh,
    _make_mesh_from_tris,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp3(a: Tuple[float, float, float], b: Tuple[float, float, float], t: float) -> Tuple[float, float, float]:
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


class DioramaSignalProps:
    """Shared cached props reused across Shorts and Long Documentaries."""

    def __init__(self) -> None:
        self.ep2 = Episode2Assets()
        self.ep3 = Episode3Assets()
        self.red_cross = self.ep3.red_cross_3d
        self.green_check = self.ep3.green_check_3d

    def tree(self, x: float, z: float, scale: float = 1.0, y: float = 0.0) -> Mesh:
        return self.ep2._build_tree(0.0, 0.0, scale=scale).transformed(pos=(x, y, z))

    def shop(self, x: float, z: float, wall_hex: str = "#E8DFD5", awning_hex: str = "#D97757", h: float = 3.4, rot_y: float = 0.0) -> Mesh:
        return self.ep2._build_shop(0.0, 0.0, wall_hex, awning_hex, h=h).transformed(pos=(x, 0.0, z), rot=(0.0, rot_y, 0.0))

    def house(self, x: float, z: float, w: float = 1.55, h: float = 1.40, d: float = 1.35, wall_hex: str = "#DCE8F2", roof_hex: str = "#D97757", power_on: float = 0.85, y: float = 0.0) -> Mesh:
        win_off = np.array(hex_rgb("#283244"), dtype=np.float32)
        win_on = np.array(hex_rgb("#FFE066"), dtype=np.float32)
        wc = tuple((win_off * (1.0 - power_on) + win_on * power_on).tolist())
        we = 3.0 * power_on
        parts = [
            make_beveled_box(w, h, d, hex_rgb(wall_hex), bevel=0.03, roughness=0.80).transformed(pos=(0.0, h * 0.5, 0.0)),
            make_pitched_roof(w + 0.18, 0.56, d + 0.15, hex_rgb(roof_hex)).transformed(pos=(0.0, h, 0.0)),
            make_beveled_box(0.28, 0.48, 0.05, hex_rgb("#7C4D34"), bevel=0.01).transformed(pos=(0.0, 0.24, d * 0.5 + 0.01)),
        ]
        for wx in (-w * 0.26, w * 0.26):
            parts.append(make_beveled_box(0.26, 0.28, 0.05, wc, bevel=0.01, emission=we, roughness=0.25).transformed(pos=(wx, h * 0.62, d * 0.5 + 0.01)))
        return Mesh.merge(parts).transformed(pos=(x, y, z))

    def traffic_cone(self, x: float, z: float, y: float = 0.0) -> Mesh:
        return Mesh.merge([
            make_beveled_box(0.30, 0.045, 0.30, hex_rgb("#262D3B"), bevel=0.01).transformed(pos=(x, y + 0.022, z)),
            make_cylinder(0.11, 0.03, 0.42, hex_rgb("#FF6B2B"), segments=10, roughness=0.45).transformed(pos=(x, y + 0.23, z)),
            make_cylinder(0.08, 0.062, 0.09, hex_rgb("#F8FAFC"), segments=10, roughness=0.35).transformed(pos=(x, y + 0.26, z)),
        ])

    def street_lamp(self, x: float, z: float, rot_y: float = 0.0, lit: float = 0.8, y: float = 0.0) -> Mesh:
        pts = [(0.0, 0.0, 0.0), (0.0, 2.35, 0.0), (0.45, 2.55, 0.0)]
        parts = [
            make_cylinder(0.12, 0.10, 0.14, hex_rgb("#475569"), segments=8).transformed(pos=(0.0, 0.07, 0.0)),
            make_tube_along_path(pts, 0.042, hex_rgb("#64748B"), sides=8, roughness=0.45),
            make_beveled_box(0.26, 0.09, 0.16, hex_rgb("#334155"), bevel=0.02).transformed(pos=(0.50, 2.54, 0.0)),
            make_icosphere(0.085, hex_rgb("#FEF08A"), subdivisions=1, emission=3.6 * lit).transformed(pos=(0.50, 2.47, 0.0)),
        ]
        return Mesh.merge(parts).transformed(pos=(x, y, z), rot=(0.0, rot_y, 0.0))

    def curb_strip(self, x: float, z0: float, z1: float, y: float = 0.0, count: int = 12) -> Mesh:
        parts = []
        ca, cb = hex_rgb("#E2E8F0"), hex_rgb("#475569")
        step = (z1 - z0) / max(1, count)
        for i in range(count):
            zc = z0 + (i + 0.5) * step
            parts.append(
                make_beveled_box(0.16, 0.20, abs(step) * 0.92, ca if i % 2 == 0 else cb, bevel=0.02).transformed(pos=(x, y + 0.09, zc))
            )
        return Mesh.merge(parts)

    def character(
        self,
        pos: Tuple[float, float, float],
        rot_y: float = 0.0,
        walk_phase: float = 0.0,
        walk_amp: float = 0.0,
        hard_hat: bool = False,
        duck_t: float = 0.0,
        dizzy_stars: bool = False,
        pushing_mode: bool = False,
        time_s: float = 0.0,
        shirt_hex: str = "#38A3A5",
        scarf_wind: float = 0.0,
        scarf_hex: str = "#00E5FF",
    ) -> Mesh:
        base = self.ep2.build_character_blocky(
            pos=(0.0, 0.0, 0.0),
            rot_y=0.0,
            walk_phase=walk_phase,
            walk_amp=walk_amp,
            pushing_mode=pushing_mode,
            hard_hat=hard_hat,
            duck_t=duck_t,
            dizzy_stars=dizzy_stars,
            time_s=time_s,
            shirt_hex=shirt_hex,
        )
        if scarf_wind <= 0.02:
            return base.transformed(pos=pos, rot=(0.0, rot_y, 0.0))
        # Animated fluttering scarf / hijab ribbon streaming in the wind!
        hy = 1.02 - 0.22 * duck_t
        pts = []
        for k in range(5):
            u = k / 4.0
            sx = u * 0.72 * scarf_wind
            sy = hy + 0.08 * u + 0.07 * scarf_wind * math.sin(time_s * 16.0 - u * 5.0)
            sz = 0.06 * math.cos(time_s * 13.0 - u * 4.0) * scarf_wind
            pts.append((sx, sy, sz))
        scarf = make_tube_along_path(pts, 0.055, hex_rgb(scarf_hex), sides=8, emission=1.2)
        return Mesh.merge([base, scarf]).transformed(pos=pos, rot=(0.0, rot_y, 0.0))

    def car_stylized(self, pos: Tuple[float, float, float], rot_y: float = 0.0, body_hex: str = "#EF4444", wheel_spin: float = 0.0, crumple: float = 0.0) -> Mesh:
        parts = []
        col = hex_rgb(body_hex)
        glass = hex_rgb("#93C5FD")
        tire = hex_rgb("#1E293B")
        rim = hex_rgb("#CBD5E1")
        L = 1.85 * (1.0 - 0.18 * crumple)
        parts.append(make_beveled_box(L, 0.42, 0.92, col, bevel=0.05, roughness=0.35).transformed(pos=(0.0, 0.36, 0.0)))
        parts.append(make_beveled_box(0.98, 0.36, 0.82, col, bevel=0.05, roughness=0.35).transformed(pos=(-0.10, 0.72, 0.0)))
        parts.append(make_beveled_box(1.02, 0.28, 0.84, glass, bevel=0.02, roughness=0.15).transformed(pos=(-0.10, 0.71, 0.0)))
        # Headlights & taillights
        for sz in (-0.30, 0.30):
            parts.append(make_icosphere(0.065, hex_rgb("#FEF08A"), subdivisions=0, emission=3.2).transformed(pos=(L * 0.5 + 0.02, 0.38, sz)))
            parts.append(make_icosphere(0.055, hex_rgb("#FF2A44"), subdivisions=0, emission=2.6).transformed(pos=(-L * 0.5 - 0.02, 0.38, sz)))
        for wx in (-0.54 * (1.0 - 0.15 * crumple), 0.54 * (1.0 - 0.22 * crumple)):
            for wz in (-0.46, 0.46):
                parts.append(make_cylinder(0.20, 0.20, 0.14, tire, segments=14).transformed(pos=(wx, 0.20, wz), rot=(math.pi * 0.5, 0.0, wheel_spin)))
                parts.append(make_cylinder(0.11, 0.11, 0.15, rim, segments=10).transformed(pos=(wx, 0.20, wz), rot=(math.pi * 0.5, 0.0, wheel_spin)))
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0))

    def mrt_train_car(self, pos: Tuple[float, float, float], rot_y: float = 0.0, length: float = 3.6) -> Mesh:
        silver = hex_rgb("#E2E8F0")
        stripe_b = hex_rgb("#0284C7")
        stripe_r = hex_rgb("#EF4444")
        win = hex_rgb("#1E293B")
        parts = [
            make_beveled_box(length, 1.38, 1.24, silver, bevel=0.10, roughness=0.30).transformed(pos=(0.0, 0.86, 0.0)),
            make_beveled_box(0.42, 1.16, 1.18, silver, bevel=0.12, roughness=0.28).transformed(pos=(length * 0.5 + 0.12, 0.78, 0.0)),
            make_beveled_box(length + 0.22, 0.12, 1.27, stripe_b, bevel=0.02).transformed(pos=(0.05, 0.62, 0.0)),
            make_beveled_box(length + 0.20, 0.06, 1.27, stripe_r, bevel=0.01).transformed(pos=(0.05, 0.52, 0.0)),
            # Front windshield + glowing headlights
            make_beveled_box(0.12, 0.46, 0.94, hex_rgb("#38BDF8"), bevel=0.02, emission=0.8).transformed(pos=(length * 0.5 + 0.29, 0.98, 0.0)),
            make_icosphere(0.08, hex_rgb("#FFFBEB"), subdivisions=1, emission=4.2).transformed(pos=(length * 0.5 + 0.32, 0.58, -0.38)),
            make_icosphere(0.08, hex_rgb("#FFFBEB"), subdivisions=1, emission=4.2).transformed(pos=(length * 0.5 + 0.32, 0.58, 0.38)),
        ]
        for wx in np.linspace(-length * 0.36, length * 0.34, 4):
            parts.append(make_beveled_box(0.54, 0.44, 1.28, win, bevel=0.02).transformed(pos=(float(wx), 1.02, 0.0)))
        for bx in (-length * 0.32, length * 0.32):
            parts.append(make_beveled_box(0.75, 0.22, 1.08, hex_rgb("#334155"), bevel=0.02).transformed(pos=(bx, 0.16, 0.0)))
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0))

    def cargo_ship(self, pos: Tuple[float, float, float], rot_y: float = 0.0, scale: float = 1.0) -> Mesh:
        hull = hex_rgb("#B91C1C")
        deck = hex_rgb("#334155")
        bridge = hex_rgb("#F8FAFC")
        parts = [
            make_beveled_box(3.4, 0.52, 1.05, hull, bevel=0.08).transformed(pos=(0.0, 0.22, 0.0)),
            make_beveled_box(3.2, 0.12, 1.00, deck, bevel=0.02).transformed(pos=(0.0, 0.50, 0.0)),
            make_beveled_box(0.58, 0.72, 0.86, bridge, bevel=0.03).transformed(pos=(-1.15, 0.90, 0.0)),
            make_beveled_box(0.62, 0.14, 0.90, hex_rgb("#0EA5E9"), bevel=0.02, emission=0.9).transformed(pos=(-1.15, 1.15, 0.0)),
        ]
        cols = ["#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#06B6D4"]
        for i, cx in enumerate((-0.35, 0.35, 1.02)):
            for cy_i in range(2):
                parts.append(
                    make_beveled_box(0.60, 0.28, 0.78, hex_rgb(cols[(i + cy_i) % len(cols)]), bevel=0.02).transformed(
                        pos=(cx, 0.70 + cy_i * 0.29, 0.0)
                    )
                )
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0), scale=scale)

    def pulse_stream_along_path(
        self,
        waypoints_list: Sequence[Tuple[float, float, float]],
        count: int,
        speed: float,
        time_s: float,
        radius: float = 0.075,
        color_hex: str = "#00E5FF",
        emission: float = 3.8,
    ) -> Mesh:
        if len(waypoints_list) < 2 or count <= 0:
            return Mesh.empty()
        wp = np.array(waypoints_list, dtype=np.float32)
        segs = np.linalg.norm(wp[1:] - wp[:-1], axis=1)
        cum = np.concatenate([[0.0], np.cumsum(segs)])
        tot = float(cum[-1])
        if tot < 1e-4:
            return Mesh.empty()
        col = hex_rgb(color_hex)
        parts = []
        for k in range(count):
            d_cur = ((time_s * speed) + k * (tot / count)) % tot
            idx = max(0, min(len(segs) - 1, int(np.searchsorted(cum, d_cur, side="right")) - 1))
            frac = (d_cur - float(cum[idx])) / max(1e-5, float(segs[idx]))
            p = wp[idx] * (1.0 - frac) + wp[idx + 1] * frac
            parts.append(make_icosphere(radius, col, subdivisions=1, emission=emission).transformed(pos=(float(p[0]), float(p[1]), float(p[2]))))
        return Mesh.merge(parts)

    def layered_cutaway_earth(
        self,
        width: float = 9.6,
        depth: float = 7.6,
        soil_h: float = 2.4,
        front_alpha: float = 1.0,
        surface_hex: str = "#5E9A6E",
    ) -> Tuple[Mesh, Mesh]:
        """Returns (static_back_earth, dynamic_front_cutaway_earth)."""
        soil = hex_rgb("#7A5240")
        rock = hex_rgb("#525B6B")
        surf = hex_rgb(surface_hex)
        back = Mesh.merge([
            make_flat_quad_xz(-width * 0.5, -depth * 0.5, width * 0.5, -0.45, 0.0, surf, flags=FLAG_GROUND, subdiv=2),
            make_beveled_box(width, soil_h, depth * 0.5 - 0.45, soil, bevel=0.03, roughness=0.92).transformed(pos=(0.0, -soil_h * 0.5, -(depth * 0.25 + 0.22))),
            make_beveled_box(width, 0.45, depth, rock, bevel=0.02, roughness=0.90).transformed(pos=(0.0, -soil_h - 0.22, 0.0)),
        ])
        if front_alpha <= 0.05:
            return back, Mesh.empty()
        f_flags = FLAG_GROUND if front_alpha >= 0.99 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)
        front = Mesh.merge([
            make_flat_quad_xz(-width * 0.5, -0.45, width * 0.5, depth * 0.5, 0.0, surf, alpha=front_alpha, flags=f_flags, subdiv=2),
            make_beveled_box(width, soil_h, depth * 0.5 + 0.45, hex_rgb("#875D49"), bevel=0.02, alpha=front_alpha, roughness=0.90).transformed(
                pos=(0.0, -soil_h * 0.5, depth * 0.25 - 0.22)
            ),
        ])
        return back, front
