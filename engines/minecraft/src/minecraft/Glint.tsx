// GEM GLINT (The Tapper): a 4-point white star that sweeps across a facet of Ruby's gem head (or flashes on Petra's
// gold badge). Ruby's dot eyes are too small to act, so the glint carries her emotion beats:
//   joy      bright star sweeping across the facet (10-14 f), a soft halo
//   hurt     the star starts dim, drifts down and greys out (the light going out of her)
//   realise  two sharp pulses 7 f apart, no sweep, a touch bigger
//   tink     a small quick flash (6 f): the Keeper badge
// The star sits on the actor (feet + `at`, scaled with `scale`), pushed `out` toward the camera so it lies on the
// visible facet, and sweeps along the camera's right / up axes. Pure function of the frame.
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { c01, type V3 } from "./fxCommon";

export type GlintSpec = {
  /** the actor (mob id) it rides on */
  actor: string;
  /** frame the glint starts */
  f: number;
  mode?: "joy" | "hurt" | "realise" | "tink";
  /** frames (default joy 12, hurt 16, realise 16, tink 6) */
  len?: number;
  /** offset from the actor's feet in blocks before `scale` (default [0, 1.86, 0]: the upper facet of the head, above
   *  the eyes; Petra's badge ~[0, 1.05, 0]) */
  at?: V3;
  /** shift along the camera's right axis in blocks before `scale` (default -0.1: toward the painted highlight on the
   *  upper-left facet as seen; 0 for a badge) */
  side?: number;
  /** the actor's size (Young Ruby 0.75); default 1 */
  scale?: number;
  /** star size in blocks (default joy 0.34, hurt 0.28, realise 0.42, tink 0.2) */
  size?: number;
  /** how far toward the camera from the actor's centre line (default 0.3: just in front of the head) */
  out?: number;
  /** sweep length in blocks along the camera's right/up diagonal (default 0.32; 0 = stays put) */
  sweep?: number;
  /** star colour (default white; tink default warm gold-white) */
  color?: string;
};

const starTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d")!, m = N / 2;
    const r = g.createRadialGradient(m, m, 0, m, m, m);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.12, "rgba(255,255,255,0.75)"); r.addColorStop(0.35, "rgba(255,255,255,0.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, N, N);
    // four tapered spikes
    g.fillStyle = "rgba(255,255,255,1)";
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const L = m * 0.98, W = 5.5;
      g.beginPath(); g.moveTo(m + dx * L, m + dy * L); g.lineTo(m + dy * W, m + dx * W); g.lineTo(m - dy * W, m - dx * W); g.closePath(); g.fill();
    }
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

const DEF = {
  joy: { len: 12, size: 0.34 }, hurt: { len: 16, size: 0.28 }, realise: { len: 16, size: 0.42 }, tink: { len: 6, size: 0.2 },
} as const;

/** brightness / size / sweep progress / greyness of one glint u frames in */
export const glintAt = (s: GlintSpec, u: number): { k: number; size: number; t: number; grey: number } | null => {
  const mode = s.mode ?? "joy", len = s.len ?? DEF[mode].len;
  if (u < 0 || u > len) return null;
  const t = u / len;
  if (mode === "realise") {
    const p = (x: number) => (x < 0 || x > 6 ? 0 : x < 1.5 ? x / 1.5 : 1 - (x - 1.5) / 4.5);
    const k = Math.max(p(u), p(u - 7));
    return { k, size: 0.45 + 0.75 * k, t: 0.5, grey: 0 };
  }
  if (mode === "hurt") {
    const k = (t < 0.15 ? t / 0.15 : 1) * (1 - t) ** 1.4 * 0.85;
    return { k, size: 0.9 - 0.4 * t, t, grey: c01(t * 1.6) };
  }
  // joy / tink: rise fast, peak a third in, fade
  const k = t < 0.3 ? Math.sin((t / 0.3) * Math.PI * 0.5) : 1 - ((t - 0.3) / 0.7) ** 1.6;
  return { k, size: 0.6 + 0.5 * Math.sin(Math.PI * t), t, grey: 0 };
};

const GlintOne: React.FC<{ s: GlintSpec; feet: V3; cam: V3; frame: number }> = ({ s, feet, cam, frame }) => {
  const mats = useMemo(() => ({
    star: new THREE.SpriteMaterial({ map: starTex(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    halo: new THREE.SpriteMaterial({ map: starTex(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  }), []);
  const g = glintAt(s, frame - s.f);
  if (!g || g.k <= 0.002) return null;
  const mode = s.mode ?? "joy", sc = s.scale ?? 1, off = s.at ?? [0, 1.86, 0];
  const c = new THREE.Vector3(feet[0] + off[0] * sc, feet[1] + off[1] * sc, feet[2] + off[2] * sc);
  const toCam = new THREE.Vector3(cam[0] - c.x, cam[1] - c.y, cam[2] - c.z).normalize();
  // screen right / up as seen from the camera
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toCam).normalize();
  const up = new THREE.Vector3().crossVectors(toCam, right).normalize();
  const sw = (s.sweep ?? (mode === "realise" || mode === "tink" ? 0 : 0.32)) * sc;
  const along = (g.t - 0.5) * sw, drop = mode === "hurt" ? -0.12 * g.t * sc : 0;
  const p = c.clone().addScaledVector(toCam, (s.out ?? 0.3) * sc).addScaledVector(right, along + (s.side ?? (mode === "tink" ? 0 : -0.1)) * sc).addScaledVector(up, along * 0.55 + drop);
  const base = new THREE.Color(s.color ?? (mode === "tink" ? "#fff2c2" : "#ffffff")), grey = new THREE.Color("#7f848c");
  const col = base.lerp(grey, g.grey).multiplyScalar(1.6 * g.k);
  mats.star.color.copy(col); mats.star.rotation = mode === "hurt" ? 0 : 0.35 * (g.t - 0.5);
  mats.halo.color.copy(col).multiplyScalar(0.35);
  const size = (s.size ?? DEF[mode].size) * sc * g.size;
  return (
    <group position={p}>
      <sprite material={mats.halo} scale={[size * 1.8, size * 1.8, 1]} renderOrder={40} />
      <sprite material={mats.star} scale={[size, size, 1]} renderOrder={41} />
    </group>
  );
};

export const Glints: React.FC<{ specs: GlintSpec[]; actorAt: (id: string, f: number) => V3 | null; cam: V3 }> = ({ specs, actorAt, cam }) => {
  const frame = useMcFrame();
  return (
    <>
      {specs.map((s, i) => {
        const feet = actorAt(s.actor, frame);
        return feet ? <GlintOne key={i} s={s} feet={feet} cam={cam} frame={frame} /> : null;
      })}
    </>
  );
};
