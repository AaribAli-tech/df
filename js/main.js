'use strict';
/* ============================================================
   App: screens, HUD, shops, save/load, main loop, menu background
   ============================================================ */
const SAVE_KEY = 'ironRicochet.save.v1';
const defaultSave = () => ({ coins: 0, up: { shot: 0, bounce: 0, health: 0, armor: 0, damage: 0, speed: 0, fireRate: 0 }, tank: 't34', ownedTanks: ['t34'], petUnlocked: false, pet: { shot: 0, damage: 0, fireRate: 0, health: 0, speed: 0 }, petTank: 'stuart', ownedPetTanks: ['stuart'], petSlots: ['stuart'], maxLevel: 0, settings: { sfx: 0.8, music: 0.5, shake: true, lowFx: false }, stats: { kills: 0, coinsTotal: 0, bestLevel: 0 } });

const App = {
  init() {
    const raw = localStorage.getItem(SAVE_KEY); this.save = defaultSave();
    if (raw) { try { const s = JSON.parse(raw); this.save = Object.assign(this.save, s); this.save.up = Object.assign(defaultSave().up, s.up || {}); this.save.pet = Object.assign(defaultSave().pet, s.pet || {}); this.save.settings = Object.assign(defaultSave().settings, s.settings || {}); this.save.stats = Object.assign(defaultSave().stats, s.stats || {}); if (!Array.isArray(this.save.ownedTanks)) this.save.ownedTanks = ['t34']; if (!Array.isArray(this.save.ownedPetTanks)) this.save.ownedPetTanks = ['stuart']; if (!TANK_BY_ID[this.save.tank]) this.save.tank = 't34'; if (!TANK_BY_ID[this.save.petTank]) this.save.petTank = 'stuart'; if (!Array.isArray(this.save.petSlots) || !this.save.petSlots.length) this.save.petSlots = [this.save.petTank]; this.save.petSlots = this.save.petSlots.filter(id => TANK_BY_ID[id]).slice(0, MAX_PETS); if (!this.save.petSlots.length) this.save.petSlots = ['stuart']; } catch (e) { } }
    this.canvas = document.getElementById('game'); this.$ = (id) => document.getElementById(id);
    this.game = new Game(this); this.screen = 'loading'; this.selectedLevel = this.save.maxLevel;
    Input.init(this.canvas); Input.onKey = (c) => this.onKey(c);
    window.addEventListener('resize', () => this.resize()); this.resize();
    const unlock = () => { Audio_.init(); Audio_.resume(); Audio_.setVolumes(this.save.settings.sfx, this.save.settings.music); if (this.screen === 'menu' && !Audio_.musicOn) Audio_.startMusic('menu'); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));
    document.querySelectorAll('button').forEach(b => { b.addEventListener('mouseenter', () => Audio_.play('hover')); b.addEventListener('click', () => Audio_.play('click')); });
    this.bindButtons();
    Assets.loadAll().then(() => { this.$('loading').classList.add('hide'); this.showScreen('menu'); this.menuBg = new MenuBackground(this.canvas); });
    // loading progress
    const tick = () => { if (Assets.ready) return; this.$('loadBar').style.width = (Assets.total ? Assets.loaded / Assets.total * 100 : 0) + '%'; requestAnimationFrame(tick); }; tick();
    this.last = performance.now(); this.fpsT = 0; this.frames = 0; requestAnimationFrame((t) => this.loop(t));
    this.checkOrientation(); window.addEventListener('orientationchange', () => setTimeout(() => this.checkOrientation(), 300));
  },
  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); },
  resize() { const dpr = Math.min(window.devicePixelRatio || 1, 1.5); const w = window.innerWidth, h = window.innerHeight; this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; this.game.resize(this.canvas.width, this.canvas.height); if (this.game.level) this.game.cam.zoom = this.game.computeZoom() * dpr; this.dpr = dpr; this.checkOrientation(); },
  checkOrientation() { const portrait = window.innerHeight > window.innerWidth && (Input.touch || 'ontouchstart' in window) && window.innerWidth < 900; this.$('rotate').classList.toggle('show', portrait); },
  showScreen(name) {
    this.screen = name; document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === 'scr-' + name));
    this.$('hud').classList.toggle('show', name === 'play' || name === 'pause'); this.$('touchLayer').classList.toggle('show', name === 'play');
    if (name === 'menu') { if (Audio_.ctx && Audio_.musicKind !== 'menu') Audio_.startMusic('menu'); this.$('menuCoins').textContent = this.save.coins; this.$('menuBest').textContent = 'BEST LEVEL: ' + (this.save.stats.bestLevel || 0); this.$('menuTank').textContent = 'TANK: ' + (TANK_BY_ID[this.save.tank] || TANK_BY_ID.t34).name; this.$('menuSquad').textContent = this.save.petUnlocked ? 'SQUAD: ' + squadList(this.save).length : 'SQUAD: —'; this.game.state = 'idle'; }
    if (name === 'levels') this.renderLevels();
    if (name === 'shop') this.renderShop();
    if (name === 'garage') this.renderGarage();
    if (name === 'pet') this.renderPet();
    if (name === 'settings') this.renderSettings();
    this.updateCoinLabels();
  },
  updateCoinLabels() { document.querySelectorAll('.coinBal').forEach(e => e.textContent = this.save.coins); },
  bindButtons() {
    const $ = this.$;
    $('btnPlay').onclick = () => this.showScreen('levels');
    $('btnUpgrades').onclick = () => { this.backTo = 'menu'; this.showScreen('shop'); };
    $('btnPet').onclick = () => { this.backTo = 'menu'; this.showScreen('pet'); };
    $('btnGarage').onclick = () => { this.backTo = 'menu'; this.showScreen('garage'); };
    $('btnWinGarage').onclick = () => { this.backTo = 'win'; this.showScreen('garage'); };
    $('btnLoseGarage').onclick = () => { this.backTo = 'lose'; this.showScreen('garage'); };
    $('btnSettings').onclick = () => { this.backTo = 'menu'; this.showScreen('settings'); };
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => this.showScreen(this.backTo || 'menu'));
    $('btnStart').onclick = () => this.startLevel(this.selectedLevel);
    $('btnNext').onclick = () => this.startLevel(this.game.levelIdx + 1);
    $('btnRetry').onclick = () => this.startLevel(this.game.levelIdx);
    $('btnWinUpgrades').onclick = () => { this.backTo = 'win'; this.showScreen('shop'); };
    $('btnLoseUpgrades').onclick = () => { this.backTo = 'lose'; this.showScreen('shop'); };
    $('btnWinMenu').onclick = () => this.showScreen('menu'); $('btnLoseMenu').onclick = () => this.showScreen('menu');
    $('btnPause').onclick = () => this.togglePause(); $('btnResume').onclick = () => this.togglePause(); $('btnPauseMenu').onclick = () => { this.paused = false; Audio_.stopMusic(); this.showScreen('menu'); }; $('btnPauseSettings').onclick = () => { this.backTo = 'pause'; this.showScreen('settings'); };
    $('btnResetSave').onclick = () => { if (confirm('Reset ALL progress (coins, upgrades, levels)?')) { this.save = defaultSave(); this.persist(); this.renderSettings(); Audio_.play('deny'); } };
    $('setSfx').oninput = (e) => { this.save.settings.sfx = +e.target.value; Audio_.setVolumes(this.save.settings.sfx, this.save.settings.music); this.persist(); };
    $('setSfx').onchange = () => Audio_.play('shoot');
    $('setMusic').oninput = (e) => { this.save.settings.music = +e.target.value; Audio_.setVolumes(this.save.settings.sfx, this.save.settings.music); this.persist(); };
    $('setShake').onchange = (e) => { this.save.settings.shake = e.target.checked; this.persist(); };
    $('setLowFx').onchange = (e) => { this.save.settings.lowFx = e.target.checked; this.game.lowFx = e.target.checked; this.persist(); };
  },
  onKey(code) {
    if (code === 'Escape' || code === 'KeyP') { if (this.screen === 'play' || this.screen === 'pause') this.togglePause(); else if (this.screen !== 'menu' && this.screen !== 'loading') this.showScreen(this.backTo || 'menu'); }
    if (code === 'Enter') { if (this.screen === 'levels') this.startLevel(this.selectedLevel); else if (this.screen === 'win') this.startLevel(this.game.levelIdx + 1); else if (this.screen === 'lose') this.startLevel(this.game.levelIdx); else if (this.screen === 'menu') this.showScreen('levels'); }
    if (code === 'KeyM') { if (Audio_.musicOn) Audio_.stopMusic(); else Audio_.startMusic(this.screen === 'play' ? (this.game.level && this.game.level.boss ? 'boss' : 'battle') : 'menu'); }
  },
  togglePause() { if (this.screen === 'play') { this.paused = true; this.showScreen('pause'); } else if (this.screen === 'pause') { this.paused = false; this.showScreen('play'); } },
  startLevel(idx) {
    if (idx > this.save.maxLevel) idx = this.save.maxLevel; this.paused = false; this.game.lowFx = this.save.settings.lowFx;
    this.game.startLevel(idx); this.game.cam.zoom = this.game.computeZoom() * this.dpr; this.showScreen('play'); this.$('hudLevel').textContent = 'LEVEL ' + (idx + 1); this.$('hudLevelName').textContent = this.game.level.name;
    this.$('bossBar').classList.toggle('show', !!this.game.boss); if (this.game.boss) this.$('bossName').textContent = this.game.boss.name;
  },
  onLevelEnd(result) {
    const G = this.game; this.save.stats.kills += G.killed; this.save.stats.coinsTotal += G.coinsEarned;
    if (result === 'win') { if (G.levelIdx + 1 > this.save.maxLevel) this.save.maxLevel = G.levelIdx + 1; this.save.stats.bestLevel = Math.max(this.save.stats.bestLevel, G.levelIdx + 1); this.persist(); Audio_.stopMusic();
      const acc = G.player.shotsFired ? Math.round(G.player.shotsHit / G.player.shotsFired * 100) : 0; const m = Math.floor(G.elapsed / 60), s = Math.floor(G.elapsed % 60);
      this.$('winStats').innerHTML = `<div><span>ENEMIES DESTROYED</span><b>${G.killed}</b></div><div><span>COINS EARNED</span><b class="gold">🪙 ${G.coinsEarned}</b></div><div><span>TIME</span><b>${m}:${String(s).padStart(2, '0')}</b></div><div><span>ACCURACY</span><b>${acc}%</b></div>`;
      this.$('winTitle').textContent = G.level.boss ? 'BOSS DEFEATED!' : 'LEVEL COMPLETE!'; this.showScreen('win'); this.selectedLevel = G.levelIdx + 1; }
    else { this.persist(); this.$('loseStats').innerHTML = `<div><span>ENEMIES DESTROYED</span><b>${G.killed}</b></div><div><span>COINS EARNED</span><b class="gold">🪙 ${G.coinsEarned}</b></div><div><span>HIGHEST LEVEL</span><b>${this.save.maxLevel + 1}</b></div><div class="note">Your coins and upgrades are saved. Upgrade and try again!</div>`; this.showScreen('lose'); }
  },
  showTip(t) { const el = this.$('tip'); el.textContent = t; el.classList.add('show'); clearTimeout(this.tipT); this.tipT = setTimeout(() => el.classList.remove('show'), 6000); },
  coinPop() { const el = this.$('hudCoins'); el.textContent = this.save.coins; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); },
  /* ---------- screens ---------- */
  renderLevels() {
    const wrap = this.$('levelList'); wrap.innerHTML = ''; const max = this.save.maxLevel; const count = Math.max(LEVELS.length, max + 1);
    for (let i = 0; i < count; i++) {
      const L = getLevel(i); const locked = i > max; const b = document.createElement('button'); b.className = 'lvl' + (locked ? ' locked' : '') + (L.boss ? ' boss' : '') + (i === this.selectedLevel ? ' sel' : '');
      b.innerHTML = `<div class="n">${locked ? '🔒' : (i + 1)}</div><div class="t">${L.name}</div>${L.boss ? '<div class="bt">BOSS</div>' : ''}`;
      if (!locked) b.onclick = () => { this.selectedLevel = i; this.renderLevels(); }; else b.onclick = () => Audio_.play('deny');
      b.addEventListener('mouseenter', () => Audio_.play('hover')); wrap.appendChild(b);
    }
    const L = getLevel(this.selectedLevel); this.$('levelInfo').innerHTML = `<b>LEVEL ${this.selectedLevel + 1}: ${L.name}</b><br>${L.boss ? 'BOSS FIGHT — ' + BOSS_DEFS[L.boss].name : 'Waves: ' + L.waves.length + ' • Enemies: ' + L.waves.reduce((s, w) => s + Object.values(w.e).reduce((a, b) => a + b, 0), 0)}${L.tip ? '<br><i>' + L.tip + '</i>' : ''}`;
  },
  card(u, lvl, cost, canAfford, onBuy, maxed) {
    const c = document.createElement('div'); c.className = 'card' + (maxed ? ' maxed' : '');
    const dots = Array.from({ length: upgradeMax(u) }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    c.innerHTML = `<div class="ic">${u.icon}</div><h3>${u.name}</h3><p>${u.desc}</p><div class="lv">${dots}</div><div class="row"><span>CURRENT</span><b>${upgradeLabel(u, lvl)}</b></div>${maxed ? '<div class="row"><span>NEXT</span><b>MAX</b></div>' : `<div class="row"><span>NEXT</span><b class="nx">${upgradeLabel(u, lvl + 1)}</b></div>`}<button class="buy ${maxed ? 'dis' : canAfford ? '' : 'poor'}">${maxed ? 'MAXED' : '🪙 ' + cost + ' — UPGRADE'}</button>`;
    const btn = c.querySelector('button'); btn.onclick = () => { if (maxed) return; if (!canAfford) { Audio_.play('deny'); btn.classList.add('shakeX'); setTimeout(() => btn.classList.remove('shakeX'), 400); return; } onBuy(); Audio_.play('buy'); c.classList.add('bought'); };
    btn.addEventListener('mouseenter', () => Audio_.play('hover')); return c;
  },
  renderShop() {
    const wrap = this.$('shopCards'); wrap.innerHTML = ''; this.updateCoinLabels();
    for (const u of UPGRADES) { const lvl = this.save.up[u.id]; const maxed = lvl >= upgradeMax(u); const cost = maxed ? 0 : upgradeCost(u, lvl); wrap.appendChild(this.card(u, lvl, cost, this.save.coins >= cost, () => { this.save.coins -= cost; this.save.up[u.id]++; this.persist(); this.renderShop(); }, maxed)); }
    // live preview of the player's current build
    const S = playerStats(this.save); this.$('shopSummary').innerHTML = `<span class="cur">${S.tank.name}</span><span>♥ ${S.hp} HP</span><span>✸ ${S.dmg} DMG</span><span>⁂ ${S.shots} SHELL${S.shots > 1 ? 'S' : ''}</span><span>↯ ${S.bounces} BOUNCE</span><span>◈ ${Math.round(S.armor * 100)}% ARMOR</span><span>➤ ${S.speed} SPD</span><span>⟳ ${S.fireInt.toFixed(2)}s</span>`;
  },
  renderPet() {
    const $ = this.$; this.updateCoinLabels(); const lockBox = $('petLock'); const tabs = $('petTabs'); const S = this.save;
    const show = (id, on) => $(id).classList.toggle('show', on);
    if (!S.petUnlocked) {
      lockBox.classList.add('show'); tabs.classList.remove('show'); show('petSquad', false); show('petCards', false); show('petTankCards', false); show('petSummary', false);
      const can = S.coins >= PET_UNLOCK_COST; const b = $('btnUnlockPet'); b.className = 'buy big ' + (can ? '' : 'poor'); b.innerHTML = `<span class="c">🪙 ${PET_UNLOCK_COST}</span> UNLOCK COMPANION`;
      const art = $('petArt'); art.innerHTML = ''; art.appendChild(this.tankPreview('stuart', 120, 'rgba(80,200,255,0.35)'));
      b.onclick = () => { if (!can) { Audio_.play('deny'); b.classList.add('shakeX'); setTimeout(() => b.classList.remove('shakeX'), 400); return; } S.coins -= PET_UNLOCK_COST; S.petUnlocked = true; S.petSlots = ['stuart']; this.persist(); Audio_.play('unlock'); this.renderPet(); };
      return;
    }
    lockBox.classList.remove('show'); tabs.classList.add('show'); show('petSummary', true);
    this.petTab = this.petTab || 'squad'; if (this.petSel === undefined) this.petSel = 0; if (this.petSel >= S.petSlots.length) this.petSel = S.petSlots.length - 1;
    tabs.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.tab === this.petTab); b.onclick = () => { this.petTab = b.dataset.tab; Audio_.play('click'); this.renderPet(); }; });
    show('petSquad', this.petTab === 'squad'); show('petCards', this.petTab === 'upgrades'); show('petTankCards', this.petTab === 'chassis');
    // summary: shared stats of the squad
    const ex = petStats(S, S.petSlots[this.petSel] || S.petSlots[0]); const dps = S.petSlots.reduce((a, id) => { const st = petStats(S, id); return a + st.dmg * st.shots * SHOT_DMG_MULT[st.shots - 1] / st.fireInt; }, 0);
    $('petSummary').innerHTML = `<span class="cur">SQUAD <b>${S.petSlots.length} / ${MAX_PETS}</b></span><span>⚔ ${Math.round(dps)} SQUAD DPS</span><span>♥ +${25 * S.pet.health} HP</span><span>✸ +${20 * S.pet.damage}% DMG</span><span>⟳ -${10 * S.pet.fireRate}% RELOAD</span><span>➤ +${8 * S.pet.speed}% SPD</span><span>⁂ ${['SINGLE', 'DUAL', 'TRIPLE', 'QUAD'][S.pet.shot]} SHOT</span>`;
    if (this.petTab === 'squad') this.renderSquad(); if (this.petTab === 'upgrades') this.renderPetUpgrades(); if (this.petTab === 'chassis') this.renderPetGarage();
  },
  renderSquad() {
    const S = this.save; const wrap = this.$('squadSlots'); wrap.innerHTML = '';
    for (let i = 0; i < MAX_PETS; i++) {
      const el = document.createElement('div'); const id = S.petSlots[i];
      if (id) {
        const st = petStats(S, id); el.className = 'slot filled' + (i === this.petSel ? ' sel' : '');
        el.innerHTML = `<div class="num">#${i + 1}</div><div class="pv"></div><div class="nm">${st.tank.name}</div><div class="mini"><span>♥${st.hp}</span><span>✸${st.dmg}</span><span>⁂${st.shots}</span></div>${st.tank.perkText ? `<div class="pk">★ ${st.tank.perkText.split(':')[0]}</div>` : '<div class="pk none">—</div>'}<button class="chg">CHANGE TANK</button>`;
        el.querySelector('.pv').appendChild(this.tankPreview(id, 84, 'rgba(80,200,255,0.35)'));
        el.querySelector('.chg').onclick = (e) => { e.stopPropagation(); this.petSel = i; this.petTab = 'chassis'; Audio_.play('click'); this.renderPet(); };
        el.onclick = () => { this.petSel = i; Audio_.play('click'); this.renderSquad(); };
      } else if (i === S.petSlots.length) {
        const cost = PET_SLOT_COSTS[i]; const can = S.coins >= cost; el.className = 'slot buy' + (can ? '' : ' poor');
        el.innerHTML = `<div class="num">#${i + 1}</div><div class="plus">+</div><div class="nm">RECRUIT</div><p>Add a ${i + 1}${['st', 'nd', 'rd', 'th', 'th'][i]} companion tank to your squad.</p><button class="buy ${can ? '' : 'poor'}"><span class="c">🪙 ${cost}</span> UNLOCK SLOT</button>`;
        el.querySelector('button').onclick = () => { if (!can) { Audio_.play('deny'); el.classList.add('shakeX'); setTimeout(() => el.classList.remove('shakeX'), 400); return; } S.coins -= cost; S.petSlots.push(S.ownedPetTanks[0] || 'stuart'); this.persist(); Audio_.play('unlock'); this.petSel = i; this.renderPet(); };
      } else { el.className = 'slot locked'; el.innerHTML = `<div class="num">#${i + 1}</div><div class="plus">🔒</div><div class="nm">LOCKED</div><p>Unlock slot #${i} first.</p><div class="cost">🪙 ${PET_SLOT_COSTS[i]}</div>`; }
      wrap.appendChild(el);
    }
    this.$('squadNote').innerHTML = `Upgrades on the <b>PET UPGRADES</b> tab apply to <b>every</b> companion at once. Buy chassis once in the <b>HANGAR</b>, then assign them to any slot.`;
  },
  renderPetUpgrades() {
    const wrap = this.$('petCards'); wrap.innerHTML = ''; const S = this.save;
    const banner = document.createElement('div'); banner.className = 'sharedBanner'; banner.innerHTML = `<span class="ic">⇶</span><div><b>SHARED UPGRADES</b><br>One purchase upgrades all ${S.petSlots.length} companion${S.petSlots.length > 1 ? 's' : ''} in your squad.</div>`; wrap.appendChild(banner);
    for (const u of PET_UPGRADES) { const lvl = S.pet[u.id]; const maxed = lvl >= upgradeMax(u); const cost = maxed ? 0 : upgradeCost(u, lvl); wrap.appendChild(this.card(u, lvl, cost, S.coins >= cost, () => { S.coins -= cost; S.pet[u.id]++; this.persist(); this.renderPet(); }, maxed)); }
  },
  renderPetGarage() {
    const S = this.save; const wrap = this.$('petTankCards'); wrap.innerHTML = '';
    const head = document.createElement('div'); head.className = 'hangarHead';
    head.innerHTML = `<span>ASSIGNING TO SLOT</span>` + S.petSlots.map((id, i) => `<button class="slotpick ${i === this.petSel ? 'on' : ''}" data-i="${i}">#${i + 1} <em>${TANK_BY_ID[id].name}</em></button>`).join('');
    head.querySelectorAll('.slotpick').forEach(b => b.onclick = () => { this.petSel = +b.dataset.i; Audio_.play('click'); this.renderPetGarage(); });
    wrap.appendChild(head);
    for (const tk of TANK_SHOP) {
      const owned = S.ownedPetTanks.includes(tk.id); const inSlot = S.petSlots[this.petSel] === tk.id; const usedBy = S.petSlots.map((id, i) => id === tk.id ? i + 1 : 0).filter(Boolean);
      const c = this.tankCard(tk, { owned, selected: inSlot, cost: tk.petCost, forPet: true,
        onBuy: () => { S.coins -= tk.petCost; S.ownedPetTanks.push(tk.id); S.petSlots[this.petSel] = tk.id; this.persist(); this.renderPet(); },
        onSelect: () => { S.petSlots[this.petSel] = tk.id; this.persist(); this.renderPet(); } });
      if (usedBy.length) { const tag = document.createElement('div'); tag.className = 'inuse'; tag.textContent = 'IN SLOT ' + usedBy.map(n => '#' + n).join(' '); c.appendChild(tag); }
      wrap.appendChild(c);
    }
  },
  /* ---------- tank sprite preview (hull + turret) rendered into a small canvas ---------- */
  tankPreview(id, size = 96, tint = null) {
    const c = document.createElement('canvas'); c.width = size; c.height = size; c.className = 'tankpv'; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const t = Assets.tanks[id]; const d = TANK_DEFS[id]; if (!t || !t.hull) return c; const sc = size / Math.max(46, d.l + 14);
    g.translate(size / 2, size / 2); g.rotate(Math.PI / 4);
    g.drawImage(t.hull, -d.hx * sc, -d.hy * sc, 100 * sc, 100 * sc);
    const tinted = tint ? Assets.tintedTank(id, tint) : null; if (tinted) { g.globalAlpha = 0.8; g.drawImage(tinted.hull, -d.hx * sc, -d.hy * sc, 100 * sc, 100 * sc); g.globalAlpha = 1; }
    g.rotate(-0.5); g.translate((d.tx - d.hx) * sc, (d.ty - d.hy) * sc);
    g.drawImage(t.turret, -d.tx * sc, -d.ty * sc, 100 * sc, 100 * sc);
    if (tinted) { g.globalAlpha = 0.8; g.drawImage(tinted.turret, -d.tx * sc, -d.ty * sc, 100 * sc, 100 * sc); g.globalAlpha = 1; }
    return c;
  },
  statBar(label, v, max, color) { const p = clamp(v / max, 0, 1); return `<div class="sb"><span>${label}</span><i><b style="width:${p * 100}%;background:${color}"></b></i><em>${v}</em></div>`; },
  tankCard(tk, opts) {
    const { owned, selected, cost, onBuy, onSelect, forPet } = opts;
    const c = document.createElement('div'); c.className = 'card tank' + (selected ? ' sel' : '') + (owned ? ' owned' : '') + ' cls-' + tk.cls.toLowerCase();
    const hp = forPet ? Math.round(tk.hp * 0.6) : tk.hp, dmg = forPet ? Math.round(tk.dmg * 0.6) : tk.dmg, spd = forPet ? tk.speed + 15 : tk.speed, rof = forPet ? tk.fireInt * 1.6 : tk.fireInt;
    c.innerHTML = `<div class="cls">${tk.cls}</div><h3>${tk.name}</h3><div class="pv"></div><p>${tk.desc}</p>${tk.perkText ? `<div class="perk">★ ${tk.perkText}</div>` : '<div class="perk none">no special perk</div>'}
      ${this.statBar('HP', hp, forPet ? 110 : 180, '#5bd85b')}${this.statBar('DMG', dmg, forPet ? 18 : 30, '#ff8a5a')}${this.statBar('SPD', spd, 300, '#7fd4ff')}${this.statBar('ROF', Math.round(60 / rof), forPet ? 100 : 160, '#ffd166')}
      <button class="buy ${selected ? 'dis' : owned ? 'sel' : this.save.coins >= cost ? '' : 'poor'}">${selected ? (forPet ? 'IN THIS SLOT' : 'EQUIPPED') : owned ? (forPet ? 'ASSIGN TO #' + (this.petSel + 1) : 'EQUIP') : '<span class="c">🪙 ' + cost + '</span> BUY'}</button>`;
    c.querySelector('.pv').appendChild(this.tankPreview(tk.id, 96, forPet ? 'rgba(80,200,255,0.35)' : null));
    const btn = c.querySelector('button');
    btn.onclick = () => { if (selected) return; if (owned) { onSelect(); Audio_.play('click'); return; } if (this.save.coins < cost) { Audio_.play('deny'); btn.classList.add('shakeX'); setTimeout(() => btn.classList.remove('shakeX'), 400); return; } onBuy(); Audio_.play('unlock'); c.classList.add('bought'); };
    btn.addEventListener('mouseenter', () => Audio_.play('hover'));
    return c;
  },
  renderGarage() {
    const wrap = this.$('garageCards'); wrap.innerHTML = ''; this.updateCoinLabels();
    for (const tk of TANK_SHOP) {
      const owned = this.save.ownedTanks.includes(tk.id), selected = this.save.tank === tk.id;
      wrap.appendChild(this.tankCard(tk, { owned, selected, cost: tk.cost, forPet: false,
        onBuy: () => { this.save.coins -= tk.cost; this.save.ownedTanks.push(tk.id); this.save.tank = tk.id; this.persist(); this.renderGarage(); },
        onSelect: () => { this.save.tank = tk.id; this.persist(); this.renderGarage(); } }));
    }
    const S = playerStats(this.save); this.$('garageSummary').innerHTML = `<span class="cur">CURRENT: <b>${S.tank.name}</b></span><span>♥ ${S.hp} HP</span><span>✸ ${S.dmg} DMG</span><span>⁂ ${S.shots} SHELL${S.shots > 1 ? 'S' : ''}</span><span>↯ ${S.bounces} BOUNCE</span><span>◈ ${Math.round(S.armor * 100)}% ARMOR</span><span>➤ ${S.speed} SPD</span><span>⟳ ${S.fireInt.toFixed(2)}s</span>`;
  },
  renderSettings() { const s = this.save.settings; this.$('setSfx').value = s.sfx; this.$('setMusic').value = s.music; this.$('setShake').checked = s.shake; this.$('setLowFx').checked = s.lowFx; const st = this.save.stats; this.$('statsBox').innerHTML = `<div><span>TOTAL KILLS</span><b>${st.kills}</b></div><div><span>TOTAL COINS</span><b>${st.coinsTotal}</b></div><div><span>BEST LEVEL</span><b>${st.bestLevel}</b></div>`; },
  /* ---------- HUD ---------- */
  updateHUD() {
    const G = this.game; if (!G.player) return; const P = G.player; const hp = clamp(P.hp / P.maxHp, 0, 1);
    this.$('hpFill').style.width = (hp * 100) + '%'; this.$('hpFill').className = 'fill ' + (hp > 0.5 ? 'g' : hp > 0.25 ? 'y' : 'r'); this.$('hpText').textContent = Math.ceil(P.hp) + ' / ' + P.maxHp;
    this.$('hudCoins').textContent = this.save.coins;
    const alive = G.enemies.filter(e => !e.dead).length + G.pendingSpawns.length; this.$('hudEnemies').textContent = G.level.boss ? '' : ('WAVE ' + (G.waveIdx + 1) + '/' + G.level.waves.length + ' • ' + alive + ' LEFT');
    const sq = this.$('squadHud'); if (G.pets.length) { sq.classList.add('show'); if (sq.childElementCount !== G.pets.length) { sq.innerHTML = G.pets.map(p => `<div class="sqp" title="${p.name}"><i></i><b></b></div>`).join(''); } G.pets.forEach((p, i) => { const el = sq.children[i]; el.classList.toggle('dead', p.dead); el.firstChild.style.width = (p.dead ? 0 : p.hp / p.maxHp * 100) + '%'; el.lastChild.textContent = p.dead ? Math.ceil(p.respawnT) + 's' : ''; }); } else sq.classList.remove('show');
    if (G.boss) { const b = G.boss; b.hpShown += (b.hp - b.hpShown) * 0.1; this.$('bossFill').style.width = (b.hpShown / b.maxHp * 100) + '%'; this.$('bossBar').classList.toggle('hit', b.flash > 0); this.$('bossPhase').textContent = 'PHASE ' + b.phase; if (b.dead) this.$('bossBar').classList.remove('show'); }
  },
  /* ---------- main loop ---------- */
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt)); let dt = (t - this.last) / 1000; this.last = t; if (dt > 0.1) dt = 0.1;
    if (this.screen === 'play') { Input.update(); if (!this.save.settings.shake) this.game.cam.shake = 0; this.game.update(dt); this.game.draw(); this.updateHUD(); }
    else if (this.screen === 'pause') { this.game.draw(); }
    else if (this.menuBg && this.screen !== 'loading' && this.screen !== 'win' && this.screen !== 'lose') { this.menuBg.update(dt); this.menuBg.draw(); }
    else if (this.screen === 'win' || this.screen === 'lose') { this.game.update(dt * 0.3); this.game.draw(); }
  },
};

/* ---------- animated main menu background: tank arena with turret, smoke, debris ---------- */
class MenuBackground {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.t = 0; this.parts = []; this.map = new GameMap(1); this.tanks = []; this.shells = []; this.fxList = [];
    const kinds = ['t34', 'tiger', 'sherman', 'panther', 'crusader']; for (let i = 0; i < 5; i++) this.tanks.push({ kind: kinds[i], x: 300 + i * 320, y: 300 + (i % 2) * 380, sc: 2.2, a: Math.random() * TAU, ta: Math.random() * TAU, sp: 40 + Math.random() * 30, turn: (Math.random() - 0.5) * 0.6, fireT: Math.random() * 3 });
    for (let i = 0; i < 40; i++) this.parts.push({ x: Math.random() * 2000, y: Math.random() * 1200, vx: 10 + Math.random() * 30, vy: -5 - Math.random() * 15, s: 1 + Math.random() * 3, a: Math.random() });
  }
  update(dt) {
    this.t += dt; const W = this.map.W, H = this.map.H;
    for (const t of this.tanks) { t.a += t.turn * dt; t.x += Math.cos(t.a) * t.sp * dt; t.y += Math.sin(t.a) * t.sp * dt; if (t.x < 150 || t.x > W - 150) t.a = Math.PI - t.a; if (t.y < 150 || t.y > H - 150) t.a = -t.a; if (this.map.circleVsWalls(t.x, t.y, 30)) { t.a += Math.PI; t.x += Math.cos(t.a) * 10; t.y += Math.sin(t.a) * 10; } t.ta += dt * 0.8 * (t.turn > 0 ? 1 : -1); t.fireT -= dt; if (t.fireT <= 0) { t.fireT = 2 + Math.random() * 3; this.shells.push({ x: t.x + Math.cos(t.ta) * 40, y: t.y + Math.sin(t.ta) * 40, vx: Math.cos(t.ta) * 400, vy: Math.sin(t.ta) * 400, life: 1.5 }); this.fxList.push({ x: t.x + Math.cos(t.ta) * 44, y: t.y + Math.sin(t.ta) * 44, t: 0, kind: 'shotA', rot: t.ta + Math.PI / 2, sc: 0.4 }); } }
    for (let i = this.shells.length - 1; i >= 0; i--) { const s = this.shells[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (this.map.circleVsWalls(s.x, s.y, 4, true) || s.life <= 0) { this.fxList.push({ x: s.x, y: s.y, t: 0, kind: 'explosion', rot: Math.random() * TAU, sc: 0.5 }); for (let k = 0; k < 6; k++) this.parts.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 120, vy: -20 - Math.random() * 60, s: 2 + Math.random() * 3, a: 1, dead: 1.2 }); this.shells.splice(i, 1); } }
    for (let i = this.fxList.length - 1; i >= 0; i--) { const f = this.fxList[i]; f.t += dt; if (f.t * 20 >= Assets.fx[f.kind].length) this.fxList.splice(i, 1); }
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; if (p.dead !== undefined) { p.dead -= dt; if (p.dead <= 0) { this.parts.splice(i, 1); continue; } } if (p.x > W + 20) p.x = -20; if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; } }
  }
  draw() {
    const g = this.g, W = this.c.width, H = this.c.height; const z = Math.max(W / this.map.W, H / this.map.H) * 1.05; const cx = this.map.W / 2 + Math.sin(this.t * 0.1) * 120, cy = this.map.H / 2 + Math.cos(this.t * 0.13) * 60;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-cx, -cy);
    g.drawImage(this.map.baked, 0, 0);
    for (const t of this.tanks) { const S = Assets.tanks[t.kind]; const d = TANK_DEFS[t.kind]; const sc = 2.2; g.save(); g.translate(t.x, t.y); g.rotate(t.a + Math.PI / 2); g.drawImage(S.hull, -d.hx * sc, -d.hy * sc, 100 * sc, 100 * sc); g.restore(); g.save(); g.translate(t.x, t.y); g.rotate(t.ta + Math.PI / 2); g.drawImage(S.turret, -d.tx * sc, -d.ty * sc, 100 * sc, 100 * sc); g.restore(); }
    for (const s of this.shells) { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(s.x, s.y, 5, 0, TAU); g.fill(); }
    for (const f of this.fxList) { const fr = Assets.fx[f.kind][Math.min(Assets.fx[f.kind].length - 1, Math.floor(f.t * 20))]; g.save(); g.translate(f.x, f.y); g.rotate(f.rot); g.scale(f.sc, f.sc); g.globalCompositeOperation = 'lighter'; g.drawImage(fr.img, fr.ox, fr.oy); g.restore(); }
    for (const p of this.parts) { g.globalAlpha = 0.5 * (p.dead !== undefined ? Math.min(1, p.dead) : 1); g.fillStyle = p.dead !== undefined ? '#f0a040' : '#ccc'; g.fillRect(p.x, p.y, p.s, p.s); } g.globalAlpha = 1;
    g.restore();
    // dark vignette
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
}

window.addEventListener('DOMContentLoaded', () => App.init());
