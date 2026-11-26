import React from "react";
import { Composition } from "remotion";
import { McPreview, McPreviewDefaults } from "./minecraft/McPreview";
import { McShort, McShortDefaults, mcShortMetadata } from "./minecraft/McShort";

// McPreview: one still of a staged set (npm run mc -- mc-preview <set>.voxel.json).
// McShort:   a whole short. base = the staged folder with plan.json + direction.json + voice.wav; its sets are the
//            sibling folders (public/mc-preview/<story>/<set>/world.json). Duration comes from plan.json.
// Add one <Composition> per story, like McDemo.
export const Root: React.FC = () => (
  <>
    <Composition id="McPreview" component={McPreview} durationInFrames={60} fps={30} width={1080} height={1920} defaultProps={{ ...McPreviewDefaults, dir: "mc-preview/demo/demo-yard", camera: "wide" }} />
    <Composition id="McDemo" component={McShort} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={{ ...McShortDefaults, base: "mc-preview/demo/short", tail: 0 }} calculateMetadata={mcShortMetadata} />
  </>
);
