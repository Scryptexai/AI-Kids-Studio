import math
from typing import List, Sequence, Tuple

import numpy as np

from src.assets_ep02 import Episode2Assets, make_3d_double_arrow
from src.overlays import Callout3D, OverlayCompositor, SubtitleChunk, smoothstep
from src.renderer3d import Mesh, SceneRenderer, hex_rgb


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp3(a: Tuple[float, float, float], b: Tuple[float, float, float], t: float) -> Tuple[float, float, float]:
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


class Episode2Director:
    """Frame-accurate 3D animation, geometry simulation, cutaway & UI director for Episode 2 (Manhole Cover)."""

    def __init__(self, subtitles: Sequence[SubtitleChunk], ssaa: float = 1.18):
        self.renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=ssaa, shadow_res=1024)
        self.assets = Episode2Assets()
        self.subtitles = list(subtitles)

        self.compositor = OverlayCompositor(
            width=1080,
            height=1920,
            seg_names={
                1: "EP.02 • KENAPA SELALU BULAT?",
                2: "02 • BAHAYA TUTUP PERSEGI",
                3: "03 • RAHASIA GEOMETRI BULAT",
                4: "04 • MUDAH DIGELINDINGKAN!",
            },
            hook_sub="COBA PERHATIKAN JALANAN KOTA",
            hook_main="KENAPA TUTUPNYA BULAT?",
            cta_start=51.85,
            cta_q1="Di kotamu pernah lihat tutup",
            cta_q2="gorong-gorong bentuk apa?",
            cta_opt_left="SELALU BULAT",
            cta_opt_right="PERNAH KOTAK",
        )

        self.sun_dir = (0.42, 0.82, 0.38)
        self.sun_rgb = (0.78, 0.76, 0.70)
        self.sky_amb = (0.54, 0.60, 0.70)
        self.gnd_amb = (0.35, 0.35, 0.39)
        self.bg_top = (0.24, 0.48, 0.78)
        self.bg_bot = (0.56, 0.77, 0.94)
        self.chamber_lights = [(0.0, -1.25, 2.85, 0.95, 0.95, 1.0, 4.2, 0.62)]

        self.callouts: List[Callout3D] = [
            Callout3D(4.35, 5.85, (0.45, 0.05, 2.0), (540, 275), "HAMPIR SEMUA BULAT!", "Standar Gorong-Gorong di Seluruh Dunia", (255, 230, 0)),
            Callout3D(6.05, 9.75, (1.25, 0.65, 2.0), (540, 275), "KENAPA NGGAK KOTAK / SEGITIGA?", "Bukannya Lebih Gampang Dibuat?", (56, 189, 248)),
            Callout3D(17.65, 19.72, (0.0, 0.08, 2.60), (540, 270), "LEBAR SISI = 100 CM", "Ukuran Sisi Tutup & Lubang Sama", (0, 245, 136)),
            Callout3D(19.78, 23.25, (0.25, 0.12, 2.25), (540, 270), "DIAGONAL = 141 CM!", "41% Lebih Panjang dari Sisinya!", (255, 58, 76)),
            Callout3D(23.45, 25.40, (0.0, -1.05, 2.05), (540, 265), "BAHAYA! LOLOS JATUH!", "Muat Masuk Saat Miring 45° Diagonal", (255, 58, 76)),
            Callout3D(26.95, 31.70, (0.0, 0.72, 2.0), (540, 265), "DIAMETER SELALU SAMA!", "Ø 105 CM dari Sudut Mana Pun", (0, 228, 255)),
            Callout3D(31.80, 38.80, (0.48, -0.04, 2.0), (540, 265), "MENTOK DI BIBIR LUBANG!", "Rim Dalam Ø 100 CM (5 CM Lebih Kecil)", (255, 230, 0)),
            Callout3D(39.85, 43.65, (0.88, 0.12, 1.50), (540, 275), "BERAT: 50 – 80 KG!", "Besi Cor Tebal Biar Kuat Dilindas Truk", (255, 184, 0)),
            Callout3D(44.65, 51.55, (0.88, 0.85, 3.25), (540, 275), "TINGGAL DIGELINDINGKAN!", "Seperti Roda • Nggak Perlu Diangkat", (0, 245, 136)),
        ]

    def _segment_index(self, t: float) -> int:
        if t < 10.00: return 1
        if t < 25.50: return 2
        if t < 39.50: return 3
        return 4

    def _compute_camera(self, t: float):
        p_ped, t_ped = (2.15, 1.95, 6.20), (-0.20, 0.55, 1.85)
        p_top, t_top = (0.0, 6.65, 3.65), (0.0, 0.0, 2.00)
        p_sq_iso, t_sq_iso = (1.65, 4.15, 6.25), (0.0, 0.10, 2.00)
        p_sq_drop, t_sq_drop = (0.95, 1.55, 6.95), (0.0, -1.15, 2.00)
        p_rnd, t_rnd = (1.45, 3.45, 5.75), (0.0, 0.12, 2.00)
        p_rs, t_rs = (3.55, 2.55, 6.25), (0.0, 0.65, 2.15)
        p_re, t_re = (3.75, 2.85, 8.15), (0.0, 0.72, 3.85)
        p_out, t_out = (3.95, 3.45, 8.65), (0.0, 0.85, 3.65)

        if t < 10.00:
            u = smoothstep(1.85, 3.25, t)
            pos, tgt, fov = lerp3(p_ped, p_top, u), lerp3(t_ped, t_top, u), lerp(45.0, 42.0, u)
        elif t < 22.60:
            u = smoothstep(10.00, 11.40, t)
            pos, tgt, fov = lerp3(p_top, p_sq_iso, u), lerp3(t_top, t_sq_iso, u), lerp(42.0, 43.5, u)
        elif t < 25.50:
            u = smoothstep(22.60, 23.65, t)
            pos, tgt, fov = lerp3(p_sq_iso, p_sq_drop, u), lerp3(t_sq_iso, t_sq_drop, u), 44.5
            if 24.24 <= t <= 24.68:
                sh = 0.13 * math.exp(-(t - 24.24) * 9.5) * math.sin((t - 24.24) * 62.0)
                pos = (pos[0] + sh * 0.6, pos[1] + sh, pos[2])
        elif t < 39.50:
            u = smoothstep(25.50, 26.80, t)
            pos, tgt, fov = lerp3(p_sq_drop, p_rnd, u), lerp3(t_sq_drop, t_rnd, u), lerp(44.5, 42.5, u)
            for imp_t in (32.10, 34.00, 35.90):
                if imp_t <= t <= imp_t + 0.25:
                    pos = (pos[0], pos[1] + 0.05 * math.exp(-(t - imp_t) * 14.0) * math.sin((t - imp_t) * 70.0), pos[2])
        elif t < 51.85:
            u1, u2 = smoothstep(39.50, 40.90, t), smoothstep(44.50, 51.50, t)
            pos = lerp3(lerp3(p_rnd, p_rs, u1), p_re, u2)
            tgt = lerp3(lerp3(t_rnd, t_rs, u1), t_re, u2)
            fov = 44.0
        else:
            u = smoothstep(51.85, 55.50, t)
            pos, tgt, fov = lerp3(p_re, p_out, u), lerp3(t_re, t_out, u), 44.5

        pos = (pos[0] + 0.025 * math.sin(t * 1.15), pos[1] + 0.02 * math.cos(t * 0.95), pos[2])
        return pos, tgt, fov

    def render_frame(self, t: float) -> np.ndarray:
        seg_idx = self._segment_index(t)
        cam_pos, cam_tgt, fov = self._compute_camera(t)
        meshes: List[Mesh] = [self.assets.static_street]
        pls = []

        hole_shape = "square" if (14.40 <= t < 25.55) else "round"
        if t < 10.20:
            cut_alpha = 1.0
        elif t < 11.40:
            cut_alpha = lerp(1.0, 0.16, smoothstep(10.20, 11.40, t))
        elif t < 38.40:
            cut_alpha = 0.16
        elif t < 39.50:
            cut_alpha = lerp(0.16, 1.0, smoothstep(38.40, 39.50, t))
        else:
            cut_alpha = 1.0

        rim_hi = smoothstep(26.20, 27.00, t) * (1.0 - smoothstep(38.50, 39.20, t)) if (26.20 <= t <= 39.20) else 0.0
        if cut_alpha < 0.99:
            meshes.append(self.assets.underground_chamber)
            pls.extend(self.chamber_lights)

        meshes.append(self.assets.build_surface_around_hole(shape=hole_shape, front_cutaway_alpha=cut_alpha, rim_highlight=rim_hi))

        if t < 14.40:
            meshes.append(self.assets.round_cover_mesh.transformed(pos=(0.0, -0.005, 2.0)))
            if t < 10.20:
                out_a = smoothstep(0.6, 1.4, t) * (1.0 - smoothstep(9.6, 10.2, t))
                if out_a > 0.05:
                    meshes.append(self.assets.round_outline_ring.with_material(emission=2.8 * out_a).transformed(pos=(0.0, 0.0, 2.0)))
            if t < 7.80:
                meshes.append(self.assets.build_character_blocky(pos=(-1.05, 0.0, lerp(-1.4, 5.2, t / 7.80)), walk_phase=t * 7.2, walk_amp=1.0))
            if 5.85 <= t <= 9.95:
                meshes.append(self.assets.build_comparison_holograms(smoothstep(5.85, 6.35, t) * (1.0 - smoothstep(9.50, 9.95, t)), t))

        if 10.20 <= t <= 39.20:
            duck_t = smoothstep(24.18, 24.30, t) * (1.0 - smoothstep(25.35, 25.55, t))
            meshes.append(
                self.assets.build_character_blocky(
                    pos=(0.0, -2.64, 2.05), walk_amp=0.0, hard_hat=True,
                    duck_t=duck_t, dizzy_stars=(24.26 <= t <= 25.48), time_s=t, shirt_hex="#F97316",
                )
            )

        if 14.40 <= t < 25.55:
            if t < 16.40:
                sq_y, sq_rx, sq_ry = lerp(0.0, 1.15, smoothstep(14.55, 16.20, t)), 0.0, 0.0
            elif t < 22.45:
                sq_y, sq_rx, sq_ry = 1.15 + 0.04 * math.sin(t * 3.0), lerp(0.0, 0.25, smoothstep(16.40, 17.50, t)), 0.0
            elif t < 23.35:
                u_rot = smoothstep(22.45, 23.30, t)
                sq_y, sq_rx, sq_ry = lerp(1.15, 0.85, u_rot), lerp(0.25, 1.52, u_rot), lerp(0.0, math.pi * 0.25, u_rot)
            elif t < 24.25:
                u_fall = (t - 23.35) / 0.90
                sq_y, sq_rx, sq_ry = lerp(0.85, -1.02, min(1.0, u_fall * u_fall)), 1.52, math.pi * 0.25
            else:
                dt_b = t - 24.25
                sq_y = -1.02 + 0.22 * abs(math.sin(dt_b * 7.5)) * math.exp(-dt_b * 3.2)
                sq_rx, sq_ry = 1.35 + 0.15 * math.exp(-dt_b * 4.0), math.pi * 0.25

            meshes.append(self.assets.square_cover_mesh.transformed(pos=(0.0, sq_y, 2.0), rot=(sq_rx, sq_ry, 0.0)))
            if 17.60 <= t <= 23.35:
                meshes.append(make_3d_double_arrow((-0.56, 0.06, 2.60), (0.56, 0.06, 2.60), color=hex_rgb("#00FF88"), shaft_r=0.032, emission=3.4))
            if 19.75 <= t <= 24.20:
                meshes.append(make_3d_double_arrow((-0.54, 0.08, 1.46), (0.54, 0.08, 2.54), color=hex_rgb("#FF2A44"), shaft_r=0.036, emission=3.8))

        if 25.55 <= t < 39.50:
            if t < 30.30:
                y_cov = lerp(0.05, 0.68, smoothstep(25.55, 26.50, t))
                rx_cov = 0.20 * smoothstep(26.50, 27.50, t)
                meshes.append(self.assets.round_cover_mesh.transformed(pos=(0.0, y_cov, 2.0), rot=(rx_cov, (t - 25.55) * 1.35, 0.0)))
                if t >= 26.80:
                    da = (t - 26.80) * 1.9
                    dx_a, dz_a = 0.53 * math.cos(da), 0.53 * math.sin(da)
                    meshes.append(make_3d_double_arrow((-dx_a, y_cov + 0.09, 2.0 - dz_a), (dx_a, y_cov + 0.09, 2.0 + dz_a), color=hex_rgb("#00E5FF"), shaft_r=0.030, emission=3.4))
            elif t < 37.20:
                y_cov = 0.86
                for imp_t in (32.10, 34.00, 35.90):
                    dist_t = abs(t - imp_t)
                    if dist_t < 0.75:
                        y_cov = min(y_cov, 0.86 - 0.39 * (math.cos((dist_t / 0.75) * (math.pi * 0.5)) ** 1.7))
                    if 0.0 <= (t - imp_t) <= 0.45:
                        meshes.append(self.assets.build_rim_sparks(t - imp_t, seed=int(imp_t * 10)))
                meshes.append(self.assets.round_cover_mesh.transformed(pos=(0.0, y_cov, 2.0), rot=(lerp(0.20, 1.38, smoothstep(30.30, 31.30, t)), (t - 30.30) * 1.65, 0.0)))
            else:
                u_s = smoothstep(37.20, 38.10, t)
                meshes.append(self.assets.round_cover_mesh.transformed(pos=(0.0, lerp(0.68, -0.005, u_s), 2.0), rot=(lerp(1.38, 0.0, u_s), 0.0, 0.0)))

        if t >= 39.50:
            meshes.append(self.assets.round_cover_mesh.transformed(pos=(0.0, -0.005, 2.0)))
            lane_x = 0.88
            if t < 43.75:
                meshes.append(self.assets.round_cover_mesh.transformed(pos=(lane_x, 0.04, 1.50)))
                meshes.append(self.assets.build_character_blocky(pos=(lane_x - 0.68, 0.0, 1.15), rot_y=0.68, walk_amp=0.0, hard_hat=True, shirt_hex="#F97316"))
            elif t < 44.60:
                u_t = smoothstep(43.75, 44.55, t)
                meshes.append(self.assets.round_cover_mesh.transformed(pos=(lane_x, lerp(0.04, 0.535, u_t), 1.50), rot=(0.0, 0.0, lerp(0.0, -math.pi * 0.5, u_t))))
                meshes.append(self.assets.build_character_blocky(pos=(lerp(lane_x - 0.68, lane_x, u_t), 0.0, lerp(1.15, 0.72, u_t)), rot_y=lerp(0.68, 0.0, u_t), walk_amp=0.0, pushing_mode=True, hard_hat=True, shirt_hex="#F97316"))
            else:
                u_r = smoothstep(44.60, 51.65, t)
                zw = lerp(1.50, 4.55, u_r)
                meshes.append(self.assets.round_cover_mesh.transformed(pos=(lane_x, 0.535, zw), rot=((zw - 1.50) / 0.535, 0.0, -math.pi * 0.5)))
                meshes.append(self.assets.build_character_blocky(pos=(lane_x, 0.0, zw - 0.78), walk_phase=(zw - 1.50) * 5.6, walk_amp=(1.0 if t < 51.65 else 0.0), pushing_mode=True, hard_hat=True, shirt_hex="#F97316"))

        scene_mesh = Mesh.merge(meshes)
        frame_3d = self.renderer.render(
            scene_mesh, cam_pos, cam_tgt, fov,
            sun_dir=self.sun_dir, sun_rgb=self.sun_rgb, sky_amb=self.sky_amb, gnd_amb=self.gnd_amb,
            bg_top=self.bg_top, bg_bot=self.bg_bot, point_lights=pls if pls else None,
        )
        active_callouts = [
            (c, self.renderer.project_point(c.world_target, cam_pos, cam_tgt, fov))
            for c in self.callouts if c.start <= t <= c.end
        ]
        return self.compositor.composite(frame_3d, t, seg_idx, self.subtitles, active_callouts)
