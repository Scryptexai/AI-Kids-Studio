// Where everything stands in "Stopped by Thin Air" (metres, ground at y = 0). Every location is its own set, far apart
// along +x so no set shows in another's shot. Tracks run along +x; the lens mostly stands on the +z side looking -z,
// so world +x is screen RIGHT and the trains run left to right. Shared by rail.ts (geometry), cast.ts and story.ts.
export type V3 = [number, number, number];

/** set origins */
export const O = {
  line: [0, 0, 0] as V3,       // the open line through snowy fields: the night freight (hook), the 1872 day train
  pitt: [1000, 0, 0] as V3,    // Pittsburgh: the station, the tunnel through the hill, the road crossing past it
  shop: [2000, 0, 0] as V3,    // George's workshop (a window onto a track behind it)
  office: [2400, 0, 0] as V3,  // Vanderbilt's office in New York
} as const;
export type SetName = keyof typeof O;
export const at = (s: SetName, x: number, y: number, z: number): V3 => [O[s][0] + x, O[s][1] + y, O[s][2] + z];

// ---- track ----
/** top of the ballast (sleepers sit on it), rail top; the gauge is drawn a little wide for the cartoon cars */
export const BALLAST_Y = 0.28, RAIL_Y = 0.46, GAUGE = 1.6;

// ---- rolling stock (local frames: +x forward, origin on the track centre at rail top) ----
/** locomotive: the pilot tip at local x = LOCO.nose; tender behind; cab at x LOCO.cab */
export const LOCO = { nose: 4.6, len: 9.2, cab: -2.6, tender: 5.0, drv: 0.82, lead: 0.42 } as const;
export const BOX = { len: 8.6, w: 2.7, h: 2.5, floor: 1.15, wheel: 0.42 } as const;   // 1860s wooden boxcar
export const COACH = { len: 11.0, w: 2.8, h: 2.35, floor: 1.15, wheel: 0.42 } as const; // passenger coach
export const GAP = 1.1; // coupler gap between cars
export type CarKind = "loco" | "tender" | "box" | "coach" | "coachOpen";
/** a car's front / back from its own origin (same numbers rolling.ts builds with) */
export const SPAN: Record<CarKind, [number, number]> = { loco: [LOCO.nose, LOCO.nose - LOCO.len], tender: [LOCO.tender / 2, -LOCO.tender / 2],
  box: [BOX.len / 2, -BOX.len / 2], coach: [COACH.len / 2, -COACH.len / 2], coachOpen: [COACH.len / 2, -COACH.len / 2] };
/** each car's origin along a train whose nose is at 0 (cars run back along -x, GAP apart) */
export const offsetsOf = (kinds: CarKind[]) => { let x = 0; return kinds.map((k) => { const o = x - SPAN[k][0]; x = o + SPAN[k][1] - GAP; return o; }); };
export const FREIGHT: CarKind[] = ["loco", "tender", "box", "box", "box", "box", "box"];
export const TEST: CarKind[] = ["loco", "tender", "coachOpen", "coach", "coach", "coach"];
export const SHOPTRAIN: CarKind[] = ["loco", "tender", "box", "box", "box", "box"];

// ---- the line ----
export const LINE_Z = 0;

// ---- Pittsburgh (local) ----
/** the platform on the lens side (+z), the hill's two portals, the dirt road crossing */
export const PLAT = { x0: -78, x1: -8, z0: 2.3, z1: 8.5, y: 0.95 } as const;
export const PORTAL_W = 20, PORTAL_E = 70, TUN_W = 7.0, TUN_H = 7.2, HILL_H = 15;
export const CROSS_X = 150;
/** where the parked test train's nose stands at the platform */
export const PARK_NOSE = -10;
/** the train stops with its pilot tip FOUR FEET (1.22 m) short of the wagon's near wheel line */
export const WAGON = { x: CROSS_X, z: -1.7, halfX: 0.95, len: 3.4 } as const;
export const STOP_NOSE = WAGON.x - WAGON.halfX - 1.22;

// ---- the workshop ----
export const SHOP = { hw: 4.2, z0: -5.0, z1: 2.4, h: 3.6 } as const; // the lens looks -z: the back wall is at z0
export const BENCH = at("shop", 0.6, 0.92, SHOP.z0 + 0.55); // bench top centre, under the window
export const SHOP_WIN = { x0: -1.6, x1: 2.8, y0: 1.25, y1: 2.85 } as const;
export const SHOP_TRACK_Z = SHOP.z0 - 19;

// ---- the office ----
export const OFFICE = { hw: 4.0, z0: -4.2, z1: 3.2, h: 4.2 } as const; // the lens looks -z
export const ODESK = at("office", 0, 0, -1.6); // desk centre (Vanderbilt behind it at -z)
export const DESK_H = 0.8;
