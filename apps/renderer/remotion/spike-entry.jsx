// Minimal smoke-test composition used to prove the Remotion + Chromium path works in
// this environment before building the real scene backend.
import { registerRoot, Composition, useCurrentFrame, interpolate } from 'remotion';
import React from 'react';

const Smoke = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 29], [0, 320]);
  return (
    <div style={{ flex: 1, background: 'linear-gradient(160deg,#a8d8f0,#4f9d52)', position: 'relative' }}>
      <h1 style={{ position: 'absolute', left: 40, top: 120, color: '#fff', fontFamily: 'sans-serif', fontSize: 48 }}>
        Remotion works
      </h1>
      <div style={{ position: 'absolute', left: x, top: 240, width: 80, height: 80, borderRadius: 40, background: '#fff3c4' }} />
    </div>
  );
};

const Root = () => (
  <Composition id="Smoke" component={Smoke} durationInFrames={30} fps={24} width={640} height={360} />
);

registerRoot(Root);
