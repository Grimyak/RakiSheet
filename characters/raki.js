// Raki — Human Monk 3, Warrior of the Open Hand.
//
// BASE VALUES ONLY. Every number that can be computed from these is computed
// in src/character.js and must not be written here. If you find yourself
// typing a modifier, a save, a DC, an AC or a weight total, it belongs in the
// engine instead.
//
// Imported from D&D Beyond character 169780614.

export default {
  identity: {
    name: 'Raki',
    species: 'Human',
    background: 'Wayfarer',
    alignment: 'Neutral Good',
    classes: [
      { name: 'Monk', level: 3, subclass: 'Warrior of the Open Hand' },
    ],
    gloss:
      "He was never going to hit hard. The open hand doesn't generate force. " +
      "It borrows it, and lets a man's own weight put him on the floor.",
    physical: {
      age: 24,
      height: '5′7″',
      weight: '115 lb',
      eyes: 'Dark Brown',
      hair: 'Bald',
      skin: 'Tan',
    },
  },

  // Base scores as assigned, before any background ASI or feat.
  abilities: { str: 6, dex: 17, con: 12, int: 11, wis: 15, cha: 11 },

  // Wayfarer background ability score improvements.
  abilityBonuses: [
    { ability: 'dex', value: 2, source: 'Wayfarer' },
    { ability: 'wis', value: 1, source: 'Wayfarer' },
  ],

  feats: [
    { name: 'Lucky', source: 'Wayfarer origin feat' },
    { name: 'Tough', source: 'Human Versatile' },
  ],

  proficiencies: {
    saves: ['str', 'dex'],
    skills: [
      'acrobatics', // Monk
      'religion', // Monk
      'insight', // Wayfarer
      'stealth', // Wayfarer
      'perception', // Human Skillful
    ],
    expertise: [],
    armour: [],
    weapons: ['Simple', 'Scimitar', 'Shortsword', 'Hand Crossbow'],
    tools: [{ name: "Thieves' Tools", ability: 'dex' }, { name: 'Horn' }],
    languages: ['Common', 'Dwarvish', 'Common Sign Language'],
  },

  // `carried` splits worn kit from pack contents; DDB does not model this.
  // Weights are per unit and totalled by the engine.
  inventory: [
    { name: 'Dagger', qty: 7, weight: 1, carried: 'person' },
    { name: 'Quarterstaff', qty: 1, weight: 4, carried: 'person' },
    { name: "Traveler's Clothes", qty: 1, weight: 4, carried: 'person' },
    { name: "Thieves' Tools", qty: 1, weight: 1, carried: 'person' },
    { name: 'Horn', qty: 1, weight: 0, carried: 'person' },
    { name: 'Backpack', qty: 1, weight: 5, carried: 'pack' },
    { name: 'Rations', qty: 10, weight: 2, carried: 'pack' },
    { name: 'Torch', qty: 10, weight: 1, carried: 'pack' },
    { name: 'Bedroll', qty: 1, weight: 7, carried: 'pack' },
    { name: 'Rope', qty: 1, weight: 5, carried: 'pack' },
    { name: 'Waterskin', qty: 1, weight: 5, carried: 'pack' },
    { name: 'Oil', qty: 2, weight: 1, carried: 'pack' },
    { name: 'Tinderbox', qty: 1, weight: 1, carried: 'pack' },
    { name: 'Pouch', qty: 2, weight: 1, carried: 'pack' },
  ],

  currency: { gp: 27 },

  // Feature cards. `{tokens}` are filled from the derived character, so these
  // stay correct at any level. `short` is the condensed print-sheet wording.
  features: [
    // --- Attacks ------------------------------------------------------------
    {
      section: 'attacks',
      kind: 'Action or bonus action',
      name: 'Unarmed Strike',
      cost: '{unarmedAttack}',
      attack: '{unarmedAttack}',
      damage: '{unarmedDamage} bludgeoning',
      text: '{unarmedDamage} bludgeoning, reach 5 ft. Available as an Action, and again as a Bonus Action.',
    },
    {
      section: 'attacks',
      kind: 'Bonus action',
      name: 'Flurry of Blows',
      cost: '1 Focus',
      text: 'Two Unarmed Strikes as a Bonus Action, each at {unarmedAttack} for {unarmedDamage}. Every hit imposes one Open Hand effect.',
      short: '(1 Focus, bonus action) — Two Unarmed Strikes; each hit: Topple, Push or Addle.',
    },
    {
      section: 'attacks',
      kind: 'Weapon',
      name: 'Quarterstaff',
      cost: '{unarmedAttack}',
      attack: '{unarmedAttack}',
      damage: '{unarmedDamage} bludgeoning',
      text: '{unarmedDamage} bludgeoning, reach 5 ft. Simple, Versatile.',
    },
    {
      section: 'attacks',
      kind: 'Weapon',
      name: 'Dagger',
      cost: '{unarmedAttack}',
      attack: '{unarmedAttack}',
      damage: '1d4{dexMod} piercing, thrown 20/60',
      tableName: 'Dagger (&times;7)',
      text: '1d4{dexMod} piercing, reach 5 ft, or thrown at 20/60 ft. Simple, Finesse, Light, Thrown. Seven carried.',
    },
    {
      section: 'attacks',
      kind: 'Unarmed Strike option',
      name: 'Grapple',
      cost: 'DC {grappleShoveDC}',
      text: 'Replaces the damage of an Unarmed Strike. Str or Dex save, target chooses, or it has the Grappled condition.',
    },
    {
      section: 'attacks',
      kind: 'Unarmed Strike option',
      name: 'Shove',
      cost: 'DC {grappleShoveDC}',
      text: 'Replaces the damage of an Unarmed Strike. Str or Dex save, target chooses, or pushed 5 ft away or knocked Prone.',
    },

    // --- Open Hand Technique -------------------------------------------------
    {
      section: 'openHand',
      kind: 'Subclass feature',
      name: 'Topple',
      effect: { save: 'Dex', dc: '{focusSaveDC}', onFail: 'knocked Prone — advantage for everyone in melee' },
      short: '— Dex save DC {focusSaveDC} or prone.',
      text: 'Dex save DC {focusSaveDC} or Prone. Advantage for everyone in melee.',
    },
    {
      section: 'openHand',
      kind: 'Subclass feature',
      name: 'Push',
      effect: { save: 'Str', dc: '{focusSaveDC}', onFail: 'shoved 15 ft away' },
      short: '— Str save DC {focusSaveDC}, shoved 15 ft.',
      text: 'Str save DC {focusSaveDC}, shoved 15 ft.',
    },
    {
      section: 'openHand',
      kind: 'Subclass feature',
      name: 'Addle',
      effect: { save: null, dc: null, onFail: 'no Opportunity Attacks until the start of its next turn' },
      short: '— No Opportunity Attacks until its next turn.',
      text: 'No Opportunity Attacks until the start of its next turn.',
    },

    // --- Reaction & reserves --------------------------------------------------
    {
      section: 'reserves',
      kind: 'Class feature · Reaction',
      name: 'Deflect Attacks',
      text: 'Reduce any bludgeoning, piercing or slashing hit by <strong>{deflectReduction}</strong>. At zero, 1 Focus redirects it. A creature within 5 ft for melee, or 60 ft for ranged, makes a DC {focusSaveDC} Dex save or takes {deflectRedirect} of the same type.',
      short: '(reaction) — Reduce a B/P/S hit by {deflectReduction}. At 0, 1 Focus redirects: DC {focusSaveDC} Dex save or {deflectRedirect} same type.',
    },
    {
      section: 'reserves',
      kind: 'Class feature',
      name: 'Uncanny Metabolism',
      short: '(1/long rest) — On initiative, regain all Focus and {uncannyMetabolismHeal} HP.',
      cost: '1 / long rest',
      text: 'On rolling initiative, regain <strong>all</strong> Focus Points and {uncannyMetabolismHeal} hit points.',
    },
    {
      section: 'reserves',
      kind: 'Feat',
      name: 'Lucky',
      cost: '{luckMax}/long rest',
      text: 'Spend 1 for advantage on any d20 test he makes, or 1 to impose disadvantage on an attack roll against him. Back on a long rest.',
      short: '({luckMax}/long rest, feat) — Advantage on a d20 test, or impose disadvantage on an attack against him.',
    },
    {
      section: 'reserves',
      kind: 'Feat',
      name: 'Tough',
      text: 'Hit Point maximum raised by 2 at every character level, currently {hpFromFeats} in total.',
      short: '(feat) — +2 HP per level, {hpFromFeats} total (included above).',
    },
    {
      section: 'reserves',
      kind: 'Species trait',
      name: 'Heroic Inspiration',
      short: '(Human) — Free after every long rest.',
      text: 'Granted free after every long rest, from being Human.',
    },
    {
      section: 'reserves',
      kind: 'Class feature · Bonus action',
      name: 'Patient Defense',
      cost: '1 Focus',
      text: 'Disengage <em>and</em> Dodge as a Bonus Action. Disengage on its own is free.',
      short: '(1 Focus, bonus action) — Disengage + Dodge.',
    },
    {
      section: 'reserves',
      kind: 'Class feature · Bonus action',
      name: 'Step of the Wind',
      cost: '1 Focus',
      text: 'Disengage <em>and</em> Dash as a Bonus Action, jump distance doubled. Dash on its own is free.',
      short: '(1 Focus, bonus action) — Disengage + Dash, jump doubled.',
    },

    // --- Core traits ----------------------------------------------------------
    {
      section: 'core',
      kind: 'Class feature',
      name: 'Martial Arts',
      short: '({martialArtsDie}) — Dex for unarmed/monk weapon attacks, damage and Grapple/Shove DC; bonus action Unarmed Strike.',
      cost: '{martialArtsDie}',
      text: 'Dexterity replaces Strength on attack and damage rolls with Unarmed Strikes and Monk weapons, and on the save DC when he Grapples or Shoves. Unarmed Strike damage uses a {martialArtsDie}.',
    },
    {
      section: 'core',
      kind: 'Class feature',
      name: 'Unarmored Defense',
      short: '— AC = 10 + Dex + Wis = {ac}.',
      text: 'Base AC is 10 plus Dexterity plus Wisdom, which comes to {ac}. Lost the moment he wears armour or holds a Shield.',
    },
    {
      section: 'core',
      kind: 'Class feature',
      name: 'Unarmored Movement',
      short: '— Speed {speed} ft.',
      text: 'Speed raised to {speed} ft. Also lost while wearing armour or holding a Shield.',
    },
    {
      section: 'core',
      kind: 'Species traits',
      name: 'Human',
      short: '— Resourceful, Skillful, Versatile.',
      text: 'Medium. Resourceful grants Heroic Inspiration on a long rest, Skillful granted Perception, and Versatile granted the Tough feat.',
    },
  ],

  // In Play — the spendable ones, wired to resource pools by key.
  actions: [
    {
      name: 'Flurry of Blows',
      pool: 'focus',
      amount: 1,
      attacks: 2,
      effects: 'openHand',
      text: 'Two Unarmed Strikes as a Bonus Action, each {unarmedAttack} to hit for {unarmedDamage} and imposing one Open Hand effect (Topple/Push: DC {focusSaveDC} save).',
    },
    {
      name: 'Patient Defense',
      pool: 'focus',
      amount: 1,
      text: 'Disengage and Dodge as a Bonus Action.',
    },
    {
      name: 'Step of the Wind',
      pool: 'focus',
      amount: 1,
      text: 'Disengage and Dash as a Bonus Action, jump distance doubled.',
    },
    {
      name: 'Deflect Attacks · Redirect',
      pool: 'focus',
      amount: 1,
      roll: '{deflectReduction}',
      text: 'Reduces a bludgeoning, piercing, or slashing hit by {deflectReduction}. Redirect threshold: only if that reduction brings the hit to exactly 0. Attacker (5 ft melee / 60 ft ranged) makes a DC {focusSaveDC} Dex save or takes {deflectRedirect} of the same type.',
    },
    {
      name: 'Lucky',
      pool: 'luck',
      amount: 1,
      badge: '{luckMax}/long rest',
      text: 'Spend for advantage on a d20 test, or to impose disadvantage on an attack against him.',
    },
    {
      name: 'Uncanny Metabolism',
      special: 'refillFocus',
      roll: '{uncannyMetabolismHeal}',
      apply: 'heal',
      badge: '1/long rest',
      text: 'Restores all Focus Points automatically. Roll {uncannyMetabolismHeal} and add the result to Hit Points above.',
    },
  ],

  prose: {
    ideal:
      'Weight decides nothing. The largest man in the room does not get to ' +
      'determine what happens in it.',
    traits: [
      "He watches hands, not faces. A street habit that never left. He'll tell " +
        "you where everyone in a room is standing, who's armed and who moved, " +
        'and won’t have registered the conversation.',
      "He doesn't argue, he just doesn't comply. Nods, agrees, and then does " +
        'the thing he was going to do. Confrontation was never a tool available ' +
        'to him, so he never learned to use it.',
    ],
    bonds: [
      "Bruni's beads, and the word he was named with. He'll pronounce it for " +
        'any dwarf who asks and has never let one translate it.',
    ],
    flaws: [
      'He reads people too well to be honest with them.',
      'Compulsion toward bigger opponents.',
    ],
    appearance:
      'A small, shaven-headed young man in patched travelling clothes several ' +
      'sizes too generous for him, hands bound in dirty linen, carrying a ' +
      "crooked walking staff. Lockpicks hang openly from his belt beside a " +
      "dwarf's prayer beads.",
    backstory:
      'Street child, no name and no city. A travelling dwarf monk named Bruni ' +
      'caught him picking a lock and simply never left, twelve years of ' +
      'walking, no monastery, no order. Bruni taught him to fight by borrowing ' +
      "other men's force, because Raki has none of his own. Then someone " +
      'killed Bruni, and Raki was there, and it made no difference at all. ' +
      "He's still walking, because it's the only thing he was ever taught to do.",
    allies:
      'Bruni: dwarf monk. Deceased. Took him off the street at roughly eight, ' +
      'taught him everything, never explained why. The only ally he’s ever had.',
    organizations:
      'None, no order, no monastery, no chapter house. Whatever tradition ' +
      'Bruni came from, Raki learned it secondhand on the road and has never ' +
      'met another practitioner. He couldn’t name the school if you asked.',
    enemies:
      'Whoever killed Bruni: unidentified. Raki was present. He doesn’t know ' +
      'their name, their face may or may not be clear to him, and he is ' +
      'nowhere near capable of doing anything about it.',
  },
};
