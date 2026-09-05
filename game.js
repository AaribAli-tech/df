(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Ironwood Range: map-only prototype
  // ---------------------------------------------------------------------------
  // This file intentionally contains no combat, enemy, upgrade, currency, or
  // menu logic. It owns the arena terrain, reusable solid geometry, camera,
  // and just enough tank driving to inspect every route and collision surface.

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const minimap = document.querySelector("#minimap");
  const miniCtx = minimap.getContext("2d", { alpha: false });
  const sectorLabel = document.querySelector("#sector-label");
  const toast = document.querySelector("#toast");

  const TILE = 32;
  const WORLD = Object.freeze({
    width: 3840,
    height: 2560,
    tileSize: TILE,
    columns: 120,
    rows: 80,
  });

  const TERRAIN = Object.freeze({
    grass: 0,
    worn: 1,
    dirt: 2,
    concrete: 3,
    gravel: 4,
  });

  const terrain = new Uint8Array(WORLD.columns * WORLD.rows);
  const solids = [];
  const scenery = [];
  const groundPads = [];
  const decals = [];
  const roads = [];
  let objectId = 0;

  const playerSpawn = Object.freeze({ x: 288, y: 1280, label: "PLAYER START" });
  const enemySpawns = Object.freeze([
    { x: 2850, y: 324, label: "NORTH DEPLOYMENT" },
    { x: 3544, y: 1280, label: "EAST DEPLOYMENT" },
    { x: 3400, y: 2256, label: "SOUTHEAST DEPLOYMENT" },
    { x: 1750, y: 2290, label: "SOUTH DEPLOYMENT" },
    { x: 294, y: 700, label: "NORTHWEST DEPLOYMENT" },
  ]);

  const player = {
    x: playerSpawn.x,
    y: playerSpawn.y,
    vx: 0,
    vy: 0,
    heading: Math.PI / 2,
    turretHeading: Math.PI / 2,
    radius: 42,
    speed: 250,
    acceleration: 1500,
  };

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    width: 1280,
    height: 720,
  };

  const input = new Set();
  const pointer = { x: 0, y: 0, seen: false };
  let dpr = 1;
  let lastTime = performance.now();
  let elapsed = 0;
  let miniStatic = null;

  // The supplied tank art stays as the actual player vehicle. The hull and
  // turret are layered independently so later systems can reuse this setup.
  const tankArt = {
    hull: new Image(),
    turret: new Image(),
    hullReady: false,
    turretReady: false,
  };
  tankArt.hull.onload = () => {
    tankArt.hullReady = true;
  };
  tankArt.turret.onload = () => {
    tankArt.turretReady = true;
  };
  tankArt.hull.src = "Panther/ww2_top_view_hull1.png";
  tankArt.turret.src = "Panther/ww2_top_view_turret1.png";

  // ---------------------------------------------------------------------------
  // Small deterministic helpers
  // ---------------------------------------------------------------------------

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function hash2(x, y, seed = 0) {
    let n = Math.imul((x | 0) ^ Math.imul(y | 0, 374761393), 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  }

  function randomFrom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  }

  function makeCanvas(width, height) {
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    return surface;
  }

  function fillPixelCircle(context, x, y, radius, color) {
    // Deliberately stepped, so small rounded forms keep a pixel-art silhouette.
    context.fillStyle = color;
    const rows = [
      [-2, 2],
      [-3, 3],
      [-4, 4],
      [-4, 4],
      [-4, 4],
      [-3, 3],
      [-2, 2],
    ];
    const unit = Math.max(1, Math.floor(radius / 4));
    const startY = y - Math.floor(rows.length / 2) * unit;
    rows.forEach(([from, to], index) => {
      context.fillRect(x + from * unit, startY + index * unit, (to - from + 1) * unit, unit);
    });
  }

  function polygon(context, points, color) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index][0], points[index][1]);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  // ---------------------------------------------------------------------------
  // Tile palette — compact reusable terrain tiles, rendered crisp at 32 px.
  // ---------------------------------------------------------------------------

  function createGrassTile(variant) {
    const surface = makeCanvas(TILE, TILE);
    const c = surface.getContext("2d");
    const rand = randomFrom(101 + variant * 37);
    // Keep the tile bases close together; variation comes from the foliage pixels
    // rather than a visible checkerboard across the battlefield.
    const bases = ["#668c40", "#648a3f", "#688e42", "#638a3e", "#678d41", "#668b40"];
    c.fillStyle = bases[variant % bases.length];
    c.fillRect(0, 0, TILE, TILE);

    for (let i = 0; i < 32; i += 1) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      const shade = rand();
      c.fillStyle = shade > 0.64 ? "#7b9b4e" : shade > 0.28 ? "#4e7536" : "#5c823c";
      c.fillRect(x, y, rand() > 0.76 ? 2 : 1, rand() > 0.87 ? 2 : 1);
    }

    for (let i = 0; i < 7; i += 1) {
      const x = 2 + Math.floor(rand() * 27);
      const y = 4 + Math.floor(rand() * 25);
      c.fillStyle = rand() > 0.5 ? "#496f34" : "#82a54e";
      c.fillRect(x, y, 1, 3);
      c.fillRect(x + 1, y + 1, 1, 2);
    }
    return surface;
  }

  function createWornTile(variant) {
    const surface = makeCanvas(TILE, TILE);
    const c = surface.getContext("2d");
    const rand = randomFrom(233 + variant * 67);
    const bases = ["#7d8749", "#7a8548", "#808a4c", "#778247"];
    c.fillStyle = bases[variant % bases.length];
    c.fillRect(0, 0, TILE, TILE);

    for (let i = 0; i < 38; i += 1) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      c.fillStyle = rand() > 0.5 ? "#a18a54" : "#62753c";
      c.fillRect(x, y, rand() > 0.86 ? 2 : 1, 1);
    }
    for (let i = 0; i < 4; i += 1) {
      const x = Math.floor(rand() * 28);
      const y = Math.floor(rand() * 27);
      c.fillStyle = "#526e38";
      c.fillRect(x, y, 2, 1);
      c.fillRect(x + 1, y - 1, 1, 1);
    }
    return surface;
  }

  function createDirtTile(variant) {
    const surface = makeCanvas(TILE, TILE);
    const c = surface.getContext("2d");
    const rand = randomFrom(379 + variant * 41);
    const bases = ["#ac7847", "#a97544", "#ae7b49", "#a67041", "#ab7645", "#aa7543"];
    c.fillStyle = bases[variant % bases.length];
    c.fillRect(0, 0, TILE, TILE);

    for (let i = 0; i < 42; i += 1) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      const shade = rand();
      c.fillStyle = shade > 0.69 ? "#c39259" : shade > 0.35 ? "#865735" : "#97613a";
      c.fillRect(x, y, shade > 0.89 ? 2 : 1, shade > 0.88 ? 2 : 1);
    }

    if (variant % 2 === 0) {
      c.fillStyle = "rgba(92, 61, 35, 0.36)";
      c.fillRect(4, 9, 8, 1);
      c.fillRect(18, 22, 9, 1);
      c.fillRect(22, 23, 4, 1);
    }
    return surface;
  }

  function createConcreteTile(variant) {
    const surface = makeCanvas(TILE, TILE);
    const c = surface.getContext("2d");
    const rand = randomFrom(571 + variant * 79);
    const bases = ["#7d877a", "#737d73", "#899084", "#727c70"];
    c.fillStyle = bases[variant % bases.length];
    c.fillRect(0, 0, TILE, TILE);
    c.fillStyle = "rgba(205, 211, 189, 0.28)";
    c.fillRect(0, 0, TILE, 1);
    c.fillRect(0, 0, 1, TILE);
    c.fillStyle = "rgba(39, 49, 46, 0.29)";
    c.fillRect(0, TILE - 1, TILE, 1);
    c.fillRect(TILE - 1, 0, 1, TILE);

    for (let i = 0; i < 13; i += 1) {
      const x = 2 + Math.floor(rand() * 27);
      const y = 2 + Math.floor(rand() * 27);
      c.fillStyle = rand() > 0.5 ? "rgba(203, 207, 184, 0.18)" : "rgba(48, 58, 53, 0.19)";
      c.fillRect(x, y, rand() > 0.86 ? 2 : 1, 1);
    }

    if (variant % 3 === 0) {
      c.fillStyle = "rgba(57, 66, 59, 0.43)";
      c.fillRect(17, 5, 1, 7);
      c.fillRect(14, 11, 4, 1);
      c.fillRect(13, 12, 1, 4);
    }
    return surface;
  }

  function createGravelTile(variant) {
    const surface = makeCanvas(TILE, TILE);
    const c = surface.getContext("2d");
    const rand = randomFrom(743 + variant * 29);
    const bases = ["#777a62", "#70765f", "#828168", "#6e725e"];
    c.fillStyle = bases[variant % bases.length];
    c.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 55; i += 1) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      c.fillStyle = rand() > 0.66 ? "#a39a73" : rand() > 0.31 ? "#555c4d" : "#8d8b6c";
      c.fillRect(x, y, rand() > 0.86 ? 2 : 1, 1);
    }
    return surface;
  }

  const tilePalette = {
    [TERRAIN.grass]: Array.from({ length: 8 }, (_, i) => createGrassTile(i)),
    [TERRAIN.worn]: Array.from({ length: 6 }, (_, i) => createWornTile(i)),
    [TERRAIN.dirt]: Array.from({ length: 8 }, (_, i) => createDirtTile(i)),
    [TERRAIN.concrete]: Array.from({ length: 5 }, (_, i) => createConcreteTile(i)),
    [TERRAIN.gravel]: Array.from({ length: 5 }, (_, i) => createGravelTile(i)),
  };

  // ---------------------------------------------------------------------------
  // Map construction — every solid gets a shared collision rectangle.
  // ---------------------------------------------------------------------------

  function addGroundPad(kind, x, y, width, height, options = {}) {
    groundPads.push({ kind, x, y, width, height, ...options });
  }

  function addSolid(kind, x, y, width, height, options = {}) {
    const inset = options.collisionInset || 0;
    const item = {
      id: `cover-${objectId += 1}`,
      kind,
      x,
      y,
      width,
      height,
      collision: {
        x: x + inset,
        y: y + inset,
        width: Math.max(1, width - inset * 2),
        height: Math.max(1, height - inset * 2),
      },
      ...options,
      solid: true,
    };
    solids.push(item);
    scenery.push(item);
    return item;
  }

  function addDecoration(kind, x, y, options = {}) {
    decals.push({ kind, x, y, ...options });
  }

  function addWall(x, y, width, height, options = {}) {
    return addSolid("wall", x, y, width, height, { style: "concrete", ...options });
  }

  function addCrate(x, y, size = 48, options = {}) {
    return addSolid("crate", x, y, size, size, { collisionInset: 3, ...options });
  }

  function addBarrel(x, y, options = {}) {
    return addSolid("barrel", x, y, 27, 31, { collisionInset: 4, ...options });
  }

  function addRock(x, y, width, height, options = {}) {
    return addSolid("rock", x, y, width, height, { collisionInset: 3, ...options });
  }

  function addBarricade(x, y, width, height = 32, options = {}) {
    return addSolid("barricade", x, y, width, height, { collisionInset: 2, ...options });
  }

  function addSandbags(x, y, width, height = 32, options = {}) {
    return addSolid("sandbags", x, y, width, height, { collisionInset: 2, ...options });
  }

  function addBunker(x, y, width, height, options = {}) {
    return addSolid("bunker", x, y, width, height, { collisionInset: 7, ...options });
  }

  function addRuin(x, y, width, height, options = {}) {
    return addSolid("ruin", x, y, width, height, { collisionInset: 5, ...options });
  }

  function addTree(x, y, size = 64, options = {}) {
    return addSolid("tree", x, y, size, size, { collisionInset: 12, ...options });
  }

  function addBush(x, y, width = 38, height = 24, options = {}) {
    // Bushes are intentionally soft scenery: they break up sight lines visually
    // without turning routes into surprise collision traps.
    scenery.push({
      id: `scenery-${objectId += 1}`,
      kind: "bush",
      x,
      y,
      width,
      height,
      ...options,
      solid: false,
    });
  }

  function addCrateCluster(x, y, layout, tone = "warm") {
    layout.forEach(([dx, dy, size]) => addCrate(x + dx, y + dy, size || 48, { tone }));
  }

  function addBarrelCluster(x, y, count, color = "olive") {
    for (let index = 0; index < count; index += 1) {
      const offsetX = (index % 2) * 29 + (index > 1 ? 6 : 0);
      const offsetY = Math.floor(index / 2) * 27;
      addBarrel(x + offsetX, y + offsetY, { color });
    }
  }

  function addRockCluster(x, y, layout) {
    layout.forEach(([dx, dy, width, height]) => addRock(x + dx, y + dy, width, height));
  }

  function scatterDecals(kind, x, y, width, height, count, seed, options = {}) {
    const rand = randomFrom(seed);
    for (let index = 0; index < count; index += 1) {
      addDecoration(kind, x + rand() * width, y + rand() * height, {
        seed: Math.floor(rand() * 100000),
        rotation: Math.floor(rand() * 4) * (Math.PI / 2),
        ...options,
      });
    }
  }

  function buildMap() {
    // The perimeter is deliberately continuous. It sets a clean arena edge,
    // while the internal sections below create the routes and bounce corners.
    addWall(0, 0, WORLD.width, 64, { style: "perimeter", name: "north perimeter" });
    addWall(0, WORLD.height - 64, WORLD.width, 64, { style: "perimeter", name: "south perimeter" });
    addWall(0, 64, 64, WORLD.height - 128, { style: "perimeter", name: "west perimeter" });
    addWall(WORLD.width - 64, 64, 64, WORLD.height - 128, { style: "perimeter", name: "east perimeter" });

    // Terrain staging: pads are passable concrete or gravel beneath structures.
    addGroundPad("concrete", 128, 1120, 352, 320, { label: "START APRON" });
    addGroundPad("concrete", 190, 232, 354, 278, { label: "WEST MOTOR POOL" });
    addGroundPad("gravel", 420, 690, 530, 400);
    addGroundPad("concrete", 1136, 358, 770, 564);
    addGroundPad("concrete", 1940, 224, 410, 312);
    addGroundPad("gravel", 2300, 404, 690, 490);
    addGroundPad("concrete", 3060, 245, 430, 390);
    addGroundPad("gravel", 2860, 770, 620, 530);
    addGroundPad("gravel", 390, 1640, 690, 570);
    addGroundPad("concrete", 1330, 1850, 360, 310);
    addGroundPad("concrete", 2020, 1940, 760, 430);
    addGroundPad("gravel", 2900, 1510, 650, 510);
    addGroundPad("concrete", 3200, 1935, 390, 390);

    // Northwest motor pool: protected, but open toward the main crossroad.
    addBunker(256, 272, 224, 144, { roof: "olive", name: "west garage" });
    addRuin(288, 544, 128, 96, { tone: "stone" });
    addWall(480, 448, 416, 64, { name: "northwest switchback" });
    addWall(832, 448, 64, 288, { name: "northwest switchback" });
    addCrateCluster(532, 576, [[0, 0, 48], [52, 4, 48], [17, 52, 48]], "cool");
    addBarrelCluster(694, 588, 3, "rust");
    addTree(120, 520, 64);
    addBush(178, 596, 44, 26);
    addBush(408, 696, 44, 25);
    addRockCluster(926, 598, [[0, 0, 52, 38], [40, 28, 42, 34], [8, 43, 38, 28]]);

    // North bastion. Two offsets form a narrow but comfortable 128 px service cut.
    addWall(1216, 448, 544, 64, { name: "north bastion" });
    addWall(1696, 448, 64, 288, { name: "north bastion" });
    addWall(1888, 576, 64, 320, { name: "north service cut" });
    addSandbags(1104, 718, 160, 32, { direction: "horizontal" });
    addBunker(2000, 272, 224, 152, { roof: "slate", name: "range control" });
    addBarrelCluster(2176, 472, 4, "olive");
    addCrateCluster(1982, 496, [[0, 0, 48], [53, 0, 48]], "cool");
    addBush(1460, 632, 52, 27);
    addRockCluster(1480, 778, [[0, 0, 50, 36], [48, 20, 45, 34], [22, 45, 39, 27]]);

    // Northeast fuel yard and a stepped wall turn facing the central lane.
    addWall(2368, 544, 512, 64, { name: "northeast ridge" });
    addWall(2368, 544, 64, 288, { name: "northeast ridge" });
    addCrateCluster(2656, 650, [[0, 0, 48], [52, 0, 48], [26, 52, 48]], "warm");
    addBarrelCluster(2800, 654, 4, "rust");
    addBunker(3136, 328, 256, 160, { roof: "olive", name: "north relay" });
    addWall(2944, 864, 448, 64, { name: "east switchback" });
    addWall(3328, 864, 64, 352, { name: "east switchback" });
    addBarricade(3020, 1032, 128, 32, { stripe: true });
    addRockCluster(3540, 646, [[0, 0, 54, 41], [38, 31, 44, 30]]);
    addBush(3420, 530, 54, 28);
    addBush(3490, 716, 44, 24);

    // West stockyard starts after the player apron; the broad south opening keeps
    // the start safe while the wall creates a valuable ricochet corner later.
    addWall(512, 832, 352, 64, { name: "west stockyard" });
    addWall(800, 832, 64, 256, { name: "west stockyard" });
    addCrateCluster(548, 970, [[0, 0, 48], [52, 0, 48], [0, 52, 48]], "warm");
    addBarrelCluster(720, 990, 3, "olive");
    addBarricade(938, 1090, 96, 32, { stripe: true });
    addRockCluster(868, 1222, [[0, 0, 55, 38], [48, 20, 43, 31]]);
    addBush(544, 1164, 46, 24);
    addBush(660, 1190, 52, 26);

    // The center is intentionally wide. These separated wall pieces define a
    // 176 px choke that still leaves tank-sized clearance on both sides.
    addSandbags(1118, 1196, 160, 32, { direction: "horizontal" });
    addWall(1216, 1536, 320, 64, { name: "central screen west" });
    addWall(1712, 1536, 320, 64, { name: "central screen east" });
    addBarricade(2180, 1488, 128, 32, { stripe: true });
    addWall(2496, 1024, 64, 288, { name: "east central spur" });
    addSandbags(2598, 1300, 128, 32, { direction: "horizontal" });
    addRockCluster(2250, 1120, [[0, 0, 50, 39], [42, 30, 45, 33], [2, 53, 37, 26]]);
    addCrateCluster(2328, 1370, [[0, 0, 48], [52, 0, 48]], "cool");
    addBush(1380, 1370, 46, 24);
    addBush(2074, 1430, 52, 26);

    // Southwest broken depot and the lower loop approach.
    addWall(512, 1728, 64, 352, { name: "southwest depot wall" });
    addWall(512, 2016, 416, 64, { name: "southwest depot wall" });
    addBunker(248, 2112, 208, 152, { roof: "slate", name: "southwest workshop" });
    addCrateCluster(630, 1810, [[0, 0, 48], [52, 2, 48], [26, 52, 48]], "warm");
    addBarrelCluster(762, 1848, 4, "rust");
    addRockCluster(858, 1708, [[0, 0, 54, 38], [45, 24, 42, 30]]);
    addTree(766, 2150, 64);
    addBush(888, 2148, 52, 25);
    addBush(440, 2310, 47, 26);

    // South center collapsed radio site. The bunker face and southern wall form
    // another readable, 194 px tactical passage without a dead end.
    addRuin(1408, 1948, 160, 128, { tone: "brick", name: "collapsed relay" });
    addCrateCluster(1608, 1940, [[0, 0, 48], [0, 52, 48]], "cool");
    addWall(2112, 2048, 544, 64, { name: "south bastion" });
    addWall(2112, 2048, 64, 288, { name: "south bastion" });
    addBunker(2370, 2144, 200, 128, { roof: "olive", name: "south command shed" });
    addWall(2624, 2176, 64, 224, { name: "southern lane post" });
    addBarrelCluster(2778, 2164, 3, "olive");
    addRockCluster(1890, 2200, [[0, 0, 52, 38], [37, 31, 43, 30]]);
    addBush(1774, 2130, 54, 27);
    addBush(2025, 2312, 47, 25);

    // Southeast outpost. The bunker and vertical wall retain a 188 px passage.
    addWall(3008, 1632, 448, 64, { name: "southeast revetment" });
    addWall(3008, 1632, 64, 320, { name: "southeast revetment" });
    addBunker(3260, 1750, 192, 136, { roof: "slate", name: "southeast outpost" });
    addBarricade(3364, 1948, 112, 32, { stripe: true });
    addBunker(3312, 2024, 224, 160, { roof: "olive", name: "southeast store" });
    addCrateCluster(3066, 2010, [[0, 0, 48], [52, 0, 48], [26, 52, 48]], "warm");
    addBarrelCluster(3198, 2044, 3, "rust");
    addRockCluster(3530, 2260, [[0, 0, 51, 37], [41, 25, 40, 29]]);
    addTree(2900, 2100, 64);
    addBush(2980, 2230, 53, 27);
    addBush(3620, 1980, 46, 25);

    // Purposeful light dressing around structures, never in the central driving
    // bowl. These are visual only, so they do not create hidden collision snags.
    scatterDecals("rubble", 272, 430, 740, 320, 28, 5);
    scatterDecals("rubble", 1100, 340, 1800, 590, 46, 8);
    scatterDecals("rubble", 392, 1640, 660, 650, 33, 12);
    scatterDecals("rubble", 1310, 1830, 1500, 560, 44, 17);
    scatterDecals("rubble", 2860, 760, 720, 1560, 48, 21);
    scatterDecals("tuft", 140, 150, 3500, 2200, 74, 33);

    addDecoration("stencil", 1090, 1310, { text: "CROSSROAD", rotation: 0 });
    addDecoration("stencil", 2770, 1450, { text: "E-4", rotation: 0 });
    addDecoration("stencil", 680, 1510, { text: "W-3", rotation: 0 });
    addDecoration("tireTracks", 1150, 1288, { length: 720, rotation: 0 });
    addDecoration("tireTracks", 2220, 1260, { length: 620, rotation: 0 });
    addDecoration("tireTracks", 1915, 880, { length: 530, rotation: Math.PI / 2 });
  }

  // Dirt paths are intentionally broad and continuous; their worn shoulders
  // provide a clear, tile-aligned terrain transition without affecting driving.
  roads.push(
    { points: [[150, 1280], [720, 1280], [1090, 1260], [1620, 1280], [2260, 1280], [2860, 1280], [3680, 1280]], core: 78, edge: 128 },
    { points: [[1920, 150], [1920, 560], [1940, 910], [1920, 1270], [1940, 1690], [1940, 2360]], core: 70, edge: 116 },
    { points: [[330, 700], [820, 690], [1220, 710], [1620, 760]], core: 54, edge: 94 },
    { points: [[2240, 760], [2700, 770], [3060, 820], [3500, 700]], core: 52, edge: 92 },
    { points: [[430, 1920], [900, 1890], [1300, 1900], [1660, 2020]], core: 54, edge: 96 },
    { points: [[2240, 2130], [2720, 2190], [3150, 2200], [3540, 2250]], core: 54, edge: 96 },
    { points: [[840, 1540], [1140, 1540], [1400, 1600], [1600, 1760], [1680, 2050]], core: 44, edge: 82 },
    { points: [[2580, 1510], [2780, 1610], [2900, 1840], [2940, 2130]], core: 44, edge: 82 }
  );

  buildMap();

  function terrainIndex(tx, ty) {
    return ty * WORLD.columns + tx;
  }

  function paintTerrainRect(x, y, width, height, type) {
    const fromX = clamp(Math.floor(x / TILE), 0, WORLD.columns - 1);
    const fromY = clamp(Math.floor(y / TILE), 0, WORLD.rows - 1);
    const toX = clamp(Math.ceil((x + width) / TILE), 0, WORLD.columns);
    const toY = clamp(Math.ceil((y + height) / TILE), 0, WORLD.rows);
    for (let ty = fromY; ty < toY; ty += 1) {
      for (let tx = fromX; tx < toX; tx += 1) {
        terrain[terrainIndex(tx, ty)] = type;
      }
    }
  }

  function paintRoad(road) {
    for (let ty = 0; ty < WORLD.rows; ty += 1) {
      for (let tx = 0; tx < WORLD.columns; tx += 1) {
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        let nearest = Infinity;
        for (let pointIndex = 0; pointIndex < road.points.length - 1; pointIndex += 1) {
          const from = road.points[pointIndex];
          const to = road.points[pointIndex + 1];
          nearest = Math.min(nearest, distanceToSegment(cx, cy, from[0], from[1], to[0], to[1]));
        }
        if (nearest <= road.edge) terrain[terrainIndex(tx, ty)] = TERRAIN.worn;
        if (nearest <= road.core) terrain[terrainIndex(tx, ty)] = TERRAIN.dirt;
      }
    }
  }

  function initializeTerrain() {
    for (let ty = 0; ty < WORLD.rows; ty += 1) {
      for (let tx = 0; tx < WORLD.columns; tx += 1) {
        const value = hash2(tx, ty, 71) % 10;
        terrain[terrainIndex(tx, ty)] = value === 0 ? TERRAIN.worn : TERRAIN.grass;
      }
    }

    // A gravel patrol strip reads as a useful buffer along the outer fortification.
    paintTerrainRect(64, 64, WORLD.width - 128, 64, TERRAIN.gravel);
    paintTerrainRect(64, WORLD.height - 128, WORLD.width - 128, 64, TERRAIN.gravel);
    paintTerrainRect(64, 128, 64, WORLD.height - 256, TERRAIN.gravel);
    paintTerrainRect(WORLD.width - 128, 128, 64, WORLD.height - 256, TERRAIN.gravel);

    roads.forEach(paintRoad);
    groundPads.forEach((pad) => {
      paintTerrainRect(
        pad.x,
        pad.y,
        pad.width,
        pad.height,
        pad.kind === "concrete" ? TERRAIN.concrete : TERRAIN.gravel
      );
    });
  }

  initializeTerrain();

  // ---------------------------------------------------------------------------
  // Collision API — kept independent from player controls for future tanks and
  // ricochet projectiles. A later system can call `BattlefieldMap.castSegment`.
  // ---------------------------------------------------------------------------

  function circleOverlapsRect(x, y, radius, rect) {
    const nearestX = clamp(x, rect.x, rect.x + rect.width);
    const nearestY = clamp(y, rect.y, rect.y + rect.height);
    const dx = x - nearestX;
    const dy = y - nearestY;
    return dx * dx + dy * dy < radius * radius;
  }

  function isCircleBlocked(x, y, radius, ignoredId = null) {
    return solids.some((item) => item.id !== ignoredId && circleOverlapsRect(x, y, radius, item.collision));
  }

  function pushCircleOutOfRect(body, rect) {
    const nearestX = clamp(body.x, rect.x, rect.x + rect.width);
    const nearestY = clamp(body.y, rect.y, rect.y + rect.height);
    let dx = body.x - nearestX;
    let dy = body.y - nearestY;
    const distanceSq = dx * dx + dy * dy;
    const radiusSq = body.radius * body.radius;

    if (distanceSq >= radiusSq) return false;

    if (distanceSq > 0.0001) {
      const distance = Math.sqrt(distanceSq);
      const push = body.radius - distance + 0.02;
      body.x += (dx / distance) * push;
      body.y += (dy / distance) * push;
      return true;
    }

    // A center inside an AABB needs a deterministic shortest exit direction.
    const left = Math.abs(body.x - rect.x);
    const right = Math.abs(rect.x + rect.width - body.x);
    const top = Math.abs(body.y - rect.y);
    const bottom = Math.abs(rect.y + rect.height - body.y);
    const minimum = Math.min(left, right, top, bottom);
    if (minimum === left) body.x = rect.x - body.radius - 0.02;
    else if (minimum === right) body.x = rect.x + rect.width + body.radius + 0.02;
    else if (minimum === top) body.y = rect.y - body.radius - 0.02;
    else body.y = rect.y + rect.height + body.radius + 0.02;
    return true;
  }

  function moveCircle(body, dx, dy) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 7));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let step = 0; step < steps; step += 1) {
      body.x += stepX;
      body.y += stepY;
      for (let pass = 0; pass < 3; pass += 1) {
        let resolvedSomething = false;
        for (const solid of solids) {
          resolvedSomething = pushCircleOutOfRect(body, solid.collision) || resolvedSomething;
        }
        if (!resolvedSomething) break;
      }
    }
  }

  function lineRectIntersection(start, end, rect, padding = 0) {
    const minX = rect.x - padding;
    const minY = rect.y - padding;
    const maxX = rect.x + rect.width + padding;
    const maxY = rect.y + rect.height + padding;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let tMin = 0;
    let tMax = 1;
    let normalX = 0;
    let normalY = 0;

    const axis = [
      [start.x, dx, minX, maxX, -1, 0],
      [start.y, dy, minY, maxY, 0, -1],
    ];

    for (const [origin, delta, min, max, negativeX, negativeY] of axis) {
      if (Math.abs(delta) < 0.000001) {
        if (origin < min || origin > max) return null;
        continue;
      }
      const first = (min - origin) / delta;
      const second = (max - origin) / delta;
      const enter = Math.min(first, second);
      const exit = Math.max(first, second);
      if (enter > tMin) {
        tMin = enter;
        const enteringMin = first < second;
        normalX = negativeX === 0 ? 0 : enteringMin ? negativeX : -negativeX;
        normalY = negativeY === 0 ? 0 : enteringMin ? negativeY : -negativeY;
      }
      tMax = Math.min(tMax, exit);
      if (tMin > tMax) return null;
    }

    if (tMin < 0 || tMin > 1) return null;
    return {
      t: tMin,
      x: start.x + dx * tMin,
      y: start.y + dy * tMin,
      normal: { x: normalX, y: normalY },
    };
  }

  function castSegment(start, end, padding = 0) {
    let closest = null;
    for (const solid of solids) {
      const hit = lineRectIntersection(start, end, solid.collision, padding);
      if (hit && (!closest || hit.t < closest.t)) closest = { ...hit, solid };
    }
    return closest;
  }

  // Exposed map geometry is purposeful: future bullet and AI code can use the
  // exact same solid list instead of duplicating the collision layout.
  window.BattlefieldMap = Object.freeze({
    world: WORLD,
    playerSpawn,
    enemySpawns,
    solids,
    isCircleBlocked,
    moveCircle,
    castSegment,
  });

  // ---------------------------------------------------------------------------
  // Rendering: terrain first, then low dressing, then hard cover and tank.
  // ---------------------------------------------------------------------------

  function viewWidth() {
    return camera.width / camera.zoom;
  }

  function viewHeight() {
    return camera.height / camera.zoom;
  }

  function isVisible(x, y, width, height, padding = 64) {
    return (
      x + width >= camera.x - padding &&
      y + height >= camera.y - padding &&
      x <= camera.x + viewWidth() + padding &&
      y <= camera.y + viewHeight() + padding
    );
  }

  function drawTerrain() {
    const fromX = clamp(Math.floor(camera.x / TILE) - 1, 0, WORLD.columns - 1);
    const fromY = clamp(Math.floor(camera.y / TILE) - 1, 0, WORLD.rows - 1);
    const toX = clamp(Math.ceil((camera.x + viewWidth()) / TILE) + 1, 0, WORLD.columns);
    const toY = clamp(Math.ceil((camera.y + viewHeight()) / TILE) + 1, 0, WORLD.rows);

    for (let ty = fromY; ty < toY; ty += 1) {
      for (let tx = fromX; tx < toX; tx += 1) {
        const type = terrain[terrainIndex(tx, ty)];
        const options = tilePalette[type];
        const variant = hash2(tx, ty, type * 97) % options.length;
        ctx.drawImage(options[variant], tx * TILE, ty * TILE);
      }
    }
  }

  function drawGroundPad(pad) {
    if (!isVisible(pad.x, pad.y, pad.width, pad.height)) return;
    if (pad.kind === "concrete") {
      ctx.fillStyle = "rgba(46, 56, 49, 0.36)";
      ctx.fillRect(pad.x + 4, pad.y + pad.height, pad.width, 4);
      ctx.fillStyle = "rgba(209, 213, 187, 0.16)";
      ctx.fillRect(pad.x, pad.y, pad.width, 2);
    }
  }

  function drawSpawnMarker(marker, isPlayer) {
    const pulse = 0.55 + Math.sin(elapsed * 2.5 + marker.x * 0.004) * 0.12;
    const outer = isPlayer ? "#64c5df" : "#d88050";
    const inner = isPlayer ? "#b5e8ed" : "#e7ad72";
    const radius = isPlayer ? 58 : 47;

    if (!isVisible(marker.x - radius, marker.y - radius, radius * 2, radius * 2)) return;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.globalAlpha = isPlayer ? 0.75 : 0.54;
    ctx.strokeStyle = outer;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -elapsed * 12;
    ctx.beginPath();
    ctx.arc(0, 0, radius + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.56;
    ctx.fillStyle = "#263833";
    polygon(ctx, [[-25, -38], [25, -38], [38, -25], [38, 25], [25, 38], [-25, 38], [-38, 25], [-38, -25]], "#263833");
    ctx.strokeStyle = outer;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-25, -38);
    ctx.lineTo(25, -38);
    ctx.lineTo(38, -25);
    ctx.lineTo(38, 25);
    ctx.lineTo(25, 38);
    ctx.lineTo(-25, 38);
    ctx.lineTo(-38, 25);
    ctx.lineTo(-38, -25);
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = inner;
    if (isPlayer) {
      ctx.fillRect(-2, -19, 4, 38);
      ctx.fillRect(-19, -2, 38, 4);
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = "#37616b";
      ctx.fillRect(-4, -4, 8, 8);
    } else {
      ctx.fillRect(-15, -2, 30, 4);
      ctx.fillRect(-2, -15, 4, 30);
      ctx.fillStyle = "#6f3f2d";
      ctx.fillRect(-5, -5, 10, 10);
    }
    ctx.restore();
  }

  function drawDecal(decal) {
    const { x, y } = decal;
    if (!isVisible(x - 32, y - 32, 64, 64, 16)) return;
    const rand = randomFrom((decal.seed || 1) + 991);

    if (decal.kind === "rubble") {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(decal.rotation || 0);
      ctx.fillStyle = "rgba(40, 48, 42, 0.28)";
      ctx.fillRect(2, 3, 8, 3);
      ctx.fillStyle = rand() > 0.45 ? "#746e5a" : "#80654b";
      ctx.fillRect(0, 0, 5, 4);
      ctx.fillRect(7, 1, 4, 3);
      ctx.fillStyle = "#a18d6e";
      ctx.fillRect(1, 0, 2, 1);
      ctx.fillRect(7, 1, 1, 1);
      ctx.restore();
      return;
    }

    if (decal.kind === "tuft") {
      ctx.fillStyle = "rgba(53, 98, 45, 0.66)";
      ctx.fillRect(Math.round(x), Math.round(y) - 3, 1, 4);
      ctx.fillRect(Math.round(x) + 2, Math.round(y) - 5, 1, 6);
      ctx.fillStyle = "rgba(128, 162, 74, 0.65)";
      ctx.fillRect(Math.round(x) + 1, Math.round(y) - 2, 1, 3);
      return;
    }

    if (decal.kind === "tireTracks") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(decal.rotation || 0);
      const length = decal.length || 300;
      ctx.fillStyle = "rgba(83, 57, 35, 0.18)";
      for (let offset = 0; offset < length; offset += 18) {
        ctx.fillRect(offset, -13, 11, 2);
        ctx.fillRect(offset + 4, 11, 11, 2);
      }
      ctx.restore();
      return;
    }

    if (decal.kind === "stencil") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(decal.rotation || 0);
      ctx.fillStyle = "rgba(235, 222, 171, 0.28)";
      ctx.font = "700 12px monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(decal.text, 0, 0);
      ctx.restore();
    }
  }

  function drawWall(item) {
    const { x, y, width, height } = item;
    const horizontal = width >= height;
    const isPerimeter = item.style === "perimeter";
    const unit = 32;

    ctx.fillStyle = "rgba(27, 35, 31, 0.45)";
    ctx.fillRect(x + 5, y + 6, width, height);
    ctx.fillStyle = isPerimeter ? "#3e4b45" : "#48544e";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = isPerimeter ? "#69705f" : "#738077";
    ctx.fillRect(x + 2, y + 2, width - 4, height - 4);
    ctx.fillStyle = "#303d39";
    ctx.fillRect(x, y + height - 5, width, 5);
    ctx.fillRect(x + width - 5, y, 5, height);
    ctx.fillStyle = "rgba(224, 225, 194, 0.42)";
    ctx.fillRect(x + 2, y + 2, width - 7, 2);
    ctx.fillRect(x + 2, y + 2, 2, height - 7);

    if (horizontal) {
      for (let offset = 0; offset < width; offset += unit) {
        const cellWidth = Math.min(unit, width - offset);
        ctx.fillStyle = offset / unit % 2 === 0 ? "rgba(213, 214, 187, 0.10)" : "rgba(40, 51, 47, 0.08)";
        ctx.fillRect(x + offset + 5, y + 7, Math.max(1, cellWidth - 8), Math.max(1, height - 15));
        ctx.fillStyle = "rgba(38, 48, 45, 0.38)";
        ctx.fillRect(x + offset, y + 4, 1, height - 9);
        if (height >= 48) {
          ctx.fillRect(x + offset + 3, y + Math.floor(height / 2), Math.max(1, cellWidth - 8), 1);
        }
        if ((offset / unit) % 3 === 1) {
          ctx.fillStyle = "rgba(49, 59, 54, 0.54)";
          ctx.fillRect(x + offset + 11, y + 13, 4, 2);
          ctx.fillRect(x + offset + 13, y + 15, 1, 3);
        }
      }
    } else {
      for (let offset = 0; offset < height; offset += unit) {
        const cellHeight = Math.min(unit, height - offset);
        ctx.fillStyle = offset / unit % 2 === 0 ? "rgba(213, 214, 187, 0.10)" : "rgba(40, 51, 47, 0.08)";
        ctx.fillRect(x + 7, y + offset + 5, Math.max(1, width - 15), Math.max(1, cellHeight - 8));
        ctx.fillStyle = "rgba(38, 48, 45, 0.38)";
        ctx.fillRect(x + 4, y + offset, width - 9, 1);
        if (width >= 48) {
          ctx.fillRect(x + Math.floor(width / 2), y + offset + 3, 1, Math.max(1, cellHeight - 8));
        }
        if ((offset / unit) % 3 === 1) {
          ctx.fillStyle = "rgba(49, 59, 54, 0.54)";
          ctx.fillRect(x + 14, y + offset + 10, 2, 4);
          ctx.fillRect(x + 16, y + offset + 13, 3, 1);
        }
      }
    }

    if (isPerimeter) {
      // Restrained hazard marks make the boundary read as a hardened arena edge.
      ctx.fillStyle = "rgba(185, 156, 71, 0.46)";
      if (horizontal) {
        for (let offset = 16; offset < width - 16; offset += 96) {
          ctx.fillRect(x + offset, y + (y < WORLD.height / 2 ? height - 10 : 6), 36, 3);
        }
      } else {
        for (let offset = 16; offset < height - 16; offset += 96) {
          ctx.fillRect(x + (x < WORLD.width / 2 ? width - 10 : 6), y + offset, 3, 36);
        }
      }
    }
  }

  function drawCrate(item) {
    const { x, y, width, tone } = item;
    const palette = tone === "cool"
      ? { dark: "#4c6254", base: "#74816a", light: "#a1a685", line: "#3f4e43" }
      : { dark: "#6c482d", base: "#9a673a", light: "#c28b50", line: "#593a26" };
    const inset = Math.max(4, Math.floor(width * 0.12));
    ctx.fillStyle = "rgba(37, 35, 27, 0.42)";
    ctx.fillRect(x + 4, y + 5, width - 1, width - 1);
    ctx.fillStyle = palette.dark;
    ctx.fillRect(x, y, width, width);
    ctx.fillStyle = palette.base;
    ctx.fillRect(x + inset, y + inset, width - inset * 2, width - inset * 2);
    ctx.fillStyle = palette.light;
    ctx.fillRect(x + inset + 2, y + inset + 2, width - inset * 2 - 4, 3);
    ctx.fillStyle = palette.line;
    ctx.fillRect(x + Math.floor(width / 2) - 2, y + inset, 4, width - inset * 2);
    ctx.fillRect(x + inset, y + Math.floor(width / 2) - 2, width - inset * 2, 4);
    polygon(ctx, [[x + inset + 2, y + inset + 4], [x + inset + 5, y + inset + 4], [x + width - inset - 3, y + width - inset - 5], [x + width - inset - 3, y + width - inset - 2]], palette.line);
    polygon(ctx, [[x + width - inset - 4, y + inset + 2], [x + width - inset - 1, y + inset + 2], [x + inset + 3, y + width - inset - 3], [x + inset + 3, y + width - inset - 6]], palette.line);
    ctx.fillStyle = "rgba(239, 212, 145, 0.34)";
    ctx.fillRect(x + 3, y + 3, width - 8, 1);
  }

  function drawBarrel(item) {
    const { x, y, width, height, color } = item;
    const palette = color === "rust"
      ? { shadow: "#53392e", body: "#9d593a", light: "#d18450", band: "#58382e", top: "#c77a47" }
      : { shadow: "#36463a", body: "#5b6e4a", light: "#91a46d", band: "#354638", top: "#788d5b" };
    ctx.fillStyle = "rgba(35, 37, 29, 0.36)";
    ctx.fillRect(x + 3, y + height - 2, width, 4);
    polygon(ctx, [[x + 5, y], [x + width - 5, y], [x + width, y + 5], [x + width, y + height - 5], [x + width - 5, y + height], [x + 5, y + height], [x, y + height - 5], [x, y + 5]], palette.shadow);
    ctx.fillStyle = palette.body;
    ctx.fillRect(x + 3, y + 4, width - 6, height - 8);
    ctx.fillStyle = palette.light;
    ctx.fillRect(x + 5, y + 6, 3, height - 12);
    ctx.fillStyle = palette.band;
    ctx.fillRect(x + 2, y + 9, width - 4, 3);
    ctx.fillRect(x + 2, y + height - 12, width - 4, 3);
    polygon(ctx, [[x + 5, y + 2], [x + width - 5, y + 2], [x + width - 3, y + 5], [x + 3, y + 5]], palette.top);
    ctx.fillStyle = "rgba(220, 215, 164, 0.4)";
    ctx.fillRect(x + 8, y + 3, 5, 1);
  }

  function drawRock(item) {
    const { x, y, width, height, id } = item;
    const rand = randomFrom(hash2(x, y, id.length));
    const points = [
      [x + 4, y + height * 0.34],
      [x + width * 0.22, y + 4],
      [x + width * 0.68, y + 2],
      [x + width - 3, y + height * 0.3],
      [x + width - 5, y + height * 0.76],
      [x + width * 0.61, y + height - 2],
      [x + width * 0.21, y + height - 4],
      [x + 2, y + height * 0.66],
    ];
    polygon(ctx, points.map(([px, py]) => [px + 4, py + 5]), "rgba(35, 42, 37, 0.43)");
    polygon(ctx, points, "#62695f");
    polygon(ctx, [
      [x + width * 0.18, y + height * 0.35],
      [x + width * 0.32, y + height * 0.13],
      [x + width * 0.62, y + height * 0.11],
      [x + width * 0.52, y + height * 0.47],
      [x + width * 0.28, y + height * 0.57],
    ], "#889080");
    ctx.fillStyle = "#a5a58a";
    ctx.fillRect(Math.round(x + width * 0.29), Math.round(y + height * 0.25), Math.max(3, Math.floor(width * 0.21)), 2);
    ctx.fillStyle = "#465048";
    for (let index = 0; index < 3; index += 1) {
      ctx.fillRect(Math.round(x + 8 + rand() * (width - 16)), Math.round(y + 8 + rand() * (height - 16)), 3, 2);
    }
  }

  function drawBarricade(item) {
    const { x, y, width, height, stripe } = item;
    ctx.fillStyle = "rgba(30, 37, 34, 0.41)";
    ctx.fillRect(x + 3, y + 5, width, height);
    ctx.fillStyle = "#5c6961";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#8d9787";
    ctx.fillRect(x + 3, y + 3, width - 6, height - 9);
    ctx.fillStyle = "#434f49";
    ctx.fillRect(x, y + height - 6, width, 6);
    ctx.fillStyle = "rgba(225, 227, 197, 0.37)";
    ctx.fillRect(x + 4, y + 3, width - 10, 2);
    if (stripe) {
      for (let offset = 10; offset < width - 7; offset += 24) {
        polygon(ctx, [[x + offset, y + 7], [x + offset + 9, y + 7], [x + offset - 1, y + height - 9], [x + offset - 10, y + height - 9]], "#c99445");
      }
    }
  }

  function drawSandbags(item) {
    const { x, y, width, height } = item;
    ctx.fillStyle = "rgba(35, 40, 31, 0.36)";
    ctx.fillRect(x + 3, y + height - 1, width, 4);
    const bagWidth = 27;
    for (let offset = 0; offset < width; offset += bagWidth) {
      const bx = x + offset;
      const topOffset = (Math.floor(offset / bagWidth) % 2) * 2;
      polygon(ctx, [[bx + 2, y + 7 + topOffset], [bx + 8, y + 2 + topOffset], [bx + Math.min(bagWidth - 3, width - offset), y + 5 + topOffset], [bx + Math.min(bagWidth, width - offset), y + height - 8], [bx + Math.min(bagWidth - 6, width - offset), y + height - 3], [bx + 4, y + height - 4]], "#91784d");
      ctx.fillStyle = "#b49b68";
      ctx.fillRect(bx + 8, y + 6 + topOffset, Math.min(13, width - offset - 9), 2);
      ctx.fillStyle = "#665437";
      ctx.fillRect(bx + Math.min(18, width - offset - 6), y + 9 + topOffset, 2, height - 14);
    }
  }

  function drawBunker(item) {
    const { x, y, width, height, roof } = item;
    const palette = roof === "slate"
      ? { edge: "#394b4c", roof: "#617172", roofLight: "#84928a", panel: "#4f5f60" }
      : { edge: "#3f4d3e", roof: "#607152", roofLight: "#8e9b6c", panel: "#506144" };
    ctx.fillStyle = "rgba(27, 34, 29, 0.48)";
    ctx.fillRect(x + 7, y + 8, width, height);
    ctx.fillStyle = "#35413a";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = palette.edge;
    ctx.fillRect(x + 4, y + 4, width - 8, height - 8);
    ctx.fillStyle = palette.roof;
    ctx.fillRect(x + 12, y + 13, width - 24, height - 27);
    ctx.fillStyle = palette.roofLight;
    ctx.fillRect(x + 16, y + 17, width - 32, 4);
    ctx.fillStyle = palette.panel;
    ctx.fillRect(x + Math.floor(width * 0.27), y + 34, 4, height - 56);
    ctx.fillRect(x + Math.floor(width * 0.62), y + 34, 4, height - 56);
    ctx.fillStyle = "#2f3934";
    ctx.fillRect(x + 12, y + height - 19, width - 24, 8);
    ctx.fillStyle = "#7e8b78";
    for (let offset = 22; offset < width - 28; offset += 28) {
      ctx.fillRect(x + offset, y + height - 17, 17, 2);
    }
    ctx.fillStyle = "#c29142";
    ctx.fillRect(x + width - 34, y + 18, 13, 4);
    ctx.fillStyle = "#3a4037";
    ctx.fillRect(x + width - 31, y + 17, 2, 6);
    ctx.fillStyle = "rgba(223, 225, 193, 0.35)";
    ctx.fillRect(x + 5, y + 5, width - 14, 2);
  }

  function drawRuin(item) {
    const { x, y, width, height, tone } = item;
    const base = tone === "brick" ? "#78594a" : "#6d7369";
    const light = tone === "brick" ? "#ad7d5f" : "#98a08f";
    ctx.fillStyle = "rgba(31, 36, 31, 0.45)";
    ctx.fillRect(x + 5, y + 6, width, height);
    polygon(ctx, [[x + 3, y + height], [x + 3, y + 20], [x + width * 0.18, y + 7], [x + width * 0.32, y + 20], [x + width * 0.49, y + 4], [x + width * 0.7, y + 18], [x + width - 4, y + 12], [x + width - 4, y + height]], base);
    ctx.fillStyle = light;
    ctx.fillRect(x + 11, y + 26, width - 24, 10);
    ctx.fillStyle = "#434c45";
    ctx.fillRect(x + width * 0.39, y + 34, width * 0.28, height - 44);
    ctx.fillStyle = "#2f3934";
    ctx.fillRect(x + 8, y + height - 15, width - 16, 8);
    ctx.fillStyle = "rgba(211, 201, 167, 0.43)";
    ctx.fillRect(x + 15, y + 22, width * 0.23, 3);
    ctx.fillRect(x + width * 0.72, y + 23, width * 0.12, 3);
    ctx.fillStyle = "#5b4a3d";
    ctx.fillRect(x + 15, y + height - 27, 12, 6);
    ctx.fillRect(x + width - 35, y + height - 23, 16, 5);
  }

  function drawTree(item) {
    const { x, y, width, height } = item;
    ctx.fillStyle = "rgba(28, 40, 28, 0.42)";
    fillPixelCircle(ctx, x + width / 2 + 5, y + height / 2 + 5, width * 0.44, "rgba(28, 40, 28, 0.42)");
    ctx.fillStyle = "#584a32";
    ctx.fillRect(x + width / 2 - 4, y + height / 2 + 8, 9, height / 2 - 9);
    fillPixelCircle(ctx, x + width / 2, y + height / 2 - 4, width * 0.42, "#375f38");
    fillPixelCircle(ctx, x + width / 2 - 6, y + height / 2 - 10, width * 0.27, "#4f7b3e");
    ctx.fillStyle = "#75954d";
    ctx.fillRect(x + width * 0.33, y + height * 0.26, width * 0.18, 4);
    ctx.fillRect(x + width * 0.51, y + height * 0.36, 5, 7);
    ctx.fillStyle = "#284b31";
    ctx.fillRect(x + width * 0.28, y + height * 0.62, 7, 5);
  }

  function drawBush(item) {
    const { x, y, width, height } = item;
    ctx.fillStyle = "rgba(34, 51, 31, 0.27)";
    ctx.fillRect(x + 2, y + height - 2, width, 4);
    polygon(ctx, [[x, y + height], [x + 4, y + 7], [x + width * 0.28, y + 2], [x + width * 0.48, y + 7], [x + width * 0.72, y + 1], [x + width - 2, y + 9], [x + width, y + height]], "#416b38");
    ctx.fillStyle = "#668843";
    ctx.fillRect(x + width * 0.22, y + 7, width * 0.23, 3);
    ctx.fillRect(x + width * 0.57, y + 6, width * 0.18, 3);
    ctx.fillStyle = "#2e5733";
    ctx.fillRect(x + 4, y + height - 7, 8, 3);
    ctx.fillRect(x + width - 14, y + height - 6, 9, 3);
  }

  function drawObject(item) {
    if (!isVisible(item.x, item.y, item.width, item.height)) return;
    switch (item.kind) {
      case "wall": drawWall(item); break;
      case "crate": drawCrate(item); break;
      case "barrel": drawBarrel(item); break;
      case "rock": drawRock(item); break;
      case "barricade": drawBarricade(item); break;
      case "sandbags": drawSandbags(item); break;
      case "bunker": drawBunker(item); break;
      case "ruin": drawRuin(item); break;
      case "tree": drawTree(item); break;
      case "bush": drawBush(item); break;
      default: break;
    }
  }

  function drawFallbackTank() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.heading);
    ctx.fillStyle = "rgba(25, 30, 26, 0.52)";
    ctx.fillRect(-22, -29, 44, 67);
    ctx.fillStyle = "#607657";
    ctx.fillRect(-19, -34, 38, 62);
    ctx.fillStyle = "#99a472";
    ctx.fillRect(-12, -28, 24, 47);
    ctx.fillStyle = "#2c3930";
    ctx.fillRect(-23, -20, 7, 42);
    ctx.fillRect(16, -20, 7, 42);
    ctx.restore();

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.turretHeading);
    ctx.fillStyle = "#323d32";
    ctx.fillRect(-4, -42, 8, 35);
    fillPixelCircle(ctx, 0, 2, 15, "#84946b");
    ctx.restore();
  }

  function drawTank() {
    ctx.save();
    ctx.translate(player.x, player.y + 16);
    ctx.fillStyle = "rgba(20, 27, 22, 0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 29, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!tankArt.hullReady || !tankArt.turretReady) {
      drawFallbackTank();
      return;
    }

    const drawSize = 175;
    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(player.y));
    ctx.rotate(player.heading);
    ctx.drawImage(tankArt.hull, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();

    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(player.y));
    ctx.rotate(player.turretHeading);
    ctx.drawImage(tankArt.turret, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();

    // A small blue identification tab distinguishes the player without adding a
    // combat UI or modifying the supplied tank artwork.
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.heading);
    ctx.fillStyle = "#6bc9dc";
    ctx.fillRect(-3, 22, 6, 7);
    ctx.restore();
  }

  function drawWorld() {
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    drawTerrain();
    groundPads.forEach(drawGroundPad);
    drawSpawnMarker(playerSpawn, true);
    enemySpawns.forEach((marker) => drawSpawnMarker(marker, false));
    decals.forEach(drawDecal);

    // Sorting by the feet of objects lets the tank pass visually behind or in
    // front of cover without breaking top-down readability.
    const renderQueue = [];
    for (const item of scenery) {
      if (isVisible(item.x, item.y, item.width, item.height)) {
        renderQueue.push({ item, sortY: item.y + item.height });
      }
    }
    renderQueue.push({ item: null, sortY: player.y + 36 });
    renderQueue.sort((a, b) => a.sortY - b.sortY);
    for (const entry of renderQueue) {
      if (entry.item) drawObject(entry.item);
      else drawTank();
    }

    ctx.restore();
  }

  function drawCursorReadout() {
    if (!pointer.seen) return;
    const dx = pointer.x - canvas.getBoundingClientRect().left;
    const dy = pointer.y - canvas.getBoundingClientRect().top;
    if (dx < 0 || dy < 0 || dx > camera.width || dy > camera.height) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#d9e2b5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx - 8, dy);
    ctx.lineTo(dx - 3, dy);
    ctx.moveTo(dx + 3, dy);
    ctx.lineTo(dx + 8, dy);
    ctx.moveTo(dx, dy - 8);
    ctx.lineTo(dx, dy - 3);
    ctx.moveTo(dx, dy + 3);
    ctx.lineTo(dx, dy + 8);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Camera, controls, minimap
  // ---------------------------------------------------------------------------

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    camera.width = bounds.width;
    camera.height = bounds.height;
    camera.zoom = bounds.width < 620 ? 0.82 : 1;
    centerCameraImmediately();
  }

  function centerCameraImmediately() {
    const visibleWidth = camera.width / camera.zoom;
    const visibleHeight = camera.height / camera.zoom;
    camera.x = clamp(player.x - visibleWidth / 2, 0, Math.max(0, WORLD.width - visibleWidth));
    camera.y = clamp(player.y - visibleHeight / 2, 0, Math.max(0, WORLD.height - visibleHeight));
  }

  function updateCamera(delta) {
    const visibleWidth = camera.width / camera.zoom;
    const visibleHeight = camera.height / camera.zoom;
    const targetX = clamp(player.x - visibleWidth / 2, 0, Math.max(0, WORLD.width - visibleWidth));
    const targetY = clamp(player.y - visibleHeight / 2, 0, Math.max(0, WORLD.height - visibleHeight));
    const easing = 1 - Math.pow(0.0005, delta);
    camera.x = lerp(camera.x, targetX, easing);
    camera.y = lerp(camera.y, targetY, easing);
  }

  function updatePlayer(delta) {
    let intentX = 0;
    let intentY = 0;
    if (input.has("KeyA") || input.has("ArrowLeft")) intentX -= 1;
    if (input.has("KeyD") || input.has("ArrowRight")) intentX += 1;
    if (input.has("KeyW") || input.has("ArrowUp")) intentY -= 1;
    if (input.has("KeyS") || input.has("ArrowDown")) intentY += 1;

    const magnitude = Math.hypot(intentX, intentY);
    if (magnitude > 0) {
      intentX /= magnitude;
      intentY /= magnitude;
      player.vx += intentX * player.acceleration * delta;
      player.vy += intentY * player.acceleration * delta;
      const velocityAngle = Math.atan2(intentX, -intentY);
      let angleDifference = ((velocityAngle - player.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      player.heading += angleDifference * Math.min(1, delta * 10);
    } else {
      const drag = Math.pow(0.0008, delta);
      player.vx *= drag;
      player.vy *= drag;
    }

    const velocity = Math.hypot(player.vx, player.vy);
    if (velocity > player.speed) {
      player.vx = (player.vx / velocity) * player.speed;
      player.vy = (player.vy / velocity) * player.speed;
    }

    const beforeX = player.x;
    const beforeY = player.y;
    moveCircle(player, player.vx * delta, player.vy * delta);
    const actualX = player.x - beforeX;
    const actualY = player.y - beforeY;
    if (Math.abs(actualX - player.vx * delta) > 1) player.vx *= 0.25;
    if (Math.abs(actualY - player.vy * delta) > 1) player.vy *= 0.25;

    if (pointer.seen) {
      const bounds = canvas.getBoundingClientRect();
      const screenX = pointer.x - bounds.left;
      const screenY = pointer.y - bounds.top;
      const worldX = camera.x + screenX / camera.zoom;
      const worldY = camera.y + screenY / camera.zoom;
      const turretTarget = Math.atan2(worldX - player.x, -(worldY - player.y));
      let difference = ((turretTarget - player.turretHeading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      player.turretHeading += difference * Math.min(1, delta * 15);
    } else {
      player.turretHeading = player.heading;
    }
  }

  function drawMiniStatic() {
    miniStatic = makeCanvas(minimap.width, minimap.height);
    const c = miniStatic.getContext("2d");
    const sx = minimap.width / WORLD.width;
    const sy = minimap.height / WORLD.height;
    c.fillStyle = "#5c7d42";
    c.fillRect(0, 0, minimap.width, minimap.height);

    c.lineCap = "round";
    roads.forEach((road) => {
      c.beginPath();
      road.points.forEach(([x, y], index) => {
        if (index === 0) c.moveTo(x * sx, y * sy);
        else c.lineTo(x * sx, y * sy);
      });
      c.strokeStyle = "#aa7544";
      c.lineWidth = Math.max(2, road.core * sx * 1.6);
      c.stroke();
    });

    c.fillStyle = "#788073";
    groundPads.filter((pad) => pad.kind === "concrete").forEach((pad) => {
      c.fillRect(pad.x * sx, pad.y * sy, pad.width * sx, pad.height * sy);
    });

    solids.forEach((item) => {
      const rect = item.collision;
      let color = "#46514d";
      if (item.kind === "crate") color = "#98663b";
      else if (item.kind === "rock") color = "#687064";
      else if (item.kind === "tree") color = "#355d38";
      else if (item.kind === "bunker" || item.kind === "ruin") color = "#48544c";
      else if (item.kind === "barrel") color = "#8b6543";
      c.fillStyle = color;
      c.fillRect(rect.x * sx, rect.y * sy, Math.max(1, rect.width * sx), Math.max(1, rect.height * sy));
    });

    c.strokeStyle = "rgba(220, 227, 191, 0.42)";
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, minimap.width - 1, minimap.height - 1);
  }

  function updateMinimap() {
    if (!miniStatic) drawMiniStatic();
    miniCtx.drawImage(miniStatic, 0, 0);
    const sx = minimap.width / WORLD.width;
    const sy = minimap.height / WORLD.height;

    enemySpawns.forEach((spawn) => {
      miniCtx.strokeStyle = "#e09a5c";
      miniCtx.lineWidth = 1;
      miniCtx.beginPath();
      miniCtx.arc(spawn.x * sx, spawn.y * sy, 3, 0, Math.PI * 2);
      miniCtx.stroke();
    });

    miniCtx.strokeStyle = "rgba(226, 234, 196, 0.58)";
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(camera.x * sx, camera.y * sy, camera.width / camera.zoom * sx, camera.height / camera.zoom * sy);

    miniCtx.fillStyle = "#e9f7ec";
    miniCtx.fillRect(player.x * sx - 2, player.y * sy - 2, 4, 4);
    miniCtx.fillStyle = "#68c9df";
    miniCtx.fillRect(player.x * sx - 1, player.y * sy - 1, 2, 2);

    const sectorX = player.x < WORLD.width / 3 ? "W" : player.x < WORLD.width * 2 / 3 ? "C" : "E";
    const sectorY = clamp(Math.floor(player.y / (WORLD.height / 5)) + 1, 1, 5);
    sectorLabel.textContent = `SECTOR ${sectorX}-${sectorY}`;
  }

  function update(delta) {
    updatePlayer(delta);
    updateCamera(delta);
    updateMinimap();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#5d823f";
    ctx.fillRect(0, 0, camera.width, camera.height);
    drawWorld();
    drawCursorReadout();
  }

  function loop(now) {
    const delta = Math.min(0.035, (now - lastTime) / 1000);
    lastTime = now;
    elapsed += delta;
    update(delta);
    render();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    input.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    input.delete(event.code);
  });

  window.addEventListener("blur", () => input.clear());

  canvas.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.seen = false;
  });

  window.addEventListener("resize", resize);
  resize();
  drawMiniStatic();
  updateMinimap();
  requestAnimationFrame(loop);

  window.setTimeout(() => toast.classList.add("is-hidden"), 4400);
})();
