// Drives the built page's runtime in a real DOM and asserts on what the roll
// log actually shows. Complements verify.js, which tests derivation and dice
// maths but cannot see the browser wiring.
//
//   deno run --allow-read --allow-net tools/runtime-test.js
//
// Needs --allow-net only the first time, to fetch deno-dom into the cache.

import { DOMParser } from 'jsr:@b-fuze/deno-dom';

const html = await Deno.readTextFile(new URL('../index.html', import.meta.url));
const doc = new DOMParser().parseFromString(html, 'text/html');

// --- minimal browser environment -------------------------------------------
const store = new Map();
globalThis.document = doc;

// Deno ships a REAL localStorage that persists to disk, and a plain assignment
// does not override it. Without defineProperty the sheet writes its state to
// the developer's machine and every later run starts from whatever the last
// one left behind — which silently contaminates the suite.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  },
});
globalThis.window = globalThis;
// Run as a reduced-motion user. The settle animation is cosmetic and defers
// every result behind timers; skipping it keeps assertions synchronous and
// still exercises the same code paths, since animateTotal always invokes its
// completion callback either way.
globalThis.matchMedia = () => ({ matches: true });

// A scripted dice sequence, so rolls are deterministic.
//
// Consumers compute floor(random() * sides) + 1, so to force `value` on a
// `sides` die we must hand back (value - 0.5) / sides. That means each queued
// entry has to name its die: script([20, 12], [6, 3]) is "d20 rolls 12, then
// d6 rolls 3". Getting the die wrong yields a wrong value, not a crash.
// Running dry must NOT fall through to real randomness: that makes runs
// diverge and turns a mis-scripted test into an intermittent crash. Instead it
// returns a fixed mid-die value and counts the shortfall, reported at the end.
let queue = [];
let unscripted = 0;
const realRandom = Math.random;
Math.random = () => {
  if (!queue.length) { unscripted++; return 0.5; }
  const [sides, value] = queue.shift();
  return (value - 0.5) / sides;
};
const script = (...pairs) => { queue = pairs.slice(); };

// --- run the page's inline scripts ------------------------------------------
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
for (const src of scripts) {
  try {
    (0, eval)(src);
  } catch (err) {
    console.error('script failed:', err.message);
    Deno.exit(1);
  }
}

const click = (el) => el.dispatchEvent(new Event('click'));
const logEl = doc.getElementById('rollLog');
const clearLog = () => { logEl.innerHTML = ''; };
const topEntry = () => logEl.children[0];

const checks = [];
const check = (label, actual, expected) => checks.push([label, actual, expected]);

// --- a natural 20 must show a damage number, not just the word CRIT ---------
clearLog();
script([20, 20], [6, 4], [6, 5]); // nat 20, then 2 dice because a crit doubles 1d6
click(doc.querySelector('.attack-btn'));
let e = topEntry();
let total = e.querySelector('.roll-total').textContent.trim();
// The headline keeps the to-hit total; damage lives in its own block below.
check('Crit keeps to-hit on headline', parseInt(total, 10), 20 + 6);
check('Crit shows a damage number',
  parseInt(e.querySelector('.roll-damage .dmg-value').textContent, 10), 4 + 5 + 4);
check('Crit damage flagged', e.querySelector('.roll-damage').className.includes('is-crit'), true);
check('Crit auto-lands (no Hit/Miss)', e.querySelectorAll('.roll-action-btn').length, 0);
check('Crit offers no effects on a plain attack', e.querySelectorAll('.roll-effect').length, 0);

// --- an ordinary hit waits for confirmation ---------------------------------
clearLog();
script([20, 12]);
click(doc.querySelector('.attack-btn'));
e = topEntry();
check('Normal roll shows to-hit', e.querySelector('.roll-total').textContent.trim(), '18');
const labelsOf = (el) => [...el.querySelectorAll('.roll-action-btn')].map((b) => b.textContent);
check('Normal roll offers Hit and Miss',
  labelsOf(e).filter((l) => l === 'Hit' || l === 'Miss').join(','), 'Hit,Miss');
check('No damage before confirming', e.textContent.includes('hit '), false);

// Confirm the hit: damage rolls and replaces the headline.
script([6, 3]);
click(e.querySelectorAll('.roll-action-btn')[0]);
check('Confirmed hit rolls damage',
  e.querySelector('.roll-damage .dmg-value').textContent.trim(), '7');
check('Buttons cleared after choosing', e.querySelectorAll('.roll-action-btn').length, 0);

// --- declaring a miss ---------------------------------------------------
clearLog();
script([20, 12]);
click(doc.querySelector('.attack-btn'));
e = topEntry();
click(e.querySelectorAll('.roll-action-btn')[1]);
check('Miss keeps the to-hit total', e.querySelector('.roll-total').textContent.trim(), '18');
check('Miss is marked', e.className.includes('is-miss'), true);
check('Miss rolls no damage', e.textContent.includes('damage'), false);

// --- a natural 1 misses outright --------------------------------------------
clearLog();
script([20, 1]);
click(doc.querySelector('.attack-btn'));
e = topEntry();
check('Nat 1 auto-misses', e.textContent.includes('natural 1, miss'), true);
check('Nat 1 offers no Hit/Miss',
  labelsOf(e).filter((l) => l === 'Hit' || l === 'Miss').length, 0);
check('Nat 1 may still be rerolled',
  labelsOf(e).some((l) => l.includes('Reroll')), true);

// --- Flurry: two attacks, each offering Open Hand ----------------------------
clearLog();
script([20, 20], [6, 4], [6, 4], [20, 20], [6, 5], [6, 5]); // both crit, so both land
const flurry = [...doc.querySelectorAll('.ability-btn[data-action]')]
  .find((b) => b.textContent.includes('Use'));
click(flurry);
check('Flurry logs two attacks', logEl.children.length, 2);
check('Flurry offers Open Hand effects',
  topEntry().querySelectorAll('.roll-action-btn').length, 3);
const names = [...topEntry().querySelectorAll('.roll-action-btn')].map((b) => b.textContent);
check('Effects are Topple/Push/Addle', names.join(','), 'Topple,Push,Addle');
// Both strikes offer the choice, because either may be the one that lands.
check('Both strikes offer the choice',
  logEl.children[1].querySelectorAll('.roll-action-btn').length, 3);

// Picking one resolves it to text with the derived DC.
click(topEntry().querySelectorAll('.roll-action-btn')[0]);
const effect = topEntry().querySelector('.roll-effect');
check('Effect resolves to text', !!effect, true);
check('Effect carries the derived DC', effect?.textContent.includes('DC 13'), true);
check('Effect names the save', effect?.textContent.includes('Dex save'), true);

// Each attack resolves separately and carries its own effect, so taking one
// on this strike leaves the other strike's offer standing.
check('Other strike keeps its own offer',
  logEl.children[1].querySelectorAll('.roll-action-btn').length, 3);

// Both landed strikes can impose an effect.
click(logEl.children[1].querySelectorAll('.roll-action-btn')[1]); // Push
check('Both hits applied an effect',
  logEl.querySelectorAll('.roll-effect').length, 2);
check('Push resolves with a Strength save',
  logEl.children[1].querySelector('.roll-effect').textContent.includes('Str save'), true);
check('Topple resolves with a Dexterity save',
  logEl.children[0].querySelector('.roll-effect').textContent.includes('Dex save'), true);

// --- skills and saves roll differently where proficiency differs -------------
clearLog();
script([20, 10]);
click(doc.querySelector('[data-roll-save="str"]'));
check('Str save uses save value', topEntry().querySelector('.roll-total').textContent.trim(), '10');
clearLog();
script([20, 10]);
click(doc.querySelector('[data-roll-check="str"]'));
check('Str check uses raw modifier', topEntry().querySelector('.roll-total').textContent.trim(), '8');

// --- damage gets its own prominent block, to-hit stays visible ---------------
clearLog();
script([20, 12]);
click(doc.querySelector('.attack-btn'));
e = topEntry();
script([6, 3]);
click(e.querySelectorAll('.roll-action-btn')[0]);
const dmgBlock = e.querySelector('.roll-damage');
check('Damage has its own block', !!dmgBlock, true);
check('Damage value shown', dmgBlock?.querySelector('.dmg-value').textContent.trim(), '7');
check('Damage type shown', dmgBlock?.querySelector('.dmg-type').textContent.trim(), 'bludgeoning');
check('Dice breakdown shown', dmgBlock?.querySelector('.dmg-dice').textContent.includes('1d6+4'), true);
check('To-hit still visible', e.querySelector('.roll-total').textContent.trim(), '18');

clearLog();
script([20, 20], [6, 2], [6, 6]);
click(doc.querySelector('.attack-btn'));
const critBlock = topEntry().querySelector('.roll-damage');
check('Crit damage block flagged', critBlock?.className.includes('is-crit'), true);
check('Crit damage value', critBlock?.querySelector('.dmg-value').textContent.trim(), '12');
check('Crit labelled critical', critBlock?.querySelector('.dmg-type').textContent.includes('critical'), true);

// --- death saves --------------------------------------------------------------
const api = globalThis.SHEET_API;
// Put the character at 0 and dying: full hit points first clears any dead
// flag, then drop to 0 without it counting as damage from a source.
const toDying = () => { api.setHP(27); api.setHP(0); api.resetDeathSaves(); };
const dsBtn = doc.getElementById('rollDeathSave');
check('Death save button exists', !!dsBtn, true);

// Not dying: the button does nothing.
api.resetDeathSaves();
api.heal(99);
clearLog();
script([20, 15]);
click(dsBtn);
check('No death save while conscious', logEl.children.length, 0);

// Drop to 0 and roll a success.
api.setHP(0); // at 0 and dying, without triggering massive damage
check('At 0 hit points', api.getHP(), 0);
api.resetDeathSaves();
clearLog();
script([20, 15]);
click(dsBtn);
check('15 is a success', api.deathSaves().success, 1);
check('Success logged', topEntry().textContent.includes('success (1/3)'), true);

// 9 fails.
script([20, 9]);
click(dsBtn);
check('9 is a failure', api.deathSaves().fail, 1);

// A natural 1 costs two failures.
script([20, 1]);
click(dsBtn);
check('Nat 1 is two failures', api.deathSaves().fail, 3);
check('Three failures reported', topEntry().textContent.includes('dead'), true);

// Three successes stabilise.
toDying();
clearLog();
script([20, 12]);
click(dsBtn);
script([20, 12]);
click(dsBtn);
script([20, 12]);
click(dsBtn);
check('Three successes', api.deathSaves().success, 3);
check('Stable reported', topEntry().textContent.includes('Stable'), true);

// A natural 20 gets you back up with 1 hit point.
toDying();
clearLog();
script([20, 20]);
click(dsBtn);
check('Nat 20 restores 1 HP', api.getHP(), 1);
check('Nat 20 clears the saves', api.deathSaves().fail + api.deathSaves().success, 0);
check('Nat 20 logged', topEntry().textContent.includes('1 hit point'), true);

// --- death saves honour advantage -------------------------------------------
// A death save is a saving throw, so it is a D20 Test: Lucky and Heroic
// Inspiration can both apply. The adv/dis toggle must therefore reach it.
const advBtn = doc.querySelector('.adv-btn[data-adv="adv"]');
const disBtn = doc.querySelector('.adv-btn[data-adv="dis"]');
const flatBtn = doc.querySelector('.adv-btn[data-adv="flat"]');

toDying();
clearLog();
click(advBtn);
script([20, 3], [20, 17]); // with advantage the 17 is kept, so this succeeds
click(dsBtn);
check('Death save with advantage rolls twice', api.deathSaves().success, 1);
check('Advantage keeps the higher die', topEntry().textContent.includes('17'), true);
check('Both dice shown', topEntry().textContent.includes('[3, 17]'), true);

toDying();
clearLog();
click(disBtn);
script([20, 3], [20, 17]); // with disadvantage the 3 is kept, so this fails
click(dsBtn);
check('Disadvantage keeps the lower die', api.deathSaves().fail, 1);

// A natural 20 on the kept die still revives; on the discarded die it must not.
toDying();
clearLog();
click(disBtn);
script([20, 20], [20, 8]); // disadvantage discards the 20
click(dsBtn);
check('Discarded nat 20 does not revive', api.getHP(), 0);
check('Discarded nat 20 counts as a failure', api.deathSaves().fail, 1);

click(flatBtn); // leave the toggle where we found it

// --- advantage falls back to normal after one roll ---------------------------
api.heal(999);
const modeNow = () => doc.querySelector('.adv-btn.is-on').getAttribute('data-adv');
clearLog();
click(advBtn);
check('Toggle reads adv before rolling', modeNow(), 'adv');
script([20, 4], [20, 18]);
click(doc.querySelector('[data-roll-skill="stealth"]'));
check('Advantage applied to that roll', topEntry().textContent.includes('[4, 18]'), true);
check('Toggle resets to normal after', modeNow(), 'flat');

// Only the first attack of a Flurry gets it — one Luck Point, one roll.
// The second strike is queued until the first is resolved, so declare a miss
// on the first to release it.
clearLog();
click(advBtn);
script([20, 4], [20, 19]);
click(flurry);
check('Flurry: first strike had advantage',
  topEntry().textContent.includes('[4, 19]'), true);
check('Flurry: second strike is queued', logEl.children.length, 1);
check('Toggle reset after the first roll', modeNow(), 'flat');

script([20, 11]);
click([...topEntry().querySelectorAll('.roll-action-btn')].find((b) => b.textContent === 'Miss'));
check('Second strike released on resolution', logEl.children.length, 2);
check('Flurry: second strike rolled flat',
  logEl.children[0].textContent.includes('['), false);

// --- Heroic Inspiration reroll ------------------------------------------------
click(doc.getElementById('longRest'));
api.damage(0);
check('Long rest gives Inspiration', api.poolValue('inspiration'), 1);

clearLog();
script([20, 5]);
click(doc.querySelector('[data-roll-skill="stealth"]'));
e = topEntry();
const rerollBtn = [...e.querySelectorAll('.roll-action-btn')]
  .find((b) => b.textContent.includes('Reroll'));
check('Reroll offered while Inspiration remains', !!rerollBtn, true);
check('Skill roll used the low die', e.querySelector('.roll-total').textContent.trim(), '11');

script([20, 16]);
click(rerollBtn);
check('Reroll spends the Inspiration', api.poolValue('inspiration'), 0);
check('Reroll replaces the entry', logEl.children.length, 1);
check('Reroll used the new die', topEntry().querySelector('.roll-total').textContent.trim(), '22');

// With none left, no reroll is offered.
clearLog();
script([20, 5]);
click(doc.querySelector('[data-roll-skill="stealth"]'));
check('No reroll without Inspiration',
  [...topEntry().querySelectorAll('.roll-action-btn')].filter((b) => b.textContent.includes('Reroll')).length, 0);

// A long rest brings it back.
click(doc.getElementById('longRest'));
check('Long rest restores Inspiration', api.poolValue('inspiration'), 1);

// --- rerolling a failed death save undoes its tick ----------------------------
toDying();
clearLog();
script([20, 6]);
click(dsBtn);
check('Failed death save ticks a failure', api.deathSaves().fail, 1);
const dsReroll = [...topEntry().querySelectorAll('.roll-action-btn')]
  .find((b) => b.textContent.includes('Reroll'));
check('Death save offers a reroll', !!dsReroll, true);
script([20, 14]);
click(dsReroll);
check('Reroll undid the failure', api.deathSaves().fail, 0);
check('Reroll recorded the success', api.deathSaves().success, 1);

api.resetDeathSaves();
api.heal(999);

// --- instant death from massive damage ----------------------------------------
// Raki's maximum is 27. Damage that drops him to 0 with 27 or more left over
// kills outright, with no death saves.
const deadNotice = doc.getElementById('deadNotice');
// deno-dom does not reflect the `hidden` IDL property onto the attribute the
// way a browser does, so assert on the property renderHP() actually sets.
const isHidden = (el) => el.hidden === true;

api.setHP(27);
api.resetDeathSaves();
let res = api.damage(30); // 27 absorbed, 3 remaining — not enough
check('Ordinary drop to 0 is not death', api.isDead(), false);
check('Remaining damage reported', res.remaining, 3);
check('Still dying, so saves apply', api.isDying(), true);
check('Death save button available', isHidden(doc.getElementById('deathSaves')), false);

api.setHP(27);
res = api.damage(27 + 27); // exactly max remaining — the boundary, and it kills
check('Remaining exactly equal to max kills', api.isDead(), true);
check('Reported as death', res.dead, true);
check('No death saves once dead', api.isDying(), false);
check('Death save block hidden', isHidden(doc.getElementById('deathSaves')), true);
check('Notice shown', isHidden(deadNotice), false);
check('Failures filled in', api.deathSaves().fail, 3);

api.setHP(27);
api.damage(27 + 26); // one short of the maximum: survives at 0
check('One short of max does not kill', api.isDead(), false);
check('One short leaves you dying', api.isDying(), true);

// Partial hit points count: at 10 of 27, a 37 hit leaves 27 remaining.
api.setHP(10);
check('Damage from partial HP kills on overflow', api.damage(10 + 27).dead, true);

// Setting hit points directly is not damage from a source, so it never kills.
api.setHP(27);
api.setHP(0);
check('Setting HP to 0 is not instant death', api.isDead(), false);

// Healing brings you back.
api.setHP(27);
api.damage(27 + 27);
check('Dead before healing', api.isDead(), true);
api.heal(5);
check('Healing clears death', api.isDead(), false);
check('Notice hidden again', isHidden(deadNotice), true);

// A long rest also clears it.
api.setHP(27);
api.damage(27 + 27);
click(doc.getElementById('longRest'));
check('Long rest clears death', api.isDead(), false);
check('Long rest restores hit points', api.getHP(), 27);

// --- manual dice entry --------------------------------------------------------
// In manual mode the sheet must generate NO dice of its own: every number
// comes from the player. The unscripted counter proves it.
const manualBtn = doc.querySelector('.mode-btn[data-mode="manual"]');
const autoBtn = doc.querySelector('.mode-btn[data-mode="auto"]');
const manualHint = doc.getElementById('manualHint');
const fieldIn = (el) => el.querySelector('.roll-input .ri-field');
const enterIn = (el) => [...el.querySelectorAll('.roll-input .roll-action-btn')][0];
const typeInto = (el, value) => { fieldIn(el).value = String(value); click(enterIn(el)); };

api.setHP(27);
click(manualBtn);
check('Manual mode engaged', manualBtn.className.includes('is-on'), true);
check('Auto mode off', autoBtn.className.includes('is-on'), false);
check('Hint shown', manualHint.hidden, false);
check('Advantage disabled in manual mode', advBtn.disabled, true);

// An attack asks for the d20 rather than rolling one.
clearLog();
const before = unscripted;
queue = [];
click(doc.querySelector('.attack-btn'));
e = topEntry();
check('Attack waits for input', !!fieldIn(e), true);
check('No number until entered', e.querySelector('.roll-total').textContent.trim(), '—');

typeInto(e, 14);
check('Typed die plus modifier', e.querySelector('.roll-total').textContent.trim(), '20');
check('Hit/Miss offered after entry',
  labelsOf(e).filter((l) => l === 'Hit' || l === 'Miss').length, 2);

// Confirming the hit asks for the damage dice, then adds the modifier.
click([...e.querySelectorAll('.roll-action-btn')].find((b) => b.textContent === 'Hit'));
check('Damage asks for input', !!fieldIn(e), true);
check('Prompt names the dice', e.querySelector('.ri-label').textContent, 'total of 1d6');
typeInto(e, 5);
check('Damage adds the modifier',
  e.querySelector('.roll-damage .dmg-value').textContent.trim(), '9');

// A typed 20 is still a critical hit, and asks for doubled dice.
clearLog();
click(doc.querySelector('.attack-btn'));
e = topEntry();
typeInto(e, 20);
check('Typed 20 crits', e.className.includes('is-crit'), true);
check('Crit asks for doubled dice', e.querySelector('.ri-label').textContent, 'total of 2d6');
typeInto(e, 9);
check('Crit damage totalled', e.querySelector('.roll-damage .dmg-value').textContent.trim(), '13');

// A typed 1 still misses outright.
clearLog();
click(doc.querySelector('.attack-btn'));
typeInto(topEntry(), 1);
check('Typed 1 misses', topEntry().textContent.includes('natural 1, miss'), true);

// Out-of-range entries are clamped to a real d20.
clearLog();
click(doc.querySelector('.attack-btn'));
typeInto(topEntry(), 99);
check('Above 20 clamps to 20', topEntry().className.includes('is-crit'), true);

// Skills and death saves use the same path.
clearLog();
click(doc.querySelector('[data-roll-skill="stealth"]'));
typeInto(topEntry(), 11);
check('Manual skill check', topEntry().querySelector('.roll-total').textContent.trim(), '17');

toDying();
clearLog();
click(dsBtn);
typeInto(topEntry(), 12);
check('Manual death save succeeds', api.deathSaves().success, 1);

check('Sheet rolled nothing in manual mode', unscripted - before, 0);

// Switching back restores automatic rolling.
click(autoBtn);
check('Auto mode restored', autoBtn.className.includes('is-on'), true);
check('Advantage re-enabled', advBtn.disabled, false);
check('Hint hidden', manualHint.hidden, true);
api.setHP(27);
clearLog();
script([20, 13]);
click(doc.querySelector('.attack-btn'));
check('Auto mode rolls again without input',
  topEntry().querySelector('.roll-total').textContent.trim(), '19');

// --- the two deaths are described differently ---------------------------------
click(autoBtn);
api.setHP(27);
api.damage(27 + 27);
check('Massive damage names itself',
  deadNotice.textContent.includes('remaining damage'), true);
check('Massive damage titled Killed outright',
  deadNotice.textContent.includes('Killed outright'), true);

// Three failed saves is a different death, and must not borrow the other text.
toDying();
clearLog();
script([20, 2]);
click(dsBtn);
script([20, 2]);
click(dsBtn);
script([20, 2]);
click(dsBtn);
check('Three failures kills', api.isDead(), true);
check('Failed saves titled Dead', deadNotice.textContent.includes('Dead.'), true);
check('Failed saves names the saves',
  deadNotice.textContent.includes('Three failed death saving throws'), true);
check('Failed saves does NOT mention damage',
  deadNotice.textContent.includes('remaining damage'), false);

// The fatal entry carries both its buttons and its verdict, without one
// sitting on top of the other.
const fatal = topEntry();
check('Fatal entry reports three failures',
  fatal.textContent.includes('Three failures'), true);
check('Fatal entry still offers a reroll',
  labelsOf(fatal).some((l) => l.includes('Reroll')), true);
check('Verdict and buttons are separate blocks',
  fatal.querySelectorAll('.roll-effect').length === 1
    && fatal.querySelectorAll('.roll-actions').length === 1, true);

api.setHP(27);
check('Healing clears the notice', api.isDead(), false);

// --- thrown daggers consume the dagger -----------------------------------------
click(autoBtn);
api.setHP(27);
const thrownBtn = doc.querySelector('.attack-btn[data-pool="daggers"]');
check('Thrown dagger button exists', !!thrownBtn, true);
check('Seven daggers to start', api.poolValue('daggers'), 7);
check('Button names the range', thrownBtn.textContent.includes('20/60 ft'), true);

clearLog();
script([20, 12], [4, 3]);
click(thrownBtn);
check('Throwing costs a dagger', api.poolValue('daggers'), 6);
check('Range shown in the log', topEntry().textContent.includes('20/60 ft'), true);
check('Thrown roll uses the Dex attack bonus',
  topEntry().querySelector('.roll-total').textContent.trim(), '18');
click([...topEntry().querySelectorAll('.roll-action-btn')].find((b) => b.textContent === 'Hit'));
check('Thrown damage is piercing',
  topEntry().querySelector('.dmg-type').textContent.trim(), 'piercing');
check('Thrown damage uses d4',
  topEntry().querySelector('.dmg-dice').textContent.includes('1d4+4'), true);

// Melee daggers cost nothing — you keep hold of them.
const meleeDagger = [...doc.querySelectorAll('.attack-btn')]
  .find((b) => b.textContent.includes('DAGGER') === false
    && b.querySelector('.atk-name').textContent === 'Dagger');
script([20, 10], [6, 2]);
click(meleeDagger);
check('Melee dagger costs nothing', api.poolValue('daggers'), 6);

// Run the pool dry: the button disables rather than throwing daggers you
// do not have.
for (let i = 0; i < 6; i++) {
  script([20, 10]);
  click(thrownBtn);
}
check('Pool emptied', api.poolValue('daggers'), 0);
check('Button disabled when out', thrownBtn.disabled, true);

const logLength = logEl.children.length;
script([20, 10]);
click(thrownBtn);
check('Clicking an empty pool rolls nothing', logEl.children.length, logLength);

// A long rest returns them, and the button comes back.
click(doc.getElementById('longRest'));
check('Long rest recovers daggers', api.poolValue('daggers'), 7);
check('Button re-enabled', thrownBtn.disabled, false);

// --- the live panel holds all of the in-play state ----------------------------
const panel = doc.getElementById('playPanel');
const inplayDetails = doc.getElementById('inplayDetails');
check('Panel exists', !!panel, true);
check('Panel holds hit points', !!panel.querySelector('#hpCurrent'), true);
check('Panel holds resource pips', !!panel.querySelector('.pip-row[data-pool="focus"]'), true);
check('Panel holds the rests', !!panel.querySelector('#shortRest'), true);
check('Panel holds the dice', panel.querySelectorAll('.die-btn').length, 6);
check('Panel holds the roll log', !!panel.querySelector('#rollLog'), true);
check('Old separate dice card is gone', doc.querySelectorAll('.dice-card').length, 0);
check('Old dice result element is gone', !!doc.getElementById('diceResult'), false);

// --- the panel hides when In Play is collapsed --------------------------------
check('Visible while In Play is open', panel.className.includes('is-hidden'), false);
inplayDetails.removeAttribute('open');
inplayDetails.dispatchEvent(new Event('toggle'));
check('Hidden when In Play closes', panel.className.includes('is-hidden'), true);
inplayDetails.setAttribute('open', '');
inplayDetails.dispatchEvent(new Event('toggle'));
check('Shown again when In Play opens', panel.className.includes('is-hidden'), false);

// --- ad-hoc dice land in the roll log -----------------------------------------
click(autoBtn);
clearLog();
script([20, 17]);
click(doc.querySelector('.die-btn[data-sides="20"]'));
check('Die roll logged', logEl.children.length, 1);
check('Die entry labelled', topEntry().querySelector('.roll-label').textContent, 'D20');
check('Die value shown', topEntry().querySelector('.roll-total').textContent.trim(), '17');
check('Die entry marked as a die', topEntry().className.includes('is-die'), true);

// Total sums only the ad-hoc dice, ignoring attacks and saves in the same log.
script([6, 4]);
click(doc.querySelector('.die-btn[data-sides="6"]'));
api.setHP(27);
script([20, 11]);
click(doc.querySelector('[data-roll-skill="stealth"]'));
check('Log holds dice and a skill check', logEl.children.length, 3);
click(doc.getElementById('totalHistory'));
const totalEl = doc.getElementById('historyTotal');
check('Total counts dice only', totalEl.textContent, 'Total: ' + (17 + 4));
check('Total is visible', totalEl.hidden, false);

// Clearing the log resets the total too.
click(doc.getElementById('clearRollLog'));
check('Log cleared', logEl.children.length, 0);
check('Total hidden after clearing', totalEl.hidden, true);

// --- manual mode has no ad-hoc dice -------------------------------------------
const diceBlock = doc.getElementById('diceBlock');
check('Dice shown in auto mode', diceBlock.hidden, false);
click(manualBtn);
check('Dice hidden in manual mode', diceBlock.hidden, true);
click(autoBtn);
check('Dice back in auto mode', diceBlock.hidden, false);

// --- Flurry strikes are chained, not fired at once ----------------------------
// Under reduced motion the chain runs straight through, so this proves the
// wiring and the ordering; the visible delay between them is not observable
// here.
click(autoBtn);
api.setHP(27);
clearLog();
script([20, 20], [6, 4], [6, 4], [20, 14], [6, 5]);
click(flurry);
check('Flurry still logs two strikes', logEl.children.length, 2);
check('First strike logged first',
  logEl.children[1].querySelector('.roll-label').textContent.includes('Flurry 1'), true);
check('Second strike logged second',
  logEl.children[0].querySelector('.roll-label').textContent.includes('Flurry 2'), true);
check('Label uses the short form',
  logEl.children[0].querySelector('.roll-label').textContent.includes('Flurry of Blows'), false);
// Each strike consumed its own scripted d20, in order.
check('First strike crit', logEl.children[1].className.includes('is-crit'), true);
check('Second strike did not', logEl.children[0].className.includes('is-crit'), false);
check('Second strike total', logEl.children[0].querySelector('.roll-total').textContent.trim(), '20');

// --- the spin animation must never consume real dice --------------------------
// Display frames come from a private counter, so a scripted roll is not eaten
// by the animation regardless of how many frames it draws.
clearLog();
const beforeSpin = unscripted;
script([20, 13]);
click(doc.querySelector('[data-roll-skill="stealth"]'));
check('Skill roll used exactly its scripted die',
  topEntry().querySelector('.roll-total').textContent.trim(), '19');
check('Animation consumed no extra dice', unscripted - beforeSpin, 0);

// --- a queued strike waits for the previous one to be resolved ----------------
click(autoBtn);
api.setHP(27);

// Ordinary roll: the second strike is held until Hit or Miss is declared.
clearLog();
script([20, 12]);
click(flurry);
check('Only the first strike appears', logEl.children.length, 1);
check('First strike awaits a decision',
  labelsOf(topEntry()).filter((l) => l === 'Hit' || l === 'Miss').length, 2);

script([6, 3], [20, 9]);
click([...topEntry().querySelectorAll('.roll-action-btn')].find((b) => b.textContent === 'Hit'));
check('Confirming a hit releases the next strike', logEl.children.length, 2);
check('Released strike rolled its own die',
  logEl.children[0].querySelector('.roll-total').textContent.trim(), '15');

// Declaring a miss releases it too.
clearLog();
script([20, 12]);
click(flurry);
script([20, 8]);
click([...topEntry().querySelectorAll('.roll-action-btn')].find((b) => b.textContent === 'Miss'));
check('Declaring a miss releases the next strike', logEl.children.length, 2);

// A natural 1 decides itself, so it releases without a click.
clearLog();
script([20, 1], [20, 15]);
click(flurry);
check('Natural 1 releases the next strike on its own', logEl.children.length, 2);

// A reroll hands the queue to its replacement rather than stalling or
// double-releasing it.
click(doc.getElementById('longRest')); // restore Inspiration
api.setHP(27);
clearLog();
script([20, 12]);
click(flurry);
check('One strike before the reroll', logEl.children.length, 1);
script([20, 16]);
click([...topEntry().querySelectorAll('.roll-action-btn')].find((b) => b.textContent.includes('Reroll')));
check('Reroll replaced the entry, queue still held', logEl.children.length, 1);
check('Rerolled value shown', topEntry().querySelector('.roll-total').textContent.trim(), '22');
script([6, 2], [20, 7]);
click([...topEntry().querySelectorAll('.roll-action-btn')].find((b) => b.textContent === 'Hit'));
check('Resolving the replacement releases the next strike', logEl.children.length, 2);

Math.random = realRandom;

let failed = 0;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label.padEnd(38)} ${ok ? actual : `got ${actual}, expected ${expected}`}`);
}
console.log(`\n${checks.length - failed}/${checks.length} runtime checks passed`);
if (unscripted) console.log(`note: ${unscripted} unscripted die roll(s) used the 0.5 fallback`);
if (failed) Deno.exit(1);
