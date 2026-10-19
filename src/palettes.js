// palettes.js -- the colour schemes. The first six are the ones the Damage
// Calculator, the Dice Roller and Dice & Damage share, hex for hex, so the
// apps sit together; five more exist only on the web.
// Roles, not names: bg, panel, edge, ink, inkDim, grid, accent, accent2,
// barLow, barHigh, miss, crit. Two more are derived, as in the apps:
// fumble (miss lifted toward inkDim) and sunken (panel toward edge).

const RAW = [
  ["Dragon's Hoard", "12100E 1C1815 2E2620 F2E7D5 A2917A 2B2420 E0A526 C6482B 6E4A21 F2C14E 4A3A30 FF7A45"],
  ["Spellbook", "E7DABB F6EEDC D3C09A 33291D 7A6A52 DFD0AE 8A4B0F 1F5C4E D9C098 7A4A1E BBAF98 A02C2C"],
  ["Arcane Neon", "080A1B 101433 22265A E8E9FF 8A8FCB 1B2050 4CC9F0 F72585 3A0CA3 4CC9F0 262B5E F72585"],
  ["Necrotic Bloom", "0B1310 12201A 1E3529 DDF7E3 7FA98D 172A21 9EF01A 38B000 14532D 9EF01A 233B2E D9ED92"],
  ["Frostbite", "071019 0E1B29 1B3550 E4F1FB 86A5BF 14293D 63C7FF FFB703 14496B 8ECAE6 1E3040 FFB703"],
  ["Ink & Bone", "0D0D0D 161616 2A2A2A EDEDED 9A9A9A 232323 FFFFFF B0B0B0 3C3C3C E6E6E6 2A2A2A FFFFFF"],
  // Web only. The apps know the first six; a session.txt exported while one
  // of these is on carries scheme 0 instead.
  ["Infernal", "140A09 1F0F0D 3A1A15 F5E3D7 B39282 2E1511 FF5A1F E8B04A 6B1A10 FF8A3D 47231C FFD166"],
  ["Feywild", "120E1F 1C1630 32294F F1EAFF ADA1CF 251E40 F28AD2 7EE8B5 4B2C78 C79BFF 2E2648 FFE27A"],
  ["Underdark", "07080C 0F1117 1F2430 E2E6EE 8E97AA 171B24 3EE6C8 B57BFF 16424A 5CF2D6 222733 FFC857"],
  ["Abyssal Tide", "04141A 0A1F27 15363F E0F4F2 83ABAB 0F2A32 2EC4B6 F4D58D 0E4D55 7DE2D1 1A3138 FF6B6B"],
  ["Celestial", "EEF0F4 FBFBFD D3D8E2 1E2433 5A647C E1E5EC 8F6510 2F6FB5 C9D3E6 3B5BA0 D9DDE5 B83A0E"],
];

/** How many schemes the LÖVE app and the Processing prototype have. */
export const APP_SCHEMES = 6;

const KEYS = ["bg", "panel", "edge", "ink", "inkDim", "grid", "accent", "accent2", "barLow", "barHigh", "miss", "crit"];

export function hexToRgb(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function mix(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(h) {
  const c = hexToRgb(h).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const PALETTES = RAW.map(([name, hex]) => {
  const p = { name };
  hex.split(" ").forEach((h, i) => { p[KEYS[i]] = "#" + h.toLowerCase(); });
  p.fumble = mix(p.miss, p.inkDim, 0.75);
  p.sunken = mix(p.panel, p.edge, 0.55);
  p.light = luminance(p.bg) > 0.4;
  return p;
});
