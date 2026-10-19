# Dice & Damage - web

The LÖVE app rebuilt as one three.js page, in the style of the Hall of
Classes and Dungeon Forge. It does what the app does, with one change you
asked for: a party of characters, each with its own set of attack presets,
which you can save to a file and load back.

Open `DiceAndDamage-standalone.html` in a browser, or use the published
artifact. three.js is bundled into the page, so it needs no script CDN. The
typefaces come from Google Fonts; offline, the page falls back to Georgia
and the system sans.

## What is the same as the app

- **One attack, four tabs.** The Calculator, the Attack tab and the Damage
  tab edit the same working attack. Enemy AC and roll mode
  are one copy too, so a change on one tab is on the others.
- **Roll attack** on the Calculator switches to the Attack tab, as an attack
  roll, and throws the d20 there.
- **Damage** on the Attack tab switches to the Damage tab and rolls the
  attack's dice. After a crit it reads **Crit damage**, sets *Double the
  dice*, and the dice are doubled.
- **Roll attack** on the Damage tab switches back to the Attack tab and
  throws a new d20, so a round goes attack, damage, attack, damage without
  leaving the two buttons. The key r does the same from any tab.
- **Presets** open from the bar on the Calculator, the Attack roll tab and
  the Damage tab: tap a row to load it, rename, delete (asks first), save as
  new, or update the one you loaded. Eight per character, as in the app.
- **The Calculator** is the exact math of the app. The box above the chart
  leads with two numbers: the **chance to hit** with each attack against
  the enemy AC, and the **average damage** per round. Under them, a bar
  splits each attack into crit, hit and miss, with the spread and the
  maximum; with more than one attack it adds the chance that at least one
  lands. The chart shows the distribution with the cumulative curve and the
  average, or damage against every AC from 5 to 30 in all three roll modes.
  Drag across a chart to read exact odds. Next to Enemy AC, the page says
  what the d20 needs to show. There is no *damage to deal* setting any more.
- **Steppers** step once on a tap and repeat while held. Dragging off a stepper cancels it.
- **Limits** are the app's: bonus −5 to +20, damage bonus −10 to +50, 1 to
  4 attacks, crit on 20, 19–20 or 18–20, up to 5 dice groups and 15 dice.
- **Eleven colour schemes.** The app's six, the same twelve colours each,
  and five for the web only: Infernal, Feywild, Underdark, Abyssal Tide and
  Celestial (light). The scheme button and c go forward; shift-c goes back.
  A `session.txt` exported under a web-only scheme carries the app's first
  scheme, since the app has only six. The scheme button shows three
  swatches and no name. The tabs are the app's four icons, and
  each roll button carries the icon of the tab its result lands on.
- **Keys:** 1–4 tabs, space or enter rolls, p presets, n / a / v roll mode,
  c next scheme, escape closes a sheet. New: r rolls a new attack, shift-c
  goes back a scheme, k opens the party, [ and ] switch character.

## The party (new)

The name at the top of the panel opens **The party**. On a wide screen the
characters also stand in a column at the right of the arena: one click
switches.

- **Each character** has a name, a short note (class and level, say), a
  dice colour, up to 8 attack presets, and its own working attack. Switching
  brings back what that character was last holding. The situation (enemy AC, roll mode, the ability check) stays put:
  it belongs to the fight, not to the character.
- **Up to 12 characters.** New starts from the attack on the table. Edit
  changes the name, note and dice colour. Names are kept unique.
- **Save file** writes one character as `name.json`. **Save party** writes
  everyone as `dice-and-damage-party.json`.
- **Load file** reads a character file, a party file, or the app's own
  `session.txt`. You can also drop a file on the page or paste its text into
  the open party sheet. Before anything changes, the sheet says what the
  file holds and asks: *Add* it, *Replace* the character with the same name,
  or, for a party file, *Replace the party*.
- **For the app** writes a character as a `session.txt` for the LÖVE app:
  its presets, its working attack, and this page's situation and scheme.

The first visit opens on three example characters, marked as examples in
the party sheet: Brannoc (fighter), Vex (rogue) and Sister Ilse (paladin).
The app's three default presets are among theirs.

**Where it is kept.** Always in this browser. On the published artifact,
when you are signed in, it is also kept in a private document on your
Claude account, so the same party opens on every device; the newer copy wins
when the page opens or comes back into view. The party sheet says which
applies. A saved party file is the copy nothing can clear.

## The arena

Every roll is thrown onto a carved dais: real d4, d6, d8, d10, d12 and d20
shapes, with numbers on every face. The roll is decided first; the dice fly,
bounce and roll along their path while each turns into the exact position
that puts its result on top, upright toward you. A d4 reads at its top
corner. Percent throws a tens die (00–90) and a units die (0–9); 00 and 0
is 100.

- Advantage and disadvantage throw two d20s; the kept one is ringed and the
  other fades.
- A crit lights the die in the scheme's crit colour, throws sparks and a
  ring across the dais. A natural 1 shakes and greys out.
- All damage dice on their top face: every die glows, MAXIMUM DAMAGE.
- Each character's dice are their own colour.
- Tap the arena, or the button while it reads *Skip*, to land the dice at
  once. With reduced motion on, the dice appear in place.
- On the Calculator the arena shows the attack's dice turning slowly. On a
  phone the arena folds away on the Calculator and opens on the roll tabs.

## Files

    src/rules.js      the attack, the limits, names, dice specs
    src/damage.js     exact per-round damage distribution
    src/rolls.js      d20 tests, damage, percentile; crypto random source
    src/store.js      the party, presets, page state, every file format
    src/palettes.js   the eleven schemes
    src/dicegeo.js    die shapes, face numbers, the turn that shows a value
    src/arena.js      the three.js scene, throws and effects
    src/charts.js     the two SVG charts
    src/persist.js    browser storage and the account copy
    src/app.js        tabs, sheets, input, hand-offs
    src/icons.js      the drawn icons
    src/styles.css, src/index.html
    build.py          bundles everything into dist/
    test/             the tests below

## Tests

All tests run headless on Linux: node 22 for the logic, Playwright with
Chromium 141 and software WebGL (SwiftShader) for the page.

    node test/logic.mjs                  # 111 checks, no browser
    node test/dice.mjs                   # 743 checks, no browser
    python3 build.py && python3 test/ui.py 1280x800
    python3 test/ui.py 390x844 touch
    python3 test/runtime.py              # the published page's runtime, stood in for
    python3 test/fuzz.py 1500 7          # random input at two sizes
    python3 test/shots.py 1440x900 out   # screenshots of every state

**Logic, 111 checks.** Expected values come from the 5e rules and hand
arithmetic: hit, crit and miss splits in all three modes, a natural 1 always
missing, the crit range always hitting, damage never below zero. A Monte
Carlo section plays 120,000 rounds for each of four attacks, built from the
same roll functions the tabs use, and compares them with the exact
distribution; it also proves it can fail by catching an AC off by one. The
rest covers presets and characters (limits, unique names, deleting the
current character, the party never empty), the page state round trip with
hostile values, every file format, and a `session.txt` in the app's format,
with an emoji name and three broken preset lines.

**Dice, 743 checks.** For every die (d4 to d20, and the two percentile d10s)
and every value: the faces are flat and face outward, opposite faces add up
as on real dice, the turn the arena uses puts exactly that value on top, and
the number on the top face reads upright from where you sit.

**Interface, 147 checks on a desktop with the mouse, 145 on a 390 × 844
phone with touch.** Real clicks and taps on every kind of control: tabs,
the scheme button through all eleven and round, both charts, the cumulative
toggle, chart dragging, each stepper, hold to repeat, a drag off a
stepper cancelling it, dice size cycling, the 15-dice cap, crit range and
roll mode. Then your requests in order: Roll attack handing off with the
Calculator's bonus and AC, and again from the Damage tab; Crit damage doubling the dice without editing the
attack; a plain hit not doubling; advantage, fumble, the ability check, the
d100. **After every throw the test reads the top face of each 3D die from
the scene and compares it with the roll.** Then shared values between tabs,
presets from all three tabs (save, rename, delete, update, load, the limit),
characters (switch, new, edit, reorder, delete), saving and loading
character, party and `session.txt` files, keys, a reload, and that no
control leaves the screen or overlaps another.

**Runtime, 12 checks.** A stand-in for the artifact runtime, written to its
type definitions: the party reaches the account copy, a newer account copy
wins on load, files go out through the viewer's save prompt as `.json` and
`.txt`, a declined save says so, and the standalone page downloads a real
file instead.

**Fuzz.** 1,500 random taps, keys, typed names, hostile file imports and
pauses at each of two sizes, with every rule checked after each one: values
in range, names unique and within 24 characters, at most 8 presets and 12
characters, the distribution summing to 1, the state surviving its own save,
no two controls sharing an id, no sideways scroll. The final dice are read
back against the last roll. It found one real bug: the example preset
"Shortbow and Sneak Attack" was 25 characters, so a reload cut it. It is now
"Shortbow, Sneak Attack", and a logic check makes the example party survive
its own save.

## What was and wasn't verified

**Verified:** everything above, on the final build, in headless Chromium
with software WebGL. I looked at screenshots of every state at 1440 × 900,
390 × 844, 844 × 390 and 820 × 1180, and in a light and a dark scheme.

**Not verified:**

- **A real phone, Safari or Firefox.** Only Chromium. three.js runs there,
  but frame rate on a phone's GPU wasn't measured; shadows and the
  pixel ratio drop on small screens to save work.
- **The real artifact runtime.** The account copy and the save prompt were
  tested against a stand-in written to the published contract. The account
  copy stays empty until you open the page signed in; I could not read it
  from here.
- **Loading on the Android app.** The exported `session.txt` follows the
  format the prototype and the LÖVE app read, and reads back with the same
  rules here, but it wasn't loaded by the app itself.
- **Fonts.** This machine can't reach Google Fonts, so the tests served the
  same faces from local copies.
