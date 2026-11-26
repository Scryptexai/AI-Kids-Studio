"""
Knot Theory V4 Shorts Director — Batch 3 (KT-R01 .. KT-R08)
Multi-Scene, Anti-Monotony 3D Choreography with V4HeroModels, HumanRigV3, ArchBuilderV3 & PrecisionMechV3.
Matches the exact KnotShortDirectorBatch2 / OverlayCompositor interface (`render_3d_only`,
`composite_1080x1920`, `render_frame`, and 6 tracked `Callout3D` HUD cards per Short).
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

from src.assets_ep02 import make_3d_double_arrow, make_ring_collar
from src.knot_diorama_lib import DioramaSignalProps, lerp, lerp3
from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.knot_v4_models import V4HeroModels
from src.overlays import Callout3D, OverlayCompositor, SubtitleChunk, smoothstep
from src.renderer3d import (
    FLAG_GROUND,
    Mesh,
    SceneRenderer,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


class KnotShortDirectorBatch3:
    """Renders 1080x1920 9:16 frames for V4 Reserve Shorts KT-R01 .. KT-R08."""

    def __init__(
        self,
        ep_code: str,
        spec: dict,
        subtitles: Sequence[SubtitleChunk],
        total_dur: float,
        ssaa: float = 1.0,
        render_w: int = 900,
        render_h: int = 1600,
        shadow_res: int = 768,
    ):
        self.ep_code = ep_code
        self.spec = spec
        self.total_dur = max(10.0, total_dur)
        self.subtitles = list(subtitles)
        self.rw = render_w
        self.rh = render_h
        self.renderer = SceneRenderer(out_w=render_w, out_h=render_h, ssaa=ssaa, shadow_res=shadow_res)
        self.props = DioramaSignalProps()

        self.cta_start = max(self.total_dur - 8.2, self.total_dur * 0.81)
        raw_segs = self.spec["seg_names"]
        seg_map = {i + 1: v for i, v in enumerate(raw_segs)} if isinstance(raw_segs, list) else raw_segs
        self.compositor = OverlayCompositor(
            width=1080,
            height=1920,
            seg_names=seg_map,
            hook_sub=self.spec["hook_sub"],
            hook_main=self.spec["hook_main"],
            cta_start=self.cta_start,
            cta_q1=self.spec["cta_q1"],
            cta_q2=self.spec["cta_q2"],
            cta_opt_left=self.spec["cta_left"],
            cta_opt_right=self.spec["cta_right"],
        )
        self.callouts = self._build_callouts()
        self._build_static()

    def _seg_idx(self, r: float) -> int:
        if r < 0.22:
            return 1
        if r < 0.50:
            return 2
        if r < 0.81:
            return 3
        return 4

    def _build_callouts(self) -> List[Callout3D]:
        d = self.total_dur
        ep = self.ep_code
        table = {
            "KT-R01": [
                Callout3D(0.05 * d, 0.20 * d, (-0.42, 3.05, 0.16), (320, 460), "PINTU LUAR LANTAI", "Terpasang di Dinding Lobi", (245, 158, 11)),
                Callout3D(0.08 * d, 0.21 * d, (0.42, 3.05, -0.02), (750, 580), "PINTU DALAM KABIN", "Ikut Bergerak Naik-Turun", (56, 189, 248)),
                Callout3D(0.24 * d, 0.43 * d, (0.0, 2.95, 0.20), (340, 470), "BAHAYA RUANG LUNCUR", "Terkunci Saat Kabin Jauh!", (239, 68, 68)),
                Callout3D(0.46 * d, 0.68 * d, (-0.12, 3.65, 0.08), (330, 460), "BILAH KOPLING KABIN", "Menyodok Roda Pintu Luar", (34, 211, 238)),
                Callout3D(0.55 * d, 0.78 * d, (0.10, 3.82, 0.16), (730, 560), "KAIT INTERLOCK TERBUKA", "Kedua Pintu Geser Serempak", (34, 197, 94)),
            ],
            "KT-R02": [
                Callout3D(0.05 * d, 0.20 * d, (-1.1, 1.85, 0.1), (310, 470), "GEDUNG PENDEK KAKU", "Ayunan Cepat • Periode Pendek", (245, 158, 11)),
                Callout3D(0.08 * d, 0.21 * d, (1.1, 2.65, 0.1), (750, 560), "MENARA TINGGI LENTUR", "Ayunan Lambat • Lebar", (56, 189, 248)),
                Callout3D(0.24 * d, 0.46 * d, (0.0, 2.25, 0.4), (350, 450), "SEISMIC POUNDING!", "Tabrakan Beda Irama Gempa", (239, 68, 68)),
                Callout3D(0.50 * d, 0.72 * d, (0.0, 1.98, 0.25), (340, 470), "CELAH PEMISAH GEMPA", "Bebas Mengayun Tanpa Bentur", (34, 197, 94)),
                Callout3D(0.58 * d, 0.78 * d, (0.0, 1.95, 0.45), (730, 580), "PELAT LIPAT AKORDEON", "Menutup Celah Tetap Lentur", (250, 204, 21)),
            ],
            "KT-R03": [
                Callout3D(0.05 * d, 0.21 * d, (0.26, 1.02, 0.15), (340, 460), "SAMBUNGAN UJUNG JEMBATAN", "Sumber Bunyi 'Tok-Tok'", (56, 189, 248)),
                Callout3D(0.24 * d, 0.45 * d, (0.32, 0.95, 0.0), (350, 470), "TANPA CELAH MUAI", "Panas Siang Retakkan Beton!", (239, 68, 68)),
                Callout3D(0.48 * d, 0.70 * d, (0.18, 0.98, -0.15), (320, 450), "EXPANSION JOINT BAJA", "Jari Baja Saling Menyilang", (250, 204, 21)),
                Callout3D(0.56 * d, 0.78 * d, (0.32, 0.98, 0.15), (740, 570), "BEBAS MEMUAI & MENYUSUT", "Tetap Kuat Menopang Truk", (34, 197, 94)),
            ],
            "KT-R04": [
                Callout3D(0.05 * d, 0.22 * d, (0.0, 0.15, 0.0), (340, 460), "TUTUP MANHOLE MENONJOL", "Cincin Aspal Tepi Ambles!", (245, 158, 11)),
                Callout3D(0.26 * d, 0.49 * d, (0.0, -0.55, 0.0), (320, 470), "CEROBONG BETON KAKU", "Bertumpu Pondasi • Tak Turun", (56, 189, 248)),
                Callout3D(0.32 * d, 0.51 * d, (0.72, -0.35, 0.0), (740, 570), "TANAH URUG IKUT MEMADAT", "Ditekan Jutaan Roda Truk", (239, 68, 68)),
                Callout3D(0.54 * d, 0.78 * d, (-0.42, -0.95, 0.30), (690, 490), "EROSI REMBESAN AIR", "Butiran Halus Hanyut di Bawah", (34, 211, 238)),
            ],
            "KT-R05": [
                Callout3D(0.05 * d, 0.22 * d, (0.0, 0.45, 0.0), (340, 460), "REL LAS MENERUS (CWR)", "Mulus Tanpa Celah Sambungan", (56, 189, 248)),
                Callout3D(0.26 * d, 0.48 * d, (0.0, 0.42, 0.35), (340, 450), "TRACK BUCKLING!", "Rel Melipat Akibat Muai Terik", (239, 68, 68)),
                Callout3D(0.52 * d, 0.74 * d, (-0.8, 0.55, 0.65), (320, 470), "TARIKAN SUHU NETRAL", "Tegangan Pratarik Hidrolik", (250, 204, 21)),
                Callout3D(0.58 * d, 0.78 * d, (0.8, 0.25, 0.85), (730, 570), "BAHU BATU BALAS LEBAR", "Mengunci Bantalan Beton", (34, 197, 94)),
            ],
            "KT-R06": [
                Callout3D(0.05 * d, 0.22 * d, (-0.95, 3.65, 0.2), (330, 460), "HEMBUSAN ANGIN TOPAN", "Membuat Puncak Bergoyang", (56, 189, 248)),
                Callout3D(0.25 * d, 0.44 * d, (0.25, 3.55, 0.0), (720, 490), "GOYANGAN PUNCAK MENARA", "Memicu Mabuk & Mual", (239, 68, 68)),
                Callout3D(0.48 * d, 0.74 * d, (0.0, 3.52, 0.35), (330, 450), "TUNED MASS DAMPER", "Bandul Ratusan Ton Lawan Arah", (250, 204, 21)),
                Callout3D(0.56 * d, 0.78 * d, (0.45, 3.05, 0.22), (730, 580), "PISTON HIDROLIK PEREDAM", "Ubah Energi Goyang Jadi Panas", (34, 197, 94)),
            ],
            "KT-R07": [
                Callout3D(0.05 * d, 0.21 * d, (0.0, 1.95, 0.25), (340, 460), "BANTALAN HITAM JEMBATAN", "Menyangga Gelagar Ribuan Ton", (250, 204, 21)),
                Callout3D(0.24 * d, 0.45 * d, (0.65, 1.78, 0.35), (340, 470), "TANPA BANTALAN LENTUR", "Kepala Tiang Beton Gompal!", (239, 68, 68)),
                Callout3D(0.49 * d, 0.73 * d, (-0.25, 1.98, 0.42), (320, 450), "ELASTOMERIC BEARING", "Kue Lapis Karet & Pelat Baja", (56, 189, 248)),
                Callout3D(0.57 * d, 0.78 * d, (0.28, 1.98, 0.42), (730, 570), "KAKU TEGAK • LENTUR GESER", "Tahan Beban & Muai Panas", (34, 197, 94)),
            ],
            "KT-R08": [
                Callout3D(0.05 * d, 0.19 * d, (0.0, 1.95, 0.25), (340, 460), "LANTAI MEKANIKAL TENGAH", "Jantung Zona Air Pencakar Langit", (56, 189, 248)),
                Callout3D(0.22 * d, 0.46 * d, (-0.35, 0.75, 0.28), (330, 470), "TEKANAN HIDROSTATIS TINGGI", "Pipa Lurus 200m Jebolkan Kran!", (239, 68, 68)),
                Callout3D(0.50 * d, 0.73 * d, (-0.15, 1.88, 0.35), (320, 450), "BREAK TANK (TANGKI ANTARA)", "Reset Tekanan Kolom Air ke Nol", (34, 211, 238)),
                Callout3D(0.58 * d, 0.78 * d, (0.22, 1.02, 0.28), (730, 570), "KATUP PRV PENURUN TEKANAN", "Aliran Kran Aman & Merata", (34, 197, 94)),
            ],
        }
        return table[ep]

    def _build_static(self) -> None:
        ep = self.ep_code
        if ep == "KT-R01":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-10, -10, 10, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
                make_beveled_box(4.8, 0.06, 3.2, hex_rgb("#E2E8F0"), bevel=0.01).transformed(pos=(0.0, 0.03, 1.4)),
                make_beveled_box(1.45, 4.4, 0.28, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(-1.65, 2.2, 0.15)),
                make_beveled_box(1.45, 4.4, 0.28, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(1.65, 2.2, 0.15)),
                make_beveled_box(2.0, 0.24, 0.32, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.0, 2.15, 0.15)),
                make_beveled_box(2.0, 0.24, 0.32, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(0.0, 4.25, 0.15)),
                make_beveled_box(0.42, 0.16, 0.06, hex_rgb("#0F172A"), bevel=0.015).transformed(pos=(0.0, 2.16, 0.32)),
                make_beveled_box(0.24, 0.08, 0.07, hex_rgb("#22C55E"), bevel=0.01, emission=2.8).transformed(pos=(0.0, 2.16, 0.33)),
                *[make_beveled_box(0.08, 4.6, 0.08, hex_rgb("#475569"), bevel=0.01).transformed(pos=(sx, 2.3, sz)) for sx in (-0.98, 0.98) for sz in (-0.85, 0.02)],
                make_cylinder(0.28, 0.28, 0.16, hex_rgb("#F59E0B"), segments=18, roughness=0.25).transformed(pos=(0.0, 4.55, -0.42), rot=(0.0, 0.0, math.pi * 0.5)),
            ])
        elif ep == "KT-R02":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, 0.0, hex_rgb("#263244"), flags=FLAG_GROUND, subdiv=2),
                make_beveled_box(10.0, 0.06, 2.2, hex_rgb("#475569"), bevel=0.01).transformed(pos=(0.0, 0.03, 1.55)),
                self.props.tree(-3.1, 1.2, scale=0.95),
                self.props.tree(3.1, 1.2, scale=0.95),
                self.props.street_lamp(-2.4, 1.8, lit=1.0),
                self.props.street_lamp(2.4, 1.8, lit=1.0),
            ])
        elif ep == "KT-R03":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, -1.35, hex_rgb("#0E3A53"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.midrise_tower(-3.2, -4.6, w=2.4, d=1.8, floors=4, wall_hex="#E2E8F0", accent_hex="#0284C7").transformed(pos=(0.0, -1.35, 0.0)),
                ArchBuilderV3.midrise_tower(2.8, -4.8, w=2.6, d=1.8, floors=5, wall_hex="#F1F5F9", accent_hex="#10B981").transformed(pos=(0.0, -1.35, 0.0)),
                make_beveled_box(2.6, 2.25, 2.2, hex_rgb("#64748B"), bevel=0.04).transformed(pos=(1.65, -0.22, 0.0)),
                make_cylinder(0.38, 0.44, 2.15, hex_rgb("#94A3B8"), segments=16).transformed(pos=(-1.95, -0.28, 0.0)),
            ])
        elif ep == "KT-R04":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, -1.55, hex_rgb("#3B2F2F"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.shophouse_ruko(-2.4, -3.6, wall_hex="#F5EFE6", roof_hex="#C2593F", awning_hex="#0284C7"),
                ArchBuilderV3.shophouse_ruko(2.2, -3.6, wall_hex="#E2E8F0", roof_hex="#334155", awning_hex="#F59E0B"),
                make_beveled_box(1.8, 0.24, 1.6, hex_rgb("#64748B"), bevel=0.02).transformed(pos=(0.0, -1.42, 0.0)),
                make_cylinder(0.42, 0.42, 1.48, hex_rgb("#94A3B8"), segments=20).transformed(pos=(0.0, -0.64, 0.0)),
                make_cylinder(0.44, 0.44, 0.07, hex_rgb("#334155"), segments=20, roughness=0.35).transformed(pos=(0.0, 0.12, 0.0)),
                make_ring_collar(0.22, 0.38, 0.14, 0.17, hex_rgb("#F59E0B"), segments=18, emission=0.8),
                PrecisionMechV3.flanged_pipe(5.6, 0.16, pipe_hex="#475569").transformed(pos=(0.0, -1.05, 0.0)),
            ])
        elif ep == "KT-R05":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, 0.0, hex_rgb("#2D3B2D"), flags=FLAG_GROUND, subdiv=2),
                *[self.props.tree(tx, -3.2, scale=1.1) for tx in (-3.2, -1.1, 1.4, 3.3)],
                ArchBuilderV3.industrial_portal_hall(-2.8, -4.2, w=2.2, h=1.5, d=1.5, frame_hex="#0284C7"),
            ])
        elif ep == "KT-R06":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.midrise_tower(-2.9, -2.8, w=1.8, d=1.6, floors=4, wall_hex="#CBD5E1", accent_hex="#0284C7"),
                ArchBuilderV3.midrise_tower(2.9, -2.8, w=1.8, d=1.6, floors=4, wall_hex="#E2E8F0", accent_hex="#10B981"),
            ])
        elif ep == "KT-R07":
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
                make_cylinder(0.52, 0.58, 1.45, hex_rgb("#94A3B8"), segments=20).transformed(pos=(0.0, 0.72, 0.0)),
                make_beveled_box(2.35, 0.42, 1.55, hex_rgb("#CBD5E1"), bevel=0.04).transformed(pos=(0.0, 1.58, 0.0)),
                ArchBuilderV3.midrise_tower(-3.2, -4.2, w=2.4, d=1.8, floors=4, wall_hex="#E2E8F0", accent_hex="#38BDF8"),
            ])
        else:  # KT-R08
            self.static_mesh = Mesh.merge([
                make_flat_quad_xz(-12, -10, 12, 10, 0.0, hex_rgb("#1E293B"), flags=FLAG_GROUND, subdiv=2),
                make_beveled_box(2.65, 4.55, 0.16, hex_rgb("#CBD5E1"), bevel=0.03).transformed(pos=(0.0, 2.28, -0.75)),
                *[make_beveled_box(2.68, 0.10, 1.45, hex_rgb("#64748B"), bevel=0.015).transformed(pos=(0.0, fy, -0.08)) for fy in (0.05, 1.45, 2.45, 3.85, 4.52)],
                make_beveled_box(0.14, 4.55, 1.45, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(-1.32, 2.28, -0.08)),
                make_beveled_box(0.14, 4.55, 1.45, hex_rgb("#94A3B8"), bevel=0.02).transformed(pos=(1.32, 2.28, -0.08)),
                make_cylinder(0.48, 0.48, 0.56, hex_rgb("#0284C7"), segments=18).transformed(pos=(-0.55, 4.84, -0.10)),
            ])

    def render_3d_only(self, t: float) -> Tuple[np.ndarray, Tuple[float, float, float], Tuple[float, float, float], float, int]:
        r = max(0.0, min(1.0, t / self.total_dur))
        seg_idx = self._seg_idx(r)
        cta_w = smoothstep(self.cta_start, self.cta_start + 1.1, t)
        meshes: List[Mesh] = [self.static_mesh]
        bg_top, bg_bot = hex_rgb("#0A1628"), hex_rgb("#1E3A5F")
        fov = 43.5
        ep = self.ep_code

        if ep == "KT-R01":
            in_myth = 0.22 <= r < 0.44
            car_y = 0.18 if in_myth else lerp(0.25, 2.22, smoothstep(0.44, 0.58, r)) if r >= 0.44 else 2.22
            aligned = 1.0 if abs(car_y - 2.22) < 0.06 else 0.0
            door_open = (0.65 * smoothstep(0.02, 0.16, r) if r < 0.22 else 0.72 * smoothstep(0.60, 0.74, r)) * aligned

            meshes.append(make_tube_along_path([(-0.18, car_y + 1.78, -0.35), (-0.18, 4.55, -0.35)], 0.018, hex_rgb("#CBD5E1"), sides=6))
            meshes.append(make_tube_along_path([(0.18, car_y + 1.78, -0.35), (0.18, 4.55, -0.35)], 0.018, hex_rgb("#CBD5E1"), sides=6))
            # Open Cutaway Elevator Car (rear stainless cabin wall + floor + glowing LED ceiling) so passenger inside is 100% visible!
            meshes.append(make_beveled_box(1.62, 1.76, 0.08, hex_rgb("#334155"), bevel=0.02, roughness=0.25).transformed(pos=(0.0, car_y + 0.88, -0.82)))
            meshes.append(make_beveled_box(1.62, 0.10, 0.84, hex_rgb("#475569"), bevel=0.015).transformed(pos=(0.0, car_y + 0.02, -0.42)))
            meshes.append(make_beveled_box(1.58, 0.08, 0.80, hex_rgb("#F8FAFC"), bevel=0.01, emission=1.8).transformed(pos=(0.0, car_y + 1.72, -0.42)))
            meshes.append(HumanRigV3.build(pos=(-0.22, car_y + 0.04, -0.42), rot_y=0.15, scale=0.88, role="civilian_f", jacket_hex="#EC4899", hair_hex="#0D9488", wave_cta=cta_w, time_s=t))

            for sx in (-1.0, 1.0):
                ix = sx * (0.38 + 0.44 * door_open)
                meshes.append(make_beveled_box(0.72, 1.66, 0.04, hex_rgb("#E2E8F0"), bevel=0.01, roughness=0.20).transformed(pos=(ix, car_y + 0.85, -0.02)))
            vane_x = -(0.08 + 0.44 * door_open)
            meshes.append(make_beveled_box(0.06, 0.42, 0.14, hex_rgb("#22D3EE"), bevel=0.01, emission=2.6).transformed(pos=(vane_x, car_y + 1.48, 0.06)))

            for sx in (-1.0, 1.0):
                ox = sx * (0.38 + 0.44 * door_open)
                meshes.append(make_beveled_box(0.72, 1.66, 0.05, hex_rgb("#D97706"), bevel=0.01, roughness=0.28).transformed(pos=(ox, 3.07, 0.16)))
            unlock_ang = 0.58 * smoothstep(0.56, 0.63, r) if r >= 0.44 else (0.55 if r < 0.22 else 0.0)
            hook_col = hex_rgb("#22C55E") if unlock_ang > 0.25 else hex_rgb("#EF4444")
            meshes.append(make_beveled_box(0.34, 0.09, 0.08, hook_col, bevel=0.015, emission=2.8).transformed(pos=(vane_x + 0.14, 3.82, 0.16), rot=(0.0, 0.0, unlock_ang)))
            meshes.append(make_cylinder(0.05, 0.05, 0.12, hex_rgb("#FACC15"), segments=12, emission=2.2).transformed(pos=(vane_x - 0.02, 3.72, 0.14), rot=(math.pi * 0.5, 0.0, 0.0)))

            if in_myth:
                meshes.append(self.props.red_cross.transformed(pos=(0.0, 2.95, 0.45), scale=0.68, rot=(0.0, t * 1.8, 0.0)))
            meshes.append(HumanRigV3.build(pos=(1.42, 0.06, 1.55), rot_y=-0.38, scale=1.02, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.22:
                cam_pos, cam_tgt = lerp3((1.35, 2.85, 5.55), (0.65, 2.95, 4.75), smoothstep(0.0, 0.22, r)), (0.0, 2.75, 0.1)
            elif r < 0.44:
                cam_pos, cam_tgt = lerp3((0.65, 2.95, 4.75), (-0.85, 2.35, 5.95), smoothstep(0.22, 0.32, r)), (0.0, 2.15, 0.0)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((-0.85, 2.35, 5.95), (0.15, 3.55, 3.45), smoothstep(0.44, 0.55, r)), (0.0, 3.45, 0.10)
            else:
                cam_pos, cam_tgt = lerp3((0.15, 3.55, 3.45), (0.35, 2.35, 6.35), smoothstep(0.80, 0.88, r)), (0.2, 2.15, 0.2)

        elif ep == "KT-R02":
            quake = smoothstep(0.18, 0.28, r) * (1.0 - 0.5 * cta_w)
            safe_gap = smoothstep(0.48, 0.58, r)
            sway_short = quake * 0.14 * math.sin(t * 7.8)
            sway_tall = quake * 0.28 * math.sin(t * 4.3 + 1.9)
            sep = lerp(0.06, 0.62, safe_gap)

            left_bldg = ArchBuilderV3.midrise_tower(0.0, 0.0, w=1.75, d=1.55, floors=3, wall_hex="#F5EFE6", accent_hex="#EA580C")
            right_bldg = ArchBuilderV3.midrise_tower(0.0, 0.0, w=1.75, d=1.55, floors=6, wall_hex="#DCE8F2", accent_hex="#0284C7")
            lx = -0.92 - sep * 0.5 + sway_short
            rx = 0.92 + sep * 0.5 + sway_tall
            meshes.append(left_bldg.transformed(pos=(lx, 0.0, -0.15), rot=(0.0, 0.0, -sway_short * 0.14)))
            meshes.append(right_bldg.transformed(pos=(rx, 0.0, -0.15), rot=(0.0, 0.0, -sway_tall * 0.12)))

            gap_mid = (lx + rx) * 0.5
            gap_w = max(0.14, (rx - 0.88) - (lx + 0.88))
            if safe_gap > 0.25:
                for pk in range(5):
                    px = (lx + 0.88) + (pk + 0.5) * (gap_w / 5.0)
                    meshes.append(make_beveled_box(gap_w / 5.5, 0.16, 0.95, hex_rgb("#22C55E") if pk % 2 == 0 else hex_rgb("#CBD5E1"), bevel=0.01, emission=1.4).transformed(pos=(px, 1.95, 0.15)))
            elif 0.22 <= r < 0.48 and abs((rx - 0.88) - (lx + 0.88)) < 0.22:
                meshes.append(make_ring_collar(0.15, 0.42, -0.04, 0.04, hex_rgb("#EF4444"), segments=18, emission=4.5).transformed(pos=(gap_mid, 2.25, 0.55), rot=(math.pi * 0.5, 0.0, 0.0)))
                meshes.append(self.props.red_cross.transformed(pos=(gap_mid, 2.85, 0.55), scale=0.68, rot=(0.0, t * 2.0, 0.0)))

            meshes.append(self.props.car_stylized((-1.6, 0.06, 1.55), body_hex="#F59E0B"))
            meshes.append(HumanRigV3.build(pos=(1.35, 0.06, 1.65), rot_y=-0.35, scale=1.02, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.22:
                cam_pos, cam_tgt = (0.35, 2.35, 6.55), (0.0, 2.05, 0.0)
            elif r < 0.48:
                cam_pos, cam_tgt = lerp3((0.35, 2.35, 6.55), (-0.25, 2.55, 5.35), smoothstep(0.22, 0.32, r)), (gap_mid, 2.25, 0.1)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((-0.25, 2.55, 5.35), (0.15, 2.35, 4.25), smoothstep(0.48, 0.58, r)), (gap_mid, 1.98, 0.15)
            else:
                cam_pos, cam_tgt = lerp3((0.15, 2.35, 4.25), (0.0, 2.45, 6.85), smoothstep(0.80, 0.88, r)), (0.0, 2.05, 0.0)

        elif ep == "KT-R03":
            therm = 0.5 + 0.5 * math.sin(t * 2.4)
            no_joint = 0.22 <= r < 0.46
            exp_dx = 0.0 if no_joint else (0.18 * therm)
            meshes.append(make_beveled_box(3.45, 0.52, 2.05, hex_rgb("#94A3B8"), bevel=0.03).transformed(pos=(-1.55 + exp_dx * 0.5, 0.65, 0.0)))
            meshes.append(make_beveled_box(3.45, 0.08, 2.02, hex_rgb("#1E293B"), bevel=0.01).transformed(pos=(-1.55 + exp_dx * 0.5, 0.94, 0.0)))
            meshes.append(make_beveled_box(2.55, 0.08, 2.02, hex_rgb("#1E293B"), bevel=0.01).transformed(pos=(1.65, 0.94, 0.0)))

            if no_joint:
                meshes.append(make_beveled_box(0.18, 0.45, 2.08, hex_rgb("#EF4444"), bevel=0.01, emission=3.4).transformed(pos=(0.32, 0.82, 0.0)))
                meshes.append(self.props.red_cross.transformed(pos=(0.32, 1.65, 0.0), scale=0.65, rot=(0.0, t * 2.0, 0.0)))
            else:
                for fk in range(7):
                    fz = -0.78 + fk * 0.26
                    meshes.append(make_beveled_box(0.36, 0.05, 0.10, hex_rgb("#38BDF8"), bevel=0.008, emission=1.4).transformed(pos=(0.14 + exp_dx * 0.5, 0.98, fz - 0.05)))
                    meshes.append(make_beveled_box(0.36, 0.05, 0.10, hex_rgb("#FACC15"), bevel=0.008, emission=1.4).transformed(pos=(0.36, 0.98, fz + 0.05)))

            trk_x = ((t * 1.45) % 5.4) - 2.7
            meshes.append(V4HeroModels.heavy_truck(pos=(trk_x, 0.98, -0.32), scale=0.78, wheel_spin=t * 6.0))
            if abs(trk_x - 0.25) < 0.45 and not no_joint:
                meshes.append(make_ring_collar(0.16, 0.36, -0.02, 0.02, hex_rgb("#22D3EE"), segments=18, emission=3.6).transformed(pos=(0.26, 1.04, 0.25)))
            meshes.append(HumanRigV3.build(pos=(1.55, 0.98, 0.82), rot_y=-0.45, scale=0.95, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.22:
                cam_pos, cam_tgt = (1.65, 2.45, 5.55), (0.15, 1.05, 0.0)
            elif r < 0.46:
                cam_pos, cam_tgt = (-0.45, 1.95, 4.75), (0.28, 0.92, 0.0)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((-0.45, 1.95, 4.75), (0.28, 2.25, 2.95), smoothstep(0.46, 0.58, r)), (0.26, 0.98, 0.0)
            else:
                cam_pos, cam_tgt = lerp3((0.28, 2.25, 2.95), (0.85, 2.35, 5.75), smoothstep(0.80, 0.88, r)), (0.25, 1.15, 0.0)

        elif ep == "KT-R04":
            settle = 0.22 * smoothstep(0.18, 0.55, r)
            for sx in (-1.95, 1.95):
                meshes.append(make_beveled_box(1.85, 0.16, 1.85, hex_rgb("#1E293B"), bevel=0.015).transformed(pos=(sx, 0.04, 0.0)))
                meshes.append(make_beveled_box(1.85, 1.35, 1.80, hex_rgb("#785A3C"), bevel=0.02).transformed(pos=(sx, -0.72, 0.0)))
            for sx in (-0.72, 0.72):
                meshes.append(make_beveled_box(0.56, 0.15, 1.82, hex_rgb("#334155"), bevel=0.015).transformed(pos=(sx, 0.04 - settle, 0.0), rot=(0.0, 0.0, sx * settle * 0.35)))
                meshes.append(make_beveled_box(0.56, 1.18 - settle * 0.5, 1.76, hex_rgb("#9A7B56"), bevel=0.02).transformed(pos=(sx, -0.68 - settle * 0.4, 0.0)))

            if 0.48 <= r < 0.80:
                meshes.append(self.props.pulse_stream_along_path([(-0.65, -0.55, 0.55), (-0.42, -1.02, 0.35), (0.55, -1.05, 0.25)], 7, 2.4, t, radius=0.055, color_hex="#38BDF8", emission=3.4))

            trk_x = ((t * 1.3) % 5.6) - 2.8
            meshes.append(V4HeroModels.heavy_truck(pos=(trk_x, 0.12, -0.45), scale=0.72, wheel_spin=t * 5.5))
            meshes.append(HumanRigV3.build(pos=(1.45, 0.12, 0.72), rot_y=-0.42, scale=0.98, role="rider_helmet", jacket_hex="#EF4444", point_arm=1.0 - cta_w, wave_cta=cta_w, time_s=t))

            if r < 0.24:
                cam_pos, cam_tgt = (1.15, 1.75, 5.05), (0.0, 0.15, 0.0)
            elif r < 0.52:
                cam_pos, cam_tgt = lerp3((1.15, 1.75, 5.05), (0.0, 0.45, 4.45), smoothstep(0.24, 0.35, r)), (0.0, -0.35, 0.0)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((0.0, 0.45, 4.45), (-0.35, -0.05, 3.75), smoothstep(0.52, 0.62, r)), (-0.15, -0.65, 0.15)
            else:
                cam_pos, cam_tgt = lerp3((-0.35, -0.05, 3.75), (0.55, 1.45, 5.35), smoothstep(0.80, 0.88, r)), (0.15, 0.05, 0.0)

        elif ep == "KT-R05":
            buckle = smoothstep(0.24, 0.36, r) * (1.0 - smoothstep(0.48, 0.58, r))
            safe_ballast = smoothstep(0.50, 0.60, r)
            bal_w = lerp(1.35, 2.35, safe_ballast)
            meshes.append(make_beveled_box(7.5, 0.24, bal_w, hex_rgb("#64748B") if safe_ballast < 0.5 else hex_rgb("#94A3B8"), bevel=0.04).transformed(pos=(0.0, 0.12, 0.0)))

            pts_r1, pts_r2 = [], []
            for sk in range(15):
                sx = -3.15 + sk * 0.45
                lat = buckle * 0.52 * math.sin(sx * 1.45) * math.exp(-0.22 * sx * sx)
                meshes.append(make_beveled_box(0.16, 0.09, 1.25, hex_rgb("#CBD5E1"), bevel=0.01).transformed(pos=(sx, 0.26, lat)))
                pts_r1.append((sx, 0.34, lat - 0.38))
                pts_r2.append((sx, 0.34, lat + 0.38))
            rail_col = lerp3(hex_rgb("#94A3B8"), hex_rgb("#FF4500"), buckle)
            meshes.append(make_tube_along_path(pts_r1, 0.042, rail_col, sides=8, emission=3.2 * buckle))
            meshes.append(make_tube_along_path(pts_r2, 0.042, rail_col, sides=8, emission=3.2 * buckle))

            if buckle > 0.25:
                meshes.append(self.props.red_cross.transformed(pos=(0.0, 1.35, 0.0), scale=0.68, rot=(0.0, t * 2.0, 0.0)))
                meshes.append(make_3d_double_arrow((-1.4, 0.62, 0.0), (1.4, 0.62, 0.0), hex_rgb("#FACC15"), shaft_r=0.038, emission=3.4))
            else:
                tr_x = -2.2 + 2.8 * ((t * 0.32) % 1.0)
                meshes.append(V4HeroModels.modern_train(pos=(tr_x, 0.34, 0.0), scale=0.82))
                if safe_ballast > 0.4:
                    meshes.append(make_3d_double_arrow((-1.8, 0.55, 0.72), (1.8, 0.55, 0.72), hex_rgb("#22C55E"), shaft_r=0.035, emission=3.0))

            meshes.append(HumanRigV3.build(pos=(1.35, 0.0, 1.48), rot_y=-0.42, scale=1.02, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.24:
                cam_pos, cam_tgt = (1.85, 2.15, 5.35), (0.0, 0.65, 0.0)
            elif r < 0.50:
                cam_pos, cam_tgt = lerp3((1.85, 2.15, 5.35), (0.0, 2.85, 4.25), smoothstep(0.24, 0.34, r)), (0.0, 0.35, 0.0)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((0.0, 2.85, 4.45), (-0.45, 1.85, 5.45), smoothstep(0.50, 0.60, r)), (0.25, 0.55, 0.0)
            else:
                cam_pos, cam_tgt = lerp3((-0.45, 1.85, 5.45), (0.65, 2.05, 5.85), smoothstep(0.80, 0.88, r)), (0.25, 0.75, 0.0)

        elif ep == "KT-R06":
            tmd_active = smoothstep(0.42, 0.54, r)
            bldg_sway = (0.24 if tmd_active < 0.5 else 0.06) * math.sin(t * 3.6)
            tower_parts = [
                ArchBuilderV3.midrise_tower(0.0, 0.0, w=2.15, d=1.85, floors=2, wall_hex="#DCE8F2", accent_hex="#0284C7"),
                # Rear dark panoramic glass wall behind the open Crown Observation Damper Chamber (y = 2.55 .. 4.35)!
                make_beveled_box(2.10, 1.72, 0.08, hex_rgb("#0F172A"), bevel=0.02).transformed(pos=(0.0, 3.48, -0.88)),
                make_beveled_box(2.22, 0.16, 1.92, hex_rgb("#334155"), bevel=0.02).transformed(pos=(0.0, 2.58, 0.0)),
                make_beveled_box(2.22, 0.18, 1.92, hex_rgb("#0284C7"), bevel=0.03).transformed(pos=(0.0, 4.38, 0.0)),
                make_cylinder(0.06, 0.02, 0.65, hex_rgb("#38BDF8"), segments=12, emission=2.0).transformed(pos=(0.0, 4.75, 0.0)),
                *[make_beveled_box(0.12, 1.78, 0.12, hex_rgb("#94A3B8"), bevel=0.015).transformed(pos=(cx, 3.48, cz)) for cx in (-1.02, 1.02) for cz in (-0.86, 0.86)],
            ]
            pend_x = (-0.36 * math.sin(t * 3.6 - 1.45)) * tmd_active
            sphere_y = 3.48
            for cab_x in (-0.32, 0.32):
                tower_parts.append(make_tube_along_path([(cab_x, 4.32, 0.0), (pend_x + cab_x * 0.45, sphere_y + 0.32, 0.0)], 0.022, hex_rgb("#E2E8F0"), sides=6))
            tower_parts.append(make_icosphere(0.42, hex_rgb("#F59E0B"), subdivisions=2, roughness=0.20, emission=0.8 * tmd_active).transformed(pos=(pend_x, sphere_y, 0.0)))
            tower_parts.append(make_ring_collar(0.38, 0.46, -0.04, 0.04, hex_rgb("#FACC15"), segments=20, emission=1.8).transformed(pos=(pend_x, sphere_y, 0.0)))
            for dx in (-0.58, 0.58):
                tower_parts.append(make_tube_along_path([(dx, 2.76, 0.18), (pend_x * 0.7, sphere_y - 0.34, 0.18)], 0.045, hex_rgb("#EF4444"), sides=8, emission=1.6 * tmd_active))

            meshes.append(Mesh.merge(tower_parts).transformed(pos=(bldg_sway, 0.0, 0.0), rot=(0.0, 0.0, -bldg_sway * 0.08)))
            meshes.append(self.props.pulse_stream_along_path([(-2.8, 3.65, 0.4), (-1.15, 3.65, 0.4)], 6, 3.2, t, radius=0.065, color_hex="#38BDF8", emission=3.2))
            meshes.append(HumanRigV3.build(pos=(1.42, 0.0, 1.65), rot_y=-0.38, scale=1.02, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.24:
                cam_pos, cam_tgt = (0.45, 2.65, 6.95), (0.0, 2.45, 0.0)
            elif r < 0.46:
                cam_pos, cam_tgt = (-0.55, 3.45, 5.35), (0.0, 3.35, 0.0)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((-0.55, 3.45, 5.35), (0.0, 3.55, 3.65), smoothstep(0.46, 0.56, r)), (0.0, 3.45, 0.0)
            else:
                cam_pos, cam_tgt = lerp3((0.0, 3.55, 3.65), (0.35, 2.55, 6.75), smoothstep(0.80, 0.88, r)), (0.15, 2.35, 0.0)

        elif ep == "KT-R07":
            rigid_fail = 0.22 <= r < 0.46
            shear_dx = 0.0 if rigid_fail else 0.14 * math.sin(t * 2.8)
            comp_dy = 0.0 if rigid_fail else 0.025 * (0.5 + 0.5 * math.sin(t * 5.6))

            if rigid_fail:
                meshes.append(make_beveled_box(5.8, 0.68, 1.52, hex_rgb("#94A3B8"), bevel=0.03).transformed(pos=(0.0, 2.14, 0.0)))
                meshes.append(make_beveled_box(0.55, 0.28, 1.58, hex_rgb("#EF4444"), bevel=0.01, emission=3.8).transformed(pos=(0.75, 1.72, 0.0), rot=(0.0, 0.0, 0.35)))
                meshes.append(self.props.red_cross.transformed(pos=(0.75, 2.75, 0.55), scale=0.68, rot=(0.0, t * 2.0, 0.0)))
            else:
                for lk in range(9):
                    ly = 1.82 + lk * (0.042 - comp_dy * 0.004)
                    lx = shear_dx * (lk / 8.0)
                    is_steel = (lk % 2 == 1)
                    col = hex_rgb("#38BDF8") if is_steel else hex_rgb("#0F172A")
                    meshes.append(make_beveled_box(0.88, 0.036, 0.92, col, bevel=0.006, emission=1.6 if is_steel else 0.0, roughness=0.20 if is_steel else 0.75).transformed(pos=(lx, ly, 0.18)))
                meshes.append(make_beveled_box(5.8, 0.68, 1.52, hex_rgb("#94A3B8"), bevel=0.03).transformed(pos=(shear_dx, 2.52 - comp_dy, 0.0)))

            trk_x = ((t * 1.5) % 5.6) - 2.8
            meshes.append(V4HeroModels.heavy_truck(pos=(trk_x, 2.86 if not rigid_fail else 2.48, 0.0), scale=0.76, wheel_spin=t * 6.0))
            meshes.append(HumanRigV3.build(pos=(1.38, 0.0, 1.45), rot_y=-0.38, scale=1.02, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.22:
                cam_pos, cam_tgt = (1.35, 1.85, 5.75), (0.0, 2.05, 0.0)
            elif r < 0.46:
                cam_pos, cam_tgt = (-0.65, 2.05, 4.55), (0.35, 1.85, 0.0)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((-0.65, 2.05, 4.55), (0.05, 1.98, 2.75), smoothstep(0.46, 0.56, r)), (0.0, 1.98, 0.18)
            else:
                cam_pos, cam_tgt = lerp3((0.05, 1.98, 2.75), (0.55, 1.85, 5.85), smoothstep(0.80, 0.88, r)), (0.15, 1.85, 0.0)

        else:  # KT-R08
            burst_mode = 0.20 <= r < 0.48
            if burst_mode:
                meshes.append(PrecisionMechV3.flanged_pipe(4.30, 0.075, pipe_hex="#EF4444").transformed(pos=(-0.55, 2.50, 0.15), rot=(0.0, 0.0, math.pi * 0.5)))
                meshes.append(PrecisionMechV3.pressure_gauge(radius=0.22, needle_norm=0.95, danger=True).transformed(pos=(-0.22, 0.78, 0.28)))
                meshes.append(self.props.pulse_stream_along_path([(-0.48, 0.48, 0.22), (0.65, 0.85, 0.65)], 7, 3.8, t, radius=0.075, color_hex="#38BDF8", emission=3.8))
                meshes.append(self.props.red_cross.transformed(pos=(0.15, 0.95, 0.55), scale=0.65, rot=(0.0, t * 2.0, 0.0)))
            else:
                meshes.append(PrecisionMechV3.flanged_pipe(2.40, 0.065, pipe_hex="#0EA5E9").transformed(pos=(-0.55, 3.45, 0.15), rot=(0.0, 0.0, math.pi * 0.5)))
                meshes.append(make_beveled_box(1.15, 0.62, 0.72, hex_rgb("#0284C7"), bevel=0.04, emission=0.8).transformed(pos=(-0.15, 1.84, 0.08)))
                meshes.append(PrecisionMechV3.flanged_pipe(1.14, 0.065, pipe_hex="#22C55E").transformed(pos=(0.15, 0.95, 0.15), rot=(0.0, 0.0, math.pi * 0.5)))
                meshes.append(make_ring_collar(0.10, 0.18, -0.02, 0.02, hex_rgb("#FACC15"), segments=16, emission=1.4).transformed(pos=(0.15, 1.05, 0.24), rot=(math.pi * 0.5, 0.0, 0.0)))
                meshes.append(PrecisionMechV3.pressure_gauge(radius=0.20, needle_norm=0.40, danger=False).transformed(pos=(0.48, 0.85, 0.28)))
                meshes.append(self.props.pulse_stream_along_path([(-0.48, 3.15, 0.22), (0.35, 2.85, 0.22)], 4, 2.2, t, radius=0.042, color_hex="#38BDF8", emission=2.6))
                meshes.append(self.props.pulse_stream_along_path([(0.22, 0.58, 0.22), (0.85, 0.38, 0.22)], 4, 2.2, t, radius=0.042, color_hex="#22C55E", emission=2.6))

            meshes.append(HumanRigV3.build(pos=(1.55, 0.0, 1.45), rot_y=-0.38, scale=1.02, role="engineer", point_arm=1.0 - cta_w, wave_cta=cta_w, holding_tablet=True, time_s=t))

            if r < 0.20:
                cam_pos, cam_tgt = (0.45, 2.45, 6.95), (0.0, 2.25, 0.0)
            elif r < 0.48:
                cam_pos, cam_tgt = lerp3((0.45, 2.45, 6.95), (-0.15, 1.15, 4.25), smoothstep(0.20, 0.32, r)), (-0.15, 0.75, 0.15)
            elif r < 0.80:
                cam_pos, cam_tgt = lerp3((-0.15, 1.15, 4.25), (0.15, 1.85, 4.35), smoothstep(0.48, 0.58, r)), (0.0, 1.65, 0.15)
            else:
                cam_pos, cam_tgt = lerp3((0.15, 1.85, 4.35), (0.35, 2.25, 6.75), smoothstep(0.80, 0.88, r)), (0.15, 2.05, 0.0)

        cam_pos = (cam_pos[0] + 0.022 * math.sin(t * 1.15), cam_pos[1] + 0.016 * math.cos(t * 0.95), cam_pos[2])
        frame_raw = self.renderer.render(
            Mesh.merge(meshes),
            cam_pos,
            cam_tgt,
            fov,
            sun_dir=(0.42, 0.82, 0.38),
            sun_rgb=(1.0, 0.96, 0.90),
            sky_amb=(0.32, 0.40, 0.52),
            gnd_amb=(0.16, 0.19, 0.24),
            bg_top=bg_top,
            bg_bot=bg_bot,
        )
        if self.rw != 1080 or self.rh != 1920:
            frame_3d = np.array(Image.fromarray(frame_raw, mode="RGB").resize((1080, 1920), Image.Resampling.BILINEAR), dtype=np.uint8, copy=True)
        else:
            frame_3d = frame_raw
        return frame_3d, cam_pos, cam_tgt, fov, seg_idx

    def _proj_1080(self, world_pt: Tuple[float, float, float], cam_pos: Tuple[float, float, float], cam_tgt: Tuple[float, float, float], fov: float) -> Optional[Tuple[int, int]]:
        pt = self.renderer.project_point(world_pt, cam_pos, cam_tgt, fov)
        if pt is None:
            return None
        return (int(round(pt[0] * (1080.0 / self.rw))), int(round(pt[1] * (1920.0 / self.rh))))

    def composite_1080x1920(self, frame_3d: np.ndarray, t: float, seg_idx: int, cam_pos: Tuple[float, float, float], cam_tgt: Tuple[float, float, float], fov: float) -> np.ndarray:
        active_callouts = [
            (cal, self._proj_1080(cal.world_target, cam_pos, cam_tgt, fov))
            for cal in self.callouts
            if cal.start <= t <= cal.end
        ]
        return self.compositor.composite(frame_3d, t, seg_idx, self.subtitles, active_callouts)

    def render_frame(self, t: float) -> np.ndarray:
        frame_3d, cam_pos, cam_tgt, fov, seg_idx = self.render_3d_only(t)
        return self.composite_1080x1920(frame_3d, t, seg_idx, cam_pos, cam_tgt, fov)
