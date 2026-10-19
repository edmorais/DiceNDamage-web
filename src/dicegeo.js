// dicegeo.js -- the shapes of the dice, which face carries which number, and
// how to turn a die so a given number lands on top.
//
// Every die is built as flat polygons. Each face gets one cell of a texture
// atlas, mapped so the face's own "up" points to the top of the cell, which
// is where its number is drawn upright. Kept free of the DOM so the node
// tests can check that every value can be shown and reads upright.

import * as THREE from "three";

const PHI = (1 + Math.sqrt(5)) / 2;

/** Groups a triangle soup by normal into convex face polygons. */
function polygonsFromTriangles(geo) {
  const pos = (geo.index ? geo.toNonIndexed() : geo).getAttribute("position");
  const faces = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let f = faces.find(f => f.normal.dot(n) > 0.9999);
    if (!f) { f = { normal: n, verts: [] }; faces.push(f); }
    for (const v of [a, b, c]) if (!f.verts.some(w => w.distanceTo(v) < 1e-5)) f.verts.push(v.clone());
  }
  return faces.map(f => orderPolygon(f.verts, f.normal));
}

/** Orders a convex polygon's corners counter-clockwise seen from outside. */
function orderPolygon(verts, normal) {
  const c = verts.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / verts.length);
  const ref = new THREE.Vector3().subVectors(verts[0], c).normalize();
  const side = new THREE.Vector3().crossVectors(normal, ref);
  const sorted = verts.slice().sort((p, q) => {
    const ap = Math.atan2(new THREE.Vector3().subVectors(p, c).dot(side), new THREE.Vector3().subVectors(p, c).dot(ref));
    const aq = Math.atan2(new THREE.Vector3().subVectors(q, c).dot(side), new THREE.Vector3().subVectors(q, c).dot(ref));
    return ap - aq;
  });
  return { normal: normal.clone(), verts: sorted, center: c };
}

function cubePolygons() {
  const faces = [];
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const ax of axes) {
    const n = new THREE.Vector3(...ax);
    const verts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const v = new THREE.Vector3(sx, sy, sz);
      if (Math.abs(v.dot(n) - 1) < 1e-6) verts.push(v.multiplyScalar(1 / Math.sqrt(3)));
    }
    faces.push(orderPolygon(verts, n));
  }
  return faces;
}

/** Pentagonal trapezohedron: ten kites, apexes on the y axis. */
function d10Polygons() {
  const a = 0.105, h = a * (1 + Math.cos(Math.PI / 5)) / (1 - Math.cos(Math.PI / 5));
  const stretch = 1.0 / h;                       // apex at y = 1
  const ring = [];
  for (let k = 0; k < 10; k++) {
    const t = k * Math.PI / 5;
    ring.push(new THREE.Vector3(Math.cos(t), (k % 2 ? -a : a) * stretch, Math.sin(t)));
  }
  const top = new THREE.Vector3(0, h * stretch, 0), bot = new THREE.Vector3(0, -h * stretch, 0);
  const faces = [];
  for (let k = 0; k < 10; k += 2) {
    const v = [top, ring[k], ring[k + 1], ring[(k + 2) % 10]];
    faces.push(kite(v));
  }
  for (let k = 1; k < 10; k += 2) {
    const v = [bot, ring[k], ring[(k + 1) % 10], ring[(k + 2) % 10]];
    faces.push(kite(v));
  }
  // Shrink to about the same size as the other dice.
  for (const f of faces) {
    f.verts = f.verts.map(v => new THREE.Vector3(v.x * 0.92, v.y * 0.86, v.z * 0.92));
    f.center = f.verts.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / 4);
    const e1 = new THREE.Vector3().subVectors(f.verts[1], f.verts[0]);
    const e2 = new THREE.Vector3().subVectors(f.verts[3], f.verts[0]);
    f.normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (f.normal.dot(f.center) < 0) f.normal.negate();
    f.apex = f.verts[0].clone();
  }
  return faces.map(f => ({ ...orderPolygon(f.verts, f.normal), apex: f.apex }));
}

function kite(v) {
  const c = v.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.25);
  const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[3], v[0])).normalize();
  if (n.dot(c) < 0) n.negate();
  return { verts: v, normal: n, center: c };
}

const BUILDERS = {
  4: () => polygonsFromTriangles(new THREE.TetrahedronGeometry(1, 0)),
  6: cubePolygons,
  8: () => polygonsFromTriangles(new THREE.OctahedronGeometry(1, 0)),
  10: d10Polygons,
  12: () => polygonsFromTriangles(new THREE.DodecahedronGeometry(1, 0)),
  20: () => polygonsFromTriangles(new THREE.IcosahedronGeometry(1, 0)),
};

// Visual size: the circumradius each die is scaled to, so a d4 and a d20
// look like they came out of the same bag.
export const DIE_SCALE = { 4: 1.32, 6: 0.98, 8: 1.12, 10: 1.12, 12: 1.06, 20: 1.13 };

/**
 * Builds the shape for a die with `sides` faces. Labelled faces:
 *   variant "std"   values 1..N
 *   variant "units" a d10 reading 0..9 (the percentile units die)
 *   variant "tens"  a d10 reading 00..90 (the percentile tens die)
 * Returns { sides, faces: [{normal, center, verts, up, value, label}],
 *           corners (d4 only), inradius, atlas: {cols, rows} }.
 */
export function buildShape(sides, variant = "std") {
  const faces = BUILDERS[sides]();
  const N = faces.length;

  // Values: opposite faces add up to N + 1, as on real dice.
  const used = new Array(N).fill(false);
  let low = 1;
  const order = faces.map((f, i) => i).sort((i, j) => {
    // A stable order that spreads low numbers around the die.
    const fi = faces[i].center, fj = faces[j].center;
    return (Math.atan2(fi.z, fi.x) + fi.y * 10) - (Math.atan2(fj.z, fj.x) + fj.y * 10);
  });
  if (sides !== 4) {
    for (const i of order) {
      if (used[i]) continue;
      const opp = faces.findIndex((g, j) => !used[j] && j !== i && g.normal.dot(faces[i].normal) < -0.999);
      faces[i].value = low;
      used[i] = true;
      if (opp >= 0) { faces[opp].value = N + 1 - low; used[opp] = true; }
      low++;
    }
  }

  // The direction a face's number points: toward the apex on a d10, toward
  // a corner on triangles, pentagons and the d4, along an edge on the cube.
  for (const f of faces) {
    let toward;
    if (sides === 10) toward = f.apex;
    else if (sides === 6) toward = new THREE.Vector3().addVectors(f.verts[0], f.verts[1]).multiplyScalar(0.5);
    else toward = f.verts[0];
    f.up = new THREE.Vector3().subVectors(toward, f.center);
    f.up.sub(f.normal.clone().multiplyScalar(f.up.dot(f.normal))).normalize();
    f.right = new THREE.Vector3().crossVectors(f.up, f.normal).normalize();
  }

  let corners = null;
  if (sides === 4) {
    // A d4 reads its result at the top corner: number the four corners and
    // print, on each face, the numbers of its three corners near them.
    corners = [];
    for (const f of faces) for (const v of f.verts) if (!corners.some(c => c.distanceTo(v) < 1e-5)) corners.push(v.clone());
    corners.forEach((c, i) => { c.value = i + 1; });
    faces.forEach((f, i) => { f.value = i + 1; });   // faces only need ids
  }

  for (const f of faces) {
    if (variant === "units") f.label = String(f.value % 10);
    else if (variant === "tens") f.label = String((f.value % 10) * 10).padStart(2, "0");
    else f.label = String(f.value);
  }

  const inradius = faces[0].center.dot(faces[0].normal);
  const cols = { 4: 2, 6: 3, 8: 4, 10: 4, 12: 4, 20: 5 }[sides];
  const rows = Math.ceil(N / cols);
  return { sides, variant, faces, corners, inradius, atlas: { cols, rows } };
}

/** The face (or, on a d4, the corner) that shows `value`, as a local
 *  direction that must end up pointing straight up. */
export function upDirection(shape, value) {
  if (shape.sides === 4) {
    const c = shape.corners.find(c => c.value === value);
    return { dir: c.clone().normalize(), face: null };
  }
  const want = shape.variant === "units" ? value % 10 : shape.variant === "tens" ? (value / 10) % 10 : value;
  const f = shape.faces.find(f => (shape.variant === "std" ? f.value === want : f.value % 10 === want));
  return { dir: f.normal.clone(), face: f };
}

/**
 * A rotation that puts `value` on top, with its number upright for a
 * viewer looking along `viewDir` (horizontal), plus `jitter` radians of
 * random turn so a handful of dice doesn't line up like soldiers.
 */
export function restingQuaternion(shape, value, viewDir = new THREE.Vector3(0, 0, -1), jitter = 0) {
  const { dir, face } = upDirection(shape, value);
  const q1 = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 1, 0));
  let upVec;
  if (face) upVec = face.up.clone().applyQuaternion(q1);
  else {
    // d4: point one face's corner number toward the viewer.
    const f = shape.faces.find(f => f.verts.some(v => v.distanceTo(shape.corners[value - 1]) < 1e-5));
    upVec = new THREE.Vector3().subVectors(shape.corners[value - 1], f.center).applyQuaternion(q1);
  }
  upVec.y = 0;
  if (upVec.lengthSq() < 1e-8) upVec.set(0, 0, -1);
  upVec.normalize();
  const target = viewDir.clone().setY(0).normalize();
  let yaw = Math.atan2(upVec.x, upVec.z) - Math.atan2(target.x, target.z);
  yaw = -yaw + jitter;
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return q2.multiply(q1);
}

/** Which value is on top for a given rotation: the face whose normal points
 *  most nearly up (on a d4, the highest corner). Used by the tests. */
export function topValue(shape, q) {
  const up = new THREE.Vector3(0, 1, 0);
  if (shape.sides === 4) {
    let best = null, bestY = -Infinity;
    for (const c of shape.corners) {
      const y = c.clone().applyQuaternion(q).y;
      if (y > bestY) { bestY = y; best = c.value; }
    }
    return best;
  }
  let best = null, bestDot = -Infinity;
  for (const f of shape.faces) {
    const d = f.normal.clone().applyQuaternion(q).dot(up);
    if (d > bestDot) { bestDot = d; best = f; }
  }
  if (shape.variant === "units") return best.value % 10;
  if (shape.variant === "tens") return (best.value % 10) * 10;
  return best.value;
}

/**
 * Flat-shaded geometry with UVs into the atlas, one cell per face, and a
 * second UV-free list of polygons for drawing the atlas itself.
 */
export function buildGeometry(shape) {
  const pos = [], nor = [], uv = [];
  const { cols, rows } = shape.atlas;
  const cells = [];
  shape.faces.forEach((f, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    let s = 0;
    for (const v of f.verts) s = Math.max(s, v.distanceTo(f.center));
    const local = f.verts.map(v => {
      const d = new THREE.Vector3().subVectors(v, f.center);
      return [d.dot(f.right) / s, d.dot(f.up) / s];
    });
    // The widest point inside the face, and how far it is from every edge:
    // where the number goes and how big it can be. A grid search is plenty
    // for a handful of convex polygons built once.
    const edgeDist = (px, py) => {
      let m = Infinity;
      for (let k = 0; k < local.length; k++) {
        const [x1, y1] = local[k], [x2, y2] = local[(k + 1) % local.length];
        const len = Math.hypot(x2 - x1, y2 - y1);
        m = Math.min(m, ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) / len);
      }
      return m;
    };
    let inner = -Infinity, cx = 0, cy = 0;
    for (let gy = -40; gy <= 40; gy++) for (let gx = -40; gx <= 40; gx++) {
      const px = gx / 40, py = gy / 40, d = edgeDist(px, py) - 0.02 * Math.abs(px);
      if (d > inner) { inner = d; cx = px; cy = py; }
    }
    const K = 0.47;
    const toUV = ([x, y]) => [(col + 0.5 + K * x) / cols, 1 - (row + 0.5 - K * y) / rows];
    cells.push({ col, row, local, inner, cx, cy, K, face: f, index: i });
    for (let k = 1; k + 1 < f.verts.length; k++) {
      for (const j of [0, k, k + 1]) {
        const v = f.verts[j];
        pos.push(v.x, v.y, v.z);
        nor.push(f.normal.x, f.normal.y, f.normal.z);
        uv.push(...toUV(local[j]));
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return { geometry: g, cells };
}

export { PHI };
