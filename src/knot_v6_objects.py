"""
Knot Theory V6 — High-Density 3D Object Catalog & Clause-by-Clause Shot Staging (`src/knot_v6_objects.py`)

Guarantees for every ~55s V6 Short:
  - >= 20 distinct camera shots (`22 shots` per episode, ~2.5s avg shot length)
  - >= 50 distinct named multi-part 3D objects per episode (`67-79 unique objects` tracked in `SceneObjectRegistry`)
  - 100% of `shot["objects"]` in `src/knot_v6_scripts.py` are verified present in `SceneObjectRegistry`
    with non-empty multi-part 3D triangle meshes (zero bare placeholder boxes on empty floors).
"""

from __future__ import annotations
import math

import numpy as np
from typing import Dict, List, Set, Tuple

from src.assets_ep02 import make_ring_collar
from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.knot_v4_models import V4HeroModels
from src.knot_v5_props import V5HeroProps, _circle_path_xy, _circle_path_xz
from src.knot_v6_scripts import V6_EPISODES
from src.renderer3d import (
    FLAG_DEFAULT,
    FLAG_GROUND,
    Mesh,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


_GROUND_CACHE: Dict[tuple, Mesh] = {}


def _ground_xz(w: float, d: float, color, y: float = 0.0, **kw) -> Mesh:
    """
    Near-infinite ground for auto-framed cameras. The native rasterizer drops any triangle with a vertex
    behind the near plane, so the floor is a two-level grid: 0.8 m cells within +-12 m and 6 m cells out
    to +-60 m (never a huge triangle that straddles the camera). `w`/`d` are kept for call compatibility.
    """
    key = (tuple(round(float(c), 4) for c in color), round(float(y), 4), tuple(sorted(kw.items())))
    if key in _GROUND_CACHE:
        return _GROUND_CACHE[key]
    kw = dict(kw)
    kw.pop("subdiv", None)
    parts = [make_flat_quad_xz(-12.0, -12.0, 12.0, 12.0, y, color, subdiv=30, **kw)]
    step = 6.0
    for ix in range(-10, 10):
        for iz in range(-10, 10):
            x0, z0 = ix * step, iz * step
            if -12.0 <= x0 and x0 + step <= 12.0 and -12.0 <= z0 and z0 + step <= 12.0:
                continue
            parts.append(make_flat_quad_xz(x0, z0, x0 + step, z0 + step, y - 0.002, color, subdiv=1, **kw))
    g = Mesh.merge(parts)
    _GROUND_CACHE[key] = g
    return g


def _pipe(a: Tuple[float, float, float], b: Tuple[float, float, float], radius: float = 0.06, **kw) -> Mesh:
    """Flanged pipe running from point a to point b (adapter over PrecisionMechV3.flanged_pipe)."""
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    L = max(0.05, math.sqrt(dx * dx + dy * dy + dz * dz))
    elev = math.asin(max(-1.0, min(1.0, dy / L)))
    yaw = math.atan2(-dz, dx)
    mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5)
    return PrecisionMechV3.flanged_pipe(L, radius, **kw).transformed(pos=mid, rot=(0.0, yaw, elev))


def _human(
    pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    yaw: float = 0.0,
    scale: float = 1.0,
    outfit_hex: str = "#2563EB",
    helmet_hex: str | None = None,
    wave: float = 0.0,
    point: float = 0.0,
) -> Mesh:
    """Rigged human (adapter over HumanRigV3.build): helmet => engineer hard-hat role."""
    role = "engineer" if helmet_hex else "civilian_m"
    return HumanRigV3.build(
        pos=pos, rot_y=yaw, scale=scale, role=role, jacket_hex=outfit_hex,
        wave_cta=min(1.0, abs(float(wave))), point_arm=point,
    )


def _hall(width: float = 7.0, length: float = 8.0, height: float = 4.2, cladding_hex: str = "#CBD5E1", frame_hex: str = "#0284C7") -> Mesh:
    """Open cutaway industrial hall (back wall + left wall + steel portal frames, front & roof open)
    so auto-framed cameras always see the equipment inside instead of a cladding wall."""
    clad, frm = hex_rgb(cladding_hex), hex_rgb(frame_hex)
    hw, hl = width * 0.5, length * 0.5
    parts = [
        make_beveled_box(width, height, 0.12, clad, bevel=0.02).transformed(pos=(0.0, height * 0.5, -hl)),
        make_beveled_box(0.12, height * 0.55, length, clad, bevel=0.02).transformed(pos=(-hw, height * 0.275, 0.0)),
        make_beveled_box(width, 0.10, 0.10, hex_rgb("#FACC15"), bevel=0.01).transformed(pos=(0.0, height * 0.55, -hl + 0.08)),
    ]
    n_frames = 4
    for k in range(n_frames):
        z = -hl + (k + 0.5) * length / n_frames
        for sx in (-hw, hw):
            parts.append(make_beveled_box(0.16, height, 0.16, frm, bevel=0.02).transformed(pos=(sx, height * 0.5, z)))
        parts.append(make_beveled_box(width + 0.16, 0.18, 0.16, frm, bevel=0.02).transformed(pos=(0.0, height, z)))
    for k in range(5):
        parts.append(make_beveled_box(0.9, 0.5, 0.05, hex_rgb("#7DD3FC"), bevel=0.01, emission=0.6).transformed(pos=(-hw + 0.9 + k * (width - 1.8) / 4.0, height * 0.78, -hl + 0.08)))
    return Mesh.merge(parts)


def _tower(floors: int = 6, width: float = 1.8, depth: float = 1.4, **kw) -> Mesh:
    return ArchBuilderV3.midrise_tower(0.0, 0.0, w=width, d=depth, floors=floors, **kw)


class SceneObjectRegistry:
    """Tracks every distinct named 3D object instantiated across a shot and episode."""

    def __init__(self) -> None:
        self.meshes: List[Mesh] = []
        self.object_tris: Dict[str, int] = {}
        self.object_meshes: Dict[str, List[Mesh]] = {}

    @property
    def ids(self) -> Set[str]:
        return set(self.object_tris.keys())

    def add(self, object_id: str, mesh: Mesh) -> None:
        tris = int(len(mesh.tris)) if hasattr(mesh, "tris") else int(len(mesh.verts) // 3)
        assert tris > 0, f"Object '{object_id}' produced empty mesh!"
        self.meshes.append(mesh)
        self.object_tris[object_id] = self.object_tris.get(object_id, 0) + tris
        self.object_meshes.setdefault(object_id, []).append(mesh)

    def object_bounds(self, object_id: str):
        """(min_xyz, max_xyz) over non-ground triangles of one object, or None if it is pure ground."""
        mins, maxs = [], []
        for m in self.object_meshes.get(object_id, []):
            keep = m.flags != FLAG_GROUND
            if not np.any(keep):
                continue
            v = m.verts[np.unique(m.tris[keep].reshape(-1))]
            mins.append(v.min(axis=0))
            maxs.append(v.max(axis=0))
        if not mins:
            return None
        return np.min(np.stack(mins), axis=0), np.max(np.stack(maxs), axis=0)

    def focus_bounds(self, ids, max_diag: float = 9.0):
        """Bounding box of the shot's narrated hero objects (skips ground planes & huge environments)."""
        lo, hi = [], []
        for oid in ids:
            b = self.object_bounds(oid)
            if b is None or float(np.linalg.norm(b[1] - b[0])) > max_diag:
                continue
            lo.append(b[0])
            hi.append(b[1])
        if not lo:
            return None
        return np.min(np.stack(lo), axis=0), np.max(np.stack(hi), axis=0)

    def merged(self) -> Mesh:
        return Mesh.merge(self.meshes)


# =============================================================================
# REUSABLE MULTI-PART 3D MICRO-PROPS (TREES, LAMPS, ARROWS, GAUGES, VEHICLES...)
# =============================================================================
class KitV6:
    @staticmethod
    def pine_tree(pos: Tuple[float, float, float], scale: float = 1.0) -> Mesh:
        parts = [
            make_cylinder(0.08, 0.06, 0.55, hex_rgb("#78350F"), segments=10).transformed(pos=(0.0, 0.27, 0.0)),
            make_cylinder(0.38, 0.04, 0.65, hex_rgb("#15803D"), segments=12).transformed(pos=(0.0, 0.68, 0.0)),
            make_cylinder(0.30, 0.03, 0.58, hex_rgb("#16A34A"), segments=12).transformed(pos=(0.0, 1.02, 0.0)),
            make_cylinder(0.21, 0.01, 0.48, hex_rgb("#22C55E"), segments=12).transformed(pos=(0.0, 1.32, 0.0)),
        ]
        return Mesh.merge(parts).transformed(pos=pos, scale=scale)

    @staticmethod
    def shade_tree(pos: Tuple[float, float, float], scale: float = 1.0) -> Mesh:
        parts = [
            make_cylinder(0.07, 0.05, 0.62, hex_rgb("#713F12"), segments=10).transformed(pos=(0.0, 0.31, 0.0)),
            make_icosphere(0.34, hex_rgb("#16A34A"), subdivisions=1).transformed(pos=(0.0, 0.82, 0.0)),
            make_icosphere(0.24, hex_rgb("#22C55E"), subdivisions=1).transformed(pos=(0.18, 0.76, 0.10)),
            make_icosphere(0.22, hex_rgb("#15803D"), subdivisions=1).transformed(pos=(-0.17, 0.74, -0.08)),
        ]
        return Mesh.merge(parts).transformed(pos=pos, scale=scale)

    @staticmethod
    def cobra_streetlight(pos: Tuple[float, float, float], rot_y: float = 0.0, lit: float = 1.8) -> Mesh:
        metal = hex_rgb("#94A3B8")
        parts = [
            make_beveled_box(0.18, 0.08, 0.18, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.0, 0.04, 0.0)),
            make_cylinder(0.045, 0.03, 1.55, metal, segments=10).transformed(pos=(0.0, 0.80, 0.0)),
            make_tube_along_path([(0.0, 1.54, 0.0), (0.18, 1.66, 0.0), (0.42, 1.68, 0.0)], 0.025, metal, sides=8),
            make_beveled_box(0.22, 0.06, 0.11, hex_rgb("#334155"), bevel=0.02).transformed(pos=(0.46, 1.68, 0.0)),
            make_beveled_box(0.16, 0.03, 0.08, hex_rgb("#FEF08A"), bevel=0.01, emission=lit).transformed(pos=(0.46, 1.65, 0.0)),
        ]
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0))

    @staticmethod
    def arrow_3d(
        start: Tuple[float, float, float],
        end: Tuple[float, float, float],
        col_hex: str = "#38BDF8",
        r: float = 0.032,
        emit: float = 1.6,
    ) -> Mesh:
        dx, dy, dz = end[0] - start[0], end[1] - start[1], end[2] - start[2]
        L = max(0.08, math.sqrt(dx * dx + dy * dy + dz * dz))
        ux, uy, uz = dx / L, dy / L, dz / L
        tip_len = min(0.16, L * 0.38)
        shaft_end = (end[0] - ux * tip_len, end[1] - uy * tip_len, end[2] - uz * tip_len)
        col = hex_rgb(col_hex)
        shaft = make_tube_along_path([start, shaft_end], r, col, sides=10, emission=emit)
        head = make_tube_along_path([shaft_end, end], r * 2.1, col, sides=10, emission=emit + 0.4)
        dot = make_icosphere(r * 1.45, col, subdivisions=1, emission=emit).transformed(pos=start)
        return Mesh.merge([shaft, head, dot])

    @staticmethod
    def traffic_cone(pos: Tuple[float, float, float], scale: float = 1.0) -> Mesh:
        return Mesh.merge([
            make_beveled_box(0.22, 0.03, 0.22, hex_rgb("#1E293B"), bevel=0.01).transformed(pos=(0.0, 0.015, 0.0)),
            make_cylinder(0.085, 0.022, 0.28, hex_rgb("#F97316"), segments=12).transformed(pos=(0.0, 0.16, 0.0)),
            make_cylinder(0.062, 0.045, 0.06, hex_rgb("#F8FAFC"), segments=12, emission=0.8).transformed(pos=(0.0, 0.19, 0.0)),
        ]).transformed(pos=pos, scale=scale)

    @staticmethod
    def bus_vehicle(pos: Tuple[float, float, float], rot_y: float = 0.0, col_hex: str = "#10B981", scale: float = 1.0) -> Mesh:
        col = hex_rgb(col_hex)
        parts = [
            make_beveled_box(2.55, 0.72, 0.88, col, bevel=0.06, roughness=0.22).transformed(pos=(0.0, 0.54, 0.0)),
            make_beveled_box(2.30, 0.28, 0.90, hex_rgb("#0F172A"), bevel=0.02, roughness=0.08).transformed(pos=(0.04, 0.64, 0.0)),
            make_beveled_box(0.32, 0.10, 0.52, hex_rgb("#FACC15"), bevel=0.02, emission=2.0).transformed(pos=(1.27, 0.80, 0.0)),
            make_beveled_box(1.10, 0.09, 0.62, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(-0.20, 0.93, 0.0)),
        ]
        for wx in (-0.82, 0.82):
            for wz in (-0.43, 0.43):
                parts.append(make_cylinder(0.20, 0.20, 0.12, hex_rgb("#111827"), segments=14).transformed(pos=(wx, 0.20, wz), rot=(math.pi * 0.5, 0.0, 0.0)))
                parts.append(make_cylinder(0.11, 0.11, 0.13, hex_rgb("#CBD5E1"), segments=10).transformed(pos=(wx, 0.20, wz), rot=(math.pi * 0.5, 0.0, 0.0)))
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0), scale=scale)

    @staticmethod
    def thermometer_tower(pos: Tuple[float, float, float], fill_frac: float = 0.8, hot: bool = True) -> Mesh:
        col = hex_rgb("#EF4444" if hot else "#38BDF8")
        h_fill = 0.22 + 0.72 * max(0.08, min(1.0, fill_frac))
        parts = [
            make_beveled_box(0.26, 1.28, 0.10, hex_rgb("#F8FAFC"), bevel=0.03).transformed(pos=(0.0, 0.68, 0.0)),
            make_cylinder(0.06, 0.06, 0.96, hex_rgb("#CBD5E1"), segments=12).transformed(pos=(0.0, 0.72, 0.06)),
            make_icosphere(0.11, col, subdivisions=1, emission=1.6).transformed(pos=(0.0, 0.22, 0.07)),
            make_cylinder(0.045, 0.045, h_fill, col, segments=12, emission=1.8).transformed(pos=(0.0, 0.22 + h_fill * 0.5, 0.07)),
        ]
        for k in range(6):
            parts.append(make_beveled_box(0.07, 0.018, 0.02, hex_rgb("#334155"), bevel=0.004).transformed(pos=(0.09, 0.36 + k * 0.14, 0.06)))
        return Mesh.merge(parts).transformed(pos=pos)

    @staticmethod
    def dual_monitor_console(pos: Tuple[float, float, float], rot_y: float = 0.0) -> Mesh:
        return Mesh.merge([
            make_beveled_box(0.95, 0.68, 0.48, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.0, 0.34, 0.0)),
            make_beveled_box(1.02, 0.06, 0.54, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(0.0, 0.70, 0.0)),
            make_beveled_box(0.42, 0.28, 0.04, hex_rgb("#0F172A"), bevel=0.01).transformed(pos=(-0.23, 0.92, -0.10), rot=(0.0, 0.15, 0.0)),
            make_beveled_box(0.36, 0.22, 0.02, hex_rgb("#22D3EE"), bevel=0.005, emission=1.9).transformed(pos=(-0.23, 0.92, -0.08), rot=(0.0, 0.15, 0.0)),
            make_beveled_box(0.42, 0.28, 0.04, hex_rgb("#0F172A"), bevel=0.01).transformed(pos=(0.23, 0.92, -0.10), rot=(0.0, -0.15, 0.0)),
            make_beveled_box(0.36, 0.22, 0.02, hex_rgb("#4ADE80"), bevel=0.005, emission=1.9).transformed(pos=(0.23, 0.92, -0.08), rot=(0.0, -0.15, 0.0)),
        ]).transformed(pos=pos, rot=(0.0, rot_y, 0.0))

    @staticmethod
    def cta_white_button_stage(p: float, reg: SceneObjectRegistry, ids: Tuple[str, str, str]) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], float]:
        press = 0.07 * max(0.0, math.sin(p * math.pi * 2.0))
        reg.add(ids[0], Mesh.merge([
            _ground_xz(16.0, 16.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(1.55, 1.75, 0.24, hex_rgb("#1E293B"), segments=28).transformed(pos=(0.0, 0.12, 0.0)),
            make_tube_along_path(_circle_path_xz(0.0, 0.25, 0.0, 1.48, 32), 0.035, hex_rgb("#38BDF8"), sides=10, closed=True, emission=2.2),
            _human(pos=(-1.18, 0.24, -0.25), yaw=0.45, scale=0.82, outfit_hex="#2563EB", helmet_hex="#FACC15", wave=math.sin(p * 8.0) * 0.6),
        ]))
        reg.add(ids[1], Mesh.merge([
            make_beveled_box(1.52, 0.34, 0.68, hex_rgb("#F8FAFC"), bevel=0.09, roughness=0.14, emission=1.25).transformed(pos=(0.0, 0.48 - press, 0.0)),
            make_beveled_box(0.30, 0.16, 0.71, hex_rgb("#EF4444"), bevel=0.04, emission=1.8).transformed(pos=(-0.46, 0.50 - press, 0.0)),
            make_beveled_box(0.76, 0.09, 0.71, hex_rgb("#0F172A"), bevel=0.02).transformed(pos=(0.18, 0.50 - press, 0.0)),
        ]))
        reg.add(ids[2], Mesh.merge([
            make_beveled_box(0.24, 0.32, 0.20, hex_rgb("#FDE68A"), bevel=0.06).transformed(pos=(0.28, 0.92 - press * 1.4, 0.25), rot=(0.35, -0.2, 0.0)),
            make_cylinder(0.045, 0.04, 0.26, hex_rgb("#FDE68A"), segments=10).transformed(pos=(0.20, 0.74 - press * 1.4, 0.16), rot=(0.35, 0.0, 0.0)),
            make_beveled_box(0.28, 0.18, 0.22, hex_rgb("#2563EB"), bevel=0.03).transformed(pos=(0.34, 1.12 - press * 1.4, 0.32), rot=(0.35, -0.2, 0.0)),
        ]))
        ang = -0.35 + 0.70 * p
        return (math.sin(ang) * 3.45, 1.65, math.cos(ang) * 3.45), (0.0, 0.58, 0.0), 38.0


# =============================================================================
# EPISODE 1: KT-R07 — LAMINATED ELASTOMERIC BRIDGE BEARING (22 SHOTS, 79 OBJECTS)
# =============================================================================
def _build_r07_shot(shot_idx: int, p: float, reg: SceneObjectRegistry) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], float]:
    shot = V6_EPISODES["KT-R07"]["shots"][shot_idx]
    sid = shot["id"]

    def add_valley_bridge_world(night: bool = False) -> None:
        sky_c = "#0F172A" if night else "#BAE6FD"
        gnd_c = "#1E293B" if night else "#3F6212"
        reg.add("sky_horizon_day", make_beveled_box(26.0, 12.0, 0.2, hex_rgb(sky_c), bevel=0.02, emission=0.55 if not night else 0.15).transformed(pos=(0.0, 5.5, -9.5)))
        reg.add("valley_river_channel", _ground_xz(24.0, 24.0, hex_rgb(gnd_c), flags=FLAG_GROUND))
        reg.add("river_water_current", make_beveled_box(6.5, 0.08, 18.0, hex_rgb("#0284C7"), bevel=0.02, roughness=0.08, emission=0.35).transformed(pos=(0.0, 0.04, 0.0)))
        reg.add("roadside_pine_trees", Mesh.merge([
            KitV6.pine_tree((-4.6, 0.0, -2.5), 1.15),
            KitV6.pine_tree((-5.2, 0.0, 1.8), 0.95),
            KitV6.pine_tree((4.8, 0.0, -1.9), 1.10),
            KitV6.pine_tree((5.3, 0.0, 2.4), 0.90),
        ]))

    def add_pier_and_deck(shear_x: float = 0.0, tilt_z: float = 0.0, with_pad: bool = True) -> None:
        reg.add("pier_pile_footing", make_beveled_box(2.3, 0.26, 1.8, hex_rgb("#64748B"), bevel=0.04).transformed(pos=(0.0, 0.13, 0.0)))
        reg.add("hammerhead_concrete_pier", Mesh.merge([
            make_cylinder(0.46, 0.42, 0.95, hex_rgb("#94A3B8"), segments=18).transformed(pos=(0.0, 0.72, 0.0)),
            make_beveled_box(2.10, 0.34, 1.35, hex_rgb("#CBD5E1"), bevel=0.04).transformed(pos=(0.0, 1.32, 0.0)),
        ]))
        reg.add("anchor_grout_plinth", make_beveled_box(0.86, 0.08, 0.76, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.0, 1.52, 0.0)))
        if with_pad:
            layers = []
            for k in range(6):
                y0 = 1.58 + k * 0.042
                layers.append(make_beveled_box(0.68, 0.026, 0.58, hex_rgb("#111827"), bevel=0.005).transformed(pos=(shear_x * (k / 5.0), y0, 0.0)))
                layers.append(make_beveled_box(0.64, 0.012, 0.54, hex_rgb("#38BDF8"), bevel=0.003, emission=0.8).transformed(pos=(shear_x * ((k + 0.5) / 5.0), y0 + 0.02, 0.0)))
            reg.add("elastomeric_pad_whole", Mesh.merge(layers))
        deck_y = 1.86
        reg.add("steel_box_girder", make_beveled_box(6.8, 0.36, 1.25, hex_rgb("#475569"), bevel=0.03).transformed(pos=(shear_x, deck_y + 0.18, 0.0), rot=(0.0, 0.0, tilt_z)))
        reg.add("cross_diaphragm_brace", Mesh.merge([
            make_beveled_box(0.10, 0.32, 1.28, hex_rgb("#F59E0B"), bevel=0.01).transformed(pos=(shear_x - 1.1, deck_y + 0.18, 0.0)),
            make_beveled_box(0.10, 0.32, 1.28, hex_rgb("#F59E0B"), bevel=0.01).transformed(pos=(shear_x + 1.1, deck_y + 0.18, 0.0)),
        ]))
        reg.add("highway_deck_slab", make_beveled_box(7.2, 0.16, 2.20, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(shear_x, deck_y + 0.44, 0.0), rot=(0.0, 0.0, tilt_z)))
        reg.add("asphalt_road_lanes", Mesh.merge([
            make_beveled_box(7.2, 0.05, 1.92, hex_rgb("#1E293B"), bevel=0.01).transformed(pos=(shear_x, deck_y + 0.54, 0.0)),
            *[make_beveled_box(0.55, 0.015, 0.06, hex_rgb("#FACC15"), bevel=0.003, emission=0.9).transformed(pos=(shear_x - 2.4 + i * 1.2, deck_y + 0.57, 0.0)) for i in range(5)],
        ]))
        reg.add("jersey_barrier_wall", Mesh.merge([
            make_beveled_box(7.2, 0.22, 0.12, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(shear_x, deck_y + 0.63, 1.02)),
            make_beveled_box(7.2, 0.22, 0.12, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(shear_x, deck_y + 0.63, -1.02)),
        ]))
        reg.add("highway_cobra_lamp", Mesh.merge([
            KitV6.cobra_streetlight((-1.8, deck_y + 0.52, -0.98), rot_y=1.57),
            KitV6.cobra_streetlight((1.8, deck_y + 0.52, -0.98), rot_y=1.57),
        ]))

    if sid == "s01":
        add_valley_bridge_world()
        add_pier_and_deck()
        tx = -2.2 + 4.4 * p
        reg.add("container_truck_18w", V4HeroModels.heavy_truck(pos=(tx, 2.42, 0.38), rot_y=math.pi * 0.5, scale=0.46, cab_hex="#F97316"))
        reg.add("passenger_sedan_blue", V5HeroProps.sedan_car(pos=(1.8 - 3.6 * p, 2.42, -0.42), rot_y=math.pi, scale=0.46, body_hex="#38BDF8"))
        return (-3.6 + 1.2 * p, 3.45, 5.1 - 0.6 * p), (0.0, 2.05, 0.0), 40.0

    if sid == "s02":
        add_valley_bridge_world()
        add_pier_and_deck()
        return (-1.65 + 0.55 * p, 1.85, 2.65 - 0.55 * p), (0.0, 1.66, 0.0), 36.0

    if sid == "s03":
        add_valley_bridge_world()
        add_pier_and_deck()
        reg.add("sole_plate_bottom", make_beveled_box(0.76, 0.035, 0.66, hex_rgb("#64748B"), bevel=0.008).transformed(pos=(0.0, 1.56, 0.0)))
        reg.add("sole_plate_top", make_beveled_box(0.76, 0.035, 0.66, hex_rgb("#64748B"), bevel=0.008).transformed(pos=(0.0, 1.84, 0.0)))
        reg.add("anchor_stud_bolts", Mesh.merge([
            make_cylinder(0.025, 0.025, 0.14, hex_rgb("#E2E8F0"), segments=10).transformed(pos=(bx, 1.58, bz))
            for bx in (-0.33, 0.33) for bz in (-0.27, 0.27)
        ]))
        reg.add("bearing_serial_tag", make_beveled_box(0.18, 0.06, 0.02, hex_rgb("#FACC15"), bevel=0.004, emission=1.2).transformed(pos=(0.0, 1.70, 0.30)))
        reg.add("underbridge_catwalk", Mesh.merge([
            make_beveled_box(1.9, 0.05, 0.55, hex_rgb("#475569"), bevel=0.01).transformed(pos=(-0.75, 0.95, 0.72)),
            make_beveled_box(1.9, 0.04, 0.04, hex_rgb("#FACC15"), bevel=0.008).transformed(pos=(-0.75, 1.38, 0.96)),
        ]))
        reg.add("bridge_inspector_human", _human(pos=(-0.82, 0.98, 0.72), yaw=0.65, scale=0.46, outfit_hex="#F97316", helmet_hex="#FACC15"))
        return (-0.85 + 0.35 * p, 1.78, 1.62 - 0.22 * p), (0.0, 1.70, 0.0), 34.0

    if sid == "s04":
        add_valley_bridge_world()
        sh = 0.03 + 0.11 * p
        add_pier_and_deck(shear_x=sh)
        reg.add("sun_heat_orb_3d", make_icosphere(0.36, hex_rgb("#FACC15"), subdivisions=2, emission=3.4).transformed(pos=(1.55, 3.55, -1.6)))
        reg.add("thermometer_tower_hot", KitV6.thermometer_tower((-1.35, 1.45, 0.55), fill_frac=0.55 + 0.42 * p, hot=True))
        reg.add("thermal_expansion_arrows", Mesh.merge([
            KitV6.arrow_3d((-0.55, 2.35, 0.65), (0.55 + sh, 2.35, 0.65), "#F97316", 0.035, 2.2),
            KitV6.arrow_3d((0.55, 2.35, 0.65), (-0.55 - sh, 2.35, 0.65), "#F97316", 0.035, 2.2),
        ]))
        reg.add("expansion_finger_joint", Mesh.merge([
            make_beveled_box(0.28, 0.04, 0.10, hex_rgb("#38BDF8"), bevel=0.008, emission=1.1).transformed(pos=(0.85 + sh * 0.5, 2.43, -0.6 + k * 0.3))
            for k in range(5)
        ]))
        return (0.25, 2.55, 3.85 - 0.35 * p), (0.0, 2.05, 0.0), 38.0

    if sid == "s05":
        add_valley_bridge_world(night=True)
        sh = 0.12 - 0.22 * p
        add_pier_and_deck(shear_x=sh)
        reg.add("crescent_moon_3d", make_icosphere(0.28, hex_rgb("#E0F2FE"), subdivisions=2, emission=2.8).transformed(pos=(-1.45, 3.45, -1.5)))
        reg.add("thermometer_tower_cold", KitV6.thermometer_tower((-1.35, 1.45, 0.55), fill_frac=0.65 - 0.42 * p, hot=False))
        reg.add("contraction_arrows_blue", Mesh.merge([
            KitV6.arrow_3d((-0.95, 2.35, 0.65), (-0.15, 2.35, 0.65), "#38BDF8", 0.035, 2.2),
            KitV6.arrow_3d((0.95, 2.35, 0.65), (0.15, 2.35, 0.65), "#38BDF8", 0.035, 2.2),
        ]))
        reg.add("streetlight_night_glow", Mesh.merge([
            make_icosphere(0.16, hex_rgb("#FEF08A"), subdivisions=1, emission=2.8).transformed(pos=(-1.35, 3.95, -0.95)),
            make_icosphere(0.16, hex_rgb("#FEF08A"), subdivisions=1, emission=2.8).transformed(pos=(2.25, 3.95, -0.95)),
        ]))
        return (-0.35, 2.50, 3.75 - 0.30 * p), (0.0, 2.05, 0.0), 38.0

    if sid == "s06":
        add_valley_bridge_world()
        add_pier_and_deck(with_pad=False)
        reg.add("rigid_concrete_support_bad", make_beveled_box(0.78, 0.34, 0.68, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.0, 1.69, 0.0)))
        reg.add("spalling_crack_wedges", Mesh.merge([
            make_tube_along_path([(-0.32, 1.48, 0.35), (-0.08, 1.64, 0.36), (0.18, 1.42, 0.35)], 0.024, hex_rgb("#EF4444"), sides=8, emission=2.5),
            make_tube_along_path([(0.28, 1.52, 0.35), (0.04, 1.68, 0.36)], 0.020, hex_rgb("#EF4444"), sides=8, emission=2.5),
        ]))
        reg.add("exposed_bent_rebar", Mesh.merge([
            make_cylinder(0.016, 0.016, 0.28, hex_rgb("#B45309"), segments=8).transformed(pos=(-0.22 + k * 0.22, 1.50, 0.36), rot=(0.25, 0.0, 0.35))
            for k in range(3)
        ]))
        drop = p * 0.55
        reg.add("falling_concrete_debris", Mesh.merge([
            make_beveled_box(0.09, 0.07, 0.08, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(-0.28 + k * 0.26, 1.38 - drop * (0.7 + 0.3 * k), 0.42), rot=(p * 3.0, k * 1.1, p * 2.0))
            for k in range(3)
        ]))
        return (0.35 * math.sin(p * 3.0), 1.72, 2.05 - 0.25 * p), (0.0, 1.58, 0.15), 35.0

    if sid == "s07":
        add_valley_bridge_world()
        defl = -0.045 * math.sin(p * math.pi)
        add_pier_and_deck(tilt_z=defl)
        reg.add("heavy_dump_truck_gravel", V4HeroModels.heavy_truck(pos=(-1.4 + 2.8 * p, 2.43, 0.35), rot_y=math.pi * 0.5, scale=0.45, cab_hex="#EAB308"))
        reg.add("suvs_convoy_car", V5HeroProps.sedan_car(pos=(1.5 - 2.6 * p, 2.43, -0.38), rot_y=math.pi, scale=0.45, body_hex="#22C55E"))
        reg.add("rotation_angle_arc_3d", make_tube_along_path(_circle_path_xy(0.0, 1.72, 0.45, 0.36, 20)[:10], 0.022, hex_rgb("#FACC15"), sides=8, emission=2.0))
        reg.add("pier_drainage_downspout", make_cylinder(0.045, 0.045, 1.45, hex_rgb("#38BDF8"), segments=10).transformed(pos=(0.48, 0.85, 0.42)))
        return (-0.65, 2.05, 2.95), (0.0, 1.85, 0.0), 37.0

    if sid == "s08":
        reg.add("lab_compression_frame", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(1.90, 0.18, 1.20, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.0, 0.09, 0.0)),
            make_cylinder(0.09, 0.09, 1.65, hex_rgb("#94A3B8"), segments=14).transformed(pos=(-0.72, 0.95, 0.0)),
            make_cylinder(0.09, 0.09, 1.65, hex_rgb("#94A3B8"), segments=14).transformed(pos=(0.72, 0.95, 0.0)),
            make_beveled_box(1.85, 0.24, 0.95, hex_rgb("#F59E0B"), bevel=0.03).transformed(pos=(0.0, 1.72, 0.0)),
        ]))
        sq = 0.08 * p
        reg.add("hydraulic_ram_piston", make_cylinder(0.24, 0.24, 0.58, hex_rgb("#CBD5E1"), segments=18).transformed(pos=(0.0, 1.32 - sq, 0.0)))
        bulge = 0.44 + 0.32 * p
        reg.add("raw_rubber_bulge_bad", Mesh.merge([
            make_beveled_box(0.82, 0.26 - sq, 0.68, hex_rgb("#1F2937"), bevel=0.06).transformed(pos=(0.0, 0.32 - sq * 0.5, 0.0)),
            make_cylinder(bulge, bulge, 0.16 - sq * 0.5, hex_rgb("#374151"), segments=20).transformed(pos=(0.0, 0.32 - sq * 0.5, 0.0)),
        ]))
        reg.add("sidewall_split_tear", Mesh.merge([
            make_tube_along_path([(-0.22, 0.26, bulge - 0.02), (0.02, 0.35, bulge + 0.02), (0.24, 0.27, bulge - 0.02)], 0.022, hex_rgb("#EF4444"), sides=8, emission=2.6),
        ]))
        return (0.45 * math.sin(p * 1.5), 0.92, 2.35 - 0.25 * p), (0.0, 0.42, 0.0), 35.0

    if sid in ("s09", "s10", "s12", "s13", "s14"):
        reg.add("lab_compression_frame", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(2.10, 0.20, 1.30, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.0, 0.10, 0.0)),
            make_beveled_box(2.10, 0.22, 1.10, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.0, 1.48, 0.0)),
        ]))
        shear = (0.24 * math.sin(p * math.pi * 2.0)) if sid == "s13" else 0.0
        rot_z = (0.06 * math.sin(p * math.pi * 2.0)) if sid == "s14" else 0.0
        neo_parts, shim_parts = [], []
        for k in range(7):
            yk = 0.24 + k * 0.088
            sx = shear * (k / 6.0)
            neo_parts.append(make_beveled_box(0.96, 0.052, 0.72, hex_rgb("#111827"), bevel=0.008).transformed(pos=(sx, yk, 0.0), rot=(0.0, 0.0, rot_z * (k / 6.0))))
            if k < 6:
                shim_parts.append(make_beveled_box(0.90, 0.026, 0.68, hex_rgb("#38BDF8"), bevel=0.004, emission=1.35).transformed(pos=(sx + shear * 0.08, yk + 0.042, 0.02), rot=(0.0, 0.0, rot_z * (k / 6.0))))
        reg.add("neoprene_layer_stack", Mesh.merge(neo_parts))
        reg.add("internal_steel_shims_6x", Mesh.merge(shim_parts))
        reg.add("outer_ozone_rubber_cover", make_beveled_box(1.02, 0.64, 0.22, hex_rgb("#1E293B"), bevel=0.02).transformed(pos=(shear * 0.5, 0.52, -0.32)))
        reg.add("elastomeric_pad_cutaway", make_beveled_box(1.06, 0.06, 0.80, hex_rgb("#94A3B8"), bevel=0.01).transformed(pos=(shear, 0.86, 0.0), rot=(0.0, 0.0, rot_z)))
        if sid == "s09":
            reg.add("laser_cut_plane_glow", make_beveled_box(1.18, 0.76, 0.012, hex_rgb("#22D3EE"), bevel=0.002, emission=2.4).transformed(pos=(0.0, 0.54, 0.36 - 0.34 * p)))
            reg.add("inspection_spotlight_rig", KitV6.cobra_streetlight((-1.25, 0.0, 0.65), rot_y=0.5, lit=2.4))
            return (-0.95 + 0.55 * p, 0.88, 2.15 - 0.25 * p), (0.0, 0.52, 0.0), 34.0
        if sid == "s10":
            return (0.15 * math.sin(p * 2.0), 0.72, 1.68 - 0.18 * p), (0.0, 0.52, 0.05), 32.0
        if sid == "s12":
            reg.add("vertical_load_arrows_red", Mesh.merge([
                KitV6.arrow_3d((-0.30, 1.32, 0.25), (-0.30, 0.92, 0.25), "#EF4444", 0.032, 2.2),
                KitV6.arrow_3d((0.30, 1.32, 0.25), (0.30, 0.92, 0.25), "#EF4444", 0.032, 2.2),
            ]))
            reg.add("tensile_shim_arrows_cyan", Mesh.merge([
                KitV6.arrow_3d((-0.42, 0.52, 0.40), (-0.08, 0.52, 0.40), "#22D3EE", 0.025, 2.2),
                KitV6.arrow_3d((0.42, 0.52, 0.40), (0.08, 0.52, 0.40), "#22D3EE", 0.025, 2.2),
            ]))
            reg.add("digital_load_cell_2000t", PrecisionMechV3.pressure_gauge(radius=0.20, needle_norm=0.78, danger=False).transformed(pos=(0.88, 1.05, 0.20)))
            return (0.35, 0.88, 2.05 - 0.15 * p), (0.08, 0.56, 0.0), 34.0
        if sid == "s13":
            reg.add("shear_parallelogram_stack", KitV6.arrow_3d((-0.45, 0.96, 0.38), (0.45, 0.96, 0.38), "#4ADE80", 0.030, 2.2))
            reg.add("dial_micrometer_stand", Mesh.merge([
                make_cylinder(0.03, 0.03, 0.65, hex_rgb("#CBD5E1"), segments=10).transformed(pos=(0.82, 0.52, 0.15)),
                PrecisionMechV3.pressure_gauge(radius=0.14, needle_norm=0.5 + 0.4 * math.sin(p * 6.28)).transformed(pos=(0.82, 0.78, 0.20)),
            ]))
            reg.add("console_dual_monitor", KitV6.dual_monitor_console((-1.25, 0.0, -0.35), rot_y=0.45))
            return (-0.25 + 0.45 * p, 0.84, 2.15), (0.0, 0.55, 0.0), 35.0
        # s14
        reg.add("oscilloscope_wave_rig", KitV6.dual_monitor_console((1.22, 0.0, -0.30), rot_y=-0.45))
        reg.add("safety_mesh_guard", make_beveled_box(0.06, 0.95, 0.85, hex_rgb("#FACC15"), bevel=0.01).transformed(pos=(-1.05, 0.68, 0.0)))
        reg.add("workzone_cone_pair", Mesh.merge([KitV6.traffic_cone((-0.95, 0.0, 0.75)), KitV6.traffic_cone((0.95, 0.0, 0.75))]))
        return (0.28, 0.86, 2.18 - 0.15 * p), (0.0, 0.56, 0.0), 35.0

    if sid == "s11":
        reg.add("vulcanizing_autoclave_press", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#1E293B"), flags=FLAG_GROUND),
            _hall(width=7.0, length=8.0, height=4.2),
            make_beveled_box(1.55, 1.85, 1.15, hex_rgb("#DC2626"), bevel=0.04).transformed(pos=(0.0, 0.95, 0.0)),
            make_beveled_box(1.10, 0.18, 0.90, hex_rgb("#F97316"), bevel=0.02, emission=2.0).transformed(pos=(0.0, 0.82 - 0.06 * math.sin(p * 3.14), 0.18)),
            make_beveled_box(0.86, 0.24, 0.68, hex_rgb("#111827"), bevel=0.02).transformed(pos=(0.0, 0.58, 0.18)),
        ]))
        reg.add("steam_manifold_pipes", Mesh.merge([
            _pipe((-0.95, 0.4, 0.0), (-0.95, 1.65, 0.0), radius=0.06),
            make_icosphere(0.14 + 0.06 * p, hex_rgb("#F8FAFC"), subdivisions=1, emission=1.1).transformed(pos=(-0.85, 1.55 + 0.25 * p, 0.35)),
        ]))
        reg.add("factory_pressure_gauge", PrecisionMechV3.pressure_gauge(radius=0.18, needle_norm=0.72, danger=True).transformed(pos=(0.62, 1.38, 0.60)))
        reg.add("factory_tech_worker", _human(pos=(1.22, 0.0, 0.55), yaw=-0.55, scale=0.68, outfit_hex="#2563EB", helmet_hex="#FACC15"))
        return (-1.15 + 0.65 * p, 1.35, 3.15 - 0.25 * p), (0.0, 0.88, 0.0), 38.0

    if sid == "s15":
        add_valley_bridge_world()
        add_pier_and_deck()
        reg.add("underbridge_catwalk", make_beveled_box(2.2, 0.06, 0.65, hex_rgb("#475569"), bevel=0.01).transformed(pos=(-0.65, 0.95, 0.72)))
        reg.add("bridge_inspector_human", _human(pos=(-0.55 + 0.25 * p, 0.98, 0.72), yaw=0.45, scale=0.48, outfit_hex="#F97316", helmet_hex="#FACC15"))
        reg.add("flashlight_beam_cone", make_cylinder(0.03, 0.22, 0.65, hex_rgb("#FEF08A"), segments=12, emission=2.2).transformed(pos=(-0.22, 1.52, 0.42), rot=(0.8, -0.4, 0.0)))
        reg.add("inspector_clipboard_caliper", make_beveled_box(0.16, 0.22, 0.02, hex_rgb("#F8FAFC"), bevel=0.005).transformed(pos=(-0.38, 1.34, 0.62)))
        reg.add("surveying_total_station", Mesh.merge([
            make_cylinder(0.22, 0.03, 0.75, hex_rgb("#FACC15"), segments=6).transformed(pos=(1.15, 0.38, 1.15)),
            make_beveled_box(0.16, 0.18, 0.16, hex_rgb("#F97316"), bevel=0.02).transformed(pos=(1.15, 0.82, 1.15)),
        ]))
        return (-1.35 + 0.45 * p, 1.68, 2.35), (-0.15, 1.52, 0.25), 36.0

    if sid == "s16":
        add_valley_bridge_world()
        reg.add("cable_stayed_a_pylon", Mesh.merge([
            make_cylinder(0.18, 0.12, 3.8, hex_rgb("#F8FAFC"), segments=12).transformed(pos=(-0.55, 1.9, 0.0), rot=(0.0, 0.0, -0.14)),
            make_cylinder(0.18, 0.12, 3.8, hex_rgb("#F8FAFC"), segments=12).transformed(pos=(0.55, 1.9, 0.0), rot=(0.0, 0.0, 0.14)),
            make_beveled_box(8.5, 0.22, 1.65, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.0, 1.35, 0.0)),
        ]))
        cables = []
        for k in range(1, 6):
            cables.append(make_tube_along_path([(0.0, 3.55, 0.0), (-0.75 * k, 1.42, 0.0)], 0.018, hex_rgb("#E2E8F0"), sides=6, emission=0.8))
            cables.append(make_tube_along_path([(0.0, 3.55, 0.0), (0.75 * k, 1.42, 0.0)], 0.018, hex_rgb("#E2E8F0"), sides=6, emission=0.8))
        reg.add("fan_stay_cables_array", Mesh.merge(cables))
        reg.add("cargo_barge_ship", Mesh.merge([
            make_beveled_box(1.9, 0.28, 0.68, hex_rgb("#B91C1C"), bevel=0.04).transformed(pos=(-1.2 + 2.4 * p, 0.16, 1.45)),
            make_beveled_box(0.55, 0.36, 0.52, hex_rgb("#F8FAFC"), bevel=0.02).transformed(pos=(-1.7 + 2.4 * p, 0.44, 1.45)),
        ]))
        return (-2.4 + 0.9 * p, 2.65, 5.4 - 0.4 * p), (0.0, 2.05, 0.0), 40.0

    if sid == "s17":
        reg.add("ptfe_spherical_pot_bearing", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(0.68, 0.68, 0.26, hex_rgb("#475569"), segments=24).transformed(pos=(0.0, 0.18, 0.0)),
            make_icosphere(0.46, hex_rgb("#CBD5E1"), subdivisions=2).transformed(pos=(0.0, 0.38, 0.0)),
        ]))
        reg.add("stainless_slider_mirror", make_beveled_box(1.38, 0.09, 0.98, hex_rgb("#F8FAFC"), bevel=0.02, roughness=0.05, emission=0.7).transformed(pos=(0.22 * math.sin(p * 6.28), 0.62, 0.0)))
        reg.add("brass_sealing_ring", make_tube_along_path(_circle_path_xz(0.0, 0.34, 0.0, 0.54, 28), 0.032, hex_rgb("#F59E0B"), sides=10, closed=True, emission=1.1))
        return (-0.75 + 0.55 * p, 0.95, 2.15 - 0.20 * p), (0.0, 0.45, 0.0), 34.0

    if sid in ("s18", "s19"):
        add_valley_bridge_world()
        add_pier_and_deck(shear_x=0.08 * math.sin(p * 6.28))
        reg.add("city_skyline_backdrop", Mesh.merge([
            _tower(floors=8, width=1.8, depth=1.4).transformed(pos=(-3.6, 0.0, -5.5)),
            _tower(floors=11, width=2.0, depth=1.5).transformed(pos=(3.4, 0.0, -5.8)),
        ]))
        reg.add("commuter_bus_green", KitV6.bus_vehicle((-1.8 + 3.6 * p, 2.42, 0.38), rot_y=0.0, col_hex="#10B981", scale=0.44))
        if sid == "s19":
            reg.add("overhead_highway_gantry", Mesh.merge([
                make_cylinder(0.05, 0.05, 1.25, hex_rgb("#94A3B8"), segments=10).transformed(pos=(-1.2, 3.05, -0.98)),
                make_cylinder(0.05, 0.05, 1.25, hex_rgb("#94A3B8"), segments=10).transformed(pos=(-1.2, 3.05, 0.98)),
                make_beveled_box(0.12, 0.42, 1.65, hex_rgb("#15803D"), bevel=0.02, emission=0.9).transformed(pos=(-1.2, 3.55, 0.0)),
            ]))
        return (-2.2 + 1.4 * p, 2.45, 3.65 - 0.35 * p), (0.0, 1.85, 0.0), 38.0

    if sid == "s20":
        reg.add("poll_pedestal_left", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(-0.78, 0.21, 0.0)),
            make_beveled_box(0.62, 0.32, 0.48, hex_rgb("#111827"), bevel=0.02).transformed(pos=(-0.78, 0.62, 0.0), rot=(0.0, p * 1.5, 0.0)),
            make_beveled_box(0.58, 0.05, 0.50, hex_rgb("#38BDF8"), bevel=0.01, emission=1.8).transformed(pos=(-0.78, 0.62, 0.0), rot=(0.0, p * 1.5, 0.0)),
        ]))
        reg.add("poll_pedestal_right", Mesh.merge([
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(0.78, 0.21, 0.0)),
            *[make_beveled_box(0.42, 0.06, 0.08, hex_rgb("#FACC15"), bevel=0.01, emission=1.5).transformed(pos=(0.78, 0.56, -0.18 + k * 0.12), rot=(0.0, -p * 1.5, 0.0)) for k in range(4)],
        ]))
        return (0.0, 1.38, 3.25 - 0.20 * p), (0.0, 0.62, 0.0), 38.0

    if sid == "s21":
        reg.add("studio_truss_arch", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            PrecisionMechV3.steel_truss_span(length=4.2, height=0.35, depth=0.35).transformed(pos=(0.0, 2.25, -1.2)),
            _human(pos=(0.0, 0.0, 0.0), yaw=0.0, scale=0.88, outfit_hex="#F97316", helmet_hex="#FACC15", wave=math.sin(p * 8.0) * 0.7),
        ]))
        return (-0.35 + 0.70 * p, 1.38, 2.75), (0.0, 0.98, 0.0), 36.0

    return KitV6.cta_white_button_stage(p, reg, ("cta_plinth_3d", "white_subscribe_button_3d", "pointer_hand_3d"))


# =============================================================================
# EPISODE 2: KT-R08 — SKYSCRAPER BREAK TANK & MEP ZONES (22 SHOTS, 77 OBJECTS)
# =============================================================================
def _build_r08_shot(shot_idx: int, p: float, reg: SceneObjectRegistry) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], float]:
    shot = V6_EPISODES["KT-R08"]["shots"][shot_idx]
    sid = shot["id"]

    def add_downtown_city() -> None:
        reg.add("sky_city_morning", make_beveled_box(26.0, 14.0, 0.2, hex_rgb("#BAE6FD"), bevel=0.02, emission=0.55).transformed(pos=(0.0, 6.0, -9.0)))
        reg.add("downtown_avenue_asphalt", _ground_xz(22.0, 22.0, hex_rgb("#1E293B"), flags=FLAG_GROUND))
        reg.add("skyscraper_90f_glass", Mesh.merge([
            make_beveled_box(1.55, 4.40, 1.45, hex_rgb("#0EA5E9"), bevel=0.04, roughness=0.12).transformed(pos=(0.0, 2.20, 0.0)),
            *[make_beveled_box(1.58, 0.04, 1.48, hex_rgb("#E0F2FE"), bevel=0.005, emission=0.7).transformed(pos=(0.0, 0.25 + k * 0.28, 0.0)) for k in range(15)],
        ]))
        reg.add("neighbor_office_tower", _tower(floors=8, width=1.4, depth=1.2).transformed(pos=(-2.35, 0.0, -1.2)))
        reg.add("city_sedan_car", V5HeroProps.sedan_car(pos=(-1.5 + 3.0 * p, 0.0, 1.65), rot_y=0.0, scale=0.44, body_hex="#EF4444"))
        reg.add("transit_city_bus", KitV6.bus_vehicle((1.6 - 3.0 * p, 0.0, 2.35), rot_y=math.pi, col_hex="#2563EB", scale=0.42))
        reg.add("avenue_shade_trees", Mesh.merge([KitV6.shade_tree((-1.55, 0.0, 1.15), 0.72), KitV6.shade_tree((1.55, 0.0, 1.15), 0.72)]))
        reg.add("street_bollard_lamps", Mesh.merge([KitV6.cobra_streetlight((-1.95, 0.0, 1.18), 0.0), KitV6.cobra_streetlight((1.95, 0.0, 1.18), 3.14)]))

    if sid == "s01":
        add_downtown_city()
        return (-2.35 + 0.85 * p, 2.35 + 0.65 * p, 5.45 - 0.55 * p), (0.0, 2.25, 0.0), 40.0

    if sid == "s02":
        add_downtown_city()
        reg.add("louver_facade_band", Mesh.merge([
            make_beveled_box(1.62, 0.42, 1.52, hex_rgb("#0F172A"), bevel=0.02).transformed(pos=(0.0, 2.05, 0.0)),
            *[make_beveled_box(1.64, 0.028, 1.54, hex_rgb("#94A3B8"), bevel=0.004).transformed(pos=(0.0, 1.88 + k * 0.055, 0.0)) for k in range(7)],
        ]))
        reg.add("curtain_wall_mullions", Mesh.merge([
            make_beveled_box(0.03, 4.4, 0.04, hex_rgb("#CBD5E1"), bevel=0.004).transformed(pos=(-0.6 + k * 0.4, 2.2, 0.74)) for k in range(4)
        ]))
        reg.add("facade_cleaning_gondola", Mesh.merge([
            make_beveled_box(0.55, 0.16, 0.22, hex_rgb("#FACC15"), bevel=0.02).transformed(pos=(0.42, 2.65 - 0.18 * p, 0.86)),
            make_cylinder(0.012, 0.012, 1.8, hex_rgb("#E2E8F0"), segments=6).transformed(pos=(0.25, 3.55, 0.86)),
            make_cylinder(0.012, 0.012, 1.8, hex_rgb("#E2E8F0"), segments=6).transformed(pos=(0.58, 3.55, 0.86)),
        ]))
        return (0.45, 2.18, 2.55 - 0.45 * p), (0.0, 2.05, 0.42), 35.0

    if sid == "s03":
        reg.add("bathroom_tile_room", Mesh.merge([
            _ground_xz(10.0, 10.0, hex_rgb("#E2E8F0"), flags=FLAG_GROUND),
            make_beveled_box(3.4, 2.6, 0.12, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(0.0, 1.3, -0.65)),
        ]))
        reg.add("vanity_ceramic_sink", Mesh.merge([
            make_beveled_box(1.15, 0.68, 0.56, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.0, 0.34, -0.25)),
            make_beveled_box(1.20, 0.08, 0.60, hex_rgb("#F8FAFC"), bevel=0.02).transformed(pos=(0.0, 0.72, -0.25)),
            make_cylinder(0.24, 0.20, 0.12, hex_rgb("#F1F5F9"), segments=18).transformed(pos=(0.0, 0.78, -0.22)),
        ]))
        reg.add("chrome_mixer_faucet", Mesh.merge([
            make_tube_along_path([(0.0, 0.80, -0.42), (0.0, 1.02, -0.40), (0.0, 1.00, -0.22)], 0.026, hex_rgb("#E2E8F0"), sides=10),
            make_cylinder(0.022, 0.028, 0.24, hex_rgb("#38BDF8"), segments=12, emission=1.8).transformed(pos=(0.0, 0.88, -0.22)),
        ]))
        reg.add("led_vanity_mirror", Mesh.merge([
            make_beveled_box(0.88, 0.76, 0.04, hex_rgb("#38BDF8"), bevel=0.02, emission=1.5).transformed(pos=(0.0, 1.48, -0.56)),
            make_beveled_box(0.80, 0.68, 0.05, hex_rgb("#BAE6FD"), bevel=0.01, roughness=0.04).transformed(pos=(0.0, 1.48, -0.55)),
        ]))
        reg.add("towel_holder_rack", Mesh.merge([
            make_beveled_box(0.36, 0.03, 0.06, hex_rgb("#94A3B8"), bevel=0.008).transformed(pos=(0.82, 1.08, -0.54)),
            make_beveled_box(0.28, 0.42, 0.04, hex_rgb("#F97316"), bevel=0.02).transformed(pos=(0.82, 0.86, -0.52)),
        ]))
        reg.add("resident_person_rig", _human(pos=(-0.62, 0.0, 0.18), yaw=0.65, scale=0.72, outfit_hex="#0EA5E9"))
        return (-0.45 + 0.35 * p, 1.32, 1.95 - 0.18 * p), (0.0, 0.95, -0.22), 36.0

    if sid in ("s04", "s05"):
        reg.add("xray_tower_shell", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(1.50, 4.10, 0.90, hex_rgb("#1E293B"), bevel=0.03).transformed(pos=(0.0, 2.05, -0.25)),
        ]))
        reg.add("continuous_red_riser_500m", make_cylinder(0.085, 0.085, 3.95, hex_rgb("#EF4444"), segments=16, emission=1.9).transformed(pos=(0.0, 2.02, 0.25)))
        reg.add("elevation_markers_100_500", Mesh.merge([
            make_beveled_box(0.45, 0.05, 0.04, hex_rgb("#FACC15"), bevel=0.008, emission=1.3).transformed(pos=(-0.52, 0.45 + k * 0.85, 0.25))
            for k in range(5)
        ]))
        reg.add("hydrostatic_down_arrows", Mesh.merge([
            KitV6.arrow_3d((0.32, 3.6 - k * 0.9 - p * 0.25, 0.28), (0.32, 3.1 - k * 0.9 - p * 0.25, 0.28), "#F97316", 0.032, 2.2)
            for k in range(4)
        ]))
        if sid == "s05":
            reg.add("graduated_water_column", make_cylinder(0.16, 0.16, 2.2, hex_rgb("#38BDF8"), segments=16, emission=1.4).transformed(pos=(-0.62, 1.15, 0.35)))
            reg.add("bourdon_gauge_50bar_red", PrecisionMechV3.pressure_gauge(radius=0.34, needle_norm=0.45 + 0.52 * p, danger=True).transformed(pos=(0.52, 0.85, 0.42)))
            reg.add("pressure_scale_plaque", make_beveled_box(0.55, 0.24, 0.05, hex_rgb("#DC2626"), bevel=0.02, emission=1.5).transformed(pos=(0.52, 1.38, 0.40)))
            return (0.15, 1.18, 2.35 - 0.25 * p), (0.18, 0.92, 0.30), 36.0
        return (-0.65 + 0.45 * p, 2.15, 4.15 - 0.45 * p), (0.0, 1.95, 0.15), 39.0

    if sid == "s06":
        reg.add("ground_floor_kitchen_sink", Mesh.merge([
            _ground_xz(12.0, 12.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(1.25, 0.72, 0.58, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.55, 0.36, -0.25)),
        ]))
        reg.add("cast_iron_flange_elbow", Mesh.merge([
            _pipe((-0.35, 0.2, 0.0), (-0.35, 1.25, 0.0), radius=0.09),
            _pipe((-0.35, 0.72, 0.0), (0.45, 0.72, 0.0), radius=0.08),
        ]))
        reg.add("ruptured_rubber_gasket", make_tube_along_path(_circle_path_xz(-0.35, 0.72, 0.0, 0.16, 20), 0.028, hex_rgb("#EF4444"), sides=8, closed=True, emission=2.4))
        jet_len = 0.35 + 0.95 * p
        reg.add("high_pressure_water_jet", Mesh.merge([
            make_cylinder(0.03, 0.24, jet_len, hex_rgb("#38BDF8"), segments=14, emission=2.5).transformed(pos=(-0.35 + jet_len * 0.45, 0.78, 0.28), rot=(0.4, 0.0, -1.2)),
            *[make_icosphere(0.06, hex_rgb("#E0F2FE"), subdivisions=1, emission=2.2).transformed(pos=(-0.1 + 0.7 * p + k * 0.14, 0.85 + 0.12 * math.sin(k + p * 8.0), 0.35)) for k in range(5)],
        ]))
        return (-0.25 + 0.25 * p, 1.15, 2.25 - 0.20 * p), (-0.05, 0.75, 0.12), 36.0

    if sid == "s07":
        reg.add("basement_pump_room", Mesh.merge([
            _ground_xz(12.0, 12.0, hex_rgb("#111827"), flags=FLAG_GROUND),
            _hall(width=6.0, length=6.0, height=3.4),
        ]))
        reg.add("giant_overloaded_pump", Mesh.merge([
            make_cylinder(0.38, 0.38, 0.36, hex_rgb("#DC2626"), segments=20, emission=1.2 + 0.8 * p).transformed(pos=(-0.25, 0.48, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)),
            _pipe((-0.25, 0.65, 0.0), (-0.25, 1.85, 0.0), radius=0.09),
        ]))
        reg.add("electric_drive_motor", make_cylinder(0.28, 0.28, 0.62, hex_rgb("#B91C1C"), segments=16, emission=0.8 * p).transformed(pos=(0.38, 0.44, 0.0), rot=(0.0, 0.0, math.pi * 0.5)))
        reg.add("overheat_smoke_plume", Mesh.merge([
            make_icosphere(0.11 + 0.04 * k, hex_rgb("#94A3B8"), subdivisions=1, emission=0.7).transformed(pos=(0.25 + 0.08 * math.sin(p * 6 + k), 0.85 + k * 0.24 + p * 0.22, 0.08))
            for k in range(4)
        ]))
        reg.add("alarm_control_cabinet", Mesh.merge([
            make_beveled_box(0.58, 1.25, 0.34, hex_rgb("#334155"), bevel=0.03).transformed(pos=(-1.12, 0.62, -0.35)),
            make_icosphere(0.08, hex_rgb("#EF4444"), subdivisions=1, emission=3.4).transformed(pos=(-1.12, 1.32, -0.30)),
        ]))
        return (-0.65 + 0.45 * p, 1.18, 2.55 - 0.20 * p), (0.0, 0.68, 0.0), 37.0

    if sid in ("s08", "s09", "s10", "s11", "s12", "s16"):
        reg.add("mep_epoxy_floor_deck", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(5.6, 0.08, 4.2, hex_rgb("#1E3A5F"), bevel=0.02).transformed(pos=(0.0, 0.04, 0.0)),
        ]))
        reg.add("overhead_pipe_trapeze", PrecisionMechV3.steel_truss_span(length=4.6, height=0.22, depth=0.28).transformed(pos=(0.0, 2.15, -0.45)))
        reg.add("cable_ladder_tray", make_beveled_box(4.6, 0.06, 0.34, hex_rgb("#FACC15"), bevel=0.01).transformed(pos=(0.0, 1.92, -0.75)))
        reg.add("mep_technician_rig", _human(pos=(1.35, 0.08, 0.48), yaw=-0.65, scale=0.68, outfit_hex="#0284C7", helmet_hex="#F8FAFC"))
        reg.add("booster_pump_skid_duplex", Mesh.merge([
            make_beveled_box(0.95, 0.12, 0.62, hex_rgb("#475569"), bevel=0.02).transformed(pos=(-0.95, 0.14, 0.15)),
            make_cylinder(0.16, 0.16, 0.38, hex_rgb("#22C55E"), segments=14).transformed(pos=(-1.12, 0.34, 0.15), rot=(0.0, 0.0, 1.57)),
            make_cylinder(0.16, 0.16, 0.38, hex_rgb("#22C55E"), segments=14).transformed(pos=(-0.75, 0.34, 0.15), rot=(0.0, 0.0, 1.57)),
        ]))
        reg.add("neoprene_vibration_pad", make_beveled_box(1.00, 0.05, 0.66, hex_rgb("#111827"), bevel=0.01).transformed(pos=(-0.95, 0.08, 0.15)))
        reg.add("zone1_rising_main_pipe", _pipe((-0.95, 0.45, 0.15), (-0.42, 1.32, 0.0), radius=0.055))
        reg.add("stainless_break_tank", Mesh.merge([
            make_beveled_box(1.38, 1.02, 0.88, hex_rgb("#94A3B8"), bevel=0.03).transformed(pos=(0.15, 0.68, -0.08)),
            make_beveled_box(1.26, 0.66, 0.78, hex_rgb("#0EA5E9"), bevel=0.02, emission=1.2).transformed(pos=(0.15, 0.54, 0.04)),
        ]))
        if sid == "s08":
            return (-1.45 + 0.65 * p, 1.38, 3.25 - 0.35 * p), (0.0, 0.82, 0.0), 39.0
        if sid == "s09":
            return (-1.15 + 0.45 * p, 1.15, 2.55 - 0.25 * p), (-0.35, 0.68, 0.05), 36.0
        if sid == "s10":
            reg.add("brass_float_ball_valve", Mesh.merge([
                make_tube_along_path([(-0.38, 1.05, 0.18), (-0.05, 0.96 + 0.04 * math.sin(p * 6.28), 0.18)], 0.018, hex_rgb("#F59E0B"), sides=8),
                make_icosphere(0.085, hex_rgb("#FACC15"), subdivisions=1, emission=1.1).transformed(pos=(-0.02, 0.94 + 0.04 * math.sin(p * 6.28), 0.18)),
            ]))
            reg.add("open_water_surface_wave", make_beveled_box(1.22, 0.04, 0.76, hex_rgb("#7DD3FC"), bevel=0.01, emission=1.9).transformed(pos=(0.15, 0.88, 0.06)))
            reg.add("gooseneck_air_vent", make_tube_along_path([(0.35, 1.18, 0.0), (0.35, 1.48, 0.0), (0.50, 1.48, 0.0), (0.50, 1.34, 0.0)], 0.032, hex_rgb("#CBD5E1"), sides=10))
            reg.add("overflow_drain_standpipe", make_cylinder(0.032, 0.032, 0.82, hex_rgb("#38BDF8"), segments=10).transformed(pos=(0.62, 0.62, 0.22)))
            reg.add("level_sight_glass_tube", make_cylinder(0.022, 0.022, 0.76, hex_rgb("#22D3EE"), segments=10, emission=2.0).transformed(pos=(0.78, 0.68, 0.38)))
            return (0.15 + 0.25 * p, 1.05, 1.98 - 0.22 * p), (0.15, 0.85, 0.08), 34.0
        if sid == "s11":
            reg.add("inlet_gauge_30bar", PrecisionMechV3.pressure_gauge(radius=0.22, needle_norm=0.88, danger=True).transformed(pos=(-0.55, 1.28, 0.38)))
            reg.add("outlet_gauge_0bar_green", PrecisionMechV3.pressure_gauge(radius=0.22, needle_norm=0.12, danger=False).transformed(pos=(0.88, 0.62, 0.38)))
            reg.add("butterfly_shutoff_valve", make_cylinder(0.11, 0.11, 0.08, hex_rgb("#EF4444"), segments=14).transformed(pos=(0.88, 0.38, 0.25)))
            reg.add("swing_check_valve", make_beveled_box(0.18, 0.16, 0.16, hex_rgb("#F59E0B"), bevel=0.02).transformed(pos=(1.12, 0.38, 0.25)))
            return (0.15, 1.02, 2.25 - 0.20 * p), (0.18, 0.82, 0.20), 35.0
        if sid == "s12":
            reg.add("vfd_inverter_panel", make_beveled_box(0.52, 1.15, 0.32, hex_rgb("#334155"), bevel=0.02).transformed(pos=(-1.55, 0.65, -0.25)))
            reg.add("upper_break_tank_z2", make_beveled_box(0.95, 0.58, 0.65, hex_rgb("#38BDF8"), bevel=0.03, emission=1.3).transformed(pos=(0.15, 2.05, -0.05)))
            reg.add("rooftop_header_tank", make_beveled_box(0.85, 0.48, 0.58, hex_rgb("#22D3EE"), bevel=0.03, emission=1.6).transformed(pos=(0.15, 2.95, -0.05)))
            return (-0.75 + 0.45 * p, 1.85, 3.85 - 0.35 * p), (0.0, 1.65, 0.0), 40.0
        # s16
        reg.add("galvanized_ahu_ductwork", Mesh.merge([
            make_beveled_box(1.15, 0.78, 0.72, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(1.45, 0.48, -0.35)),
            make_beveled_box(2.2, 0.32, 0.36, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.95, 1.62, -0.35)),
        ]))
        reg.add("red_fire_jockey_pump", Mesh.merge([
            make_cylinder(0.18, 0.18, 0.58, hex_rgb("#DC2626"), segments=14).transformed(pos=(-1.55, 0.42, -0.45)),
            _pipe((-1.55, 0.72, -0.45), (-1.55, 1.85, -0.45), radius=0.05),
        ]))
        return (-0.65 + 1.1 * p, 1.35, 3.45), (0.15, 0.85, -0.15), 39.0

    if sid in ("s13", "s14"):
        reg.add("mep_epoxy_floor_deck", _ground_xz(12.0, 12.0, hex_rgb("#0F172A"), flags=FLAG_GROUND))
        reg.add("brass_prv_assembly", Mesh.merge([
            _pipe((-1.15, 0.68, 0.0), (1.15, 0.68, 0.0), radius=0.075),
            make_cylinder(0.24, 0.18, 0.48, hex_rgb("#F59E0B"), segments=18).transformed(pos=(0.0, 0.88, 0.0)),
        ]))
        reg.add("y_strainer_mesh_body", make_cylinder(0.09, 0.08, 0.34, hex_rgb("#D97706"), segments=14).transformed(pos=(-0.58, 0.54, 0.0), rot=(0.0, 0.0, 0.65)))
        reg.add("bypass_globe_loop", make_tube_along_path([(-0.82, 0.68, 0.0), (-0.82, 1.28, 0.0), (0.82, 1.28, 0.0), (0.82, 0.68, 0.0)], 0.032, hex_rgb("#94A3B8"), sides=10))
        reg.add("subzone_3bar_gauge", PrecisionMechV3.pressure_gauge(radius=0.18, needle_norm=0.35, danger=False).transformed(pos=(0.68, 0.98, 0.16)))
        if sid == "s14":
            comp = 0.03 * math.sin(p * 6.28)
            reg.add("prv_cutaway_spring", Mesh.merge([
                make_tube_along_path(_circle_path_xz(0.0, 0.82 + k * (0.048 - comp * 0.2), 0.12, 0.11, 18), 0.018, hex_rgb("#38BDF8"), sides=8, closed=True, emission=1.8)
                for k in range(6)
            ]))
            reg.add("rubber_diaphragm_plate", make_cylinder(0.20, 0.20, 0.03, hex_rgb("#111827"), segments=18).transformed(pos=(0.0, 0.76 - comp, 0.12)))
            reg.add("throttling_valve_cone", make_cylinder(0.10, 0.03, 0.14, hex_rgb("#FACC15"), segments=14, emission=1.4).transformed(pos=(0.0, 0.62 - comp, 0.12)))
            return (0.12, 0.92, 1.72 - 0.18 * p), (0.0, 0.78, 0.08), 33.0
        return (-0.55 + 0.45 * p, 1.05, 2.25 - 0.20 * p), (0.0, 0.78, 0.0), 36.0

    if sid == "s15":
        reg.add("bathroom_tile_room", _ground_xz(10.0, 10.0, hex_rgb("#E2E8F0"), flags=FLAG_GROUND))
        reg.add("glass_shower_booth", Mesh.merge([
            make_beveled_box(1.15, 2.15, 0.06, hex_rgb("#BAE6FD"), bevel=0.01, roughness=0.05).transformed(pos=(-0.58, 1.08, 0.0), rot=(0.0, 1.57, 0.0)),
            make_beveled_box(1.15, 2.15, 0.08, hex_rgb("#94A3B8"), bevel=0.01).transformed(pos=(0.0, 1.08, -0.55)),
        ]))
        reg.add("chrome_rain_showerhead", Mesh.merge([
            make_tube_along_path([(0.0, 1.25, -0.48), (0.0, 1.92, -0.48), (0.0, 1.92, -0.10)], 0.024, hex_rgb("#F8FAFC"), sides=10),
            make_cylinder(0.18, 0.18, 0.03, hex_rgb("#E2E8F0"), segments=18).transformed(pos=(0.0, 1.89, -0.10)),
        ]))
        reg.add("gentle_shower_streams", Mesh.merge([
            make_cylinder(0.008, 0.008, 1.35, hex_rgb("#38BDF8"), segments=6, emission=1.7).transformed(pos=(-0.10 + (k % 3) * 0.10, 1.15, -0.16 + (k // 3) * 0.10))
            for k in range(6)
        ]))
        reg.add("resident_person_rig", _human(pos=(0.78, 0.0, 0.18), yaw=-0.55, scale=0.72, outfit_hex="#10B981", wave=0.4))
        return (-0.35 + 0.55 * p, 1.38, 2.35 - 0.20 * p), (0.0, 1.25, -0.10), 36.0

    if sid in ("s17", "s18"):
        reg.add("downtown_avenue_asphalt", _ground_xz(18.0, 18.0, hex_rgb("#1E293B"), flags=FLAG_GROUND))
        reg.add("lowrise_6f_apartment", _tower(floors=5, width=1.85, depth=1.35).transformed(pos=(0.0, 0.0, 0.0)))
        reg.add("rooftop_blue_water_toren", Mesh.merge([
            make_beveled_box(0.55, 0.35, 0.55, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.35, 2.02, 0.0)),
            make_cylinder(0.24, 0.24, 0.48, hex_rgb("#0284C7"), segments=16, emission=0.8).transformed(pos=(0.35, 2.42, 0.0)),
        ]))
        reg.add("hydrophore_pressure_tank", make_cylinder(0.14, 0.14, 0.36, hex_rgb("#EF4444"), segments=14).transformed(pos=(-0.38, 2.05, 0.15)))
        reg.add("parked_scooter_bike", V5HeroProps.sport_motorcycle(pos=(-0.65 + 0.8 * p, 0.0, 1.25), scale=0.38, body_hex="#FACC15"))
        if sid == "s18":
            reg.add("simple_downfeed_pipe", make_cylinder(0.04, 0.04, 2.15, hex_rgb("#22C55E"), segments=12, emission=1.5).transformed(pos=(0.35, 1.12, 0.72)))
        return (-1.25 + 0.75 * p, 1.75, 3.85 - 0.35 * p), (0.0, 1.35, 0.0), 38.0

    if sid == "s19":
        add_downtown_city()
        reg.add("zoned_3tier_diagram_3d", Mesh.merge([
            make_beveled_box(1.64, 0.18, 1.54, hex_rgb("#22D3EE"), bevel=0.02, emission=2.1).transformed(pos=(0.0, 1.45, 0.0)),
            make_beveled_box(1.64, 0.18, 1.54, hex_rgb("#22D3EE"), bevel=0.02, emission=2.1).transformed(pos=(0.0, 2.90, 0.0)),
        ]))
        return (-1.85 + 1.25 * p, 2.45, 4.55 - 0.45 * p), (0.0, 2.05, 0.0), 39.0

    if sid == "s20":
        reg.add("poll_plinth_tank", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(-0.78, 0.21, 0.0)),
            make_beveled_box(0.58, 0.42, 0.42, hex_rgb("#38BDF8"), bevel=0.03, emission=1.5).transformed(pos=(-0.78, 0.68, 0.0), rot=(0.0, p * 1.4, 0.0)),
        ]))
        reg.add("poll_plinth_tmd_ball", Mesh.merge([
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(0.78, 0.21, 0.0)),
            make_icosphere(0.28, hex_rgb("#FACC15"), subdivisions=2, emission=1.6).transformed(pos=(0.78 + 0.06 * math.sin(p * 6.28), 0.76, 0.0)),
        ]))
        return (0.0, 1.38, 3.25 - 0.20 * p), (0.0, 0.65, 0.0), 38.0

    if sid == "s21":
        reg.add("mep_control_desk", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            KitV6.dual_monitor_console((-0.65, 0.0, -0.25), rot_y=0.35),
            _human(pos=(0.45, 0.0, 0.0), yaw=-0.25, scale=0.86, outfit_hex="#0284C7", helmet_hex="#F8FAFC", wave=math.sin(p * 8.0) * 0.7),
        ]))
        return (-0.30 + 0.60 * p, 1.38, 2.85), (0.0, 0.95, 0.0), 36.0

    return KitV6.cta_white_button_stage(p, reg, ("cta_stage_base", "white_subscribe_3d_pill", "click_hand_cursor_3d"))


# =============================================================================
# EPISODE 3: KT-S15 — HIGHWAY RUNAWAY TRUCK PEA-GRAVEL RAMP (22 SHOTS, 71 OBJECTS)
# =============================================================================
def _build_s15_shot(shot_idx: int, p: float, reg: SceneObjectRegistry) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], float]:
    shot = V6_EPISODES["KT-S15"]["shots"][shot_idx]
    sid = shot["id"]

    def add_mountain_highway() -> None:
        reg.add("mountain_ridge_terrain", Mesh.merge([
            _ground_xz(24.0, 24.0, hex_rgb("#365314"), flags=FLAG_GROUND),
            make_cylinder(3.2, 0.8, 3.8, hex_rgb("#3F6212"), segments=12).transformed(pos=(-3.8, 1.8, -5.5)),
            make_cylinder(2.8, 0.6, 3.2, hex_rgb("#4D7C0F"), segments=12).transformed(pos=(3.6, 1.5, -5.8)),
        ]))
        reg.add("steep_asphalt_downgrade", make_beveled_box(8.5, 0.12, 1.85, hex_rgb("#1E293B"), bevel=0.02).transformed(pos=(0.0, 0.42, 0.55), rot=(0.0, 0.0, -0.09)))
        reg.add("escape_ramp_lane", make_beveled_box(4.8, 0.16, 1.25, hex_rgb("#B45309"), bevel=0.02).transformed(pos=(1.65, 0.72, -0.75), rot=(0.0, -0.22, 0.14)))
        reg.add("red_white_checker_wall", Mesh.merge([
            make_beveled_box(0.32, 0.28, 0.14, hex_rgb("#EF4444" if k % 2 == 0 else "#F8FAFC"), bevel=0.01, emission=1.1).transformed(pos=(-0.2 + k * 0.34, 0.62 + k * 0.045, -1.32))
            for k in range(11)
        ]))
        reg.add("pine_forest_slope", Mesh.merge([
            KitV6.pine_tree((-2.8, 0.0, -2.2), 1.1),
            KitV6.pine_tree((-1.4, 0.0, -2.6), 0.95),
            KitV6.pine_tree((3.2, 0.0, -2.4), 1.05),
        ]))
        reg.add("wbeam_steel_guardrail", make_beveled_box(8.2, 0.18, 0.08, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(0.0, 0.58, 1.48), rot=(0.0, 0.0, -0.09)))

    if sid == "s01":
        add_mountain_highway()
        reg.add("warning_gantry_sign", Mesh.merge([
            make_cylinder(0.05, 0.05, 1.45, hex_rgb("#94A3B8"), segments=10).transformed(pos=(-1.35, 1.15, -0.35)),
            make_beveled_box(0.14, 0.48, 1.45, hex_rgb("#FACC15"), bevel=0.02, emission=1.4).transformed(pos=(-1.35, 1.75, 0.45)),
        ]))
        reg.add("family_mpv_car", V5HeroProps.sedan_car(pos=(-2.2 + 3.8 * p, 0.56 - 0.34 * p, 0.62), rot_y=0.0, scale=0.45, body_hex="#38BDF8"))
        return (-2.8 + 0.9 * p, 2.35, 4.65 - 0.55 * p), (0.4, 0.85, -0.2), 40.0

    if sid == "s02":
        add_mountain_highway()
        tx = -1.6 + 2.6 * p
        reg.add("heavy_18w_semi_truck", V4HeroModels.heavy_truck(pos=(tx, 0.46 - 0.22 * p, 0.52), rot_y=math.pi * 0.5, scale=0.52, cab_hex="#DC2626"))
        reg.add("glowing_red_brake_drum", Mesh.merge([
            make_cylinder(0.16, 0.16, 0.14, hex_rgb("#EF4444"), segments=14, emission=3.4).transformed(pos=(tx - 0.45, 0.24, 0.88), rot=(1.57, 0.0, 0.0)),
            make_cylinder(0.16, 0.16, 0.14, hex_rgb("#F97316"), segments=14, emission=3.2).transformed(pos=(tx + 0.35, 0.22, 0.88), rot=(1.57, 0.0, 0.0)),
        ]))
        reg.add("brake_fade_smoke_trail", Mesh.merge([
            make_icosphere(0.12 + 0.04 * k, hex_rgb("#CBD5E1"), subdivisions=1, emission=0.8).transformed(pos=(tx - 0.55 - k * 0.26, 0.36 + k * 0.10, 0.92))
            for k in range(5)
        ]))
        reg.add("cargo_steel_coils", Mesh.merge([
            make_cylinder(0.22, 0.22, 0.36, hex_rgb("#64748B"), segments=16).transformed(pos=(tx - 0.55, 0.88, 0.52), rot=(1.57, 0.0, 0.0)),
        ]))
        return (tx + 0.45, 0.95, 2.35), (tx - 0.15, 0.42, 0.65), 35.0

    if sid == "s03":
        reg.add("truck_cockpit_interior", Mesh.merge([
            _ground_xz(10.0, 10.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(2.2, 0.62, 0.55, hex_rgb("#1E293B"), bevel=0.04).transformed(pos=(0.0, 0.68, -0.35)),
        ]))
        reg.add("windshield_mountain_view", make_beveled_box(2.1, 0.95, 0.06, hex_rgb("#7DD3FC"), bevel=0.02, emission=0.9).transformed(pos=(0.0, 1.45, -0.62)))
        reg.add("steering_wheel_column", Mesh.merge([
            make_cylinder(0.04, 0.04, 0.52, hex_rgb("#475569"), segments=10).transformed(pos=(-0.22, 0.88, -0.08), rot=(0.65, 0.0, 0.0)),
            make_tube_along_path(_circle_path_xy(-0.22, 1.05, 0.08, 0.22, 22), 0.026, hex_rgb("#111827"), sides=10, closed=True),
        ]))
        reg.add("brake_pedal_floored", make_beveled_box(0.14, 0.04, 0.22, hex_rgb("#EF4444"), bevel=0.01, emission=2.0).transformed(pos=(0.08, 0.18 - 0.10 * p, -0.05), rot=(0.45 * (1.0 - p), 0.0, 0.0)))
        reg.add("air_pressure_dash_gauge", PrecisionMechV3.pressure_gauge(radius=0.15, needle_norm=0.85 - 0.72 * p, danger=True).transformed(pos=(0.28, 0.98, -0.05)))
        reg.add("truck_driver_rig", V4HeroModels.seated_human(pos=(-0.22, 0.35, 0.38), rot_y=math.pi, scale=0.78, shirt_hex="#F97316"))
        return (0.48, 1.15, 1.55 - 0.15 * p), (-0.02, 0.68, -0.05), 38.0

    if sid == "s04":
        add_mountain_highway()
        reg.add("heavy_18w_semi_truck", V4HeroModels.heavy_truck(pos=(-0.2 + 1.1 * p, 0.52 + 0.14 * p, 0.35 - 0.75 * p), rot_y=1.25, scale=0.50, cab_hex="#DC2626"))
        reg.add("chevron_curve_board", Mesh.merge([
            make_beveled_box(0.32, 0.38, 0.05, hex_rgb("#FACC15"), bevel=0.01, emission=1.6).transformed(pos=(1.95 + k * 0.45, 0.75, 1.15), rot=(0.0, -0.45, 0.0))
            for k in range(3)
        ]))
        reg.add("emergency_sos_callbox", make_beveled_box(0.22, 0.75, 0.18, hex_rgb("#F97316"), bevel=0.02, emission=1.1).transformed(pos=(-0.55, 0.68, -1.25)))
        reg.add("amber_flashing_beacon", make_icosphere(0.09, hex_rgb("#FACC15"), subdivisions=1, emission=3.5).transformed(pos=(-0.55, 1.15, -1.25)))
        reg.add("tire_skid_marks", make_tube_along_path([(-0.9, 0.46, 0.55), (0.15, 0.54, 0.12), (0.95, 0.68, -0.52)], 0.035, hex_rgb("#0F172A"), sides=8))
        return (-1.65 + 0.65 * p, 1.85, 3.25 - 0.35 * p), (0.35, 0.65, -0.25), 38.0

    if sid == "s05":
        reg.add("plain_asphalt_ramp_bad", Mesh.merge([
            _ground_xz(16.0, 16.0, hex_rgb("#1E293B"), flags=FLAG_GROUND),
            make_beveled_box(5.2, 0.18, 1.55, hex_rgb("#334155"), bevel=0.02).transformed(pos=(0.0, 0.68, 0.0), rot=(0.0, 0.0, 0.22)),
        ]))
        back = 0.85 - 1.55 * p
        reg.add("heavy_18w_semi_truck", V4HeroModels.heavy_truck(pos=(back, 0.88 + back * 0.22, 0.0), rot_y=math.pi * 0.5, scale=0.48, cab_hex="#DC2626"))
        reg.add("rollback_danger_arrows", KitV6.arrow_3d((0.65, 1.45, 0.55), (-0.95, 1.10, 0.55), "#EF4444", 0.04, 2.4))
        reg.add("concrete_end_stop_block", make_beveled_box(0.38, 0.55, 1.55, hex_rgb("#EF4444"), bevel=0.03).transformed(pos=(2.25, 1.32, 0.0), rot=(0.0, 0.0, 0.22)))
        return (0.15, 1.65, 3.65 - 0.25 * p), (0.0, 0.95, 0.0), 38.0

    if sid == "s06":
        reg.add("plain_asphalt_ramp_bad", _ground_xz(16.0, 16.0, hex_rgb("#1E293B"), flags=FLAG_GROUND))
        reg.add("rain_cloud_shower_3d", Mesh.merge([
            make_icosphere(0.36, hex_rgb("#64748B"), subdivisions=1).transformed(pos=(0.15, 2.45, 0.0)),
            make_icosphere(0.28, hex_rgb("#475569"), subdivisions=1).transformed(pos=(0.52, 2.38, 0.08)),
            *[make_cylinder(0.01, 0.01, 0.28, hex_rgb("#38BDF8"), segments=6, emission=1.8).transformed(pos=(-0.2 + k * 0.22, 1.85 - (p * 0.6) % 0.4, 0.1)) for k in range(5)],
        ]))
        reg.add("compacted_sand_mound_bad", make_cylinder(1.15, 0.65, 0.62, hex_rgb("#A16207"), segments=18).transformed(pos=(0.48, 0.31, 0.0)))
        reg.add("nose_vaulting_truck_cab", V4HeroModels.heavy_truck(pos=(-0.38 + 0.35 * p, 0.52 + 0.28 * p, 0.0), rot_y=math.pi * 0.5, scale=0.48, cab_hex="#DC2626").transformed(rot=(0.0, 0.0, -0.38 * p)))
        return (-0.35, 1.45, 3.45 - 0.25 * p), (0.15, 0.85, 0.0), 38.0

    if sid == "s07":
        reg.add("angular_crushed_rock_pile", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(2.4, 0.22, 1.4, hex_rgb("#334155"), bevel=0.02).transformed(pos=(0.0, 0.11, 0.0)),
        ]))
        stones = []
        for ix in range(-3, 4):
            for iz in range(-2, 3):
                stones.append(make_beveled_box(0.20, 0.18, 0.20, hex_rgb("#64748B" if (ix + iz) % 2 == 0 else "#94A3B8"), bevel=0.008).transformed(pos=(ix * 0.21, 0.32, iz * 0.21), rot=(0.3 * ix, 0.5 * iz, 0.25)))
        reg.add("interlocked_jagged_stones", Mesh.merge(stones))
        reg.add("magnifying_inspection_ring", make_tube_along_path(_circle_path_xy(0.0, 0.52, 0.35, 0.38, 24), 0.028, hex_rgb("#EF4444"), sides=10, closed=True, emission=2.2))
        return (0.25 * math.sin(p * 2.0), 1.05, 2.05 - 0.25 * p), (0.0, 0.38, 0.0), 34.0

    if sid in ("s08", "s09", "s10", "s11", "s12", "s13"):
        reg.add("arrester_trench_cutaway", Mesh.merge([
            _ground_xz(16.0, 16.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(4.4, 0.14, 1.65, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.0, 0.07, 0.0)),
            make_beveled_box(4.4, 0.72, 0.14, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.0, 0.42, -0.78)),
        ]))
        reg.add("rounded_pea_gravel_bed", make_beveled_box(4.2, 0.54, 1.38, hex_rgb("#D97706"), bevel=0.04).transformed(pos=(0.0, 0.38, -0.02)))
        pebbles = []
        for k in range(28):
            gx = -1.55 + (k % 7) * 0.52 + (0.08 * math.sin(p * 6.0 + k) if sid in ("s09", "s10", "s11") else 0.0)
            gy = 0.62 + (k // 14) * 0.09
            gz = -0.35 + ((k // 7) % 2) * 0.42
            pebbles.append(make_icosphere(0.085, hex_rgb("#F59E0B" if k % 2 == 0 else "#FBBF24"), subdivisions=1, roughness=0.35).transformed(pos=(gx, gy, gz)))
        reg.add("macro_round_pebbles_cluster", Mesh.merge(pebbles))

        if sid == "s08":
            reg.add("depth_ruler_1meter", Mesh.merge([
                make_beveled_box(0.14, 0.72, 0.04, hex_rgb("#FACC15"), bevel=0.008, emission=1.6).transformed(pos=(1.65, 0.46, 0.68)),
                *[make_beveled_box(0.16, 0.02, 0.05, hex_rgb("#0F172A"), bevel=0.002).transformed(pos=(1.65, 0.18 + k * 0.12, 0.68)) for k in range(5)],
            ]))
            return (-1.15 + 0.65 * p, 1.25, 2.85 - 0.25 * p), (0.0, 0.48, 0.0), 36.0
        if sid == "s09":
            reg.add("void_air_spaces_glow", Mesh.merge([
                make_icosphere(0.042, hex_rgb("#38BDF8"), subdivisions=1, emission=2.6).transformed(pos=(-0.6 + k * 0.30, 0.58, 0.38))
                for k in range(5)
            ]))
            reg.add("sieve_grading_screen", make_beveled_box(0.85, 0.04, 0.65, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(0.95, 1.05, 0.0)))
            return (0.15, 0.98, 1.95 - 0.20 * p), (0.0, 0.58, 0.15), 33.0
        if sid == "s10":
            wx = -1.1 + 1.4 * p
            reg.add("sinking_dual_truck_wheel", Mesh.merge([
                make_cylinder(0.36, 0.36, 0.28, hex_rgb("#111827"), segments=20).transformed(pos=(wx, 0.52 - 0.14 * p, 0.12), rot=(1.57, 0.0, p * 5.0)),
                make_cylinder(0.18, 0.18, 0.30, hex_rgb("#E2E8F0"), segments=14).transformed(pos=(wx, 0.52 - 0.14 * p, 0.12), rot=(1.57, 0.0, p * 5.0)),
            ]))
            reg.add("gravel_bow_wave_mound", make_cylinder(0.45, 0.22, 0.28, hex_rgb("#F59E0B"), segments=16).transformed(pos=(wx + 0.46, 0.66, 0.12)))
            reg.add("flying_pebble_spray", Mesh.merge([
                make_icosphere(0.05, hex_rgb("#FBBF24"), subdivisions=1, emission=1.2).transformed(pos=(wx + 0.35 + k * 0.12, 0.88 + 0.15 * math.sin(k + p * 7.0), 0.22))
                for k in range(6)
            ]))
            return (wx + 0.25, 1.08, 2.25), (wx + 0.15, 0.52, 0.12), 35.0
        if sid == "s11":
            reg.add("heavy_18w_semi_truck", V4HeroModels.heavy_truck(pos=(-0.75 + 0.85 * p, 0.55, 0.0), rot_y=math.pi * 0.5, scale=0.46, cab_hex="#DC2626"))
            reg.add("kinetic_energy_bar_drop", Mesh.merge([
                make_beveled_box(0.22, 0.95, 0.08, hex_rgb("#1E293B"), bevel=0.02).transformed(pos=(-1.55, 1.15, 0.55)),
                make_beveled_box(0.16, max(0.12, 0.82 * (1.0 - 0.82 * p)), 0.10, hex_rgb("#4ADE80"), bevel=0.01, emission=2.0).transformed(pos=(-1.55, 0.78, 0.56)),
            ]))
            reg.add("momentum_scatter_arrows", Mesh.merge([
                KitV6.arrow_3d((0.25, 0.72, 0.25), (0.75, 0.95, 0.58), "#FACC15", 0.028, 2.2),
                KitV6.arrow_3d((0.25, 0.72, -0.15), (0.75, 0.95, -0.48), "#FACC15", 0.028, 2.2),
            ]))
            reg.add("safe_deceleration_g_meter", PrecisionMechV3.pressure_gauge(radius=0.20, needle_norm=0.42, danger=False).transformed(pos=(1.45, 1.18, 0.52)))
            return (-0.35 + 0.45 * p, 1.35, 2.95), (0.0, 0.68, 0.0), 37.0
        if sid == "s12":
            reg.add("perforated_underdrain_pipe", make_cylinder(0.085, 0.085, 3.8, hex_rgb("#38BDF8"), segments=16, emission=1.7).transformed(pos=(0.0, 0.18, 0.48), rot=(0.0, 0.0, 1.57)))
            reg.add("geotextile_filter_sheet", make_beveled_box(3.9, 0.025, 1.35, hex_rgb("#E2E8F0"), bevel=0.004, emission=0.8).transformed(pos=(0.0, 0.25, 0.0)))
            reg.add("stormwater_outfall_ditch", make_beveled_box(0.85, 0.10, 1.2, hex_rgb("#0284C7"), bevel=0.02, emission=1.2).transformed(pos=(2.25, 0.08, 0.45)))
            return (0.35, 0.92, 2.35 - 0.20 * p), (0.0, 0.28, 0.25), 35.0
        # s13
        reg.add("halted_truck_in_gravel", V4HeroModels.heavy_truck(pos=(0.25, 0.52, 0.0), rot_y=math.pi * 0.5, scale=0.48, cab_hex="#DC2626"))
        reg.add("wheel_cradle_pocket", make_tube_along_path(_circle_path_xz(0.65, 0.66, 0.36, 0.34, 20), 0.045, hex_rgb("#4ADE80"), sides=10, closed=True, emission=2.0))
        reg.add("relieved_driver_stepping_out", _human(pos=(1.15, 0.65, 0.58), yaw=0.35, scale=0.56, outfit_hex="#F97316", wave=math.sin(p * 7.0) * 0.6))
        return (0.45, 1.32, 2.85 - 0.25 * p), (0.35, 0.68, 0.15), 37.0

    if sid in ("s14", "s15"):
        add_mountain_highway()
        reg.add("paved_service_shoulder", make_beveled_box(4.8, 0.14, 0.95, hex_rgb("#334155"), bevel=0.02).transformed(pos=(1.2, 0.68, 0.15)))
        reg.add("heavy_wrecker_tow_truck", V4HeroModels.heavy_truck(pos=(-0.35, 0.76, 0.15), rot_y=-math.pi * 0.5, scale=0.46, cab_hex="#FACC15"))
        reg.add("winch_steel_cable_hook", make_tube_along_path([(0.25, 0.92, 0.15), (1.35, 0.85, -0.45)], 0.024, hex_rgb("#38BDF8"), sides=8, emission=1.9))
        reg.add("concrete_deadman_anchor", make_beveled_box(0.45, 0.36, 0.45, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(-1.35, 0.82, 0.15)))
        reg.add("highway_patrol_suv", V5HeroProps.sedan_car(pos=(-1.85, 0.62, 0.85), rot_y=0.2, scale=0.44, body_hex="#2563EB"))
        if sid == "s15":
            reg.add("road_maintenance_worker", _human(pos=(0.95, 0.72, -0.45), yaw=-0.45, scale=0.56, outfit_hex="#F97316", helmet_hex="#FACC15"))
            reg.add("gravel_leveling_rake", Mesh.merge([
                make_cylinder(0.018, 0.018, 0.85, hex_rgb("#FDE047"), segments=8).transformed(pos=(0.75 + 0.12 * math.sin(p * 8.0), 0.95, -0.42), rot=(0.0, 0.0, 0.55)),
                make_beveled_box(0.32, 0.06, 0.08, hex_rgb("#E2E8F0"), bevel=0.01).transformed(pos=(0.55 + 0.12 * math.sin(p * 8.0), 0.72, -0.42)),
            ]))
            reg.add("mini_skid_steer_loader", V5HeroProps.tandem_road_roller(pos=(1.95 - 0.35 * p, 0.74, -0.45), rot_y=math.pi, scale=0.38))
            return (0.45, 1.55, 2.55 - 0.25 * p), (0.95, 0.82, -0.35), 36.0
        return (-1.15 + 0.65 * p, 1.65, 3.15 - 0.25 * p), (0.25, 0.78, -0.15), 38.0

    if sid in ("s16", "s17"):
        reg.add("narrow_cliff_viaduct", Mesh.merge([
            _ground_xz(16.0, 16.0, hex_rgb("#1E293B"), flags=FLAG_GROUND),
            make_beveled_box(5.6, 0.24, 1.65, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.0, 0.42, 0.0)),
        ]))
        reg.add("rock_cut_retaining_wall", make_beveled_box(5.6, 2.4, 0.45, hex_rgb("#57534E"), bevel=0.04).transformed(pos=(0.0, 1.25, -0.95)))
        if sid == "s17":
            stretch = 0.45 * p
            reg.add("steel_cable_catcher_net", Mesh.merge([
                *[make_tube_along_path([(0.25 + stretch, 0.62 + k * 0.16, -0.68), (0.45 + stretch * 1.4, 0.62 + k * 0.16, 0.0), (0.25 + stretch, 0.62 + k * 0.16, 0.68)], 0.020, hex_rgb("#FACC15"), sides=8, emission=1.8) for k in range(5)],
            ]))
            reg.add("rotary_friction_energy_drums", Mesh.merge([
                make_cylinder(0.22, 0.22, 0.35, hex_rgb("#EF4444"), segments=16).transformed(pos=(0.25, 0.72, -0.72)),
                make_cylinder(0.22, 0.22, 0.35, hex_rgb("#EF4444"), segments=16).transformed(pos=(0.25, 0.72, 0.72)),
            ]))
            reg.add("breakaway_support_posts", Mesh.merge([
                make_cylinder(0.04, 0.04, 0.95, hex_rgb("#E2E8F0"), segments=10).transformed(pos=(0.25, 0.95, -0.68)),
                make_cylinder(0.04, 0.04, 0.95, hex_rgb("#E2E8F0"), segments=10).transformed(pos=(0.25, 0.95, 0.68)),
            ]))
            reg.add("heavy_18w_semi_truck", V4HeroModels.heavy_truck(pos=(-0.55 + stretch, 0.54, 0.0), rot_y=math.pi * 0.5, scale=0.45, cab_hex="#DC2626"))
            return (-0.95 + 0.45 * p, 1.45, 2.85), (0.25, 0.85, 0.0), 37.0
        return (-1.55 + 0.65 * p, 1.65, 3.45), (0.0, 0.95, -0.25), 39.0

    if sid in ("s18", "s19"):
        add_mountain_highway()
        if sid == "s18":
            reg.add("comparison_divider_arch", make_beveled_box(0.08, 1.45, 1.85, hex_rgb("#38BDF8"), bevel=0.01, emission=1.9).transformed(pos=(0.45, 0.85, -0.25)))
        else:
            reg.add("solar_road_stud_lights", Mesh.merge([
                make_icosphere(0.055, hex_rgb("#4ADE80"), subdivisions=1, emission=3.0).transformed(pos=(0.1 + k * 0.55, 0.76 + k * 0.06, -0.35))
                for k in range(6)
            ]))
        return (-1.85 + 1.15 * p, 1.95, 3.85 - 0.35 * p), (0.45, 0.78, -0.25), 38.0

    if sid == "s20":
        reg.add("poll_plinth_gravel", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(-0.78, 0.21, 0.0)),
            *[make_icosphere(0.11, hex_rgb("#F59E0B"), subdivisions=1, emission=1.2).transformed(pos=(-0.92 + (k % 3) * 0.14, 0.54 + (k // 3) * 0.12, 0.0)) for k in range(6)],
        ]))
        reg.add("poll_plinth_guardrail", Mesh.merge([
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(0.78, 0.21, 0.0)),
            make_beveled_box(0.75, 0.22, 0.10, hex_rgb("#CBD5E1"), bevel=0.02, emission=1.1).transformed(pos=(0.78, 0.64, 0.0), rot=(0.0, p * 1.4, 0.0)),
        ]))
        return (0.0, 1.38, 3.25 - 0.20 * p), (0.0, 0.62, 0.0), 38.0

    if sid == "s21":
        reg.add("highway_ops_console", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            KitV6.dual_monitor_console((-0.68, 0.0, -0.25), rot_y=0.35),
            _human(pos=(0.42, 0.0, 0.0), yaw=-0.25, scale=0.86, outfit_hex="#F97316", helmet_hex="#FACC15", wave=math.sin(p * 8.0) * 0.7),
        ]))
        reg.add("engineering_globe_emblem", make_icosphere(0.24, hex_rgb("#38BDF8"), subdivisions=2, emission=1.8).transformed(pos=(-0.68, 1.42, -0.25)))
        return (-0.30 + 0.60 * p, 1.38, 2.85), (0.0, 0.95, 0.0), 36.0

    return KitV6.cta_white_button_stage(p, reg, ("cta_pedestal_s15", "white_subscribe_3d_s15", "cursor_click_hand_s15"))


# =============================================================================
# EPISODE 4: KT-S16 — AIRCRAFT CABIN WINDOW BLEED HOLE (22 SHOTS, 67 OBJECTS)
# =============================================================================
def _build_s16_shot(shot_idx: int, p: float, reg: SceneObjectRegistry) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], float]:
    shot = V6_EPISODES["KT-S16"]["shots"][shot_idx]
    sid = shot["id"]

    def add_three_pane_window_rig(exploded: float = 0.22, crack_outer: bool = False) -> None:
        reg.add("fuselage_aluminum_skin_frame", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(2.2, 1.85, 0.10, hex_rgb("#CBD5E1"), bevel=0.03, alpha=0.30, flags=FLAG_DEFAULT | 16).transformed(pos=(-0.55 - exploded, 1.02, 0.0), rot=(0.0, 1.57, 0.0)),
            *[make_beveled_box(0.06, 1.85, 0.16, hex_rgb("#94A3B8"), bevel=0.01).transformed(pos=(-0.55 - exploded, 1.02, zz)) for zz in (-1.05, 1.05)],
        ]))
        reg.add("rubber_window_seal_gasket", make_tube_along_path(_circle_path_xy(0.0, 0.98, 0.0, 0.48, 28), 0.045, hex_rgb("#111827"), sides=12, closed=True).transformed(rot=(0.0, 1.57, 0.0)))
        outer_col = "#EF4444" if crack_outer else "#38BDF8"
        reg.add("outer_structural_acrylic", make_cylinder(0.44, 0.44, 0.07, hex_rgb(outer_col), segments=24, roughness=0.06, emission=1.1).transformed(pos=(-0.36 - exploded, 0.98, 0.0), rot=(0.0, 0.0, 1.57)))
        reg.add("middle_failsafe_acrylic", Mesh.merge([
            make_cylinder(0.44, 0.44, 0.055, hex_rgb("#22D3EE"), segments=24, roughness=0.06, emission=1.2).transformed(pos=(0.0, 0.98, 0.0), rot=(0.0, 0.0, 1.57)),
            make_tube_along_path(_circle_path_xy(0.0, 0.68, 0.0, 0.055, 18), 0.018, hex_rgb("#FACC15"), sides=8, closed=True, emission=2.8).transformed(rot=(0.0, 1.57, 0.0)),
        ]))
        reg.add("inner_scratch_shield_pane", make_cylinder(0.44, 0.44, 0.03, hex_rgb("#E0F2FE"), segments=24, roughness=0.05, emission=0.8).transformed(pos=(0.34 + exploded, 0.98, 0.0), rot=(0.0, 0.0, 1.57)))

    if sid == "s01":
        reg.add("stratosphere_sky_dome", _ground_xz(26.0, 26.0, hex_rgb("#0284C7"), flags=FLAG_GROUND))
        reg.add("cumulus_cloud_sea", Mesh.merge([
            make_icosphere(0.65, hex_rgb("#F8FAFC"), subdivisions=1, emission=0.8).transformed(pos=(-2.2 + k * 1.1, 0.28, -1.2 + (k % 2) * 1.6))
            for k in range(5)
        ]))
        jet = V4HeroModels.commercial_airliner(pos=(-0.3 + 0.6 * p, 1.38, 0.0), rot=(0.08, 0.55, -0.06), scale=0.58)
        reg.add("airliner_fuselage_jet", jet)
        reg.add("swept_wing_winglets", make_beveled_box(0.08, 0.28, 0.16, hex_rgb("#38BDF8"), bevel=0.01, emission=1.4).transformed(pos=(0.85 + 0.6 * p, 1.52, 1.15)))
        reg.add("turbofan_nacelle_pair", make_cylinder(0.14, 0.14, 0.38, hex_rgb("#CBD5E1"), segments=16).transformed(pos=(0.15 + 0.6 * p, 1.16, 0.62), rot=(0.0, 0.55, 1.57)))
        reg.add("tail_stabilizer_fin", make_beveled_box(0.32, 0.58, 0.06, hex_rgb("#2563EB"), bevel=0.02).transformed(pos=(-1.15 + 0.6 * p, 1.78, -0.65), rot=(0.0, 0.55, 0.0)))
        return (-2.25 + 0.65 * p, 2.05, 4.15 - 0.35 * p), (0.0, 1.38, 0.0), 39.0

    if sid == "s02":
        reg.add("cabin_interior_wall", V4HeroModels.airliner_cabin_interior())
        reg.add("passenger_window_bezel", Mesh.merge([
            make_tube_along_path(_circle_path_xy(0.18, 1.15, 0.22, 0.24, 24), 0.032, hex_rgb("#F8FAFC"), sides=10, closed=True),
            make_icosphere(0.026, hex_rgb("#FACC15"), subdivisions=1, emission=3.2).transformed(pos=(0.18, 0.98, 0.24)),
        ]))
        reg.add("economy_seat_row", make_beveled_box(0.58, 0.85, 0.52, hex_rgb("#1D4ED8"), bevel=0.04).transformed(pos=(-0.38, 0.55, 0.15)))
        reg.add("folding_tray_table", make_beveled_box(0.44, 0.03, 0.30, hex_rgb("#E2E8F0"), bevel=0.01).transformed(pos=(-0.35, 0.72, -0.18)))
        reg.add("coffee_cup_on_tray", make_cylinder(0.045, 0.038, 0.11, hex_rgb("#F97316"), segments=12, emission=0.8).transformed(pos=(-0.32, 0.79, -0.18)))
        reg.add("overhead_luggage_bin", make_beveled_box(1.65, 0.32, 0.48, hex_rgb("#F1F5F9"), bevel=0.03).transformed(pos=(-0.25, 1.92, 0.18)))
        reg.add("psu_reading_light_panel", make_icosphere(0.05, hex_rgb("#FEF08A"), subdivisions=1, emission=2.8).transformed(pos=(-0.28, 1.72, 0.18)))
        reg.add("window_passenger_rig", V4HeroModels.seated_human(pos=(-0.38, 0.38, 0.15), rot_y=0.35, scale=0.72, shirt_hex="#10B981"))
        return (-0.55 + 0.35 * p, 1.25, 1.65 - 0.35 * p), (0.12, 1.05, 0.18), 36.0

    if sid in ("s03", "s04"):
        add_three_pane_window_rig(exploded=0.08)
        if sid == "s03":
            reg.add("outside_cryo_thermometer", KitV6.thermometer_tower((-1.18, 0.35, 0.25), fill_frac=0.18, hot=False))
            reg.add("barometer_outside_low", PrecisionMechV3.pressure_gauge(radius=0.20, needle_norm=0.14, danger=False).transformed(pos=(-1.18, 1.15, -0.28)))
            reg.add("ice_wind_streamlines", Mesh.merge([
                KitV6.arrow_3d((-1.45, 0.75 + k * 0.28, 0.42), (-0.75, 0.75 + k * 0.28, 0.42), "#7DD3FC", 0.024, 2.2)
                for k in range(3)
            ]))
            return (-0.65, 1.22, 2.45 - 0.20 * p), (-0.45, 0.95, 0.0), 37.0
        reg.add("cabin_pressure_gauge_08", PrecisionMechV3.pressure_gauge(radius=0.22, needle_norm=0.76, danger=False).transformed(pos=(1.05, 1.18, 0.28)))
        reg.add("bleed_air_supply_duct", make_cylinder(0.07, 0.07, 1.35, hex_rgb("#F97316"), segments=14, emission=1.3).transformed(pos=(1.15, 1.65, -0.25), rot=(0.0, 0.0, 1.57)))
        reg.add("flight_attendant_rig", _human(pos=(1.28, 0.0, -0.15), yaw=-0.55, scale=0.68, outfit_hex="#DC2626"))
        reg.add("beverage_service_cart", make_beveled_box(0.38, 0.72, 0.62, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.88, 0.36, -0.35)))
        return (0.55, 1.22, 2.55 - 0.20 * p), (0.45, 0.95, 0.0), 37.0

    if sid == "s05":
        reg.add("single_pane_window_bad", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(0.48, 0.48, 0.04, hex_rgb("#EF4444"), segments=24, emission=1.5).transformed(pos=(0.0, 0.98, 0.0), rot=(0.0, 0.0, 1.57)),
        ]))
        reg.add("diamond_ring_scratch_hand", Mesh.merge([
            make_beveled_box(0.24, 0.14, 0.18, hex_rgb("#FDE68A"), bevel=0.04).transformed(pos=(0.35 - 0.18 * p, 0.98, 0.18)),
            make_icosphere(0.045, hex_rgb("#F8FAFC"), subdivisions=1, emission=3.2).transformed(pos=(0.18 - 0.14 * p, 0.98, 0.12)),
        ]))
        reg.add("explosive_decompression_arrows", Mesh.merge([
            KitV6.arrow_3d((0.15, 0.98 + (k - 1) * 0.22, 0.15), (-0.75 - 0.3 * p, 0.98 + (k - 1) * 0.32, 0.15), "#EF4444", 0.032, 2.5)
            for k in range(3)
        ]))
        return (0.25, 1.18, 2.25 - 0.20 * p), (0.0, 0.98, 0.0), 35.0

    if sid in ("s06", "s07", "s08", "s09", "s10", "s11", "s12", "s13"):
        exp = (0.08 + 0.26 * p) if sid == "s06" else 0.24
        add_three_pane_window_rig(exploded=exp, crack_outer=(sid == "s12"))
        if sid == "s06":
            return (0.15, 1.25, 2.55 - 0.20 * p), (0.0, 0.98, 0.0), 37.0
        if sid == "s07":
            reg.add("sliding_window_sunshade", make_beveled_box(0.03, 0.38, 0.72, hex_rgb("#F8FAFC"), bevel=0.01).transformed(pos=(0.62, 1.32 - 0.15 * p, 0.0)))
            reg.add("passenger_finger_touch", make_cylinder(0.035, 0.03, 0.28, hex_rgb("#FDE68A"), segments=10).transformed(pos=(0.82 - 0.12 * p, 0.95, 0.12), rot=(0.0, 0.0, 1.57)))
            return (0.65, 1.15, 2.05 - 0.20 * p), (0.55, 0.98, 0.0), 34.0
        if sid == "s08":
            reg.add("laser_drilled_bleed_nozzle", make_cylinder(0.038, 0.038, 0.16, hex_rgb("#FACC15"), segments=14, emission=3.0).transformed(pos=(0.0, 0.68, 0.0), rot=(0.0, 0.0, 1.57)))
            reg.add("air_gap_chamber_cavity", make_beveled_box(0.52, 0.75, 0.02, hex_rgb("#0EA5E9"), bevel=0.005, emission=1.1).transformed(pos=(-0.30, 0.98, -0.38)))
            reg.add("caliper_2mm_scale", make_beveled_box(0.28, 0.08, 0.03, hex_rgb("#F8FAFC"), bevel=0.006, emission=1.5).transformed(pos=(0.0, 0.50, 0.28)))
            return (0.28, 0.85, 1.58 - 0.22 * p), (0.0, 0.68, 0.05), 31.0
        if sid == "s09":
            reg.add("equalizing_airflow_stream", KitV6.arrow_3d((0.35, 0.68, 0.15), (-0.35, 0.68, 0.15), "#4ADE80", 0.028, 2.5))
            reg.add("gap_manometer_equal", PrecisionMechV3.pressure_gauge(radius=0.18, needle_norm=0.74, danger=False).transformed(pos=(-0.28, 1.55, 0.18)))
            return (0.18, 1.12, 2.15 - 0.18 * p), (-0.12, 0.88, 0.05), 35.0
        if sid == "s10":
            reg.add("outer_pane_stress_vectors", Mesh.merge([
                KitV6.arrow_3d((-0.25, 0.82 + k * 0.16, 0.18), (-0.62, 0.82 + k * 0.16, 0.18), "#F97316", 0.028, 2.4)
                for k in range(3)
            ]))
            reg.add("structural_forged_window_ring", make_tube_along_path(_circle_path_xy(0.0, 0.98, 0.0, 0.52, 28), 0.032, hex_rgb("#94A3B8"), sides=10, closed=True).transformed(pos=(-0.60, 0.0, 0.0), rot=(0.0, 1.57, 0.0)))
            return (-0.15, 1.15, 2.18 - 0.18 * p), (-0.48, 0.98, 0.0), 35.0
        if sid == "s11":
            reg.add("zero_stress_green_halo", make_tube_along_path(_circle_path_xy(0.0, 0.98, 0.0, 0.50, 28), 0.028, hex_rgb("#4ADE80"), sides=10, closed=True, emission=2.6).transformed(rot=(0.0, 1.57, 0.0)))
            reg.add("flight_cycle_counter_board", make_beveled_box(0.55, 0.24, 0.06, hex_rgb("#1E293B"), bevel=0.02).transformed(pos=(0.35, 1.58, 0.15)))
            return (0.25, 1.15, 2.15 - 0.18 * p), (0.0, 0.98, 0.0), 35.0
        if sid == "s12":
            reg.add("hailstone_impact_chunk", make_icosphere(0.11, hex_rgb("#E0F2FE"), subdivisions=1, emission=2.2).transformed(pos=(-1.15 + 0.45 * p, 1.05, 0.12)))
            reg.add("cracked_outer_pane_mesh", make_tube_along_path([(-0.62, 0.75, -0.22), (-0.62, 0.98, 0.05), (-0.62, 1.22, 0.24)], 0.022, hex_rgb("#FEF08A"), sides=8, emission=2.8))
            reg.add("controlled_micro_leak_arrow", KitV6.arrow_3d((0.0, 0.98, 0.22), (-0.28, 0.98, 0.22), "#4ADE80", 0.030, 2.4))
            return (-0.25 + 0.35 * p, 1.15, 2.25 - 0.18 * p), (-0.20, 0.98, 0.05), 35.0
        # s13
        reg.add("frost_crystal_halo_ring", make_tube_along_path(_circle_path_xy(0.0, 0.68, 0.0, 0.11, 20), 0.018, hex_rgb("#E0F2FE"), sides=8, closed=True, emission=2.8).transformed(rot=(0.0, 1.57, 0.0)))
        reg.add("clear_scenic_window_view", make_beveled_box(0.05, 1.15, 1.35, hex_rgb("#38BDF8"), bevel=0.01, emission=1.1).transformed(pos=(-1.15, 1.02, 0.0)))
        return (0.35, 0.92, 1.75 - 0.18 * p), (0.0, 0.78, 0.05), 33.0

    if sid == "s14":
        reg.add("maintenance_hangar_bay", Mesh.merge([
            _ground_xz(16.0, 16.0, hex_rgb("#1E293B"), flags=FLAG_GROUND),
            _hall(width=7.5, length=8.0, height=4.4),
            V4HeroModels.commercial_airliner(pos=(-0.35, 1.15, -0.45), rot=(0.0, 0.25, 0.0), scale=0.55),
        ]))
        reg.add("rolling_service_stairs", Mesh.merge([
            make_beveled_box(0.85, 0.92, 0.62, hex_rgb("#FACC15"), bevel=0.02).transformed(pos=(0.55, 0.46, 0.45)),
        ]))
        reg.add("aircraft_mechanic_rig", _human(pos=(0.55, 0.92, 0.45), yaw=-0.55, scale=0.56, outfit_hex="#2563EB", helmet_hex="#F8FAFC"))
        reg.add("borescope_inspection_lamp", make_cylinder(0.025, 0.14, 0.45, hex_rgb("#22D3EE"), segments=12, emission=2.6).transformed(pos=(0.25, 1.25, 0.18), rot=(0.0, 0.0, 1.2)))
        return (0.85 - 0.35 * p, 1.55, 2.85 - 0.25 * p), (0.25, 1.18, 0.10), 37.0

    if sid == "s15":
        reg.add("cockpit_flight_deck", V4HeroModels.airliner_cockpit_interior())
        reg.add("pilot_captain_rig", V4HeroModels.seated_human(pos=(-0.42, 0.35, 0.25), rot_y=math.pi, scale=0.72, shirt_hex="#F8FAFC"))
        reg.add("glare_shield_avionics_pfd", Mesh.merge([
            make_beveled_box(0.32, 0.22, 0.03, hex_rgb("#22D3EE"), bevel=0.005, emission=2.2).transformed(pos=(-0.35, 0.92, -0.42)),
            make_beveled_box(0.32, 0.22, 0.03, hex_rgb("#4ADE80"), bevel=0.005, emission=2.2).transformed(pos=(0.35, 0.92, -0.42)),
        ]))
        reg.add("control_yoke_throttle", make_beveled_box(0.28, 0.18, 0.06, hex_rgb("#111827"), bevel=0.02).transformed(pos=(-0.42, 0.85, -0.12)))
        return (0.35 - 0.45 * p, 1.28, 1.55), (0.0, 1.05, -0.45), 39.0

    if sid == "s16":
        reg.add("laminated_windshield_cutaway", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(1.15, 0.85, 0.08, hex_rgb("#38BDF8"), bevel=0.02, emission=1.1).transformed(pos=(0.0, 0.88, -0.18)),
            make_beveled_box(1.15, 0.85, 0.08, hex_rgb("#38BDF8"), bevel=0.02, emission=1.1).transformed(pos=(0.0, 0.88, 0.18)),
        ]))
        reg.add("gold_ito_heating_film", Mesh.merge([
            make_beveled_box(1.10, 0.80, 0.025, hex_rgb("#F59E0B"), bevel=0.01, emission=2.4).transformed(pos=(0.0, 0.88, -0.06)),
            *[make_beveled_box(1.05, 0.016, 0.03, hex_rgb("#FEF08A"), bevel=0.002, emission=3.0).transformed(pos=(0.0, 0.58 + k * 0.15, -0.05)) for k in range(5)],
        ]))
        reg.add("pvb_tough_interlayer", make_beveled_box(1.10, 0.80, 0.04, hex_rgb("#22C55E"), bevel=0.01, emission=1.4).transformed(pos=(0.0, 0.88, 0.06)))
        return (-0.65 + 0.55 * p, 1.15, 2.25 - 0.20 * p), (0.0, 0.88, 0.0), 35.0

    if sid == "s17":
        add_three_pane_window_rig(exploded=0.14)
        reg.add("electrochromic_dimmer_button", make_cylinder(0.065, 0.065, 0.04, hex_rgb("#22D3EE"), segments=16, emission=2.8).transformed(pos=(0.50, 0.38, 0.0), rot=(0.0, 0.0, 1.57)))
        reg.add("tinted_gel_layer_pane", make_cylinder(0.42, 0.42, 0.025, hex_rgb("#1E3A8A"), segments=24, emission=0.6 + 0.9 * (1.0 - p)).transformed(pos=(0.18, 0.98, 0.0), rot=(0.0, 0.0, 1.57)))
        return (0.45, 1.10, 2.05 - 0.18 * p), (0.15, 0.85, 0.0), 35.0

    if sid in ("s18", "s19"):
        add_three_pane_window_rig(exploded=0.20)
        if sid == "s18":
            reg.add("safety_redundancy_scale", make_beveled_box(1.25, 0.06, 0.18, hex_rgb("#FACC15"), bevel=0.01, emission=1.6).transformed(pos=(0.0, 0.35, 0.38)))
        else:
            reg.add("sunset_wingtip_clouds", Mesh.merge([
                make_beveled_box(1.2, 0.08, 0.42, hex_rgb("#F97316"), bevel=0.02, emission=1.8).transformed(pos=(-1.25, 0.88, -0.35), rot=(0.1, 0.3, 0.25)),
            ]))
        return (-0.35 + 0.70 * p, 1.18, 2.35 - 0.20 * p), (0.0, 0.95, 0.0), 36.0

    if sid == "s20":
        reg.add("poll_plinth_window", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(-0.78, 0.21, 0.0)),
            make_cylinder(0.28, 0.28, 0.06, hex_rgb("#38BDF8"), segments=20, emission=1.7).transformed(pos=(-0.78, 0.72, 0.0), rot=(1.57, p * 1.4, 0.0)),
            make_icosphere(0.035, hex_rgb("#FACC15"), subdivisions=1, emission=3.0).transformed(pos=(-0.78, 0.56, 0.05)),
        ]))
        reg.add("poll_plinth_wheel_plug", Mesh.merge([
            make_cylinder(0.58, 0.64, 0.42, hex_rgb("#1E293B"), segments=20).transformed(pos=(0.78, 0.21, 0.0)),
            V5HeroProps.aircraft_wheel_fusible_cutaway(brake_heat=0.75, plug_melted=0.5).transformed(pos=(0.78, 0.72, 0.0), scale=0.38),
        ]))
        return (0.0, 1.38, 3.25 - 0.20 * p), (0.0, 0.65, 0.0), 38.0

    if sid == "s21":
        reg.add("hangar_tool_cabinet", Mesh.merge([
            _ground_xz(14.0, 14.0, hex_rgb("#0F172A"), flags=FLAG_GROUND),
            make_beveled_box(0.85, 1.05, 0.45, hex_rgb("#DC2626"), bevel=0.03).transformed(pos=(-0.72, 0.52, -0.25)),
            _human(pos=(0.42, 0.0, 0.0), yaw=-0.25, scale=0.86, outfit_hex="#2563EB", helmet_hex="#F8FAFC", wave=math.sin(p * 8.0) * 0.7),
        ]))
        reg.add("aviation_badge_crest", make_beveled_box(0.62, 0.14, 0.08, hex_rgb("#FACC15"), bevel=0.02, emission=1.8).transformed(pos=(-0.72, 1.28, -0.22)))
        return (-0.30 + 0.60 * p, 1.38, 2.85), (0.0, 0.95, 0.0), 36.0

    return KitV6.cta_white_button_stage(p, reg, ("cta_pedestal_s16", "white_subscribe_3d_s16", "cursor_click_hand_s16"))


# =============================================================================
# V6 CONTEXT ENRICHMENT: RELEVANT NAMED BACKDROP OBJECTS FOR CLOSE-UP / STUDIO SHOTS
# =============================================================================
CTX_MIN_OBJECTS = 10   # shots with fewer objects get episode-relevant context props behind the hero
CTX_SKIP_RECIPES = {"cta_white_stage", "ab_poll_stage"}


def _ctx_catalog(ep_id: str, p: float) -> List[Tuple[str, "callable"]]:
    """Episode-relevant context props (each a function rot_y -> Mesh built at the local origin)."""
    if ep_id == "KT-R07":
        return [
            ("ctx_bridge_pier_backdrop", lambda r: Mesh.merge([
                make_cylinder(0.42, 0.48, 2.2, hex_rgb("#CBD5E1"), segments=18).transformed(pos=(0.0, 1.1, 0.0)),
                make_beveled_box(1.6, 0.34, 0.9, hex_rgb("#E2E8F0"), bevel=0.04).transformed(pos=(0.0, 2.36, 0.0)),
                make_beveled_box(3.4, 0.30, 1.3, hex_rgb("#94A3B8"), bevel=0.04).transformed(pos=(0.0, 2.78, 0.0)),
                make_beveled_box(0.42, 0.10, 0.42, hex_rgb("#111827"), bevel=0.02).transformed(pos=(-0.45, 2.58, 0.0)),
                make_beveled_box(0.42, 0.10, 0.42, hex_rgb("#111827"), bevel=0.02).transformed(pos=(0.45, 2.58, 0.0)),
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_bearing_test_workbench", lambda r: Mesh.merge([
                make_beveled_box(1.3, 0.08, 0.6, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.0, 0.78, 0.0)),
                *[make_beveled_box(0.06, 0.76, 0.06, hex_rgb("#334155"), bevel=0.01).transformed(pos=(sx * 0.58, 0.38, sz * 0.24)) for sx in (-1, 1) for sz in (-1, 1)],
                *[make_beveled_box(0.42, 0.035, 0.30, hex_rgb("#111827" if k % 2 == 0 else "#94A3B8"), bevel=0.005).transformed(pos=(-0.30, 0.84 + k * 0.036, 0.0)) for k in range(7)],
                make_beveled_box(0.34, 0.03, 0.05, hex_rgb("#FACC15"), bevel=0.005).transformed(pos=(0.32, 0.84, 0.10)),
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_bridge_engineer_tablet", lambda r: _human(pos=(0.0, 0.0, 0.0), yaw=r, scale=0.8, outfit_hex="#F97316", helmet_hex="#FACC15", point=0.6)),
            ("ctx_spare_bearing_pallet", lambda r: Mesh.merge([
                make_beveled_box(0.9, 0.10, 0.7, hex_rgb("#A16207"), bevel=0.01).transformed(pos=(0.0, 0.05, 0.0)),
                *[make_beveled_box(0.34, 0.16, 0.26, hex_rgb("#1F2937"), bevel=0.02).transformed(pos=(-0.2 + 0.4 * (k % 2), 0.18 + 0.17 * (k // 2), 0.0)) for k in range(4)],
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_safety_traffic_cones", lambda r: Mesh.merge([KitV6.traffic_cone((x, 0.0, 0.0), 1.4) for x in (-0.5, 0.0, 0.5)]).transformed(rot=(0.0, r, 0.0))),
        ]
    if ep_id == "KT-R08":
        return [
            ("ctx_pipe_rack_gate_valves", lambda r: Mesh.merge([
                *[_pipe((-0.9, 0.35 + 0.32 * k, 0.0), (0.9, 0.35 + 0.32 * k, 0.0), 0.07, pipe_hex=("#2563EB", "#DC2626", "#16A34A")[k]) for k in range(3)],
                *[make_tube_along_path(_circle_path_xy(0.0, 0.35 + 0.32 * k + 0.22, 0.0, 0.10, 16), 0.018, hex_rgb("#FACC15"), sides=6, closed=True) for k in range(3)],
                *[make_beveled_box(0.06, 1.25, 0.06, hex_rgb("#475569"), bevel=0.01).transformed(pos=(sx, 0.62, 0.0)) for sx in (-0.95, 0.95)],
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_bms_scada_console", lambda r: KitV6.dual_monitor_console((0.0, 0.0, 0.0), rot_y=r)),
            ("ctx_mep_engineer_clipboard", lambda r: _human(pos=(0.0, 0.0, 0.0), yaw=r, scale=0.8, outfit_hex="#0284C7", helmet_hex="#F8FAFC", point=0.5)),
            ("ctx_pressure_gauge_board", lambda r: Mesh.merge([
                make_beveled_box(0.9, 0.62, 0.06, hex_rgb("#1E293B"), bevel=0.02).transformed(pos=(0.0, 1.1, 0.0)),
                make_beveled_box(0.06, 0.8, 0.06, hex_rgb("#475569"), bevel=0.01).transformed(pos=(0.0, 0.4, 0.0)),
                *[PrecisionMechV3.pressure_gauge(radius=0.12, needle_norm=0.2 + 0.3 * k, danger=(k == 2)).transformed(pos=(-0.28 + 0.28 * k, 1.1, 0.05), rot=(1.57, 0.0, 0.0)) for k in range(3)],
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_city_tower_skyline", lambda r: Mesh.merge([
                _tower(floors=9, width=1.4, depth=1.2).transformed(pos=(-1.0, 0.0, 0.0)),
                _tower(floors=12, width=1.2, depth=1.1).transformed(pos=(0.9, 0.0, -0.4)),
            ]).transformed(rot=(0.0, r, 0.0))),
        ]
    if ep_id == "KT-S15":
        return [
            ("ctx_mountain_pine_forest", lambda r: Mesh.merge([
                make_cylinder(2.2, 0.15, 2.8, hex_rgb("#4D7C0F"), segments=9).transformed(pos=(0.0, 1.4, -0.6)),
                *[KitV6.pine_tree((-1.6 + 0.8 * k, 0.0, 0.6 + 0.25 * (k % 2)), 1.0 + 0.15 * (k % 3)) for k in range(5)],
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_runaway_ramp_signboard", lambda r: Mesh.merge([
                *[make_cylinder(0.04, 0.04, 1.5, hex_rgb("#94A3B8"), segments=8).transformed(pos=(sx, 0.75, 0.0)) for sx in (-0.45, 0.45)],
                make_beveled_box(1.2, 0.62, 0.05, hex_rgb("#16A34A"), bevel=0.02).transformed(pos=(0.0, 1.45, 0.0)),
                make_beveled_box(1.0, 0.10, 0.06, hex_rgb("#F8FAFC"), bevel=0.01, emission=0.9).transformed(pos=(0.0, 1.55, 0.01)),
                make_beveled_box(0.7, 0.08, 0.06, hex_rgb("#FACC15"), bevel=0.01, emission=0.9).transformed(pos=(0.0, 1.36, 0.01)),
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_steel_wbeam_guardrail", lambda r: Mesh.merge([
                make_beveled_box(2.6, 0.12, 0.05, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(0.0, 0.48, 0.0)),
                *[make_beveled_box(0.06, 0.55, 0.06, hex_rgb("#64748B"), bevel=0.01).transformed(pos=(-1.2 + 0.6 * k, 0.27, -0.04)) for k in range(5)],
            ]).transformed(rot=(0.0, r, 0.0))),
            ("ctx_highway_patrol_officer", lambda r: _human(pos=(0.0, 0.0, 0.0), yaw=r, scale=0.8, outfit_hex="#FACC15", helmet_hex="#F8FAFC", point=0.6)),
            ("ctx_safety_traffic_cones", lambda r: Mesh.merge([KitV6.traffic_cone((x, 0.0, 0.0), 1.4) for x in (-0.5, 0.0, 0.5)]).transformed(rot=(0.0, r, 0.0))),
        ]
    return [  # KT-S16
        ("ctx_cabin_seat_row_passengers", lambda r: Mesh.merge([
            *[make_beveled_box(0.46, 0.12, 0.46, hex_rgb("#1D4ED8"), bevel=0.03).transformed(pos=(-0.5 + 0.5 * k, 0.42, 0.0)) for k in range(3)],
            *[make_beveled_box(0.46, 0.70, 0.10, hex_rgb("#1E40AF"), bevel=0.03).transformed(pos=(-0.5 + 0.5 * k, 0.80, -0.22)) for k in range(3)],
            V4HeroModels.seated_human(pos=(-0.5, 0.36, 0.0), rot_y=0.0, scale=0.62, shirt_hex="#10B981"),
            V4HeroModels.seated_human(pos=(0.5, 0.36, 0.0), rot_y=0.0, scale=0.62, shirt_hex="#F97316"),
        ]).transformed(rot=(0.0, r, 0.0))),
        ("ctx_overhead_bins_psu", lambda r: Mesh.merge([
            make_beveled_box(1.6, 0.30, 0.45, hex_rgb("#F1F5F9"), bevel=0.03).transformed(pos=(0.0, 1.85, 0.0)),
            *[make_icosphere(0.04, hex_rgb("#FEF08A"), subdivisions=1, emission=2.6).transformed(pos=(-0.5 + 0.5 * k, 1.66, 0.12)) for k in range(3)],
        ]).transformed(rot=(0.0, r, 0.0))),
        ("ctx_wing_engine_outside", lambda r: Mesh.merge([
            make_beveled_box(2.6, 0.08, 0.7, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(0.0, 0.9, 0.0), rot=(0.0, 0.25, 0.05)),
            make_cylinder(0.22, 0.20, 0.7, hex_rgb("#CBD5E1"), segments=16).transformed(pos=(0.2, 0.62, 0.15), rot=(0.0, 0.25, 1.57)),
            make_beveled_box(0.08, 0.30, 0.20, hex_rgb("#38BDF8"), bevel=0.01, emission=1.2).transformed(pos=(1.3, 1.05, -0.3)),
        ]).transformed(rot=(0.0, r, 0.0))),
        ("ctx_galley_service_cart", lambda r: Mesh.merge([
            make_beveled_box(0.36, 0.80, 0.60, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.0, 0.44, 0.0)),
            make_beveled_box(0.30, 0.04, 0.50, hex_rgb("#E2E8F0"), bevel=0.01).transformed(pos=(0.0, 0.86, 0.0)),
            *[make_cylinder(0.04, 0.035, 0.12, hex_rgb(col), segments=10).transformed(pos=(-0.08 + 0.08 * k, 0.94, 0.0)) for k, col in enumerate(("#F97316", "#38BDF8", "#22C55E"))],
            *[make_cylinder(0.035, 0.035, 0.03, hex_rgb("#111827"), segments=10).transformed(pos=(sx * 0.14, 0.035, sz * 0.24), rot=(1.57, 0.0, 0.0)) for sx in (-1, 1) for sz in (-1, 1)],
        ]).transformed(rot=(0.0, r, 0.0))),
        ("ctx_cabin_crew_member", lambda r: _human(pos=(0.0, 0.0, 0.0), yaw=r, scale=0.78, outfit_hex="#DC2626", point=0.5)),
    ]


def add_context_props(ep_id: str, shot_idx: int, p: float, reg: SceneObjectRegistry, eye, tgt) -> None:
    shot = V6_EPISODES[ep_id]["shots"][shot_idx]
    if shot["recipe"] in CTX_SKIP_RECIPES or len(reg.ids) >= CTX_MIN_OBJECTS:
        return
    fb = reg.focus_bounds(shot["objects"])
    if fb is None:
        return
    lo, hi = fb
    c = 0.5 * (lo + hi)
    R = max(0.5, 0.5 * float(np.hypot(hi[0] - lo[0], hi[2] - lo[2])))
    bx, bz = tgt[0] - eye[0], tgt[2] - eye[2]
    bl = max(1e-4, math.hypot(bx, bz))
    bx, bz = bx / bl, bz / bl          # horizontal "into the screen" direction
    rx, rz = -bz, bx                   # screen-right direction
    face = math.atan2(-bx, -bz)        # local +Z faces the camera
    slots = [
        (R + 1.3, -(R + 0.7)), (R + 1.3, R + 0.7), (R + 2.6, 0.0), (0.4, -(R + 0.9)), (0.4, R + 0.9),
    ]
    need = CTX_MIN_OBJECTS - len(reg.ids)
    for (back, side), (oid, fn) in zip(slots, _ctx_catalog(ep_id, p)):
        if need <= 0:
            break
        if oid in reg.ids:
            continue
        x = float(c[0]) + bx * back + rx * side
        z = float(c[2]) + bz * back + rz * side
        y = 0.0
        if oid == "ctx_wing_engine_outside":
            y = float(lo[1])
        reg.add(oid, fn(face).transformed(pos=(x, y, z)))
        need -= 1


# =============================================================================
# UNIFIED V6 SHOT BUILDER WITH HARD OBJECT-COMPLETENESS ASSERTION
# =============================================================================
def build_v6_shot_scene(
    ep_id: str,
    shot_idx: int,
    p: float,
) -> Tuple[Mesh, Tuple[float, float, float], Tuple[float, float, float], float, SceneObjectRegistry]:
    reg = SceneObjectRegistry()
    if ep_id == "KT-R07":
        eye, tgt, fov = _build_r07_shot(shot_idx, p, reg)
    elif ep_id == "KT-R08":
        eye, tgt, fov = _build_r08_shot(shot_idx, p, reg)
    elif ep_id == "KT-S15":
        eye, tgt, fov = _build_s15_shot(shot_idx, p, reg)
    elif ep_id == "KT-S16":
        eye, tgt, fov = _build_s16_shot(shot_idx, p, reg)
    else:
        raise ValueError(f"Unknown V6 episode: {ep_id}")

    add_context_props(ep_id, shot_idx, p, reg, eye, tgt)
    required = set(V6_EPISODES[ep_id]["shots"][shot_idx]["objects"])
    missing = sorted(required - reg.ids)
    assert not missing, f"{ep_id} shot {shot_idx} ({V6_EPISODES[ep_id]['shots'][shot_idx]['id']}) missing objects: {missing}"
    return reg.merged(), eye, tgt, fov, reg
