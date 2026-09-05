'use strict';
/* ============================================================
   Game: world simulation, ricochet physics, effects, camera, HUD
   ============================================================ */
class Game {
  constructor(app) {
    this.app = app; this.save = app.save; this.canvas = document.getElementById('game'); this.g = this.canvas.getContext('2d');
    this.bullets = new Pool(() => new Bullet()); this.particles = new Pool(() => new Particle()); this.coins = new Pool(() => new Coin()); this.texts = new Pool(() => new FloatText()); this.fx = new Pool(() => new SpriteFX());
    this.cam = { x: 0, y: 0, zoom: 1, shake: 0, sx: 0, sy: 0 }; this.time = 0; this.hitFlash = 0; this.tracks = []; this.trackHead = 0; this.MAX_TRACKS = 600; this.state = 'idle'; this.announceT = 0; this.announceText = ''; this.rings = [];
    this.vw = 1280; this.vh = 720; this.lowFx = false;
  }
  resize(w, h) { this.vw = w; this.vh = h; }
  /* ---------- level lifecycle ---------- */
  startLevel(idx) {
    this.levelIdx = idx; this.level = getLevel(idx); this.scale = levelScale(idx); this.map = new GameMap(this.level.map); this.map.buildWallMap();
    this.props = this.map.props.map(p => Object.assign({ dead: false, flash: 0 }, p)); this.map.updatePropGrid(this.props);
    this.enemies = []; this.bullets.clear(); this.particles.clear(); this.coins.clear(); this.texts.clear(); this.fx.clear(); this.tracks = []; this.trackHead = 0; this.rings = [];
    const ps = this.map.playerSpawn; this.player = new Player(this, ps.x, ps.y); this.pet = this.save.petUnlocked ? new Pet(this, ps.x - 60, ps.y + 40) : null;
    this.boss = null; this.waveIdx = 0; this.waveT = 0; this.pendingSpawns = []; this.spawnT = 0; this.killed = 0; this.coinsEarned = 0; this.elapsed = 0; this.state = 'play'; this.endT = 0; this.totalEnemies = this.level.waves.reduce((s, w) => s + Object.values(w.e).reduce((a, b) => a + b, 0), 0);
    this.cam.x = ps.x; this.cam.y = ps.y; this.cam.zoom = this.computeZoom(); this.flowT = 0; this.map.computeFlow(ps.x, ps.y);
    this.spawnUsage = new Map();
    if (this.level.boss) { const bs = this.map.bossSpawn || { x: this.map.W / 2, y: this.map.H / 3 }; this.boss = new Boss(this, this.level.boss, bs.x, bs.y, this.level.bossMult || 1, idx); this.enemies.push(this.boss); this.announce(this.boss.name, this.boss.D.tint, 2.5); Audio_.play('bossRoar'); Audio_.startMusic('boss'); }
    else { this.startWave(0); Audio_.startMusic('battle'); }
    if (this.level.tip) this.app.showTip(this.level.tip);
    this.announce(this.level.name, '#ffd166', 2.2);
  }
  computeZoom() { const base = Math.min(this.vw / 1000, this.vh / 600); let z = clamp(base, 0.6, 1.4); if (this.level && this.level.boss) z *= 0.82; if (Input.touch) z *= 0.9; return z; }
  startWave(i) {
    const w = this.level.waves[i]; if (!w) return; this.waveIdx = i; const list = [];
    for (const t in w.e) for (let k = 0; k < w.e[t]; k++) list.push(t);
    list.sort(() => Math.random() - 0.5); this.pendingSpawns = list; this.spawnT = 0.2; if (i > 0) { Audio_.play('waveStart'); this.announce('WAVE ' + (i + 1) + ' / ' + this.level.waves.length, '#ff9060', 1.4); }
  }
  pickSpawn() {
    const P = this.player; const cands = this.map.enemySpawns.slice().filter(s => dist(s.x, s.y, P.x, P.y) > 380);
    const pool = cands.length ? cands : this.map.enemySpawns; let best = null, bs = -1e9;
    for (const s of pool) { const score = dist(s.x, s.y, P.x, P.y) * 0.3 - (this.spawnUsage.get(s) || 0) * 200 + Math.random() * 150; if (score > bs) { bs = score; best = s; } }
    this.spawnUsage.set(best, (this.spawnUsage.get(best) || 0) + 1); return best;
  }
  spawnEnemyAt(type, spot) {
    const s = spot || this.pickSpawn(); if (!s) return; const e = new Enemy(this, type, s.x + rand(-20, 20), s.y + rand(-20, 20), this.scale);
    // nudge off walls
    for (let i = 0; i < 12 && e.collides(e.x, e.y, e.radius); i++) { e.x = s.x + rand(-50, 50); e.y = s.y + rand(-50, 50); }
    this.enemies.push(e); this.ring(e.x, e.y, 'rgba(255,80,60,0.8)', 40); this.smoke(e.x, e.y, 1, 1.5); return e;
  }
  allTanks() { const a = [this.player]; if (this.pet && !this.pet.dead) a.push(this.pet); for (const e of this.enemies) if (!e.dead) a.push(e); return a; }
  target(enemy) { // enemies target the player mostly; sometimes the pet if closer
    const P = this.player; if (this.pet && !this.pet.dead && Math.random() < 0.0) return this.pet; if (this.pet && !this.pet.dead && enemy.petBias && dist(enemy.x, enemy.y, this.pet.x, this.pet.y) < dist(enemy.x, enemy.y, P.x, P.y) * 0.6) return this.pet; return P.dead ? null : P;
  }
  leadAngle(shooter, tgt, bSpeed, factor = 1) {
    const dx = tgt.x - shooter.x, dy = tgt.y - shooter.y; const tvx = (tgt.x - (tgt.lastX ?? tgt.x)) * 60, tvy = (tgt.y - (tgt.lastY ?? tgt.y)) * 60; const d = Math.hypot(dx, dy); const t = d / bSpeed * factor;
    return Math.atan2(dy + tvy * t, dx + tvx * t);
  }
  /* ---------- per-frame update ---------- */
  update(dt) {
    if (this.state !== 'play' && this.state !== 'ending') return;
    this.time += dt; this.elapsed += dt; if (this.hitFlash > 0) this.hitFlash -= dt; if (this.announceT > 0) this.announceT -= dt;
    // flow field toward player (for enemy pathing) every 0.35s
    this.flowT -= dt; if (this.flowT <= 0) { this.flowT = 0.35; this.map.updatePropGrid(this.props); this.map.computeFlow(this.player.x, this.player.y); }
    // spawning
    if (this.pendingSpawns.length) { this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnT = 0.55; this.spawnEnemyAt(this.pendingSpawns.pop(), null); } }
    else if (!this.level.boss && this.state === 'play') {
      const alive = this.enemies.filter(e => !e.dead).length; this.waveT += dt;
      if (this.waveIdx < this.level.waves.length - 1 && (alive <= 1 || this.waveT > 40)) { this.waveT = 0; this.startWave(this.waveIdx + 1); }
      else if (this.waveIdx >= this.level.waves.length - 1 && alive === 0) this.levelComplete();
    }
    // entities
    if (!this.player.dead) this.player.update(dt);
    if (this.pet) this.pet.update(dt);
    for (const e of this.enemies) if (!e.dead) e.update(dt);
    this.updateBullets(dt); this.updateParticles(dt); this.updateCoins(dt); this.updateTexts(dt); this.updateFX(dt);
    for (const p of this.props) if (p.flash > 0) p.flash -= dt;
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t > r.dur) this.rings.splice(i, 1); }
    // remove dead enemies
    if (this.enemies.length > 40) this.enemies = this.enemies.filter(e => !e.dead);
    // camera
    const P = this.player; let tx = P.x, ty = P.y;
    if (P.aimX !== undefined) { tx += (P.aimX - P.x) * 0.18; ty += (P.aimY - P.y) * 0.18; }
    if (this.boss && !this.boss.dead && this.level.boss) { tx = lerp(tx, this.boss.x, 0.2); ty = lerp(ty, this.boss.y, 0.2); }
    const z = this.cam.zoom; const hw = this.vw / 2 / z, hh = this.vh / 2 / z;
    tx = clamp(tx, hw, this.map.W - hw); ty = clamp(ty, hh, this.map.H - hh); if (this.map.W < hw * 2) tx = this.map.W / 2; if (this.map.H < hh * 2) ty = this.map.H / 2;
    const k = 1 - Math.pow(0.001, dt); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    if (this.cam.shake > 0) { this.cam.shake = Math.max(0, this.cam.shake - dt * 30); this.cam.sx = rand(-1, 1) * this.cam.shake; this.cam.sy = rand(-1, 1) * this.cam.shake; } else { this.cam.sx = 0; this.cam.sy = 0; }
    if (this.state === 'ending') { this.endT -= dt; if (this.endT <= 0) this.app.onLevelEnd(this.endResult); }
  }
  shake(a) { this.cam.shake = Math.min(12, Math.max(this.cam.shake, a)); }
  /* ---------- bullets & ricochet ---------- */
  spawnBullet(x, y, ang, speed, dmg, owner, bounces, opts) { const b = this.bullets.get(); b.init(x, y, ang, speed, dmg, owner, bounces, opts); return b; }
  updateBullets(dt) {
    const map = this.map; const B = this.bullets;
    for (let i = 0; i < B.n; i++) {
      const b = B.items[i]; b.age += dt; b.life -= dt; if (b.life <= 0) { this.puff(b.x, b.y); B.release(i); i--; continue; }
      // sub-step for fast bullets so they can't tunnel through 64px walls
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 10)); const sdt = dt / steps; let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        b.px = b.x; b.py = b.y; b.x += b.vx * sdt; b.y += b.vy * sdt;
        // walls
        const w = map.circleVsWalls(b.x, b.y, b.r, true); let hitProp = null;
        if (!w) for (const p of this.props) { if (p.dead || !p.solid || p.low) continue; if (Math.abs(b.x - p.x) < p.w / 2 + b.r && Math.abs(b.y - p.y) < p.h / 2 + b.r) { hitProp = p; break; } }
        if (w || hitProp) {
          const rect = w ? w : { x: hitProp.x - hitProp.w / 2, y: hitProp.y - hitProp.h / 2, w: hitProp.w, h: hitProp.h };
          const wall = w ? map.wallAt(w.cx, w.cy) : null; const canBounce = w ? (!wall || wall.bounce) : hitProp.bounce;
          // compute normal from previous position
          const nx = this.reflectNormal(b, rect);
          if (hitProp) this.damageProp(hitProp, b.dmg, b);
          if (b.bounces > 0 && canBounce) {
            b.bounces--; b.bounced = true; if (nx.x) b.vx = -b.vx; else b.vy = -b.vy; b.x = b.px + (nx.x ? 0 : b.vx * sdt); b.y = b.py + (nx.y ? 0 : b.vy * sdt);
            // push out of the wall
            if (nx.x) b.x = nx.x > 0 ? rect.x + rect.w + b.r + 0.5 : rect.x - b.r - 0.5; else b.y = nx.y > 0 ? rect.y + rect.h + b.r + 0.5 : rect.y - b.r - 0.5;
            b.ang = Math.atan2(b.vy, b.vx); this.sparks(b.x, b.y, nx, b.color); Audio_.play('ricochet', 0.8);
          } else { this.impact(b.x - (b.x - b.px) * 0.5, b.y - (b.y - b.py) * 0.5, canBounce ? 'A' : 'B', b.big ? 1.3 : 0.9); Audio_.play('hitWall', 0.5); dead = true; }
          continue;
        }
        // bounds
        if (b.x < 0 || b.y < 0 || b.x > map.W || b.y > map.H) { dead = true; continue; }
        // tanks
        const hit = this.bulletVsTanks(b); if (hit) { dead = true; continue; }
      }
      if (dead) { B.release(i); i--; continue; }
      if (!this.lowFx) { b.trail.push(b.x, b.y); if (b.trail.length > (b.big ? 16 : 10)) b.trail.splice(0, 2); }
    }
  }
  reflectNormal(b, rect) { // which face was crossed: compare previous position against rect
    const left = b.px < rect.x - b.r * 0.5, right = b.px > rect.x + rect.w + b.r * 0.5, top = b.py < rect.y - b.r * 0.5, bottom = b.py > rect.y + rect.h + b.r * 0.5;
    if ((left || right) && !(top || bottom)) return { x: left ? -1 : 1, y: 0 }; if ((top || bottom) && !(left || right)) return { x: 0, y: top ? -1 : 1 };
    // corner: pick axis with greater penetration time
    const tx = b.vx !== 0 ? ((b.vx > 0 ? rect.x : rect.x + rect.w) - b.px) / b.vx : Infinity, ty = b.vy !== 0 ? ((b.vy > 0 ? rect.y : rect.y + rect.h) - b.py) / b.vy : Infinity;
    if (Math.abs(tx) > Math.abs(ty)) return { x: b.vx > 0 ? -1 : 1, y: 0 }; return { x: 0, y: b.vy > 0 ? -1 : 1 };
  }
  bulletVsTanks(b) {
    const targets = b.team === 'player' ? this.enemies : (this.pet && !this.pet.dead ? [this.player, this.pet] : [this.player]);
    for (const t of targets) {
      if (t.dead) continue; if (t === b.owner && b.age < 0.3) continue; if (t.isBoss && t.introT > 0) continue;
      const rr = t.radius + b.r; if (Math.abs(b.x - t.x) > rr || Math.abs(b.y - t.y) > rr) continue; if ((b.x - t.x) ** 2 + (b.y - t.y) ** 2 > rr * rr) continue;
      // hit!
      let dmg = b.dmg; if (t.isBoss && b.owner.bossDmg) dmg *= b.owner.bossDmg; if (b.bounced && b.owner.isPlayer) { dmg *= 1.25; this.floatText(b.x, b.y - 20, 'RICOCHET!', '#ffd166', 0.9); }
      if (b.owner.isPlayer) this.player.shotsHit++;
      t.takeDamage(dmg, b.owner); this.impact(b.x, b.y, 'A', b.big ? 1.2 : 0.8); this.puffColored(b.x, b.y, b.color);
      // boss self-hit? bounce shells of the boss can hit enemies too (fun!) - handled: player bullets hit enemies only.
      return true;
    }
    // player-owned bullets also destroy enemy bullets of bosses? no. But player bullets can hit enemy bullets - skip for perf.
    return false;
  }
  damageProp(p, dmg, b) {
    if (p.hp === Infinity) return; p.hp -= dmg; p.flash = 0.1;
    if (p.hp <= 0) { p.dead = true; if (p.explosive) { this.explode(p.x, p.y, 1.3); Audio_.play('explode'); this.shake(5); this.areaDamage(p.x, p.y, 110, 45, null); this.decal(p.x, p.y, 'crater'); } else { this.debris(p.x, p.y, '#a8743c', 14); Audio_.play('hitWall'); this.floatText(p.x, p.y - 20, Math.random() < 0.3 ? '+5' : '', '#ffd166'); if (Math.random() < 0.3) this.dropCoins(p.x, p.y, 5); } this.map.updatePropGrid(this.props); }
  }
  areaDamage(x, y, r, dmg, from) { for (const t of this.allTanks()) { const d = dist(x, y, t.x, t.y); if (d < r + t.radius) { const f = 1 - clamp((d - t.radius) / r, 0, 1); t.takeDamage(dmg * (0.4 + 0.6 * f), from || { team: 'neutral' }); } } for (const p of this.props) { if (p.dead || p.hp === Infinity) continue; if (dist(x, y, p.x, p.y) < r) this.damageProp(p, dmg, null); } }
  /* ---------- events ---------- */
  onEnemyKilled(e, from) {
    this.killed++; this.explode(e.x, e.y, e.scale * 0.8); Audio_.play('explode'); this.shake(4); this.debris(e.x, e.y, '#333', 10); this.decal(e.x, e.y, 'crater');
    this.dropCoins(e.x, e.y, e.coins); if (Math.random() < 0.25) this.floatText(e.x, e.y - 40, pick(['DESTROYED!', 'BOOM!', 'WRECKED!']), '#ffd166', 1.1);
  }
  onBossKilled(b, from) {
    this.killed++; Audio_.play('bigExplode'); this.shake(12); this.dropCoins(b.x, b.y, b.coins); this.decal(b.x, b.y, 'crater');
    for (let i = 0; i < 7; i++) setTimeout(() => { if (this.state === 'idle') return; this.explode(b.x + rand(-50, 50), b.y + rand(-50, 50), 1.2 + Math.random()); Audio_.play('explode'); this.shake(6); }, i * 180);
    this.announce(b.name + ' DESTROYED!', '#ffd166', 3); this.state = 'ending'; this.endT = 2.6; this.endResult = 'win';
    Audio_.play('levelComplete');
  }
  onPlayerDeath() { this.explode(this.player.x, this.player.y, 1.4); Audio_.play('bigExplode'); this.shake(12); Audio_.stopMusic(); this.state = 'ending'; this.endT = 2.2; this.endResult = 'lose'; Audio_.play('gameOver'); }
  levelComplete() { if (this.state !== 'play') return; this.state = 'ending'; this.endT = 1.6; this.endResult = 'win'; Audio_.play('levelComplete'); this.announce('LEVEL COMPLETE!', '#7fff7f', 2); // auto-collect remaining coins
    for (let i = 0; i < this.coins.n; i++) this.coins.items[i].magnet = true; }
  /* ---------- coins ---------- */
  dropCoins(x, y, amount) {
    let n = amount >= 100 ? 12 : amount >= 30 ? 6 : amount >= 15 ? 4 : 2; const each = Math.floor(amount / n); let rem = amount - each * n;
    for (let i = 0; i < n; i++) { const c = this.coins.get(); const a = rand(TAU), sp = rand(60, 200); c.x = x; c.y = y; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp; c.z = 0; c.vz = rand(120, 260); c.value = each + (rem-- > 0 ? 1 : 0); c.life = 20; c.frame = rand(6); c.magnet = false; c.t = 0; }
  }
  updateCoins(dt) {
    const P = this.player; const C = this.coins;
    for (let i = 0; i < C.n; i++) {
      const c = C.items[i]; c.life -= dt; c.t += dt; c.frame += dt * 10; if (c.life <= 0) { C.release(i); i--; continue; }
      if (c.z > 0 || c.vz > 0) { c.vz -= 700 * dt; c.z += c.vz * dt; if (c.z < 0) { c.z = 0; c.vz = -c.vz * 0.4; if (Math.abs(c.vz) < 40) c.vz = 0; } }
      const d = dist(c.x, c.y, P.x, P.y); const magR = (130 + this.save.up.speed * 10) * (P.magnet || 1);
      if ((d < magR || c.magnet) && !P.dead) { const sp = clamp(500 - d * 1.2, 220, 700) * (c.magnet ? 1.6 : 1); c.vx = (P.x - c.x) / d * sp; c.vy = (P.y - c.y) / d * sp; c.z = Math.max(0, c.z - 300 * dt); }
      else { c.vx *= 1 - 4 * dt; c.vy *= 1 - 4 * dt; }
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt; if (!this.map.circleVsWalls(nx, ny, 6)) { c.x = nx; c.y = ny; } else { c.vx = -c.vx * 0.5; c.vy = -c.vy * 0.5; }
      if (d < P.radius + 8 && !P.dead) { this.collectCoin(c); C.release(i); i--; }
    }
  }
  collectCoin(c) { const v = Math.max(1, Math.round(c.value * (this.player.coinMult || 1))); this.coinsEarned += v; this.save.coins += v; this.app.coinPop(); Audio_.play('coin'); this.floatText(this.player.x + rand(-14, 14), this.player.y - 34, '+' + v, '#ffd166', 0.7, true); for (let i = 0; i < 3; i++) this.spark(c.x, c.y, '#ffd166'); }
  /* ---------- effects ---------- */
  smoke(x, y, alpha, size) { if (this.particles.n > 500) return; const p = this.particles.get(); p.type = 'smoke'; p.x = x; p.y = y; p.vx = rand(-12, 12); p.vy = rand(-20, -6); p.life = p.maxLife = rand(0.5, 0.9); p.size = 5 * size; p.alpha = alpha * 0.5; p.color = null; p.grow = 14; }
  puff(x, y) { for (let i = 0; i < 3; i++) this.smoke(x, y, 0.5, 0.6); }
  puffColored(x, y, color) { for (let i = 0; i < 4; i++) { const p = this.particles.get(); p.type = 'dot'; p.x = x; p.y = y; const a = rand(TAU), s = rand(40, 160); p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = p.maxLife = rand(0.15, 0.35); p.size = 3; p.color = color; p.alpha = 1; } }
  spark(x, y, color) { if (this.particles.n > 500) return; const p = this.particles.get(); p.type = 'spark'; p.x = x; p.y = y; const a = rand(TAU), s = rand(60, 220); p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = p.maxLife = rand(0.2, 0.45); p.size = 2; p.color = color; p.alpha = 1; }
  sparks(x, y, n, color) { const base = Math.atan2(n.y, n.x); for (let i = 0; i < 7; i++) { const p = this.particles.get(); p.type = 'spark'; p.x = x; p.y = y; const a = base + rand(-1.2, 1.2), s = rand(100, 300); p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = p.maxLife = rand(0.15, 0.4); p.size = 2.5; p.color = i % 2 ? '#fff6c0' : color; p.alpha = 1; } this.ring(x, y, color, 14, 0.25); }
  debris(x, y, color, n) { for (let i = 0; i < n; i++) { const p = this.particles.get(); p.type = 'debris'; p.x = x; p.y = y; const a = rand(TAU), s = rand(80, 260); p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = p.maxLife = rand(0.4, 0.9); p.size = rand(3, 6); p.color = color; p.alpha = 1; p.rot = rand(TAU); p.vr = rand(-10, 10); } }
  explode(x, y, size) { const f = this.fx.get(); f.frames = Assets.fx.explosion; f.x = x; f.y = y; f.t = 0; f.fps = 22; f.scale = 0.7 * size; f.rot = rand(TAU); f.add = false; this.debris(x, y, '#444', 8); for (let i = 0; i < 6; i++) { this.smoke(x + rand(-20, 20) * size, y + rand(-20, 20) * size, 0.7, 1.6 * size); } this.ring(x, y, '#ffb050', 30 * size, 0.35); for (let i = 0; i < 8; i++) this.spark(x, y, '#ffcc60'); }
  impact(x, y, kind, size) { const f = this.fx.get(); f.frames = Assets.fx[kind === 'A' ? 'impactA' : 'impactB']; f.x = x; f.y = y; f.t = 0; f.fps = 24; f.scale = 0.35 * size; f.rot = rand(TAU); f.add = true; }
  muzzleFlash(x, y, ang, size) { const f = this.fx.get(); f.frames = Assets.fx.shotA; f.x = x; f.y = y; f.t = 0; f.fps = 40; f.scale = 0.28 * size; f.rot = ang + Math.PI / 2; f.add = true; for (let i = 0; i < 2; i++) this.smoke(x, y, 0.4, 0.7); }
  ring(x, y, color, r = 60, dur = 0.5) { this.rings.push({ x, y, color, r, t: 0, dur }); }
  floatText(x, y, text, color, dur = 1, small = false) { if (!text) return; const t = this.texts.get(); t.x = x; t.y = y; t.text = text; t.color = color; t.life = t.maxLife = dur; t.vy = -40; t.small = small; }
  announce(text, color = '#fff', dur = 1.5) { this.announceText = text; this.announceColor = color; this.announceT = dur; this.announceDur = dur; }
  decal(x, y, kind) { this.tracks.push({ x, y, decal: kind, s: rand(0.7, 1.1), rot: rand(TAU) }); }
  addTrack(t) { if (this.lowFx) return; const a = t.bodyAng; const w = t.def.w * t.scale * 0.42; const tr = { x: t.x, y: t.y, a, w, life: 6 }; if (this.tracks.length < this.MAX_TRACKS) this.tracks.push(tr); else { this.tracks[this.trackHead] = tr; this.trackHead = (this.trackHead + 1) % this.MAX_TRACKS; } }
  updateParticles(dt) { const P = this.particles; for (let i = 0; i < P.n; i++) { const p = P.items[i]; p.life -= dt; if (p.life <= 0) { P.release(i); i--; continue; } p.x += p.vx * dt; p.y += p.vy * dt; if (p.type === 'smoke') { p.size += p.grow * dt; p.vx *= 1 - dt; } else if (p.type === 'debris') { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; p.rot += p.vr * dt; } else if (p.type === 'spark') { p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt; } } }
  updateTexts(dt) { const T = this.texts; for (let i = 0; i < T.n; i++) { const t = T.items[i]; t.life -= dt; if (t.life <= 0) { T.release(i); i--; continue; } t.y += t.vy * dt; t.vy *= 1 - 2 * dt; } }
  updateFX(dt) { const F = this.fx; for (let i = 0; i < F.n; i++) { const f = F.items[i]; f.t += dt; if (f.t * f.fps >= f.frames.length) { F.release(i); i--; } } }
  /* ---------- rendering ---------- */
  draw() {
    const g = this.g; const W = this.vw, H = this.vh; const cam = this.cam;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#1a1a22'; g.fillRect(0, 0, W, H);
    if (this.state === 'idle') return;
    g.save(); g.translate(W / 2 + cam.sx, H / 2 + cam.sy); g.scale(cam.zoom, cam.zoom); g.translate(-cam.x, -cam.y);
    const vx0 = cam.x - W / 2 / cam.zoom - 80, vy0 = cam.y - H / 2 / cam.zoom - 80, vx1 = cam.x + W / 2 / cam.zoom + 80, vy1 = cam.y + H / 2 / cam.zoom + 80;
    const vis = (x, y, m = 60) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;
    // baked map (ground + walls + decals); outside the arena: dark void with a stone border glow
    g.fillStyle = '#14161c'; g.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    const sx = clamp(vx0, 0, this.map.W), sy = clamp(vy0, 0, this.map.H), ex = clamp(vx1, 0, this.map.W), ey = clamp(vy1, 0, this.map.H);
    if (ex > sx && ey > sy) g.drawImage(this.map.baked, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    // animated water shimmer
    if (this.map.waters.length) { const fr = Assets.props.water[Math.floor(this.time * 2) % 2]; g.globalAlpha = 0.5; for (const w of this.map.waters) { const x = w.x * CELL, y = w.y * CELL; if (vis(x, y)) g.drawImage(fr, x, y); } g.globalAlpha = 1; }
    // tracks & decals
    g.fillStyle = 'rgba(30,20,10,0.16)';
    for (const t of this.tracks) { if (!vis(t.x, t.y)) continue; if (t.decal) { const im = Assets.props[t.decal]; g.save(); g.translate(t.x, t.y); g.rotate(t.rot); g.scale(t.s, t.s); g.drawImage(im, -im.width / 2, -im.height / 2); g.restore(); continue; } g.save(); g.translate(t.x, t.y); g.rotate(t.a); g.fillRect(-4, -t.w - 3, 8, 5); g.fillRect(-4, t.w - 2, 8, 5); g.restore(); }
    // props (crates, barrels, rocks, sandbags)
    for (const p of this.props) { if (p.dead || p.invisible || !vis(p.x, p.y)) continue; const im = Assets.props[p.kind]; if (!im) continue; g.save(); g.translate(p.x, p.y); if (p.kind === 'rock') g.rotate(0); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-p.w / 2 + 4, -p.h / 2 + 5, p.w, p.h); g.drawImage(im, -im.width / 2, -im.height / 2); if (p.flash > 0) { g.globalAlpha = p.flash * 6; g.fillStyle = '#fff'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); } g.restore(); }
    // coins
    const CF = Assets.coin; for (let i = 0; i < this.coins.n; i++) { const c = this.coins.items[i]; if (!vis(c.x, c.y)) continue; const f = CF[Math.floor(c.frame) % 6]; g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(c.x, c.y + 6, 7, 3, 0, 0, TAU); g.fill(); const blink = c.life < 4 && Math.floor(c.life * 8) % 2 === 0; if (!blink) g.drawImage(f, c.x - 10, c.y - 10 - c.z * 0.5); }
    // rings
    for (const r of this.rings) { const p = r.t / r.dur; g.globalAlpha = 1 - p; g.strokeStyle = r.color; g.lineWidth = 3 * (1 - p) + 1; g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + p * 0.7) + 4, 0, TAU); g.stroke(); } g.globalAlpha = 1;
    // enemy extras (telegraph lines) under tanks
    for (const e of this.enemies) if (!e.dead && e.drawExtra) e.drawExtra(g);
    // tanks
    for (const e of this.enemies) if (!e.dead && vis(e.x, e.y, 120)) e.draw(g);
    if (this.pet && !this.pet.dead) this.pet.draw(g);
    if (!this.player.dead) this.player.draw(g);
    // bullets
    for (let i = 0; i < this.bullets.n; i++) { const b = this.bullets.items[i]; if (!vis(b.x, b.y)) continue;
      if (b.trail.length >= 4) { g.strokeStyle = b.color; g.lineCap = 'round'; for (let k = 0; k < b.trail.length - 2; k += 2) { g.globalAlpha = (k / b.trail.length) * 0.5; g.lineWidth = (k / b.trail.length) * b.r * 1.4 + 1; g.beginPath(); g.moveTo(b.trail[k], b.trail[k + 1]); g.lineTo(b.trail[k + 2], b.trail[k + 3]); g.stroke(); } g.globalAlpha = 1; }
      g.save(); g.translate(b.x, b.y); g.rotate(b.ang); g.fillStyle = b.color; g.shadowColor = b.color; g.shadowBlur = this.lowFx ? 0 : 10; g.beginPath(); g.ellipse(0, 0, b.r * 1.6, b.r, 0, 0, TAU); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(b.r * 0.4, 0, b.r * 0.7, b.r * 0.45, 0, 0, TAU); g.fill(); g.restore(); }
    // particles
    const P = this.particles;
    for (let i = 0; i < P.n; i++) { const p = P.items[i]; if (!vis(p.x, p.y)) continue; const lf = p.life / p.maxLife;
      if (p.type === 'smoke') { g.globalAlpha = p.alpha * lf; g.fillStyle = '#bbb'; g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill(); }
      else if (p.type === 'spark' || p.type === 'dot') { g.globalAlpha = lf; g.fillStyle = p.color; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      else { g.globalAlpha = Math.min(1, lf * 2); g.fillStyle = p.color; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); g.restore(); } }
    g.globalAlpha = 1;
    // sprite fx (explosions, impacts, muzzle flashes)
    for (let i = 0; i < this.fx.n; i++) { const f = this.fx.items[i]; const fr = f.frames[Math.min(f.frames.length - 1, Math.floor(f.t * f.fps))]; if (!fr || !vis(f.x, f.y, 150)) continue; g.save(); g.translate(f.x, f.y); g.rotate(f.rot); g.scale(f.scale, f.scale); if (f.add) g.globalCompositeOperation = 'lighter'; g.drawImage(fr.img, fr.ox, fr.oy); g.restore(); }
    // hp bars
    for (const e of this.enemies) if (!e.dead && !e.isBoss && vis(e.x, e.y)) e.drawHpBar(g);
    if (this.pet && !this.pet.dead) this.pet.drawHpBar(g, 36);
    // overlays (trees) above everything
    for (const o of this.map.overlays) { if (!vis(o.x, o.y, 100)) continue; const im = Assets.props.tree; g.save(); g.translate(o.x, o.y); g.rotate(o.rot + Math.sin(this.time * 1.3 + o.x) * 0.02); g.scale(o.s, o.s); g.globalAlpha = dist(o.x, o.y, this.player.x, this.player.y) < 70 ? 0.45 : 0.95; g.drawImage(im, -im.width / 2, -im.height / 2); g.restore(); }
    g.globalAlpha = 1;
    // aim reticle (desktop)
    if (Input.aimMode === 'mouse' && !this.player.dead) { const px = this.player.aimX, py = this.player.aimY; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 9, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(px - 14, py); g.lineTo(px - 5, py); g.moveTo(px + 5, py); g.lineTo(px + 14, py); g.moveTo(px, py - 14); g.lineTo(px, py - 5); g.moveTo(px, py + 5); g.lineTo(px, py + 14); g.stroke(); if (this.player.cooldown > 0) { g.strokeStyle = '#ffd166'; g.beginPath(); g.arc(px, py, 13, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - this.player.cooldown / this.player.fireInt)); g.stroke(); } }
    // floating texts
    for (let i = 0; i < this.texts.n; i++) { const t = this.texts.items[i]; if (!vis(t.x, t.y)) continue; const lf = t.life / t.maxLife; g.globalAlpha = Math.min(1, lf * 3); g.font = (t.small ? 'bold 14px' : 'bold 20px') + ' "Press Start 2P", monospace'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(t.text, t.x, t.y); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y); }
    g.globalAlpha = 1;
    g.restore();
    // screen-space: hit flash vignette
    if (this.hitFlash > 0) { g.fillStyle = `rgba(255,30,30,${this.hitFlash * 0.6})`; g.fillRect(0, 0, W, H); }
    if (!this.player.dead && this.player.hp < this.player.maxHp * 0.25) { const a = (Math.sin(this.time * 6) * 0.5 + 0.5) * 0.25; const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75); gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,0,0,${a})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    // announcement
    if (this.announceT > 0) { const p = this.announceT / this.announceDur; const a = p > 0.85 ? (1 - p) / 0.15 : p < 0.25 ? p / 0.25 : 1; g.globalAlpha = a; g.font = 'bold 34px "Press Start 2P", monospace'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.85)'; const y = H * 0.32; g.strokeText(this.announceText, W / 2, y); g.fillStyle = this.announceColor; g.fillText(this.announceText, W / 2, y); g.globalAlpha = 1; }
  }
}
