'use strict';
/* ============================================================
   Asset loading: tank sprites, effect sprites, tileset, and
   procedurally-drawn pixel props (crates, barrels, rocks, trees...)
   ============================================================ */
const Assets = {
  img: {}, tanks: {}, fx: {}, tiles: {}, props: {}, ready: false, total: 0, loaded: 0,
  load(url) {
    this.total++;
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { this.loaded++; res(im); };
      im.onerror = () => { console.warn('missing asset', url); this.loaded++; res(null); };
      im.src = url;
    });
  },
  async loadAll() {
    const jobs = [];
    // tanks
    for (const k in TANK_DEFS) {
      const d = TANK_DEFS[k];
      const dir = encodeURIComponent(d.dir);
      jobs.push(Promise.all([this.load(`${dir}/ww2_top_view_hull${d.n}.png`), this.load(`${dir}/ww2_top_view_turret${d.n}.png`)]).then(([h, t]) => { this.tanks[k] = { hull: h, turret: t, def: d }; }));
    }
    // effects
    const fxDefs = { explosion: ['Sprite_Effects_Explosion_', 9], flame: ['Sprite_Fire_Shots_Flame_', 10], impactA: ['Sprite_Fire_Shots_Impact_A_', 4], impactB: ['Sprite_Fire_Shots_Impact_B_', 4], shotA: ['Sprite_Fire_Shots_Shot_A_', 4], shotB: ['Sprite_Fire_Shots_Shot_B_', 4], exhaust: ['Sprite_Effects_Exhaust_01_', 10] };
    for (const k in fxDefs) {
      const [pre, n] = fxDefs[k]; const arr = [];
      for (let i = 0; i < n; i++) arr.push(this.load(`Sprites/${pre}${String(i).padStart(3, '0')}.png`));
      jobs.push(Promise.all(arr).then((fr) => { this.fx[k] = this.trimFrames(fr); }));
    }
    // tiles
    const tileNames = ['Ground_Tile_01_A', 'Ground_Tile_01_B', 'Ground_Tile_01_C', 'Ground_Tile_02_A', 'Ground_Tile_02_B', 'Ground_Tile_02_C',
      'Block_A_01', 'Block_A_02', 'Block_B_01', 'Block_B_02', 'Block_C_01', 'Block_C_02', 'Building_A_01', 'Building_A_02', 'Building_B_01', 'Building_B_02',
      'Hedge_A_01', 'Hedge_A_02', 'Hedge_A_03', 'Hedge_B_01', 'Hedge_B_02', 'Hedge_B_03', 'Hedge_C_01', 'Hedge_C_02', 'Hedge_C_03'];
    for (let g of ['A', 'B']) for (let i = 1; i <= 9; i++) tileNames.push(`Decor_Tile_${g}_0${i}`);
    for (const n of tileNames) jobs.push(this.load(`assets/tiles/${n}.png`).then((im) => { this.tiles[n] = im; }));
    await Promise.all(jobs);
    this.buildDerived();
    this.ready = true;
  },
  /* crop each frame to its opaque bounds, keep offset so anchor stays at the original 128,128 center */
  trimFrames(frames) {
    return frames.filter(Boolean).map((im) => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < x0) return { img: im, ox: -64, oy: -64, w: 128, h: 128 };
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
      cc.getContext('2d').drawImage(im, x0, y0, w, h, 0, 0, w, h);
      return { img: cc, ox: x0 - im.width / 2, oy: y0 - im.height / 2, w, h };
    });
  },
  /* Pre-render tinted tank variants + procedural props */
  buildDerived() {
    for (const k in this.tanks) {
      const t = this.tanks[k];
      t.tinted = {};
    }
    this.props = buildProps();
    this.coin = buildCoinFrames();
  },
  tintedTank(kind, tint) {
    const t = this.tanks[kind]; if (!t) return null;
    if (!t.tinted[tint]) {
      const mk = (src) => { if (!src) return null; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height); return c; };
      t.tinted[tint] = { hull: mk(t.hull), turret: mk(t.turret) };
    }
    return t.tinted[tint];
  },
};

/* ---------- procedural pixel-art props (drawn once into canvases) ---------- */
function pixCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; draw(g, w, h); return c;
}
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function buildProps() {
  const P = {};
  // wooden crate 48x48
  P.crate = pixCanvas(48, 48, (g) => {
    px(g, 0, 0, 48, 48, '#5a3a1c'); px(g, 3, 3, 42, 42, '#a8743c'); px(g, 3, 3, 42, 3, '#c98e4c'); px(g, 3, 3, 3, 42, '#c98e4c');
    px(g, 3, 42, 42, 3, '#7a4f24'); px(g, 42, 3, 3, 42, '#7a4f24');
    g.strokeStyle = '#6b4520'; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 6); g.lineTo(42, 42); g.moveTo(42, 6); g.lineTo(6, 42); g.stroke();
    px(g, 0, 22, 48, 4, '#5a3a1c'); px(g, 22, 0, 4, 48, '#5a3a1c');
    for (const [x, y] of [[6, 6], [38, 6], [6, 38], [38, 38]]) px(g, x, y, 4, 4, '#3a2410');
  });
  // barrel 40x40 (top view)
  P.barrel = pixCanvas(40, 40, (g) => {
    g.fillStyle = '#5b1d12'; g.beginPath(); g.arc(20, 20, 19, 0, TAU); g.fill();
    g.fillStyle = '#b8402a'; g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.fill();
    g.fillStyle = '#d9583c'; g.beginPath(); g.arc(17, 17, 9, 0, TAU); g.fill();
    g.fillStyle = '#8d2d1c'; g.beginPath(); g.arc(20, 20, 6, 0, TAU); g.fill();
    g.strokeStyle = '#4a170e'; g.lineWidth = 2; g.beginPath(); g.arc(20, 20, 12, 0, TAU); g.stroke();
    px(g, 18, 8, 4, 4, '#f4e4a0');
  });
  P.barrelGreen = pixCanvas(40, 40, (g) => {
    g.fillStyle = '#20301a'; g.beginPath(); g.arc(20, 20, 19, 0, TAU); g.fill();
    g.fillStyle = '#4c6a36'; g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.fill();
    g.fillStyle = '#6a8a4c'; g.beginPath(); g.arc(17, 17, 9, 0, TAU); g.fill();
    g.fillStyle = '#354d26'; g.beginPath(); g.arc(20, 20, 6, 0, TAU); g.fill();
    g.strokeStyle = '#1a2612'; g.lineWidth = 2; g.beginPath(); g.arc(20, 20, 12, 0, TAU); g.stroke();
  });
  // rock 56x48
  P.rock = pixCanvas(56, 48, (g) => {
    g.fillStyle = '#4a4a55'; g.beginPath(); g.moveTo(6, 30); g.lineTo(14, 10); g.lineTo(30, 4); g.lineTo(48, 12); g.lineTo(52, 30); g.lineTo(40, 44); g.lineTo(16, 44); g.closePath(); g.fill();
    g.fillStyle = '#8a8a99'; g.beginPath(); g.moveTo(12, 28); g.lineTo(18, 14); g.lineTo(30, 9); g.lineTo(44, 15); g.lineTo(46, 28); g.lineTo(36, 38); g.lineTo(18, 38); g.closePath(); g.fill();
    g.fillStyle = '#b4b4c4'; g.beginPath(); g.moveTo(18, 22); g.lineTo(22, 15); g.lineTo(32, 12); g.lineTo(38, 18); g.lineTo(30, 24); g.closePath(); g.fill();
    g.fillStyle = '#62626f'; g.beginPath(); g.moveTo(22, 36); g.lineTo(42, 28); g.lineTo(44, 34); g.lineTo(36, 38); g.closePath(); g.fill();
  });
  P.rock2 = pixCanvas(44, 40, (g) => {
    g.fillStyle = '#4e4650'; g.beginPath(); g.moveTo(4, 26); g.lineTo(10, 8); g.lineTo(26, 3); g.lineTo(40, 14); g.lineTo(40, 30); g.lineTo(26, 38); g.lineTo(10, 36); g.closePath(); g.fill();
    g.fillStyle = '#948a96'; g.beginPath(); g.moveTo(10, 26); g.lineTo(14, 12); g.lineTo(26, 8); g.lineTo(35, 16); g.lineTo(34, 28); g.lineTo(24, 33); g.closePath(); g.fill();
    g.fillStyle = '#c4bcc8'; g.beginPath(); g.moveTo(16, 18); g.lineTo(20, 12); g.lineTo(28, 12); g.lineTo(28, 18); g.closePath(); g.fill();
  });
  // sandbag barricade 64x30
  P.sandbag = pixCanvas(64, 32, (g) => {
    const bag = (x, y, c1, c2) => { g.fillStyle = c2; g.beginPath(); g.roundRect(x, y, 22, 12, 5); g.fill(); g.fillStyle = c1; g.beginPath(); g.roundRect(x + 2, y + 2, 18, 7, 4); g.fill(); };
    for (let i = 0; i < 3; i++) bag(i * 21, 18, '#c9b27a', '#8a7448');
    for (let i = 0; i < 2; i++) bag(10 + i * 21, 8, '#d6c087', '#8a7448');
    bag(21, -1, '#dcc78f', '#8a7448');
  });
  // concrete block 64x64 (dragon teeth style)
  P.concrete = pixCanvas(64, 64, (g) => {
    px(g, 0, 0, 64, 64, '#5e5e66'); px(g, 3, 3, 58, 58, '#9a9aa6'); px(g, 3, 3, 58, 4, '#c0c0cc'); px(g, 3, 3, 4, 58, '#c0c0cc');
    px(g, 3, 57, 58, 4, '#72727e'); px(g, 57, 3, 4, 58, '#72727e');
    px(g, 14, 14, 36, 36, '#8a8a96'); px(g, 18, 18, 28, 28, '#a4a4b0');
    px(g, 20, 40, 8, 3, '#6e6e7a'); px(g, 36, 22, 3, 10, '#6e6e7a');
  });
  // tree canopy 80x80 (drawn above tanks)
  P.tree = pixCanvas(84, 84, (g) => {
    const blob = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    blob(42, 42, 40, 'rgba(0,0,0,0.25)');
    blob(42, 42, 36, '#2f6b22'); blob(28, 34, 20, '#3d8a2c'); blob(52, 30, 18, '#3d8a2c'); blob(50, 54, 20, '#357a26'); blob(30, 56, 16, '#3d8a2c');
    blob(36, 36, 10, '#5cae3c'); blob(56, 34, 6, '#5cae3c'); blob(48, 56, 7, '#4c9c34');
  });
  P.bush = pixCanvas(48, 48, (g) => {
    const blob = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    blob(24, 26, 20, 'rgba(0,0,0,0.2)'); blob(24, 24, 18, '#3b7d2a'); blob(16, 20, 10, '#4c9c34'); blob(31, 18, 9, '#4c9c34'); blob(28, 30, 9, '#448c2f'); blob(20, 18, 4, '#6cc04a');
  });
  // wrecked tank 90x50 (debris)
  P.wreck = pixCanvas(90, 56, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(45, 30, 42, 22, 0, 0, TAU); g.fill();
    px(g, 10, 12, 70, 34, '#2d2a28'); px(g, 14, 16, 62, 26, '#4a4440'); px(g, 30, 20, 30, 18, '#3a3532');
    px(g, 6, 8, 78, 5, '#1e1c1a'); px(g, 6, 45, 78, 5, '#1e1c1a');
    g.fillStyle = '#5a5046'; g.beginPath(); g.arc(44, 29, 11, 0, TAU); g.fill();
    px(g, 44, 14, 32, 5, '#2a2624'); px(g, 20, 24, 8, 6, '#c2542e'); px(g, 60, 34, 6, 5, '#c2542e');
    px(g, 24, 30, 12, 3, '#6e6258'); px(g, 62, 18, 3, 8, '#6e6258');
  });
  // ruined wall segment 64x64
  P.ruin = pixCanvas(64, 64, (g) => {
    px(g, 0, 8, 64, 56, '#5a4a3a'); px(g, 3, 11, 58, 50, '#8a7560');
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) { const off = (y % 2) * 8; px(g, 3 + x * 16 + off - 8, 11 + y * 10, 14, 8, (x + y) % 3 ? '#9c8670' : '#7e6a55'); }
    px(g, 0, 8, 64, 3, '#b39a80'); px(g, 40, 0, 24, 14, 'rgba(0,0,0,0)'); px(g, 46, 8, 18, 12, '#3a2f24');
    g.clearRect(48, 8, 16, 10); g.clearRect(0, 50, 10, 14);
  });
  // tire stack
  P.tires = pixCanvas(44, 44, (g) => {
    g.fillStyle = '#111'; g.beginPath(); g.arc(22, 22, 20, 0, TAU); g.fill();
    g.fillStyle = '#2c2c30'; g.beginPath(); g.arc(22, 22, 17, 0, TAU); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(22, 22, 9, 0, TAU); g.fill();
    g.fillStyle = '#44444a'; g.beginPath(); g.arc(22, 22, 6, 0, TAU); g.fill();
    g.strokeStyle = '#3c3c42'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(22 + Math.cos(a) * 10, 22 + Math.sin(a) * 10); g.lineTo(22 + Math.cos(a) * 17, 22 + Math.sin(a) * 17); g.stroke(); }
  });
  // tank trap (steel hedgehog)
  P.hedgehog = pixCanvas(48, 48, (g) => {
    g.strokeStyle = '#2a2a30'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(8, 8); g.lineTo(40, 40); g.moveTo(40, 8); g.lineTo(8, 40); g.moveTo(24, 4); g.lineTo(24, 44); g.stroke();
    g.strokeStyle = '#6a6a76'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 8); g.lineTo(40, 40); g.moveTo(40, 8); g.lineTo(8, 40); g.moveTo(24, 4); g.lineTo(24, 44); g.stroke();
  });
  // decals: crater, oil stain, tire tracks
  P.crater = pixCanvas(72, 72, (g) => {
    const r = (rr, c) => { g.fillStyle = c; g.beginPath(); g.arc(36, 36, rr, 0, TAU); g.fill(); };
    r(34, 'rgba(0,0,0,0.18)'); r(28, 'rgba(40,30,20,0.35)'); r(20, 'rgba(30,22,14,0.45)'); r(10, 'rgba(20,14,8,0.5)');
  });
  P.puddle = pixCanvas(70, 50, (g) => {
    g.fillStyle = 'rgba(40,60,90,0.55)'; g.beginPath(); g.ellipse(35, 25, 32, 20, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(90,130,170,0.5)'; g.beginPath(); g.ellipse(32, 22, 22, 12, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,230,255,0.4)'; g.beginPath(); g.ellipse(26, 18, 8, 3, 0, 0, TAU); g.fill();
  });
  // water tile 64x64 (2 frames)
  P.water = [0, 1].map((f) => pixCanvas(64, 64, (g) => {
    px(g, 0, 0, 64, 64, '#2f78b8');
    g.fillStyle = '#3a8ccc'; for (let i = 0; i < 6; i++) { g.fillRect((i * 23 + f * 8) % 64, (i * 17 + 7) % 64, 14, 4); }
    g.fillStyle = '#7fc1ea'; for (let i = 0; i < 4; i++) { g.fillRect((i * 31 + f * 12 + 5) % 64, (i * 19 + 3) % 64, 8, 2); }
    g.fillStyle = '#286aa6'; for (let i = 0; i < 4; i++) { g.fillRect((i * 29 + 12 - f * 6 + 64) % 64, (i * 23 + 40) % 64, 12, 3); }
  }));
  return P;
}
function buildCoinFrames() {
  const frames = [];
  for (let i = 0; i < 6; i++) {
    const wScale = Math.abs(Math.cos(i / 6 * Math.PI));
    frames.push(pixCanvas(20, 20, (g) => {
      const w = Math.max(3, 16 * wScale);
      g.fillStyle = '#8a5a10'; g.beginPath(); g.ellipse(10, 10, w / 2 + 1, 9, 0, 0, TAU); g.fill();
      g.fillStyle = '#f5c842'; g.beginPath(); g.ellipse(10, 10, w / 2, 8, 0, 0, TAU); g.fill();
      if (w > 8) { g.fillStyle = '#c9971e'; g.beginPath(); g.ellipse(10, 10, w / 2 - 3, 5, 0, 0, TAU); g.fill(); g.fillStyle = '#fff2b0'; g.fillRect(8, 5, 2, 2); }
    }));
  }
  return frames;
}
