// damage.js -- exact probability for a 5e attack routine. Nothing simulated.
//
// The twenty d20 faces are enumerated and weighted for the roll mode, dice
// sums are built by convolution, a crit doubles every group, and extra
// attacks convolve the single-attack distribution with itself. A natural 1
// always misses, a face in the crit range always hits and crits, and the
// damage of a hit never goes below zero. Distributions are arrays indexed
// by damage that sum to 1.

import { ADVANTAGE, DISADVANTAGE, critMin, clamp } from "./rules.js";

/** P(kept d20 face == k), k = 1..20; index 0 unused. */
export function faceProbs(mode) {
  const f = new Float64Array(21);
  for (let k = 1; k <= 20; k++) {
    if (mode === ADVANTAGE) f[k] = (2 * k - 1) / 400;
    else if (mode === DISADVANTAGE) f[k] = (41 - 2 * k) / 400;
    else f[k] = 1 / 20;
  }
  return f;
}

/** [hit, crit, miss] for one attack; hit excludes crits. */
export function hitChances(bonus, ac, mode, critFrom) {
  const f = faceProbs(mode);
  let hit = 0, crit = 0, miss = 0;
  for (let k = 1; k <= 20; k++) {
    if (k >= critFrom) crit += f[k];
    else if (k === 1) miss += f[k];
    else if (k + bonus >= ac) hit += f[k];
    else miss += f[k];
  }
  return [hit, crit, miss];
}

export function convolve(a, b) {
  const r = new Float64Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    if (ai < 1e-18) continue;
    for (let j = 0; j < b.length; j++) r[i + j] += ai * b[j];
  }
  return r;
}

/** Distribution of the sum of every group, each count multiplied. */
export function sumDist(groups, mult) {
  let d = Float64Array.of(1);
  for (const g of groups) {
    const die = new Float64Array(g.d + 1);
    for (let v = 1; v <= g.d; v++) die[v] = 1 / g.d;
    for (let i = 0; i < g.n * mult; i++) d = convolve(d, die);
  }
  return d;
}

/** One attack's damage, with the mass that piles up at 0 on a miss. */
export function attackDist(pHit, pCrit, pMiss, hitDice, critDice, mod) {
  const maxD = Math.max(1, critDice.length - 1 + mod);
  const d = new Float64Array(maxD + 1);
  d[0] += pMiss;
  for (let v = 0; v < hitDice.length; v++) {
    if (hitDice[v] > 0) d[clamp(v + mod, 0, maxD)] += pHit * hitDice[v];
  }
  for (let v = 0; v < critDice.length; v++) {
    if (critDice[v] > 0) d[clamp(v + mod, 0, maxD)] += pCrit * critDice[v];
  }
  return d;
}

export function solve(a, ac, mode) {
  const [pHit, pCrit, pMiss] = hitChances(a.bonus, ac, mode, critMin(a));
  const hitDice = sumDist(a.groups, 1);
  const critDice = sumDist(a.groups, 2);
  const one = attackDist(pHit, pCrit, pMiss, hitDice, critDice, a.mod);
  let r = one;
  for (let i = 1; i < a.attacks; i++) r = convolve(r, one);

  const ccdf = new Float64Array(r.length);
  let acc = 0;
  for (let i = r.length - 1; i >= 0; i--) {
    acc += r[i];
    ccdf[i] = Math.min(1, acc);
  }
  let mean = 0;
  for (let i = 0; i < r.length; i++) mean += i * r[i];
  let m2 = 0;
  for (let i = 0; i < r.length; i++) m2 += r[i] * (i - mean) * (i - mean);
  let run = 0, best = -1, median = 0, modeV = 0, medSet = false;
  for (let i = 0; i < r.length; i++) {
    run += r[i];
    if (!medSet && run >= 0.5) { median = i; medSet = true; }
    if (r[i] > best) { best = r[i]; modeV = i; }
  }
  const max = r.length - 1;
  return {
    pHit, pCrit, pMiss, hitDice, critDice, dist: r, ccdf, mean,
    sd: Math.sqrt(m2), median, mode: modeV, max,
    atLeast: t => (t <= 0 ? 1 : t > max ? 0 : ccdf[t]),
    exactly: t => (t < 0 || t > max ? 0 : r[t]),
  };
}

/** Average damage of one hit, never below zero. */
export function expectedFrom(dice, mod) {
  let e = 0;
  for (let v = 0; v < dice.length; v++) e += dice[v] * Math.max(0, v + mod);
  return e;
}

/** Average round damage at any AC and roll mode, for the sweep chart. */
export function meanForAC(a, sol, ac, mode) {
  const [hit, crit] = hitChances(a.bonus, ac, mode, critMin(a));
  return a.attacks * (hit * expectedFrom(sol.hitDice, a.mod) + crit * expectedFrom(sol.critDice, a.mod));
}
