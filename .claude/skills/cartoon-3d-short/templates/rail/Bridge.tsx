// "Jebakan Kardus Durian": our original ~70 s short in the flat-characters-in-a-3D-toon-world style.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts). Post chain (look-match pass):
//   InkPass (world ink lines, own pass) -> lens blur pre + main (thin-lens DOF per shot from dofAt) ->
//   [bloom (emissive only) + NEUTRAL tone mapping + colour grade] (one merged EffectPass), MSAA 4.
// Ink runs before the DOF so lines blur with what they belong to; bloom after the DOF so glows defocus with their
// source; the grade is display-referred, so it comes after tone mapping. Every pixel-sized parameter is specified at
// 1080x1920 and scaled with the output size, so stills at --scale 0.5 and the 1440x2560 final match.
// Place changes crossfade by stacking a second canvas for the fade frames; the hook ends on a 4-frame white flash.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { Kit } from "./build";
import { TOTAL, FLASH_AT, BLACK_AT, BLACK_FULL, SHOTS, layersAt, dofAt, zoomBlurAt, B, FLASHBACK, GOLD_FROM, blackoutAt } from "./story";

/** the day cards: an ornate card pops in with the time of day ("MALAM", "SEBULAN KEMUDIAN"), readable on a phone */
const DAYS: { f0: number; f1: number; top: string; sub?: string; night: boolean; low?: boolean; pad?: string }[] = [
  { f0: 2, f1: B(1, "men") + 4, top: "1868", night: true, low: true },
  { f0: B(4, "Out") + 2, f1: B(4, "line") + 4, top: "PITTSBURGH", night: false, pad: "8%" },
  { f0: B(6, "He") + 2, f1: B(6, "Vanderbilt") + 6, top: "NEW YORK", night: false, pad: "6%" },
  { f0: B(9, "One") + 2, f1: B(9, "test") + 8, top: "SEPTEMBER", sub: "1868", night: false, pad: "6%" },
  { f0: B(18, "Four") + 2, f1: B(18, "flips") + 2, top: "1872", night: false, pad: "8%" },
];
/** the clock card of the heist night: a clock face and the time in big type */
const TIMES: { f0: number; f1: number; h: number; m: number; label: string }[] = [];
const TimeCard: React.FC<{ f: number }> = ({ f }) => {
  const c = TIMES.find((x) => f >= x.f0 && f < x.f1);
  if (!c) return null;
  const a = f - c.f0, b = c.f1 - f;
  const pop = a < 8 ? 1 + 0.12 * Math.sin((a / 8) * Math.PI) - (1 - a / 8) * 0.5 : 1, out = b < 6 ? b / 6 : 1;
  const am = (c.m / 60) * 360, ah = ((c.h % 12) / 12) * 360 + c.m * 0.5;
  const hand = (deg: number, len: number, w: number) => (
    <div style={{ position: "absolute", left: 120 - w / 2, top: 120 - len, width: w, height: len, background: "#1e1620", borderRadius: w,
      transformOrigin: `${w / 2}px ${len}px`, transform: `rotate(${deg}deg)` }} />);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: "96%" }}>{/* over the facade, below the clock */}
      <div style={{ transform: `scale(${pop * out}) rotate(${2 - 2 * Math.sin(a / 12)}deg)`, opacity: out, display: "flex", alignItems: "center", gap: 30,
        padding: "26px 40px 26px 30px", borderRadius: 30, border: "10px solid #c9a24e",
        background: "radial-gradient(ellipse at 40% 35%, #2c3a6e 0%, #18204a 75%, #10152f 100%)", boxShadow: "0 18px 40px rgba(0,0,0,0.55), inset 0 0 0 6px #18204a, inset 0 0 0 10px #c9a24e" }}>
        <div style={{ position: "relative", width: 240, height: 240, borderRadius: 120, background: "radial-gradient(circle, #fffaf0 0%, #f3e6c8 80%)", border: "12px solid #c9a24e", boxSizing: "border-box" }}>
          {Array.from({ length: 12 }, (_, k) => <div key={k} style={{ position: "absolute", left: 114, top: 8, width: 12, height: k % 3 ? 14 : 24, background: "#1e1620",
            transformOrigin: "6px 112px", transform: `rotate(${k * 30}deg)` }} />)}
          {hand(ah, 62, 16)}{hand(am, 92, 10)}
          <div style={{ position: "absolute", left: 104, top: 104, width: 32, height: 32, borderRadius: 16, background: "#a82a36" }} />
        </div>
        <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 900, fontSize: 104, color: "#f2d27a", letterSpacing: 2,
          textShadow: "0 0 18px rgba(242,210,122,0.5), 0 4px 0 #0a0d20" }}>{c.label}</div>
      </div>
    </AbsoluteFill>
  );
};
const DayCard: React.FC<{ f: number }> = ({ f }) => {
  const d = DAYS.find((x) => f >= x.f0 && f < x.f1);
  if (!d) return null;
  const a = f - d.f0, b = d.f1 - f;
  const pop = a < 9 ? 1 + 0.12 * Math.sin((a / 9) * Math.PI) - (1 - a / 9) * 0.5 : 1;
  const out = b < 7 ? b / 7 : 1;
  const ink = d.night ? "#f2d27a" : "#2a1d28", paper = d.night
    ? "radial-gradient(ellipse at 50% 35%, #2c3a6e 0%, #18204a 70%, #10152f 100%)"
    : "radial-gradient(ellipse at 50% 35%, #fffaf0 0%, #f3e6c8 70%, #e2cfa4 100%)";
  const orn = d.night ? "#c9a24e" : "#a8782e";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: d.pad ?? (d.low ? "118%" : "15%") }}>
      <div style={{ transform: `scale(${pop * out}) rotate(${-3 + 2 * Math.sin(a / 14)}deg)`, opacity: out, width: 780, padding: "46px 30px 52px",
        background: paper, borderRadius: 26, border: `10px solid ${orn}`, boxShadow: "0 18px 40px rgba(0,0,0,0.55), inset 0 0 0 6px rgba(0,0,0,0.12), inset 0 0 0 16px " + (d.night ? "#18204a" : "#f3e6c8") + ", inset 0 0 0 20px " + orn,
        textAlign: "center", fontFamily: "Georgia, 'Times New Roman', serif", position: "relative",
        backgroundImage: `${paper}, repeating-linear-gradient(45deg, rgba(0,0,0,0.035) 0 3px, rgba(255,255,255,0.03) 3px 7px)` }}>
        {[[18, 18], [18, 1], [1, 18], [1, 1]].map(([t, l], i) => (
          <div key={i} style={{ position: "absolute", width: 26, height: 26, background: orn, transform: "rotate(45deg)",
            top: t === 18 ? 18 : undefined, bottom: t === 1 ? 18 : undefined, left: l === 18 ? 18 : undefined, right: l === 1 ? 18 : undefined }} />
        ))}
        <div style={{ fontSize: 30, letterSpacing: 14, color: orn, fontWeight: 700 }}>{d.night ? "\u2605 \u263E \u2605" : "\u2766 \u2766 \u2766"}</div>
        <div style={{ fontSize: d.top.length > 8 ? 96 : d.top.length > 6 ? 116 : 150, fontWeight: 900, letterSpacing: 6, color: ink, lineHeight: 1.05, marginTop: 10,
          textShadow: d.night ? "0 0 18px rgba(242,210,122,0.55), 0 4px 0 #0a0d20" : "0 4px 0 rgba(255,255,255,0.8)" }}>{d.top}</div>
        {d.sub && <div style={{ fontSize: d.sub.length > 6 ? 70 : 96, fontWeight: 900, letterSpacing: d.sub.length > 6 ? 14 : 26, color: d.night ? "#ffffff" : "#a82a36", marginTop: 4,
          textShadow: d.night ? "0 0 16px rgba(160,190,255,0.7)" : "0 4px 0 rgba(255,255,255,0.8)" }}>{d.sub}</div>}
        <div style={{ height: 8, margin: "26px 90px 0", background: `linear-gradient(90deg, transparent, ${orn}, transparent)` }} />
      </div>
    </AbsoluteFill>
  );
};
import { Effect } from "postprocessing";
import { Uniform } from "three";

/** radial zoom blur toward the frame centre, for the hook's fast rise and dive (strength 0 = off) */
class ZoomBlur extends Effect {
  constructor() {
    super("ZoomBlur", /* glsl */ `
      uniform float strength; uniform float dim; uniform float warm; uniform float gold;
      // colour script: warm = candle-lit amber memory (the flashback), gold = a sunny golden lift (the ending)
      vec3 script(vec3 c, float r) {
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, l * vec3(1.45, 1.0, 0.5) + vec3(0.03, 0.015, 0.0), 0.85 * warm);
        c *= 1.0 - 0.45 * warm * smoothstep(0.26, 0.76, r);
        c = mix(c, c * vec3(1.08, 1.0, 0.86) + vec3(0.02, 0.012, 0.0), gold);
        return c;
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // dim > 0: the scene sinks into shadow round the centre (HDR highlights such as the diamond stay blown out)
        float r = length((uv - 0.5) * vec2(1.0, 1.5));
        float keep = mix(1.0, 0.42 * (1.0 - 0.75 * smoothstep(0.12, 0.7, r)), dim);
        if (strength < 1e-4) { outputColor = vec4(script(inputColor.rgb * keep, r), inputColor.a); return; }
        vec2 d = (vec2(0.5) - uv) * strength;
        vec4 acc = vec4(0.0);
        for (int i = 0; i < 12; i++) acc += texture2D(inputBuffer, uv + d * (float(i) / 11.0));
        outputColor = vec4(script(acc.rgb / 12.0 * keep, r), acc.a / 12.0);
      }`, { uniforms: new Map([["strength", new Uniform(0)], ["dim", new Uniform(0)], ["warm", new Uniform(0)], ["gold", new Uniform(0)]]) });
  }
}

export const BRIDGE_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean; zoom: boolean };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, zoom: true, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

/** Bloom for emissive sources only (depth.md 6.4). Its MIP chain always starts at 540x960 (half of 1080x1920),
 *  whatever the output size, so the glow keeps the same size relative to the frame (e-fold ~30 px at 1080p,
 *  ~1.5 % of the frame height) at 540, 1080 and 1440 widths. ADD blend: HDR-safe (SCREEN darkens values > 1). */
const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

/** QA gate proof-of-life: the first time the composer really runs a pass/effect it prints "[FX] <name> active"
 *  (Effects through update(), Passes through render()). scripts/fx_gate.mjs and render_final.mjs read these logs. */
const fxSeen = new Set<string>();
const fxLog = <T extends object>(name: string, o: T, info: () => string = () => ""): T => {
  const x = o as unknown as Record<string, unknown>;
  const key = typeof x.render === "function" ? "render" : "update";
  const orig = x[key] as ((...a: unknown[]) => unknown) | undefined;
  x[key] = function (this: unknown, ...a: unknown[]) {
    if (!fxSeen.has(name)) { fxSeen.add(name); console.log(`[FX] ${name} active${info()}`); }
    return orig ? orig.apply(this, a) : undefined;
  };
  return o;
};

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("bridge kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit }> = ({ id, kit }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(kit), [kit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const fx = useMemo(() => {
    const lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
    fxLog("lens", lens.main);
    return {
      ink: fxLog("ink", new InkPass(scene, camera as THREE.PerspectiveCamera)),
      lens,
      bloom: fxLog("bloom", makeBloom()),
      tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      grade: fxLog("grade", new GradeEffect(GRADES.day, GRADE_STRENGTH.day)),
      grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }), // film grain, OFF by default (inputProps post.grain): the reference measures no grain and it quadruples the file size
      zoom: fxLog("zoom", new ZoomBlur()), // radial blur on the hook's rise and dive (zoomBlurAt), the dim and the colour script
    };
  }, [camera, scene]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  // @react-three/postprocessing 3.0.4 (pinned: newer versions render blank under Remotion with three 0.187) types
  // its children as Element, not Element | null, so build the pass list without the nulls
  const post = useMemo(() => {
    const passes: [boolean, object][] = [[on.ink, fx.ink], [on.lens && on.pre, fx.lens.pre], [on.lens, fx.lens.main], [on.zoom, fx.zoom], [on.bloom, fx.bloom],
      [true, fx.tone], [on.grade, fx.grade], [on.grain, fx.grain]];
    return (
      <EffectComposer multisampling={4}>
        {passes.filter(([use]) => use).map(([, o], i) => <primitive key={i} object={o} dispose={null} />)}
      </EffectComposer>
    );
  }, [fx, on]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, SHOTS[id - 1].light);
  fx.grain.seed = f; // deterministic per frame
  fx.zoom.uniforms.get("strength")!.value = zoomBlurAt(f);
  fx.zoom.uniforms.get("warm")!.value = FLASHBACK.includes(id) ? 1 : 0;
  fx.zoom.uniforms.get("gold")!.value = id >= GOLD_FROM ? 1 : 0;
  fx.zoom.uniforms.get("dim")!.value = 0;
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {post}
    </>
  );
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number }> = ({ id, kit, alpha }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows="soft" gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} kit={kit} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const BridgeShort: React.FC = () => {
  const f = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {/* a gentle vignette: the eye stays on the middle of the frame */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 62% at 50% 48%, rgba(0,0,0,0) 55%, rgba(18,10,28,0.32) 100%)" }} />
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
      {blackoutAt(f) > 0 && <AbsoluteFill style={{ background: "#000000", opacity: blackoutAt(f) }} />}
      <DayCard f={f} />
      <TimeCard f={f} />
      {f >= BLACK_AT && <AbsoluteFill style={{ background: "#000000", opacity: Math.min(1, (f - BLACK_AT + 1) / (BLACK_FULL - BLACK_AT)) }} />}
    </AbsoluteFill>
  );
};
