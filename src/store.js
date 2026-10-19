// store.js -- the party of characters, the situation, and every file format.
//
// Plain JS, no DOM. The page keeps one state object; everything that changes
// it goes through the functions here, so the tests can drive the same paths
// the buttons do.
//
// Each character owns a set of attack presets (up to 8, as in the app) and
// its own working attack: switching character brings back what that
// character was last swinging. The situation -- enemy AC, roll mode, the
// damage you are trying to deal, the ability check -- belongs to the fight,
// not the character, so it stays put when you switch.

import {
  makeAttack, copyAttack, sameAttack, clampAttack, sanitizeName, parseDice, encodeDice,
  clamp, NORMAL, AC_MIN, AC_MAX, CHECK_MOD_MIN, CHECK_MOD_MAX, DC_MAX, HP_MAX,
  MAX_PRESETS, MAX_CHARACTERS, NAME_MAX, NOTE_MAX, BONUS_MIN, BONUS_MAX, MOD_MIN, MOD_MAX,
  ATTACKS_MIN, ATTACKS_MAX, CRIT_MINS,
} from "./rules.js";

import { PALETTES, APP_SCHEMES } from "./palettes.js";

export const FORMAT_STATE = "dice-and-damage-web";
export const FORMAT_CHARACTER = "dice-and-damage-character";
export const FORMAT_PARTY = "dice-and-damage-party";
export const VERSION = 1;

// Dice colours a character can carry: deep jewel tones, plus bone.
export const DICE_COLORS = [
  { name: "Garnet", hex: "#7c1d2a" },
  { name: "Emerald", hex: "#1c6248" },
  { name: "Sapphire", hex: "#1f3d80" },
  { name: "Amethyst", hex: "#5a2b7e" },
  { name: "Amber", hex: "#93600f" },
  { name: "Teal", hex: "#11596a" },
  { name: "Obsidian", hex: "#1d1d24" },
  { name: "Bone", hex: "#d9cfb6" },
];

let idCounter = 0;
export function newId() {
  idCounter = (idCounter + 1) % 1e6;
  return "c" + Date.now().toString(36) + idCounter.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

function preset(name, ...args) {
  return { name: sanitizeName(name), attack: makeAttack(...args) };
}

/** The example party a first visit opens on. */
export function seedParty() {
  return [
    {
      id: newId(), name: "Brannoc", note: "Fighter 5 · Champion", color: 0,
      presets: [
        preset("Longsword", 7, "1d8", 4, 2, 0),
        preset("Greatsword", 8, "2d6", 5, 2, 1),
        preset("Handaxe, thrown", 7, "1d6", 4, 2, 1),
      ],
    },
    {
      id: newId(), name: "Vex", note: "Rogue 5", color: 1,
      presets: [
        preset("Rapier and Sneak Attack", 7, "1d8+3d6", 4, 1, 0),
        preset("Shortbow, Sneak Attack", 7, "1d6+3d6", 4, 1, 0),
        preset("Off-hand dagger", 7, "1d4", 0, 1, 0),
      ],
    },
    {
      id: newId(), name: "Sister Ilse", note: "Paladin 5", color: 2,
      presets: [
        preset("Longsword and Smite", 7, "1d8+2d8", 4, 1, 0),
        preset("Longsword", 7, "1d8", 4, 2, 0),
        preset("Javelin", 7, "1d6", 4, 2, 0),
      ],
    },
  ].map(c => ({ ...c, active: 0, attack: copyAttack(c.presets[0].attack) }));
}

export function freshState() {
  return {
    situation: { ac: 15, mode: NORMAL, checkMod: 3, checkDc: 0, doubleDice: false },
    ui: { tab: 0, sub: 0, pal: 0, chart: 0, ccdf: true },
    party: seedParty(),
    current: 0,
    seeded: true,          // still the example party, untouched
  };
}

export function blankCharacter(name = "New character") {
  return { id: newId(), name, note: "", color: 6, presets: [], active: -1, attack: makeAttack() };
}

// ---------------------------------------------------------------- queries

export const char = s => s.party[s.current];
export const attackOf = s => char(s).attack;

/** The working attack differs from the preset it was loaded from. */
export function edited(c) {
  return c.active >= 0 && c.active < c.presets.length && !sameAttack(c.presets[c.active].attack, c.attack);
}

export function suggestPresetName(c) {
  for (let i = c.presets.length + 1; ; i++) {
    const s = `Attack ${i}`;
    if (!c.presets.some(p => p.name === s)) return s;
  }
}

export function uniqueCharName(party, name, except = -1) {
  const base = sanitizeName(name) || "Character";
  const taken = n => party.some((c, i) => i !== except && c.name.toLowerCase() === n.toLowerCase());
  if (!taken(base)) return base;
  for (let k = 2; ; k++) {
    const suffix = ` (${k})`;
    const cut = [...base].slice(0, NAME_MAX - suffix.length).join("").trimEnd();
    const n = cut + suffix;
    if (!taken(n)) return n;
  }
}

// ---------------------------------------------------------------- presets

export function loadPreset(s, i) {
  const c = char(s);
  if (i < 0 || i >= c.presets.length) return false;
  c.attack = copyAttack(c.presets[i].attack);
  c.active = i;
  return true;
}

export function savePresetAs(s, name) {
  const c = char(s);
  if (c.presets.length >= MAX_PRESETS) return false;
  const n = sanitizeName(name) || suggestPresetName(c);
  c.presets.push({ name: n, attack: copyAttack(c.attack) });
  c.active = c.presets.length - 1;
  s.seeded = false;
  return n;
}

export function updatePreset(s) {
  const c = char(s);
  if (c.active < 0 || c.active >= c.presets.length) return false;
  c.presets[c.active].attack = copyAttack(c.attack);
  s.seeded = false;
  return c.presets[c.active].name;
}

export function renamePreset(s, i, name) {
  const c = char(s);
  if (i < 0 || i >= c.presets.length) return false;
  const n = sanitizeName(name);
  if (!n) return false;
  c.presets[i].name = n;
  s.seeded = false;
  return n;
}

export function deletePreset(s, i) {
  const c = char(s);
  if (i < 0 || i >= c.presets.length) return false;
  c.presets.splice(i, 1);
  if (c.active === i) c.active = -1;
  else if (c.active > i) c.active--;
  s.seeded = false;
  return true;
}

export function movePreset(s, i, dir) {
  const c = char(s), j = i + dir;
  if (i < 0 || j < 0 || i >= c.presets.length || j >= c.presets.length) return false;
  [c.presets[i], c.presets[j]] = [c.presets[j], c.presets[i]];
  if (c.active === i) c.active = j; else if (c.active === j) c.active = i;
  s.seeded = false;
  return true;
}

// ---------------------------------------------------------------- characters

export function switchCharacter(s, i) {
  if (i < 0 || i >= s.party.length) return false;
  s.current = i;
  return true;
}

export function addCharacter(s, c) {
  if (s.party.length >= MAX_CHARACTERS) return -1;
  c.name = uniqueCharName(s.party, c.name);
  s.party.push(c);
  s.seeded = false;
  return s.party.length - 1;
}

export function deleteCharacter(s, i) {
  if (i < 0 || i >= s.party.length) return false;
  s.party.splice(i, 1);
  if (!s.party.length) s.party.push(blankCharacter("Adventurer"));
  if (s.current > i) s.current--;
  s.current = clamp(s.current, 0, s.party.length - 1);
  s.seeded = false;
  return true;
}

export function editCharacter(s, i, { name, note, color }) {
  const c = s.party[i];
  if (!c) return false;
  if (name !== undefined) {
    const n = sanitizeName(name);
    if (n) c.name = uniqueCharName(s.party, n, i);
  }
  if (note !== undefined) c.note = sanitizeName(note, NOTE_MAX);
  if (color !== undefined) c.color = clamp(color | 0, 0, DICE_COLORS.length - 1);
  s.seeded = false;
  return true;
}

export function moveCharacter(s, i, dir) {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= s.party.length || j >= s.party.length) return false;
  const cur = s.party[s.current];
  [s.party[i], s.party[j]] = [s.party[j], s.party[i]];
  s.current = s.party.indexOf(cur);
  s.seeded = false;
  return true;
}

// ---------------------------------------------------------------- validation

function int(v, lo, hi, fallback) {
  return Number.isInteger(v) ? clamp(v, lo, hi) : fallback;
}

function validPreset(p) {
  if (!p || typeof p !== "object") return null;
  const name = sanitizeName(p.name);
  if (!name) return null;
  const a = p.attack && typeof p.attack === "object" ? p.attack : null;
  if (!a) return null;
  const hasDice = Array.isArray(a.groups) ? a.groups.length > 0 : typeof a.dice === "string";
  if (!hasDice) return null;
  return { name, attack: clampAttack(a) };
}

/** Anything to a character, or null if there is nothing usable in it. */
export function validCharacter(o) {
  if (!o || typeof o !== "object") return null;
  const name = sanitizeName(o.name);
  if (!name) return null;
  const presets = [];
  for (const p of Array.isArray(o.presets) ? o.presets : []) {
    if (presets.length >= MAX_PRESETS) break;
    const v = validPreset(p);
    if (v) presets.push(v);
  }
  const attack = o.attack ? clampAttack(o.attack) : presets.length ? copyAttack(presets[0].attack) : makeAttack();
  const active = int(o.active, -1, presets.length - 1, -1);
  return {
    id: newId(), name, note: sanitizeName(typeof o.note === "string" ? o.note : "", NOTE_MAX),
    color: int(o.color, 0, DICE_COLORS.length - 1, 6), presets, active, attack,
  };
}

// ---------------------------------------------------------------- page state

export function encodeState(s) {
  return JSON.stringify({
    format: FORMAT_STATE, version: VERSION,
    situation: s.situation, ui: s.ui, current: s.current, seeded: s.seeded,
    party: s.party.map(exportChar),
  });
}

export function decodeState(text) {
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || o.format !== FORMAT_STATE || o.version !== VERSION) return null;
  const s = freshState();
  const si = o.situation || {}, ui = o.ui || {};
  s.situation = {
    ac: int(si.ac, AC_MIN, AC_MAX, 15),
    mode: int(si.mode, 0, 2, NORMAL),
    checkMod: int(si.checkMod, CHECK_MOD_MIN, CHECK_MOD_MAX, 3),
    checkDc: int(si.checkDc, 0, DC_MAX, 0),
    doubleDice: si.doubleDice === true,
  };
  s.ui = {
    tab: int(ui.tab, 0, 3, 0), sub: int(ui.sub, 0, 1, 0), pal: int(ui.pal, 0, PALETTES.length - 1, 0),
    chart: int(ui.chart, 0, 1, 0), ccdf: ui.ccdf !== false,
  };
  const party = [];
  for (const c of Array.isArray(o.party) ? o.party : []) {
    if (party.length >= MAX_CHARACTERS) break;
    const v = validCharacter(c);
    if (v) { v.name = uniqueCharName(party, v.name); party.push(v); }
  }
  if (!party.length) return null;
  s.party = party;
  s.current = int(o.current, 0, party.length - 1, 0);
  s.seeded = o.seeded === true;
  return s;
}

// ---------------------------------------------------------------- files

function exportAttack(a) {
  return { bonus: a.bonus, dice: encodeDice(a.groups), mod: a.mod, attacks: a.attacks, crit: a.crit };
}

function exportChar(c) {
  return {
    name: c.name, note: c.note, color: c.color, active: c.active,
    attack: exportAttack(c.attack),
    presets: c.presets.map(p => ({ name: p.name, attack: exportAttack(p.attack) })),
  };
}

export function characterFile(c) {
  return JSON.stringify({ format: FORMAT_CHARACTER, version: VERSION, character: exportChar(c) }, null, 2) + "\n";
}

export function partyFile(s) {
  return JSON.stringify({ format: FORMAT_PARTY, version: VERSION, characters: s.party.map(exportChar) }, null, 2) + "\n";
}

export function fileSlug(name) {
  const slug = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "character";
}

/**
 * What a file holds, before anything is added: { kind, characters } with
 * kind "character", "party" or "session", or { error } in plain words.
 */
export function parseImport(text, filename = "") {
  if (typeof text !== "string" || !text.trim()) return { error: "That file is empty." };
  if (text.length > 2_000_000) return { error: "That file is too large to be a party file." };
  const t = text.replace(/^﻿/, "");
  if (/^\s*[{[]/.test(t)) {
    let o;
    try { o = JSON.parse(t); } catch { return { error: "That file looks like JSON but it can't be read. It may be cut short." }; }
    if (o && o.format === FORMAT_CHARACTER) {
      const c = validCharacter(o.character);
      return c ? { kind: "character", characters: [c] } : { error: "That character file has no name." };
    }
    if (o && (o.format === FORMAT_PARTY || o.format === FORMAT_STATE)) {
      const list = (o.format === FORMAT_PARTY ? o.characters : o.party) || [];
      const chars = [];
      for (const c of Array.isArray(list) ? list : []) {
        const v = validCharacter(c);
        if (v) chars.push(v);
      }
      return chars.length ? { kind: "party", characters: chars } : { error: "That party file has no characters in it." };
    }
    return { error: "That JSON file isn't a Dice & Damage character or party file." };
  }
  const c = parseSession(t, filename);
  if (c) return { kind: "session", characters: [c] };
  return { error: "That file isn't a Dice & Damage character, party or session.txt file." };
}

// ---------------------------------------------------------------- session.txt
//
// The Processing prototype's and the LÖVE app's settings file: flat
// key=value lines, presets as `preset=name|bonus|dice|mod|attacks|crit`,
// numbers 0-based. Importing makes one character from its presets and its
// working attack. Exporting writes a whole session the app can load, with
// this page's situation and scheme.

function sessionWhole(kv, key, lo, hi, fallback) {
  const v = kv.get(key);
  if (v === undefined || !/^\s*-?\d+\s*$/.test(v)) return fallback;
  return clamp(parseInt(v, 10), lo, hi);
}

export function parseSession(text, filename = "") {
  const kv = new Map();
  const presetLines = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1);
    if (k === "preset") presetLines.push(v); else kv.set(k, v);
  }
  if ((kv.get("v") || "").trim() !== "1") return null;

  const presets = [];
  for (const pl of presetLines) {
    if (presets.length >= MAX_PRESETS) break;
    const f = pl.split("|");
    if (f.length !== 6) continue;
    const name = sanitizeName(f[0]);
    if (!name) continue;
    const nums = [f[1], f[3], f[4], f[5]].map(x => (/^\s*-?\d+\s*$/.test(x) ? parseInt(x, 10) : NaN));
    if (nums.some(Number.isNaN)) continue;
    const [bonus, mod, attacks, crit] = nums;
    const groups = parseDice(f[2]);
    if (!groups.length) continue;
    if (bonus < BONUS_MIN || bonus > BONUS_MAX || mod < MOD_MIN || mod > MOD_MAX) continue;
    if (attacks < ATTACKS_MIN || attacks > ATTACKS_MAX || crit < 0 || crit >= CRIT_MINS.length) continue;
    presets.push({ name, attack: { bonus, groups, mod, attacks, crit } });
  }
  const groups = parseDice(kv.get("dice"));
  const attack = clampAttack({
    bonus: sessionWhole(kv, "bonus", BONUS_MIN, BONUS_MAX, 5),
    mod: sessionWhole(kv, "mod", MOD_MIN, MOD_MAX, 3),
    attacks: sessionWhole(kv, "attacks", ATTACKS_MIN, ATTACKS_MAX, 1),
    crit: sessionWhole(kv, "crit", 0, CRIT_MINS.length - 1, 0),
    groups: groups.length ? groups : [{ n: 1, d: 8 }],
  });
  const stem = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
  const name = /^session$/i.test(stem) || !sanitizeName(stem) ? "Imported character" : sanitizeName(stem);
  return {
    id: newId(), name, note: "From the app", color: 6, presets, attack,
    active: sessionWhole(kv, "active", -1, presets.length - 1, -1),
  };
}

export function sessionText(s, c) {
  const a = c.attack, si = s.situation, ui = s.ui;
  const lines = [
    "v=1",
    `bonus=${a.bonus}`, `dice=${encodeDice(a.groups)}`, `mod=${a.mod}`,
    `attacks=${a.attacks}`, `crit=${a.crit}`,
    `ac=${si.ac}`, `mode=${si.mode}`,
    `checkmod=${si.checkMod}`, `checkdc=${si.checkDc}`, `double=${si.doubleDice ? 1 : 0}`,
    `tab=${ui.tab}`, `sub=${ui.sub}`, `pal=${ui.pal < APP_SCHEMES ? ui.pal : 0}`, `chart=${ui.chart}`, `ccdf=${ui.ccdf ? 1 : 0}`,
    `active=${c.active}`,
  ];
  for (const p of c.presets.slice(0, MAX_PRESETS)) {
    const q = p.attack;
    lines.push(`preset=${sanitizeName(p.name)}|${q.bonus}|${encodeDice(q.groups)}|${q.mod}|${q.attacks}|${q.crit}`);
  }
  return lines.join("\n") + "\n";
}

/** Adds imported characters. "replace" swaps a same-named character in
 *  place (or, for a party, the whole party); otherwise they are added with
 *  names made unique. Returns { added, replaced, skipped }. */
export function applyImport(s, characters, how = "add") {
  let added = 0, replaced = 0, skipped = 0;
  if (how === "replace-party") {
    s.party = characters.slice(0, MAX_CHARACTERS).map((c, i, arr) => ({ ...c, name: uniqueCharName(arr.slice(0, i), c.name) }));
    s.current = 0;
    s.seeded = false;
    return { added: s.party.length, replaced: 0, skipped: Math.max(0, characters.length - MAX_CHARACTERS) };
  }
  for (const c of characters) {
    const same = s.party.findIndex(p => p.name.toLowerCase() === c.name.toLowerCase());
    if (how === "replace" && same >= 0) {
      s.party[same] = { ...c, name: s.party[same].name, id: s.party[same].id };
      replaced++;
      continue;
    }
    if (addCharacter(s, c) < 0) skipped++; else added++;
  }
  s.seeded = false;
  return { added, replaced, skipped };
}
