// Still-frame preview of one compiled Minecraft set (npm run director -- mc-preview). Props: the staged folder under
// public/ and a camera id from the set; markers = draw the set's mobs, props and cast (off: the bare world).
import React from "react";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { CameraRig, VoxelWorld, useMcWorld } from "./VoxelWorld";
import { Actors } from "./Actors";

export type McPreviewProps = { dir: string; camera: string; markers: boolean };
export const McPreviewDefaults: McPreviewProps = { dir: "mc-preview/village-yard", camera: "wide", markers: true };

// the world (json + textures) loads OUTSIDE the canvas, and the canvas mounts once it is there: a canvas that is
// already up does not draw again when async state arrives inside it (that gave black stills)
export const McPreview: React.FC<McPreviewProps> = ({ dir, camera, markers }) => {
  const lw = useMcWorld(dir);
  const shot = lw ? (lw.world.cameras.find((c) => c.id === camera) ?? lw.world.cameras[0]) : null;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {lw && shot && (
        <ThreeCanvas width={1080} height={1920} flat shadows="soft" gl={{ antialias: true, stencil: false }} camera={{ fov: shot.fov, near: 0.05, far: 400, position: shot.position }}>
          <CameraRig shot={shot} />
          <VoxelWorld lw={lw} actors={markers ? <Actors lw={lw} /> : null} />
        </ThreeCanvas>
      )}
    </AbsoluteFill>
  );
};
