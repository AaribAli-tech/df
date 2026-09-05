'use strict';
/* ============================================================
   Input: keyboard + mouse on desktop, twin virtual sticks on touch
   ============================================================ */
const Input = {
  keys: {}, mouse: { x: 0, y: 0, down: false }, touch: false,
  move: { x: 0, y: 0 }, aim: { x: 1, y: 0, active: false }, fire: false, aimMode: 'mouse',
  sticks: { L: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null, knob: null }, R: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null, knob: null } },
  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (this.onKey) this.onKey(e.code); });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width); this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height); this.aimMode = 'mouse'; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // touch sticks
    const L = document.getElementById('stickL'), R = document.getElementById('stickR');
    this.sticks.L.el = L; this.sticks.L.knob = L.querySelector('.knob'); this.sticks.R.el = R; this.sticks.R.knob = R.querySelector('.knob');
    const zone = document.getElementById('touchLayer');
    const onStart = (e) => {
      this.touch = true; document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        const side = t.clientX < window.innerWidth / 2 ? 'L' : 'R'; const s = this.sticks[side];
        if (s.id !== null) continue;
        s.id = t.identifier; s.ox = t.clientX; s.oy = t.clientY; s.x = 0; s.y = 0;
        s.el.style.left = (t.clientX - 70) + 'px'; s.el.style.top = (t.clientY - 70) + 'px'; s.el.classList.add('on');
        if (side === 'R') { this.aim.active = true; this.aimMode = 'touch'; this.fire = true; }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) for (const side of ['L', 'R']) {
        const s = this.sticks[side]; if (s.id !== t.identifier) continue;
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy; const d = Math.hypot(dx, dy), max = 55;
        if (d > max) { dx *= max / d; dy *= max / d; }
        s.x = dx / max; s.y = dy / max; s.knob.style.transform = `translate(${dx}px,${dy}px)`;
        if (side === 'R' && d > 8) { this.aim.x = dx / d; this.aim.y = dy / d; }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) for (const side of ['L', 'R']) {
        const s = this.sticks[side]; if (s.id !== t.identifier) continue;
        s.id = null; s.x = 0; s.y = 0; s.knob.style.transform = ''; s.el.classList.remove('on');
        if (side === 'R') { this.fire = false; }
      }
      e.preventDefault();
    };
    zone.addEventListener('touchstart', onStart, { passive: false }); zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd, { passive: false }); zone.addEventListener('touchcancel', onEnd, { passive: false });
  },
  update() {
    let mx = 0, my = 0; const k = this.keys;
    if (k.KeyW || k.ArrowUp) my -= 1; if (k.KeyS || k.ArrowDown) my += 1; if (k.KeyA || k.ArrowLeft) mx -= 1; if (k.KeyD || k.ArrowRight) mx += 1;
    const L = this.sticks.L; if (L.id !== null) { mx = L.x; my = L.y; }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    this.move.x = mx; this.move.y = my;
    if (this.aimMode === 'mouse') this.fire = this.mouse.down || !!k.Space;
    else this.fire = this.sticks.R.id !== null || !!k.Space;
  },
  pressed(code) { const v = !!this.keys[code]; if (v) this.keys[code] = false; return v; },
};
