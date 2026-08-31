# Character Sheet

A D&D 2024 (5.5e) character sheet that computes itself. One data file holds the
base values — ability scores, proficiencies, feats, gear, prose — and everything
else is derived: modifiers, saves, skills, passives, armour class, hit points,
save DCs, carrying capacity, and the numbers embedded in feature text.

Currently rendering **Raki**, a Human Monk 3 of the Open Hand.

## Why

The previous version hardcoded every value, twice: once for the screen sheet and
again for the print sheet. Levelling up meant editing dozens of scattered spots
and hoping they stayed consistent. Now the level is a number in one file.

```
level: 3  ->  27 HP, +2 proficiency, d6 martial arts, 3 focus, DC 13, 1d10+7 deflect
level: 5  ->  43 HP, +3 proficiency, d8 martial arts, 5 focus, DC 14, 1d10+9 deflect
```

## Layout

| Path | Role |
|---|---|
| `characters/*.js` | Base values and authored prose. The only file you edit per character. |
| `src/rules.js` | Generic 5e chassis — modifiers, proficiency, saves, skills, passives, capacity. |
| `src/classes.js` | Per class, species and feat rules, behind uniform hooks. |
| `src/character.js` | Derives the complete sheet, and builds the `{token}` map. |
| `src/render/screen.js` | The dark on-screen sheet. |
| `src/render/print.js` | The dense black-and-white print sheet. |
| `src/dice.js` | Dice parsing and rolling. Pure, with an injectable RNG. |
| `src/inplay.js` | Browser runtime: hit points, pools, rests, rolls, death saves. |
| `index.html` | **Generated.** Do not edit; rebuild instead. |

`rules.js` never knows what a Monk is. `classes.js` declares that Monks get
`10 + Dex + Wis` armour class and Focus equal to their level; adding a Barbarian
means adding one entry, not touching the engine.

## Commands

```sh
deno run --allow-read tools/verify.js              # 78 derivation and dice checks
deno run --allow-read --allow-write tools/build.js # regenerate index.html
deno run --allow-read --allow-net tools/runtime-test.js  # 126 browser-behaviour checks
```

`verify.js` checks every derived number against a known-good hand-built sheet.
`runtime-test.js` loads the built page into a real DOM and drives it with
scripted dice, asserting on what the roll log actually shows.

Rebuild after editing anything in `src/`, `styles/` or `characters/`.

## Importing from D&D Beyond

```sh
python3 tools/import_ddb.py <character-id>
```

The character must be set to Public. This derives identity, ability scores and
their bonuses, feats, proficiencies, inventory and all prose. It cannot derive
the worn/pack inventory split, the feature cards, or the condensed print
wording — the generated file lists those as TODOs.

## In play

Hit points, focus and luck pools, rests and death saves all persist in
`localStorage`. Attacks roll to hit, wait for you to confirm Hit or Miss, then
roll damage; a natural 20 lands automatically with doubled dice, a natural 1
misses. Flurry of Blows spends the focus, rolls both strikes, and offers Open
Hand's Topple, Push or Addle on each landed hit.

**I roll** switches to manual dice: the sheet generates nothing and asks for
your numbers instead, while still applying modifiers, crit rules and effects.

## Not modelled

Deliberately, this is a character sheet and not a virtual tabletop. It tracks no
targets, enemy hit points, positions, turn order or conditions. Push moves a
target out of your reach; the sheet will not stop you attacking it again.

Feature text for levels beyond 3 is not yet written. The engine scales the
numbers correctly to level 20 today, but new cards are authored, not derived.
