// ---------- PRNG (xorshift32) & seed helpers ----------
function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRNG(seedInput) {
  let x = typeof seedInput === 'number' ? seedInput >>> 0 : hashStringToInt(String(seedInput || 'seed'));
  if (x === 0) x = 0x9e3779b9;
  return function rand() {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)] }

// ---------- Palettes ----------
const PALETTES = {
  mono: ['#e6e6e6'],
  neon: ['#00e5ff', '#00ff87', '#ff00e5', '#ffc800'],
  sunset: ['#ff6b6b', '#ffd93d', '#6b5b95', '#ff8e53'],
  ocean: ['#00a8e8', '#007ea7', '#003459', '#00f6ff'],
  forest: ['#0ead69', '#2d6a4f', '#95d5b2', '#1b4332'],
  pastel: ['#ffd6ff', '#caffbf', '#bde0fe', '#ffadad', '#fdffb6'],
};

// ---------- State & UI ----------
const $ = (sel) => document.querySelector(sel);
const state = {
  pattern: 'orbits',
  seed: `${Math.floor(Math.random() * 1e9)}`,
  symmetry: 6,
  particles: 800,
  speed: 1.6,
  linewidth: 1.2,
  palette: 'neon',
  animate: true,
};
const defaults = JSON.parse(JSON.stringify(state));
const els = {
  pattern: $('#pattern'),
  seed: $('#seed'),
  randomize: $('#randomize'),
  symmetry: $('#symmetry'),
  symmetryOut: $('#symmetryOut'),
  particles: $('#particles'),
  particlesOut: $('#particlesOut'),
  speed: $('#speed'),
  speedOut: $('#speedOut'),
  linewidth: $('#linewidth'),
  linewidthOut: $('#linewidthOut'),
  palette: $('#palette'),
  animate: $('#animate'),
  draw: $('#draw'),
  clear: $('#clear'),
  save: $('#save'),
  reset: $('#reset'),
  canvas: $('#art'),
  thumbs: $('#thumbs'),
};

// ---------- Canvas setup ----------
const ctx = els.canvas.getContext('2d');
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const parent = els.canvas.parentElement;
  const w = parent.clientWidth;
  const h = Math.max(420, Math.min(900, Math.round(w * 0.6)));
  els.canvas.width = Math.round(w * dpr);
  els.canvas.height = Math.round(h * dpr);
  els.canvas.style.width = `${w}px`;
  els.canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resizeCanvas(); if (!state.animate) drawOnce(); });

// ---------- Color utilities ----------
function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 255, g: 255, b: 255 };
}
function mixColors(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(lerp(A.r, B.r, t));
  const g = Math.round(lerp(A.g, B.g, t));
  const b2 = Math.round(lerp(A.b, B.b, t));
  return `rgb(${r},${g},${b2})`;
}

// ---------- Field functions (deterministic, seed-based) ----------
function makeField(rand) {
  // Compose a pseudo-flow field using sines with random frequencies and phases.
  const ax = rand() * 2 * Math.PI, ay = rand() * 2 * Math.PI;
  const bx = 1 + Math.floor(rand() * 4), by = 1 + Math.floor(rand() * 4);
  const cx = rand() * 2 * Math.PI, cy = rand() * 2 * Math.PI;
  const k = 2 + Math.floor(rand() * 6);
  return (x, y, t) => {
    const u = Math.sin((x * bx + t * 0.2) + ax) + Math.cos((y * by - t * 0.2) + ay);
    const v = Math.cos((x * k + t * 0.15) + cx) - Math.sin((y * k - t * 0.15) + cy);
    return { u, v };
  };
}

// ---------- Symmetry drawing ----------
function withSymmetry(drawFn, symmetry, w, h) {
  const cx = w / 2, cy = h / 2;
  return (x, y, color, lw) => {
    for (let i = 0; i < symmetry; i++) {
      const angle = (i * 2 * Math.PI) / symmetry;
      const dx = x - cx, dy = y - cy;
      const rx = Math.cos(angle) * dx - Math.sin(angle) * dy + cx;
      const ry = Math.sin(angle) * dx + Math.cos(angle) * dy + cy;
      drawFn(rx, ry, color, lw);
      // Mirror across origin for kaleidoscope feel
      const mx = 2 * cx - rx;
      const my = 2 * cy - ry;
      drawFn(mx, my, color, lw);
    }
  };
}

// ---------- Patterns ----------
function drawOrbits({ rand, w, h, time, opts }) {
  const { particles, speed, linewidth, symmetry, palette } = opts;
  const colors = PALETTES[palette] || PALETTES.neon;
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.45;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const drawPoint = (x, y, color, lw) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.0001, y); // subpixel dot
    ctx.stroke();
  };
  const symDraw = withSymmetry(drawPoint, symmetry, w, h);
  for (let i = 0; i < particles; i++) {
    const t = time + i * 0.0002;
    const a = t * speed * 0.6 + i * 0.001 * (1 + speed);
    const r = R * (0.25 + 0.7 * Math.abs(Math.sin(i * 0.017 + speed)));
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a * 1.003 + Math.sin(i * 0.03));
    const cA = colors[i % colors.length];
    const cB = colors[(i + 1) % colors.length];
    const col = mixColors(cA, cB, (Math.sin(i * 0.01 + time * 0.02) + 1) / 2);
    symDraw(x, y, col, linewidth);
  }
}

function drawFlowField({ rand, w, h, time, opts }) {
  const { particles, speed, linewidth, symmetry, palette } = opts;
  const colors = PALETTES[palette] || PALETTES.ocean;
  const field = makeField(rand);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const steps = 12; // per frame

  const pts = [];
  for (let i = 0; i < particles; i++) {
    pts.push({ x: (i * 9973 % w), y: (i * 7919 % h) });
  }

  const drawSeg = ({ x, y, nx, ny, color, lw }) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  };

  const symDraw = withSymmetry((p) => {
    // short segment in local direction for a silky feel
    drawSeg({ x: p.x, y: p.y, nx: p.x + 0.6, ny: p.y + 0.6, color: p.color, lw: p.lw });
  }, { symmetry, w, h });

  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const f = field(p.x * 0.01, p.y * 0.01, time * 0.02);
      const vx = Math.cos(f.u) * speed;
      const vy = Math.sin(f.v) * speed;
      const nx = p.x + vx;
      const ny = p.y + vy;
      const cA = colors[i % colors.length];
      const cB = colors[(i + s + 1) % colors.length];
      const col = mixColors(cA, cB, (Math.sin((i + s) * 0.002 + time * 0.03) + 1) / 2);
      symDraw({ x: nx, y: ny, color: col, lw: linewidth });
      p.x = (nx + w) % w; // wrap
      p.y = (ny + h) % h;
    }
  }
}

function drawTiles({ rand, w, h, time, opts }) {
  const { linewidth, symmetry, palette } = opts;
  const colors = PALETTES[palette] || PALETTES.pastel;
  const cols = 22, rows = 14;
  const cw = w / cols, ch = h / rows;
  ctx.globalCompositeOperation = 'source-over';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = (r * cols + c);
      const phase = (Math.sin(time * 0.01 + t * 0.3) + 1) / 2;
      const color = mixColors(colors[t % colors.length], colors[(t + 1) % colors.length], phase);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(c * cw), Math.round(r * ch), Math.ceil(cw), Math.ceil(ch));
    }
  }

  // Overlay symmetric dots
  ctx.lineWidth = linewidth;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';

  const drawPoint = ({ x, y, color, lw }) => {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, lw * 0.6), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const sym = withSymmetry(drawPoint, { symmetry, w, h });
  const n = 300;
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h;
    sym({ x, y, color: 'rgba(255,255,255,0.25)', lw: linewidth });
  }
}

// ---------- Render loop ----------
let rafId = null;
let t0 = 0;
function clearCanvas() {
  const w = els.canvas.width / (window.devicePixelRatio || 1);
  const h = els.canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
}
function frame(ts) {
  if (!t0) t0 = ts;
  const time = (ts - t0) / 16.6667; // ~frames
  const w = els.canvas.width / (window.devicePixelRatio || 1);
  const h = els.canvas.height / (window.devicePixelRatio || 1);
  const rand = makeRNG(state.seed);
  const opts = {
    particles: state.particles,
    speed: state.speed,
    linewidth: state.linewidth,
    symmetry: state.symmetry,
    palette: state.palette,
  };
  switch (state.pattern) {
    case 'orbits':    drawOrbits({ rand, w, h, time, opts }); break;
    case 'flowfield': drawFlowField({ rand, w, h, time, opts }); break;
    case 'tiles':     drawTiles({ rand, w, h, time, opts }); break;
    default:          drawOrbits({ rand, w, h, time, opts }); break;
  }
  if (state.animate) rafId = requestAnimationFrame(frame);
}
function start() { stop(); rafId = requestAnimationFrame(frame); }
function stop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
function drawOnce() { stop(); const now = performance.now(); frame(now); }

// ---------- Gallery ----------
const GALLERY_KEY = 'gap_gallery_v1';
function loadGallery() {
  const items = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
  els.thumbs.innerHTML = '';
  items.forEach((it, idx) => {
    const fig = document.createElement('figure');
    fig.setAttribute('role', 'listitem');
    const img = document.createElement('img');
    img.src = it.dataURL;
    img.alt = `Render ${idx + 1} (seed: ${it.seed})`;
    const cap = document.createElement('figcaption');
    cap.textContent = `Seed: ${it.seed} • ${it.pattern} • ${it.palette}`;
    fig.appendChild(img);
    fig.appendChild(cap);
    fig.addEventListener('click', () => {
      // restore minimal params
      els.seed.value = it.seed; state.seed = it.seed;
      els.pattern.value = it.pattern; state.pattern = it.pattern;
      els.palette.value = it.palette; state.palette = it.palette;
      drawOnce();
    });
    els.thumbs.appendChild(fig);
  });
}
function addToGallery() {
  try {
    const dataURL = els.canvas.toDataURL('image/png');
    const item = { dataURL, seed: state.seed, pattern: state.pattern, palette: state.palette, ts: Date.now() };
    const items = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
    items.unshift(item);
    while (items.length > 8) items.pop();
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
    loadGallery();
  } catch (_) {
    // Ignore quota errors
  }
}

// ---------- UI bindings ----------
function syncUIFromState() {
  els.pattern.value = state.pattern;
  els.seed.value = state.seed;
  els.symmetry.value = state.symmetry; els.symmetryOut.textContent = state.symmetry;
  els.particles.value = state.particles; els.particlesOut.textContent = state.particles;
  els.speed.value = state.speed; els.speedOut.textContent = state.speed.toFixed(1);
  els.linewidth.value = state.linewidth; els.linewidthOut.textContent = state.linewidth.toFixed(1);
  els.palette.value = state.palette;
  els.animate.checked = state.animate;
}
function attachHandlers() {
  els.pattern.addEventListener('change', e => { state.pattern = e.target.value; drawOnce(); });
  els.seed.addEventListener('change', e => { state.seed = e.target.value || `${Math.floor(Math.random()*1e9)}`; drawOnce(); });
  els.randomize.addEventListener('click', () => { state.seed = `${Math.floor(Math.random() * 1e12)}`; els.seed.value = state.seed; drawOnce(); });

  const syncRange = (input, out, key, transform = v => v) => {
    input.addEventListener('input', e => { const v = transform(e.target.value); state[key] = v; out.textContent = (typeof v === 'number' ? (key === 'speed' || key === 'linewidth' ? v.toFixed(1) : v) : v); if (!state.animate) drawOnce(); });
  };
  syncRange(els.symmetry, els.symmetryOut, 'symmetry', v => parseInt(v, 10));
  syncRange(els.particles, els.particlesOut, 'particles', v => parseInt(v, 10));
  syncRange(els.speed, els.speedOut, 'speed', v => parseFloat(v));
  syncRange(els.linewidth, els.linewidthOut, 'linewidth', v => parseFloat(v));

  els.palette.addEventListener('change', e => { state.palette = e.target.value; drawOnce(); });
  els.animate.addEventListener('change', e => { state.animate = e.target.checked; state.animate ? start() : drawOnce(); });

  els.draw.addEventListener('click', () => { state.animate ? start() : drawOnce(); });
  els.clear.addEventListener('click', () => { stop(); clearCanvas(); });
  els.save.addEventListener('click', () => { addToGallery(); const a = document.createElement('a'); a.download = `art_${state.pattern}_${state.seed}.png`; a.href = els.canvas.toDataURL('image/png'); a.click(); });
  els.reset.addEventListener('click', () => { Object.assign(state, defaults); syncUIFromState(); state.animate ? start() : drawOnce(); });
}

// ---------- Init ----------
(function init() {
  resizeCanvas();
  attachHandlers();
  syncUIFromState();
  loadGallery();

  // URL params
  const params = new URLSearchParams(window.location.search); // <- use window.location
  if (params.has('seed'))   { state.seed = params.get('seed'); els.seed.value = state.seed; }
  if (params.has('pattern')){ state.pattern = params.get('pattern'); els.pattern.value = state.pattern; }
  if (params.has('palette')){ state.palette = params.get('palette'); els.palette.value = state.palette; }
  state.animate ? start() : drawOnce();
})();
