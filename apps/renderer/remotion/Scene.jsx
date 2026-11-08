// Remotion backend for the same scene JSON the SVG backend consumes.
//
// The drawing code is intentionally a separate React implementation: the point of having
// two backends is that either can be swapped in, and a shared timeline (cameraAt +
// animationState) keeps them visually consistent without one being a wrapper of the other.
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { animationState } from '../rigs.mjs';
import { sampleMotion, travelDirection, propInteractionAt, interactionProgress } from '../motion.mjs';
import { bodyHeightPx } from '../rigs.mjs';
import { cameraAt } from '../scene-svg.mjs';

const CAMERA_OVERSCAN = 1.12;

function Character({ character, instance, t }) {
  if (!character) return null;
  // Same sampler the SVG backend uses, so both backends move identically.
  const motion = sampleMotion(instance.motion, t, instance.position);
  const travelling = motion.moving && instance.motion;
  const st = animationState(instance.animation, t, character.id);
  if (travelling) {
    const phase = (t * 1.1 + 0.25) * Math.PI * 2;
    st.legSwing = Math.sin(phase * 1.6) * 0.55;
    st.armSwing = -Math.sin(phase * 1.6) * 0.4;
    st.bobY = Math.abs(Math.sin(phase * 1.6)) * -3;
  }
  const { palette } = character.visual;
  const h = 205 * (character.visual.bodyProportions.heightUnits / 4.2) * instance.scale;
  const headR = h * 0.16 * character.visual.bodyProportions.headScale;
  const bodyW = h * 0.24;
  const bodyH = h * 0.34;
  const legLen = h * 0.26;

  const cx = motion.x * (instance.compositionWidth ?? 1280);
  const groundY = motion.y * (instance.compositionHeight ?? 720);
  const footY = groundY + st.hopY;
  const bodyTop = footY - legLen - bodyH;
  const headCy = bodyTop - headR * 0.9;
  const squash = 1 + st.squash;
  const stroke = { stroke: '#243b2f', strokeWidth: Math.max(2, h * 0.012), strokeLinejoin: 'round' };

  return (
    <g>
      <ellipse cx={cx} cy={groundY + 2} rx={bodyW * 1.15} ry={bodyW * 0.24} fill="#000" opacity={0.16} />
      {[-1, 1].map((dir) => {
        const swing = dir === 1 ? st.legSwing : -st.legSwing;
        const hipX = cx + dir * bodyW * 0.26;
        const hipY = bodyTop + bodyH * 0.9;
        return (
          <g key={`leg${dir}`} transform={`rotate(${(swing / legLen) * 42} ${hipX} ${hipY})`}>
            <rect x={hipX - bodyW * 0.11} y={hipY} width={bodyW * 0.22} height={legLen} rx={bodyW * 0.1} fill={palette.secondary} {...stroke} />
            <ellipse cx={hipX} cy={hipY + legLen} rx={bodyW * 0.2} ry={bodyW * 0.11} fill="#3a3a3a" {...stroke} />
          </g>
        );
      })}
      <g transform={`translate(0 ${footY}) scale(1 ${squash}) translate(0 ${-footY})`}>
        <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} rx={bodyW * 0.34} fill={palette.primary} {...stroke} />
      </g>
      {[-1, 1].map((dir) => {
        const swing = dir === 1 ? st.armSwing : -st.armSwing;
        const raise = st.raiseSide === 0 || st.raiseSide === dir ? st.armRaise : 0;
        // SVG rotate() swings a downward arm inward for positive angles: negate.
        const rotation = -(dir * 8 + swing * 26 + dir * raise * 115);
        const ax = cx + dir * bodyW * 0.5;
        const ay = bodyTop + bodyH * 0.16;
        const armLen = bodyH * 0.82;
        return (
          <g key={`arm${dir}`} transform={`rotate(${rotation} ${ax} ${ay})`}>
            <rect x={ax - bodyW * 0.09} y={ay} width={bodyW * 0.18} height={armLen} rx={bodyW * 0.09} fill={palette.primary} {...stroke} />
            <circle cx={ax} cy={ay + armLen} r={bodyW * 0.13} fill={palette.accent} {...stroke} />
          </g>
        );
      })}
      <g transform={`rotate(${st.tilt * 40} ${cx} ${headCy + headR})`}>
        <circle cx={cx} cy={headCy} r={headR} fill={palette.accent} {...stroke} />
        <Face cx={cx} headCy={headCy} headR={headR} facing={(travelling ? (travelDirection(instance.motion, t) ?? instance.facing) : instance.facing) === 'left' ? -1 : 1} st={st} palette={palette} />
      </g>
    </g>
  );
}

function Face({ cx, headCy, headR, facing, st, palette }) {
  const eyeY = headCy - headR * 0.12;
  const eyeDx = headR * 0.36;
  const eyeR = headR * (st.mouthOpen > 0.85 ? 0.17 : 0.12);
  const look = facing * headR * 0.06;
  const mouthH = headR * 0.08 + st.mouthOpen * headR * 0.3;
  return (
    <g>
      {[-1, 1].map((dir) => {
        const ex = cx + dir * eyeDx;
        return st.blink ? (
          <rect key={dir} x={ex - eyeR} y={eyeY - 1.5} width={eyeR * 2} height={3} rx={1.5} fill="#243b2f" />
        ) : (
          <g key={dir}>
            <circle cx={ex} cy={eyeY} r={eyeR} fill="#fff" />
            <circle cx={ex + look} cy={eyeY + 1} r={eyeR * 0.55} fill="#243b2f" />
          </g>
        );
      })}
      <circle cx={cx - headR * 0.62} cy={headCy + headR * 0.3} r={headR * 0.13} fill={palette.secondary} opacity={0.55} />
      <circle cx={cx + headR * 0.62} cy={headCy + headR * 0.3} r={headR * 0.13} fill={palette.secondary} opacity={0.55} />
      <ellipse cx={cx} cy={headCy + headR * 0.46} rx={headR * 0.34} ry={mouthH / 2 + 2} fill="#5b2c2c" />
      {st.tears && (
        <g fill="#8fd3ff">
          <ellipse cx={cx - headR * 0.38} cy={eyeY + headR * 0.32} rx={headR * 0.07} ry={headR * 0.11} />
          <ellipse cx={cx + headR * 0.38} cy={eyeY + headR * 0.42} rx={headR * 0.06} ry={headR * 0.1} />
        </g>
      )}
    </g>
  );
}

function Prop({ prop, width, height }) {
  const px = prop.x * width;
  const g = prop.y * height;
  const s = prop.scale;
  const kind = prop.propId.split('-')[0];
  const st = { stroke: '#243b2f', strokeWidth: 3 };
  switch (kind) {
    case 'tree':
      return (
        <g>
          <rect x={px - 9 * s} y={g - 70 * s} width={18 * s} height={70 * s} fill="#8a5a3b" {...st} />
          <circle cx={px} cy={g - 100 * s} r={52 * s} fill="#4f9d52" {...st} />
          <circle cx={px - 34 * s} cy={g - 82 * s} r={30 * s} fill="#2f6b39" {...st} />
          <circle cx={px + 34 * s} cy={g - 84 * s} r={28 * s} fill="#2f6b39" {...st} />
        </g>
      );
    case 'rock':
      return <path d={`M${px - 30 * s} ${g} q6 -26 ${30 * s} -28 q24 2 ${30 * s} 28 z`} fill="#b9c0c8" {...st} />;
    case 'house':
      return (
        <g>
          <rect x={px - 60 * s} y={g - 80 * s} width={120 * s} height={80 * s} fill="#f2d6a2" {...st} />
          <path d={`M${px - 74 * s} ${g - 80 * s} L${px} ${g - 136 * s} L${px + 74 * s} ${g - 80 * s} z`} fill="#c0553f" {...st} />
        </g>
      );
    case 'flower':
      return (
        <g>
          {[-26, -6, 14, 32].map((dx) => (
            <g key={dx}>
              <line x1={px + dx * s} y1={g} x2={px + dx * s} y2={g - 18 * s} stroke="#2f6b39" strokeWidth={2 * s} />
              <circle cx={px + dx * s} cy={g - 20 * s} r={5 * s} fill="#f2c94c" stroke="#243b2f" strokeWidth={1.5} />
            </g>
          ))}
        </g>
      );
    case 'bench':
      return (
        <g>
          <rect x={px - 40 * s} y={g - 26 * s} width={80 * s} height={9 * s} rx={3} fill="#8a5a3b" {...st} />
          <rect x={px - 40 * s} y={g - 46 * s} width={80 * s} height={9 * s} rx={3} fill="#8a5a3b" {...st} />
          <rect x={px - 34 * s} y={g - 26 * s} width={6 * s} height={26 * s} fill="#6b4526" />
          <rect x={px + 28 * s} y={g - 26 * s} width={6 * s} height={26 * s} fill="#6b4526" />
        </g>
      );
    case 'toy':
      return <circle cx={px} cy={g - 14 * s} r={16 * s} fill="#f2994a" {...st} />;
    default:
      return null;
  }
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = w;
    } else line = `${line} ${w}`.trim();
  }
  if (line) lines.push(line.trim());
  return lines;
}

function Subtitle({ text, width, height }) {
  const fontSize = Math.round(height * 0.042);
  const lines = wrapText(text, Math.floor((width * 0.72) / (fontSize * 0.54))).slice(0, 3);
  const lineHeight = fontSize * 1.24;
  const boxH = lines.length * lineHeight + fontSize * 0.55;
  const widest = Math.max(...lines.map((l) => l.length));
  const boxW = Math.min(width * 0.8, widest * fontSize * 0.56 + fontSize * 1.8);
  const x = (width - boxW) / 2;
  const y = height * 0.975 - boxH;
  return (
    <g>
      <rect x={x} y={y} width={boxW} height={boxH} rx={fontSize * 0.45} fill="#0b1c2b" opacity={0.66} />
      {lines.map((l, i) => (
        <text
          key={i}
          x={width / 2}
          y={y + fontSize * 0.45 + (i + 0.5) * lineHeight}
          fontFamily="DejaVu Sans"
          fontSize={fontSize}
          fontWeight="bold"
          fill="#ffffff"
          textAnchor="middle"
        >
          {l}
        </text>
      ))}
    </g>
  );
}

export const SceneComposition = ({ scene, world, characters, backgroundDataUri, showDebug }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const cam = cameraAt(scene.camera.keyframes, t);
  const zoom = cam.zoom * CAMERA_OVERSCAN;
  const translateX = width / 2 - cam.x * width * zoom;
  const translateY = height / 2 - cam.y * height * zoom;

  const byId = new Map((characters ?? []).map((c) => [c.id, c]));
  const ordered = [...scene.characters]
    .filter((c) => c.entranceAt == null || t >= c.entranceAt)
    .sort((a, b) => a.position.z - b.position.z)
    .map((inst) => ({
      ...inst,
      compositionWidth: width,
      compositionHeight: height,
    }));

  const sub = (scene.subtitles ?? []).find((s) => t >= s.startSec && t < s.endSec) ?? null;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <g transform={`translate(${translateX} ${translateY}) scale(${zoom})`}>
        {backgroundDataUri ? (
          <image href={backgroundDataUri} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <rect x={0} y={0} width={width} height={height} fill={world?.artDirection?.palette?.sky ?? '#a8d8f0'} />
        )}
        {(scene.props ?? []).map((p, i) => (
          <Prop key={i} prop={p} width={width} height={height} />
        ))}
        {ordered.map((inst) => {
          const fade = inst.entranceAt != null ? Math.min(1, (t - inst.entranceAt) / 0.4) : 1;
          return (
            <g key={inst.characterId} opacity={fade}>
              <Character character={byId.get(inst.characterId)} instance={inst} t={t} />
            </g>
          );
        })}
      </g>
      {sub ? <Subtitle text={sub.text} width={width} height={height} /> : null}
      {showDebug ? (
        <g fontFamily="DejaVu Sans" fontSize={16} fill="#fff">
          <rect x={0} y={0} width={width} height={34} fill="#0f2233" opacity={0.6} />
          <text x={12} y={23}>{`${scene.id} f${frame} t=${t.toFixed(2)}s`}</text>
        </g>
      ) : null}
    </svg>
  );
};
void interpolate;
