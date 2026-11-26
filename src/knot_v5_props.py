"""
Knot Theory V5 Hero Prop Library (`src/knot_v5_props.py`)
Built under `cartoon-3d-short` prop-sheet & literal-silhouette discipline:
Every noun spoken across the 12 rebuilt PDF Shorts (`KT-S08`, `KT-S10`, `KT-S13`, `KT-S14`,
`KT-R01`..`KT-R08`) is constructed as an authentic, multi-part, recognizable 3D model
with physical animation parameters and cutaway internals.
"""

from __future__ import annotations
import math
from typing import List, Tuple

from src.assets_ep02 import make_ring_collar
from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.knot_v4_models import V4HeroModels
from src.renderer3d import (
    FLAG_DEFAULT,
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    Mesh,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


def _circle_path_xz(cx: float, y: float, cz: float, r: float, n: int = 24) -> List[Tuple[float, float, float]]:
    return [(cx + r * math.cos(2 * math.pi * i / n), y, cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def _circle_path_xy(cx: float, cy: float, z: float, r: float, n: int = 24) -> List[Tuple[float, float, float]]:
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)]


class V5HeroProps:
    """Literal, multi-part 3D hero props & cutaway assemblies for all 12 rebuilt Shorts."""

    # =========================================================================
    # SHARED VEHICLES (CAR, SPORT MOTORCYCLE, TANDEM ROAD ROLLER)
    # =========================================================================
    @staticmethod
    def sedan_car(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot_y: float = 0.0,
        pitch_x: float = 0.0,
        scale: float = 1.0,
        body_hex: str = "#EF4444",
        wheel_spin: float = 0.0,
    ) -> Mesh:
        body = hex_rgb(body_hex)
        glass = hex_rgb("#0F172A")
        tire = hex_rgb("#111827")
        rim = hex_rgb("#E2E8F0")
        parts: List[Mesh] = [
            # Lower sculpted body + bumpers
            make_beveled_box(1.75, 0.34, 0.84, body, bevel=0.06, roughness=0.18).transformed(pos=(0.0, 0.33, 0.0)),
            make_beveled_box(1.82, 0.12, 0.86, hex_rgb("#1E293B"), bevel=0.03).transformed(pos=(0.0, 0.19, 0.0)),
            # Greenhouse cabin + dark front/rear windshields
            make_beveled_box(0.96, 0.30, 0.74, body, bevel=0.06, roughness=0.18).transformed(pos=(-0.08, 0.61, 0.0)),
            make_beveled_box(0.88, 0.24, 0.76, glass, bevel=0.03, roughness=0.08).transformed(pos=(-0.08, 0.60, 0.0)),
            make_beveled_box(0.28, 0.24, 0.72, glass, bevel=0.02, roughness=0.08).transformed(pos=(0.36, 0.58, 0.0), rot=(0.0, 0.0, -0.45)),
            # Headlights & taillights
            make_icosphere(0.05, hex_rgb("#FEF08A"), subdivisions=1, emission=3.2).transformed(pos=(0.88, 0.36, 0.28)),
            make_icosphere(0.05, hex_rgb("#FEF08A"), subdivisions=1, emission=3.2).transformed(pos=(0.88, 0.36, -0.28)),
            make_beveled_box(0.04, 0.07, 0.22, hex_rgb("#F43F5E"), bevel=0.01, emission=2.4).transformed(pos=(-0.88, 0.38, 0.26)),
            make_beveled_box(0.04, 0.07, 0.22, hex_rgb("#F43F5E"), bevel=0.01, emission=2.4).transformed(pos=(-0.88, 0.38, -0.26)),
        ]
        for wx in (-0.54, 0.54):
            for wz in (-0.42, 0.42):
                parts.append(make_cylinder(0.18, 0.18, 0.11, tire, segments=16).transformed(pos=(wx, 0.18, wz), rot=(math.pi * 0.5, 0.0, wheel_spin)))
                parts.append(make_cylinder(0.10, 0.10, 0.12, rim, segments=12).transformed(pos=(wx, 0.18, wz), rot=(math.pi * 0.5, 0.0, wheel_spin)))
        return Mesh.merge(parts).transformed(pos=pos, rot=(pitch_x, rot_y, 0.0), scale=scale)

    @staticmethod
    def sport_motorcycle(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        scale: float = 1.0,
        body_hex: str = "#DC2626",
        wheel_spin: float = 0.0,
    ) -> Mesh:
        red = hex_rgb(body_hex)
        dark = hex_rgb("#0F172A")
        metal = hex_rgb("#CBD5E1")
        gold = hex_rgb("#F59E0B")
        parts: List[Mesh] = []
        # Front & rear tires + brake discs + alloy hubs
        for wx in (-0.56, 0.58):
            parts.append(make_tube_along_path(_circle_path_xy(wx, 0.26, 0.0, 0.22, 20), 0.055, dark, sides=10, closed=True))
            parts.append(make_cylinder(0.13, 0.13, 0.03, metal, segments=14, roughness=0.22).transformed(pos=(wx, 0.26, 0.04), rot=(math.pi * 0.5, 0.0, wheel_spin)))
            parts.append(make_cylinder(0.06, 0.06, 0.10, gold, segments=12).transformed(pos=(wx, 0.26, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))
        # Inverted telescopic front forks + handlebars + headlight fairing
        for fz in (-0.07, 0.07):
            parts.append(make_cylinder(0.024, 0.028, 0.58, gold, segments=10, roughness=0.20).transformed(pos=(0.45, 0.49, fz), rot=(0.0, 0.0, 0.42)))
        parts.append(make_cylinder(0.018, 0.018, 0.54, dark, segments=8).transformed(pos=(0.33, 0.74, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))
        parts.append(make_beveled_box(0.34, 0.26, 0.28, red, bevel=0.05, roughness=0.16).transformed(pos=(0.50, 0.66, 0.0), rot=(0.0, 0.0, -0.30)))
        parts.append(make_icosphere(0.065, hex_rgb("#FEF08A"), subdivisions=1, emission=3.8).transformed(pos=(0.66, 0.63, 0.0)))
        # Engine block + sculpted fuel tank + rider saddle + upswept tail + exhaust muffler
        parts.append(make_beveled_box(0.42, 0.30, 0.24, hex_rgb("#334155"), bevel=0.03).transformed(pos=(0.02, 0.36, 0.0)))
        parts.append(make_beveled_box(0.46, 0.22, 0.30, red, bevel=0.07, roughness=0.15).transformed(pos=(0.12, 0.62, 0.0)))
        parts.append(make_beveled_box(0.42, 0.10, 0.24, dark, bevel=0.04).transformed(pos=(-0.24, 0.56, 0.0), rot=(0.0, 0.0, 0.12)))
        parts.append(make_beveled_box(0.36, 0.12, 0.20, red, bevel=0.04, roughness=0.16).transformed(pos=(-0.54, 0.64, 0.0), rot=(0.0, 0.0, 0.24)))
        parts.append(make_cylinder(0.048, 0.058, 0.52, metal, segments=12, roughness=0.20).transformed(pos=(-0.36, 0.32, 0.15), rot=(0.0, 0.0, 1.25)))
        return Mesh.merge(parts).transformed(pos=pos, rot=rot, scale=scale)

    @staticmethod
    def tandem_road_roller(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot_y: float = 0.0,
        scale: float = 1.0,
        drum_spin: float = 0.0,
    ) -> Mesh:
        """Authentic yellow double-drum vibratory asphalt compactor (`alat berat penggilas`)."""
        yel = hex_rgb("#F59E0B")
        steel = hex_rgb("#64748B")
        dark = hex_rgb("#0F172A")
        parts: List[Mesh] = []
        # Front & rear wide heavy steel compaction drums + yoke arms
        for dx in (-0.68, 0.68):
            parts.append(make_cylinder(0.34, 0.34, 0.96, steel, segments=22, roughness=0.28).transformed(pos=(dx, 0.34, 0.0), rot=(math.pi * 0.5, 0.0, drum_spin)))
            parts.append(make_cylinder(0.16, 0.16, 1.00, yel, segments=14).transformed(pos=(dx, 0.34, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))
            for sz in (-0.52, 0.52):
                parts.append(make_beveled_box(0.46, 0.14, 0.06, yel, bevel=0.015).transformed(pos=(dx * 0.75, 0.44, sz)))
        # Articulated chassis + engine hood + ROPS canopy + seated operator
        parts.append(make_beveled_box(1.35, 0.36, 0.82, yel, bevel=0.05).transformed(pos=(0.0, 0.66, 0.0)))
        parts.append(make_beveled_box(0.58, 0.42, 0.76, hex_rgb("#D97706"), bevel=0.05).transformed(pos=(-0.38, 0.96, 0.0)))
        parts.append(make_cylinder(0.035, 0.035, 0.34, dark, segments=10).transformed(pos=(-0.52, 1.28, 0.22)))
        # ROPS 4-post safety canopy + amber beacon
        for px in (-0.12, 0.42):
            for pz in (-0.34, 0.34):
                parts.append(make_cylinder(0.025, 0.025, 0.78, dark, segments=8).transformed(pos=(px, 1.22, pz)))
        parts.append(make_beveled_box(0.68, 0.06, 0.78, yel, bevel=0.02).transformed(pos=(0.15, 1.62, 0.0)))
        parts.append(make_icosphere(0.055, hex_rgb("#FB923C"), subdivisions=1, emission=3.5).transformed(pos=(0.15, 1.70, 0.0)))
        parts.append(V4HeroModels.seated_human(pos=(0.12, 0.62, 0.0), rot_y=math.pi * 0.5, scale=0.68, jacket_hex="#EA580C", role="civilian_m"))
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0), scale=scale)

    # =========================================================================
    # KT-S08: FULL-FACE HELMET CUTAWAY (VISOR + CHINSTRAP + EPS CELLS + SPONGE)
    # =========================================================================
    @staticmethod
    def full_face_helmet(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        scale: float = 1.0,
        cutaway: bool = False,
        eps_crush: float = 0.0,     # 0..1 permanent flattening of inner EPS foam cells!
        visor_open: float = 0.15,
        head_inside: bool = False,
        shell_hex: str = "#0EA5E9",
    ) -> Mesh:
        """
        Authentic Full-Face Motorcycle Helmet:
        - Glossy outer polycarbonate shell (remains 100% smooth & uncracked!)
        - Sculpted front chin bar + mouth vent + top aero intake scoop + rear spoiler
        - Hinged dark polycarbonate visor with side pivot discs
        - Nylon chinstrap + red quick-release buckle
        - Optional cutaway exposing thick cellular white/grey EPS liner + permanently crushed bead zone!
        """
        shell = hex_rgb(shell_hex)
        stripe = hex_rgb("#F8FAFC")
        visor = hex_rgb("#0F172A")
        eps_healthy = hex_rgb("#E2E8F0")
        eps_crushed = hex_rgb("#EF4444")
        pad_col = hex_rgb("#1E293B")
        parts: List[Mesh] = []

        if not cutaway:
            # Full outer glossy dome + chin guard + racing stripe
            parts.append(make_icosphere(0.54, shell, subdivisions=3, roughness=0.10).transformed(scale=(1.04, 1.00, 1.12)))
            parts.append(make_icosphere(0.548, stripe, subdivisions=2, roughness=0.12).transformed(scale=(0.24, 1.02, 1.13)))
        else:
            # Solid unbroken glossy left half (-X) shell built from hemisphere rings + endcap, sliced cleanly at X = 0!
            n_lat, n_lon = 14, 16
            from src.renderer3d import _make_mesh_from_tris
            hemi_tris = []
            for i in range(n_lat):
                v0 = -0.58 + 2.15 * (i / n_lat)
                v1 = -0.58 + 2.15 * ((i + 1) / n_lat)
                for j in range(n_lon):
                    # phi in [pi/2 .. 3*pi/2] covers X <= 0 hemisphere!
                    u0 = math.pi * 0.5 + math.pi * (j / n_lon)
                    u1 = math.pi * 0.5 + math.pi * ((j + 1) / n_lon)
                    def _hp(vv: float, uu: float) -> Tuple[float, float, float]:
                        rc = math.cos(vv)
                        return (0.54 * rc * math.cos(uu), 0.54 * math.sin(vv), 0.60 * rc * math.sin(uu))
                    p00, p10, p11, p01 = _hp(v0, u0), _hp(v1, u0), _hp(v1, u1), _hp(v0, u1)
                    hemi_tris.append((p00, p10, p11))
                    hemi_tris.append((p00, p11, p01))
            parts.append(_make_mesh_from_tris(hemi_tris, shell, roughness=0.10, flags=FLAG_DEFAULT | FLAG_DOUBLE_SIDED, outward_center=(0.0, 0.0, 0.0)))
            # Outer glossy shell rim arc on the cut plane (X = 0)
            outer_arc = [(0.0, 0.54 * math.sin(th), 0.60 * math.cos(th)) for th in [-0.58 + 2.15 * j / 18.0 for j in range(19)]]
            parts.append(make_tube_along_path(outer_arc, 0.028, stripe, sides=10, roughness=0.12))

            # Thick inner EPS Cellular Liner (24 discrete foam bead cells along the dome!)
            for j in range(17):
                th = -0.75 + 2.35 * j / 16.0
                # Top-front impact zone (th in 0.35..1.35) crushes permanently inward when eps_crush > 0!
                in_impact = max(0.0, 1.0 - abs(th - 0.85) / 0.55)
                local_crush = eps_crush * in_impact
                r_eps = 0.44 + 0.045 * local_crush  # squashes thin against outer shell!
                cell_scale_radial = max(0.28, 1.0 - 0.68 * local_crush)
                c_col = (
                    eps_healthy[0] * (1 - local_crush) + eps_crushed[0] * local_crush,
                    eps_healthy[1] * (1 - local_crush) + eps_crushed[1] * local_crush,
                    eps_healthy[2] * (1 - local_crush) + eps_crushed[2] * local_crush,
                )
                cy = r_eps * math.sin(th)
                cz = r_eps * math.cos(th) * 1.06
                parts.append(
                    make_icosphere(0.068, c_col, subdivisions=1, emission=1.6 * local_crush, roughness=0.78).transformed(
                        pos=(0.02, cy, cz),
                        scale=(0.85, cell_scale_radial, 0.95),
                    )
                )
            # Soft dark comfort liner arc inside EPS
            inner_arc = [(0.02, 0.35 * math.sin(th), 0.37 * math.cos(th)) for th in [-0.65 + 2.15 * j / 14.0 for j in range(15)]]
            parts.append(make_tube_along_path(inner_arc, 0.024, pad_col, sides=8, roughness=0.85))

        # Sculpted front chin bar + front air intake grille (facing +Z)
        parts.append(make_beveled_box(0.56 if not cutaway else 0.32, 0.24, 0.36, shell, bevel=0.07, roughness=0.12).transformed(pos=(-0.12 if cutaway else 0.0, -0.24, 0.42)))
        parts.append(make_beveled_box(0.22, 0.08, 0.06, visor, bevel=0.015).transformed(pos=(-0.08 if cutaway else 0.0, -0.26, 0.60)))
        # Top aero intake vent + rear spoiler fin
        parts.append(make_beveled_box(0.20, 0.07, 0.24, stripe, bevel=0.02, roughness=0.15).transformed(pos=(-0.06 if cutaway else 0.0, 0.50, 0.16), rot=(-0.25, 0.0, 0.0)))
        parts.append(make_beveled_box(0.36, 0.08, 0.18, visor, bevel=0.02).transformed(pos=(-0.06 if cutaway else 0.0, 0.24, -0.54), rot=(0.35, 0.0, 0.0)))

        # Hinged polycarbonate visor + side pivot pods
        v_pts = [(-0.36 + 0.72 * k / 10.0, 0.06 + 0.14 * visor_open, 0.44 + 0.18 * math.cos((k - 5) * 0.26)) for k in range(11)]
        if cutaway:
            v_pts = [p for p in v_pts if p[0] <= 0.06]
        parts.append(make_tube_along_path(v_pts, 0.13, visor, sides=10, alpha=0.88, roughness=0.06))
        parts.append(make_cylinder(0.085, 0.085, 0.04, hex_rgb("#94A3B8"), segments=14).transformed(pos=(-0.48, 0.05, 0.12), rot=(0.0, 0.0, math.pi * 0.5)))
        if not cutaway:
            parts.append(make_cylinder(0.085, 0.085, 0.04, hex_rgb("#94A3B8"), segments=14).transformed(pos=(0.48, 0.05, 0.12), rot=(0.0, 0.0, math.pi * 0.5)))

        # Buckled nylon chinstrap + red quick-release clip beneath chin!
        strap_pts = [(-0.28, -0.34, 0.05), (-0.18, -0.54, 0.10), (0.0, -0.58, 0.12), (0.18, -0.54, 0.10), (0.28, -0.34, 0.05)]
        parts.append(make_tube_along_path(strap_pts, 0.024, hex_rgb("#1E293B"), sides=8))
        parts.append(make_beveled_box(0.11, 0.06, 0.07, hex_rgb("#EF4444"), bevel=0.01, emission=0.8).transformed(pos=(0.0, -0.58, 0.13)))

        # Optional human head inside cutaway showing skull protected during crash vs empty parking-lot drop!
        if head_inside:
            skin = hex_rgb("#F1C29B")
            parts.append(make_icosphere(0.28, skin, subdivisions=2, roughness=0.55).transformed(pos=(0.02, -0.02, 0.04), scale=(0.92, 1.05, 0.96)))
            parts.append(make_cylinder(0.11, 0.13, 0.26, skin, segments=12).transformed(pos=(0.02, -0.38, -0.02)))

        return Mesh.merge(parts).transformed(pos=pos, rot=rot, scale=scale)

    # =========================================================================
    # KT-S10: MCB CIRCUIT BREAKER CUTAWAY + KITCHEN REFRIGERATOR & WATER PUMP
    # =========================================================================
    @staticmethod
    def mcb_cutaway(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot_y: float = 0.0,
        scale: float = 1.0,
        bimetal_bend: float = 0.0,   # 0..1 slow thermal bending on mild overload
        solenoid_snap: float = 0.0,  # 0..1 instant magnetic plunger strike on short circuit
        tripped: float = 0.0,        # 0..1 blue toggle lever flips OFF + contacts open
        arc_flash: float = 0.0,
    ) -> Mesh:
        """
        Authentic DIN-Rail MCB Cutaway:
        - Molded white DIN casing backplate & side walls + brass top/bottom screw terminals
        - Blue external toggle lever (flips down when tripped) + spring trip latch
        - Copper/steel Bimetallic Strip (heats & bends slowly to release latch)
        - Coiled copper Electromagnetic Solenoid + steel plunger (snaps instantly on short circuit)
        - 9 parallel steel De-ion Arc Chute splitter plates extinguishing electric arc
        """
        casing = hex_rgb("#F1F5F9")
        inner_bg = hex_rgb("#1E293B")
        brass = hex_rgb("#F59E0B")
        copper = hex_rgb("#EA580C")
        blue_sw = hex_rgb("#0284C7")
        parts: List[Mesh] = []

        # Backplate + top/bottom/rear walls of cutaway MCB box (1.55w x 2.35h x 0.65d)
        parts.append(make_beveled_box(1.55, 2.35, 0.14, casing, bevel=0.04).transformed(pos=(0.0, 1.18, -0.26)))
        parts.append(make_beveled_box(1.42, 2.18, 0.08, inner_bg, bevel=0.02).transformed(pos=(0.0, 1.18, -0.18)))
        parts.append(make_beveled_box(1.55, 0.14, 0.56, casing, bevel=0.03).transformed(pos=(0.0, 2.30, 0.0)))
        parts.append(make_beveled_box(1.55, 0.14, 0.56, casing, bevel=0.03).transformed(pos=(0.0, 0.07, 0.0)))
        # Top & Bottom Brass Screw Terminals
        for ty in (0.34, 2.04):
            parts.append(make_beveled_box(0.32, 0.28, 0.34, brass, bevel=0.02, roughness=0.25).transformed(pos=(-0.58, ty, 0.02)))
            parts.append(make_cylinder(0.09, 0.09, 0.12, hex_rgb("#CBD5E1"), segments=12).transformed(pos=(-0.58, ty, 0.18), rot=(math.pi * 0.5, 0.0, 0.0)))

        # External Blue Toggle Handle protruding on left/front (-0.78, y=1.48)
        lev_ang = -0.55 + 1.15 * tripped
        parts.append(make_beveled_box(0.38, 0.16, 0.32, blue_sw, bevel=0.03, roughness=0.20).transformed(pos=(-0.78, 1.48, 0.10), rot=(0.0, 0.0, lev_ang)))

        # Moving Contact Arm + Fixed Contact Pad (separates when tripped!)
        contact_gap = 0.28 * tripped
        parts.append(make_beveled_box(0.10, 0.22, 0.18, brass, bevel=0.015).transformed(pos=(-0.18, 1.36, 0.04)))
        parts.append(make_beveled_box(0.09, 0.62, 0.14, hex_rgb("#E2E8F0"), bevel=0.015).transformed(pos=(-0.02 + contact_gap, 1.38, 0.04), rot=(0.0, 0.0, -0.45 * tripped)))

        # GUARD 1: Thermal Bimetallic Strip (right-upper vertical strip that glows orange & bends right!)
        bm_pts = []
        for k in range(9):
            u = k / 8.0
            bx = 0.42 + 0.24 * (u ** 2) * bimetal_bend
            by = 1.25 + 0.78 * u
            bm_pts.append((bx, by, 0.05))
        bm_col = (
            copper[0] * (1 - 0.4 * bimetal_bend) + 1.0 * 0.4 * bimetal_bend,
            copper[1] * (1 - 0.5 * bimetal_bend) + 0.35 * bimetal_bend,
            0.12,
        )
        parts.append(make_tube_along_path(bm_pts, 0.048, bm_col, sides=8, emission=2.4 * bimetal_bend, roughness=0.28))
        # Latch bar pulled by bimetal tip
        parts.append(make_beveled_box(0.46, 0.06, 0.10, hex_rgb("#94A3B8"), bevel=0.01).transformed(pos=(0.24 + 0.12 * bimetal_bend, 1.98, 0.05)))

        # GUARD 2: Magnetic Solenoid Coil (helical copper turns!) + Instant Steel Plunger!
        coil_pts = []
        for k in range(44):
            ang = k * (2 * math.pi / 8.0)
            cx = 0.08 + 0.19 * math.cos(ang)
            cy = 0.62 + 0.46 * (k / 43.0)
            cz = 0.05 + 0.19 * math.sin(ang)
            coil_pts.append((cx, cy, cz))
        parts.append(make_tube_along_path(coil_pts, 0.030, copper, sides=8, emission=2.8 * solenoid_snap, roughness=0.22))
        # Steel plunger shooting upward/left on short circuit!
        parts.append(make_cylinder(0.065, 0.065, 0.58, hex_rgb("#E2E8F0"), segments=12, emission=1.5 * solenoid_snap).transformed(pos=(0.08, 0.88 + 0.26 * solenoid_snap, 0.05)))

        # De-ion Arc Chute Splitter Stack (8 steel fins at bottom-left!)
        for ak in range(8):
            ay = 0.28 + ak * 0.095
            parts.append(make_beveled_box(0.38, 0.032, 0.28, hex_rgb("#94A3B8"), bevel=0.005, emission=2.8 * arc_flash).transformed(pos=(-0.42, ay, 0.04)))
        if arc_flash > 0.05:
            parts.append(make_icosphere(0.16 * arc_flash, hex_rgb("#38BDF8"), subdivisions=1, emission=5.0).transformed(pos=(-0.22, 1.18, 0.10)))

        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0), scale=scale)

    @staticmethod
    def kitchen_appliances_scene(surge_glow: float = 0.0, time_s: float = 0.0) -> Mesh:
        """
        Literal Home Utility/Kitchen Room for KT-S10 Beat 2:
        - Two-door silver Refrigerator (`kulkas`) with handles, freezer split & compressor hum
        - Blue Centrifugal Water Pump (`pompa air`) with brass impeller head, pressure tank & PVC pipes
        - Wall MCB Breaker Panel + glowing power conduits connecting both appliances!
        """
        parts: List[Mesh] = []
        # Tiled floor & plaster wall
        parts.append(make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#CBD5E1"), subdiv=2))
        parts.append(make_beveled_box(6.4, 3.6, 0.18, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(0.0, 1.80, -1.45)))

        # 1. Tall Two-Door Silver Refrigerator (`Kulkas`) at X = -1.25
        parts.append(make_beveled_box(0.98, 1.32, 0.82, hex_rgb("#E2E8F0"), bevel=0.05, roughness=0.22).transformed(pos=(-1.25, 0.68, -0.78)))
        parts.append(make_beveled_box(0.98, 0.64, 0.82, hex_rgb("#F8FAFC"), bevel=0.05, roughness=0.20).transformed(pos=(-1.25, 1.70, -0.78)))
        parts.append(make_beveled_box(0.99, 0.03, 0.84, hex_rgb("#334155"), bevel=0.005).transformed(pos=(-1.25, 1.36, -0.78)))
        # Chrome door handles + digital dispenser panel
        parts.append(make_cylinder(0.022, 0.022, 0.46, hex_rgb("#64748B"), segments=10).transformed(pos=(-0.86, 1.68, -0.34)))
        parts.append(make_cylinder(0.022, 0.022, 0.72, hex_rgb("#64748B"), segments=10).transformed(pos=(-0.86, 0.86, -0.34)))
        parts.append(make_beveled_box(0.22, 0.28, 0.04, hex_rgb("#0EA5E9"), bevel=0.01, emission=1.4 + 2.0 * surge_glow).transformed(pos=(-1.42, 1.66, -0.36)))

        # 2. Blue Centrifugal Household Water Pump (`Pompa Air`) at X = +1.15
        parts.append(make_beveled_box(0.86, 0.10, 0.62, hex_rgb("#334155"), bevel=0.02).transformed(pos=(1.15, 0.05, -0.68)))
        # Finned motor cylinder + brass volute pump head + red pressure tank + suction/outlet pipes!
        parts.append(make_cylinder(0.22, 0.22, 0.48, hex_rgb("#0284C7"), segments=16, roughness=0.30).transformed(pos=(1.05, 0.34, -0.68), rot=(0.0, 0.0, math.pi * 0.5)))
        parts.append(make_cylinder(0.24, 0.24, 0.16, hex_rgb("#F59E0B"), segments=16, roughness=0.25).transformed(pos=(1.36, 0.34, -0.68), rot=(0.0, 0.0, math.pi * 0.5)))
        parts.append(make_icosphere(0.22, hex_rgb("#DC2626"), subdivisions=2, roughness=0.25).transformed(pos=(1.12, 0.72, -0.68), scale=(1.25, 0.95, 0.95)))
        parts.append(make_tube_along_path([(1.36, 0.56, -0.68), (1.36, 1.18, -0.68), (2.10, 1.18, -0.68)], 0.042, hex_rgb("#94A3B8"), sides=10))

        # 3. Wall MCB Distribution Panel at Center-Top (X = 0.0, Y = 2.15) + Glowing Inrush Wires!
        parts.append(make_beveled_box(0.68, 0.78, 0.22, hex_rgb("#F8FAFC"), bevel=0.03).transformed(pos=(0.0, 2.12, -1.28)))
        parts.append(make_beveled_box(0.48, 0.26, 0.06, hex_rgb("#0F172A"), bevel=0.01).transformed(pos=(0.0, 2.12, -1.16)))
        for mx in (-0.14, 0.0, 0.14):
            parts.append(make_beveled_box(0.10, 0.14, 0.08, hex_rgb("#0284C7"), bevel=0.01, emission=1.8 * surge_glow).transformed(pos=(mx, 2.12, -1.12)))
        wire_col = hex_rgb("#F59E0B") if surge_glow > 0.2 else hex_rgb("#475569")
        parts.append(make_tube_along_path([(-1.10, 1.10, -1.32), (-0.45, 1.10, -1.32), (-0.18, 1.75, -1.32)], 0.028, wire_col, sides=8, emission=2.6 * surge_glow))
        parts.append(make_tube_along_path([(1.05, 0.45, -1.32), (0.42, 0.45, -1.32), (0.18, 1.75, -1.32)], 0.028, wire_col, sides=8, emission=2.6 * surge_glow))

        # Homeowner watching appliances start without nuisance trip!
        parts.append(HumanRigV3.build(pos=(-0.05, 0.0, 0.45), rot_y=math.pi, scale=0.96, role="civilian_m", jacket_hex="#0EA5E9", point_arm=0.85, time_s=time_s))
        return Mesh.merge(parts)

    # =========================================================================
    # KT-S13: DAM SPILLWAY + STILLING BASIN + KITCHEN SINK PLATE HYDRAULIC JUMP
    # =========================================================================
    @staticmethod
    def dam_spillway_scene(scour_mode: bool = False, time_s: float = 0.0) -> Mesh:
        """
        Concrete Ogee Spillway Dam + Canyon + Stilling Basin Baffle Piers + Hydraulic Jump
        (or deep riverbed toe erosion cavity when `scour_mode=True`!).
        """
        concrete = hex_rgb("#94A3B8")
        rock = hex_rgb("#57534E")
        soil = hex_rgb("#78350F")
        fast_water = hex_rgb("#38BDF8")
        foam = hex_rgb("#F8FAFC")
        calm_water = hex_rgb("#0284C7")
        parts: List[Mesh] = []

        # Valley canyon rear rock cliff (-Z) & open cutaway front (+Z) so camera sees full spillway + stilling basin!
        parts.append(make_beveled_box(8.5, 1.1, 4.6, soil, bevel=0.05).transformed(pos=(0.5, -0.55, 0.0)))
        parts.append(make_beveled_box(6.8, 3.8, 0.95, rock, bevel=0.14, roughness=0.88).transformed(pos=(-0.4, 1.6, -2.05)))
        parts.append(make_beveled_box(2.2, 0.65, 0.45, rock, bevel=0.10, roughness=0.88).transformed(pos=(-2.4, 0.25, 1.85)))

        # Monumental Curved Concrete Dam Wall & Spillway Chute (-3.2 .. -0.4 along X)
        parts.append(make_beveled_box(1.5, 3.3, 3.3, concrete, bevel=0.06, roughness=0.68).transformed(pos=(-2.45, 1.65, 0.0)))
        parts.append(make_beveled_box(2.3, 2.4, 3.2, concrete, bevel=0.08, roughness=0.68).transformed(pos=(-1.35, 1.05, 0.0), rot=(0.0, 0.0, -0.68)))
        # Crest radial spillway gates + upstream reservoir water
        for gz in (-0.95, 0.0, 0.95):
            parts.append(make_beveled_box(0.55, 0.72, 0.16, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(-2.05, 3.45, gz)))
        parts.append(make_beveled_box(1.8, 0.65, 3.1, calm_water, bevel=0.04, emission=0.8).transformed(pos=(-3.15, 2.95, 0.0)))

        # Supercritical high-speed thin water sheet roaring down spillway chute!
        parts.append(make_beveled_box(2.45, 0.16, 2.75, fast_water, bevel=0.03, emission=1.7, roughness=0.12).transformed(pos=(-1.12, 1.38, 0.0), rot=(0.0, 0.0, -0.68)))

        if scour_mode:
            # NO stilling basin -> high-speed jet carves a deep red-highlighted scour pit undermining dam toe!
            parts.append(make_beveled_box(2.6, 0.78, 2.8, hex_rgb("#1E1B4B"), bevel=0.08).transformed(pos=(0.95, -0.26, 0.0)))
            parts.append(make_beveled_box(2.8, 0.24, 2.75, fast_water, bevel=0.04, emission=2.0).transformed(pos=(1.15, 0.10, 0.0)))
            # Scoured foundation warning crack + red danger glow under dam toe!
            parts.append(make_icosphere(0.42, hex_rgb("#EF4444"), subdivisions=2, emission=3.2).transformed(pos=(0.05, -0.18, 0.45), scale=(1.5, 0.65, 1.2)))
        else:
            # Concrete Stilling Basin Apron + Chute Blocks + Staggered Concrete Baffle Piers!
            parts.append(make_beveled_box(2.75, 0.22, 3.15, concrete, bevel=0.03).transformed(pos=(0.95, 0.08, 0.0)))
            for bz in (-1.05, -0.35, 0.35, 1.05):
                parts.append(make_beveled_box(0.32, 0.38, 0.34, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(0.55, 0.34, bz)))
                parts.append(make_beveled_box(0.28, 0.34, 0.32, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(1.18, 0.32, bz * 0.85)))
            # Rolling Hydraulic Jump Foam Roller + Thick Slow Subcritical Downstream River!
            for fk in range(9):
                fz = -1.12 + fk * 0.28
                bob = 0.07 * math.sin(time_s * 7.5 + fk * 1.1)
                parts.append(make_icosphere(0.28, foam, subdivisions=2, emission=1.9, roughness=0.35).transformed(pos=(0.78 + 0.06 * (fk % 2), 0.56 + bob, fz), scale=(1.15, 1.05, 0.95)))
            parts.append(make_beveled_box(2.6, 0.66, 2.95, calm_water, bevel=0.06, emission=0.9, roughness=0.18).transformed(pos=(2.55, 0.36, 0.0)))

        return Mesh.merge(parts)

    @staticmethod
    def kitchen_sink_jump_scene(time_s: float = 0.0) -> Mesh:
        """
        Literal Kitchen Sink (`wastafel`) + Chrome Gooseneck Faucet (`keran`) + White Plate (`piring`)
        demonstrating the exact circular Hydraulic Jump ring!
        """
        steel = hex_rgb("#CBD5E1")
        chrome = hex_rgb("#F8FAFC")
        plate = hex_rgb("#FFFFFF")
        fast_w = hex_rgb("#38BDF8")
        ring_w = hex_rgb("#0EA5E9")
        parts: List[Mesh] = []

        # Kitchen countertop + recessed stainless sink basin walls
        parts.append(make_beveled_box(4.2, 0.28, 3.2, hex_rgb("#334155"), bevel=0.04).transformed(pos=(0.0, -0.22, 0.0)))
        parts.append(make_beveled_box(2.6, 0.08, 2.0, steel, bevel=0.03, roughness=0.22).transformed(pos=(0.0, 0.0, 0.0)))
        for sx in (-1.32, 1.32):
            parts.append(make_beveled_box(0.12, 0.42, 2.08, steel, bevel=0.03, roughness=0.22).transformed(pos=(sx, 0.18, 0.0)))
        parts.append(make_beveled_box(2.74, 0.42, 0.12, steel, bevel=0.03, roughness=0.22).transformed(pos=(0.0, 0.18, -1.02)))

        # Sculpted Chrome Gooseneck Faucet + Lever Handle!
        spout_pts = [
            (0.0, 0.35, -0.92),
            (0.0, 1.35, -0.90),
            (0.0, 1.68, -0.62),
            (0.0, 1.72, -0.22),
            (0.0, 1.48, 0.0),
        ]
        parts.append(make_tube_along_path(spout_pts, 0.065, chrome, sides=14, roughness=0.10))
        parts.append(make_cylinder(0.11, 0.13, 0.24, chrome, segments=16, roughness=0.12).transformed(pos=(0.0, 0.48, -0.92)))
        parts.append(make_cylinder(0.025, 0.025, 0.26, chrome, segments=10).transformed(pos=(0.22, 0.54, -0.92), rot=(0.0, 0.0, -0.85)))

        # White Ceramic Dinner Plate (`piring`) centered beneath faucet
        parts.append(make_cylinder(0.92, 0.76, 0.09, plate, segments=28, roughness=0.14).transformed(pos=(0.0, 0.08, 0.0)))
        parts.append(make_tube_along_path(_circle_path_xz(0.0, 0.14, 0.0, 0.88, 28), 0.045, hex_rgb("#E2E8F0"), sides=10, closed=True, roughness=0.15))

        # Vertical water jet from faucet -> thin fast radial sheet -> abrupt thick circular Hydraulic Jump ring!
        parts.append(make_cylinder(0.042, 0.052, 1.36, fast_w, segments=14, emission=1.8, roughness=0.08).transformed(pos=(0.0, 0.80, 0.0)))
        parts.append(make_cylinder(0.46, 0.46, 0.022, fast_w, segments=26, emission=1.5, roughness=0.08).transformed(pos=(0.0, 0.135, 0.0)))
        r_jump = 0.48 + 0.015 * math.sin(time_s * 6.0)
        parts.append(make_tube_along_path(_circle_path_xz(0.0, 0.19, 0.0, r_jump, 28), 0.075, hex_rgb("#F8FAFC"), sides=12, closed=True, emission=2.1))
        parts.append(make_ring_collar(r_jump + 0.04, 0.84, 0.125, 0.205, ring_w, segments=28, roughness=0.12))
        return Mesh.merge(parts)

    # =========================================================================
    # KT-S14: AIRCRAFT WHEEL + CARBON BRAKES + MELTING THERMAL FUSIBLE PLUG
    # =========================================================================
    @staticmethod
    def aircraft_wheel_fusible_cutaway(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot_y: float = 0.0,
        scale: float = 1.0,
        brake_heat: float = 0.0,    # 0..1 glowing red-orange carbon brake stack
        plug_melted: float = 0.0,   # 0..1 eutectic core melts & vents controlled nitrogen stream
        tire_deflate: float = 0.0,  # 0..1 controlled tire sidewall sag (never explodes!)
    ) -> Mesh:
        """
        Macro Cutaway of Commercial Airliner Main-Gear Wheel, Tire, Multi-Disc Carbon Brakes,
        and 3 Brass Thermal Fusible Plugs inside the forged alloy rim barrel!
        """
        rubber = hex_rgb("#111827")
        alloy = hex_rgb("#CBD5E1")
        brass = hex_rgb("#F59E0B")
        solder = hex_rgb("#38BDF8")
        parts: List[Mesh] = []

        # Forged Split-Rim Alloy Wheel Outer Barrel + Recessed Axle Hub (exposing Brake Rotors inside!)
        parts.append(make_ring_collar(0.49, 0.58, -0.26, 0.26, alloy, segments=26, roughness=0.20).transformed(pos=(0.0, 0.88, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))
        parts.append(make_cylinder(0.18, 0.18, 0.62, hex_rgb("#64748B"), segments=18, roughness=0.25).transformed(pos=(0.0, 0.88, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))

        # Radial Aircraft Tire with 3/4 Cutaway Arc exposing pressurized inner chamber!
        squish_y = 1.0 - 0.18 * tire_deflate
        squish_x = 1.0 + 0.10 * tire_deflate
        tire_pts = []
        for k in range(21):
            ang = 0.55 + (2 * math.pi * 0.76) * (k / 20.0)  # leaves top-right quadrant sliced open!
            tx = 0.86 * math.cos(ang) * squish_x
            ty = 0.88 + 0.86 * math.sin(ang) * squish_y
            tire_pts.append((tx, ty, 0.0))
        parts.append(make_tube_along_path(tire_pts, 0.27, rubber, sides=14, roughness=0.78))

        # Multi-Rotor Carbon Brake Stack glowing fiery red-orange right inside open wheel hub + Hydraulic Caliper!
        disc_col = (
            0.22 + 0.78 * brake_heat,
            0.16 + 0.18 * brake_heat,
            0.14 * (1.0 - brake_heat),
        )
        for dz in (-0.16, -0.04, 0.08, 0.20):
            parts.append(
                make_ring_collar(0.20, 0.46, dz - 0.025, dz + 0.025, disc_col, segments=24, roughness=0.32).with_material(emission=3.6 * brake_heat).transformed(
                    pos=(0.0, 0.88, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)
                )
            )
        parts.append(make_beveled_box(0.28, 0.34, 0.48, hex_rgb("#334155"), bevel=0.03).transformed(pos=(-0.34, 0.88, 0.05)))

        # 3 Threaded Brass Thermal Fusible Plugs mounted radially through the alloy wheel rim!
        for pk, pang in enumerate((0.32, 2.42, 4.52)):
            px = 0.55 * math.cos(pang)
            py = 0.88 + 0.55 * math.sin(pang)
            parts.append(
                make_cylinder(0.065, 0.065, 0.18, brass, segments=12, emission=1.2, roughness=0.20).transformed(
                    pos=(px, py, 0.16), rot=(0.0, 0.0, pang - math.pi * 0.5)
                )
            )
            if pk == 0:
                # Hero cutaway plug in the open top-right quadrant!
                if plug_melted < 0.35:
                    # Intact silver-cyan low-melting eutectic alloy core sealing the channel
                    parts.append(make_icosphere(0.048, solder, subdivisions=1, emission=1.8).transformed(pos=(px, py, 0.22)))
                else:
                    # Core melted -> molten droplets + controlled cyan-white nitrogen venting stream!
                    for vk in range(6):
                        vy = py + 0.14 * (vk + 1) * plug_melted
                        vx = px + 0.18 * (vk + 1) * plug_melted
                        parts.append(
                            make_icosphere(0.045 + 0.018 * vk, hex_rgb("#E0F2FE"), subdivisions=1, emission=2.8).transformed(
                                pos=(vx, vy, 0.22)
                            )
                        )

        # Landing gear oleo strut descending from wing above
        parts.append(make_cylinder(0.11, 0.12, 1.35, hex_rgb("#94A3B8"), segments=14, roughness=0.25).transformed(pos=(0.0, 1.65, -0.34)))
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0), scale=scale)

    # =========================================================================
    # KT-R01: ELEVATOR DUAL-TRACK SILL, EMPTY SHAFT, INTERLOCK BEAK & CLUTCH VANE
    # =========================================================================
    @staticmethod
    def elevator_interlock_suite(
        mode: str = "sill",         # "sill" | "empty_shaft" | "interlock"
        door_open: float = 0.0,     # 0..1 synchronized door opening
        car_offset_y: float = 0.0,  # vertical elevator car offset relative to floor
        clutch_engaged: float = 0.0,# 0..1 cabin vane expands to engage pickup rollers & lift hook!
        time_s: float = 0.0,
    ) -> Mesh:
        steel = hex_rgb("#CBD5E1")
        cabin_col = hex_rgb("#94A3B8")
        wall_col = hex_rgb("#E2E8F0")
        shaft_dark = hex_rgb("#090D16")
        brass = hex_rgb("#F59E0B")
        red = hex_rgb("#EF4444")
        cyan = hex_rgb("#22D3EE")
        parts: List[Mesh] = []

        # Lobby floor + Dark Hoistway Shaft backdrop + Steel T-Guide Rails!
        parts.append(make_flat_quad_xz(-3.8, -0.2, 3.8, 3.8, 0.0, hex_rgb("#64748B"), subdiv=2))
        parts.append(make_beveled_box(4.2, 5.2, 0.25, shaft_dark, bevel=0.02).transformed(pos=(0.0, 1.6, -1.55)))
        for gx in (-1.35, 1.35):
            parts.append(make_beveled_box(0.09, 5.0, 0.12, hex_rgb("#475569"), bevel=0.01).transformed(pos=(gx, 1.6, -1.25)))

        # Anodized Aluminum Dual-Groove Sill Threshold at Z = 0.0 (TWO distinct parallel tracks!)
        parts.append(make_beveled_box(2.55, 0.07, 0.42, hex_rgb("#E2E8F0"), bevel=0.01, roughness=0.22).transformed(pos=(0.0, 0.035, -0.18)))
        # Track 1 (Outer Landing Door groove, Z = -0.06) & Track 2 (Inner Cabin Door groove, Z = -0.28)
        parts.append(make_beveled_box(2.48, 0.025, 0.045, cyan, bevel=0.004, emission=2.2).transformed(pos=(0.0, 0.072, -0.06)))
        parts.append(make_beveled_box(2.48, 0.025, 0.045, brass, bevel=0.004, emission=2.2).transformed(pos=(0.0, 0.072, -0.28)))

        slide = 0.56 * door_open
        # Outer Landing Wall Frame (left & right jambs + header)
        for sx in (-1.45, 1.45):
            parts.append(make_beveled_box(0.68, 2.65, 0.22, wall_col, bevel=0.03).transformed(pos=(sx, 1.32, 0.04)))
        parts.append(make_beveled_box(3.58, 0.45, 0.24, wall_col, bevel=0.03).transformed(pos=(0.0, 2.72, 0.04)))

        # Outer Landing Doors (on Z = -0.06 track)
        for sx in (-1.0, 1.0):
            parts.append(
                make_beveled_box(0.56, 2.28, 0.065, steel, bevel=0.015, roughness=0.20).transformed(
                    pos=(sx * (0.30 + slide), 1.20, -0.06)
                )
            )

        if mode == "empty_shaft":
            # Car is far above (y = +2.8) -> unlatched landing doors expose pitch-dark hoistway shaft + startled passenger!
            for ky in (-0.8, 0.4, 1.6):
                parts.append(make_beveled_box(2.6, 0.08, 0.14, hex_rgb("#334155"), bevel=0.01).transformed(pos=(0.0, ky, -1.35)))
            parts.append(make_tube_along_path([(-0.4, -1.0, -1.1), (-0.4, 3.5, -1.1)], 0.022, hex_rgb("#94A3B8"), sides=6))
            parts.append(make_tube_along_path([(0.4, -1.0, -1.1), (0.4, 3.5, -1.1)], 0.022, hex_rgb("#94A3B8"), sides=6))
            parts.append(HumanRigV3.build(pos=(-0.62, 0.0, 0.82), rot_y=math.pi * 0.88, scale=0.98, role="civilian_m", jacket_hex="#EF4444", startled=1.0, time_s=time_s))
        else:
            # Elevator Cabin Cage (at Z = -0.28 .. -1.18, offset by car_offset_y) + Inner Cabin Doors!
            parts.append(make_beveled_box(2.38, 2.42, 0.92, cabin_col, bevel=0.03, alpha=0.35 if mode == "interlock" else 1.0).transformed(pos=(0.0, 1.22 + car_offset_y, -0.78)))
            parts.append(make_beveled_box(2.22, 0.06, 0.78, hex_rgb("#FEF08A"), bevel=0.01, emission=1.8).transformed(pos=(0.0, 2.34 + car_offset_y, -0.78)))
            for sx in (-1.0, 1.0):
                parts.append(
                    make_beveled_box(0.55, 2.24, 0.060, hex_rgb("#38BDF8"), bevel=0.015, roughness=0.22).transformed(
                        pos=(sx * (0.30 + slide), 1.20 + car_offset_y, -0.28)
                    )
                )

            # HERO INTERLOCK MECHANISM on Door Header (Y ≈ 2.28, visible in macro cutaway!):
            # 1) Fixed lock keeper box + Pivoted Brass/Red Interlock Hook Beak on Landing Door!
            hook_lift = 0.52 * clutch_engaged
            parts.append(make_beveled_box(0.22, 0.18, 0.14, hex_rgb("#1E293B"), bevel=0.015).transformed(pos=(-0.06, 2.38, -0.04)))
            parts.append(
                make_beveled_box(0.34, 0.09, 0.10, red if clutch_engaged < 0.3 else brass, bevel=0.015, emission=2.2).transformed(
                    pos=(0.14 + slide, 2.38 + 0.06 * clutch_engaged, -0.04),
                    rot=(0.0, 0.0, hook_lift),
                )
            )
            # 2) Dual Pickup Rollers (`roda kunci`) attached to Outer Landing Door!
            for rx_off in (0.18, 0.42):
                parts.append(
                    make_cylinder(0.065, 0.065, 0.12, brass, segments=14, emission=1.8).transformed(
                        pos=(rx_off + slide, 2.18, -0.14), rot=(math.pi * 0.5, 0.0, 0.0)
                    )
                )
            # 3) Vertical Cabin Clutch Vane (`bilah kabin`) mounted on Inner Cabin Door!
            vane_spread = 0.09 + 0.045 * clutch_engaged
            for vx_sgn in (-1.0, 1.0):
                parts.append(
                    make_beveled_box(0.035, 0.38, 0.22, cyan, bevel=0.008, emission=2.4).transformed(
                        pos=(0.30 + slide + vx_sgn * vane_spread, 2.16 + car_offset_y, -0.22)
                    )
                )

        return Mesh.merge(parts)

    # =========================================================================
    # KT-R02: TWIN SKYSCRAPERS + SEISMIC POUNDING + MALL SKYBRIDGE ACCORDION
    # =========================================================================
    @staticmethod
    def twin_towers_seismic_scene(
        mode: str = "gap",   # "pounding" | "gap" | "skybridge_interior"
        time_s: float = 0.0,
    ) -> Mesh:
        parts: List[Mesh] = []
        if mode == "skybridge_interior":
            # Inside the Enclosed Glass Mall Skybridge (`lorong penghubung mal`)!
            shift_x = 0.22 * math.sin(time_s * 4.2)
            # Left floor deck (Tower A) & Right floor deck (Tower B, oscillating with earthquake!)
            parts.append(make_beveled_box(2.2, 0.24, 3.4, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(-1.38, -0.12, 0.0)))
            parts.append(make_beveled_box(2.2, 0.24, 3.4, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(1.38 + shift_x, -0.12, 0.08 * math.cos(time_s * 3.5))))
            # Glass skybridge mullions & ceiling truss (seeing city towers outside!)
            for gx in (-2.0, -1.0, 1.0 + shift_x, 2.0 + shift_x):
                parts.append(make_beveled_box(0.08, 2.55, 0.12, hex_rgb("#64748B"), bevel=0.01).transformed(pos=(gx, 1.25, -1.55)))
            parts.append(make_beveled_box(5.2, 2.4, 0.06, hex_rgb("#38BDF8"), bevel=0.01, alpha=0.30, emission=0.6).transformed(pos=(0.0, 1.25, -1.58)))
            parts.append(make_beveled_box(5.2, 0.14, 3.4, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(0.5 * shift_x, 2.52, 0.0)))

            # HERO ACCORDION SEISMIC EXPANSION FLOOR PLATE (`pelat akordeon fleksibel`) spanning the gap!
            gap_w = 0.56 + shift_x
            n_pleats = 7
            pleat_pts = []
            for pk in range(n_pleats + 1):
                px = -0.28 + gap_w * (pk / n_pleats)
                py = 0.02 + (0.075 if pk % 2 == 1 else 0.005)
                pleat_pts.append((px, py, 0.0))
            for zz in (-1.2, -0.6, 0.0, 0.6, 1.2):
                pts_z = [(p[0], p[1], zz) for p in pleat_pts]
                parts.append(make_tube_along_path(pts_z, 0.045, hex_rgb("#F59E0B"), sides=8, emission=1.6, roughness=0.22))
            parts.append(make_beveled_box(abs(gap_w) + 0.18, 0.03, 3.2, hex_rgb("#94A3B8"), bevel=0.01, roughness=0.25).transformed(pos=(0.5 * shift_x, 0.02, 0.0)))

            # Mall shoppers walking safely across the flexing seismic plate!
            parts.append(HumanRigV3.build(pos=(-0.78, 0.0, 0.32), rot_y=1.35, scale=0.95, role="civilian_f", jacket_hex="#EC4899", point_arm=0.9, time_s=time_s))
            parts.append(HumanRigV3.build(pos=(0.88 + shift_x, 0.0, -0.25), rot_y=-1.45, scale=0.95, role="civilian_m", jacket_hex="#0284C7", walk_phase=time_s * 3.0, walk_amp=0.5, time_s=time_s))
            return Mesh.merge(parts)

        # Exterior Urban Plaza + Seismic Ground Waves
        parts.append(make_flat_quad_xz(-5.5, -4.0, 5.5, 4.0, 0.0, hex_rgb("#334155"), subdiv=2))
        sway_stiff = 0.08 * math.sin(time_s * 6.8)           # Short stiff building (fast period!)
        sway_tall = -0.22 * math.sin(time_s * 3.4 + 0.8)     # Tall slender skyscraper (slow period, out-of-phase!)

        base_sep = 0.56 if mode == "pounding" else 1.18
        # Left Stiff 10-Story Podium Tower (X = -base_sep)
        for fl in range(7):
            fy = 0.24 + fl * 0.42
            fx = -base_sep - 0.38 + sway_stiff * (fl / 6.0)
            parts.append(make_beveled_box(1.25, 0.36, 1.35, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(fx, fy, 0.0)))
            parts.append(make_beveled_box(1.28, 0.16, 1.38, hex_rgb("#38BDF8"), bevel=0.01, emission=0.9).transformed(pos=(fx, fy + 0.04, 0.0)))

        # Right Slender 24-Story Glass Curtain-Wall Tower (X = +base_sep)
        for fl in range(11):
            fy = 0.24 + fl * 0.42
            fx = base_sep + 0.32 + sway_tall * ((fl / 10.0) ** 1.35)
            parts.append(make_beveled_box(1.12, 0.38, 1.28, hex_rgb("#1E3A8A"), bevel=0.03, roughness=0.16).transformed(pos=(fx, fy, 0.0)))
            parts.append(make_beveled_box(1.15, 0.22, 1.31, hex_rgb("#7DD3FC"), bevel=0.01, emission=1.1).transformed(pos=(fx, fy, 0.0)))

        if mode == "pounding":
            # Violent collision at top of podium (fl=6, y=2.76) with red fracture sparks!
            hit = max(0.0, (sway_stiff - sway_tall) * 3.2)
            parts.append(make_icosphere(0.24 + 0.15 * hit, hex_rgb("#EF4444"), subdivisions=2, emission=4.2).transformed(pos=(0.0, 2.75, 0.55)))
        else:
            # Enclosed Skybridge with Accordion Expansion Collar at Y = 2.15 + glowing cyan safety gap!
            parts.append(make_beveled_box(1.45, 0.44, 0.68, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(0.0, 2.12, 0.35)))
            parts.append(make_beveled_box(0.32, 0.48, 0.74, hex_rgb("#F59E0B"), bevel=0.02, emission=2.0).transformed(pos=(0.0, 2.12, 0.35)))
        return Mesh.merge(parts)

    # =========================================================================
    # KT-R03: BRIDGE STEEL FINGER EXPANSION JOINT + CRACKED ABUTMENT + BOLTS
    # =========================================================================
    @staticmethod
    def bridge_finger_joint_scene(
        mode: str = "finger_macro",  # "overview" | "rigid_crack" | "finger_macro" | "loose_bolts"
        thermal_expand: float = 0.0, # -1..+1 contraction/expansion
        time_s: float = 0.0,
    ) -> Mesh:
        concrete = hex_rgb("#94A3B8")
        asphalt = hex_rgb("#1E293B")
        steel = hex_rgb("#E2E8F0")
        amber = hex_rgb("#F59E0B")
        red = hex_rgb("#EF4444")
        parts: List[Mesh] = []

        if mode in ("finger_macro", "loose_bolts"):
            gap = 0.34 - 0.16 * thermal_expand
            rattle = 0.045 * math.sin(time_s * 28.0) if mode == "loose_bolts" else 0.0
            # Left Abutment Deck & Right Bridge Span Deck + Neoprene Drainage Trough beneath
            parts.append(make_beveled_box(2.2, 0.52, 2.6, concrete, bevel=0.03).transformed(pos=(-1.35, 0.26, 0.0)))
            parts.append(make_beveled_box(2.2, 0.52, 2.6, concrete, bevel=0.03).transformed(pos=(1.35 + gap * 0.4, 0.26, 0.0)))
            parts.append(make_beveled_box(2.1, 0.12, 2.5, asphalt, bevel=0.02).transformed(pos=(-1.42, 0.56, 0.0)))
            parts.append(make_beveled_box(2.1, 0.12, 2.5, asphalt, bevel=0.02).transformed(pos=(1.42 + gap * 0.4, 0.56, 0.0)))
            # Black EPDM rubber drainage gutter under the gap
            parts.append(make_beveled_box(0.85, 0.08, 2.55, hex_rgb("#0F172A"), bevel=0.02).transformed(pos=(0.0, 0.22, 0.0)))

            # Interlocking Comb/Finger Steel Plates (`jari baja saling silang`)!
            n_fingers = 9
            for fk in range(n_fingers):
                fz = -1.04 + fk * 0.26
                if fk % 2 == 0:
                    # Finger cantilevered from Left plate
                    parts.append(
                        make_beveled_box(0.72, 0.075, 0.105, steel, bevel=0.012, roughness=0.20).transformed(
                            pos=(-0.18, 0.585 + rattle, fz)
                        )
                    )
                else:
                    # Interleaved finger cantilevered from Right plate!
                    parts.append(
                        make_beveled_box(0.72, 0.075, 0.105, hex_rgb("#38BDF8"), bevel=0.012, emission=0.8, roughness=0.20).transformed(
                            pos=(0.18 + gap * 0.4, 0.585 - rattle, fz)
                        )
                    )

            # Anchor Studs & Bolts along Steel Edge Beams!
            for bz in (-0.95, -0.32, 0.32, 0.95):
                loose = mode == "loose_bolts" and bz in (-0.32, 0.32)
                b_col = red if loose else amber
                lift = 0.09 + (0.04 * abs(math.sin(time_s * 20.0))) if loose else 0.0
                parts.append(make_cylinder(0.055, 0.055, 0.18, b_col, segments=8, emission=2.6 if loose else 0.6).transformed(pos=(-0.48, 0.62 + lift, bz)))
                parts.append(make_cylinder(0.055, 0.055, 0.18, steel, segments=8).transformed(pos=(0.48 + gap * 0.4, 0.62, bz)))

            # Rolling car wheel passing directly over the steel fingers!
            wx = -1.2 + ((time_s * 1.4) % 2.6)
            parts.append(V5HeroProps.sedan_car(pos=(wx, 0.62, 0.05), rot_y=0.0, scale=1.05, body_hex="#0284C7", wheel_spin=-time_s * 8.0))
            return Mesh.merge(parts)

        # Wide Elevated Highway Overpass + Concrete Abutment + Cars & Truck!
        parts.append(make_flat_quad_xz(-5.5, -3.5, 5.5, 3.5, 0.0, hex_rgb("#334155"), subdiv=2))
        parts.append(make_beveled_box(1.5, 1.65, 2.4, concrete, bevel=0.04).transformed(pos=(-2.35, 0.82, 0.0)))
        parts.append(make_beveled_box(0.9, 1.55, 2.0, concrete, bevel=0.04).transformed(pos=(2.35, 0.78, 0.0)))
        span_len = 4.35 + 0.24 * thermal_expand
        parts.append(make_beveled_box(span_len, 0.42, 2.25, hex_rgb("#CBD5E1"), bevel=0.03, emission=0.8 * max(0.0, thermal_expand)).transformed(pos=(0.15, 1.68, 0.0)))
        parts.append(make_beveled_box(span_len, 0.10, 2.15, asphalt, bevel=0.02).transformed(pos=(0.15, 1.92, 0.0)))
        if mode == "rigid_crack":
            # Glowing red jagged fracture across abutment head where un-jointed bridge pushed rigid concrete!
            parts.append(make_tube_along_path([(-1.68, 1.75, 1.18), (-1.82, 1.35, 1.20), (-1.65, 0.92, 1.18), (-1.88, 0.45, 1.18)], 0.048, red, sides=8, emission=3.8))
            parts.append(make_icosphere(0.18, red, subdivisions=1, emission=3.5).transformed(pos=(-1.68, 1.65, 1.15)))
        else:
            parts.append(make_beveled_box(0.24, 0.12, 2.16, amber, bevel=0.01, emission=2.2).transformed(pos=(-1.62, 1.93, 0.0)))
        parts.append(V5HeroProps.sedan_car(pos=(-0.85 + ((time_s * 1.6) % 2.8), 1.96, 0.42), scale=0.72, body_hex="#EF4444", wheel_spin=-time_s * 7.0))
        parts.append(V4HeroModels.heavy_truck(pos=(1.2 - ((time_s * 1.1) % 2.6), 1.96, -0.45), rot_y=math.pi, scale=0.58, wheel_spin=time_s * 6.0))
        return Mesh.merge(parts)

    # =========================================================================
    # KT-R04: SUNKEN MANHOLE CUTAWAY + RIGID SHAFT + ROLLER + PIPE EROSION
    # =========================================================================
    @staticmethod
    def manhole_cutaway_scene(
        mode: str = "surface",   # "surface" | "cutaway" | "roller" | "pipe_leak"
        settle: float = 0.24,    # asphalt bowl settlement around rigid manhole shaft
        time_s: float = 0.0,
    ) -> Mesh:
        iron = hex_rgb("#334155")
        concrete = hex_rgb("#CBD5E1")
        bedrock = hex_rgb("#475569")
        soil = hex_rgb("#92400E")
        asphalt = hex_rgb("#1E293B")
        water = hex_rgb("#38BDF8")
        parts: List[Mesh] = []

        # Deep Bedrock Stratum (Y = -2.1 .. -1.65)
        parts.append(make_beveled_box(5.6, 0.48, 3.2, bedrock, bevel=0.04, roughness=0.88).transformed(pos=(0.0, -1.88, 0.0)))

        # Rigid Precast Concrete Manhole Chimney Shaft anchored directly on Bedrock! (Top NEVER sinks: Y = +0.22!)
        if mode == "surface":
            parts.append(make_cylinder(0.46, 0.46, 0.28, iron, segments=24, roughness=0.45).transformed(pos=(0.0, 0.10, 0.0)))
        else:
            # Sliced cutaway concrete chimney shaft + steel ladder rungs inside!
            parts.append(make_cylinder(0.48, 0.52, 1.88, concrete, segments=22, roughness=0.65).transformed(pos=(0.0, -0.72, -0.18)))
            parts.append(make_beveled_box(1.35, 0.22, 1.35, concrete, bevel=0.03).transformed(pos=(0.0, -1.58, -0.15)))
        # Ribbed Cast-Iron Manhole Frame & Cover protruding at Y = +0.22!
        parts.append(make_cylinder(0.48, 0.50, 0.10, iron, segments=24, roughness=0.38).transformed(pos=(0.0, 0.20, -0.12 if mode != "surface" else 0.0)))
        parts.append(make_tube_along_path(_circle_path_xz(0.0, 0.26, -0.12 if mode != "surface" else 0.0, 0.34, 20), 0.022, hex_rgb("#F59E0B"), sides=8, closed=True, emission=1.4))

        # Surrounding Granular Soil Backfill + Sunken Bowl-Shaped Asphalt Surface!
        for sx in (-1.0, 1.0):
            for k in range(5):
                x_seg = sx * (0.78 + k * 0.44)
                # Closest to manhole (k=0,1) settles deepest (`settle`)!
                dip = settle * math.exp(-k * 0.55)
                parts.append(make_beveled_box(0.46, 1.55 - dip, 2.6, soil, bevel=0.03, roughness=0.88).transformed(pos=(x_seg, -0.86 - 0.5 * dip, 0.0)))
                parts.append(make_beveled_box(0.47, 0.16, 2.65, asphalt, bevel=0.02, roughness=0.80).transformed(pos=(x_seg, 0.0 - dip, 0.0)))

        if mode == "surface":
            # Swerving Sedan Car + Motorcycle dodging the protruding manhole lip!
            parts.append(V5HeroProps.sedan_car(pos=(-1.35, 0.02, 0.65), rot_y=0.22, scale=0.88, body_hex="#0EA5E9", wheel_spin=-time_s * 7.0))
            parts.append(V5HeroProps.sport_motorcycle(pos=(1.15, 0.02, -0.55), rot=(0.0, -2.85, 0.15), scale=0.88, wheel_spin=time_s * 8.0))
        elif mode == "roller":
            # Heavy Tandem Steel-Drum Road Roller unable to compact tight curved collar + Heavy Truck!
            parts.append(V5HeroProps.tandem_road_roller(pos=(-1.55, 0.04, 0.15), rot_y=0.18, scale=0.88, drum_spin=-time_s * 4.5))
            parts.append(V4HeroModels.heavy_truck(pos=(1.65, 0.04, -0.25), rot_y=math.pi, scale=0.68, wheel_spin=time_s * 5.0))
        elif mode == "pipe_leak":
            # Underground Concrete Sewer Pipe + Leaking Joint washing soil grains into an erosion void!
            parts.append(make_cylinder(0.24, 0.24, 3.8, hex_rgb("#94A3B8"), segments=18).transformed(pos=(0.0, -1.18, 0.28), rot=(0.0, 0.0, math.pi * 0.5)))
            # Dark erosion cavity + glowing cyan water leak jet + falling soil granules!
            parts.append(make_icosphere(0.36, hex_rgb("#0F172A"), subdivisions=2).transformed(pos=(0.82, -0.88, 0.36), scale=(1.3, 0.85, 0.8)))
            for wk in range(6):
                wy = -1.08 + 0.08 * wk
                wx = 0.72 + 0.06 * math.sin(time_s * 8.0 + wk)
                parts.append(make_icosphere(0.055, water, subdivisions=1, emission=2.6).transformed(pos=(wx, wy, 0.44)))

        return Mesh.merge(parts)

    # =========================================================================
    # KT-R05: CWR TRACK BUCKLING + HYDRAULIC RAIL TENSOR + PANDROL CLIPS + SIGNAL
    # =========================================================================
    @staticmethod
    def cwr_rail_scene(
        mode: str = "buckling",  # "buckling" | "tensor" | "ballast" | "speed_signal"
        buckle_amp: float = 0.0,
        time_s: float = 0.0,
    ) -> Mesh:
        ballast_col = hex_rgb("#64748B")
        sleeper_col = hex_rgb("#CBD5E1")
        steel_rail = hex_rgb("#E2E8F0")
        hot_rail = hex_rgb("#F97316")
        yel = hex_rgb("#FACC15")
        parts: List[Mesh] = []

        # Earth embankment + Crushed Granite Ballast Bed (wide shoulder in "ballast"/"speed_signal" modes!)
        wide_sh = 1.0 if mode in ("ballast", "tensor", "speed_signal") else 0.0
        parts.append(make_flat_quad_xz(-5.0, -5.0, 5.0, 5.0, 0.0, hex_rgb("#44403C"), subdiv=2))
        parts.append(make_beveled_box(2.35 + 0.85 * wide_sh, 0.34, 7.6, ballast_col, bevel=0.10, roughness=0.90).transformed(pos=(0.0, 0.17, 0.0)))

        # 15 Concrete Sleepers (`bantalan beton`) + Twin Continuous Welded Steel Rails + Pandrol Elastic Clips!
        left_pts, right_pts = [], []
        for sk in range(15):
            sz = -3.4 + sk * 0.48
            # Lateral S-curve track buckling displacement around Z = 0!
            lat = buckle_amp * math.sin(sz * 1.45) * math.exp(-(sz * sz) / 3.2)
            parts.append(make_beveled_box(1.78, 0.11, 0.22, sleeper_col, bevel=0.02, roughness=0.65).transformed(pos=(lat, 0.36, sz)))
            left_pts.append((-0.54 + lat, 0.46, sz))
            right_pts.append((0.54 + lat, 0.46, sz))
            # Red/Orange Pandrol e-clips locking rail foot to sleeper!
            for rx_s in (-0.54, 0.54):
                parts.append(make_icosphere(0.038, hex_rgb("#DC2626"), subdivisions=1, emission=0.8).transformed(pos=(rx_s + lat + 0.06, 0.43, sz)))

        r_col = hot_rail if buckle_amp > 0.15 else steel_rail
        r_emit = 2.0 if buckle_amp > 0.15 else 0.2
        parts.append(make_tube_along_path(left_pts, 0.048, r_col, sides=8, emission=r_emit, roughness=0.22))
        parts.append(make_tube_along_path(right_pts, 0.048, r_col, sides=8, emission=r_emit, roughness=0.22))

        if mode == "tensor":
            # Authentic Yellow Hydraulic Rail Tensor Jack (`dongkrak hidraulik penarik rel`) clamping & stretching rail!
            for rx_s in (-0.54, 0.54):
                for clamp_z in (-0.65, 0.65):
                    parts.append(make_beveled_box(0.24, 0.20, 0.18, yel, bevel=0.02, emission=1.2).transformed(pos=(rx_s, 0.50, clamp_z)))
                # Twin hydraulic puller cylinders spanning between clamps!
                for ox in (-0.11, 0.11):
                    parts.append(make_cylinder(0.042, 0.042, 1.32, yel, segments=12, roughness=0.25).transformed(pos=(rx_s + ox, 0.54, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))
                    parts.append(make_cylinder(0.026, 0.026, 0.45, hex_rgb("#F8FAFC"), segments=10).transformed(pos=(rx_s + ox, 0.54, 0.0), rot=(math.pi * 0.5, 0.0, 0.0)))
            parts.append(HumanRigV3.build(pos=(1.38, 0.0, 0.25), rot_y=-1.35, scale=0.95, role="engineer", jacket_hex="#EA580C", point_arm=1.0, time_s=time_s))
        else:
            # Approaching Indonesian Express Train (`V4HeroModels.modern_train`)!
            tz = -2.35 if mode != "speed_signal" else -1.6 + 0.35 * math.sin(time_s * 1.2)
            parts.append(V4HeroModels.modern_train(pos=(0.0, 0.44, tz), rot_y=-math.pi * 0.5, scale=0.86))
            if mode == "speed_signal":
                # Trackside Emergency Heat Speed-Restriction Signal Mast + Glowing Amber `40` Aspect!
                parts.append(make_cylinder(0.055, 0.065, 2.35, hex_rgb("#334155"), segments=12).transformed(pos=(1.48, 1.18, 0.65)))
                parts.append(make_beveled_box(0.36, 0.68, 0.22, hex_rgb("#0F172A"), bevel=0.03).transformed(pos=(1.48, 2.18, 0.72)))
                parts.append(make_icosphere(0.10, hex_rgb("#F59E0B"), subdivisions=1, emission=4.2).transformed(pos=(1.48, 2.32, 0.84)))
                parts.append(make_icosphere(0.10, hex_rgb("#EF4444"), subdivisions=1, emission=2.2).transformed(pos=(1.48, 2.04, 0.84)))

        return Mesh.merge(parts)

    # =========================================================================
    # KT-R06: SUPERTALL TOWER + TOP OFFICE SWAY + 660-TON GOLDEN TMD SPHERE
    # =========================================================================
    @staticmethod
    def tmd_skyscraper_scene(
        mode: str = "pendulum",  # "tower_wind" | "dizzy_office" | "pendulum" | "damper_macro" | "seismic_frame"
        time_s: float = 0.0,
    ) -> Mesh:
        gold = hex_rgb("#F59E0B")
        steel = hex_rgb("#CBD5E1")
        glass = hex_rgb("#0EA5E9")
        parts: List[Mesh] = []

        sway = 0.22 * math.sin(time_s * 2.6)  # Tower sways left/right in typhoon wind!

        if mode == "dizzy_office":
            # Top-floor Skyscraper Office Cutaway: swaying ceiling lamp, sloshing water glass on desk, dizzy resident!
            tilt = 0.08 * math.sin(time_s * 2.8)
            room: List[Mesh] = [
                make_beveled_box(4.2, 0.16, 3.2, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(0.0, -0.08, 0.0)),
                make_beveled_box(4.2, 2.65, 0.10, glass, bevel=0.02, alpha=0.35, emission=0.8).transformed(pos=(0.0, 1.32, -1.52)),
                # Office desk + chair + sloshing cyan water glass!
                make_beveled_box(1.35, 0.08, 0.72, hex_rgb("#78350F"), bevel=0.02).transformed(pos=(0.55, 0.76, -0.25)),
                make_beveled_box(0.08, 0.74, 0.66, hex_rgb("#334155"), bevel=0.01).transformed(pos=(-0.05, 0.37, -0.25)),
                make_beveled_box(0.08, 0.74, 0.66, hex_rgb("#334155"), bevel=0.01).transformed(pos=(1.15, 0.37, -0.25)),
                make_cylinder(0.085, 0.072, 0.22, hex_rgb("#E0F2FE"), segments=14, emission=1.8).transformed(pos=(0.45, 0.91, -0.15), rot=(0.0, 0.0, -tilt * 3.5)),
                # Swaying Pendant Ceiling Lamp!
                make_tube_along_path([(0.0, 2.55, -0.15), (0.38 * math.sin(time_s * 2.8), 1.82, -0.15)], 0.018, hex_rgb("#1E293B"), sides=8),
                make_cylinder(0.08, 0.22, 0.18, gold, segments=16, emission=2.6).transformed(pos=(0.38 * math.sin(time_s * 2.8), 1.75, -0.15)),
                # Dizzy resident holding head!
                HumanRigV3.build(pos=(-0.72, 0.0, 0.15), rot_y=0.35, scale=0.98, role="civilian_m", jacket_hex="#2563EB", startled=0.85, time_s=time_s),
            ]
            return Mesh.merge(room).transformed(rot=(0.0, 0.0, tilt))

        if mode in ("tower_wind", "seismic_frame"):
            # Taipei-101-style Multi-Tier Supertall Skyscraper + Spiraling Typhoon Wind Ribbons (or Diagrid Seismic Frame!)
            for tier in range(6):
                ty = 0.42 + tier * 0.76
                tw = 1.42 - tier * 0.07
                tx = sway * ((tier / 5.0) ** 1.4)
                parts.append(make_beveled_box(tw, 0.74, tw, hex_rgb("#0F172A"), bevel=0.04, roughness=0.14).transformed(pos=(tx, ty, 0.0)))
                parts.append(make_beveled_box(tw * 1.04, 0.56, tw * 1.04, glass, bevel=0.03, alpha=0.72 if tier == 5 else 1.0, emission=0.9).transformed(pos=(tx, ty + 0.05, 0.0)))
                if mode == "seismic_frame":
                    # Glowing Steel Diagrid X-Bracing Structural Frame!
                    parts.append(make_tube_along_path([(tx - tw * 0.52, ty - 0.34, tw * 0.54), (tx + tw * 0.52, ty + 0.34, tw * 0.54)], 0.032, gold, sides=8, emission=2.0))
                    parts.append(make_tube_along_path([(tx + tw * 0.52, ty - 0.34, tw * 0.54), (tx - tw * 0.52, ty + 0.34, tw * 0.54)], 0.032, gold, sides=8, emission=2.0))
            # Visible glowing golden TMD sphere inside top glazed crown!
            parts.append(make_icosphere(0.24, gold, subdivisions=2, emission=2.6).transformed(pos=(sway * 0.35, 4.28, 0.0)))
            # Spiraling cyan typhoon wind vortex ribbons wrapping around tower!
            for wk in range(3):
                w_pts = []
                for s in range(18):
                    u = s / 17.0
                    ang = u * 4.5 + time_s * 3.2 + wk * 2.1
                    r = 1.25 + 0.25 * math.sin(u * 6.0)
                    w_pts.append((r * math.cos(ang), 0.8 + u * 3.8, r * math.sin(ang)))
                parts.append(make_tube_along_path(w_pts, 0.032, hex_rgb("#38BDF8"), sides=8, emission=2.2))
            return Mesh.merge(parts)

        # Monumental 2-Story Observation Atrium Housing the 660-Ton Laminated Golden TMD Sphere + Hydraulic Cylinders!
        # Note: When tower frame moves LEFT (-sway), sphere inertia lags RIGHT (+counter_x relative to room)!
        frame_x = -sway
        ball_x = frame_x + sway * 2.15  # Counter-phase relative displacement!

        # Structural atrium columns, ring balcony, and top cable suspension crown (moving with frame_x)
        parts.append(make_beveled_box(3.8, 0.16, 3.4, hex_rgb("#1E293B"), bevel=0.03).transformed(pos=(frame_x, 0.0, 0.0)))
        parts.append(make_ring_collar(1.15, 1.65, 0.08, 0.22, steel, segments=28).transformed(pos=(frame_x, 0.0, 0.0)))
        parts.append(make_beveled_box(3.4, 0.18, 3.0, hex_rgb("#334155"), bevel=0.03).transformed(pos=(frame_x, 3.15, 0.0)))
        for sx in (-1.45, 1.45):
            for sz in (-1.25, 1.25):
                parts.append(make_cylinder(0.085, 0.085, 3.15, steel, segments=12).transformed(pos=(frame_x + sx, 1.58, sz)))

        # 660-Ton Laminated Golden Steel Sphere (stacked horizontal steel discs + equatorial bumper ring!)
        ball_y = 1.48
        parts.append(make_icosphere(0.68, gold, subdivisions=3, emission=0.85, roughness=0.18).transformed(pos=(ball_x, ball_y, 0.0)))
        for ry_off in (-0.38, -0.19, 0.0, 0.19, 0.38):
            rr = math.sqrt(max(0.05, 0.69 ** 2 - ry_off ** 2))
            parts.append(make_tube_along_path(_circle_path_xz(ball_x, ball_y + ry_off, 0.0, rr, 24), 0.018, hex_rgb("#FEF08A"), sides=8, closed=True, emission=1.4))
        parts.append(make_ring_collar(0.72, 0.80, -0.05, 0.05, hex_rgb("#EA580C"), segments=26, roughness=0.22).transformed(pos=(ball_x, ball_y - 0.32, 0.0)))

        # 8 Heavy Braided Steel Suspension Cables from ceiling frame to sphere!
        for ck in range(8):
            ca = ck * (math.pi / 4.0)
            top_pt = (frame_x + 0.85 * math.cos(ca), 3.08, 0.85 * math.sin(ca))
            bot_pt = (ball_x + 0.56 * math.cos(ca), ball_y + 0.36, 0.56 * math.sin(ca))
            parts.append(make_tube_along_path([top_pt, bot_pt], 0.022, steel, sides=8, roughness=0.25))

        # 8 Angled Viscous Hydraulic Damper Cylinders beneath the sphere (glowing warm amber as sway -> oil heat!)
        heat_glow = min(1.0, abs(sway) * 4.2 + (0.65 if mode == "damper_macro" else 0.15))
        for dk in range(6):
            da = dk * (math.pi / 3.0) + 0.25
            base_pt = (frame_x + 1.18 * math.cos(da), 0.22, 1.18 * math.sin(da))
            pin_pt = (ball_x + 0.68 * math.cos(da), ball_y - 0.34, 0.68 * math.sin(da))
            mid_pt = (0.55 * base_pt[0] + 0.45 * pin_pt[0], 0.55 * base_pt[1] + 0.45 * pin_pt[1], 0.55 * base_pt[2] + 0.45 * pin_pt[2])
            parts.append(make_tube_along_path([base_pt, mid_pt], 0.068, hex_rgb("#F97316"), sides=10, emission=2.8 * heat_glow, roughness=0.22))
            parts.append(make_tube_along_path([mid_pt, pin_pt], 0.038, hex_rgb("#F8FAFC"), sides=10, roughness=0.15))

        return Mesh.merge(parts)

    # =========================================================================
    # KT-R07: ELEVATED TOLL UNDERPASS + ELASTOMERIC SHIM CUTAWAY + POT BEARING
    # =========================================================================
    @staticmethod
    def highway_bearing_scene(
        mode: str = "underpass",  # "underpass" | "rigid_crack" | "laminated_cutaway" | "pot_bearing"
        shear_x: float = 0.0,
        time_s: float = 0.0,
    ) -> Mesh:
        concrete = hex_rgb("#94A3B8")
        girder_col = hex_rgb("#CBD5E1")
        rubber = hex_rgb("#111827")
        steel = hex_rgb("#F8FAFC")
        red = hex_rgb("#EF4444")
        parts: List[Mesh] = []

        if mode == "pot_bearing":
            # Heavy Cylindrical Steel Pot Bearing (`bantalan pot baja`) for Mega-Span / High-Seismic Bridges!
            parts.append(make_beveled_box(2.4, 0.55, 2.2, concrete, bevel=0.04).transformed(pos=(0.0, 0.28, 0.0)))
            # Lower Steel Base Plate + Machined Cylindrical Steel Pot + Confined Elastomer Disc + Brass Sealing Ring + Piston + Sliding PTFE Top Plate!
            parts.append(make_beveled_box(1.35, 0.10, 1.35, hex_rgb("#475569"), bevel=0.02, roughness=0.22).transformed(pos=(0.0, 0.60, 0.0)))
            parts.append(make_ring_collar(0.46, 0.58, 0.65, 0.98, hex_rgb("#0284C7"), segments=28, roughness=0.20))
            parts.append(make_cylinder(0.45, 0.45, 0.16, hex_rgb("#1E293B"), segments=24).transformed(pos=(0.0, 0.74, 0.0)))
            parts.append(make_tube_along_path(_circle_path_xz(0.0, 0.84, 0.0, 0.44, 24), 0.025, hex_rgb("#F59E0B"), sides=8, closed=True, emission=1.8))
            parts.append(make_cylinder(0.44, 0.44, 0.18, steel, segments=26, roughness=0.16).transformed(pos=(0.0, 0.96, 0.0)))
            parts.append(make_beveled_box(1.48, 0.12, 1.42, steel, bevel=0.02, roughness=0.14).transformed(pos=(shear_x, 1.12, 0.0)))
            parts.append(make_beveled_box(2.6, 0.48, 2.2, girder_col, bevel=0.03).transformed(pos=(shear_x, 1.42, 0.0)))
            return Mesh.merge(parts)

        if mode == "laminated_cutaway":
            # Macro Cutaway of Laminated Elastomeric Bearing Pad: Alternating Black Rubber & Vulcanized Silver Steel Shims!
            parts.append(make_beveled_box(2.4, 0.55, 2.2, concrete, bevel=0.04).transformed(pos=(0.0, 0.28, 0.0)))
            parts.append(make_beveled_box(1.35, 0.10, 1.15, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(0.0, 0.60, 0.0)))
            n_layers = 9
            for lk in range(n_layers):
                u = lk / (n_layers - 1)
                lx = shear_x * u
                ly = 0.68 + lk * 0.068
                if lk % 2 == 0:
                    # Black synthetic chloroprene/neoprene rubber layer (shears laterally, zero side bulge!)
                    parts.append(make_beveled_box(1.12, 0.046, 0.92, rubber, bevel=0.01, roughness=0.72).transformed(pos=(lx, ly, 0.0)))
                else:
                    # Bright vulcanized internal steel reinforcing shim plate!
                    parts.append(make_beveled_box(1.08, 0.024, 0.90, hex_rgb("#38BDF8"), bevel=0.004, emission=1.9, roughness=0.15).transformed(pos=(lx, ly, 0.0)))
            parts.append(make_beveled_box(2.8, 0.52, 2.1, girder_col, bevel=0.03).transformed(pos=(shear_x, 1.54, 0.0)))
            return Mesh.merge(parts)

        # Full Hammerhead Elevated Highway Pier + Twin I-Girders + Overhead Deck + Heavy Freight Trucks!
        parts.append(make_flat_quad_xz(-5.5, -4.0, 5.5, 4.0, 0.0, hex_rgb("#334155"), subdiv=2))
        parts.append(make_cylinder(0.56, 0.64, 1.85, concrete, segments=22, roughness=0.68).transformed(pos=(0.0, 0.92, 0.0)))
        parts.append(make_beveled_box(3.35, 0.56, 1.45, concrete, bevel=0.05, roughness=0.65).transformed(pos=(0.0, 2.08, 0.0)))

        if mode == "rigid_crack":
            # Rigid steel bolts clamping girder directly to concrete pier cap -> diagonal red shear cracks shattering pier head!
            for bx in (-1.05, 1.05):
                parts.append(make_cylinder(0.065, 0.065, 0.34, red, segments=10, emission=2.4).transformed(pos=(bx, 2.42, 0.52)))
            parts.append(make_tube_along_path([(-1.12, 2.34, 0.74), (-0.88, 1.98, 0.75), (-1.18, 1.68, 0.74)], 0.045, red, sides=8, emission=3.8))
            parts.append(make_tube_along_path([(1.12, 2.34, 0.74), (0.86, 1.96, 0.75), (1.15, 1.66, 0.74)], 0.045, red, sides=8, emission=3.8))
        else:
            # Distinct Black Laminated Elastomeric Bearing Pads sitting proudly in the gap between Pier Cap & Girders!
            for bx in (-1.05, 0.0, 1.05):
                parts.append(make_beveled_box(0.54, 0.16, 0.52, rubber, bevel=0.02, roughness=0.68).transformed(pos=(bx + 0.3 * shear_x, 2.44, 0.35)))
                parts.append(make_beveled_box(0.56, 0.028, 0.54, hex_rgb("#22D3EE"), bevel=0.005, emission=2.2).transformed(pos=(bx + 0.5 * shear_x, 2.44, 0.35)))

        # Longitudinal Concrete Girders + Highway Deck + Overhead Heavy Truck!
        for gx in (-1.05, 0.0, 1.05):
            parts.append(make_beveled_box(0.42, 0.52, 5.2, girder_col, bevel=0.03).transformed(pos=(gx + shear_x, 2.78, 0.0)))
        parts.append(make_beveled_box(3.85, 0.20, 5.2, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(shear_x, 3.14, 0.0)))
        parts.append(V4HeroModels.heavy_truck(pos=(-0.35, 3.24, -1.2 + ((time_s * 1.5) % 2.8)), rot_y=-math.pi * 0.5, scale=0.66, wheel_spin=time_s * 6.0))
        return Mesh.merge(parts)

    # =========================================================================
    # KT-R08: 50-STORY HOTEL CUTAWAY + FAUCET BURST + BREAK TANK + PRV BATHROOM
    # =========================================================================
    @staticmethod
    def hotel_plumbing_scene(
        mode: str = "tower_zones",  # "tower_zones" | "faucet_burst" | "break_tank" | "prv_bathroom"
        time_s: float = 0.0,
    ) -> Mesh:
        water = hex_rgb("#38BDF8")
        high_p = hex_rgb("#EF4444")
        brass = hex_rgb("#F59E0B")
        porcelain = hex_rgb("#F8FAFC")
        chrome = hex_rgb("#E2E8F0")
        parts: List[Mesh] = []

        if mode == "faucet_burst":
            # Ground-Floor Hotel Bathroom hit by unzoned 50-bar column: red overpressure pipe + burst sink faucet geyser!
            parts.append(make_flat_quad_xz(-3.2, -2.5, 3.2, 2.5, 0.0, hex_rgb("#CBD5E1"), subdiv=2))
            parts.append(make_beveled_box(4.2, 3.2, 0.16, hex_rgb("#E2E8F0"), bevel=0.03).transformed(pos=(0.0, 1.6, -1.15)))
            # Glowing crimson straight vertical riser pipe + maxed-out pressure gauge!
            parts.append(make_cylinder(0.085, 0.085, 3.1, high_p, segments=14, emission=2.6).transformed(pos=(-0.95, 1.55, -0.95)))
            parts.append(PrecisionMechV3.pressure_gauge(radius=0.24, needle_norm=0.98, danger=True).transformed(pos=(-0.95, 1.85, -0.82)))
            # Pedestal Sink (`wastafel`) + Blown-off Faucet shooting violent high-pressure geyser!
            parts.append(make_cylinder(0.16, 0.22, 0.78, porcelain, segments=18, roughness=0.14).transformed(pos=(0.25, 0.39, -0.58)))
            parts.append(make_cylinder(0.44, 0.28, 0.24, porcelain, segments=22, roughness=0.12).transformed(pos=(0.25, 0.86, -0.58)))
            # Violent vertical/angled water jet + flying chrome faucet cap!
            parts.append(make_cylinder(0.075, 0.16, 1.55, water, segments=14, emission=2.8).transformed(pos=(0.25, 1.72, -0.52)))
            for sk in range(8):
                sa = sk * (math.pi / 4.0) + time_s * 4.0
                parts.append(make_icosphere(0.08, hex_rgb("#E0F2FE"), subdivisions=1, emission=2.5).transformed(pos=(0.25 + 0.38 * math.cos(sa), 2.25 + 0.14 * math.sin(time_s * 9.0 + sk), -0.52 + 0.38 * math.sin(sa))))
            parts.append(HumanRigV3.build(pos=(-0.85, 0.0, 0.38), rot_y=0.65, scale=0.96, role="civilian_m", jacket_hex="#2563EB", startled=1.0, time_s=time_s))
            return Mesh.merge(parts)

        if mode == "break_tank":
            # Mid-Tower Windowless Mechanical Floor (`lantai mekanikal tanpa jendela`) housing Atmospheric Break Tank!
            parts.append(make_beveled_box(4.6, 0.22, 3.2, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.0, 0.0, 0.0)))
            parts.append(make_beveled_box(4.6, 0.22, 3.2, hex_rgb("#475569"), bevel=0.03).transformed(pos=(0.0, 2.75, 0.0)))
            # Louvered windowless mechanical facade wall on left
            for ly in range(7):
                parts.append(make_beveled_box(0.18, 0.12, 2.8, hex_rgb("#64748B"), bevel=0.01).transformed(pos=(-2.15, 0.42 + ly * 0.34, 0.0), rot=(0.0, 0.0, 0.35)))
            # Cutaway Stainless Steel Break Tank resetting hydrostatic pressure to 0 atm free surface!
            parts.append(make_beveled_box(2.15, 1.45, 1.35, hex_rgb("#94A3B8"), bevel=0.04, alpha=0.38).transformed(pos=(0.15, 0.98, 0.0)))
            parts.append(make_beveled_box(1.98, 0.88, 1.18, water, bevel=0.03, emission=1.6, roughness=0.12).transformed(pos=(0.15, 0.72, 0.0)))
            # Incoming high-pressure upper riser + Float Ball Valve + Calm outgoing lower-zone feed pipe!
            parts.append(make_tube_along_path([(-0.65, 2.72, 0.0), (-0.65, 1.48, 0.0), (-0.35, 1.48, 0.0)], 0.065, high_p, sides=10, emission=1.8))
            parts.append(make_icosphere(0.14, brass, subdivisions=2, roughness=0.20).transformed(pos=(0.15, 1.18 + 0.04 * math.sin(time_s * 3.0), 0.0)))
            parts.append(make_tube_along_path([(0.85, 0.42, 0.0), (1.55, 0.42, 0.0), (1.55, -0.45, 0.0)], 0.068, hex_rgb("#22C55E"), sides=10, emission=1.8))
            return Mesh.merge(parts)

        if mode == "prv_bathroom":
            # Split Cutaway: Brass Spring-Diaphragm PRV Valve on Left -> Calm Luxury Hotel Bathroom (`kloset`, `wastafel`, `shower`) on Right!
            parts.append(make_flat_quad_xz(-3.6, -2.5, 3.6, 2.5, 0.0, hex_rgb("#E2E8F0"), subdiv=2))
            parts.append(make_beveled_box(5.2, 3.0, 0.14, hex_rgb("#F1F5F9"), bevel=0.02).transformed(pos=(0.2, 1.5, -1.15)))

            # Left (-1.25): Macro Brass PRV (`Pressure Reducing Valve`) with bell bonnet, helical calibration spring & diaphragm!
            parts.append(make_cylinder(0.24, 0.24, 0.78, brass, segments=18, roughness=0.22).transformed(pos=(-1.25, 1.25, -0.35), rot=(0.0, 0.0, math.pi * 0.5)))
            parts.append(make_cylinder(0.16, 0.26, 0.56, brass, segments=18, roughness=0.22).transformed(pos=(-1.25, 1.65, -0.35)))
            sp_pts = [(-1.25 + 0.11 * math.cos(k * 1.1), 1.45 + 0.36 * (k / 22.0), -0.22 + 0.11 * math.sin(k * 1.1)) for k in range(23)]
            parts.append(make_tube_along_path(sp_pts, 0.022, hex_rgb("#22D3EE"), sides=8, emission=2.2))
            parts.append(PrecisionMechV3.pressure_gauge(radius=0.18, needle_norm=0.32, danger=False).transformed(pos=(-1.25, 0.82, -0.22)))
            parts.append(make_tube_along_path([(-2.05, 1.25, -0.35), (-1.62, 1.25, -0.35)], 0.055, high_p, sides=10, emission=1.6))
            parts.append(make_tube_along_path([(-0.88, 1.25, -0.35), (1.55, 1.25, -0.95)], 0.052, water, sides=10, emission=1.6))

            # Right (+0.1 .. +1.8): Complete Hotel Bathroom — Porcelain Toilet (`kloset`), Sink (`wastafel`), and Rain `Shower`!
            # 1) Porcelain Toilet (`kloset`): pedestal, oval bowl, lid, rear cistern tank + flush button
            parts.append(make_cylinder(0.18, 0.22, 0.38, porcelain, segments=18, roughness=0.12).transformed(pos=(0.15, 0.19, -0.62)))
            parts.append(make_icosphere(0.26, porcelain, subdivisions=2, roughness=0.12).transformed(pos=(0.15, 0.42, -0.54), scale=(0.88, 0.58, 1.18)))
            parts.append(make_beveled_box(0.42, 0.44, 0.20, porcelain, bevel=0.04, roughness=0.12).transformed(pos=(0.15, 0.72, -0.86)))
            # 2) Pedestal Sink (`wastafel`) + Gentle steady laminar faucet stream
            parts.append(make_cylinder(0.13, 0.17, 0.74, porcelain, segments=16, roughness=0.12).transformed(pos=(0.92, 0.37, -0.68)))
            parts.append(make_cylinder(0.32, 0.22, 0.18, porcelain, segments=20, roughness=0.12).transformed(pos=(0.92, 0.80, -0.68)))
            parts.append(make_tube_along_path([(0.92, 0.88, -0.84), (0.92, 1.08, -0.82), (0.92, 1.04, -0.66)], 0.025, chrome, sides=8))
            parts.append(make_cylinder(0.022, 0.025, 0.22, water, segments=10, emission=1.8).transformed(pos=(0.92, 0.92, -0.66)))
            # 3) Overhead Chrome Rain `Shower` + gentle cyan water droplets!
            parts.append(make_tube_along_path([(1.65, 1.15, -0.98), (1.65, 2.25, -0.98), (1.65, 2.25, -0.58)], 0.028, chrome, sides=10))
            parts.append(make_cylinder(0.18, 0.18, 0.04, chrome, segments=18, roughness=0.12).transformed(pos=(1.65, 2.18, -0.58)))
            for sy in range(5):
                parts.append(make_cylinder(0.12, 0.14, 0.22, water, segments=12, alpha=0.65, emission=1.6).transformed(pos=(1.65, 1.92 - sy * 0.36, -0.58)))
            return Mesh.merge(parts)

        # Full 50-Story Luxury Hotel Tower Vertical Cutaway showing 3 Pressure Zones + Windowless Mid Mechanical Floor!
        parts.append(make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#1E293B"), subdiv=2))
        for fl in range(12):
            fy = 0.22 + fl * 0.38
            is_mech = fl in (5, 11)
            col = hex_rgb("#475569") if is_mech else hex_rgb("#E2E8F0")
            parts.append(make_beveled_box(2.35, 0.34, 1.45, col, bevel=0.03).transformed(pos=(0.0, fy, 0.0)))
            if not is_mech:
                parts.append(make_beveled_box(2.38, 0.18, 1.48, hex_rgb("#7DD3FC"), bevel=0.01, emission=0.9).transformed(pos=(0.0, fy, 0.0)))
            else:
                # Glowing Cyan Break Tank visible inside windowless mid-tower & roof mechanical floors!
                parts.append(make_beveled_box(1.15, 0.24, 1.52, water, bevel=0.02, emission=2.4).transformed(pos=(0.0, fy, 0.0)))

        # Color-coded vertical zoned water risers along front cutaway face!
        parts.append(make_cylinder(0.055, 0.055, 1.95, water, segments=12, emission=2.0).transformed(pos=(-0.68, 3.35, 0.78)))
        parts.append(make_cylinder(0.055, 0.055, 1.95, hex_rgb("#22C55E"), segments=12, emission=2.0).transformed(pos=(0.68, 1.15, 0.78)))
        for gy in (0.65, 1.75, 2.95, 4.05):
            parts.append(PrecisionMechV3.pressure_gauge(radius=0.14, needle_norm=0.42, danger=False).transformed(pos=(-0.95, gy, 0.82)))
        return Mesh.merge(parts)
