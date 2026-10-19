// rolls.js -- what a roll is and how one is made.
//
// The random source is passed in: rng(lo, hi) is inclusive at both ends.
// Tests hand in a scripted sequence to pin every branch; the page uses
// crypto.getRandomValues. The rules are the ones damage.js enumerates.

import { NORMAL, ADVANTAGE, DISADVANTAGE, diceText, modText } from "./rules.js";

export function cryptoRng() {
  const buf = new Uint32Array(1);
  return (lo, hi) => {
    const span = hi - lo + 1;
    // Rejection sampling, so every face is exactly equally likely.
    const limit = Math.floor(0x100000000 / span) * span;
    let x;
    do {
      globalThis.crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return lo + (x % span);
  };
}

/** mode 0 keeps the lower of two d20s, 1 rolls one, 2 keeps the higher. */
export function d20(rng, mod, mode, critFrom) {
  const a = rng(1, 20);
  const dice = [{ sides: 20, value: a }];
  let keep = 0;
  if (mode !== NORMAL) {
    const b = rng(1, 20);
    dice.push({ sides: 20, value: b });
    if (mode === ADVANTAGE && b > a) keep = 1;
    if (mode === DISADVANTAGE && b < a) keep = 1;
  }
  dice.forEach((d, i) => {
    d.kept = i === keep;
    d.max = d.kept && d.value >= critFrom;
    d.min = d.kept && d.value === 1;
  });
  const natural = dice[keep].value;
  return {
    kind: "d20", dice, keep, natural, mod, total: natural + mod,
    crit: natural >= critFrom, fumble: natural === 1, mode,
  };
}

/** Attack roll against an AC: a crit always hits, a natural 1 never does. */
export function attack(rng, bonus, mode, critFrom, ac) {
  const r = d20(rng, bonus, mode, critFrom);
  r.isAttack = true;
  r.judged = true;
  r.target = ac;
  r.success = r.crit ? true : r.fumble ? false : r.total >= ac;
  r.expr = d20Expression(bonus, mode) + `  vs AC ${ac}`;
  return r;
}

/** Ability check or save: no crits in 5e, but the 20 and the 1 are still
 *  called out, so critFrom is 20 and success is plain total >= DC. */
export function check(rng, mod, mode, dc) {
  const r = d20(rng, mod, mode, 20);
  r.isAttack = false;
  r.judged = dc > 0;
  r.target = dc;
  r.success = dc > 0 && r.total >= dc;
  r.expr = d20Expression(mod, mode) + (dc > 0 ? `  vs DC ${dc}` : "");
  return r;
}

export function d20Expression(mod, mode) {
  const head = mode === ADVANTAGE ? "2d20 keep high" : mode === DISADVANTAGE ? "2d20 keep low" : "d20";
  return head + modText(mod);
}

export function damage(rng, groups, mod, doubled) {
  const dice = [];
  let sum = 0;
  for (const g of groups) {
    for (let i = 0; i < (doubled ? g.n * 2 : g.n); i++) {
      const v = rng(1, g.d);
      sum += v;
      dice.push({ sides: g.d, value: v, kept: true, max: v === g.d, min: v === 1 });
    }
  }
  const allMax = dice.length > 0 && dice.every(d => d.max);
  return {
    kind: "damage", dice, sum, mod, total: sum + mod, dealt: Math.max(0, sum + mod),
    doubled: !!doubled, allMax, expr: diceText(groups, doubled) + modText(mod),
  };
}

/** One d100, thrown as a tens die and a units die. 00 and 0 read 100. */
export function percent(rng) {
  const v = rng(1, 100);
  const units = v % 10, tens = Math.floor(v / 10) % 10;
  return {
    kind: "percent", total: v, value: v, tens, units,
    max: v === 100, min: v === 1,
    dice: [{ sides: 100, value: tens * 10, tensDie: true }, { sides: 10, value: units, unitsDie: true }],
    expr: "d100",
  };
}
