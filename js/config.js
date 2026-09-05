'use strict';
/* ============================================================
   IRON RICOCHET - configuration, math helpers, upgrade + level data
   ============================================================ */
const TAU = Math.PI * 2;
const CELL = 64;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const normAng = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const angDiff = (a, b) => normAng(b - a);
const rotToward = (cur, target, maxStep) => { const d = angDiff(cur, target); if (Math.abs(d) <= maxStep) return target; return cur + Math.sign(d) * maxStep; };
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Pool {
  constructor(factory) { this.items = []; this.factory = factory; this.n = 0; }
  get() { let o; if (this.n < this.items.length) o = this.items[this.n]; else { o = this.factory(); this.items.push(o); } this.n++; o.active = true; return o; }
  release(i) { const o = this.items[i]; o.active = false; this.n--; this.items[i] = this.items[this.n]; this.items[this.n] = o; }
  clear() { for (let i = 0; i < this.n; i++) this.items[i].active = false; this.n = 0; }
}

/* ---------- Tank sprite definitions (all sprites face UP) ----------
   hx,hy: hull pivot (center) in the 100x100 image. tx,ty: turret pivot.
   barrel: distance from turret pivot to muzzle (px @1x). w,l: hull size. */
const TANK_DEFS = {
  panther:  { dir: 'Panther',  n: 1,  hx: 49.5, hy: 54,   tx: 49.5, ty: 53.5, barrel: 35.5, w: 24, l: 47 },
  panzer4:  { dir: 'Panzer 4', n: 2,  hx: 49,   hy: 53.5, tx: 49,   ty: 54.5, barrel: 30.5, w: 21, l: 40 },
  tiger:    { dir: 'Tiger',    n: 3,  hx: 49.5, hy: 54.5, tx: 49.5, ty: 54,   barrel: 38,   w: 28, l: 48 },
  t34:      { dir: 'T-34',     n: 4,  hx: 50.5, hy: 52.5, tx: 50.5, ty: 48.5, barrel: 17.5, w: 22, l: 40 },
  kv1:      { dir: 'KV-1',     n: 5,  hx: 50.5, hy: 52,   tx: 50.5, ty: 50.5, barrel: 21.5, w: 26, l: 45 },
  t26:      { dir: 'T-26',     n: 6,  hx: 50.5, hy: 53.5, tx: 50.5, ty: 52.5, barrel: 14.5, w: 18, l: 34 },
  crusader: { dir: 'Crusader', n: 8,  hx: 49.5, hy: 53.5, tx: 49.5, ty: 52,   barrel: 13,   w: 20, l: 40 },
  matilda:  { dir: 'Matilda',  n: 9,  hx: 50,   hy: 53,   tx: 50,   ty: 50,   barrel: 11,   w: 19, l: 37 },
  sherman:  { dir: 'Sherman',  n: 10, hx: 50.5, hy: 51.5, tx: 50.5, ty: 51.5, barrel: 19.5, w: 20, l: 38 },
  lee:      { dir: 'Lee',      n: 11, hx: 50.5, hy: 51,   tx: 46,   ty: 53.5, barrel: 14.5, w: 22, l: 41 },
  stuart:   { dir: 'Stuart',   n: 12, hx: 50,   hy: 50.5, tx: 50,   ty: 53,   barrel: 13,   w: 17, l: 28 },
  m13:      { dir: 'M13',      n: 13, hx: 50,   hy: 50.5, tx: 50,   ty: 49,   barrel: 16,   w: 17, l: 30 },
  type95:   { dir: 'type 95',  n: 14, hx: 50,   hy: 49,   tx: 50,   ty: 47,   barrel: 8,    w: 15, l: 27 },
};

/* ---------- Tank shop (Garage): all 13 hulls from the repo, each with its own stats + perk ----------
   scale = player sprite scale (pet uses scale*0.75). Perks: shots, bounce, armor, bSpeed, bossDmg, magnet, coin */
const TANK_SHOP = [
  { id: 'type95',   name: 'TYPE 95',   cls: 'LIGHT',  cost: 400,  petCost: 250,  hp: 70,  speed: 290, dmg: 14, fireInt: 0.38, scale: 2.3,  desc: 'Tiny, nimble scout. Hard to hit, quick to reload.' },
  { id: 'm13',      name: 'M13/40',    cls: 'LIGHT',  cost: 450,  petCost: 300,  hp: 75,  speed: 270, dmg: 15, fireInt: 0.40, scale: 2.1,  desc: 'Light Italian tank. Fast and cheap.' },
  { id: 'stuart',   name: 'STUART',    cls: 'LIGHT',  cost: 500,  petCost: 0,    hp: 80,  speed: 275, dmg: 16, fireInt: 0.42, scale: 2.25, desc: 'Agile cavalry tank with a rapid-fire gun.' },
  { id: 't26',      name: 'T-26',      cls: 'LIGHT',  cost: 600,  petCost: 350,  hp: 85,  speed: 255, dmg: 18, fireInt: 0.45, scale: 1.9,  desc: 'Balanced light tank with a decent punch.' },
  { id: 'crusader', name: 'CRUSADER',  cls: 'LIGHT',  cost: 800,  petCost: 500,  hp: 90,  speed: 265, dmg: 18, fireInt: 0.45, scale: 1.7,  desc: 'Desert raider. Pulls coins from further away.', perk: { magnet: 1.6 }, perkText: 'SCAVENGER: +60% coin magnet range' },
  { id: 't34',      name: 'T-34',      cls: 'MEDIUM', cost: 0,    petCost: 600,  hp: 100, speed: 230, dmg: 20, fireInt: 0.50, scale: 1.9,  desc: 'Reliable all-rounder. Your starting tank.' },
  { id: 'panzer4',  name: 'PANZER IV', cls: 'MEDIUM', cost: 1000, petCost: 600,  hp: 105, speed: 230, dmg: 22, fireInt: 0.50, scale: 1.9,  desc: 'Workhorse medium with a long 75mm gun.' },
  { id: 'sherman',  name: 'SHERMAN',   cls: 'MEDIUM', cost: 1200, petCost: 700,  hp: 110, speed: 225, dmg: 21, fireInt: 0.48, scale: 2.0,  desc: 'Mass-produced medium. Earns extra coins.', perk: { coin: 1.15 }, perkText: 'LEND-LEASE: +15% coins collected' },
  { id: 'matilda',  name: 'MATILDA',   cls: 'HEAVY',  cost: 1500, petCost: 900,  hp: 140, speed: 190, dmg: 20, fireInt: 0.55, scale: 2.1,  desc: 'Slow infantry tank wrapped in thick steel.', perk: { armor: 0.12 }, perkText: 'THICK ARMOR: 12% damage reduction' },
  { id: 'lee',      name: 'M3 LEE',    cls: 'MEDIUM', cost: 1600, petCost: 900,  hp: 115, speed: 210, dmg: 19, fireInt: 0.48, scale: 1.85, desc: 'Two guns are better than one.', perk: { shots: 1 }, perkText: 'TWIN GUNS: +1 shell per shot' },
  { id: 'kv1',      name: 'KV-1',      cls: 'HEAVY',  cost: 2200, petCost: 1300, hp: 170, speed: 175, dmg: 26, fireInt: 0.65, scale: 1.85, desc: 'Steel fortress. Built to crack bosses.', perk: { bossDmg: 1.25 }, perkText: 'SIEGE SHELLS: +25% damage to bosses' },
  { id: 'panther',  name: 'PANTHER',   cls: 'HEAVY',  cost: 2800, petCost: 1600, hp: 130, speed: 215, dmg: 26, fireInt: 0.50, scale: 1.8,  desc: 'Sloped armor and a gun made for trick shots.', perk: { bounce: 1 }, perkText: 'RICOCHET GUN: +1 bounce' },
  { id: 'tiger',    name: 'TIGER',     cls: 'HEAVY',  cost: 3500, petCost: 2000, hp: 180, speed: 185, dmg: 30, fireInt: 0.60, scale: 1.8,  desc: 'The legend. Devastating 88mm cannon.', perk: { bSpeed: 1.2 }, perkText: '88mm GUN: +20% shell speed' },
];
const TANK_BY_ID = {}; for (const t of TANK_SHOP) TANK_BY_ID[t.id] = t;
const tankRadius = (t, scale) => Math.round(TANK_DEFS[t.id].l * scale * 0.29);

const PLAYER_BASE = { hp: 100, speed: 230, dmg: 20, fireInt: 0.5, bSpeed: 620, radius: 22, tank: 't34', scale: 1.9 };
const PET_BASE = { hp: 60, speed: 240, dmg: 12, fireInt: 0.8, bSpeed: 560, radius: 16, tank: 'stuart', scale: 1.6 };
const SHOT_DMG_MULT = [1, 0.85, 0.75, 0.7, 0.65];
const SHOT_SPREADS = [[0], [-0.07, 0.07], [-0.13, 0, 0.13], [-0.19, -0.065, 0.065, 0.19], [-0.24, -0.12, 0, 0.12, 0.24]];
const ENEMY_TINT = 'rgba(255,60,40,0.30)';

const ENEMY_DEFS = {
  basic:      { name: 'Grunt',    tank: 'panzer4',  scale: 1.9,  hp: 60,  speed: 125, dmg: 10, fireInt: 2.0,  bSpeed: 400, err: 0.16, range: 340, coins: 15, turretSpd: 3.0, radius: 22 },
  aggressive: { name: 'Raider',   tank: 't26',      scale: 1.85, hp: 45,  speed: 200, dmg: 6,  fireInt: 1.0,  bSpeed: 440, err: 0.22, range: 190, coins: 18, turretSpd: 5.0, radius: 19 },
  defensive:  { name: 'Bunker',   tank: 'matilda',  scale: 1.95, hp: 85,  speed: 120, dmg: 12, fireInt: 1.8,  bSpeed: 430, err: 0.10, range: 430, coins: 20, turretSpd: 3.2, radius: 22 },
  sniper:     { name: 'Marksman', tank: 'lee',      scale: 1.9,  hp: 55,  speed: 105, dmg: 26, fireInt: 3.8,  bSpeed: 760, err: 0.03, range: 700, coins: 24, turretSpd: 1.6, radius: 22, telegraph: 0.8 },
  heavy:      { name: 'Bruiser',  tank: 'kv1',      scale: 2.1,  hp: 170, speed: 85,  dmg: 15, fireInt: 2.3,  bSpeed: 390, err: 0.12, range: 320, coins: 35, turretSpd: 2.2, radius: 27, shots: 2, spread: 0.09, bounce: 1 },
  hunter:     { name: 'Bouncer',  tank: 'crusader', scale: 1.85, hp: 70,  speed: 165, dmg: 10, fireInt: 1.5,  bSpeed: 460, err: 0.12, range: 400, coins: 22, turretSpd: 3.5, radius: 21, bounce: 2 },
};
const BOSS_DEFS = {
  ricochet:   { name: 'RICOCHET',   tank: 'tiger', scale: 3.0, hp: 1500, speed: 115, dmg: 16, bSpeed: 380, coins: 450, tint: 'rgba(160,50,255,0.5)', radius: 58, turretSpd: 2.4 },
  juggernaut: { name: 'JUGGERNAUT', tank: 'kv1',   scale: 3.2, hp: 2400, speed: 80,  dmg: 20, bSpeed: 430, coins: 650, tint: 'rgba(255,110,20,0.45)', radius: 62, turretSpd: 2.0 },
};

/* ---------- Upgrades ---------- */
const UPGRADES = [
  { id: 'shot',     name: 'SHOT TYPE',      icon: '⁂', desc: 'Fire more shells per shot in a tight spread.', labels: ['Single', 'Dual', 'Triple', 'Quad'], costs: [250, 650, 1500] },
  { id: 'bounce',   name: 'RICOCHET',       icon: '↯', desc: 'Your shells bounce off stone walls.', labels: ['No bounce', '1 bounce', '2 bounces', '3 bounces'], costs: [200, 550, 1200] },
  { id: 'health',   name: 'HULL PLATING',   icon: '♥', desc: '+20 max health per level.', max: 8, base: 120, mult: 1.45, fmt: (l) => '+' + (20 * l) + ' HP' },
  { id: 'armor',    name: 'REACTIVE ARMOR', icon: '◈', desc: 'Take 6% less damage per level.', max: 5, base: 220, mult: 1.6, fmt: (l) => (l * 6) + '% DR' },
  { id: 'damage',   name: 'SHELL DAMAGE',   icon: '✸', desc: '+15% shell damage per level.', max: 8, base: 150, mult: 1.5, fmt: (l) => '+' + (15 * l) + '% DMG' },
  { id: 'speed',    name: 'ENGINE',         icon: '➤', desc: '+7% movement speed per level.', max: 5, base: 130, mult: 1.5, fmt: (l) => '+' + (7 * l) + '% SPD' },
  { id: 'fireRate', name: 'AUTOLOADER',     icon: '⟳', desc: 'Reload faster between shots.', max: 6, base: 170, mult: 1.55, fmt: (l) => '-' + (8 * l) + '% reload' },
];
const PET_UPGRADES = [
  { id: 'shot',     name: 'PET SHOT TYPE', icon: '⁂', desc: 'Companion fires more shells per shot.', labels: ['Single', 'Dual', 'Triple', 'Quad'], costs: [300, 750, 1600] },
  { id: 'damage',   name: 'PET DAMAGE',    icon: '✸', desc: '+20% companion shell damage.', max: 6, base: 120, mult: 1.5, fmt: (l) => '+' + (20 * l) + '% DMG' },
  { id: 'fireRate', name: 'PET FIRE RATE', icon: '⟳', desc: 'Companion reloads faster.', max: 5, base: 140, mult: 1.55, fmt: (l) => '-' + (10 * l) + '% reload' },
  { id: 'health',   name: 'PET HEALTH',    icon: '♥', desc: '+25 companion health.', max: 5, base: 110, mult: 1.5, fmt: (l) => '+' + (25 * l) + ' HP' },
  { id: 'speed',    name: 'PET SPEED',     icon: '➤', desc: '+8% companion speed.', max: 4, base: 110, mult: 1.5, fmt: (l) => '+' + (8 * l) + '% SPD' },
];
const PET_UNLOCK_COST = 1000;
function upgradeMax(u) { return u.labels ? u.labels.length - 1 : u.max; }
function upgradeCost(u, lvl) { if (u.labels) return u.costs[lvl]; return Math.round(u.base * Math.pow(u.mult, lvl) / 10) * 10; }
function upgradeLabel(u, lvl) { return u.labels ? u.labels[lvl] : u.fmt(lvl); }

/* ---------- Levels ----------
   waves: each wave spawns when previous wave has <= 'left' enemies alive (default 1) or after 'after' seconds. */
const LEVELS = [
  { name: 'TRAINING GROUND', map: 0, waves: [{ e: { basic: 2 } }, { e: { basic: 2 } }], tip: 'WASD / arrows to move. Mouse to aim, click or SPACE to fire. Shells bounce off stone and concrete walls!' },
  { name: 'GREEN CROSSROADS', map: 1, waves: [{ e: { basic: 2, aggressive: 1 } }, { e: { basic: 2, aggressive: 1 } }, { e: { aggressive: 2 } }], tip: 'Raiders rush you. Keep moving and use corners.' },
  { name: 'ROCKY OUTPOST', map: 2, waves: [{ e: { basic: 2, defensive: 1 } }, { e: { defensive: 1, basic: 1, aggressive: 1 } }, { e: { aggressive: 2, defensive: 1 } }], tip: 'Bunker tanks hide behind cover. Bounce shells around their walls!' },
  { name: 'DESERT DEPOT', map: 3, waves: [{ e: { basic: 2, sniper: 1 } }, { e: { defensive: 1, aggressive: 2 } }, { e: { sniper: 1, basic: 2 } }, { e: { sniper: 1, aggressive: 2 } }], tip: 'Marksmen show a red line before firing. Dodge it!' },
  { name: 'BOSS: RICOCHET', map: 4, boss: 'ricochet', waves: [], tip: 'RICOCHET bounces shells around the arena. Watch the trails, find the safe spots, punish him.' },
  { name: 'RUINED VILLAGE', map: 5, waves: [{ e: { basic: 2, hunter: 1, aggressive: 1 } }, { e: { defensive: 2, sniper: 1 } }, { e: { aggressive: 3, basic: 1 } }, { e: { hunter: 2, defensive: 1 } }], tip: 'Bouncer tanks fire ricochet shells. Nothing is safe behind a wall anymore.' },
  { name: 'SANDSTORM BAZAAR', map: 6, waves: [{ e: { heavy: 1, basic: 2 } }, { e: { hunter: 2, aggressive: 2 } }, { e: { heavy: 1, sniper: 1, defensive: 1 } }, { e: { aggressive: 3, hunter: 1 } }], tip: 'Bruisers are slow but tough. Circle them.' },
  { name: 'RIVERSIDE', map: 7, waves: [{ e: { sniper: 2, basic: 2 } }, { e: { defensive: 2, hunter: 1, aggressive: 1 } }, { e: { sniper: 2, heavy: 1 } }, { e: { aggressive: 4 } }], tip: 'Shells fly over water. Tanks do not.' },
  { name: 'THE FORTRESS', map: 8, waves: [{ e: { hunter: 2, defensive: 2 } }, { e: { heavy: 2, aggressive: 2 } }, { e: { sniper: 2, hunter: 2, basic: 1 } }, { e: { defensive: 2, heavy: 1, aggressive: 2 } }], tip: 'Long corridors: perfect for ricochets. Yours and theirs.' },
  { name: 'BOSS: JUGGERNAUT', map: 9, boss: 'juggernaut', waves: [], tip: 'JUGGERNAUT charges and calls reinforcements. Stay out of its path.' },
  { name: 'SCRAPYARD', map: 2, waves: [{ e: { hunter: 2, aggressive: 2, basic: 1 } }, { e: { heavy: 2, sniper: 1, defensive: 1 } }, { e: { aggressive: 4, hunter: 1 } }, { e: { sniper: 2, heavy: 1, defensive: 2 } }] },
  { name: 'NIGHT MARKET', map: 6, waves: [{ e: { defensive: 3, sniper: 1 } }, { e: { hunter: 3, aggressive: 2 } }, { e: { heavy: 2, basic: 3 } }, { e: { sniper: 2, hunter: 2, aggressive: 2 } }] },
  { name: 'FLOODPLAIN', map: 7, waves: [{ e: { sniper: 3, basic: 2 } }, { e: { heavy: 2, hunter: 2 } }, { e: { aggressive: 5 } }, { e: { defensive: 2, sniper: 2, heavy: 1 } }] },
  { name: 'SIEGE', map: 8, waves: [{ e: { heavy: 2, defensive: 2 } }, { e: { hunter: 3, sniper: 2 } }, { e: { aggressive: 4, heavy: 1 } }, { e: { sniper: 2, hunter: 2, heavy: 2 } }] },
  { name: 'BOSS: RICOCHET REBORN', map: 4, boss: 'ricochet', bossMult: 1.8, minions: 'hunter', waves: [], tip: 'He is back, faster and angrier. Bouncers join the fight.' },
];
const ENDLESS_MAPS = [1, 2, 3, 5, 6, 7, 8];
function getLevel(i) {
  if (i < LEVELS.length) return LEVELS[i];
  const n = i - LEVELS.length; // endless
  if ((i + 1) % 5 === 0) {
    const bossKind = ((i + 1) / 5) % 2 === 0 ? 'juggernaut' : 'ricochet';
    return { name: 'BOSS: ' + BOSS_DEFS[bossKind].name + ' ' + toRoman(Math.floor((i + 1) / 5)), map: bossKind === 'ricochet' ? 4 : 9, boss: bossKind, bossMult: 1.5 + n * 0.12, minions: 'hunter', waves: [] };
  }
  const map = ENDLESS_MAPS[n % ENDLESS_MAPS.length];
  const types = ['basic', 'aggressive', 'defensive', 'sniper', 'heavy', 'hunter'];
  const rng = mulberry32(i * 7919);
  const waves = [];
  const nWaves = 4 + Math.min(3, Math.floor(n / 3));
  for (let w = 0; w < nWaves; w++) {
    const e = {}; let count = 4 + Math.floor(n / 2) + w;
    count = Math.min(count, 8);
    for (let k = 0; k < count; k++) { const t = types[Math.floor(rng() * types.length)]; e[t] = (e[t] || 0) + 1; }
    waves.push({ e });
  }
  return { name: 'WARZONE ' + (n + 1), map, waves };
}
function toRoman(n) { const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']; return r[n] || String(n); }
/* difficulty scaling by level index (0-based) */
function levelScale(i) {
  return { hp: 1 + 0.08 * i, dmg: 1 + 0.04 * i, speed: Math.min(1.3, 1 + 0.015 * i), coins: 1 + 0.1 * i, err: Math.max(0.45, 1 - 0.035 * i), fire: Math.max(0.65, 1 - 0.02 * i) };
}

/* ---------- final stats from selected tank + permanent upgrades ---------- */
function playerStats(save) {
  const tk = TANK_BY_ID[save.tank] || TANK_BY_ID.t34; const st = save.up; const pk = tk.perk || {};
  return { tank: tk, hp: tk.hp + 20 * st.health, speed: Math.round(tk.speed * (1 + 0.07 * st.speed)), dmg: Math.round(tk.dmg * (1 + 0.15 * st.damage) * 10) / 10, fireInt: tk.fireInt * (1 - 0.08 * st.fireRate),
    shots: Math.min(5, st.shot + 1 + (pk.shots || 0)), bounces: st.bounce + (pk.bounce || 0), armor: Math.min(0.6, st.armor * 0.06 + (pk.armor || 0)), bSpeed: PLAYER_BASE.bSpeed * (pk.bSpeed || 1), bossDmg: pk.bossDmg || 1, magnet: pk.magnet || 1, coin: pk.coin || 1, scale: tk.scale, radius: tankRadius(tk, tk.scale) };
}
function petStats(save) {
  const tk = TANK_BY_ID[save.petTank] || TANK_BY_ID.stuart; const st = save.pet; const pk = tk.perk || {}; const sc = tk.scale * 0.75;
  return { tank: tk, hp: Math.round(tk.hp * 0.6 + 25 * st.health), speed: Math.round((tk.speed + 15) * (1 + 0.08 * st.speed)), dmg: Math.round(tk.dmg * 0.6 * (1 + 0.2 * st.damage) * 10) / 10, fireInt: tk.fireInt * 1.6 * (1 - 0.1 * st.fireRate),
    shots: Math.min(5, st.shot + 1 + (pk.shots || 0)), bounces: pk.bounce || 0, armor: pk.armor || 0, bSpeed: PET_BASE.bSpeed * (pk.bSpeed || 1), bossDmg: pk.bossDmg || 1, scale: sc, radius: tankRadius(tk, sc) };
}
