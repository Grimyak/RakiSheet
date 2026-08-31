// Class, species and feat rules for D&D 2024 (5.5e).
//
// rules.js holds the chassis that applies to everyone. This file holds the
// parts that differ per class/species/feat, behind a uniform hook shape so
// the renderer never needs to special-case anything.
//
// Each entry may contribute:
//   acFormula(ctx)     -> { value, source } | null
//   speedBonus(ctx)    -> number
//   resources(ctx)     -> [{ key, label, max, recovery }]
//   hpPerLevelBonus    -> number added to HP for every character level
//   derived(ctx)       -> arbitrary extra values a renderer may show
//
// ctx = { abilities, pb, level, classLevel, scores }
//
// Only what Raki actually needs is filled in. Adding a class means adding an
// entry here, not touching the engine.

import { averageHitDie, saveDC, signed } from './rules.js';

/** Pick the value for the highest level threshold that is <= level. */
function byLevel(table, level) {
  let value = table[0][1];
  for (const [threshold, entry] of table) {
    if (level >= threshold) value = entry;
  }
  return value;
}

export const CLASSES = {
  monk: {
    name: 'Monk',
    hitDie: 8,
    defaultSaves: ['str', 'dex'],
    // The Monk's save DC (Focus features, Open Hand) is Wisdom-based.
    dcAbility: 'wis',

    // Martial Arts die by Monk level.
    martialArtsDie: (lvl) => byLevel([[1, 6], [5, 8], [11, 10], [17, 12]], lvl),

    // Unarmored Movement bonus by Monk level. Kicks in at 2.
    unarmoredMovement: (lvl) =>
      byLevel([[1, 0], [2, 10], [6, 15], [10, 20], [14, 25]], lvl),

    // Unarmored Defense: 10 + Dex + Wis, only while unarmoured and shieldless.
    acFormula: ({ abilities }) => ({
      value: 10 + abilities.dex.mod + abilities.wis.mod,
      source: 'Unarmored Defense',
    }),

    speedBonus: ({ classLevel }) => CLASSES.monk.unarmoredMovement(classLevel),

    // Focus Points equal Monk level, from level 2. Back on a short rest.
    resources: ({ classLevel }) =>
      classLevel >= 2
        ? [{ key: 'focus', label: 'Focus', max: classLevel, recovery: 'short' }]
        : [],

    derived: ({ abilities, pb, classLevel }) => {
      const die = CLASSES.monk.martialArtsDie(classLevel);
      const out = {
        martialArtsDie: `d${die}`,
        // Martial Arts lets Dex replace Str for Unarmed Strikes, Monk weapons,
        // and the DC when Grappling or Shoving.
        unarmedAttack: abilities.dex.mod + pb,
        // signed() throughout: a negative modifier must read 1d6-1, not 1d6+-1.
        unarmedDamage: `1d${die}${signed(abilities.dex.mod)}`,
        grappleShoveDC: saveDC(abilities.dex.mod, pb),
        focusSaveDC: saveDC(abilities.wis.mod, pb),
      };
      if (classLevel >= 2) {
        // Uncanny Metabolism: all Focus back, plus martial arts die + level HP.
        out.uncannyMetabolismHeal = `1d${die}+${classLevel}`;
      }
      if (classLevel >= 3) {
        // Deflect Attacks: reduce a B/P/S hit by 1d10 + Dex + Monk level.
        out.deflectReduction = `1d10${signed(abilities.dex.mod + classLevel)}`;
        out.deflectRedirect = `2d6${signed(abilities.dex.mod)}`;
      }
      return out;
    },
  },
};

export const SPECIES = {
  human: {
    name: 'Human',
    size: 'Medium',
    speed: 30,
    // Resourceful grants Heroic Inspiration on every long rest.
    resources: () => [
      { key: 'inspiration', label: 'Inspiration', full: 'Heroic Inspiration', max: 1, recovery: 'long' },
    ],
  },
};

export const FEATS = {
  lucky: {
    name: 'Lucky',
    // 2024: Luck Points equal your proficiency bonus, regained on a long rest.
    resources: ({ pb }) => [
      { key: 'luck', label: 'Luck', max: pb, recovery: 'long' },
    ],
  },
  tough: {
    name: 'Tough',
    // HP maximum increases by 2 per character level.
    hpPerLevelBonus: 2,
  },
};

/** Normalise a display name to a registry key: "Warrior of the Open Hand" -> ... */
export function registryKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Average-rules hit points for a class at a given level (first level maxed). */
export function classHitPoints(hitDie, level, isFirstClass) {
  if (level <= 0) return 0;
  const afterFirst = (level - (isFirstClass ? 1 : 0)) * averageHitDie(hitDie);
  return (isFirstClass ? hitDie : 0) + afterFirst;
}
