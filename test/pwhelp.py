"""Shared Playwright helpers: serve Google Fonts and three.js from local copies.

The sandbox cannot reach fonts.googleapis.com or the CDNs, so requests to
them are answered from node_modules. Only the hosts are swapped; the page
itself is loaded unchanged.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FS = os.path.join(ROOT, "node_modules", "@fontsource")

FACES = [
    # family, package, weight, style
    ("IM Fell English SC", "im-fell-english-sc", 400, "normal"),
    ("IM Fell English", "im-fell-english", 400, "normal"),
    ("IM Fell English", "im-fell-english", 400, "italic"),
    ("Alegreya Sans", "alegreya-sans", 400, "normal"),
    ("Alegreya Sans", "alegreya-sans", 500, "normal"),
    ("Alegreya Sans", "alegreya-sans", 700, "normal"),
    ("Alegreya Sans", "alegreya-sans", 400, "italic"),
    ("IBM Plex Mono", "ibm-plex-mono", 400, "normal"),
    ("IBM Plex Mono", "ibm-plex-mono", 500, "normal"),
    ("Cinzel", "cinzel", 600, "normal"),
    ("Cinzel", "cinzel", 700, "normal"),
]


def font_css():
    out = []
    for fam, pkg, w, st in FACES:
        f = f"{pkg}-latin-{w}-{st}.woff2"
        if not os.path.exists(os.path.join(FS, pkg, "files", f)):
            continue
        out.append(
            "@font-face{font-family:'%s';font-style:%s;font-weight:%d;font-display:swap;"
            "src:url(https://fonts.gstatic.com/local/%s/%s) format('woff2');}" % (fam, st, w, pkg, f))
    return "\n".join(out)


def install_routes(page):
    css = font_css()

    def gfonts(route):
        route.fulfill(status=200, content_type="text/css", body=css)

    def gstatic(route):
        parts = route.request.url.split("/local/")[1].split("/")
        path = os.path.join(FS, parts[0], "files", parts[1])
        if os.path.exists(path):
            route.fulfill(status=200, content_type="font/woff2", body=open(path, "rb").read())
        else:
            route.fulfill(status=404, body="")

    page.route("https://fonts.googleapis.com/**", gfonts)
    page.route("https://fonts.gstatic.com/**", gstatic)
