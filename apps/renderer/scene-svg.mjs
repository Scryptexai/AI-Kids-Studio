// Scene JSON -> SVG frame.
//
// Pure and deterministic: the same scene + frame index always produces the same markup on
// any machine. That matters because renders are reproducible artefacts, not one-off images.
//
// Layer order (back to front): background -> far props -> characters (by z) -> near props
// -> subtitle -> frame furniture. Camera keyframes transform the whole world group.
import { renderCharacter, renderProp, esc, lerp } from './rigs.mjs';

const CAMERA_OVERSCAN = 1.12;

/** Linear interpolation between camera keyframes at time t. */
export function cameraAt(keyframes, t) {
  if (!keyframes?.length) return { x: 0.5, y: 0.5, zoom: 1 };
  if (t <= keyframes[0].t) return keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last;
  for (let i = 1; i < keyframes.length; i++) {
    const a = keyframes[i - 1];
    const b = keyframes[i];
    if (t <= b.t) {
      const span = b.t - a.t || 1;
      const p = (t - a.t) / span;
      const ease = p * p * (3 - 2 * p); // smoothstep, avoids robotic linear pans
      return { x: lerp(a.x, b.x, ease), y: lerp(a.y, b.y, ease), zoom: lerp(a.zoom, b.zoom, ease) };
    }
  }
  return last;
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines;
}

function renderSubtitle({ text, width, height }) {
  // Bottom-anchored broadcast caption band: sits in the lower safe area so it never
  // covers the characters' feet, and stays inside the YouTube Kids safe margin.
  const fontSize = Math.round(height * 0.038);
  const maxChars = Math.floor((width * 0.72) / (fontSize * 0.54));
  const lines = wrapText(text, maxChars).slice(0, 3);
  const lineHeight = fontSize * 1.24;
  const boxH = lines.length * lineHeight + fontSize * 0.4;
  const widest = Math.max(...lines.map((l) => l.length));
  const boxW = Math.min(width * 0.8, widest * fontSize * 0.56 + fontSize * 1.8);
  const x = (width - boxW) / 2;
  const y = height * 0.99 - boxH;

  const tspans = lines
    .map((l, i) => `<tspan x="${width / 2}" y="${y + fontSize * 0.45 + (i + 0.5) * lineHeight}">${esc(l)}</tspan>`)
    .join('');

  return (
    `<g>` +
    `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="${fontSize * 0.45}" fill="#0b1c2b" opacity="0.66"/>` +
    `<text font-family="DejaVu Sans" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle">${tspans}</text>` +
    `</g>`
  );
}

/** Which subtitle (if any) is on screen at time t. */
function activeSubtitle(scene, t) {
  return (scene.subtitles ?? []).find((s) => t >= s.startSec && t < s.endSec) ?? null;
}

/**
 * Build one frame of SVG.
 * @param {object} args
 * @param {object} args.scene   scene JSON
 * @param {object} args.world   world JSON
 * @param {Map<string,object>} args.characters  characterId -> character JSON
 * @param {number} args.frame   frame index
 * @param {number} args.fps
 * @param {number} args.width
 * @param {number} args.height
 * @param {string|null} args.backgroundDataUri  pre-scaled background as data URI
 * @param {boolean} args.showDebug
 */
export function buildSceneSvg({
  scene,
  world,
  characters,
  frame,
  fps,
  width,
  height,
  backgroundDataUri = null,
  backgroundSampling = 'quality',
  showDebug = false,
}) {
  const t = frame / fps;
  const cam = cameraAt(scene.camera.keyframes, t);
  const palette = world.artDirection?.palette ?? {};

  // Camera: pan/zoom the world group.
  //
  // Two things keep the frame from showing the void:
  //   1. overscan — zoom is multiplied past 1 so a pan never reaches the artwork edge;
  //   2. clamping — the translate is clamped so the scaled world always covers the viewport.
  // Without the clamp, an off-centre focus point exposes blank canvas at the frame edge,
  // which reads as a rendering bug even though the math is "correct".
  const zoom = cam.zoom * CAMERA_OVERSCAN;
  const worldW = width * zoom;
  const worldH = height * zoom;
  const clampTranslate = (value, worldSize, viewSize) => {
    // translate must be within [viewSize - worldSize, 0]
    const min = viewSize - worldSize;
    return Math.min(0, Math.max(min, value));
  };
  const translateX = clampTranslate(width / 2 - cam.x * worldW, worldW, width);
  const translateY = clampTranslate(height / 2 - cam.y * worldH, worldH, height);

  const background = backgroundDataUri
    ? `<image href="${backgroundDataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" image-rendering="${backgroundSampling === 'fast' ? 'optimizeSpeed' : 'optimizeQuality'}"/>`
    : `<rect x="0" y="0" width="${width}" height="${height}" fill="${palette.sky ?? '#a8d8f0'}"/>`;

  const props = (scene.props ?? []).map((p) => ({ ...p, svg: renderProp({ ...p, compositionHeight: height, compositionWidth: width }) }));

  // Characters ordered back-to-front so nearer instances overlap farther ones.
  const ordered = [...scene.characters]
    .filter((c) => c.entranceAt == null || t >= c.entranceAt)
    .sort((a, b) => a.position.z - b.position.z);

  const characterMarkup = ordered
    .map((instance) => {
      const character = characters.get(instance.characterId);
      if (!character) return '';
      const fade = instance.entranceAt != null ? Math.min(1, (t - instance.entranceAt) / 0.4) : 1;
      // data-character makes each layer traceable in tests and in rendered-SVG debugging.
      return `<g data-character="${esc(instance.characterId)}" data-animation="${esc(instance.animation)}" opacity="${fade.toFixed(3)}">${renderCharacter({ character, instance, tSec: t, compositionHeight: height, compositionWidth: width })}</g>`;
    })
    .join('');

  const sub = activeSubtitle(scene, t);
  const subtitleMarkup = sub ? renderSubtitle({ text: sub.text, width, height }) : '';

  const debugMarkup = showDebug
    ? `<g font-family="DejaVu Sans" font-size="16" fill="#ffffff">` +
      `<rect x="0" y="0" width="${width}" height="34" fill="#0f2233" opacity="0.6"/>` +
      `<text x="12" y="23">${esc(`${scene.id} f${frame} t=${t.toFixed(2)}s cam(${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.zoom.toFixed(2)})`)}</text></g>`
    : '';

  // The SVG viewport clips for free; an explicit clipPath costs ~36 ms/frame in tiny-skia.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<g transform="translate(${translateX.toFixed(2)} ${translateY.toFixed(2)}) scale(${zoom.toFixed(4)})">
${background}
${props.map((p) => p.svg).join('')}
${characterMarkup}
</g>
${subtitleMarkup}
${debugMarkup}
</svg>`;
}
