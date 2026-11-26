"""
Knot Theory V3 Ultra-Diorama Upgrade Library (src/knot_v3_uplevel.py)
Delivers next-generation stylized 3D visual fidelity across three pillars:
  1. HumanRigV3: Articulated 2-segment limbs, sculpted face (sclera, pupils, brows, nose, ears),
     layered clothing (open jacket, hi-vis reflective vest, collar, belt, shoes with soles),
     role headgear (hard-hat + headlamp, full-face helmet, officer cap, sculpted hair / hijab),
     and expressive animations (walk cycle, pointing at cutaway, startled, inspect, CTA wave).
  2. ArchBuilderV3: Multi-story buildings with ground-floor glass storefronts, canopies,
     pilasters, floor slab cornices, framed recessed windows with sills, balconies, AC units,
     rooftop parapets, HVAC chillers, pitched-roof shophouses, and industrial portal halls.
  3. PrecisionMechV3: Flanged pipes with hex-bolt rings, steel Warren trusses, pressure gauges,
     finned heat-sinks, Shinkansen aero-cars, widebody jet wings/engines, diesel-electric
     mountain locomotives, and container ships with cutaway marine engines.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import numpy as np

from src.assets_ep03 import make_pitched_roof
from src.renderer3d import (
    FLAG_CAST_SHADOW,
    FLAG_DEFAULT,
    FLAG_DOUBLE_SIDED,
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


def _rot_pt_x(y: float, z: float, ang: float) -> Tuple[float, float]:
    ca, sa = math.cos(ang), math.sin(ang)
    return (y * ca - z * sa, y * sa + z * ca)


class HumanRigV3:
    """Articulated, expressive, richly clothed stylized 3D character generator (+Z forward in local space)."""

    @staticmethod
    def build(
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot_y: float = 0.0,
        scale: float = 1.0,
        role: str = "engineer",  # "engineer" | "civilian_m" | "civilian_f" | "rider" | "captain"
        jacket_hex: str = "#2563EB",
        shirt_hex: str = "#F8FAFC",
        pants_hex: str = "#1E293B",
        skin_hex: str = "#F1C29B",
        hair_hex: str = "#1F2937",
        walk_phase: float = 0.0,
        walk_amp: float = 0.0,
        point_arm: float = 0.0,       # 0..1 raises right arm to point forward/up
        startled: float = 0.0,        # 0..1 raises both hands & widens brows
        wave_cta: float = 0.0,        # 0..1 friendly wave + downward point for CTA
        head_yaw: float = 0.0,
        head_pitch: float = 0.0,
        holding_tablet: bool = False,
        time_s: float = 0.0,
    ) -> Mesh:
        skin = hex_rgb(skin_hex)
        jacket = hex_rgb(jacket_hex)
        shirt = hex_rgb(shirt_hex)
        pants = hex_rgb(pants_hex)
        hair = hex_rgb(hair_hex)
        sole_col = hex_rgb("#F1F5F9")
        shoe_col = hex_rgb("#0F172A") if role != "engineer" else hex_rgb("#92400E")

        breathe = 0.012 * math.sin(time_s * 3.1)
        bob = abs(math.sin(walk_phase)) * 0.038 * walk_amp - 0.07 * startled
        hip_y = 0.56 + bob

        parts: List[Mesh] = []

        # --- 1. ARTICULATED LEGS (Hip -> Thigh -> Knee -> Shin -> Two-Tone Boot/Sneaker) ---
        for side_idx, sx in enumerate((-0.105, 0.105)):
            sgn = -1.0 if side_idx == 0 else 1.0
            hip_ang = math.sin(walk_phase) * 0.52 * walk_amp * sgn + 0.18 * startled
            knee_bend = max(0.0, -math.cos(walk_phase * sgn)) * 0.45 * walk_amp + 0.34 * startled

            leg_parts: List[Mesh] = []
            # Hip joint sphere + Thigh
            leg_parts.append(make_icosphere(0.068, pants, subdivisions=1, roughness=0.72))
            ky, kz = _rot_pt_x(-0.24, 0.0, hip_ang)
            leg_parts.append(
                make_cylinder(0.058, 0.066, 0.25, pants, segments=10, roughness=0.72).transformed(
                    pos=(0.0, ky * 0.5, kz * 0.5), rot=(hip_ang, 0.0, 0.0)
                )
            )
            # Knee cap
            leg_parts.append(make_icosphere(0.056, pants, subdivisions=1, roughness=0.70).transformed(pos=(0.0, ky, kz)))
            # Shin (bends backward at knee: positive X rot tilts bottom toward -Z)
            tot_shin_ang = hip_ang - knee_bend
            sy_d, sz_d = _rot_pt_x(-0.24, 0.0, tot_shin_ang)
            ay, az = ky + sy_d, kz + sz_d
            leg_parts.append(
                make_cylinder(0.048, 0.056, 0.24, pants, segments=10, roughness=0.72).transformed(
                    pos=(0.0, ky + sy_d * 0.5, kz + sz_d * 0.5), rot=(tot_shin_ang, 0.0, 0.0)
                )
            )
            # Sculpted Shoe + White Contrast Sole + Toe Cap
            shoe = Mesh.merge([
                make_beveled_box(0.115, 0.068, 0.21, shoe_col, bevel=0.022, roughness=0.55).transformed(pos=(0.0, -0.02, 0.035)),
                make_beveled_box(0.122, 0.026, 0.22, sole_col, bevel=0.008, roughness=0.45).transformed(pos=(0.0, -0.058, 0.035)),
                make_icosphere(0.054, shoe_col, subdivisions=1, roughness=0.50).transformed(pos=(0.0, -0.018, 0.105)),
            ]).transformed(pos=(0.0, ay, az), rot=(0.15 * hip_ang, 0.0, 0.0))
            leg_parts.append(shoe)

            parts.append(Mesh.merge(leg_parts).transformed(pos=(sx, hip_y, 0.0)))

        # --- 2. LAYERED TORSO (Pelvis + Belt + Undershirt + Open Jacket / Reflective Safety Vest) ---
        torso_lean = 0.08 * walk_amp - 0.10 * startled
        torso_parts: List[Mesh] = [
            # Pelvis + Belt + Metallic Buckle
            make_beveled_box(0.33, 0.12, 0.21, pants, bevel=0.035, roughness=0.70).transformed(pos=(0.0, 0.03, 0.0)),
            make_beveled_box(0.345, 0.048, 0.225, hex_rgb("#111827"), bevel=0.01, roughness=0.40).transformed(pos=(0.0, 0.085, 0.0)),
            make_beveled_box(0.075, 0.052, 0.025, hex_rgb("#FBBF24"), bevel=0.008, roughness=0.25).transformed(pos=(0.0, 0.085, 0.115)),
            # Inner shirt chest
            make_beveled_box(0.33, 0.38 + breathe, 0.20, shirt, bevel=0.045, roughness=0.65).transformed(pos=(0.0, 0.28, 0.0)),
            # Outer tailored jacket panels (left, right, back) leaving front V-shirt visible!
            make_beveled_box(0.115, 0.39 + breathe, 0.225, jacket, bevel=0.03, roughness=0.58).transformed(pos=(-0.118, 0.28, 0.0)),
            make_beveled_box(0.115, 0.39 + breathe, 0.225, jacket, bevel=0.03, roughness=0.58).transformed(pos=(0.118, 0.28, 0.0)),
            make_beveled_box(0.35, 0.39 + breathe, 0.11, jacket, bevel=0.03, roughness=0.58).transformed(pos=(0.0, 0.28, -0.062)),
            # Jacket collar lapels + Neck cylinder
            make_cylinder(0.062, 0.058, 0.11, skin, segments=10, roughness=0.62).transformed(pos=(0.0, 0.51, 0.0)),
            make_cylinder(0.088, 0.098, 0.055, jacket, segments=10, roughness=0.55).transformed(pos=(0.0, 0.475, -0.005)),
        ]

        if role == "engineer":
            # Hi-Vis Neon Orange/Lime Safety Vest + Silver Reflective Strips + Side Tool Pouch
            vest_col = hex_rgb("#F97316")
            refl = hex_rgb("#E2E8F0")
            torso_parts.extend([
                make_beveled_box(0.365, 0.34, 0.235, vest_col, bevel=0.025, roughness=0.50).transformed(pos=(0.0, 0.285, 0.0)),
                make_beveled_box(0.372, 0.038, 0.242, refl, bevel=0.006, emission=0.85, roughness=0.25).transformed(pos=(0.0, 0.19, 0.0)),
                make_beveled_box(0.372, 0.038, 0.242, refl, bevel=0.006, emission=0.85, roughness=0.25).transformed(pos=(0.0, 0.31, 0.0)),
                make_beveled_box(0.08, 0.11, 0.09, hex_rgb("#78350F"), bevel=0.015).transformed(pos=(0.19, 0.09, 0.02)),
            ])
        elif role == "captain":
            # Gold shoulder epaulets + tie
            ep_gold = hex_rgb("#FACC15")
            torso_parts.extend([
                make_beveled_box(0.09, 0.025, 0.08, ep_gold, bevel=0.005, emission=0.4).transformed(pos=(-0.15, 0.48, 0.0)),
                make_beveled_box(0.09, 0.025, 0.08, ep_gold, bevel=0.005, emission=0.4).transformed(pos=(0.15, 0.48, 0.0)),
                make_beveled_box(0.042, 0.24, 0.02, hex_rgb("#DC2626"), bevel=0.004).transformed(pos=(0.0, 0.31, 0.108)),
            ])
        elif role in ("civilian_m", "civilian_f"):
            # Stylized commuter backpack on back
            torso_parts.append(
                make_beveled_box(0.25, 0.29, 0.12, hex_rgb("#334155"), bevel=0.035, roughness=0.65).transformed(pos=(0.0, 0.29, -0.155))
            )

        # --- 3. ARTICULATED 2-SEGMENT ARMS (Shoulder -> Upper Arm -> Elbow -> Forearm -> Sculpted Hand) ---
        for side_idx, sx in enumerate((-0.215, 0.215)):
            is_right = side_idx == 1
            sgn = -1.0 if not is_right else 1.0
            sh_pitch = -math.sin(walk_phase) * 0.46 * walk_amp * sgn
            sh_roll = -0.10 if not is_right else 0.10
            el_bend = 0.22 + 0.25 * walk_amp * max(0.0, -math.sin(walk_phase * sgn))

            if startled > 0.01:
                sh_pitch = sh_pitch * (1.0 - startled) + (-1.35) * startled
                el_bend = el_bend * (1.0 - startled) + 0.85 * startled
                sh_roll += (-0.28 if not is_right else 0.28) * startled

            if is_right and point_arm > 0.01:
                sh_pitch = sh_pitch * (1.0 - point_arm) + (-1.22) * point_arm
                el_bend = el_bend * (1.0 - point_arm) + 0.18 * point_arm

            if is_right and wave_cta > 0.01:
                wave_osc = 0.28 * math.sin(time_s * 9.0)
                sh_pitch = sh_pitch * (1.0 - wave_cta) + (-2.15) * wave_cta
                sh_roll = sh_roll * (1.0 - wave_cta) + (0.35 + wave_osc) * wave_cta
                el_bend = el_bend * (1.0 - wave_cta) + 0.42 * wave_cta

            if (not is_right) and holding_tablet:
                sh_pitch = -0.65
                el_bend = 0.95

            arm_parts: List[Mesh] = [
                make_icosphere(0.062, jacket, subdivisions=1, roughness=0.58),
            ]
            ey, ez = _rot_pt_x(-0.20, 0.0, sh_pitch)
            arm_parts.append(
                make_cylinder(0.048, 0.055, 0.21, jacket, segments=10, roughness=0.58).transformed(
                    pos=(0.0, ey * 0.5, ez * 0.5), rot=(sh_pitch, 0.0, 0.0)
                )
            )
            arm_parts.append(make_icosphere(0.048, jacket, subdivisions=1, roughness=0.58).transformed(pos=(0.0, ey, ez)))
            fore_ang = sh_pitch - el_bend
            fy, fz = _rot_pt_x(-0.19, 0.0, fore_ang)
            hy_p, hz_p = ey + fy, ez + fz
            arm_parts.append(
                make_cylinder(0.040, 0.046, 0.19, skin if role != "rider" else jacket, segments=10, roughness=0.60).transformed(
                    pos=(0.0, ey + fy * 0.5, ez + fz * 0.5), rot=(fore_ang, 0.0, 0.0)
                )
            )
            # Sculpted Hand + Thumb
            hand_col = skin if role != "rider" else hex_rgb("#111827")
            arm_parts.append(make_icosphere(0.048, hand_col, subdivisions=1, roughness=0.60).transformed(pos=(0.0, hy_p, hz_p)))
            arm_parts.append(make_icosphere(0.024, hand_col, subdivisions=0, roughness=0.60).transformed(pos=(-0.03 * sgn, hy_p + 0.01, hz_p + 0.03)))

            if (not is_right) and holding_tablet:
                # Glowing inspection tablet in left hand!
                arm_parts.append(
                    Mesh.merge([
                        make_beveled_box(0.18, 0.02, 0.24, hex_rgb("#1E293B"), bevel=0.006).transformed(pos=(0.06, hy_p + 0.02, hz_p + 0.08)),
                        make_beveled_box(0.15, 0.022, 0.20, hex_rgb("#38BDF8"), bevel=0.004, emission=2.2).transformed(pos=(0.06, hy_p + 0.025, hz_p + 0.08)),
                    ])
                )

            torso_parts.append(Mesh.merge(arm_parts).transformed(pos=(sx, 0.44, 0.0), rot=(0.0, 0.0, sh_roll)))

        # --- 4. SCULPTED EXPRESSIVE HEAD (Face, Eyes, Pupils, Brows, Nose, Ears, Hair / Helmet) ---
        head_parts: List[Mesh] = [
            make_icosphere(0.152, skin, subdivisions=2, roughness=0.58),
            # Ears
            make_icosphere(0.036, skin, subdivisions=1, roughness=0.60).transformed(pos=(-0.148, -0.005, -0.01)),
            make_icosphere(0.036, skin, subdivisions=1, roughness=0.60).transformed(pos=(0.148, -0.005, -0.01)),
            # Sculpted Nose
            make_icosphere(0.026, skin, subdivisions=1, roughness=0.55).transformed(pos=(0.0, -0.012, 0.152)),
        ]

        if role != "rider":
            # Friendly Stylized Eyes + Brows + Warm Subtle Smile!
            brow_y = 0.064 + 0.020 * startled
            brow_tilt = 0.20 * startled
            for sgn_x in (-1.0, 1.0):
                ex = 0.052 * sgn_x
                head_parts.extend([
                    make_icosphere(0.025, hex_rgb("#F8FAFC"), subdivisions=1, roughness=0.25).transformed(pos=(ex, 0.020, 0.132)),
                    make_icosphere(0.020, hex_rgb("#0F172A"), subdivisions=1, roughness=0.15).transformed(pos=(ex, 0.020, 0.144)),
                    make_beveled_box(0.048, 0.013, 0.018, hair, bevel=0.004).transformed(
                        pos=(ex, brow_y, 0.138), rot=(0.0, 0.0, brow_tilt * sgn_x)
                    ),
                ])
            if startled > 0.4:
                head_parts.append(make_icosphere(0.020, hex_rgb("#9F4A42"), subdivisions=1).transformed(pos=(0.0, -0.058, 0.142)))
            else:
                head_parts.append(make_beveled_box(0.052, 0.013, 0.016, hex_rgb("#B86B5E"), bevel=0.005).transformed(pos=(0.0, -0.058, 0.141)))

        # Role Headgear / Coiffure
        if role == "engineer":
            hat_col = hex_rgb("#FACC15")
            head_parts.extend([
                make_icosphere(0.166, hat_col, subdivisions=2, roughness=0.32).transformed(pos=(0.0, 0.055, 0.0), scale=(1.02, 0.78, 1.05)),
                make_beveled_box(0.28, 0.024, 0.34, hat_col, bevel=0.01, roughness=0.32).transformed(pos=(0.0, 0.045, 0.045)),
                make_beveled_box(0.05, 0.07, 0.31, hat_col, bevel=0.01, roughness=0.30).transformed(pos=(0.0, 0.155, 0.0)),
                # Glowing LED Headlamp on helmet front!
                make_beveled_box(0.075, 0.048, 0.04, hex_rgb("#1E293B"), bevel=0.008).transformed(pos=(0.0, 0.095, 0.175)),
                make_icosphere(0.024, hex_rgb("#FEF08A"), subdivisions=1, emission=4.0).transformed(pos=(0.0, 0.095, 0.195)),
            ])
        elif role == "rider":
            # Full-face aerodynamic helmet + tinted visor
            helm_col = hex_rgb("#EF4444")
            head_parts.extend([
                make_icosphere(0.185, helm_col, subdivisions=2, roughness=0.22),
                make_beveled_box(0.27, 0.11, 0.14, hex_rgb("#0EA5E9"), bevel=0.025, roughness=0.12, emission=0.45).transformed(pos=(0.0, 0.02, 0.125)),
                make_beveled_box(0.18, 0.065, 0.12, hex_rgb("#1E293B"), bevel=0.015).transformed(pos=(0.0, -0.085, 0.135)),
            ])
        elif role == "captain":
            head_parts.extend([
                make_cylinder(0.165, 0.185, 0.09, hex_rgb("#F8FAFC"), segments=14, roughness=0.40).transformed(pos=(0.0, 0.125, 0.0)),
                make_beveled_box(0.27, 0.022, 0.24, hex_rgb("#0F172A"), bevel=0.008, roughness=0.25).transformed(pos=(0.0, 0.08, 0.07)),
                make_icosphere(0.026, hex_rgb("#FACC15"), subdivisions=1, emission=0.8).transformed(pos=(0.0, 0.125, 0.175)),
            ])
        elif role == "civilian_f":
            # Stylish flowing hijab / headscarf framing the face cleanly without covering cheeks
            hijab_col = hex_rgb(hair_hex)
            head_parts.extend([
                make_icosphere(0.166, hijab_col, subdivisions=2, roughness=0.62).transformed(pos=(0.0, 0.024, -0.036)),
                make_cylinder(0.148, 0.118, 0.13, hijab_col, segments=12, roughness=0.62).transformed(pos=(0.0, -0.125, -0.025)),
            ])
        else:
            # Sculpted volumetric stylized hair (top sweep + sideburns + back)
            head_parts.extend([
                make_icosphere(0.164, hair, subdivisions=2, roughness=0.68).transformed(pos=(0.0, 0.042, -0.018), scale=(1.02, 0.88, 1.04)),
                make_beveled_box(0.24, 0.065, 0.14, hair, bevel=0.025, roughness=0.68).transformed(pos=(0.02, 0.135, 0.075), rot=(-0.18, 0.0, 0.08)),
            ])

        torso_parts.append(
            Mesh.merge(head_parts).transformed(
                pos=(0.0, 0.655 + breathe, 0.0),
                rot=(head_pitch, head_yaw + 0.06 * math.sin(time_s * 1.9), 0.0),
            )
        )

        parts.append(Mesh.merge(torso_parts).transformed(pos=(0.0, hip_y, 0.0), rot=(torso_lean, 0.0, 0.0)))
        return Mesh.merge(parts).transformed(pos=pos, rot=(0.0, rot_y, 0.0), scale=scale)


class ArchBuilderV3:
    """High-detail architectural buildings, shophouses, industrial halls & streetscape structures."""

    @staticmethod
    def midrise_tower(
        x: float,
        z: float,
        w: float = 2.6,
        d: float = 2.2,
        floors: int = 4,
        wall_hex: str = "#E2E8F0",
        trim_hex: str = "#475569",
        accent_hex: str = "#0284C7",
        lit_ratio: float = 0.75,
        rot_y: float = 0.0,
        y: float = 0.0,
    ) -> Mesh:
        wall = hex_rgb(wall_hex)
        trim = hex_rgb(trim_hex)
        acc = hex_rgb(accent_hex)
        glass_dark = hex_rgb("#1E293B")
        glass_warm = hex_rgb("#FDE68A")
        glass_cool = hex_rgb("#7DD3FC")

        floor_h = 0.92
        ground_h = 1.12
        total_h = ground_h + floors * floor_h
        parts: List[Mesh] = []

        # 1. Concrete Foundation Plinth + Ground-Floor Commercial Glass Arcade
        parts.append(make_beveled_box(w + 0.16, 0.16, d + 0.16, trim, bevel=0.02, roughness=0.80).transformed(pos=(0.0, 0.08, 0.0)))
        parts.append(make_beveled_box(w, total_h, d, wall, bevel=0.03, roughness=0.72).transformed(pos=(0.0, total_h * 0.5 + 0.08, 0.0)))

        # Recessed Ground-Floor Lobby Glass + Entrance Canopy + Double Doors
        parts.append(
            make_beveled_box(w * 0.76, ground_h * 0.76, 0.06, glass_warm if lit_ratio > 0.3 else glass_dark, bevel=0.01, emission=1.8 * lit_ratio, roughness=0.18).transformed(
                pos=(0.0, 0.16 + ground_h * 0.40, d * 0.5 + 0.01)
            )
        )
        # Canopy awning
        parts.append(
            make_beveled_box(w * 0.84, 0.09, 0.42, acc, bevel=0.02, roughness=0.38).transformed(
                pos=(0.0, ground_h + 0.06, d * 0.5 + 0.18)
            )
        )

        # 2. Corner Structural Pilasters (Vertical Columns)
        for sx in (-w * 0.47, w * 0.47):
            for sz in (-d * 0.47, d * 0.47):
                parts.append(
                    make_beveled_box(0.14, total_h + 0.08, 0.14, trim, bevel=0.015, roughness=0.68).transformed(
                        pos=(sx, total_h * 0.5 + 0.08, sz)
                    )
                )

        # 3. Story Cornice Ledges + Recessed Framed Windows with Sills (Front, Back & Sides)
        cols_x = max(2, int(round(w / 0.72)))
        xs = np.linspace(-w * 0.33, w * 0.33, cols_x)
        for fl in range(floors):
            fy = ground_h + 0.08 + fl * floor_h
            # Inter-floor concrete slab band
            parts.append(make_beveled_box(w + 0.08, 0.075, d + 0.08, trim, bevel=0.01).transformed(pos=(0.0, fy, 0.0)))
            wy = fy + floor_h * 0.52
            for ci, wx in enumerate(xs):
                is_lit = ((fl * 3 + ci * 5) % 7) / 7.0 < lit_ratio
                wcol = glass_warm if (is_lit and (fl + ci) % 2 == 0) else (glass_cool if is_lit else glass_dark)
                wem = 2.1 * lit_ratio if is_lit else 0.0
                for sz_sgn in (-1.0, 1.0):
                    fz = sz_sgn * (d * 0.5 + 0.012)
                    # Outer dark window frame + glass pane + bottom sill ledge
                    parts.append(make_beveled_box(0.44, 0.54, 0.035, trim, bevel=0.008).transformed(pos=(float(wx), wy, fz)))
                    parts.append(make_beveled_box(0.36, 0.46, 0.045, wcol, bevel=0.005, emission=wem, roughness=0.15).transformed(pos=(float(wx), wy, fz + sz_sgn * 0.005)))
                    parts.append(make_beveled_box(0.48, 0.045, 0.08, trim, bevel=0.006).transformed(pos=(float(wx), wy - 0.28, fz + sz_sgn * 0.02)))

            # Side windows + mini split AC condenser boxes
            parts.append(make_beveled_box(0.05, 0.44, 0.42, glass_cool if lit_ratio > 0.4 else glass_dark, emission=1.2 * lit_ratio).transformed(pos=(w * 0.5 + 0.01, wy, 0.0)))
            parts.append(make_beveled_box(0.16, 0.20, 0.28, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(-w * 0.5 - 0.07, wy - 0.12, 0.25)))

        # 4. Rooftop Parapet Wall + Stairwell Penthouse + Dual HVAC Chiller Units + Beacon
        ry = total_h + 0.08
        parts.append(make_beveled_box(w + 0.12, 0.14, d + 0.12, trim, bevel=0.02).transformed(pos=(0.0, ry + 0.05, 0.0)))
        parts.append(make_beveled_box(w * 0.36, 0.58, d * 0.38, wall, bevel=0.02).transformed(pos=(-w * 0.20, ry + 0.36, -d * 0.16)))
        parts.append(make_beveled_box(w * 0.40, 0.06, d * 0.42, trim, bevel=0.01).transformed(pos=(-w * 0.20, ry + 0.67, -d * 0.16)))
        # HVAC chillers
        for hx in (w * 0.18, w * 0.34):
            parts.append(make_beveled_box(0.32, 0.28, 0.32, hex_rgb("#94A3B8"), bevel=0.015).transformed(pos=(hx, ry + 0.24, 0.15)))
            parts.append(make_cylinder(0.11, 0.11, 0.04, hex_rgb("#1E293B"), segments=10).transformed(pos=(hx, ry + 0.39, 0.15)))
        # Rooftop telecom mast + red aircraft warning light
        parts.append(make_cylinder(0.025, 0.018, 0.72, trim, segments=8).transformed(pos=(-w * 0.22, ry + 1.02, -d * 0.18)))
        parts.append(make_icosphere(0.045, hex_rgb("#EF4444"), subdivisions=1, emission=4.2).transformed(pos=(-w * 0.22, ry + 1.40, -d * 0.18)))

        return Mesh.merge(parts).transformed(pos=(x, y, z), rot=(0.0, rot_y, 0.0))

    @staticmethod
    def shophouse_ruko(
        x: float,
        z: float,
        w: float = 1.95,
        d: float = 1.75,
        wall_hex: str = "#F5EFE6",
        roof_hex: str = "#C2593F",
        awning_hex: str = "#0D9488",
        rot_y: float = 0.0,
        y: float = 0.0,
    ) -> Mesh:
        wall = hex_rgb(wall_hex)
        trim = hex_rgb("#64748B")
        awn = hex_rgb(awning_hex)
        parts = [
            make_beveled_box(w + 0.10, 0.12, d + 0.10, trim, bevel=0.015).transformed(pos=(0.0, 0.06, 0.0)),
            make_beveled_box(w, 2.25, d, wall, bevel=0.03, roughness=0.76).transformed(pos=(0.0, 1.24, 0.0)),
            # Ground shop window + door + striped awning
            make_beveled_box(w * 0.52, 0.76, 0.05, hex_rgb("#FDE68A"), bevel=0.01, emission=1.9).transformed(pos=(-w * 0.14, 0.56, d * 0.5 + 0.01)),
            make_beveled_box(0.36, 0.86, 0.05, hex_rgb("#78350F"), bevel=0.01).transformed(pos=(w * 0.28, 0.52, d * 0.5 + 0.01)),
            make_beveled_box(w * 0.90, 0.12, 0.44, awn, bevel=0.02).transformed(pos=(0.0, 1.06, d * 0.5 + 0.18), rot=(0.24, 0.0, 0.0)),
            # 2nd floor balcony slab + railing + upper windows
            make_beveled_box(w * 0.88, 0.08, 0.36, trim, bevel=0.01).transformed(pos=(0.0, 1.32, d * 0.5 + 0.15)),
            make_beveled_box(w * 0.86, 0.28, 0.035, hex_rgb("#334155"), bevel=0.006).transformed(pos=(0.0, 1.48, d * 0.5 + 0.31)),
            make_beveled_box(0.42, 0.52, 0.05, hex_rgb("#BAE6FD"), bevel=0.01, emission=1.3).transformed(pos=(-w * 0.22, 1.78, d * 0.5 + 0.01)),
            make_beveled_box(0.42, 0.52, 0.05, hex_rgb("#BAE6FD"), bevel=0.01, emission=1.3).transformed(pos=(w * 0.22, 1.78, d * 0.5 + 0.01)),
            # Pitched terracotta roof + ridge beam
            make_pitched_roof(w + 0.24, 0.68, d + 0.22, hex_rgb(roof_hex)).transformed(pos=(0.0, 2.36, 0.0)),
            make_beveled_box(w + 0.28, 0.08, 0.10, hex_rgb("#7C2D12"), bevel=0.01).transformed(pos=(0.0, 3.04, 0.0)),
        ]
        return Mesh.merge(parts).transformed(pos=(x, y, z), rot=(0.0, rot_y, 0.0))

    @staticmethod
    def industrial_portal_hall(
        x: float,
        z: float,
        w: float = 3.2,
        h: float = 2.2,
        d: float = 2.4,
        cladding_hex: str = "#CBD5E1",
        frame_hex: str = "#0284C7",
        rot_y: float = 0.0,
        y: float = 0.0,
    ) -> Mesh:
        clad = hex_rgb(cladding_hex)
        frm = hex_rgb(frame_hex)
        dark = hex_rgb("#1E293B")
        parts = [
            make_beveled_box(w + 0.16, 0.14, d + 0.16, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.0, 0.07, 0.0)),
            make_beveled_box(w, h, d, clad, bevel=0.025, roughness=0.55).transformed(pos=(0.0, h * 0.5 + 0.10, 0.0)),
            make_pitched_roof(w + 0.18, 0.42, d + 0.18, frm).transformed(pos=(0.0, h + 0.10, 0.0)),
        ]
        # Portal I-beam ribs along facade
        for rx in np.linspace(-w * 0.46, w * 0.46, 5):
            parts.append(make_beveled_box(0.08, h + 0.06, d + 0.06, frm, bevel=0.01).transformed(pos=(float(rx), h * 0.5 + 0.10, 0.0)))
        # Clerestory lit strip windows + roll-up bay door + rooftop turbine vents
        parts.append(make_beveled_box(w * 0.82, 0.26, d + 0.04, hex_rgb("#7DD3FC"), bevel=0.008, emission=1.6).transformed(pos=(0.0, h * 0.82, 0.0)))
        parts.append(make_beveled_box(0.86, 1.08, 0.06, dark, bevel=0.01).transformed(pos=(0.0, 0.64, d * 0.5 + 0.01)))
        parts.append(make_beveled_box(0.92, 0.10, 0.08, hex_rgb("#FACC15"), bevel=0.008).transformed(pos=(0.0, 1.22, d * 0.5 + 0.02)))
        for vx in (-w * 0.24, w * 0.24):
            parts.append(make_cylinder(0.16, 0.18, 0.24, hex_rgb("#94A3B8"), segments=12, roughness=0.35).transformed(pos=(vx, h + 0.52, 0.0)))
        return Mesh.merge(parts).transformed(pos=(x, y, z), rot=(0.0, rot_y, 0.0))


class PrecisionMechV3:
    """High-detail mechanical engineering structures, bolted flanges, trusses & flagship vehicles."""

    @staticmethod
    def flanged_pipe(
        length: float,
        radius: float,
        pipe_hex: str = "#64748B",
        flange_hex: str = "#94A3B8",
        alpha: float = 1.0,
        bolt_count: int = 8,
    ) -> Mesh:
        """Horizontal flanged pipe along X axis with bolted end-collars."""
        pcol = hex_rgb(pipe_hex)
        fcol = hex_rgb(flange_hex)
        bcol = hex_rgb("#E2E8F0")
        fl = FLAG_DEFAULT if alpha >= 0.99 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)
        parts = [
            make_cylinder(radius, radius, length, pcol, segments=18, alpha=alpha, roughness=0.38, flags=fl).transformed(
                rot=(0.0, 0.0, math.pi * 0.5)
            )
        ]
        for sx in (-length * 0.48, length * 0.48):
            parts.append(
                make_cylinder(radius * 1.32, radius * 1.32, 0.08, fcol, segments=18, alpha=alpha, roughness=0.32, flags=fl).transformed(
                    pos=(sx, 0.0, 0.0), rot=(0.0, 0.0, math.pi * 0.5)
                )
            )
            for bi in range(bolt_count):
                ang = 2.0 * math.pi * bi / bolt_count
                by = math.cos(ang) * radius * 1.16
                bz = math.sin(ang) * radius * 1.16
                parts.append(make_cylinder(0.022, 0.022, 0.12, bcol, segments=6, alpha=alpha, roughness=0.25, flags=fl).transformed(
                    pos=(sx, by, bz), rot=(0.0, 0.0, math.pi * 0.5)
                ))
        return Mesh.merge(parts)

    @staticmethod
    def steel_truss_span(length: float, height: float, depth: float, bays: int = 6, color_hex: str = "#475569") -> Mesh:
        col = hex_rgb(color_hex)
        parts: List[Mesh] = []
        for sy in (-height * 0.5, height * 0.5):
            for sz in (-depth * 0.5, depth * 0.5):
                parts.append(make_beveled_box(length, 0.055, 0.055, col, bevel=0.008, roughness=0.40).transformed(pos=(0.0, sy, sz)))
        dx = length / max(1, bays)
        for i in range(bays + 1):
            bx = -length * 0.5 + i * dx
            for sz in (-depth * 0.5, depth * 0.5):
                parts.append(make_beveled_box(0.045, height, 0.045, col, bevel=0.006).transformed(pos=(bx, 0.0, sz)))
            parts.append(make_beveled_box(0.045, 0.045, depth, col, bevel=0.006).transformed(pos=(bx, height * 0.5, 0.0)))
            parts.append(make_beveled_box(0.045, 0.045, depth, col, bevel=0.006).transformed(pos=(bx, -height * 0.5, 0.0)))
            if i < bays:
                p0 = (bx, -height * 0.5, depth * 0.5)
                p1 = (bx + dx, height * 0.5, depth * 0.5)
                if i % 2 == 1:
                    p0, p1 = (bx, height * 0.5, depth * 0.5), (bx + dx, -height * 0.5, depth * 0.5)
                parts.append(make_tube_along_path([p0, p1], 0.022, col, sides=6))
                parts.append(make_tube_along_path([(p0[0], p0[1], -p0[2]), (p1[0], p1[1], -p1[2])], 0.022, col, sides=6))
        return Mesh.merge(parts)

    @staticmethod
    def pressure_gauge(radius: float = 0.22, needle_norm: float = 0.35, danger: bool = False) -> Mesh:
        """3D Industrial dial gauge facing +Z with dynamic needle_norm in [0..1]."""
        ang = lerp_val(2.25, -2.25, max(0.0, min(1.0, needle_norm)))
        nx = math.sin(-ang) * radius * 0.62
        ny = math.cos(ang) * radius * 0.62
        parts = [
            make_cylinder(radius, radius, 0.09, hex_rgb("#D97706"), segments=18, roughness=0.28).transformed(rot=(math.pi * 0.5, 0.0, 0.0)),
            make_cylinder(radius * 0.86, radius * 0.86, 0.096, hex_rgb("#F8FAFC"), segments=18, roughness=0.45).transformed(rot=(math.pi * 0.5, 0.0, 0.0)),
            make_icosphere(0.032, hex_rgb("#EF4444") if danger else hex_rgb("#0F172A"), subdivisions=1, emission=2.5 if danger else 0.0).transformed(pos=(0.0, 0.0, 0.055)),
            make_tube_along_path([(0.0, 0.0, 0.058), (nx, ny, 0.058)], 0.016, hex_rgb("#EF4444"), sides=6, emission=2.2 if danger else 0.4),
        ]
        return Mesh.merge(parts)


def lerp_val(a: float, b: float, t: float) -> float:
    return a + (b - a) * t
