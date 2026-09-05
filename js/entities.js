'use strict';
/* ============================================================
   Entities: Tank base, Player, Pet, Enemy (4 behaviors + 2 extra),
   Boss (Ricochet, Juggernaut), Bullet, Particles, Coins, Effects
   ============================================================ */

/* ---------- Bullets (pooled) ---------- */
class Bullet {
  constructor() { this.active = false; this.trail = []; }
  init(x, y, ang, speed, dmg, owner, bounces, opts = {}) {
    this.x = x; this.y = y; this.px = x; this.py = y; this.vx = Math.cos(ang) * speed; this.vy = Math.sin(ang) * speed; this.ang = ang; this.speed = speed;
    this.dmg = dmg; this.owner = owner; this.team = owner.team; this.bounces = bounces; this.maxBounces = bounces; this.life = opts.life || 3.2; this.r = opts.r || 5;
    this.big = !!opts.big; this.color = opts.color || (owner.team === 'player' ? '#ffd166' : owner.isBoss ? '#d070ff' : '#ff6b4a'); this.trail.length = 0; this.hitCount = 0; this.age = 0; this.bounced = false;
    this.ghost = opts.ghost || 0; // seconds during which it ignores owner collision
    return this;
  }
}

/* ---------- Particles (pooled) ---------- */
class Particle { constructor() { this.active = false; } }

/* ---------- Coins (pooled) ---------- */
class Coin { constructor() { this.active = false; } }

/* ---------- Floating text ---------- */
class FloatText { constructor() { this.active = false; } }

/* ---------- Sprite animation effect (pooled) ---------- */
class SpriteFX { constructor() { this.active = false; } }

/* ---------- Tank base ---------- */
class Tank {
  constructor(game, kind, x, y, scale) {
    this.game = game; this.kind = kind; this.spr = Assets.tanks[kind]; this.def = TANK_DEFS[kind];
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.bodyAng = -Math.PI / 2; this.turretAng = -Math.PI / 2; this.scale = scale;
    this.radius = Math.max(this.def.w, this.def.l) * 0.5 * scale * 0.72;
    this.hp = 100; this.maxHp = 100; this.dead = false; this.flash = 0; this.recoil = 0; this.team = 'enemy'; this.speed = 100; this.cooldown = 0; this.trackTimer = 0; this.tint = null;
    this.exhaustT = 0; this.stuckT = 0; this.lastX = x; this.lastY = y; this.moving = false; this.wobble = 0;
  }
  get barrelLen() { return this.def.barrel * this.scale; }
  muzzle(offsetAng = 0) { const a = this.turretAng + offsetAng; const tOff = this.turretOffset(); return { x: this.x + tOff.x + Math.cos(this.turretAng) * this.barrelLen, y: this.y + tOff.y + Math.sin(this.turretAng) * this.barrelLen, a }; }
  turretOffset() { // turret pivot offset relative to hull center, rotated by body angle (sprites face up => rotate by bodyAng+90°)
    const dx = (this.def.tx - this.def.hx) * this.scale, dy = (this.def.ty - this.def.hy) * this.scale; const a = this.bodyAng + Math.PI / 2;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  /* move with collision against walls (sliding) and solid props */
  moveBy(dx, dy) {
    const map = this.game.map; const r = this.radius * 0.9;
    // X axis
    let nx = this.x + dx; if (!this.collides(nx, this.y, r)) this.x = nx; else { // try nudge
      const step = Math.sign(dx) * 2; let ok = false; for (let i = 0; i < 2 && !ok; i++) { }
    }
    let ny = this.y + dy; if (!this.collides(this.x, ny, r)) this.y = ny;
    this.x = clamp(this.x, CELL + r, map.W - CELL - r); this.y = clamp(this.y, CELL + r, map.H - CELL - r);
  }
  collides(x, y, r) {
    const map = this.game.map; if (map.circleVsWalls(x, y, r)) return true;
    for (const p of this.game.props) { if (!p.solid || p.dead) continue; const nx = clamp(x, p.x - p.w / 2, p.x + p.w / 2), ny = clamp(y, p.y - p.h / 2, p.y + p.h / 2); if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true; }
    return false;
  }
  separateFromTanks(dt) {
    for (const t of this.game.allTanks()) {
      if (t === this || t.dead) continue; const d = dist(this.x, this.y, t.x, t.y); const min = (this.radius + t.radius) * 0.95;
      if (d < min && d > 0.01) { const push = (min - d) * 0.5; const nx = (this.x - t.x) / d, ny = (this.y - t.y) / d; const wMe = t.isBoss ? 1 : 0.5; if (!this.collides(this.x + nx * push * wMe, this.y + ny * push * wMe, this.radius * 0.9)) { this.x += nx * push * wMe; this.y += ny * push * wMe; } }
    }
  }
  updateCommon(dt) {
    if (this.flash > 0) this.flash -= dt; if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6); if (this.cooldown > 0) this.cooldown -= dt;
    const mv = dist(this.x, this.y, this.lastX, this.lastY); this.moving = mv > 0.5; this.lastX = this.x; this.lastY = this.y;
    if (this.moving) { this.trackTimer += dt; if (this.trackTimer > 0.09) { this.trackTimer = 0; this.game.addTrack(this); } this.wobble += dt * 18; }
    this.exhaustT -= dt; if (this.exhaustT <= 0) { this.exhaustT = this.moving ? 0.12 : 0.35; const a = this.bodyAng + Math.PI; const bx = this.x + Math.cos(a) * this.def.l * 0.45 * this.scale, by = this.y + Math.sin(a) * this.def.l * 0.45 * this.scale; this.game.smoke(bx, by, this.moving ? 0.55 : 0.35, 0.28 * this.scale); }
  }
  fireVolley(shots, spread, dmg, bSpeed, bounces, opts = {}) {
    const spreads = SHOT_SPREADS[Math.min(shots, 4) - 1] || [0]; const m = this.muzzle();
    for (const s of spreads) { const a = this.turretAng + s * (spread || 1) + (opts.err ? (Math.random() - 0.5) * 2 * opts.err : 0); this.game.spawnBullet(m.x, m.y, a, bSpeed, dmg, this, bounces, opts); }
    this.recoil = 1; this.game.muzzleFlash(m.x, m.y, this.turretAng, this.scale * (opts.big ? 1.6 : 1));
  }
  takeDamage(amount, from) {
    if (this.dead) return; this.hp -= amount; this.flash = 0.12;
    if (this.hp <= 0) { this.hp = 0; this.die(from); }
  }
  die() { this.dead = true; }
  draw(g) {
    const S = this.spr; if (!S || !S.hull) return; const sc = this.scale; const d = this.def;
    const tinted = this.tint ? Assets.tintedTank(this.kind, this.tint) : null;
    // shadow + team marker ring
    g.save(); g.translate(this.x + 4, this.y + 5); g.rotate(this.bodyAng + Math.PI / 2); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-d.w * sc / 2, -d.l * sc / 2, d.w * sc, d.l * sc); g.restore();
    if (this.ringColor) { g.save(); g.globalAlpha = 0.55; g.strokeStyle = this.ringColor; g.lineWidth = 3; g.beginPath(); g.arc(this.x, this.y, this.radius + 4, 0, TAU); g.stroke(); g.restore(); }
    // hull
    g.save(); g.translate(this.x, this.y); g.rotate(this.bodyAng + Math.PI / 2 + (this.moving ? Math.sin(this.wobble) * 0.01 : 0));
    g.drawImage(S.hull, -d.hx * sc, -d.hy * sc, 100 * sc, 100 * sc);
    if (tinted) { g.globalAlpha = 0.85; g.drawImage(tinted.hull, -d.hx * sc, -d.hy * sc, 100 * sc, 100 * sc); g.globalAlpha = 1; }
    if (this.flash > 0) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = Math.min(1, this.flash * 8); g.fillStyle = '#fff'; g.fillRect(-d.hx * sc, -d.hy * sc, 100 * sc, 100 * sc); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    g.restore();
    // turret
    const to = this.turretOffset(); const rec = this.recoil * 4 * sc;
    g.save(); g.translate(this.x + to.x - Math.cos(this.turretAng) * rec, this.y + to.y - Math.sin(this.turretAng) * rec); g.rotate(this.turretAng + Math.PI / 2);
    g.drawImage(S.turret, -d.tx * sc, -d.ty * sc, 100 * sc, 100 * sc);
    if (tinted) { g.globalAlpha = 0.85; g.drawImage(tinted.turret, -d.tx * sc, -d.ty * sc, 100 * sc, 100 * sc); g.globalAlpha = 1; }
    g.restore();
  }
  drawHpBar(g, w = 44, yOff = null) {
    if (this.hp >= this.maxHp || this.dead) return; const y = this.y - (yOff || this.radius + 14); const p = this.hp / this.maxHp;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(this.x - w / 2 - 1, y - 1, w + 2, 6);
    g.fillStyle = p > 0.5 ? '#5bd85b' : p > 0.25 ? '#f5c842' : '#f05040'; g.fillRect(this.x - w / 2, y, w * p, 4);
  }
}

/* ---------- Player ---------- */
class Player extends Tank {
  constructor(game, x, y) {
    const st = game.save.up; super(game, PLAYER_BASE.tank, x, y, PLAYER_BASE.scale); this.team = 'player'; this.isPlayer = true; this.ringColor = 'rgba(120,255,140,0.9)';
    this.maxHp = PLAYER_BASE.hp + 20 * st.health; this.hp = this.maxHp; this.speed = PLAYER_BASE.speed * (1 + 0.07 * st.speed);
    this.dmg = PLAYER_BASE.dmg * (1 + 0.15 * st.damage); this.fireInt = PLAYER_BASE.fireInt * (1 - 0.08 * st.fireRate); this.shots = st.shot + 1; this.bounces = st.bounce; this.armor = st.armor * 0.06;
    this.radius = PLAYER_BASE.radius; this.invuln = 0; this.shotsFired = 0; this.shotsHit = 0; this.regenT = 0;
  }
  update(dt) {
    const I = Input; const mv = I.move; const cam = this.game.cam;
    if (mv.x || mv.y) { const targetAng = Math.atan2(mv.y, mv.x); this.bodyAng = rotToward(this.bodyAng, targetAng, 9 * dt); this.moveBy(mv.x * this.speed * dt, mv.y * this.speed * dt); }
    // aim
    let aimAng;
    if (I.aimMode === 'mouse') { const wx = cam.x + (I.mouse.x - this.game.vw / 2) / cam.zoom, wy = cam.y + (I.mouse.y - this.game.vh / 2) / cam.zoom; this.aimX = wx; this.aimY = wy; aimAng = Math.atan2(wy - this.y, wx - this.x); }
    else { aimAng = Math.atan2(I.aim.y, I.aim.x); this.aimX = this.x + I.aim.x * 300; this.aimY = this.y + I.aim.y * 300; }
    this.turretAng = rotToward(this.turretAng, aimAng, 14 * dt);
    if (I.fire && this.cooldown <= 0 && Math.abs(angDiff(this.turretAng, aimAng)) < 0.35) {
      this.cooldown = this.fireInt; const dmg = this.dmg * SHOT_DMG_MULT[this.shots - 1];
      this.fireVolley(this.shots, 1, dmg, PLAYER_BASE.bSpeed, this.bounces); this.shotsFired += this.shots; Audio_.play('shoot'); this.game.shake(2.5);
      // kick back
      const kb = 40 * dt; this.moveBy(-Math.cos(this.turretAng) * kb, -Math.sin(this.turretAng) * kb);
    }
    if (this.invuln > 0) this.invuln -= dt;
    this.separateFromTanks(dt); this.updateCommon(dt);
  }
  takeDamage(amount, from) {
    if (this.dead || this.invuln > 0) return; amount = Math.max(1, Math.round(amount * (1 - this.armor)));
    super.takeDamage(amount, from); this.invuln = 0.08; Audio_.play('playerHit'); this.game.shake(6); this.game.hitFlash = 0.25; this.game.floatText(this.x, this.y - 30, '-' + amount, '#ff5a5a');
    if (this.hp > 0 && this.hp < this.maxHp * 0.25) Audio_.play('lowHp');
  }
  die() { this.dead = true; this.game.onPlayerDeath(); }
}

/* ---------- Pet companion tank ---------- */
class Pet extends Tank {
  constructor(game, x, y) {
    const st = game.save.pet; super(game, PET_BASE.tank, x, y, PET_BASE.scale); this.team = 'player'; this.isPet = true; this.tint = 'rgba(80,200,255,0.35)'; this.ringColor = 'rgba(120,210,255,0.9)';
    this.maxHp = PET_BASE.hp + 25 * st.health; this.hp = this.maxHp; this.speed = PET_BASE.speed * (1 + 0.08 * st.speed); this.dmg = PET_BASE.dmg * (1 + 0.2 * st.damage); this.fireInt = PET_BASE.fireInt * (1 - 0.1 * st.fireRate); this.shots = st.shot + 1;
    this.radius = PET_BASE.radius; this.target = null; this.retargetT = 0; this.orbitAng = Math.PI; this.orbitT = 0; this.respawnT = 0; this.turretSpd = 6;
  }
  update(dt) {
    const P = this.game.player; if (this.dead) { this.respawnT -= dt; if (this.respawnT <= 0 && !P.dead) this.respawn(); return; }
    // target selection
    this.retargetT -= dt; if (this.retargetT <= 0 || !this.target || this.target.dead) { this.retargetT = 0.5; this.target = this.pickTarget(); }
    // desired position: orbit near player, biased toward target side
    this.orbitT -= dt; if (this.orbitT <= 0) { this.orbitT = 2 + Math.random() * 2; this.orbitAng += (Math.random() - 0.5) * 2.0; }
    let tx = P.x + Math.cos(this.orbitAng) * 80, ty = P.y + Math.sin(this.orbitAng) * 80;
    if (this.target) { const a = Math.atan2(this.target.y - P.y, this.target.x - P.x); tx = P.x + Math.cos(a + 0.9) * 75; ty = P.y + Math.sin(a + 0.9) * 75; }
    const dP = dist(this.x, this.y, P.x, P.y); if (dP > 320) { tx = P.x; ty = P.y; }
    const d = dist(this.x, this.y, tx, ty);
    if (d > 18) {
      let dx = (tx - this.x) / d, dy = (ty - this.y) / d;
      // obstacle avoidance: probe ahead
      const probe = 34; if (this.collides(this.x + dx * probe, this.y + dy * probe, this.radius)) { const a = Math.atan2(dy, dx); for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) { const nx = Math.cos(a + off), ny = Math.sin(a + off); if (!this.collides(this.x + nx * probe, this.y + ny * probe, this.radius)) { dx = nx; dy = ny; break; } } }
      const sp = this.speed * (dP > 320 ? 1.4 : 1) * Math.min(1, d / 40); const ox = this.x, oy = this.y; this.moveBy(dx * sp * dt, dy * sp * dt);
      if (dist(ox, oy, this.x, this.y) < sp * dt * 0.3) { this.stuckT += dt; if (this.stuckT > 0.6) { this.orbitAng += Math.PI * 0.7; this.stuckT = 0; } } else this.stuckT = 0;
      this.bodyAng = rotToward(this.bodyAng, Math.atan2(dy, dx), 8 * dt);
    }
    // aim + fire
    if (this.target) {
      const lead = this.game.leadAngle(this, this.target, PET_BASE.bSpeed); this.turretAng = rotToward(this.turretAng, lead, this.turretSpd * dt);
      if (this.cooldown <= 0 && Math.abs(angDiff(this.turretAng, lead)) < 0.12 && this.game.map.lineOfSight(this.x, this.y, this.target.x, this.target.y) && !this.friendlyInLine(this.target)) {
        this.cooldown = this.fireInt; this.fireVolley(this.shots, 1, this.dmg * SHOT_DMG_MULT[this.shots - 1], PET_BASE.bSpeed, 0, { r: 4 }); Audio_.play('petShoot', 0.7);
      }
    } else this.turretAng = rotToward(this.turretAng, this.bodyAng, 4 * dt);
    this.separateFromTanks(dt); this.updateCommon(dt);
  }
  friendlyInLine(t) { const P = this.game.player; const d = dist(this.x, this.y, t.x, t.y); const a = Math.atan2(t.y - this.y, t.x - this.x); const dp = dist(this.x, this.y, P.x, P.y); if (dp > d) return false; const ap = Math.atan2(P.y - this.y, P.x - this.x); return Math.abs(angDiff(a, ap)) < Math.atan2(P.radius + 6, dp); }
  pickTarget() { let best = null, bd = 1e9; for (const e of this.game.enemies) { if (e.dead) continue; const d = dist(this.x, this.y, e.x, e.y) + (this.game.map.lineOfSight(this.x, this.y, e.x, e.y) ? 0 : 400); if (d < bd) { bd = d; best = e; } } return best; }
  takeDamage(a, from) { if (this.dead) return; super.takeDamage(a, from); this.game.floatText(this.x, this.y - 22, '-' + Math.round(a), '#7fd4ff', 0.8); }
  die() { this.dead = true; this.respawnT = 12; this.game.explode(this.x, this.y, 0.9); this.game.floatText(this.x, this.y - 30, 'COMPANION DOWN', '#7fd4ff'); }
  respawn() { const P = this.game.player; this.dead = false; this.hp = this.maxHp; this.x = P.x - Math.cos(P.bodyAng) * 60; this.y = P.y - Math.sin(P.bodyAng) * 60; this.game.floatText(this.x, this.y - 30, 'COMPANION BACK', '#7fd4ff'); this.game.smoke(this.x, this.y, 1, 1.2); }
}

/* ---------- Enemy ---------- */
class Enemy extends Tank {
  constructor(game, type, x, y, lvlScale) {
    const D = ENEMY_DEFS[type]; super(game, D.tank, x, y, D.scale); this.type = type; this.D = D; this.team = 'enemy'; this.tint = ENEMY_TINT; this.ringColor = 'rgba(255,70,50,0.9)';
    this.maxHp = Math.round(D.hp * lvlScale.hp); this.hp = this.maxHp; this.speed = D.speed * lvlScale.speed; this.dmg = D.dmg * lvlScale.dmg; this.fireInt = D.fireInt * lvlScale.fire; this.err = D.err * lvlScale.err; this.coins = Math.round(D.coins * lvlScale.coins); this.range = D.range;
    this.radius = D.radius; this.bounces = D.bounce || 0; this.shots = D.shots || 1;
    this.state = 'approach'; this.stateT = 0; this.cooldown = 1 + Math.random(); this.think = Math.random() * 0.3; this.dest = null; this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0; this.seesPlayer = false; this.telegraph = 0; this.spawnT = 0.6; this.stuckT = 0; this.sight = 0;
    this.dir = { x: 0, y: 0 }; this.desiredAng = this.bodyAng;
  }
  update(dt) {
    if (this.spawnT > 0) { this.spawnT -= dt; this.updateCommon(dt); return; }
    const P = this.game.target(this); if (!P) return; const map = this.game.map;
    this.think -= dt; this.stateT += dt; const d = dist(this.x, this.y, P.x, P.y);
    if (this.think <= 0) { this.think = 0.2 + Math.random() * 0.15; this.seesPlayer = map.lineOfSight(this.x, this.y, P.x, P.y); this.plan(P, d); }
    if (this.seesPlayer) this.sight = Math.min(1, this.sight + dt * 2); else this.sight = Math.max(0, this.sight - dt);
    // movement
    let mx = 0, my = 0;
    if (this.dir.x || this.dir.y) { mx = this.dir.x; my = this.dir.y; }
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      // local avoidance: probe ahead for walls/props, steer around
      const probe = this.radius + 22;
      if (this.collides(this.x + mx * probe, this.y + my * probe, this.radius * 0.9)) { const a = Math.atan2(my, mx); let found = false; for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2]) { const nx = Math.cos(a + off), ny = Math.sin(a + off); if (!this.collides(this.x + nx * probe, this.y + ny * probe, this.radius * 0.9)) { mx = nx; my = ny; found = true; break; } } if (!found) { mx = -mx; my = -my; } }
      const ox = this.x, oy = this.y; const sp = this.speed * (this.state === 'retreat' || this.state === 'charge' ? 1.15 : 1);
      this.moveBy(mx * sp * dt, my * sp * dt);
      const moved = dist(ox, oy, this.x, this.y); if (moved < sp * dt * 0.25) { this.stuckT += dt; if (this.stuckT > 0.5) { this.stuckT = 0; this.dest = null; this.strafeDir *= -1; this.dir = { x: -mx + (Math.random() - 0.5), y: -my + (Math.random() - 0.5) }; this.think = 0.4; } } else this.stuckT = 0;
      this.bodyAng = rotToward(this.bodyAng, Math.atan2(my, mx), 6 * dt);
    }
    // aiming
    const aimAng = this.seesPlayer ? this.game.leadAngle(this, P, this.D.bSpeed, this.type === 'sniper' ? 1 : 0.6) : this.bodyAng;
    this.turretAng = rotToward(this.turretAng, aimAng, this.D.turretSpd * dt);
    // firing
    if (this.telegraph > 0) { this.telegraph -= dt; if (this.telegraph <= 0) this.fire(P); }
    else if (this.seesPlayer && this.cooldown <= 0 && d < this.range * 1.1 && Math.abs(angDiff(this.turretAng, aimAng)) < 0.2 && !this.allyInLine(P)) {
      if (this.D.telegraph) { this.telegraph = this.D.telegraph; Audio_.play('telegraph'); } else this.fire(P);
    }
    this.separateFromTanks(dt); this.updateCommon(dt);
  }
  allyInLine(P) { const d = dist(this.x, this.y, P.x, P.y); const a = this.turretAng; for (const e of this.game.enemies) { if (e === this || e.dead) continue; const de = dist(this.x, this.y, e.x, e.y); if (de > d) continue; const ae = Math.atan2(e.y - this.y, e.x - this.x); if (Math.abs(angDiff(a, ae)) < Math.atan2(e.radius + 4, de)) return true; } return false; }
  fire(P) {
    this.cooldown = this.fireInt * (0.85 + Math.random() * 0.3);
    const big = this.type === 'sniper' || this.type === 'heavy';
    this.fireVolley(this.shots, this.D.spread ? this.D.spread / 0.07 : 1, this.dmg, this.D.bSpeed, this.bounces, { err: this.err, big, r: big ? 6 : 5 });
    Audio_.play(this.type === 'sniper' ? 'sniperShoot' : 'enemyShoot', 0.8);
  }
  /* --- behaviour planning (runs ~5x/sec) --- */
  plan(P, d) {
    const map = this.game.map; const t = this.type; const flow = map.flowDir(this.x, this.y);
    const toward = () => flow || this.dirTo(P.x, P.y); const away = () => { const f = this.dirTo(P.x, P.y); return { x: -f.x, y: -f.y }; };
    const strafe = () => { this.strafeT -= 0.25; if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.5; if (Math.random() < 0.6) this.strafeDir *= -1; } const a = Math.atan2(P.y - this.y, P.x - this.x) + Math.PI / 2 * this.strafeDir; return { x: Math.cos(a), y: Math.sin(a) }; };
    const stop = () => ({ x: 0, y: 0 });
    switch (t) {
      case 'basic': {
        const want = 260; if (!this.seesPlayer || d > want + 60) this.dir = toward(); else if (d < want - 90) this.dir = away(); else this.dir = Math.random() < 0.5 ? strafe() : stop(); break;
      }
      case 'aggressive': {
        if (d > 120 || !this.seesPlayer) this.dir = toward(); else this.dir = strafe(); break;
      }
      case 'defensive': {
        // find cover cell: a free cell adjacent to a wall, between 200-420 from player, no LOS to player, then peek
        if (this.state === 'approach' || (this.state === 'cover' && !this.dest)) { if (!this.dest || this.stateT > 6) { this.dest = this.findCover(P); this.stateT = 0; } }
        if (this.state === 'approach' || this.state === 'cover') {
          if (this.dest) { const dd = dist(this.x, this.y, this.dest.x, this.dest.y); if (dd < 20) { this.state = 'hide'; this.stateT = 0; this.dir = stop(); } else { const f = this.dirTo(this.dest.x, this.dest.y); this.dir = f; } }
          else { if (d > 300) this.dir = toward(); else if (d < 160) this.dir = away(); else this.dir = strafe(); }
        } else if (this.state === 'hide') {
          this.dir = stop(); if (this.stateT > 1.2 + Math.random() * 0.8) { this.state = 'peek'; this.stateT = 0; this.peekDir = this.dirTo(P.x, P.y); }
        } else if (this.state === 'peek') {
          this.dir = this.peekDir; if (this.seesPlayer) { this.dir = stop(); if (this.cooldown <= 0.05 && this.stateT > 0.3) { /* fire happens in update */ } if (this.stateT > 2.2) { this.state = 'retreat'; this.stateT = 0; } } else if (this.stateT > 2.5) { this.state = 'retreat'; this.stateT = 0; }
        } else if (this.state === 'retreat') {
          if (this.dest) { const dd = dist(this.x, this.y, this.dest.x, this.dest.y); if (dd < 18 || this.stateT > 2) { this.state = 'hide'; this.stateT = 0; if (this.stateT > 2) this.dest = null; } this.dir = this.dirTo(this.dest.x, this.dest.y); } else { this.state = 'approach'; }
        }
        if (d < 110) this.dir = away(); // don't let player hug
        break;
      }
      case 'sniper': {
        const want = 520; if (!this.seesPlayer) this.dir = toward(); else if (d < want - 120) this.dir = away(); else if (d > want + 150) this.dir = toward(); else this.dir = this.telegraph > 0 ? stop() : (Math.random() < 0.3 ? strafe() : stop());
        break;
      }
      case 'heavy': { const want = 230; if (!this.seesPlayer || d > want + 80) this.dir = toward(); else if (d < want - 80) this.dir = away(); else this.dir = stop(); break; }
      case 'hunter': {
        // bouncer: prefers positions where a bounce shot is possible; otherwise mid-range strafe
        const want = 320; if (!this.seesPlayer && d > 200) { this.dir = Math.random() < 0.6 ? toward() : strafe(); } else if (d > want + 60) this.dir = toward(); else if (d < want - 100) this.dir = away(); else this.dir = strafe();
        break;
      }
    }
  }
  dirTo(x, y) { const d = dist(this.x, this.y, x, y) || 1; return { x: (x - this.x) / d, y: (y - this.y) / d }; }
  findCover(P) {
    const map = this.game.map; let best = null, bs = -1e9;
    for (let i = 0; i < 40; i++) {
      const cx = randi(1, map.w - 2), cy = randi(1, map.h - 2); if (map.grid[cy][cx]) continue;
      // must be adjacent to a bullet-blocking wall
      let adj = false; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.isSolidCell(cx + ox, cy + oy) >= 2) { adj = true; break; } if (!adj) continue;
      const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2; const dp = dist(x, y, P.x, P.y); if (dp < 180 || dp > 460) continue;
      if (map.lineOfSight(x, y, P.x, P.y)) continue; if (this.collides(x, y, this.radius)) continue;
      const score = -dist(this.x, this.y, x, y) - Math.abs(dp - 300) * 0.5; if (score > bs) { bs = score; best = { x, y }; }
    }
    return best;
  }
  takeDamage(a, from) {
    if (this.dead) return; super.takeDamage(a, from); Audio_.play('hitTank', 0.6); this.game.floatText(this.x + rand(-10, 10), this.y - this.radius - 6, Math.round(a), from && from.team === 'player' ? '#fff' : '#ccc', 0.7);
    if (this.type === 'defensive' && this.state === 'hide') { this.state = 'peek'; this.stateT = 0; this.peekDir = this.dirTo(from ? from.x : this.x, from ? from.y : this.y); }
    if (this.type === 'sniper' && Math.random() < 0.4) { this.dir = this.dirTo(this.x + rand(-1, 1), this.y + rand(-1, 1)); this.think = 0.3; }
  }
  die(from) { this.dead = true; this.game.onEnemyKilled(this, from); }
  drawExtra(g) {
    if (this.telegraph > 0) { const m = this.muzzle(); const p = 1 - this.telegraph / this.D.telegraph; g.save(); g.globalAlpha = 0.25 + p * 0.5; g.strokeStyle = '#ff3030'; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x + Math.cos(this.turretAng) * 900, m.y + Math.sin(this.turretAng) * 900); g.stroke(); g.restore(); }
  }
}

/* ---------- Bosses ---------- */
class Boss extends Tank {
  constructor(game, kind, x, y, mult = 1, lvlIdx = 0) {
    const D = BOSS_DEFS[kind]; super(game, D.tank, x, y, D.scale); this.bossKind = kind; this.D = D; this.team = 'enemy'; this.isBoss = true; this.tint = D.tint; this.name = D.name; this.ringColor = D.tint;
    this.maxHp = Math.round(D.hp * mult); this.hp = this.maxHp; this.speed = D.speed * Math.min(1.3, 1 + lvlIdx * 0.015); this.dmg = D.dmg * mult ** 0.5; this.coins = Math.round(D.coins * mult); this.radius = D.radius; this.bSpeed = D.bSpeed;
    this.phase = 1; this.attackT = 2.5; this.pattern = 0; this.spin = 0; this.moveT = 0; this.dest = null; this.enraged = false; this.introT = 2.0; this.dashT = 0; this.dashing = false; this.dashDir = null; this.summonT = 18; this.shieldT = 0; this.flashT = 0; this.hpShown = this.maxHp; this.stuckT = 0;
  }
  update(dt) {
    if (this.introT > 0) { this.introT -= dt; this.turretAng += dt * 2; this.updateCommon(dt); return; }
    const P = this.game.player; if (!P || P.dead) return;
    const frac = this.hp / this.maxHp; const newPhase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (newPhase !== this.phase) { this.phase = newPhase; this.onPhase(); }
    if (frac < 0.2 && !this.enraged) { this.enraged = true; this.game.announce('RICOCHET IS ENRAGED!', '#ff4060'); Audio_.play('bossRoar'); this.game.shake(10); }
    if (this.bossKind === 'ricochet') this.updateRicochet(dt, P); else this.updateJuggernaut(dt, P);
    this.separateFromTanks(dt); this.updateCommon(dt);
  }
  onPhase() { Audio_.play('bossRoar'); this.game.shake(8); this.game.announce(this.name + ' — PHASE ' + this.phase, '#e070ff'); this.game.ring(this.x, this.y, this.D.tint); }
  moveToward(x, y, dt, spd) {
    const d = dist(this.x, this.y, x, y); if (d < 8) return true; let dx = (x - this.x) / d, dy = (y - this.y) / d;
    const probe = this.radius + 26; if (this.collides(this.x + dx * probe, this.y + dy * probe, this.radius * 0.9)) { const a = Math.atan2(dy, dx); for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) { const nx = Math.cos(a + off), ny = Math.sin(a + off); if (!this.collides(this.x + nx * probe, this.y + ny * probe, this.radius * 0.9)) { dx = nx; dy = ny; break; } } }
    const ox = this.x, oy = this.y; this.moveBy(dx * spd * dt, dy * spd * dt); this.bodyAng = rotToward(this.bodyAng, Math.atan2(dy, dx), 3 * dt);
    if (dist(ox, oy, this.x, this.y) < spd * dt * 0.2) { this.stuckT += dt; if (this.stuckT > 0.5) { this.stuckT = 0; return true; } } else this.stuckT = 0;
    return false;
  }
  /* RICOCHET: fires bouncing shells at walls; patterns grow with phase */
  updateRicochet(dt, P) {
    const map = this.game.map; const spd = this.speed * (this.phase === 1 ? 1 : this.phase === 2 ? 1.25 : 1.5) * (this.enraged ? 1.3 : 1);
    // movement: wander between arena anchor points, keep mid distance from the player
    this.moveT -= dt;
    if (!this.dest || this.moveT <= 0) { this.moveT = 3 + Math.random() * 2; for (let i = 0; i < 30; i++) { const x = rand(CELL * 2, map.W - CELL * 2), y = rand(CELL * 2, map.H - CELL * 2); const dp = dist(x, y, P.x, P.y); if (dp > 260 && dp < 560 && !this.collides(x, y, this.radius + 10)) { this.dest = { x, y }; break; } } }
    if (this.dest && this.moveToward(this.dest.x, this.dest.y, dt, spd)) this.dest = null;
    if (this.enraged && dist(this.x, this.y, P.x, P.y) > 200) { this.dest = { x: P.x, y: P.y }; }
    // attacks
    this.attackT -= dt;
    const aimAng = this.game.leadAngle(this, P, this.bSpeed, 0.7);
    if (this.attackT > 0.6) this.turretAng = rotToward(this.turretAng, aimAng, this.D.turretSpd * dt); else this.spin += dt;
    if (this.attackT <= 0) {
      this.pattern = (this.pattern + 1) % 4; const ph = this.phase;
      const interval = ph === 1 ? 2.6 : ph === 2 ? 2.0 : 1.5; this.attackT = interval * (this.enraged ? 0.7 : 1);
      Audio_.play('bossShoot'); this.game.shake(4); this.flashT = 0.2;
      const m = this.muzzle(); const opts = { life: ph === 1 ? 5 : 6.5, r: 7, big: true, color: '#d070ff', ghost: 0.3 };
      const bounces = ph === 1 ? 3 : ph === 2 ? 5 : 7;
      if (this.pattern === 0 || ph === 1) { // "billiard": two shells aimed at walls beside the player (45° off)
        for (const off of [-0.7, 0.7]) this.game.spawnBullet(m.x, m.y, this.turretAng + off, this.bSpeed, this.dmg, this, bounces, opts);
        if (ph >= 2) this.game.spawnBullet(m.x, m.y, this.turretAng, this.bSpeed * 0.9, this.dmg, this, bounces, opts);
      } else if (this.pattern === 1) { // ring burst of bouncing shells
        const n = ph === 2 ? 6 : 10; for (let i = 0; i < n; i++) this.game.spawnBullet(this.x, this.y, i * TAU / n + this.spin, this.bSpeed * 0.75, this.dmg * 0.8, this, bounces - 1, Object.assign({}, opts, { life: 5 }));
        this.game.ring(this.x, this.y, '#d070ff');
      } else if (this.pattern === 2) { // spiral volley
        const n = ph === 2 ? 5 : 8; for (let i = 0; i < n; i++) setTimeout(() => { if (this.dead) return; const mm = this.muzzle(); this.game.spawnBullet(mm.x, mm.y, this.turretAng + i * 0.35 * (this.strafeDir || 1), this.bSpeed * 0.85, this.dmg * 0.8, this, bounces, opts); this.recoil = 1; this.game.muzzleFlash(mm.x, mm.y, this.turretAng, 2); Audio_.play('bossShoot', 0.5); }, i * 110);
      } else { // direct + two wall shots
        this.game.spawnBullet(m.x, m.y, this.turretAng, this.bSpeed * 1.1, this.dmg * 1.2, this, 1, Object.assign({}, opts, { color: '#ff5090' }));
        for (const off of [-1.1, 1.1]) this.game.spawnBullet(m.x, m.y, this.turretAng + off, this.bSpeed, this.dmg, this, bounces, opts);
      }
      this.recoil = 1; this.game.muzzleFlash(m.x, m.y, this.turretAng, 2.2);
    }
    // minions on the reborn version
    if (this.game.level.minions) { this.summonT -= dt; if (this.summonT <= 0 && this.game.enemies.filter(e => !e.dead && !e.isBoss).length < 2) { this.summonT = 16; this.game.spawnEnemyAt(this.game.level.minions, null); this.game.announce('REINFORCEMENTS!', '#ffb050'); } }
  }
  /* JUGGERNAUT: heavy charger with shockwave rings and summons */
  updateJuggernaut(dt, P) {
    const spd = this.speed * (this.phase === 1 ? 1 : this.phase === 2 ? 1.2 : 1.4);
    const d = dist(this.x, this.y, P.x, P.y);
    if (this.dashing) {
      this.dashT -= dt; const ox = this.x, oy = this.y; this.moveBy(this.dashDir.x * 620 * dt, this.dashDir.y * 620 * dt);
      if (Math.random() < 0.5) this.game.smoke(this.x - this.dashDir.x * 40, this.y - this.dashDir.y * 40, 0.6, 1.4);
      const moved = dist(ox, oy, this.x, this.y);
      if (this.dashT <= 0 || moved < 620 * dt * 0.3) { this.dashing = false; this.game.shake(9); Audio_.play('bigExplode', 0.6); this.game.ring(this.x, this.y, '#ffa040'); const n = this.phase + 5; for (let i = 0; i < n; i++) this.game.spawnBullet(this.x, this.y, i * TAU / n + this.spin, 320, this.dmg * 0.7, this, 1, { life: 3, r: 6, color: '#ffa040', ghost: 0.3 }); this.attackT = 1.2; }
      if (d < this.radius + P.radius && P.invuln <= 0) { P.takeDamage(this.dmg * 1.5, this); const a = Math.atan2(P.y - this.y, P.x - this.x); P.moveBy(Math.cos(a) * 60, Math.sin(a) * 60); }
      this.updateCommon(dt); return;
    }
    // approach/kite
    if (d > 300) this.moveToward(P.x, P.y, dt, spd); else if (d < 170) { const a = Math.atan2(this.y - P.y, this.x - P.x); this.moveToward(this.x + Math.cos(a) * 100, this.y + Math.sin(a) * 100, dt, spd * 0.8); } else { this.spin += dt; const a = Math.atan2(this.y - P.y, this.x - P.x) + 0.6; this.moveToward(P.x + Math.cos(a) * 240, P.y + Math.sin(a) * 240, dt, spd * 0.8); }
    const aimAng = this.game.leadAngle(this, P, this.bSpeed, 0.8); this.turretAng = rotToward(this.turretAng, aimAng, this.D.turretSpd * dt);
    this.attackT -= dt;
    if (this.attackT <= 0) {
      this.pattern = (this.pattern + 1) % 3; this.attackT = (this.phase === 1 ? 2.4 : this.phase === 2 ? 1.9 : 1.4);
      const m = this.muzzle();
      if (this.pattern === 2 && this.phase >= 1) { // charge
        Audio_.play('charge'); this.game.announce('JUGGERNAUT CHARGES!', '#ffa040', 0.8); const a = Math.atan2(P.y - this.y, P.x - this.x); this.dashDir = { x: Math.cos(a), y: Math.sin(a) }; this.bodyAng = a; setTimeout(() => { if (!this.dead) { this.dashing = true; this.dashT = 0.9; } }, 600); this.attackT = 3;
      } else if (this.pattern === 0) { // triple heavy shells
        Audio_.play('bossShoot'); for (const off of [-0.18, 0, 0.18]) this.game.spawnBullet(m.x, m.y, this.turretAng + off, this.bSpeed, this.dmg, this, 1, { r: 7, big: true, color: '#ffa040' }); this.recoil = 1; this.game.muzzleFlash(m.x, m.y, this.turretAng, 2.4); this.game.shake(4);
      } else { // shockwave ring
        Audio_.play('bossShoot'); this.game.ring(this.x, this.y, '#ffa040'); const n = 8 + this.phase * 2; for (let i = 0; i < n; i++) this.game.spawnBullet(this.x, this.y, i * TAU / n + this.spin * 0.5, 300, this.dmg * 0.6, this, 0, { life: 2.6, r: 6, color: '#ffa040', ghost: 0.3 });
      }
    }
    this.summonT -= dt; if (this.summonT <= 0 && this.game.enemies.filter(e => !e.dead && !e.isBoss).length < 3) { this.summonT = 14 - this.phase * 2; this.game.spawnEnemyAt(this.phase >= 3 ? 'hunter' : 'aggressive', null); this.game.spawnEnemyAt('basic', null); this.game.announce('REINFORCEMENTS!', '#ffb050'); }
  }
  takeDamage(a, from) {
    if (this.dead || this.introT > 0) return; super.takeDamage(a, from); Audio_.play('bossHit'); this.game.floatText(this.x + rand(-20, 20), this.y - this.radius, Math.round(a), '#fff', 0.7);
  }
  die(from) { this.dead = true; this.game.onBossKilled(this, from); }
  drawExtra(g) {
    if (this.introT > 0) { g.save(); g.globalAlpha = 0.5 + Math.sin(this.introT * 20) * 0.3; g.strokeStyle = this.D.tint; g.lineWidth = 4; g.beginPath(); g.arc(this.x, this.y, this.radius + 20 + (this.introT % 0.5) * 60, 0, TAU); g.stroke(); g.restore(); }
    if (this.dashDir && !this.dashing && this.attackT > 2.2) { g.save(); g.globalAlpha = 0.5; g.strokeStyle = '#ffa040'; g.lineWidth = 6; g.setLineDash([14, 10]); g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(this.x + this.dashDir.x * 600, this.y + this.dashDir.y * 600); g.stroke(); g.restore(); }
  }
}
