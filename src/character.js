// Takes a character data file and derives the complete sheet.
//
// This is the single entry point a renderer calls. Nothing downstream should
// ever do arithmetic; if a number appears on the sheet it was computed here.

import {
  ABILITIES,
  SKILLS,
  carryingCapacity,
  deriveSaves,
  deriveSkills,
  passiveScore,
  proficiencyBonus,
  resolveAbilityScores,
  signed,
  totalLevel,
} from './rules.js';

import { CLASSES, FEATS, SPECIES, classHitPoints, registryKey } from './classes.js';

/** Collect the rule entries that apply to this character, in priority order. */
function activeRules(data) {
  const entries = [];

  const species = SPECIES[registryKey(data.identity.species)];
  if (species) entries.push({ kind: 'species', rule: species });

  for (const cls of data.identity.classes) {
    const rule = CLASSES[registryKey(cls.name)];
    if (rule) entries.push({ kind: 'class', rule, classLevel: cls.level });
  }

  for (const feat of data.feats ?? []) {
    const rule = FEATS[registryKey(feat.name ?? feat)];
    if (rule) entries.push({ kind: 'feat', rule });
  }

  return entries;
}

/** Base hit points from class hit dice, using the fixed-average rules. */
function deriveBaseHitPoints(classes) {
  let total = 0;
  classes.forEach((cls, index) => {
    const rule = CLASSES[registryKey(cls.name)];
    if (!rule) return;
    total += classHitPoints(rule.hitDie, cls.level, index === 0);
  });
  return total;
}

export function deriveCharacter(data) {
  const level = totalLevel(data.identity.classes);
  const pb = proficiencyBonus(level);

  const abilities = resolveAbilityScores(
    data.abilities,
    data.abilityBonuses ?? [],
    data.abilityOverrides ?? {},
  );

  const rules = activeRules(data);
  const ctxFor = (entry) => ({
    abilities,
    pb,
    level,
    classLevel: entry.classLevel ?? level,
  });

  // --- Hit points -----------------------------------------------------------
  const baseHP = data.hp?.base ?? deriveBaseHitPoints(data.identity.classes);
  let hpPerLevel = abilities.con.mod;
  const hpSources = [{ label: 'Class hit dice', value: baseHP }];
  if (abilities.con.mod !== 0) {
    hpSources.push({
      label: `Constitution (${signed(abilities.con.mod)} x ${level})`,
      value: abilities.con.mod * level,
    });
  }
  for (const entry of rules) {
    const bonus = entry.rule.hpPerLevelBonus;
    if (!bonus) continue;
    hpPerLevel += bonus;
    hpSources.push({ label: `${entry.rule.name} (+${bonus} x ${level})`, value: bonus * level });
  }
  const hitPoints = {
    max: data.hp?.override ?? baseHP + (hpPerLevel * level),
    sources: hpSources,
    hitDice: data.identity.classes
      .map((c) => `${c.level}d${CLASSES[registryKey(c.name)]?.hitDie ?? 8}`)
      .join(' + '),
  };

  // --- Armour class ---------------------------------------------------------
  let armourClass = { value: 10 + abilities.dex.mod, source: 'Unarmoured' };
  if (data.ac?.override != null) {
    armourClass = { value: data.ac.override, source: data.ac.source ?? 'Override' };
  } else {
    for (const entry of rules) {
      const formula = entry.rule.acFormula;
      if (!formula) continue;
      const candidate = formula(ctxFor(entry));
      if (candidate && candidate.value > armourClass.value) armourClass = candidate;
    }
  }

  // --- Speed ----------------------------------------------------------------
  const speciesRule = SPECIES[registryKey(data.identity.species)];
  let speed = data.speed?.base ?? speciesRule?.speed ?? 30;
  const speedSources = [{ label: 'Base', value: speed }];
  for (const entry of rules) {
    if (!entry.rule.speedBonus) continue;
    const bonus = entry.rule.speedBonus(ctxFor(entry));
    if (!bonus) continue;
    speed += bonus;
    speedSources.push({ label: entry.rule.name, value: bonus });
  }

  // --- Resource pools -------------------------------------------------------
  const resources = [];
  for (const entry of rules) {
    if (!entry.rule.resources) continue;
    resources.push(...entry.rule.resources(ctxFor(entry)));
  }
  for (const extra of data.resources ?? []) resources.push(extra);

  // --- Saves, skills, passives ---------------------------------------------
  const saves = deriveSaves(abilities, data.proficiencies?.saves ?? [], pb);
  const skills = deriveSkills(
    abilities,
    data.proficiencies?.skills ?? [],
    data.proficiencies?.expertise ?? [],
    pb,
  );

  // Tools may name a governing ability, in which case the check bonus is
  // derived the same way a skill is. Tools without one just render their name.
  const tools = (data.proficiencies?.tools ?? []).map((tool) => {
    const entry = typeof tool === 'string' ? { name: tool } : tool;
    if (!entry.ability) return { ...entry, label: entry.name };
    const value = abilities[entry.ability].mod + pb;
    return { ...entry, value, label: `${entry.name} ${signed(value)}` };
  });

  const passives = {
    perception: passiveScore(skills.perception),
    insight: passiveScore(skills.insight),
    investigation: passiveScore(skills.investigation),
  };

  // --- Encumbrance ----------------------------------------------------------
  const inventory = (data.inventory ?? []).map((item) => ({
    ...item,
    totalWeight: (item.weight ?? 0) * (item.qty ?? 1),
  }));
  const weightIn = (where) =>
    inventory
      .filter((i) => i.carried === where)
      .reduce((sum, i) => sum + i.totalWeight, 0);
  const weight = {
    person: weightIn('person'),
    pack: weightIn('pack'),
    total: inventory.reduce((sum, i) => sum + i.totalWeight, 0),
  };

  // --- Per-class derived values --------------------------------------------
  const classDerived = {};
  for (const entry of rules) {
    if (entry.kind !== 'class' || !entry.rule.derived) continue;
    Object.assign(classDerived, entry.rule.derived(ctxFor(entry)));
  }

  // --- Text tokens ----------------------------------------------------------
  // Authored feature text uses {placeholders} so prose carries live numbers
  // instead of frozen ones: "each {unarmedAttack} for {unarmedDamage}".
  const tokens = {
    name: data.identity.name,
    level: String(level),
    pb: signed(pb),
    ac: String(armourClass.value),
    hp: String(hitPoints.max),
    speed: String(speed),
    initiative: signed(abilities.dex.mod),
    hitDice: hitPoints.hitDice,
    carry: String(carryingCapacity(abilities.str.score).capacity),
    // Hit points contributed by feats, so feat text can quote its own effect.
    hpFromFeats: String(
      rules
        .filter((e) => e.kind === 'feat' && e.rule.hpPerLevelBonus)
        .reduce((sum, e) => sum + e.rule.hpPerLevelBonus * level, 0),
    ),
  };
  for (const key of ABILITIES) {
    tokens[key] = String(abilities[key].score);
    tokens[`${key}Mod`] = signed(abilities[key].mod);
    tokens[`${key}Save`] = signed(saves[key].value);
  }
  for (const [key, skill] of Object.entries(skills)) {
    tokens[`${key}Skill`] = signed(skill.value);
  }
  for (const [key, value] of Object.entries(classDerived)) {
    tokens[key] = typeof value === 'number' && /(?:attack|Attack)$/.test(key)
      ? signed(value)
      : String(value);
  }
  for (const pool of resources) {
    tokens[`${pool.key}Max`] = String(pool.max);
  }

  return {
    identity: data.identity,
    level,
    proficiencyBonus: pb,
    tokens,
    abilities,
    saves,
    skills,
    passives,
    hitPoints,
    armourClass,
    speed: { value: speed, sources: speedSources },
    initiative: abilities.dex.mod,
    resources,
    carrying: carryingCapacity(abilities.str.score),
    classDerived,
    proficiencies: data.proficiencies ?? {},
    tools,
    features: data.features ?? [],
    actions: data.actions ?? [],
    inventory,
    weight,
    prose: data.prose ?? {},
    currency: data.currency ?? {},
  };
}

export { ABILITIES, SKILLS, signed };
