import ctypes
import math
import os
import subprocess
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

FLAG_CAST_SHADOW = 1
FLAG_RECV_SHADOW = 2
FLAG_UNLIT = 4
FLAG_FRESNEL_DOME = 8
FLAG_DOUBLE_SIDED = 16
FLAG_DEPTH_BIAS = 32

FLAG_DEFAULT = FLAG_CAST_SHADOW | FLAG_RECV_SHADOW
FLAG_GROUND = FLAG_RECV_SHADOW
FLAG_DECAL = FLAG_RECV_SHADOW | FLAG_DEPTH_BIAS


def hex_rgb(hex_str: str) -> Tuple[float, float, float]:
    h = hex_str.lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    # sRGB to linear so lighting & bloom stay physically crisp!
    return (r ** 2.2, g ** 2.2, b ** 2.2)


def rot_matrix(rx: float, ry: float, rz: float) -> np.ndarray:
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float32)
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float32)
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float32)
    return my @ mx @ mz


@dataclass
class Mesh:
    verts: np.ndarray        # (V, 3) float32
    tris: np.ndarray         # (T, 3) int32
    colors: np.ndarray       # (T, 3) float32
    alphas: np.ndarray       # (T,) float32
    emissions: np.ndarray    # (T,) float32
    roughness: np.ndarray    # (T,) float32
    flags: np.ndarray        # (T,) int32

    @staticmethod
    def empty() -> "Mesh":
        return Mesh(
            np.zeros((0, 3), dtype=np.float32),
            np.zeros((0, 3), dtype=np.int32),
            np.zeros((0, 3), dtype=np.float32),
            np.zeros((0,), dtype=np.float32),
            np.zeros((0,), dtype=np.float32),
            np.zeros((0,), dtype=np.float32),
            np.zeros((0,), dtype=np.int32),
        )

    @staticmethod
    def merge(meshes: Sequence["Mesh"]) -> "Mesh":
        valid = [m for m in meshes if len(m.tris) > 0]
        if not valid:
            return Mesh.empty()
        v_list, t_list, c_list, a_list, e_list, r_list, f_list = [], [], [], [], [], [], []
        v_off = 0
        for m in valid:
            v_list.append(m.verts)
            t_list.append(m.tris + v_off)
            c_list.append(m.colors)
            a_list.append(m.alphas)
            e_list.append(m.emissions)
            r_list.append(m.roughness)
            f_list.append(m.flags)
            v_off += len(m.verts)
        return Mesh(
            np.concatenate(v_list, axis=0),
            np.concatenate(t_list, axis=0),
            np.concatenate(c_list, axis=0),
            np.concatenate(a_list, axis=0),
            np.concatenate(e_list, axis=0),
            np.concatenate(r_list, axis=0),
            np.concatenate(f_list, axis=0),
        )

    def transformed(
        self,
        pos: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        rot: Tuple[float, float, float] = (0.0, 0.0, 0.0),
        scale: float | Tuple[float, float, float] = 1.0,
    ) -> "Mesh":
        if len(self.verts) == 0:
            return self
        v = self.verts.copy()
        if isinstance(scale, (int, float)):
            if scale != 1.0:
                v *= float(scale)
        else:
            v *= np.array(scale, dtype=np.float32)
        if rot != (0.0, 0.0, 0.0):
            rm = rot_matrix(rot[0], rot[1], rot[2])
            v = v @ rm.T
        if pos != (0.0, 0.0, 0.0):
            v += np.array(pos, dtype=np.float32)
        return Mesh(
            v,
            self.tris,
            self.colors,
            self.alphas,
            self.emissions,
            self.roughness,
            self.flags,
        )

    def with_material(
        self,
        color: Optional[Tuple[float, float, float]] = None,
        alpha: Optional[float] = None,
        emission: Optional[float] = None,
        roughness: Optional[float] = None,
        flags: Optional[int] = None,
    ) -> "Mesh":
        nt = len(self.tris)
        if nt == 0:
            return self
        c = np.tile(np.array(color, dtype=np.float32), (nt, 1)) if color is not None else self.colors
        a = np.full((nt,), float(alpha), dtype=np.float32) if alpha is not None else self.alphas
        e = np.full((nt,), float(emission), dtype=np.float32) if emission is not None else self.emissions
        r = np.full((nt,), float(roughness), dtype=np.float32) if roughness is not None else self.roughness
        fl = np.full((nt,), int(flags), dtype=np.int32) if flags is not None else self.flags
        return Mesh(self.verts, self.tris, c, a, e, r, fl)


def _make_mesh_from_tris(
    tri_list: Sequence[Tuple[Tuple[float, float, float], Tuple[float, float, float], Tuple[float, float, float]]],
    color: Tuple[float, float, float],
    alpha: float = 1.0,
    emission: float = 0.0,
    roughness: float = 0.55,
    flags: int = FLAG_DEFAULT,
    outward_center: Optional[Tuple[float, float, float]] = (0.0, 0.0, 0.0),
) -> Mesh:
    nt = len(tri_list)
    if nt == 0:
        return Mesh.empty()
    verts = np.zeros((nt * 3, 3), dtype=np.float32)
    tris = np.zeros((nt, 3), dtype=np.int32)
    center = np.array(outward_center, dtype=np.float32) if outward_center is not None else None

    for i, (p0, p1, p2) in enumerate(tri_list):
        a = np.array(p0, dtype=np.float32)
        b = np.array(p1, dtype=np.float32)
        c = np.array(p2, dtype=np.float32)
        if center is not None:
            mid = (a + b + c) / 3.0
            n = np.cross(b - a, c - a)
            if np.dot(n, mid - center) < 0.0:
                b, c = c, b
        verts[i * 3 + 0] = a
        verts[i * 3 + 1] = b
        verts[i * 3 + 2] = c
        tris[i] = [i * 3 + 0, i * 3 + 1, i * 3 + 2]

    colors = np.tile(np.array(color, dtype=np.float32), (nt, 1))
    alphas = np.full((nt,), float(alpha), dtype=np.float32)
    emissions = np.full((nt,), float(emission), dtype=np.float32)
    rough = np.full((nt,), float(roughness), dtype=np.float32)
    fl = np.full((nt,), int(flags), dtype=np.int32)
    return Mesh(verts, tris, colors, alphas, emissions, rough, fl)


def make_beveled_box(
    w: float,
    h: float,
    d: float,
    color: Tuple[float, float, float],
    bevel: float = 0.03,
    alpha: float = 1.0,
    emission: float = 0.0,
    roughness: float = 0.55,
    flags: int = FLAG_DEFAULT,
) -> Mesh:
    hx, hy, hz = w * 0.5, h * 0.5, d * 0.5
    b = min(bevel, hx * 0.45, hy * 0.45, hz * 0.45)
    ix, iy, iz = hx - b, hy - b, hz - b

    def px(a, c, dd): return (a * hx, c * iy, dd * iz)
    def py(a, c, dd): return (a * ix, c * hy, dd * iz)
    def pz(a, c, dd): return (a * ix, c * iy, dd * hz)

    tris = []
    def add_quad(p0, p1, p2, p3):
        tris.append((p0, p1, p2))
        tris.append((p0, p2, p3))

    for s in (-1, 1):
        add_quad(px(s, -1, -1), px(s, 1, -1), px(s, 1, 1), px(s, -1, 1))
        add_quad(py(-1, s, -1), py(1, s, -1), py(1, s, 1), py(-1, s, 1))
        add_quad(pz(-1, -1, s), pz(1, -1, s), pz(1, 1, s), pz(-1, 1, s))

    for s1 in (-1, 1):
        for s2 in (-1, 1):
            add_quad(px(s1, s2, -1), px(s1, s2, 1), py(s1, s2, 1), py(s1, s2, -1))
            add_quad(px(s1, -1, s2), px(s1, 1, s2), pz(s1, 1, s2), pz(s1, -1, s2))
            add_quad(py(-1, s1, s2), py(1, s1, s2), pz(1, s1, s2), pz(-1, s1, s2))

    for sx_i in (-1, 1):
        for sy_i in (-1, 1):
            for sz_i in (-1, 1):
                tris.append((px(sx_i, sy_i, sz_i), py(sx_i, sy_i, sz_i), pz(sx_i, sy_i, sz_i)))

    return _make_mesh_from_tris(tris, color, alpha, emission, roughness, flags, (0.0, 0.0, 0.0))


def make_cylinder(
    radius_bottom: float,
    radius_top: float,
    height: float,
    color: Tuple[float, float, float],
    segments: int = 12,
    capped: bool = True,
    alpha: float = 1.0,
    emission: float = 0.0,
    roughness: float = 0.5,
    flags: int = FLAG_DEFAULT,
) -> Mesh:
    hy = height * 0.5
    tris = []
    angles = [2.0 * math.pi * i / segments for i in range(segments)]
    for i in range(segments):
        a0 = angles[i]
        a1 = angles[(i + 1) % segments]
        c0, s0 = math.cos(a0), math.sin(a0)
        c1, s1 = math.cos(a1), math.sin(a1)
        b0 = (radius_bottom * c0, -hy, radius_bottom * s0)
        b1 = (radius_bottom * c1, -hy, radius_bottom * s1)
        t0 = (radius_top * c0, hy, radius_top * s0)
        t1 = (radius_top * c1, hy, radius_top * s1)
        if radius_bottom > 1e-5:
            tris.append((b0, b1, t1))
        if radius_top > 1e-5:
            tris.append((b0, t1, t0))
        if capped:
            if radius_bottom > 1e-5:
                tris.append(((0.0, -hy, 0.0), b1, b0))
            if radius_top > 1e-5:
                tris.append(((0.0, hy, 0.0), t0, t1))
    return _make_mesh_from_tris(tris, color, alpha, emission, roughness, flags, (0.0, 0.0, 0.0))


def make_icosphere(
    radius: float,
    color: Tuple[float, float, float],
    subdivisions: int = 1,
    alpha: float = 1.0,
    emission: float = 0.0,
    roughness: float = 0.55,
    flags: int = FLAG_DEFAULT,
) -> Mesh:
    t = (1.0 + math.sqrt(5.0)) / 2.0
    verts = [
        (-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
        (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
        (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1),
    ]
    verts = [np.array(v, dtype=np.float32) / np.linalg.norm(v) for v in verts]
    faces = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    for _ in range(subdivisions):
        mid_cache = {}
        new_faces = []

        def get_mid(i, j):
            key = (min(i, j), max(i, j))
            if key in mid_cache:
                return mid_cache[key]
            m = (verts[i] + verts[j]) * 0.5
            m = m / np.linalg.norm(m)
            idx = len(verts)
            verts.append(m)
            mid_cache[key] = idx
            return idx

        for i0, i1, i2 in faces:
            a = get_mid(i0, i1)
            b = get_mid(i1, i2)
            c = get_mid(i2, i0)
            new_faces.extend([(i0, a, c), (i1, b, a), (i2, c, b), (a, b, c)])
        faces = new_faces

    tris = [
        (tuple(verts[i0] * radius), tuple(verts[i1] * radius), tuple(verts[i2] * radius))
        for i0, i1, i2 in faces
    ]
    return _make_mesh_from_tris(tris, color, alpha, emission, roughness, flags, (0.0, 0.0, 0.0))


def make_tube_along_path(
    points: Sequence[Tuple[float, float, float]] | np.ndarray,
    radius: float,
    color: Tuple[float, float, float],
    sides: int = 8,
    closed: bool = False,
    alpha: float = 1.0,
    emission: float = 0.0,
    roughness: float = 0.35,
    flags: int = FLAG_DEFAULT,
) -> Mesh:
    raw = np.asarray(points, dtype=np.float32)
    if len(raw) < 2:
        return Mesh.empty()
    filtered = [raw[0]]
    for p in raw[1:]:
        if np.linalg.norm(p - filtered[-1]) > 1e-4:
            filtered.append(p)
    if closed and len(filtered) > 2 and np.linalg.norm(filtered[-1] - filtered[0]) < 1e-4:
        filtered.pop()
    pts = np.array(filtered, dtype=np.float32)
    n = len(pts)
    if n < 2:
        return Mesh.empty()

    tangents = np.zeros_like(pts)
    for i in range(n):
        if closed:
            d = pts[(i + 1) % n] - pts[(i - 1) % n]
        elif i == 0:
            d = pts[1] - pts[0]
        elif i == n - 1:
            d = pts[-1] - pts[-2]
        else:
            d1 = pts[i] - pts[i - 1]
            d2 = pts[i + 1] - pts[i]
            n1 = np.linalg.norm(d1)
            n2 = np.linalg.norm(d2)
            d = (d1 / max(n1, 1e-6)) + (d2 / max(n2, 1e-6))
        tl = np.linalg.norm(d)
        tangents[i] = d / (tl if tl > 1e-6 else 1.0)

    # Lock up-vector to +Y whenever path isn't vertical so closed XZ loops never twist!
    normals = np.zeros_like(pts)
    binormals = np.zeros_like(pts)
    if np.all(np.abs(tangents[:, 1]) < 0.90):
        up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        for i in range(n):
            b = np.cross(tangents[i], up)
            b /= max(np.linalg.norm(b), 1e-6)
            normals[i] = np.cross(b, tangents[i])
            binormals[i] = b
    else:
        t0 = tangents[0]
        ref = np.array([1.0, 0.0, 0.0], dtype=np.float32) if abs(t0[1]) > 0.9 else np.array([0.0, 1.0, 0.0], dtype=np.float32)
        nrm = np.cross(ref, t0)
        nrm /= max(np.linalg.norm(nrm), 1e-6)
        normals[0] = nrm
        binormals[0] = np.cross(t0, nrm)
        for i in range(1, n):
            v = normals[i - 1] - tangents[i] * np.dot(normals[i - 1], tangents[i])
            vl = np.linalg.norm(v)
            normals[i] = v / vl if vl > 1e-6 else normals[i - 1]
            binormals[i] = np.cross(tangents[i], normals[i])

    rings = []
    for i in range(n):
        ring = []
        for s in range(sides):
            ang = 2.0 * math.pi * s / sides
            off = (math.cos(ang) * normals[i] + math.sin(ang) * binormals[i]) * radius
            ring.append(pts[i] + off)
        rings.append(ring)

    tris = []
    seg_cnt = n if closed else (n - 1)
    for i in range(seg_cnt):
        i_next = (i + 1) % n
        for s in range(sides):
            s_next = (s + 1) % sides
            p00 = rings[i][s]
            p01 = rings[i][s_next]
            p10 = rings[i_next][s]
            p11 = rings[i_next][s_next]
            mid_seg = (pts[i] + pts[i_next]) * 0.5
            for ta, tb, tc in ((p00, p10, p11), (p00, p11, p01)):
                tri_m = (ta + tb + tc) / 3.0
                if np.dot(np.cross(tb - ta, tc - ta), tri_m - mid_seg) < 0:
                    tris.append((tuple(ta), tuple(tc), tuple(tb)))
                else:
                    tris.append((tuple(ta), tuple(tb), tuple(tc)))

    if not closed:
        c_start = tuple(pts[0])
        c_end = tuple(pts[-1])
        for s in range(sides):
            s_next = (s + 1) % sides
            tris.append((c_start, tuple(rings[0][s_next]), tuple(rings[0][s])))
            tris.append((c_end, tuple(rings[-1][s]), tuple(rings[-1][s_next])))

    return _make_mesh_from_tris(tris, color, alpha, emission, roughness, flags, outward_center=None)


def make_flat_quad_xz(
    x0: float,
    z0: float,
    x1: float,
    z1: float,
    y: float,
    color: Tuple[float, float, float],
    alpha: float = 1.0,
    emission: float = 0.0,
    roughness: float = 0.85,
    flags: int = FLAG_GROUND,
    subdiv: int = 1,
) -> Mesh:
    tris = []
    xs = np.linspace(x0, x1, subdiv + 1)
    zs = np.linspace(z0, z1, subdiv + 1)
    for ix in range(subdiv):
        for iz in range(subdiv):
            xa, xb = float(xs[ix]), float(xs[ix + 1])
            za, zb = float(zs[iz]), float(zs[iz + 1])
            p00 = (xa, y, za)
            p10 = (xb, y, za)
            p11 = (xb, y, zb)
            p01 = (xa, y, zb)
            # +Y upward normal: (p01 - p00) x (p10 - p00) = (0,0,dz) x (dx,0,0) = (0, +dx*dz, 0)
            tris.append((p00, p01, p11))
            tris.append((p00, p11, p10))
    return _make_mesh_from_tris(tris, color, alpha, emission, roughness, flags, outward_center=None)


def _load_native_rasterizer() -> ctypes.CDLL:
    here = os.path.dirname(os.path.abspath(__file__))
    cpp_path = os.path.join(here, "native", "rasterizer.cpp")
    so_path = os.path.join(here, "native", "librasterizer.so")

    if not os.path.exists(so_path) or os.path.getmtime(cpp_path) > os.path.getmtime(so_path):
        cmd = [
            "g++",
            "-O3",
            "-ffast-math",
            "-fopenmp",
            "-shared",
            "-fPIC",
            cpp_path,
            "-o",
            so_path,
        ]
        subprocess.run(cmd, check=True)

    lib = ctypes.CDLL(so_path)
    fp = ctypes.POINTER(ctypes.c_float)
    ip = ctypes.POINTER(ctypes.c_int32)
    lib.render_scene.argtypes = [
        ctypes.c_int, ctypes.c_int,
        ctypes.c_int, fp,
        ctypes.c_int, ip,
        fp, fp, fp, fp, ip,
        fp, fp, fp, fp,
        ctypes.c_float, ctypes.c_float,
        fp, fp, fp, fp, fp, fp,
        ctypes.c_int, fp,
        ctypes.c_int, fp,
        fp, fp,
    ]
    lib.render_scene.restype = None
    return lib


class SceneRenderer:
    """High-speed native C++ stylized 3D renderer with EEVEE-style multi-scale HDR bloom & ACES tonemapping."""

    def __init__(self, out_w: int = 1080, out_h: int = 1920, ssaa: float = 1.18, shadow_res: int = 1024):
        self.out_w = out_w
        self.out_h = out_h
        self.rw = int(round(out_w * ssaa))
        self.rh = int(round(out_h * ssaa))
        self.shadow_res = shadow_res
        self.lib = _load_native_rasterizer()

        self.shadow_buf = np.zeros((shadow_res * shadow_res,), dtype=np.float32)
        self.z_buf = np.zeros((self.rw * self.rh,), dtype=np.float32)
        self.color_buf = np.zeros((self.rh, self.rw, 3), dtype=np.float32)

    @staticmethod
    def _camera_basis(cam_pos: Tuple[float, float, float], cam_target: Tuple[float, float, float]):
        cp = np.array(cam_pos, dtype=np.float32)
        ct = np.array(cam_target, dtype=np.float32)
        fwd = ct - cp
        fwd /= max(float(np.linalg.norm(fwd)), 1e-6)
        up_ref = np.array([0.0, 0.0, -1.0], dtype=np.float32) if abs(float(fwd[1])) > 0.94 else np.array([0.0, 1.0, 0.0], dtype=np.float32)
        right = np.cross(fwd, up_ref)
        right /= max(float(np.linalg.norm(right)), 1e-6)
        up = np.cross(right, fwd)
        up /= max(float(np.linalg.norm(up)), 1e-6)
        return cp, fwd, right, up

    def project_point(
        self,
        world_pt: Tuple[float, float, float],
        cam_pos: Tuple[float, float, float],
        cam_target: Tuple[float, float, float],
        fov_x_deg: float,
    ) -> Optional[Tuple[int, int]]:
        cp, fwd, right, up = self._camera_basis(cam_pos, cam_target)
        d = np.array(world_pt, dtype=np.float32) - cp
        cz = float(np.dot(d, fwd))
        if cz <= 0.15:
            return None
        tan_x = math.tan(math.radians(fov_x_deg * 0.5))
        tan_y = tan_x * (self.out_h / float(self.out_w))
        nx = float(np.dot(d, right)) / (cz * tan_x)
        ny = float(np.dot(d, up)) / (cz * tan_y)
        sx = int(round((nx * 0.5 + 0.5) * (self.out_w - 1)))
        sy = int(round((0.5 - ny * 0.5) * (self.out_h - 1)))
        return (sx, sy)

    def render(
        self,
        mesh: Mesh,
        cam_pos: Tuple[float, float, float],
        cam_target: Tuple[float, float, float],
        fov_x_deg: float = 44.0,
        sun_dir: Tuple[float, float, float] = (0.42, 0.82, 0.38),
        sun_rgb: Tuple[float, float, float] = (0.78, 0.76, 0.70),
        sky_amb: Tuple[float, float, float] = (0.52, 0.58, 0.68),
        gnd_amb: Tuple[float, float, float] = (0.34, 0.34, 0.38),
        bg_top: Tuple[float, float, float] = (0.24, 0.48, 0.78),
        bg_bot: Tuple[float, float, float] = (0.56, 0.77, 0.94),
        point_lights: Optional[Sequence[Tuple[float, float, float, float, float, float, float, float]]] = None,
    ) -> np.ndarray:
        cp, fwd, right, up = self._camera_basis(cam_pos, cam_target)
        tan_x = math.tan(math.radians(fov_x_deg * 0.5))
        tan_y = tan_x * (self.rh / float(self.rw))

        verts = np.ascontiguousarray(mesh.verts, dtype=np.float32)
        tris = np.ascontiguousarray(mesh.tris, dtype=np.int32)
        cols = np.ascontiguousarray(mesh.colors, dtype=np.float32)
        alphas = np.ascontiguousarray(mesh.alphas, dtype=np.float32)
        emits = np.ascontiguousarray(mesh.emissions, dtype=np.float32)
        rough = np.ascontiguousarray(mesh.roughness, dtype=np.float32)
        flags = np.ascontiguousarray(mesh.flags, dtype=np.int32)

        s_dir = np.array(sun_dir, dtype=np.float32)
        s_rgb = np.array(sun_rgb, dtype=np.float32)
        sk_a = np.array(sky_amb, dtype=np.float32)
        gn_a = np.array(gnd_amb, dtype=np.float32)
        b_t = np.array(bg_top, dtype=np.float32)
        b_b = np.array(bg_bot, dtype=np.float32)

        if point_lights:
            pl_arr = np.ascontiguousarray(point_lights, dtype=np.float32)
            n_pl = len(point_lights)
            pl_ptr = pl_arr.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        else:
            n_pl = 0
            pl_ptr = ctypes.POINTER(ctypes.c_float)()

        fp = ctypes.POINTER(ctypes.c_float)
        ip = ctypes.POINTER(ctypes.c_int32)
        self.lib.render_scene(
            self.rw, self.rh,
            len(verts), verts.ctypes.data_as(fp),
            len(tris), tris.ctypes.data_as(ip),
            cols.ctypes.data_as(fp),
            alphas.ctypes.data_as(fp),
            emits.ctypes.data_as(fp),
            rough.ctypes.data_as(fp),
            flags.ctypes.data_as(ip),
            cp.ctypes.data_as(fp),
            fwd.ctypes.data_as(fp),
            right.ctypes.data_as(fp),
            up.ctypes.data_as(fp),
            ctypes.c_float(tan_x), ctypes.c_float(tan_y),
            s_dir.ctypes.data_as(fp),
            s_rgb.ctypes.data_as(fp),
            sk_a.ctypes.data_as(fp),
            gn_a.ctypes.data_as(fp),
            b_t.ctypes.data_as(fp),
            b_b.ctypes.data_as(fp),
            n_pl, pl_ptr,
            self.shadow_res, self.shadow_buf.ctypes.data_as(fp),
            self.z_buf.ctypes.data_as(fp),
            self.color_buf.ctypes.data_as(fp),
        )

        hdr = self.color_buf

        # Fast 2-level pyramid HDR bloom (<5 ms!) for EEVEE-style neon color-coding glow!
        bright = np.maximum(0.0, hdr - 0.95)
        small1 = cv2.resize(bright, (self.rw // 4, self.rh // 4), interpolation=cv2.INTER_AREA)
        blur1 = cv2.GaussianBlur(small1, (0, 0), sigmaX=4.5)
        small2 = cv2.resize(blur1, (self.rw // 8, self.rh // 8), interpolation=cv2.INTER_AREA)
        blur2 = cv2.GaussianBlur(small2, (0, 0), sigmaX=6.5)
        bloom = (
            cv2.resize(blur1, (self.rw, self.rh), interpolation=cv2.INTER_LINEAR) * 0.30
            + cv2.resize(blur2, (self.rw, self.rh), interpolation=cv2.INTER_LINEAR) * 0.38
        )
        comp = hdr + bloom

        # ACES filmic tonemap + sRGB gamma
        a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
        mapped = np.clip((comp * (a * comp + b)) / (comp * (c * comp + d) + e), 0.0, 1.0)
        srgb = np.power(mapped, 1.0 / 2.2)
        u8 = np.clip(srgb * 255.0 + 0.5, 0, 255).astype(np.uint8)

        if (self.rw, self.rh) != (self.out_w, self.out_h):
            u8 = cv2.resize(u8, (self.out_w, self.out_h), interpolation=cv2.INTER_AREA)
        return u8
