// Blocking: decide WHERE everyone stands, which way they face, and how they get there.
//
// The scene renderer can only draw one pose per character per scene, so a beat sheet is
// deliberately staged as one beat per scene: the actor walks in, reaches the mark, and the
// scene settles into the beat's pose. That constraint is why walk paths matter — movement
// inside a scene is expressed as an entry walk plus a camera move, not a teleport.
import { INTENTS, EMOTION_POSE, intentFor } from './intents.mjs';

/**
 * Lanes are horizontal marks used to place actors without them overlapping.
 * z controls draw order (higher = nearer the camera).
 */
// y is the ground line the feet stand on. Keep it well above the subtitle band (which is
// drawn in the bottom ~7% of the frame) or the text covers the characters' shoes.
export const LANES = {
  far: { z: 1, y: 0.78, scale: 0.9 },
  mid: { z: 2, y: 0.82, scale: 1 },
  near: { z: 3, y: 0.86, scale: 1.08 },
};

const clamp01 = (v) => Math.max(0.02, Math.min(0.98, v));
const round = (v, p = 3) => Number(v.toFixed(p));

/**
 * Where should this actor stand for this intent?
 * Returns a mark (x, y, z, scale) plus the facing direction.
 */
export const SAFE_MIN = 0.1;
export const SAFE_MAX = 0.9;

// The director cannot read the rig, but it can agree with it. The rig draws a head of
// `0.16 * heightUnits/4.2 * headScale` of the body height, and the widest characters in this
// cast reach roughly a head's radius either side of their centre line. Blocking used to space
// actors by a flat 0.22, which was fine when heads were small — after the heads grew, characters
// stood *inside* each other and read as one blob on screen.
const FRAME_WIDTH_UNITS = 4.4; // roughly how many body heights fit across the frame
const HEAD_FRACTION = 0.16;

/** Minimum horizontal gap between two character centres, in frame fractions. */
export function separationFor(characterA, characterB) {
  const widest = (c) => {
    const p = c?.visual?.bodyProportions ?? {};
    const heightUnits = p.heightUnits ?? 4.2;
    const headScale = p.headScale ?? 1;
    // body height relative to the frame, plus the head radius on each side
    return (heightUnits / 4.2) * (0.24 + HEAD_FRACTION * headScale) / FRAME_WIDTH_UNITS;
  };
  // Scale the measured width into frame fractions first, then apply the floor. Scaling after the
  // floor (as an earlier version did) made every character return exactly the floor, so the rule
  // looked character-aware while being a constant.
  const measured = Math.max(widest(characterA), widest(characterB)) * 1.9;
  return Math.max(0.2, measured);
}

/**
 * Where should this actor stand for this intent?
 *
 * Two constraints fight here: the beat wants the actor near a prop or partner, and the frame
 * has safe margins. Secondary actors are distributed on BOTH sides of the actor with
 * alternating offsets, because stacking them in a line to the right used to push the last one
 * off the edge of the frame (clipping a character is a blocking bug, not a style choice).
 */
export function markFor({ intent, role, actorIndex, actorCount, targetX, propX, lane = 'mid', actorX = null, minGap = null }) {
  const base = LANES[lane] ?? LANES.mid;
  const leadX = 0.42;
  let x = leadX;

  switch (intent.stance) {
    case 'centre':
      x = 0.5;
      break;
    case 'lean-to-prop':
      x = propX != null ? propX - intent.offset : 0.38;
      break;
    case 'close-to-target':
    case 'toward-partner':
    case 'hold':
      x = targetX != null ? targetX - intent.offset : leadX;
      break;
    case 'walk-to':
      x = 0.56;
      break;
    default:
      x = role === 'lead' ? leadX : leadX + intent.offset * (actorIndex + 1);
  }

  // Secondary actors fan out around the lead, alternating sides, instead of queuing right.
  if (role !== 'lead' && intent.stance !== 'close-to-target' && actorX == null) {
    const step = 0.155;
    const ring = Math.ceil(actorIndex / 2);
    const side = actorIndex % 2 === 1 ? -1 : 1;
    x = leadX + side * step * ring;
  }

  // A reactor should not sit on top of whoever is acting, and two reactors on the same side
  // would overlap each other: alternate sides and widen the ring per index.
  if (actorX != null) {
    // A character-aware floor beats the intent's preferred offset when the cast is chunky.
    const gap = Math.max(intent.offset ?? 0.22, minGap ?? 0);
    const ring = Math.floor(actorIndex / 2);
    const side = actorIndex % 2 === 1 ? -1 : 1;
    // Keep reactors on the open side of the frame: if the actor is left of centre there is
    // more room to the right, and vice versa.
    // If the actor is pinned to a frame edge, everyone else must stack on the open side:
    // mirroring them would put them off-frame and collapse their marks onto the clamp.
    const pinnedLeft = actorX <= SAFE_MIN + 0.02;
    const pinnedRight = actorX >= SAFE_MAX - 0.02;
    const preferRight = actorX < 0.5;
    const dir = pinnedLeft
      ? 1
      : pinnedRight
        ? -1
        : actorIndex === 0
          ? (preferRight ? 1 : -1)
          : side * (preferRight ? 1 : -1);
    // When everyone is forced onto one side (actor pinned to an edge), the ring index must
    // still advance per actor, otherwise two reactors land on the identical clamped mark.
    const stacked = pinnedLeft || pinnedRight;
    const step = stacked ? actorIndex : ring;
    x = actorX + dir * (gap + step * 0.13);
  }

  // Reactors sit a touch further back than the actor so silhouettes separate.
  const laneShift = actorX != null ? -0.022 : 0;
  return {
    x: round(Math.max(SAFE_MIN, Math.min(SAFE_MAX, x))),
    y: round(base.y + laneShift),
    z: base.z,
    scale: round(base.scale * (role === 'lead' ? 1 : 0.97)),
  };
}

/**
 * Facing is relational: an actor looks at whoever they are interacting with.
 * 'front' is used when addressing the camera directly (no other actor in play).
 */
export function facingFor({ intent, markX, targetX, propX, travelDirection }) {
  if (intent.facing === 'toward-camera') return 'front';
  if (intent.facing === 'away') return 'back';
  if (intent.facing === 'travel-direction') return travelDirection === 'left' ? 'left' : 'right';

  const reference = intent.facing === 'toward-prop' && propX != null ? propX : targetX;
  if (reference == null) return 'right';
  return reference >= markX ? 'right' : 'left';
}

/**
 * Entry path: where the actor starts before walking to their mark.
 * A walk-in starts just off frame; anything else starts on the mark (no movement).
 */
/**
 * Convert an entry description into a motion track the renderer samples per frame.
 * This is what turns "walk in" from a pose into actual travel across the frame.
 * @returns {{path:Array<{t:number,x:number,y:number}>, ease:string, durationSec:number}|null}
 */
export function motionTrackFor({ entry, durationSec }) {
  if (!entry || entry.kind === 'still') return null;
  const walkSec = Math.min(entry.durationSec, Math.max(0.8, durationSec * 0.45));
  // Both directions are the same two keys: an entry starts off-frame and ends on the mark, a
  // departure starts on the mark and keeps going off-frame.
  const path = [
    { t: 0, x: num(entry.from.x), y: num(entry.from.y) },
    { t: num(walkSec), x: num(entry.to.x), y: num(entry.to.y) },
  ];

  // The track must end where the WALK ends, not where the scene ends.
  //
  // It used to be pinned to the scene end: `[{t:0, x:0.32}, {t:1.2, x:0.56}, {t:7.4, x:0.56}]`.
  // The pose layer decides "is this character travelling?" by asking whether the motion sampler
  // sees x change, so that long identical tail made it read as travelling for the remaining six
  // seconds — and a travelling character plays a locomotion pose. Bobby kept a walk cycle for the
  // whole beat after arriving at his mark, while his feet covered no ground.
  //
  // Holding the position needs no key: `sampleMotion` holds the last keyframe forever, so the
  // figure is already pinned at the mark from walkSec to the scene end. The extra key bought
  // nothing and cost the walk.
  return { path, ease: 'ease-in-out', durationSec: num(walkSec) };
}

const num = (v) => Number(v.toFixed(4));

export function entryFor({ intent, mark, role, castIndex }) {
  if (intent.walkIn) {
    const fromLeft = castIndex % 2 === 0;
    return {
      kind: 'walk-in',
      from: { x: round(fromLeft ? -0.12 : 1.12), y: mark.y, z: mark.z },
      to: mark,
      durationSec: 1.4,
      travelDirection: fromLeft ? 'right' : 'left',
    };
  }
  if (intent.walkOut) {
    return {
      kind: 'walk-out',
      from: mark,
      to: { x: round(mark.x > 0.5 ? 1.12 : -0.12), y: mark.y, z: mark.z },
      durationSec: 1.4,
      travelDirection: mark.x > 0.5 ? 'right' : 'left',
    };
  }
  if (intent.stance === 'walk-to') {
    // Explore/celebrate beats should cover visible ground, not shuffle: start a quarter of
    // the frame back and walk in over 1.2s so the travel reads on screen.
    return {
      kind: 'walk-to',
      from: { x: round(Math.max(SAFE_MIN, mark.x - 0.24)), y: mark.y, z: mark.z },
      to: mark,
      durationSec: 1.2,
      travelDirection: 'right',
    };
  }
  return { kind: 'still', from: mark, to: mark, durationSec: 0, travelDirection: null };
}

/**
 * Build the full blocking for one beat: a mark per participating actor.
 * @param {object} beat       script beat
 * @param {object} cast       Map characterId → { role, entrance }
 * @param {object} world      world definition (prop catalog, location)
 * @param {Array}  propPlacements  resolved prop positions for this beat's location
 */
export function blockBeat({ beat, cast, propPlacements, leadId, characters }) {
  const intent = intentFor(beat.action);
  const actorId = beat.actor ?? leadId;
  const others = [...cast.keys()].filter((id) => id !== actorId);
  const partnerId = beat.target ?? others[0] ?? null;

  // Resolve the prop this beat is about, if any.
  const propPlacement = beat.prop ? propPlacements.find((p) => p.propId === beat.prop) ?? null : null;
  const propX = propPlacement?.x ?? null;

  const partnerMark = partnerId
    ? markFor({
        intent: { ...intent, stance: 'hold' },
        role: cast.get(partnerId)?.role ?? 'companion',
        actorIndex: cast.role(partnerId).index,
        actorCount: cast.size,
        targetX: null,
        propX,
        minGap: characters ? separationFor(characters.get(actorId), characters.get(partnerId)) : null,
      })
    : null;

  let actorMark = markFor({
    intent,
    role: cast.get(actorId)?.role ?? 'lead',
    actorIndex: cast.role(actorId).index,
    actorCount: cast.size,
    targetX: partnerMark?.x ?? null,
    propX,
  });

  // An arriving character must not walk *through* the person they came to talk to. Walk-in
  // always enters from the frame edge, so if the partner stands between that edge and the mark,
  // the actor would slide across them — which read on screen as two bodies overlapping into one
  // blob. Flip the mark to the open side of the partner instead.
  const fromLeft = cast.role(actorId).index % 2 === 0;
  if (intent.walkIn && partnerMark) {
    const approachesFromLeft = fromLeft;
    const partnerBlocks = approachesFromLeft
      ? partnerMark.x < actorMark.x
      : partnerMark.x > actorMark.x;
    if (partnerBlocks) {
      const gap = characters ? separationFor(characters.get(actorId), characters.get(partnerId)) : 0.22;
      const flipped = partnerMark.x + (approachesFromLeft ? -1 : 1) * gap;
      actorMark = { ...actorMark, x: round(Math.max(SAFE_MIN, Math.min(SAFE_MAX, flipped))) };
    }
  }

  const facing = facingFor({
    intent,
    markX: actorMark.x,
    targetX: partnerMark?.x ?? null,
    propX,
    travelDirection: intent.facing === 'travel-direction' ? 'right' : null,
  });

  const entry = entryFor({
    intent,
    mark: actorMark,
    role: cast.get(actorId)?.role ?? 'lead',
    castIndex: cast.role(actorId).index,
  });

  // Everyone else holds their mark, facing whoever is acting.
  const positions = new Map();
  positions.set(actorId, {
    characterId: actorId,
    ...actorMark,
    facing,
    role: cast.get(actorId)?.role ?? 'lead',
    isActor: true,
    entry,
  });

  for (const id of others) {
    const role = cast.get(id)?.role ?? 'companion';
    const idx = cast.role(id).index;
    const hold = markFor({
      intent: { ...INTENTS.react, stance: 'hold' },
      role,
      actorIndex: idx,
      actorCount: cast.size,
      targetX: actorMark.x,
      propX,
      actorX: actorMark.x,
    });
    positions.set(id, {
      characterId: id,
      ...hold,
      facing: hold.x >= actorMark.x ? 'left' : 'right',
      role,
      isActor: false,
      entry: cast.get(id)?.entrance === 'walk-in'
        ? entryFor({ intent: { ...INTENTS.entrance }, mark: hold, role, castIndex: idx })
        : entryFor({ intent: INTENTS.idle, mark: hold, role, castIndex: idx }),
    });
  }

  return { intent, actorId, partnerId, positions, propPlacement, facing };
}

/**
 * Pose per character for this beat. The actor performs the beat's pose; everyone else
 * reacts using their emotion pose, which keeps idle characters from looking frozen.
 */
export function posesFor({ beat, block, cast }) {
  const emotion = EMOTION_POSE[beat.emotion ?? 'neutral'] ?? EMOTION_POSE.neutral;
  // A locomotion pose is not a resting body.
  //
  // `explore` and `depart` name 'walk' as their rest pose, because that is what the actor is
  // doing for most of the beat. But the pose track cannot blend to a locomotion pose once travel
  // stops, and the renderer correctly refuses to march on the spot — so the fallback for both was
  // 'idle', and the actor stood perfectly still for five seconds after arriving. The rest pose
  // has to be something a standing child can do.
  const LOCOMOTION = new Set(['walk', 'run']);
  const restFor = (id) => (LOCOMOTION.has(id) || !id ? 'idle' : id);
  const poses = new Map();
  for (const [id, pos] of block.positions) {
    if (id === block.actorId) {
      poses.set(id, {
        animation: block.intent.pose,
        expression: beat.emotion ?? 'neutral',
        // Action poses are the performance; emotion drives the face.
        restAnimation: restFor(block.intent.restPose ?? emotion.pose),
      });
    } else {
      poses.set(id, {
        animation: emotion.pose,
        expression: emotion.expression,
        restAnimation: 'idle',
      });
    }
  }
  return poses;
}

/**
 * Map a cast list to indexable roles so secondary actors keep stable screen positions
 * across beats instead of swapping sides whenever the cast object is rebuilt.
 */
export function castIndex(castList, leadId) {
  const ordered = [
    ...castList.filter((c) => c.characterId === leadId),
    ...castList.filter((c) => c.characterId !== leadId),
  ];
  const index = new Map(ordered.map((c, i) => [c.characterId, i]));
  const roles = new Map(ordered.map((c) => [c.characterId, c.role ?? 'companion']));
  const lead = leadId ?? ordered[0]?.characterId ?? null;
  return {
    ids: ordered.map((c) => c.characterId),
    size: ordered.length,
    role: (id) => ({ index: index.get(id) ?? 0, role: roles.get(id) }),
    get: (id) => (index.has(id) ? { role: roles.get(id), index: index.get(id) } : undefined),
    has: (id) => index.has(id),
    keys: () => index.keys(),
    entries: () => [...index.entries()],
    lead,
  };
}
