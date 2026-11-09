// Where every prop is at a given moment, and in what order the frame is painted.
//
// Both renderers — SVG and Remotion — used to place props themselves, and they drifted: the SVG
// backend grew carried props and thrown arcs, while Remotion still drew every prop at its staged
// ground position and painted all props behind all characters. That is not a style difference,
// it is two different films. Placement now lives here so a frame is the same picture whichever
// backend draws it, and so a bug is fixed once.

import { propInteractionAt, interactionProgress, sampleFlight, sampleMotion, sampleMotionWithDepth, PROP_DEPTH } from './motion.mjs';
import { handPosition } from './rigs.mjs';

/**
 * Hand position for a character in a scene, or null if they are not in it.
 * @param {'left'|'right'} [side]
 */
export function handFor({ scene, characters, characterId, tSec, side = 'right', height, width }) {
  const instance = (scene.characters ?? []).find((c) => c.characterId === characterId);
  const character = characters.get(characterId);
  if (!instance || !character) return null;
  // Dialogue is passed through so the hand is solved from the same pose the frame draws: the
  // mouth opens the face, but a speaking pose can also move an arm, and a prop must follow it.
  return handPosition({
    character, instance, tSec, compositionHeight: height, compositionWidth: width, side,
    dialogue: scene.dialogue ?? null,
  });
}

/**
 * A flight's real endpoints.
 *
 * The director writes coordinates too, but those are a guess: it does not run the rig, so it
 * cannot know where a hand ends up once the pose rotates the arm. When both ends name a
 * character we use the actual hands, which makes "the ball leaves Bobby's hand and arrives in
 * Pip's" true by construction instead of approximately true. The stored coordinates remain the
 * fallback for a throw with no catcher and for renderers that do not run the rig.
 */
export function resolveFlight(flight, { scene, characters, height, width }) {
  const base = { scene, characters, height, width };
  const from = flight.fromCharacterId
    ? handFor({ ...base, characterId: flight.fromCharacterId, tSec: flight.startSec, side: flight.releaseSide ?? 'right' })
    : null;

  let to = null;
  if (flight.toCharacterId) {
    const right = handFor({ ...base, characterId: flight.toCharacterId, tSec: flight.endSec, side: 'right' });
    const left = handFor({ ...base, characterId: flight.toCharacterId, tSec: flight.endSec, side: 'left' });
    const fromX = from?.x ?? flight.fromX;
    // Catch with whichever hand is nearer the thrower; a catch across the body reads as a swat.
    to = right && left
      ? (Math.abs(right.x - fromX) <= Math.abs(left.x - fromX) ? right : left)
      : (right ?? left);
  }

  return {
    ...flight,
    fromX: from?.x ?? flight.fromX,
    fromY: from?.y ?? flight.fromY,
    toX: to?.x ?? flight.toX,
    toY: to?.y ?? flight.toY,
  };
}

/**
 * Every prop's position, depth and rotation at time `t`.
 *
 * @returns {Array<object>} props carrying `x`, `y`, `z`, `rot`, plus `airborne` / `attachedTo`.
 */
export function stageProps({ scene, characters, tSec: t, height, width }) {
  const characterById = new Map((scene.characters ?? []).map((c) => [c.characterId, c]));
  const ctx = { scene, characters, height, width };

  return (scene.props ?? []).map((p) => {
    // A prop can arrive mid-beat: something the story just found is not standing there while the
    // characters are still searching for it. Dropping it from the list is enough — the renderers
    // paint what they are given, so an unrevealed prop costs nothing per frame.
    if (p.appearsAt != null && t < p.appearsAt) return null;

    // A thrown prop is on its own arc: physics beats attachment.
    const raw = (scene.flights ?? []).find((f) => f.propId === p.propId && t >= f.startSec && t <= f.endSec);
    if (raw) {
      const flight = resolveFlight(raw, ctx);
      const pos = sampleFlight(flight, t);
      const thrower = characterById.get(flight.fromCharacterId ?? '');
      return {
        ...p,
        x: pos.x,
        y: pos.y,
        // A thrown prop flies at the depth of the hand that released it.
        z: thrower ? sampleMotionWithDepth(thrower.motion, t, thrower.position).depth : PROP_DEPTH,
        rot: flight.spin ? pos.progress * 900 : 0,
        airborne: true,
        // Belongs to the thrower's layer so it paints with them, not under the scenery.
        bornWith: thrower ? thrower.characterId : null,
      };
    }

    const interaction = propInteractionAt(scene.interactions, p.propId, t);
    const holder = interaction ? characterById.get(interaction.characterId) : null;
    if (interaction && holder) {
      const motion = sampleMotion(holder.motion, t, holder.position);
      const holderCharacter = characters.get(interaction.characterId);
      const progress = interactionProgress(interaction, t);
      // Small lift at pickup/release so the object does not snap between marks.
      const blend = Math.sin(Math.PI * Math.min(1, progress * 2)) * 0.12;
      // The hand, computed by the rig's own transform — not a fixed offset from the body.
      const hand = holderCharacter
        ? handPosition({
          character: holderCharacter,
          instance: holder,
          tSec: t,
          compositionHeight: height,
          compositionWidth: width,
          side: interaction.side ?? 'right',
        })
        : null;
      const carryX = hand ? hand.x : motion.x + 0.06;
      const carryY = interaction.attach === 'head'
        ? motion.y - (205 * ((holderCharacter?.visual?.bodyProportions?.heightUnits ?? 4.2) / 4.2) * holder.scale) * 0.92 / height
        : (hand ? hand.y : motion.y - 0.1);
      return {
        ...p,
        x: carryX,
        y: carryY + blend / height,
        z: sampleMotionWithDepth(holder.motion, t, holder.position).depth,
        rot: 0,
        bornWith: interaction.characterId,
        attachedTo: interaction.characterId,
      };
    }

    return { ...p, z: PROP_DEPTH, rot: 0 };
  }).filter(Boolean);
}

/**
 * The frame's paint order: back to front by depth, ties broken by staging order.
 *
 * Draw order is decided by depth, not by kind. Painting every prop behind every character
 * buried a prop whenever it ended up in front of the scenery — a thrown ball that landed on the
 * tree at x = 0.82 simply vanished. Props held or in flight belong to a character's layer
 * (`bornWith`) and are handed back to the caller to draw with that character, so a tie with
 * scenery can never swallow them.
 *
 * @returns {{scenery: object[], layers: Array<{characterId:string, z:number, instance:object}>}}
 */
export function paintOrder({ scene, stagedProps, characters, tSec: t }) {
  const depthOf = (instance) => sampleMotionWithDepth(instance.motion, t, instance.position).depth;
  const scenery = stagedProps
    .filter((p) => !p.bornWith)
    .map((p, i) => ({ prop: p, order: i }))
    .sort((a, b) => b.prop.z - a.prop.z || a.order - b.order);

  const layers = [...(scene.characters ?? [])]
    .filter((c) => c.entranceAt == null || t >= c.entranceAt)
    .sort((a, b) => a.position.z - b.position.z)
    .map((instance, i) => ({
      characterId: instance.characterId,
      instance,
      depth: depthOf(instance),
      order: stagedProps.length + i,
      props: stagedProps.filter((p) => p.bornWith === instance.characterId),
      opacity: instance.entranceAt != null ? Math.min(1, (t - instance.entranceAt) / 0.4) : 1,
    }))
    .sort((a, b) => b.depth - a.depth || a.order - b.order);

  return { scenery, layers };
}
