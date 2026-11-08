// Placeholder character rig drawn as flat vector parts.
//
// This is deliberately a *rig*, not a sprite: head, body, limbs and face are separate
// shapes transformed every frame by the animation state. When final character art exists,
// each part gets replaced by an image layer and the transform code keeps working — the
// scene JSON contract does not change.
//
// Every shape is derived from the character's palette in library/characters/*.character.json,
// so characters stay visually distinguishable without any artwork.

const TAU = Math.PI * 2;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Deterministic pseudo-random in [0,1) so a frame renders identically on every machine. */
function noise(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Animation state for a character at a given local time.
 * @returns {{bobY:number, squash:number, tilt:number, armSwing:number, legSwing:number,
 *            mouthOpen:number, blink:boolean, hopY:number, tears:boolean}}
 */
export function animationState(animationId, tSec, characterId) {
  const seed = [...characterId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const phase = TAU * (tSec * 1.1 + noise(seed) * 0.5);
  const state = {
    bobY: 0,
    squash: 0,
    tilt: 0,
    armSwing: 0,
    legSwing: 0,
    mouthOpen: 0,
    blink: false,
    hopY: 0,
    tears: false,
    armRaise: 0,
    raiseSide: 1,
  };

  switch (animationId) {
    case 'idle':
      state.bobY = Math.sin(phase) * 1.2;
      state.armSwing = Math.sin(phase * 0.5) * 0.05;
      break;
    case 'walk':
      state.bobY = Math.abs(Math.sin(phase * 1.6)) * -3;
      state.legSwing = Math.sin(phase * 1.6) * 0.55;
      state.armSwing = -Math.sin(phase * 1.6) * 0.4;
      break;
    case 'run':
      state.bobY = Math.abs(Math.sin(phase * 2.2)) * -6;
      state.legSwing = Math.sin(phase * 2.2) * 0.9;
      state.armSwing = -Math.sin(phase * 2.2) * 0.8;
      state.tilt = Math.sin(phase * 2.2) * 0.06;
      break;
    case 'jump': {
      const cycle = (tSec * 1.4) % 1;
      state.hopY = -Math.sin(cycle * Math.PI) * 26;
      state.squash = cycle < 0.12 ? 0.12 : cycle > 0.88 ? 0.1 : -0.06;
      state.armRaise = 0.55;
      break;
    }
    case 'talk':
      state.mouthOpen = 0.35 + 0.65 * Math.abs(Math.sin(phase * 4.2));
      state.bobY = Math.sin(phase * 1.2) * 1.5;
      state.armSwing = Math.sin(phase * 1.1) * 0.12;
      break;
    case 'wave':
      state.armRaise = 0.9 + Math.sin(phase * 3.2) * 0.18;
      state.raiseSide = 1;
      state.mouthOpen = 0.4;
      state.bobY = Math.sin(phase * 0.9) * 1.5;
      break;
    case 'laugh':
      state.mouthOpen = 1;
      state.tilt = Math.sin(phase * 4) * 0.1;
      state.bobY = Math.abs(Math.sin(phase * 4)) * -3;
      state.armRaise = 0.3;
      break;
    case 'cry':
      state.tears = true;
      state.mouthOpen = 0.25;
      state.bobY = Math.sin(phase * 1.6) * 2;
      state.tilt = Math.sin(phase * 0.8) * 0.05;
      break;
    case 'surprise':
      state.squash = -0.1;
      state.mouthOpen = 0.9;
      state.hopY = -8;
      state.armRaise = 0.75;
      break;
    default:
      state.bobY = Math.sin(phase) * 1;
  }

  state.blink = noise(Math.floor(tSec * 2.7) + seed) > 0.93;
  return state;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render one character instance into SVG markup.
 * Coordinates are in composition pixels; the caller has already applied camera transform.
 */
export function renderCharacter({ character, instance, tSec, compositionHeight, compositionWidth }) {
  const st = animationState(instance.animation, tSec, character.id);
  const palette = character.visual.palette;
  const groundY = instance.position.y * compositionHeight;
  const baseHeight = 205 * (character.visual.bodyProportions.heightUnits / 4.2);
  const h = baseHeight * instance.scale;
  const headR = h * 0.16 * character.visual.bodyProportions.headScale;
  const bodyW = h * 0.24;
  const bodyH = h * 0.34;
  const facing = instance.facing === 'left' ? -1 : 1;

  const cx = instance.position.x * compositionWidth;
  const footY = groundY + st.hopY;
  const squash = 1 + st.squash;

  // Layout from the ground up so feet always land exactly on the walk surface.
  const legLen = h * 0.26;
  const bodyTop = footY - legLen - bodyH;
  const headCy = bodyTop - headR * 0.9;
  const legSwing = st.legSwing * legLen * 0.5;

  const outline = '#243b2f';
  const stroke = `stroke="${outline}" stroke-width="${Math.max(2, h * 0.012)}" stroke-linejoin="round"`;

  const parts = [];

  // shadow
  parts.push(
    `<ellipse cx="${cx}" cy="${groundY + 2}" rx="${bodyW * 1.15}" ry="${bodyW * 0.24}" fill="#000" opacity="0.16"/>`,
  );

  // legs + shoes, pivoting at the hip so walk cycles read clearly
  for (const dir of [-1, 1]) {
    const swing = dir === 1 ? legSwing : -legSwing;
    const hipX = cx + dir * bodyW * 0.26;
    const hipY = bodyTop + bodyH * 0.9;
    const rot = (swing / legLen) * 42;
    parts.push(
      `<g transform="rotate(${rot} ${hipX} ${hipY})">` +
        `<rect x="${hipX - bodyW * 0.11}" y="${hipY}" width="${bodyW * 0.22}" height="${legLen}" rx="${bodyW * 0.1}" fill="${palette.secondary}" ${stroke}/>` +
        `<ellipse cx="${hipX}" cy="${hipY + legLen}" rx="${bodyW * 0.2}" ry="${bodyW * 0.11}" fill="#3a3a3a" ${stroke}/>` +
      `</g>`,
    );
  }

  // body
  parts.push(
    `<g transform="translate(0 ${footY}) scale(1 ${squash}) translate(0 ${-footY})"><rect x="${cx - bodyW / 2}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${bodyW * 0.34}" fill="${palette.primary}" ${stroke}/></g>`,
  );

  // arms: a hanging arm points +y, so a positive SVG rotation swings the RIGHT arm
  // outward and the LEFT arm inward — hence the per-side direction multiplier.
  for (const dir of [-1, 1]) {
    const swing = dir === 1 ? st.armSwing : -st.armSwing;
    const raise = st.raiseSide === 0 || st.raiseSide === dir ? st.armRaise : 0;
    // SVG's rotate() maps a downward vector (0,1) to (-sin, cos), so a positive angle
    // swings the right arm ACROSS the body. Negate: negative = outward for the right arm.
    const rotation = -(dir * 8 + swing * 26 + dir * raise * 115);
    const ax = cx + dir * bodyW * 0.5;
    const ay = bodyTop + bodyH * 0.16;
    const armLen = bodyH * 0.82;
    parts.push(
      `<g transform="rotate(${rotation.toFixed(2)} ${ax} ${ay})">` +
        `<rect x="${ax - bodyW * 0.09}" y="${ay}" width="${bodyW * 0.18}" height="${armLen}" rx="${bodyW * 0.09}" fill="${palette.primary}" ${stroke}/>` +
        `<circle cx="${ax}" cy="${ay + armLen}" r="${bodyW * 0.13}" fill="${palette.accent}" ${stroke}/>` +
      `</g>`,
    );
  }

  // head
  parts.push(
    `<g transform="rotate(${st.tilt * 40} ${cx} ${headCy + headR})">` +
      `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${palette.accent}" ${stroke}/>` +
      renderFace({ cx, headCy, headR, facing, state: st, palette }) +
      `</g>`,
  );

  return parts.join('');
}

function renderFace({ cx, headCy, headR, facing, state, palette }) {
  const eyeY = headCy - headR * 0.12;
  const eyeDx = headR * 0.36;
  const eyeR = headR * (state.mouthOpen > 0.85 ? 0.17 : 0.12);
  const pupilR = eyeR * 0.55;
  const look = facing * headR * 0.06;
  const out = [];

  for (const dir of [-1, 1]) {
    const ex = cx + dir * eyeDx;
    if (state.blink) {
      out.push(`<rect x="${ex - eyeR}" y="${eyeY - 1.5}" width="${eyeR * 2}" height="3" rx="1.5" fill="#243b2f"/>`);
    } else {
      out.push(`<circle cx="${ex}" cy="${eyeY}" r="${eyeR}" fill="#ffffff"/><circle cx="${ex + look}" cy="${eyeY + 1}" r="${pupilR}" fill="#243b2f"/>`);
    }
  }

  // cheeks
  out.push(`<circle cx="${cx - headR * 0.62}" cy="${headCy + headR * 0.3}" r="${headR * 0.13}" fill="${palette.secondary}" opacity="0.55"/>`);
  out.push(`<circle cx="${cx + headR * 0.62}" cy="${headCy + headR * 0.3}" r="${headR * 0.13}" fill="${palette.secondary}" opacity="0.55"/>`);

  // mouth: height follows the talk/laugh/surprise animation state
  const mouthH = headR * 0.08 + state.mouthOpen * headR * 0.3;
  const mouthW = headR * 0.34;
  const mouthY = headCy + headR * 0.46;
  out.push(`<ellipse cx="${cx}" cy="${mouthY}" rx="${mouthW}" ry="${mouthH / 2 + 2}" fill="#5b2c2c"/>`);

  if (state.tears) {
    out.push(`<ellipse cx="${cx - headR * 0.38}" cy="${eyeY + headR * 0.32}" rx="${headR * 0.07}" ry="${headR * 0.11}" fill="#8fd3ff"/>`);
    out.push(`<ellipse cx="${cx + headR * 0.38}" cy="${eyeY + headR * 0.42}" rx="${headR * 0.06}" ry="${headR * 0.1}" fill="#8fd3ff"/>`);
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

export { esc, clamp, lerp };
