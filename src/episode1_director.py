import math
from typing import List, Sequence, Tuple

import numpy as np

from src.assets3d import AssetLibrary
from src.overlays import Callout3D, OverlayCompositor, SubtitleChunk, smoothstep
from src.renderer3d import Mesh, SceneRenderer


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp3(a: Tuple[float, float, float], b: Tuple[float, float, float], t: float) -> Tuple[float, float, float]:
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


class Episode1Director:
    """Frame-accurate 3D animation, cutaway & UI director for Episode 1 (Inductive Loop Sensor)."""

    def __init__(self, subtitles: Sequence[SubtitleChunk], ssaa: float = 1.18):
        self.renderer = SceneRenderer(out_w=1080, out_h=1920, ssaa=ssaa, shadow_res=1024)
        self.assets = AssetLibrary()
        self.subtitles = list(subtitles)
        self.compositor = OverlayCompositor(width=1080, height=1920)

        self.sun_dir = (-0.35, 0.85, 0.40)
        self.sun_rgb = (0.42, 0.48, 0.62)
        self.sky_amb = (0.34, 0.40, 0.54)
        self.gnd_amb = (0.24, 0.26, 0.34)
        self.bg_top = (0.07, 0.11, 0.22)
        self.bg_bot = (0.16, 0.24, 0.40)

        self.callouts: List[Callout3D] = [
            Callout3D(12.2, 16.0, (-1.95, 4.45, 1.80), (540, 275), "BUKAN KAMERA CCTV!", "Tidak Ada Sensor Kamera di Atas", (255, 58, 76)),
            Callout3D(22.5, 31.8, (-1.35, -0.14, 3.45), (540, 270), "INDUCTIVE LOOP", "Kabel Tembaga Berarus Listrik", (255, 184, 0)),
            Callout3D(33.8, 41.2, (-1.35, 0.42, 3.45), (540, 270), "GANGGUAN MEDAN MAGNET", "Logam Mesin Mengubah Frekuensi", (255, 90, 36)),
            Callout3D(47.2, 54.8, (-0.80, 0.55, 3.45), (540, 270), "LOGAM TERLALU TIPIS!", "Sepeda Kadang Tidak Terbaca Sensor", (56, 189, 248)),
        ]

    def _segment_index(self, t: float) -> int:
        if t < 9.5: return 1
        if t < 19.0: return 2
        if t < 32.5: return 3
        if t < 46.5: return 4
        return 5

    def _compute_camera(self, t: float):
        if t < 9.5:
            u = smoothstep(0.0, 8.5, t)
            return lerp3((1.4, 4.8, 9.2), (0.6, 3.2, 7.2), u), (-1.35, 1.2, 2.6), 44.0
        if t < 16.2:
            u = smoothstep(9.5, 11.2, t)
            return lerp3((0.6, 3.2, 7.2), (-0.4, 3.9, 5.6), u), (-1.65, 4.1, 1.7), 43.0
        if t < 32.5:
            u = smoothstep(16.2, 18.2, t)
            return lerp3((-0.4, 3.9, 5.6), (0.45, 2.55, 6.45), u), (-1.35, 0.05, 3.35), 43.0
        if t < 46.5:
            u = smoothstep(40.5, 43.0, t)
            return lerp3((0.45, 2.55, 6.45), (0.95, 3.65, 8.25), u), lerp3((-1.35, 0.05, 3.35), (-1.65, 1.65, 2.55), u), 44.5
        return (0.85, 3.85, 8.45), (-1.25, 0.85, 3.15), 45.0

    def render_frame(self, t: float) -> np.ndarray:
        seg = self._segment_index(t)
        cam_pos, cam_tgt, fov = self._compute_camera(t)
        meshes: List[Mesh] = [self.assets.static_world]

        light_state = "green" if (6.8 <= t < 9.5 or 43.2 <= t < 46.5) else "red"
        meshes.append(self.assets.build_traffic_bulbs(active=light_state))

        cut_open = 17.5 <= t <= 46.2
        asphalt_alpha = 0.24 if cut_open else 1.0
        if cut_open:
            meshes.append(self.assets.cutaway_interior)
            meshes.append(self.assets.conduit_static)
            meshes.append(self.assets.build_copper_coil(highlight=1.0))

        if 11.2 <= t <= 16.2:
            meshes.append(self.assets.cctv_icon)
            if t >= 13.6:
                meshes.append(self.assets.red_cross)

        if t < 9.5:
            sz = lerp(6.8, 3.45, smoothstep(0.5, 3.8, t)) if t < 7.2 else lerp(3.45, -2.5, smoothstep(7.2, 9.4, t))
            meshes.append(self.assets.build_scooter_with_rider(sz, metal_highlight=0.0))
        elif 32.5 <= t < 46.5:
            sz = lerp(6.8, 3.45, smoothstep(32.8, 35.8, t)) if t < 43.6 else lerp(3.45, -1.8, smoothstep(43.6, 46.4, t))
            m_hi = smoothstep(35.0, 36.0, t) * (1.0 - smoothstep(43.5, 44.2, t))
            meshes.append(self.assets.build_scooter_with_rider(sz, metal_highlight=m_hi))
        elif 46.5 <= t < 53.5:
            bz = lerp(6.8, -1.5, (t - 46.5) / 7.0)
            meshes.append(self.assets.build_bicycle_with_rider(bz))

        if 40.8 <= t <= 43.2:
            meshes.append(self.assets.build_signal_pulse((t - 40.8) / 2.4))

        meshes.append(self.assets.build_hero_asphalt_patch(alpha=asphalt_alpha, show_marking=(t >= 51.0 or t < 17.5)))
        if 24.0 <= t <= 54.5:
            alert = smoothstep(35.2, 36.0, t) * (1.0 - smoothstep(43.4, 44.2, t))
            meshes.append(self.assets.build_magnetic_dome(alert_amt=alert, pulse_scale=1.0 + 0.05 * math.sin(t * 6.0)))

        scene_mesh = Mesh.merge(meshes)
        frame_3d = self.renderer.render(
            scene_mesh, cam_pos, cam_tgt, fov,
            sun_dir=self.sun_dir, sun_rgb=self.sun_rgb, sky_amb=self.sky_amb, gnd_amb=self.gnd_amb,
            bg_top=self.bg_top, bg_bot=self.bg_bot,
        )
        active_callouts = [
            (c, self.renderer.project_point(c.world_target, cam_pos, cam_tgt, fov))
            for c in self.callouts if c.start <= t <= c.end
        ]
        return self.compositor.composite(frame_3d, t, seg, self.subtitles, active_callouts)
