# Ironwood Range — Battlefield Map

A polished, map-only playable arena for the tank game. This prototype intentionally stops before combat: there are **no weapons, enemies, bosses, menus, upgrades, pets, coins, or AI**.

The player drives the supplied Panther hull/turret artwork through a large outdoor military range with:

- a clear central combat bowl and long east/west and north/south sight lanes;
- a continuous perimeter, stepped concrete wall sections, and numerous readable wall corners;
- intentionally placed crate, barrel, rock, barricade, sandbag, ruin, bunker, tree, and bush cover;
- three tank-comfortable tactical cuts between hard cover, with alternate routes around each section;
- a safe blue player start pad and five orange future enemy deployment pads;
- a follow camera and a compact range overview.

## Run locally

```bash
npm start
```

Then visit [http://localhost:4173](http://localhost:4173). Use **WASD** or the **arrow keys** to drive; moving the mouse rotates the turret only. The prototype intentionally does not fire.

## Verify the arena

```bash
npm test
```

The headless check validates that the player start and future deployment sites are clear, the perimeter is solid, the shared segment-cast API finds walls, and representative outer, central, and southern routes are connected at the actual tank collision radius.

## Collision handoff

`game.js` publishes `window.BattlefieldMap`, which owns the arena's source-of-truth collision geometry:

```js
BattlefieldMap.solids; // all hard cover, each with item.collision { x, y, width, height }
BattlefieldMap.isCircleBlocked(x, y, radius);
BattlefieldMap.moveCircle(body, dx, dy);
BattlefieldMap.castSegment(start, end, padding);
```

Future tank, AI, and ricochet code can use these same colliders and segment casts instead of duplicating map geometry.

> Note: the supplied checkout contains tank and effect assets but no terrain atlas. The battlefield terrain palette and prop tiles in `game.js` are purpose-built pixel-art render tiles so the available tank artwork remains unchanged and the map can be played immediately without introducing unrelated third-party art.
