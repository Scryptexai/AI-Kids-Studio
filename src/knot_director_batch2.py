"""
Knot Theory V3 — Batch 2 Ultra-Diorama Multi-Act 3D Director (KT-S07 .. KT-S14).
Upgrades human characters (HumanRigV3), architectural buildings (ArchBuilderV3),
mechanical engineering cutaways (PrecisionMechV3), 7-act camera choreography,
8 tracked Callout3D labels per episode, and animated White-Button CTA sync.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

from src.assets_ep02 import make_3d_double_arrow
from src.knot_diorama_lib import DioramaSignalProps, lerp, lerp3
from src.knot_v3_uplevel import ArchBuilderV3, HumanRigV3, PrecisionMechV3
from src.overlays import Callout3D, OverlayCompositor, SubtitleChunk, smoothstep
from src.renderer3d import (
    FLAG_DEFAULT,
    FLAG_DOUBLE_SIDED,
    FLAG_GROUND,
    FLAG_RECV_SHADOW,
    Mesh,
    SceneRenderer,
    hex_rgb,
    make_beveled_box,
    make_cylinder,
    make_flat_quad_xz,
    make_icosphere,
    make_tube_along_path,
)


class KnotShortDirectorBatch2:
    """Multi-act V3 Ultra-Diorama 3D Director for KT-S07 .. KT-S14."""

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
        self.total_dur = total_dur
        self.subtitles = list(subtitles)
        self.rw = render_w
        self.rh = render_h
        self.renderer = SceneRenderer(out_w=render_w, out_h=render_h, ssaa=ssaa, shadow_res=shadow_res)
        self.props = DioramaSignalProps()

        # Sync White-Button CTA card right as the final question + CTA sentence begins (~last 8.2s)
        self.cta_start = max(total_dur - 8.2, total_dur * 0.81)
        self.compositor = OverlayCompositor(
            width=1080,
            height=1920,
            seg_names=self.spec["seg_names"],
            hook_sub=self.spec["hook_sub"],
            hook_main=self.spec["hook_main"],
            cta_start=self.cta_start,
            cta_q1=self.spec["cta_q1"],
            cta_q2=self.spec["cta_q2"],
            cta_opt_left=self.spec["cta_left"],
            cta_opt_right=self.spec["cta_right"],
        )
        self.callouts = self._build_callouts()
        self._build_static_caches()

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
        if ep == "KT-S07":
            return [
                Callout3D(0.06 * d, 0.21 * d, (-0.85, 1.30, 0.2), (310, 440), "KABEL LAUT DALAM", "Ramping • Minim Gangguan", (56, 189, 248)),
                Callout3D(0.09 * d, 0.23 * d, (0.85, 1.30, 0.2), (760, 560), "KABEL DEKAT PANTAI", "Lapis Baja Ganda Tebal!", (250, 204, 21)),
                Callout3D(0.25 * d, 0.44 * d, (1.55, -0.85, 0.0), (690, 460), "PALUNG SAMUDRA TENANG", "Serat Optik Setipis Rambut", (34, 211, 238)),
                Callout3D(0.46 * d, 0.66 * d, (-1.15, 0.42, 0.0), (360, 440), "ANCAMAN JANGKAR & PUKAT", "Zona Dangkal Paling Rawan", (239, 68, 68)),
                Callout3D(0.56 * d, 0.77 * d, (-0.95, -0.18, 0.15), (650, 560), "ARMOR KAWAT BAJA + KUBUR", "Menahan Gesekan Jangkar", (16, 185, 129)),
            ]
        if ep == "KT-S08":
            return [
                Callout3D(0.06 * d, 0.22 * d, (0.0, 1.28, 0.25), (540, 430), "CANGKANG LUAR MULUS", "Terlihat Utuh Mengilap", (56, 189, 248)),
                Callout3D(0.24 * d, 0.46 * d, (0.18, 1.15, 0.15), (660, 460), "LAPISAN BUSA PADAT EPS", "Jutaan Sel Penyerap Kejut", (250, 204, 21)),
                Callout3D(0.47 * d, 0.68 * d, (0.0, 1.34, 0.08), (430, 430), "PENYOK REMUK PERMANEN!", "Menguras Energi Benturan", (239, 68, 68)),
                Callout3D(0.58 * d, 0.78 * d, (-1.25, 0.55, 0.4), (340, 570), "BUKAN SPONS MEMBAL", "Sekali Remuk Tak Kembali", (16, 185, 129)),
            ]
        if ep == "KT-S09":
            return [
                Callout3D(0.05 * d, 0.21 * d, (0.0, 0.85, 0.0), (540, 430), "SEMBURAN TANPA POMPA!", "Tenaga Murni Hidraulik", (56, 189, 248)),
                Callout3D(0.22 * d, 0.42 * d, (-0.8, -0.95, 0.0), (410, 470), "NORMAL: SEPARUH PIPA", "Aliran Bebas Tanpa Tekan", (16, 185, 129)),
                Callout3D(0.43 * d, 0.64 * d, (0.0, -0.95, 0.0), (620, 450), "PIPA PENUH BERTEKANAN", "Surcharge + Kantong Udara", (245, 158, 11)),
                Callout3D(0.56 * d, 0.78 * d, (0.0, 0.55, 0.0), (480, 560), "GARIS TEKANAN > ASPAL", "Jauhi Lubang Saat Banjir!", (239, 68, 68)),
            ]
        if ep == "KT-S10":
            return [
                Callout3D(0.05 * d, 0.21 * d, (0.0, 1.35, 0.25), (540, 430), "MCB SENGAJA MENUNGGU!", "Toleransi Lonjakan Awal", (250, 204, 21)),
                Callout3D(0.24 * d, 0.50 * d, (-0.28, 1.12, 0.15), (370, 460), "1. KEPING LOGAM BIMETAL", "Melengkung Pelan Saat Panas", (245, 158, 11)),
                Callout3D(0.51 * d, 0.72 * d, (0.30, 1.08, 0.15), (700, 450), "2. KOIL MAGNETIK KILAT", "Sambar Korsleting Seketika!", (56, 189, 248)),
                Callout3D(0.60 * d, 0.79 * d, (0.38, 0.68, 0.15), (540, 580), "KISI PEMADAM BUSUR API", "Wajib Teknisi Berizin", (239, 68, 68)),
            ]
        if ep == "KT-S11":
            return [
                Callout3D(0.05 * d, 0.22 * d, (-0.95, 0.15, 0.0), (420, 430), "DITIUP UDARA 24 JAM!", "Napas Triliunan Bakteri", (56, 189, 248)),
                Callout3D(0.24 * d, 0.47 * d, (-0.95, -0.95, 0.0), (380, 520), "PIRINGAN DIFFUSER DASAR", "Oksigen Terlarut Merata", (34, 211, 238)),
                Callout3D(0.48 * d, 0.68 * d, (-0.45, -0.35, 0.1), (620, 440), "BAKTERI MENGGUMPAL FLOK", "Memakan Limbah Organik", (16, 185, 129)),
                Callout3D(0.60 * d, 0.79 * d, (1.25, -0.20, 0.0), (690, 560), "KOLAM PENGENDAP TENANG", "Flok Turun • Air Atas Jernih", (250, 204, 21)),
            ]
        if ep == "KT-S12":
            return [
                Callout3D(0.05 * d, 0.21 * d, (1.05, 1.15, 0.0), (640, 430), "ATAP BAJA IKUT TURUN!", "Bukan Ambruk, Tapi Mengapung", (56, 189, 248)),
                Callout3D(0.22 * d, 0.46 * d, (-1.10, 1.35, 0.0), (360, 450), "ATAP KAKU: RUANG UAP!", "Campuran Uap Mudah Terbakar", (239, 68, 68)),
                Callout3D(0.47 * d, 0.69 * d, (1.05, 0.95, 0.0), (680, 460), "PONTON MENGAPUNG DI BBM", "Tanpa Ruang Kosong Uap", (16, 185, 129)),
                Callout3D(0.58 * d, 0.79 * d, (1.72, 0.95, 0.0), (620, 580), "SEGEL LENTUR KELILING", "Rapat di Dinding Silinder", (250, 204, 21)),
            ]
        if ep == "KT-S13":
            return [
                Callout3D(0.05 * d, 0.21 * d, (-0.15, 0.38, 0.0), (540, 430), "SENGAJA DIBUAT BERGOLAK!", "Rem Air Kaki Bendungan", (56, 189, 248)),
                Callout3D(0.22 * d, 0.42 * d, (1.25, 0.12, 0.0), (690, 460), "TANPA KOLAM: GERUSAN!", "Mengancam Fondasi Sungai", (239, 68, 68)),
                Callout3D(0.43 * d, 0.66 * d, (-0.10, 0.28, 0.0), (460, 450), "LOMPATAN HIDRAULIK", "Cepat Tipis -> Tebal Lambat", (250, 204, 21)),
                Callout3D(0.58 * d, 0.79 * d, (-0.35, 0.05, 0.2), (560, 570), "BALOK PEMECAH STILLING", "Energi Habis Jadi Buih", (16, 185, 129)),
            ]
        # KT-S14
        return [
            Callout3D(0.05 * d, 0.21 * d, (0.0, 0.88, 0.32), (540, 430), "SUMBAT SENGAJA MELELEH!", "Di Dalam Velg Roda Pesawat", (250, 204, 21)),
            Callout3D(0.22 * d, 0.45 * d, (0.0, 0.88, 0.05), (440, 460), "CAKRAM REM MEMBARA", "Panas Merambat ke Gas Ban", (239, 68, 68)),
            Callout3D(0.46 * d, 0.66 * d, (-1.15, 1.35, 0.2), (360, 560), "CEGAH LEDAKAN BAN!", "Lindungi Sayap & Kru Darat", (245, 158, 11)),
            Callout3D(0.56 * d, 0.79 * d, (0.28, 0.68, 0.35), (670, 460), "THERMAL FUSIBLE PLUG", "Meleleh -> Kempis Terkendali", (16, 185, 129)),
        ]

    def _build_static_caches(self) -> None:
        ep = self.ep_code
        if ep == "KT-S07":
            # Coastal landing station + cliff + sloped continental shelf + deep abyssal seabed
            pts_bed = [(-3.4, 0.15, 0.0), (-1.4, 0.05, 0.0), (0.2, -0.75, 0.0), (1.8, -1.15, 0.0), (3.5, -1.18, 0.0)]
            self.s07_static = Mesh.merge([
                make_beveled_box(2.6, 1.5, 4.8, hex_rgb("#5C7A58"), bevel=0.05, roughness=0.85).transformed(pos=(-2.7, -0.55, 0.0)),
                make_beveled_box(7.8, 0.7, 4.8, hex_rgb("#334155"), bevel=0.04, roughness=0.90).transformed(pos=(0.3, -1.52, 0.0)),
                make_tube_along_path(pts_bed, 0.34, hex_rgb("#94A3B8"), sides=8, roughness=0.88),
                ArchBuilderV3.industrial_portal_hall(-2.55, -1.15, w=1.75, h=1.25, d=1.35, cladding_hex="#E2E8F0", frame_hex="#0284C7").transformed(pos=(0.0, 0.20, 0.0)),
                ArchBuilderV3.shophouse_ruko(-3.15, 0.95, w=1.25, d=1.15).transformed(pos=(0.0, 0.20, 0.0)),
                self.props.tree(-1.85, 1.35, scale=0.72, y=0.20),
                # Actual seabed cable transitioning from thick armored coastal to thin deep-sea
                make_tube_along_path([(-2.3, 0.22, 0.25), (-1.1, 0.08, 0.25), (-0.1, -0.45, 0.25)], 0.095, hex_rgb("#FACC15"), sides=10, roughness=0.35),
                make_tube_along_path([(-0.1, -0.45, 0.25), (1.6, -0.92, 0.25), (3.2, -0.96, 0.25)], 0.036, hex_rgb("#0F172A"), sides=8, roughness=0.45),
            ])
        elif ep == "KT-S08":
            self.s08_static = Mesh.merge([
                make_flat_quad_xz(-7.0, -7.0, 7.0, 7.0, 0.0, hex_rgb("#334155"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.midrise_tower(-2.15, -3.1, w=2.5, d=1.9, floors=4, wall_hex="#E2E8F0", accent_hex="#0EA5E9"),
                ArchBuilderV3.shophouse_ruko(0.65, -3.2, wall_hex="#F5EFE6", roof_hex="#C2593F", awning_hex="#0D9488"),
                ArchBuilderV3.industrial_portal_hall(3.0, -3.1, w=2.1, h=1.85, d=1.7, frame_hex="#EF4444"),
                self.props.curb_strip(0.0, -3.6, 3.6, y=0.0, count=10).transformed(rot=(0.0, math.pi * 0.5, 0.0), pos=(0.0, 0.0, -1.65)),
                # Precision test pedestal under giant cutaway helmet
                make_beveled_box(1.55, 0.56, 1.35, hex_rgb("#1E293B"), bevel=0.04, roughness=0.42).transformed(pos=(0.0, 0.28, 0.10)),
                PrecisionMechV3.steel_truss_span(1.65, 0.22, 0.24, bays=4, color_hex="#64748B").transformed(pos=(0.0, 2.38, 0.10)),
            ])
        elif ep == "KT-S09":
            self.s09_buildings = Mesh.merge([
                ArchBuilderV3.midrise_tower(-2.35, -2.55, w=2.3, d=1.8, floors=4, wall_hex="#CBD5E1", accent_hex="#0284C7"),
                ArchBuilderV3.shophouse_ruko(0.25, -2.65, wall_hex="#F5EFE6", roof_hex="#B45309", awning_hex="#0D9488"),
                ArchBuilderV3.shophouse_ruko(2.45, -2.65, wall_hex="#E2E8F0", roof_hex="#991B1B", awning_hex="#2563EB"),
                self.props.street_lamp(-1.55, -1.15, lit=1.0),
                self.props.street_lamp(1.65, -1.15, lit=1.0),
                self.props.traffic_cone(-0.68, 0.42),
                self.props.traffic_cone(0.68, 0.42),
            ])
        elif ep == "KT-S10":
            self.s10_static = Mesh.merge([
                make_flat_quad_xz(-7.0, -7.0, 7.0, 7.0, 0.0, hex_rgb("#283548"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.shophouse_ruko(-2.35, -2.95, wall_hex="#F8FAFC", roof_hex="#C2593F", awning_hex="#0284C7"),
                ArchBuilderV3.midrise_tower(2.25, -3.05, w=2.4, d=1.8, floors=3, wall_hex="#E2E8F0", accent_hex="#F59E0B"),
                # Giant DIN-rail backplate + breaker rear shell
                PrecisionMechV3.steel_truss_span(2.6, 0.22, 0.14, bays=6, color_hex="#94A3B8").transformed(pos=(0.0, 1.15, -0.22)),
                make_beveled_box(1.56, 1.92, 0.42, hex_rgb("#F1F5F9"), bevel=0.05, roughness=0.48).transformed(pos=(0.0, 1.16, -0.06)),
                make_beveled_box(1.42, 1.74, 0.18, hex_rgb("#0F172A"), bevel=0.03, roughness=0.72).transformed(pos=(0.0, 1.16, 0.08)),
            ])
        elif ep == "KT-S11":
            self.s11_static = Mesh.merge([
                make_flat_quad_xz(-8.0, -8.0, 8.0, 8.0, -1.45, hex_rgb("#334155"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.industrial_portal_hall(-2.55, -2.85, w=2.3, h=1.85, d=1.75, cladding_hex="#E2E8F0", frame_hex="#0EA5E9"),
                ArchBuilderV3.midrise_tower(2.35, -3.05, w=2.2, d=1.7, floors=3, wall_hex="#DCE8F2", accent_hex="#10B981"),
                # Overhead steel truss inspection catwalk above the two basins
                PrecisionMechV3.steel_truss_span(4.8, 0.26, 0.56, bays=8, color_hex="#64748B").transformed(pos=(0.15, 0.52, -0.65)),
                # Concrete walls of Basin 1 (Aeration, left) & Basin 2 (Clarifier, right) + flanged transfer pipe
                make_beveled_box(2.15, 1.48, 1.75, hex_rgb("#64748B"), bevel=0.03).transformed(pos=(-1.05, -0.72, -0.88)),
                make_beveled_box(2.15, 1.48, 1.75, hex_rgb("#64748B"), bevel=0.03).transformed(pos=(1.35, -0.72, -0.88)),
                PrecisionMechV3.flanged_pipe(0.75, 0.14, pipe_hex="#0284C7").transformed(pos=(0.15, -0.25, 0.0)),
            ])
        elif ep == "KT-S12":
            self.s12_static = Mesh.merge([
                make_flat_quad_xz(-8.0, -8.0, 8.0, 8.0, 0.0, hex_rgb("#3B4758"), flags=FLAG_GROUND, subdiv=2),
                ArchBuilderV3.industrial_portal_hall(0.0, -3.25, w=2.8, h=1.9, d=1.8, cladding_hex="#E2E8F0", frame_hex="#F59E0B"),
                PrecisionMechV3.flanged_pipe(3.2, 0.14, pipe_hex="#94A3B8").transformed(pos=(0.0, 0.22, 1.25)),
                # Open cutaway U-shells for Fixed-Roof Tank (left x=-1.10) & Floating-Roof Tank (right x=+1.05)
                make_beveled_box(1.72, 1.95, 0.14, hex_rgb("#E2E8F0"), bevel=0.02, roughness=0.40).transformed(pos=(-1.10, 0.98, -0.78)),
                make_beveled_box(0.12, 1.95, 1.45, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(-1.90, 0.98, -0.08)),
                make_beveled_box(0.12, 1.95, 1.45, hex_rgb("#CBD5E1"), bevel=0.02).transformed(pos=(-0.30, 0.98, -0.08)),
                make_cylinder(0.92, 0.05, 0.42, hex_rgb("#CBD5E1"), segments=22, roughness=0.42).transformed(pos=(-1.10, 2.16, -0.08)),
                make_beveled_box(1.72, 1.95, 0.14, hex_rgb("#F8FAFC"), bevel=0.02, roughness=0.38).transformed(pos=(1.05, 0.98, -0.78)),
                make_beveled_box(0.12, 1.95, 1.45, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(0.25, 0.98, -0.08)),
                make_beveled_box(0.12, 1.95, 1.45, hex_rgb("#E2E8F0"), bevel=0.02).transformed(pos=(1.85, 0.98, -0.08)),
            ])
        elif ep == "KT-S13":
            self.s13_static = Mesh.merge([
                make_flat_quad_xz(-8.5, -8.5, 8.5, 8.5, -0.32, hex_rgb("#475569"), flags=FLAG_GROUND, subdiv=2),
                # Concrete Gravity Dam + Spillway Chute + Stilling Basin Concrete Apron + Chute/Baffle Blocks
                make_beveled_box(1.85, 2.55, 2.65, hex_rgb("#94A3B8"), bevel=0.05, roughness=0.75).transformed(pos=(-2.15, 0.98, 0.0)),
                make_beveled_box(1.95, 2.25, 2.55, hex_rgb("#CBD5E1"), bevel=0.05, roughness=0.72).transformed(pos=(-1.35, 0.72, 0.0), rot=(0.0, 0.0, -0.56)),
                make_beveled_box(4.6, 0.26, 2.65, hex_rgb("#64748B"), bevel=0.02, roughness=0.80).transformed(pos=(0.65, -0.18, 0.0)),
                ArchBuilderV3.industrial_portal_hall(-2.15, -2.35, w=1.9, h=1.4, d=1.4, frame_hex="#0284C7").transformed(pos=(0.0, 2.20, 0.0)),
                self.props.tree(2.35, -2.05, scale=0.95, y=-0.30),
                self.props.tree(3.05, -1.85, scale=0.82, y=-0.30),
                # Concrete baffle piers inside stilling basin
                *[
                    make_beveled_box(0.18, 0.26, 0.22, hex_rgb("#475569"), bevel=0.015).transformed(pos=(-0.22, 0.06, bz))
                    for bz in (-0.75, -0.25, 0.25, 0.75)
                ],
                make_beveled_box(0.22, 0.24, 2.55, hex_rgb("#475569"), bevel=0.02).transformed(pos=(0.95, 0.04, 0.0)),
            ])
        else:  # KT-S14
            self.s14_static = Mesh.merge([
                make_flat_quad_xz(-8.5, -8.5, 8.5, 8.5, 0.0, hex_rgb("#263040"), flags=FLAG_GROUND, subdiv=2),
                # Airport runway threshold stripes + terminal + control tower
                *[
                    make_beveled_box(1.45, 0.015, 0.24, hex_rgb("#F8FAFC"), bevel=0.003).transformed(pos=(sx, 0.008, z_s))
                    for sx in (-1.8, 1.8)
                    for z_s in (-1.2, -0.6, 0.0, 0.6, 1.2)
                ],
                ArchBuilderV3.midrise_tower(-2.45, -3.35, w=2.8, d=1.8, floors=3, wall_hex="#E2E8F0", accent_hex="#0284C7"),
                ArchBuilderV3.industrial_portal_hall(2.35, -3.45, w=2.4, h=1.8, d=1.7, frame_hex="#F59E0B"),
                # Aircraft landing gear oleo strut + axle beam
                make_cylinder(0.14, 0.16, 1.95, hex_rgb("#CBD5E1"), segments=16, roughness=0.25).transformed(pos=(0.0, 1.85, -0.18)),
                PrecisionMechV3.flanged_pipe(0.95, 0.11, pipe_hex="#94A3B8").transformed(pos=(0.0, 0.88, -0.02)),
            ])

    def _build_submarine_cross_section(self, pos: Tuple[float, float, float], armored: bool, time_s: float) -> Mesh:
        """Giant 3D stepped cutaway cross-section of submarine optical cable."""
        parts: List[Mesh] = []
        # Outer polyethylene jacket
        r_outer = 0.28 if armored else 0.115
        parts.append(
            make_cylinder(r_outer, r_outer, 0.62, hex_rgb("#FACC15") if armored else hex_rgb("#1E293B"), segments=20, roughness=0.38).transformed(
                rot=(math.pi * 0.5, 0.0, 0.0), pos=(0.0, 0.0, -0.18)
            )
        )
        if armored:
            # Ring of 14 thick galvanized steel armor wires protruding forward!
            for k in range(14):
                a = 2.0 * math.pi * k / 14.0
                ax, ay = math.cos(a) * 0.22, math.sin(a) * 0.22
                parts.append(
                    make_cylinder(0.032, 0.032, 0.72, hex_rgb("#CBD5E1"), segments=8, roughness=0.22).transformed(
                        rot=(math.pi * 0.5, 0.0, 0.0), pos=(ax, ay, -0.02)
                    )
                )
        # Copper power conductor tube + polycarbonate insulation + glowing hair-thin optical fibers!
        parts.append(make_cylinder(0.085, 0.085, 0.86, hex_rgb("#D97706"), segments=16, roughness=0.25).transformed(rot=(math.pi * 0.5, 0.0, 0.0), pos=(0.0, 0.0, 0.12)))
        glow = 3.2 + 1.4 * math.sin(time_s * 10.0)
        for fk in range(4):
            fa = 2.0 * math.pi * fk / 4.0 + time_s * 1.5
            parts.append(
                make_cylinder(0.016, 0.016, 1.05, hex_rgb("#22D3EE"), segments=8, emission=glow).transformed(
                    rot=(math.pi * 0.5, 0.0, 0.0), pos=(math.cos(fa) * 0.032, math.sin(fa) * 0.032, 0.28)
                )
            )
        return Mesh.merge(parts).transformed(pos=pos)

    def render_3d_only(self, t: float) -> Tuple[np.ndarray, Tuple[float, float, float], Tuple[float, float, float], float, int]:
        r = max(0.0, min(1.0, t / max(0.1, self.total_dur)))
        seg_idx = self._seg_idx(r)
        ep = self.ep_code
        cta_u = smoothstep(0.81, 0.86, r)

        meshes: List[Mesh] = []
        pls = []
        bg_top = hex_rgb("#0B1324")
        bg_bot = hex_rgb("#1E3A5F")
        sun_rgb = (1.0, 0.96, 0.90)
        sky_amb = (0.30, 0.38, 0.50)
        gnd_amb = (0.15, 0.18, 0.22)

        if ep == "KT-S07":
            bg_top, bg_bot = hex_rgb("#071426"), hex_rgb("#0E3A5D")
            meshes.append(self.s07_static)
            # Translucent ocean water volume (fades cutaway during middle acts)
            water_alpha = lerp(0.52, 0.18, smoothstep(0.20, 0.34, r))
            meshes.append(make_beveled_box(5.6, 1.65, 4.4, hex_rgb("#0284C7"), alpha=water_alpha, roughness=0.18, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(0.95, -0.35, 0.0)))
            # Side-by-side giant comparison cross-sections hovering in hero showcase
            hero_y = lerp(1.28, 1.72, smoothstep(0.24, 0.36, r))
            meshes.append(self._build_submarine_cross_section((-0.85, hero_y, 0.15), armored=False, time_s=t))
            meshes.append(self._build_submarine_cross_section((0.85, hero_y, 0.15), armored=True, time_s=t))
            # Cargo ship + dragging anchor near shallow shelf!
            ship_x = -0.95 + 0.18 * math.sin(t * 0.9)
            meshes.append(self.props.cargo_ship((ship_x, 0.52, -0.25), scale=0.68))
            anc_drop = smoothstep(0.42, 0.54, r)
            anc_y = lerp(0.35, -0.02, anc_drop)
            anc_x = ship_x + 0.22 * math.sin(t * 2.8) * anc_drop
            meshes.append(make_tube_along_path([(ship_x, 0.48, 0.15), (anc_x, anc_y + 0.12, 0.25)], 0.022, hex_rgb("#CBD5E1"), sides=6))
            meshes.append(make_beveled_box(0.26, 0.28, 0.12, hex_rgb("#475569"), bevel=0.02).transformed(pos=(anc_x, anc_y, 0.25)))
            if 0.50 <= r <= 0.78:
                meshes.append(self.props.green_check.transformed(pos=(-0.95, 0.55, 0.35), scale=0.65, rot=(0.0, t * 1.8, 0.0)))
            # Optical pulses racing from deep sea into landing station
            meshes.append(self.props.pulse_stream_along_path([(3.1, -0.94, 0.25), (1.5, -0.90, 0.25), (-0.1, -0.43, 0.25), (-1.2, 0.10, 0.25), (-2.3, 0.24, 0.25)], 7, 2.2, t, radius=0.055, color_hex="#22D3EE", emission=4.2))
            # Articulated V3 Engineer & Civilian on coastal pier
            meshes.append(HumanRigV3.build(pos=(-1.85, 0.20, 0.75), rot_y=0.55, scale=0.95, role="engineer", point_arm=smoothstep(0.22, 0.35, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(-2.45, 0.20, 0.92), rot_y=0.35, scale=0.92, role="civilian_f", jacket_hex="#EC4899", hair_hex="#0D9488", wave_cta=cta_u, time_s=t))

            c0, g0 = (0.0, 1.42, 3.85), (0.0, 1.15, 0.0)
            c1, g1 = (0.35, 0.45, 4.55), (0.15, -0.15, 0.0)
            c2, g2 = (-0.95, 0.55, 3.25), (-0.95, 0.05, 0.2)
            c3, g3 = (-1.65, 1.05, 3.65), (-1.25, 0.55, 0.2)

        elif ep == "KT-S08":
            meshes.append(self.s08_static)
            # Impact anvil strike at r=0.44..0.52 -> EPS cells crush permanently for r >= 0.48!
            strike = smoothstep(0.42, 0.48, r) * (1.0 - smoothstep(0.50, 0.58, r))
            crushed = smoothstep(0.46, 0.53, r)
            cut_alpha = lerp(1.0, 0.16, smoothstep(0.20, 0.30, r))
            # Giant sculpted helmet on pedestal (center y=1.22)
            # Inner headform
            meshes.append(make_icosphere(0.34, hex_rgb("#F1C29B"), subdivisions=2, roughness=0.55).transformed(pos=(0.0, 1.16, 0.10)))
            # 3D Cellular EPS Foam Bead Matrix (crushes & flattens permanently on top!)
            for gi in range(18):
                ang = math.pi * (-0.15 + 1.30 * (gi / 17.0))
                cx_b = math.cos(ang) * 0.44
                cy_b = 1.16 + math.sin(ang) * 0.44
                top_w = max(0.0, math.sin(ang)) * crushed
                sy_scale = 1.0 - 0.58 * top_w
                cy_shift = -0.09 * top_w
                bcol = lerp3(hex_rgb("#F8FAFC"), hex_rgb("#EF4444"), top_w)
                for bz in (-0.08, 0.10, 0.26):
                    meshes.append(
                        make_icosphere(0.082, bcol, subdivisions=1, roughness=0.75, emission=1.2 * top_w).transformed(
                            pos=(cx_b, cy_b + cy_shift, bz), scale=(1.08, sy_scale, 1.0)
                        )
                    )
            # Back opaque glossy red outer shell + Front cutaway shell
            meshes.append(make_icosphere(0.58, hex_rgb("#DC2626"), subdivisions=2, roughness=0.18).transformed(pos=(0.0, 1.20, -0.04), scale=(1.0, 1.0, 0.85)))
            if cut_alpha > 0.05:
                fl = FLAG_DEFAULT if cut_alpha >= 0.98 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)
                meshes.append(make_icosphere(0.59, hex_rgb("#EF4444"), subdivisions=2, alpha=cut_alpha, roughness=0.16, flags=fl).transformed(pos=(0.0, 1.20, 0.14)))
            # Impact striker weight + comparison bouncy yellow sponge on left!
            meshes.append(make_cylinder(0.28, 0.28, 0.24, hex_rgb("#475569"), segments=16).transformed(pos=(0.0, 2.15 - 0.36 * strike, 0.10)))
            sp_bounce = abs(math.sin(t * 5.5)) * 0.35
            meshes.append(make_beveled_box(0.46, 0.28 * (1.0 - sp_bounce), 0.38, hex_rgb("#FACC15"), bevel=0.03).transformed(pos=(-1.25, 0.42, 0.35)))
            if r > 0.54:
                meshes.append(self.props.red_cross.transformed(pos=(-1.25, 0.88, 0.35), scale=0.55, rot=(0.0, t * 1.5, 0.0)))
                meshes.append(self.props.green_check.transformed(pos=(0.78, 1.65, 0.25), scale=0.62, rot=(0.0, t * 1.6, 0.0)))
            # Articulated Rider + Safety Engineer
            meshes.append(HumanRigV3.build(pos=(1.22, 0.0, 0.72), rot_y=-0.42, scale=1.08, role="engineer", point_arm=smoothstep(0.20, 0.34, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(-1.35, 0.0, 1.05), rot_y=0.38, scale=1.08, role="rider", wave_cta=cta_u, time_s=t))

            c0, g0 = (0.0, 1.55, 3.65), (0.0, 1.20, 0.10)
            c1, g1 = (0.55, 1.45, 2.85), (0.0, 1.22, 0.10)
            c2, g2 = (-0.35, 1.40, 3.25), (-0.25, 1.10, 0.15)
            c3, g3 = (0.0, 1.65, 3.95), (0.0, 1.15, 0.25)

        elif ep == "KT-S09":
            bg_top, bg_bot = hex_rgb("#0F172A"), hex_rgb("#1E293B")
            cut_alpha = lerp(1.0, 0.16, smoothstep(0.18, 0.30, r))
            back_e, front_e = self.props.layered_cutaway_earth(width=8.6, depth=6.8, soil_h=2.1, front_alpha=cut_alpha, surface_hex="#334155")
            meshes.extend([back_e, front_e, self.s09_buildings])
            # Underground storm drain flanged pipe + vertical manhole shaft
            meshes.append(PrecisionMechV3.flanged_pipe(5.4, 0.38, pipe_hex="#64748B", alpha=0.42).transformed(pos=(0.0, -1.05, 0.0)))
            meshes.append(make_cylinder(0.32, 0.32, 1.05, hex_rgb("#64748B"), segments=18, alpha=0.45, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(0.0, -0.52, 0.0)))
            surcharge = smoothstep(0.36, 0.52, r)
            # Water inside pipe: half-full -> full pressurized + rising geyser!
            fill_h = lerp(0.26, 0.68, surcharge)
            meshes.append(make_beveled_box(5.2, fill_h, 0.56, hex_rgb("#0284C7"), bevel=0.04, emission=0.8 + 1.2 * surcharge).transformed(pos=(0.0, -1.32 + fill_h * 0.5, 0.0)))
            # Glowing Hydraulic Grade Line (HGL) bar rising above asphalt!
            hgl_y = lerp(-0.88, 0.62, surcharge)
            meshes.append(make_tube_along_path([(-2.4, hgl_y + 0.35, 0.32), (2.4, hgl_y - 0.15, 0.32)], 0.032, hex_rgb("#FACC15"), sides=8, emission=3.5))
            # Manhole cover lifted + erupting water geyser!
            geyser_h = max(0.0, surcharge - 0.25) / 0.75
            cov_y = 0.03 + 0.92 * geyser_h + 0.06 * math.sin(t * 14.0) * geyser_h
            meshes.append(make_cylinder(0.34, 0.34, 0.06, hex_rgb("#475569"), segments=18, roughness=0.45).transformed(pos=(0.08 * geyser_h, cov_y, 0.0), rot=(0.18 * geyser_h, 0.0, -0.22 * geyser_h)))
            if geyser_h > 0.04:
                meshes.append(make_cylinder(0.24, 0.14, 0.95 + 0.85 * geyser_h, hex_rgb("#38BDF8"), segments=16, alpha=0.82, emission=1.8, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(0.0, (0.95 + 0.85 * geyser_h) * 0.5 - 0.45, 0.0)))
                meshes.append(self.props.pulse_stream_along_path([(-2.2, -1.0, 0.0), (0.0, -0.95, 0.0), (0.0, 0.95 * geyser_h, 0.0)], 9, 3.2, t, radius=0.085, color_hex="#E0F2FE", emission=3.4))
            # Articulated Engineer & Startled Commuter safely behind cones
            meshes.append(HumanRigV3.build(pos=(-1.35, 0.0, 0.65), rot_y=0.45, scale=1.05, role="engineer", point_arm=smoothstep(0.25, 0.40, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(1.35, 0.0, 0.72), rot_y=-0.48, scale=1.05, role="civilian_m", jacket_hex="#0EA5E9", startled=geyser_h * (1.0 - cta_u), wave_cta=cta_u, time_s=t))

            c0, g0 = (0.0, 1.35, 3.95), (0.0, 0.45, 0.0)
            c1, g1 = (0.25, 0.35, 4.35), (0.0, -0.55, 0.0)
            c2, g2 = (-0.55, 0.55, 3.75), (0.0, -0.20, 0.0)
            c3, g3 = (0.0, 1.45, 4.15), (0.0, 0.35, 0.0)

        elif ep == "KT-S10":
            meshes.append(self.s10_static)
            # Act 1 (0.22..0.50): Thermal Bimetal bends gradually! Act 2 (0.52..0.76): Magnetic Solenoid snaps instantly!
            therm_u = smoothstep(0.24, 0.47, r) * (1.0 - smoothstep(0.49, 0.52, r))
            short_u = smoothstep(0.54, 0.57, r) * (1.0 - smoothstep(0.76, 0.80, r))
            tripped = max(smoothstep(0.45, 0.48, r) * (1.0 - smoothstep(0.49, 0.52, r)), short_u)
            # Toggle lever on front/side of MCB
            lev_ang = lerp(0.45, -0.55, tripped)
            meshes.append(make_beveled_box(0.22, 0.38, 0.18, hex_rgb("#0284C7") if tripped < 0.5 else hex_rgb("#EF4444"), bevel=0.025).transformed(pos=(-0.55, 1.38, 0.22), rot=(0.0, 0.0, lev_ang)))
            # 1. Left chamber: Two-layer Bimetallic Strip (bends right under overload heat!)
            bend_x = 0.22 * therm_u
            b_pts = [(-0.34, 0.62, 0.18), (-0.34 + bend_x * 0.4, 0.98, 0.18), (-0.34 + bend_x, 1.36, 0.18)]
            b_col = lerp3(hex_rgb("#D97706"), hex_rgb("#FF4D00"), therm_u)
            meshes.append(make_tube_along_path(b_pts, 0.048, b_col, sides=8, emission=3.2 * therm_u))
            # 2. Right chamber: Helical Copper Magnetic Solenoid Coil + Plunger
            coil_pts = []
            for k in range(28):
                u_c = k / 27.0
                ang = u_c * 6.0 * 2.0 * math.pi
                coil_pts.append((0.28 + 0.14 * math.cos(ang), 0.92 + 0.46 * u_c, 0.18 + 0.14 * math.sin(ang)))
            meshes.append(make_tube_along_path(coil_pts, 0.026, hex_rgb("#EA580C"), sides=8, emission=3.8 * short_u))
            meshes.append(make_cylinder(0.055, 0.055, 0.42, hex_rgb("#E2E8F0"), segments=12).transformed(pos=(0.28 - 0.16 * short_u, 1.15, 0.18), rot=(0.0, 0.0, math.pi * 0.5)))
            # 3. Bottom Arc Chute Splitter Plates + Electric Arc Flash on short-circuit!
            for k in range(7):
                meshes.append(make_beveled_box(0.36, 0.022, 0.14, hex_rgb("#94A3B8"), bevel=0.004).transformed(pos=(0.30, 0.46 + k * 0.055, 0.18)))
            if 0.54 <= r <= 0.66:
                meshes.append(make_icosphere(0.14, hex_rgb("#38BDF8"), subdivisions=1, emission=5.0).transformed(pos=(0.30, 0.62, 0.22)))
                pls.append((0.30, 0.75, 0.45, 0.2, 0.8, 1.0, 3.6, 1.1))
            # Clear acrylic cutaway cover over MCB
            meshes.append(make_beveled_box(1.48, 1.82, 0.06, hex_rgb("#BAE6FD"), alpha=0.18, roughness=0.12, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(0.0, 1.16, 0.32)))
            # Licensed Electrician + Homeowner
            meshes.append(HumanRigV3.build(pos=(-1.28, 0.0, 0.68), rot_y=0.40, scale=1.08, role="engineer", point_arm=smoothstep(0.20, 0.32, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(1.28, 0.0, 0.75), rot_y=-0.42, scale=1.06, role="civilian_f", jacket_hex="#10B981", hair_hex="#1E293B", startled=short_u * (1.0 - cta_u), wave_cta=cta_u, time_s=t))

            c0, g0 = (0.0, 1.45, 3.75), (0.0, 1.15, 0.10)
            c1, g1 = (-0.25, 1.32, 2.85), (-0.15, 1.12, 0.15)
            c2, g2 = (0.32, 1.25, 2.85), (0.18, 1.02, 0.15)
            c3, g3 = (0.0, 1.50, 3.95), (0.0, 1.12, 0.15)

        elif ep == "KT-S11":
            meshes.append(self.s11_static)
            # Basin 1 (Left x=-1.05): Turbid brown aerated water + floor disc diffusers + rising bubble curtains + green aerobic bacteria flocs!
            meshes.append(make_beveled_box(2.02, 1.18, 1.55, hex_rgb("#785233"), alpha=0.52, roughness=0.28, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(-1.05, -0.78, -0.05)))
            for dx in (-1.65, -1.05, -0.45):
                meshes.append(make_cylinder(0.18, 0.18, 0.06, hex_rgb("#E2E8F0"), segments=14).transformed(pos=(dx, -1.32, 0.0)))
                meshes.append(self.props.pulse_stream_along_path([(dx, -1.26, 0.0), (dx + 0.06 * math.sin(t * 3.0 + dx), -0.22, 0.0)], 6, 1.15, t + dx, radius=0.052, color_hex="#E0F2FE", emission=3.2))
            # Aerobic microbe & floc clusters clumping and migrating to Clarifier Basin 2 (Right x=+1.35)
            floc_u = smoothstep(0.42, 0.72, r)
            for k in range(8):
                ang = k * 0.78 + t * 1.4
                fx_a = -1.05 + 0.55 * math.cos(ang)
                fy_a = -0.75 + 0.32 * math.sin(ang * 1.3)
                # Settled position in Basin 2 bottom!
                fx_b = 1.05 + (k % 4) * 0.22
                fy_b = -1.22 + 0.06 * (k // 4)
                fx = lerp(fx_a, fx_b, floc_u if k < 5 else 0.0)
                fy = lerp(fy_a, fy_b, floc_u if k < 5 else 0.0)
                meshes.append(make_icosphere(0.088, hex_rgb("#10B981") if k < 5 else hex_rgb("#A16207"), subdivisions=1, emission=1.4 if k < 5 else 0.2).transformed(pos=(fx, fy, 0.12)))
            # Basin 2 (Right x=+1.35): Sparkling clear blue supernatant water!
            meshes.append(make_beveled_box(2.02, 1.18, 1.55, hex_rgb("#0EA5E9"), alpha=0.44, roughness=0.15, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(1.35, -0.78, -0.05)))
            if r > 0.58:
                meshes.append(self.props.green_check.transformed(pos=(1.35, 0.18, 0.25), scale=0.62, rot=(0.0, t * 1.6, 0.0)))
            # Engineers on steel catwalk bridge
            meshes.append(HumanRigV3.build(pos=(-0.65, 0.65, -0.62), rot_y=0.25, scale=0.98, role="engineer", point_arm=smoothstep(0.20, 0.35, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(0.95, 0.65, -0.62), rot_y=-0.25, scale=0.98, role="civilian_m", jacket_hex="#0284C7", wave_cta=cta_u, time_s=t))

            c0, g0 = (0.10, 0.85, 4.25), (-0.15, -0.35, 0.0)
            c1, g1 = (-0.95, 0.25, 3.15), (-1.05, -0.75, 0.0)
            c2, g2 = (0.25, 0.35, 3.65), (0.25, -0.55, 0.0)
            c3, g3 = (0.15, 1.05, 4.35), (0.15, 0.05, -0.2)

        elif ep == "KT-S12":
            meshes.append(self.s12_static)
            # Fuel level pumps down (0.10..0.58) and refills slightly (0.62..0.80)
            pump_u = smoothstep(0.12, 0.56, r) - 0.35 * smoothstep(0.64, 0.78, r)
            fuel_h = lerp(1.58, 0.48, pump_u)
            # Left Tank (Fixed Roof): Golden fuel drops -> glowing red explosive vapor cloud fills empty top!
            meshes.append(make_cylinder(0.78, 0.78, fuel_h, hex_rgb("#D97706"), segments=20, roughness=0.28).transformed(pos=(-1.10, 0.05 + fuel_h * 0.5, 0.0)))
            vap_h = max(0.08, 1.78 - fuel_h)
            if pump_u > 0.15:
                meshes.append(make_cylinder(0.76, 0.76, vap_h, hex_rgb("#EF4444"), segments=18, alpha=0.48, emission=2.2 * pump_u, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(-1.10, 0.08 + fuel_h + vap_h * 0.5, 0.0)))
                meshes.append(self.props.red_cross.transformed(pos=(-1.10, 2.48, 0.15), scale=0.55, rot=(0.0, t * 1.6, 0.0)))
            # Right Tank (External Floating Roof): Steel pontoon deck + black elastomeric rim seal rides directly on fuel!
            meshes.append(make_cylinder(0.78, 0.78, fuel_h, hex_rgb("#F59E0B"), segments=20, roughness=0.26).transformed(pos=(1.05, 0.05 + fuel_h * 0.5, 0.0)))
            roof_y = 0.08 + fuel_h
            meshes.append(make_cylinder(0.75, 0.75, 0.11, hex_rgb("#CBD5E1"), segments=20, roughness=0.30).transformed(pos=(1.05, roof_y, 0.0)))
            meshes.append(make_cylinder(0.81, 0.81, 0.075, hex_rgb("#0F172A"), segments=22, roughness=0.65).transformed(pos=(1.05, roof_y + 0.01, 0.0)))
            # Rolling articulated roof ladder from tank rim (1.82, 1.95, 0.0) to floating roof center!
            meshes.append(make_tube_along_path([(1.82, 1.95, 0.0), (1.12, roof_y + 0.06, 0.0)], 0.032, hex_rgb("#475569"), sides=6))
            if r > 0.46:
                meshes.append(self.props.green_check.transformed(pos=(1.05, 2.38, 0.15), scale=0.60, rot=(0.0, t * 1.6, 0.0)))
            # Translucent front cutaway tank walls
            for tx in (-1.10, 1.05):
                meshes.append(make_beveled_box(1.62, 1.92, 0.06, hex_rgb("#BAE6FD"), alpha=0.18, roughness=0.15, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(tx, 0.98, 0.45)))
            meshes.append(HumanRigV3.build(pos=(-0.02, 0.0, 1.48), rot_y=0.08, scale=1.02, role="engineer", point_arm=smoothstep(0.22, 0.36, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(1.95, 0.0, 1.32), rot_y=-0.45, scale=1.00, role="civilian_f", jacket_hex="#0EA5E9", hair_hex="#0F172A", wave_cta=cta_u, time_s=t))

            c0, g0 = (0.0, 1.65, 4.55), (0.0, 1.10, 0.0)
            c1, g1 = (-0.55, 1.55, 3.65), (-0.65, 1.20, 0.0)
            c2, g2 = (0.85, 1.45, 3.45), (1.05, 1.05, 0.0)
            c3, g3 = (0.15, 1.65, 4.45), (0.15, 1.05, 0.2)

        elif ep == "KT-S13":
            bg_top, bg_bot = hex_rgb("#0C1E35"), hex_rgb("#1E4E68")
            meshes.append(self.s13_static)
            # Supercritical fast thin chute sheet -> violent foaming Hydraulic Jump roller -> deep calm tailwater!
            meshes.append(make_beveled_box(2.05, 0.12, 2.25, hex_rgb("#38BDF8"), bevel=0.02, emission=1.4).transformed(pos=(-1.18, 0.82, 0.0), rot=(0.0, 0.0, -0.56)))
            meshes.append(make_beveled_box(0.65, 0.11, 2.25, hex_rgb("#00E5FF"), bevel=0.02, emission=1.8).transformed(pos=(-0.45, 0.02, 0.0)))
            # Turbulent churning white-water hydraulic jump roller at x = -0.15 .. +0.75!
            for k in range(16):
                u_j = k / 15.0
                jx = -0.18 + u_j * 0.95
                jy = 0.22 + 0.26 * math.sin(u_j * math.pi) + 0.06 * math.sin(t * 13.0 + k * 1.7)
                jz = -0.88 + (k % 5) * 0.44
                meshes.append(make_icosphere(0.14 + 0.04 * math.sin(t * 9.0 + k), hex_rgb("#F8FAFC"), subdivisions=1, emission=1.9).transformed(pos=(jx, jy, jz)))
            # Deep slow calm subcritical downstream river (x = +0.75 .. +2.85)
            meshes.append(make_beveled_box(2.25, 0.56, 2.35, hex_rgb("#0284C7"), alpha=0.72, roughness=0.18, flags=FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED).transformed(pos=(1.85, 0.22, 0.0)))
            meshes.append(self.props.pulse_stream_along_path([(-1.75, 1.38, 0.35), (-0.55, 0.06, 0.35), (0.25, 0.42, 0.35), (2.25, 0.35, 0.35)], 9, 2.4, t, radius=0.065, color_hex="#E0F2FE", emission=3.4))
            if r > 0.54:
                meshes.append(self.props.green_check.transformed(pos=(1.45, 0.92, 0.35), scale=0.62, rot=(0.0, t * 1.6, 0.0)))
            # Hydraulic Engineers observing from riverside platform
            meshes.append(HumanRigV3.build(pos=(-0.55, -0.30, 1.68), rot_y=0.22, scale=1.02, role="engineer", point_arm=smoothstep(0.22, 0.36, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(0.55, -0.30, 1.72), rot_y=-0.25, scale=1.00, role="civilian_m", jacket_hex="#10B981", wave_cta=cta_u, time_s=t))

            c0, g0 = (0.15, 1.55, 4.45), (-0.15, 0.35, 0.0)
            c1, g1 = (0.45, 1.05, 3.45), (0.15, 0.25, 0.0)
            c2, g2 = (-0.25, 0.95, 3.25), (0.05, 0.22, 0.0)
            c3, g3 = (0.05, 1.45, 4.35), (0.0, 0.35, 0.2)

        else:  # KT-S14: Aircraft Wheel Carbon Brake & Melting Thermal Fusible Plug
            meshes.append(self.s14_static)
            heat_u = smoothstep(0.18, 0.48, r)
            melt_u = smoothstep(0.54, 0.66, r)
            deflate = smoothstep(0.58, 0.76, r)
            cut_alpha = lerp(1.0, 0.18, smoothstep(0.20, 0.32, r))
            wheel_spin = t * 6.0 * (1.0 - smoothstep(0.05, 0.30, r))
            tire_sy = 1.0 - 0.24 * deflate
            tire_sx = 1.0 + 0.14 * deflate
            # Back tire half + Cutaway front tire half
            meshes.append(
                make_cylinder(0.86, 0.86, 0.44, hex_rgb("#1E293B"), segments=24, roughness=0.78).transformed(
                    pos=(0.0, 0.88 - 0.18 * deflate, -0.14), rot=(math.pi * 0.5, 0.0, wheel_spin), scale=(tire_sx, tire_sy, 1.0)
                )
            )
            if cut_alpha > 0.05:
                fl = FLAG_DEFAULT if cut_alpha >= 0.98 else (FLAG_RECV_SHADOW | FLAG_DOUBLE_SIDED)
                meshes.append(
                    make_cylinder(0.86, 0.86, 0.26, hex_rgb("#334155"), segments=24, alpha=cut_alpha, roughness=0.75, flags=fl).transformed(
                        pos=(0.0, 0.88 - 0.18 * deflate, 0.20), rot=(math.pi * 0.5, 0.0, wheel_spin), scale=(tire_sx, tire_sy, 1.0)
                    )
                )
            # Open-spoked Aluminum Wheel Hub + Glowing Multi-Disc Carbon Brake Stack clearly visible inside!
            wy_c = 0.88 - 0.18 * deflate
            meshes.append(make_cylinder(0.18, 0.18, 0.52, hex_rgb("#CBD5E1"), segments=16, roughness=0.25).transformed(pos=(0.0, wy_c, 0.04), rot=(math.pi * 0.5, 0.0, 0.0)))
            for sp_i in range(5):
                sa = wheel_spin + 2.0 * math.pi * sp_i / 5.0
                meshes.append(
                    make_beveled_box(0.065, 0.44, 0.04, hex_rgb("#E2E8F0"), bevel=0.008, roughness=0.25).transformed(
                        pos=(math.cos(sa) * 0.24, wy_c + math.sin(sa) * 0.24, 0.24), rot=(0.0, 0.0, sa - math.pi * 0.5)
                    )
                )
            disc_col = lerp3(hex_rgb("#64748B"), hex_rgb("#FF4500"), heat_u)
            for dk in range(5):
                meshes.append(
                    make_cylinder(0.42, 0.42, 0.045, disc_col, segments=20, emission=4.4 * heat_u, roughness=0.35).transformed(
                        pos=(0.0, wy_c, -0.10 + dk * 0.075), rot=(math.pi * 0.5, 0.0, 0.0)
                    )
                )
            if heat_u > 0.2:
                pls.append((0.0, 0.85, 0.35, 1.0, 0.38, 0.08, 3.4, 1.05 * heat_u))
            # 3 Brass Thermal Fusible Plugs on wheel rim -> alloy core melts & vents safe nitrogen plume!
            for pk, pang in enumerate((-0.55, 0.35, 2.25)):
                px = math.cos(pang) * 0.42
                py = (0.88 - 0.18 * deflate) + math.sin(pang) * 0.42
                meshes.append(make_cylinder(0.055, 0.055, 0.12, hex_rgb("#D97706"), segments=10, roughness=0.25).transformed(pos=(px, py, 0.26), rot=(math.pi * 0.5, 0.0, 0.0)))
                if melt_u < 0.65:
                    meshes.append(make_icosphere(0.036 * (1.0 - 0.6 * melt_u), hex_rgb("#FACC15"), subdivisions=1, emission=2.5 * heat_u).transformed(pos=(px, py, 0.33)))
                elif pk == 0:
                    # Controlled nitrogen gas venting stream!
                    meshes.append(self.props.pulse_stream_along_path([(px, py, 0.34), (px + 0.55, py - 0.25, 0.55)], 6, 2.8, t, radius=0.058, color_hex="#E0F2FE", emission=3.4))
            # Pressure Gauge on left showing pressure rise then controlled drop!
            p_val = lerp(0.28, 0.92, heat_u) * (1.0 - 0.65 * deflate)
            meshes.append(PrecisionMechV3.pressure_gauge(0.24, needle_norm=p_val, danger=(heat_u > 0.6 and deflate < 0.3)).transformed(pos=(-1.15, 1.35, 0.20)))
            if deflate > 0.4:
                meshes.append(self.props.green_check.transformed(pos=(0.75, 1.58, 0.30), scale=0.62, rot=(0.0, t * 1.6, 0.0)))
            # Aircraft Maintenance Engineer & Ramp Crew at safe distance
            meshes.append(HumanRigV3.build(pos=(-1.38, 0.0, 0.85), rot_y=0.38, scale=1.05, role="engineer", point_arm=smoothstep(0.22, 0.36, r) * (1.0 - cta_u), wave_cta=cta_u, holding_tablet=True, time_s=t))
            meshes.append(HumanRigV3.build(pos=(1.38, 0.0, 0.88), rot_y=-0.40, scale=1.05, role="captain", jacket_hex="#1E3A8A", wave_cta=cta_u, time_s=t))

            c0, g0 = (0.0, 1.38, 3.75), (0.0, 0.92, 0.10)
            c1, g1 = (0.42, 1.18, 2.85), (0.05, 0.88, 0.15)
            c2, g2 = (-0.35, 1.22, 3.15), (-0.15, 0.92, 0.20)
            c3, g3 = (0.0, 1.48, 3.95), (0.0, 0.95, 0.20)

        # Smooth 4-Act Multi-Shot Camera Choreography (slightly wider Z framing so all V3 characters & buildings shine!)
        c0 = (c0[0], c0[1], c0[2] + 0.35)
        c1 = (c1[0], c1[1], c1[2] + 0.45)
        c2 = (c2[0], c2[1], c2[2] + 0.45)
        c3 = (c3[0], c3[1], c3[2] + 0.35)
        if r < 0.24:
            u = smoothstep(0.0, 0.24, r)
            cam_pos = lerp3((c0[0] - 0.22, c0[1] + 0.10, c0[2] + 0.25), c0, u)
            cam_tgt, fov = g0, 43.0
        elif r < 0.52:
            u = smoothstep(0.24, 0.32, r)
            cam_pos, cam_tgt, fov = lerp3(c0, c1, u), lerp3(g0, g1, u), 40.5
        elif r < 0.80:
            u = smoothstep(0.52, 0.60, r)
            cam_pos, cam_tgt, fov = lerp3(c1, c2, u), lerp3(g1, g2, u), 41.5
        else:
            u = smoothstep(0.80, 0.86, r)
            cam_pos, cam_tgt, fov = lerp3(c2, c3, u), lerp3(g2, g3, u), 44.5

        cam_pos = (cam_pos[0] + 0.022 * math.sin(t * 1.15), cam_pos[1] + 0.016 * math.cos(t * 0.95), cam_pos[2])
        frame_raw = self.renderer.render(
            Mesh.merge(meshes),
            cam_pos,
            cam_tgt,
            fov,
            sun_dir=(0.42, 0.82, 0.38),
            sun_rgb=sun_rgb,
            sky_amb=sky_amb,
            gnd_amb=gnd_amb,
            bg_top=bg_top,
            bg_bot=bg_bot,
            point_lights=pls if pls else None,
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
