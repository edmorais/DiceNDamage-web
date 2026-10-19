// charts.js -- the Calculator's two charts, as SVG strings.
// Both are drawn to the width they are shown at, so text stays one size.

import { mix } from "./palettes.js";
import { meanForAC } from "./damage.js";

export const SWEEP_LO = 5, SWEEP_HI = 30;
export const PLOT = { left: 42, right: 36, top: 16, bottom: 24, height: 220 };

export function pct(v) {
  if (v <= 0) return "0%";
  if (v >= 1) return "100%";
  if (v < 0.001) return "<0.1%";
  if (v > 0.999) return ">99.9%";
  return (v * 100).toFixed(1) + "%";
}
export const dec1 = v => v.toFixed(1);

function niceStep(raw) {
  for (let e = 1; e < 100000; e *= 10) for (const k of [1, 2, 5]) if (k * e >= raw) return k * e;
  return 100000;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Probability per damage total, the average marked, with the cumulative
 *  "this much or more" curve on its own 0-100% scale at the right. */
export function distribution(sol, { scrub, ccdf, p, width }) {
  const W = Math.max(240, width), H = PLOT.height;
  const px = PLOT.left, py = PLOT.top, pw = W - PLOT.left - PLOT.right, ph = H - PLOT.top - PLOT.bottom;
  const d = sol.dist, n = d.length;
  let rest = 0;
  for (let v = 1; v < n; v++) rest = Math.max(rest, d[v]);
  const clipZero = rest > 0 && d[0] > rest * 2.2;
  let top = clipZero ? rest * 1.15 : Math.max(d[0], rest) * 1.08;
  if (top <= 0) top = 1;
  const o = [];
  for (let g = 0; g <= 4; g++) {
    const gy = py + ph - (g * ph) / 4;
    o.push(`<line x1="${px}" x2="${px + pw}" y1="${gy}" y2="${gy}" stroke="${p.grid}" stroke-width="1"/>`);
    o.push(`<text x="${px - 6}" y="${gy + 3.5}" text-anchor="end">${pct((top * g) / 4).replace(".0%", "%")}</text>`);
  }
  const cols = Math.max(1, Math.min(n, Math.floor(pw / 2.2)));
  for (let c = 0; c < cols; c++) {
    const lo = Math.floor((c * n) / cols);
    const hi = Math.max(lo, Math.floor(((c + 1) * n) / cols) - 1);
    let peak = 0;
    for (let v = lo; v <= hi; v++) peak = Math.max(peak, d[v]);
    if (peak <= 0) continue;
    const x0 = px + (lo / n) * pw, x1 = px + ((hi + 1) / n) * pw;
    const bw = Math.max(0.8, x1 - x0 - (x1 - x0 > 3 ? 1 : 0));
    let colr = mix(p.barLow, p.barHigh, cols > 1 ? c / (cols - 1) : 1);
    if (lo === 0 && hi === 0) colr = p.miss;
    const scrubbed = scrub >= lo && scrub <= hi;
    const bh = Math.min(1, peak / top) * ph;
    o.push(`<rect x="${x0.toFixed(2)}" y="${(py + ph - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${scrubbed ? p.ink : colr}" />`);
    if (lo === 0 && clipZero) {
      const zw = bw, zx = x0, pts = [[zx - 1, py - 1], [zx + zw + 1, py - 1], [zx + zw + 1, py + 4]];
      for (let i = 4; i >= 0; i--) pts.push([zx + (zw * i) / 4, py + (i % 2 === 0 ? 7 : 2)]);
      o.push(`<polygon points="${pts.map(q => q.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="${p.panel}"/>`);
    }
  }
  if (clipZero) o.push(`<text x="${px + 6}" y="${py + 10}">no damage ${pct(d[0])}</text>`);
  const step = niceStep((n - 1) / 6);
  for (let v = 0; v < n; v += step) {
    const vx = px + ((v + 0.5) / n) * pw;
    o.push(`<text x="${vx.toFixed(1)}" y="${py + ph + 15}" text-anchor="middle">${v}</text>`);
  }
  const mx = px + ((sol.mean + 0.5) / n) * pw;
  o.push(`<line x1="${mx}" x2="${mx}" y1="${py}" y2="${py + ph}" stroke="${p.accent}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
  const mRight = mx > px + pw - 60;
  o.push(`<text x="${mRight ? mx - 4 : mx + 4}" y="${py + (clipZero ? 24 : 10)}" text-anchor="${mRight ? "end" : "start"}" style="fill:${p.accent}">avg ${dec1(sol.mean)}</text>`);
  if (ccdf) {
    const pts = [];
    for (let v = 0; v < n; v++) pts.push(`${(px + ((v + 0.5) / n) * pw).toFixed(1)},${(py + ph - sol.ccdf[v] * ph).toFixed(1)}`);
    o.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${p.accent2}" stroke-width="2" stroke-linejoin="round" opacity=".95"/>`);
    for (const [lab, f] of [["100%", 0], ["50%", 0.5], ["0%", 1]]) {
      o.push(`<text x="${px + pw + 6}" y="${py + ph * f + 3.5}" style="fill:${p.accent2}">${lab}</text>`);
    }
  }
  return { svg: o.join(""), W, H, px, pw };
}

/** Average round damage against every AC from 5 to 30, one line per roll mode. */
export function sweep(a, sol, { ac, mode, scrub, p, width }) {
  const W = Math.max(240, width), H = PLOT.height;
  const px = PLOT.left, py = PLOT.top, pw = W - PLOT.left - PLOT.right, ph = H - PLOT.top - PLOT.bottom;
  const curves = [0, 1, 2].map(m => {
    const c = [];
    for (let x = SWEEP_LO; x <= SWEEP_HI; x++) c[x] = meanForAC(a, sol, x, m);
    return c;
  });
  let top = 0;
  for (const c of curves) for (let x = SWEEP_LO; x <= SWEEP_HI; x++) top = Math.max(top, c[x]);
  top = top > 0 ? top * 1.12 : 1;
  const X = v => px + ((v - SWEEP_LO) / (SWEEP_HI - SWEEP_LO)) * pw;
  const Y = v => py + ph - (v / top) * ph;
  const o = [];
  for (let g = 0; g <= 4; g++) {
    const gy = py + ph - (g * ph) / 4;
    o.push(`<line x1="${px}" x2="${px + pw}" y1="${gy}" y2="${gy}" stroke="${p.grid}"/>`);
    o.push(`<text x="${px - 6}" y="${gy + 3.5}" text-anchor="end">${dec1((top * g) / 4)}</text>`);
  }
  for (let x = SWEEP_LO; x <= SWEEP_HI; x += 5) {
    o.push(`<line x1="${X(x)}" x2="${X(x)}" y1="${py}" y2="${py + ph}" stroke="${p.grid}"/>`);
    o.push(`<text x="${X(x)}" y="${py + ph + 15}" text-anchor="middle">${x}</text>`);
  }
  o.push(`<text x="${px + pw + 4}" y="${py + ph + 15}" text-anchor="end" opacity=".75">AC</text>`);
  const here = Math.max(SWEEP_LO, Math.min(SWEEP_HI, ac));
  o.push(`<line x1="${X(here)}" x2="${X(here)}" y1="${py}" y2="${py + ph}" stroke="${p.accent}" stroke-width="1.5" stroke-dasharray="6 5"/>`);
  const cols = [p.inkDim, p.barHigh, p.accent2];
  const names = ["Disadvantage", "Normal", "Advantage"];
  for (let m = 0; m < 3; m++) {
    const pts = [];
    for (let x = SWEEP_LO; x <= SWEEP_HI; x++) pts.push(`${X(x).toFixed(1)},${Y(curves[m][x]).toFixed(1)}`);
    o.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${cols[m]}" stroke-width="${m === mode ? 3 : 1.5}" stroke-linejoin="round"/>`);
    o.push(`<circle cx="${X(here)}" cy="${Y(curves[m][here])}" r="${m === mode ? 4.5 : 3}" fill="${cols[m]}"/>`);
  }
  // Legend, top right, values at the current AC.
  const lx = px + pw - 136;
  o.push(`<rect x="${lx - 8}" y="${py - 4}" width="146" height="58" rx="6" fill="${p.panel}" opacity=".82"/>`);
  for (let m = 2; m >= 0; m--) {
    const ly = py + 8 + (2 - m) * 17;
    o.push(`<rect x="${lx}" y="${ly - 3}" width="12" height="3" rx="1.5" fill="${cols[m]}"/>`);
    o.push(`<text x="${lx + 18}" y="${ly + 1}" style="fill:${m === mode ? p.ink : p.inkDim}">${esc(names[m])}  ${dec1(curves[m][here])}</text>`);
  }
  if (scrub >= 0) o.push(`<line x1="${X(scrub)}" x2="${X(scrub)}" y1="${py}" y2="${py + ph}" stroke="${p.ink}" opacity=".8"/>`);
  return { svg: o.join(""), W, H, px, pw, curves };
}

export function scrubValue(chart, sol, plotX, plotW, x) {
  const u = (x - plotX) / plotW;
  if (chart === 0) return Math.max(0, Math.min(sol.max, Math.floor(u * (sol.max + 1))));
  return Math.max(SWEEP_LO, Math.min(SWEEP_HI, Math.round(SWEEP_LO + u * (SWEEP_HI - SWEEP_LO))));
}
