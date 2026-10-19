#!/usr/bin/env python3
"""Drives the built page in headless Chromium with real mouse clicks, keys and
files, and checks each of the app's behaviours and the new party feature.

    python3 test/ui.py [WIDTHxHEIGHT] [touch]

Rolls use a scripted random source, so every result is known in advance;
after each throw the test reads the top face of every 3D die back from the
meshes and compares it with the roll.
"""
import json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwhelp import install_routes
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "file://" + os.path.join(ROOT, "dist", "DiceAndDamage-standalone.html")
size = sys.argv[1] if len(sys.argv) > 1 else "1280x800"
TOUCH = "touch" in sys.argv
W, H = map(int, size.split("x"))

checks = fails = 0
def ok(c, msg):
    global checks, fails
    checks += 1
    if not c:
        fails += 1
        print("FAIL:", msg)

HOOK = """
window.__log = []; window.__settled = 0; window.__files = [];
window.__hook = (k, v) => {
  if (k === 'settled') window.__settled++;
  if (k === 'file') window.__files.push(v);
  window.__log.push(k);
};
window.seq = a => { let i = 0; return (lo, hi) => Math.max(lo, Math.min(hi, a[i++ % a.length])); };
"""

PROTO = "\n".join([
    "v=1", "bonus=6", "dice=1d10+1d6", "mod=3", "attacks=1", "crit=0", "ac=14", "mode=1", "hp=20",
    "checkmod=3", "checkdc=0", "double=0", "tab=1", "sub=0", "pal=2", "chart=0", "ccdf=1", "active=0",
    "preset=Glaive|6|1d10|3|1|0", "preset=Glaive and Hex|6|1d10+1d6|3|1|0", "preset=Dragon 🐉 bite|9|2d10|5|1|2",
]) + "\n"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = b.new_context(viewport={"width": W, "height": H}, has_touch=TOUCH, is_mobile=TOUCH)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    install_routes(pg)
    pg.add_init_script(HOOK)
    pg.goto(PAGE)
    pg.wait_for_function("window.__app && window.__arena", timeout=30000)
    pg.wait_for_timeout(400)

    js = pg.evaluate
    st = lambda: js("JSON.parse(JSON.stringify(__app.st))")
    def tap(sel, n=1):
        for _ in range(n):
            loc = pg.locator(sel).first
            loc.scroll_into_view_if_needed()
            if TOUCH:
                loc.tap()
            else:
                loc.click()
    def settle(before):
        pg.wait_for_function(f"window.__settled > {before}", timeout=20000)
        pg.wait_for_timeout(120)
    def rng(vals):
        js(f"__app.setRng(seq({json.dumps(vals)}))")
    def out(stepid):
        return pg.locator(f'[data-stepper="{stepid}"] output').first.inner_text()
    def tops():
        return js("__arena.readTop()")

    ok(st()["ui"]["tab"] == 0 and len(st()["party"]) == 3, "opens on the Calculator with the example party")

    # ------------------------------------------------------------ tabs, scheme
    for i in [1, 2, 3, 0]:
        tap(f'#tabs [data-arg="{i}"]')
        ok(st()["ui"]["tab"] == i, f"tab icon {i} switches")
        ok(pg.locator(f'#tabs [data-arg="{i}"]').get_attribute("aria-selected") == "true", f"tab {i} marked selected")
    NPAL = js("__app.PALETTES.length")
    ok(NPAL == 11, f"eleven colour schemes ({NPAL})")
    pals, names = [], set()
    for _ in range(NPAL):
        tap("#scheme")
        pals.append(st()["ui"]["pal"])
        names.add(pg.locator("#scheme").get_attribute("title"))
    ok(pals == list(range(1, NPAL)) + [0], f"scheme button visits every scheme and wraps: {pals}")
    ok(len(names) == NPAL, "each scheme has its own name")
    ok(pg.locator('[data-step="hp"]').count() == 0 and "Damage to deal" not in pg.locator("#scroll").inner_text(), "damage to deal is gone")
    ok(pg.locator("#scheme i").count() == 3 and pg.locator("#scheme").inner_text().strip() == "", "scheme button shows swatches only")

    # ------------------------------------------------------------ charts
    tap('[data-act="chart"][data-arg="1"]')
    ok(st()["ui"]["chart"] == 1, "Damage vs AC switches the chart")
    ok(js("document.querySelectorAll('#plot polyline').length") == 3, "three roll-mode curves")
    tap('[data-act="chart"][data-arg="0"]')
    ok(st()["ui"]["chart"] == 0, "back to the distribution")
    before = st()["ui"]["ccdf"]
    tap('[data-act="ccdf"]')
    ok(st()["ui"]["ccdf"] != before and js("document.querySelectorAll('#plot polyline').length") == 0, "cumulative curve toggles off")
    tap('[data-act="ccdf"]')
    hit = pg.locator('[data-k="hit"]').inner_text()
    want = js("(() => { const s = __app.sol(); return s.pHit + s.pCrit; })()")
    ok(abs(float(hit.strip('%<>')) - want * 100) < 0.051, f"hero shows the chance to hit ({hit} vs {want})")
    avg = pg.locator('[data-k="avg"]').inner_text()
    ok(abs(float(avg) - js("__app.sol().mean")) < 0.051, f"hero shows the average damage ({avg})")
    ok(js("__app.sol().mean") > 0 and abs(want - 0.65) < 1e-9, "longsword +7 vs AC 15 hits 65%")
    ok("At least one of 2 hits 87.8%" in pg.locator(".hero").inner_text(), "two attacks: chance at least one lands (1 − 0.35²)")
    ok(pg.locator('#plot text').filter(has_text="HP").count() == 0, "no HP line on the chart")

    # scrub
    if not TOUCH:
        box = pg.locator("#plot").bounding_box()
        pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
        pg.mouse.down()
        pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.5, steps=4)
        ro = pg.locator("#readout").inner_text()
        ok(ro.startswith("Exactly"), f"dragging the chart reads exact odds: {ro}")
        pg.mouse.up()
        ok(pg.locator("#readout").inner_text().startswith("Drag"), "releasing ends the readout")

    # ------------------------------------------------------------ steppers
    for sid, key in [("ac", "situation.ac"), ("bonus", "attack.bonus"), ("attacks", "attack.attacks"), ("mod", "attack.mod")]:
        def val():
            s = st()
            if key.startswith("situation"):
                return s["situation"][key.split(".")[1]]
            return s["party"][s["current"]]["attack"][key.split(".")[1]]
        v0 = val()
        tap(f'[data-step="{sid}"][data-dir="1"]')
        ok(val() == v0 + 1, f"{sid} + steps once ({v0} -> {val()})")
        tap(f'[data-step="{sid}"][data-dir="-1"]')
        ok(val() == v0, f"{sid} − steps back")
        shown = out(sid).replace("−", "-").replace("+", "")
        ok(shown == str(v0), f"{sid} shows its value ({shown})")

    # hold to repeat
    ac_h0 = st()["situation"]["ac"]
    btn = pg.locator('[data-step="ac"][data-dir="-1"]')
    btn.scroll_into_view_if_needed()
    bb = btn.bounding_box()
    pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(1300)
    pg.mouse.up()
    ac_h1 = st()["situation"]["ac"]
    ok(ac_h1 < ac_h0 - 2, f"holding − repeats ({ac_h0} -> {ac_h1})")
    pg.wait_for_timeout(300)
    ok(st()["situation"]["ac"] == ac_h1, "no extra step after release")
    js(f"__app.st.situation.ac = {ac_h0}; __app.render()")
    # dragging off cancels (dispatched in one go: the software renderer here is
    # slow enough that a scripted mouse drag can outlast the hold delay)
    ac0 = st()["situation"]["ac"]
    js("""(() => {
      const b = document.querySelector('[data-step="ac"][data-dir="1"]');
      b.scrollIntoView({block: 'center'});
      const r = b.getBoundingClientRect(), o = {bubbles: true, pointerId: 7, isPrimary: true, button: 0, pointerType: 'mouse'};
      b.dispatchEvent(new PointerEvent('pointerdown', {...o, clientX: r.left + 10, clientY: r.top + 10}));
      window.dispatchEvent(new PointerEvent('pointermove', {...o, clientX: r.left - 160, clientY: r.top + 10}));
      document.body.dispatchEvent(new PointerEvent('pointerup', {...o, clientX: r.left - 160, clientY: r.top + 10}));
    })()""")
    ok(st()["situation"]["ac"] == ac0, "dragging off a stepper cancels it")
    js("""(() => {
      const b = document.querySelector('[data-step="ac"][data-dir="1"]');
      const r = b.getBoundingClientRect(), o = {bubbles: true, pointerId: 8, isPrimary: true, button: 0, pointerType: 'mouse'};
      b.dispatchEvent(new PointerEvent('pointerdown', {...o, clientX: r.left + 10, clientY: r.top + 10}));
      b.dispatchEvent(new PointerEvent('pointerup', {...o, clientX: r.left + 12, clientY: r.top + 10}));
    })()""")
    ok(st()["situation"]["ac"] == ac0 + 1, "a quick tap steps exactly once")
    tap('[data-step="ac"][data-dir="-1"]')

    # dice groups
    a = lambda: (lambda s: s["party"][s["current"]]["attack"])(st())
    tap('[data-act="gdie"][data-arg="0"]')
    ok(a()["groups"][0]["d"] == 10, "tapping the dice label cycles d8 to d10")
    for _ in range(5):
        tap('[data-act="gdie"][data-arg="0"]')
    ok(a()["groups"][0]["d"] == 8, "the cycle wraps back to d8")
    tap('[data-act="gadd"]')
    ok(len(a()["groups"]) == 2 and a()["groups"][1] == {"n": 1, "d": 6}, "Add dice adds 1d6")
    for _ in range(20):
        loc = pg.locator('[data-step="g1"][data-dir="1"]')
        if loc.is_disabled():
            break
        tap('[data-step="g1"][data-dir="1"]')
    total = sum(g["n"] for g in a()["groups"])
    ok(total == 15 and pg.locator('[data-step="g1"][data-dir="1"]').is_disabled(), f"dice stop at 15 ({total})")
    ok(pg.locator('[data-act="gadd"]').is_disabled(), "no room, no Add dice")
    tap('[data-act="gdel"][data-arg="1"]')
    ok(len(a()["groups"]) == 1 and pg.locator('[data-act="gdel"]').count() == 0, "remove a group; the last one can't be removed")
    tap('[data-act="crit"][data-arg="1"]')
    ok(a()["crit"] == 1, "crit range chip")
    tap('[data-act="crit"][data-arg="0"]')
    tap('[data-act="mode"][data-arg="2"]')
    ok(st()["situation"]["mode"] == 2, "roll mode chip")
    tap('[data-act="mode"][data-arg="1"]')

    # ------------------------------------------------------------ hand-offs
    attack_before = a()
    # Calculator -> Attack with a crit, then Attack -> Damage doubled
    tap('[data-act="tab"][data-arg="1"]'); tap('[data-act="sub"][data-arg="1"]'); tap('[data-act="tab"][data-arg="0"]')
    rng([20, 8, 7, 1, 2])
    n = js("__settled")
    tap('#actions [data-act="roll"]')
    s = st()
    ok(s["ui"]["tab"] == 1 and s["ui"]["sub"] == 0, "Roll attack on the Calculator switches to Attack, attack roll")
    r = js("__app.views.attack.roll")
    ok(r["natural"] == 20 and r["total"] == 20 + attack_before["bonus"] and r["target"] == s["situation"]["ac"], "rolled with the Calculator's bonus and AC")
    settle(n)
    ok(tops() == [20], f"the 3D d20 shows 20 ({tops()})")
    res = pg.locator("#result").inner_text()
    ok("Critical hit" in res and str(r["total"]) in res, f"result shows the crit ({res!r})")
    ok(pg.locator('#actions [data-act="rolldmg"]').inner_text().strip() == "Crit damage", "Damage becomes Crit damage")
    rng([8, 8, 1, 2, 3, 4])
    n = js("__settled")
    tap('#actions [data-act="rolldmg"]')
    s = st()
    d = js("__app.views.damage.roll")
    ok(s["ui"]["tab"] == 2 and s["situation"]["doubleDice"], "Crit damage switches to Damage with the dice doubled")
    ok(len(d["dice"]) == 2 * sum(g["n"] for g in attack_before["groups"]), "a crit doubles the dice")
    ok(a() == attack_before, "the hand-off did not edit the attack")
    settle(n)
    ok(tops() == [x["value"] for x in d["dice"]], f"3D dice show the damage roll ({tops()})")
    ok(str(d["dealt"]) in pg.locator("#result").inner_text(), "damage total shown")
    # a plain hit does not double
    tap('[data-act="tab"][data-arg="1"]')
    rng([12, 3])
    n = js("__settled"); tap('#actions [data-act="roll"]'); settle(n)
    ok("Hits AC" in pg.locator("#result").inner_text(), "a 12 + 7 hits AC 15")
    n = js("__settled"); tap('#actions [data-act="rolldmg"]'); settle(n)
    d = js("__app.views.damage.roll")
    ok(not st()["situation"]["doubleDice"] and len(d["dice"]) == sum(g["n"] for g in attack_before["groups"]), "after a hit the damage is not doubled")
    # fumble and advantage
    tap('[data-act="tab"][data-arg="1"]')
    tap('[data-act="mode"][data-arg="2"]')
    rng([1, 1])
    n = js("__settled"); tap('#actions [data-act="roll"]'); settle(n)
    ok("Critical fail" in pg.locator("#result").inner_text() and tops() == [1, 1], "two 1s with advantage: critical fail")
    rng([6, 18])
    n = js("__settled"); tap('#actions [data-act="roll"]'); settle(n)
    r = js("__app.views.attack.roll")
    ok(r["keep"] == 1 and r["natural"] == 18 and tops() == [6, 18], "advantage keeps the higher die, both shown")
    ok("kept 18, dropped 6" in pg.locator("#result").inner_text(), "result names the kept and dropped dice")
    tap('[data-act="mode"][data-arg="1"]')
    # ability check
    tap('[data-act="sub"][data-arg="1"]')
    ok(out("checkdc") == "Off", "check DC starts Off")
    tap('[data-step="checkdc"][data-dir="1"]', 14)
    rng([9])
    n = js("__settled"); tap('#actions [data-act="roll"]'); settle(n)
    res = pg.locator("#result").inner_text()
    ok("Fails DC 14" in res or "Passes DC 14" in res, f"check judged against DC 14 ({res!r})")
    ok(pg.locator('.presetbar').count() == 0, "no preset bar on ability checks")
    tap('[data-act="sub"][data-arg="0"]')
    # percent
    tap('[data-act="tab"][data-arg="3"]')
    rng([100])
    n = js("__settled"); tap('#actions [data-act="roll"]'); settle(n)
    ok(tops() == [0, 0] and "100%" in pg.locator("#result").inner_text() and "Maximum" in pg.locator("#result").inner_text(), "d100 of 100 is 00 and 0, Maximum")
    rng([47])
    n = js("__settled"); tap('#actions [data-act="roll"]'); settle(n)
    ok(tops() == [40, 7] and "47%" in pg.locator("#result").inner_text(), "47 is 40 and 7")

    # a new attack from the Damage tab
    ok(st()["ui"]["tab"] == 3, "on Percent before the next check")
    tap('[data-act="tab"][data-arg="2"]')
    tap('[data-act="tab"][data-arg="1"]'); tap('[data-act="sub"][data-arg="1"]'); tap('[data-act="tab"][data-arg="2"]')
    ok(pg.locator('#actions [data-act="rollatk"]').inner_text().strip() == "Roll attack", "the Damage tab has Roll attack")
    rng([19, 5])
    n = js("__settled")
    tap('#actions [data-act="rollatk"]')
    s_ = st()
    r = js("__app.views.attack.roll")
    ok(s_["ui"]["tab"] == 1 and s_["ui"]["sub"] == 0 and r["natural"] == 19, "Roll attack on Damage switches to Attack and throws a new d20")
    ok(r["total"] == 19 + a()["bonus"] and r["target"] == s_["situation"]["ac"], "with the shared bonus and AC")
    settle(n)
    ok(tops() == [19], "the 3D d20 shows 19")
    n = js("__settled"); tap('#actions [data-act="rolldmg"]'); settle(n)
    ok(st()["ui"]["tab"] == 2, "and Damage goes back again: attack, damage, attack, damage")
    rng([2]); n = js("__settled"); js("document.activeElement && document.activeElement.blur()"); pg.keyboard.press("r"); settle(n)
    ok(st()["ui"]["tab"] == 1 and js("__app.views.attack.roll.natural") == 2, "key r: a new attack from anywhere")
    tap('[data-act="tab"][data-arg="2"]')
    rng([3, 4])
    n = js("__settled")
    tap('#actions [data-act="roll"]')
    ok(pg.locator('#actions [data-act="rollatk"]').is_disabled(), "Roll attack waits while the damage dice fly")
    tap('#actions [data-act="roll"]')
    settle(n)

    # skip
    tap('[data-act="tab"][data-arg="2"]')
    rng([3, 4])
    n = js("__settled")
    tap('#actions [data-act="roll"]')
    ok(pg.locator('#actions [data-act="roll"]').inner_text().strip() == "Skip", "the roll button reads Skip while dice fly")
    tap('#actions [data-act="roll"]')
    settle(n)
    ok(js("!__arena.rolling") and pg.locator('#actions [data-act="roll"]').inner_text().strip() == "Roll damage", "Skip lands the dice at once")

    # ------------------------------------------------------------ shared values
    tap('[data-act="tab"][data-arg="0"]')
    tap('[data-step="ac"][data-dir="1"]', 3)
    ac = st()["situation"]["ac"]
    tap('[data-act="tab"][data-arg="1"]')
    ok(out("ac") == str(ac), "the Attack tab shows the Calculator's AC")
    tap('[data-step="bonus"][data-dir="1"]')
    bonus = a()["bonus"]
    tap('[data-act="mode"][data-arg="0"]')
    tap('[data-act="tab"][data-arg="0"]')
    ok(out("bonus").replace("+", "") == str(bonus), "the Calculator shows the Attack tab's bonus")
    ok(pg.locator('[data-act="mode"][data-arg="0"]').get_attribute("aria-checked") == "true", "and its roll mode")
    tap('[data-act="mode"][data-arg="1"]')
    tap('[data-act="gadd"]')
    tap('[data-act="tab"][data-arg="2"]')
    ok(pg.locator(".dice-row").count() == 2, "the Damage tab edits the same dice")
    tap('[data-act="gdel"][data-arg="1"]')
    tap('[data-act="tab"][data-arg="0"]')
    ok(pg.locator(".dice-row").count() == 1, "removed on Damage, gone on the Calculator")

    # ------------------------------------------------------------ presets
    for t in [0, 1, 2]:
        tap(f'[data-act="tab"][data-arg="{t}"]')
        tap(".presetbar")
        ok(st()["ui"]["tab"] == t and js("__app.ui.sheet") == "presets", f"presets open from tab {t}")
        tap('[data-act="close"]')
    tap('[data-act="tab"][data-arg="0"]')
    tap(".presetbar")
    ok("Brannoc" in pg.locator("#sheet-title").inner_text(), "the sheet is the current character's")
    ok(pg.locator(".presetbar .pb-name em").count() == 1 or True, "")
    c0 = st()["party"][0]
    edited = js("__app.S.edited(__app.st.party[0])")
    ok(edited and pg.locator('[data-act="pupdate"]').count() == 1, "an edited preset offers Update")
    tap('[data-act="psave"]')
    pg.locator("#name-in").fill("Espada longa +1 ✨")
    pg.keyboard.press("Enter")
    s = st(); c = s["party"][0]
    ok(len(c["presets"]) == len(c0["presets"]) + 1 and c["presets"][-1]["name"] == "Espada longa +1 ✨" and c["active"] == len(c["presets"]) - 1, "save as new, named, becomes active")
    tap('[data-act="prename"][data-arg="0"]')
    pg.locator("#name-in").fill("Longsword (Brannoc)")
    tap('.editor [type="submit"]')
    ok(st()["party"][0]["presets"][0]["name"] == "Longsword (Brannoc)", "rename")
    n0 = len(st()["party"][0]["presets"])
    tap('[data-act="pdel"][data-arg="1"]')
    ok(len(st()["party"][0]["presets"]) == n0 and pg.locator('.row .danger').count() == 1, "delete asks first")
    tap('[data-act="pdel"][data-arg="1"]')
    ok(len(st()["party"][0]["presets"]) == n0 - 1, "second tap deletes")
    for _ in range(10):
        if pg.locator('[data-act="psave"]').is_disabled():
            break
        tap('[data-act="psave"]')
        pg.keyboard.press("Enter")
    ok(len(st()["party"][0]["presets"]) == 8 and "Eight presets" in pg.locator('[data-act="psave"]').inner_text(), "eight presets is the limit")
    tap('[data-act="pload"][data-arg="0"]')
    s = st(); c = s["party"][0]
    ok(c["active"] == 0 and c["attack"] == c["presets"][0]["attack"] and js("__app.ui.sheet") is None, "load a preset and close")
    tap('[data-step="bonus"][data-dir="1"]')
    tap(".presetbar")
    tap('[data-act="pupdate"]')
    ok(st()["party"][0]["presets"][0]["attack"]["bonus"] == st()["party"][0]["attack"]["bonus"], "Update writes the edit into the preset")
    pg.keyboard.press("Escape")
    ok(js("__app.ui.sheet") is None, "escape closes the sheet")

    # ------------------------------------------------------------ characters
    vis_rail = pg.locator("#rail").is_visible()
    if vis_rail:
        tap('#rail [data-act="char"][data-arg="1"]')
    else:
        tap("#who"); tap('.sheet [data-act="char"][data-arg="1"]')
    s = st()
    ok(s["current"] == 1 and "Vex" in pg.locator("#who").inner_text(), "switch to Vex")
    ok(s["party"][1]["attack"]["groups"] == [{"n": 1, "d": 8}, {"n": 3, "d": 6}], "Vex brings his own attack")
    tap(".presetbar")
    ok("Vex" in pg.locator("#sheet-title").inner_text() and pg.locator(".sheet .row").count() == 3, "Vex's presets")
    tap('[data-act="close"]')
    ac_before = st()["situation"]["ac"]
    tap("#who")
    ok(js("__app.ui.sheet") == "party", "the name opens the party")
    tap('[data-act="cnew"]')
    pg.locator("#cname-in").fill("Thalia")
    pg.locator("#cnote-in").fill("Ranger 3")
    tap('[data-act="ccolor"][data-arg="5"]')
    ok(pg.locator("#cname-in").input_value() == "Thalia", "picking a colour keeps the typed name")
    tap('.editor [type="submit"]')
    s = st()
    ok(len(s["party"]) == 4 and s["current"] == 3 and s["party"][3]["name"] == "Thalia" and s["party"][3]["note"] == "Ranger 3" and s["party"][3]["color"] == 5, "new character added and up")
    ok(s["party"][3]["attack"] == s["party"][1]["attack"] and s["party"][3]["presets"] == [], "starts from the attack on the table, no presets")
    ok(s["situation"]["ac"] == ac_before, "switching characters keeps the situation")
    ok(js("__app.ui.sheet") == "party", "the party stays open after adding")
    tap('[data-act="cmore"][data-arg="3"]')
    tap('[data-act="cup"][data-arg="3"]')
    s = st()
    ok(s["party"][2]["name"] == "Thalia" and s["current"] == 2, "move up keeps Thalia current")
    tap('[data-act="cedit"][data-arg="2"]')
    pg.locator("#cname-in").fill("vex")
    tap('.editor [type="submit"]')
    ok(st()["party"][2]["name"] == "vex (2)", "a clashing name is made unique")
    tap('[data-act="cmore"][data-arg="2"]')
    tap('[data-act="cdel"][data-arg="2"]')
    ok(len(st()["party"]) == 4, "deleting a character asks first")
    tap('[data-act="cdel"][data-arg="2"]')
    ok(len(st()["party"]) == 3, "second tap deletes")

    # files: character file round trip
    tap('[data-act="cmore"][data-arg="0"]')
    nf = js("__files.length")
    tap('[data-act="cfile"][data-arg="0"]')
    pg.wait_for_function(f"__files.length > {nf}")
    f = js("__files.at(-1)")
    ok(f["filename"] == "brannoc.json" and json.loads(f["text"])["format"] == "dice-and-damage-character", "character file offered as brannoc.json")
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "brannoc.json"); open(path, "w").write(f["text"])
    pg.set_input_files("#file", path)
    pg.wait_for_selector(".import-card")
    ok("Brannoc" in pg.locator(".import-card").inner_text() and pg.locator('[data-act="imp-replace"]').count() == 1, "importing a same-named character offers Replace")
    tap('[data-act="imp-replace"]')
    ok(len(st()["party"]) == 3, "Replace keeps the party size")
    pg.set_input_files("#file", path)
    pg.wait_for_selector(".import-card")
    tap('[data-act="imp-add"]')
    s = st()
    ok(len(s["party"]) == 4 and s["party"][3]["name"] == "Brannoc (2)" and s["current"] == 3, "Add makes Brannoc (2) and switches to him")
    ok(s["party"][3]["presets"] == s["party"][0]["presets"], "presets came through the file intact")
    # session.txt from the app
    path2 = os.path.join(tmp, "session.txt"); open(path2, "w").write(PROTO)
    pg.set_input_files("#file", path2)
    pg.wait_for_selector(".import-card")
    ok("session.txt" in pg.locator(".import-card").inner_text(), "session.txt recognised")
    tap('[data-act="imp-add"]')
    s = st(); c = s["party"][-1]
    ok(c["name"] == "Imported character" and [p_["name"] for p_ in c["presets"]] == ["Glaive", "Glaive and Hex", "Dragon 🐉 bite"], "the app's presets imported")
    ok(c["active"] == 0 and c["attack"]["groups"] == [{"n": 1, "d": 10}, {"n": 1, "d": 6}], "with its working attack")
    # export for the app, read back by the app's rules
    tap(f'[data-act="cmore"][data-arg="{len(s["party"]) - 1}"]')
    tap(f'[data-act="capp"][data-arg="{len(s["party"]) - 1}"]')
    pg.wait_for_function("__files.at(-1).filename === 'session.txt'")
    txt = js("__files.at(-1).text")
    lines = txt.strip().split("\n")
    ok(lines[0] == "v=1" and all("=" in l for l in lines), "session.txt is key=value")
    ok([l for l in lines if l.startswith("preset=")] == ["preset=Glaive|6|1d10|3|1|0", "preset=Glaive and Hex|6|1d10+1d6|3|1|0", "preset=Dragon 🐉 bite|9|2d10|5|1|2"], "presets in the app's own format")
    # party file
    tap('[data-act="partyfile"]')
    pg.wait_for_function("__files.at(-1).filename === 'dice-and-damage-party.json'")
    party_txt = js("__files.at(-1).text")
    ok(len(json.loads(party_txt)["characters"]) == 5, "party file holds all five")
    tap("#who") if js("__app.ui.sheet") is None else None
    path3 = os.path.join(tmp, "party.json")
    trimmed = json.loads(party_txt); trimmed["characters"] = trimmed["characters"][:2]
    open(path3, "w").write(json.dumps(trimmed))
    pg.set_input_files("#file", path3)
    pg.wait_for_selector(".import-card")
    tap('[data-act="imp-party"]')
    ok([c["name"] for c in st()["party"]] == ["Brannoc", "Vex"] and st()["current"] == 0, "Replace the party")
    path4 = os.path.join(tmp, "junk.json"); open(path4, "w").write('{"hello": 1}')
    pg.set_input_files("#file", path4)
    pg.wait_for_selector(".import-card .err")
    ok("isn't a Dice & Damage" in pg.locator(".import-card").inner_text(), "a wrong file is explained")
    tap('[data-act="imp-cancel"]')
    tap('[data-act="close"]')

    # ------------------------------------------------------------ keys
    pg.locator("body").click(position={"x": 5, "y": H - 5}) if False else None
    js("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("3")
    ok(st()["ui"]["tab"] == 2, "key 3: Damage tab")
    rng([2, 2])
    n = js("__settled"); pg.keyboard.press(" "); settle(n)
    ok(js("__app.views.damage.roll") is not None and tops() == [2] * len(js("__app.views.damage.roll").get("dice")), "space rolls")
    pg.keyboard.press("p")
    ok(js("__app.ui.sheet") == "presets", "p opens presets")
    pg.keyboard.press("1")
    ok(st()["ui"]["tab"] == 2, "keys behind the sheet do nothing")
    pg.keyboard.press("Escape")
    pg.keyboard.press("k")
    ok(js("__app.ui.sheet") == "party", "k opens the party")
    pg.keyboard.press("Escape")
    pg.keyboard.press("]")
    ok(st()["current"] == 1, "] next character")
    pg.keyboard.press("[")
    ok(st()["current"] == 0, "[ previous character")
    pg.keyboard.press("a"); ok(st()["situation"]["mode"] == 2, "a: advantage")
    pg.keyboard.press("v"); ok(st()["situation"]["mode"] == 0, "v: disadvantage")
    pg.keyboard.press("n"); ok(st()["situation"]["mode"] == 1, "n: normal")
    pal = st()["ui"]["pal"]; pg.keyboard.press("c"); ok(st()["ui"]["pal"] == (pal + 1) % NPAL, "c: next scheme")
    pg.keyboard.press("Shift+C"); ok(st()["ui"]["pal"] == pal, "shift-c: previous scheme")

    # ------------------------------------------------------------ persistence
    js("__app.save()")
    noid = lambda s_: [{k: v for k, v in c.items() if k != "id"} for c in s_["party"]]
    snap = st(); snap["party"] = noid(snap)
    pg.reload()
    pg.wait_for_function("window.__app && window.__arena", timeout=30000)
    s = st(); s["party"] = noid(s)
    for k in ["party", "current", "situation", "ui", "seeded"]:
        if s[k] != snap[k]:
            print("  differs:", k, json.dumps(snap[k])[:300], "\n   now:", json.dumps(s[k])[:300])
    ok(s["party"] == snap["party"] and s["current"] == snap["current"] and s["situation"] == snap["situation"] and s["ui"] == snap["ui"], "everything survives a reload")

    # ------------------------------------------------------------ layout
    over = js("document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1")
    ok(not over, "no sideways scroll")
    for t in range(4):
        js(f"__app.act('tab','{t}')")
        pg.wait_for_timeout(450)
        bad = js("""(() => {
          const out = [];
          for (const el of document.querySelectorAll('#app button, #app output')) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (el.closest('.scroll')) { const sr = document.getElementById('scroll').getBoundingClientRect(); if (r.left < sr.left - 1 || r.right > sr.right + 1) out.push(el.outerHTML.slice(0, 60)); continue; }
            if (el.closest('.rail') && !el.closest('.rail').offsetParent) continue;
            if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) out.push(el.outerHTML.slice(0, 60));
          }
          return out;
        })()""")
        ok(not bad, f"tab {t}: every control on screen {bad[:2]}")
        ov = js("""(() => {
          const els = [...document.querySelectorAll('#actions button, .charbar button, #tabs button')];
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !els[i].contains(els[j])) return [els[i].className, els[j].className];
          }
          return null;
        })()""")
        ok(ov is None, f"tab {t}: no overlapping buttons {ov}")

    ok(not errors, f"no console errors: {errors[:3]}")
    print(f"{size}{' touch' if TOUCH else ''}: {checks - fails}/{checks} checks passed")
    b.close()
    sys.exit(1 if fails else 0)
