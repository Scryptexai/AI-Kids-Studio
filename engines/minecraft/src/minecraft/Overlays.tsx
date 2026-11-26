// Picture overlays drawn over a shot (DOM, 1080x1920): speed streaks (a fall: the world rushing up past the lens;
// or radial, a dash forward) with an optional edge darkening, and on-screen counters (altitude, speed ...).
// Everything is a pure function of the frame. Counters sit inside the Shorts safe zone (x 4-84 %, y 8-75 %).
import React from "react";
import { AbsoluteFill } from "remotion";
import { useMcFrame } from "./mcTime";
import { keysAt } from "./direction";

export type SpeedLinesSpec = {
  /** [frame, strength 0..1] keys (linear) */
  keys: [number, number][];
  /** "up" (default): streaks rush up the frame (falling); "down": rising; "radial": out from the centre (a dash) */
  dir?: "up" | "down" | "radial";
  /** streak count at full strength (default 30) */
  n?: number;
  color?: string;
  /** darken the frame edges with the strength (default true) */
  vignette?: boolean;
  /** radial centre, % of the frame (default 50, 44) */
  centre?: [number, number];
};
export type HudSpec = {
  /** small caption above the number, e.g. "ALTITUDE" */
  label?: string;
  /** [frame, value] keys, counted linearly between */
  keys: [number, number][];
  /** unit after the number, e.g. "FT" */
  unit?: string;
  /** top-left corner, % of the frame (default 8, 11: inside the Shorts safe zone) */
  x?: number; y?: number;
  /** number size in px at 1080 wide (default 72) */
  size?: number;
  decimals?: number;
  /** visible from / to (frames; default the whole shot), pops in and out */
  from?: number; to?: number;
};

const W = 1080, H = 1920;
const rnd = (i: number, k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const c01 = (v: number) => Math.max(0, Math.min(1, v));
const backOut = (t: number) => { const s = 2.2, u = c01(t) - 1; return 1 + (s + 1) * u * u * u + s * u * u; };

export const SpeedLines: React.FC<SpeedLinesSpec> = ({ keys, dir = "up", n = 30, color = "#ffffff", vignette = true, centre = [50, 44] }) => {
  const frame = useMcFrame();
  const k = c01(keysAt(keys, frame));
  if (k <= 0.01) return null;
  const lines: React.ReactNode[] = [];
  const count = Math.round(n * (0.4 + 0.6 * k));
  if (dir === "radial") {
    const cx = (centre[0] / 100) * W, cy = (centre[1] / 100) * H, R = 1250, r0 = 300;
    for (let i = 0; i < count; i++) {
      const a = rnd(i, 1) * Math.PI * 2, sp = 45 + rnd(i, 3) * 60, len = (160 + rnd(i, 2) * 320) * (0.5 + 0.5 * k);
      const r = r0 + ((rnd(i, 4) * R + frame * sp) % R);
      const o = (0.25 + 0.55 * rnd(i, 5)) * k * c01((r - r0) / 200);
      const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r, x2 = cx + Math.cos(a) * (r + len), y2 = cy + Math.sin(a) * (r + len);
      lines.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={o} strokeWidth={2 + rnd(i, 6) * 4} strokeLinecap="round" />);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const sp = 70 + rnd(i, 3) * 110, len = (220 + rnd(i, 2) * 520) * (0.5 + 0.5 * k), span = H + len;
      const travel = (rnd(i, 4) * span + frame * sp) % span;
      const y = dir === "up" ? H - travel : travel - len;
      const x = rnd(i, 1) * W, w = 2.5 + rnd(i, 6) * 4.5, o = (0.22 + 0.5 * rnd(i, 5)) * k;
      lines.push(<rect key={i} x={x - w / 2} y={y} width={w} height={len} rx={w / 2} fill="url(#streak)" opacity={o} />);
    }
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {vignette && <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0) 55%, rgba(6,10,20,${0.45 * k}) 100%)` }} />}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0} />
            <stop offset="0.5" stopColor={color} stopOpacity={1} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {lines}
      </svg>
    </AbsoluteFill>
  );
};

const OUTLINE = [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3]].map(([x, y]) => `${x}px ${y}px 0 #000`).join(", ") + ", 6px 8px 0 rgba(0,0,0,0.55)";

export const Hud: React.FC<HudSpec> = ({ label, keys, unit, x = 8, y = 11, size = 72, decimals = 0, from, to }) => {
  const frame = useMcFrame();
  const a = from ?? -1e9, b = to ?? 1e9;
  if (frame < a || frame > b + 6) return null;
  const pin = from !== undefined ? backOut((frame - a) / 6) : 1, pout = to !== undefined && frame > b ? 1 - c01((frame - b) / 6) : 1;
  const s = pin * pout;
  if (s <= 0.01) return null;
  const v = keysAt(keys, frame);
  const txt = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: `scale(${s})`, transformOrigin: "0 0", fontFamily: "'Arial Black', 'Segoe UI', Arial, sans-serif", color: "#fff", lineHeight: 1 }}>
      {label && <div style={{ fontSize: size * 0.38, letterSpacing: 4, textShadow: OUTLINE, marginBottom: size * 0.12 }}>{label}</div>}
      <div style={{ fontSize: size, fontVariantNumeric: "tabular-nums", textShadow: OUTLINE, whiteSpace: "nowrap" }}>
        {txt}{unit && <span style={{ fontSize: size * 0.55, marginLeft: size * 0.18 }}>{unit}</span>}
      </div>
    </div>
  );
};
