// Renders the dark, on-screen character sheet.
//
// Ports the layout of the original hand-built index.html, but every value now
// comes from the derived character rather than being typed into the markup.

import { ABILITIES, SKILLS, signed } from '../rules.js';
import { each, esc, fill, join, when } from './html.js';

const SECTION_TITLES = {
  attacks: 'Attacks',
  openHand: 'Open Hand Technique, one per Flurry hit',
  reserves: 'Reaction &amp; reserves',
  core: 'Core traits',
};

/** A feature card. Feature text is trusted markup and passes through raw. */
function card(feature, t) {
  return `      <div class="card">
        <span class="kind">${esc(feature.kind ?? '')}</span><h3>${esc(feature.name)}${
    when(feature.cost, `<span class="cost">${fill(feature.cost ?? '', t)}</span>`)
  }</h3>
        <p>${fill(feature.text, t)}</p>
      </div>`;
}

function featureSection(section, features, t) {
  const inSection = features.filter((f) => f.section === section);
  if (!inSection.length) return '';
  return `  <section>
    <details>
    <summary class="label">${SECTION_TITLES[section] ?? esc(section)}</summary>
    <div class="cols">
${each(inSection, (f) => card(f, t))}
    </div>
    </details>
  </section>`;
}

function abilityBlock(c) {
  return each(ABILITIES, (key) => {
    const a = c.abilities[key];
    const save = c.saves[key];
    const weak = a.mod < 0 ? ' weak' : '';
    const bead = save.proficient ? '' : ' off';
    return `        <div class="abil${weak}"><div class="nm">${a.name.slice(0, 3)}</div>` +
      `<div class="sc">${a.score}</div>` +
      `<div class="md rollable" data-roll-check="${key}" title="Roll ${a.name} check">${signed(a.mod)}</div>` +
      `<div class="sv rollable" data-roll-save="${key}" title="Roll ${a.name} save">` +
      `<span class="bead${bead}"></span>${signed(save.value)}</div></div>`;
  });
}

function skillRows(c) {
  // Trained skills first, in descending order, then a catch-all line.
  const trained = Object.values(c.skills)
    .filter((s) => s.proficient)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const notable = Object.values(c.skills)
    .filter((s) => !s.proficient && s.value >= c.abilities.dex.mod)
    .sort((a, b) => b.value - a.value)
    .slice(0, 1);

  return join([
    each(trained, (s) =>
      `            <li class="rollable" data-roll-skill="${s.key}" title="Roll ${esc(s.name)}">` +
      `<span class="bead"></span><span class="prof">${esc(s.name)}</span>` +
      `<span class="v">${signed(s.value)}</span></li>`),
    each(notable, (s) =>
      `            <li class="rollable" data-roll-skill="${s.key}" title="Roll ${esc(s.name)}">` +
      `<span class="bead off"></span><span class="none">${esc(s.name)}</span>` +
      `<span class="v">${signed(s.value)}</span></li>`),
    `            <li><span class="bead off"></span><span class="none">All others</span>` +
    `<span class="v" style="color:var(--bone-dim)">by ability</span></li>`,
  ]);
}

function glanceRows(c) {
  const focus = c.resources.find((r) => r.key === 'focus');
  const rows = [
    ['Initiative', signed(c.initiative), 'data-roll-init="1"'],
    ['Proficiency bonus', signed(c.proficiencyBonus)],
    ...(focus ? [['Focus points', `${focus.max}, ${focus.recovery} rest`]] : []),
    ...(c.classDerived.focusSaveDC ? [['Focus save DC', c.classDerived.focusSaveDC]] : []),
    ['Passive Perception', c.passives.perception],
    ['Passive Insight', c.passives.insight],
    ['Passive Investigation', c.passives.investigation],
    ['Hit dice', c.hitPoints.hitDice],
  ];
  return each(rows, ([label, value, attrs]) =>
    `            <li${attrs ? ` class="rollable" ${attrs}` : ''}>` +
    `<span class="none">${esc(label)}</span><span class="v">${esc(value)}</span></li>`);
}

/** Attack roll buttons, plus the advantage state that applies to every roll. */
function attacksCard(c, t) {
  const attacks = c.features.filter((f) => f.attack && f.damage);
  return `      <div class="card attack-card">
        <span class="kind">Attacks</span>
        <div class="adv-row" role="group" aria-label="Dice source">
          <button type="button" class="mode-btn is-on" data-mode="auto">Roll for me</button>
          <button type="button" class="mode-btn" data-mode="manual">I roll</button>
        </div>
        <div class="adv-row" role="group" aria-label="Roll mode">
          <button type="button" class="adv-btn" data-adv="dis">Disadv</button>
          <button type="button" class="adv-btn is-on" data-adv="flat">Normal</button>
          <button type="button" class="adv-btn" data-adv="adv">Adv</button>
        </div>
        <p class="manual-hint" id="manualHint" hidden>
          Roll your own dice and type the result; the sheet still applies
          modifiers, crits and effects. Pick your own die for advantage.
        </p>
        <div class="attack-buttons">
${each(attacks, (f, i) =>
    `          <button type="button" class="attack-btn" data-attack="${i}"` +
    (f.spends ? ` data-pool="${esc(f.spends.pool)}" data-amount="${f.spends.amount}"` : '') +
    `><span class="atk-name">${esc(f.name)}</span>` +
    `<span class="atk-line">${fill(f.attack, t)} &middot; ${fill(f.damage, t).split(',')[0]}` +
    (f.range ? ` &middot; ${esc(f.range)}` : '') + `</span></button>`)}
        </div>
      </div>`;
}

function resourceRows(c) {
  return each(c.resources, (pool) =>
    `        <div class="resource-row">
          <span class="res-label">${esc(pool.label)}</span>
          <div class="pip-row" data-pool="${esc(pool.key)}"></div><span class="pip-count" data-count="${esc(pool.key)}">${pool.max}/${pool.max}</span>
        </div>`);
}

function actionRows(c, t) {
  return each(c.actions, (a, i) => {
    // data-action carries the index so the runtime can find this action's
    // roll/attacks/apply metadata without the markup restating any of it.
    const attrs = `data-action="${i}"`
      + (a.special ? ` data-special="${esc(a.special)}"` : '')
      + (a.pool ? ` data-pool="${esc(a.pool)}" data-amount="${a.amount}"` : '');
    const label = a.pool
      ? `Use <span class="cost">${a.amount} ${esc(a.pool === 'focus' ? 'Focus' : 'Luck')}</span>`
      : 'Use';
    return `      <div class="ability-row">
        <div class="ability-info">
          <h3>${esc(a.name)}${when(a.badge, `<span class="cost">${fill(a.badge ?? '', t)}</span>`)}</h3>
          <p>${fill(a.text, t)}</p>
        </div>
        <button type="button" class="ability-btn" ${attrs}>${label}</button>
      </div>`;
  });
}

function inventoryList(c, where, title) {
  const items = c.inventory.filter((i) => i.carried === where);
  const total = where === 'person' ? c.weight.person : c.weight.pack;
  const totalLabel = where === 'person' ? 'Worn weight' : 'Pack weight';
  return `      <div>
        <span class="label" style="display:block;margin-bottom:10px">${esc(title)}</span>
        <ul class="rows">
${each(items, (i) =>
    `          <li><span class="none">${esc(i.name)}${i.qty > 1 ? ` &times;${i.qty}` : ''}</span>` +
    `<span class="v">${i.totalWeight ? `${i.totalWeight} lb` : ''}</span></li>`)}
          <li><span class="prof">${totalLabel}</span><span class="v">${total} lb</span></li>
        </ul>
      </div>`;
}

function proficiencyList(c) {
  const p = c.proficiencies;
  const rows = [
    ['Armour', p.armour?.length ? p.armour.join(', ') : 'None'],
    ['Weapons', (p.weapons ?? []).join(', ')],
    ['Tools', c.tools.map((t) => t.label).join(', ')],
    ['Saving throws', ABILITIES.filter((k) => c.saves[k].proficient)
      .map((k) => c.saves[k].name).join(', ')],
    ['Languages', (p.languages ?? []).join(', ')],
  ];
  return each(rows, ([label, value]) =>
    `          <li><span class="none">${esc(label)}</span>` +
    `<span class="v" style="font-size:.9rem">${esc(value)}</span></li>`);
}

function recoveryList(c) {
  const rows = c.resources.map((r) => [
    r.label,
    r.recovery === 'short' ? 'Short or long rest' : 'Long rest',
  ]);
  rows.push(['Hit Dice', '1 per long rest']);
  return each(rows, ([label, value]) =>
    `          <li><span class="none">${esc(label)}</span>` +
    `<span class="v" style="font-size:.9rem">${esc(value)}</span></li>`);
}

export function renderScreen(c) {
  const t = c.tokens;
  const id = c.identity;
  const cls = id.classes.map((k) => `${k.name} ${k.level}`).join(' / ');
  const subclass = id.classes.map((k) => k.subclass).filter(Boolean).join(', ');
  const subhead = [id.species, cls, subclass, id.background, id.alignment]
    .filter(Boolean).join(' &middot; ');
  const ph = id.physical ?? {};
  const caption = [ph.age, ph.height, ph.weight].filter(Boolean).join(' &middot; ');

  return `<div class="wrap">

  <header class="mast">
    <h1>${esc(id.name)}</h1>
    <div class="sub">${subhead}</div>
${when(id.gloss, `    <p class="gloss">${esc(id.gloss)}</p>`)}
  </header>

  <div class="top">
    <figure class="art" style="margin:0">
      <img src="assets/${esc(id.artwork ?? 'raki-art.jpg')}" alt="${esc(id.name)}">
      <figcaption>${caption}${when(c.prose.appearance, ` &middot; ${esc(c.prose.appearance)}`)}</figcaption>
    </figure>

    <div>
      <div class="vitals">
        <div class="vital"><b>${c.armourClass.value}</b><span class="label">Armour Class</span></div>
        <div class="vital"><b>${c.hitPoints.max}</b><span class="label">Hit Points</span></div>
        <div class="vital"><b>${c.speed.value}</b><span class="label">Speed (ft)</span></div>
      </div>

      <div class="abils">
${abilityBlock(c)}
      </div>

      <div class="cols" style="margin-top:22px">
        <div>
          <span class="label" style="display:block;margin-bottom:10px">Skills</span>
          <ul class="rows">
${skillRows(c)}
          </ul>
        </div>
        <div>
          <span class="label" style="display:block;margin-bottom:10px">At a glance</span>
          <ul class="rows">
${glanceRows(c)}
          </ul>
        </div>
      </div>
    </div>
  </div>

  <button id="toggleAll" type="button">Expand all</button>

  <section id="inplay">
    <details open>
    <summary class="label">In Play</summary>
    <div class="cols">
      <div class="card hp-card" id="hpCard">
        <span class="kind">Hit Points</span>
        <div class="hp-row">
          <input type="number" id="hpCurrent" class="hp-input" min="0" max="${c.hitPoints.max}" value="${c.hitPoints.max}" aria-label="Current hit points">
          <span class="hp-max">/ <span id="hpMax">${c.hitPoints.max}</span></span>
        </div>
        <div class="hp-quick">
          <input type="number" id="hpAmount" min="1" value="1" aria-label="Amount to apply">
          <button type="button" id="hpDamage">Damage</button>
          <button type="button" id="hpHeal">Heal</button>
          <button type="button" id="hpReset">Reset to max</button>
        </div>
        <div class="dead-notice" id="deadNotice" hidden></div>
        <div class="death-saves" id="deathSaves" hidden>
          <span class="label" style="display:block;margin-bottom:6px">Death Saves</span>
          <div class="ds-row"><span class="ds-label">Successes</span><div class="pip-row" data-pool="dsSuccess"></div></div>
          <div class="ds-row"><span class="ds-label">Failures</span><div class="pip-row" data-pool="dsFail"></div></div>
          <button type="button" id="rollDeathSave" class="ds-roll-btn">Roll Death Save</button>
        </div>
      </div>
      <div class="card">
        <span class="kind">Resources</span>
${resourceRows(c)}
      </div>
${attacksCard(c, t)}
      <div class="card dice-card">
        <span class="kind">Dice Roller</span>
        <div class="dice-buttons">
          <button type="button" class="die-btn" data-sides="4">D4</button>
          <button type="button" class="die-btn" data-sides="6">D6</button>
          <button type="button" class="die-btn" data-sides="10">D10</button>
          <button type="button" class="die-btn" data-sides="100">D100</button>
          <button type="button" class="die-btn" data-sides="12">D12</button>
          <button type="button" class="die-btn" data-sides="20">D20</button>
        </div>
        <div class="dice-result" id="diceResult" aria-live="polite">&mdash;</div>
        <div class="dice-history-row">
          <div class="dice-history" id="diceHistory"></div>
          <div class="history-actions">
            <span class="history-total" id="historyTotal" hidden></span>
            <button type="button" id="totalHistory" class="clear-history-btn">Total</button>
            <button type="button" id="clearHistory" class="clear-history-btn">Clear</button>
          </div>
        </div>
      </div>
    </div>

    <div class="roll-log-wrap">
      <div class="roll-log-head">
        <span class="label">Roll Log</span>
        <button type="button" id="clearRollLog" class="clear-history-btn">Clear</button>
      </div>
      <div class="roll-log" id="rollLog" aria-live="polite"></div>
    </div>

    <div class="ability-list">
      <span class="label" style="display:block;margin:26px 0 10px">Abilities</span>
${actionRows(c, t)}
    </div>

    <div class="rest-row">
      <button type="button" id="shortRest">Short Rest</button>
      <button type="button" id="longRest">Long Rest</button>
    </div>
    </details>
  </section>

${featureSection('attacks', c.features, t)}
${featureSection('openHand', c.features, t)}
${featureSection('reserves', c.features, t)}

  <section>
    <details>
    <summary class="label">Core traits</summary>
    <div class="cols">
${each(c.features.filter((f) => f.section === 'core'), (f) => card(f, t))}
    </div>

    <div class="cols" style="margin-top:26px">
      <div>
        <span class="label" style="display:block;margin-bottom:10px">Proficiencies</span>
        <ul class="rows">
${proficiencyList(c)}
        </ul>
      </div>
      <div>
        <span class="label" style="display:block;margin-bottom:10px">Recovery</span>
        <ul class="rows">
${recoveryList(c)}
        </ul>
      </div>
    </div>
    </details>
  </section>

  <section>
    <details>
    <summary class="label">Equipment</summary>
    <div class="cols">
${inventoryList(c, 'person', 'On his person')}
${inventoryList(c, 'pack', 'In the backpack')}
    </div>

    <div class="cols" style="margin-top:26px">
      <div>
        <ul class="rows">
          <li><span class="prof">Carrying the pack</span><span class="v">${c.weight.total} lb</span></li>
          <li><span class="prof">Pack dropped</span><span class="v">${c.weight.person} lb</span></li>
        </ul>
      </div>
      <div>
        <ul class="rows">
          <li><span class="none">Capacity</span><span class="v">${c.carrying.capacity} lb</span></li>
          <li><span class="none">Push, drag, lift</span><span class="v">${c.carrying.pushDragLift} lb</span></li>
          <li><span class="none">Coin</span><span class="v">${c.currency.gp ?? 0} gp</span></li>
        </ul>
      </div>
    </div>
    </details>
  </section>

  <section>
    <details>
    <summary class="label">Who he is</summary>
${when(c.prose.ideal, `    <blockquote class="pull">${esc(c.prose.ideal)}</blockquote>`)}

    <div class="cols" style="margin-top:30px">
      <div>
${each(c.prose.traits, (p) => `        <div class="trait"><span class="label">Trait</span><p>${esc(p)}</p></div>`)}
      </div>
      <div>
${each(c.prose.bonds, (p) => `        <div class="trait"><span class="label">Bond</span><p>${esc(p)}</p></div>`)}
${when(c.prose.flaws?.length, `        <div class="trait"><span class="label">Flaws</span><p>${esc((c.prose.flaws ?? []).join(' '))}</p></div>`)}
      </div>
    </div>
    </details>
  </section>

  <section>
    <details>
    <summary class="label">The road</summary>
    <div class="top">
      <div class="portrait">
        <img src="assets/raki-portrait.jpg" alt="${esc(id.name)}">
      </div>
      <div class="story">
${each([c.prose.backstory, c.prose.allies, c.prose.organizations, c.prose.enemies],
    (p) => `        <p>${esc(p)}</p>`)}
      </div>
    </div>
    </details>
  </section>

  <figure class="closing">
    <img src="assets/raki-closing.jpg" alt="">
  </figure>

</div>`;
}
