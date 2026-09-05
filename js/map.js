'use strict';
/* ============================================================
   Maps: ASCII layouts -> tiles, walls (AABB colliders) and decor.
   Rendered with the craftpix battle-location tileset (assets/tiles).
   Legend:
     .  ground                      #  stone wall  (Decor_Tile_B autotile, ricochet)
     =  rock block (Block_A, ricochet)   W  wooden wall (Decor_Tile_A autotile, absorbs shells)
     H  hedge block (Block_B: blocks tanks, shells fly over)   ~  water (blocks tanks, shells fly over)
     B  building (Building_* tiles, ricochet)   c crate (destructible)   b barrel (explosive)
     r  rock (solid, ricochet)   s sandbags (blocks tanks, shells pass)   T tree (canopy overlay)
     x  crater decal   w  wreck (solid debris)   P player spawn   E enemy spawn   o boss spawn
   patches: [x, y, w, h, terrain] secondary-terrain areas drawn with Hedge edge pieces
   ============================================================ */
const MAP_LAYOUTS = [
  { // 0 training ground - grass
    theme: 'grass', patches: [[9, 7, 6, 4, 'dirt'], [18, 2, 5, 3, 'sand']], rows: [
      '###########################',
      '#E...........E..........E.#',
      '#..T......................#',
      '#......=........s.........#',
      '#......=..........T.......#',
      '#..........c..............#',
      '#..............r......WW..#',
      '#E....##..........##......#',
      '#..T..............#.......#',
      '#..........P..............#',
      '#...s.....................#',
      '#..........=.....b........#',
      '#.....r....=........T....E#',
      '#..E.................c....#',
      '#.........T...............#',
      '###########################'] },
  { // 1 green crossroads - grass, central courtyard with 2 openings
    theme: 'grass', patches: [[10, 5, 4, 2, 'dirt'], [20, 9, 6, 3, 'sand']], rows: [
      '#############################',
      '#E............#............E#',
      '#...T.........#.............#',
      '#.....==......#....W........#',
      '#.....==...c..#....W..T.....#',
      '#..........,,......W........#',
      '#..T....b..,,...............#',
      '####.....###.....###....#####',
      '#........#.........#........#',
      '#........#....P....#........#',
      '#..r.....#.........#........#',
      '#....s...###.....###..b.....#',
      '#..............H..HH........#',
      '#.....T........H...H....c...#',
      '#E.............H...H.T....E.#',
      '#############################'] },
  { // 2 rocky outpost - dirt
    theme: 'dirt', patches: [[3, 9, 6, 4, 'sand'], [20, 2, 6, 3, 'sand']], rows: [
      '##############################',
      '#E.........r..........x.....E#',
      '#....rr..........=..........r#',
      '#..............====.........r#',
      '#..r........####....c........#',
      '#...........#..#...b.........#',
      '#.....c.....#..#.....w.......#',
      '#...........#..#............r#',
      '#...s.......#..#..........s..#',
      '#..............P.......x.....#',
      '#..r..T..............r.......#',
      '#....T...b.....==..rrr.......#',
      '#..............==........c...#',
      '#..W........x.........ss.....#',
      '#E.W..............T........E.#',
      '##############################'] },
  { // 3 desert depot - sand, buildings
    theme: 'sand', patches: [[12, 8, 5, 3, 'dirt'], [24, 11, 6, 3, 'dirt']], rows: [
      '################################',
      '#E............................E#',
      '#....c.c....BB...........c.....#',
      '#....cc.....BB....ss...........#',
      '#...........BB.................#',
      '#..............................#',
      '#..#####.....x......=====......#',
      '#..#..........P.........#......#',
      '#..#....................#....b.#',
      '#..#..b....,,...........#......#',
      '#..#.......,,....r...####......#',
      '#.....................w........#',
      '#....s........###........c.c...#',
      '#....T..x.....#.........cc.....#',
      '#E............#..............E.#',
      '################################'] },
  { // 4 boss arena - RICOCHET (stone pillars, symmetric)
    theme: 'dirt', patches: [[9, 5, 9, 6, 'sand']], rows: [
      '###########################',
      '#E.......................E#',
      '#..=....#.........#....=..#',
      '#.......#.........#.......#',
      '#.........................#',
      '#....=...............=....#',
      '#.........................#',
      '#..#.........o.........#..#',
      '#..#...................#..#',
      '#.........................#',
      '#....=...............=....#',
      '#.........................#',
      '#.......#.........#.......#',
      '#..=....#....P....#....=..#',
      '#E.......................E#',
      '###########################'] },
  { // 5 ruined village - dirt with buildings & wooden fences
    theme: 'dirt', patches: [[12, 4, 8, 3, 'grass'], [22, 10, 5, 4, 'grass']], rows: [
      '################################',
      '#E.....x.....................E.#',
      '#....BBBB.......w....BBBB......#',
      '#....BBBB............BBBB......#',
      '#....BB........c.............r.#',
      '#..............cc..............#',
      '#...W.....###.......###.....W..#',
      '#...W.....#.....P.....#.....W..#',
      '#.........#...........#........#',
      '#..T......###.......###...b....#',
      '#....x.........................#',
      '#....BBBB..........s.....BB....#',
      '#....BBBB....c.....s.....BB....#',
      '#....BBBB..........w....T......#',
      '#E..........................E..#',
      '################################'] },
  { // 6 sandstorm bazaar - sand, tight streets, open courtyard
    theme: 'sand', patches: [[13, 6, 6, 5, 'dirt']], rows: [
      '################################',
      '#E..........#.......#........E.#',
      '#...c.......#...b...#..........#',
      '#...cc..#####.......#####......#',
      '#..............................#',
      '#..==......s.......s......==...#',
      '#..==.....................==...#',
      '#.......W......###......W......#',
      '#..T....W......#P#......W......#',
      '#.......W......#.#......W......#',
      '#..==..........#.#........==...#',
      '#..==......s.......s......==...#',
      '#...x..........................#',
      '#.......#####...c...#####..b...#',
      '#E..........#...cc..#.......E..#',
      '################################'] },
  { // 7 riverside - grass, river with two fords
    theme: 'grass', patches: [[24, 3, 7, 4, 'sand'], [3, 10, 6, 3, 'dirt']], rows: [
      '###################################',
      '#E..........~~~..................E#',
      '#....T.....~~~~~........c.........#',
      '#..........~~~~....==.............#',
      '#...s......~~~.....==.....T.......#',
      '#..........~~~..............r.....#',
      '#.....c....~~~~~....##............#',
      '#...........~~~~....#........P....#',
      '#....##......~~~....#.............#',
      '#....#.............x..............#',
      '#....#....b.....~~~~..........s...#',
      '#..............~~~~~~.....##......#',
      '#..T.......w....~~~~~~....#.......#',
      '#..................~~~~...#....T..#',
      '#E..................~~~~.......E..#',
      '###################################'] },
  { // 8 fortress - stone corridors around a keep
    theme: 'dirt', patches: [[10, 5, 13, 6, 'sand']], rows: [
      '#################################',
      '#E.............................E#',
      '#..######...........######......#',
      '#..#....#...........#....#......#',
      '#..#....#####...#####....#..b...#',
      '#..#.....................#......#',
      '#..#..s...=..c....=...s..#......#',
      '#..###......x..P.......###......#',
      '#..#......=.......=......#......#',
      '#..#..s......cc.......s..#......#',
      '#..#.....................#......#',
      '#..#....#####...#####....#...r..#',
      '#..#....#.....w.....#....#......#',
      '#..######...........######......#',
      '#E.............................E#',
      '#################################'] },
  { // 9 boss arena - JUGGERNAUT (open with pillars)
    theme: 'sand', patches: [[11, 5, 11, 6, 'dirt']], rows: [
      '#################################',
      '#E.............................E#',
      '#...............................#',
      '#......=.................=......#',
      '#...............o...............#',
      '#...........=.......=...........#',
      '#...#.......................#...#',
      '#...#.......................#...#',
      '#...#.......................#...#',
      '#...........=.......=...........#',
      '#...............................#',
      '#......=.................=......#',
      '#...............P...............#',
      '#...............................#',
      '#E.............................E#',
      '#################################'] },
];
const TERRAIN = { grass: { ground: ['Ground_Tile_01_B', 'Ground_Tile_02_B'], hedge: 'B', fallback: '#5a8a3a' }, sand: { ground: ['Ground_Tile_01_A', 'Ground_Tile_02_A'], hedge: 'A', fallback: '#c9a86a' }, dirt: { ground: ['Ground_Tile_01_C', 'Ground_Tile_02_C'], hedge: 'C', fallback: '#7a5a3a' } };
const GROUND_PX = 128; // tileset drawn at 0.5 scale: 256px ground tile -> 128px (2x2 cells)

class GameMap {
  constructor(index) {
    const L = MAP_LAYOUTS[index]; this.index = index; this.theme = L.theme; this.rows = L.rows; this.patches = L.patches || [];
    this.h = L.rows.length; this.w = L.rows[0].length; this.W = this.w * CELL; this.H = this.h * CELL;
    this.walls = []; this.props = []; this.decals = []; this.overlays = []; this.waters = []; this.enemySpawns = []; this.playerSpawn = null; this.bossSpawn = null;
    this.grid = []; // per cell: 0 open, 1 blocks tanks only (hedge/water), 2 blocks tanks + bullets
    this.rng = mulberry32(index * 1337 + 7);
    this.parse(); this.buildWallMap(); this.bake();
  }
  cell(x, y) { if (y < 0 || y >= this.h || x < 0 || x >= this.w) return '#'; return this.rows[y][x]; }
  parse() {
    const R = this.rng;
    for (let y = 0; y < this.h; y++) {
      this.grid.push([]);
      for (let x = 0; x < this.w; x++) {
        const c = this.rows[y][x]; const cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2; let g = 0;
        switch (c) {
          case '#': this.addWall(x, y, 'stone', true); g = 2; break;
          case '=': this.addWall(x, y, 'block', true); g = 2; break;
          case 'B': this.addWall(x, y, 'building', true); g = 2; break;
          case 'W': this.addWall(x, y, 'wood', false); g = 2; break;
          case 'H': this.addWall(x, y, 'hedge', false); g = 1; break;
          case '~': this.waters.push({ x, y }); this.addWall(x, y, 'water', false); g = 1; break;
          case 'r': this.props.push({ kind: 'rock', x: cx, y: cy, w: 50, h: 42, solid: true, bounce: true, hp: Infinity }); break;
          case 'c': this.props.push({ kind: 'crate', x: cx, y: cy, w: 44, h: 44, solid: true, bounce: false, hp: 40 }); break;
          case 'b': this.props.push({ kind: R() < 0.5 ? 'barrel' : 'barrelGreen', x: cx, y: cy, w: 36, h: 36, solid: true, bounce: false, hp: 20, explosive: true }); break;
          case 's': this.props.push({ kind: 'sandbag', x: cx, y: cy, w: 60, h: 28, solid: true, bounce: false, hp: Infinity, low: true }); break;
          case 'T': this.overlays.push({ kind: 'tree', x: cx + (R() - 0.5) * 20, y: cy + (R() - 0.5) * 20, s: 0.9 + R() * 0.4, rot: R() * TAU }); break;
          case 'x': this.decals.push({ kind: 'crater', x: cx, y: cy, s: 0.8 + R() * 0.5, rot: R() * TAU }); break;
          case 'w': this.decals.push({ kind: 'wreck', x: cx, y: cy, s: 1, rot: R() * TAU }); this.props.push({ kind: 'wreckSolid', x: cx, y: cy, w: 70, h: 44, solid: true, bounce: true, hp: Infinity, invisible: true }); break;
          case ',': break;
          case 'P': this.playerSpawn = { x: cx, y: cy }; break;
          case 'E': this.enemySpawns.push({ x: cx, y: cy }); break;
          case 'o': this.bossSpawn = { x: cx, y: cy }; break;
        }
        this.grid[y].push(g);
      }
    }
    // random ground decoration: bushes, small rocks, puddles, tire stacks, hedgehogs
    const nDec = Math.floor(this.w * this.h * 0.02);
    for (let i = 0; i < nDec; i++) {
      const x = 1 + Math.floor(R() * (this.w - 2)), y = 1 + Math.floor(R() * (this.h - 2));
      if (this.cell(x, y) !== '.') continue;
      if (this.playerSpawn && dist(x * CELL, y * CELL, this.playerSpawn.x, this.playerSpawn.y) < 200) continue;
      const cx = x * CELL + CELL / 2 + (R() - 0.5) * 30, cy = y * CELL + CELL / 2 + (R() - 0.5) * 30;
      const r = R();
      if (this.theme === 'grass' && r < 0.4) this.decals.push({ kind: 'bush', x: cx, y: cy, s: 0.7 + R() * 0.5, rot: 0 });
      else if (r < 0.55) this.decals.push({ kind: 'rock2', x: cx, y: cy, s: 0.5 + R() * 0.4, rot: R() * TAU, });
      else if (r < 0.7) this.decals.push({ kind: 'tires', x: cx, y: cy, s: 0.7 + R() * 0.4, rot: R() * TAU });
      else if (r < 0.85) this.decals.push({ kind: 'hedgehog', x: cx, y: cy, s: 0.8, rot: R() * TAU });
      else if (this.theme !== 'sand') this.decals.push({ kind: 'puddle', x: cx, y: cy, s: 0.7 + R() * 0.6, rot: R() * TAU });
      else this.decals.push({ kind: 'crater', x: cx, y: cy, s: 0.5 + R() * 0.4, rot: R() * TAU });
    }
    if (!this.playerSpawn) this.playerSpawn = { x: this.W / 2, y: this.H / 2 };
  }
  addWall(x, y, type, bounce) { this.walls.push({ x: x * CELL, y: y * CELL, w: CELL, h: CELL, type, bounce, cx: x, cy: y }); }
  buildWallMap() { this.wallMap = new Array(this.w * this.h).fill(null); for (const w of this.walls) this.wallMap[w.cy * this.w + w.cx] = w; }
  wallAt(cx, cy) { return this.wallMap[cy * this.w + cx]; }
  isSolidCell(x, y) { if (y < 0 || y >= this.h || x < 0 || x >= this.w) return 2; return this.grid[y][x]; }
  /* ---------- baking: whole map pre-rendered once into an offscreen canvas ---------- */
  bake() {
    const c = document.createElement('canvas'); c.width = this.W; c.height = this.H; const g = c.getContext('2d');
    const T = Assets.tiles; const R = mulberry32(this.w * 31 + this.h);
    const th = TERRAIN[this.theme];
    for (let y = 0; y < this.H; y += GROUND_PX) for (let x = 0; x < this.W; x += GROUND_PX) {
      const im = T[th.ground[R() < 0.7 ? 0 : 1]]; if (im) g.drawImage(im, x, y, GROUND_PX, GROUND_PX); else { g.fillStyle = th.fallback; g.fillRect(x, y, GROUND_PX, GROUND_PX); }
    }
    for (const p of this.patches) this.drawPatch(g, p[0] * CELL, p[1] * CELL, p[2] * CELL, p[3] * CELL, p[4]);
    // faint tracks from enemy spawns toward the player spawn
    g.save(); g.globalAlpha = 0.16; g.strokeStyle = this.theme === 'sand' ? '#6a4a2a' : '#2a1a0c'; g.lineWidth = 30; g.lineCap = 'round';
    for (const s of this.enemySpawns) { g.beginPath(); g.moveTo(s.x, s.y); g.quadraticCurveTo((s.x + this.playerSpawn.x) / 2 + (R() - 0.5) * 300, (s.y + this.playerSpawn.y) / 2 + (R() - 0.5) * 300, this.playerSpawn.x, this.playerSpawn.y); g.stroke(); }
    g.restore();
    // water + shores
    for (const w of this.waters) g.drawImage(Assets.props.water[0], w.x * CELL, w.y * CELL);
    g.strokeStyle = 'rgba(20,50,80,0.55)'; g.lineWidth = 4;
    for (const w of this.waters) {
      const x = w.x * CELL, y = w.y * CELL;
      if (this.cell(w.x, w.y - 1) !== '~') { g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + CELL, y + 1); g.stroke(); }
      if (this.cell(w.x, w.y + 1) !== '~') { g.beginPath(); g.moveTo(x, y + CELL - 1); g.lineTo(x + CELL, y + CELL - 1); g.stroke(); }
      if (this.cell(w.x - 1, w.y) !== '~') { g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 1, y + CELL); g.stroke(); }
      if (this.cell(w.x + 1, w.y) !== '~') { g.beginPath(); g.moveTo(x + CELL - 1, y); g.lineTo(x + CELL - 1, y + CELL); g.stroke(); }
    }
    // decals
    for (const d of this.decals) { const im = Assets.props[d.kind]; if (!im) continue; g.save(); g.translate(d.x, d.y); g.rotate(d.rot || 0); g.scale(d.s, d.s); g.drawImage(im, -im.width / 2, -im.height / 2); g.restore(); }
    // wall shadows (drawn before walls so neighbouring walls cover them)
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const w of this.walls) { if (w.type === 'water') continue; g.fillRect(w.x + 5, w.y + 5, w.w, w.h); }
    // walls
    const used = new Set();
    for (const w of this.walls) this.drawWall(g, w, used);
    this.drawBuildings(g);
    this.baked = c;
  }
  /* secondary terrain rectangle with tileset edge strips (Hedge_X_02) and corner pieces (Hedge_X_03) */
  drawPatch(g, x, y, w, h, terrain) {
    const T = Assets.tiles; const th = TERRAIN[terrain]; const ground = T[th.ground[0]]; const strip = T['Hedge_' + th.hedge + '_02'], corner = T['Hedge_' + th.hedge + '_03'];
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (let yy = Math.floor(y / GROUND_PX) * GROUND_PX; yy < y + h; yy += GROUND_PX) for (let xx = Math.floor(x / GROUND_PX) * GROUND_PX; xx < x + w; xx += GROUND_PX) { if (ground) g.drawImage(ground, xx, yy, GROUND_PX, GROUND_PX); else { g.fillStyle = th.fallback; g.fillRect(xx, yy, GROUND_PX, GROUND_PX); } }
    g.restore();
    if (!strip) return;
    const SW = 128, SH = 18, CS = 16; // strip & corner at 0.5 scale
    const drawStrip = (cx, cy, ang, len) => { g.save(); g.translate(cx, cy); g.rotate(ang); g.drawImage(strip, 0, 0, Math.min(256, len * 2), 36, -len / 2, -SH / 2, len, SH); g.restore(); };
    const edge = (x0, y0, x1, y1, ang) => { const len = Math.hypot(x1 - x0, y1 - y0); const n = Math.ceil(len / SW); for (let i = 0; i < n; i++) { const l = Math.min(SW, len - i * SW); const t0 = (i * SW + l / 2) / len; drawStrip(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, ang, l); } };
    edge(x + CS, y + h, x + w - CS, y + h, 0);            // bottom (ragged faces down)
    edge(x + CS, y, x + w - CS, y, Math.PI);               // top
    edge(x, y + CS, x, y + h - CS, Math.PI / 2);           // left
    edge(x + w, y + CS, x + w, y + h - CS, -Math.PI / 2);  // right
    if (corner) { const cr = (cx, cy, ang) => { g.save(); g.translate(cx, cy); g.rotate(ang); g.drawImage(corner, 0, 0, 30, 30, -CS, -CS, CS * 2, CS * 2); g.restore(); }; cr(x + w, y + h, 0); cr(x, y + h, Math.PI / 2); cr(x, y, Math.PI); cr(x + w, y, -Math.PI / 2); }
  }
  /* which sides of a wall cell are exposed (neighbour is not the same wall family) */
  exposure(x, y, fam) { const same = (xx, yy) => fam.includes(this.cell(xx, yy)); return { T: !same(x, y - 1), B: !same(x, y + 1), L: !same(x - 1, y), R: !same(x + 1, y) }; }
  /* 3x3 autotile quadrant composition: each 32px quadrant of the cell picks corner/edge/center of the 128px source set */
  drawAutotile(g, w, prefix, fam) {
    const T = Assets.tiles; const e = this.exposure(w.cx, w.cy, fam);
    const names = [['01', '02', '03'], ['04', '05', '06'], ['07', '08', '09']];
    const pick = (row, col) => T[`${prefix}_${names[row][col]}`];
    const q = [[e.T && e.L ? pick(0, 0) : e.T ? pick(0, 1) : e.L ? pick(1, 0) : pick(1, 1), 0, 0], [e.T && e.R ? pick(0, 2) : e.T ? pick(0, 1) : e.R ? pick(1, 2) : pick(1, 1), 1, 0], [e.B && e.L ? pick(2, 0) : e.B ? pick(2, 1) : e.L ? pick(1, 0) : pick(1, 1), 0, 1], [e.B && e.R ? pick(2, 2) : e.B ? pick(2, 1) : e.R ? pick(1, 2) : pick(1, 1), 1, 1]];
    for (const [im, qx, qy] of q) { if (!im) { g.fillStyle = prefix.endsWith('B') ? '#8a8a96' : '#8a5a34'; g.fillRect(w.x + qx * 32, w.y + qy * 32, 32, 32); continue; } g.drawImage(im, qx * 64, qy * 64, 64, 64, w.x + qx * 32, w.y + qy * 32, 32, 32); }
  }
  drawWall(g, w, used) {
    const T = Assets.tiles; const key = w.cx + ',' + w.cy; if (used.has(key)) return;
    switch (w.type) {
      case 'water': case 'building': return;
      case 'stone': this.drawAutotile(g, w, 'Decor_Tile_B', '#B'); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(w.x + 1, w.y + 1, CELL - 2, CELL - 2); return;
      case 'wood': this.drawAutotile(g, w, 'Decor_Tile_A', 'W'); return;
      case 'block': case 'hedge': {
        const set = w.type === 'block' ? 'Block_A' : 'Block_B'; const ch = w.type === 'block' ? '=' : 'H';
        const right = this.cell(w.cx + 1, w.cy) === ch && !used.has((w.cx + 1) + ',' + w.cy);
        if (right && T[set + '_01']) { g.drawImage(T[set + '_01'], w.x, w.y, CELL * 2, CELL); used.add((w.cx + 1) + ',' + w.cy); }
        else if (T[set + '_02']) g.drawImage(T[set + '_02'], w.x, w.y, CELL, CELL);
        else { g.fillStyle = w.type === 'block' ? '#b8a070' : '#3d7d2a'; g.fillRect(w.x + 2, w.y + 2, CELL - 4, CELL - 4); }
        used.add(key); return;
      }
    }
  }
  drawBuildings(g) {
    const T = Assets.tiles; const seen = new Set();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.cell(x, y) !== 'B' || seen.has(x + ',' + y)) continue;
      let w = 0; while (this.cell(x + w, y) === 'B' && !seen.has((x + w) + ',' + y)) w++;
      let h = 1; outer: while (true) { for (let i = 0; i < w; i++) if (this.cell(x + i, y + h) !== 'B') break outer; h++; }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen.add((x + i) + ',' + (y + j));
      const px = x * CELL, py = y * CELL, pw = w * CELL, ph = h * CELL; const wide = w >= h * 2; const alt = (x + y) % 2 === 1;
      const im = T[(alt ? 'Building_B' : 'Building_A') + (wide ? '_02' : '_01')] || T['Building_A_01'];
      if (im) g.drawImage(im, px, py, pw, ph); else { g.fillStyle = '#6a6a72'; g.fillRect(px, py, pw, ph); }
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
    }
  }
  /* ---------- collision queries ---------- */
  circleVsWalls(x, y, r, forBullet = false) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const g = this.isSolidCell(cx, cy); if (!g) continue; if (forBullet && g < 2) continue;
      const bx = cx * CELL, by = cy * CELL; const nx = clamp(x, bx, bx + CELL), ny = clamp(y, by, by + CELL);
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return { x: bx, y: by, w: CELL, h: CELL, cx, cy };
    }
    return null;
  }
  lineOfSight(x0, y0, x1, y1) {
    const steps = Math.ceil(dist(x0, y0, x1, y1) / 12); if (steps === 0) return true;
    const dx = (x1 - x0) / steps, dy = (y1 - y0) / steps; let x = x0, y = y0;
    for (let i = 0; i < steps; i++) { x += dx; y += dy; if (this.isSolidCell(Math.floor(x / CELL), Math.floor(y / CELL)) >= 2) return false; }
    return true;
  }
  isFree(x, y, r) { return !this.circleVsWalls(x, y, r); }
  /* ---------- flow field (BFS from the player) for enemy navigation ---------- */
  computeFlow(tx, ty) {
    const W = this.w, H = this.h; const d = new Int16Array(W * H).fill(-1); const q = [];
    const sx = clamp(Math.floor(tx / CELL), 0, W - 1), sy = clamp(Math.floor(ty / CELL), 0, H - 1);
    d[sy * W + sx] = 0; q.push(sx, sy); let qi = 0;
    while (qi < q.length) {
      const x = q[qi++], y = q[qi++]; const dd = d[y * W + x];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (this.grid[ny][nx] || (this.propGrid && this.propGrid[ny * W + nx])) continue; const i = ny * W + nx; if (d[i] >= 0) continue; d[i] = dd + 1; q.push(nx, ny);
      }
    }
    this.flow = d;
  }
  flowDir(x, y) {
    if (!this.flow) return null; const W = this.w; const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= W || cy >= this.h) return null;
    let best = this.flow[cy * W + cx]; if (best < 0) best = 9999; let bx = 0, by = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= this.h) continue; const d = this.flow[ny * W + nx]; if (d < 0) continue;
      if (ox && oy && (this.grid[cy][nx] || this.grid[ny][cx] || (this.propGrid && (this.propGrid[cy * W + nx] || this.propGrid[ny * W + cx])))) continue;
      if (d < best) { best = d; bx = ox; by = oy; }
    }
    if (!bx && !by) return null;
    const tx = (cx + bx) * CELL + CELL / 2, ty = (cy + by) * CELL + CELL / 2; const dd = dist(x, y, tx, ty) || 1;
    return { x: (tx - x) / dd, y: (ty - y) / dd, d: best };
  }
  flowDist(x, y) { if (!this.flow) return 9999; const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return 9999; const d = this.flow[cy * this.w + cx]; return d < 0 ? 9999 : d; }
  updatePropGrid(props) { const g = new Uint8Array(this.w * this.h); for (const p of props) { if (!p.solid || p.dead) continue; const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL); if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) g[cy * this.w + cx] = 1; } this.propGrid = g; }
}
