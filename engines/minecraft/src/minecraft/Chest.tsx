// Wave B (mc-cobblegen) request: chests. A set's `chest` blocks compile with no elements (the game draws chests as a
// block entity), so this layer draws every chest cell of the set (facing north, toward the -z cameras) plus any
// direction `chests` entries (another facing, or a chest the set does not have, popping in). Geometry: geometry.ts
// chestElements (the entity atlas `entity/chest/normal`, staged with the shared fx textures).
import React, { useMemo } from "react";
import * as THREE from "three";
import { useMcFrame } from "./mcTime";
import { blockObject } from "./Actors";
import { popScale } from "./Build";
import { CHEST_ROT, CHEST_TEX, chestElements } from "./geometry";
import type { FxTex } from "./fxTextures";
import type { LoadedWorld } from "./VoxelWorld";
import type { CBlock, ChestSpec } from "./types";

const K = (x: number, y: number, z: number) => `${x},${y},${z}`;
const proto = new Map<string, THREE.Group>();
const chestObj = (facing: ChestSpec["facing"], fx: FxTex) => {
  const f = facing ?? "north";
  let g = proto.get(f);
  if (!g) {
    const b: CBlock = { key: `wb:chest:${f}`, id: "chest", shape: "model", layer: "cutout", tint: null, rotX: 0, rotY: CHEST_ROT[f], light: 0, positions: [], elements: chestElements() };
    g = blockObject(b, fx.tex);
    proto.set(f, g);
  }
  return g.clone();
};

/** the chests to draw: the set's chest cells, then the spec entries (an entry on a set cell replaces it) */
export const chestList = (lw: LoadedWorld, specs: ChestSpec[] | undefined): ChestSpec[] => {
  const out = new Map<string, ChestSpec>();
  for (const b of lw.world.blocks) {
    if (b.id !== "chest") continue;
    for (let i = 0; i < b.positions.length; i += 3) { const at: [number, number, number] = [b.positions[i], b.positions[i + 1], b.positions[i + 2]]; out.set(K(...at), { at }); }
  }
  for (const s of specs ?? []) out.set(K(...s.at), s);
  return [...out.values()];
};

export const Chests: React.FC<{ lw: LoadedWorld; specs?: ChestSpec[]; fx: FxTex }> = ({ lw, specs, fx }) => {
  const frame = useMcFrame();
  const list = useMemo(() => chestList(lw, specs), [lw, specs]);
  const objs = useMemo(() => (fx.tex[CHEST_TEX] ? list.map((c) => chestObj(c.facing, fx)) : []), [list, fx]);
  if (!objs.length) return null;
  return (
    <>
      {list.map((c, i) => {
        const sc = c.pop === undefined ? 1 : popScale(frame - c.pop);
        if (sc <= 0) return null;
        return <group key={i} position={[c.at[0] + 0.5, c.at[1], c.at[2] + 0.5]} scale={sc}><primitive object={objs[i]} /></group>;
      })}
    </>
  );
};
