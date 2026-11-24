"""Writes the d20 app icon as SVG: icon.svg (rounded tile) and
icon-maskable.svg (full bleed, die inside the 80% safe circle)."""
import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
BG, GOLD, EMBER = "#12100e", "#e0a526", "#c6482b"

def d20(R, cx=256, cy=256, sw=14):
    P = lambda r, deg: (cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg)))
    hexv = [P(R, a) for a in (-90, -30, 30, 90, 150, 210)]
    r = R * 0.56
    t, rr, ll = P(r, -90), P(r, 30), P(r, 150)
    f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"
    hexd = "M" + "L".join(f(p) for p in hexv) + "Z"
    tri = f"M{f(t)}L{f(rr)}L{f(ll)}Z"
    spokes = [(t, hexv[0]), (t, hexv[5]), (t, hexv[1]),
              (rr, hexv[1]), (rr, hexv[2]), (rr, hexv[3]),
              (ll, hexv[3]), (ll, hexv[4]), (ll, hexv[5])]
    sp = "".join(f"M{f(a)}L{f(b)}" for a, b in spokes)
    fs = R * 0.36
    return (f'<path d="{tri}" fill="{EMBER}" fill-opacity=".28"/>'
            f'<g fill="none" stroke="{GOLD}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round">'
            f'<path d="{hexd}"/><path d="{tri}"/><path d="{sp}" stroke-width="{sw*0.7:.1f}"/></g>'
            f'<text x="{cx}" y="{cy + R*0.05 + fs*0.35:.1f}" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" '
            f'font-weight="700" font-size="{fs:.0f}" fill="{GOLD}">20</text>')

head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
open(os.path.join(HERE, "icon.svg"), "w").write(
    head + f'<rect width="512" height="512" rx="112" fill="{BG}"/>' + d20(196) + "</svg>")
open(os.path.join(HERE, "icon-maskable.svg"), "w").write(
    head + f'<rect width="512" height="512" fill="{BG}"/>' + d20(168, sw=12) + "</svg>")
