"""
Knot Theory V5 Phrase-Locked Shorts Director (`src/knot_v5_director.py`)
Pairs our native C++/OpenMP 3D engine (`ai-kids-studio-3d-cpp` / `SceneRenderer`)
with `cartoon-3d-short` + `captions` skill discipline:
  - 100% locked to exact spoken beat timestamps in `output/v5_timings/<EP>_timings.json`
  - Continuous 30 fps camera recipes (`camera_recipes.json`) with zero frozen spans
  - Literal multi-part 3D hero props, interiors, vehicles, cutaways & human witnesses for every beat
  - Strictly safe-zone-compliant HUD badges, 3D-projected pointer callouts, `Oh, jadi...` synthesis card,
    interactive A/B comment prompt, and animated White Subscribe Button (`TEKAN TOMBOL PUTIH DI BAWAH!`)
"""

from __future__ import annotations
import json
import math
import os
import pathlib
import subprocess
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.knot_v4_models import V4HeroModels
from src.knot_v5_props import V5HeroProps
from src.knot_v5_scripts import V5_SHORTS_SPECS
from src.renderer3d import (
    Mesh,
    SceneRenderer,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _hex_rgba(h: str, a: int = 255) -> Tuple[int, int, int, int]:
    s = h.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def _ease_io(u: float) -> float:
    u = max(0.0, min(1.0, u))
    return u * u * (3.0 - 2.0 * u)


def _lerp3(a: Tuple[float, float, float], b: Tuple[float, float, float], u: float) -> Tuple[float, float, float]:
    return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)


def _apply_cam_recipe(
    base_pos: Tuple[float, float, float],
    base_tgt: Tuple[float, float, float],
    recipe: str,
    u: float,
    fov_base: float = 46.0,
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], float]:
    """Continuous 30 fps camera motion inspired by `cartoon-3d-short/presets/camera_recipes.json`."""
    e = _ease_io(u)
    dx = base_pos[0] - base_tgt[0]
    dy = base_pos[1] - base_tgt[1]
    dz = base_pos[2] - base_tgt[2]

    if recipe == "push_in":
        scale = 1.08 - 0.18 * e
        sway = 0.14 * math.sin(u * math.pi)
        cp = (base_tgt[0] + dx * scale + sway, base_tgt[1] + dy * (1.03 - 0.08 * e), base_tgt[2] + dz * scale)
        return cp, base_tgt, fov_base - 2.0 * e
    if recipe == "orbit_inspect":
        ang = -0.26 + 0.52 * u
        ca, sa = math.cos(ang), math.sin(ang)
        rx = dx * ca + dz * sa
        rz = -dx * sa + dz * ca
        cp = (base_tgt[0] + rx, base_tgt[1] + dy + 0.08 * math.sin(u * math.pi), base_tgt[2] + rz)
        return cp, base_tgt, fov_base
    if recipe == "dolly_pan":
        pan = -0.38 + 0.76 * u
        cp = (base_pos[0] + pan, base_pos[1] + 0.06 * math.sin(u * math.pi * 2), base_pos[2] * (1.03 - 0.06 * e))
        ct = (base_tgt[0] + pan * 0.45, base_tgt[1], base_tgt[2])
        return cp, ct, fov_base
    if recipe == "macro_cutaway":
        scale = 1.06 - 0.14 * e
        ang = -0.14 + 0.28 * u
        ca, sa = math.cos(ang), math.sin(ang)
        cp = (base_tgt[0] + (dx * ca + dz * sa) * scale, base_tgt[1] + dy * scale, base_tgt[2] + (-dx * sa + dz * ca) * scale)
        return cp, base_tgt, fov_base - 3.0
    if recipe == "low_angle_hero":
        ang = -0.18 + 0.36 * u
        ca, sa = math.cos(ang), math.sin(ang)
        cp = (base_tgt[0] + dx * ca + dz * sa, base_tgt[1] + dy * (0.94 + 0.10 * e), base_tgt[2] + (-dx * sa + dz * ca) * (1.04 - 0.10 * e))
        return cp, base_tgt, fov_base + 1.5
    if recipe == "overhead_reveal":
        cp = (base_pos[0] + 0.28 * math.sin(u * math.pi), base_pos[1] * (1.06 - 0.12 * e), base_pos[2] * (1.04 - 0.08 * e))
        return cp, base_tgt, fov_base
    if recipe == "split_compare":
        pan = -0.26 + 0.52 * u
        cp = (base_pos[0] + pan * 0.7, base_pos[1] + 0.05 * math.sin(u * 6.28), base_pos[2] * (1.02 - 0.05 * e))
        return cp, (base_tgt[0] + pan * 0.25, base_tgt[1], base_tgt[2]), fov_base + 1.0
    # cta_lock / establishing_wide
    ang = -0.12 + 0.24 * u
    ca, sa = math.cos(ang), math.sin(ang)
    cp = (base_tgt[0] + (dx * ca + dz * sa) * (1.03 - 0.06 * e), base_tgt[1] + dy, base_tgt[2] + (-dx * sa + dz * ca) * (1.03 - 0.06 * e))
    return cp, base_tgt, fov_base


def build_beat_scene(
    ep_id: str,
    beat_id: str,
    u: float,
    t: float,
) -> Tuple[Mesh, Tuple[float, float, float], Tuple[float, float, float], Tuple[float, float, float], str, Tuple[Tuple[float, float, float], Tuple[float, float, float]]]:
    """
    Returns:
      (mesh, base_cam_pos, base_cam_target, anchor_3d_pt, pointer_label, (bg_top_rgb, bg_bot_rgb))
    """
    day_sky = ((0.16, 0.36, 0.68), (0.52, 0.74, 0.92))
    dusk_sky = ((0.09, 0.16, 0.36), (0.28, 0.44, 0.68))
    studio_sky = ((0.10, 0.18, 0.34), (0.24, 0.38, 0.58))
    alert_sky = ((0.22, 0.11, 0.18), (0.42, 0.24, 0.34))

    # -------------------------------------------------------------------------
    # 1. KT-S08 — HELMET OUTER SHELL VS PERMANENTLY CRUSHED EPS LINER VS SPONGE
    # -------------------------------------------------------------------------
    if ep_id == "KT-S08":
        road = make_flat_quad_xz(-5.5, -4.0, 5.5, 4.0, 0.0, hex_rgb("#1E293B"), subdiv=2)
        stripe = make_beveled_box(2.4, 0.02, 0.16, hex_rgb("#FACC15"), bevel=0.004, emission=1.2).transformed(pos=(0.0, 0.01, 1.05))
        if beat_id == "hook":
            m = Mesh.merge([
                road, stripe,
                V5HeroProps.sport_motorcycle(pos=(-1.05, 0.26, -0.45), rot=(1.15, 0.35, 0.25), scale=1.05),
                V5HeroProps.full_face_helmet(pos=(0.68, 0.54, 0.38), rot=(0.12, -0.55, 0.08), scale=1.18, cutaway=False),
                HumanRigV3.build(pos=(-0.25, 0.0, -1.15), rot_y=0.35, scale=0.95, role="civilian_m", jacket_hex="#DC2626", startled=0.6, time_s=t),
            ])
            return m, (0.35, 1.28, 3.35), (0.15, 0.55, 0.0), (0.68, 0.72, 0.38), "CANGKANG LUAR MULUS", dusk_sky
        if beat_id == "illusion":
            m = Mesh.merge([
                road,
                V5HeroProps.full_face_helmet(pos=(0.25, 0.98, 0.0), rot=(0.08, t * 0.9, 0.0), scale=1.42, cutaway=False),
                HumanRigV3.build(pos=(-1.05, 0.0, 0.15), rot_y=1.15, scale=0.98, role="civilian_m", jacket_hex="#0284C7", point_arm=1.0, time_s=t),
            ])
            return m, (0.0, 1.45, 3.45), (0.05, 0.95, 0.0), (0.25, 1.25, 0.0), "POLIKARBONAT UTUH", day_sky
        if beat_id == "cutaway":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.full_face_helmet(pos=(0.0, 0.95, 0.0), rot=(0.05, -0.25, 0.0), scale=1.65, cutaway=True, eps_crush=0.15, head_inside=True),
            ])
            return m, (2.25, 1.22, 2.25), (0.0, 0.95, 0.05), (0.05, 1.38, 0.32), "BUSA PADAT EPS", studio_sky
        if beat_id == "crush_vs_sponge":
            crush = min(1.0, u * 1.45)
            sp_squish = 0.42 * max(0.0, math.sin(u * math.pi * 2.0))
            sponge_h = 0.56 * (1.0 - sp_squish)
            m = Mesh.merge([
                make_flat_quad_xz(-5.0, -3.5, 5.0, 3.5, 0.0, hex_rgb("#1E293B"), subdiv=2),
                # Left (-1.05): Helmet EPS Cutaway crushing permanently flat!
                V5HeroProps.full_face_helmet(pos=(-0.95, 0.86, 0.0), rot=(0.0, -0.18, 0.0), scale=1.28, cutaway=True, eps_crush=crush, head_inside=True),
                # Right (+1.05): Bright Yellow Porous Sponge compressing & bouncing right back!
                make_beveled_box(0.95, 0.14, 0.95, hex_rgb("#475569"), bevel=0.02).transformed(pos=(1.05, 0.07, 0.0)),
                make_beveled_box(0.82, sponge_h, 0.82, hex_rgb("#FACC15"), bevel=0.08, emission=0.6, roughness=0.82).transformed(pos=(1.05, 0.14 + 0.5 * sponge_h, 0.0)),
                make_cylinder(0.28, 0.28, 0.32, hex_rgb("#94A3B8"), segments=16).transformed(pos=(1.05, 0.32 + sponge_h, 0.0)),
            ])
            return m, (0.15, 1.55, 3.95), (0.05, 0.78, 0.0), (-0.92, 1.22, 0.15), "PENYOK PERMANEN!", alert_sky
        if beat_id == "parking_drop":
            drop_y = max(0.46, 1.38 - 1.55 * (u ** 1.7))
            m = Mesh.merge([
                road, stripe,
                V5HeroProps.sedan_car(pos=(-1.45, 0.0, -0.85), rot_y=0.25, scale=0.92, body_hex="#64748B"),
                V5HeroProps.sport_motorcycle(pos=(0.85, 0.0, -0.25), rot=(0.0, -2.55, 0.0), scale=1.05),
                V5HeroProps.full_face_helmet(pos=(0.15, drop_y, 0.45), rot=(u * 1.4, -0.4, 0.2), scale=0.86, cutaway=False, head_inside=False),
            ])
            return m, (0.0, 1.65, 4.15), (0.1, 0.65, -0.15), (0.15, drop_y + 0.25, 0.45), "JATUH TANPA KEPALA", day_sky
        if beat_id == "closer":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.full_face_helmet(pos=(0.0, 0.95, 0.0), rot=(0.05, -0.22, 0.0), scale=1.58, cutaway=True, eps_crush=0.88, head_inside=True),
            ])
            return m, (2.15, 1.28, 2.35), (0.0, 0.95, 0.0), (0.05, 1.32, 0.22), "SERAP ENERGI 1 KALI", studio_sky
        # cta
        m = Mesh.merge([
            road,
            V5HeroProps.sport_motorcycle(pos=(-1.25, 0.0, -0.55), rot=(0.0, 0.45, 0.0), scale=0.95),
            V5HeroProps.full_face_helmet(pos=(1.05, 1.05, 0.15), rot=(0.05, -0.35, 0.0), scale=1.12, cutaway=True, eps_crush=0.85, head_inside=False),
            HumanRigV3.build(pos=(-0.08, 0.0, 0.25), rot_y=0.08, scale=1.02, role="civilian_m", jacket_hex="#0EA5E9", wave_cta=1.0, time_s=t),
        ])
        return m, (0.0, 1.55, 3.95), (0.0, 0.85, 0.0), (1.05, 1.35, 0.15), "CEK BUSA DALAMNYA!", dusk_sky

    # -------------------------------------------------------------------------
    # 2. KT-S10 — MCB BIMETAL THERMAL DELAY VS MAGNETIC SOLENOID + APPLIANCES
    # -------------------------------------------------------------------------
    if ep_id == "KT-S10":
        if beat_id == "hook":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.mcb_cutaway(pos=(0.0, 0.15, 0.0), scale=1.05, bimetal_bend=0.35 * u, solenoid_snap=0.0, tripped=0.0),
            ])
            return m, (0.25, 1.55, 3.65), (0.0, 1.25, 0.0), (-0.72, 1.55, 0.10), "TUAS MCB ON", studio_sky
        if beat_id == "appliances":
            surge = 0.5 + 0.5 * math.sin(t * 7.5)
            m = V5HeroProps.kitchen_appliances_scene(surge_glow=surge, time_s=t)
            return m, (0.0, 1.85, 4.35), (0.0, 1.15, -0.55), (-1.15, 1.55, -0.65), "KULKAS & POMPA NYALA", day_sky
        if beat_id == "dual_guard":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.mcb_cutaway(pos=(0.0, 0.12, 0.0), scale=1.12, bimetal_bend=0.35, solenoid_snap=0.25, tripped=0.0),
            ])
            return m, (0.35, 1.48, 3.35), (0.08, 1.25, 0.0), (0.42, 1.68, 0.08), "BIMETAL + KOIL MAGNET", studio_sky
        if beat_id == "bimetal_vs_solenoid":
            if u < 0.52:
                uu = u / 0.52
                m = Mesh.merge([
                    make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#1E293B"), subdiv=2),
                    V5HeroProps.mcb_cutaway(pos=(0.0, 0.12, 0.0), scale=1.15, bimetal_bend=uu, solenoid_snap=0.0, tripped=max(0.0, (uu - 0.78) * 4.5)),
                ])
                return m, (0.45, 1.62, 3.15), (0.15, 1.45, 0.0), (0.48, 1.78, 0.08), "1. BIMETAL MELENGKUNG PELAN", studio_sky
            uu = (u - 0.52) / 0.48
            snap = min(1.0, uu * 3.5)
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#1E1B4B"), subdiv=2),
                V5HeroProps.mcb_cutaway(pos=(0.0, 0.12, 0.0), scale=1.15, bimetal_bend=0.15, solenoid_snap=snap, tripped=snap, arc_flash=max(0.0, 1.0 - uu * 2.2)),
            ])
            return m, (-0.25, 1.32, 3.15), (-0.05, 1.05, 0.0), (0.08, 0.95, 0.08), "2. KOIL MAGNET SAMBAR KILAT!", alert_sky
        if beat_id == "boundary":
            m = Mesh.merge([
                V5HeroProps.kitchen_appliances_scene(surge_glow=0.15, time_s=t),
                HumanRigV3.build(pos=(0.55, 0.0, 0.35), rot_y=-2.65, scale=0.98, role="engineer", jacket_hex="#EA580C", holding_tablet=True, point_arm=0.9, time_s=t),
            ])
            return m, (0.25, 1.85, 4.15), (0.05, 1.35, -0.55), (0.0, 2.12, -1.12), "PANEL STANDAR SNI", day_sky
        if beat_id == "closer":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.mcb_cutaway(pos=(0.0, 0.12, 0.0), scale=1.12, bimetal_bend=0.65, solenoid_snap=0.85, tripped=0.85),
            ])
            return m, (0.25, 1.52, 3.45), (0.0, 1.25, 0.0), (0.12, 1.15, 0.08), "TUNDA WAJAR • PUTUS KILAT", studio_sky
        m = Mesh.merge([
            make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
            V5HeroProps.mcb_cutaway(pos=(0.88, 0.25, -0.15), scale=0.88, bimetal_bend=0.5, solenoid_snap=0.5, tripped=0.4),
            HumanRigV3.build(pos=(-0.72, 0.0, 0.25), rot_y=0.22, scale=1.04, role="engineer", jacket_hex="#F59E0B", wave_cta=1.0, time_s=t),
        ])
        return m, (0.0, 1.55, 3.95), (0.0, 0.95, 0.0), (0.88, 1.45, -0.10), "ALAT APA BIKIN JEGLEK?", dusk_sky

    # -------------------------------------------------------------------------
    # 3. KT-S13 — DAM SPILLWAY + SCOUR + KITCHEN SINK PLATE + STILLING BASIN
    # -------------------------------------------------------------------------
    if ep_id == "KT-S13":
        if beat_id == "hook":
            m = V5HeroProps.dam_spillway_scene(scour_mode=False, time_s=t)
            return m, (2.35, 2.75, 5.15), (0.15, 1.15, 0.0), (0.78, 0.68, 0.0), "AIR DIPAKSA BERGOLAK!", day_sky
        if beat_id == "scour_hazard":
            m = V5HeroProps.dam_spillway_scene(scour_mode=True, time_s=t)
            return m, (1.55, 1.75, 4.35), (0.35, 0.35, 0.0), (0.25, -0.12, 0.45), "TANAH FONDASI TERGERUS!", alert_sky
        if beat_id == "sink_plate":
            m = V5HeroProps.kitchen_sink_jump_scene(time_s=t)
            return m, (0.0, 2.65, 2.85), (0.0, 0.28, -0.12), (0.48, 0.22, 0.0), "CINCIN LOMPATAN AIR", studio_sky
        if beat_id == "stilling_basin":
            m = V5HeroProps.dam_spillway_scene(scour_mode=False, time_s=t)
            return m, (2.15, 1.68, 3.85), (0.65, 0.55, 0.0), (0.65, 0.42, 0.35), "BALOK PEMECAH ENERGI", day_sky
        if beat_id == "boundary":
            m = Mesh.merge([
                V5HeroProps.dam_spillway_scene(scour_mode=False, time_s=t),
                HumanRigV3.build(pos=(2.25, 0.45, 1.55), rot_y=-2.25, scale=0.88, role="engineer", jacket_hex="#0284C7", point_arm=0.9, time_s=t),
            ])
            return m, (2.85, 3.15, 5.45), (-0.15, 1.25, 0.0), (-1.35, 1.55, 0.0), "DESAIN PELIMPAH BENDUNGAN", day_sky
        if beat_id == "closer":
            m = V5HeroProps.dam_spillway_scene(scour_mode=False, time_s=t)
            return m, (1.95, 2.15, 4.45), (0.55, 0.72, 0.0), (0.85, 0.65, 0.0), "REM AIR ALAMI SUNGAI", studio_sky
        m = Mesh.merge([
            V5HeroProps.kitchen_sink_jump_scene(time_s=t).transformed(pos=(0.85, 0.55, -0.25), scale=0.62),
            HumanRigV3.build(pos=(-0.78, 0.0, 0.25), rot_y=0.25, scale=1.02, role="civilian_m", jacket_hex="#0EA5E9", wave_cta=1.0, time_s=t),
            make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
        ])
        return m, (0.0, 1.58, 3.95), (0.0, 0.85, 0.0), (0.85, 0.85, -0.25), "CEK KERAN WASTAFELMU!", dusk_sky

    # -------------------------------------------------------------------------
    # 4. KT-S14 — COMMERCIAL AIRLINER RTO + COCKPIT + THERMAL FUSIBLE PLUG
    # -------------------------------------------------------------------------
    if ep_id == "KT-S14":
        runway = Mesh.merge([
            make_flat_quad_xz(-8.0, -5.0, 8.0, 5.0, 0.0, hex_rgb("#1E293B"), subdiv=2),
            make_beveled_box(2.2, 0.02, 0.22, hex_rgb("#F8FAFC"), bevel=0.004, emission=1.2).transformed(pos=(-2.2, 0.01, 0.0)),
            make_beveled_box(2.2, 0.02, 0.22, hex_rgb("#F8FAFC"), bevel=0.004, emission=1.2).transformed(pos=(2.2, 0.01, 0.0)),
        ])
        if beat_id == "hook":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.aircraft_wheel_fusible_cutaway(pos=(0.0, 0.05, 0.0), brake_heat=0.75, plug_melted=0.2, tire_deflate=0.0, scale=1.18),
            ])
            return m, (0.55, 1.25, 3.15), (0.08, 1.02, 0.0), (0.55, 1.08, 0.22), "SUMBAT LOGAM VELG", studio_sky
        if beat_id == "rto_braking":
            if u < 0.36:
                # Inside the authentic flight-deck cockpit as pilots command Rejected Takeoff!
                m = V4HeroModels.airliner_cockpit_interior(time_s=t, autoland_on=0.0)
                return m, (0.0, 1.28, 1.48), (0.0, 0.78, -0.85), (0.0, 0.72, -0.22), "KOKPIT: BATAL LEPAS LANDAS!", dusk_sky
            # Exterior widebody airliner roaring down runway with spoilers raised & red glowing wheel brakes!
            jet_x = -0.85 + 1.45 * ((u - 0.36) / 0.64)
            m = Mesh.merge([
                runway,
                V4HeroModels.commercial_airliner(pos=(jet_x, 1.12, 0.0), scale=1.08, gear_down=True, spoiler_up=1.0, fan_spin=t * 14.0),
                make_icosphere(0.24, hex_rgb("#F97316"), subdivisions=1, emission=4.2).transformed(pos=(jet_x - 0.12, 0.18, 0.82)),
                make_icosphere(0.28, hex_rgb("#CBD5E1"), subdivisions=1, emission=1.2).transformed(pos=(jet_x - 0.65, 0.22, 0.86)),
            ])
            return m, (2.95, 1.65, 4.35), (jet_x + 0.15, 0.85, 0.0), (jet_x - 0.12, 0.25, 0.82), "REM CAKRAM MEMBARA!", dusk_sky
        if beat_id == "burst_hazard":
            m = Mesh.merge([
                runway,
                V4HeroModels.commercial_airliner(pos=(0.35, 1.12, -0.35), scale=1.12, gear_down=True, spoiler_up=0.7, fan_spin=t * 4.0),
                make_icosphere(0.28 + 0.06 * math.sin(t * 10.0), hex_rgb("#EF4444"), subdivisions=2, emission=4.0).transformed(pos=(0.22, 0.22, 0.52)),
                HumanRigV3.build(pos=(-1.55, 0.0, 1.35), rot_y=0.85, scale=0.92, role="engineer", jacket_hex="#FACC15", startled=0.75, time_s=t),
            ])
            return m, (-0.55, 0.95, 3.25), (0.25, 0.58, 0.15), (0.22, 0.28, 0.52), "RISIKO LEDAKAN DI BAWAH SAYAP", alert_sky
        if beat_id == "fusible_plug":
            melt = min(1.0, max(0.0, (u - 0.12) / 0.72))
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.aircraft_wheel_fusible_cutaway(pos=(0.0, 0.05, 0.0), brake_heat=0.95, plug_melted=melt, tire_deflate=melt * 0.75, scale=1.22),
            ])
            return m, (0.52, 1.22, 2.95), (0.14, 1.02, 0.0), (0.62, 1.12, 0.22), "INTI LELEH -> GAS KELUAR AMAN", studio_sky
        if beat_id == "boundary":
            # Parked airliner + yellow portable brake cooling fan cart + airline ground technician!
            m = Mesh.merge([
                runway,
                V4HeroModels.commercial_airliner(pos=(0.55, 1.12, -0.55), scale=1.02, gear_down=True, spoiler_up=0.0, fan_spin=t * 1.5),
                # Portable yellow Brake Cooling Fan Cart blowing air onto wheel hub
                make_beveled_box(0.58, 0.42, 0.48, hex_rgb("#FACC15"), bevel=0.04).transformed(pos=(-0.35, 0.24, 0.65)),
                make_cylinder(0.18, 0.20, 0.36, hex_rgb("#0284C7"), segments=16, emission=1.4).transformed(pos=(0.02, 0.32, 0.52), rot=(0.0, 0.55, math.pi * 0.5)),
                HumanRigV3.build(pos=(-1.05, 0.0, 0.85), rot_y=1.15, scale=0.94, role="engineer", jacket_hex="#EA580C", holding_tablet=True, point_arm=0.9, time_s=t),
            ])
            return m, (-0.55, 1.35, 3.15), (-0.15, 0.55, 0.45), (-0.18, 0.35, 0.58), "KIPAS PENDINGIN REM", day_sky
        if beat_id == "closer":
            m = Mesh.merge([
                make_flat_quad_xz(-4.5, -3.5, 4.5, 3.5, 0.0, hex_rgb("#0F172A"), subdiv=2),
                V5HeroProps.aircraft_wheel_fusible_cutaway(pos=(0.0, 0.05, 0.0), brake_heat=0.55, plug_melted=0.95, tire_deflate=0.72, scale=1.18),
            ])
            return m, (0.45, 1.25, 3.15), (0.08, 0.98, 0.0), (0.62, 1.15, 0.22), "MENGEMPIS TANPA MELEDAK", studio_sky
        m = Mesh.merge([
            runway,
            V4HeroModels.commercial_airliner(pos=(0.65, 1.12, -1.65), scale=0.88, gear_down=True),
            V5HeroProps.aircraft_wheel_fusible_cutaway(pos=(0.92, 0.05, 0.15), brake_heat=0.7, plug_melted=0.85, tire_deflate=0.5, scale=0.78),
            HumanRigV3.build(pos=(-0.72, 0.0, 0.35), rot_y=0.22, scale=1.02, role="captain", jacket_hex="#1E3A8A", wave_cta=1.0, time_s=t),
        ])
        return m, (0.0, 1.52, 3.85), (0.05, 0.85, 0.0), (0.92, 0.85, 0.15), "SUMBAT PENYELAMAT RODA!", dusk_sky

    # -------------------------------------------------------------------------
    # 5. KT-R01 — ELEVATOR DUAL SILL, EMPTY SHAFT & MECHANICAL INTERLOCK CLUTCH
    # -------------------------------------------------------------------------
    if ep_id == "KT-R01":
        if beat_id == "hook_sill":
            m = V5HeroProps.elevator_interlock_suite(mode="sill", door_open=0.25 + 0.65 * u, clutch_engaged=1.0, time_s=t)
            return m, (0.0, 0.72, 2.35), (0.0, 0.18, -0.18), (0.0, 0.08, -0.16), "2 JALUR REL PINTU", studio_sky
        if beat_id == "inner_vs_outer":
            m = V5HeroProps.elevator_interlock_suite(mode="interlock", door_open=0.45, clutch_engaged=1.0, time_s=t)
            return m, (1.15, 1.45, 2.85), (0.0, 1.15, -0.18), (0.55, 1.20, -0.28), "KABIN (BIRU) + LANTAI (PERAK)", day_sky
        if beat_id == "empty_shaft":
            m = V5HeroProps.elevator_interlock_suite(mode="empty_shaft", door_open=min(1.0, u * 1.4), time_s=t)
            return m, (0.25, 1.55, 3.25), (0.0, 1.05, -0.35), (0.0, 1.15, -1.15), "RUANG LUNCUR KOSONG!", alert_sky
        if beat_id == "interlock_hook":
            m = V5HeroProps.elevator_interlock_suite(mode="interlock", door_open=0.0, car_offset_y=-0.45, clutch_engaged=0.0, time_s=t)
            return m, (0.22, 2.28, 1.95), (0.12, 2.25, -0.12), (0.14, 2.38, -0.04), "KAIT INTERLOCK TERKUNCI", studio_sky
        if beat_id == "clutch_vane":
            car_y = -0.35 * max(0.0, 1.0 - u * 2.5)
            eng = min(1.0, max(0.0, (u - 0.32) * 2.4))
            opn = max(0.0, (u - 0.55) / 0.45) * 0.85
            m = V5HeroProps.elevator_interlock_suite(mode="interlock", door_open=opn, car_offset_y=car_y, clutch_engaged=eng, time_s=t)
            return m, (0.32, 2.24, 2.05), (0.25, 2.22, -0.15), (0.30 + 0.56 * opn, 2.18, -0.16), "BILAH KABIN SERET RODA!", studio_sky
        if beat_id == "boundary":
            m = Mesh.merge([
                V5HeroProps.elevator_interlock_suite(mode="interlock", door_open=0.55, clutch_engaged=1.0, time_s=t),
                HumanRigV3.build(pos=(-0.78, 0.0, 0.85), rot_y=2.65, scale=0.96, role="engineer", jacket_hex="#0284C7", holding_tablet=True, point_arm=1.0, time_s=t),
            ])
            return m, (0.0, 1.68, 3.45), (0.0, 1.35, -0.10), (0.35, 2.25, -0.10), "INSPEKSI ASME A17.1", day_sky
        if beat_id == "closer":
            m = V5HeroProps.elevator_interlock_suite(mode="interlock", door_open=0.65 * _ease_io(u), clutch_engaged=1.0, time_s=t)
            return m, (0.35, 1.85, 2.75), (0.15, 1.65, -0.15), (0.28, 2.25, -0.12), "DIGANDENG SAAT SEJAJAR", studio_sky
        m = Mesh.merge([
            V5HeroProps.elevator_interlock_suite(mode="sill", door_open=0.55, clutch_engaged=1.0, time_s=t),
            HumanRigV3.build(pos=(-0.68, 0.0, 0.92), rot_y=0.18, scale=1.00, role="engineer", jacket_hex="#0EA5E9", wave_cta=1.0, time_s=t),
        ])
        return m, (0.0, 1.55, 3.65), (0.0, 1.05, 0.0), (0.0, 0.12, -0.16), "PERNAH INTIP CELAH LIFT?", dusk_sky

    # -------------------------------------------------------------------------
    # 6. KT-R02 — TWIN SKYSCRAPERS SEISMIC POUNDING & MALL ACCORDION SKYBRIDGE
    # -------------------------------------------------------------------------
    if ep_id == "KT-R02":
        if beat_id == "hook":
            m = V5HeroProps.twin_towers_seismic_scene(mode="gap", time_s=t * 0.4)
            return m, (0.0, 2.45, 5.35), (0.0, 2.05, 0.0), (0.0, 2.12, 0.35), "CELAH TERTUTUP PELAT", day_sky
        if beat_id == "out_of_phase":
            m = V5HeroProps.twin_towers_seismic_scene(mode="gap", time_s=t * 1.35)
            return m, (0.35, 2.65, 5.45), (0.0, 2.15, 0.0), (1.35, 3.45, 0.0), "IRAMA AYUNAN BERBEDA", dusk_sky
        if beat_id == "pounding":
            m = V5HeroProps.twin_towers_seismic_scene(mode="pounding", time_s=t * 1.6)
            return m, (0.0, 2.55, 4.35), (0.0, 2.45, 0.15), (0.0, 2.75, 0.55), "BENTURAN SEISMIC POUNDING!", alert_sky
        if beat_id == "seismic_gap":
            m = V5HeroProps.twin_towers_seismic_scene(mode="gap", time_s=t * 1.25)
            return m, (0.0, 2.85, 4.95), (0.0, 2.45, 0.0), (0.0, 3.15, 0.0), "JARAK AYUNAN AMAN", studio_sky
        if beat_id == "accordion_bridge":
            m = V5HeroProps.twin_towers_seismic_scene(mode="skybridge_interior", time_s=t * 1.2)
            return m, (0.0, 1.72, 3.75), (0.0, 0.72, 0.0), (0.0, 0.12, 0.35), "PELAT AKORDEON JEMBATAN MAL", day_sky
        if beat_id == "boundary":
            m = Mesh.merge([
                V5HeroProps.twin_towers_seismic_scene(mode="gap", time_s=t * 0.5),
                HumanRigV3.build(pos=(-0.35, 0.0, 1.85), rot_y=0.25, scale=0.92, role="engineer", jacket_hex="#F59E0B", holding_tablet=True, point_arm=0.9, time_s=t),
            ])
            return m, (0.35, 2.15, 5.25), (0.0, 1.85, 0.0), (0.0, 2.12, 0.35), "HITUNGAN ZONA GEMPA SNI 1726", day_sky
        if beat_id == "closer":
            m = V5HeroProps.twin_towers_seismic_scene(mode="skybridge_interior", time_s=t)
            return m, (0.0, 1.45, 3.35), (0.0, 0.45, 0.0), (0.0, 0.10, 0.25), "RUANG GOYANG ANTI TABRAKAN", studio_sky
        m = V5HeroProps.twin_towers_seismic_scene(mode="skybridge_interior", time_s=t * 0.6)
        return m, (0.0, 1.65, 3.95), (0.0, 0.85, 0.0), (0.0, 0.12, 0.25), "PERNAH INJAK DI MAL?", dusk_sky

    # -------------------------------------------------------------------------
    # 7. KT-R03 — HIGHWAY FINGER EXPANSION JOINT, THERMAL EXPANSION & BOLTS
    # -------------------------------------------------------------------------
    if ep_id == "KT-R03":
        if beat_id == "hook":
            m = V5HeroProps.bridge_finger_joint_scene(mode="finger_macro", thermal_expand=0.2, time_s=t)
            return m, (0.35, 1.85, 3.25), (0.0, 0.68, 0.0), (0.0, 0.62, 0.26), "BUNYI TOK-TOK PELAT JARI", day_sky
        if beat_id == "thermal_cycle":
            th = math.sin(u * math.pi * 2.0)
            sky = day_sky if th >= 0 else dusk_sky
            sun_orb = make_icosphere(0.38, hex_rgb("#FACC15" if th >= 0 else "#BAE6FD"), subdivisions=2, emission=3.5).transformed(pos=(1.55 * math.cos(u * 3.14), 3.25, -1.65))
            m = Mesh.merge([V5HeroProps.bridge_finger_joint_scene(mode="overview", thermal_expand=th, time_s=t), sun_orb])
            return m, (0.0, 2.45, 5.35), (0.0, 1.65, 0.0), (-1.62, 1.95, 0.0), "MEMUAI SIANG • SUSUT MALAM", sky
        if beat_id == "cracked_abutment":
            m = V5HeroProps.bridge_finger_joint_scene(mode="rigid_crack", thermal_expand=0.95, time_s=t)
            return m, (-0.85, 2.05, 3.95), (-1.65, 1.35, 0.25), (-1.72, 1.45, 1.15), "KEPALA JEMBATAN RETAK!", alert_sky
        if beat_id == "finger_macro":
            pass
        if beat_id == "finger_joint":
            th = -0.65 + 1.30 * u
            m = V5HeroProps.bridge_finger_joint_scene(mode="finger_macro", thermal_expand=th, time_s=t)
            return m, (0.25, 2.35, 2.95), (0.0, 0.60, 0.0), (0.0, 0.60, 0.0), "JARI BAJA SALING SILANG", studio_sky
        if beat_id == "loose_bolts":
            m = V5HeroProps.bridge_finger_joint_scene(mode="loose_bolts", thermal_expand=0.1, time_s=t)
            return m, (-0.35, 1.65, 2.65), (-0.25, 0.62, 0.0), (-0.48, 0.72, 0.32), "BAUT ANGKUR & KARET AUS!", alert_sky
        if beat_id == "boundary":
            m = Mesh.merge([
                V5HeroProps.bridge_finger_joint_scene(mode="overview", thermal_expand=0.25, time_s=t),
                HumanRigV3.build(pos=(-2.15, 1.65, 0.65), rot_y=1.15, scale=0.78, role="engineer", jacket_hex="#EA580C", point_arm=1.0, time_s=t),
            ])
            return m, (-0.55, 2.45, 4.65), (-0.65, 1.75, 0.0), (-1.62, 1.95, 0.0), "STANDAR BINA MARGA", day_sky
        if beat_id == "closer":
            m = V5HeroProps.bridge_finger_joint_scene(mode="finger_macro", thermal_expand=0.35 * math.sin(t * 2.5), time_s=t)
            return m, (0.25, 2.05, 3.05), (0.0, 0.62, 0.0), (0.0, 0.62, 0.0), "RUANG BERNAPAS JEMBATAN", studio_sky
        m = Mesh.merge([
            V5HeroProps.bridge_finger_joint_scene(mode="finger_macro", thermal_expand=0.2, time_s=t),
            HumanRigV3.build(pos=(-1.35, 0.62, 0.92), rot_y=0.35, scale=0.92, role="engineer", jacket_hex="#F59E0B", wave_cta=1.0, time_s=t),
        ])
        return m, (-0.15, 1.85, 3.65), (-0.15, 0.85, 0.15), (0.0, 0.62, 0.0), "HALUS ATAU DENTUMAN KERAS?", dusk_sky

    # -------------------------------------------------------------------------
    # 8. KT-R04 — PROTRUDING MANHOLE: RIGID SHAFT, ROAD ROLLER & PIPE EROSION
    # -------------------------------------------------------------------------
    if ep_id == "KT-R04":
        if beat_id == "hook":
            m = V5HeroProps.manhole_cutaway_scene(mode="surface", settle=0.28, time_s=t)
            return m, (0.25, 1.55, 3.85), (0.0, 0.15, 0.0), (0.0, 0.28, 0.0), "TUTUP BESI NONGOL TINGGI", day_sky
        if beat_id == "illusion":
            m = V5HeroProps.manhole_cutaway_scene(mode="cutaway", settle=0.06 + 0.28 * u, time_s=t)
            return m, (0.0, 1.25, 4.15), (0.0, -0.25, 0.0), (0.95, -0.18, 0.45), "ASPAL SEKITAR YANG AMBLES!", studio_sky
        if beat_id == "shaft_vs_soil":
            m = V5HeroProps.manhole_cutaway_scene(mode="cutaway", settle=0.30, time_s=t)
            return m, (0.25, 0.85, 4.45), (0.0, -0.65, 0.0), (0.0, -0.75, 0.25), "CEROBONG BETON KE FONDASI", studio_sky
        if beat_id == "roller_compaction":
            m = V5HeroProps.manhole_cutaway_scene(mode="roller", settle=0.28, time_s=t)
            return m, (0.0, 1.65, 4.85), (0.0, 0.05, 0.0), (-1.15, 0.38, 0.15), "TEPI SULIT DIGILAS ROLLER", day_sky
        if beat_id == "pipe_leak_erosion":
            m = V5HeroProps.manhole_cutaway_scene(mode="pipe_leak", settle=0.34, time_s=t)
            return m, (0.45, 0.35, 3.65), (0.45, -0.82, 0.15), (0.82, -0.88, 0.44), "PIPA BOCOR GERUS TANAH!", alert_sky
        if beat_id == "boundary":
            m = Mesh.merge([
                V5HeroProps.manhole_cutaway_scene(mode="cutaway", settle=0.26, time_s=t),
                HumanRigV3.build(pos=(-1.35, -0.12, 0.65), rot_y=0.95, scale=0.92, role="engineer", jacket_hex="#10B981", holding_tablet=True, point_arm=0.9, time_s=t),
            ])
            return m, (0.0, 1.35, 4.55), (0.0, -0.25, 0.0), (0.0, 0.22, 0.0), "KEPADATAN URUGAN & DRAINASE", day_sky
        if beat_id == "closer":
            m = V5HeroProps.manhole_cutaway_scene(mode="cutaway", settle=0.30, time_s=t)
            return m, (0.15, 1.05, 4.15), (0.0, -0.45, 0.0), (0.0, 0.22, 0.0), "CEROBONG KAKU VS TANAH TURUN", studio_sky
        m = Mesh.merge([
            V5HeroProps.manhole_cutaway_scene(mode="surface", settle=0.26, time_s=t),
            HumanRigV3.build(pos=(-0.95, 0.0, 0.78), rot_y=0.25, scale=0.98, role="engineer", jacket_hex="#34D399", wave_cta=1.0, time_s=t),
        ])
        return m, (0.0, 1.55, 3.95), (0.0, 0.45, 0.0), (0.0, 0.26, 0.0), "SERING HINDARI MANHOLE INI?", dusk_sky

    # -------------------------------------------------------------------------
    # 9. KT-R05 — CONTINUOUS WELDED RAIL BUCKLING, TENSOR JACK & BALLAST
    # -------------------------------------------------------------------------
    if ep_id == "KT-R05":
        if beat_id == "hook":
            m = V5HeroProps.cwr_rail_scene(mode="buckling", buckle_amp=0.44 * _ease_io(min(1.0, u * 1.4)), time_s=t)
            return m, (0.65, 2.05, 4.25), (0.0, 0.55, -0.45), (0.35, 0.48, 0.45), "REL MELENGKUNG BAGAI ULAR!", alert_sky
        if beat_id == "solar_compression":
            sun = make_icosphere(0.45, hex_rgb("#F97316"), subdivisions=2, emission=4.2).transformed(pos=(0.0, 3.15, -1.85))
            m = Mesh.merge([V5HeroProps.cwr_rail_scene(mode="buckling", buckle_amp=0.16, time_s=t), sun])
            return m, (1.35, 1.45, 3.25), (0.0, 0.52, 0.0), (0.54, 0.48, 0.0), "GAYA TEKAN PANAS TERJEBAK", dusk_sky
        if beat_id == "track_buckling":
            m = V5HeroProps.cwr_rail_scene(mode="buckling", buckle_amp=0.52, time_s=t)
            return m, (0.0, 3.65, 3.35), (0.0, 0.38, 0.0), (0.48, 0.46, 0.55), "TRACK BUCKLING KE SAMPING!", alert_sky
        if beat_id == "rail_tensor":
            m = V5HeroProps.cwr_rail_scene(mode="tensor", buckle_amp=0.0, time_s=t)
            return m, (1.65, 1.72, 3.15), (0.05, 0.55, 0.0), (0.54, 0.55, 0.0), "DONGKRAK PENARIK SUHU NETRAL", studio_sky
        if beat_id == "ballast_shoulder":
            m = V5HeroProps.cwr_rail_scene(mode="ballast", buckle_amp=0.0, time_s=t)
            return m, (1.85, 1.55, 3.55), (0.0, 0.42, -0.25), (1.15, 0.28, 0.45), "BAHU BATU BALAS LEBAR & PADAT", day_sky
        if beat_id == "boundary":
            m = V5HeroProps.cwr_rail_scene(mode="speed_signal", buckle_amp=0.0, time_s=t)
            return m, (0.45, 1.85, 4.15), (0.45, 1.15, -0.25), (1.48, 2.18, 0.82), "SINYAL BATAS KECEPATAN DARURAT", dusk_sky
        if beat_id == "closer":
            m = V5HeroProps.cwr_rail_scene(mode="ballast", buckle_amp=0.0, time_s=t)
            return m, (0.45, 1.65, 3.85), (0.0, 0.65, -0.55), (0.0, 0.46, 0.25), "LURUS & MULUS TANPA CELAH", studio_sky
        m = Mesh.merge([
            V5HeroProps.cwr_rail_scene(mode="tensor", buckle_amp=0.0, time_s=t),
        ])
        return m, (0.85, 1.65, 3.75), (0.25, 0.72, 0.0), (0.54, 0.54, 0.0), "KANGEN JEGLEK ATAU MULUS?", dusk_sky

    # -------------------------------------------------------------------------
    # 10. KT-R06 — 660-TON SKYSCRAPER TUNED MASS DAMPER & HYDRAULIC PISTONS
    # -------------------------------------------------------------------------
    if ep_id == "KT-R06":
        if beat_id == "hook":
            m = V5HeroProps.tmd_skyscraper_scene(mode="pendulum", time_s=t)
            return m, (0.0, 1.65, 4.05), (0.0, 1.52, 0.0), (0.0, 1.52, 0.55), "BOLA BAJA 660 TON BERAYUN!", studio_sky
        if beat_id == "wind_vortex":
            if u < 0.48:
                m = V5HeroProps.tmd_skyscraper_scene(mode="tower_wind", time_s=t)
                return m, (0.45, 2.85, 5.55), (0.0, 2.45, 0.0), (0.35, 4.25, 0.0), "PUSARAN ANGIN TOPAN", dusk_sky
            m = V5HeroProps.tmd_skyscraper_scene(mode="dizzy_office", time_s=t)
            return m, (0.0, 1.55, 3.75), (0.0, 1.05, -0.15), (0.35, 1.72, -0.15), "LAMPU & GELAS IKUT GOYANG!", dusk_sky
        if beat_id == "tmd_tuning":
            m = V5HeroProps.tmd_skyscraper_scene(mode="pendulum", time_s=t)
            return m, (1.45, 2.25, 3.85), (0.0, 1.75, 0.0), (0.0, 2.45, 0.0), "8 KABEL BAJA SELARAS AYUNAN", studio_sky
        if beat_id == "counter_sway":
            m = V5HeroProps.tmd_skyscraper_scene(mode="pendulum", time_s=t * 1.25)
            return m, (0.0, 1.75, 4.15), (0.0, 1.38, 0.0), (0.0, 1.48, 0.65), "INERSIA BOLA LAWAN ARAH GEDUNG", studio_sky
        if beat_id == "hydraulic_heat":
            m = V5HeroProps.tmd_skyscraper_scene(mode="damper_macro", time_s=t * 1.3)
            return m, (0.45, 1.15, 2.95), (0.0, 0.78, 0.0), (0.65, 0.65, 0.55), "SILINDER HIDRAULIK -> PANAS OLI", alert_sky
        if beat_id == "boundary":
            m = V5HeroProps.tmd_skyscraper_scene(mode="seismic_frame", time_s=t * 0.7)
            return m, (0.55, 2.75, 5.45), (0.0, 2.35, 0.0), (0.0, 2.35, 0.68), "RANGKA DIAGRID TAHAN GEMPA", day_sky
        if beat_id == "closer":
            m = V5HeroProps.tmd_skyscraper_scene(mode="pendulum", time_s=t)
            return m, (0.25, 1.78, 3.85), (0.0, 1.45, 0.0), (0.0, 1.48, 0.55), "PEREDAM GOYANGAN ANGIN", studio_sky
        m = Mesh.merge([
            V5HeroProps.tmd_skyscraper_scene(mode="pendulum", time_s=t * 0.8),
            HumanRigV3.build(pos=(-1.15, 0.22, 1.15), rot_y=0.35, scale=0.88, role="civilian_m", jacket_hex="#FACC15", wave_cta=1.0, time_s=t),
        ])
        return m, (0.0, 1.75, 4.25), (0.0, 1.25, 0.0), (0.0, 1.48, 0.55), "BERANI NONTON SAAT BADAI?", dusk_sky

    # -------------------------------------------------------------------------
    # 11. KT-R07 — ELEVATED TOLLWAY ELASTOMERIC SHIM BEARING & POT BEARING
    # -------------------------------------------------------------------------
    if ep_id == "KT-R07":
        if beat_id == "hook_underpass":
            m = V5HeroProps.highway_bearing_scene(mode="underpass", shear_x=0.06 * math.sin(t * 2.5), time_s=t)
            return m, (1.35, 1.15, 4.15), (0.0, 2.35, 0.0), (0.0, 2.44, 0.35), "CELAH DI ATAS KEPALA TIANG!", day_sky
        if beat_id == "black_pad":
            m = V5HeroProps.highway_bearing_scene(mode="underpass", shear_x=0.08 * math.sin(t * 3.0), time_s=t)
            return m, (0.85, 2.15, 2.75), (0.0, 2.45, 0.25), (0.0, 2.44, 0.35), "BANTAL HITAM PENOPANG TRUK", studio_sky
        if beat_id == "rigid_crack":
            m = V5HeroProps.highway_bearing_scene(mode="rigid_crack", shear_x=0.0, time_s=t)
            return m, (0.45, 2.05, 3.25), (0.0, 2.15, 0.25), (-1.02, 2.05, 0.74), "DIBAUT MATI -> TIANG PECAH!", alert_sky
        if beat_id == "laminated_cutaway":
            m = V5HeroProps.highway_bearing_scene(mode="laminated_cutaway", shear_x=0.08 * math.sin(t * 2.0), time_s=t)
            return m, (0.55, 1.35, 3.05), (0.0, 0.96, 0.0), (0.0, 0.96, 0.45), "KARET + PELAT BAJA TIPIS", studio_sky
        if beat_id == "shear_flex":
            sh = 0.26 * math.sin(u * math.pi * 2.0)
            m = V5HeroProps.highway_bearing_scene(mode="laminated_cutaway", shear_x=sh, time_s=t)
            return m, (0.25, 1.28, 2.95), (0.0, 0.96, 0.0), (sh * 0.5, 0.98, 0.45), "LENTUR GESER • TAK MELUBER!", studio_sky
        if beat_id == "pot_bearing":
            m = V5HeroProps.highway_bearing_scene(mode="pot_bearing", shear_x=0.14 * math.sin(t * 2.4), time_s=t)
            return m, (0.85, 1.45, 3.15), (0.0, 0.88, 0.0), (0.0, 0.85, 0.48), "POT BEARING BENTANG RAKSASA", day_sky
        if beat_id == "closer":
            m = V5HeroProps.highway_bearing_scene(mode="underpass", shear_x=0.10 * math.sin(t * 2.5), time_s=t)
            return m, (1.15, 1.45, 3.95), (0.0, 2.35, 0.0), (0.0, 2.44, 0.35), "KUAT TEGAK & LENTUR GESER", studio_sky
        m = Mesh.merge([
            V5HeroProps.highway_bearing_scene(mode="laminated_cutaway", shear_x=0.12 * math.sin(t * 2.5), time_s=t),
            HumanRigV3.build(pos=(-1.35, 0.0, 0.85), rot_y=0.35, scale=0.95, role="engineer", jacket_hex="#22D3EE", wave_cta=1.0, time_s=t),
        ])
        return m, (-0.15, 1.45, 3.75), (-0.15, 0.92, 0.0), (0.0, 0.96, 0.45), "PERNAH LIHAT DI TIANG TOL?", dusk_sky

    # -------------------------------------------------------------------------
    # 12. KT-R08 — 50-STORY HOTEL WATER PRESSURE ZONES, BREAK TANK & BRASS PRV
    # -------------------------------------------------------------------------
    if beat_id == "hook":
        m = V5HeroProps.hotel_plumbing_scene(mode="tower_zones", time_s=t)
        return m, (0.35, 2.65, 5.65), (0.0, 2.35, 0.0), (-0.68, 3.15, 0.78), "ZONA PIPA HOTEL 50 LANTAI", day_sky
    if beat_id == "hydrostatic_gain":
        pan_y = 3.85 - 2.65 * u
        m = V5HeroProps.hotel_plumbing_scene(mode="tower_zones", time_s=t)
        return m, (-0.45, pan_y, 3.85), (-0.35, pan_y - 0.15, 0.35), (-0.95, 1.75, 0.82), "+1 ATM TIAP 10 METER!", studio_sky
    if beat_id == "pipe_burst":
        m = V5HeroProps.hotel_plumbing_scene(mode="faucet_burst", time_s=t)
        return m, (0.15, 1.65, 3.65), (0.0, 1.15, -0.35), (0.25, 1.55, -0.52), "TEKANAN RAKSASA JEBOL KRAN!", alert_sky
    if beat_id == "break_tank":
        m = V5HeroProps.hotel_plumbing_scene(mode="break_tank", time_s=t)
        return m, (0.25, 1.62, 3.95), (0.05, 1.15, 0.0), (0.15, 1.05, 0.55), "TANGKI PEMUTUS LANTAI TENGAH", studio_sky
    if beat_id == "prv_bathroom":
        m = V5HeroProps.hotel_plumbing_scene(mode="prv_bathroom", time_s=t)
        return m, (0.0, 1.58, 3.95), (0.05, 1.08, -0.45), (-1.25, 1.45, -0.25), "PRV -> KLOSET & SHOWER AMAN", day_sky
    if beat_id == "boundary":
        m = Mesh.merge([
            V5HeroProps.hotel_plumbing_scene(mode="tower_zones", time_s=t),
            HumanRigV3.build(pos=(-1.65, 0.0, 1.15), rot_y=0.55, scale=0.92, role="engineer", jacket_hex="#38BDF8", holding_tablet=True, point_arm=0.9, time_s=t),
        ])
        return m, (0.0, 2.45, 5.55), (0.0, 2.15, 0.0), (0.0, 2.12, 0.78), "STANDAR PLAMBING SNI 8153", day_sky
    if beat_id == "closer":
        m = V5HeroProps.hotel_plumbing_scene(mode="break_tank", time_s=t)
        return m, (0.15, 1.55, 3.65), (0.15, 1.05, 0.0), (0.15, 1.05, 0.55), "TEKANAN DIRESET TIAP ZONA", studio_sky
    m = Mesh.merge([
        V5HeroProps.hotel_plumbing_scene(mode="prv_bathroom", time_s=t),
        HumanRigV3.build(pos=(-0.35, 0.0, 0.55), rot_y=0.15, scale=0.95, role="engineer", jacket_hex="#0EA5E9", wave_cta=1.0, time_s=t),
    ])
    return m, (0.0, 1.55, 4.05), (0.0, 1.02, -0.25), (-1.25, 1.35, -0.25), "LIHAT LANTAI TANPA JENDELA?", dusk_sky


class V5OverlayArtist:
    """
    Renders crisp Shorts-safe-zone 2D HUD overlays (`top >= 9%`, `right <= 82.5%`, `bottom <= 74%`)
    so zero badges ever collide with YouTube Shorts chrome OR `captions.py` word-pop captions (`y = 70%..74%`).
    """

    def __init__(self, w: int = 1080, h: int = 1920):
        self.w = w
        self.h = h
        self.f_cat = ImageFont.truetype(FONT_BOLD, 21)
        self.f_hook = ImageFont.truetype(FONT_BOLD, 36)
        self.f_call = ImageFont.truetype(FONT_BOLD, 28)
        self.f_ptr = ImageFont.truetype(FONT_BOLD, 23)
        self.f_q = ImageFont.truetype(FONT_BOLD, 27)
        self.f_opt = ImageFont.truetype(FONT_BOLD, 25)
        self.f_btn = ImageFont.truetype(FONT_BOLD, 30)

    def draw_frame_overlay(
        self,
        rgb: np.ndarray,
        spec: dict,
        beat: dict,
        beat_idx: int,
        n_beats: int,
        u: float,
        t: float,
        proj_pt: Optional[Tuple[int, int]],
        ptr_label: str,
    ) -> np.ndarray:
        pil = Image.fromarray(rgb)
        dr = ImageDraw.Draw(pil, "RGBA")
        acc = _hex_rgba(spec["accent"], 255)

        # 1. SAFE-ZONE TOP HEADER CARD (x: 64..880, y: 164..292 — clear of top 8% search bar & right 16% icons!)
        if beat_idx == 0:
            dr.rounded_rectangle([64, 164, 882, 292], radius=22, fill=(11, 18, 34, 224), outline=acc, width=3)
            dr.text((90, 180), f"KNOT THEORY  •  {spec['hook_sub']}", font=self.f_cat, fill=acc)
            dr.text((90, 218), spec["hook_main"], font=self.f_hook, fill=(255, 255, 255, 255))
        else:
            dr.rounded_rectangle([64, 164, 876, 244], radius=20, fill=(11, 18, 34, 216), outline=(148, 163, 184, 150), width=2)
            step_txt = f"{beat_idx + 1:02d}/{n_beats:02d}  •  {beat['callout']}"
            dr.text((88, 184), step_txt, font=self.f_call, fill=(248, 250, 252, 255))
            prog_w = int(764 * ((beat_idx + u) / max(1, n_beats)))
            dr.rounded_rectangle([88, 228, 852, 235], radius=3, fill=(51, 65, 85, 200))
            dr.rounded_rectangle([88, 228, 88 + max(12, prog_w), 235], radius=3, fill=acc)

        # 2. 3D-PROJECTED TECHNICAL LEADER CALLOUT (Beats 0..n_beats-2; clamped strictly inside safe zone!)
        if beat["id"] != "cta" and proj_pt is not None and ptr_label:
            px, py = proj_pt
            if 70 <= px <= 880 and 290 <= py <= 1220:
                bw = int(self.f_ptr.getlength(ptr_label)) + 44
                bx = max(68, min(882 - bw, px - bw // 2))
                by = py - 118 if py > 460 else py + 68
                by = max(276, min(1150, by))
                dr.line([(px, py), (bx + bw // 2, by + 26)], fill=acc, width=4)
                dr.ellipse([px - 11, py - 11, px + 11, py + 11], fill=acc, outline=(255, 255, 255, 255), width=3)
                dr.rounded_rectangle([bx, by, bx + bw, by + 50], radius=14, fill=(15, 23, 42, 232), outline=acc, width=2)
                dr.text((bx + 22, by + 11), ptr_label, font=self.f_ptr, fill=(255, 255, 255, 255))

        # 3. INTERACTIVE A/B COMMENT CARD + PULSING WHITE SUBSCRIBE BUTTON ON FINAL `cta` BEAT!
        if beat["id"] == "cta":
            dr.rounded_rectangle([64, 976, 882, 1308], radius=24, fill=(11, 18, 34, 232), outline=acc, width=3)
            dr.text((92, 996), spec["cta_q1"], font=self.f_q, fill=(248, 250, 252, 255))
            dr.text((92, 1034), spec["cta_q2"], font=self.f_q, fill=acc)

            dr.rounded_rectangle([90, 1086, 462, 1152], radius=16, fill=(30, 58, 138, 235), outline=(56, 189, 248, 255), width=2)
            dr.text((112, 1103), f"A: {spec['cta_left']}", font=self.f_opt, fill=(255, 255, 255, 255))

            dr.rounded_rectangle([482, 1086, 856, 1152], radius=16, fill=(124, 45, 18, 235), outline=(251, 146, 60, 255), width=2)
            dr.text((504, 1103), f"B: {spec['cta_right']}", font=self.f_opt, fill=(255, 255, 255, 255))

            pulse = int(10 * (0.5 + 0.5 * math.sin(t * 8.5)))
            bx0, by0, bx1, by1 = 90 - pulse // 2, 1176 - pulse // 3, 856 + pulse // 2, 1258 + pulse // 3
            dr.rounded_rectangle([bx0, by0, bx1, by1], radius=22, fill=(255, 255, 255, 255), outline=acc, width=4)
            dr.text((132, by0 + 23), f"▶  {spec['cta_white_btn']}", font=self.f_btn, fill=(15, 23, 42, 255))
            ay = 1272 + int(7 * abs(math.sin(t * 7.0)))
            dr.polygon([(473, ay + 24), (453, ay), (493, ay)], fill=(255, 255, 255, 255))

        return pil.tobytes()


def render_v5_episode(
    ep_id: str,
    root: pathlib.Path,
    out_mp4: Optional[pathlib.Path] = None,
    thumb_jpg: Optional[pathlib.Path] = None,
) -> dict:
    """
    Render one complete 1080x1920 30fps -14 LUFS V5 Short with C++ `SceneRenderer`,
    phrase-locked beat timing, safe-zone callout pointers, and `captions.py` pop-in captions.
    """
    spec = V5_SHORTS_SPECS[ep_id]
    timing_path = root / "output/v5_timings" / f"{ep_id}_timings.json"
    timing = json.loads(timing_path.read_text(encoding="utf-8"))
    mix_wav = root / "assets/audio/v5_mix" / f"{ep_id}_mix.wav"
    cap_mp4 = root / "output/v5_captions" / ep_id / "captions_green.mp4"

    if out_mp4 is None:
        out_mp4 = root / "output" / f"{ep_id}_master.mp4"
    if thumb_jpg is None:
        thumb_jpg = root / "upload/thumbs" / f"{ep_id}_thumbnail.jpg"
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    thumb_jpg.parent.mkdir(parents=True, exist_ok=True)

    fps = 30
    total_frames = int(timing["total_frames"])
    beats = timing["beats"]

    renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=0.80, shadow_res=640)
    artist = V5OverlayArtist(1080, 1920)

    # Single-pass ffmpeg encode: raw RGB24 3D+HUD pipe + colorkeyed `captions_green.mp4` + 48kHz -14 LUFS `mix.wav`!
    tmp_mp4 = out_mp4.with_suffix(".tmp.mp4")
    ff_cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1080x1920", "-r", str(fps), "-i", "-",
        "-i", str(cap_mp4),
        "-i", str(mix_wav),
        "-filter_complex", "[1:v]colorkey=0x00FF00:0.24:0.0,format=rgba[cap];[0:v][cap]overlay=0:0:shortest=1[vout]",
        "-map", "[vout]", "-map", "2:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-r", str(fps),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart",
        "-shortest",
        str(tmp_mp4),
    ]
    proc = subprocess.Popen(ff_cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None

    hero_beat_idx = min(3, len(beats) - 2)
    thumb_frame_idx = int(round(0.5 * (beats[hero_beat_idx]["start_s"] + beats[hero_beat_idx]["end_s"]) * fps))
    thumb_saved = False

    # Cache 28 procedural 3D mesh key-states per beat while camera, 3D projection, HUD & captions run at true 30 fps!
    mesh_cache: dict = {}
    b_ptr = 0
    for f_idx in range(total_frames):
        t = f_idx / float(fps)
        while b_ptr + 1 < len(beats) and t >= beats[b_ptr]["end_s"]:
            b_ptr += 1
            mesh_cache.clear()
        b = beats[b_ptr]
        b_dur = max(0.05, float(b["end_s"]) - float(b["start_s"]))
        u = max(0.0, min(1.0, (t - float(b["start_s"])) / b_dur))

        u_step = int(round(u * 27))
        if u_step not in mesh_cache:
            uq = u_step / 27.0
            tq = float(b["start_s"]) + uq * b_dur
            mesh_cache[u_step] = build_beat_scene(ep_id, b["id"], uq, tq)
        mesh, base_cp, base_ct, anchor_3d, ptr_lbl, (bg_top, bg_bot) = mesh_cache[u_step]

        cp, ct, fov = _apply_cam_recipe(base_cp, base_ct, b["cam"], u)

        rgb = renderer.render(
            mesh,
            cam_pos=cp,
            cam_target=ct,
            fov_x_deg=fov,
            bg_top=bg_top,
            bg_bot=bg_bot,
        )
        proj = renderer.project_point(anchor_3d, cp, ct, fov)
        comp_bytes = artist.draw_frame_overlay(rgb, spec, b, b_ptr, len(beats), u, t, proj, ptr_lbl)

        if f_idx == thumb_frame_idx and not thumb_saved:
            th_img = Image.fromarray(rgb)
            tdr = ImageDraw.Draw(th_img, "RGBA")
            acc = _hex_rgba(spec["accent"], 255)
            tdr.rounded_rectangle([48, 88, 1032, 310], radius=28, fill=(11, 18, 34, 232), outline=acc, width=5)
            f_sub = ImageFont.truetype(FONT_BOLD, 34)
            f_big = ImageFont.truetype(FONT_BOLD, 54)
            tdr.text((84, 118), spec["hook_sub"], font=f_sub, fill=acc)
            tdr.text((84, 182), spec["hook_main"][:28], font=f_big, fill=(255, 255, 255, 255))
            th_img.save(thumb_jpg, quality=92)
            thumb_saved = True

        proc.stdin.write(comp_bytes)

    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed for {ep_id} with exit code {rc}")
    tmp_mp4.replace(out_mp4)

    # Export shots.json for `short_qa.py` verification
    shots_meta = {
        "shots": [
            {"id": i + 1, "a": int(round(b["start_s"] * fps)), "b": int(round(b["end_s"] * fps))}
            for i, b in enumerate(beats)
        ]
    }
    shots_path = root / "output/v5_timings" / f"{ep_id}_shots.json"
    shots_path.write_text(json.dumps(shots_meta, indent=2), encoding="utf-8")

    return {
        "episode_id": ep_id,
        "master_mp4": str(out_mp4),
        "thumbnail_jpg": str(thumb_jpg),
        "duration_s": timing["duration_s"],
        "total_frames": total_frames,
        "fps": fps,
    }
