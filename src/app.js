// app.js -- Dice & Damage for the web: four tabs that share one attack, a
// party of characters each with their own attack presets, and a 3D arena.
//
// Behaviour follows the LÖVE app: the Calculator, the Attack tab and the
// Damage tab all edit the same working attack and the same situation;
// Roll attack on the Calculator switches to the Attack tab and rolls the d20
// there; Damage on the Attack tab switches to the Damage tab and rolls the
// attack's dice, doubled after a crit. The one new thing is the party.

import * as R from "./rules.js";
import { solve, meanForAC, faceProbs, sumDist, expectedFrom } from "./damage.js";
import * as Ro from "./rolls.js";
import * as S from "./store.js";
import { PALETTES, mix, luminance, contrast } from "./palettes.js";
import { ICONS } from "./icons.js";
import { distribution, sweep, pct, dec1, scrubValue, SWEEP_LO, SWEEP_HI } from "./charts.js";
import { loadLocal, saveLocal, AccountSync } from "./persist.js";
import { Arena } from "./arena.js";

const CALC = 0, ATTACK = 1, DAMAGE = 2, PERCENT = 3;
const TAB_NAMES = ["Calculator", "Attack", "Damage", "Percent"];
const TAB_ICONS = ["calculator", "sword", "burst", "percent"];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let rng = Ro.cryptoRng();
let st, savedAt = 0, saveTimer = 0, lastSavedText = "";
const sync = new AccountSync();

// What each roll tab last threw. The arena shows the current tab's.
const views = {
  attack: { roll: null, revealed: false, recent: [] },
  check: { roll: null, revealed: false, recent: [] },
  damage: { roll: null, revealed: false, recent: [] },
  percent: { roll: null, revealed: false, recent: [] },
};
let rollingView = null;

// Interface state that is not saved.
const ui = {
  sheet: null,            // "presets" | "party" | "export" | null
  editing: null,          // presets: {kind:"new"|"rename", index, buf}; party: {index, name, note, color} | {kind:"new"}
  confirmDelete: -1,
  partyOpen: -1,          // character whose tools are showing
  partyConfirm: -1,
  importing: null,        // parsed file waiting for a choice
  scrub: -1,
  chartWidth: 400,
  exportText: null,
};

// ---------------------------------------------------------------- state

function init() {
  const local = loadLocal();
  st = (local && S.decodeState(local.state)) || S.freshState();
  savedAt = local ? local.savedAt || 0 : 0;
  lastSavedText = S.encodeState(st);
}

function commit() {
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}

function save() {
  clearTimeout(saveTimer);
  const text = S.encodeState(st);
  if (text === lastSavedText) return;
  lastSavedText = text;
  savedAt = Date.now();
  saveLocal(text, savedAt);
  sync.save(text, savedAt);
  if (window.__hook) window.__hook("saved", text);
}

async function connectAccount() {
  sync.onStatus = () => { if (ui.sheet === "party") renderSheet(); };
  if (!(await sync.connect())) return;
  await pullAccount(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullAccount(false);
  });
}

/** Adopts the account copy when it is newer than this browser's. */
async function pullAccount(first) {
  const remote = await sync.fetch();
  if (!remote) {
    if (first) { const t = S.encodeState(st); sync.save(t, savedAt || Date.now()); }
    return;
  }
  if (remote.savedAt > savedAt && remote.state !== S.encodeState(st)) {
    const s = S.decodeState(remote.state);
    if (!s) return;
    st = s;
    savedAt = remote.savedAt;
    lastSavedText = remote.state;
    saveLocal(remote.state, savedAt);
    applyTheme();
    rebuildArena();
    render();
    if (!first) toast("Party updated from your other device");
  } else if (savedAt > remote.savedAt) {
    sync.save(S.encodeState(st), savedAt);
  }
}

const C = () => S.char(st);
const A = () => S.attackOf(st);
const P = () => PALETTES[st.ui.pal];
const SI = () => st.situation;

let solCache = { sig: "", sol: null };
function sol() {
  const a = A(), s = SI();
  const sig = [a.bonus, R.encodeDice(a.groups), a.mod, a.attacks, a.crit, s.ac, s.mode].join("|");
  if (sig !== solCache.sig) solCache = { sig, sol: solve(a, s.ac, s.mode) };
  return solCache.sol;
}

function viewKey() {
  if (st.ui.tab === ATTACK) return st.ui.sub === 0 ? "attack" : "check";
  if (st.ui.tab === DAMAGE) return "damage";
  if (st.ui.tab === PERCENT) return "percent";
  return null;
}

// ---------------------------------------------------------------- theme

function applyTheme() {
  const p = P();
  const r = document.documentElement.style;
  const set = (k, v) => r.setProperty(k, v);
  set("--bg", p.bg); set("--panel", p.panel); set("--edge", p.edge); set("--ink", p.ink); set("--dim", p.inkDim);
  set("--grid", p.grid); set("--accent", p.accent); set("--accent2", p.accent2); set("--bar-lo", p.barLow);
  set("--bar-hi", p.barHigh); set("--miss", p.miss); set("--crit", p.crit); set("--fumble", p.fumble);
  set("--sunken", p.sunken);
  const dark = mix(p.bg, "#000000", 0.2);
  set("--on-accent", contrast(dark, p.accent) > contrast("#ffffff", p.accent) ? dark : "#ffffff");
  document.documentElement.style.colorScheme = p.light ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = p.bg;
  if (arena) arena.setTheme(p, S.DICE_COLORS[C().color].hex);
}

// ---------------------------------------------------------------- the arena

let arena = null;
function setupArena() {
  const canvas = $("arena");
  try {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = Math.min(innerWidth, innerHeight) < 600;
    arena = new Arena(canvas, { reducedMotion: reduced, lowPower });
  } catch (e) {
    console.warn("WebGL unavailable", e);
    arena = null;
    $("stage").classList.add("no-gl");
    return;
  }
  arena.onSettle = onSettle;
  applyTheme();
  const ro = new ResizeObserver(() => sizeArena());
  ro.observe($("stage"));
  sizeArena();
  canvas.addEventListener("pointerdown", () => {
    if (arena.rolling) arena.skip();
  });
  document.addEventListener("visibilitychange", () => { arena.visible = document.visibilityState === "visible"; });
}

function sizeArena() {
  if (!arena) return;
  const el = $("stage");
  const w = el.clientWidth, h = el.clientHeight;
  if (w < 2 || h < 2) return;
  const wide = !matchMedia("(max-width: 699px), (max-aspect-ratio: 1/1)").matches;
  const insets = wide
    ? { top: h < 640 ? 70 : 118, bottom: h < 640 ? 120 : 168, left: 0, right: 64 }
    : { top: 2, bottom: h < 300 ? 70 : 84, left: 0, right: 0, fit: 0.9 };
  arena.resize(w, h, insets);
}

function idleSpecs() {
  const a = A(), s = SI();
  const k = viewKey();
  const d20s = s.mode === R.NORMAL ? 1 : 2;
  if (k === "attack" || k === "check") return [...Array(d20s)].map(() => ({ sides: 20 }));
  if (k === "percent") return [{ sides: 10, variant: "tens", value: 0 }, { sides: 10, variant: "units", value: 0 }];
  const dice = [];
  if (k === null) dice.push({ sides: 20 });
  const mult = k === "damage" && s.doubleDice ? 2 : 1;
  for (const g of a.groups) for (let i = 0; i < g.n * mult; i++) dice.push({ sides: g.d });
  return dice.slice(0, k === null ? 9 : 12);
}

function specsFor(roll) {
  if (roll.kind === "d20") return roll.dice.map(d => ({ sides: 20, value: d.value }));
  if (roll.kind === "percent") return [{ sides: 10, variant: "tens", value: roll.tens * 10 }, { sides: 10, variant: "units", value: roll.units }];
  return roll.dice.map(d => ({ sides: d.sides, value: d.value }));
}

function effectFor(roll) {
  if (roll.kind === "d20") return { keep: roll.dice.length === 2 ? roll.keep : -1, effect: roll.crit ? "crit" : roll.fumble ? "fumble" : null };
  if (roll.kind === "percent") return { keep: -1, effect: roll.max ? "max" : null };
  return { keep: -1, effect: roll.allMax ? "max" : null };
}

let idleSig = "";
function rebuildArena(force = true) {
  if (!arena) return;
  const k = viewKey();
  const v = k && views[k];
  if (force && rollingView) {
    // Whatever was in the air lands now; its result is kept.
    finishReveal(rollingView);
    rollingView = null;
  }
  if (v && v.roll) {
    idleSig = "";
    if (force) arena.showSettled(specsFor(v.roll), effectFor(v.roll));
    return;
  }
  const specs = idleSpecs();
  const sig = k + ":" + specs.map(s => s.sides + (s.variant || "")).join(",");
  if (!force && sig === idleSig) return;
  idleSig = sig;
  arena.showIdle(specs, { ghost: k !== null });
}

function throwRoll(key, roll) {
  const v = views[key];
  if (rollingView && rollingView !== v) finishReveal(rollingView);
  v.roll = roll;
  v.revealed = false;
  rollingView = v;
  idleSig = "";
  if (arena) arena.throw(specsFor(roll), effectFor(roll));
  else onSettle();
  if (window.__hook) window.__hook("roll", { key, roll });
}

function finishReveal(v) {
  if (!v.revealed && v.roll) {
    v.revealed = true;
    const r = v.roll;
    v.recent.unshift(r.kind === "percent" ? r.total + "%" : String(r.kind === "damage" ? r.dealt : r.total));
    v.recent.length = Math.min(v.recent.length, 8);
  }
}

function onSettle() {
  const v = rollingView;
  rollingView = null;
  if (v) finishReveal(v);
  render();
  renderResult(true);
  if (window.__hook) window.__hook("settled", v && v.roll);
}

const busy = () => !!(arena && arena.rolling);

// ---------------------------------------------------------------- actions

function showTab(t) {
  if (rollingView) { if (arena) arena.skip(); finishReveal(rollingView); rollingView = null; }
  st.ui.tab = t;
  ui.scrub = -1;
  rebuildArena(true);
  commit();
}

function rollCurrent() {
  const t = st.ui.tab;
  if (t === CALC) return rollAttackFromCalculator();
  if (busy()) { arena.skip(); return; }
  const s = SI(), a = A();
  if (t === ATTACK && st.ui.sub === 0) throwRoll("attack", Ro.attack(rng, a.bonus, s.mode, R.critMin(a), s.ac));
  else if (t === ATTACK) throwRoll("check", Ro.check(rng, s.checkMod, s.mode, s.checkDc));
  else if (t === DAMAGE) throwRoll("damage", Ro.damage(rng, a.groups, a.mod, s.doubleDice));
  else throwRoll("percent", Ro.percent(rng));
  render();
}

/** Calculator or Damage -> Attack: switch, and throw a new d20 with the
 *  shared bonus, mode and AC, as an attack roll even if the tab was left on
 *  ability checks. */
function rollAttackFromCalculator() {
  st.ui.sub = 0;
  showTab(ATTACK);
  const s = SI(), a = A();
  throwRoll("attack", Ro.attack(rng, a.bonus, s.mode, R.critMin(a), s.ac));
  render();
}

/** Attack -> Damage: switch, and roll the attack's dice, doubled when the
 *  d20 was a crit. The toggle is set from the d20 so the Damage tab shows
 *  what it rolled; after a crit it stays on until turned off. */
function rollDamageFromAttack() {
  if (busy()) return;
  const r = views.attack.roll;
  SI().doubleDice = !!(r && r.crit);
  showTab(DAMAGE);
  const a = A();
  throwRoll("damage", Ro.damage(rng, a.groups, a.mod, SI().doubleDice));
  render();
}

function step(id, dir, mag = 1) {
  const a = A(), s = SI(), d = dir * mag;
  if (id === "ac") s.ac = R.clamp(s.ac + d, R.AC_MIN, R.AC_MAX);
  else if (id === "bonus") a.bonus = R.clamp(a.bonus + d, R.BONUS_MIN, R.BONUS_MAX);
  else if (id === "attacks") a.attacks = R.clamp(a.attacks + d, R.ATTACKS_MIN, R.ATTACKS_MAX);
  else if (id === "mod") a.mod = R.clamp(a.mod + d, R.MOD_MIN, R.MOD_MAX);
  else if (id === "checkmod") s.checkMod = R.clamp(s.checkMod + d, R.CHECK_MOD_MIN, R.CHECK_MOD_MAX);
  else if (id === "checkdc") s.checkDc = R.clamp(s.checkDc + d, 0, R.DC_MAX);
  else if (id.startsWith("g")) {
    const i = +id.slice(1), g = a.groups[i];
    if (g) {
      // The cap counts every die in the attack: one group grows only into
      // the room the others leave.
      const ceiling = Math.min(R.MAX_DICE, g.n + R.room(a));
      g.n = R.clamp(g.n + d, 1, Math.max(1, ceiling));
    }
  } else return;
  if (window.__hook) window.__hook("step", { id, dir });
  if (!viewKey() || !views[viewKey()].roll) rebuildArena(false);
  commit();
}

function canStep(id, dir) {
  const a = A(), s = SI();
  const lim = {
    ac: [s.ac, R.AC_MIN, R.AC_MAX],
    bonus: [a.bonus, R.BONUS_MIN, R.BONUS_MAX], attacks: [a.attacks, R.ATTACKS_MIN, R.ATTACKS_MAX],
    mod: [a.mod, R.MOD_MIN, R.MOD_MAX], checkmod: [s.checkMod, R.CHECK_MOD_MIN, R.CHECK_MOD_MAX],
    checkdc: [s.checkDc, 0, R.DC_MAX],
  }[id];
  if (lim) return dir < 0 ? lim[0] > lim[1] : lim[0] < lim[2];
  if (id.startsWith("g")) {
    const g = a.groups[+id.slice(1)];
    if (!g) return false;
    return dir < 0 ? g.n > 1 : R.room(a) > 0;
  }
  return false;
}

function act(name, arg, el) {
  const a = A(), s = SI();
  if (window.__hook) window.__hook("act", { name, arg });
  if (name !== "pdel") ui.confirmDelete = -1;
  switch (name) {
    case "tab": showTab(+arg); return;
    case "scheme":
    case "scheme-back":
      st.ui.pal = (st.ui.pal + (name === "scheme" ? 1 : PALETTES.length - 1)) % PALETTES.length;
      applyTheme();
      toast(P().name);
      break;
    case "chart": st.ui.chart = +arg; ui.scrub = -1; break;
    case "ccdf": st.ui.ccdf = !st.ui.ccdf; break;
    case "mode": s.mode = +arg; rebuildArena(false); break;
    case "crit": a.crit = +arg; break;
    case "sub":
      if (rollingView) { arena && arena.skip(); finishReveal(rollingView); rollingView = null; }
      st.ui.sub = +arg; rebuildArena(true); break;
    case "gdie": { const g = a.groups[+arg]; if (g) g.d = R.nextSize(g.d); rebuildArena(false); break; }
    case "gdel": if (a.groups.length > 1) a.groups.splice(+arg, 1); rebuildArena(false); break;
    case "gadd":
      if (a.groups.length < R.MAX_GROUPS && R.room(a) >= 1) a.groups.push({ n: 1, d: 6 });
      rebuildArena(false);
      break;
    case "double": s.doubleDice = !s.doubleDice; rebuildArena(false); break;
    case "roll": rollCurrent(); return;
    case "rolldmg": rollDamageFromAttack(); return;
    case "rollatk": if (!busy()) rollAttackFromCalculator(); return;
    case "presets": openSheet("presets"); return;
    case "party": openSheet("party"); return;
    case "char": switchChar(+arg); return;
    default: sheetAction(name, arg, el); return;
  }
  commit();
}

function switchChar(i) {
  if (i === st.current || !st.party[i]) { if (ui.sheet === "party") closeSheet(); return; }
  S.switchCharacter(st, i);
  applyTheme();
  rebuildArena(true);
  if (ui.sheet === "party") closeSheet();
  toast(`${C().name} is up`);
  commit();
}

// ---------------------------------------------------------------- sheets

function openSheet(kind) {
  ui.sheet = kind;
  ui.editing = null;
  ui.confirmDelete = -1;
  ui.partyOpen = -1;
  ui.partyConfirm = -1;
  if (kind !== "party") ui.importing = null;
  renderSheet();
  const sh = $("sheet").querySelector(".sheet");
  if (sh && !$("sheet").contains(document.activeElement)) sh.focus({ preventScroll: true });
}

function closeSheet() {
  ui.sheet = null;
  ui.editing = null;
  ui.importing = null;
  ui.exportText = null;
  renderSheet();
  render();
}

function sheetAction(name, arg, el) {
  const c = C();
  switch (name) {
    case "close": closeSheet(); return;
    case "pload":
      if (S.loadPreset(st, +arg)) { closeSheet(); toast(`Loaded ${c.presets[+arg].name}`); rebuildArena(false); }
      break;
    case "prename": ui.editing = { kind: "rename", index: +arg, buf: c.presets[+arg].name }; break;
    case "pdel":
      if (ui.confirmDelete !== +arg) { ui.confirmDelete = +arg; break; }
      { const n = c.presets[+arg].name; S.deletePreset(st, +arg); toast(`Deleted ${n}`); }
      ui.confirmDelete = -1;
      break;
    case "psave": if (c.presets.length < R.MAX_PRESETS) ui.editing = { kind: "new", buf: S.suggestPresetName(c) }; break;
    case "pupdate": { const n = S.updatePreset(st); if (n) toast(`Updated ${n}`); break; }
    case "pcommit": {
      if (!ui.editing || (ui.editing.kind !== "new" && ui.editing.kind !== "rename")) break;
      const buf = $("name-in") ? $("name-in").value : ui.editing.buf;
      if (ui.editing.kind === "new") { const n = S.savePresetAs(st, buf); if (n) toast(`Saved ${n}`); }
      else if (!S.renamePreset(st, ui.editing.index, buf)) { /* empty: keep the old name */ }
      ui.editing = null;
      break;
    }
    case "pcancel": ui.editing = null; break;
    // party
    case "cmore": ui.partyOpen = ui.partyOpen === +arg ? -1 : +arg; ui.partyConfirm = -1; ui.editing = null; break;
    case "cedit": {
      const ch = st.party[+arg];
      ui.editing = { kind: "char", index: +arg, name: ch.name, note: ch.note, color: ch.color };
      break;
    }
    case "cnew":
      if (st.party.length >= R.MAX_CHARACTERS) { toast("Twelve characters is the limit"); return; }
      ui.editing = { kind: "char", index: -1, name: "", note: "", color: (st.party.length * 3) % S.DICE_COLORS.length };
      ui.partyOpen = -1;
      break;
    case "ccolor": if (!ui.editing || ui.editing.kind !== "char") break; readEditor(); ui.editing.color = +arg; break;
    case "ccommit": {
      if (!ui.editing || ui.editing.kind !== "char") break;
      readEditor();
      const e = ui.editing;
      if (e.index < 0) {
        const nc = S.blankCharacter(R.sanitizeName(e.name) || "New character");
        nc.note = R.sanitizeName(e.note, R.NOTE_MAX);
        nc.color = e.color;
        nc.attack = R.copyAttack(A());           // start from what is on the table
        const i = S.addCharacter(st, nc);
        if (i >= 0) { S.switchCharacter(st, i); applyTheme(); rebuildArena(true); toast(`${st.party[i].name} joins the party`); }
      } else {
        S.editCharacter(st, e.index, { name: e.name, note: e.note, color: e.color });
        if (e.index === st.current) applyTheme();
      }
      ui.editing = null;
      ui.partyOpen = -1;
      break;
    }
    case "ccancel": ui.editing = null; break;
    case "cdel":
      if (ui.partyConfirm !== +arg) { ui.partyConfirm = +arg; break; }
      { const n = st.party[+arg].name; S.deleteCharacter(st, +arg); toast(`${n} has left the party`); }
      ui.partyConfirm = -1; ui.partyOpen = -1;
      applyTheme(); rebuildArena(true);
      break;
    case "cup": S.moveCharacter(st, +arg, -1); ui.partyOpen = Math.max(0, +arg - 1); break;
    case "cdown": S.moveCharacter(st, +arg, 1); ui.partyOpen = Math.min(st.party.length - 1, +arg + 1); break;
    case "cfile": { const ch = st.party[+arg]; offerFile(`${S.fileSlug(ch.name)}.json`, S.characterFile(ch), `${ch.name}'s character file`); return; }
    case "capp": { const ch = st.party[+arg]; offerFile("session.txt", S.sessionText(st, ch), `${ch.name} for the Dice & Damage app`); return; }
    case "partyfile": offerFile("dice-and-damage-party.json", S.partyFile(st), "Party file"); return;
    case "load": $("file").click(); return;
    case "imp-add": doImport("add"); return;
    case "imp-replace": doImport("replace"); return;
    case "imp-party": doImport("replace-party"); return;
    case "imp-cancel": ui.importing = null; break;
    case "copy-export": copyExport(); return;
    default: return;
  }
  renderSheet();
  commit();
}

function readEditor() {
  if (!ui.editing || ui.editing.kind !== "char") return;
  if ($("cname-in")) ui.editing.name = $("cname-in").value;
  if ($("cnote-in")) ui.editing.note = $("cnote-in").value;
}

// ---------------------------------------------------------------- files

async function offerFile(filename, text, what) {
  if (window.__hook) window.__hook("file", { filename, text });
  const c = window.claude;
  if (c && typeof c.use === "function") {
    let dl = null;
    try { dl = await c.use("downloads"); } catch { dl = null; }
    if (dl) {
      try {
        await dl.save({ filename, data: text });
        toast(`Saved ${filename}`);
      } catch (e) {
        const code = e && e.code;
        if (code === "declined") toast("Not saved");
        else if (code === "rate_limited") toast("A save is already waiting for an answer");
        else showExportText(filename, text, what);
      }
      return;
    }
    if (window.top !== window) { showExportText(filename, text, what); return; }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: filename.endsWith(".json") ? "application/json" : "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Saved ${filename}`);
  } catch {
    showExportText(filename, text, what);
  }
}

/** When a file can't be handed over, the text can still be copied. */
function showExportText(filename, text, what) {
  ui.exportText = { filename, text, what, back: ui.sheet };
  ui.sheet = "export";
  renderSheet();
}

async function copyExport() {
  const t = ui.exportText && ui.exportText.text;
  if (!t) return;
  try { await navigator.clipboard.writeText(t); toast("Copied"); }
  catch { const box = $("export-box"); if (box) { box.focus(); box.select(); } toast("Select all and copy"); }
}

function readFile(file) {
  if (!file) return;
  if (file.size > 2_000_000) { ui.importing = { error: "That file is too large to be a party file." }; openSheet("party"); return; }
  file.text().then(text => handleImportText(text, file.name)).catch(() => {
    ui.importing = { error: "That file couldn't be read." };
    if (ui.sheet !== "party") openSheet("party"); else renderSheet();
  });
}

function handleImportText(text, name) {
  const r = S.parseImport(text, name);
  ui.importing = r.error ? { error: r.error } : { ...r, filename: name };
  if (ui.sheet !== "party") { const keep = ui.importing; openSheet("party"); ui.importing = keep; }
  ui.partyOpen = -1;
  ui.editing = null;
  renderSheet();
  if (window.__hook) window.__hook("import", ui.importing);
}

function doImport(how) {
  const imp = ui.importing;
  if (!imp || !imp.characters) return;
  const before = st.party.length;
  const res = S.applyImport(st, imp.characters, how);
  ui.importing = null;
  if (how === "replace-party") { S.switchCharacter(st, 0); }
  else if (res.added && st.party.length > before) S.switchCharacter(st, st.party.length - 1);
  else if (res.replaced) S.switchCharacter(st, st.party.findIndex(c => c.name.toLowerCase() === imp.characters[0].name.toLowerCase()));
  applyTheme();
  rebuildArena(true);
  const parts = [];
  if (res.added) parts.push(`${res.added} added`);
  if (res.replaced) parts.push(`${res.replaced} replaced`);
  if (res.skipped) parts.push(`${res.skipped} left out: twelve is the limit`);
  toast(parts.join(", ") || "Nothing to add");
  renderSheet();
  commit();
}

// ---------------------------------------------------------------- rendering

function emblem(c, extra = "") {
  const hex = S.DICE_COLORS[c.color].hex;
  const light = luminance(hex) > 0.35;
  const initial = [...c.name.trim()][0] || "?";
  return `<span class="emblem${light ? " light" : ""}${extra}" style="--c:${hex}" aria-hidden="true">${esc(initial.toUpperCase())}</span>`;
}

function stepper(id, label, value) {
  return `<div class="stepper" data-stepper="${id}">
    <button type="button" data-step="${id}" data-dir="-1" aria-label="Decrease ${esc(label)}" ${canStep(id, -1) ? "" : "disabled"}>−</button>
    <output aria-live="polite" class="num">${esc(value)}</output>
    <button type="button" data-step="${id}" data-dir="1" aria-label="Increase ${esc(label)}" ${canStep(id, 1) ? "" : "disabled"}>+</button>
  </div>`;
}

function field(label, inner) {
  return `<div class="field"><span class="lbl">${esc(label)}</span>${inner}</div>`;
}

function chips(name, options, selected, label) {
  return `<div class="chips" role="radiogroup" aria-label="${esc(label)}">${options.map((o, i) =>
    `<button type="button" role="radio" aria-checked="${i === selected}" data-act="${name}" data-arg="${i}">${esc(o)}</button>`).join("")}</div>`;
}

function presetBar() {
  const c = C(), a = A();
  const has = c.active >= 0 && c.active < c.presets.length;
  const name = has ? c.presets[c.active].name : "Unsaved attack";
  const edited = S.edited(c);
  return `<button type="button" class="presetbar" data-act="presets" aria-label="Presets for ${esc(c.name)}: ${esc(name)}${edited ? ", edited" : ""}">
    <span class="pb-text">
      <span class="pb-name${has ? "" : " unsaved"}">${esc(name)}${edited ? "<em>edited</em>" : ""}</span>
      <span class="pb-sum">${esc(R.summary(a))}</span>
    </span>
    <span class="pill">${ICONS.book}Presets <span class="num">${c.presets.length}/${R.MAX_PRESETS}</span></span>
  </button>`;
}

function diceRows(title) {
  const a = A();
  const canAdd = a.groups.length < R.MAX_GROUPS && R.room(a) >= 1;
  const removable = a.groups.length > 1;
  return `<div class="dice">
    <div class="dice-head"><span class="lbl">${esc(title)} <span class="num" style="opacity:.7">· ${R.count(a.groups)}/${R.MAX_DICE}</span></span>
      <button type="button" class="pill accent" data-act="gadd" ${canAdd ? "" : "disabled"}>${ICONS.plus}Add dice</button></div>
    <div class="dice-rows">${a.groups.map((g, i) => `<div class="dice-row">
      <div class="stepper">
        <button type="button" data-step="g${i}" data-dir="-1" aria-label="Fewer d${g.d}" ${canStep("g" + i, -1) ? "" : "disabled"}>−</button>
        <button type="button" class="mid num" data-act="gdie" data-arg="${i}" aria-label="${g.n}d${g.d}: change the die size">${g.n}d${g.d}<span class="cyc">d${R.nextSize(g.d)} next</span></button>
        <button type="button" data-step="g${i}" data-dir="1" aria-label="More d${g.d}" ${canStep("g" + i, 1) ? "" : "disabled"}>+</button>
      </div>
      ${removable ? `<button type="button" class="icon-btn" data-act="gdel" data-arg="${i}" aria-label="Remove ${g.n}d${g.d}">${ICONS.cross}</button>` : ""}
    </div>`).join("")}</div></div>`;
}

function renderCalc() {
  const s = SI(), a = A(), so = sol();
  const any = so.pHit + so.pCrit;
  const chart = st.ui.chart === 0
    ? distribution(so, { scrub: ui.scrub, ccdf: st.ui.ccdf, p: P(), width: ui.chartWidth })
    : sweep(a, so, { ac: s.ac, mode: s.mode, scrub: ui.scrub, p: P(), width: ui.chartWidth });
  ui.plot = chart;
  const n = a.attacks;
  const atLeastOne = 1 - Math.pow(so.pMiss, n);
  return `${presetBar()}
  <section class="card hero" aria-label="Odds">
    <div class="hero-row">
      <div class="stat"><span class="eyebrow">Chance to hit</span>
        <span class="big num" data-k="hit">${pct(any)}</span>
        <small>each attack, against AC ${s.ac}</small></div>
      <div class="stat"><span class="eyebrow">Average damage</span>
        <span class="big num gold" data-k="avg">${dec1(so.mean)}</span>
        <small>per round${n > 1 ? `, ${n} attacks` : ""}</small></div>
    </div>
    <div class="bar" aria-hidden="true"><i style="width:${(so.pCrit * 100).toFixed(2)}%;background:var(--crit)"></i><i style="width:${(so.pHit * 100).toFixed(2)}%;background:var(--bar-hi)"></i></div>
    <p class="hero-foot num"><span><span style="color:var(--crit)">Crits ${pct(so.pCrit)}</span> · Misses ${pct(so.pMiss)}</span><span>±${dec1(so.sd)} · max ${so.max}</span></p>
    ${n > 1 ? `<p class="hero-foot num"><span>At least one of ${n} hits ${pct(atLeastOne)}</span><span>${dec1(so.mean / n)} per attack</span></p>` : ""}
    ${so.mean > 0 ? "" : `<p class="hero-foot"><span>This attack cannot deal damage</span></p>`}
  </section>
  <section class="card" aria-label="Chart">
    <div class="chart-head">${chips("chart", ["Distribution", "Damage vs AC"], st.ui.chart, "Chart")}
      ${st.ui.chart === 0 ? `<button type="button" class="ccdf" data-act="ccdf" aria-pressed="${st.ui.ccdf}">${st.ui.ccdf ? ICONS.check : ""}Cumulative</button>` : ""}</div>
    <p class="readout${ui.scrub >= 0 ? " live" : ""}" id="readout">${esc(readout())}</p>
    <svg class="plot" id="plot" viewBox="0 0 ${chart.W} ${chart.H}" preserveAspectRatio="none" role="img" aria-label="${st.ui.chart === 0 ? "Damage distribution" : "Average damage against each AC"}">${chart.svg}</svg>
  </section>
  <h3 class="sec">The situation</h3>
  <div class="grid2">${field("Enemy AC", stepper("ac", "enemy AC", s.ac))}
    ${field("On the d20", `<div class="readbox num">${esc(needShort(a.bonus, s.ac, R.critMin(a)))}</div>`)}</div>
  ${field("Roll mode", chips("mode", R.MODE_NAMES, s.mode, "Roll mode"))}
  <h3 class="sec">Your attack <small>saved with presets</small></h3>
  <div class="grid2">${field("Attack bonus", stepper("bonus", "attack bonus", R.signed(a.bonus)))}${field("Attacks per round", stepper("attacks", "attacks per round", a.attacks))}</div>
  ${diceRows("Damage dice")}
  <div class="grid2">${field("Damage bonus", stepper("mod", "damage bonus", R.signed(a.mod)))}${field("Crit range", chips("crit", R.CRIT_LABELS, a.crit, "Crit range"))}</div>
  <p class="kbd"><kbd>1</kbd>–<kbd>4</kbd> tabs · <kbd>space</kbd> roll · <kbd>p</kbd> presets · <kbd>k</kbd> party · <kbd>[</kbd> <kbd>]</kbd> characters · <kbd>r</kbd> new attack · <kbd>n</kbd> <kbd>a</kbd> <kbd>v</kbd> mode · <kbd>c</kbd> colours</p>`;
}

function readout() {
  const so = sol(), a = A();
  if (ui.scrub >= 0 && st.ui.chart === 0) {
    return `Exactly ${ui.scrub}: ${pct(so.exactly(ui.scrub))}   ·   ${ui.scrub} or more: ${pct(so.atLeast(ui.scrub))}`;
  }
  if (ui.scrub >= 0) {
    return `AC ${ui.scrub}:  disadv. ${dec1(meanForAC(a, so, ui.scrub, 0))} · normal ${dec1(meanForAC(a, so, ui.scrub, 1))} · adv. ${dec1(meanForAC(a, so, ui.scrub, 2))}`;
  }
  return st.ui.chart === 0 ? "Drag across the chart to read the odds of any total" : "Drag across the chart to compare roll modes at any AC";
}

function renderAttack() {
  const s = SI(), a = A(), atk = st.ui.sub === 0;
  return `<div class="subs" role="tablist" aria-label="Kind of roll">
      <button type="button" role="tab" aria-selected="${atk}" data-act="sub" data-arg="0">Attack roll</button>
      <button type="button" role="tab" aria-selected="${!atk}" data-act="sub" data-arg="1">Ability check</button></div>
    ${atk ? presetBar() : `<p class="note">An ability check or saving throw. Its modifier and DC are kept apart from the attack, so a Dex check never edits the longsword.</p>`}
    ${field("Roll mode", chips("mode", R.MODE_NAMES, s.mode, "Roll mode"))}
    ${atk
      ? `<div class="grid2">${field("Attack bonus", stepper("bonus", "attack bonus", R.signed(a.bonus)))}${field("Target AC", stepper("ac", "target AC", s.ac))}</div>
         <p class="note num">${esc(needLine(a.bonus, s.ac, R.critMin(a)))} · hits ${pct(sol().pHit + sol().pCrit)} · crits ${pct(sol().pCrit)}</p>`
      : `<div class="grid2">${field("Modifier", stepper("checkmod", "modifier", R.signed(s.checkMod)))}${field("Target DC", stepper("checkdc", "target DC", s.checkDc === 0 ? "Off" : s.checkDc))}</div>
         ${s.checkDc ? `<p class="note num">${esc(checkLine(s.checkMod, s.checkDc, s.mode))}</p>` : ""}`}
    ${history(atk ? "attack" : "check", atk ? "Recent attack totals" : "Recent checks")}`;
}

function needShort(bonus, ac, critFrom) {
  const need = ac - bonus;
  if (need <= 2) return "Any roll but 1";
  if (need >= critFrom) return critFrom === 20 ? "Only a 20" : `Only ${critFrom}–20`;
  return `${need} or more`;
}

function needLine(bonus, ac, critFrom) {
  const need = ac - bonus;
  if (need <= 2) return "Hits on anything but a natural 1";
  if (need >= critFrom) return `Only a natural ${critFrom === 20 ? "20" : critFrom + "–20"} hits`;
  return `Needs ${need} or more on the d20`;
}

function checkLine(mod, dc, mode) {
  const need = dc - mod;
  if (need <= 1) return "Passes on any roll";
  if (need > 20) return "Can't pass this DC";
  const f = faceProbs(mode);
  let p = 0;
  for (let k = need; k <= 20; k++) p += f[k];
  return `Needs ${need} or more on the d20 · passes ${pct(p)}`;
}

function damageLine(a, doubled) {
  const mult = doubled ? 2 : 1;
  const n = R.count(a.groups) * mult;
  let lo = n + a.mod, hi = a.mod;
  for (const g of a.groups) hi += g.n * mult * g.d;
  const mean = expectedFrom(sumDist(a.groups, mult), a.mod);        // never below 0, exactly
  return `Averages ${dec1(Math.max(0, mean))}, from ${Math.max(0, lo)} to ${Math.max(0, hi)}${doubled ? " with the dice doubled" : ""}`;
}

function renderDamage() {
  const s = SI(), a = A();
  return `${presetBar()}
    ${diceRows("Damage dice")}
    <div class="grid2">${field("Damage bonus", stepper("mod", "damage bonus", R.signed(a.mod)))}
      ${field("On a crit", `<button type="button" class="toggle" data-act="double" aria-pressed="${s.doubleDice}">${s.doubleDice ? ICONS.check : ""}Double the dice</button>`)}</div>
    <p class="note num">${esc(damageLine(a, s.doubleDice))}</p>
    ${history("damage", "Recent damage")}`;
}

function renderPercent() {
  return `<section class="card"><span class="lbl">Percentile</span>
    <p class="note">One d100, thrown as a tens die and a units die. Read them together: <em>40</em> and <em>7</em> is 47, and <em>00</em> with <em>0</em> is 100.</p></section>
    ${history("percent", "Recent rolls")}`;
}

function history(key, title) {
  const r = views[key].recent;
  if (!r.length) return "";
  return `<section aria-label="${esc(title)}"><span class="lbl">${esc(title)}</span><ul class="history">${r.map(v => `<li>${esc(v)}</li>`).join("")}</ul></section>`;
}

function renderActions() {
  const t = st.ui.tab, b = busy();
  let h;
  if (t === CALC) h = `<button type="button" class="btn primary" data-act="roll">${ICONS.sword}Roll attack</button>`;
  else if (t === ATTACK && st.ui.sub === 0) {
    const r = views.attack.roll, crit = r && r.crit && views.attack.revealed;
    h = `<button type="button" class="btn ${b ? "busy" : "primary"}" data-act="roll">${ICONS.sword}${b ? "Skip" : "Roll attack"}</button>
      <button type="button" class="btn narrow ${crit ? "critb" : "outline"}" data-act="rolldmg" ${b ? "disabled" : ""}>${ICONS.burst}${crit ? "Crit damage" : "Damage"}</button>`;
  } else if (t === ATTACK) h = `<button type="button" class="btn ${b ? "busy" : "primary"}" data-act="roll">${ICONS.sword}${b ? "Skip" : "Roll check"}</button>`;
  else if (t === DAMAGE) h = `<button type="button" class="btn ${b ? "busy" : "primary"}" data-act="roll">${ICONS.burst}${b ? "Skip" : "Roll damage"}</button>
      <button type="button" class="btn narrow outline" data-act="rollatk" ${b ? "disabled" : ""}>${ICONS.sword}Roll attack</button>`;
  else h = `<button type="button" class="btn ${b ? "busy" : "primary"}" data-act="roll">${ICONS.percent}${b ? "Skip" : "Roll"}</button>`;
  const el = $("actions");
  if (el.innerHTML !== h) el.innerHTML = h;
}

function verdict(r) {
  if (r.kind === "d20" && r.isAttack) {
    if (r.crit) return ["Critical hit", "crit"];
    if (r.fumble) return ["Critical fail", "fumble"];
    return [(r.success ? "Hits AC " : "Misses AC ") + r.target, r.success ? "" : "dim"];
  }
  if (r.kind === "d20") {
    if (r.crit) return ["Natural 20", "crit"];
    if (r.fumble) return ["Natural 1", "fumble"];
    if (r.judged) return [(r.success ? "Passes DC " : "Fails DC ") + r.target, r.success ? "" : "dim"];
    return ["", ""];
  }
  if (r.kind === "percent") return r.max ? ["Maximum", "crit"] : r.min ? ["Minimum", "fumble"] : ["", ""];
  if (r.allMax) return ["Maximum damage", "crit"];
  if (r.doubled) return ["Critical damage", ""];
  return ["", ""];
}

function renderResult(pop = false) {
  const el = $("result");
  const k = viewKey();
  const v = k && views[k];
  const recent = v && v.recent.length > (v.revealed ? 1 : 0)
    ? `<p class="recent">Recent <b>${v.recent.slice(v.revealed ? 1 : 0, 7).map(esc).join(" · ")}</b></p>` : "";
  let h = "", cls = "result";
  if (!k) {
    const a = A();
    h = `<p class="expr">${esc(Ro.d20Expression(a.bonus, SI().mode))} · ${esc(R.damageText(a))}</p>
      <p class="hint">Roll attack throws this d20 on the Attack tab</p>`;
  } else if (!v.roll) {
    const hint = { attack: "Tap Roll attack to throw the d20", check: "Tap Roll check to throw the d20", damage: "Tap Roll damage to throw the dice", percent: "Tap Roll to throw the percentile dice" }[k];
    const s = SI(), a = A();
    const expr = k === "attack" ? Ro.d20Expression(a.bonus, s.mode) + `  vs AC ${s.ac}`
      : k === "check" ? Ro.d20Expression(s.checkMod, s.mode) + (s.checkDc ? `  vs DC ${s.checkDc}` : "")
      : k === "damage" ? R.damageText(a, s.doubleDice) : "d100";
    h = `<p class="expr">${esc(expr)}</p><p class="hint">${hint}</p>${recent}`;
  } else if (!v.revealed) {
    h = `<p class="expr">${esc(v.roll.expr)}</p><p class="verdict">&nbsp;</p>`;
  } else {
    const r = v.roll;
    const [vt, vc] = verdict(r);
    if (vc) cls += " " + vc;
    let total, detail = "";
    if (r.kind === "d20") {
      total = String(r.total);
      detail = r.dice.length === 2 ? `kept ${r.natural}, dropped ${r.dice[1 - r.keep].value}` : `rolled ${r.natural}${r.mod ? (r.mod > 0 ? ` + ${r.mod}` : ` − ${-r.mod}`) : ""}`;
    } else if (r.kind === "percent") {
      total = r.total + "%";
      detail = `${String(r.tens * 10).padStart(2, "0")} and ${r.units}`;
    } else {
      total = String(r.dealt);
      detail = `dice ${r.sum}${r.mod ? (r.mod > 0 ? ` + ${r.mod}` : ` − ${-r.mod}`) : ""}${r.total < 0 ? ", never below 0" : ""}`;
    }
    h = `<p class="expr">${esc(r.expr)}</p><p class="verdict">${esc(vt) || "&nbsp;"}</p>
      <p class="total${pop ? " pop" : ""}">${esc(total)}</p><p class="detail">${esc(detail)}</p>${recent}`;
  }
  el.className = cls;
  el.innerHTML = h;
}

function renderChrome() {
  const c = C(), p = P();
  $("app").className = `app t${st.ui.tab}`;
  $("who").innerHTML = `${emblem(c)}<span class="who-text"><span class="who-eyebrow">Dice &amp; Damage</span><span class="who-name">${esc(c.name)}</span><span class="who-note">${esc(c.note || `${c.presets.length} ${c.presets.length === 1 ? "preset" : "presets"}`)}</span></span><span class="chev">${ICONS.chevron}</span>`;
  $("who").setAttribute("aria-label", `Party: ${c.name} is up. Choose a character`);
  $("scheme").innerHTML = `<i style="background:${p.accent}"></i><i style="background:${p.crit}"></i><i style="background:${p.barHigh}"></i>`;
  $("scheme").setAttribute("aria-label", `Colour scheme: ${p.name}. Next scheme`);
  $("scheme").title = p.name;
  $("tabs").innerHTML = TAB_ICONS.map((ic, i) =>
    `<button type="button" role="tab" aria-selected="${st.ui.tab === i}" aria-label="${TAB_NAMES[i]}" title="${TAB_NAMES[i]} (${i + 1})" data-act="tab" data-arg="${i}">${ICONS[ic]}</button>`).join("");
  $("rail").innerHTML = st.party.map((ch, i) =>
    `<button type="button" class="rail-btn" data-act="char" data-arg="${i}" aria-current="${i === st.current}" aria-label="${esc(ch.name)}">${emblem(ch)}<span class="rl">${esc(ch.name)}</span></button>`).join("")
    + `<button type="button" class="rail-more" data-act="party" aria-label="Party" title="Party (k)">${ICONS.party}</button>`;
  const has = c.active >= 0 && c.active < c.presets.length;
  $("mast-sub").innerHTML = `<b>${esc(c.name)}</b> · ${esc(has ? c.presets[c.active].name : "unsaved attack")}${S.edited(c) ? " (edited)" : ""}`;
}

let lastBody = "";
function render() {
  renderChrome();
  const t = st.ui.tab;
  const body = t === CALC ? renderCalc() : t === ATTACK ? renderAttack() : t === DAMAGE ? renderDamage() : renderPercent();
  const sc = $("scroll");
  if (body !== lastBody) {
    const focusKey = focusSig(document.activeElement);
    sc.innerHTML = body;
    lastBody = body;
    if (focusKey) { const el = sc.querySelector(focusKey); if (el) el.focus({ preventScroll: true }); }
    reapplyHeld();
  }
  renderActions();
  renderResult(false);
  if (ui.sheet) renderSheet();
}

function focusSig(el) {
  if (!el || !$("scroll").contains(el)) return null;
  if (el.dataset.step) return `[data-step="${el.dataset.step}"][data-dir="${el.dataset.dir}"]`;
  if (el.dataset.act) return `[data-act="${el.dataset.act}"]${el.dataset.arg !== undefined ? `[data-arg="${el.dataset.arg}"]` : ""}`;
  return null;
}

// ---------------------------------------------------------------- sheet markup

function renderSheet() {
  const wrap = $("sheet");
  if (!ui.sheet) { wrap.hidden = true; wrap.innerHTML = ""; ui.lastSheetKind = null; return; }
  wrap.hidden = false;
  const focusKey = wrap.contains(document.activeElement) ? sheetFocusSig(document.activeElement) : null;
  const typing = document.activeElement && document.activeElement.tagName === "INPUT" && wrap.contains(document.activeElement);
  const kindKey = ui.sheet + JSON.stringify(ui.editing && { k: ui.editing.kind, i: ui.editing.index });
  const changed = kindKey !== ui.lastSheetKind;
  // Never rebuild under someone typing.
  if (typing && !changed) return;
  ui.lastSheetKind = kindKey;
  const body = wrap.querySelector(".sheet-body");
  const scrollTop = body ? body.scrollTop : 0;
  wrap.innerHTML = ui.sheet === "presets" ? presetsSheet() : ui.sheet === "party" ? partySheet() : exportSheet();
  const nb = wrap.querySelector(".sheet-body");
  if (nb && !changed) nb.scrollTop = scrollTop;
  const auto = wrap.querySelector("[autofocus]");
  if (auto && changed) { auto.focus(); if (auto.select) auto.select(); }
  else if (focusKey) { const el = wrap.querySelector(focusKey); if (el) el.focus({ preventScroll: true }); }
}

function sheetFocusSig(el) {
  if (!el || !el.dataset || !el.dataset.act) return null;
  return `[data-act="${el.dataset.act}"]${el.dataset.arg !== undefined ? `[data-arg="${el.dataset.arg}"]` : ""}`;
}

function presetsSheet() {
  const c = C(), n = c.presets.length, e = ui.editing;
  const room = n < R.MAX_PRESETS, edited = S.edited(c);
  let editor = "";
  if (e && (e.kind === "new" || e.kind === "rename")) {
    editor = `<form class="editor" data-form="pcommit">
      <label class="lbl" for="name-in">${e.kind === "new" ? "Name the new preset" : `Rename ${esc(c.presets[e.index].name)}`}</label>
      <input class="text-in" id="name-in" maxlength="60" autocomplete="off" value="${esc(e.buf)}" autofocus>
      <div class="editor-acts"><button type="button" class="btn outline" data-act="pcancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
    </form>`;
  }
  const rows = c.presets.map((p, i) => `<div class="row${i === c.active ? " active" : ""}">
      <button type="button" class="main" data-act="pload" data-arg="${i}">
        <span class="r-text"><span class="r-name">${esc(p.name)}</span><span class="r-sub">${esc(R.summary(p.attack))}</span></span></button>
      <span class="acts">${ui.confirmDelete === i
        ? `<button type="button" class="icon-btn danger" data-act="pdel" data-arg="${i}">Delete</button>`
        : `<button type="button" class="icon-btn" data-act="prename" data-arg="${i}" aria-label="Rename ${esc(p.name)}">${ICONS.pencil}</button>
           <button type="button" class="icon-btn" data-act="pdel" data-arg="${i}" aria-label="Delete ${esc(p.name)}">${ICONS.cross}</button>`}</span>
    </div>`).join("");
  const foot = e ? "" : `<div class="sheet-foot">
      <button type="button" class="btn primary" data-act="psave" ${room ? "" : "disabled"}>${ICONS.plus}${room ? "Save as new" : "Eight presets is the limit"}</button>
      ${edited ? `<button type="button" class="btn outline" data-act="pupdate">Update ${esc(c.presets[c.active].name)}</button>` : ""}
    </div>`;
  return `<div class="sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-head">${emblem(c)}<div class="grow"><h2 id="sheet-title">${esc(c.name)}’s attacks</h2><p class="num">${n} of ${R.MAX_PRESETS} presets · tap one to load it</p></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICONS.close}</button></div>
    <div class="sheet-body">${editor}${n ? rows : `<p class="empty">No presets yet. Save the attack you are editing to reuse it on every tab.</p>`}</div>
    ${foot}</div>`;
}

function partySheet() {
  const e = ui.editing && ui.editing.kind === "char" ? ui.editing : null;
  const imp = ui.importing;
  let top = "";
  if (imp) {
    if (imp.error) top = `<div class="import-card"><p class="err">${esc(imp.error)}</p><div class="editor-acts" style="margin-top:10px"><button type="button" class="btn outline" data-act="imp-cancel">OK</button></div></div>`;
    else {
      const chars = imp.characters;
      const same = chars.length === 1 && st.party.some(c => c.name.toLowerCase() === chars[0].name.toLowerCase());
      const what = imp.kind === "party" ? `a party of ${chars.length}: ${chars.map(c => c.name).join(", ")}`
        : `${chars[0].name}, with ${chars[0].presets.length} ${chars[0].presets.length === 1 ? "preset" : "presets"}${imp.kind === "session" ? " (from the app’s session.txt)" : ""}`;
      top = `<div class="import-card"><p><b>${esc(imp.filename || "File")}</b> holds ${esc(what)}.</p>
        <div class="editor-acts">
          ${imp.kind === "party"
            ? `<button type="button" class="btn primary" data-act="imp-add">Add all</button><button type="button" class="btn outline" data-act="imp-party">Replace the party</button>`
            : `<button type="button" class="btn primary" data-act="imp-add">${same ? "Add as a new character" : "Add to the party"}</button>${same ? `<button type="button" class="btn outline" data-act="imp-replace">Replace ${esc(chars[0].name)}</button>` : ""}`}
          <button type="button" class="btn outline" data-act="imp-cancel">Cancel</button></div></div>`;
    }
  }
  const editor = ch => `<form class="editor" data-form="ccommit">
      <div><label class="lbl" for="cname-in">Name</label><input class="text-in" id="cname-in" maxlength="60" autocomplete="off" value="${esc(ch.name)}" placeholder="New character" autofocus></div>
      <div><label class="lbl" for="cnote-in">Class and level, or a note</label><input class="text-in" id="cnote-in" maxlength="60" autocomplete="off" value="${esc(ch.note)}" placeholder="Ranger 3"></div>
      <div><span class="lbl">Dice</span><div class="swatches" role="radiogroup" aria-label="Dice colour">${S.DICE_COLORS.map((d, i) =>
        `<button type="button" role="radio" aria-checked="${i === ch.color}" aria-label="${d.name}" title="${d.name}" data-act="ccolor" data-arg="${i}" style="background:${d.hex}"></button>`).join("")}</div></div>
      <div class="editor-acts"><button type="button" class="btn outline" data-act="ccancel">Cancel</button><button type="submit" class="btn primary">${ch.index < 0 ? "Add character" : "Save"}</button></div>
    </form>`;
  const rows = st.party.map((c, i) => {
    if (e && e.index === i) return editor(e);
    const open = ui.partyOpen === i;
    const names = c.presets.map(p => p.name).join(", ");
    return `<div class="row${i === st.current ? " active" : ""}">
      <button type="button" class="main" data-act="char" data-arg="${i}" aria-label="${esc(c.name)}${i === st.current ? ", current" : ""}">${emblem(c)}
        <span class="r-text">${i === st.current ? `<span class="r-tag">Up now</span>` : ""}<span class="r-name">${esc(c.name)}</span>
          <span class="r-sub">${esc(c.note ? c.note + " · " : "")}${c.presets.length ? esc(names) : "No presets yet"}</span></span></button>
      <span class="acts"><button type="button" class="icon-btn" data-act="cmore" data-arg="${i}" aria-expanded="${open}" aria-label="More for ${esc(c.name)}">${ICONS.more}</button></span>
    </div>${open ? `<div class="row-tools">
      <button type="button" class="pill" data-act="cedit" data-arg="${i}">${ICONS.pencil}Edit</button>
      <button type="button" class="pill" data-act="cfile" data-arg="${i}">${ICONS.download}Save file</button>
      <button type="button" class="pill" data-act="capp" data-arg="${i}" title="A session.txt for the Android app">${ICONS.phone}For the app</button>
      ${i > 0 ? `<button type="button" class="pill" data-act="cup" data-arg="${i}" aria-label="Move up">${ICONS.up}</button>` : ""}
      ${i < st.party.length - 1 ? `<button type="button" class="pill" data-act="cdown" data-arg="${i}" aria-label="Move down">${ICONS.down}</button>` : ""}
      <button type="button" class="pill warn${ui.partyConfirm === i ? " danger-on" : ""}" data-act="cdel" data-arg="${i}">${ICONS.cross}${ui.partyConfirm === i ? `Delete ${esc(c.name)}` : "Delete"}</button>
    </div>` : ""}`;
  }).join("");
  const newEditor = e && e.index < 0 ? editor(e) : "";
  const where = sync.status === "account" ? "Saved to your Claude account, so the same party opens wherever you sign in."
    : sync.status === "connecting" ? "Connecting to your account…"
    : sync.status === "error" ? "Saved in this browser only: the account copy couldn’t be written. Save a party file to keep a copy."
    : "Saved in this browser. Save a party file to keep a copy or move it to another device.";
  return `<div class="sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-head"><div class="grow"><h2 id="sheet-title">The party</h2><p class="num">${st.party.length} of ${R.MAX_CHARACTERS} characters · each keeps up to ${R.MAX_PRESETS} attack presets</p></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICONS.close}</button></div>
    <div class="sheet-body">${top}${newEditor}${rows}</div>
    <div class="sheet-foot">
      <button type="button" class="btn primary" data-act="cnew" ${st.party.length >= R.MAX_CHARACTERS ? "disabled" : ""}>${ICONS.plus}New character</button>
      <button type="button" class="btn outline" data-act="load">${ICONS.upload}Load file</button>
      <button type="button" class="btn outline" data-act="partyfile">${ICONS.download}Save party</button>
      <p class="sheet-msg">${st.seeded ? "<b>Brannoc, Vex and Sister Ilse are examples:</b> edit them, delete them, or add your own. " : ""}${where} Load file takes a character or party file, or the app’s <span class="num">session.txt</span>.</p>
    </div></div>`;
}

function exportSheet() {
  const x = ui.exportText;
  return `<div class="sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-head"><div class="grow"><h2 id="sheet-title">${esc(x.what)}</h2><p>This view can’t save files. Copy the text and save it as <b class="num">${esc(x.filename)}</b>.</p></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICONS.close}</button></div>
    <div class="sheet-body"><textarea class="copybox" id="export-box" readonly>${esc(x.text)}</textarea></div>
    <div class="sheet-foot"><button type="button" class="btn primary" data-act="copy-export">Copy</button></div></div>`;
}

// ---------------------------------------------------------------- toast

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
  if (window.__hook) window.__hook("toast", msg);
}

// ---------------------------------------------------------------- input

// A press on a stepper: a tap steps once on release; held, it repeats after
// 0.45 s and speeds up, in fives for damage to deal. Tracked by id rather
// than element, so a re-render under the finger can't lose the press.
let held = null;
function startHold(id, dir, pointerId) {
  stopHold();
  held = { id, dir, pointerId, repeated: false, n: 0 };
  held.timer = setTimeout(function rep() {
    if (!held) return;
    if (!canStep(held.id, held.dir)) { held.repeated = true; return; }
    held.repeated = true;
    held.n++;
    step(held.id, held.dir, 1);
    held.timer = setTimeout(rep, Math.max(45, 140 - held.n * 8));
  }, 450);
  reapplyHeld();
}
function stopHold() {
  if (held) clearTimeout(held.timer);
  held = null;
  document.querySelectorAll(".stepper button.down").forEach(b => b.classList.remove("down"));
}
function reapplyHeld() {
  if (!held) return;
  const b = document.querySelector(`[data-step="${held.id}"][data-dir="${held.dir}"]`);
  if (b) b.classList.add("down");
}

let press = null;      // where the pointer went down, to tell taps from scrolls
let scrubbing = false;

function bindInput() {
  document.addEventListener("pointerdown", e => {
    const stepBtn = e.target.closest("[data-step]");
    if (stepBtn && !stepBtn.disabled && e.button === 0) {
      press = { x: e.clientX, y: e.clientY, id: e.pointerId };
      startHold(stepBtn.dataset.step, +stepBtn.dataset.dir, e.pointerId);
      return;
    }
    const plot = e.target.closest("#plot");
    if (plot && e.button === 0) {
      scrubbing = true;
      scrubAt(e.clientX);
      e.preventDefault();
    }
  });
  window.addEventListener("pointermove", e => {
    if (scrubbing) { scrubAt(e.clientX); return; }
    if (held && press && e.pointerId === press.id) {
      // Leaving the button (with some slop) cancels the press.
      const b = document.querySelector(`[data-step="${held.id}"][data-dir="${held.dir}"]`);
      if (!b) return;
      const r = b.getBoundingClientRect(), slop = 14;
      if (e.clientX < r.left - slop || e.clientX > r.right + slop || e.clientY < r.top - slop || e.clientY > r.bottom + slop) { stopHold(); press = null; }
    }
  });
  const up = e => {
    if (scrubbing) { scrubbing = false; ui.scrub = -1; render(); return; }
    if (held && press && e.pointerId === press.id) {
      const h = held;
      stopHold();
      press = null;
      if (e.type === "pointerup" && !h.repeated && canStep(h.id, h.dir)) step(h.id, h.dir, 1);
    }
  };
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("blur", () => { stopHold(); press = null; scrubbing = false; });

  document.addEventListener("click", e => {
    const stepBtn = e.target.closest("[data-step]");
    if (stepBtn) {
      // Keyboard activation arrives as a click with no pointer press.
      if (e.detail === 0 && !stepBtn.disabled) step(stepBtn.dataset.step, +stepBtn.dataset.dir, 1);
      return;
    }
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled) {
      act(b.dataset.act, b.dataset.arg, b);
      return;
    }
    if (e.target === $("sheet")) closeSheet();
  });
  document.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target.closest("[data-form]");
    if (f) sheetAction(f.dataset.form);
  });
  document.addEventListener("input", e => {
    if (e.target.id === "name-in" && ui.editing) ui.editing.buf = e.target.value;
    if (e.target.id === "cname-in" || e.target.id === "cnote-in") readEditor();
  });

  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "Escape") {
      if (ui.sheet) {
        e.preventDefault();
        if (ui.editing) { ui.editing = null; renderSheet(); }
        else if (ui.importing) { ui.importing = null; renderSheet(); }
        else closeSheet();
      }
      return;
    }
    if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (ui.sheet) {
      if (e.key === "p" && ui.sheet === "presets") closeSheet();
      if (e.key === "k" && ui.sheet === "party") closeSheet();
      return;          // keys behind the sheet do nothing
    }
    const onButton = tag === "button";
    if (e.key >= "1" && e.key <= "4") act("tab", String(+e.key - 1));
    else if ((e.key === " " || e.key === "Enter") && !onButton) { e.preventDefault(); act("roll"); }
    else if (e.key === "c") act("scheme");
    else if (e.key === "C") act("scheme-back");
    else if (e.key === "r" && !busy()) rollAttackFromCalculator();
    else if (e.key === "p" && (st.ui.tab !== ATTACK || st.ui.sub === 0) && st.ui.tab !== PERCENT) openSheet("presets");
    else if (e.key === "k") openSheet("party");
    else if (e.key === "[" || e.key === "]") {
      const n = st.party.length;
      if (n > 1) switchChar((st.current + (e.key === "]" ? 1 : n - 1)) % n);
    }
    else if (e.key === "n") act("mode", "1");
    else if (e.key === "a") act("mode", "2");
    else if (e.key === "v") act("mode", "0");
  });

  $("file").addEventListener("change", e => {
    readFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });
  let dragDepth = 0;
  window.addEventListener("dragenter", e => { if (hasFiles(e)) { dragDepth++; $("drop").classList.add("on"); e.preventDefault(); } });
  window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("drop").classList.remove("on"); });
  window.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $("drop").classList.remove("on");
    readFile(e.dataTransfer.files[0]);
  });
  document.addEventListener("paste", e => {
    if (ui.sheet !== "party" || (e.target.tagName || "").toLowerCase() === "input") return;
    const t = e.clipboardData && e.clipboardData.getData("text");
    if (t && t.trim()) { e.preventDefault(); handleImportText(t, "Pasted text"); }
  });

  const ro = new ResizeObserver(() => {
    const w = Math.round($("scroll").clientWidth - 36 - 34);
    if (w > 100 && Math.abs(w - ui.chartWidth) > 2) { ui.chartWidth = w; if (st.ui.tab === CALC) render(); }
  });
  ro.observe($("scroll"));
  addEventListener("resize", sizeArena);
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
}

function hasFiles(e) {
  return e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
}

function scrubAt(clientX) {
  const svg = $("plot");
  if (!svg || !ui.plot) return;
  const r = svg.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * ui.plot.W;
  const v = scrubValue(st.ui.chart, sol(), ui.plot.px, ui.plot.pw, x);
  if (v !== ui.scrub) { ui.scrub = v; render(); }
}

// ---------------------------------------------------------------- start

export async function start() {
  init();
  applyTheme();
  bindInput();
  render();
  try { await document.fonts.load('700 64px "Cinzel"'); } catch { /* fallback serif */ }
  setupArena();
  rebuildArena(true);
  render();
  connectAccount();
  window.__app = { get st() { return st; }, views, ui, act, step, sheetAction, render, rollCurrent, save, PALETTES,
    setRng: f => { rng = f; }, handleImportText, sol, S, R, Ro };
}
