# Dice & Damage - web

**A damage calculator and dice roller for Dungeons & Dragons 5e and similar RPGs.**

Dice & Damage answers two questions at the table: *how likely is this attack
to land, and how much will it hurt?* Then it rolls the dice for you. 3D
dice are thrown onto a carved stone dais. The odds are exact, worked out from
the rules, not guessed from simulations.

You can keep a party of characters, each with their own saved attacks. Switching
from your fighter's greatsword to your rogue's sneak attack takes one click. You may save your settings to load on another browser or on the Android app!

Try it out at <https://edmorais.github.io/DiceNDamage-web/> !

Check also the Android app at <https://github.com/edmorais/DiceNDamage-app>


Made with Claude Opus 5.5.

---

## Contents

- [Getting started](#getting-started)
- [The screen at a glance](#the-screen-at-a-glance)
- [The four tabs](#the-four-tabs)
- [Playing a turn](#playing-a-turn)
- [Attack presets](#attack-presets)
- [Your party](#your-party)
- [Saving, backing up and moving your party](#saving-backing-up-and-moving-your-party)
- [Colour schemes](#colour-schemes)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [The rules it follows](#the-rules-it-follows)
- [Questions and answers](#questions-and-answers)

---

## Getting started

There are two ways to open Dice & Damage:

- **The web link.** Open the shared link in any modern browser, on a
  computer, tablet or phone. If you are signed in to Claude, your party is
  also saved to your account and follows you to other devices.
- **The file.** Double-click `DiceAndDamage-standalone.html`. It opens in
  your browser and works without an internet connection. Your party is
  saved in that browser.

The first time you open it, you meet three example characters: **Brannoc**
(a fighter), **Vex** (a rogue) and **Sister Ilse** (a paladin). Use them to
explore. Edit them, delete them, or add your own when you are ready.

---

## The screen at a glance

On a computer or a tablet held sideways, the screen has two parts:

- **The arena**, on the left. Your dice are thrown here, and the result
  appears below it. Your party stands in a column on the right edge of the
  arena: click a character to switch to them.
- **The panel**, on the right. It holds everything you set and press:
  - At the top, the **current character**. Tap their name to open the party.
    The small button with three coloured dots changes the **colour scheme**.
  - Under it, **four tabs**, shown as icons: the **calculator**, the
    **sword** (Attack), the **burst** (Damage) and **%** (Percent).
  - At the bottom, the **roll buttons**. Each one carries the icon of the
    tab its result lands on.

On a phone, the same parts are stacked: the character and tabs at the top,
the arena in the middle, the settings below it, and the roll buttons at the
bottom. The arena folds away on the Calculator tab, to leave room for the
numbers, and opens again when you roll.

---

## The four tabs

The Calculator, Attack and Damage tabs all work on the **same attack**. If
you add a d6 on the Damage tab, it is there on the Calculator too. The enemy's
AC and the roll mode are also shared, so you only set them once.

### Calculator

The Calculator tells you what to expect from your attack before you roll.

**The box at the top** shows the two numbers that matter most:

- **Chance to hit**: how often each attack lands against the enemy's AC.
- **Average damage**: what you deal in a typical round, counting misses.

Under them, a bar splits each attack into **crits** (bright), **hits** and
**misses**. The line below gives the crit and miss chances, how much the
damage varies from round to round (±), and the most you can possibly deal.
If you make more than one attack a round, you also see the chance that **at
least one** of them lands.

**The chart** has two views:

- **Distribution** shows how likely each damage total is. The dashed line
  marks the average. Turn on **Cumulative** to add a curve that reads "this
  much damage *or more*", from 100% down to 0%.
- **Damage vs AC** shows your average damage against every AC from 5 to 30,
  with one line for each roll mode. Use it to see how much advantage is
  worth, or how fast your damage falls against heavily armoured enemies.

**Drag your finger or mouse across the chart** to read exact numbers. On
Distribution, you see the chance of dealing exactly that total, and that
total or more. On Damage vs AC, you see the average at that AC for all three
roll modes.

**The situation** is about the fight you are in:

- **Enemy AC**. Next to it, the app tells you what you need on the d20,
  such as "8 or more".
- **Roll mode**: Disadvantage, Normal or Advantage.

**Your attack** is what gets saved in a preset:

| Setting | What it is | Range |
| --- | --- | --- |
| Attack bonus | What you add to the d20 to hit | −5 to +20 |
| Attacks per round | Extra Attack, two-weapon fighting and so on | 1 to 4 |
| Damage dice | One or more groups, such as `1d8` and `3d6` | up to 5 groups, 15 dice |
| Damage bonus | What you add to the damage dice | −10 to +50 |
| Crit range | The d20 rolls that score a critical hit | 20, 19–20 or 18–20 |

To change dice: tap a group's label (`1d8`) to cycle the die size (d4, d6,
d8, d10, d12, d20). Use **−** and **+** to change how many. **Add dice** adds
another group, for sneak attack, a smite, hex and the like. The **×** removes
a group.

**Roll attack** at the bottom takes you to the Attack tab and rolls there.

### Attack

The Attack tab rolls a d20, either for an attack or for an ability check.

**Attack roll** uses your attack bonus against the enemy's AC, in the current
roll mode. A line under the settings reminds you what you need on the die
and how often you hit. After the roll, the app tells you whether you **hit**
or **missed**, or shouts **Critical hit** or **Critical fail**.

With advantage or disadvantage, two d20s are thrown. The one that counts is
ringed in light, and the other fades.

Press **Damage** to go straight to the Damage tab and roll your damage. After
a critical hit the button turns into **Crit damage**, and your damage dice
are doubled automatically.

**Ability check** is for checks and saving throws. It has its own
**Modifier** and **Target DC**, kept apart from your attack, so a Dexterity
save never changes your weapon. Leave the DC at **Off** to just roll. With a
DC set, the app tells you whether you pass or fail, and how likely you were
to pass.

### Damage

The Damage tab rolls your attack's damage dice and adds the damage bonus.
Damage never goes below 0.

- **Double the dice** is for critical hits. It is switched on for you when
  you come from a critical hit on the Attack tab, and stays on until you
  switch it off.
- Under the settings, the app shows your average damage and the lowest and
  highest you can roll.
- If every die lands on its highest face, you see **Maximum damage**.

Press **Roll attack** to go back to the Attack tab and throw a new d20 for
your next attack.

### Percent

Percent rolls a d100, thrown as two ten-sided dice: a **tens** die (00 to 90)
and a **units** die (0 to 9). Add them together: 40 and 7 is 47. A 00 and a 0
is 100. Use it for wild magic, random tables and anything else your DM asks
for in percent.

### Recent rolls

Each rolling tab remembers your last few results. They appear under the
result in the arena and at the bottom of the tab's settings.

---

## Playing a turn

A typical turn with two attacks goes like this:

1. On the **Calculator**, set the **Enemy AC** if you know it, and the
   **roll mode**.
2. Press **Roll attack**. The app switches to the Attack tab and throws the
   d20.
3. If you hit, press **Damage**, or **Crit damage** after a critical hit.
   The app switches to the Damage tab and rolls your damage.
4. For your second attack, press **Roll attack** on the Damage tab. Then
   press **Damage** again if it hits.

Each attack is rolled on its own, so you always see what each swing did.

**Don't want to wait for the dice?** Tap the arena, or press the roll button
while it reads **Skip**. The dice land at once.

---

## Attack presets

A preset is a saved attack: the bonus, the dice, the damage bonus, the
number of attacks and the crit range. Each character can keep up to
**eight**. The enemy's AC and the roll mode are not part of a preset,
because they belong to the fight.

The **preset bar** sits at the top of the Calculator, the Attack roll and the
Damage tabs. It shows the loaded preset's name and a one-line summary, such
as "+7 to hit, 1d8 + 4, 2 attacks". Tap it to open the character's presets.

| To… | Do this |
| --- | --- |
| Load a preset | Tap its name. The list closes and the attack is ready. |
| Save the current attack | Tap **Save as new**, type a name, and press **Save** or Enter. |
| Keep your changes to a loaded preset | Tap **Update** *(name)*. |
| Rename a preset | Tap the pencil. |
| Delete a preset | Tap the **×**, then tap **Delete** to confirm. |

When you change something after loading a preset, the bar says **edited**.
The preset itself only changes when you tap **Update**.

---

## Your party

Tap the character's name at the top of the panel to open **The party**. On a
large screen you can also click a character in the column beside the arena.
Press `[` and `]` to step through the party.

Each character has:

- a **name** (up to 24 characters) and a short **note**, such as their class
  and level;
- a **dice colour**: Garnet, Emerald, Sapphire, Amethyst, Amber, Teal,
  Obsidian or Bone. Their dice are thrown in that colour;
- up to **eight attack presets**;
- their **own current attack**. When you switch back to a character, they
  are holding whatever you left them with.

The enemy's AC, the roll mode and the ability check stay the same when you
switch characters, so the whole table can roll against the same monster.

**In the party list:**

- Tap a character to make them the active one.
- Tap **New character** to add one, up to twelve. A new character starts with
  the attack you have on the table, so you can set it up and save it as
  their first preset.
- Tap **⋯** beside a character for more: **Edit** (name, note and dice
  colour), **Save file**, **For the app**, the arrows to move them up or
  down, and **Delete**. Delete asks you to confirm.

Two characters can't share a name. If you use a name that is taken, the app
adds a number, as in "Vex (2)".

---

## Saving, backing up and moving your party

**Your party saves itself.** Every change is kept in your browser
automatically. When you use the web link while signed in to Claude, it is
also saved to your account, so the same party opens on your phone and your
computer. If you changed it on two devices, the most recent version wins. The
party list tells you where your party is being kept.

**For a backup**, or to give a character to a friend, save a file:

| Button | What you get |
| --- | --- |
| **Save party** (bottom of the party list) | Everyone, as `dice-and-damage-party.json` |
| **Save file** (a character's ⋯ menu) | One character, as `name.json` |
| **For the app** (a character's ⋯ menu) | One character as a `session.txt` for the Dice & Damage Android app |

On the web link, your browser asks you to confirm each save. If the page
can't save a file where you are using it, it shows the text instead, with a
**Copy** button. Paste the text into a file and save it with the name shown.

**To load a file,** open the party and tap **Load file**. You can also drag a
file onto the page, or paste a file's text while the party list is open. The
app reads:

- a party file or a character file saved from Dice & Damage;
- the `session.txt` file from the Dice & Damage Android app. Its presets
  become a new character.

Before anything changes, the app tells you what the file holds and asks what
to do:

- **Add to the party** adds the characters as new ones.
- **Replace** *(name)* swaps a character for the one in the file with the
  same name.
- **Replace the party** swaps your whole party for the one in the file.

> **Tip:** saving files from a private or incognito window, or clearing your
> browser's data, can lose a party that lives only in the browser. Save a
> party file now and then.

---

## Colour schemes

Tap the button with three coloured dots, or press `c`, to change the colour
scheme. Press Shift + `c` to go back. There are eleven:

| Scheme | Mood |
| --- | --- |
| Dragon's Hoard | Gold and ember on dark stone (the default) |
| Spellbook | Ink on parchment (light) |
| Arcane Neon | Electric blue and magenta |
| Necrotic Bloom | Sickly greens |
| Frostbite | Ice blue and amber |
| Ink & Bone | Black and white |
| Infernal | Fire and brimstone |
| Feywild | Twilight violet, pink and mint |
| Underdark | Fungal glow in the deep dark |
| Abyssal Tide | Deep sea green and coral |
| Celestial | Silver, gold and sky blue (light) |

The first six match the Dice & Damage Android app. The Android app only has
those six, so a `session.txt` saved under one of the five new schemes opens
in Dragon's Hoard.

---

## Keyboard shortcuts

On a computer:

| Key | Action |
| --- | --- |
| `1` `2` `3` `4` | Calculator, Attack, Damage, Percent |
| Space or Enter | Roll (or Skip while dice are in the air) |
| `r` | Roll a new attack, from any tab |
| `a` / `n` / `v` | Advantage / Normal / Disadvantage |
| `p` | Open or close the presets |
| `k` | Open or close the party |
| `[` / `]` | Previous / next character |
| `c` / Shift + `c` | Next / previous colour scheme |
| Esc | Close the open sheet, or cancel typing a name |

Hold a **−** or **+** button to change a value quickly. If you slide off the
button before you let go, nothing changes.

---

## The rules it follows

Dice & Damage follows the D&D 5e rules for attacks:

- A **natural 20** always hits and is a critical hit. With a wider crit
  range (19–20 or 18–20), those rolls are critical hits too.
- A **natural 1** always misses, whatever your bonus.
- Otherwise, you hit when the d20 plus your attack bonus is **equal to or
  higher than** the enemy's AC.
- **Advantage** keeps the higher of two d20s. **Disadvantage** keeps the
  lower.
- A **critical hit** doubles the damage **dice**, not the damage bonus.
- **Damage** is never below 0, even with a negative bonus.
- **Ability checks and saving throws** have no critical hits. A natural 20 or
  a natural 1 is pointed out, but only the total against the DC decides.

The chances on the Calculator are worked out exactly from these rules, for
every possible roll of every die. The dice in the arena use your device's
secure random number generator, so every face is equally likely.

---

## Questions and answers

**The dice landed on a number. Is that really the result?**
Yes. The result is decided the moment you press the button, and the die
always comes to rest showing it. A d4 shows its result at the top point.

**Why doesn't Double the dice switch off by itself?**
So you can roll extra crit damage, such as a smite, after the first roll. It
is set for you each time you press Damage on the Attack tab: on after a
critical hit, off after a normal hit.

**I changed my attack and the preset bar says "edited". Did I lose the
preset?**
No. The preset is unchanged until you tap **Update** in the preset list. Tap
the preset's name to load it again as it was.

**Can I use it on my phone at the table?**
Yes. It works in portrait and landscape, and every control is sized for
fingers. The web link keeps your party in step between your phone and your
computer when you are signed in to Claude.

**The fonts look different when I'm offline.**
The standalone file loads its typefaces from the internet. Without a
connection it uses similar fonts that are already on your device. Everything
else works the same.

**How do I start over?**
Delete the characters you don't want in the party list. The party always
keeps at least one character. To keep a copy first, use **Save party**.

---

*For how the app is built and tested, see `DEVELOPERS.md`.*
