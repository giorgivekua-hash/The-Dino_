/*
  THE DINO  -  JavaScript version
  ================================
  A 2D fruit-catching game that runs in any web browser (computer, tablet or phone).
  It is a translation of main.py (the pygame version): same game, same rules, same look.

  HOW TO RUN (on your computer)
      Keep index.html and game.js in the same folder, then double-click index.html.

  HOW TO PUT IT ONLINE
      Upload index.html and game.js to your GitHub repository and turn on GitHub Pages.

  CONTROLS
      Mouse or finger - press PLAY, then press and hold on the dinosaur and drag it anywhere.
      F               - full screen on / off  (Esc also leaves full screen)

  RULES
      Catch the falling fruit (each one = +1 FOOD).  Never touch a bomb!
      35 FOOD = level 2 (faster fruit)      65 FOOD = level 3 (tricky fruit + shields)
      100 FOOD = you win.   A bomb sends you back to level 1.

  Everything (dinosaur, fruit, backgrounds, even the sound effects) is drawn or
  made by the code below, so there are no image or sound files to carry around.

  PYTHON  ->  JAVASCRIPT  cheat sheet for reading this file
      pygame Surface         ->  a <canvas> made with makeCanvas()
      surface.blit(img, ..)  ->  ctx.drawImage(img, ..)
      (r, g, b) tuples       ->  [r, g, b] arrays
      random.uniform(a, b)   ->  rand(a, b)
      class / def / self     ->  class / function / this
*/
"use strict";

// =============================================================================
//  SETTINGS  -  numbers you can play with
// =============================================================================
const W = 1280, H = 720;     // the game is drawn at this size, the browser scales it to your screen

const LEVEL_2_AT = 35;       // FOOD needed to reach level 2   (FOOD never resets between levels)
const LEVEL_3_AT = 65;       // FOOD needed to reach level 3
const WIN_AT = 100;          // FOOD needed to win

// speed = how fast things fall (pixels per second), spawnEvery = seconds between pairs of fruit,
// bombRate = bombs per second on average, wobble = 1 means things also drift and zig-zag sideways
const LEVELS = {
  1: { speed: [190, 320], spawnEvery: 1.40, bombRate: 0.30, wobble: 0 },
  2: { speed: [300, 470], spawnEvery: 1.35, bombRate: 0.30, wobble: 0 },
  3: { speed: [400, 620], spawnEvery: 1.05, bombRate: 0.40, wobble: 1 },
};
const SHIELD_RATE = 0.12;    // shields per second on average (level 3 only)
const SHIELD_SECONDS = 5.0;  // how long the shield protects the dinosaur
const SOUND_ON = true;       // false = silent game

const GROUND_TOP = 640;      // where the grass starts on screen
const FLOOR_Y = 664;         // fruit and bombs land here
const STAND_Y = 678;         // y of the dinosaur's feet when it stands on the ground

const DINO_W = 200, DINO_H = 170;   // size of the dinosaur picture
const DINO_FOOT = 164;              // y (inside that picture) where the feet touch the ground
const DINO_START_X = 40;            // where the dinosaur stands (far left) when a game starts

const IS_TOUCH = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;


// =============================================================================
//  SMALL HELPERS
// =============================================================================
const PI = Math.PI, TAU = Math.PI * 2;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function mod(a, b) { return ((a % b) + b) % b; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function choice(list) { return list[Math.floor(Math.random() * list.length)]; }

function lerpColor(c1, c2, t) {
  t = clamp(t, 0, 1);
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}

function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function easeInOut(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
/** Overshoots a little and settles - makes pop-ups feel bouncy. */
function easeOutBack(t, s = 1.70158) {
  t = clamp(t, 0, 1) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/** A random number maker that always gives the same numbers for the same seed (like random.Random(seed)). */
function makeRng(seed) {
  let s = (seed * 2654435761) >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: next,
    uniform: (a, b) => a + next() * (b - a),
    choice: list => list[Math.floor(next() * list.length)],
  };
}

/** Turns [r, g, b] (or [r, g, b, alpha 0-255]) into a colour the canvas understands. */
function paint(c) {
  if (typeof c === "string") return c;
  return c.length > 3 ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : `rgb(${c[0]},${c[1]},${c[2]})`;
}

function starPoints(cx, cy, rOut, rIn, angle = 0, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = angle + PI * i / points - PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Turns a few points into a smooth curve (Catmull-Rom spline). */
function catmull(points, samples = 8) {
  const p = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      const f = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                         + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** A fat curved 'sausage': a smooth centre line with a width at each point -> polygon. */
function tubePolygon(points, widths, samples = 8, extra = 0) {
  const centre = catmull(points, samples);
  const n = centre.length;
  const left = [], right = [];
  for (let k = 0; k < n; k++) {
    const seg = Math.min(Math.floor(k / samples), widths.length - 2);
    const local = (k - seg * samples) / samples;
    const w = (lerp(widths[seg], widths[seg + 1], Math.min(local, 1)) + extra) / 2;
    const a = centre[Math.max(k - 1, 0)], b = centre[Math.min(k + 1, n - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    left.push([centre[k][0] + nx * w, centre[k][1] + ny * w]);
    right.push([centre[k][0] - nx * w, centre[k][1] - ny * w]);
  }
  return left.concat(right.reverse());
}

/** Turns point p around centre c by ang radians (positive = clockwise on screen). */
function rotatePoint(p, c, ang) {
  const dx = p[0] - c[0], dy = p[1] - c[1];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca];
}

/** Points around a tilted ellipse. */
function ellipsePoints(cx, cy, rx, ry, deg = 0, n = 28) {
  const out = [];
  const a = deg * PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let k = 0; k < n; k++) {
    const t = TAU * k / n;
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    out.push([cx + x * ca - y * sa, cy + x * sa + y * ca]);
  }
  return out;
}

function rectPts(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }


// =============================================================================
//  CANVAS DRAWING BASICS
// =============================================================================
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function pathPoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function fillPoly(ctx, color, pts) {
  ctx.fillStyle = paint(color);
  pathPoly(ctx, pts);
  ctx.fill();
}

function fillEllipse(ctx, color, cx, cy, rx, ry) {
  ctx.fillStyle = paint(color);
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, TAU);
  ctx.fill();
}

function fillCircle(ctx, color, cx, cy, r) { fillEllipse(ctx, color, cx, cy, r, r); }

function strokeCircle(ctx, color, cx, cy, r, width) {
  ctx.strokeStyle = paint(color);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r, 0.1), 0, TAU);
  ctx.stroke();
}

function drawLine(ctx, color, a, b, width) {
  ctx.strokeStyle = paint(color);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function strokePolyline(ctx, color, pts, width) {
  ctx.strokeStyle = paint(color);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function linearGradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [p, c] of stops) g.addColorStop(p, paint(c));
  return g;
}

/** A ball with a light spot toward (lx, ly): many ellipses that shrink and brighten. */
function shadedEllipse(ctx, cx, cy, rx, ry, dark, light, lx = -0.45, ly = -0.55, steps = 16) {
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = rx * (1 - 0.78 * t), b = ry * (1 - 0.78 * t);
    fillEllipse(ctx, lerpColor(dark, light, Math.pow(t, 1.1)), cx + lx * rx * 0.55 * t, cy + ly * ry * 0.55 * t, a, b);
  }
}

/** Draws a picture centred on (x, y), turned by deg degrees (positive = counter-clockwise, like pygame). */
function drawRotated(ctx, img, x, y, deg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-deg * PI / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function drawCentered(ctx, img, x, y, scale = 1) {
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}


// =============================================================================
//  GLOWS AND SOFT SHADOWS  (small pictures made once and reused)
// =============================================================================
const glowCache = new Map();
const shadowCache = new Map();

/** A soft round light on a black background - added onto the screen it looks like a glow. */
function glowSprite(radius, color, power = 2) {
  const key = radius + "|" + color.join(",") + "|" + power;
  let c = glowCache.get(key);
  if (!c) {
    c = makeCanvas(radius * 2, radius * 2);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, k = Math.pow(1 - t, power);
      g.addColorStop(t, paint([Math.round(color[0] * k), Math.round(color[1] * k), Math.round(color[2] * k)]));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, radius * 2, radius * 2);
    glowCache.set(key, c);
  }
  return c;
}

/** Adds light onto the picture. strength 0..1 makes it dimmer. */
function addGlow(ctx, x, y, radius, color, power = 2, strength = 1) {
  if (strength <= 0.01) return;
  radius = Math.max(Math.floor(radius / 4) * 4, 4);
  const g = glowSprite(radius, color, power);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = clamp(strength, 0, 1);
  ctx.drawImage(g, x - radius, y - radius);
  ctx.restore();
}

/** A dark oval that fades out toward its edge. */
function softShadow(w, h, alpha = 120) {
  w = Math.max(Math.round(w), 2);
  h = Math.max(Math.round(h), 2);
  const key = w + "|" + h + "|" + alpha;
  let c = shadowCache.get(key);
  if (!c) {
    c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / 2, h / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const a = alpha / 255;
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.4, `rgba(0,0,0,${a * 0.75})`);
    g.addColorStop(0.75, `rgba(0,0,0,${a * 0.3})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    shadowCache.set(key, c);
  }
  return c;
}

function drawShadow(ctx, sprite, x, y, alpha = 1) {
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(sprite, x, y);
  ctx.globalAlpha = 1;
}


// =============================================================================
//  FONTS AND FANCY TEXT  (gradient fill + black outline + soft shadow)
// =============================================================================
// The fonts are loaded from Google Fonts in index.html, so they look the same on every computer and phone.
function fontFor(kind, size) {
  return kind === "title"
    ? `${size}px Anton, Impact, "Arial Black", sans-serif`
    : `900 ${size}px Nunito, "Arial Rounded MT Bold", "Trebuchet MS", Verdana, sans-serif`;
}

const textCache = new Map();
const measureCtx = makeCanvas(4, 4).getContext("2d");

/** Returns a picture of the text: gradient fill, outline and a drop shadow. */
function fancyText(text, kind, size, top, bottom, opts = {}) {
  const outline = opts.outline || [0, 0, 0];
  const outlinePx = opts.outlinePx !== undefined ? opts.outlinePx : 3;
  const shadow = opts.shadow || [0, 4];
  const shadowAlpha = opts.shadowAlpha !== undefined ? opts.shadowAlpha : 110;
  const key = [text, kind, size, top, bottom, outline, outlinePx, shadow, shadowAlpha].join("|");
  let c = textCache.get(key);
  if (c) return c;

  const font = fontFor(kind, size);
  measureCtx.font = font;
  const m = measureCtx.measureText(text);
  const ascent = Math.ceil(m.actualBoundingBoxAscent || size * 0.8);
  const descent = Math.ceil(m.actualBoundingBoxDescent || size * 0.2);
  const w = Math.ceil(m.width), h = ascent + descent;
  const pad = outlinePx + 3;
  const [sx, sy] = shadow;
  c = makeCanvas(w + 2 * pad + Math.abs(sx), h + 2 * pad + Math.abs(sy));
  const ctx = c.getContext("2d");
  const ox = pad + Math.max(-sx, 0), oy = pad + Math.max(-sy, 0);
  const base = oy + ascent;
  ctx.font = font;
  ctx.lineJoin = "round";
  if (shadowAlpha > 0) {
    ctx.globalAlpha = shadowAlpha / 255;
    ctx.fillStyle = ctx.strokeStyle = "#000";
    ctx.lineWidth = outlinePx * 2;
    ctx.strokeText(text, ox + sx, base + sy);
    ctx.fillText(text, ox + sx, base + sy);
    ctx.globalAlpha = 1;
  }
  if (outlinePx > 0) {
    ctx.strokeStyle = paint(outline);
    ctx.lineWidth = outlinePx * 2;
    ctx.strokeText(text, ox, base);
  }
  ctx.fillStyle = linearGradient(ctx, 0, oy, 0, oy + h, [[0, top], [1, bottom]]);
  ctx.fillText(text, ox, base);
  textCache.set(key, c);
  return c;
}


// =============================================================================
//  SOUND EFFECTS  (made from math - no sound files needed)
// =============================================================================
class GameAudio {
  constructor() {
    this.sounds = {};
    this.ok = false;
    this.ctx = null;
    if (!SOUND_ON) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.rate = 22050;
    } catch (e) {
      this.ctx = null;     // no sound in this browser: the game just stays silent
    }
  }

  /** Browsers only allow sound after the player clicks or taps, so every click calls this. */
  unlock() {
    if (this.ctx && this.ctx.state === "suspended") {
      try { this.ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  /** Makes the sounds one at a time, pausing after each so the loading bar can move. */
  *buildSteps() {
    if (!this.ctx) return;
    try {
      yield* this._build();
      this.ok = true;
    } catch (e) {
      this.sounds = {};   // something went wrong: the game just stays silent
    }
  }

  // ---- tiny synthesizer ----
  _wave(duration, fn) {
    const n = Math.floor(this.rate * duration);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = fn(i / this.rate, i / Math.max(n - 1, 1));
    return out;
  }

  _sweep(f0, f1, dur, vol = 0.5, decay = 6, shape = "sine") {
    const ratio = f1 / f0;
    return this._wave(dur, (t, u) => {
      const phase = Math.abs(ratio - 1) < 1e-6
        ? TAU * f0 * t
        : TAU * f0 * dur * (Math.pow(ratio, u) - 1) / Math.log(ratio);
      let s = Math.sin(phase);
      if (shape === "square") s = 0.55 * (s >= 0 ? 1 : -1) + 0.45 * s;
      return s * vol * Math.exp(-decay * u) * Math.min(1, t / 0.004);
    });
  }

  _noise(dur, vol = 0.6, decay = 5, smooth = 0.15) {
    let state = 0;
    return this._wave(dur, (t, u) => {
      state += smooth * (rand(-1, 1) - state);
      return state * vol * Math.exp(-decay * u);
    });
  }

  /** tracks = [samples, startTimeInSeconds] pairs added together. */
  _mix(...tracks) {
    let length = 0;
    for (const [s, start] of tracks) length = Math.max(length, Math.floor(start * this.rate) + s.length);
    const out = new Float32Array(length);
    for (const [s, start] of tracks) {
      const off = Math.floor(start * this.rate);
      for (let i = 0; i < s.length; i++) out[off + i] += s[i];
    }
    return out;
  }

  _make(samples, volume = 1) {
    const buf = this.ctx.createBuffer(1, samples.length, this.rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) data[i] = clamp(samples[i] * volume, -1, 1) * 0.915;
    return buf;
  }

  *_build() {
    const notes = { C5: 523, E5: 659, G5: 784, C6: 1047, E6: 1319, G6: 1568 };
    this.sounds.click = this._make(this._mix(
      [this._sweep(900, 1500, 0.07, 0.5, 18), 0]), 0.6);
    yield;
    this.sounds.pop = this._make(this._mix(
      [this._sweep(520, 1100, 0.13, 0.55, 12), 0],
      [this._sweep(1040, 2200, 0.09, 0.25, 14), 0.01]), 0.7);
    yield;
    this.sounds.thud = this._make(this._mix(
      [this._sweep(180, 60, 0.12, 0.6, 10), 0]), 0.35);
    yield;
    this.sounds.shield = this._make(this._mix(
      [this._sweep(500, 1000, 0.18, 0.4, 6, "square"), 0],
      [this._sweep(750, 1500, 0.18, 0.4, 6, "square"), 0.09],
      [this._sweep(1000, 2000, 0.3, 0.4, 5, "square"), 0.18]), 0.5);
    yield;
    this.sounds.boom = this._make(this._mix(
      [this._noise(0.95, 0.9, 4.0, 0.2), 0],
      [this._sweep(140, 32, 0.8, 0.9, 3.5), 0]), 0.9);
    yield;
    this.sounds.puff = this._make(this._mix(
      [this._noise(0.4, 0.8, 8.0, 0.3), 0],
      [this._sweep(200, 70, 0.25, 0.5, 8), 0]), 0.6);
    yield;
    this.sounds.faint = this._make(this._mix(
      [this._sweep(440, 330, 0.28, 0.45, 3, "square"), 0.0],
      [this._sweep(392, 294, 0.28, 0.45, 3, "square"), 0.3],
      [this._sweep(349, 247, 0.28, 0.45, 3, "square"), 0.6],
      [this._sweep(294, 150, 0.6, 0.45, 2.5, "square"), 0.9]), 0.55);
    yield;
    this.sounds.levelup = this._make(this._mix(
      [this._sweep(notes.C5, notes.C5, 0.2, 0.4, 4, "square"), 0.00],
      [this._sweep(notes.E5, notes.E5, 0.2, 0.4, 4, "square"), 0.10],
      [this._sweep(notes.G5, notes.G5, 0.2, 0.4, 4, "square"), 0.20],
      [this._sweep(notes.C6, notes.C6, 0.55, 0.45, 3, "square"), 0.30],
      [this._sweep(notes.E6, notes.E6, 0.55, 0.3, 3), 0.30],
      [this._sweep(notes.G6, notes.G6, 0.55, 0.25, 3), 0.30]), 0.55);
    yield;
    const win = [[notes.C5, 0.0], [notes.E5, 0.12], [notes.G5, 0.24], [notes.C6, 0.36],
                 [notes.G5, 0.52], [notes.C6, 0.64], [notes.E6, 0.76], [notes.G6, 0.92]];
    const tracks = win.map(([f, start]) => [this._sweep(f, f, 0.3, 0.4, 4, "square"), start]);
    tracks.push([this._sweep(notes.C6, notes.C6, 1.0, 0.4, 2.5, "square"), 1.1]);
    tracks.push([this._sweep(notes.E6, notes.E6, 1.0, 0.3, 2.5), 1.1]);
    tracks.push([this._sweep(notes.G6, notes.G6, 1.0, 0.3, 2.5), 1.1]);
    this.sounds.win = this._make(this._mix(...tracks), 0.55);
    yield;
    this.sounds.whoosh = this._make(this._mix(
      [this._noise(0.5, 0.5, 2.5, 0.08), 0]), 0.45);
    yield;
  }

  play(name) {
    const buf = this.sounds[name];
    if (!buf || !this.ctx) return;
    try {
      this.unlock();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start();
    } catch (e) { /* ignore */ }
  }
}


// =============================================================================
//  DRAWING TOOLS
// =============================================================================
/** A small drawing sheet with handy shape tools. finish() gives back the finished picture. */
class Pen {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
  }

  poly(color, pts) { fillPoly(this.ctx, color, pts); }

  /** A filled shape with an outline around it. */
  polyOutline(fill, pts, outline, ow = 2) {
    const ctx = this.ctx;
    pathPoly(ctx, pts);
    ctx.strokeStyle = paint(outline);
    ctx.lineWidth = ow * 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = paint(fill);
    ctx.fill();
  }

  ellipse(color, cx, cy, rx, ry) { fillEllipse(this.ctx, color, cx, cy, rx, ry); }
  circle(color, cx, cy, r) { fillCircle(this.ctx, color, cx, cy, r); }
  line(color, a, b, width) { drawLine(this.ctx, color, a, b, width); }

  tube(color, pts, widths, extra = 0) {
    fillPoly(this.ctx, color, tubePolygon(pts, widths, 8, extra));
    this.circle(color, pts[0][0], pts[0][1], (widths[0] + extra) / 2);
    const last = pts.length - 1;
    this.circle(color, pts[last][0], pts[last][1], (widths[widths.length - 1] + extra) / 2);
  }

  shadedCircle(cx, cy, r, dark, light, lx = -0.45, ly = -0.55, steps = 16) {
    shadedEllipse(this.ctx, cx, cy, r, r, dark, light, lx, ly, steps);
  }

  shadedEllipse(cx, cy, rx, ry, dark, light, lx = -0.45, ly = -0.55, steps = 16) {
    shadedEllipse(this.ctx, cx, cy, rx, ry, dark, light, lx, ly, steps);
  }

  eraseCircle(cx, cy, r) {
    this.ctx.save();
    this.ctx.globalCompositeOperation = "destination-out";
    fillCircle(this.ctx, [0, 0, 0], cx, cy, r);
    this.ctx.restore();
  }

  finish() { return this.canvas; }
}


// =============================================================================
//  THE DINOSAUR   (a cartoon T-rex, drawn from shapes)
// =============================================================================
const DINO = {
  outline: [12, 28, 90],
  dark: [30, 74, 190],
  base: [50, 116, 238],
  light: [116, 178, 255],
  belly: [176, 218, 255],
  bellyDark: [118, 168, 238],
  spike: [20, 50, 150],
  far: [34, 84, 202],
  claw: [244, 238, 214],
  mouth: [122, 22, 48],
  tongue: [240, 96, 120],
};
const dinoCache = new Map();

/** Draws the dinosaur facing right.  Remembers every pose it has drawn, so it is fast. */
function renderDino(t, run = false, phase = 0, blink = false, mouth = 0, dead = false, dangle = false) {
  let frame = Math.floor(t * 24) % 120;        // the idle animation loops every 5 seconds
  let step = 0;
  if (run) {
    step = Math.floor(mod(phase, TAU) / TAU * 24) % 24;
    frame = 0;
  }
  const mouthQ = Math.floor(clamp(mouth, 0, 1) * 8);
  const key = [frame, step, run ? 1 : 0, blink ? 1 : 0, mouthQ, dead ? 1 : 0, dangle ? 1 : 0].join(",");
  const cached = dinoCache.get(key);
  if (cached) return cached;
  if (dinoCache.size > 500) dinoCache.clear();

  const c = DINO;
  const ph = step / 24 * TAU;
  const tl = frame / 120 * TAU;
  mouth = mouthQ / 8;
  const pen = new Pen(DINO_W, DINO_H);
  const GY = DINO_FOOT;
  const ow = 2.2;
  const breathe = Math.sin(2 * tl);
  let bob = run ? -Math.abs(Math.sin(ph)) * 3.5 : breathe * 1.2;
  let sway = run ? Math.sin(ph + 1) * 6 : Math.sin(tl) * 3.5;
  if (dead || dangle) {
    bob = breathe * 0.8;
    sway = Math.sin(4 * tl) * 4;
  }

  const shift = (pts, dy) => pts.map(p => [p[0], p[1] + dy]);

  const foot = baseX => {
    if (dead || dangle) {
      const a = 4 * tl + baseX * 0.07;
      return [baseX + 5 * Math.sin(a), GY - 34 + 5 * Math.cos(a)];
    }
    if (run) {
      const p = ph + (baseX < 90 ? 0 : PI);
      return [baseX + 20 * Math.sin(p), GY - 14 - Math.max(0, Math.cos(p)) * 17];
    }
    return [baseX, GY - 14];
  };

  const leg = (hip, ankle, fill, widthHip) => {
    const [hx, hy] = hip, [ax, ay] = ankle;
    const dx = ax - hx, dy = ay - hy;
    const d = Math.hypot(dx, dy) || 1;
    const knee = [(hx + ax) / 2 + dy / d * 14, (hy + ay) / 2 - dx / d * 14];
    const pts = [hip, knee, ankle];
    const widths = [widthHip, 18, 11];
    const toe = [[ax - 7, ay - 4], [ax + 5, ay - 8], [ax + 18, ay - 3], [ax + 31, ay + 5], [ax + 35, ay + 11],
                 [ax + 31, ay + 14], [ax - 7, ay + 14]];
    pen.tube(c.outline, pts, widths, 2 * ow);
    pen.polyOutline(fill, toe, c.outline, ow);
    pen.tube(fill, pts, widths);
    pen.line(c.outline, [ax + 15, ay + 14], [ax + 21, ay + 5], 1.2);
    pen.line(c.outline, [ax + 24, ay + 14], [ax + 29, ay + 8], 1.2);
    pen.poly(c.claw, [[ax + 33, ay + 8], [ax + 42, ay + 12], [ax + 33, ay + 14]]);
    pen.poly(c.claw, [[ax + 22, ay + 11], [ax + 28, ay + 15], [ax + 21, ay + 15]]);
  };

  // ---- back spikes (behind everything) ----
  const spikes = [[24, 97, -35, 9], [38, 89, -30, 11], [54, 80, -25, 13], [70, 70, -18, 14], [86, 63, -10, 15],
                  [102, 60, -4, 15], [118, 60, 4, 14], [130, 54, 12, 13], [140, 42, 20, 12]];
  for (const [sx, sy, ang, size] of spikes) {
    const a = ang * PI / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const tx = Math.cos(a), ty = Math.sin(a);
    const bx = sx - dx * 3, by = sy - dy * 3 + bob;
    const pts = [[bx - tx * size * 0.5, by - ty * size * 0.5], [bx + dx * size * 1.4, by + dy * size * 1.4],
                 [bx + tx * size * 0.5, by + ty * size * 0.5]];
    pen.polyOutline(c.spike, pts, c.outline, 1.8);
  }

  // ---- far hind leg (darker, behind the body) ----
  leg([96, 110 + bob], foot(106), c.far, 22);

  // ---- body outline (tail + neck + body share one outline) ----
  const tail = [[74, 86 + bob], [52, 95 + bob], [30, 102 + bob + sway * 0.5], [8, 106 + bob + sway]];
  const tailW = [46, 30, 16, 5];
  const neck = [[112, 84 + bob], [130, 66 + bob], [146, 48 + bob]];
  const neckW = [40, 32, 28];
  const ry = 36 + breathe * 0.8;
  pen.tube(c.outline, tail, tailW, 2 * ow);
  pen.tube(c.outline, neck, neckW, 2 * ow);
  pen.ellipse(c.outline, 98, 96 + bob, 52 + ow, ry + ow);

  // ---- tail and neck fill ----
  pen.tube(c.dark, tail, tailW);
  pen.tube(c.base, shift(tail, -2.5), tailW.map(w => Math.max(w - 5, 0.5)));
  pen.tube(c.light, shift(tail, -8), tailW.map(w => Math.max(w * 0.22, 2)));
  pen.tube(c.dark, neck, neckW);
  pen.tube(c.base, shift(neck, -2.5), neckW.map(w => w - 5));
  pen.tube(c.light, neck.map(([x, y]) => [x - 3, y - 4]), neckW.map(w => w * 0.22));

  // ---- body ----
  pen.ellipse(c.dark, 98, 96 + bob, 52, ry);
  pen.shadedEllipse(98, 93 + bob, 50, ry - 3, c.base, c.light, -0.25, -0.75, 14);
  // belly
  pen.shadedEllipse(104, 112 + bob, 38, 17, c.bellyDark, c.belly, 0, -0.6, 8);
  for (let i = 0; i < 5; i++) {
    const x = 80 + i * 12;
    const e = 17 * Math.sqrt(Math.max(1 - Math.pow((x - 104) / 38, 2), 0)) - 3;
    pen.line(c.bellyDark, [x, 112 + bob - e], [x + 2, 112 + bob + e], 1.2);
  }
  // scale spots
  for (const [sx, sy] of [[62, 84], [78, 74], [94, 70], [110, 72], [124, 76], [44, 92], [30, 100]]) {
    pen.circle(c.dark, sx, sy + bob, 3.6);
    pen.circle(c.base, sx - 0.5, sy + bob - 0.6, 2.0);
  }

  // ---- near hind leg ----
  leg([84, 116 + bob], foot(78), c.base, 20);
  pen.polyOutline(c.base, ellipsePoints(87, 113 + bob, 19, 30, -24), c.outline, ow);
  pen.poly(lerpColor(c.base, c.light, 0.45), ellipsePoints(83, 106 + bob, 11, 19, -24));
  pen.poly(lerpColor(c.base, c.light, 0.8), ellipsePoints(80, 100 + bob, 5, 9, -24));

  // ---- little arm ----
  const arm = [[128, 98 + bob], [140, 108 + bob], [150, 106 + bob]];
  const armW = [13, 10, 8];
  pen.tube(c.outline, arm, armW, 2 * ow);
  pen.tube(c.base, arm, armW);
  pen.poly(c.claw, [[148, 101 + bob], [158, 103 + bob], [149, 106 + bob]]);
  pen.poly(c.claw, [[148, 105 + bob], [157, 109 + bob], [148, 109 + bob]]);

  // ---- head ----
  const hb = bob;
  const skull = shift([[138, 30], [146, 16], [162, 10], [180, 14], [194, 26], [198, 36], [196, 44], [182, 50],
                       [160, 54], [142, 54], [134, 44]], hb);
  pen.polyOutline(c.base, skull, c.outline, ow);
  pen.poly(c.dark, shift([[142, 48], [160, 50], [182, 46], [194, 40], [196, 44], [182, 50], [160, 54], [142, 54]], hb));
  pen.poly(c.light, shift([[146, 20], [162, 14], [180, 17], [191, 26], [176, 24], [160, 22]], hb));

  const hinge = [148, 53 + hb];
  const jaw = shift([[148, 52], [184, 50], [191, 55], [185, 61], [160, 65], [146, 60]], hb);
  const ang = (mouth * 32 + (dead ? 8 : 0)) * PI / 180;
  const jawR = jaw.map(p => rotatePoint(p, hinge, ang));
  if (mouth > 0.05 || dead) {
    pen.poly(c.mouth, [[150, 54 + hb], [190, 54 + hb], jawR[2], jawR[5]]);
    const tongueC = rotatePoint([166, 60 + hb], hinge, ang);
    pen.ellipse(c.tongue, tongueC[0], tongueC[1], 12, 4);
  }
  pen.polyOutline(c.base, jawR, c.outline, ow * 0.9);
  pen.poly(c.bellyDark, [jawR[3], jawR[4], jawR[5], rotatePoint([150, 56 + hb], hinge, ang), rotatePoint([184, 57 + hb], hinge, ang)]);
  for (const tx of [160, 169, 178, 187]) {
    pen.polyOutline([250, 250, 245], [[tx - 3, 53 + hb], [tx + 3, 53 + hb], [tx, 59 + hb]], c.outline, 0.8);
  }
  for (const tx of [164, 174, 183]) {
    const top = jaw[0][1] + (jaw[1][1] - jaw[0][1]) * (tx - 148) / 36;
    const tri = [[tx - 2.5, top + 1], [tx + 2.5, top + 1], [tx, top - 4.5]];
    pen.poly([250, 250, 245], tri.map(p => rotatePoint(p, hinge, ang)));
  }

  // nostril, brow, eye
  pen.ellipse(c.outline, 188, 27 + hb, 2.8, 2.0);
  const ex = 164, ey = 27 + hb;
  if (dead) {
    pen.ellipse([250, 250, 250], ex, ey, 8, 8.5);
    pen.line(c.outline, [ex - 5, ey - 5], [ex + 5, ey + 5], 2.6);
    pen.line(c.outline, [ex - 5, ey + 5], [ex + 5, ey - 5], 2.6);
  } else if (blink) {
    pen.ellipse(c.base, ex, ey, 8.4, 9);
    pen.line(c.outline, [ex - 6, ey + 1], [ex + 6, ey + 1], 2.4);
  } else {
    pen.ellipse(c.outline, ex, ey, 8.6, 9.2);
    pen.ellipse([252, 252, 252], ex, ey, 7.4, 8.1);
    pen.ellipse([10, 20, 62], ex + 1.8, ey + 0.8, 4.4, 5.2);
    pen.circle([255, 255, 255], ex + 0.6, ey - 1.6, 1.8);
    pen.circle([255, 255, 255], ex + 3.2, ey + 2.6, 0.9);
  }
  const browDy = dead ? 3 : 0;
  pen.line(c.outline, [152, 17 + hb + browDy], [174, 20 + hb - browDy], 2.6);

  const img = pen.finish();
  dinoCache.set(key, img);
  return img;
}


// =============================================================================
//  FRUIT, BOMB, SHIELD AND BUBBLE PICTURES
// =============================================================================
function makeApple() {
  const pen = new Pen(86, 92);
  const out = [110, 10, 25];
  pen.ellipse(out, 43, 56, 36, 33.5);
  pen.shadedEllipse(43, 56, 34, 31.5, [168, 18, 34], [255, 112, 100], -0.35, -0.5, 20);
  pen.circle(out, 43, 26, 9.5);
  pen.eraseCircle(43, 25, 6.2);
  pen.tube([60, 36, 12], [[43, 29], [45, 18], [50, 10]], [6, 5, 5], 3);
  pen.tube([124, 78, 34], [[43, 29], [45, 18], [50, 10]], [6, 5, 5]);
  const leaf = [[50, 14], [62, 5], [78, 8], [82, 14], [68, 19]];
  pen.polyOutline([86, 196, 62], leaf, [18, 86, 30], 1.6);
  pen.line([150, 232, 110], [54, 13], [76, 11], 1.2);
  pen.ellipse([255, 196, 190], 27, 44, 6.5, 11);
  pen.ellipse([255, 238, 232], 26, 41, 3.2, 6);
  pen.circle([255, 255, 255], 60, 70, 2.4);
  return pen.finish();
}

function makeBanana() {
  const pen = new Pen(114, 86);
  const out = [118, 78, 10];
  const layers = [[-8, 9, [200, 146, 16], [236, 196, 30], [252, 232, 120]],
                  [0, 0, [214, 160, 18], [252, 214, 42], [255, 244, 156]]];
  for (const [dx, dy, dark, base, light] of layers) {
    const pts = [[20 + dx, 22 + dy], [38 + dx, 50 + dy], [68 + dx, 60 + dy], [100 + dx, 38 + dy]];
    const widths = [10, 29, 29, 12];
    pen.tube(out, pts, widths, 6);
    pen.tube(dark, pts, widths);
    pen.tube(base, pts.map(([x, y]) => [x, y - 2.5]), widths.map(w => w - 6));
    pen.tube(light, pts.slice(1, 3).map(([x, y]) => [x - 1, y - 7]), [7, 7]);
    pen.circle([96, 60, 24], pts[0][0] - 1, pts[0][1] - 1, 5);
    pen.circle([70, 44, 20], pts[3][0] + 1, pts[3][1] - 1, 3.6);
  }
  return pen.finish();
}

function makeGrapes() {
  const pen = new Pen(90, 108);
  const out = [56, 18, 96];
  pen.tube([60, 36, 12], [[45, 34], [45, 20], [40, 9]], [6, 5, 5], 3);
  pen.tube([124, 78, 34], [[45, 34], [45, 20], [40, 9]], [6, 5, 5]);
  const leaf = [[46, 18], [58, 6], [76, 8], [80, 16], [64, 22]];
  pen.polyOutline([86, 196, 62], leaf, [18, 86, 30], 1.6);
  const rows = [[4, 36], [3, 53], [2, 70], [1, 87]];
  for (const [count, y] of rows) {
    const x0 = 45 - (count - 1) * 11.5;
    for (let i = 0; i < count; i++) {
      const cx = x0 + i * 23, cy = y;
      pen.circle(out, cx, cy, 13.8);
      pen.shadedCircle(cx, cy, 12.4, [82, 26, 134], [192, 126, 240], -0.5, -0.55, 12);
      pen.circle([236, 214, 255], cx - 4.2, cy - 4.6, 2.6);
    }
  }
  return pen.finish();
}

function makeBomb() {
  const pen = new Pen(100, 120);
  pen.circle([8, 8, 14], 50, 74, 38);
  pen.shadedCircle(50, 74, 36, [12, 12, 22], [112, 120, 152], -0.45, -0.55, 22);
  pen.ellipse([176, 186, 214], 36, 56, 8, 12.5);
  pen.ellipse([236, 240, 252], 34, 52, 3.6, 6);
  pen.polyOutline([128, 134, 150], [[35, 42], [65, 42], [61, 31], [39, 31]], [8, 8, 14], 2);
  pen.poly([176, 182, 198], [[38, 33], [62, 33], [63, 36], [37, 36]]);
  const rope = [[52, 32], [57, 22], [56, 13], [63, 6]];
  pen.tube([46, 26, 10], rope, [8, 8, 8, 7.5], 3.5);
  pen.tube([170, 118, 56], rope, [8, 8, 8, 7.5]);
  for (const p of [[55, 27], [57, 21], [57, 15], [60, 10]]) {
    pen.line([96, 60, 26], [p[0] - 3.5, p[1] - 1.5], [p[0] + 3.5, p[1] + 1.5], 1.6);
  }
  return pen.finish();
}

function shieldPolygon(cx, cy, w, h) {
  return [[cx - w / 2, cy - h / 2 + 8], [cx, cy - h / 2], [cx + w / 2, cy - h / 2 + 8], [cx + w / 2, cy + h * 0.05],
          [cx + w * 0.38, cy + h * 0.30], [cx, cy + h / 2], [cx - w * 0.38, cy + h * 0.30], [cx - w / 2, cy + h * 0.05]];
}

function makeShieldItem() {
  const pen = new Pen(84, 100);
  const cx = 42, cy = 50;
  pen.polyOutline([255, 206, 72], shieldPolygon(cx, cy, 72, 88), [20, 36, 110], 2.4);
  pen.poly([255, 240, 160], shieldPolygon(cx - 1.5, cy - 2, 64, 78));
  pen.poly([226, 150, 30], shieldPolygon(cx, cy + 1, 62, 76));
  for (let i = 0; i < 9; i++) {
    const t = i / 8, k = 1 - i * 0.045;
    pen.poly(lerpColor([38, 84, 226], [138, 196, 255], Math.pow(t, 0.9)), shieldPolygon(cx - 0.5 * t, cy - 2 - 5 * t, 56 * k, 70 * k));
  }
  pen.polyOutline([255, 255, 255], starPoints(cx, cy + 1, 15, 6.5), [20, 36, 110], 1.6);
  pen.poly([210, 232, 255], [[cx - 22, cy - 28], [cx - 8, cy - 32], [cx - 24, cy - 8]]);
  return pen.finish();
}

/** The shield bubble: a light-blue ring filled with see-through orange. */
function makeBubble(d = 300) {
  const r = d / 2;
  const c = makeCanvas(d, d);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (let i = 29; i >= 0; i--) {
    const t = i / 29;
    const a = lerp(120, 28, Math.pow(t, 0.8));
    g.addColorStop(clamp(1 - 0.97 * t, 0, 1), `rgba(255,172,72,${a / 255})`);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, TAU);
  ctx.fill();
  strokeCircle(ctx, [80, 170, 255, 110], r, r, r - 4.5, 7);
  strokeCircle(ctx, [60, 150, 255, 240], r, r, r - 8, 6);
  strokeCircle(ctx, [190, 232, 255, 255], r, r, r - 8, 2);
  const arc = [];
  for (let a = 200; a < 262; a += 4) arc.push([r + Math.cos(a * PI / 180) * (r - 20), r + Math.sin(a * PI / 180) * (r - 20)]);
  strokePolyline(ctx, [255, 255, 255, 215], arc, 6);
  fillCircle(ctx, [255, 255, 255, 215], r + Math.cos(276 * PI / 180) * (r - 20), r + Math.sin(276 * PI / 180) * (r - 20), 4);
  return c;
}

function makeCloud(w, h, light, shade) {
  const pen = new Pen(w, h);
  const blobs = [[0.18, 0.64, 0.20], [0.36, 0.46, 0.28], [0.58, 0.40, 0.32], [0.78, 0.54, 0.24], [0.90, 0.68, 0.16]];
  for (const [fx, fy, fr] of blobs) pen.circle(shade, fx * w, (fy + 0.07) * h, fr * h);
  pen.poly(shade, rectPts(0.12 * w, 0.70 * h, 0.95 * w, 0.88 * h));
  for (const [fx, fy, fr] of blobs) pen.circle(light, fx * w, fy * h, fr * h);
  pen.poly(light, rectPts(0.12 * w, 0.68 * h, 0.95 * w, 0.80 * h));
  pen.poly(light, rectPts(0.28 * w, 0.50 * h, 0.82 * w, 0.70 * h));
  return pen.finish();
}


// =============================================================================
//  BACKGROUND WORLDS  (the home screen + one for each level)
// =============================================================================
const THEMES = {
  home: {
    sky: [[0, [22, 20, 80]], [0.36, [96, 48, 132]], [0.66, [232, 104, 108]], [0.90, [255, 176, 108]], [1, [255, 214, 140]]],
    sun: [430, 470, 118, [255, 232, 170], [255, 140, 70]], moon: null, stars: 70,
    volcano: [[58, 34, 84], 940, 250, false],
    far: [[104, 60, 138], [156, 100, 176]], mid: [[74, 44, 112], [120, 78, 152]], near: [[44, 28, 78], [92, 62, 122]],
    trees: [[22, 14, 44], "palm"], ground: [[70, 46, 90], [26, 18, 46]], grass: [[128, 90, 148], [82, 58, 104]],
    fg: [18, 10, 34], cloud: [[255, 188, 150], [214, 120, 140]], critter: "ptero", embers: 6, fireflies: true, smoke: true,
  },
  1: {
    sky: [[0, [64, 142, 240]], [0.55, [140, 204, 252]], [1, [226, 246, 255]]],
    sun: [1040, 150, 56, [255, 248, 190], [255, 236, 130]], moon: null, stars: 0, volcano: null,
    far: [[142, 178, 218], [190, 214, 240]], mid: [[98, 178, 112], [152, 216, 152]], near: [[58, 148, 78], [112, 192, 112]],
    trees: [[28, 104, 62], "palm"], ground: [[112, 202, 84], [98, 66, 40]], grass: [[156, 230, 104], [84, 170, 66]],
    fg: [38, 120, 52], cloud: [[255, 255, 255], [206, 224, 244]], critter: "birds", embers: 0, fireflies: false, smoke: false,
  },
  2: {
    sky: [[0, [56, 36, 108]], [0.42, [190, 70, 122]], [0.76, [255, 138, 82]], [1, [255, 208, 124]]],
    sun: [900, 470, 96, [255, 228, 156], [255, 160, 80]], moon: null, stars: 40, volcano: null,
    far: [[150, 84, 140], [204, 124, 164]], mid: [[120, 58, 114], [172, 92, 132]], near: [[82, 42, 88], [132, 72, 112]],
    trees: [[46, 24, 62], "palm"], ground: [[196, 112, 72], [94, 52, 52]], grass: [[238, 152, 86], [162, 88, 68]],
    fg: [54, 28, 62], cloud: [[255, 176, 150], [222, 114, 134]], critter: "ptero", embers: 0, fireflies: false, smoke: false,
  },
  3: {
    sky: [[0, [6, 8, 26]], [0.55, [28, 22, 72]], [0.86, [98, 38, 82]], [1, [176, 64, 60]]],
    sun: null, moon: [190, 130, 46], stars: 110, volcano: [[52, 36, 72], 900, 230, true],
    far: [[42, 34, 86], [76, 62, 124]], mid: [[30, 24, 66], [58, 46, 102]], near: [[20, 16, 46], [46, 36, 80]],
    trees: [[10, 8, 24], "dead"], ground: [[64, 42, 54], [24, 16, 30]], grass: [[92, 62, 72], [52, 36, 50]],
    fg: [8, 6, 18], cloud: null, critter: null, embers: 14, fireflies: false, smoke: true, lavaGround: true,
  },
};

const RIDGES = [   // baseY, harmonics [how many bumps, how tall], jagged?, scroll speed in pixels per second
  [455, [[2, 80], [3, 46], [5, 24]], true, 5],
  [520, [[1, 36], [2, 22], [3, 12]], false, 12],
  [585, [[1, 24], [2, 14], [4, 8]], false, 24],
];

function ridgeY(x, baseY, harmonics, phases, jagged) {
  let y = baseY;
  harmonics.forEach(([k, amp], i) => {
    if (jagged) y -= amp * (1 - Math.abs(Math.sin(PI * k * x / W + phases[i])));   // sharp mountain peaks
    else y -= amp * Math.sin(TAU * k * x / W + phases[i]);                           // soft rolling hills
  });
  return y;
}

function drawPalm(pen, x, y, s, color, lean, rng) {
  const h = 150 * s;
  const trunk = [[x, y + 6], [x + lean * 0.3 * h, y - h * 0.4], [x + lean * 0.7 * h, y - h * 0.75], [x + lean * h, y - h]];
  pen.tube(color, trunk, [14 * s, 11 * s, 9 * s, 8 * s]);
  const [cx, cy] = trunk[3];
  for (let k = 0; k < 8; k++) {
    const ang = (-170 + k * (160 / 7)) * PI / 180;
    const length = (72 + rng.uniform(-10, 10)) * s;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const mid = [cx + dx * length * 0.55, cy + dy * length * 0.55 - 8 * s];
    const tip = [cx + dx * length, cy + dy * length + 26 * s];
    pen.tube(color, [[cx, cy], mid, tip], [7 * s, 12 * s, 1.5 * s]);
  }
}

function drawDeadTree(pen, x, y, s, color, rng) {
  const branch = (px, py, ang, length, width, depth) => {
    const ex = px + Math.cos(ang) * length, ey = py + Math.sin(ang) * length;
    const mx = (px + ex) / 2 + rng.uniform(-6, 6) * s;
    const my = (py + ey) / 2 + rng.uniform(-6, 6) * s;
    pen.tube(color, [[px, py], [mx, my], [ex, ey]], [width, width * 0.75, width * 0.55]);
    if (depth > 0) {
      for (const da of [-0.55, 0.5]) branch(ex, ey, ang + da + rng.uniform(-0.2, 0.2), length * 0.68, width * 0.55, depth - 1);
    }
  };
  branch(x, y + 4, -PI / 2 + rng.uniform(-0.15, 0.15), 70 * s, 10 * s, 3);
}

/** One strip of mountains or hills.  Its left and right edges match, so it can scroll forever. */
function makeLayer(color, rim, ridge, seed, trees) {
  const [baseY, harmonics, jagged] = ridge;
  const rng = makeRng(seed);
  const phases = harmonics.map(() => rng.uniform(0, TAU));
  let minY = Infinity;
  for (let x = 0; x < W; x += 8) minY = Math.min(minY, ridgeY(x, baseY, harmonics, phases, jagged));
  const top = Math.floor(Math.max(minY - 230, 0));
  const h = GROUND_TOP + 30 - top;
  const pen = new Pen(W, h);
  const pts = [];
  for (let x = 0; x < W + 8; x += 8) pts.push([x, ridgeY(x, baseY, harmonics, phases, jagged) - top]);
  pen.poly(color, pts.concat([[W + 8, h], [0, h]]));
  strokePolyline(pen.ctx, rim, pts.map(([x, y]) => [x, y + 1]), 3);
  if (trees) {
    const [tcolor, kind] = trees;
    const positions = kind === "palm" ? [70, 300, 560, 800, 1060, 1210] : [120, 420, 760, 1000, 1180];
    for (let x of positions) {
      x += rng.uniform(-30, 30);
      const gy = ridgeY(x, baseY, harmonics, phases, jagged) - top;
      const s = rng.uniform(0.8, 1.25);
      const lean = rng.uniform(-0.25, 0.25);
      for (const dx of [-W, 0, W]) {          // draw copies at both edges so the strip tiles perfectly
        if (kind === "palm") drawPalm(pen, x + dx, gy, s, tcolor, lean, makeRng(Math.floor(x) + seed));
        else drawDeadTree(pen, x + dx, gy, s, tcolor, makeRng(Math.floor(x) + seed));
      }
    }
  }
  return [pen.finish(), top];
}

function makeVolcano(ctx, color, vx, topY, erupting) {
  const baseY = GROUND_TOP;
  const pts = [[vx - 460, baseY + 10], [vx - 300, baseY - 70], [vx - 170, topY + 110], [vx - 95, topY + 20], [vx - 60, topY],
               [vx + 60, topY], [vx + 95, topY + 20], [vx + 180, topY + 115], [vx + 310, baseY - 70], [vx + 470, baseY + 10]];
  fillPoly(ctx, color, catmull(pts, 6));
  fillEllipse(ctx, lerpColor(color, [255, 120, 40], erupting ? 0.85 : 0.25), vx, topY + 1, 62, 8);
  if (erupting) {
    const streams = [
      [[vx - 50, topY + 6], [vx - 86, topY + 56], [vx - 130, topY + 112], [vx - 182, topY + 176], [vx - 236, topY + 230]],
      [[vx + 54, topY + 6], [vx + 92, topY + 62], [vx + 142, topY + 128], [vx + 200, topY + 192], [vx + 250, topY + 238]],
    ];
    for (const line of streams) {
      fillPoly(ctx, [226, 80, 24], tubePolygon(line, [14, 15, 12, 9, 5], 8));
      fillPoly(ctx, [255, 190, 70], tubePolygon(line, [6, 7, 5, 3.5, 2], 8));
    }
  }
}

function makeSky(th) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = linearGradient(ctx, 0, 0, 0, H, th.sky);
  ctx.fillRect(0, 0, W, H);
  if (th.sun) {
    const [sx, sy, sr, core, glow] = th.sun;
    addGlow(ctx, sx, sy, sr * 3.4, glow, 2.2);
    fillCircle(ctx, lerpColor(core, glow, 0.35), sx, sy, sr + 5);
    fillCircle(ctx, core, sx, sy, sr);
  }
  if (th.moon) {
    const [mx, my, mr] = th.moon;
    addGlow(ctx, mx, my, mr * 4.2, [110, 130, 220], 2.0);
    fillCircle(ctx, [226, 232, 250], mx, my, mr);
    for (const [dx, dy, cr] of [[-14, -10, 9], [12, 6, 12], [-6, 18, 6], [16, -18, 5]]) {
      fillCircle(ctx, [196, 204, 232], mx + dx, my + dy, cr);
    }
  }
  if (th.volcano) {
    const [color, vx, topY, erupting] = th.volcano;
    makeVolcano(ctx, color, vx, topY, erupting);
  }
  return c;
}

function makeGround(th, rng) {
  const gh = H - GROUND_TOP + 12;
  const c = makeCanvas(W, gh);
  const ctx = c.getContext("2d");
  const [topC, botC] = th.ground;
  const edgeY = x => 8 + 4 * Math.sin(x / 90) + 3 * Math.sin(x / 37 + 1);
  const edge = [];
  for (let x = 0; x < W + 10; x += 10) edge.push([x, edgeY(x)]);
  ctx.fillStyle = linearGradient(ctx, 0, 0, 0, gh, [[0, topC], [1, botC]]);
  pathPoly(ctx, edge.concat([[W, gh], [0, gh]]));
  ctx.fill();
  strokePolyline(ctx, lerpColor(topC, [255, 255, 255], 0.22), edge, 5);
  const [light, dark] = th.grass;
  for (let x = 0; x < W; x += 5) {
    const ey = edgeY(x);
    const hh = rng.uniform(6, 18);
    const col = rng.random() < 0.55 ? light : dark;
    fillPoly(ctx, col, [[x - 3, ey + 4], [x + rng.uniform(-4, 4), ey - hh], [x + 3, ey + 4]]);
  }
  for (let i = 0; i < 170; i++) {           // little pebbles
    const x = rng.uniform(0, W), y = rng.uniform(34, gh - 4);
    let col = lerpColor(topC, botC, rng.uniform(0.3, 1.0));
    col = lerpColor(col, rng.random() < 0.5 ? [0, 0, 0] : [255, 255, 255], 0.14);
    const r = rng.uniform(2, 6);
    fillEllipse(ctx, col, x + r, y + r / 2, r, r / 2);
  }
  for (let i = 0; i < 7; i++) {             // bigger stones
    const x = rng.uniform(0, W), y = rng.uniform(46, gh - 14), r = rng.uniform(7, 15);
    fillEllipse(ctx, lerpColor(botC, [150, 150, 160], 0.35), x + 1.1 * r, y + 0.6 * r, 1.1 * r, 0.6 * r);
    fillEllipse(ctx, lerpColor(botC, [210, 210, 220], 0.35), x + 2 + 0.75 * r, y + 1 + 0.3 * r, 0.75 * r, 0.3 * r);
  }
  if (th.lavaGround) {                      // glowing lava cracks (level 3)
    for (let i = 0; i < 11; i++) {
      let x = rng.uniform(0, W), y = rng.uniform(34, gh - 18);
      const direction = rng.choice([-1, 1]);
      const pts = [[x, y]];
      for (let j = 0; j < 6; j++) {
        x += direction * rng.uniform(10, 30);
        y = clamp(y + rng.uniform(-5, 7), 30, gh - 8);
        pts.push([x, y]);
      }
      strokePolyline(ctx, [255, 110, 30], pts, 4);
      strokePolyline(ctx, [255, 214, 90], pts, 2);
    }
  }
  return c;
}

function makeForeground(th, rng) {
  const h = 90;
  const pen = new Pen(W, h);
  for (let i = 0; i < 150; i++) {
    const x = rng.uniform(-10, W + 10);
    const bh = rng.uniform(14, 46);
    const lean = rng.uniform(-9, 9);
    const shade = lerpColor(th.fg, [255, 255, 255], rng.uniform(0, 0.12));
    pen.poly(shade, [[x - 4, h + 2], [x + lean, h - bh], [x + 5, h + 2]]);
  }
  return [pen.finish(), H - h];
}

/** Darkens the corners of the screen a little, so the middle stands out. */
function makeVignette() {
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.translate(W / 2, H / 2);
  ctx.scale(W * 0.78, H * 0.82);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  const inner = 0.22 / 0.78;
  g.addColorStop(0, "rgba(0,0,0,0)");
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;                                // 0 = outer edge, 1 = inner
    const pos = lerp(1, inner, t);
    const a = 120 * Math.pow(1 - t, 1.6);
    g.addColorStop(pos, `rgba(0,0,0,${a / 255})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  return c;
}

/** A complete background: sky, drifting clouds, scrolling hills, ground and glowing details. */
class World {
  constructor(key) {
    const th = THEMES[key];
    this.th = th;
    const seed = key === "home" ? 7 : key * 11;
    const rng = makeRng(seed);
    this.sky = makeSky(th);
    this.layers = RIDGES.map((ridge, i) => {
      const colors = [th.far, th.mid, th.near][i];
      const [surf, top] = makeLayer(colors[0], colors[1], ridge, seed + i, i === 2 ? th.trees : null);
      return [surf, top, ridge[3]];
    });
    this.ground = makeGround(th, rng);
    [this.fg, this.fgY] = makeForeground(th, rng);
    this.clouds = [];
    if (th.cloud) {
      const [light, shade] = th.cloud;
      const sprites = [makeCloud(260, 120, light, shade), makeCloud(200, 96, light, shade), makeCloud(330, 140, light, shade)];
      for (let i = 0; i < 6; i++) {
        this.clouds.push({ x: rng.uniform(-100, W), y: rng.uniform(30, 250), spr: sprites[i % 3], v: rng.uniform(8, 22) });
      }
    }
    this.stars = [];
    for (let i = 0; i < th.stars; i++) {
      this.stars.push([rng.uniform(0, W), rng.uniform(0, 330), rng.uniform(0, 6.3), rng.choice([1, 1, 2])]);
    }
    this.critters = [];
    if (th.critter === "birds") {
      for (let i = 0; i < 4; i++) {
        this.critters.push({ x: rng.uniform(0, W), y: rng.uniform(90, 260), v: rng.uniform(40, 70), ph: rng.uniform(0, 6), s: rng.uniform(0.8, 1.3) });
      }
    } else if (th.critter === "ptero") {
      for (let i = 0; i < 2; i++) {
        this.critters.push({ x: rng.uniform(0, W), y: rng.uniform(110, 240), v: rng.uniform(50, 80), ph: rng.uniform(0, 6), s: rng.uniform(0.9, 1.3) });
      }
    }
    this.parts = [];
    this.fireflies = [];
    if (th.fireflies) {
      for (let i = 0; i < 26; i++) this.fireflies.push([rng.uniform(0, W), rng.uniform(380, 630), rng.uniform(0, 6.3), rng.uniform(0.4, 1.0)]);
    }
    this.t = 0;
    this.rng = makeRng(seed + 99);
  }

  // ---- animation ----
  update(dt) {
    this.t += dt;
    const rng = this.rng;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 40) c.x = -c.spr.width - 20;
    }
    for (const c of this.critters) {
      c.x += c.v * dt;
      if (c.x > W + 100) {
        c.x = -100;
        c.y = rng.uniform(90, 260);
      }
    }
    const th = this.th;
    if (th.volcano) {
      const vx = th.volcano[1], top = th.volcano[2];
      if (th.embers && rng.random() < th.embers * dt) {
        this.parts.push({ k: "ember", x: vx + rng.uniform(-40, 40), y: top, vx: rng.uniform(-50, 50),
                          vy: rng.uniform(-170, -80), age: 0, life: rng.uniform(2.0, 3.6) });
      }
      if (th.smoke && rng.random() < 3.2 * dt) {
        this.parts.push({ k: "smoke", x: vx + rng.uniform(-30, 30), y: top - 6, vx: rng.uniform(8, 26),
                          vy: rng.uniform(-44, -26), age: 0, life: rng.uniform(5.0, 8.0) });
      }
    }
    if (th.lavaGround && rng.random() < 5 * dt) {
      this.parts.push({ k: "ember", x: rng.uniform(0, W), y: GROUND_TOP + rng.uniform(10, 60), vx: rng.uniform(-20, 20),
                        vy: rng.uniform(-90, -40), age: 0, life: rng.uniform(1.0, 2.0) });
    }
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter(p => p.age < p.life);
  }

  draw(ctx) {
    const t = this.t;
    ctx.drawImage(this.sky, 0, 0);
    for (const [x, y, ph, size] of this.stars) {
      const b = 0.55 + 0.45 * Math.sin(t * 2.2 + ph);
      fillCircle(ctx, [Math.round(120 + 135 * b), Math.round(130 + 125 * b), Math.round(160 + 95 * b)], x, y, size);
    }
    for (const c of this.clouds) ctx.drawImage(c.spr, Math.round(c.x), Math.round(c.y));
    for (const c of this.critters) {
      if (this.th.critter === "birds") this._bird(ctx, c);
      else this._ptero(ctx, c);
    }
    for (const p of this.parts) {                    // smoke floats behind the hills
      if (p.k === "smoke") {
        const u = p.age / p.life;
        const size = Math.floor((50 + u * 120) / 8) * 8;
        drawShadow(ctx, softShadow(size, size, 90), p.x - size / 2, p.y - size / 2, 1 - u);
      }
    }
    if (this.th.volcano) {
      const vx = this.th.volcano[1], top = this.th.volcano[2];
      const flick = 1 + 0.12 * Math.sin(t * 9) + 0.08 * Math.sin(t * 23);
      const strength = this.th.volcano[3] ? 1.0 : 0.45;
      addGlow(ctx, vx, top, 150 * flick, [255, 110, 40], 1.8, strength);
    }
    this.layers.forEach(([layer, top, speed], i) => {
      const off = Math.floor(t * speed) % W;
      ctx.drawImage(layer, -off, top);
      ctx.drawImage(layer, W - off, top);
      if (i === 1) this._emberPass(ctx);
    });
    ctx.drawImage(this.ground, 0, GROUND_TOP - 8);
    for (const f of this.fireflies) {
      const fx = f[0] + Math.sin(t * 0.6 * f[3] + f[2]) * 40;
      const fy = f[1] + Math.cos(t * 0.5 * f[3] + f[2] * 2) * 26;
      const b = Math.max(0, Math.sin(t * 1.6 * f[3] + f[2]));
      if (b > 0.05) addGlow(ctx, fx, fy, 14, [190, 255, 70], 1.4, b);
    }
  }

  _emberPass(ctx) {
    for (const p of this.parts) {
      if (p.k === "ember") addGlow(ctx, p.x, p.y, 10, [255, 150, 50], 1.2, 1 - p.age / p.life);
    }
  }

  drawForeground(ctx) { ctx.drawImage(this.fg, 0, this.fgY); }

  _bird(ctx, c) {
    const s = c.s;
    const flap = Math.sin(this.t * 8 + c.ph);
    const x = c.x, y = c.y + Math.sin(this.t * 1.3 + c.ph) * 8;
    const pts = [[x - 16 * s, y - 6 * s * flap - 2 * s], [x - 7 * s, y - 4 * s * flap - 7 * s], [x, y],
                 [x + 7 * s, y - 4 * s * flap - 7 * s], [x + 16 * s, y - 6 * s * flap - 2 * s]];
    strokePolyline(ctx, [44, 66, 96], pts, 3);
  }

  _ptero(ctx, c) {
    const s = c.s;
    const flap = Math.sin(this.t * 5 + c.ph);
    const x = c.x, y = c.y + Math.sin(this.t * 1.1 + c.ph) * 10;
    const col = lerpColor(this.th.near[0], [0, 0, 0], 0.3);
    fillPoly(ctx, col, [[x + 8 * s, y - 3 * s], [x - 46 * s, y - 36 * s * flap - 4 * s], [x - 20 * s, y + 4 * s], [x - 6 * s, y + 8 * s]]);
    fillPoly(ctx, col, [[x - 20 * s, y], [x + 20 * s, y - 5 * s], [x + 24 * s, y + 5 * s], [x - 16 * s, y + 8 * s]]);
    fillPoly(ctx, col, [[x + 18 * s, y - 6 * s], [x + 46 * s, y - 1 * s], [x + 20 * s, y + 3 * s]]);
    fillPoly(ctx, col, [[x + 16 * s, y - 5 * s], [x + 6 * s, y - 16 * s], [x + 8 * s, y - 2 * s]]);
    fillPoly(ctx, col, [[x - 16 * s, y + 4 * s], [x - 34 * s, y + 10 * s], [x - 14 * s, y + 8 * s]]);
  }
}


// =============================================================================
//  PANELS, BUTTONS AND ICONS
// =============================================================================
/** A glossy rounded rectangle (white fading to light blue) with a black border. */
function makePanel(w, h, radius = 22, top = [255, 255, 255], bottom = [188, 220, 255], border = [0, 0, 0], bw = 4) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  roundRectPath(ctx, 0, 0, w, h, radius);
  ctx.fillStyle = paint(border);
  ctx.fill();
  const ir = Math.max(radius - bw, 2);
  roundRectPath(ctx, bw, bw, w - 2 * bw, h - 2 * bw, ir);
  ctx.fillStyle = linearGradient(ctx, 0, bw, 0, h - bw, [[0, top], [1, bottom]]);
  ctx.fill();
  roundRectPath(ctx, bw + 1.5, bw + 1.5, w - 2 * bw - 3, h - 2 * bw - 3, Math.max(ir - 1.5, 2));
  ctx.strokeStyle = "rgb(96,156,255)";
  ctx.lineWidth = 3;
  ctx.stroke();
  roundRectPath(ctx, bw + 6, bw + 5, w - 2 * bw - 12, (h - 2 * bw) * 0.40, Math.max(radius - bw - 4, 2));
  ctx.fillStyle = "rgba(255,255,255,0.47)";
  ctx.fill();
  return c;
}

function makePlayIcon(size) {
  const pen = new Pen(size, size);
  const tri = [[0.22 * size, 0.10 * size], [0.92 * size, 0.5 * size], [0.22 * size, 0.90 * size]];
  pen.polyOutline([40, 120, 255], tri, [0, 0, 0], 0.08 * size);
  pen.poly([130, 190, 255], [[0.30 * size, 0.24 * size], [0.70 * size, 0.46 * size], [0.30 * size, 0.46 * size]]);
  return pen.finish();
}

function makeRestartIcon(size) {
  const pen = new Pen(size, size);
  const c = size / 2, r = size * 0.30;
  const pts = [];
  for (let a = -40; a < 250; a += 10) pts.push([c + Math.cos(a * PI / 180) * r, c + Math.sin(a * PI / 180) * r]);
  for (const p of pts) pen.circle([0, 0, 0], p[0], p[1], size * 0.13);
  const end = pts[pts.length - 1];
  const head = [[end[0] - size * 0.20, end[1] - size * 0.10], [end[0] + size * 0.16, end[1] - size * 0.04], [end[0] - size * 0.02, end[1] + size * 0.22]];
  pen.polyOutline([40, 120, 255], head, [0, 0, 0], 0.06 * size);
  for (const p of pts) pen.circle([40, 120, 255], p[0], p[1], size * 0.085);
  return pen.finish();
}

/** Golden light rays (used behind the LEVEL banner). */
function makeRays(size = 480) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const cc = size / 2, n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = i * TAU / n, a1 = a0 + PI / n;
    fillPoly(ctx, [255, 214, 110], [[cc, cc], [cc + Math.cos(a0) * cc * 1.5, cc + Math.sin(a0) * cc * 1.5],
                                    [cc + Math.cos(a1) * cc * 1.5, cc + Math.sin(a1) * cc * 1.5]]);
  }
  ctx.globalCompositeOperation = "multiply";       // fade the rays out toward the edge
  ctx.drawImage(glowSprite(size / 2, [255, 255, 255], 1.0), 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return c;
}

/** The little flame on a bomb's rope. */
function drawFlame(ctx, tx, ty, fl, glowR, full) {
  addGlow(ctx, tx, ty - 8, glowR, [255, 150, 50], 1.6);
  fillPoly(ctx, [255, 120, 20], [[tx, ty - fl], [tx + 6, ty - fl * 0.35], [tx + 5, ty], [tx - 5, ty], [tx - 6, ty - fl * 0.35]]);
  const m = full ? 0.78 : 0.7;
  fillPoly(ctx, [255, 205, 60], [[tx, ty - fl * m], [tx + 3.6, ty - fl * 0.3], [tx + 3, ty], [tx - 3, ty], [tx - 3.6, ty - fl * 0.3]]);
  if (full) {
    fillPoly(ctx, [255, 255, 220], [[tx, ty - fl * 0.45], [tx + 1.8, ty - fl * 0.15], [tx + 1.5, ty], [tx - 1.5, ty], [tx - 1.8, ty - fl * 0.15]]);
  }
}


// =============================================================================
//  GAME OBJECTS
// =============================================================================
const RADIUS = { apple: 32, banana: 34, grapes: 34, bomb: 30, shield: 34 };   // how big each thing is for hits
const FRUITS = ["apple", "banana", "grapes"];
const FRUIT_COLORS = { apple: [[255, 70, 70], [255, 150, 150]], banana: [[255, 224, 60], [255, 246, 160]],
                       grapes: [[176, 96, 230], [222, 170, 255]] };
const CONFETTI = [[255, 90, 90], [255, 214, 60], [90, 200, 255], [120, 230, 120], [210, 120, 255], [255, 150, 60]];

/** Builds every picture once, when the game starts. */
class Assets {
  constructor() {
    this.sprites = {};
    this.worlds = {};
  }

  /** Makes the pictures a few at a time, pausing after each step so the loading bar can move. */
  *buildSteps() {
    this.sprites = { apple: makeApple(), banana: makeBanana(), grapes: makeGrapes(), bomb: makeBomb(), shield: makeShieldItem() };
    yield;
    this.bubble = makeBubble(300);
    this.vignette = makeVignette();
    this.rays = makeRays();
    yield;
    for (const key of ["home", 1, 2, 3]) {
      this.worlds[key] = new World(key);
      yield;
    }
    for (let i = 0; i < 120; i++) {          // draw the dinosaur's idle and run animation now, so the game never stutters
      renderDino(i / 24 + 0.001);
      if (i % 6 === 5) yield;
    }
    for (let i = 0; i < 24; i++) {
      renderDino(0, true, i / 24 * TAU + 0.01);
      if (i % 6 === 5) yield;
    }
  }
}

/** One falling thing: a fruit, a bomb or a shield. */
class Item {
  constructor(kind, x, level) {
    const cfg = LEVELS[level];
    this.kind = kind;
    this.baseX = x;
    this.x = x;
    this.y = -70;
    this.vy = rand(cfg.speed[0], cfg.speed[1]);
    this.vx = 0;
    this.amp = 0;
    this.freq = rand(1.6, 2.8);
    this.phase = rand(0, 6.28);
    if (cfg.wobble) {                        // level 3: things drift and zig-zag, so they are harder to catch
      this.vx = choice([-1, 1]) * rand(40, 150);
      this.amp = rand(30, 80);
    }
    this.angle = rand(0, 360);
    this.spin = rand(-70, 70);
    this.age = 0;
    this.radius = RADIUS[kind];
  }

  update(dt) {
    this.age += dt;
    this.y += this.vy * dt;
    this.baseX += this.vx * dt;
    if (this.baseX < 70) {
      this.baseX = 70;
      this.vx = Math.abs(this.vx);
    } else if (this.baseX > W - 70) {
      this.baseX = W - 70;
      this.vx = -Math.abs(this.vx);
    }
    this.x = clamp(this.baseX + Math.sin(this.age * this.freq + this.phase) * this.amp, 40, W - 40);
    this.angle += this.spin * dt;
  }
}

class Particle {
  constructor(kind, x, y, vx, vy, life, size, color, opts = {}) {
    this.kind = kind;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.age = 0; this.size = size; this.color = color;
    this.gravity = opts.gravity || 0;
    this.drag = opts.drag || 0;
    this.spin = opts.spin || 0;
    this.angle = rand(0, 6.28);
  }
}

/** Sparkles, explosions, splashes and confetti. */
class Effects {
  constructor() { this.items = []; }

  add(kind, x, y, vx, vy, life, size, color, opts) {
    this.items.push(new Particle(kind, x, y, vx, vy, life, size, color, opts));
    if (this.items.length > 700) this.items.splice(0, 100);
  }

  clear() { this.items = []; }

  sparkle(x, y, colors, n = 14, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), sp = rand(0.35, 1.0) * speed;
      this.add("glow", x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.8), rand(14, 24), choice(colors), { drag: 2.5 });
    }
    for (let i = 0; i < Math.max(Math.floor(n / 2), 3); i++) {
      const a = rand(0, 6.28), sp = rand(0.3, 1.0) * speed;
      this.add("star", x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, rand(0.5, 0.9), rand(9, 16),
               choice([[255, 244, 150], [255, 255, 255]]), { gravity: 260, drag: 1.5, spin: rand(-6, 6) });
    }
  }

  splash(x, y, color) {
    for (let i = 0; i < 12; i++) {
      this.add("dot", x, y, rand(-190, 190), rand(-300, -90), rand(0.45, 0.85), rand(4, 9), color, { gravity: 900 });
    }
  }

  ring(x, y, color, size, life = 0.5) { this.add("ring", x, y, 0, 0, life, size, color); }

  explosion(x, y, big = true) {
    const scale = big ? 1.0 : 0.55;
    for (let i = 0; i < Math.floor(30 * scale) + 6; i++) {
      const a = rand(0, 6.28), sp = rand(0.2, 1.0) * 560 * scale;
      this.add("glow", x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 1.1), rand(26, 48) * scale,
               choice([[255, 150, 40], [255, 210, 80], [255, 90, 30], [255, 255, 200]]), { drag: 2.2 });
    }
    for (let i = 0; i < Math.floor(20 * scale) + 4; i++) {
      const a = rand(0, 6.28), sp = rand(0.3, 1.0) * 620 * scale;
      this.add("dot", x, y, Math.cos(a) * sp, Math.sin(a) * sp - 160, rand(0.6, 1.1), rand(4, 9),
               choice([[40, 40, 50], [90, 90, 100], [255, 170, 60]]), { gravity: 800 });
    }
    for (let i = 0; i < Math.floor(9 * scale) + 3; i++) {
      this.add("smoke", x + rand(-30, 30), y + rand(-20, 20), rand(-50, 50), rand(-110, -30), rand(1.0, 1.7),
               rand(60, 110) * scale, [60, 60, 70]);
    }
    this.ring(x, y, [255, 200, 100], 280 * scale, 0.55);
    this.ring(x, y, [255, 255, 255], 170 * scale, 0.35);
  }

  confetti(x, y, n = 60, speed = 520, up = true) {
    for (let i = 0; i < n; i++) {
      const a = up ? rand(-PI, 0) : rand(0, 6.28), sp = rand(0.3, 1.0) * speed;
      this.add("confetti", x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1.8, 3.0), rand(9, 15),
               choice(CONFETTI), { gravity: 520, drag: 0.7, spin: rand(-9, 9) });
    }
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
    this.items = this.items.filter(p => p.age < p.life);
  }

  draw(ctx) {
    for (const p of this.items) {
      const u = p.age / p.life;
      if (p.kind === "glow") {
        addGlow(ctx, p.x, p.y, Math.max(p.size * (1 - u * 0.5), 4), p.color, 1.3, 1 - u);
      } else if (p.kind === "dot") {
        fillCircle(ctx, p.color, p.x, p.y, Math.max(p.size * (1 - u * 0.6), 1));
      } else if (p.kind === "star") {
        const s = p.size * (1 - u * 0.6);
        fillPoly(ctx, p.color, starPoints(p.x, p.y, s, s * 0.45, p.angle));
      } else if (p.kind === "confetti") {
        const s = p.size * (1 - Math.max(0, (u - 0.8) / 0.2));
        const w = s, h = s * 0.6 * Math.abs(Math.cos(p.angle * 0.9)) + 1;
        const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
        fillPoly(ctx, p.color, [[-w, -h], [w, -h], [w, h], [-w, h]].map(([dx, dy]) => [p.x + dx * ca - dy * sa, p.y + dx * sa + dy * ca]));
      } else if (p.kind === "smoke") {
        const size = Math.floor(p.size * (0.5 + u) / 8) * 8 + 8;
        drawShadow(ctx, softShadow(size, size, 120), p.x - size / 2, p.y - size / 2, 1 - u);
      } else if (p.kind === "ring") {
        const r = p.size * easeOut(u);
        if (r > 4) {
          const k = 1 - u;
          const lw = Math.max(10 * k, 2);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = k;
          strokeCircle(ctx, p.color, p.x, p.y, r - lw / 2, lw);
          ctx.restore();
        }
      }
    }
  }
}

/** A '+1' that floats up and fades away. */
class FloatText {
  constructor(text, x, y) {
    this.text = text; this.x = x; this.y = y;
    this.age = 0;
    this.life = 0.9;
  }
}


// =============================================================================
//  THE DINOSAUR CHARACTER  (position, dragging, animation state)
// =============================================================================
const HIT_CIRCLES = [[98, 100, 46], [164, 38, 32], [84, 138, 26], [40, 104, 20]];   // body, head, legs, tail (in the dino picture)

class Dino {
  constructor() { this.reset(); }

  reset() {
    this.x = DINO_START_X + DINO_W / 2;     // centre of the picture
    this.y = STAND_Y;                       // feet
    this.facing = 1;
    this.held = false;
    this.grab = [0, 0];
    this.speed = 0;
    this.vxs = 0;
    this.phase = 0;
    this.blink = 0;
    this.blinkTimer = rand(1.0, 3.0);
    this.chomp = 0;
    this.anticipate = 0;
    this.squashT = 99;
    this.state = "alive";                   // alive / dead / cheer
    this.deadT = 0;
    this.cheerT = 0;
  }

  airborne() { return this.y < STAND_Y - 8; }

  /** Where the dinosaur can be touched, in screen coordinates. */
  circles() {
    const left = this.x - DINO_W / 2, top = this.y - DINO_FOOT;
    return HIT_CIRCLES.map(([cx, cy, r]) => [left + (this.facing < 0 ? DINO_W - cx : cx), top + cy, r]);
  }

  tryGrab(pos) {
    if (this.state !== "alive") return false;
    for (const [cx, cy, r] of this.circles()) {
      if (Math.hypot(pos[0] - cx, pos[1] - cy) < r + 16) {
        this.held = true;
        this.grab = [pos[0] - this.x, pos[1] - this.y];
        return true;
      }
    }
    return false;
  }

  eat() {
    this.chomp = 0.32;
    this.squashT = 0;
  }

  die() {
    this.state = "dead";
    this.deadT = 0;
    this.held = false;
  }

  cheer() {
    this.state = "cheer";
    this.cheerT = 0;
    this.held = false;
  }

  update(dt, mouse) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.13;
      this.blinkTimer = rand(2.0, 4.5);
    }
    if (this.blink > 0) this.blink -= dt;
    this.chomp = Math.max(0, this.chomp - dt);
    this.squashT += dt;
    if (this.state === "alive") {
      const ox = this.x, oy = this.y;
      if (this.held) {
        const tx = clamp(mouse[0] - this.grab[0], 70, W - 70);
        const ty = clamp(mouse[1] - this.grab[1], 190, H - 8);
        const k = 1 - Math.exp(-dt * 30);
        this.x += (tx - this.x) * k;
        this.y += (ty - this.y) * k;
      }
      const vx = (this.x - ox) / Math.max(dt, 1e-4);
      const vy = (this.y - oy) / Math.max(dt, 1e-4);
      this.speed += (Math.hypot(vx, vy * 0.6) - this.speed) * Math.min(1, dt * 10);
      this.vxs += (vx - this.vxs) * Math.min(1, dt * 8);
      if (Math.abs(this.vxs) > 70) this.facing = this.vxs > 0 ? 1 : -1;
      this.phase += this.speed * dt * 0.06;
    } else if (this.state === "dead") {
      this.deadT += dt;
    } else {
      this.cheerT += dt;
    }
  }

  draw(ctx, t, scale = 1) {
    const alive = this.state === "alive";
    const run = alive && !this.airborne() && this.speed > 45;
    const dangle = this.state === "dead" || (alive && this.airborne());
    let mouth = this.anticipate;
    if (this.chomp > 0) mouth = Math.max(mouth, Math.sin((1 - this.chomp / 0.32) * PI));
    if (this.state === "cheer") mouth = 0.7;
    const img = renderDino(t, run, this.phase, this.blink > 0, mouth, this.state === "dead", dangle);
    let sx = 1, sy = 1, hop = 0;
    if (alive && this.squashT < 0.6) {
      const s = Math.exp(-9 * this.squashT) * Math.sin(this.squashT * 28) * 0.13;
      sx = 1 + s * 0.9;
      sy = 1 - s;
    } else if (this.state === "dead") {
      const p = clamp(this.deadT / 0.5, 0, 1);
      sy = Math.cos(p * PI);                    // 1 -> -1 : the dino flips over onto its back
      hop = Math.sin(p * PI) * 80 * scale;
      if (p >= 1) {
        const b = this.deadT - 0.5;
        hop = Math.abs(Math.sin(b * 9)) * 18 * Math.exp(-b * 4) * scale;
      }
    } else if (this.state === "cheer") {
      hop = Math.abs(Math.sin(this.cheerT * 7)) * 28 * scale;
    }
    const w = Math.max(DINO_W * scale * sx, 2);
    const h = Math.max(DINO_H * scale * Math.max(Math.abs(sy), 0.04), 2);
    const top = this.state === "dead"
      ? this.y - 79 * scale - hop - h / 2
      : this.y - DINO_FOOT * scale * Math.max(Math.abs(sy), 0.04) - hop;
    ctx.save();
    ctx.translate(this.x, top + h / 2);
    ctx.scale(this.facing < 0 ? -1 : 1, sy < 0 ? -1 : 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}


// =============================================================================
//  BUTTONS
// =============================================================================
const CLICK_STEPS_TIME = 0.55;   // seconds the click animation lasts before the button does its job

function makeButtonSurface(w, h, label, size, icon) {
  const panel = makePanel(w, h, Math.floor(h * 0.30), [255, 255, 255], [174, 212, 255], [0, 0, 0], 5);
  const ctx = panel.getContext("2d");
  const gap = 14;
  let iconS = null;
  if (icon === "play") iconS = makePlayIcon(Math.floor(h * 0.56));
  else if (icon === "restart") iconS = makeRestartIcon(Math.floor(h * 0.56));
  const iconW = iconS ? iconS.width + gap : 0;
  let text;
  while (true) {                            // make the text smaller until icon + text fit inside the button
    text = fancyText(label, "title", size, [112, 186, 255], [16, 66, 214], { outlinePx: 4, shadow: [0, 3], shadowAlpha: 70 });
    if (text.width + iconW <= w - 90 || size <= 24) break;
    size -= 4;
  }
  let x = Math.floor((w - (text.width + iconW)) / 2);
  if (iconS) {
    ctx.drawImage(iconS, x, Math.floor((h - iconS.height) / 2) - 2);
    x += iconW;
  }
  ctx.drawImage(text, x, Math.floor((h - text.height) / 2) - 3);
  return panel;
}

/** A glossy button: breathes, glows when the mouse is over it, squashes and springs back when clicked. */
class Button {
  constructor(cx, cy, w, h, label, size, icon, onPress = null, onDone = null) {
    this.cx = cx; this.cy = cy; this.w = w; this.h = h;
    this.base = makeButtonSurface(w, h, label, size, icon);
    this.frame = makeCanvas(w, h);         // re-used every frame for the shiny streak
    this.streak = makeCanvas(w, h);
    this.onPress = onPress;
    this.onDone = onDone;
    this.visible = false;
    this.hover = 0;
    this.pressT = null;
    this.appearT = 1;
    this.t = rand(0, 6);
  }

  show() {
    this.visible = true;
    this.pressT = null;
    this.appearT = 0;
  }

  hide() {
    this.visible = false;
    this.pressT = null;
  }

  busy() { return this.pressT !== null; }

  contains(pos) { return Math.abs(pos[0] - this.cx) <= this.w / 2 && Math.abs(pos[1] - this.cy) <= this.h / 2; }

  click(pos) {
    if (this.visible && !this.busy() && this.appearT > 0.6 && this.contains(pos)) {
      this.pressT = 0;
      if (this.onPress) this.onPress(this);
      return true;
    }
    return false;
  }

  scale() {
    let s = 1 + 0.02 * Math.sin(this.t * 3) + 0.07 * this.hover;
    if (this.appearT < 1) s *= easeOutBack(this.appearT, 2.2);
    if (this.pressT !== null) {
      const p = this.pressT;
      if (p < 0.1) {
        s *= 1 - 0.14 * easeOut(p / 0.1);                                  // pushed in
      } else {
        const q = p - 0.1;
        s *= 1 - 0.14 * Math.exp(-7 * q) * Math.cos(14 * q);               // springs back with a wobble
      }
    }
    return s;
  }

  update(dt, mouse) {
    this.t += dt;
    if (this.appearT < 1) this.appearT = Math.min(1, this.appearT + dt / 0.5);
    const target = (this.visible && !this.busy() && this.contains(mouse)) ? 1 : 0;
    this.hover += (target - this.hover) * Math.min(1, dt * 14);
    if (this.pressT !== null) {
      this.pressT += dt;
      if (this.pressT >= CLICK_STEPS_TIME) {
        this.pressT = null;
        if (this.onDone) this.onDone();
      }
    }
  }

  draw(ctx) {
    if (!this.visible) return;
    const s = this.scale();
    if (s <= 0.03) return;
    const w = Math.max(this.w * s, 2), h = Math.max(this.h * s, 2);
    let img = this.base;
    const sweep = mod(this.t * 0.6, 2.2);   // a shiny streak sweeps across now and then
    if (sweep < 1) {
      const sx = lerp(-this.w * 0.3, this.w * 1.1, sweep);
      const st = this.streak.getContext("2d");
      st.clearRect(0, 0, this.w, this.h);
      fillPoly(st, [255, 255, 255, 130], [[sx + this.w * 0.10, 0], [sx + this.w * 0.24, 0], [sx + this.w * 0.14, this.h], [sx, this.h]]);
      st.globalCompositeOperation = "destination-in";   // keep the streak inside the button
      st.drawImage(this.base, 0, 0);
      st.globalCompositeOperation = "source-over";
      const fr = this.frame.getContext("2d");
      fr.clearRect(0, 0, this.w, this.h);
      fr.drawImage(this.base, 0, 0);
      fr.drawImage(this.streak, 0, 0);
      img = this.frame;
    }
    const shadow = softShadow(Math.floor(w * 0.92 / 8) * 8, Math.floor(h * 0.55 / 8) * 8, 150);
    ctx.drawImage(shadow, this.cx - shadow.width / 2, this.cy + h * 0.28);
    if (this.hover > 0.03) {
      addGlow(ctx, this.cx, this.cy, Math.max(w, h) * 0.75, [120, 190, 255], 1.6, 0.55 * this.hover);
    }
    ctx.drawImage(img, this.cx - w / 2, this.cy - h / 2, w, h);
    if (this.pressT !== null && this.pressT < 0.25) {    // flashes brighter when pressed
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25;
      ctx.drawImage(img, this.cx - w / 2, this.cy - h / 2, w, h);
      ctx.restore();
    }
  }
}

/** Big text that pops onto the screen ('LEVEL 2', 'GAME OVER', 'YOU WIN!'). */
class Banner {
  constructor(text, sub, top, bottom, hold = null, rays = true, cy = 300) {
    this.text = text; this.sub = sub; this.top = top; this.bottom = bottom;
    this.hold = hold; this.rays = rays; this.t = 0; this.cy = cy;
  }
}

const GOLD = [[255, 246, 160], [255, 168, 28]];
const RED = [[255, 160, 150], [226, 38, 60]];
const LEVEL_TIPS = { 1: "Catch the fruit - dodge the bombs!", 2: "The fruit falls faster!", 3: "Tricky fruit - and SHIELDS appear!" };

function drawBar(ctx, x, y, w, h, frac, c1, c2, ticks = []) {
  roundRectPath(ctx, x - 3, y - 3, w + 6, h + 6, h / 2 + 3);
  ctx.fillStyle = "#000";
  ctx.fill();
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = paint([30, 46, 100]);
  ctx.fill();
  let fw = w * clamp(frac, 0, 1);
  if (fw > 0) {
    fw = Math.max(fw, h);
    roundRectPath(ctx, x, y, fw, h, h / 2);
    ctx.fillStyle = paint(c2);
    ctx.fill();
    roundRectPath(ctx, x, y, fw, h * 0.62, h / 2);
    ctx.fillStyle = paint(c1);
    ctx.fill();
    roundRectPath(ctx, x + h * 0.4, y + h * 0.14, Math.max(fw - h * 0.8, 1), Math.max(h * 0.22, 1), 3);
    ctx.fillStyle = paint(lerpColor(c1, [255, 255, 255], 0.55));
    ctx.fill();
  }
  for (const tk of ticks) {
    const tx = x + Math.floor(w * tk);
    drawLine(ctx, [255, 255, 255], [tx, y - 1], [tx, y + h], 2);
  }
}


// =============================================================================
//  FULL SCREEN  (the browser's own full screen mode)
// =============================================================================
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

function setFullscreen(on) {
  try {
    if (on && !isFullscreen()) {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const p = req.call(el);
        if (p && p.catch) p.catch(() => {});
      }
    } else if (!on && isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        const p = exit.call(document);
        if (p && p.catch) p.catch(() => {});
      }
    }
  } catch (e) { /* some phones (iPhone) do not allow full screen for web pages - that's OK */ }
}


// =============================================================================
//  THE GAME
// =============================================================================
class Game {
  constructor(canvas, audio, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.fadeBuf = makeCanvas(W, H);
    this.fadeCtx = this.fadeBuf.getContext("2d");
    this.t = 0;
    this.mouse = [W / 2, H / 2];
    this.cursor = null;
    this.wantFullscreen = false;
    this.audio = audio;      // sounds and pictures are made on the loading screen (see main)
    this.assets = assets;
    this.fx = new Effects();
    this.dino = new Dino();
    this.homeDino = new Dino();
    this.homeDino.x = 250;
    this.homeDino.y = STAND_Y + 12;
    this.scene = "home";
    this.world = assets.worlds.home;
    this.prevWorld = null;
    this.mix = 1;
    this.trans = null;
    this.banner = null;
    this.floatTexts = [];
    this.shake = 0;
    this.flash = 0;
    this.dim = 0;
    this.resetPlayState();
    this.playBtn = new Button(W / 2, 410, 340, 118, "PLAY", 78, "play", b => this.onPlayPress(b), () => this.onPlayDone());
    this.restartBtn = new Button(W / 2, 470, 400, 110, "RESTART", 62, "restart", b => this.onButtonPress(b), () => this.onRestartDone());
    this.winBtn = new Button(W / 2, 440, 660, 110, "START FROM LEVEL 1", 54, "restart", b => this.onButtonPress(b), () => this.onRestartDone());
    this.playBtn.show();
  }

  // ---------------------------------------------------------------- state
  resetPlayState() {
    this.score = 0;
    this.level = 1;
    this.items = [];
    this.shieldT = 0;
    this.shieldAge = 0;
    this.spawnTimer = 1.8;
    this.bombGrace = 3.0;
    this.foodPop = 99;
    this.levelPulse = 99;
    this.deadT = 0;
    this.winT = 0;
    this.gameOverShown = false;
    this.faintPlayed = false;
    this.floatTexts = [];
  }

  buttons() { return [this.playBtn, this.restartBtn, this.winBtn]; }

  setWorld(key, instant = false) {
    const next = this.assets.worlds[key];
    if (next === this.world) return;
    if (instant) {
      this.world = next;
      this.prevWorld = null;
      this.mix = 1;
    } else {
      this.prevWorld = this.world;
      this.world = next;
      this.mix = 0;
    }
  }

  // ---------------------------------------------------------------- transitions
  startTransition(kind, centerOut, centerIn, action, durOut, durIn) {
    this.trans = { kind, stage: "out", t: 0, durOut, durIn, cOut: centerOut, cIn: centerIn, action };
  }

  updateTransition(dt) {
    const tr = this.trans;
    if (!tr) return;
    tr.t += dt;
    if (tr.stage === "out" && tr.t >= tr.durOut) {
      tr.action();                          // the screen is fully covered: switch scenes now
      tr.stage = "in";
      tr.t = 0;
    } else if (tr.stage === "in" && tr.t >= tr.durIn) {
      this.trans = null;
    }
  }

  drawTransition(ctx) {
    const tr = this.trans;
    if (!tr) return;
    let cover, center;
    if (tr.stage === "out") {
      cover = easeInOut(tr.t / tr.durOut);
      center = tr.cOut;
    } else {
      cover = 1 - easeInOut(tr.t / tr.durIn);
      center = tr.cIn;
    }
    if (tr.kind === "fade") {
      ctx.fillStyle = `rgba(0,0,0,${cover})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const maxR = Math.hypot(W, H);
    const r = maxR * (1 - cover);
    if (r <= 0.5) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    } else if (r < maxR) {
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(center[0], center[1], r, 0, TAU);
      ctx.fill("evenodd");
      strokeCircle(ctx, [255, 255, 255], center[0], center[1], r - 3, 6);
      strokeCircle(ctx, [120, 190, 255], center[0], center[1], r + 4, 4);
    }
  }

  // ---------------------------------------------------------------- button actions
  onButtonPress(btn) {
    this.audio.play("click");
    this.fx.sparkle(btn.cx, btn.cy, [[120, 190, 255], [255, 255, 255]], 10, 260);
  }

  onPlayPress(btn) {
    this.audio.play("click");
    this.fx.ring(btn.cx, btn.cy, [140, 200, 255], 300, 0.6);
    this.fx.ring(btn.cx, btn.cy, [255, 255, 255], 200, 0.4);
    this.fx.sparkle(btn.cx, btn.cy, [[255, 230, 120], [120, 200, 255], [255, 255, 255]], 26, 520);
    // full screen when you press PLAY (browsers only allow this right when the player clicks)
    setFullscreen(true);
    this.wantFullscreen = true;
  }

  onPlayDone() {
    this.audio.play("whoosh");
    this.startTransition("iris", [this.playBtn.cx, this.playBtn.cy], [DINO_START_X + DINO_W / 2, STAND_Y - 80],
                         () => this.beginGame(), 0.55, 0.85);
  }

  onRestartDone() {
    this.audio.play("whoosh");
    this.startTransition("fade", null, null, () => this.beginGame(), 0.3, 0.5);
  }

  /** Runs while the screen is covered: switches to the play scene. */
  beginGame() {
    this.resetPlayState();
    this.dino.reset();
    this.fx.clear();
    this.dim = 0;
    this.restartBtn.hide();
    this.winBtn.hide();
    this.playBtn.hide();
    this.scene = "play";
    this.setWorld(1, true);
    this.banner = new Banner("LEVEL 1", LEVEL_TIPS[1], GOLD[0], GOLD[1], 2.6);
  }

  // ---------------------------------------------------------------- input
  pointerDown(pos) {
    this.mouse = pos;
    if (this.trans) return;
    for (const b of this.buttons()) {
      if (b.click(pos)) return;
    }
    if (this.scene === "play") this.dino.tryGrab(pos);
  }

  pointerMove(pos) { this.mouse = pos; }

  pointerUp(isTouch) {
    this.dino.held = false;
    if (isTouch) this.mouse = [-999, -999];   // a finger left the screen: nothing is "hovered" any more
    if (this.wantFullscreen) {
      this.wantFullscreen = false;
      setFullscreen(true);                    // phones only allow full screen when the finger is lifted
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    this.world.update(dt);
    if (this.prevWorld) {
      this.prevWorld.update(dt);
      this.mix += dt / 1.4;
      if (this.mix >= 1) {
        this.prevWorld = null;
        this.mix = 1;
      }
    }
    this.shake = Math.max(0, this.shake - 45 * dt);
    this.flash = Math.max(0, this.flash - 2.2 * dt);
    for (const b of this.buttons()) b.update(dt, this.trans ? [-999, -999] : this.mouse);
    this.updateTransition(dt);
    if (this.scene === "home") this.homeDino.update(dt, this.mouse);
    else this.updatePlay(dt);
    this.fx.update(dt);
    this.updateCursor();
  }

  updateCursor() {
    let kind = "default";
    if (!this.trans) {
      if (this.buttons().some(b => b.visible && !b.busy() && b.contains(this.mouse))) {
        kind = "pointer";
      } else if (this.scene === "play" && this.dino.held) {
        kind = "grabbing";
      } else if (this.scene === "play" && this.dino.state === "alive" &&
                 this.dino.circles().some(([cx, cy, r]) => Math.hypot(this.mouse[0] - cx, this.mouse[1] - cy) < r + 16)) {
        kind = "grab";
      }
    }
    if (kind !== this.cursor) {
      this.cursor = kind;
      this.canvas.style.cursor = kind;
    }
  }

  spawnPair() {
    const xs = [];
    while (xs.length < 2) {
      const x = randInt(70, W - 70);
      if (xs.every(o => Math.abs(x - o) > 150)) xs.push(x);
    }
    for (const x of xs) this.items.push(new Item(choice(FRUITS), x, this.level));
  }

  removeItem(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  }

  updatePlay(dt) {
    const d = this.dino;
    const cfg = LEVELS[this.level];
    d.update(dt, this.mouse);
    this.foodPop += dt;
    this.levelPulse += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.hold !== null && this.banner.t > this.banner.hold) this.banner = null;
    }
    for (const ft of this.floatTexts) {
      ft.age += dt;
      ft.y -= 80 * dt;
    }
    this.floatTexts = this.floatTexts.filter(f => f.age < f.life);

    // ---- spawning (only while playing) ----
    if (this.scene === "play") {
      this.spawnTimer -= dt;
      this.bombGrace -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnPair();
        this.spawnTimer += cfg.spawnEvery;
      }
      if (this.bombGrace <= 0 && Math.random() < cfg.bombRate * dt) {
        this.items.push(new Item("bomb", randInt(70, W - 70), this.level));
      }
      if (this.level === 3 && this.shieldT <= 0 && Math.random() < SHIELD_RATE * dt &&
          !this.items.some(i => i.kind === "shield")) {
        this.items.push(new Item("shield", randInt(100, W - 100), this.level));
      }
    }

    // ---- shield timer ----
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      this.shieldAge += dt;
      if (this.shieldT <= 0) this.fx.sparkle(d.x, d.y - 82, [[120, 190, 255], [255, 190, 100]], 16, 300);
    }

    // ---- the dinosaur looks hungry when a fruit is close to its head ----
    d.anticipate = 0;
    if (this.scene === "play") {
      const head = d.circles()[1];
      for (const it of this.items) {
        if (FRUITS.includes(it.kind) && Math.hypot(it.x - head[0], it.y - head[1]) < 190 && it.y < head[1] + 40) {
          d.anticipate = 0.55;
          break;
        }
      }
    }

    // ---- move everything and see what happened ----
    for (const it of this.items.slice()) {
      if (!this.items.includes(it)) continue;   // it was removed earlier in this same loop (win / game over)
      it.update(dt);
      if (it.kind === "bomb" && Math.random() < 40 * dt) {
        this.fx.add("glow", it.x + 13, it.y - 68, rand(-70, 70), rand(-150, -50), 0.4, 9, [255, 200, 90], { gravity: 240 });
      }
      if (it.y >= FLOOR_Y) {
        this.land(it);
        this.removeItem(it);
        continue;
      }
      if (this.scene !== "play") continue;
      if (it.kind === "bomb" && this.shieldT > 0) {
        const bx = d.x, by = d.y - 82;
        if (Math.hypot(it.x - bx, it.y - by) < it.radius + 138) {
          this.fx.explosion(it.x, it.y, false);
          this.fx.ring(bx, by, [120, 190, 255], 200, 0.4);
          this.audio.play("puff");
          this.shake = Math.max(this.shake, 7);
          this.removeItem(it);
          continue;
        }
      }
      for (const [cx, cy, r] of d.circles()) {
        if (Math.hypot(it.x - cx, it.y - cy) < it.radius + r) {
          this.removeItem(it);
          if (it.kind === "bomb") this.kill(it);
          else if (it.kind === "shield") this.getShield(it);
          else this.eat(it);
          break;
        }
      }
    }

    // ---- scene specific ----
    if (this.scene === "dead") {
      this.deadT += dt;
      this.dim += (0.5 - this.dim) * Math.min(1, dt * 3);
      if (this.deadT > 0.55 && !this.faintPlayed) {
        this.faintPlayed = true;
        this.audio.play("faint");
      }
      if (this.deadT > 1.3 && !this.gameOverShown) {
        this.gameOverShown = true;
        this.banner = new Banner("GAME OVER", `You collected ${this.score} FOOD`, RED[0], RED[1], null, false, 235);
        this.restartBtn.show();
      }
    } else if (this.scene === "win") {
      this.winT += dt;
      this.dim += (0.25 - this.dim) * Math.min(1, dt * 3);
      if (Math.random() < 40 * dt) {
        this.fx.add("confetti", rand(0, W), -20, rand(-60, 60), rand(120, 260), 5.0, rand(9, 15), choice(CONFETTI),
                    { gravity: 60, drag: 0.3, spin: rand(-9, 9) });
      }
      if (this.winT > 1.6 && !this.winBtn.visible && !this.winBtn.busy()) this.winBtn.show();
    }
  }

  /** A thing reached the ground. */
  land(it) {
    if (it.kind === "bomb") {
      this.fx.explosion(it.x, FLOOR_Y, false);
      this.audio.play("puff");
    } else if (it.kind === "shield") {
      this.fx.sparkle(it.x, FLOOR_Y - 10, [[120, 190, 255]], 8, 200);
    } else {
      this.fx.splash(it.x, FLOOR_Y - 8, FRUIT_COLORS[it.kind][0]);
    }
  }

  eat(it) {
    this.score += 1;
    this.dino.eat();
    this.foodPop = 0;
    this.audio.play("pop");
    this.fx.sparkle(it.x, it.y, FRUIT_COLORS[it.kind], 14, 320);
    this.floatTexts.push(new FloatText("+1", it.x, it.y - 30));
    const newLevel = this.score >= LEVEL_3_AT ? 3 : this.score >= LEVEL_2_AT ? 2 : 1;
    if (newLevel > this.level) this.levelUp(newLevel);
    if (this.score >= WIN_AT) this.win();
  }

  levelUp(level) {
    this.level = level;
    this.levelPulse = 0;
    this.setWorld(level);
    this.banner = new Banner(`LEVEL ${level}`, LEVEL_TIPS[level], GOLD[0], GOLD[1], 2.6);
    this.flash = 0.7;
    this.audio.play("levelup");
    this.fx.confetti(W / 2, 330, 90, 760);
    this.spawnTimer = Math.max(this.spawnTimer, 1.3);
    this.bombGrace = 2.5;
  }

  getShield(it) {
    this.shieldT = SHIELD_SECONDS;
    this.shieldAge = 0;
    this.audio.play("shield");
    this.fx.ring(this.dino.x, this.dino.y - 82, [120, 190, 255], 240, 0.5);
    this.fx.sparkle(it.x, it.y, [[120, 190, 255], [255, 190, 100], [255, 255, 255]], 20, 380);
  }

  kill(it) {
    this.scene = "dead";
    this.deadT = 0;
    this.shieldT = 0;
    this.dino.die();
    this.banner = null;
    this.fx.explosion(it.x, it.y, true);
    this.shake = 24;
    this.flash = 0.9;
    this.audio.play("boom");
  }

  win() {
    this.scene = "win";
    this.winT = 0;
    this.shieldT = 0;
    this.dino.cheer();
    for (const it of this.items) this.fx.sparkle(it.x, it.y, [[255, 244, 150], [255, 255, 255]], 8, 240);
    this.items = [];
    this.banner = new Banner("YOU WIN!", `You collected ${this.score} FOOD!`, GOLD[0], GOLD[1], null, true, 235);
    this.flash = 0.6;
    this.audio.play("win");
    this.fx.confetti(W / 2, 420, 120, 820);
  }

  // ---------------------------------------------------------------- drawing: world and things
  drawWorld(ctx) {
    if (!this.prevWorld) {
      this.world.draw(ctx);
    } else {
      this.prevWorld.draw(ctx);
      this.world.draw(this.fadeCtx);
      ctx.globalAlpha = easeInOut(this.mix);
      ctx.drawImage(this.fadeBuf, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  drawDinoShadow(ctx, d, scale = 1) {
    const sy = Math.max(scale > 1 ? STAND_Y + 12 : STAND_Y, d.y);
    const height = sy - d.y;
    const k = clamp(1 - height / 520, 0.35, 1);
    const w = Math.floor(150 * k * scale / 8) * 8;
    const sh = softShadow(w, Math.max(Math.floor(w * 0.22 / 4) * 4, 8), 140);
    drawShadow(ctx, sh, d.x - w / 2, sy - 8, k);
  }

  drawItem(ctx, it) {
    const a = this.assets;
    const r = it.radius;
    // soft drop shadow behind the picture
    const gs = Math.floor(r * 2.3 / 4) * 4;
    ctx.drawImage(softShadow(gs, gs, 70), it.x - gs / 2 + 6, it.y - gs / 2 + 10);
    if (it.kind === "bomb") {
      ctx.drawImage(a.sprites.bomb, it.x - 50, it.y - 74);
      const fl = 17 + 6 * Math.sin(this.t * 31 + it.phase) + 3 * Math.sin(this.t * 47);
      drawFlame(ctx, it.x + 13, it.y - 68, fl, 34 + 4 * Math.sin(this.t * 25), true);
    } else if (it.kind === "shield") {
      addGlow(ctx, it.x, it.y, 62 + 8 * Math.sin(this.t * 6), [60, 130, 255], 1.5);
      drawRotated(ctx, a.sprites.shield, it.x, it.y, Math.sin(it.age * 3.2) * 10);
    } else {
      drawRotated(ctx, a.sprites[it.kind], it.x, it.y, it.angle);
    }
  }

  /** A shadow on the ground that grows as the thing gets close. */
  drawItemGroundShadow(ctx, it) {
    const closeness = clamp(1 - (FLOOR_Y - it.y) / 560, 0, 1);
    const w = Math.floor(lerp(26, 78, closeness) / 6) * 6;
    const hh = Math.max(Math.floor(w * 0.28 / 2) * 2, 6);
    drawShadow(ctx, softShadow(w, hh, 120), it.x - w / 2, FLOOR_Y + 6 - hh / 2, 0.25 + 0.75 * closeness);
  }

  drawBubble(ctx) {
    if (this.shieldT <= 0) return;
    if (this.shieldT < 1.2 && Math.floor(this.shieldT * 8) % 2 === 0) return;   // blinks when about to run out
    const pop = easeOutBack(this.shieldAge / 0.3, 2.0);
    const s = pop * (1 + 0.03 * Math.sin(this.t * 6));
    const size = Math.max(300 * s, 4);
    ctx.drawImage(this.assets.bubble, this.dino.x - size / 2, this.dino.y - 82 - size / 2, size, size);
  }

  drawPlayScene(ctx) {
    this.drawWorld(ctx);
    this.drawDinoShadow(ctx, this.dino);
    for (const it of this.items) this.drawItemGroundShadow(ctx, it);
    for (const it of this.items) this.drawItem(ctx, it);
    this.dino.draw(ctx, this.t);
    this.drawBubble(ctx);
    this.fx.draw(ctx);
    this.world.drawForeground(ctx);
    ctx.drawImage(this.assets.vignette, 0, 0);
  }

  // ---------------------------------------------------------------- drawing: home screen
  drawHomeScene(ctx) {
    this.drawWorld(ctx);
    const hd = this.homeDino;
    this.drawDinoShadow(ctx, hd, 1.5);
    hd.draw(ctx, this.t, 1.5);
    const a = this.assets;
    const decor = [["apple", 340, 330, 0], ["banana", 1090, 300, 1.7], ["grapes", 990, 520, 3.1], ["bomb", 1160, 500, 4.4]];
    for (const [kind, x, y0, ph] of decor) {
      const y = y0 + Math.sin(this.t * 1.6 + ph) * 12;
      if (kind === "bomb") {
        ctx.drawImage(a.sprites.bomb, x - 50, y - 74);
        drawFlame(ctx, x + 13, y - 68, 17 + 6 * Math.sin(this.t * 31), 34, false);
      } else {
        drawRotated(ctx, a.sprites[kind], x, y, Math.sin(this.t + ph) * 14);
      }
    }
    this.world.drawForeground(ctx);
    ctx.drawImage(a.vignette, 0, 0);
  }

  drawHomeUi(ctx) {
    const t = this.t;
    const cx = W / 2;
    const title = fancyText("THE DINO", "title", 170, [150, 214, 255], [24, 80, 226],
                            { outline: [6, 14, 56], outlinePx: 9, shadow: [0, 10], shadowAlpha: 150 });
    const s = 1 + 0.018 * Math.sin(t * 2.2);
    const ty = 156 + Math.sin(t * 1.6) * 6;
    addGlow(ctx, cx, ty, 380, [110, 60, 20], 2.0);
    drawCentered(ctx, title, cx, ty, s);
    const twinkles = [[-390, -60, 26, 0], [400, -30, 20, 1.5], [-330, 70, 16, 3], [350, 80, 24, 4.5], [60, -118, 14, 2.2]];
    for (const [dx, dy, size, ph] of twinkles) {
      const k = 0.5 + 0.5 * Math.sin(t * 3 + ph);
      fillPoly(ctx, [255, 244, 170], starPoints(cx + dx, ty + dy, size * (0.5 + 0.5 * k), size * 0.22 * (0.5 + 0.5 * k), t * 0.5 + ph, 4));
    }
    const sub = fancyText("CATCH THE FRUIT  -  DODGE THE BOMBS", "ui", 30, [255, 255, 255], [214, 232, 255],
                          { outline: [14, 20, 60], outlinePx: 3, shadow: [0, 3], shadowAlpha: 120 });
    drawCentered(ctx, sub, cx, 270);
    if (!IS_TOUCH) {
      const foot = fancyText("F = full screen", "ui", 18, [255, 255, 255], [220, 230, 255],
                             { outline: [14, 20, 60], outlinePx: 2, shadow: [0, 2], shadowAlpha: 100 });
      ctx.drawImage(foot, 24, H - 40);
    }
  }

  // ---------------------------------------------------------------- drawing: HUD
  hudPanel(w, h) {
    if (!this._hudPanel) this._hudPanel = makePanel(w, h, 24);
    return this._hudPanel;
  }

  drawHud(ctx) {
    const a = this.assets;
    const pw = 340, ph = 132;               // size of each panel
    const white = [255, 255, 255];

    // ---------- LEVEL panel (top left) ----------
    let k = 1;
    if (this.levelPulse < 0.9) {
      const glowU = clamp(this.levelPulse / 0.9, 0, 1);
      addGlow(ctx, 24 + pw / 2, 18 + ph / 2, 260 * Math.sin(glowU * PI) + 8, [90, 120, 40], 1.6);
      k = 1 + 0.08 * Math.sin(glowU * PI);
    }
    ctx.save();
    ctx.translate(24 + pw / 2, 18 + ph / 2);
    ctx.scale(k, k);
    ctx.translate(-(pw + 20) / 2, -(ph + 20) / 2);
    ctx.drawImage(this.hudPanel(pw, ph), 10, 10);
    const label = fancyText(`LEVEL ${this.level}`, "title", 46, [112, 186, 255], [16, 66, 214], { outlinePx: 3, shadow: [0, 3], shadowAlpha: 80 });
    ctx.drawImage(label, 34, 10 + 40 - Math.floor(label.height / 2));
    for (let i = 0; i < 3; i++) {
      const col = i < this.level ? [255, 206, 60] : [150, 160, 190];
      const sx = 10 + pw - 92 + i * 28, sy = 10 + 40;
      fillPoly(ctx, [0, 0, 0], starPoints(sx, sy, 14, 6.5, 0));
      fillPoly(ctx, col, starPoints(sx, sy, 11, 4.9, 0));
    }
    const [lo, hi] = { 1: [0, LEVEL_2_AT], 2: [LEVEL_2_AT, LEVEL_3_AT], 3: [LEVEL_3_AT, WIN_AT] }[this.level];
    drawBar(ctx, 34, 10 + 84, pw - 48, 22, (this.score - lo) / (hi - lo), [120, 232, 110], [46, 170, 70]);
    const count = fancyText(`${this.score - lo} / ${hi - lo}`, "ui", 15, white, white,
                            { outline: [10, 20, 60], outlinePx: 2, shadow: [0, 0], shadowAlpha: 0 });
    ctx.drawImage(count, 10 + pw / 2 - count.width / 2, 10 + 84 + 11 - count.height / 2);
    ctx.restore();

    // ---------- FOOD panel (top right) ----------
    ctx.save();
    ctx.translate(W - 24 - pw / 2 - (pw + 20) / 2, 18 + ph / 2 - (ph + 20) / 2);
    ctx.drawImage(this.hudPanel(pw, ph), 10, 10);
    const pop = clamp(this.foodPop / 0.4, 0, 1);
    const bump = Math.sin(pop * PI);                       // 0 -> 1 -> 0 right after catching a fruit
    const icon = a.sprites.apple;
    const isz = 62 * (1 + 0.28 * bump);
    const ih = isz * icon.height / icon.width;
    ctx.drawImage(icon, 10 + 58 - isz / 2, 10 + 52 - ih / 2, isz, ih);
    const food = fancyText("FOOD", "title", 30, [112, 186, 255], [16, 66, 214], { outlinePx: 3, shadow: [0, 2], shadowAlpha: 80 });
    ctx.drawImage(food, 10 + 106, 10 + 26 - food.height / 2);
    const col = pop < 1 ? [[255, 246, 150], [255, 160, 30]] : [[112, 186, 255], [16, 66, 214]];
    const num = fancyText(String(this.score), "title", 56, col[0], col[1], { outlinePx: 4, shadow: [0, 3], shadowAlpha: 90 });
    const baseW = num.width;
    const ns = 1 + 0.35 * bump;
    ctx.drawImage(num, 10 + 106, 10 + 66 - num.height * ns / 2, num.width * ns, num.height * ns);
    const goal = fancyText(`/ ${WIN_AT}`, "title", 26, [190, 204, 236], [140, 158, 205],
                           { outline: [10, 20, 60], outlinePx: 2, shadow: [0, 2], shadowAlpha: 60 });
    ctx.drawImage(goal, 10 + 106 + baseW + 12, 10 + 76 - goal.height / 2);
    drawBar(ctx, 34, 10 + 98, pw - 48, 16, this.score / WIN_AT, [255, 224, 90], [255, 160, 40],
            [LEVEL_2_AT / WIN_AT, LEVEL_3_AT / WIN_AT]);
    ctx.restore();
  }

  drawFloatTexts(ctx) {
    for (const ft of this.floatTexts) {
      const u = ft.age / ft.life;
      const img = fancyText(ft.text, "title", 54, [255, 250, 170], [255, 170, 30], { outlinePx: 4, shadow: [0, 3], shadowAlpha: 100 });
      const s = Math.max(easeOutBack(Math.min(u / 0.2, 1), 2.5), 0.01);
      ctx.globalAlpha = 1 - clamp((u - 0.55) / 0.45, 0, 1);
      drawCentered(ctx, img, ft.x, ft.y, s);
      ctx.globalAlpha = 1;
    }
  }

  drawBanner(ctx) {
    const b = this.banner;
    if (!b) return;
    const t = b.t;
    let alpha = 1;
    if (b.hold !== null) alpha = 1 - clamp((t - (b.hold - 0.5)) / 0.5, 0, 1);
    const pop = easeOutBack(t / 0.45, 2.4);
    const cy = b.cy - (1 - alpha) * 40;
    if (b.rays && alpha > 0) {
      const rays = this.assets.rays;
      const sc = Math.max(1.6 * Math.min(pop, 1.1), 0.01);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(150 / 255 * alpha * clamp(t / 0.3, 0, 1), 0, 1);
      ctx.translate(W / 2, cy);
      ctx.rotate(-t * 40 * PI / 180);
      ctx.scale(sc, sc);
      ctx.drawImage(rays, -rays.width / 2, -rays.height / 2);
      ctx.restore();
    }
    const text = fancyText(b.text, "title", 150, b.top, b.bottom, { outline: [20, 10, 40], outlinePx: 8, shadow: [0, 10], shadowAlpha: 150 });
    const s = Math.max(pop, 0.01) * (1 + 0.02 * Math.sin(t * 5));
    ctx.globalAlpha = alpha;
    drawCentered(ctx, text, W / 2, cy, s);
    if (b.sub) {
      const sub = fancyText(b.sub, "ui", 40, [255, 255, 255], [222, 236, 255], { outline: [14, 20, 60], outlinePx: 3, shadow: [0, 3], shadowAlpha: 120 });
      ctx.globalAlpha = alpha * clamp((t - 0.25) / 0.3, 0, 1);
      drawCentered(ctx, sub, W / 2, cy + 112);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- drawing: everything
  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.5) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.translate(Math.round(rand(-this.shake, this.shake)), Math.round(rand(-this.shake, this.shake)));
    }
    if (this.scene === "home") this.drawHomeScene(ctx);
    else this.drawPlayScene(ctx);
    ctx.restore();
    if (this.scene === "home") {
      this.drawHomeUi(ctx);
      this.playBtn.draw(ctx);
      this.fx.draw(ctx);
    } else {
      if (this.dim > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${this.dim})`;
        ctx.fillRect(0, 0, W, H);
      }
      this.drawHud(ctx);
      this.drawFloatTexts(ctx);
      this.drawBanner(ctx);
      this.restartBtn.draw(ctx);
      this.winBtn.draw(ctx);
    }
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(this.flash, 1) * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawTransition(ctx);
  }
}


// =============================================================================
//  START THE GAME
// =============================================================================
const LOAD_STEPS = 40;   // how many pieces the loading screen counts (10 sounds + 30 picture steps)

/** The loading screen: a title and a bar that fills up. */
function drawLoading(ctx, frac) {
  ctx.fillStyle = paint([20, 18, 60]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = paint([230, 236, 255]);
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Loading THE DINO...", W / 2, H / 2 - 40);
  ctx.textAlign = "left";
  const barW = 600, barH = 34;
  const x = W / 2 - barW / 2, y = H / 2;
  roundRectPath(ctx, x - 4, y - 4, barW + 8, barH + 8, 21);
  ctx.fillStyle = "#000";
  ctx.fill();
  roundRectPath(ctx, x, y, barW, barH, 17);
  ctx.fillStyle = paint([40, 50, 110]);
  ctx.fill();
  const fill = barW * clamp(frac, 0, 1);
  if (fill > barH) {
    roundRectPath(ctx, x, y, fill, barH, 17);
    ctx.fillStyle = paint([90, 170, 255]);
    ctx.fill();
    roundRectPath(ctx, x + 10, y + 5, fill - 20, 8, 4);
    ctx.fillStyle = paint([170, 215, 255]);
    ctx.fill();
  }
}

/** Makes the game as big as possible on the screen while keeping its shape (16:9). */
function fitCanvas(canvas) {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = Math.floor(W * s) + "px";
  canvas.style.height = Math.floor(H * s) + "px";
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function main() {
  const canvas = document.getElementById("game");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  fitCanvas(canvas);
  window.addEventListener("resize", () => fitCanvas(canvas));
  drawLoading(ctx, 0);

  // wait (at most 3 seconds) for the fonts, so all the text pictures use them
  try {
    await Promise.race([
      Promise.all([document.fonts.load('80px "Anton"'), document.fonts.load('900 30px "Nunito"')]),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  } catch (e) { /* no fonts: the backup fonts are used */ }

  // the loading screen: make all the sounds and pictures, moving the bar after each step
  const audio = new GameAudio();
  const assets = new Assets();
  let done = 0;
  for (const steps of [audio.buildSteps(), assets.buildSteps()]) {
    for (const _ of steps) {
      done += 1;
      drawLoading(ctx, done / LOAD_STEPS);
      await nextFrame();                    // give the browser a moment so nothing freezes
    }
  }

  const game = new Game(canvas, audio, assets);

  // ---- mouse, finger and keyboard ----
  const toGame = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  };
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    audio.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.button === 0 || e.pointerType !== "mouse") game.pointerDown(toGame(e));
  });
  canvas.addEventListener("pointermove", e => game.pointerMove(toGame(e)));
  const release = e => {
    audio.unlock();
    game.pointerUp(e.pointerType !== "mouse");
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  window.addEventListener("keydown", e => {
    if (e.key === "f" || e.key === "F") setFullscreen(!isFullscreen());
  });

  // ---- the game loop: runs about 60 times per second ----
  let last = performance.now();
  const frame = now => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
