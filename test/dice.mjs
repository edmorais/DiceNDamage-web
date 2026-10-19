// node test/dice.mjs -- every die can show every value, upright.
import * as THREE from "three";
import { buildShape, restingQuaternion, topValue, buildGeometry } from "../src/dicegeo.js";
let checks = 0, fails = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log("FAIL:", m); } };
const view = new THREE.Vector3(0, 0, -1);
const kinds = [[4, "std"], [6, "std"], [8, "std"], [10, "std"], [12, "std"], [20, "std"], [10, "units"], [10, "tens"]];
for (const [sides, variant] of kinds) {
  const sh = buildShape(sides, variant);
  ok(sh.faces.length === sides, `d${sides} has ${sides} faces`);
  const labels = sh.faces.map(f => f.label);
  if (sides !== 4) ok(new Set(labels).size === sides, `d${sides} ${variant} labels unique`);
  for (const f of sh.faces) {
    ok(f.verts.every(v => Math.abs(v.clone().sub(f.center).dot(f.normal)) < 1e-6), `d${sides} faces planar`);
    ok(f.normal.dot(f.center) > 0, `d${sides} normals outward`);
    ok(Math.abs(f.center.dot(f.normal) - sh.inradius) < 1e-6, `d${sides} all faces equidistant`);
    if (sides !== 4) {
      const opp = sh.faces.find(g => g.normal.dot(f.normal) < -0.999);
      ok(opp && opp.value + f.value === sides + 1, `d${sides} opposite faces add to ${sides + 1}`);
    }
  }
  const values = variant === "units" ? [...Array(10).keys()] : variant === "tens" ? [...Array(10).keys()].map(k => k * 10)
               : [...Array(sides).keys()].map(k => k + 1);
  for (const v of values) {
    for (const jit of [0, 0.3, -0.3]) {
      const q = restingQuaternion(sh, v, view, jit);
      ok(topValue(sh, q) === v, `d${sides} ${variant} shows ${v} (jitter ${jit})`);
    }
    if (sides !== 4) {
      const q = restingQuaternion(sh, v, view, 0);
      const f = sh.faces.find(f => f.normal.clone().applyQuaternion(q).y > 0.9999);
      ok(!!f, `d${sides} ${variant} ${v}: a face lies flat on top`);
      const up = f.up.clone().applyQuaternion(q);
      ok(up.z < -0.999, `d${sides} ${variant} ${v}: number reads upright (${up.z.toFixed(3)})`);
    } else {
      const q = restingQuaternion(sh, v, view, 0);
      const c = sh.corners[v - 1].clone().applyQuaternion(q);
      ok(c.y > 0.999 * c.length(), `d4 ${v}: corner straight up`);
    }
  }
  const { geometry, cells } = buildGeometry(sh);
  const uv = geometry.getAttribute("uv");
  let inside = true;
  for (let i = 0; i < uv.count; i++) if (uv.getX(i) < 0 || uv.getX(i) > 1 || uv.getY(i) < 0 || uv.getY(i) > 1) inside = false;
  ok(inside, `d${sides} UVs inside the atlas`);
  ok(cells.every(c => c.inner > 0.2), `d${sides} every face has room for a number`);
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
