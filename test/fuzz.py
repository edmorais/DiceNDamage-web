#!/usr/bin/env python3
"""Random taps, keys, imports and edits through the real handlers, with the
app's rules checked after every one.  python3 test/fuzz.py [steps] [seed]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwhelp import install_routes
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "file://" + os.path.join(ROOT, "dist", "DiceAndDamage-standalone.html")
STEPS = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 7

FUZZ = r"""
async ({ steps, seed }) => {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const A = __app, R = A.R, S = A.S;
  const problems = [];
  const counts = { clicks: 0, keys: 0, imports: 0, rolls: 0, settled: 0, chars: 0, presetsSaved: 0, checks: 0 };
  const junk = ["", "{", "v=1\npreset=a|1|1d8|1|1|0", "v=1\npreset=" + "🐉".repeat(40) + "|7|1d8|4|2|0\npreset=x|99|1d8|1|1|0",
    '{"format":"dice-and-damage-party","version":1,"characters":[{"name":"A|=b","presets":[{"name":"p","attack":{"bonus":"x","dice":"99d6"}}]},{"name":""},7]}',
    '{"format":"dice-and-damage-character","version":1,"character":{"name":"Zed","color":-4,"active":9,"presets":[{"name":"z","attack":{"bonus":3,"dice":"1d4+1d4"}}]}}',
    "\u0000\u0001garbage", "v=1\r\nbonus=7\r\ndice=2d6\r\npreset=Crlf|7|2d6|3|1|1\r\n"];
  const keys = ["1", "2", "3", "4", " ", "p", "k", "a", "v", "n", "c", "C", "r", "[", "]", "Escape", "Enter"];
  const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  function check(tag) {
    counts.checks++;
    const st = A.st;
    const bad = m => problems.push(`${tag}: ${m}`);
    if (!inRange(st.party.length, 1, R.MAX_CHARACTERS)) bad("party size");
    if (!inRange(st.current, 0, st.party.length - 1)) bad("current");
    const names = new Set();
    for (const c of st.party) {
      if (!c.name || [...c.name].length > R.NAME_MAX) bad("char name " + c.name);
      if (names.has(c.name.toLowerCase())) bad("duplicate name " + c.name);
      names.add(c.name.toLowerCase());
      if (c.presets.length > R.MAX_PRESETS) bad("too many presets");
      if (!inRange(c.active, -1, c.presets.length - 1)) bad("active preset");
      for (const a of [c.attack, ...c.presets.map(p => p.attack)]) {
        if (!inRange(a.bonus, R.BONUS_MIN, R.BONUS_MAX) || !inRange(a.mod, R.MOD_MIN, R.MOD_MAX)) bad("attack numbers");
        if (!inRange(a.attacks, 1, 4) || !inRange(a.crit, 0, 2)) bad("attacks/crit");
        if (!inRange(a.groups.length, 1, R.MAX_GROUPS) || R.count(a.groups) > R.MAX_DICE) bad("dice " + JSON.stringify(a.groups));
        if (a.groups.some(g => !R.DIE_SIZES.includes(g.d) || g.n < 1)) bad("group");
      }
      for (const p of c.presets) if (!p.name || [...p.name].length > R.NAME_MAX || /[|=]/.test(p.name)) bad("preset name " + p.name);
    }
    const si = st.situation;
    if (!inRange(si.ac, 1, 40) || !inRange(si.mode, 0, 2) || !inRange(si.checkDc, 0, 40) || !inRange(si.checkMod, -10, 30)) bad("situation");
    const sol = A.sol();
    if ("hp" in si) bad("damage to deal came back");
    if (!inRange(st.ui.pal, 0, 10)) bad("scheme " + st.ui.pal);
    const sum = sol.dist.reduce((x, y) => x + y, 0);
    if (Math.abs(sum - 1) > 1e-9) bad("distribution sums to " + sum);
    const back = S.decodeState(S.encodeState(st));
    if (!back || S.encodeState(back) !== S.encodeState(st)) bad("state does not survive its own save");
    const ids = new Set();
    for (const el of document.querySelectorAll("[data-act][data-arg], [data-step]")) {
      const k = (el.dataset.act || "s:" + el.dataset.step) + ":" + (el.dataset.arg ?? el.dataset.dir) + ":" + (el.closest("#rail") ? "r" : el.closest(".sheet") ? "s" : "m");
      if (ids.has(k)) bad("two controls share " + k);
      ids.add(k);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) bad("sideways scroll");
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < steps && problems.length < 10; i++) {
    const r = rnd();
    if (r < 0.72) {
      const els = [...document.querySelectorAll("[data-act], [data-step], .swatches button")]
        .filter(el => !el.disabled && el.offsetParent !== null && !(el.dataset.act === "load"));
      const el = pick(els);
      if (el) {
        if (el.dataset.act === "roll" || el.dataset.act === "rolldmg") counts.rolls++;
        if (el.dataset.act === "psave") counts.presetsSaved++;
        if (el.dataset.act === "ccommit" || el.dataset.act === "cnew") counts.chars++;
        el.click(); counts.clicks++;
      }
    } else if (r < 0.86) {
      const k = pick(keys);
      document.activeElement && document.activeElement.blur && rnd() < 0.5 && document.activeElement.blur();
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      counts.keys++;
    } else if (r < 0.9) {
      A.handleImportText(pick(junk), pick(["session.txt", "x.json", "Ünï 🐉.txt"])); counts.imports++;
    } else if (r < 0.96) {
      const inp = document.querySelector(".sheet input.text-in");
      if (inp) {
        inp.value = pick(["", "  ", "Bob", "a".repeat(80), "Dragon 🐉 slayer of the realm", "x|y=z", "Vex", "​"]);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        if (rnd() < 0.6) inp.form.requestSubmit();
      }
    } else {
      await sleep(rnd() < 0.3 ? 1500 : 60);
    }
    if (i % 3 === 0) await sleep(0);
    check("step " + i);
  }
  // Let the last throw land and read the dice back.
  await sleep(2000);
  if (window.__arena && __arena.rolling) { __arena.skip(); await sleep(200); }
  const key = A.st.ui.tab === 1 ? (A.st.ui.sub ? "check" : "attack") : A.st.ui.tab === 2 ? "damage" : A.st.ui.tab === 3 ? "percent" : null;
  if (key && A.views[key].roll && !A.ui.sheet) {
    const r = A.views[key].roll;
    const want = r.kind === "percent" ? [r.tens * 10, r.units] : r.dice.map(d => d.value);
    const got = __arena.readTop();
    if (JSON.stringify(want) !== JSON.stringify(got)) problems.push(`final dice ${got} vs roll ${want}`);
  }
  counts.parties = A.st.party.length;
  return { problems, counts };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ok_all = True
    for size in ["1280x800", "390x844"]:
        w, h = map(int, size.split("x"))
        pg = b.new_page(viewport={"width": w, "height": h})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        install_routes(pg)
        pg.add_init_script("window.__hook = () => {};")
        pg.goto(PAGE)
        pg.evaluate("localStorage.clear()")
        pg.reload()
        pg.wait_for_function("window.__app && window.__arena")
        res = pg.evaluate(FUZZ, {"steps": STEPS, "seed": SEED + w})
        print(size, res["counts"])
        for pr in res["problems"]:
            print("  PROBLEM:", pr)
        for e in errors[:5]:
            print("  PAGE ERROR:", e)
        ok_all = ok_all and not res["problems"] and not errors
        pg.close()
    b.close()
    print("fuzz:", "all invariants held" if ok_all else "FAILED")
    sys.exit(0 if ok_all else 1)
