// Where everything stands in the palace compound (metres, ground at y = 0, the gate to the south at -z, the pendopo to
// the north at +z). Shared by palace.ts (geometry), cast.ts (who stands where) and story.ts (cameras), so the three
// never disagree about a wall or a table.
export type V3 = [number, number, number];

/** the pendopo (open audience hall): stone platform, 4 x 3 pillars, joglo roof, the meeting wall at its back */
export const HALL = { x0: -7.5, x1: 7.5, z0: 13, z1: 26, top: 0.6, eave: 4.2, wallZ: 25.6, wallZ1: 26.0 } as const;
export const PILLARS_X = [-6.2, -2.1, 2.1, 6.2];
export const PILLARS_Z = [14, 18, 22];
export const THRONE: V3 = [0, HALL.top, 24.4];
/** the loose brick in the meeting wall (centre; the hole is 0.36 m wide, 0.2 m tall) */
export const HOLE: V3 = [2.2, 1.5, 25.8];
export const HOLE_W = 0.5, HOLE_H = 0.3;
/** Raja Surya's portrait on the inside of the meeting wall */
export const PORTRAIT: V3 = [-3.6, 2.7, 25.56];
/** the courtiers' bench along the east side of the hall (they sit facing the middle) */
export const BENCH_X = 5.2, BENCH_Z = [16.2, 18.0, 19.8];
/** the alley between the meeting wall and the compound's back wall */
export const ALLEY = { z0: 26.0, z1: 29.6 } as const;

/** compound wall and the split gate (candi bentar) */
export const WALL = { x: 45, zS: -40, zN: 30 } as const;
export const GATE_W = 3.2;

export const TOMB: V3 = [-30, 0, -22];
export const EASEL: V3 = [-28.3, 0, -23.2];
export const KITCHEN: V3 = [-24, 0, 6];
export const HEARTH: V3 = [-24, 0, 8.2];
/** the barracks long house (front faces -x, toward the plaza), its empty weapon racks, the generals' table */
export const BARRACKS: V3 = [27, 0, 8];
export const RACK_X = 21.6, RACK_Z = [3, 6, 9, 12];
export const TABLE: V3 = [17.5, 0, -2];
/** the courier's desk under the barracks eaves, and the patih's desk on the west side */
export const COURIER_DESK: V3 = [22.4, 0, 15.5];
export const PATIH_DESK: V3 = [-20.5, 0, 22];
/** the far fortress up the north road (the riders head for it; "north" on the map, out through the south gate) */
export const FORT: V3 = [0, 0, -330];
export const DESK_H = 0.78, TABLE_H = 0.8;
