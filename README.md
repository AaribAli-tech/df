# Ironclad: Ricochet

A self-contained top-down pixel tank campaign. It builds on the original Ironwood battlefield with a playable combat loop, three distinct operations, persistent tank ownership, and field upgrades.

## Play

```bash
npm start
```

Open the local server in a browser. From the command screen:

1. Choose **Play Missions** and deploy to Ironwood Range.
2. Drive with **WASD** or the **arrow keys**.
3. Aim with the mouse and fire with **click** or **Space**.
4. Clear hostile waves, collect credits automatically from destroyed tanks, then use the **Tank Bay** and **Upgrade Lab** before the next deployment.

The profile persists in browser local storage. Use **Settings → Reset Campaign Profile** to return to the starter loadout.

## Campaign

| Operation | Battlefield focus | Waves | Unlock |
| --- | --- | ---: | --- |
| 01 · Ironwood Range | Open grassland crossroad, wall corners, safe training deployment | 3 | Available at start |
| 02 · Cinder Depot | Industrial freight lanes, hard cover, depot chokes | 3 | Clear Ironwood |
| 03 · Blackwater Citadel | Fortified ring, interior screens, ricochet pockets | 4 | Clear Cinder |

All three maps have independently validated player starts, enemy deployment pads, solid terrain cover, and connected tank-safe routes.

## Tank Bay

- **Panther** — starter balanced platform
- **T-34** — fast skirmisher
- **Sherman** — resilient linebreaker
- **Tiger** — slow heavy assault platform

Purchased tanks are permanent and may be equipped from the Tank Bay before a mission. Their health, speed, armor, and cannon damage are all active gameplay stats.

## Upgrade Lab

Every fitted upgrade persists and is applied to the equipped tank:

- **Multi-Cannon Array**: single → dual → triple → quad fire
- **Ricochet Lining**: player shells bounce from hard cover up to four times
- **Reactive Armor**: reduces incoming shell damage
- **Reinforced Hull**: raises maximum health

## Implementation notes

- Enemy scouts, raiders, guards, and heavies use the supplied tank art, path around the arena's shared collision geometry, and fire only when they have a clear line of sight.
- Bullet collision, enemy navigation, player movement, enemy movement, and future ricochet features share `window.BattlefieldMap` solid geometry and segment casts.
- The supplied checkout includes tank/effect art but no terrain atlas. Terrain and prop tiles are purpose-built pixel-art renderer tiles, while all player and enemy vehicles use the supplied tank art unchanged.

## Verification

```bash
npm test
```

The headless campaign smoke test verifies:

- all three maps' player starts and hostile spawn pads;
- perimeter and hard-cover collision;
- tank-radius-connected routes through every mission;
- tactical chokepoint clearance on Ironwood;
- tank purchase/equip flow and all four upgrade tracks;
- a menu-to-mission handoff and first hostile wave deployment.
