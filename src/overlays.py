import math
import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 <= edge0:
        return 1.0 if x >= edge1 else 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


@dataclass
class WordTiming:
    word: str
    start: float
    end: float


@dataclass
class SubtitleChunk:
    words: List[WordTiming]
    start: float
    end: float


@dataclass
class Callout3D:
    start: float
    end: float
    world_target: Tuple[float, float, float]
    box_center: Tuple[int, int]
    title: str
    subtitle: str
    accent_rgb: Tuple[int, int, int] = (0, 228, 255)


def _load_font(filename: str, size: int) -> ImageFont.FreeTypeFont:
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "assets", "fonts", filename),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


class OverlayCompositor:
    """
    2D Shorts UI & Dynamic Word-Highlighted Subtitle Compositor (configurable across all episodes).
    """

    def __init__(
        self,
        width: int = 1080,
        height: int = 1920,
        seg_names: Optional[Dict[int, str]] = None,
        hook_sub: str = "TENGAH MALAM JALANAN SEPI...",
        hook_main: str = "KOK LAMPU TAU ADA MOTOR?",
        cta_start: float = 55.2,
        cta_q1: str = "Di daerahmu lampu merahnya pakai",
        cta_q2: str = "sensor otomatis atau tukang parkir?",
        cta_opt_left: str = "SENSOR OTOMATIS",
        cta_opt_right: str = "TUKANG PARKIR",
    ):
        self.w = width
        self.h = height
        self.seg_names = seg_names or {
            1: "EP.01 • MISTERI LAMPU MERAH",
            2: "02 • MITOS VS FAKTA",
            3: "03 • INDUCTIVE LOOP SENSOR",
            4: "04 • DETEKSI MEDAN MAGNET",
            5: "05 • KENAPA SEPEDA GAK KEBACA?",
        }
        self.hook_sub = hook_sub
        self.hook_main = hook_main
        self.cta_start = cta_start
        self.cta_q1 = cta_q1
        self.cta_q2 = cta_q2
        self.cta_opt_left = cta_opt_left
        self.cta_opt_right = cta_opt_right

        self.f_badge = _load_font("PlusJakartaSans_700Bold.ttf", 25)
        self.f_hook_sub = _load_font("PlusJakartaSans_800ExtraBold.ttf", 30)
        self.f_hook_main = _load_font("Montserrat_900Black.ttf", 48)
        self.f_call_title = _load_font("Montserrat_800ExtraBold.ttf", 34)
        self.f_call_sub = _load_font("PlusJakartaSans_600SemiBold.ttf", 24)
        self.f_sub = _load_font("Montserrat_900Black.ttf", 52)
        self.f_cta_tag = _load_font("Montserrat_900Black.ttf", 28)
        self.f_cta_q = _load_font("PlusJakartaSans_800ExtraBold.ttf", 38)
        self.f_cta_btn = _load_font("Montserrat_800ExtraBold.ttf", 28)

    def composite(
        self,
        rgb_frame: np.ndarray,
        time_s: float,
        seg_idx: int,
        subtitles: Sequence[SubtitleChunk],
        callouts: Sequence[Tuple[Callout3D, Optional[Tuple[int, int]]]],
    ) -> np.ndarray:
        base = Image.fromarray(rgb_frame, mode="RGB").convert("RGBA")
        ui = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(ui)

        # 1. Top Series Pill Badge
        seg_label = self.seg_names.get(seg_idx, f"0{seg_idx} • HIDDEN INFRASTRUCTURE")
        pill_text = f"HIDDEN INFRASTRUCTURE  |  {seg_label}"
        tb = draw.textbbox((0, 0), pill_text, font=self.f_badge)
        tw = tb[2] - tb[0]
        pw = tw + 74
        px0 = (self.w - pw) // 2
        py0 = 66
        draw.rounded_rectangle(
            [px0, py0, px0 + pw, py0 + 54],
            radius=27,
            fill=(14, 21, 36, 215),
            outline=(75, 95, 130, 180),
            width=2,
        )
        dot_colors = {1: (34, 197, 94), 2: (239, 68, 68), 3: (245, 158, 11), 4: (249, 115, 22), 5: (56, 189, 248)}
        dc = dot_colors.get(seg_idx, (56, 189, 248))
        draw.ellipse([px0 + 22, py0 + 18, px0 + 40, py0 + 36], fill=(*dc, 255))
        draw.text((px0 + 50, py0 + 11), pill_text, font=self.f_badge, fill=(241, 245, 249, 255))

        # 2. Opening 2.8s Hook Banner (0.15s .. 2.85s)
        if 0.15 <= time_s <= 2.85:
            ha = smoothstep(0.15, 0.45, time_s) * (1.0 - smoothstep(2.45, 2.85, time_s))
            a_i = int(round(240 * ha))
            bx0, by0, bx1, by1 = 92, 156, self.w - 92, 314
            draw.rounded_rectangle(
                [bx0, by0, bx1, by1],
                radius=26,
                fill=(12, 19, 34, a_i),
                outline=(250, 204, 21, int(235 * ha)),
                width=3,
            )
            sb = draw.textbbox((0, 0), self.hook_sub, font=self.f_hook_sub)
            draw.text(
                ((self.w - (sb[2] - sb[0])) // 2, by0 + 22),
                self.hook_sub,
                font=self.f_hook_sub,
                fill=(250, 204, 21, int(255 * ha)),
            )
            mb = draw.textbbox((0, 0), self.hook_main, font=self.f_hook_main)
            draw.text(
                ((self.w - (mb[2] - mb[0])) // 2, by0 + 68),
                self.hook_main,
                font=self.f_hook_main,
                fill=(255, 255, 255, int(255 * ha)),
            )

        # 3. 3D-Tracked Callout Boxes + Pointer Lines
        for c, proj_pt in callouts:
            ca = smoothstep(c.start, c.start + 0.25, time_s) * (1.0 - smoothstep(c.end - 0.25, c.end, time_s))
            if ca <= 0.02:
                continue
            acc = c.accent_rgb
            t_bbox = draw.textbbox((0, 0), c.title, font=self.f_call_title)
            s_bbox = draw.textbbox((0, 0), c.subtitle, font=self.f_call_sub)
            bw = max(t_bbox[2] - t_bbox[0], s_bbox[2] - s_bbox[0]) + 72
            bh = 108
            cx, cy = c.box_center
            x0, y0 = cx - bw // 2, cy - bh // 2
            x1, y1 = x0 + bw, y0 + bh

            if proj_pt is not None:
                tx, ty = proj_pt
                tx = max(60, min(self.w - 60, tx))
                ty = max(140, min(self.h - 220, ty))
                start_y = y1 if ty > cy else y0
                draw.line([(tx, start_y), (tx, ty)], fill=(12, 18, 30, int(220 * ca)), width=8)
                draw.line([(tx, start_y), (tx, ty)], fill=(*acc, int(255 * ca)), width=4)
                draw.ellipse([tx - 11, ty - 11, tx + 11, ty + 11], fill=(*acc, int(95 * ca)))
                draw.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], fill=(255, 255, 255, int(255 * ca)), outline=(*acc, int(255 * ca)), width=2)

            draw.rounded_rectangle(
                [x0 + 4, y0 + 6, x1 + 4, y1 + 6], radius=20, fill=(0, 0, 0, int(110 * ca))
            )
            draw.rounded_rectangle(
                [x0, y0, x1, y1],
                radius=20,
                fill=(13, 20, 35, int(235 * ca)),
                outline=(*acc, int(235 * ca)),
                width=3,
            )
            draw.rounded_rectangle([x0, y0 + 10, x0 + 10, y1 - 10], radius=5, fill=(*acc, int(255 * ca)))
            draw.text(
                (cx - (t_bbox[2] - t_bbox[0]) // 2 + 4, y0 + 15),
                c.title,
                font=self.f_call_title,
                fill=(*acc, int(255 * ca)),
            )
            draw.text(
                (cx - (s_bbox[2] - s_bbox[0]) // 2 + 4, y0 + 60),
                c.subtitle,
                font=self.f_call_sub,
                fill=(235, 242, 250, int(250 * ca)),
            )

        # 4. Dynamic Word-by-Word Karaoke Shorts Subtitles (Lower-Center Safe Zone y ~ 1420)
        active_chunk: Optional[SubtitleChunk] = None
        for ch in subtitles:
            if ch.start - 0.04 <= time_s <= ch.end + 0.08:
                active_chunk = ch
                break

        if active_chunk is not None and time_s < self.cta_start:
            self._draw_subtitle_chunk(draw, active_chunk, time_s)

        # 5. Interactive Ending Comment CTA Card
        if time_s >= self.cta_start:
            u = smoothstep(self.cta_start, self.cta_start + 0.40, time_s)
            self._draw_cta_card(draw, u)

        out = Image.alpha_composite(base, ui).convert("RGB")
        return np.asarray(out, dtype=np.uint8)

    def _draw_subtitle_chunk(self, draw: ImageDraw.ImageDraw, ch: SubtitleChunk, time_s: float):
        # Layout into 1 or 2 balanced lines
        words = ch.words
        if len(words) >= 4 and sum(len(w.word) for w in words) > 17:
            mid = (len(words) + 1) // 2
            lines = [words[:mid], words[mid:]]
        else:
            lines = [words]

        space_w = 18
        line_metrics = []
        max_lw = 0
        for ln in lines:
            w_boxes = [draw.textbbox((0, 0), wt.word, font=self.f_sub) for wt in ln]
            widths = [b[2] - b[0] for b in w_boxes]
            lw = sum(widths) + space_w * max(0, len(ln) - 1)
            max_lw = max(max_lw, lw)
            line_metrics.append((ln, widths, lw))

        line_h = 72
        tot_h = len(lines) * line_h
        cy = 1445
        pad_x, pad_y = 40, 22
        bx0 = (self.w - max_lw) // 2 - pad_x
        by0 = cy - tot_h // 2 - pad_y
        bx1 = (self.w + max_lw) // 2 + pad_x
        by1 = cy + tot_h // 2 + pad_y

        draw.rounded_rectangle([bx0, by0, bx1, by1], radius=26, fill=(14, 20, 32, 208))

        for li, (ln, widths, lw) in enumerate(line_metrics):
            cur_x = (self.w - lw) // 2
            cur_y = cy - tot_h // 2 + li * line_h
            for wt, ww in zip(ln, widths):
                is_active = wt.start - 0.02 <= time_s <= wt.end + 0.04
                if is_active:
                    draw.rounded_rectangle(
                        [cur_x - 10, cur_y + 2, cur_x + ww + 10, cur_y + 66],
                        radius=14,
                        fill=(250, 212, 0, 255),
                    )
                    draw.text((cur_x, cur_y + 2), wt.word, font=self.f_sub, fill=(12, 16, 26, 255))
                else:
                    # Crisp dark stroke + pure white fill
                    for ox, oy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, 2), (2, 2)):
                        draw.text((cur_x + ox, cur_y + 2 + oy), wt.word, font=self.f_sub, fill=(8, 12, 20, 240))
                    draw.text((cur_x, cur_y + 2), wt.word, font=self.f_sub, fill=(255, 255, 255, 255))
                cur_x += ww + space_w

    def _draw_cta_card(self, draw: ImageDraw.ImageDraw, u: float):
        a = int(round(242 * u))
        x0, y0, x1, y1 = 78, 200, self.w - 78, 520
        draw.rounded_rectangle([x0 + 6, y0 + 8, x1 + 6, y1 + 8], radius=30, fill=(0, 0, 0, int(120 * u)))
        draw.rounded_rectangle(
            [x0, y0, x1, y1],
            radius=30,
            fill=(11, 18, 33, a),
            outline=(250, 204, 21, int(245 * u)),
            width=4,
        )

        # Top yellow pill tag "TULIS DI KOMENTAR!"
        tag = "TULIS DI KOMENTAR!"
        tb = draw.textbbox((0, 0), tag, font=self.f_cta_tag)
        tw = (tb[2] - tb[0]) + 56
        tx0 = (self.w - tw) // 2
        draw.rounded_rectangle([tx0, y0 - 24, tx0 + tw, y0 + 26], radius=22, fill=(250, 204, 21, int(255 * u)))
        draw.text(((self.w - (tb[2] - tb[0])) // 2, y0 - 17), tag, font=self.f_cta_tag, fill=(12, 17, 28, int(255 * u)))

        # Question lines
        q1b = draw.textbbox((0, 0), self.cta_q1, font=self.f_cta_q)
        q2b = draw.textbbox((0, 0), self.cta_q2, font=self.f_cta_q)
        draw.text(((self.w - (q1b[2] - q1b[0])) // 2, y0 + 52), self.cta_q1, font=self.f_cta_q, fill=(255, 255, 255, int(255 * u)))
        draw.text(((self.w - (q2b[2] - q2b[0])) // 2, y0 + 104), self.cta_q2, font=self.f_cta_q, fill=(255, 255, 255, int(255 * u)))

        # Two choice buttons
        bw, bh = 418, 86
        ly0 = y0 + 184
        lx0 = x0 + 28
        rx0 = x1 - 28 - bw
        draw.rounded_rectangle(
            [lx0, ly0, lx0 + bw, ly0 + bh],
            radius=20,
            fill=(8, 56, 78, int(235 * u)),
            outline=(34, 211, 238, int(245 * u)),
            width=3,
        )
        draw.rounded_rectangle(
            [rx0, ly0, rx0 + bw, ly0 + bh],
            radius=20,
            fill=(78, 52, 12, int(235 * u)),
            outline=(245, 158, 11, int(245 * u)),
            width=3,
        )
        lb = draw.textbbox((0, 0), self.cta_opt_left, font=self.f_cta_btn)
        rb = draw.textbbox((0, 0), self.cta_opt_right, font=self.f_cta_btn)
        draw.text(
            (lx0 + (bw - (lb[2] - lb[0])) // 2, ly0 + 25),
            self.cta_opt_left,
            font=self.f_cta_btn,
            fill=(224, 247, 250, int(255 * u)),
        )
        draw.text(
            (rx0 + (bw - (rb[2] - rb[0])) // 2, ly0 + 25),
            self.cta_opt_right,
            font=self.f_cta_btn,
            fill=(254, 243, 199, int(255 * u)),
        )
