// Generic D&D 2024 (5.5e) derivation engine.
//
// Everything in here is rules chassis that applies to any character: ability
// modifiers, proficiency, saves, skills, passives, carrying capacity, DCs.
// Anything class-specific lives in classes.js and is reached through hooks.
//
// The contract: a character data file supplies BASE values only. Nothing that
// can be computed should ever be written down by hand.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

// Skill -> governing ability. 2024 PHB list, unchanged from 2014.
export const SKILLS = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export const SKILL_NAMES = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
};

/** Ability modifier. floor((score - 10) / 2), negative-safe. */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus by total character level: +2 at 1-4, +3 at 5-8, ... */
export function proficiencyBonus(level) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

/** Render a number as a signed string: 6 -> "+6", -2 -> "-2", 0 -> "+0". */
export function signed(n) {
  return n < 0 ? String(n) : '+' + n;
}

/** Total level across all classes (multiclass-ready). */
export function totalLevel(classes) {
  return classes.reduce((sum, c) => sum + c.level, 0);
}

/**
 * Resolve final ability scores from base scores plus a flat list of bonuses.
 *
 * This mirrors how D&D Beyond stores a character: base scores are what you
 * assigned, and background ASIs / feats / items arrive as separate additive
 * entries. An `overrides` map wins outright, for the cases the engine can't
 * model.
 */
export function resolveAbilityScores(base, bonuses = [], overrides = {}) {
  const scores = {};
  for (const key of ABILITIES) {
    scores[key] = base[key] ?? 10;
  }
  for (const bonus of bonuses) {
    if (!(bonus.ability in scores)) continue;
    scores[bonus.ability] += bonus.value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) scores[key] = value;
  }

  const out = {};
  for (const key of ABILITIES) {
    out[key] = {
      key,
      name: ABILITY_NAMES[key],
      score: scores[key],
      mod: abilityModifier(scores[key]),
    };
  }
  return out;
}

/** Saving throws: ability mod, plus proficiency bonus where proficient. */
export function deriveSaves(abilities, proficient, pb) {
  const set = new Set(proficient);
  const out = {};
  for (const key of ABILITIES) {
    const isProficient = set.has(key);
    out[key] = {
      key,
      name: ABILITY_NAMES[key],
      proficient: isProficient,
      value: abilities[key].mod + (isProficient ? pb : 0),
    };
  }
  return out;
}

/**
 * Skills: ability mod, + PB if proficient, + PB again for expertise.
 * Every skill is returned, proficient or not, so a renderer can show the
 * full list (print sheet) or filter to the trained ones (screen sheet).
 */
export function deriveSkills(abilities, proficient, expertise, pb) {
  const profSet = new Set(proficient);
  const expSet = new Set(expertise);
  const out = {};
  for (const [skill, ability] of Object.entries(SKILLS)) {
    const isProficient = profSet.has(skill) || expSet.has(skill);
    const hasExpertise = expSet.has(skill);
    const rank = (isProficient ? 1 : 0) + (hasExpertise ? 1 : 0);
    out[skill] = {
      key: skill,
      name: SKILL_NAMES[skill],
      ability,
      proficient: isProficient,
      expertise: hasExpertise,
      value: abilities[ability].mod + pb * rank,
    };
  }
  return out;
}

/** Passive score: 10 + the relevant skill check bonus. */
export function passiveScore(skill) {
  return 10 + skill.value;
}

/** Carrying capacity in pounds: Strength score x 15. Push/drag/lift is x30. */
export function carryingCapacity(strScore) {
  return {
    capacity: strScore * 15,
    pushDragLift: strScore * 30,
  };
}

/** A save DC keyed off an ability: 8 + proficiency bonus + that ability's mod. */
export function saveDC(abilityMod, pb) {
  return 8 + pb + abilityMod;
}

/** Average hit points for a die: (sides / 2) + 1, the standard "take average". */
export function averageHitDie(sides) {
  return sides / 2 + 1;
}
