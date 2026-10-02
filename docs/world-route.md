# World route proposal

Issue #170, for owner visual approval before terrain work begins.

## Coordinate system and loop

World coordinates are metres. North and the spawn heading are `-Z`. Arc length `s` starts at the
spawn and increases clockwise. The centripetal Catmull-Rom loop in `routePoints.ts` is 13.90 km,
which takes about 5 minutes 9 seconds at the 45 m/s cruise speed.

| `s` km | x | z | floor m | width m | Purpose |
| ---: | ---: | ---: | ---: | ---: | --- |
| 0.00 | 1750 | 2000 | 40 | 560 | Home basin and spawn |
| 0.78 | 1938 | 1248 | 46 | 360 | Outbound cut |
| 1.79 | 2408 | 402 | 60 | 320 | Tower approach |
| 2.99 | 3442 | -162 | 78 | 380 | North shoulder |
| 4.23 | 4570 | 308 | 54 | 440 | High east bend |
| 5.38 | 5134 | 1248 | **36** | 520 | East river head |
| 6.64 | 4852 | 2470 | **34** | 480 | East river reach |
| 7.98 | 3818 | 3316 | 48 | 400 | South bend |
| 9.35 | 2502 | 3692 | 70 | 340 | South shoulder |
| 10.81 | 1092 | 3316 | 52 | 380 | West bend |
| 11.96 | 152 | 2658 | **34** | 460 | West river reach |
| 12.70 | 622 | 2094 | **35** | 500 | Return notch |

All valley widths stay within 300 to 600 m. Bold floors are the river stretches. They sit 2 to 4 m
above the current `waterLevel` of 32 m, with the river bed to be cut below the water plane in the
terrain ticket. Other floors rise to 78 m to pace the river with dry meadows and shoulders.

**As built (#174).** `applyRouteRiver` (`src/world/routeRiver.ts`) cuts the bed 4 m under the
water along the centreline wherever the designed floor is within 3 m of `waterLevel`, and tapers it
out above the water by 5.5 m. That gives two reaches: the east one from about s 5.3 to 7.0 km, ending
on dry floor short of the waterfall's station, and the west one from about s 11.8 km, past the
arch, into a lake on the return notch's route point.

## Home basin and the cuts

- **Basin** is centred at `(1750, 2000)`, with a 700 m clear radius and a 260 m target ridge crest.
  Its floor rises gently from 40 m at spawn to 55 m at the ridge foot. As built (#171) the crest
  sits at a 1150 m radius, varies about 12% round the ring, and fades back into the noise terrain
  by 1650 m. The ridge rises over 450 m at most 35° steep.
- **Spawn** is `(1750, 147, 2000)`, 120 m above the existing ground, heading `-0.245` radians toward
  the outbound cut. The route bends east after clearing the ridge.
- **Outbound cut** is centred at `(1938, 1248)`, directly along the spawn heading. It is 320 m
  wide at the floor, widening to 420 m at ridge height. The asymmetric x offset makes its far wall
  lead naturally into the tower bend without hiding the opening from spawn.
- **Return notch** is centred at `(622, 2094)`, 500 m wide at the floor. Its west-southwest approach
  keeps it visually separate from the outbound cut, then the last bend opens back onto spawn.
- **Title flyby room** is a 500 m radius, 120 to 220 m altitude loop inside the basin. A camera on
  its south and west arcs sees the basin bowl and the outbound cut together. The 700 m clear radius
  leaves 200 m between that loop and the ridge for camera offsets used by #157.

## Landmark stations and reveals

The landmarks stay at their deterministic current positions. A station is the route beat that
frames a landmark, not a pass through its footprint. The terrain proposal keeps intervening ridge
walls above the eye line until each listed reveal. From reveal to station the indicated bend turns
the route toward the landmark. At every station the landmark is inside the chase camera's 60°
horizontal view. Angles below are from route tangent to the landmark centre.

| Landmark | Current position x, z | Reveal `s`, position | Station `s`, position | Framing sightline |
| --- | --- | --- | --- | --- |
| Tower | 2924, -207 | 0.50 km, `(1883, 1531)` | 2.00 km, `(2583, 245)` | Outbound cut and tower approach turn right, placing the tower 566 m away and 14.0° right of centre. |
| Giant tree | 996, 5877 | 5.60 km, `(5146, 1519)` | 7.10 km, `(4528, 2842)` | East river bend rolls from south to southwest, placing the crown 4.66 km away and 0.7° from centre. |
| Waterfall | -3158, 2954 | 8.10 km, `(3689, 3381)` | 9.60 km, `(2239, 3676)` | South bend straightens west along the ridge, placing the falls 5.45 km away and 0.6° from centre. |
| Arch | 124, 374 | 10.50 km, `(1374, 3438)` | 12.00 km, `(151, 2640)` | West bend turns north at the low river reach, placing the arch 2.27 km away and 0.2° from centre. |
| Ruins | 4049, 1920 | 11.70 km, `(314, 2881)` | 13.20 km, `(1067, 2050)` | Return-notch bend turns east into the basin, placing the ruins 2.98 km away and 6.3° left of centre. |

**As built (#173).** The landmarks now stand at their stations instead of these far positions.
`LANDMARK_STATIONS` in `src/world/routePoints.ts` is authoritative: tower 2.00 km, waterfall
7.10 km, tree 9.60 km, arch 11.65 km, ruins 13.30 km, each on the valley floor. The tree and the
waterfall swapped stations so the waterfall's plunge pool sits on a floor just above the water, and
the arch and ruins moved to floor that passes the dry-ground rule. See
`docs/decisions/2026-10-01-173-landmark-stations.md`.

Each reveal is exactly 1.50 km before its station. The tower is technically visible from the open
basin in today's terrain. The basin ridge and cut in the proposed terrain sketch provide the new
occlusion boundary that makes its authored first reveal happen at `s = 0.50 km`. The same rule
applies to the other four landmarks, with gaps in the future ridge walls only along their listed
sightlines.

## Map reading

- `docs/screenshots/170-map.svg` traces the `?map` view of today's generated terrain and landmarks,
  with the real route overlaid. It is evidence of the starting terrain, not a claim that the
  current ridges form the route.
- `docs/screenshots/170-terrain-sketch.svg` overlays the intended 700 m basin, two notches, valley
  corridor, river stretches, and reveal sightlines. It is a planning sketch for the terrain ticket.
- The route data is authoritative when a drawn annotation and a coordinate disagree.
