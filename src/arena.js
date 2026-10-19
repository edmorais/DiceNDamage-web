// arena.js -- the dice arena: a carved stone dais with a rune ring, real
// polyhedral dice that are thrown onto it and settle on the rolled number,
// and the light and sparks that mark a critical.
//
// The roll itself is decided before the throw (rolls.js). The arena only
// animates it: each die flies, bounces and rolls along its path while its
// rotation is eased into the exact orientation that puts the result on top,
// so what lands is always what was rolled. window.__arena exposes the dice
// to the tests, which read the top face back from the meshes.

import * as THREE from "three";
import { buildShape, buildGeometry, restingQuaternion, topValue, DIE_SCALE } from "./dicegeo.js";
import { mix, luminance } from "./palettes.js";

const R = 5;                      // dais radius
const R_IN = R * 0.7;             // the felt, where dice may land
const CELL = 256;
const UP = new THREE.Vector3(0, 1, 0);
const VIEW = new THREE.Vector3(0, 0, -1);

const ease = t => 1 - Math.pow(1 - t, 3);
const clamp01 = t => Math.max(0, Math.min(1, t));

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- textures

const shapeCache = new Map();
function shapeFor(sides, variant) {
  const key = sides + ":" + variant;
  if (!shapeCache.has(key)) {
    const shape = buildShape(sides, variant);
    const { geometry, cells } = buildGeometry(shape);
    const edges = new THREE.EdgesGeometry(geometry, 8);
    shapeCache.set(key, { shape, geometry, cells, edges });
  }
  return shapeCache.get(key);
}

const NUMERAL_FONT = '700 {px}px "Cinzel", "Trajan Pro", "Times New Roman", serif';

function drawAtlas(entry, style, kind) {
  const { shape, cells } = entry;
  const { cols, rows } = shape.atlas;
  const W = cols * CELL, H = rows * CELL;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const rnd = seeded(shape.sides * 97 + shape.variant.length);

  if (kind === "map") {
    g.fillStyle = style.body;
    g.fillRect(0, 0, W, H);
    // Resin: soft swirls a shade either side of the body colour.
    for (let i = 0; i < cols * rows * 9; i++) {
      const x = rnd() * W, y = rnd() * H, r = (0.12 + rnd() * 0.3) * CELL;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd() < 0.5 ? style.swirlA : style.swirlB;
      grd.addColorStop(0, c + "38");
      grd.addColorStop(1, c + "00");
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else {
    g.fillStyle = kind === "bump" ? "#ffffff" : "#000000";
    g.fillRect(0, 0, W, H);
  }

  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const c of cells) {
    const ox = (c.col + 0.5) * CELL, oy = (c.row + 0.5) * CELL;
    const unit = c.K * CELL;
    const toCanvas = (x, y) => [ox + x * unit, oy - y * unit];
    const labels = [];
    if (shape.sides === 4) {
      // Three numbers per face, each near its corner, pointing at it.
      c.face.verts.forEach((v, j) => {
        const corner = shape.corners.find(k => k.distanceTo(v) < 1e-5);
        const [lx, ly] = c.local[j];
        labels.push({ text: String(corner.value), x: lx * 0.56, y: ly * 0.56, angle: Math.atan2(lx, ly), size: 0.36 });
      });
    } else {
      const two = c.face.label.length > 1;
      const size = c.inner * (two ? 1.02 : 1.3);
      labels.push({ text: c.face.label, x: c.cx, y: c.cy, angle: 0, size, mark: (c.face.label === "6" || c.face.label === "9") && shape.sides >= 8 });
    }
    for (const L of labels) {
      const [px, py] = toCanvas(L.x, L.y);
      const fontPx = Math.round(L.size * unit);
      g.save();
      g.translate(px, py);
      g.rotate(L.angle);
      g.font = NUMERAL_FONT.replace("{px}", fontPx);
      const narrow = L.text.length > 1 ? 0.86 : 1;
      g.scale(narrow, 1);
      const yOff = fontPx * 0.04;
      if (kind === "map") {
        g.fillStyle = style.cavity;
        g.fillText(L.text, 0, yOff + fontPx * 0.035);
        g.fillStyle = style.ink;
        g.fillText(L.text, 0, yOff);
      } else {
        g.fillStyle = kind === "bump" ? "#000000" : "#ffffff";
        g.fillText(L.text, 0, yOff);
      }
      if (L.mark) {
        const w = g.measureText(L.text).width;
        g.fillRect(-w * 0.42, yOff + fontPx * 0.42, w * 0.84, Math.max(3, fontPx * 0.07));
      }
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  if (kind === "map") t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softDot(color) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  return t;
}

/** The dais top: stone, a felt field, a ring of runes, a d20 sigil. */
function daisTexture(p, size) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  const c = size / 2, S = size / 2;
  const rnd = seeded(20);
  const stone = p.light ? mix(p.edge, p.inkDim, 0.18) : mix(p.panel, p.edge, 0.35);
  const felt = p.light ? mix(p.panel, p.edge, 0.3) : mix(p.bg, p.panel, 0.55);
  const runeA = p.light ? "c0" : "70";
  g.fillStyle = stone;
  g.fillRect(0, 0, size, size);
  // Stone grain.
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size, y = rnd() * size, r = 1 + rnd() * size * 0.012;
    g.fillStyle = (rnd() < 0.5 ? p.ink : p.bg) + (p.light ? "0c" : "0a");
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Felt.
  const fr = S * (R_IN / R) * 1.04;
  const grd = g.createRadialGradient(c, c, 0, c, c, fr);
  grd.addColorStop(0, mix(felt, p.accent, 0.06));
  grd.addColorStop(1, felt);
  g.fillStyle = grd;
  g.beginPath(); g.arc(c, c, fr, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 9000; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * fr;
    g.fillStyle = (rnd() < 0.5 ? "#000000" : "#ffffff") + "08";
    g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 2);
  }
  const line = (r, w, a) => {
    g.strokeStyle = p.accent + a;
    g.lineWidth = w;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
  };
  line(fr, size * 0.0035, "aa");
  line(fr + size * 0.012, size * 0.0015, "66");
  line(S * 0.965, size * 0.002, "77");
  // Runes in the band between the felt and the rim.
  const r0 = fr + size * 0.03, r1 = S * 0.94;
  const n = 48;
  g.strokeStyle = p.accent + runeA;
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.save();
    g.translate(c + Math.cos(a) * (r0 + r1) / 2, c + Math.sin(a) * (r0 + r1) / 2);
    g.rotate(a + Math.PI / 2);
    const h = (r1 - r0) * 0.62, w = h * 0.5;
    g.lineWidth = size * 0.0026;
    g.beginPath();
    g.moveTo(0, -h / 2); g.lineTo(0, h / 2);                    // the stave
    const strokes = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < strokes; k++) {
      const y = -h / 2 + rnd() * h * 0.7, dir = rnd() < 0.5 ? -1 : 1;
      g.moveTo(0, y); g.lineTo(dir * w, y + (rnd() < 0.5 ? h * 0.22 : -h * 0.22));
    }
    g.stroke();
    g.restore();
  }
  // A d20 sigil: hexagon, star of triangles, faint.
  g.save();
  g.translate(c, c);
  g.strokeStyle = p.accent + (p.light ? "50" : "2e");
  g.lineWidth = size * 0.003;
  const hr = fr * 0.42;
  const pts = [...Array(6)].map((_, i) => [Math.cos(Math.PI / 6 + i * Math.PI / 3) * hr, Math.sin(Math.PI / 6 + i * Math.PI / 3) * hr]);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  const tri = [...Array(3)].map((_, i) => [Math.cos(-Math.PI / 2 + i * 2 * Math.PI / 3) * hr * 0.6, Math.sin(-Math.PI / 2 + i * 2 * Math.PI / 3) * hr * 0.6]);
  tri.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  for (const [x, y] of tri) for (const [u, v] of pts) {
    if (Math.hypot(x - u, y - v) < hr * 0.95) { g.moveTo(x, y); g.lineTo(u, v); }
  }
  g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- the arena

export class Arena {
  constructor(canvas, { reducedMotion = false, lowPower = false } = {}) {
    this.canvas = canvas;
    this.reduced = reducedMotion;
    this.dice = [];
    this.effects = [];
    this.time = 0;
    this.rolling = false;
    this.onSettle = null;
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.styleCache = new Map();
    this.idle = false;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1.1);
    s.add(this.hemi);
    const key = this.key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(-5, 13, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    s.add(key);
    this.glow = new THREE.PointLight(0xffaa44, 26, 16, 1.6);
    this.glow.position.set(0, 4.2, 0);
    s.add(this.glow);
    this.rim = new THREE.DirectionalLight(0xbfd0ff, 0.9);
    this.rim.position.set(3, 6, -10);
    s.add(this.rim);

    // Dais.
    this.dais = new THREE.Group();
    s.add(this.dais);
    this.daisSide = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 });
    this.daisTop = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.06, 0.7, 128, 1), [this.daisSide, this.daisTop, this.daisSide]);
    base.position.y = -0.35;
    base.receiveShadow = true;
    this.dais.add(base);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.2, 0.4, 128, 1), this.daisSide);
    step.position.y = -0.9;
    step.receiveShadow = true;
    this.dais.add(step);
    this.brass = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.85 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.985, 0.07, 12, 160), this.brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    this.dais.add(rim);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R_IN * 1.04, 0.035, 8, 160), this.brass);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.005;
    this.dais.add(lip);

    // Light pooled on the floor around the dais.
    this.floorMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 3.4, 64), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.1;
    s.add(floor);

    // Embers.
    const N = this.reduced ? 0 : (lowPower ? 70 : 140);
    const pos = new Float32Array(N * 3);
    this.emberSeed = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, rr = R * (0.35 + Math.random() * 0.85);
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = Math.sin(a) * rr;
      this.emberSeed.push({ speed: 0.25 + Math.random() * 0.5, sway: Math.random() * 6.28, a, rr });
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.emberMat = new THREE.PointsMaterial({ size: 0.09, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    this.embers = new THREE.Points(eg, this.emberMat);
    s.add(this.embers);

    // Sparks for crits: one pool, reused.
    this.sparkN = 260;
    const sp = new Float32Array(this.sparkN * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.sparkMat = new THREE.PointsMaterial({ size: 0.13, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.sparks = new THREE.Points(sg, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparkVel = new Float32Array(this.sparkN * 3);
    this.sparkLife = 0;
    s.add(this.sparks);

    // A ring that marks the kept d20, and a shockwave for crits.
    this.ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide });
    this.keptRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.05, 64), this.ringMat);
    this.keptRing.rotation.x = -Math.PI / 2;
    this.keptRing.position.y = 0.015;
    s.add(this.keptRing);
    this.waveMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 96), this.waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = 0.02;
    s.add(this.wave);
    this.waveT = -1;
    this.flash = 0;

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.visible = true;
    requestAnimationFrame(this.loop);
    window.__arena = this;
  }

  // -------------------------------------------------------------- theme

  setTheme(p, diceHex) {
    this.palette = p;
    this.diceHex = diceHex;
    const bg = new THREE.Color(p.bg);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 26, 60);
    this.hemi.color.set(p.light ? "#ffffff" : mix(p.ink, p.accent, 0.25));
    this.hemi.groundColor.set(p.light ? mix(p.bg, p.edge, 0.4) : p.bg);
    this.hemi.intensity = p.light ? 1.6 : 1.05;
    this.key.intensity = p.light ? 2.2 : 2.6;
    this.glow.color.set(p.accent);
    this.glow.intensity = p.light ? 8 : 26;
    this.daisSide.color.set(mix(p.panel, p.edge, 0.25));
    if (this.daisTop.map) this.daisTop.map.dispose();
    this.daisTop.map = daisTexture(p, 2048);
    this.daisTop.needsUpdate = true;
    this.brass.color.set(p.accent);
    if (this.floorMat.map) this.floorMat.map.dispose();
    this.floorMat.map = this.floorTexture(p);
    this.floorMat.needsUpdate = true;
    this.emberMat.color.set(p.accent);
    this.emberMat.opacity = p.light ? 0.5 : 0.8;
    this.emberMat.blending = p.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.sparkMat.color.set(p.crit);
    this.ringMat.color.set(p.accent);
    this.waveMat.color.set(p.crit);
    for (const d of this.dice) this.restyle(d);
  }

  floorTexture(p) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, mix(p.bg, p.accent, p.light ? 0.12 : 0.16) + "ff");
    grd.addColorStop(0.35, mix(p.bg, p.accent, 0.05) + "aa");
    grd.addColorStop(1, p.bg + "00");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** The materials for one die type in the current dice colour. */
  materialsFor(sides, variant) {
    const p = this.palette, body = this.diceHex;
    const bodyLight = luminance(body) > 0.35;
    const ink = bodyLight ? mix(p.bg === "#0d0d0d" ? "#1a1a1a" : "#23190f", body, 0.05) : (p.light ? mix(p.accent, "#f3e2b0", 0.55) : p.accent);
    const key = [sides, variant, body, ink].join("|");
    if (!this.styleCache.has(key)) {
      const entry = shapeFor(sides, variant);
      const style = {
        body, ink,
        cavity: bodyLight ? mix(body, "#ffffff", 0.5) : mix(body, "#000000", 0.55),
        swirlA: mix(body, "#ffffff", bodyLight ? 0.4 : 0.22),
        swirlB: mix(body, "#000000", 0.45),
      };
      const map = drawAtlas(entry, style, "map");
      const bump = drawAtlas(entry, style, "bump");
      const glow = drawAtlas(entry, style, "glow");
      this.styleCache.set(key, { entry, map, bump, glow, ink });
    }
    return this.styleCache.get(key);
  }

  makeMaterial(m) {
    return new THREE.MeshPhysicalMaterial({
      map: m.map, bumpMap: m.bump, bumpScale: 1.6, roughness: 0.46, metalness: 0.04,
      clearcoat: 0.25, clearcoatRoughness: 0.5, emissive: new THREE.Color(m.ink),
      emissiveMap: m.glow, emissiveIntensity: 0.16, transparent: true, opacity: 1,
    });
  }

  restyle(d) {
    const m = this.materialsFor(d.sides, d.variant);
    d.mesh.material.dispose();
    d.mesh.material = this.makeMaterial(m);
    d.edges.material.color.set(m.ink);
    d.ink = m.ink;
  }

  // -------------------------------------------------------------- dice

  clear() {
    for (const d of this.dice) {
      this.scene.remove(d.group);
      d.mesh.material.dispose();
      d.edges.material.dispose();
    }
    this.dice = [];
    this.ringMat.opacity = 0;
    this.keptOn = null;
  }

  makeDie(spec, size) {
    const variant = spec.variant || "std";
    const entry = shapeFor(spec.sides, variant);
    const m = this.materialsFor(spec.sides, variant);
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(entry.geometry, this.makeMaterial(m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const edges = new THREE.LineSegments(entry.edges, new THREE.LineBasicMaterial({ color: m.ink, transparent: true, opacity: 0.5 }));
    mesh.add(edges);
    group.add(mesh);
    const scale = size * DIE_SCALE[spec.sides];
    mesh.scale.setScalar(scale);
    this.scene.add(group);
    return {
      group, mesh, edges, shape: entry.shape, sides: spec.sides, variant, spec,
      scale, rest: entry.shape.inradius * scale, ink: m.ink, glowT: 0, fade: 1, shrink: 1,
    };
  }

  /** Landing spots: a jittered sunflower spiral inside the felt. */
  layout(n) {
    const size = Math.min(1.08, (0.74 * R_IN) / (Math.sqrt(Math.max(n, 1) - 0.5) + 0.74));
    const spots = [];
    if (n === 1) spots.push([(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4]);
    else if (n === 2) {
      const d = size * 1.45;
      spots.push([-d + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5], [d + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5]);
    } else {
      const c = (R_IN - size * 1.1) / Math.sqrt(n - 0.5);
      const rot = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const r = c * Math.sqrt(i + 0.5), a = rot + i * 2.39996;
        spots.push([Math.cos(a) * r * 1.08 + (Math.random() - 0.5) * c * 0.25, Math.sin(a) * r * 0.92 + (Math.random() - 0.5) * c * 0.25]);
      }
      // Read roughly left to right, nearest row first.
      spots.sort((p, q) => (p[1] - q[1]) * 0.15 + (p[0] - q[0]) * 0.02);
    }
    return { size, spots };
  }

  /**
   * Throws dice. specs: [{sides, value, variant, kept}]. opts: {effect:
   * "crit"|"fumble"|"max"|null, keep: index of the kept d20 or -1}.
   * Calls onSettle once the last die is down.
   */
  throw(specs, opts = {}) {
    this.clear();
    this.idle = false;
    const n = specs.length;
    const { size, spots } = this.layout(n);
    const side = Math.random() < 0.5 ? -1 : 1;
    const stagger = Math.min(0.07, 0.55 / Math.max(1, n));
    specs.forEach((spec, i) => {
      const d = this.makeDie(spec, size);
      const [tx, tz] = spots[i];
      d.to = new THREE.Vector3(tx, d.rest, tz);
      d.from = new THREE.Vector3(side * (R + 2.2 + Math.random() * 1.5), 2.6 + Math.random() * 1.6, R * 0.2 + (Math.random() - 0.3) * 4);
      d.qFinal = restingQuaternion(d.shape, spec.value, VIEW, (Math.random() - 0.5) * 0.5);
      const travel = new THREE.Vector3().subVectors(d.to, d.from).setY(0);
      const dist = travel.length();
      d.axis = new THREE.Vector3().crossVectors(UP, travel.normalize()).normalize();
      d.wobble = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.theta0 = dist / Math.max(d.rest, 0.25) * 0.75 + Math.random() * 3;
      d.delay = i * stagger;
      d.dur = this.reduced ? 0.25 : 0.95 + Math.random() * 0.3;
      d.t = 0;
      d.settled = false;
      d.bounces = 2 + Math.floor(Math.random() * 2);
      this.dice.push(d);
      this.place(d, 0);
    });
    this.throwOpts = opts;
    this.rolling = true;
    this.settledFired = false;
  }

  place(d, u) {
    if (this.reduced) {
      d.group.position.copy(d.to);
      d.mesh.quaternion.copy(d.qFinal);
      d.mesh.material.opacity = clamp01(u * 1.5);
      return;
    }
    const k = ease(u);
    const p = d.group.position;
    p.lerpVectors(d.from, d.to, k);
    p.x += Math.sin(u * Math.PI) * d.wobble.x * 0.4;
    const env = Math.pow(1 - u, 1.5);
    const h = (d.from.y - d.rest) * env * Math.abs(Math.cos(Math.PI * d.bounces * Math.pow(u, 0.8) * 0.5 * 2));
    p.y = d.rest + h;
    const th = -d.theta0 * Math.pow(1 - u, 2.2);
    const qa = new THREE.Quaternion().setFromAxisAngle(d.axis, th);
    const qb = new THREE.Quaternion().setFromAxisAngle(d.wobble, th * 0.35 * (1 - u));
    d.mesh.quaternion.copy(qa.multiply(qb).multiply(d.qFinal));
  }

  /** Puts a finished roll back on the dais, as it lay, with no animation. */
  showSettled(specs, opts = {}) {
    this.throw(specs, opts);
    for (const d of this.dice) { d.t = d.delay + d.dur; this.place(d, 1); d.settled = true; d.landT = 1; d.mesh.material.opacity = 1; }
    this.quiet = true;
    this.step(0);
    this.quiet = false;
  }

  skip() {
    if (!this.rolling) return;
    for (const d of this.dice) { d.t = d.delay + d.dur; this.place(d, 1); d.settled = true; }
  }

  /** Floating dice above the dais, turning slowly: what the next roll throws. */
  showIdle(specs, { ghost = true } = {}) {
    this.clear();
    this.rolling = false;
    this.idle = true;
    const n = specs.length;
    const size = Math.min(0.95, 3.4 / Math.max(2.2, Math.sqrt(n) * 1.9));
    const cols = Math.min(n, n <= 4 ? n : Math.ceil(Math.sqrt(n * 2)));
    const rows = Math.ceil(n / cols);
    specs.forEach((spec, i) => {
      const d = this.makeDie({ ...spec, value: spec.value || spec.sides }, size);
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const gap = size * 2.7;
      d.to = new THREE.Vector3((c - (inRow - 1) / 2) * gap, 0.75 + size * 0.9, (r - (rows - 1) / 2) * gap * 0.9 + 0.3);
      d.phase = Math.random() * Math.PI * 2;
      d.spinAxis = new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
      d.q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      d.idle = true;
      d.mesh.material.opacity = ghost ? 0.9 : 1;
      d.edges.material.opacity = ghost ? 0.35 : 0.5;
      d.group.position.copy(d.to);
      d.mesh.quaternion.copy(d.q0);
      this.dice.push(d);
    });
  }

  // -------------------------------------------------------------- effects

  afterSettle() {
    const o = this.throwOpts || {};
    if (o.keep >= 0 && this.dice.length === 2) {
      const other = this.dice[1 - o.keep];
      other.fadeTo = 0.32;
      other.shrinkTo = 0.78;
      if (this.quiet) { other.fade = 0.32; other.shrink = 0.78; }
      this.keptOn = this.dice[o.keep];
    } else if (this.dice.length === 1 && this.dice[0].sides === 20) {
      this.keptOn = this.dice[0];
    }
    if (this.keptOn) {
      this.keptRing.scale.setScalar(this.keptOn.scale * 1.15);
      this.keptRing.position.x = this.keptOn.to.x;
      this.keptRing.position.z = this.keptOn.to.z;
      this.ringT = 0;
      this.ringMat.color.set(o.effect === "crit" ? this.palette.crit : o.effect === "fumble" ? this.palette.fumble : this.palette.accent);
    }
    if (o.effect === "crit" || o.effect === "max") {
      const targets = o.effect === "crit" && this.keptOn ? [this.keptOn] : this.dice;
      for (const d of targets) { d.glowT = 0.001; d.glowColor = this.palette.crit; }
      const at = o.effect === "crit" && this.keptOn ? this.keptOn.to : new THREE.Vector3(0, 0.4, 0);
      if (!this.quiet) {
        this.burst(at, o.effect === "max" ? 1.4 : 1);
        this.waveT = 0;
        this.wave.position.x = at.x;
        this.wave.position.z = at.z;
        this.flash = 1;
      }
    }
    if (o.effect === "fumble") {
      const d = this.keptOn || this.dice[0];
      d.shakeT = this.quiet ? 1 : 0;
      d.dimTo = 1;
    }
  }

  burst(at, power = 1) {
    if (this.reduced) return;
    const pos = this.sparks.geometry.getAttribute("position");
    for (let i = 0; i < this.sparkN; i++) {
      pos.setXYZ(i, at.x, at.y + 0.3, at.z);
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 4.5, out = (1 + Math.random() * 3.2) * power;
      this.sparkVel[i * 3] = Math.cos(a) * out;
      this.sparkVel[i * 3 + 1] = up * power;
      this.sparkVel[i * 3 + 2] = Math.sin(a) * out;
    }
    pos.needsUpdate = true;
    this.sparkLife = 1;
  }

  // -------------------------------------------------------------- frame

  resize(w, h, insets) {
    if (insets) this.insets = insets;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    const { top, bottom, left, right } = this.insets;
    const bw = Math.max(80, w - left - right), bh = Math.max(80, h - top - bottom);
    cam.aspect = w / h;
    const elev = THREE.MathUtils.degToRad(bh / bw < 0.75 ? 44 : 52);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tanH = tanV * (bw / h);
    const halfV = (bh / h) * tanV;
    // Fit the dais circle (plus its step and the height of a bounce).
    const RR = R * 1.16 * (this.insets.fit || 1);
    const needV = (RR * Math.sin(elev) + 1.4 * Math.cos(elev)) / halfV;
    const needH = RR / tanH;
    const D = Math.max(needV, needH) * 1.04;
    cam.position.set(0, Math.sin(elev) * D, Math.cos(elev) * D);
    cam.lookAt(0, 0.35, 0);
    // Shift the picture into the free band between the overlays.
    const dx = (left - right) / 2, dy = (top - bottom) / 2;
    cam.setViewOffset(w, h, -dx, -dy, w, h);
    cam.updateProjectionMatrix();
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (!this.visible || !this.palette) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    const T = this.time;
    // Dice.
    let allDown = this.dice.length > 0;
    for (const d of this.dice) {
      if (d.idle) {
        const bob = Math.sin(T * 1.3 + d.phase) * 0.12;
        d.group.position.y = d.to.y + bob;
        const q = new THREE.Quaternion().setFromAxisAngle(d.spinAxis, T * 0.45 + d.phase);
        d.mesh.quaternion.copy(q.multiply(d.q0));
        allDown = false;
        continue;
      }
      if (!d.settled) {
        d.t += dt;
        const u = clamp01((d.t - d.delay) / d.dur);
        this.place(d, u);
        if (u >= 1) { d.settled = true; d.landT = 0; }
      }
      if (!d.settled) allDown = false;
      if (d.settled && d.landT !== undefined && d.landT < 0.18 && !this.reduced) {
        d.landT += dt;
        const k = Math.sin(clamp01(d.landT / 0.18) * Math.PI) * 0.06;
        d.mesh.scale.set(d.scale * (1 + k * 0.5), d.scale * (1 - k), d.scale * (1 + k * 0.5));
        if (d.landT >= 0.18) d.mesh.scale.setScalar(d.scale);
      }
      if (d.fadeTo !== undefined) {
        d.fade += (d.fadeTo - d.fade) * Math.min(1, dt * 8);
        d.shrink += (d.shrinkTo - d.shrink) * Math.min(1, dt * 8);
        d.mesh.material.opacity = d.fade;
        d.edges.material.opacity = 0.5 * d.fade;
        d.mesh.scale.setScalar(d.scale * d.shrink);
        d.group.position.y = d.rest * d.shrink;
      }
      if (d.glowT > 0) {
        d.glowT += dt;
        const pulse = 1.4 + Math.sin(d.glowT * 5) * 0.5;
        d.mesh.material.emissive.set(d.glowColor);
        d.mesh.material.emissiveIntensity = Math.min(pulse, d.glowT * 6);
        d.edges.material.color.set(d.glowColor);
        d.edges.material.opacity = 0.9;
      }
      if (d.shakeT !== undefined && d.shakeT < 0.6) {
        d.shakeT += dt;
        const k = (1 - d.shakeT / 0.6) * 0.09;
        d.group.position.x = d.to.x + Math.sin(d.shakeT * 70) * k;
      }
      if (d.dimTo) {
        const m = d.mesh.material;
        m.color.lerp(new THREE.Color(0x777777), Math.min(1, dt * 3));
        m.emissiveIntensity = Math.max(0.02, m.emissiveIntensity - dt * 0.4);
      }
    }
    if (this.rolling && allDown && !this.settledFired) {
      this.settledFired = true;
      this.rolling = false;
      this.afterSettle();
      if (this.onSettle && !this.quiet) this.onSettle();
    }
    // Kept ring.
    if (this.keptOn) {
      this.ringT = (this.ringT || 0) + dt;
      this.ringMat.opacity = Math.min(0.85, this.ringT * 3) * (0.75 + Math.sin(this.ringT * 3) * 0.2);
    }
    // Shockwave.
    if (this.waveT >= 0) {
      this.waveT += dt;
      const k = this.waveT / 0.9;
      this.wave.scale.setScalar(0.5 + k * 5);
      this.waveMat.opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) this.waveT = -1;
    }
    // Flash on the centre light.
    const p = this.palette;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.glow.color.set(p.accent).lerp(new THREE.Color(p.crit), this.flash);
    }
    this.glow.intensity = (p.light ? 8 : 26) * (1 + this.flash * 2.5) * (0.92 + Math.sin(T * 2.1) * 0.05 + Math.sin(T * 5.3) * 0.03);
    // Sparks.
    if (this.sparkLife > 0) {
      this.sparkLife = Math.max(0, this.sparkLife - dt * 0.8);
      const pos = this.sparks.geometry.getAttribute("position");
      for (let i = 0; i < this.sparkN; i++) {
        this.sparkVel[i * 3 + 1] -= 7 * dt;
        pos.setXYZ(i, pos.getX(i) + this.sparkVel[i * 3] * dt, Math.max(0.03, pos.getY(i) + this.sparkVel[i * 3 + 1] * dt), pos.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      this.sparkMat.opacity = Math.min(1, this.sparkLife * 1.6);
    }
    // Embers.
    const ep = this.embers.geometry.getAttribute("position");
    for (let i = 0; i < this.emberSeed.length; i++) {
      const e = this.emberSeed[i];
      let y = ep.getY(i) + e.speed * dt * (1 + this.flash * 3);
      if (y > 5.2) y = 0;
      const sway = Math.sin(T * 0.7 + e.sway) * 0.25;
      ep.setXYZ(i, Math.cos(e.a) * e.rr + sway, y, Math.sin(e.a) * e.rr + Math.cos(T * 0.6 + e.sway) * 0.2);
    }
    ep.needsUpdate = true;
  }

  /** What each die shows, read back from its mesh. For the tests. */
  readTop() {
    return this.dice.map(d => topValue(d.shape, d.mesh.quaternion));
  }
}
