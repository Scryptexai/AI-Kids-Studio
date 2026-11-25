import math
from typing import List, Sequence, Tuple

import numpy as np

from src.assets_ep02 import make_3d_double_arrow
from src.assets_ep03 import Episode3Assets
from src.overlays import Callout3D, OverlayCompositor, SubtitleChunk, smoothstep
from src.renderer3d import Mesh, SceneRenderer, hex_rgb, make_beveled_box


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp3(a: Tuple[float, float, float], b: Tuple[float, float, float], t: float) -> Tuple[float, float, float]:
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


class Episode3Director:
    """Frame-accurate 3D animation, hydrostatic cutaway & UI director for Episode 3 (Water Tower)."""

    def __init__(self, subtitles: Sequence[SubtitleChunk], ssaa: float = 1.18):
        self.renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=ssaa, shadow_res=1024)
        self.assets = Episode3Assets()
        self.subtitles = list(subtitles)

        self.compositor = OverlayCompositor(
            width=1080,
            height=1920,
            seg_names={
                1: "EP.03 • LISTRIK MATI, AIR JALAN?",
                2: "02 • POMPA MALAM & GRAVITASI",
                3: "03 • TEKANAN 30 METER = 3 BAR",
                4: "04 • BATERAI AIR SATU KOTA",
            },
            hook_sub="LISTRIK RUMAH MATI TOTAL...",
            hook_main="KOK AIR PDAM TETAP NGALIR?",
            cta_start=53.50,
            cta_q1="Di rumahmu pakai air PDAM",
            cta_q2="atau pompa sumur sendiri?",
            cta_opt_left="PDAM / MENARA",
            cta_opt_right="POMPA SUMUR",
        )
        self.sun_dir = (0.40, 0.82, 0.40)

        self.callouts: List[Callout3D] = [
            Callout3D(3.10, 7.05, (1.39, 0.72, 0.12), (540, 275), "LISTRIK MATI, KERAN LANCAR!", "Air Mengalir Deras Tanpa Listrik Rumah", (0, 228, 255)),
            Callout3D(7.95, 11.20, (-1.75, 3.85, 0.0), (540, 275), "RAHASIANYA: MENARA AIR!", "Penyimpan Energi Gravitasi Raksasa", (255, 230, 0)),
            Callout3D(12.10, 16.55, (-1.75, 3.70, 0.0), (540, 270), "MURNI TENAGA GRAVITASI!", "Nggak Butuh Listrik Saat Dorong Air", (56, 189, 248)),
            Callout3D(17.00, 23.70, (-2.73, 2.85, 0.22), (540, 270), "POMPA NAIK TENGAH MALAM", "Listrik Cuma Dipakai Sekali Isi Tangki", (0, 245, 136)),
            Callout3D(24.60, 29.40, (-1.75, 3.45, 0.0), (540, 265), "BERAT AIR MENEKAN KE BAWAH", "Menciptakan Tekanan Hidrostatis Besar", (0, 228, 255)),
            Callout3D(29.65, 34.25, (-0.52, 2.35, 0.25), (540, 265), "± 30 METER = 3 BAR!", "Setiap 10 Meter Ketinggian +1 Bar", (255, 230, 0)),
            Callout3D(34.55, 41.55, (1.39, 2.02, 0.12), (540, 265), "KUAT SAMPAI LANTAI DUA!", "Otomatis Terdorong Lewat Pipa Bawah Tanah", (0, 228, 255)),
            Callout3D(42.45, 49.70, (-0.10, 1.15, 0.65), (540, 270), "TANPA MENARA: POMPA JEBOL!", "Overload Saat Jam Sibuk Pagi Hari", (255, 58, 76)),
            Callout3D(50.05, 53.40, (-1.75, 4.15, 0.0), (540, 270), "SISTEM STABIL: BATERAI AIR!", "Cadangan Tekanan Aman Buat Satu Kota", (0, 245, 136)),
        ]

    def _segment_index(self, t: float) -> int:
        if t < 11.40: return 1
        if t < 24.00: return 2
        if t < 41.80: return 3
        return 4

    def _compute_camera(self, t: float):
        p_hh, t_hh = (1.15, 1.95, 5.55), (1.10, 0.95, -0.20)
        p_sz, t_sz = (1.42, 1.25, 3.65), (1.38, 0.72, 0.05)
        p_cw, t_cw = (0.05, 3.15, 8.85), (-0.25, 2.25, 0.00)
        p_tc, t_tc = (-1.65, 3.35, 6.15), (-1.85, 2.75, 0.00)
        p_ru, t_ru = (-1.05, 2.75, 7.55), (-1.30, 2.35, 0.00)
        p_pn, t_pn = (0.05, 2.15, 7.95), (0.05, 1.05, 0.05)
        p_pm, t_pm = (0.35, 1.65, 4.75), (0.15, 0.75, 0.35)
        p_ou, t_ou = (0.05, 3.35, 9.15), (-0.15, 2.35, 0.00)

        if t < 2.60:
            u = smoothstep(0.0, 2.40, t)
            pos, tgt, fov = lerp3((0.85, 2.35, 6.45), p_hh, u), lerp3((0.75, 1.10, -0.40), t_hh, u), 44.0
        elif t < 7.25:
            u = smoothstep(2.60, 4.10, t)
            pos, tgt, fov = lerp3(p_hh, p_sz, u), lerp3(t_hh, t_sz, u), lerp(44.0, 41.5, u)
        elif t < 11.40:
            u = smoothstep(7.25, 8.65, t)
            pos, tgt, fov = lerp3(p_sz, p_cw, u), lerp3(t_sz, t_cw, u), lerp(41.5, 45.0, u)
        elif t < 24.00:
            u = smoothstep(11.40, 12.80, t)
            pos, tgt, fov = lerp3(p_cw, p_tc, u), lerp3(t_cw, t_tc, u), lerp(45.0, 43.0, u)
        elif t < 34.25:
            u = smoothstep(24.00, 25.40, t)
            pos, tgt, fov = lerp3(p_tc, p_ru, u), lerp3(t_tc, t_ru, u), 44.0
        elif t < 41.80:
            u = smoothstep(34.25, 35.65, t)
            pos, tgt, fov = lerp3(p_ru, p_pn, u), lerp3(t_ru, t_pn, u), 45.0
        elif t < 49.85:
            u = smoothstep(41.80, 43.00, t)
            pos, tgt, fov = lerp3(p_pn, p_pm, u), lerp3(t_pn, t_pm, u), 43.5
            if 48.35 <= t <= 48.95:
                sh = 0.08 * math.exp(-(t - 48.35) * 7.0) * math.sin((t - 48.35) * 65.0)
                pos = (pos[0] + sh, pos[1] + sh * 0.7, pos[2])
        else:
            u1, u2 = smoothstep(49.85, 51.25, t), smoothstep(53.40, 58.50, t)
            pos = lerp3(lerp3(p_pm, p_cw, u1), p_ou, u2)
            tgt = lerp3(lerp3(t_pm, t_cw, u1), t_ou, u2)
            fov = 45.0

        pos = (pos[0] + 0.025 * math.sin(t * 1.1), pos[1] + 0.02 * math.cos(t * 0.9), pos[2])
        return pos, tgt, fov

    def _compute_lighting(self, t: float):
        day_sun, day_sky, day_gnd, day_top, day_bot = (0.78, 0.76, 0.70), (0.54, 0.60, 0.70), (0.35, 0.35, 0.39), (0.24, 0.48, 0.78), (0.56, 0.77, 0.94)
        dusk_sun, dusk_sky, dusk_gnd, dusk_top, dusk_bot = (0.48, 0.52, 0.65), (0.40, 0.46, 0.60), (0.28, 0.30, 0.36), (0.12, 0.20, 0.38), (0.26, 0.38, 0.58)
        dusk_amt = 0.0
        if t < 11.40:
            dusk_amt = 1.0 - smoothstep(8.50, 11.00, t)
        elif 16.50 <= t <= 24.40:
            dusk_amt = smoothstep(16.50, 17.80, t) * (1.0 - smoothstep(23.20, 24.40, t))
        return (
            lerp3(day_sun, dusk_sun, dusk_amt),
            lerp3(day_sky, dusk_sky, dusk_amt),
            lerp3(day_gnd, dusk_gnd, dusk_amt),
            lerp3(day_top, dusk_top, dusk_amt),
            lerp3(day_bot, dusk_bot, dusk_amt),
        )

    def render_frame(self, t: float) -> np.ndarray:
        seg_idx = self._segment_index(t)
        cam_pos, cam_tgt, fov = self._compute_camera(t)
        sun_rgb, sky_amb, gnd_amb, bg_top, bg_bot = self._compute_lighting(t)

        meshes: List[Mesh] = [self.assets.diorama_base, self.assets.hero_house_cutaway]
        pls = []

        if t < 1.45: power_on = 1.0
        elif t < 1.60: power_on = 1.0 - (t - 1.45) / 0.15
        elif t < 24.50: power_on = 0.0
        else: power_on = 0.35
        meshes.append(self.assets.build_mini_city_houses(power_on=power_on))

        if 33.80 <= t <= 42.10:
            cut_alpha = lerp(1.0, 0.16, smoothstep(33.80, 34.80, t) * (1.0 - smoothstep(41.30, 42.10, t)))
        elif t >= 50.00:
            cut_alpha = lerp(1.0, 0.35, smoothstep(50.00, 51.00, t))
        else:
            cut_alpha = 1.0
        if cut_alpha >= 0.99:
            meshes.append(self.assets.build_front_ground_cutaway(cutaway_alpha=cut_alpha))

        show_tower = not (42.30 <= t < 49.85)
        if show_tower:
            meshes.append(self.assets.water_tower_structure)
            if t < 11.40: fill_frac = 0.85
            elif t < 17.00: fill_frac = lerp(0.85, 0.18, smoothstep(11.40, 13.00, t))
            elif t < 24.00: fill_frac = lerp(0.18, 0.96, smoothstep(17.00, 22.80, t))
            elif t < 41.80: fill_frac = lerp(0.96, 0.78, smoothstep(34.50, 41.50, t))
            else: fill_frac = 0.88
            meshes.append(self.assets.build_tank_water(fill_frac=fill_frac, time_s=t))

        inlet_hi = smoothstep(16.70, 17.30, t) * (1.0 - smoothstep(23.40, 24.00, t))
        outlet_hi = smoothstep(34.10, 34.80, t) * (1.0 - smoothstep(41.30, 41.80, t)) if (34.10 <= t <= 41.80) else (smoothstep(49.90, 50.60, t) if t >= 49.90 else 0.0)
        if show_tower:
            meshes.append(
                self.assets.build_pipes_and_pulses(
                    inlet_highlight=inlet_hi, outlet_highlight=outlet_hi,
                    pump_pulses=(16.90 <= t <= 23.20),
                    gravity_pulses=((34.30 <= t <= 41.70) or (t >= 50.10)),
                    time_s=t,
                )
            )

        if 24.40 <= t <= 29.55:
            bob = 0.06 * math.sin(t * 6.0)
            meshes.append(make_3d_double_arrow((-1.75, 4.35 + bob, 0.45), (-1.75, 3.18 + bob, 0.45), color=hex_rgb("#00E5FF"), shaft_r=0.042, emission=3.6))
        if 29.60 <= t <= 34.40:
            rx_bar = -0.52
            meshes.append(make_3d_double_arrow((rx_bar, 0.08, 0.25), (rx_bar, 4.42, 0.25), color=hex_rgb("#FFE600"), shaft_r=0.036, emission=3.6))
            for k in (1, 2, 3):
                meshes.append(make_beveled_box(0.28, 0.045, 0.045, hex_rgb("#FFE600"), bevel=0.01, emission=3.4).transformed(pos=(rx_bar, 0.08 + (4.34 * k / 3.0), 0.25)))

        if 41.80 <= t < 49.95:
            meshes.append(self.assets.build_electric_pump_overload(overload_amt=smoothstep(43.40, 45.80, t), time_s=t))
            if t >= 47.60:
                meshes.append(self.assets.red_cross_3d.transformed(pos=(-0.10, 1.35, 0.65), rot=(0.0, 0.15 * math.sin(t * 5.0), 0.0), scale=smoothstep(47.60, 48.00, t)))

        if t >= 50.05:
            meshes.append(self.assets.green_check_3d.transformed(pos=(-0.55, 3.85 + 0.05 * math.sin(t * 3.0), 0.35), scale=smoothstep(50.05, 50.55, t) * 1.15))

        f1_flow, f2_flow = 0.0, 0.0
        if t < 11.40: f1_flow = 1.0
        elif 34.60 <= t <= 41.80: f1_flow, f2_flow = smoothstep(34.60, 35.20, t), smoothstep(37.60, 38.40, t)
        elif 42.00 <= t < 47.50: f1_flow = max(0.0, 0.45 * (1.0 - smoothstep(45.50, 47.40, t)) * (0.5 + 0.5 * math.sin(t * 22.0)))
        elif t >= 50.20: f1_flow, f2_flow = 1.0, 1.0

        if f1_flow > 0.04 or f2_flow > 0.04:
            meshes.append(self.assets.build_faucet_streams(floor1_flow=f1_flow, floor2_flow=f2_flow, time_s=t))
            pls.append((1.39, 0.72, 0.35, 0.0, 0.85, 1.0, 2.2, 0.55 * f1_flow))
            if f2_flow > 0.04:
                pls.append((1.39, 1.98, 0.35, 0.0, 0.85, 1.0, 2.2, 0.55 * f2_flow))

        if cut_alpha < 0.99:
            meshes.append(self.assets.build_front_ground_cutaway(cutaway_alpha=cut_alpha))
        if show_tower:
            meshes.append(self.assets.water_tower_glass)

        scene_mesh = Mesh.merge(meshes)
        frame_3d = self.renderer.render(
            scene_mesh, cam_pos, cam_tgt, fov,
            sun_dir=self.sun_dir, sun_rgb=sun_rgb, sky_amb=sky_amb, gnd_amb=gnd_amb,
            bg_top=bg_top, bg_bot=bg_bot, point_lights=pls if pls else None,
        )
        active_callouts = [
            (c, self.renderer.project_point(c.world_target, cam_pos, cam_tgt, fov))
            for c in self.callouts if c.start <= t <= c.end
        ]
        return self.compositor.composite(frame_3d, t, seg_idx, self.subtitles, active_callouts)
