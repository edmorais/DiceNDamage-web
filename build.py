#!/usr/bin/env python3
"""Bundles src/ into one page.

    dist/DiceAndDamage.html             the artifact page (no doctype: the
                                        publisher wraps it)
    dist/DiceAndDamage-standalone.html  the same page as a complete document
                                        that opens from disk
    docs/                               the installable web app (PWA) for
                                        GitHub Pages: index.html with the
                                        manifest and service worker, plus
                                        the files in src/pwa/
three.js is bundled in (tree-shaken), so neither depends on a script CDN.
"""
import hashlib, os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    # UTF-8 with LF line endings, so the output is the same on every OS.
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
out = os.path.join(ROOT, "dist", "app.js")
# shutil.which finds npx.cmd on Windows, where a bare "npx" fails.
r = subprocess.run([shutil.which("npx") or "npx", "esbuild", "src/main.js", "--bundle", "--format=iife", "--minify",
                    "--target=es2020", "--legal-comments=none", "--outfile=" + out, "--log-level=warning"], cwd=ROOT)
if r.returncode:
    sys.exit(r.returncode)
js = read(out).replace("</script", "<\\/script")
css = read(os.path.join(ROOT, "src", "styles.css"))
tpl = read(os.path.join(ROOT, "src", "index.html"))
page = tpl.replace("/*CSS*/", css).replace("/*JS*/", js)
assert "/*JS*/" not in page
write(os.path.join(ROOT, "dist", "DiceAndDamage.html"), page)
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#12100e"></head><body>')
write(os.path.join(ROOT, "dist", "DiceAndDamage-standalone.html"), head + page + "</body></html>")

# The installable app. Served over https (GitHub Pages), Chrome offers to
# install it; the service worker keeps it working offline.
PWA = os.path.join(ROOT, "src", "pwa")
DOCS = os.path.join(ROOT, "docs")
os.makedirs(DOCS, exist_ok=True)
pwa_head = ('<link rel="manifest" href="manifest.webmanifest">'
            '<link rel="icon" href="icon.svg" type="image/svg+xml">'
            '<link rel="icon" href="icon-192.png" sizes="192x192" type="image/png">'
            '<link rel="apple-touch-icon" href="apple-touch-icon.png">'
            '<meta name="mobile-web-app-capable" content="yes">'
            '<meta name="apple-mobile-web-app-capable" content="yes">'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
            '<meta name="apple-mobile-web-app-title" content="Dice &amp; Damage">'
            '<script>if("serviceWorker"in navigator&&location.protocol!=="file:")'
            'addEventListener("load",()=>navigator.serviceWorker.register("sw.js"))</script>')
site = head.replace("</head>", pwa_head + "</head>") + page + "</body></html>"
write(os.path.join(DOCS, "index.html"), site)
for f in ("manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png",
          "icon-maskable-512.png", "apple-touch-icon.png"):
    shutil.copyfile(os.path.join(PWA, f), os.path.join(DOCS, f))
# A new cache name per build, so installed copies pick up the new page.
version = hashlib.sha256(site.encode()).hexdigest()[:12]
write(os.path.join(DOCS, "sw.js"), read(os.path.join(PWA, "sw.js")).replace("__VERSION__", version))
print("page", round(len(page) / 1024), "KB, of which script", round(len(js) / 1024), "KB")
