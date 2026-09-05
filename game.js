(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Ironclad: Ricochet — campaign, combat, tanks, and battlefield maps.
  // ---------------------------------------------------------------------------

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const minimap = document.querySelector("#minimap");
  const miniCtx = minimap.getContext("2d", { alpha: false });
  const sectorLabel = document.querySelector("#sector-label");
  const toast = document.querySelector("#toast");

  const ui = {
    app: document.querySelector("#app"),
    menuLayer: document.querySelector("#menu-layer"),
    hud: document.querySelector("#hud"),
    combatHelp: document.querySelector("#combat-help"),
    missionList: document.querySelector("#mission-list"),
    tankList: document.querySelector("#tank-list"),
    upgradeList: document.querySelector("#upgrade-list"),
    equippedDescription: document.querySelector("#equipped-description"),
    equippedStats: document.querySelector("#equipped-stats"),
    campaignProgress: document.querySelector("#campaign-progress"),
    hudCoins: document.querySelector("#hud-coins"),
    hudSector: document.querySelector("#hud-sector"),
    hudMission: document.querySelector("#hud-mission"),
    hudObjective: document.querySelector("#hud-objective"),
    hudTankName: document.querySelector("#hud-tank-name"),
    hudHealthText: document.querySelector("#hud-health-text"),
    hudHealthFill: document.querySelector("#hud-health-fill"),
    hudArmorPips: document.querySelector("#hud-armor-pips"),
    hudWave: document.querySelector("#hud-wave"),
    hudEnemies: document.querySelector("#hud-enemies"),
    pauseButton: document.querySelector("#pause-button"),
    resetProfile: document.querySelector("#reset-profile"),
    resultKicker: document.querySelector("#result-kicker"),
    resultTitle: document.querySelector("#result-title"),
    resultCopy: document.querySelector("#result-copy"),
    resultCredits: document.querySelector("#result-credits"),
    resultPrimary: document.querySelector("#result-primary"),
    resultSecondary: document.querySelector("#result-secondary"),
  };
  const screens = Array.from(document.querySelectorAll ? document.querySelectorAll("[data-screen]") : []);
  const currencyNodes = Array.from(document.querySelectorAll ? document.querySelectorAll("[data-credits]") : []);
  const equippedNameNodes = Array.from(document.querySelectorAll ? document.querySelectorAll("[data-equipped-name]") : []);

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
  let playerSpawn = { x: 288, y: 1280, label: "PLAYER START" };
  let enemySpawns = [];
  let currentLevelIndex = 0;
  let currentTheme = "ironwood";
  let miniStatic = null;
  let navField = null;

  const TANKS = Object.freeze([
    {
      id: "panther",
      name: "PANTHER",
      className: "FIELD STANDARD",
      price: 0,
      health: 120,
      speed: 245,
      armor: 1,
      damage: 20,
      description: "Balanced armor with reliable speed and handling.",
      hull: "Panther/ww2_top_view_hull1.png",
      turret: "Panther/ww2_top_view_turret1.png",
    },
    {
      id: "t34",
      name: "T-34",
      className: "SKIRMISHER",
      price: 180,
      health: 105,
      speed: 274,
      armor: 0,
      damage: 18,
      description: "Fast flank armor for crews that live on the move.",
      hull: "T-34/ww2_top_view_hull4.png",
      turret: "T-34/ww2_top_view_turret4.png",
    },
    {
      id: "sherman",
      name: "SHERMAN",
      className: "LINEBREAKER",
      price: 330,
      health: 148,
      speed: 223,
      armor: 2,
      damage: 22,
      description: "Steady, resilient armor built to own open lanes.",
      hull: "Sherman/ww2_top_view_hull10.png",
      turret: "Sherman/ww2_top_view_turret10.png",
    },
    {
      id: "tiger",
      name: "TIGER",
      className: "HEAVY ASSAULT",
      price: 560,
      health: 190,
      speed: 188,
      armor: 3,
      damage: 28,
      description: "Slow but formidable heavy armor for decisive pushes.",
      hull: "Tiger/ww2_top_view_hull3.png",
      turret: "Tiger/ww2_top_view_turret3.png",
    },
  ]);

  const ENEMY_TYPES = Object.freeze({
    scout: { id: "scout", name: "SCOUT", tankId: "m13", health: 52, speed: 142, armor: 0, damage: 9, fireRate: 1.4, reward: 8, range: 470, color: "#df7e56" },
    raider: { id: "raider", name: "RAIDER", tankId: "t34", health: 78, speed: 124, armor: 1, damage: 12, fireRate: 1.25, reward: 12, range: 500, color: "#e09558" },
    guard: { id: "guard", name: "GUARD", tankId: "panzer", health: 112, speed: 97, armor: 2, damage: 15, fireRate: 1.08, reward: 18, range: 540, color: "#d57b5c" },
    heavy: { id: "heavy", name: "HEAVY", tankId: "tiger", health: 165, speed: 76, armor: 3, damage: 20, fireRate: 0.92, reward: 28, range: 580, color: "#d15c4c" },
  });

  const ENEMY_TANK_ART = Object.freeze({
    m13: { hull: "M13/ww2_top_view_hull13.png", turret: "M13/ww2_top_view_turret13.png" },
    t34: { hull: "T-34/ww2_top_view_hull4.png", turret: "T-34/ww2_top_view_turret4.png" },
    panzer: { hull: "Panzer 4/ww2_top_view_hull2.png", turret: "Panzer 4/ww2_top_view_turret2.png" },
    tiger: { hull: "Tiger/ww2_top_view_hull3.png", turret: "Tiger/ww2_top_view_turret3.png" },
  });

  const UPGRADES = Object.freeze([
    { id: "volley", icon: "Ⅳ", title: "MULTI-CANNON ARRAY", levels: 4, costs: [0, 90, 170, 270], description: "Adds a barrel each tier: single, dual, triple, then quad fire.", effect: (level) => `${level} BARREL${level === 1 ? "" : "S"}` },
    { id: "bounce", icon: "↗", title: "RICOCHET LINING", levels: 4, costs: [110, 165, 230, 310], description: "Lets player shells rebound from solid cover before expiring.", effect: (level) => `${level} BOUNCE${level === 1 ? "" : "S"}` },
    { id: "armor", icon: "▰", title: "REACTIVE ARMOR", levels: 4, costs: [90, 145, 210, 290], description: "Reduces incoming shell damage with reinforced plate layers.", effect: (level) => `+${level} ARMOR` },
    { id: "hull", icon: "+", title: "REINFORCED HULL", levels: 4, costs: [85, 135, 200, 280], description: "Raises maximum health for every tank in your garage.", effect: (level) => `+${level * 24} HP` },
  ]);

  // Maps are intentionally different combat problems: wide lane control,
  // industrial choke points, then a fortified ring with many ricochet surfaces.
  const LEVELS = Object.freeze([
    {
      id: "ironwood",
      number: "01",
      title: "IRONWOOD RANGE",
      subtitle: "GREENLINE TRAINING",
      description: "Secure the range crossroad and clear the first hostile probe.",
      theme: "ironwood",
      reward: 90,
      map: buildIronwoodMap,
      playerSpawn: { x: 288, y: 1280, label: "PLAYER START" },
      spawns: [
        { x: 2850, y: 324, label: "NORTH DEPLOYMENT" },
        { x: 3544, y: 1280, label: "EAST DEPLOYMENT" },
        { x: 3400, y: 2256, label: "SOUTHEAST DEPLOYMENT" },
        { x: 1750, y: 2290, label: "SOUTH DEPLOYMENT" },
        { x: 294, y: 700, label: "NORTHWEST DEPLOYMENT" },
      ],
      waves: [
        [{ type: "scout", count: 4 }],
        [{ type: "scout", count: 3 }, { type: "raider", count: 2 }],
        [{ type: "raider", count: 3 }, { type: "guard", count: 1 }],
      ],
    },
    {
      id: "cinder",
      number: "02",
      title: "CINDER DEPOT",
      subtitle: "CONVOY INTERCEPT",
      description: "Break the depot cordon before the armored convoy escapes.",
      theme: "cinder",
      reward: 150,
      map: buildCinderMap,
      playerSpawn: { x: 420, y: 2200, label: "SOUTHWEST INSERTION" },
      spawns: [
        { x: 180, y: 750, label: "NORTHWEST DEPLOYMENT" },
        { x: 1880, y: 290, label: "NORTH DEPLOYMENT" },
        { x: 3470, y: 520, label: "NORTHEAST DEPLOYMENT" },
        { x: 3490, y: 1550, label: "EAST DEPLOYMENT" },
        { x: 2580, y: 2260, label: "SOUTH DEPLOYMENT" },
      ],
      waves: [
        [{ type: "scout", count: 3 }, { type: "raider", count: 2 }],
        [{ type: "raider", count: 4 }, { type: "guard", count: 2 }],
        [{ type: "scout", count: 2 }, { type: "guard", count: 3 }, { type: "heavy", count: 1 }],
      ],
    },
    {
      id: "citadel",
      number: "03",
      title: "BLACKWATER CITADEL",
      subtitle: "FINAL HOLDOUT",
      description: "Punch through a fortified ring and silence the last defenders.",
      theme: "citadel",
      reward: 230,
      map: buildCitadelMap,
      playerSpawn: { x: 1940, y: 2260, label: "SOUTH INSERTION" },
      spawns: [
        { x: 190, y: 760, label: "NORTHWEST DEPLOYMENT" },
        { x: 1920, y: 300, label: "NORTH DEPLOYMENT" },
        { x: 3640, y: 760, label: "NORTHEAST DEPLOYMENT" },
        { x: 3620, y: 2160, label: "SOUTHEAST DEPLOYMENT" },
        { x: 180, y: 2200, label: "SOUTHWEST DEPLOYMENT" },
      ],
      waves: [
        [{ type: "raider", count: 4 }, { type: "guard", count: 2 }],
        [{ type: "scout", count: 3 }, { type: "raider", count: 3 }, { type: "guard", count: 2 }],
        [{ type: "guard", count: 4 }, { type: "heavy", count: 2 }],
        [{ type: "raider", count: 3 }, { type: "guard", count: 3 }, { type: "heavy", count: 2 }],
      ],
    },
  ]);

  const player = {
    x: playerSpawn.x,
    y: playerSpawn.y,
    vx: 0,
    vy: 0,
    heading: Math.PI / 2,
    turretHeading: Math.PI / 2,
    radius: 42,
    speed: 245,
    acceleration: 1500,
    tankId: "panther",
    health: 120,
    maxHealth: 120,
    armor: 1,
    damage: 20,
    nextFireAt: 0,
    invulnerableUntil: 0,
  };

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    width: 1280,
    height: 720,
  };

  const game = {
    state: "menu",
    menuScreen: "main",
    level: null,
    waveIndex: -1,
    waveDelay: 0,
    spawnQueue: [],
    spawnTimer: 0,
    killed: 0,
    earnedCredits: 0,
    completed: false,
    nextFlowRefresh: 0,
    lastResult: null,
  };
  const enemies = [];
  const bullets = [];
  const particles = [];
  const floatingTexts = [];
  let screenShake = 0;
  let dpr = 1;
  let lastTime = performance.now();
  let elapsed = 0;

  const input = new Set();
  const pointer = { x: 0, y: 0, seen: false, down: false };

  function safeReadProfile() {
    const defaults = {
      coins: 240,
      owned: ["panther"],
      selectedTank: "panther",
      unlockedLevel: 1,
      completed: [],
      upgrades: { volley: 1, bounce: 0, armor: 0, hull: 0 },
      settings: { screenShake: true, reducedEffects: false, autoFire: true },
    };
    try {
      const stored = window.localStorage && window.localStorage.getItem("ironclad-profile-v2");
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      return {
        ...defaults,
        ...parsed,
        owned: Array.from(new Set(["panther", ...(parsed.owned || [])])),
        upgrades: { ...defaults.upgrades, ...(parsed.upgrades || {}) },
        settings: { ...defaults.settings, ...(parsed.settings || {}) },
        completed: Array.from(new Set(parsed.completed || [])),
      };
    } catch (_error) {
      return defaults;
    }
  }

  const profile = safeReadProfile();

  function saveProfile() {
    try {
      if (window.localStorage) window.localStorage.setItem("ironclad-profile-v2", JSON.stringify(profile));
    } catch (_error) {
      // Campaign still works for this session if storage is unavailable.
    }
  }

  function createImageAsset(source) {
    const image = new Image();
    const record = { image, ready: false };
    image.onload = () => { record.ready = true; };
    image.src = encodeURI(source);
    return record;
  }

  const tankArt = {};
  TANKS.forEach((tank) => {
    tankArt[tank.id] = { hull: createImageAsset(tank.hull), turret: createImageAsset(tank.turret) };
  });
  Object.entries(ENEMY_TANK_ART).forEach(([id, art]) => {
    if (!tankArt[id]) tankArt[id] = { hull: createImageAsset(art.hull), turret: createImageAsset(art.turret) };
  });

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

  function addArenaPerimeter() {
    addWall(0, 0, WORLD.width, 64, { style: "perimeter", name: "north perimeter" });
    addWall(0, WORLD.height - 64, WORLD.width, 64, { style: "perimeter", name: "south perimeter" });
    addWall(0, 64, 64, WORLD.height - 128, { style: "perimeter", name: "west perimeter" });
    addWall(WORLD.width - 64, 64, 64, WORLD.height - 128, { style: "perimeter", name: "east perimeter" });
  }

  function buildIronwoodMap() {
    addIronwoodRoads();
    // The perimeter is deliberately continuous. It sets a clean arena edge,
    // while the internal sections below create routes and ricochet corners.
    addArenaPerimeter();

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

  function buildCinderMap() {
    addArenaPerimeter();
    roads.push(
      { points: [[170, 610], [700, 610], [1220, 620], [1850, 620], [2540, 630], [3670, 610]], core: 84, edge: 136 },
      { points: [[1880, 150], [1880, 600], [1900, 1120], [1900, 1660], [1880, 2370]], core: 70, edge: 118 },
      { points: [[380, 2100], [980, 2080], [1430, 1960], [1880, 1690]], core: 60, edge: 105 },
      { points: [[2450, 2240], [2900, 2050], [3260, 1700], [3500, 1420]], core: 60, edge: 105 },
      { points: [[730, 1020], [1180, 1120], [1500, 1300], [1900, 1370], [2400, 1300], [2900, 1100]], core: 46, edge: 88 }
    );

    addGroundPad("concrete", 190, 1880, 480, 430, { label: "INSERTION APRON" });
    addGroundPad("gravel", 250, 220, 640, 680);
    addGroundPad("concrete", 1080, 360, 690, 560);
    addGroundPad("gravel", 2060, 360, 770, 580);
    addGroundPad("concrete", 3000, 300, 550, 560);
    addGroundPad("concrete", 1130, 1110, 920, 620);
    addGroundPad("gravel", 2440, 1040, 900, 650);
    addGroundPad("concrete", 1900, 1840, 980, 520);
    addGroundPad("gravel", 3000, 1750, 560, 550);

    // Northwest rail yard: straight lanes, container-like walls, and open exits.
    addBunker(250, 280, 230, 150, { roof: "slate", name: "rail dispatch" });
    addWall(520, 448, 448, 64, { name: "rail yard north wall" });
    addWall(904, 448, 64, 256, { name: "rail yard north wall" });
    addWall(336, 800, 416, 64, { name: "rail yard lower wall" });
    addCrateCluster(544, 556, [[0, 0, 48], [52, 0, 48], [104, 0, 48], [27, 52, 48]], "cool");
    addBarrelCluster(744, 594, 4, "rust");
    addRuin(248, 560, 150, 116, { tone: "brick", name: "burned shed" });
    addRockCluster(1020, 430, [[0, 0, 52, 37], [42, 27, 42, 31]]);
    addBush(154, 750, 48, 25);

    // Central freight maze: broad crossings remain available between each block.
    addWall(1190, 450, 416, 64, { name: "freight wall north" });
    addWall(1538, 450, 64, 280, { name: "freight wall north" });
    addBunker(1210, 714, 220, 142, { roof: "olive", name: "freight office" });
    addWall(1712, 924, 576, 64, { name: "central depot screen" });
    addWall(2216, 924, 64, 288, { name: "central depot screen" });
    addWall(1170, 1170, 64, 384, { name: "center west divider" });
    addWall(1234, 1490, 352, 64, { name: "center west divider" });
    addCrateCluster(1462, 1054, [[0, 0, 48], [52, 0, 48], [0, 52, 48]], "warm");
    addBarrelCluster(1644, 1090, 3, "olive");
    addSandbags(1840, 1320, 160, 32, { direction: "horizontal" });
    addBarricade(2050, 1424, 128, 32, { stripe: true });
    addRockCluster(1350, 1618, [[0, 0, 52, 38], [42, 28, 44, 31]]);

    // Northeast maintenance row.
    addBunker(2990, 338, 260, 155, { roof: "olive", name: "maintenance bay" });
    addWall(2740, 584, 448, 64, { name: "northeast loading wall" });
    addWall(3120, 584, 64, 288, { name: "northeast loading wall" });
    addCrateCluster(2700, 716, [[0, 0, 48], [53, 1, 48], [26, 52, 48]], "warm");
    addBarrelCluster(2880, 730, 4, "rust");
    addRockCluster(3380, 760, [[0, 0, 55, 40], [40, 29, 41, 29]]);
    addBush(3510, 935, 48, 24);

    // Southeast service yard, linked to the main depot by two generous lanes.
    addWall(2500, 1520, 480, 64, { name: "east service screen" });
    addWall(2916, 1520, 64, 320, { name: "east service screen" });
    addBunker(3160, 1740, 230, 148, { roof: "slate", name: "service control" });
    addWall(2230, 1950, 512, 64, { name: "south freight wall" });
    addWall(2230, 1950, 64, 288, { name: "south freight wall" });
    addCrateCluster(2770, 1900, [[0, 0, 48], [52, 0, 48], [104, 0, 48], [26, 52, 48]], "cool");
    addBarrelCluster(3012, 1924, 3, "olive");
    addBarricade(3250, 2006, 128, 32, { stripe: true });
    addRuin(3340, 2140, 150, 116, { tone: "brick", name: "collapsed depot" });
    addTree(2800, 2220, 64);
    addBush(2925, 2300, 49, 24);

    // Southwest insertion has several cover islands but no dead-end around spawn.
    addBunker(250, 1960, 230, 148, { roof: "olive", name: "insertion store" });
    addWall(650, 1810, 64, 352, { name: "southwest revetment" });
    addWall(650, 2098, 384, 64, { name: "southwest revetment" });
    addCrateCluster(770, 1740, [[0, 0, 48], [52, 0, 48], [0, 52, 48]], "warm");
    addRockCluster(1050, 2012, [[0, 0, 56, 39], [44, 29, 42, 31], [3, 51, 38, 27]]);
    addBush(890, 2250, 52, 26);

    scatterDecals("rubble", 180, 240, 3440, 2020, 190, 91);
    scatterDecals("tuft", 140, 170, 3550, 2200, 42, 119);
    addDecoration("stencil", 1000, 684, { text: "DEPOT 7", rotation: 0 });
    addDecoration("stencil", 2460, 1300, { text: "FREIGHT", rotation: 0 });
    addDecoration("stencil", 540, 1720, { text: "SOUTH GATE", rotation: 0 });
    addDecoration("tireTracks", 800, 620, { length: 740, rotation: 0 });
    addDecoration("tireTracks", 1876, 810, { length: 770, rotation: Math.PI / 2 });
  }

  function buildCitadelMap() {
    addArenaPerimeter();
    roads.push(
      { points: [[1900, 140], [1900, 510], [1900, 770], [1900, 1120], [1900, 1550], [1940, 2350]], core: 70, edge: 116 },
      { points: [[180, 1260], [760, 1260], [1110, 1260], [1550, 1280], [2230, 1280], [2750, 1260], [3660, 1260]], core: 76, edge: 126 },
      { points: [[360, 420], [700, 670], [920, 900], [1100, 1160]], core: 49, edge: 92 },
      { points: [[3470, 420], [3170, 670], [2920, 900], [2700, 1160]], core: 49, edge: 92 },
      { points: [[420, 2070], [780, 1830], [1050, 1640], [1260, 1480]], core: 49, edge: 92 },
      { points: [[3450, 2070], [3100, 1820], [2800, 1600], [2620, 1480]], core: 49, edge: 92 }
    );

    addGroundPad("concrete", 1660, 1980, 560, 360, { label: "SOUTH INSERTION" });
    addGroundPad("gravel", 230, 220, 740, 720);
    addGroundPad("gravel", 2860, 220, 740, 720);
    addGroundPad("concrete", 930, 650, 1980, 1250, { label: "CITADEL INTERIOR" });
    addGroundPad("gravel", 240, 1660, 760, 570);
    addGroundPad("gravel", 2850, 1660, 720, 570);

    // A broken square fort gives clear corners and four non-dead-end approaches.
    addWall(1120, 640, 576, 64, { name: "citadel north west" });
    addWall(2144, 640, 576, 64, { name: "citadel north east" });
    addWall(960, 800, 64, 480, { name: "citadel west north" });
    addWall(960, 1456, 64, 384, { name: "citadel west south" });
    addWall(2816, 800, 64, 480, { name: "citadel east north" });
    addWall(2816, 1456, 64, 384, { name: "citadel east south" });
    addWall(1120, 1856, 576, 64, { name: "citadel south west" });
    addWall(2144, 1856, 576, 64, { name: "citadel south east" });

    // Interior screens make deliberate ricochet pockets without sealing the bowl.
    addWall(1270, 960, 352, 64, { name: "inner west screen" });
    addWall(1270, 960, 64, 256, { name: "inner west screen" });
    addWall(2220, 960, 352, 64, { name: "inner east screen" });
    addWall(2508, 960, 64, 256, { name: "inner east screen" });
    addWall(1440, 1536, 320, 64, { name: "inner south west" });
    addWall(2080, 1536, 320, 64, { name: "inner south east" });
    addBunker(1740, 1060, 360, 220, { roof: "slate", name: "citadel core" });
    addSandbags(1600, 1370, 160, 32, { direction: "horizontal" });
    addSandbags(2080, 1370, 160, 32, { direction: "horizontal" });
    addBarricade(1780, 1450, 128, 32, { stripe: true });
    addBarricade(1980, 1450, 128, 32, { stripe: true });
    addCrateCluster(1110, 1320, [[0, 0, 48], [52, 0, 48], [26, 52, 48]], "cool");
    addCrateCluster(2600, 1320, [[0, 0, 48], [52, 0, 48], [26, 52, 48]], "warm");

    // Outer deployment yards.
    addBunker(250, 300, 224, 146, { roof: "olive", name: "west relay" });
    addWall(480, 520, 352, 64, { name: "northwest yard wall" });
    addWall(768, 520, 64, 260, { name: "northwest yard wall" });
    addCrateCluster(480, 650, [[0, 0, 48], [52, 0, 48], [0, 52, 48]], "warm");
    addBarrelCluster(672, 650, 4, "rust");
    addRockCluster(560, 980, [[0, 0, 55, 39], [46, 28, 42, 31]]);
    addTree(280, 1000, 64);
    addBush(418, 1070, 50, 25);

    addBunker(3360, 300, 224, 146, { roof: "olive", name: "east relay" });
    addWall(3008, 520, 352, 64, { name: "northeast yard wall" });
    addWall(3008, 520, 64, 260, { name: "northeast yard wall" });
    addCrateCluster(3100, 650, [[0, 0, 48], [52, 0, 48], [0, 52, 48]], "cool");
    addBarrelCluster(3300, 650, 4, "olive");
    addRockCluster(3200, 980, [[0, 0, 55, 39], [46, 28, 42, 31]]);
    addTree(3470, 1000, 64);
    addBush(3320, 1080, 50, 25);

    addBunker(270, 1940, 224, 146, { roof: "slate", name: "west field bay" });
    addWall(500, 1800, 352, 64, { name: "southwest yard wall" });
    addWall(788, 1580, 64, 284, { name: "southwest yard wall" });
    addCrateCluster(530, 1700, [[0, 0, 48], [52, 0, 48], [26, 52, 48]], "warm");
    addBarrelCluster(712, 1720, 3, "rust");
    addRockCluster(390, 2200, [[0, 0, 55, 39], [46, 28, 42, 31]]);

    addBunker(3330, 1940, 224, 146, { roof: "slate", name: "east field bay" });
    addWall(2990, 1800, 352, 64, { name: "southeast yard wall" });
    addWall(2990, 1580, 64, 284, { name: "southeast yard wall" });
    addCrateCluster(3100, 1700, [[0, 0, 48], [52, 0, 48], [26, 52, 48]], "cool");
    addBarrelCluster(3280, 1720, 3, "olive");
    addRockCluster(3400, 2200, [[0, 0, 55, 39], [46, 28, 42, 31]]);

    scatterDecals("rubble", 170, 200, 3480, 2180, 210, 199);
    scatterDecals("tuft", 150, 160, 3500, 2230, 38, 333);
    addDecoration("stencil", 1730, 860, { text: "BLACKWATER", rotation: 0 });
    addDecoration("stencil", 1690, 1710, { text: "CITADEL", rotation: 0 });
    addDecoration("tireTracks", 1160, 1260, { length: 1520, rotation: 0 });
    addDecoration("tireTracks", 1898, 730, { length: 980, rotation: Math.PI / 2 });
  }

  // Dirt paths are intentionally broad and continuous; their worn shoulders
  // provide a clear, tile-aligned terrain transition without affecting driving.
  function addIronwoodRoads() {
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
  }

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

  function clearMapData() {
    solids.length = 0;
    scenery.length = 0;
    groundPads.length = 0;
    decals.length = 0;
    roads.length = 0;
    terrain.fill(TERRAIN.grass);
    objectId = 0;
    miniStatic = null;
    navField = null;
  }

  function loadLevel(index) {
    const safeIndex = clamp(index, 0, LEVELS.length - 1);
    const level = LEVELS[safeIndex];
    currentLevelIndex = safeIndex;
    currentTheme = level.theme;
    clearMapData();
    playerSpawn = { ...level.playerSpawn };
    enemySpawns = level.spawns.map((spawn) => ({ ...spawn }));
    level.map();
    initializeTerrain();

    player.x = playerSpawn.x;
    player.y = playerSpawn.y;
    player.vx = 0;
    player.vy = 0;
    player.heading = Math.PI / 2;
    player.turretHeading = Math.PI / 2;
    applySelectedTankStats(true);
    centerCameraImmediately();
    miniStatic = null;
    return level;
  }

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

  // The campaign and later systems share one source of truth for every solid.
  // The spawn getters update as the active mission changes.
  window.BattlefieldMap = Object.freeze({
    world: WORLD,
    get playerSpawn() { return playerSpawn; },
    get enemySpawns() { return enemySpawns; },
    solids,
    isCircleBlocked,
    moveCircle,
    castSegment,
  });

  // ---------------------------------------------------------------------------
  // Campaign combat: player shells, ricochets, enemy patrols, and waves.
  // ---------------------------------------------------------------------------

  function getTank(id) {
    return TANKS.find((tank) => tank.id === id) || TANKS[0];
  }

  function getUpgrade(id) {
    return UPGRADES.find((upgrade) => upgrade.id === id);
  }

  function directionFromAngle(angle) {
    return { x: Math.sin(angle), y: -Math.cos(angle) };
  }

  function angleTo(fromX, fromY, toX, toY) {
    return Math.atan2(toX - fromX, -(toY - fromY));
  }

  function easeAngle(current, target, speed, delta) {
    const difference = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return current + difference * Math.min(1, speed * delta);
  }

  function applySelectedTankStats(fullRepair = false) {
    const tank = getTank(profile.selectedTank);
    if (!profile.owned.includes(tank.id)) profile.selectedTank = "panther";
    const selected = getTank(profile.selectedTank);
    const oldMax = player.maxHealth || selected.health;
    player.tankId = selected.id;
    player.speed = selected.speed;
    player.armor = selected.armor + profile.upgrades.armor;
    player.damage = selected.damage;
    player.maxHealth = selected.health + profile.upgrades.hull * 24;
    player.radius = selected.id === "tiger" ? 45 : 42;
    player.health = fullRepair
      ? player.maxHealth
      : clamp(player.health + (player.maxHealth - oldMax), 1, player.maxHealth);
  }

  function addParticle(x, y, options = {}) {
    const reduced = profile.settings.reducedEffects;
    if (reduced && particles.length > 38) return;
    particles.push({
      x,
      y,
      vx: options.vx || 0,
      vy: options.vy || 0,
      life: options.life || 0.35,
      maxLife: options.life || 0.35,
      size: options.size || 3,
      color: options.color || "#f1d38a",
      drag: options.drag ?? 0.9,
    });
  }

  function burst(x, y, palette, count = 10, power = 100) {
    const actualCount = profile.settings.reducedEffects ? Math.max(3, Math.floor(count / 2)) : count;
    for (let index = 0; index < actualCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = power * (0.3 + Math.random() * 0.7);
      addParticle(x, y, {
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.25 + Math.random() * 0.35,
        size: 2 + Math.floor(Math.random() * 3),
        color: palette[index % palette.length],
        drag: 0.88,
      });
    }
  }

  function addFloatingText(x, y, text, color = "#f4d48a") {
    floatingTexts.push({ x, y, text, color, life: 0.78, maxLife: 0.78, vy: -26 });
  }

  function spawnBullet(options) {
    bullets.push({
      x: options.x,
      y: options.y,
      vx: options.vx,
      vy: options.vy,
      radius: options.radius || 4,
      damage: options.damage,
      team: options.team,
      bounces: options.bounces || 0,
      life: options.life || 1.7,
      color: options.color,
      trail: options.trail,
    });
  }

  function firePlayerVolley() {
    const count = profile.upgrades.volley;
    const spreads = {
      1: [0],
      2: [-0.048, 0.048],
      3: [-0.09, 0, 0.09],
      4: [-0.13, -0.043, 0.043, 0.13],
    }[count] || [0];
    const forward = directionFromAngle(player.turretHeading);
    const cross = { x: Math.cos(player.turretHeading), y: Math.sin(player.turretHeading) };

    spreads.forEach((spread, index) => {
      const angle = player.turretHeading + spread;
      const direction = directionFromAngle(angle);
      const lateral = (index - (spreads.length - 1) / 2) * 5;
      spawnBullet({
        x: player.x + forward.x * 49 + cross.x * lateral,
        y: player.y + forward.y * 49 + cross.y * lateral,
        vx: direction.x * 730,
        vy: direction.y * 730,
        damage: player.damage,
        team: "player",
        bounces: profile.upgrades.bounce,
        color: "#d8f3a3",
        trail: "#91d9c2",
      });
    });

    player.nextFireAt = elapsed + 0.39;
    burst(player.x + forward.x * 45, player.y + forward.y * 45, ["#fff4bc", "#ffd47c", "#df913f"], 7, 85);
    if (profile.settings.screenShake) screenShake = Math.max(screenShake, 1.4);
  }

  function tryPlayerFire() {
    const holdingFire = pointer.down || input.has("Space");
    if (!holdingFire || elapsed < player.nextFireAt) return;
    if (!profile.settings.autoFire && !pointer.justPressed && !input.has("Space")) return;
    firePlayerVolley();
    pointer.justPressed = false;
  }

  function segmentCircleIntersection(start, end, body, extraRadius = 0) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 0.000001) return null;
    const t = clamp(((body.x - start.x) * dx + (body.y - start.y) * dy) / lengthSq, 0, 1);
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    const radius = body.radius + extraRadius;
    const distanceSq = (body.x - x) ** 2 + (body.y - y) ** 2;
    if (distanceSq > radius * radius) return null;
    return { t, x, y };
  }

  function awardCredits(amount, x = player.x, y = player.y) {
    profile.coins += amount;
    game.earnedCredits += amount;
    saveProfile();
    addFloatingText(x, y - 24, `+${amount} ◆`, "#f3cf80");
    refreshInterface();
  }

  function damagePlayer(amount, impactX, impactY) {
    if (elapsed < player.invulnerableUntil || game.state !== "playing") return;
    const actualDamage = Math.max(1, Math.round(amount - player.armor * 1.65));
    player.health = Math.max(0, player.health - actualDamage);
    player.invulnerableUntil = elapsed + 0.16;
    burst(impactX, impactY, ["#f3d68a", "#d98259", "#734137"], 10, 105);
    addFloatingText(player.x, player.y - 48, `-${actualDamage}`, "#f19d76");
    if (profile.settings.screenShake) screenShake = Math.max(screenShake, 4.6);
    refreshHud();
    if (player.health <= 0) finishMission(false);
  }

  function destroyEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    game.killed += 1;
    burst(enemy.x, enemy.y, ["#fff0a9", "#efae55", "#c96042", "#4d3931"], 20, 175);
    awardCredits(enemy.reward, enemy.x, enemy.y);
    if (profile.settings.screenShake) screenShake = Math.max(screenShake, enemy.type === "heavy" ? 6.5 : 3.2);
  }

  function damageEnemy(enemy, amount, impactX, impactY) {
    if (enemy.dead) return;
    const actualDamage = Math.max(1, Math.round(amount - enemy.armor * 1.15));
    enemy.health -= actualDamage;
    burst(impactX, impactY, ["#f2d487", "#d77f52", "#655042"], 7, 78);
    addFloatingText(enemy.x, enemy.y - 43, `-${actualDamage}`, "#f4ce8b");
    if (enemy.health <= 0) destroyEnemy(enemy);
  }

  function updateBullets(delta) {
    for (let index = bullets.length - 1; index >= 0; index -= 1) {
      const bullet = bullets[index];
      bullet.life -= delta;
      if (bullet.life <= 0) {
        bullets.splice(index, 1);
        continue;
      }

      const start = { x: bullet.x, y: bullet.y };
      const end = { x: bullet.x + bullet.vx * delta, y: bullet.y + bullet.vy * delta };
      const wallHit = castSegment(start, end, bullet.radius);
      let targetHit = null;
      let target = null;

      if (bullet.team === "player") {
        for (const enemy of enemies) {
          if (enemy.dead) continue;
          const hit = segmentCircleIntersection(start, end, enemy, bullet.radius);
          if (hit && (!targetHit || hit.t < targetHit.t)) {
            targetHit = hit;
            target = enemy;
          }
        }
      } else {
        targetHit = segmentCircleIntersection(start, end, player, bullet.radius);
        target = player;
      }

      if (targetHit && (!wallHit || targetHit.t <= wallHit.t)) {
        if (bullet.team === "player") damageEnemy(target, bullet.damage, targetHit.x, targetHit.y);
        else damagePlayer(bullet.damage, targetHit.x, targetHit.y);
        bullets.splice(index, 1);
        continue;
      }

      if (wallHit) {
        burst(wallHit.x, wallHit.y, ["#d8d6b8", "#abae9d", "#eab85f"], 5, 56);
        if (bullet.bounces > 0 && (wallHit.normal.x !== 0 || wallHit.normal.y !== 0)) {
          const dot = bullet.vx * wallHit.normal.x + bullet.vy * wallHit.normal.y;
          bullet.vx -= 2 * dot * wallHit.normal.x;
          bullet.vy -= 2 * dot * wallHit.normal.y;
          bullet.x = wallHit.x + wallHit.normal.x * (bullet.radius + 1.5);
          bullet.y = wallHit.y + wallHit.normal.y * (bullet.radius + 1.5);
          bullet.bounces -= 1;
          bullet.damage = Math.max(1, Math.round(bullet.damage * 0.9));
          addFloatingText(wallHit.x, wallHit.y - 9, "RICOCHET", "#a7dbea");
          if (profile.settings.screenShake) screenShake = Math.max(screenShake, 1.3);
        } else {
          bullets.splice(index, 1);
        }
        continue;
      }

      bullet.x = end.x;
      bullet.y = end.y;
    }
  }

  function createNavigationTopology() {
    const step = 64;
    const origin = 96;
    const columns = Math.floor((WORLD.width - origin * 2) / step) + 1;
    const rows = Math.floor((WORLD.height - origin * 2) / step) + 1;
    const free = new Uint8Array(columns * rows);
    for (let gy = 0; gy < rows; gy += 1) {
      for (let gx = 0; gx < columns; gx += 1) {
        const x = origin + gx * step;
        const y = origin + gy * step;
        free[gy * columns + gx] = isCircleBlocked(x, y, 41) ? 0 : 1;
      }
    }
    return { step, origin, columns, rows, free, distances: new Int16Array(columns * rows) };
  }

  function findNearestNavigationCell(field, x, y) {
    const initialX = clamp(Math.round((x - field.origin) / field.step), 0, field.columns - 1);
    const initialY = clamp(Math.round((y - field.origin) / field.step), 0, field.rows - 1);
    for (let ring = 0; ring < 6; ring += 1) {
      for (let gy = Math.max(0, initialY - ring); gy <= Math.min(field.rows - 1, initialY + ring); gy += 1) {
        for (let gx = Math.max(0, initialX - ring); gx <= Math.min(field.columns - 1, initialX + ring); gx += 1) {
          const index = gy * field.columns + gx;
          if (field.free[index]) return { gx, gy, index };
        }
      }
    }
    return null;
  }

  function rebuildNavigationField() {
    if (!navField) navField = createNavigationTopology();
    const field = navField;
    field.distances.fill(-1);
    const start = findNearestNavigationCell(field, player.x, player.y);
    if (!start) return;
    const queue = [start];
    field.distances[start.index] = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const currentDistance = field.distances[current.index];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const gx = current.gx + dx;
        const gy = current.gy + dy;
        if (gx < 0 || gy < 0 || gx >= field.columns || gy >= field.rows) continue;
        const index = gy * field.columns + gx;
        if (!field.free[index] || field.distances[index] !== -1) continue;
        field.distances[index] = currentDistance + 1;
        queue.push({ gx, gy, index });
      }
    }
  }

  function navigationWaypoint(body) {
    if (!navField) return null;
    const field = navField;
    const cell = findNearestNavigationCell(field, body.x, body.y);
    if (!cell) return null;
    let best = cell;
    let bestDistance = field.distances[cell.index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cell.gx + dx;
      const gy = cell.gy + dy;
      if (gx < 0 || gy < 0 || gx >= field.columns || gy >= field.rows) continue;
      const index = gy * field.columns + gx;
      const distance = field.distances[index];
      if (distance >= 0 && (bestDistance < 0 || distance < bestDistance)) {
        best = { gx, gy, index };
        bestDistance = distance;
      }
    }
    if (best.index === cell.index || bestDistance < 0) return null;
    return {
      x: field.origin + best.gx * field.step,
      y: field.origin + best.gy * field.step,
    };
  }

  function spawnEnemy(typeId) {
    const spec = ENEMY_TYPES[typeId];
    if (!spec || enemySpawns.length === 0) return;
    const spawn = enemySpawns[(game.killed + enemies.length * 2 + Math.floor(elapsed * 10)) % enemySpawns.length];
    const offsets = [[0, 0], [56, 0], [-56, 0], [0, 56], [0, -56], [52, 52], [-52, 52]];
    let position = { x: spawn.x, y: spawn.y };
    for (const [offsetX, offsetY] of offsets) {
      const candidate = { x: spawn.x + offsetX, y: spawn.y + offsetY };
      if (!isCircleBlocked(candidate.x, candidate.y, 39)) {
        position = candidate;
        break;
      }
    }
    const heading = angleTo(position.x, position.y, player.x, player.y);
    enemies.push({
      id: `hostile-${Math.floor(elapsed * 1000)}-${enemies.length}`,
      type: typeId,
      tankId: spec.tankId,
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      heading,
      turretHeading: heading,
      radius: typeId === "heavy" ? 45 : 40,
      health: spec.health,
      maxHealth: spec.health,
      speed: spec.speed,
      armor: spec.armor,
      damage: spec.damage,
      fireRate: spec.fireRate,
      range: spec.range,
      reward: spec.reward,
      color: spec.color,
      nextFireAt: elapsed + 1 + Math.random() * 1.2,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      dead: false,
    });
    burst(position.x, position.y, ["#e7aa60", "#80533b", "#3e463b"], 8, 85);
  }

  function fireEnemyShell(enemy) {
    const direction = directionFromAngle(enemy.turretHeading);
    spawnBullet({
      x: enemy.x + direction.x * 47,
      y: enemy.y + direction.y * 47,
      vx: direction.x * 520,
      vy: direction.y * 520,
      damage: enemy.damage,
      team: "enemy",
      bounces: 0,
      color: "#efad64",
      trail: "#d66d4b",
      life: 1.85,
    });
    enemy.nextFireAt = elapsed + 1 / enemy.fireRate + Math.random() * 0.18;
    burst(enemy.x + direction.x * 42, enemy.y + direction.y * 42, ["#ffe5a0", "#df8747"], 4, 58);
  }

  function updateEnemies(delta) {
    if (elapsed >= game.nextFlowRefresh) {
      rebuildNavigationField();
      game.nextFlowRefresh = elapsed + 0.72;
    }

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const targetAngle = angleTo(enemy.x, enemy.y, player.x, player.y);
      enemy.turretHeading = easeAngle(enemy.turretHeading, targetAngle, 4.5, delta);
      const wallInSight = castSegment({ x: enemy.x, y: enemy.y }, { x: player.x, y: player.y }, 5);
      const canSeePlayer = !wallInSight;

      let steerX = 0;
      let steerY = 0;
      if (canSeePlayer && distance < enemy.range * 0.86) {
        // Enemies orbit gently at effective range instead of ramming the tank.
        const toward = distance < 255 ? -0.34 : 0.13;
        steerX = (dx / distance) * toward + (-dy / distance) * 0.62 * enemy.strafeSign;
        steerY = (dy / distance) * toward + (dx / distance) * 0.62 * enemy.strafeSign;
      } else {
        const waypoint = navigationWaypoint(enemy);
        const targetX = waypoint ? waypoint.x : player.x;
        const targetY = waypoint ? waypoint.y : player.y;
        const routeX = targetX - enemy.x;
        const routeY = targetY - enemy.y;
        const routeLength = Math.hypot(routeX, routeY) || 1;
        steerX = routeX / routeLength;
        steerY = routeY / routeLength;
      }

      const steerLength = Math.hypot(steerX, steerY) || 1;
      steerX /= steerLength;
      steerY /= steerLength;
      const desiredHeading = Math.atan2(steerX, -steerY);
      enemy.heading = easeAngle(enemy.heading, desiredHeading, 3.8, delta);
      const beforeX = enemy.x;
      const beforeY = enemy.y;
      moveCircle(enemy, steerX * enemy.speed * delta, steerY * enemy.speed * delta);
      if (Math.hypot(enemy.x - beforeX, enemy.y - beforeY) < 1.2) enemy.strafeSign *= -1;

      if (canSeePlayer && distance <= enemy.range && elapsed >= enemy.nextFireAt) fireEnemyShell(enemy);
    }

    resolveTankCrowding();
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      if (enemies[index].dead) enemies.splice(index, 1);
    }
  }

  function resolveTankCrowding() {
    const units = [player, ...enemies.filter((enemy) => !enemy.dead)];
    for (let i = 0; i < units.length; i += 1) {
      for (let j = i + 1; j < units.length; j += 1) {
        const first = units[i];
        const second = units[j];
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);
        const minimum = first.radius + second.radius - 4;
        if (distance >= minimum) continue;
        if (distance < 0.001) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const push = (minimum - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        first.x -= nx * push;
        first.y -= ny * push;
        second.x += nx * push;
        second.y += ny * push;
      }
    }
    units.forEach((unit) => moveCircle(unit, 0, 0));
  }

  function queueWave(index) {
    if (!game.level) return;
    const wave = game.level.waves[index];
    game.spawnQueue = [];
    wave.forEach((group) => {
      for (let count = 0; count < group.count; count += 1) game.spawnQueue.push(group.type);
    });
    // Alternate the group order to distribute types and spawns across the map.
    game.spawnQueue.sort(() => Math.random() - 0.5);
    game.spawnTimer = 0.65;
    game.waveIndex = index;
    showToast(`WAVE ${index + 1} DEPLOYING — HOLD THE RANGE`, "⚑");
    refreshHud();
  }

  function finishMission(victory) {
    if (game.state !== "playing" || game.completed) return;
    game.completed = true;
    bullets.length = 0;
    const level = game.level;
    let award = game.earnedCredits;
    if (victory) {
      award += level.reward;
      profile.coins += level.reward;
      if (!profile.completed.includes(level.id)) profile.completed.push(level.id);
      profile.unlockedLevel = Math.max(profile.unlockedLevel, Math.min(LEVELS.length, currentLevelIndex + 2));
      saveProfile();
      showResult({
        victory: true,
        title: "MISSION SECURED",
        copy: `${level.title} is clear. The next operation has been added to the command board.`,
        credits: award,
      });
    } else {
      saveProfile();
      showResult({
        victory: false,
        title: "TANK DISABLED",
        copy: "Your crew pulled clear. Spend credits in the bay, then return to the operation.",
        credits: award,
      });
    }
  }

  function updateMission(delta) {
    if (!game.level || game.completed) return;
    if (game.waveDelay > 0) {
      game.waveDelay -= delta;
      if (game.waveDelay <= 0) queueWave(game.waveIndex);
      return;
    }

    if (game.spawnQueue.length > 0) {
      game.spawnTimer -= delta;
      if (game.spawnTimer <= 0) {
        spawnEnemy(game.spawnQueue.shift());
        game.spawnTimer = 0.62;
      }
      return;
    }

    if (enemies.length === 0) {
      const lastWave = game.level.waves.length - 1;
      if (game.waveIndex >= lastWave) {
        finishMission(true);
      } else {
        const fieldRepair = Math.max(12, Math.round(player.maxHealth * 0.16));
        player.health = Math.min(player.maxHealth, player.health + fieldRepair);
        addFloatingText(player.x, player.y - 56, `FIELD PATCH +${fieldRepair}`, "#b9e681");
        game.waveIndex += 1;
        game.waveDelay = 2.35;
        showToast(`RANGE CLEAR — FIELD PATCH APPLIED · WAVE ${game.waveIndex + 1} INBOUND`, "⌁");
        refreshHud();
      }
    }
  }

  function updateParticles(delta) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= delta;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.pow(particle.drag, delta * 60);
      particle.vy *= Math.pow(particle.drag, delta * 60);
    }
    for (let index = floatingTexts.length - 1; index >= 0; index -= 1) {
      const text = floatingTexts[index];
      text.life -= delta;
      if (text.life <= 0) {
        floatingTexts.splice(index, 1);
        continue;
      }
      text.y += text.vy * delta;
    }
  }

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

    // Level palettes reuse the same authored tiles but shift their battlefield
    // character: dusty orange depot soil and cool fortified-citadel ground.
    if (currentTheme === "cinder") {
      ctx.fillStyle = "rgba(185, 91, 39, 0.18)";
      ctx.fillRect(camera.x - TILE, camera.y - TILE, viewWidth() + TILE * 2, viewHeight() + TILE * 2);
    } else if (currentTheme === "citadel") {
      ctx.fillStyle = "rgba(50, 91, 101, 0.16)";
      ctx.fillRect(camera.x - TILE, camera.y - TILE, viewWidth() + TILE * 2, viewHeight() + TILE * 2);
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

  function drawFallbackTank(unit, team) {
    const base = team === "player" ? "#73865d" : "#916052";
    const light = team === "player" ? "#aab77d" : "#c98968";
    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.heading);
    ctx.fillStyle = "rgba(25, 30, 26, 0.52)";
    ctx.fillRect(-22, -29, 44, 67);
    ctx.fillStyle = "#29362e";
    ctx.fillRect(-23, -20, 7, 42);
    ctx.fillRect(16, -20, 7, 42);
    ctx.fillStyle = base;
    ctx.fillRect(-19, -34, 38, 62);
    ctx.fillStyle = light;
    ctx.fillRect(-12, -28, 24, 47);
    ctx.restore();

    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.turretHeading);
    ctx.fillStyle = "#29362e";
    ctx.fillRect(-4, -42, 8, 35);
    fillPixelCircle(ctx, 0, 2, 15, light);
    ctx.restore();
  }

  function drawUnitHealth(unit, team) {
    if (team !== "enemy" || unit.dead) return;
    const ratio = clamp(unit.health / unit.maxHealth, 0, 1);
    const width = unit.type === "heavy" ? 42 : 34;
    const y = unit.y - unit.radius - 18;
    ctx.fillStyle = "rgba(20, 28, 23, 0.77)";
    ctx.fillRect(unit.x - width / 2 - 1, y - 1, width + 2, 5);
    ctx.fillStyle = "#713e39";
    ctx.fillRect(unit.x - width / 2, y, width, 3);
    ctx.fillStyle = unit.type === "heavy" ? "#e0a654" : "#d9755b";
    ctx.fillRect(unit.x - width / 2, y, width * ratio, 3);
  }

  function drawTankUnit(unit, team) {
    const isPlayer = team === "player";
    const shadowScale = unit.type === "heavy" || unit.tankId === "tiger" ? 35 : 30;
    ctx.save();
    ctx.translate(unit.x, unit.y + 16);
    ctx.fillStyle = "rgba(17, 24, 19, 0.46)";
    ctx.beginPath();
    ctx.ellipse(0, 0, shadowScale, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const art = tankArt[unit.tankId] || tankArt.panther;
    const drawSize = unit.type === "heavy" || unit.tankId === "tiger" ? 192 : 175;
    const loaded = art && art.hull.ready && art.turret.ready;
    const flashing = isPlayer && elapsed < player.invulnerableUntil && Math.floor(elapsed * 18) % 2 === 0;
    if (loaded && !flashing) {
      ctx.save();
      ctx.translate(Math.round(unit.x), Math.round(unit.y));
      ctx.rotate(unit.heading);
      ctx.drawImage(art.hull.image, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx.restore();
      ctx.save();
      ctx.translate(Math.round(unit.x), Math.round(unit.y));
      ctx.rotate(unit.turretHeading);
      ctx.drawImage(art.turret.image, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx.restore();
    } else {
      drawFallbackTank(unit, team);
    }

    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(unit.heading);
    if (isPlayer) {
      ctx.fillStyle = "#6bc9dc";
      ctx.fillRect(-3, 22, 6, 7);
    } else {
      ctx.fillStyle = unit.color || "#d77c5c";
      ctx.fillRect(-3, 22, 6, 7);
    }
    ctx.restore();
    drawUnitHealth(unit, team);
  }

  function drawTank() {
    drawTankUnit(player, "player");
  }

  function drawProjectile(bullet) {
    if (!isVisible(bullet.x - 8, bullet.y - 8, 16, 16, 8)) return;
    const length = Math.hypot(bullet.vx, bullet.vy) || 1;
    const tx = bullet.x - (bullet.vx / length) * 12;
    const ty = bullet.y - (bullet.vy / length) * 12;
    ctx.strokeStyle = bullet.trail || bullet.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff3be";
    ctx.fillRect(Math.round(bullet.x - 2), Math.round(bullet.y - 2), 5, 5);
    ctx.fillStyle = bullet.color;
    ctx.fillRect(Math.round(bullet.x - 1), Math.round(bullet.y - 1), 3, 3);
  }

  function drawCombatParticle(particle) {
    if (!isVisible(particle.x - 8, particle.y - 8, 16, 16, 8)) return;
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
    ctx.globalAlpha = 1;
  }

  function drawFloatingText(text) {
    if (!isVisible(text.x - 60, text.y - 16, 120, 32, 8)) return;
    ctx.save();
    ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
    ctx.fillStyle = "rgba(20, 27, 22, 0.85)";
    ctx.font = "700 10px monospace";
    ctx.fillText(text.text, Math.round(text.x) + 1, Math.round(text.y) + 1);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, Math.round(text.x), Math.round(text.y));
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

    // Sorting by object feet gives tanks readable depth around buildings and cover.
    const renderQueue = [];
    for (const item of scenery) {
      if (isVisible(item.x, item.y, item.width, item.height)) renderQueue.push({ kind: "scenery", item, sortY: item.y + item.height });
    }
    renderQueue.push({ kind: "player", item: player, sortY: player.y + 36 });
    for (const enemy of enemies) {
      if (!enemy.dead && isVisible(enemy.x - 64, enemy.y - 64, 128, 128)) renderQueue.push({ kind: "enemy", item: enemy, sortY: enemy.y + 36 });
    }
    renderQueue.sort((a, b) => a.sortY - b.sortY);
    for (const entry of renderQueue) {
      if (entry.kind === "scenery") drawObject(entry.item);
      else if (entry.kind === "player") drawTankUnit(entry.item, "player");
      else drawTankUnit(entry.item, "enemy");
    }

    bullets.forEach(drawProjectile);
    particles.forEach(drawCombatParticle);
    floatingTexts.forEach(drawFloatingText);
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

    tryPlayerFire();
  }

  function drawMiniStatic() {
    miniStatic = makeCanvas(minimap.width, minimap.height);
    const c = miniStatic.getContext("2d");
    const sx = minimap.width / WORLD.width;
    const sy = minimap.height / WORLD.height;
    c.fillStyle = currentTheme === "cinder" ? "#806942" : currentTheme === "citadel" ? "#59726e" : "#5c7d42";
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
    enemies.forEach((enemy) => {
      if (enemy.dead) return;
      miniCtx.fillStyle = enemy.type === "heavy" ? "#f0a052" : "#df6e58";
      miniCtx.fillRect(enemy.x * sx - 1, enemy.y * sy - 1, 3, 3);
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
    const sector = `SECTOR ${sectorX}-${sectorY}`;
    sectorLabel.textContent = sector;
    if (ui.hudSector) ui.hudSector.textContent = sector;
  }

  // ---------------------------------------------------------------------------
  // Command UI, tank store, upgrades, campaign profile, and settings.
  // ---------------------------------------------------------------------------

  let toastTimer = 0;

  function showToast(message, icon = "✓") {
    if (!toast) return;
    toast.innerHTML = `<span class="toast__badge">${icon}</span><span>${message}</span>`;
    toast.classList.remove("is-hidden");
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.classList.add("is-hidden");
    }, 2800);
  }

  function statLine(label, value, max, suffix = "") {
    const percent = clamp((value / max) * 100, 8, 100);
    return `<div class="stat-line"><span>${label}</span><i><b style="width:${percent}%"></b></i><strong>${value}${suffix}</strong></div>`;
  }

  function tankStatMarkup(tank, includeUpgrades = false) {
    const health = tank.health + (includeUpgrades ? profile.upgrades.hull * 24 : 0);
    const armor = tank.armor + (includeUpgrades ? profile.upgrades.armor : 0);
    return [
      statLine("HULL", health, 300),
      statLine("SPEED", tank.speed, 285),
      statLine("ARMOR", armor, 7),
      statLine("CANNON", tank.damage, 31),
    ].join("");
  }

  function updateCreditDisplays() {
    currencyNodes.forEach((node) => { node.textContent = profile.coins; });
    if (ui.hudCoins) ui.hudCoins.textContent = profile.coins;
    const equipped = getTank(profile.selectedTank).name;
    equippedNameNodes.forEach((node) => { node.textContent = equipped; });
    if (ui.campaignProgress) ui.campaignProgress.textContent = `${String(Math.min(profile.unlockedLevel, LEVELS.length)).padStart(2, "0")} / ${String(LEVELS.length).padStart(2, "0")}`;
  }

  function renderMissionList() {
    if (!ui.missionList) return;
    ui.missionList.innerHTML = LEVELS.map((level, index) => {
      const unlocked = profile.unlockedLevel >= index + 1;
      const complete = profile.completed.includes(level.id);
      const hostileCount = level.waves.reduce((total, wave) => total + wave.reduce((sum, group) => sum + group.count, 0), 0);
      return `
        <article class="mission-card ${unlocked ? "" : "is-locked"}" data-theme="${level.theme}">
          <div class="mission-card__map"></div>
          <div class="mission-card__body">
            <span class="mission-card__number">OPERATION ${level.number} ${complete ? "// SECURED" : ""}</span>
            <h3>${level.title}</h3>
            <p>${unlocked ? level.description : "Complete the preceding operation to receive this deployment clearance."}</p>
            <div class="mission-meta"><span>${level.waves.length} WAVES · ${hostileCount} HOSTILES</span><b>◆ ${level.reward}</b></div>
            <button class="mission-launch" data-launch-level="${index}" type="button" ${unlocked ? "" : "disabled"}>${unlocked ? complete ? "REDEPLOY" : "BEGIN OPERATION" : "CLEARANCE LOCKED"}</button>
          </div>
        </article>`;
    }).join("");
    ui.missionList.querySelectorAll("[data-launch-level]").forEach((button) => {
      button.addEventListener("click", () => startMission(Number(button.dataset.launchLevel)));
    });
  }

  function renderTankBay() {
    const equipped = getTank(profile.selectedTank);
    if (ui.equippedDescription) ui.equippedDescription.textContent = equipped.description;
    if (ui.equippedStats) ui.equippedStats.innerHTML = tankStatMarkup(equipped, true);
    if (!ui.tankList) return;

    ui.tankList.innerHTML = TANKS.map((tank) => {
      const owned = profile.owned.includes(tank.id);
      const selected = tank.id === profile.selectedTank;
      let action = "";
      if (selected) action = "EQUIPPED";
      else if (owned) action = "EQUIP TANK";
      else if (profile.coins >= tank.price) action = `BUY · ◆ ${tank.price}`;
      else action = `NEED ◆ ${tank.price}`;
      const dataAttribute = owned ? `data-equip-tank="${tank.id}"` : `data-buy-tank="${tank.id}"`;
      const disabled = selected || (!owned && profile.coins < tank.price) ? "disabled" : "";
      return `
        <article class="tank-card ${selected ? "is-equipped" : ""} ${owned ? "" : "is-locked"}">
          <div class="tank-card__silhouette" style="background-image:url('${encodeURI(tank.hull)}')"></div>
          <span class="tank-card__type">${tank.className}</span>
          <h3>${tank.name}</h3>
          <p>${tank.description}</p>
          <div class="stat-list">${tankStatMarkup(tank)}</div>
          <button class="tank-card__action" ${dataAttribute} type="button" ${disabled}>${action}</button>
        </article>`;
    }).join("");

    ui.tankList.querySelectorAll("[data-buy-tank]").forEach((button) => {
      button.addEventListener("click", () => buyTank(button.dataset.buyTank));
    });
    ui.tankList.querySelectorAll("[data-equip-tank]").forEach((button) => {
      button.addEventListener("click", () => equipTank(button.dataset.equipTank));
    });
  }

  function renderUpgrades() {
    if (!ui.upgradeList) return;
    ui.upgradeList.innerHTML = UPGRADES.map((upgrade) => {
      const level = profile.upgrades[upgrade.id];
      const isMax = level >= upgrade.levels;
      const cost = upgrade.costs[level];
      const affordable = !isMax && profile.coins >= cost;
      const pips = Array.from({ length: upgrade.levels }, (_, index) => `<i class="${index < level ? "is-active" : ""}"></i>`).join("");
      let label = "MAX FITTED";
      if (!isMax) label = affordable ? `FIT · ◆ ${cost}` : `NEED ◆ ${cost}`;
      return `
        <article class="upgrade-card">
          <div class="upgrade-card__icon">${upgrade.icon}</div>
          <div class="upgrade-card__copy">
            <h3>${upgrade.title}</h3>
            <p>${upgrade.description}</p>
            <span class="upgrade-card__effect">ACTIVE: ${upgrade.effect(level)}</span>
            <div class="upgrade-level">${pips}</div>
          </div>
          <button class="upgrade-card__buy" data-buy-upgrade="${upgrade.id}" type="button" ${affordable ? "" : "disabled"}>${label}</button>
        </article>`;
    }).join("");
    ui.upgradeList.querySelectorAll("[data-buy-upgrade]").forEach((button) => {
      button.addEventListener("click", () => buyUpgrade(button.dataset.buyUpgrade));
    });
  }

  function renderSettings() {
    document.querySelectorAll("[data-setting]").forEach((button) => {
      const enabled = Boolean(profile.settings[button.dataset.setting]);
      button.classList.toggle("is-on", enabled);
      button.setAttribute("aria-pressed", String(enabled));
    });
  }

  function refreshHud() {
    const level = game.level || LEVELS[currentLevelIndex];
    if (!level) return;
    const healthRatio = player.maxHealth > 0 ? player.health / player.maxHealth : 0;
    if (ui.hudMission) ui.hudMission.textContent = `OPERATION // ${level.title}`;
    if (ui.hudObjective) ui.hudObjective.textContent = game.waveDelay > 0 ? "NEXT WAVE INBOUND" : "ELIMINATE HOSTILES";
    if (ui.hudTankName) ui.hudTankName.textContent = getTank(profile.selectedTank).name;
    if (ui.hudHealthText) ui.hudHealthText.textContent = `${Math.ceil(player.health)} / ${player.maxHealth}`;
    if (ui.hudHealthFill) {
      ui.hudHealthFill.style.width = `${clamp(healthRatio * 100, 0, 100)}%`;
      ui.hudHealthFill.classList.toggle("is-low", healthRatio < 0.32);
    }
    if (ui.hudArmorPips) {
      const pips = Array.from({ length: 7 }, (_, index) => `<i class="${index < player.armor ? "is-active" : ""}"></i>`).join("");
      if (ui.hudArmorPips.dataset.value !== pips) {
        ui.hudArmorPips.dataset.value = pips;
        ui.hudArmorPips.innerHTML = pips;
      }
    }
    if (ui.hudWave) ui.hudWave.textContent = `WAVE ${Math.max(1, game.waveIndex + 1)} / ${level.waves.length}`;
    if (ui.hudEnemies) {
      const count = enemies.filter((enemy) => !enemy.dead).length + game.spawnQueue.length;
      ui.hudEnemies.textContent = `${count} HOSTILE${count === 1 ? "" : "S"} REMAIN`;
    }
    updateCreditDisplays();
  }

  function refreshInterface() {
    updateCreditDisplays();
    refreshHud();
    if (game.menuScreen === "missions") renderMissionList();
    if (game.menuScreen === "hangar") renderTankBay();
    if (game.menuScreen === "upgrades") renderUpgrades();
    if (game.menuScreen === "settings") renderSettings();
  }

  function buyTank(id) {
    const tank = getTank(id);
    if (profile.owned.includes(tank.id)) return equipTank(tank.id);
    if (profile.coins < tank.price) {
      showToast(`NOT ENOUGH CREDITS FOR ${tank.name}`, "!");
      return;
    }
    profile.coins -= tank.price;
    profile.owned.push(tank.id);
    profile.selectedTank = tank.id;
    applySelectedTankStats(true);
    saveProfile();
    renderTankBay();
    refreshInterface();
    showToast(`${tank.name} PURCHASED AND EQUIPPED`, "◆");
  }

  function equipTank(id) {
    if (!profile.owned.includes(id)) return;
    profile.selectedTank = id;
    applySelectedTankStats(true);
    saveProfile();
    renderTankBay();
    refreshInterface();
    showToast(`${getTank(id).name} EQUIPPED`, "✓");
  }

  function buyUpgrade(id) {
    const upgrade = getUpgrade(id);
    if (!upgrade) return;
    const current = profile.upgrades[id];
    if (current >= upgrade.levels) return;
    const cost = upgrade.costs[current];
    if (profile.coins < cost) {
      showToast("NOT ENOUGH FIELD CREDITS", "!");
      return;
    }
    profile.coins -= cost;
    profile.upgrades[id] += 1;
    applySelectedTankStats(game.state !== "playing");
    saveProfile();
    renderUpgrades();
    refreshInterface();
    showToast(`${upgrade.title} TIER ${profile.upgrades[id]} FITTED`, "↑");
  }

  function openScreen(name) {
    game.menuScreen = name;
    game.state = "menu";
    screens.forEach((screen) => screen.classList.toggle("is-hidden", screen.dataset.screen !== name));
    if (ui.menuLayer) ui.menuLayer.classList.remove("is-hidden");
    if (ui.hud) ui.hud.classList.add("is-hidden");
    if (ui.combatHelp) ui.combatHelp.classList.add("is-hidden");
    input.clear();
    pointer.down = false;
    if (name === "missions") renderMissionList();
    if (name === "hangar") renderTankBay();
    if (name === "upgrades") renderUpgrades();
    if (name === "settings") renderSettings();
    updateCreditDisplays();
  }

  function startMission(index) {
    if (profile.unlockedLevel < index + 1) {
      showToast("COMPLETE THE PRIOR OPERATION FIRST", "!");
      return;
    }
    enemies.length = 0;
    bullets.length = 0;
    particles.length = 0;
    floatingTexts.length = 0;
    const level = loadLevel(index);
    game.state = "playing";
    game.menuScreen = "";
    game.level = level;
    game.waveIndex = 0;
    game.waveDelay = 1.35;
    game.spawnQueue = [];
    game.spawnTimer = 0;
    game.killed = 0;
    game.earnedCredits = 0;
    game.completed = false;
    game.nextFlowRefresh = 0;
    game.lastResult = null;
    screenShake = 0;
    pointer.down = false;
    if (ui.menuLayer) ui.menuLayer.classList.add("is-hidden");
    if (ui.hud) ui.hud.classList.remove("is-hidden");
    if (ui.combatHelp) ui.combatHelp.classList.remove("is-hidden");
    screens.forEach((screen) => screen.classList.add("is-hidden"));
    refreshHud();
    showToast(`OPERATION ${level.number} STARTED — ELIMINATE ALL HOSTILES`, "⚑");
  }

  function returnToCommand() {
    enemies.length = 0;
    bullets.length = 0;
    particles.length = 0;
    floatingTexts.length = 0;
    loadLevel(currentLevelIndex);
    game.level = null;
    game.completed = false;
    openScreen("main");
    showToast("RETURNED TO COMMAND", "⌂");
  }

  function showResult(result) {
    game.state = "result";
    game.lastResult = result;
    if (ui.menuLayer) ui.menuLayer.classList.remove("is-hidden");
    if (ui.hud) ui.hud.classList.add("is-hidden");
    if (ui.combatHelp) ui.combatHelp.classList.add("is-hidden");
    screens.forEach((screen) => screen.classList.toggle("is-hidden", screen.dataset.screen !== "results"));
    if (ui.resultKicker) ui.resultKicker.textContent = result.victory ? "MISSION COMPLETE" : "CREW RECOVERY";
    if (ui.resultTitle) ui.resultTitle.textContent = result.title;
    if (ui.resultCopy) ui.resultCopy.textContent = result.copy;
    if (ui.resultCredits) ui.resultCredits.textContent = result.credits;
    if (ui.resultPrimary) {
      const hasNext = result.victory && currentLevelIndex < LEVELS.length - 1 && profile.unlockedLevel >= currentLevelIndex + 2;
      ui.resultPrimary.innerHTML = `<span class="command-button__key">${hasNext ? "→" : "⌂"}</span><span>${hasNext ? "NEXT OPERATION" : "COMMAND BOARD"}</span><b>→</b>`;
      ui.resultPrimary.onclick = () => hasNext ? startMission(currentLevelIndex + 1) : returnToCommand();
    }
    if (ui.resultSecondary) {
      ui.resultSecondary.innerHTML = `<span class="command-button__key">↻</span><span>RETRY MISSION</span><b>→</b>`;
      ui.resultSecondary.onclick = () => startMission(currentLevelIndex);
    }
    refreshInterface();
  }

  function toggleSetting(id) {
    profile.settings[id] = !profile.settings[id];
    saveProfile();
    renderSettings();
    showToast(`${id === "screenShake" ? "IMPACT SHAKE" : id === "reducedEffects" ? "REDUCED EFFECTS" : "HOLD TO FIRE"} ${profile.settings[id] ? "ON" : "OFF"}`, "⚙");
  }

  function resetCampaignProfile() {
    if (typeof window.confirm === "function" && !window.confirm("Reset credits, tanks, upgrades, and campaign progress?")) return;
    profile.coins = 240;
    profile.owned = ["panther"];
    profile.selectedTank = "panther";
    profile.unlockedLevel = 1;
    profile.completed = [];
    profile.upgrades = { volley: 1, bounce: 0, armor: 0, hull: 0 };
    profile.settings = { screenShake: true, reducedEffects: false, autoFire: true };
    applySelectedTankStats(true);
    saveProfile();
    renderSettings();
    refreshInterface();
    showToast("CAMPAIGN PROFILE RESET", "↺");
  }

  function bindInterface() {
    document.querySelectorAll("[data-open-screen]").forEach((button) => {
      button.addEventListener("click", () => openScreen(button.dataset.openScreen));
    });
    document.querySelectorAll("[data-setting]").forEach((button) => {
      button.addEventListener("click", () => toggleSetting(button.dataset.setting));
    });
    if (ui.pauseButton) ui.pauseButton.addEventListener("click", returnToCommand);
    if (ui.resetProfile) ui.resetProfile.addEventListener("click", resetCampaignProfile);
  }

  function update(delta) {
    updateParticles(delta);
    if (game.state === "playing") {
      updatePlayer(delta);
      updateBullets(delta);
      updateEnemies(delta);
      updateMission(delta);
      updateCamera(delta);
      updateMinimap();
      refreshHud();
    } else {
      updateCamera(delta);
      updateMinimap();
    }
    screenShake *= Math.pow(0.001, delta);
    if (screenShake < 0.08) screenShake = 0;
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = currentTheme === "cinder" ? "#7d7047" : currentTheme === "citadel" ? "#5d776d" : "#5d823f";
    ctx.fillRect(0, 0, camera.width, camera.height);
    if (game.state === "playing" && screenShake > 0 && profile.settings.screenShake) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
      drawWorld();
      ctx.restore();
    } else {
      drawWorld();
    }
    if (game.state === "playing") drawCursorReadout();
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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    if (event.code === "Escape") {
      if (game.state === "playing") returnToCommand();
      else if (game.state === "menu") openScreen("main");
      return;
    }
    input.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    input.delete(event.code);
  });

  window.addEventListener("blur", () => {
    input.clear();
    pointer.down = false;
  });

  canvas.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (game.state !== "playing") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    pointer.down = true;
    pointer.justPressed = true;
    event.preventDefault();
  });

  window.addEventListener("pointerup", () => {
    pointer.down = false;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.seen = false;
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", resize);

  resize();
  bindInterface();
  // A narrow test hook keeps the automated navigation/combat smoke test free of
  // browser-only UI dependencies; it is never created in normal play.
  if (window.__IRONCLAD_TEST__) {
    window.__IRONCLAD_TEST_API__ = {
      LEVELS, profile, game, enemies, bullets, loadLevel, startMission, updateMission,
      updateEnemies, updateBullets, applySelectedTankStats, buyTank, equipTank,
      buyUpgrade, toggleSetting, returnToCommand, player, firePlayerVolley,
    };
  }
  loadLevel(0);
  drawMiniStatic();
  updateMinimap();
  openScreen("main");
  refreshInterface();
  requestAnimationFrame(loop);

})();
