#!/usr/bin/env node
/*
 * Headless verification for the map-only prototype.
 * It boots game.js with a tiny canvas shim, then validates the exported shared
 * collision geometry rather than relying on a visual-only map inspection.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function noOp() {}

function createContext() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "measureText") return () => ({ width: 0 });
        if (property === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
        return noOp;
      },
      set() {
        return true;
      },
    }
  );
}

function createCanvas(width = 1280, height = 720) {
  const context = createContext();
  return {
    width,
    height,
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0 }),
    addEventListener: noOp,
  };
}

const mainCanvas = createCanvas();
const miniCanvas = createCanvas(220, 148);
function createElementShim() {
  return {
    textContent: "",
    innerHTML: "",
    dataset: {},
    style: {},
    classList: { add: noOp, remove: noOp, toggle: noOp },
    addEventListener: noOp,
    setAttribute: noOp,
    querySelectorAll: () => [],
  };
}

const statusLabel = createElementShim();
const toast = createElementShim();
const genericElements = new Map();

const documentShim = {
  querySelector(selector) {
    if (selector === "#game") return mainCanvas;
    if (selector === "#minimap") return miniCanvas;
    if (selector === "#sector-label") return statusLabel;
    if (selector === "#toast") return toast;
    if (!genericElements.has(selector)) genericElements.set(selector, createElementShim());
    return genericElements.get(selector);
  },
  querySelectorAll: () => [],
  createElement(tagName) {
    assert.equal(tagName, "canvas");
    return createCanvas(32, 32);
  },
};

class ImageShim {
  set src(value) {
    this._src = value;
  }
}

const windowShim = {
  devicePixelRatio: 1,
  __IRONCLAD_TEST__: true,
  addEventListener: noOp,
  setTimeout: noOp,
  clearTimeout: noOp,
};

let clock = 0;
let scheduledFrame = null;
const sandbox = {
  console,
  document: documentShim,
  window: windowShim,
  Image: ImageShim,
  performance: { now: () => clock },
  requestAnimationFrame: (callback) => { scheduledFrame = callback; },
  Math,
  Object,
  Array,
  Uint8Array,
  Uint8ClampedArray,
  Set,
};

const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
vm.runInNewContext(source, sandbox, { filename: "game.js" });

const map = windowShim.BattlefieldMap;
assert.ok(map, "game.js should expose collision geometry for future systems");
assert.equal(map.world.width, 3840);
assert.equal(map.world.height, 2560);
assert.equal(map.playerSpawn.label, "PLAYER START");
assert.equal(map.enemySpawns.length, 5, "five visually marked future deployment areas are expected");

const byKind = map.solids.reduce((counts, item) => {
  counts[item.kind] = (counts[item.kind] || 0) + 1;
  return counts;
}, {});
assert.ok(byKind.wall >= 18, "the arena needs many hard wall sections and corners");
assert.ok(byKind.crate >= 16, "cover should include crate groups");
assert.ok(byKind.rock >= 14, "cover should include rock groups");
assert.ok(byKind.bunker >= 5, "cover should include small military structures");
assert.ok(byKind.barricade >= 4, "cover should include barriers");
assert.ok(byKind.tree >= 3, "outer areas should include trees");

assert.equal(
  map.isCircleBlocked(map.playerSpawn.x, map.playerSpawn.y, 42),
  false,
  "the player spawn must be a clear, safe driving area"
);
for (const spawn of map.enemySpawns) {
  assert.equal(
    map.isCircleBlocked(spawn.x, spawn.y, 42),
    false,
    `${spawn.label} must remain clear for a future enemy tank`
  );
}

assert.equal(map.isCircleBlocked(32, 1280, 8), true, "west perimeter must block tanks");
assert.equal(map.isCircleBlocked(3808, 1280, 8), true, "east perimeter must block tanks");
assert.equal(map.isCircleBlocked(1920, 32, 8), true, "north perimeter must block tanks");
assert.equal(map.isCircleBlocked(1920, 2528, 8), true, "south perimeter must block tanks");

const wallHit = map.castSegment({ x: 180, y: 1280 }, { x: 20, y: 1280 });
assert.ok(wallHit && wallHit.solid.kind === "wall", "segment casts must find reusable solid walls");

// Each deliberate choke is wider than the real tank collision circle. These are
// the corners/routes that will later matter most for ricochet gameplay.
for (const passage of [
  { x: 1824, y: 656, label: "north service cut" },
  { x: 1624, y: 1568, label: "central screen breach" },
  { x: 2273, y: 2200, label: "south command passage" },
  { x: 3166, y: 1810, label: "southeast outpost passage" },
]) {
  assert.equal(
    map.isCircleBlocked(passage.x, passage.y, 42),
    false,
    `${passage.label} needs tank-comfortable clearance`
  );
}

// Breadth-first sample at a tank-safe 32 px cadence. This is deliberately more
// strict than a visual check: each sampled position uses the actual 42 px tank
// radius. It verifies all battlefield regions selected below are connected to
// the player start without forcing a route through a solid.
const tankRadius = 42;
const step = 32;
const origin = 80;
const columns = Math.floor((map.world.width - origin * 2) / step) + 1;
const rows = Math.floor((map.world.height - origin * 2) / step) + 1;
const isFree = new Uint8Array(columns * rows);
const key = (x, y) => y * columns + x;

for (let gy = 0; gy < rows; gy += 1) {
  for (let gx = 0; gx < columns; gx += 1) {
    const x = origin + gx * step;
    const y = origin + gy * step;
    isFree[key(gx, gy)] = map.isCircleBlocked(x, y, tankRadius) ? 0 : 1;
  }
}

function nearestFreeCell(point) {
  let best = null;
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < columns; gx += 1) {
      if (!isFree[key(gx, gy)]) continue;
      const x = origin + gx * step;
      const y = origin + gy * step;
      const distance = Math.hypot(x - point.x, y - point.y);
      if (!best || distance < best.distance) best = { gx, gy, distance, x, y };
    }
  }
  return best;
}

const start = nearestFreeCell(map.playerSpawn);
assert.ok(start && start.distance < 48, "a tank-safe sample should exist beside the player spawn");
const visited = new Uint8Array(columns * rows);
const queue = [start];
visited[key(start.gx, start.gy)] = 1;

for (let head = 0; head < queue.length; head += 1) {
  const current = queue[head];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nextX = current.gx + dx;
    const nextY = current.gy + dy;
    if (nextX < 0 || nextY < 0 || nextX >= columns || nextY >= rows) continue;
    const index = key(nextX, nextY);
    if (!isFree[index] || visited[index]) continue;
    visited[index] = 1;
    queue.push({ gx: nextX, gy: nextY });
  }
}

const destinations = [
  ...map.enemySpawns,
  { x: 1920, y: 1280, label: "central combat bowl" },
  { x: 1010, y: 1420, label: "west to center lane" },
  { x: 2750, y: 1450, label: "east to center lane" },
  { x: 1260, y: 2210, label: "southern loop" },
  { x: 620, y: 1450, label: "west lower approach" },
];

for (const destination of destinations) {
  const cell = nearestFreeCell(destination);
  assert.ok(cell.distance < 112, `${destination.label} needs a usable tank position nearby`);
  assert.equal(visited[key(cell.gx, cell.gy)], 1, `${destination.label} must be reachable from player spawn`);
}

function verifyActiveMissionMap(levelIndex) {
  const api = windowShim.__IRONCLAD_TEST_API__;
  api.loadLevel(levelIndex);
  const level = api.LEVELS[levelIndex];
  assert.equal(map.isCircleBlocked(map.playerSpawn.x, map.playerSpawn.y, tankRadius), false, `${level.title} player start must be clear`);
  assert.ok(map.solids.length > 55, `${level.title} needs substantial hard cover`);
  for (const spawn of map.enemySpawns) {
    assert.equal(map.isCircleBlocked(spawn.x, spawn.y, tankRadius), false, `${level.title}: ${spawn.label} must be clear`);
  }

  const free = new Uint8Array(columns * rows);
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < columns; gx += 1) {
      free[key(gx, gy)] = map.isCircleBlocked(origin + gx * step, origin + gy * step, tankRadius) ? 0 : 1;
    }
  }
  const entry = nearestFreeCellFor(free, map.playerSpawn);
  assert.ok(entry && entry.distance < 56, `${level.title} must have a safe sample at player spawn`);
  const linked = new Uint8Array(columns * rows);
  const cells = [entry];
  linked[key(entry.gx, entry.gy)] = 1;
  for (let head = 0; head < cells.length; head += 1) {
    const here = cells[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = here.gx + dx;
      const gy = here.gy + dy;
      if (gx < 0 || gy < 0 || gx >= columns || gy >= rows) continue;
      const index = key(gx, gy);
      if (!free[index] || linked[index]) continue;
      linked[index] = 1;
      cells.push({ gx, gy });
    }
  }
  for (const spawn of map.enemySpawns) {
    const cell = nearestFreeCellFor(free, spawn);
    assert.ok(cell && cell.distance < 112, `${level.title}: ${spawn.label} needs usable space nearby`);
    assert.equal(linked[key(cell.gx, cell.gy)], 1, `${level.title}: ${spawn.label} must be reachable from the player start`);
  }
  return cells.length;
}

function nearestFreeCellFor(free, point) {
  let best = null;
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < columns; gx += 1) {
      if (!free[key(gx, gy)]) continue;
      const x = origin + gx * step;
      const y = origin + gy * step;
      const distance = Math.hypot(x - point.x, y - point.y);
      if (!best || distance < best.distance) best = { gx, gy, distance, x, y };
    }
  }
  return best;
}

const api = windowShim.__IRONCLAD_TEST_API__;
assert.ok(api && api.LEVELS.length === 3, "campaign should expose three mission maps");
const campaignConnectivity = api.LEVELS.map((_level, index) => verifyActiveMissionMap(index));

// Store smoke test: bought armor can be equipped, and the requested multi-fire,
// ricochet, armor, and health upgrade tracks can all be fitted independently.
const openingCredits = api.profile.coins;
api.buyTank("t34");
assert.ok(api.profile.owned.includes("t34"), "tank bay purchase should unlock the T-34");
assert.equal(api.profile.selectedTank, "t34", "purchased tank should auto-equip");
assert.equal(api.profile.coins, openingCredits - 180, "tank purchase should spend credits");
api.profile.coins = 1000;
api.buyUpgrade("volley");
api.buyUpgrade("bounce");
api.buyUpgrade("armor");
api.buyUpgrade("hull");
assert.equal(api.profile.upgrades.volley, 2, "volley should advance from single to dual fire");
assert.equal(api.profile.upgrades.bounce, 1, "ricochet should gain its first bounce");
assert.equal(api.profile.upgrades.armor, 1, "armor track should fit a plate layer");
assert.equal(api.profile.upgrades.hull, 1, "health track should reinforce the hull");
api.equipTank("panther");
assert.equal(api.profile.selectedTank, "panther", "owned tanks should be re-equippable");

// Campaign smoke test: boot an operation and advance the real animation loop
// until its first wave has deployed. This catches broken menu-to-game handoffs,
// wave queues, navigation setup, and enemy construction without a browser.
api.startMission(0);
assert.equal(api.game.state, "playing", "launching a mission should enter combat");
for (let frame = 0; frame < 430; frame += 1) {
  clock += 16;
  assert.ok(scheduledFrame, "game loop should continue scheduling frames");
  scheduledFrame(clock);
}
assert.ok(api.enemies.length > 0, "the first mission should deploy hostile tanks");
assert.equal(api.game.waveIndex, 0, "the first mission should be operating its first wave");

// Shell smoke checks: the fitted dual array must damage a hostile, and a fitted
// ricochet tier must preserve a shell after it reflects from a concrete wall.
const target = api.enemies[0];
api.player.x = 1800;
api.player.y = 1200;
api.player.heading = Math.PI / 2;
api.player.turretHeading = Math.PI / 2;
target.x = 2030;
target.y = 1200;
const beforeHit = target.health;
api.bullets.length = 0;
api.firePlayerVolley();
api.updateBullets(0.22);
assert.ok(target.health < beforeHit || target.dead, "player volley should damage a hostile tank");

target.x = 900;
target.y = 700;
api.player.x = 2400;
api.player.y = 1200;
api.player.turretHeading = Math.PI / 2;
api.bullets.length = 0;
api.firePlayerVolley();
api.updateBullets(0.12);
assert.ok(api.bullets.some((bullet) => bullet.team === "player" && bullet.bounces === 0), "ricochet tier should reflect shells from hard cover");

console.log("✓ Campaign map & combat smoke verification passed");
console.log(`  ${api.LEVELS.length} mission maps with ${campaignConnectivity.join(", ")} connected tank-safe navigation samples`);
console.log("  Player starts, hostile deployment sites, hard cover, perimeter collision, tactical passages, and representative routes are clear/connected.");
