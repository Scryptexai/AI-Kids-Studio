import { registerRoot, Composition } from 'remotion';
import React from 'react';
import { SceneComposition } from './Scene.jsx';

// Duration, fps and size come from the input props so one composition serves every scene.
const Root = () => (
  <Composition
    id="KidsScene"
    component={SceneComposition}
    fps={24}
    width={1280}
    height={720}
    durationInFrames={240}
    defaultProps={{
      scene: { id: 'placeholder', durationSec: 1, camera: { keyframes: [] }, characters: [], props: [], subtitles: [] },
      world: { artDirection: { palette: {} } },
      characters: [],
      backgroundDataUri: null,
      showDebug: false,
      fps: 24,
      width: 1280,
      height: 720,
    }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.round((props.scene?.durationSec ?? 1) * (props.fps ?? 24))),
      fps: props.fps ?? 24,
      width: props.width ?? 1280,
      height: props.height ?? 720,
    })}
  />
);

registerRoot(Root);
