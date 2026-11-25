import math
from typing import List, Tuple

import numpy as np

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


def make_annulus_or_hole_plate(
    outer_half: float,
    hole_radius: float,
    y: float,
    color: Tuple[float, float, float],
    segments: int = 32,
    alpha: float = 1.0,
    flags: int = FLAG_GROUND,
) -> Mesh:
    """Square plate [-outer_half, +outer_half]^2 in XZ with a watertight circular hole (segments divisible by 8!)."""
    n = max(16, (segments // 8) * 8)
    tris = []
    for i in range(n):
        a0 = 2.0 * math.pi * i / n
        a1 = 2.0 * math.pi * (i + 1) / n
        c0, s0 = math.cos(a0), math.sin(a0)
        c1, s1 = math.cos(a1), math.sin(a1)
        p_in0 = (hole_radius * c0, y, hole_radius * s0)
        p_in1 = (hole_radius * c1, y, hole_radius * s1)
        scale0 = outer_half / max(abs(c0), abs(s0), 1e-6)
        scale1 = outer_half / max(abs(c1), abs(s1), 1e-6)
        p_out0 = (scale0 * c0, y, scale0 * s0)
        p_out1 = (scale1 * c1, y, scale1 * s1)

        for ta, tb, tc in ((p_in0, p_out0, p_out1), (p_in0, p_out1, p_in1)):
            va, vb, vc = np.array(ta), np.array(tb), np.array(tc)
            if np.cross(vb - va, vc - va)[1] < 0:
                tris.append((ta, tc, tb))
            else:
                tris.append((ta, tb, tc))

    return _make_mesh_from_tris(tris, color, alpha=alpha, roughness=0.85, flags=flags, outward_center=None)


def make_ring_collar(
    r_inner: float,
    r_outer: float,
    y_bot: float,
    y_top: float,
    color: Tuple[float, float, float],
    segments: int = 28,
    emission: float = 0.0,
    roughness: float = 0.35,
) -> Mesh:
    """3D hollow cylindrical ring / manhole lip rim."""
    tris = []
    for i in range(segments):
        a0 = 2.0 * math.pi * i / segments
        a1 = 2.0 * math.pi * (i + 1) / segments
        c0, s0 = math.cos(a0), math.sin(a0)
        c1, s1 = math.cos(a1), math.sin(a1)

        ti0 = (r_inner * c0, y_top, r_inner * s0)
        ti1 = (r_inner * c1, y_top, r_inner * s1)
        to0 = (r_outer * c0, y_top, r_outer * s0)
        to1 = (r_outer * c1, y_top, r_outer * s1)

        bi0 = (r_inner * c0, y_bot, r_inner * s0)
        bi1 = (r_inner * c1, y_bot, r_inner * s1)
        bo0 = (r_outer * c0, y_bot, r_outer * s0)
        bo1 = (r_outer * c1, y_bot, r_outer * s1)

        for ta, tb, tc in ((ti0, to0, to1), (ti0, to1, ti1)):
            if np.cross(np.subtract(tb, ta), np.subtract(tc, ta))[1] < 0:
                tris.append((ta, tc, tb))
            else:
                tris.append((ta, tb, tc))
        for ta, tb, tc in ((bi0, ti0, ti1), (bi0, ti1, bi1)):
            mid = np.mean([ta, tb, tc], axis=0)
            inward = np.array([-mid[0], 0.0, -mid[2]])
            if np.dot(np.cross(np.subtract(tb, ta), np.subtract(tc, ta)), inward) < 0:
                tris.append((ta, tc, tb))
            else:
                tris.append((ta, tb, tc))
        for ta, tb, tc in ((bo0, to0, to1), (bo0, to1, bo1)):
            mid = np.mean([ta, tb, tc], axis=0)
            outward = np.array([mid[0], 0.0, mid[2]])
            if np.dot(np.cross(np.subtract(tb, ta), np.subtract(tc, ta)), outward) < 0:
                tris.append((ta, tc, tb))
            else:
                tris.append((ta, tb, tc))

    return _make_mesh_from_tris(
        tris, color, alpha=1.0, emission=emission, roughness=roughness, flags=FLAG_DEFAULT | FLAG_DOUBLE_SIDED, outward_center=None
    )


def make_3d_double_arrow(
    p0: Tuple[float, float, float],
    p1: Tuple[float, float, float],
    color: Tuple[float, float, float],
    shaft_r: float = 0.032,
    emission: float = 3.2,
) -> Mesh:
    """Glowing 3D technical dimension line with twin arrowheads at p0 and p1."""
    a = np.array(p0, dtype=np.float32)
    b = np.array(p1, dtype=np.float32)
    vec = b - a
    dist = float(np.linalg.norm(vec))
    if dist < 0.12:
        return Mesh.empty()
    d = vec / dist
    head_len = min(0.16, dist * 0.22)
    s0 = a + d * (head_len * 0.8)
    s1 = b - d * (head_len * 0.8)
    parts = [
        make_tube_along_path(
            np.array([s0, s1], dtype=np.float32),
            radius=shaft_r, color=color, sides=8, emission=emission, flags=FLAG_UNLIT | FLAG_DEPTH_BIAS,
        )
    ]
    for tip, base_pt in ((a, a + d * head_len), (b, b - d * head_len)):
        parts.append(
            make_tube_along_path(
                np.array([base_pt, tip], dtype=np.float32),
                radius=shaft_r * 2.1, color=color, sides=8, emission=emission, flags=FLAG_UNLIT | FLAG_DEPTH_BIAS,
            )
        )
    return Mesh.merge(parts)


class Episode2Assets:
    """Stylized Low-Poly 3D Assets for Episode 2 ('Kenapa Tutup Gorong-Gorong Selalu Bulat?')."""

    HOLE_X = 0.0
    HOLE_Z = 2.0

    def __init__(self):
        self.static_street = self._build_static_street()
        self.underground_chamber = self._build_underground_sewer_cutaway()
        self.round_cover_mesh = self._build_manhole_round()
        self.round_outline_ring = make_ring_collar(0.55, 0.63, 0.008, 0.025, hex_rgb("#FFE600"), segments=32, emission=3.2)
        self.square_cover_mesh = self._build_manhole_square()

    def _build_shop(self, x: float, z: float, wall_hex: str, awning_hex: str, h: float = 3.6) -> Mesh:
        parts = [
            make_beveled_box(2.8, h, 2.4, hex_rgb(wall_hex), bevel=0.04, roughness=0.80).transformed(pos=(x, h * 0.5, z)),
            make_beveled_box(2.95, 0.16, 2.55, hex_rgb("#4B5568"), bevel=0.03).transformed(pos=(x, h + 0.08, z)),
            make_beveled_box(2.3, 0.14, 0.72, hex_rgb(awning_hex), bevel=0.03).transformed(pos=(x, 1.55, z + 1.35)),
            make_beveled_box(1.5, 1.15, 0.08, hex_rgb("#5279A8"), bevel=0.02, roughness=0.25).transformed(pos=(x, 0.85, z + 1.21)),
        ]
        for wx in (-0.65, 0.65):
            parts.append(
                make_beveled_box(0.62, 0.68, 0.08, hex_rgb("#7FA6C9"), bevel=0.02, roughness=0.25).transformed(
                    pos=(x + wx, 2.55, z + 1.21)
                )
            )
        return Mesh.merge(parts)

    def _build_tree(self, x: float, z: float, scale: float = 1.0) -> Mesh:
        return Mesh.merge([
            make_cylinder(0.11 * scale, 0.08 * scale, 0.95 * scale, hex_rgb("#6E4C36"), segments=8).transformed(pos=(x, 0.475 * scale, z)),
            make_icosphere(0.62 * scale, hex_rgb("#4C8E6B"), subdivisions=1, roughness=0.78).transformed(pos=(x, 1.25 * scale, z)),
            make_icosphere(0.44 * scale, hex_rgb("#5CA37D"), subdivisions=1, roughness=0.78).transformed(pos=(x + 0.25 * scale, 1.52 * scale, z + 0.1 * scale)),
        ])

    def _build_static_street(self) -> Mesh:
        parts = []
        asphalt = hex_rgb("#3C4454")
        sidewalk = hex_rgb("#CBD5E1")
        curb_a = hex_rgb("#E2E8F0")
        curb_b = hex_rgb("#475569")

        # Leave X in [-1.65, 1.65], Z in [0.35, 8.2] open for hero hole + front cutaway!
        parts.append(make_flat_quad_xz(-2.8, -7.8, 2.8, 0.35, 0.0, asphalt, flags=FLAG_GROUND, subdiv=3))
        parts.append(make_flat_quad_xz(-2.8, 0.35, -1.65, 3.65, 0.0, asphalt, flags=FLAG_GROUND))
        parts.append(make_flat_quad_xz(1.65, 0.35, 2.8, 3.65, 0.0, asphalt, flags=FLAG_GROUND))

        for sx in (-4.8, 4.8):
            parts.append(make_beveled_box(3.8, 0.18, 16.0, sidewalk, bevel=0.03, roughness=0.82).transformed(pos=(sx, 0.09, 0.2)))

        for i in range(22):
            zc = -7.4 + i * 0.70
            cc = curb_a if (i % 2 == 0) else curb_b
            parts.append(make_beveled_box(0.18, 0.23, 0.65, cc, bevel=0.02, roughness=0.75).transformed(pos=(-2.82, 0.095, zc)))
            parts.append(make_beveled_box(0.18, 0.23, 0.65, cc, bevel=0.02, roughness=0.75).transformed(pos=(2.82, 0.095, zc)))

        white_m = hex_rgb("#E8EEF6")
        parts.append(make_flat_quad_xz(-2.52, -7.8, -2.40, 7.8, 0.005, white_m, flags=FLAG_DECAL))
        parts.append(make_flat_quad_xz(2.40, -7.8, 2.52, 7.8, 0.005, white_m, flags=FLAG_DECAL))
        for dz in (-6.5, -4.5, -2.5, -0.6):
            parts.append(make_flat_quad_xz(-0.07, dz - 0.45, 0.07, dz + 0.45, 0.005, hex_rgb("#FBBF24"), flags=FLAG_DECAL))

        parts.append(self._build_shop(-5.3, -5.2, "#E8DFD5", "#D97757", h=3.5))
        parts.append(self._build_shop(5.3, -5.2, "#CFE0EE", "#4F86C6", h=4.0))
        parts.append(self._build_tree(-4.3, -1.6, scale=1.05))
        parts.append(self._build_tree(4.3, -1.5, scale=1.08))

        for cx, cz in ((-1.85, 1.15), (1.85, 1.15)):
            parts.append(make_beveled_box(0.32, 0.05, 0.32, hex_rgb("#262D3B"), bevel=0.01).transformed(pos=(cx, 0.025, cz)))
            parts.append(make_cylinder(0.12, 0.03, 0.44, hex_rgb("#FF6B2B"), segments=10, roughness=0.45).transformed(pos=(cx, 0.25, cz)))
            parts.append(make_cylinder(0.085, 0.065, 0.10, hex_rgb("#F8FAFC"), segments=10, roughness=0.4).transformed(pos=(cx, 0.28, cz)))

        return Mesh.merge(parts)

    def _build_underground_sewer_cutaway(self) -> Mesh:
        parts = []
        cx, cz = self.HOLE_X, self.HOLE_Z
        concrete_wall = hex_rgb("#7A8496")
        concrete_dark = hex_rgb("#5B6475")
        soil_terracotta = hex_rgb("#7A5240")
        gravel_layer = hex_rgb("#646D7D")

        for sx_mid in (-1.81, 1.81):
            parts.append(make_beveled_box(1.98, 0.42, 2.6, gravel_layer, bevel=0.03, roughness=0.88).transformed(pos=(sx_mid, -0.28, cz)))
            parts.append(make_beveled_box(1.98, 2.25, 2.6, soil_terracotta, bevel=0.04, roughness=0.92).transformed(pos=(sx_mid, -1.62, cz)))

        parts.append(make_beveled_box(1.68, 2.68, 0.16, concrete_wall, bevel=0.02, roughness=0.82).transformed(pos=(cx, -1.40, cz - 0.76)))
        parts.append(make_beveled_box(0.16, 2.68, 1.56, concrete_dark, bevel=0.02, roughness=0.82).transformed(pos=(cx - 0.76, -1.40, cz)))
        parts.append(make_beveled_box(0.16, 2.68, 1.56, concrete_dark, bevel=0.02, roughness=0.82).transformed(pos=(cx + 0.76, -1.40, cz)))
        parts.append(make_beveled_box(1.68, 0.16, 1.68, concrete_dark, bevel=0.02, roughness=0.85).transformed(pos=(cx, -2.72, cz)))

        for px in (-1.80, 1.80):
            parts.append(
                make_cylinder(0.42, 0.42, 1.95, hex_rgb("#525B6B"), segments=14, roughness=0.75).transformed(
                    pos=(px, -2.25, cz - 0.10), rot=(0.0, 0.0, math.pi * 0.5)
                )
            )
        parts.append(
            make_beveled_box(5.4, 0.14, 0.58, hex_rgb("#22B8CF"), bevel=0.02, emission=0.45, roughness=0.18).transformed(
                pos=(cx, -2.60, cz - 0.10)
            )
        )
        for ry in np.linspace(-0.45, -2.35, 6):
            parts.append(
                make_beveled_box(0.44, 0.045, 0.08, hex_rgb("#F59E0B"), bevel=0.01, roughness=0.35).transformed(
                    pos=(cx - 0.36, float(ry), cz - 0.65)
                )
            )
        return Mesh.merge(parts)

    def build_surface_around_hole(self, shape: str = "round", front_cutaway_alpha: float = 1.0, rim_highlight: float = 0.0) -> Mesh:
        parts = []
        asphalt = hex_rgb("#3C4454")
        cx, cz = self.HOLE_X, self.HOLE_Z
        f_flags = FLAG_GROUND if front_cutaway_alpha >= 0.99 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)

        if front_cutaway_alpha > 0.04:
            parts.append(make_flat_quad_xz(-2.8, 3.65, 2.8, 8.2, 0.0, asphalt, alpha=front_cutaway_alpha, flags=f_flags, subdiv=3))
            for dz in (5.0, 7.0):
                parts.append(
                    make_flat_quad_xz(
                        -0.07, dz - 0.45, 0.07, dz + 0.45, 0.005,
                        hex_rgb("#FBBF24"), alpha=front_cutaway_alpha, flags=FLAG_DECAL,
                    )
                )

        if shape == "round":
            plate = make_annulus_or_hole_plate(
                outer_half=1.66, hole_radius=0.55, y=0.0, color=asphalt,
                segments=32, alpha=max(0.32, front_cutaway_alpha), flags=f_flags,
            ).transformed(pos=(cx, 0.0, cz))
            parts.append(plate)
            parts.append(make_ring_collar(0.52, 0.60, -0.05, 0.008, hex_rgb("#2B3240"), segments=28, roughness=0.45).transformed(pos=(cx, 0.0, cz)))

            rim_base = np.array(hex_rgb("#525C70"), dtype=np.float32)
            rim_yel = np.array(hex_rgb("#FFE600"), dtype=np.float32)
            r_col = tuple((rim_base * (1.0 - rim_highlight) + rim_yel * rim_highlight).tolist())
            parts.append(
                make_ring_collar(
                    0.465, 0.535, -0.095, -0.025, r_col, segments=28, emission=3.1 * rim_highlight, roughness=0.3
                ).transformed(pos=(cx, 0.0, cz))
            )
        else:
            r = 0.56
            a_use = max(0.32, front_cutaway_alpha)
            parts.append(make_flat_quad_xz(cx - 1.66, cz - 1.66, cx - r, cz + 1.66, 0.0, asphalt, alpha=a_use, flags=f_flags))
            parts.append(make_flat_quad_xz(cx + r, cz - 1.66, cx + 1.66, cz + 1.66, 0.0, asphalt, alpha=a_use, flags=f_flags))
            parts.append(make_flat_quad_xz(cx - r, cz - 1.66, cx + r, cz - r, 0.0, asphalt, alpha=a_use, flags=f_flags))
            parts.append(make_flat_quad_xz(cx - r, cz + r, cx + r, cz + 1.66, 0.0, asphalt, alpha=a_use, flags=f_flags))
            frame_pts = [(cx - r, 0.008, cz - r), (cx + r, 0.008, cz - r), (cx + r, 0.008, cz + r), (cx - r, 0.008, cz + r)]
            parts.append(make_tube_along_path(frame_pts, 0.038, hex_rgb("#2B3240"), sides=6, closed=True))

        return Mesh.merge(parts)

    def _build_manhole_round(self) -> Mesh:
        iron = hex_rgb("#5E687A")
        rib = hex_rgb("#7C879B")
        parts = [
            make_cylinder(0.535, 0.535, 0.070, iron, segments=32, roughness=0.45),
            make_ring_collar(0.46, 0.525, 0.032, 0.048, rib, segments=32, roughness=0.4),
            make_ring_collar(0.22, 0.27, 0.032, 0.048, rib, segments=24, roughness=0.4),
        ]
        for k in range(4):
            ang = k * (math.pi * 0.25)
            parts.append(
                make_beveled_box(0.96, 0.022, 0.042, rib, bevel=0.006, roughness=0.4).transformed(
                    pos=(0.0, 0.040, 0.0), rot=(0.0, ang, 0.0)
                )
            )
        for k in range(8):
            a = k * (math.pi * 0.25) + math.pi * 0.125
            parts.append(
                make_cylinder(0.024, 0.024, 0.022, hex_rgb("#94A3B8"), segments=8).transformed(
                    pos=(0.37 * math.cos(a), 0.042, 0.37 * math.sin(a))
                )
            )
        return Mesh.merge(parts)

    def _build_manhole_square(self) -> Mesh:
        iron = hex_rgb("#5E687A")
        rib = hex_rgb("#7C879B")
        parts = [make_beveled_box(1.10, 0.070, 1.10, iron, bevel=0.015, roughness=0.45)]
        for off in (-0.34, 0.0, 0.34):
            parts.append(make_beveled_box(1.02, 0.022, 0.042, rib, bevel=0.006).transformed(pos=(0.0, 0.042, off)))
            parts.append(make_beveled_box(0.042, 0.022, 1.02, rib, bevel=0.006).transformed(pos=(off, 0.042, 0.0)))
        return Mesh.merge(parts)

    def build_comparison_holograms(self, alpha: float, time_s: float) -> Mesh:
        if alpha <= 0.04:
            return Mesh.empty()
        bob = 0.06 * math.sin(time_s * 4.0)
        sq_pts = [(-1.35 - 0.38, 0.55 + bob, 2.0 - 0.38), (-1.35 + 0.38, 0.55 + bob, 2.0 - 0.38), (-1.35 + 0.38, 0.55 + bob, 2.0 + 0.38), (-1.35 - 0.38, 0.55 + bob, 2.0 + 0.38)]
        tri_pts = [(1.35, 0.55 - bob, 2.0 - 0.44), (1.35 + 0.42, 0.55 - bob, 2.0 + 0.34), (1.35 - 0.42, 0.55 - bob, 2.0 + 0.34)]
        return Mesh.merge([
            make_tube_along_path(sq_pts, 0.028, hex_rgb("#38BDF8"), sides=8, closed=True, alpha=alpha, emission=3.0),
            make_tube_along_path(tri_pts, 0.028, hex_rgb("#F472B6"), sides=8, closed=True, alpha=alpha, emission=3.0),
        ])

    def build_rim_sparks(self, dt: float, seed: int = 1) -> Mesh:
        rng = np.random.default_rng(seed)
        u = max(0.0, min(1.0, dt / 0.45))
        parts = []
        for i in range(8):
            ang = 2.0 * math.pi * i / 8.0 + float(rng.uniform(-0.2, 0.2))
            rad = 0.48 + u * 0.38
            sy = 0.04 + 0.26 * math.sin(math.pi * u)
            sr = 0.042 * (1.0 - 0.65 * u)
            parts.append(
                make_icosphere(sr, hex_rgb("#FFE600"), subdivisions=0, emission=4.2).transformed(
                    pos=(rad * math.cos(ang), sy, 2.0 + rad * math.sin(ang))
                )
            )
        return Mesh.merge(parts)

    def build_character_blocky(
        self,
        pos: Tuple[float, float, float],
        rot_y: float = 0.0,
        walk_phase: float = 0.0,
        walk_amp: float = 1.0,
        pushing_mode: bool = False,
        hard_hat: bool = False,
        duck_t: float = 0.0,
        dizzy_stars: bool = False,
        time_s: float = 0.0,
        shirt_hex: str = "#38A3A5",
    ) -> Mesh:
        parts = []
        pants = hex_rgb("#1E293B")
        skin = hex_rgb("#F1C29B")
        shirt = hex_rgb(shirt_hex)

        leg_sw = 0.48 * walk_amp * math.sin(walk_phase)
        crouch = 0.22 * duck_t

        parts.append(make_beveled_box(0.17, 0.50, 0.18, pants, bevel=0.025).transformed(pos=(-0.11, 0.25, 0.0), rot=(leg_sw, 0.0, 0.0)))
        parts.append(make_beveled_box(0.17, 0.50, 0.18, pants, bevel=0.025).transformed(pos=(0.11, 0.25, 0.0), rot=(-leg_sw, 0.0, 0.0)))

        torso_y = 0.74 - crouch
        parts.append(make_beveled_box(0.42, 0.48, 0.24, shirt, bevel=0.035).transformed(pos=(0.0, torso_y, 0.0)))
        if hard_hat:
            for sy in (torso_y - 0.08, torso_y + 0.07):
                parts.append(make_beveled_box(0.435, 0.055, 0.255, hex_rgb("#FDE047"), bevel=0.01, emission=1.1).transformed(pos=(0.0, sy, 0.0)))

        if pushing_mode:
            arm_rx = -1.05
            parts.append(make_beveled_box(0.14, 0.44, 0.14, shirt, bevel=0.025).transformed(pos=(-0.27, torso_y + 0.05, 0.18), rot=(arm_rx, 0.18, 0.0)))
            parts.append(make_beveled_box(0.14, 0.44, 0.14, shirt, bevel=0.025).transformed(pos=(0.27, torso_y + 0.05, 0.18), rot=(arm_rx, -0.18, 0.0)))
        elif duck_t > 0.1:
            parts.append(make_beveled_box(0.14, 0.42, 0.14, shirt, bevel=0.025).transformed(pos=(-0.29, torso_y + 0.14, 0.0), rot=(0.0, 0.0, 0.75)))
            parts.append(make_beveled_box(0.14, 0.42, 0.14, shirt, bevel=0.025).transformed(pos=(0.29, torso_y + 0.14, 0.0), rot=(0.0, 0.0, -0.75)))
        else:
            parts.append(make_beveled_box(0.14, 0.44, 0.14, shirt, bevel=0.025).transformed(pos=(-0.28, torso_y + 0.02, 0.0), rot=(-leg_sw * 0.8, 0.0, 0.0)))
            parts.append(make_beveled_box(0.14, 0.44, 0.14, shirt, bevel=0.025).transformed(pos=(0.28, torso_y + 0.02, 0.0), rot=(leg_sw * 0.8, 0.0, 0.0)))

        head_y = 1.16 - crouch * 1.25
        parts.append(make_beveled_box(0.34, 0.32, 0.32, skin, bevel=0.04).transformed(pos=(0.0, head_y, 0.0)))
        for ex in (-0.08, 0.08):
            parts.append(make_beveled_box(0.045, 0.045, 0.03, hex_rgb("#0F172A"), bevel=0.005).transformed(pos=(ex, head_y + 0.02, 0.16)))

        if hard_hat:
            parts.append(make_beveled_box(0.40, 0.16, 0.40, hex_rgb("#FACC15"), bevel=0.035, roughness=0.35).transformed(pos=(0.0, head_y + 0.18, 0.0)))
            parts.append(make_beveled_box(0.42, 0.04, 0.48, hex_rgb("#EAB308"), bevel=0.015, roughness=0.35).transformed(pos=(0.0, head_y + 0.11, 0.04)))
        else:
            parts.append(make_beveled_box(0.36, 0.11, 0.35, hex_rgb("#334155"), bevel=0.025).transformed(pos=(0.0, head_y + 0.16, -0.01)))

        if dizzy_stars:
            for k in range(3):
                sa = time_s * 6.5 + k * (2.0 * math.pi / 3.0)
                parts.append(
                    make_icosphere(0.055, hex_rgb("#FFE600"), subdivisions=0, emission=4.0).transformed(
                        pos=(0.28 * math.cos(sa), head_y + 0.36, 0.28 * math.sin(sa))
                    )
                )

        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0))
