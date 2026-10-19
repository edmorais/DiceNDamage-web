// node test/logic.mjs -- rules, exact math, rolls and every file format.
// Expected values come from the 5e rules and hand arithmetic, not from the
// code under test.

import * as R from "../src/rules.js";
import * as D from "../src/damage.js";
import * as Ro from "../src/rolls.js";
import * as S from "../src/store.js";

let checks = 0, fails = 0;
function ok(c, msg) {
  checks++;
  if (!c) { fails++; console.log("FAIL:", msg); }
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const scripted = vals => { let i = 0; return (lo, hi) => Math.max(lo, Math.min(hi, vals[i++ % vals.length])); };

// ---------------------------------------------------------------- rules
ok(R.nextSize(20) === 4 && R.nextSize(8) === 10, "die size cycle");
ok(R.diceText([{ n: 2, d: 8 }, { n: 1, d: 6 }], true) === "4d8 + 2d6", "doubled dice text");
ok(R.modText(-3) === " − 3" && R.modText(0) === "", "mod text");
ok(R.signed(5) === "+5" && R.signed(-2) === "−2" && R.signed(0) === "0", "signed");
ok(JSON.stringify(R.parseDice("2d8+1d6")) === '[{"n":2,"d":8},{"n":1,"d":6}]', "parse dice");
ok(R.parseDice("2d7+1d6").length === 1, "illegal size dropped, rest kept");
ok(R.parseDice("10d6+6d8").length === 0, "more than 15 dice refused");
ok(R.parseDice("1d4+1d4+1d4+1d4+1d4+1d4").length === 5, "groups capped at 5");
ok(R.parseDice("abc").length === 0 && R.parseDice(null).length === 0, "garbage dice");
ok(R.sanitizeName("  Espada   longa  ") === "Espada longa", "whitespace collapsed");
ok(R.sanitizeName("a|b=c\u0007d") === "abcd", "delimiters and controls removed");
const emoji = "🗡️".repeat(30);
ok(R.codePoints(R.sanitizeName(emoji)) <= 24, "name cut to 24 code points");
ok(!/[\ud800-\udbff]$/.test(R.sanitizeName("x".repeat(23) + "🐉🐉")), "no split surrogate");
ok(R.sanitizeName("\ud800abc") === "abc", "lone surrogate dropped");

const big = R.clampAttack({ bonus: 99, mod: -99, attacks: 9, crit: 7, groups: [{ n: 20, d: 6 }, { n: 3, d: 8 }] });
ok(big.bonus === 20 && big.mod === -10 && big.attacks === 4 && big.crit === 2, "attack clamped");
ok(R.count(big.groups) === 15, "dice clamped to 15");
ok(R.clampAttack(null).groups[0].d === 8, "null attack gets defaults");
ok(R.clampAttack({ groups: [{ n: "x", d: 7 }] }).groups.length === 1, "bad groups replaced by 1d8");
ok(R.summary(R.makeAttack(8, "2d6", 5, 2, 1)) === "+8 to hit, 2d6 + 5, 2 attacks, crit 19–20", "summary");

// ---------------------------------------------------------------- exact math
const f = D.faceProbs(R.ADVANTAGE);
ok(near(f.reduce((a, b) => a + b, 0), 1), "advantage faces sum to 1");
ok(near(f[20], 39 / 400), "P(20 with advantage) = 39/400");
ok(near(D.faceProbs(R.DISADVANTAGE)[20], 1 / 400), "P(20 with disadvantage) = 1/400");

let [h, c, m] = D.hitChances(5, 15, R.NORMAL, 20);
ok(near(h, 0.5) && near(c, 0.05) && near(m, 0.45), "+5 vs AC 15: faces 10-19 hit");
[h, c, m] = D.hitChances(20, 5, R.NORMAL, 20);
ok(near(h, 0.9) && near(c, 0.05) && near(m, 0.05), "a natural 1 always misses");
[h, c, m] = D.hitChances(-5, 40, R.NORMAL, 18);
ok(near(h, 0) && near(c, 0.15) && near(m, 0.85), "crit range always hits");
[h, c] = D.hitChances(7, 15, R.ADVANTAGE, 20);
ok(near(c, 39 / 400), "advantage crit chance");
// advantage hit (faces 8..19): sum (2k-1)/400 for k=8..19
let adv = 0; for (let k = 8; k <= 19; k++) adv += (2 * k - 1) / 400;
ok(near(h, adv), "advantage hit chance");

const two6 = D.sumDist([{ n: 2, d: 6 }], 1);
ok(near(two6[7], 6 / 36) && near(two6[2], 1 / 36) && two6.length === 13, "2d6 distribution");

const ls = D.solve(R.makeAttack(7, "1d8", 4, 1, 0), 15, R.NORMAL);
ok(near(ls.pHit, 0.6) && near(ls.pCrit, 0.05), "longsword hit split");
ok(near(ls.mean, 0.6 * 8.5 + 0.05 * 13), "longsword mean = 5.75");
ok(near(ls.dist.reduce((a, b) => a + b, 0), 1), "distribution sums to 1");
ok(ls.max === 20, "max = 2d8+4 = 20");
ok(near(ls.exactly(0), 0.35), "35% of single attacks deal nothing");
ok(near(ls.atLeast(0), 1) && ls.atLeast(21) === 0, "atLeast ends");
ok(near(ls.exactly(20), 0.05 / 64), "max only on a crit with both 8s");

const neg = D.solve(R.makeAttack(5, "1d4", -3, 1, 0), 10, R.NORMAL);
ok(near(D.expectedFrom(neg.hitDice, -3), 0.25), "damage never below zero");
ok(neg.dist.every(v => v >= 0), "no negative mass");

const twice = D.solve(R.makeAttack(7, "1d8", 4, 2, 0), 15, R.NORMAL);
ok(near(twice.mean, 2 * 5.75), "two attacks double the mean");
ok(near(twice.exactly(0), 0.35 * 0.35), "both miss");
const sweep = D.meanForAC(R.makeAttack(7, "1d8", 4, 2, 0), twice, 15, R.NORMAL);
ok(near(sweep, twice.mean), "sweep agrees with the solve at the current AC");

// ---------------------------------------------------------------- rolls
let r = Ro.d20(scripted([20, 1]), 7, R.ADVANTAGE, 20);
ok(r.crit && !r.fumble && r.total === 27 && r.keep === 0, "advantage keeps the 20");
r = Ro.d20(scripted([20, 3]), 0, R.DISADVANTAGE, 20);
ok(!r.crit && r.natural === 3, "a 20 thrown away by disadvantage is no crit");
r = Ro.attack(scripted([19]), 0, R.NORMAL, 19, 30);
ok(r.crit && r.success, "19 crits with a 19-20 range and always hits");
r = Ro.attack(scripted([1]), 30, R.NORMAL, 20, 2);
ok(r.fumble && !r.success, "natural 1 misses");
r = Ro.attack(scripted([10]), 5, R.NORMAL, 20, 15);
ok(r.success && r.total === 15, "meets AC hits");
r = Ro.check(scripted([20]), 0, R.NORMAL, 0);
ok(!r.judged && !r.success && r.crit, "check without DC is not judged");
r = Ro.check(scripted([12]), 3, R.NORMAL, 15);
ok(r.judged && r.success, "check 12+3 passes DC 15");
let dm = Ro.damage(scripted([8, 3, 5]), [{ n: 2, d: 8 }, { n: 1, d: 6 }], 4, false);
ok(dm.dice.length === 3 && dm.sum === 16 && dm.total === 20, "damage total");
dm = Ro.damage(scripted([1]), [{ n: 2, d: 8 }, { n: 1, d: 6 }], 0, true);
ok(dm.dice.length === 6 && dm.doubled, "a crit doubles every group");
dm = Ro.damage(scripted([8, 8, 6]), [{ n: 2, d: 8 }, { n: 1, d: 6 }], 0, false);
ok(dm.allMax, "all dice maxed");
dm = Ro.damage(scripted([1]), [{ n: 1, d: 4 }], -3, false);
ok(dm.total === -2 && dm.dealt === 0, "dealt never below zero");
let pc = Ro.percent(scripted([100]));
ok(pc.tens === 0 && pc.units === 0 && pc.max, "100 is 00 and 0");
pc = Ro.percent(scripted([7]));
ok(pc.tens === 0 && pc.units === 7, "07");
pc = Ro.percent(scripted([40]));
ok(pc.tens === 4 && pc.units === 0, "40");
pc = Ro.percent(scripted([1]));
ok(pc.min && pc.tens === 0 && pc.units === 1, "01 is the minimum");

const rng = Ro.cryptoRng();
const hist = new Array(7).fill(0);
for (let i = 0; i < 60000; i++) hist[rng(1, 6)]++;
ok(hist.slice(1).every(v => Math.abs(v - 10000) < 500), "crypto rng is uniform");
ok(hist[0] === 0, "rng stays in range");

// ---------------------------------------------------------------- Monte Carlo
// Whole rounds built from attack() and damage(), the way the Attack and
// Damage tabs throw them, against the exact distribution.
function monte(a, ac, mode, n) {
  const sol = D.solve(a, ac, mode);
  const counts = new Float64Array(sol.max + 1);
  for (let i = 0; i < n; i++) {
    let tot = 0;
    for (let k = 0; k < a.attacks; k++) {
      const hit = Ro.attack(rng, a.bonus, mode, R.critMin(a), ac);
      if (hit.success) tot += Ro.damage(rng, a.groups, a.mod, hit.crit).dealt;
    }
    counts[tot]++;
  }
  let worst = 0;
  for (let v = 0; v <= sol.max; v++) {
    const p = sol.exactly(v), q = counts[v] / n;
    if (p * n < 30) continue;            // too rare for a normal approximation
    const se = Math.sqrt(Math.max(p * (1 - p), 1e-12) / n);
    worst = Math.max(worst, Math.abs(p - q) / se);
  }
  return worst;
}
const cases = [
  [R.makeAttack(7, "1d8", 4, 2, 0), 15, R.NORMAL],
  [R.makeAttack(7, "1d8+3d6", 4, 1, 0), 16, R.ADVANTAGE],
  [R.makeAttack(8, "2d6", 5, 2, 1), 18, R.DISADVANTAGE],
  [R.makeAttack(3, "1d4", -3, 3, 2), 12, R.NORMAL],
];
for (const [a, ac, mode] of cases) {
  const z = monte(a, ac, mode, 120000);
  ok(z < 5.5, `Monte Carlo agrees with exact math (${R.summary(a)}, AC ${ac}): worst z ${z.toFixed(2)}`);
}
// The test must be able to fail: an AC off by one must be caught.
{
  const a = R.makeAttack(7, "1d8", 4, 2, 0);
  const sol = D.solve(a, 16, R.NORMAL);           // the wrong AC
  const counts = new Float64Array(sol.max + 1), n = 120000;
  for (let i = 0; i < n; i++) {
    let tot = 0;
    for (let k = 0; k < 2; k++) {
      const hit = Ro.attack(rng, 7, R.NORMAL, 20, 15);
      if (hit.success) tot += Ro.damage(rng, a.groups, 4, hit.crit).dealt;
    }
    counts[tot]++;
  }
  const p = sol.exactly(0), q = counts[0] / n;
  ok(Math.abs(p - q) / Math.sqrt(p * (1 - p) / n) > 8, "an off-by-one AC is detected");
}

// ---------------------------------------------------------------- store
let s = S.freshState();
ok(S.encodeState(S.decodeState(S.encodeState(s))) === S.encodeState(s), "the example party survives its own save");
ok(s.party.length === 3 && s.current === 0, "example party");
ok(S.char(s).presets.length === 3 && !S.edited(S.char(s)), "first character loaded, not edited");
S.attackOf(s).bonus = 9;
ok(S.edited(S.char(s)), "edited after a change");
ok(S.updatePreset(s) === "Longsword" && !S.edited(S.char(s)), "update preset");
ok(S.savePresetAs(s, "  Espada  longa ") === "Espada longa" && S.char(s).active === 3, "save as new");
while (S.char(s).presets.length < R.MAX_PRESETS) S.savePresetAs(s, "");
ok(S.savePresetAs(s, "x") === false, "eight presets is the limit");
ok(S.char(s).presets.some(p => p.name === "Attack 5"), "suggested names");
S.deletePreset(s, 0);
ok(S.char(s).active === R.MAX_PRESETS - 2, "active index follows a delete above it");
S.deletePreset(s, S.char(s).active);
ok(S.char(s).active === -1, "deleting the active preset unloads it");
ok(S.renamePreset(s, 0, "") === false, "empty rename refused");
S.loadPreset(s, 1);
ok(S.char(s).active === 1 && R.sameAttack(S.attackOf(s), S.char(s).presets[1].attack), "load preset");
S.attackOf(s).groups[0].n = 3;
ok(S.char(s).presets[1].attack.groups[0].n !== 3, "a loaded preset is a copy");

// characters
S.switchCharacter(s, 1);
ok(S.char(s).name === "Vex" && S.attackOf(s).groups.length === 2, "each character has its own working attack");
S.switchCharacter(s, 0);
ok(S.attackOf(s).groups[0].n === 3, "switching back restores the edited attack");
ok(S.uniqueCharName(s.party, "vex") === "vex (2)", "names unique, case-insensitive");
ok(R.codePoints(S.uniqueCharName([{ name: "x".repeat(24) }], "x".repeat(24))) <= 24, "unique names stay within 24");
s.current = 2;
S.deleteCharacter(s, 0);
ok(s.current === 1 && S.char(s).name === "Sister Ilse", "current follows a delete above it");
S.deleteCharacter(s, 1);
ok(s.current === 0 && S.char(s).name === "Vex", "deleting the current one picks a neighbour");
S.deleteCharacter(s, 0);
ok(s.party.length === 1 && S.char(s).name === "Adventurer", "the party is never empty");
for (let i = 0; i < 20; i++) S.addCharacter(s, S.blankCharacter("Hero"));
ok(s.party.length === R.MAX_CHARACTERS, "twelve characters is the limit");
ok(new Set(s.party.map(c => c.name)).size === s.party.length, "all names unique");
S.editCharacter(s, 1, { name: "Adventurer", note: "a|b " + "n".repeat(50), color: 99 });
ok(s.party[1].name === "Adventurer (2)" && s.party[1].color === 7 && R.codePoints(s.party[1].note) <= 32, "edit character validated");

// state round trip
s = S.freshState();
s.situation.ac = 22; s.situation.mode = 2; s.ui.pal = 9; s.current = 2;
S.savePresetAs(s, "Ünïcödé 🐉 name");
const back = S.decodeState(S.encodeState(s));
ok(back && back.situation.ac === 22 && back.situation.mode === 2 && back.ui.pal === 9, "state round trip, with a web-only scheme");
ok(!("hp" in back.situation) && !("hp" in S.freshState().situation), "no damage to deal in the state");
ok(/\npal=0\n/.test(S.sessionText(back, back.party[0])) && !/\nhp=/.test(S.sessionText(back, back.party[0])), "session.txt: a web-only scheme exports as 0, no hp line");
ok(back.current === 2 && back.party[2].presets.at(-1).name === "Ünïcödé 🐉 name", "names survive the round trip");
ok(R.sameAttack(back.party[2].attack, s.party[2].attack), "working attack survives");
ok(S.decodeState("nonsense") === null && S.decodeState('{"format":"x"}') === null, "not a state");
const hostile = JSON.parse(S.encodeState(s));
hostile.situation.ac = 999; hostile.ui.tab = -4; hostile.current = 77;
hostile.party[0].presets[0].attack.dice = "99d6"; hostile.party[0].attack.bonus = "9; alert(1)";
hostile.party.push({ name: "" }, 5, null, { name: "<b>x</b>", presets: "no" });
const hb = S.decodeState(JSON.stringify(hostile));
ok(hb.situation.ac === 40 && hb.ui.tab === 0 && hb.current === 3, "hostile values clamped");
ok(hb.party[0].presets.length === 3 && hb.party[0].presets[0].attack.groups[0].d === 8, "a bad preset's dice are replaced");
ok(hb.party.length === 4 && hb.party[3].name === "<b>x</b>" && hb.party[3].presets.length === 0, "junk characters dropped, odd names kept as text");

// files
const cf = S.parseImport(S.characterFile(s.party[1]), "vex.json");
ok(cf.kind === "character" && cf.characters[0].name === "Vex" && cf.characters[0].presets.length === 3, "character file round trip");
const pf = S.parseImport(S.partyFile(s));
ok(pf.kind === "party" && pf.characters.length === 3, "party file round trip");
ok(S.parseImport("").error && S.parseImport("{oops").error && S.parseImport('{"a":1}').error, "bad files explained");
ok(S.parseImport("hello world").error, "plain text refused");
const st2 = S.freshState();
let res = S.applyImport(st2, cf.characters, "add");
ok(res.added === 1 && st2.party.at(-1).name === "Vex (2)", "import adds with a unique name");
res = S.applyImport(st2, S.parseImport(S.characterFile(s.party[1])).characters, "replace");
ok(res.replaced === 1 && st2.party[1].name === "Vex" && st2.party.length === 4, "import replaces the same name");
res = S.applyImport(st2, pf.characters, "replace-party");
ok(st2.party.length === 3 && st2.current === 0, "replace party");

// session.txt from the Processing prototype / LÖVE app
const proto = [
  "v=1", "bonus=7", "dice=1d8+3d6", "mod=4", "attacks=1", "crit=0", "ac=15", "mode=1", "hp=20",
  "checkmod=3", "checkdc=0", "double=0", "tab=1", "sub=0", "pal=2", "chart=0", "ccdf=1", "active=1",
  "preset=Longsword|7|1d8|4|2|0",
  "preset=Rapier and Sneak Attack|7|1d8+3d6|4|1|0",
  "preset=Dragon 🐉 bite|9|2d10|5|1|2",
  "preset=Broken|7|1d8|4|2",                 // five fields: dropped
  "preset=Too big|99|1d8|4|1|0",             // bonus out of range: dropped
  "preset=|7|1d8|4|1|0",                     // no name: dropped
].join("\r\n");
const ps = S.parseImport(proto, "session.txt");
ok(ps.kind === "session", "session.txt recognised");
const pc0 = ps.characters[0];
ok(pc0.name === "Imported character" && pc0.presets.length === 3, "good presets kept, bad ones dropped");
ok(pc0.presets[2].name === "Dragon 🐉 bite" && pc0.presets[2].attack.crit === 2, "emoji name and crit range");
ok(pc0.active === 1 && R.sameAttack(pc0.attack, pc0.presets[1].attack), "working attack and active preset");
ok(S.parseImport(proto.replace("v=1", "v=2")).error, "other versions refused");
ok(S.parseImport(proto, "brannoc.txt").characters[0].name === "brannoc", "name from the file name");

const out = S.sessionText(st2, st2.party[0]);
const again = S.parseSession(out, "session.txt");
ok(again && again.presets.length === st2.party[0].presets.length, "exported session reads back");
ok(again.presets.every((p, i) => R.sameAttack(p.attack, st2.party[0].presets[i].attack)), "exported presets intact");
ok(out.split("\n").every(l => l === "" || /^[a-z]+=/.test(l)), "session lines are key=value");
ok(!/\|.*\|.*\|.*\|.*\|.*\|/.test(out.split("\n").filter(l => l.startsWith("preset=")).join("\n").replace(/^preset=.*$/gm, m => m.split("|").length === 6 ? "" : m)), "six fields per preset line");

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
