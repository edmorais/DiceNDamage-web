#!/usr/bin/env python3
"""Bundles src/ into one page.

    dist/DiceAndDamage.html             the artifact page (no doctype: the
                                        publisher wraps it)
    dist/DiceAndDamage-standalone.html  the same page as a complete document
                                        that opens from disk
three.js is bundled in (tree-shaken), so neither depends on a script CDN.
"""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
out = os.path.join(ROOT, "dist", "app.js")
r = subprocess.run(["npx", "esbuild", "src/main.js", "--bundle", "--format=iife", "--minify",
                    "--target=es2020", "--legal-comments=none", "--outfile=" + out, "--log-level=warning"], cwd=ROOT)
if r.returncode:
    sys.exit(r.returncode)
js = open(out).read().replace("</script", "<\\/script")
css = open(os.path.join(ROOT, "src", "styles.css")).read()
tpl = open(os.path.join(ROOT, "src", "index.html")).read()
page = tpl.replace("/*CSS*/", css).replace("/*JS*/", js)
assert "/*JS*/" not in page
open(os.path.join(ROOT, "dist", "DiceAndDamage.html"), "w").write(page)
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#12100e"></head><body>')
open(os.path.join(ROOT, "dist", "DiceAndDamage-standalone.html"), "w").write(head + page + "</body></html>")
print("page", round(len(page) / 1024), "KB, of which script", round(len(js) / 1024), "KB")
