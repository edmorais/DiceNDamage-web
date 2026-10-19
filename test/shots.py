#!/usr/bin/env python3
"""Screenshots of the main states at a given size: python3 test/shots.py WxH outdir [states...]"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwhelp import install_routes
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "file://" + os.path.join(ROOT, "dist", "DiceAndDamage-standalone.html")
size = sys.argv[1] if len(sys.argv) > 1 else "1440x900"
out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/shots"
only = sys.argv[3:]
W, H = map(int, size.split("x"))
os.makedirs(out, exist_ok=True)

SCRIPT = {
  # name: (js to run, wait for settle?)
  "calc": ("", False),
  "calc-sweep": ("__app.act('chart','1')", False),
  "attack-crit": ("__app.setRng(seq([20,6])); __app.act('roll')", True),
  "attack-adv": ("__app.act('tab','1'); __app.act('mode','2'); __app.setRng(seq([17,4])); __app.act('roll')", True),
  "attack-fumble": ("__app.act('tab','1'); __app.act('mode','1'); __app.setRng(seq([1])); __app.act('roll')", True),
  "damage-crit": ("__app.act('tab','1'); __app.setRng(seq([20])); __app.act('roll'); __app.views.attack.revealed=true; __arena.skip();", "then:__app.setRng(seq([8,6,5,2,3,1,4,6])); __app.act('rolldmg')"),
  "damage-tab": ("__app.act('tab','2')", False),
  "percent": ("__app.act('tab','3'); __app.setRng(seq([47])); __app.act('roll')", True),
  "presets": ("__app.act('presets')", False),
  "party": ("__app.act('party')", False),
  "party-edit": ("__app.act('party'); __app.sheetAction('cmore','1')", False),
  "scheme-light": ("__app.act('scheme'); __app.act('tab','1'); __app.setRng(seq([14])); __app.act('roll')", True),
}
PRE = "window.seq = a => { let i = 0; return (lo, hi) => Math.max(lo, Math.min(hi, a[i++ % a.length])); };"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for name, (js, settle) in SCRIPT.items():
        if only and name not in only:
            continue
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, has_touch=W < 700, is_mobile=W < 700)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        install_routes(pg)
        pg.add_init_script("window.__settled = 0; window.__hook = (k, v) => { if (k === 'settled') window.__settled++; };")
        pg.goto(PAGE)
        pg.wait_for_function("window.__app && window.__arena", timeout=20000)
        pg.wait_for_timeout(600)
        pg.evaluate(PRE)
        if js:
            pg.evaluate(js)
        if isinstance(settle, str):
            pg.wait_for_timeout(300)
            pg.evaluate(settle[5:])
            settle = True
        if settle:
            pg.wait_for_function("window.__settled > 0", timeout=20000)
            pg.wait_for_timeout(900)
        else:
            pg.wait_for_timeout(500)
        path = os.path.join(out, f"{name}-{size}.png")
        pg.screenshot(path=path)
        print(name, "errors:", errs[:3])
        ctx.close()
    b.close()
