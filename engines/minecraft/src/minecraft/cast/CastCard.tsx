// The 2D ink cast in the voxel world: a card that turns (about y only, feet planted) to face the lens wherever the
// camera goes. The picture is either layered PNGs (bottom first, each in the 600 x 1000 design frame, soles at y 975)
// or, without layers, a figure from the skill's toon kit. Optional thick ink outline round the whole silhouette,
// unlit but tinted by the sky preset, a soft contact blob, and a real sun shadow (alpha-tested depth).
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { INK, Pen, bodyFront, townsfolk, type ExprIn, type FrontOpts, type Outfit } from "./toon";

/** metres per design unit (as the skill's cast: 1000 units = 2.16 m) */
export const SU = 0.00216;
const DW = 600, DH = 1000, SOLES = 975;

export type CastLook = "camera" | "left" | "right";
export type CastDraw = { layers?: HTMLImageElement[]; outfit?: Outfit; expr?: ExprIn; blink?: number; phase?: number; look: CastLook; seed: number;
  /** acting from the plan's events and the idle life (see McShort): arm pose, lean, head tilt, hat/hair drag */
  act?: Pick<FrontOpts, "arm" | "armK" | "armRaw" | "lean" | "headTilt" | "drag" | "mode"> };

/** draw the figure into a canvas (k = pixels per design unit), with an optional ink outline of `outline` design units */
export const drawCast = (d: CastDraw, k: number, outline: number): HTMLCanvasElement => {
  const fig = document.createElement("canvas");
  fig.width = Math.round(DW * k); fig.height = Math.round(DH * k);
  const g = fig.getContext("2d")!;
  if (d.layers?.length) {
    for (const im of d.layers) g.drawImage(im, 0, 0, fig.width, fig.height);
  } else {
    g.setTransform(k, 0, 0, k, 0, 0);
    const p = new Pen(g);
    bodyFront(p, d.outfit ?? townsfolk(d.seed), {
      mode: "stand", ...d.act, expr: d.expr ?? "neutral", blink: d.blink ?? 0, phase: d.phase ?? 0, seed: d.seed,
      facing: d.look === "left" ? -1 : d.look === "right" ? 1 : 0,
    });
  }
  if (outline <= 0) return fig;
  // ink outline: the silhouette stamped round a ring, filled with ink, the figure on top
  const out = document.createElement("canvas");
  out.width = fig.width; out.height = fig.height;
  const o = out.getContext("2d")!;
  const r = outline * k;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; o.drawImage(fig, Math.cos(a) * r, Math.sin(a) * r); }
  o.globalCompositeOperation = "source-in";
  o.fillStyle = INK;
  o.fillRect(0, 0, out.width, out.height);
  o.globalCompositeOperation = "source-over";
  o.drawImage(fig, 0, 0);
  return out;
};

const blobTexture = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.55, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    t = new THREE.CanvasTexture(cv);
    return t;
  };
})();

export type CastCardProps = {
  at: [number, number, number]; draw: CastDraw; tint: string; outline?: number; k?: number;
  /** squash (+, wider and shorter) / stretch (-), from the soles */
  squash?: number;
  /** extra objects that turn with the card (a held item), in card space: x right, y up, metres */
  children?: React.ReactNode;
};

export const CastCard: React.FC<CastCardProps> = ({ at, draw, tint, outline = 0, k = 1.4, squash = 0, children }) => {
  const key = JSON.stringify({ ...draw, layers: draw.layers?.map((l) => l.src) });
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(drawCast(draw, k, outline));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, k, outline]);
  useEffect(() => () => tex.dispose(), [tex]);
  // the plane's centre is design y 500; the soles (y 975) sit 475 units below it -> lift so the soles are at 0
  const geo = useMemo(() => new THREE.PlaneGeometry(DW * SU, DH * SU).translate(0, (SOLES - DH / 2) * SU, 0), []);
  const yawGroup = useRef<THREE.Group>(null);
  const { camera } = useThree();
  // yaw-only billboard: face the lens from wherever it is this frame (the camera rig runs its layout effect first)
  useLayoutEffect(() => {
    const g = yawGroup.current;
    if (!g) return;
    g.rotation.y = Math.atan2(camera.position.x - at[0], camera.position.z - at[2]);
  });
  const depth = useMemo(() => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 }), [tex]);
  return (
    <group position={at}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} renderOrder={2}>
        <planeGeometry args={[0.9, 0.55]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <group ref={yawGroup} scale={[1 + 0.6 * squash, 1 - squash, 1]}>
        <mesh geometry={geo} castShadow customDepthMaterial={depth} renderOrder={3}>
          <meshBasicMaterial map={tex} color={tint} alphaTest={0.5} side={THREE.DoubleSide} />
        </mesh>
        {children}
      </group>
    </group>
  );
};
