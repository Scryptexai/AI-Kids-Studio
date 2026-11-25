import math
from typing import List, Tuple

import numpy as np

from src.renderer3d import (
    FLAG_DECAL,
    FLAG_DEPTH_BIAS,
    FLAG_DOUBLE_SIDED,
    FLAG_FRESNEL_DOME,
    FLAG_GROUND,
    FLAG_RECV_SHADOW,
    FLAG_UNLIT,
    Mesh,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


class AssetLibrary:
    """Reusable & parameterizable 3D Low-Poly assets for Episode 1 (Inductive Loop Sensor)."""

    LANE_X = -1.35
    LOOP_Z = 3.45
    STOP_LINE_Z = 2.05
    POLE_X = -3.35
    POLE_Z = 1.65
    CABINET_X = -3.55
    CABINET_Z = 3.45

    def __init__(self):
        self.static_world = self._build_static_diorama()
        self.cutaway_interior = self._build_cutaway_pit_interior()
        self.signal_curve = self._build_signal_curve()
        self.conduit_static = make_tube_along_path(
            self.signal_curve, radius=0.045, color=hex_rgb("#4B5568"), sides=6, closed=False, roughness=0.6
        )
        self.cctv_icon = self._build_cctv_3d()
        self.red_cross = self._build_red_cross()

    def _build_static_diorama(self) -> Mesh:
        parts: List[Mesh] = []
        asphalt = hex_rgb("#262D3B")
        sidewalk = hex_rgb("#5A6578")
        white_m = hex_rgb("#E8EEF6")

        # Leave hero loop patch X in [-2.45, -0.25], Z in [2.35, 4.55] open for asphalt cutaway!
        parts.append(make_flat_quad_xz(-7.5, -7.5, 7.5, 2.35, 0.0, asphalt, flags=FLAG_GROUND, subdiv=3))
        parts.append(make_flat_quad_xz(-7.5, 4.55, 7.5, 8.5, 0.0, asphalt, flags=FLAG_GROUND, subdiv=2))
        parts.append(make_flat_quad_xz(-7.5, 2.35, -2.45, 4.55, 0.0, asphalt, flags=FLAG_GROUND))
        parts.append(make_flat_quad_xz(-0.25, 2.35, 7.5, 4.55, 0.0, asphalt, flags=FLAG_GROUND, subdiv=2))

        # Sidewalk corners & stop line
        for sx in (-5.2, 5.2):
            for sz in (-5.2, 5.6):
                parts.append(make_beveled_box(4.2, 0.18, 4.2, sidewalk, bevel=0.03).transformed(pos=(sx, 0.09, sz)))
        parts.append(make_flat_quad_xz(-2.75, 1.95, -0.05, 2.12, 0.005, white_m, flags=FLAG_DECAL))

        # Traffic light pole, cantilever arm, housing & control cabinet
        pole_col = hex_rgb("#475569")
        parts.append(make_cylinder(0.11, 0.09, 4.3, pole_col, segments=12).transformed(pos=(self.POLE_X, 2.15, self.POLE_Z)))
        parts.append(
            make_tube_along_path(
                [(self.POLE_X, 4.05, self.POLE_Z), (-1.35, 4.05, self.POLE_Z)],
                radius=0.075, color=pole_col, sides=8,
            )
        )
        parts.append(make_beveled_box(0.46, 1.18, 0.34, hex_rgb("#1E2430"), bevel=0.03).transformed(pos=(-1.35, 3.95, self.POLE_Z)))
        parts.append(
            make_beveled_box(0.62, 1.05, 0.48, hex_rgb("#64748B"), bevel=0.03).transformed(
                pos=(self.CABINET_X, 0.525, self.CABINET_Z)
            )
        )
        return Mesh.merge(parts)

    def _build_cutaway_pit_interior(self) -> Mesh:
        cx, cz = self.LANE_X, self.LOOP_Z
        soil = hex_rgb("#5A3E32")
        gravel = hex_rgb("#475061")
        parts = [
            make_flat_quad_xz(cx - 1.10, cz - 1.10, cx + 1.10, cz + 1.10, -0.58, soil, flags=FLAG_GROUND),
            make_beveled_box(2.20, 0.58, 0.08, gravel, bevel=0.01).transformed(pos=(cx, -0.29, cz - 1.10)),
            make_beveled_box(0.08, 0.58, 2.20, gravel, bevel=0.01).transformed(pos=(cx - 1.10, -0.29, cz)),
            make_beveled_box(0.08, 0.58, 2.20, gravel, bevel=0.01).transformed(pos=(cx + 1.10, -0.29, cz)),
        ]
        return Mesh.merge(parts)

    def _build_signal_curve(self) -> np.ndarray:
        return np.array([
            [self.LANE_X - 0.72, -0.18, self.LOOP_Z],
            [self.CABINET_X, -0.18, self.CABINET_Z],
            [self.CABINET_X, 0.45, self.CABINET_Z],
            [self.POLE_X, 0.45, self.POLE_Z],
            [self.POLE_X, 4.05, self.POLE_Z],
            [-1.35, 4.05, self.POLE_Z],
        ], dtype=np.float32)

    def build_traffic_bulbs(self, active: str = "red") -> Mesh:
        parts = []
        specs = [
            ("red", 4.30, "#FF2A3C"),
            ("yellow", 3.95, "#FFB800"),
            ("green", 3.60, "#00F57A"),
        ]
        for name, by, hcol in specs:
            on = name == active
            col = hex_rgb(hcol) if on else hex_rgb("#2A303D")
            parts.append(
                make_icosphere(0.13, col, subdivisions=1, emission=4.2 if on else 0.0).transformed(
                    pos=(-1.35, by, self.POLE_Z + 0.17)
                )
            )
        return Mesh.merge(parts)

    def build_hero_asphalt_patch(self, alpha: float = 1.0, show_marking: bool = True) -> Mesh:
        cx, cz = self.LANE_X, self.LOOP_Z
        fl = FLAG_GROUND if alpha >= 0.99 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)
        parts = [make_flat_quad_xz(cx - 1.10, cz - 1.10, cx + 1.10, cz + 1.10, 0.0, hex_rgb("#262D3B"), alpha=alpha, flags=fl)]
        if show_marking:
            pts = [
                (cx - 0.72, 0.006, cz - 0.85),
                (cx + 0.72, 0.006, cz - 0.85),
                (cx + 0.72, 0.006, cz + 0.85),
                (cx - 0.72, 0.006, cz + 0.85),
            ]
            parts.append(make_tube_along_path(pts, 0.025, hex_rgb("#F8FAFC"), sides=6, closed=True, emission=0.8))
        return Mesh.merge(parts)

    def build_copper_coil(self, highlight: float = 1.0) -> Mesh:
        cx, cz = self.LANE_X, self.LOOP_Z
        col = hex_rgb("#FF9500")
        parts = []
        for turn_y in (-0.14, -0.21):
            pts = [
                (cx - 0.68, turn_y, cz - 0.78),
                (cx + 0.68, turn_y, cz - 0.78),
                (cx + 0.68, turn_y, cz + 0.78),
                (cx - 0.68, turn_y, cz + 0.78),
            ]
            parts.append(make_tube_along_path(pts, 0.036, col, sides=8, closed=True, emission=3.2 * highlight))
        return Mesh.merge(parts)

    def build_magnetic_dome(self, alert_amt: float = 0.0, pulse_scale: float = 1.0, alpha: float = 0.42) -> Mesh:
        c_blue = np.array(hex_rgb("#00D4FF"), dtype=np.float32)
        c_red = np.array(hex_rgb("#FF4500"), dtype=np.float32)
        col = tuple((c_blue * (1.0 - alert_amt) + c_red * alert_amt).tolist())
        dome = make_icosphere(
            0.92, col, subdivisions=2, alpha=alpha, emission=2.2,
            flags=FLAG_FRESNEL_DOME | FLAG_DOUBLE_SIDED,
        ).transformed(pos=(self.LANE_X, 0.05, self.LOOP_Z), scale=(0.90 * pulse_scale, 0.62 * pulse_scale, 1.05 * pulse_scale))
        return dome

    def build_scooter_with_rider(self, z_pos: float, metal_highlight: float = 0.0) -> Mesh:
        x = self.LANE_X
        body_col = hex_rgb("#38BDF8")
        metal_base = np.array(hex_rgb("#64748B"), dtype=np.float32)
        metal_hot = np.array(hex_rgb("#FF2A44"), dtype=np.float32)
        m_col = tuple((metal_base * (1.0 - metal_highlight) + metal_hot * metal_highlight).tolist())
        parts = [
            make_cylinder(0.24, 0.24, 0.12, hex_rgb("#1E293B"), segments=14).transformed(pos=(x, 0.24, z_pos - 0.48), rot=(0, 0, math.pi * 0.5)),
            make_cylinder(0.24, 0.24, 0.12, hex_rgb("#1E293B"), segments=14).transformed(pos=(x, 0.24, z_pos + 0.48), rot=(0, 0, math.pi * 0.5)),
            make_beveled_box(0.42, 0.34, 1.08, m_col, bevel=0.04, emission=3.0 * metal_highlight).transformed(pos=(x, 0.42, z_pos)),
            make_beveled_box(0.44, 0.52, 0.34, body_col, bevel=0.04).transformed(pos=(x, 0.74, z_pos - 0.34)),
            make_beveled_box(0.38, 0.48, 0.24, hex_rgb("#F97316"), bevel=0.04).transformed(pos=(x, 0.98, z_pos + 0.08)),
            make_icosphere(0.20, hex_rgb("#FACC15"), subdivisions=1).transformed(pos=(x, 1.38, z_pos + 0.08)),
        ]
        return Mesh.merge(parts)

    def build_bicycle_with_rider(self, z_pos: float) -> Mesh:
        x = self.LANE_X + 0.55
        frame_c = hex_rgb("#A3E635")
        parts = [
            make_cylinder(0.28, 0.28, 0.04, hex_rgb("#334155"), segments=16).transformed(pos=(x, 0.28, z_pos - 0.48), rot=(0, 0, math.pi * 0.5)),
            make_cylinder(0.28, 0.28, 0.04, hex_rgb("#334155"), segments=16).transformed(pos=(x, 0.28, z_pos + 0.48), rot=(0, 0, math.pi * 0.5)),
            make_tube_along_path([(x, 0.28, z_pos + 0.48), (x, 0.68, z_pos), (x, 0.28, z_pos - 0.48)], 0.022, frame_c, sides=6),
            make_beveled_box(0.32, 0.44, 0.20, hex_rgb("#38BDF8"), bevel=0.03).transformed(pos=(x, 0.98, z_pos + 0.05)),
            make_icosphere(0.17, hex_rgb("#F1C29B"), subdivisions=1).transformed(pos=(x, 1.34, z_pos + 0.05)),
        ]
        return Mesh.merge(parts)

    def _build_cctv_3d(self) -> Mesh:
        return Mesh.merge([
            make_beveled_box(0.28, 0.22, 0.46, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(-1.95, 4.45, self.POLE_Z + 0.15)),
            make_cylinder(0.09, 0.09, 0.12, hex_rgb("#0F172A"), segments=12).transformed(
                pos=(-1.95, 4.45, self.POLE_Z + 0.40), rot=(math.pi * 0.5, 0, 0)
            ),
        ])

    def _build_red_cross(self) -> Mesh:
        b1 = make_beveled_box(0.65, 0.13, 0.08, hex_rgb("#FF2A44"), bevel=0.02, emission=3.6).transformed(rot=(0, 0, math.pi * 0.25))
        b2 = make_beveled_box(0.65, 0.13, 0.08, hex_rgb("#FF2A44"), bevel=0.02, emission=3.6).transformed(rot=(0, 0, -math.pi * 0.25))
        return Mesh.merge([b1, b2]).transformed(pos=(-1.95, 4.45, self.POLE_Z + 0.55))

    def build_signal_pulse(self, progress: float) -> Mesh:
        u = max(0.0, min(1.0, progress))
        pts = self.signal_curve
        segs = np.linalg.norm(pts[1:] - pts[:-1], axis=1)
        cum = np.concatenate([[0.0], np.cumsum(segs)])
        d = u * float(cum[-1])
        idx = max(0, min(len(segs) - 1, int(np.searchsorted(cum, d, side="right")) - 1))
        frac = (d - float(cum[idx])) / max(1e-5, float(segs[idx]))
        p = pts[idx] * (1.0 - frac) + pts[idx + 1] * frac
        return make_icosphere(0.11, hex_rgb("#FFEE00"), subdivisions=1, emission=4.5, flags=FLAG_UNLIT | FLAG_DEPTH_BIAS).transformed(
            pos=(float(p[0]), float(p[1]), float(p[2]))
        )
