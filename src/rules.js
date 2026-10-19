// rules.js -- what an attack is, and the limits every control respects.
//
// Plain JS with no DOM or three.js, so the node tests import it unchanged.
// The numbers are the Dice & Damage prototype's after the Calculator and the
// Damage tab came to share one set of dice: up to 5 groups, 15 dice in all
// (30 when a crit doubles them), damage bonus -10..50.

export const DIE_SIZES = [4, 6, 8, 10, 12, 20];
export const CRIT_MINS = [20, 19, 18];
export const CRIT_LABELS = ["20", "19–20", "18–20"];

export const DISADVANTAGE = 0, NORMAL = 1, ADVANTAGE = 2;
export const MODE_NAMES = ["Disadvantage", "Normal", "Advantage"];

export const MAX_GROUPS = 5;
export const MAX_DICE = 15;
export const BONUS_MIN = -5, BONUS_MAX = 20;
export const MOD_MIN = -10, MOD_MAX = 50;
export const ATTACKS_MIN = 1, ATTACKS_MAX = 4;
export const AC_MIN = 1, AC_MAX = 40;
export const CHECK_MOD_MIN = -10, CHECK_MOD_MAX = 30;
export const DC_MAX = 40;          // 0 means "do not judge the check"
export const HP_MAX = 5000;

export const MAX_PRESETS = 8;      // per character, as in the app
export const MAX_CHARACTERS = 12;
export const NAME_MAX = 24;        // code points, not UTF-16 units
export const NOTE_MAX = 32;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function isSize(d) {
  return DIE_SIZES.includes(d);
}

/** Next die size in the cycle, d20 wrapping back to d4. */
export function nextSize(d) {
  const i = DIE_SIZES.indexOf(d);
  return i < 0 ? DIE_SIZES[0] : DIE_SIZES[(i + 1) % DIE_SIZES.length];
}

export function count(groups) {
  let n = 0;
  for (const g of groups) n += g.n;
  return n;
}

/** "2d8 + 1d6", counts doubled on a crit. */
export function diceText(groups, doubled = false) {
  if (!groups.length) return "no dice";
  return groups.map(g => `${doubled ? g.n * 2 : g.n}d${g.d}`).join(" + ");
}

export function modText(mod) {
  if (mod > 0) return ` + ${mod}`;
  if (mod < 0) return ` − ${-mod}`;
  return "";
}

export function signed(v) {
  return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0";
}

/**
 * A name that can always be written, read back and drawn: control
 * characters and the session format's two delimiters go, whitespace
 * collapses, and the result is cut to `max` code points so an accented
 * letter or an emoji is never split.
 */
export function sanitizeName(s, max = NAME_MAX) {
  if (typeof s !== "string") return "";
  let out = "", kept = 0, space = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 32 || cp === 127 || (cp >= 0x80 && cp < 0xa0) || ch === "|" || ch === "=") continue;
    if (cp >= 0xd800 && cp <= 0xdfff) continue;            // lone surrogate
    if (/\s/u.test(ch)) { space = out.length > 0; continue; }
    if (space) {
      if (kept + 1 >= max) break;
      out += " ";
      kept++;
      space = false;
    }
    if (kept >= max) break;
    out += ch;
    kept++;
  }
  return out;
}

export function codePoints(s) {
  return [...s].length;
}

/** Parses "2d8+1d6" into groups; a malformed group is dropped, the rest kept. */
export function parseDice(spec, maxGroups = MAX_GROUPS, maxDice = MAX_DICE) {
  const out = [];
  if (typeof spec !== "string") return out;
  for (const part of spec.split("+")) {
    const m = /^\s*(\d{1,3})\s*d\s*(\d{1,3})\s*$/.exec(part);
    if (!m) continue;
    const n = +m[1], d = +m[2];
    if (!isSize(d) || n < 1 || n > maxDice) continue;
    if (out.length >= maxGroups) break;
    out.push({ n, d });
  }
  if (count(out) > maxDice) return [];
  return out;
}

export function encodeDice(groups) {
  return groups.map(g => `${g.n}d${g.d}`).join("+");
}

// ---------------------------------------------------------------- attack

export function makeAttack(bonus = 5, dice = "1d8", mod = 3, attacks = 1, crit = 0) {
  const a = { bonus, groups: parseDice(dice), mod, attacks, crit };
  if (!a.groups.length) a.groups = [{ n: 1, d: 8 }];
  return clampAttack(a);
}

export function copyAttack(a) {
  return { bonus: a.bonus, groups: a.groups.map(g => ({ n: g.n, d: g.d })),
           mod: a.mod, attacks: a.attacks, crit: a.crit };
}

export function sameAttack(a, b) {
  if (!a || !b) return false;
  if (a.bonus !== b.bonus || a.mod !== b.mod || a.attacks !== b.attacks || a.crit !== b.crit) return false;
  if (a.groups.length !== b.groups.length) return false;
  return a.groups.every((g, i) => g.n === b.groups[i].n && g.d === b.groups[i].d);
}

export const critMin = a => CRIT_MINS[a.crit];
export const room = a => MAX_DICE - count(a.groups);

export function damageText(a, doubled = false) {
  return diceText(a.groups, doubled) + modText(a.mod);
}

/** One line for the preset bar and the preset list. */
export function summary(a) {
  let s = `${signed(a.bonus)} to hit, ${damageText(a)}`;
  if (a.attacks > 1) s += `, ${a.attacks} attacks`;
  if (a.crit > 0) s += `, crit ${CRIT_LABELS[a.crit]}`;
  return s;
}

function int(v, fallback) {
  const n = typeof v === "string" && /^\s*-?\d+\s*$/.test(v) ? parseInt(v, 10) : v;
  return Number.isInteger(n) ? n : fallback;
}

/** Brings every field inside the limits the controls enforce. Accepts
 *  anything and always returns a valid attack, so it doubles as the
 *  validator for imported files. */
export function clampAttack(a) {
  const src = a && typeof a === "object" ? a : {};
  const out = {
    bonus: clamp(int(src.bonus, 5), BONUS_MIN, BONUS_MAX),
    mod: clamp(int(src.mod, 3), MOD_MIN, MOD_MAX),
    attacks: clamp(int(src.attacks, 1), ATTACKS_MIN, ATTACKS_MAX),
    crit: clamp(int(src.crit, 0), 0, CRIT_MINS.length - 1),
    groups: [],
  };
  const groups = Array.isArray(src.groups) ? src.groups
               : typeof src.dice === "string" ? parseDice(src.dice) : [];
  for (const g of groups) {
    if (out.groups.length >= MAX_GROUPS) break;
    if (!g || typeof g !== "object") continue;
    const d = int(g.d, 0), n = int(g.n, 0);
    if (!isSize(d) || n < 1) continue;
    out.groups.push({ n: clamp(n, 1, MAX_DICE), d });
  }
  while (count(out.groups) > MAX_DICE) {
    const last = out.groups[out.groups.length - 1];
    if (last.n > 1) last.n--; else out.groups.pop();
  }
  if (!out.groups.length) out.groups.push({ n: 1, d: 8 });
  return out;
}
