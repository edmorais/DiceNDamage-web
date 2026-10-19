#!/usr/bin/env python3
"""The published page's runtime, stood in for: window.claude.use() with a
downloads stub and a db/user stub that keeps its documents in localStorage,
written to the contract in the artifact type definitions. Checks that the
party syncs to the account copy, that a newer account copy wins on load,
and that files go out through downloads.save with allowed extensions.
Also checks the standalone fallback: a real browser download.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwhelp import install_routes
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "file://" + os.path.join(ROOT, "dist", "DiceAndDamage-standalone.html")
checks = fails = 0
def ok(c, msg):
    global checks, fails
    checks += 1
    if not c:
        fails += 1
        print("FAIL:", msg)

STUB = """
(() => {
  const mode = localStorage.getItem('__stubMode') || 'ok';
  const read = () => JSON.parse(localStorage.getItem('__fakeDb') || '{}');
  const write = o => localStorage.setItem('__fakeDb', JSON.stringify(o));
  window.__saves = [];
  window.__dbWrites = 0;
  const frozen = o => Object.freeze(o);
  const db = frozen({
    doc(path) {
      if (path.split('/').length % 2) throw new TypeError('odd path');
      return frozen({
        path,
        async get() { const o = read(); return { id: path.split('/').pop(), exists: path in o, data: () => o[path], metadata: { fromCache: false, hasPendingWrites: false } }; },
        async set(data) {
          if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument', message: 'too big' };
          const o = read(); o[path] = JSON.parse(JSON.stringify(data)); write(o); window.__dbWrites++;
        },
      });
    },
    collection() { throw new Error('not used'); },
  });
  const user = frozen({ async id() { return 'u1'; }, async isOwner() { return true; } });
  const downloads = frozen({
    async save({ filename, data }) {
      if (!/\\.(json|txt)$/.test(filename)) throw { code: 'rejected_extension', message: 'ext' };
      if (mode === 'decline') throw { code: 'declined', message: 'no' };
      window.__saves.push({ filename, data: typeof data === 'string' ? data : '(binary)' });
      return { status: 'saved' };
    },
  });
  window.claude = { use: async name => {
    await new Promise(r => setTimeout(r, 30));
    if (mode === 'none') return null;
    return { db, user, downloads }[name] || null;
  } };
})();
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    install_routes(pg)
    pg.add_init_script(STUB)
    pg.goto(PAGE)
    pg.evaluate("localStorage.clear()")
    pg.reload()
    js = pg.evaluate
    pg.wait_for_function("window.__app && window.__arena")
    pg.wait_for_function("__dbWrites > 0", timeout=10000)
    doc = js("JSON.parse(localStorage.getItem('__fakeDb'))['data/users/u1/party']")
    ok(doc and isinstance(doc["savedAt"], (int, float)) and json.loads(doc["state"])["format"] == "dice-and-damage-web", "first visit writes the party to the account")
    js("__app.step('ac', 1)")
    pg.wait_for_function("JSON.parse(JSON.parse(localStorage.getItem('__fakeDb'))['data/users/u1/party'].state).situation.ac === 16", timeout=10000)
    ok(True, "a change reaches the account copy")
    js("__app.act('party')")
    ok("Saved to your Claude account" in pg.locator(".sheet-msg").inner_text(), "the party sheet says where it is kept")
    js("__app.sheetAction('cmore','0')")
    pg.locator('[data-act="cfile"][data-arg="0"]').click()
    pg.wait_for_function("__saves.length > 0")
    sv = js("__saves[0]")
    ok(sv["filename"] == "brannoc.json" and json.loads(sv["data"])["character"]["name"] == "Brannoc", "character file saved through downloads.save")
    pg.locator('[data-act="capp"][data-arg="0"]').click()
    pg.wait_for_function("__saves.length > 1")
    ok(js("__saves[1].filename") == "session.txt" and js("__saves[1].data").startswith("v=1\n"), "session.txt saved through downloads.save")
    pg.locator('[data-act="partyfile"]').click()
    pg.wait_for_function("__saves.length > 2")
    ok(js("__saves[2].filename") == "dice-and-damage-party.json", "party file saved")

    # A newer copy on the account (another device) wins on load.
    newer = js("""(() => {
      const s = JSON.parse(__app.S.encodeState(__app.st));
      s.current = 2; s.situation.ac = 23;
      const o = JSON.parse(localStorage.getItem('__fakeDb'));
      o['data/users/u1/party'] = { state: JSON.stringify(s), savedAt: Date.now() + 60000 };
      localStorage.setItem('__fakeDb', JSON.stringify(o));
      return true;
    })()""")
    pg.reload()
    pg.wait_for_function("window.__app && __app.st.current === 2", timeout=10000)
    ok(js("__app.st.situation.ac") == 23 and "Sister Ilse" in pg.locator("#who").inner_text(), "the newer account copy is adopted")
    ok(json.loads(js("localStorage.getItem('dice-and-damage:web:v1')"))["savedAt"] > 0, "and kept in this browser too")

    # Declined saves.
    js("localStorage.setItem('__stubMode','decline')")
    pg.reload()
    pg.wait_for_function("window.__app")
    js("__app.act('party'); __app.sheetAction('cmore','0')")
    pg.locator('[data-act="cfile"][data-arg="0"]').click()
    pg.wait_for_function("document.getElementById('toast').textContent === 'Not saved'", timeout=5000)
    ok(True, "a declined save says so")

    # No runtime at all (the standalone file): a real download.
    js("localStorage.setItem('__stubMode','none')")
    pg.reload()
    pg.wait_for_function("window.__app")
    js("__app.act('party'); __app.sheetAction('cmore','1')")
    with pg.expect_download() as dl:
        pg.locator('[data-act="cfile"][data-arg="1"]').click()
    d = dl.value
    path = d.path()
    ok(d.suggested_filename == "vex.json" and json.load(open(path))["character"]["name"] == "Vex", "standalone page downloads vex.json")
    pg.wait_for_timeout(500)
    ok("Saved in this browser" in pg.locator(".sheet-msg").inner_text(), "without an account it says the party is in this browser")
    js("localStorage.removeItem('__stubMode')")
    ok(not errors, f"no page errors {errors[:3]}")
    print(f"runtime: {checks - fails}/{checks} checks passed")
    b.close()
    sys.exit(1 if fails else 0)
