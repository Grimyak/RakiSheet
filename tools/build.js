// Builds a standalone character sheet from the modular source.
//
//   deno run --allow-read --allow-write tools/build.js [character]
//
// Output is index.html at the project root, beside assets/. The page is fully
// self-contained apart from those images, so it opens from file:// with no
// server, and GitHub Pages can serve the repository root as-is.

import { deriveCharacter } from '../src/character.js';
import { renderScreen } from '../src/render/screen.js';
import { renderPrint } from '../src/render/print.js';
import { fill } from '../src/render/html.js';

const which = Deno.args[0] ?? 'raki';
const data = (await import(`../characters/${which}.js`)).default;
const c = deriveCharacter(data);

const css = await Deno.readTextFile(new URL('../styles/sheet.css', import.meta.url));
const runtime = await Deno.readTextFile(new URL('../src/inplay.js', import.meta.url));

// dice.js is an ES module so the test suite can import it; the page needs it as
// a classic script, so the export keywords come off on the way in.
const dice = (await Deno.readTextFile(new URL('../src/dice.js', import.meta.url)))
  .replace(/^export function /gm, 'function ');

const slug = which;

/** Split "1d6+4 bludgeoning, reach 5 ft" into formula and damage type. */
function splitDamage(text) {
  const m = text.match(/^\s*(\d*d\d+(?:[+-]\d+)?)\s*(.*)$/);
  if (!m) return { formula: null, type: text.trim() };
  return { formula: m[1], type: m[2].split(',')[0].trim() };
}

// Everything the sheet can roll. Derived here so the runtime does no rules
// work of its own — it only evaluates dice expressions.
const attacks = c.features
  .filter((f) => f.attack && f.damage)
  .map((f) => {
    const { formula, type } = splitDamage(fill(f.damage, c.tokens));
    return {
      name: f.name,
      attack: Number(fill(f.attack, c.tokens).replace('+', '')),
      damage: formula,
      type,
      range: f.range ?? null,
      // Throwing a weapon costs you the weapon.
      pool: f.spends ? f.spends.pool : null,
      amount: f.spends ? f.spends.amount : 0,
    };
  });

const config = {
  slug,
  maxHP: c.hitPoints.max,
  pools: c.resources.map((r) => ({ key: r.key, max: r.max, recovery: r.recovery })),
  attacks,
  // The unarmed profile, which Flurry of Blows repeats.
  unarmed: attacks[0] ?? null,
  checks: {
    initiative: c.initiative,
    abilities: Object.values(c.abilities).map((a) => ({ key: a.key, name: a.name, value: a.mod })),
    saves: Object.values(c.saves).map((s) => ({ key: s.key, name: s.name, value: s.value })),
    skills: Object.values(c.skills).map((s) => ({ key: s.key, name: s.name, value: s.value })),
  },
  actions: c.actions.map((a) => ({
    name: a.name,
    pool: a.pool ?? null,
    amount: a.amount ?? 0,
    special: a.special ?? null,
    roll: a.roll ? fill(a.roll, c.tokens) : null,
    attacks: a.attacks ?? 0,
    apply: a.apply ?? null,
    effects: a.effects ?? null,
  })),
  // Rider effects a hit can impose, grouped by the section they live in.
  // Flurry of Blows references 'openHand'; another subclass would add its own.
  effects: Object.fromEntries(
    [...new Set(c.features.filter((f) => f.effect).map((f) => f.section))]
      .map((section) => [
        section,
        c.features.filter((f) => f.section === section && f.effect).map((f) => ({
          name: f.name,
          save: f.effect.save,
          dc: f.effect.dc ? fill(f.effect.dc, c.tokens) : null,
          onFail: f.effect.onFail,
        })),
      ]),
  ),
};

// The print sheet comes first in source order, matching the original: the
// print stylesheet hides .wrap and reveals .print-sheet.
// The print sheet comes first in source order: the print stylesheet hides
// .wrap and reveals .print-sheet.
const body = [renderPrint(c), renderScreen(c)].join('\n\n');

// A token that never resolved is a typo in a character file; fail loudly
// rather than shipping "{unarmedAtack}" onto the page.
if (fill.misses.size) {
  console.error('Unresolved tokens:', [...fill.misses].join(', '));
  Deno.exit(1);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.identity.name} — ${c.identity.classes.map((k) => `${k.name} ${k.level}`).join(' / ')}</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script>window.SHEET_CONFIG = ${JSON.stringify(config)};</script>
<script>
${dice}
${runtime}
</script>
</body>
</html>
`;

// Written to the project root so GitHub Pages can serve it directly; the
// page references assets/ which already sits alongside it.
await Deno.writeTextFile(new URL('../index.html', import.meta.url), page);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`built index.html  ${kb(page.length)}`);
console.log(`  character   ${c.identity.name}, level ${c.level}`);
console.log(`  pools       ${config.pools.map((p) => `${p.key} ${p.max}`).join(', ')}`);
console.log(`  features    ${c.features.length}, actions ${c.actions.length}`);
