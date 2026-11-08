import { sampleMotionWithDepth, travelDirection } from './motion.mjs';
import { animationState, bodyHeightPx, esc, clamp, lerp } from './state.mjs';
import { solvePose } from './pose.mjs';

// Placeholder character rig drawn as flat vector parts.
//
// This is deliberately a *rig*, not a sprite: head, body, limbs and face are separate
// shapes transformed every frame by the animation state. When final character art exists,
// each part gets replaced by an image layer and the transform code keeps working — the
// scene JSON contract does not change.
//
// Every shape is derived from the character's palette in library/characters/*.character.json,
// so characters stay visually distinguishable without any artwork.


/**
 * Render one character instance into SVG markup.
 * Coordinates are in composition pixels; the caller has already applied camera transform.
 *
 * The figure is a cutout skeleton with two joints per limb. Everything that defines where a
 * part goes comes from `solvePose`, so this function only decides how parts look — never where
 * they are. `handPosition` reads the same pose, which is why a carried prop lands in the hand.
 */
export function renderCharacter({ character, instance, tSec, compositionHeight, compositionWidth }) {
  const palette = character.visual.palette;
  const look = character.visual.look ?? {};
  const pose = solvePose({ character, instance, tSec, compositionHeight, compositionWidth });
  const { state: st, facingDir, cx, groundY, bodyTop, headCy, headR, bodyW, bodyH, footY, limbs } = pose;

  const outline = look.outline ?? '#243b2f';
  const strokeW = Math.max(2, bodyH * 0.055);
  const stroke = `stroke="${outline}" stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"`;

  const shirt = look.shirt ?? palette.primary;
  const trousers = look.trousers ?? palette.secondary;
  const skin = look.skin ?? palette.accent;
  const shoe = look.shoe ?? '#3a3a3a';

  const parts = [];

  // --- ground contact: an ellipse under the figure, wider when it is planted --------------
  parts.push(
    `<ellipse cx="${cx}" cy="${groundY + 2}" rx="${bodyW * 1.15}" ry="${bodyW * 0.24}" fill="#000" opacity="0.16"/>`,
  );

  // --- back leg, then back arm, so they sit behind the torso ------------------------------
  parts.push(renderLeg(limbs.left, { trousers, shoe, skin, stroke, strokeW, outline }));
  parts.push(renderArm(limbs.left, { shirt, skin, stroke, strokeW, outline }));

  // --- torso: a soft rounded rectangle, leaning with the animation ------------------------
  const lean = (st.lean ?? 0) * 40 + st.tilt * 25;
  const squash = 1 + st.squash;
  parts.push(
    `<g transform="rotate(${lean.toFixed(2)} ${cx} ${bodyTop + bodyH}) translate(0 ${footY}) scale(1 ${squash}) translate(0 ${-footY})">` +
      `<rect x="${cx - bodyW / 2}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${bodyW * 0.36}" fill="${shirt}" ${stroke}/>` +
      // collar: a small V so the neck is not a bare seam
      `<path d="M${cx - bodyW * 0.18} ${bodyTop + 1} L${cx} ${bodyTop + bodyH * 0.16} L${cx + bodyW * 0.18} ${bodyTop + 1}" fill="none" stroke="${outline}" stroke-width="${(strokeW * 0.7).toFixed(2)}" opacity="0.5"/>` +
    `</g>`,
  );

  // --- front leg and front arm, so they read in front ------------------------------------
  parts.push(renderLeg(limbs.right, { trousers, shoe, skin, stroke, strokeW, outline }));
  parts.push(renderArm(limbs.right, { shirt, skin, stroke, strokeW, outline }));

  // --- head ------------------------------------------------------------------------------
  const tilt = st.tilt * 40;
  parts.push(
    `<g transform="rotate(${tilt.toFixed(2)} ${cx} ${headCy + headR})">` +
      renderHair(look, { cx, headCy, headR, outline, stroke, facingDir }) +
      `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${skin}" ${stroke}/>` +
      renderEars({ cx, headCy, headR, skin, stroke, strokeW }) +
      (look.hairStyle === 'fringe' ? renderFringe({ cx, headCy, headR, look, stroke }) : '') +
      renderFace({ cx, headCy, headR, facing: facingDir, state: st, palette, look, outline }) +
    `</g>`,
  );

  return parts.join('');
}

/** A leg drawn as thigh + shin with a knee joint, plus a shoe. */
function renderLeg(limb, { trousers, shoe, skin, stroke, strokeW, outline }) {
  const { hip, knee, foot, dir } = limb;
  const width = strokeW * 1.9;
  const kneeR = width * 0.52;
  const ankleR = width * 0.46;
  // The shoe points the way the body faces.
  const toeX = foot.x + dir * width * 1.15;
  return (
    `<line x1="${hip.x.toFixed(2)}" y1="${hip.y.toFixed(2)}" x2="${knee.x.toFixed(2)}" y2="${knee.y.toFixed(2)}" stroke="${outline}" stroke-width="${(width + strokeW).toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${hip.x.toFixed(2)}" y1="${hip.y.toFixed(2)}" x2="${knee.x.toFixed(2)}" y2="${knee.y.toFixed(2)}" stroke="${trousers}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${knee.x.toFixed(2)}" y1="${knee.y.toFixed(2)}" x2="${foot.x.toFixed(2)}" y2="${foot.y.toFixed(2)}" stroke="${outline}" stroke-width="${(width + strokeW).toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${knee.x.toFixed(2)}" y1="${knee.y.toFixed(2)}" x2="${foot.x.toFixed(2)}" y2="${foot.y.toFixed(2)}" stroke="${trousers}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>` +
    // an ankle of skin so the leg does not end in a seam
    `<circle cx="${foot.x.toFixed(2)}" cy="${foot.y.toFixed(2)}" r="${ankleR.toFixed(2)}" fill="${skin}"/>` +
    `<ellipse cx="${toeX.toFixed(2)}" cy="${(foot.y + width * 0.34).toFixed(2)}" rx="${(width * 0.95).toFixed(2)}" ry="${(width * 0.52).toFixed(2)}" fill="${shoe}" ${stroke}/>` +
    `<circle cx="${knee.x.toFixed(2)}" cy="${knee.y.toFixed(2)}" r="${kneeR.toFixed(2)}" fill="${trousers}"/>`
  );
}

/** An arm drawn as upper arm + forearm with an elbow joint, ending in a hand. */
function renderArm(limb, { shirt, skin, stroke, strokeW, outline }) {
  const { shoulder, elbow, hand } = limb;
  const width = strokeW * 1.55;
  const handR = width * 0.62;
  return (
    `<line x1="${shoulder.x.toFixed(2)}" y1="${shoulder.y.toFixed(2)}" x2="${elbow.x.toFixed(2)}" y2="${elbow.y.toFixed(2)}" stroke="${outline}" stroke-width="${(width + strokeW).toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${shoulder.x.toFixed(2)}" y1="${shoulder.y.toFixed(2)}" x2="${elbow.x.toFixed(2)}" y2="${elbow.y.toFixed(2)}" stroke="${shirt}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${elbow.x.toFixed(2)}" y1="${elbow.y.toFixed(2)}" x2="${hand.x.toFixed(2)}" y2="${hand.y.toFixed(2)}" stroke="${outline}" stroke-width="${(width + strokeW).toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${elbow.x.toFixed(2)}" y1="${elbow.y.toFixed(2)}" x2="${hand.x.toFixed(2)}" y2="${hand.y.toFixed(2)}" stroke="${shirt}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>` +
    `<circle cx="${hand.x.toFixed(2)}" cy="${hand.y.toFixed(2)}" r="${handR.toFixed(2)}" fill="${skin}" ${stroke}/>` +
    `<circle cx="${elbow.x.toFixed(2)}" cy="${elbow.y.toFixed(2)}" r="${(width * 0.5).toFixed(2)}" fill="${shirt}"/>`
  );
}

/** Hair drawn behind the head, so it reads as a silhouette rather than a hat. */
function renderHair(look, { cx, headCy, headR, outline, stroke }) {
  const style = look.hairStyle ?? 'cap';
  if (style === 'none') return '';
  const color = look.hair ?? '#4a3327';
  if (style === 'fringe') return '';
  if (style === 'cap') {
    return `<path d="M${cx - headR * 1.02} ${headCy - headR * 0.18} a${headR} ${headR} 0 0 1 ${headR * 2.04} 0 q${-headR * 0.3} ${-headR * 0.5} ${-headR * 1.02} ${-headR * 0.5} q${-headR * 0.72} 0 ${-headR * 1.02} ${headR * 0.5} z" fill="${color}" ${stroke}/>`;
  }
  // 'tuft': a rounded cap plus a small sprout, which reads well at small sizes.
  return (
    `<path d="M${cx - headR * 1.02} ${headCy - headR * 0.12} a${headR} ${headR} 0 0 1 ${headR * 2.04} 0 q${-headR * 0.4} ${-headR * 0.42} ${-headR * 1.02} ${-headR * 0.42} q${-headR * 0.62} 0 ${-headR * 1.02} ${headR * 0.42} z" fill="${color}" ${stroke}/>` +
    `<path d="M${cx + headR * 0.1} ${headCy - headR * 0.92} q${headR * 0.22} ${-headR * 0.34} ${headR * 0.5} ${-headR * 0.3}" fill="none" stroke="${color}" stroke-width="${(headR * 0.16).toFixed(2)}" stroke-linecap="round"/>`
  );
}

function renderFringe({ cx, headCy, headR, look, stroke }) {
  const color = look.hair ?? '#4a3327';
  return `<path d="M${cx - headR * 0.98} ${headCy - headR * 0.1} q${headR * 0.42} ${headR * 0.5} ${headR * 0.98} ${headR * 0.42} q${headR * 0.56} ${headR * 0.08} ${headR * 0.98} ${-headR * 0.42} q${-headR * 0.1} ${-headR * 0.9} ${-headR * 0.98} ${-headR * 0.92} q${-headR * 0.88} ${headR * 0.02} ${-headR * 0.98} ${headR * 0.92} z" fill="${color}" ${stroke}/>`;
}

function renderEars({ cx, headCy, headR, skin, stroke, strokeW }) {
  const r = headR * 0.17;
  return (
    `<circle cx="${(cx - headR * 0.97).toFixed(2)}" cy="${(headCy + headR * 0.06).toFixed(2)}" r="${r.toFixed(2)}" fill="${skin}" ${stroke}/>` +
    `<circle cx="${(cx + headR * 0.97).toFixed(2)}" cy="${(headCy + headR * 0.06).toFixed(2)}" r="${r.toFixed(2)}" fill="${skin}" ${stroke}/>`
  );
}

export { esc, clamp, lerp, bodyHeightPx, animationState };

/**
 * Where a character's hand actually is, in composition pixels.
 *
 * Derived from `solvePose`, the same function that draws the figure. The first version of this
 * duplicated the rig's arithmetic and drifted: a carried ball ended up a head's width from the
 * hand. Reading the pose makes the drawn hand and the prop attachment the same point by
 * construction.
 *
 * @param {'left'|'right'} side Which hand. Defaults to `right`.
 */
export function handPosition({ character, instance, tSec, compositionHeight, compositionWidth, side = 'right' }) {
  const pose = solvePose({ character, instance, tSec, compositionHeight, compositionWidth });
  const hand = pose.limbs[side]?.hand ?? pose.limbs.right.hand;
  return { x: hand.x / compositionWidth, y: hand.y / compositionHeight, px: hand.x, py: hand.y };
}

function renderFace({ cx, headCy, headR, facing, state, palette, look, outline }) {
  const eyeY = headCy - headR * 0.12;
  const eyeDx = headR * 0.36;
  const eyeR = headR * (state.mouthOpen > 0.85 ? 0.17 : 0.13);
  const pupilR = eyeR * 0.55;
  const look_ = facing * headR * 0.06;
  const out = [];

  // Eye whites with a pupil that follows the facing direction. Big eyes are the single biggest
  // readability win at 720p, which is why they are not a shape afterthought.
  for (const dir of [-1, 1]) {
    const ex = cx + dir * eyeDx;
    if (state.blink) {
      out.push(`<rect x="${(ex - eyeR).toFixed(2)}" y="${(eyeY - 1.5).toFixed(2)}" width="${(eyeR * 2).toFixed(2)}" height="3" rx="1.5" fill="${outline}"/>`);
    } else {
      out.push(
        `<circle cx="${ex.toFixed(2)}" cy="${eyeY.toFixed(2)}" r="${eyeR.toFixed(2)}" fill="#ffffff" stroke="${outline}" stroke-width="${Math.max(1.5, headR * 0.055).toFixed(2)}"/>` +
        `<circle cx="${(ex + look_).toFixed(2)}" cy="${(eyeY + 1).toFixed(2)}" r="${pupilR.toFixed(2)}" fill="${outline}"/>`,
      );
    }
  }

  // Brows carry most of the emotion; a face without them reads as blank.
  const browLift = (state.mouthOpen - 0.4) * headR * 0.22;
  const browY = eyeY - headR * 0.42 - browLift;
  const browTilt = state.tears ? headR * 0.1 : state.mouthOpen > 0.8 ? headR * 0.06 : 0;
  out.push(
    `<line x1="${(cx - eyeDx - eyeR).toFixed(2)}" y1="${(browY - browTilt).toFixed(2)}" x2="${(cx - eyeDx + eyeR).toFixed(2)}" y2="${(browY + browTilt).toFixed(2)}" stroke="${outline}" stroke-width="${(headR * 0.09).toFixed(2)}" stroke-linecap="round"/>` +
    `<line x1="${(cx + eyeDx - eyeR).toFixed(2)}" y1="${(browY + browTilt).toFixed(2)}" x2="${(cx + eyeDx + eyeR).toFixed(2)}" y2="${(browY - browTilt).toFixed(2)}" stroke="${outline}" stroke-width="${(headR * 0.09).toFixed(2)}" stroke-linecap="round"/>`,
  );

  // cheeks
  out.push(`<circle cx="${(cx - headR * 0.62).toFixed(2)}" cy="${(headCy + headR * 0.3).toFixed(2)}" r="${(headR * 0.13).toFixed(2)}" fill="${look?.blush ?? palette.secondary}" opacity="0.45"/>`);
  out.push(`<circle cx="${(cx + headR * 0.62).toFixed(2)}" cy="${(headCy + headR * 0.3).toFixed(2)}" r="${(headR * 0.13).toFixed(2)}" fill="${look?.blush ?? palette.secondary}" opacity="0.45"/>`);

  // mouth: an open ellipse when talking or laughing, a smile line when calm
  const mouthY = headCy + headR * 0.46;
  if (state.mouthOpen > 0.1) {
    const mouthH = headR * 0.08 + state.mouthOpen * headR * 0.3;
    const mouthW = headR * 0.34;
    out.push(
      `<ellipse cx="${cx.toFixed(2)}" cy="${mouthY.toFixed(2)}" rx="${mouthW.toFixed(2)}" ry="${(mouthH / 2 + 2).toFixed(2)}" fill="#5b2c2c" stroke="${outline}" stroke-width="${Math.max(1, headR * 0.045).toFixed(2)}"/>`,
    );
  } else {
    out.push(
      `<path d="M${(cx - headR * 0.26).toFixed(2)} ${(mouthY - headR * 0.04).toFixed(2)} q${(headR * 0.26).toFixed(2)} ${(headR * 0.28).toFixed(2)} ${(headR * 0.52).toFixed(2)} 0" fill="none" stroke="${outline}" stroke-width="${(headR * 0.1).toFixed(2)}" stroke-linecap="round"/>`,
    );
  }

  if (state.tears) {
    out.push(`<ellipse cx="${(cx - headR * 0.38).toFixed(2)}" cy="${(eyeY + headR * 0.32).toFixed(2)}" rx="${(headR * 0.07).toFixed(2)}" ry="${(headR * 0.11).toFixed(2)}" fill="#8fd3ff"/>`);
    out.push(`<ellipse cx="${(cx + headR * 0.38).toFixed(2)}" cy="${(eyeY + headR * 0.42).toFixed(2)}" rx="${(headR * 0.06).toFixed(2)}" ry="${(headR * 0.1).toFixed(2)}" fill="#8fd3ff"/>`);
  }
  return out.join('');
}

/** Procedural props so scenes read correctly before final art exists. */
export function renderProp({ propId, x, y, scale, compositionHeight, compositionWidth }) {
  const g = y * compositionHeight;
  const px = x * compositionWidth;
  const s = scale;
  const outline = '#243b2f';
  const sw = 3;
  const kind = propId.split('-')[0];

  switch (kind) {
    case 'tree':
      return (
        `<rect x="${px - 9 * s}" y="${g - 70 * s}" width="${18 * s}" height="${70 * s}" fill="#8a5a3b" stroke="${outline}" stroke-width="${sw}"/>` +
        `<circle cx="${px}" cy="${g - 100 * s}" r="${52 * s}" fill="#4f9d52" stroke="${outline}" stroke-width="${sw}"/>` +
        `<circle cx="${px - 34 * s}" cy="${g - 82 * s}" r="${30 * s}" fill="#2f6b39" stroke="${outline}" stroke-width="${sw}"/>` +
        `<circle cx="${px + 34 * s}" cy="${g - 84 * s}" r="${28 * s}" fill="#2f6b39" stroke="${outline}" stroke-width="${sw}"/>`
      );
    case 'rock':
      return `<path d="M${px - 30 * s} ${g} q6 -26 ${30 * s} -28 q24 2 ${30 * s} 28 z" fill="#b9c0c8" stroke="${outline}" stroke-width="${sw}"/>`;
    case 'house':
      return (
        `<rect x="${px - 60 * s}" y="${g - 80 * s}" width="${120 * s}" height="${80 * s}" fill="#f2d6a2" stroke="${outline}" stroke-width="${sw}"/>` +
        `<path d="M${px - 74 * s} ${g - 80 * s} L${px} ${g - 136 * s} L${px + 74 * s} ${g - 80 * s} z" fill="#c0553f" stroke="${outline}" stroke-width="${sw}"/>`
      );
    case 'flower':
      return [-26, -6, 14, 32]
        .map((dx) => `<line x1="${px + dx * s}" y1="${g}" x2="${px + dx * s}" y2="${g - 18 * s}" stroke="#2f6b39" stroke-width="${2 * s}"/><circle cx="${px + dx * s}" cy="${g - 20 * s}" r="${5 * s}" fill="#f2c94c" stroke="${outline}" stroke-width="1.5"/>`)
        .join('');
    case 'bench':
      return (
        `<rect x="${px - 40 * s}" y="${g - 26 * s}" width="${80 * s}" height="${9 * s}" rx="3" fill="#8a5a3b" stroke="${outline}" stroke-width="2"/>` +
        `<rect x="${px - 40 * s}" y="${g - 46 * s}" width="${80 * s}" height="${9 * s}" rx="3" fill="#8a5a3b" stroke="${outline}" stroke-width="2"/>` +
        `<rect x="${px - 34 * s}" y="${g - 26 * s}" width="${6 * s}" height="${26 * s}" fill="#6b4526"/>` +
        `<rect x="${px + 28 * s}" y="${g - 26 * s}" width="${6 * s}" height="${26 * s}" fill="#6b4526"/>`
      );
    case 'toy':
      return `<circle cx="${px}" cy="${g - 14 * s}" r="${16 * s}" fill="#f2994a" stroke="${outline}" stroke-width="${sw}"/>`;
    default:
      return '';
  }
}
