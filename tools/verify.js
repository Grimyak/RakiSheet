// Verifies the derivation engine against the hand-built sheet.
//
// Every expected value below was read off the original index.html, which was
// assembled by hand and is known good. If the engine reproduces all of it from
// base scores alone, the derivation is trustworthy.
//
//   deno run tools/verify.js

import raki from '../characters/raki.js';
import { deriveCharacter } from '../src/character.js';
import { signed } from '../src/rules.js';
import { renderScreen } from '../src/render/screen.js';
import { renderPrint } from '../src/render/print.js';
import { fill } from '../src/render/html.js';
import { parseDice, rollD20, rollDice } from '../src/dice.js';

// A scripted RNG, so dice results are deterministic in the suite.
const scripted = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const c = deriveCharacter(raki);

// Render both views so the checks below can assert against real output.
const screenHTML = renderScreen(c);
const printHTML = renderPrint(c);

// A character with a negative Dex, to catch sign-handling regressions:
// damage must read "1d6-1", never "1d6+-1".
const frail = structuredClone(raki);
frail.abilities.dex = 6;
frail.abilityBonuses = [];
const frailC = deriveCharacter(frail);

const checks = [
  ['Str score', c.abilities.str.score, 6],
  ['Str mod', signed(c.abilities.str.mod), '-2'],
  ['Dex score', c.abilities.dex.score, 19],
  ['Dex mod', signed(c.abilities.dex.mod), '+4'],
  ['Con score', c.abilities.con.score, 12],
  ['Wis score', c.abilities.wis.score, 16],
  ['Wis mod', signed(c.abilities.wis.mod), '+3'],

  ['Proficiency bonus', signed(c.proficiencyBonus), '+2'],
  ['Armour Class', c.armourClass.value, 17],
  ['AC source', c.armourClass.source, 'Unarmored Defense'],
  ['Hit points', c.hitPoints.max, 27],
  ['Hit dice', c.hitPoints.hitDice, '3d8'],
  ['Speed', c.speed.value, 40],
  ['Initiative', signed(c.initiative), '+4'],

  ['Save: Strength', signed(c.saves.str.value), '+0'],
  ['Save: Dexterity', signed(c.saves.dex.value), '+6'],
  ['Save: Constitution', signed(c.saves.con.value), '+1'],
  ['Save: Wisdom', signed(c.saves.wis.value), '+3'],

  ['Skill: Acrobatics', signed(c.skills.acrobatics.value), '+6'],
  ['Skill: Stealth', signed(c.skills.stealth.value), '+6'],
  ['Skill: Insight', signed(c.skills.insight.value), '+5'],
  ['Skill: Perception', signed(c.skills.perception.value), '+5'],
  ['Skill: Religion', signed(c.skills.religion.value), '+2'],
  ['Skill: Sleight of Hand', signed(c.skills.sleightOfHand.value), '+4'],
  ['Skill: Athletics', signed(c.skills.athletics.value), '-2'],

  ['Passive Perception', c.passives.perception, 15],
  ['Passive Insight', c.passives.insight, 15],
  ['Passive Investigation', c.passives.investigation, 10],

  ['Martial Arts die', c.classDerived.martialArtsDie, 'd6'],
  ['Unarmed attack', signed(c.classDerived.unarmedAttack), '+6'],
  ['Unarmed damage', c.classDerived.unarmedDamage, '1d6+4'],
  ['Focus save DC', c.classDerived.focusSaveDC, 13],
  ['Grapple/Shove DC', c.classDerived.grappleShoveDC, 14],
  ['Deflect reduction', c.classDerived.deflectReduction, '1d10+7'],
  ['Deflect redirect', c.classDerived.deflectRedirect, '2d6+4'],
  ['Uncanny Metabolism heal', c.classDerived.uncannyMetabolismHeal, '1d6+3'],

  ['Focus points', c.resources.find((r) => r.key === 'focus')?.max, 3],
  ['Focus recovery', c.resources.find((r) => r.key === 'focus')?.recovery, 'short'],
  ['Luck points', c.resources.find((r) => r.key === 'luck')?.max, 2],
  ['Heroic Inspiration', c.resources.find((r) => r.key === 'inspiration')?.max, 1],

  ['Carrying capacity', c.carrying.capacity, 90],
  ['Push/drag/lift', c.carrying.pushDragLift, 180],
  ['Worn weight', c.weight.person, 16],
  // The original sheet said 55/71. It omitted the two Pouches that are in the
  // D&D Beyond inventory (1 lb each), so the correct totals are 57/73.
  ['Pack weight', c.weight.pack, 57],
  ['Total weight', c.weight.total, 73],

  // --- Negative modifier handling ------------------------------------------
  ['Frail unarmed damage', frailC.classDerived.unarmedDamage, '1d6-2'],
  ['Frail deflect', frailC.classDerived.deflectReduction, '1d10+1'],
  ['Frail redirect', frailC.classDerived.deflectRedirect, '2d6-2'],
  ['No doubled signs', /\+[+-]\d/.test(renderPrint(frailC)), false],

  // --- Rendered output ------------------------------------------------------
  ['Screen: no stray tokens', /\{[a-zA-Z]+\}/.test(screenHTML), false],
  ['Print: no stray tokens', /\{[a-zA-Z]+\}/.test(printHTML), false],
  ['Print: all 18 skills', (printHTML.match(/ps-sk-name">[^<]+ \((?:Str|Dex|Con|Int|Wis|Cha)\)/g) ?? []).length, 18],
  ['Print: two pages', (printHTML.match(/class="ps-page"/g) ?? []).length, 2],
  // Unarmed Strike, Quarterstaff, Dagger, Dagger thrown.
  ['Print: attack rows', (printHTML.match(/<tr><td>/g) ?? []).length, 4],
  ['Screen: AC rendered', screenHTML.includes('<b>17</b>'), true],
  ['Print: AC rendered', printHTML.includes('<b>17</b>'), true],
  ['Unresolved token count', fill.misses.size, 0],

  // --- Dice parsing ---------------------------------------------------------
  ['Parse 1d6+4 count', parseDice('1d6+4').count, 1],
  ['Parse 1d6+4 sides', parseDice('1d6+4').sides, 6],
  ['Parse 1d6+4 mod', parseDice('1d6+4').mod, 4],
  ['Parse 2d6+4 count', parseDice('2d6+4').count, 2],
  ['Parse d20 defaults', parseDice('d20').count, 1],
  ['Parse 1d10-1 mod', parseDice('1d10-1').mod, -1],
  ['Parse rejects junk', parseDice('sword'), null],

  // Every formula the sheet can produce must be parseable.
  ['All attack formulas parse',
    c.features.filter((f) => f.damage)
      .every((f) => parseDice(fill(f.damage, c.tokens).split(' ')[0]) !== null), true],
  ['All feature dice parse',
    Object.values(c.classDerived)
      .filter((v) => typeof v === 'string' && /^\d*d\d/.test(v))
      .every((v) => parseDice(v) !== null), true],

  // --- Rolling --------------------------------------------------------------
  // 2024 crit rule: double the dice, never the modifier. 2d6+4 crit -> 4 dice.
  ['Crit doubles dice only', rollDice('2d6+4', true, scripted(3)).total, 3 * 4 + 4],
  ['Crit dice count', rollDice('2d6+4', true, scripted(3)).rolls.length, 4],
  ['Normal dice count', rollDice('2d6+4', false, scripted(3)).rolls.length, 2],
  ['Negative modifier', rollDice('1d6-2', false, scripted(5)).total, 3],

  ['Advantage takes higher', rollD20(0, 'adv', scripted(7, 15)).natural, 15],
  ['Disadvantage takes lower', rollD20(0, 'dis', scripted(7, 15)).natural, 7],
  ['Flat rolls once', rollD20(0, 'flat', scripted(7, 15)).pair, null],
  ['Modifier applied', rollD20(6, 'flat', scripted(10)).total, 16],
  ['Nat 20 crits', rollD20(6, 'flat', scripted(20)).crit, true],
  ['Nat 1 fumbles', rollD20(6, 'flat', scripted(1)).fumble, true],
  ['19 is not a crit', rollD20(6, 'flat', scripted(19)).crit, false],
  ['Crit on the kept die only', rollD20(0, 'dis', scripted(20, 3)).crit, false],
];

let failed = 0;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  if (!ok) failed++;
  const mark = ok ? '  ok  ' : ' FAIL ';
  const detail = ok ? String(actual) : `got ${actual}, expected ${expected}`;
  console.log(`${mark} ${label.padEnd(24)} ${detail}`);
}

console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed) Deno.exit(1);
