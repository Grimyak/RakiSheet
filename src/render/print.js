// Renders the dense black-and-white print sheet.
//
// Reads the same derived character as the screen renderer. Nothing here
// restates a number: if the screen says AC 17, this says AC 17 because both
// asked the same object.

import { ABILITIES, SKILLS } from '../rules.js';
import { signed } from '../rules.js';
import { each, esc, fill, join, when } from './html.js';

const ABBR = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' };

/** N empty tick boxes, for pools you fill in with a pencil. */
function ticks(n) {
  return `<span class="ps-ticks">${'<span class="ps-tick"></span>'.repeat(Math.max(0, n))}</span>`;
}

function box(title, inner, extraClass = '') {
  const cls = extraClass ? `ps-box ${extraClass}` : 'ps-box';
  return `        <div class="${cls}">
${when(title, `          <div class="ps-box-title">${title}</div>`)}
${inner}
        </div>`;
}

function abilityGrid(c) {
  return `          <div class="ps-abilities">
${each(ABILITIES, (k) => {
    const a = c.abilities[k];
    return `            <div class="ps-ability"><div class="ps-a-name">${ABBR[k]}</div>` +
      `<div class="ps-a-mod">${signed(a.mod).replace('-', '&minus;')}</div>` +
      `<div class="ps-a-score">${a.score}</div></div>`;
  })}
          </div>`;
}

function combatStats(c) {
  return `          <div class="ps-combat-stats">
            <div><b>${c.armourClass.value}</b><span>Armor Class</span></div>
            <div><b>${signed(c.initiative)}</b><span>Initiative</span></div>
            <div><b>${c.speed.value}</b><span>Speed (ft)</span></div>
          </div>`;
}

function hitPointBlock(c) {
  const hitDiceCount = c.identity.classes.reduce((n, k) => n + k.level, 0);
  return `          <div class="ps-hp-row">
            <div class="ps-hp-box"><b>Hit Point Max</b>${c.hitPoints.max}</div>
            <div class="ps-hp-box"><b>Current HP</b><span class="ps-fill"></span></div>
            <div class="ps-hp-box"><b>Temp HP</b><span class="ps-fill"></span></div>
          </div>
          <div class="ps-hd-ds">
            <span>Hit Dice ${c.hitPoints.hitDice} ${ticks(hitDiceCount)}</span>
            <span>Death Saves &mdash; Succ. ${ticks(3)} Fail ${ticks(3)}</span>
          </div>`;
}

function attackTable(c, t) {
  const rows = c.features.filter((f) => f.damage);
  return `          <table class="ps-table">
            <tr><th>Name</th><th>Atk</th><th>Damage / Type</th></tr>
${each(rows, (f) =>
    `            <tr><td>${f.tableName ?? esc(f.name)}</td>` +
    `<td>${fill(f.attack, t)}</td><td>${fill(f.damage, t)}</td></tr>`)}
          </table>`;
}

/** Active in combat: the bonus actions and reactions, in their short form. */
function combatOptions(c, t) {
  const active = c.features.filter(
    (f) => f.short && /Bonus action|Reaction/i.test(f.kind ?? ''),
  );
  return `          <ul class="ps-features">
${each(active, (f) => `            <li><b>${esc(f.name)}</b> ${fill(f.short, t)}</li>`)}
          </ul>`;
}

function saveList(c) {
  return `          <ul class="ps-list">
${each(ABILITIES, (k) => {
    const s = c.saves[k];
    return `            <li><span class="ps-tick${s.proficient ? ' filled' : ''}"></span>` +
      `<span class="ps-sk-name">${s.name}</span>` +
      `<span class="ps-sk-val">${signed(s.value).replace('-', '&minus;')}</span></li>`;
  })}
          </ul>`;
}

function skillList(c) {
  // Every skill, alphabetical — the print sheet is a reference, not a summary.
  const keys = Object.keys(SKILLS).sort((a, b) =>
    c.skills[a].name.localeCompare(c.skills[b].name));
  return `          <ul class="ps-list">
${each(keys, (k) => {
    const s = c.skills[k];
    return `            <li><span class="ps-tick${s.proficient ? ' filled' : ''}"></span>` +
      `<span class="ps-sk-name">${esc(s.name)} (${ABBR[s.ability]})</span>` +
      `<span class="ps-sk-val">${signed(s.value).replace('-', '&minus;')}</span></li>`;
  })}
          </ul>`;
}

function passiveList(c) {
  const rows = [
    ['Passive Perception', c.passives.perception],
    ['Passive Insight', c.passives.insight],
    ['Passive Investigation', c.passives.investigation],
    ['Proficiency Bonus', signed(c.proficiencyBonus)],
  ];
  return `          <ul class="ps-list">
${each(rows, ([label, value]) =>
    `            <li><span class="ps-sk-name">${label}</span><span class="ps-sk-val">${value}</span></li>`)}
          </ul>`;
}

function resourceList(c) {
  const rows = c.resources.map((r) => {
    const rest = r.recovery === 'short' ? 'short/long rest' : 'long rest';
    const dc = r.key === 'focus' && c.classDerived.focusSaveDC
      ? `, DC ${c.classDerived.focusSaveDC}` : '';
    return [`${r.label} Points (${rest}${dc})`, r.max];
  });
  // One-shot features that recharge on a rest but have no pip pool of their own.
  if (c.classDerived.uncannyMetabolismHeal) {
    rows.push(['Uncanny Metabolism (long rest)', 1]);
  }
  return `          <ul class="ps-list">
${each(rows, ([label, max]) =>
    `            <li><span class="ps-sk-name">${esc(label)}</span>${ticks(max)}</li>`)}
          </ul>`;
}

function proficiencyList(c) {
  const p = c.proficiencies;
  const rows = [
    ['Armor', p.armour?.length ? p.armour.join(', ') : 'None'],
    ['Weapons', (p.weapons ?? []).join(', ')],
    ['Tools', c.tools.map((t) => t.label).join(', ')],
    ['Languages', (p.languages ?? []).join(', ')],
  ];
  return `          <ul class="ps-list">
${each(rows, ([label, value]) =>
    `            <li><span class="ps-sk-name">${label}</span><span class="ps-sk-val">${esc(value)}</span></li>`)}
          </ul>`;
}

/** Everything with a condensed form, in reading order. */
function featureList(c, t) {
  const order = ['core', 'attacks', 'openHand', 'reserves'];
  const listed = order.flatMap((section) =>
    c.features.filter((f) => f.section === section && f.short));
  return `          <ul class="ps-features">
${each(listed, (f) => `            <li><b>${esc(f.name)}</b> ${fill(f.short, t)}</li>`)}
          </ul>`;
}

function equipmentList(c) {
  const names = (where) => c.inventory
    .filter((i) => i.carried === where)
    .map((i) => `${i.name}${i.qty > 1 ? ` &times;${i.qty}` : ''}`)
    .join(', ');
  const rows = [
    [names('person'), `${c.weight.person} lb`],
    [names('pack'), `${c.weight.pack} lb`],
    ['Carrying (full pack) / Capacity', `${c.weight.total} / ${c.carrying.capacity} lb`],
    ['Coin', `${c.currency.gp ?? 0} gp`],
  ];
  return `          <ul class="ps-list">
${each(rows, ([label, value]) =>
    `            <li><span class="ps-sk-name">${label}</span><span class="ps-sk-val">${value}</span></li>`)}
          </ul>
${'          <div class="ps-blank-row"><span class="ps-blank-item"></span><span class="ps-blank-wt"></span></div>\n'.repeat(4).trimEnd()}`;
}

function personalityList(c) {
  const rows = [
    ['Traits', (c.prose.traits ?? []).join(' ')],
    ['Bond', (c.prose.bonds ?? []).join(' ')],
    ['Flaws', (c.prose.flaws ?? []).join(' ')],
  ].filter(([, v]) => v);
  return `          <ul class="ps-features">
${each(rows, ([label, value]) => `            <li><b>${label}</b> &mdash; ${esc(value)}</li>`)}
          </ul>`;
}

export function renderPrint(c) {
  const t = c.tokens;
  const id = c.identity;
  const subhead = [
    ['Class &amp; Level', id.classes.map((k) => `${k.name} ${k.level}`).join(' / ')],
    ['Background', id.background],
    ['Species', id.species],
    ['Alignment', id.alignment],
    ['Subclass', id.classes.map((k) => k.subclass).filter(Boolean).join(', ')],
  ].filter(([, v]) => v);

  const NOTE_LINES = 11;

  return `<div class="print-sheet" id="printSheet">
  <div class="ps-page">
    <div class="ps-header">
      <div class="ps-name">${esc(id.name.toUpperCase())}</div>
      <div class="ps-subhead">
${each(subhead, ([label, value]) =>
    `        <div><span class="ps-label">${label}</span><span class="ps-val">${esc(value)}</span></div>`)}
      </div>
    </div>

    <div class="ps-columns">
      <div class="ps-col">
${box('', abilityGrid(c))}
${box('', combatStats(c))}
${box('', hitPointBlock(c))}
${box('Attacks', attackTable(c, t))}
${box('Active Combat Options', combatOptions(c, t))}
      </div>

      <div class="ps-col">
${box('Saving Throws', saveList(c))}
${box('Skills', skillList(c))}
${box('', passiveList(c))}
${box('Resources', resourceList(c))}
      </div>
    </div>
  </div>

  <div class="ps-page">
    <div class="ps-columns">
      <div class="ps-col">
${box('Proficiencies &amp; Languages', proficiencyList(c), 'ps-profs')}
${box('Features &amp; Traits', featureList(c, t))}
      </div>

      <div class="ps-col">
${box('Equipment', equipmentList(c))}
${box('Personality', personalityList(c))}
      </div>
    </div>

    <div class="ps-box ps-notes-box">
      <div class="ps-box-title">Notes</div>
${join(Array(NOTE_LINES).fill('      <div class="ps-notes-line"></div>'))}
    </div>
  </div>
</div>`;
}
