"""Python ports of src/minecraft/direction.ts (camAt, pathAt, seg, EASE) and McShort's MovingCam, so the staging gate
evaluates the same camera and the same figure positions the render uses. Keep in step with direction.ts.

Conventions (checked in src/minecraft/mobs/Mob.tsx: yawRad = -facing; the model faces +z after its root flip):
  facing 0 faces +z, -90 faces +x, 90 faces -x, 180 faces -z.   forward(facing) = (-sin f, 0, cos f)
"""
import math

C01 = lambda v: max(0.0, min(1.0, v))

EASE = {
    "linear": lambda t: t,
    "inOut": lambda t: 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2,
    "cubicOut": lambda t: 1 - (1 - t) ** 3,
    "expoOut": lambda t: 1.0 if t >= 1 else 1 - 2 ** (-10 * t),
    "expoIn": lambda t: 0.0 if t <= 0 else 2 ** (10 * t - 10),
    "backOut": lambda t: 1 + 2.9 * (t - 1) ** 3 + 1.9 * (t - 1) ** 2,
}


def lerp(a, b, k):
    return a + (b - a) * k


def lerp3(a, b, k):
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]


def seg(keys, f):
    """(prev key, next key, eased k, raw) like direction.ts seg"""
    if f <= keys[0]["f"]:
        return keys[0], keys[0], 1.0, 1.0
    for i in range(1, len(keys)):
        if f < keys[i]["f"]:
            raw = C01((f - keys[i - 1]["f"]) / (keys[i]["f"] - keys[i - 1]["f"]))
            return keys[i - 1], keys[i], EASE[keys[i].get("ease", "inOut")](raw), raw
    return keys[-1], keys[-1], 1.0, 1.0


def keys_at(keys, f):
    """linear [frame, value] keys (holds outside)"""
    if f <= keys[0][0]:
        return keys[0][1]
    for i in range(1, len(keys)):
        if f < keys[i][0]:
            f0, v0 = keys[i - 1]
            f1, v1 = keys[i]
            return v0 + (v1 - v0) * (f - f0) / (f1 - f0)
    return keys[-1][1]


def hash_id(s):
    h = 2166136261
    for c in s:
        h = ((h ^ ord(c)) * 16777619) & 0xFFFFFFFF
    return h % 997


def _cam_raw(d, f):
    a, b, k, _ = seg(d["cam"], f)
    pos, look = lerp3(a["pos"], b["pos"], k), lerp3(a["look"], b["look"], k)
    fov = lerp(a["fov"], b["fov"], k)
    for s in d.get("shake") or []:
        if s["f"] <= f < s["f"] + s["len"]:
            e = (1 - (f - s["f"]) / s["len"]) ** 2 * s["amp"]
            look[0] += math.sin(f * 1.3) * e
            look[1] += math.cos(f * 1.7) * e
            look[2] += math.sin(f * 1.1 + 1) * e * 0.6
    return pos, look, fov


def fx_shakes(d):
    out = []
    for b in d.get("bolts") or []:
        if b.get("shake") is not False:
            amp, ln = b.get("shake") or [0.35, 9]
            out.append((b["f"], amp, ln))
    for b in d.get("booms") or []:
        if b.get("shake") is not False and b["f"] >= 0:
            amp, ln = b.get("shake") or [0.32, 10]
            out.append((b["f"], amp, ln))
    return out


CAM_SMOOTH = 2.0


def cam_at(d, f, seed=0):
    """direction.ts camAt: keys eased, gaussian smoothing (never across a cut), handheld drift, fx shakes, rumble"""
    if not d.get("cam"):
        return None
    for k in d["cam"]:
        if k.get("cut") and k["f"] - 1 < f < k["f"]:
            f = k["f"] - 1
    cuts = [k["f"] for k in d["cam"] if k.get("cut")]

    def side(g):
        for c in cuts:
            if f < c and g >= c:
                return c - 1
            if f >= c and g < c:
                return c
        return g

    R = math.ceil(CAM_SMOOTH * 2)
    pos, look, fov, ws = [0.0] * 3, [0.0] * 3, 0.0, 0.0
    for i in range(-R, R + 1):
        w = math.exp(-(i * i) / (2 * CAM_SMOOTH * CAM_SMOOTH))
        p, l, fv = _cam_raw(d, side(f + i))
        for j in range(3):
            pos[j] += p[j] * w
            look[j] += l[j] * w
        fov += fv * w
        ws += w
    pos, look, fov = [v / ws for v in pos], [v / ws for v in look], fov / ws
    pos[0] += math.sin(f / 23 + seed) * 0.015
    pos[1] += math.sin(f / 29 + seed * 1.7) * 0.012
    for f0, amp, ln in fx_shakes(d):
        u = f - f0
        if u < 0 or u >= ln:
            continue
        e = amp * (1 - u / ln) ** 2
        n = lambda a, b, c: (math.sin(u * a + f0) + 0.55 * math.sin(u * b + f0 * 1.7) + 0.3 * math.sin(u * c + 2.1)) / 1.85
        look[0] += n(2.1, 3.7, 5.3) * e
        look[1] += n(2.6, 4.1, 5.9) * e
        look[2] += n(1.9, 3.3, 4.7) * e * 0.5
        pos[0] += n(1.7, 2.9, 4.4) * e * 0.12
        pos[1] += n(2.3, 3.1, 4.9) * e * 0.12
    ru = keys_at(d["rumble"], f) if d.get("rumble") else 0
    if ru > 0:
        n = lambda a, b, c: (math.sin(f * a + seed) + 0.6 * math.sin(f * b + seed * 2.1) + 0.35 * math.sin(f * c + 1.3)) / 1.95
        look[0] += n(1.31, 2.27, 3.71) * ru
        look[1] += n(1.73, 2.91, 4.13) * ru
        look[2] += n(1.07, 2.53, 3.29) * ru * 0.6
        pos[0] += n(0.93, 1.87, 3.07) * ru * 0.25
        pos[1] += n(1.19, 2.39, 3.53) * ru * 0.25
    return pos, look, fov


def moving_cam(cam, f, n, seed):
    """McShort MovingCam: a set camera (no direction keys) that settles in and creeps"""
    pos, look = cam["position"], cam["lookAt"]
    fw = [look[i] - pos[i] for i in range(3)]
    dist = math.sqrt(sum(v * v for v in fw)) or 1e-6
    fw = [v / dist for v in fw]
    sd = [-fw[2], 0.0, fw[0]]          # fwd x up(0,1,0)
    sl = math.hypot(sd[0], sd[2])
    sd = [1.0, 0.0, 0.0] if sl < 1e-6 else [sd[0] / sl, 0.0, sd[2] / sl]
    settle = 1 - EASE["cubicOut"](C01(f / 16))
    creep = EASE["inOut"](C01(f / max(1, n)))
    dr = 1 if seed % 2 else -1
    back = dist * (0.06 * settle - 0.045 * creep)
    lat = dist * (0.035 * dr * settle - 0.02 * dr * creep) + math.sin(f / 41 + seed) * dist * 0.004
    p = [pos[i] - fw[i] * back + sd[i] * lat for i in range(3)]
    p[1] += math.sin(f / 53 + seed * 1.3) * dist * 0.003
    return p, list(look), cam["fov"]


def path_at(keys, f):
    """direction.ts pathAt: at (with jump arc), facing (turns over the first third of a segment), hidden, scale,
    plus `seg` info the checker uses (airborne: an arc or a height change between the keys)"""
    if not keys:
        return None
    a, b, k, raw = seg(keys, f)
    at = lerp3(a["at"], b["at"], k)
    arc = b.get("arc") if a is not b else None
    if arc:
        at[1] += 4 * arc * raw * (1 - raw)
    fa, fb = a.get("facing"), b.get("facing")
    if fa is not None and fb is not None:
        facing = lerp(fa, fb, C01(raw * 3))
    else:
        facing = fa if fa is not None else fb
    hidden = bool(b.get("hidden") if raw >= 1 else a.get("hidden"))
    sa, sb = a.get("scale"), b.get("scale")
    scale = None if sa is None and sb is None else lerp(1 if sa is None else sa, 1 if sb is None else sb, k)
    in_between = a is not b and 0 < raw < 1
    airborne = in_between and (bool(arc) or abs(b["at"][1] - a["at"][1]) > 0.05)
    return {"at": at, "facing": facing, "hidden": hidden, "scale": scale, "airborne": airborne, "tilt": a.get("tilt") or b.get("tilt")}


def forward(facing):
    y = math.radians(facing)
    return -math.sin(y), math.cos(y)


def yaw_of(dx, dz):
    """the facing (Minecraft yaw) that looks along (dx, dz)"""
    return math.degrees(math.atan2(-dx, dz))


def ang_diff(a, b):
    return abs((a - b + 180) % 360 - 180)


class View:
    """a pinhole camera at 1080x1920: three.js PerspectiveCamera fov is VERTICAL, aspect 0.5625, up = +y"""
    W, H = 1080, 1920

    def __init__(self, pos, look, fov):
        self.pos, self.fov = pos, fov
        fw = [look[i] - pos[i] for i in range(3)]
        n = math.sqrt(sum(v * v for v in fw)) or 1e-9
        self.fw = [v / n for v in fw]
        rt = [-self.fw[2], 0.0, self.fw[0]]        # fw x (0,1,0)
        n = math.hypot(rt[0], rt[2])
        self.rt = [1.0, 0.0, 0.0] if n < 1e-6 else [rt[0] / n, 0.0, rt[2] / n]
        f, r = self.fw, self.rt
        self.up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
        self.th = math.tan(math.radians(fov) / 2)
        self.tw = self.th * self.W / self.H

    def depth(self, p):
        return sum((p[i] - self.pos[i]) * self.fw[i] for i in range(3))

    def project(self, p):
        """(sx, sy, z): screen 0..1 (y down) and depth along the lens; None when z <= 0.05"""
        d = [p[i] - self.pos[i] for i in range(3)]
        z = sum(d[i] * self.fw[i] for i in range(3))
        if z <= 0.05:
            return None
        sx = sum(d[i] * self.rt[i] for i in range(3)) / z / self.tw
        sy = sum(d[i] * self.up[i] for i in range(3)) / z / self.th
        return 0.5 + sx / 2, 0.5 - sy / 2, z

    def ray(self, sx, sy):
        """unit world direction through screen point (sx, sy) in 0..1"""
        x, y = (sx - 0.5) * 2 * self.tw, (0.5 - sy) * 2 * self.th
        v = [self.fw[i] + self.rt[i] * x + self.up[i] * y for i in range(3)]
        n = math.sqrt(sum(c * c for c in v))
        return [c / n for c in v]
