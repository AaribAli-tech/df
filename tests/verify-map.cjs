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
const statusLabel = { textContent: "" };
const toast = { classList: { add: noOp } };

const documentShim = {
  querySelector(selector) {
    if (selector === "#game") return mainCanvas;
    if (selector === "#minimap") return miniCanvas;
    if (selector === "#sector-label") return statusLabel;
    if (selector === "#toast") return toast;
    throw new Error(`Unexpected selector: ${selector}`);
  },
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
  addEventListener: noOp,
  setTimeout: noOp,
};

const sandbox = {
  console,
  document: documentShim,
  window: windowShim,
  Image: ImageShim,
  performance: { now: () => 0 },
  requestAnimationFrame: noOp,
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

console.log("✓ Map verification passed");
console.log(`  ${map.solids.length} shared solid colliders across ${Object.keys(byKind).length} object types`);
console.log(`  ${queue.length} tank-safe navigation samples connected to the player spawn`);
console.log("  Player spawn, future deployment pads, perimeter walls, and selected arena routes are clear/connected.");
