// In-play state: hit points, resource pools, rests, dice.
//
// This is a CLASSIC script, not an ES module — it gets inlined verbatim into
// the built page so the sheet works from file:// with no server. Its only
// input is window.SHEET_CONFIG, written by tools/build.js, so nothing here is
// character-specific.

(function () {
  var config = window.SHEET_CONFIG || {};
  var MAX_HP = config.maxHP || 1;
  var STORE_KEY = 'sheet-' + (config.slug || 'character') + '-v1';

  // Pools come from the derived character; death saves are always present.
  var pools = {};
  (config.pools || []).forEach(function (p) {
    pools[p.key] = { max: p.max, recovery: p.recovery };
  });
  pools.dsSuccess = { max: 3, recovery: 'none' };
  pools.dsFail = { max: 3, recovery: 'none' };

  var hpInput = document.getElementById('hpCurrent');
  if (!hpInput) return;

  function defaultState() {
    var s = { hp: MAX_HP, umUsed: false };
    Object.keys(pools).forEach(function (key) {
      s[key] = key.indexOf('ds') === 0 ? 0 : pools[key].max;
    });
    return s;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* private mode, blocked storage: fall through */ }
    return defaultState();
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  var state = loadState();
  var hpAmount = document.getElementById('hpAmount');
  var hpCard = document.getElementById('hpCard');
  var deathSaves = document.getElementById('deathSaves');

  var deadNotice = document.getElementById('deadNotice');

  var DEATH_CAUSES = {
    damage: {
      title: 'Killed outright.',
      body: 'The remaining damage met or exceeded your hit point maximum, so '
        + 'there are no death saves. Healing or a long rest undoes this.',
    },
    saves: {
      title: 'Dead.',
      body: 'Three failed death saving throws. Healing or a long rest undoes this.',
    },
  };

  function renderHP() {
    hpInput.value = state.hp;
    hpCard.classList.toggle('low', state.hp > 0 && state.hp <= Math.ceil(MAX_HP / 4));
    hpCard.classList.toggle('dead', !!state.dead);
    // Once killed outright there is nothing to roll for.
    deathSaves.hidden = state.hp !== 0 || !!state.dead;
    if (deadNotice) {
      deadNotice.hidden = !state.dead;
      if (state.dead) {
        var cause = DEATH_CAUSES[state.deathCause] || DEATH_CAUSES.damage;
        deadNotice.innerHTML = '<strong>' + cause.title + '</strong>' + cause.body;
      }
    }
  }

  /**
   * Damage from a single source.
   *
   * Instant death: if the damage reduces you to 0 and the REMAINING damage
   * equals or exceeds your hit point maximum, you die outright, with no death
   * saves. Setting hit points directly deliberately does not trigger this —
   * only damage from one source can.
   */
  function applyDamage(amount) {
    var remaining = amount - state.hp;
    setHP(state.hp - amount);
    if (state.hp === 0 && remaining >= MAX_HP) {
      state.dead = true;
      state.deathCause = 'damage';
      state.dsSuccess = 0;
      state.dsFail = 3;
      renderPool('dsSuccess');
      renderPool('dsFail');
      renderHP();
      saveState();
      return { dead: true, remaining: remaining };
    }
    return { dead: false, remaining: Math.max(0, remaining) };
  }

  function setHP(v) {
    state.hp = clamp(Math.round(isNaN(v) ? state.hp : v), 0, MAX_HP);
    if (state.hp > 0) { state.dead = false; state.deathCause = null; }
    if (state.hp !== 0) {
      state.dsSuccess = 0;
      state.dsFail = 0;
      renderPool('dsSuccess');
      renderPool('dsFail');
    }
    renderHP();
    saveState();
  }

  function containerFor(key) {
    // Must be the pip row specifically: ability and attack buttons also carry
    // data-pool to declare what they spend, and some of them precede the
    // panel in the document.
    return document.querySelector('.pip-row[data-pool="' + key + '"]');
  }

  function buildPips(key) {
    var container = containerFor(key);
    if (!container) return;
    container.innerHTML = '';
    for (var i = 0; i < pools[key].max; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pip';
      b.setAttribute('aria-label', key + ' point ' + (i + 1));
      (function (idx) {
        b.addEventListener('click', function () {
          state[key] = (state[key] === idx + 1) ? idx : idx + 1;
          renderPool(key);
          saveState();
        });
      })(i);
      container.appendChild(b);
    }
  }

  var poolListeners = [];

  function renderPool(key) {
    var container = containerFor(key);
    if (!container) return;
    Array.prototype.forEach.call(container.querySelectorAll('.pip'), function (p, i) {
      p.classList.toggle('spent', i >= state[key]);
    });
    var countEl = document.querySelector('[data-count="' + key + '"]');
    if (countEl) countEl.textContent = state[key] + '/' + pools[key].max;
    refreshAbilityButtons();
    poolListeners.forEach(function (fn) { fn(); });
  }

  function refreshAbilityButtons() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.ability-btn[data-pool]'),
      function (btn) {
        var pool = btn.getAttribute('data-pool');
        var amount = parseInt(btn.getAttribute('data-amount'), 10);
        btn.disabled = state[pool] < amount;
      }
    );
    var umBtn = document.querySelector('.ability-btn[data-special="refillFocus"]');
    if (umBtn) umBtn.disabled = state.umUsed;
  }

  Object.keys(pools).forEach(buildPips);
  Object.keys(pools).forEach(renderPool);
  renderHP();

  Array.prototype.forEach.call(
    document.querySelectorAll('.ability-btn[data-pool]'),
    function (btn) {
      btn.addEventListener('click', function () {
        var pool = btn.getAttribute('data-pool');
        var amount = parseInt(btn.getAttribute('data-amount'), 10);
        if (state[pool] < amount) return;
        state[pool] -= amount;
        renderPool(pool);
        saveState();
      });
    }
  );

  var umBtn = document.querySelector('.ability-btn[data-special="refillFocus"]');
  if (umBtn) {
    umBtn.addEventListener('click', function () {
      if (state.umUsed) return;
      state.focus = pools.focus.max;
      state.umUsed = true;
      renderPool('focus');
      saveState();
    });
  }

  hpInput.addEventListener('change', function () { setHP(parseInt(hpInput.value, 10)); });
  document.getElementById('hpDamage').addEventListener('click', function () {
    applyDamage(parseInt(hpAmount.value, 10) || 0);
  });
  document.getElementById('hpHeal').addEventListener('click', function () {
    setHP(state.hp + (parseInt(hpAmount.value, 10) || 0));
  });
  document.getElementById('hpReset').addEventListener('click', function () { setHP(MAX_HP); });

  // Surface the bits of HP/death-save state the roller needs to drive.
  window.SHEET_API = {
    heal: function (amount) { setHP(state.hp + amount); },
    damage: function (amount) { return applyDamage(amount); },
    setHP: function (v) { setHP(v); },
    isDead: function () { return !!state.dead; },
    markDead: function (cause) {
      state.dead = true;
      state.deathCause = cause || 'saves';
      renderHP();
      saveState();
    },
    getHP: function () { return state.hp; },
    isDying: function () { return state.hp === 0 && !state.dead; },
    addDeathSave: function (kind, count) {
      var key = kind === 'success' ? 'dsSuccess' : 'dsFail';
      state[key] = clamp(state[key] + (count || 1), 0, 3);
      renderPool(key);
      saveState();
      return state[key];
    },
    deathSaves: function () {
      return { success: state.dsSuccess, fail: state.dsFail };
    },
    poolValue: function (key) { return pools[key] ? state[key] : 0; },
    onPoolChange: function (fn) { poolListeners.push(fn); fn(); },
    spendPool: function (key, amount) {
      if (!pools[key] || state[key] < amount) return false;
      state[key] -= amount;
      renderPool(key);
      saveState();
      return true;
    },
    resetDeathSaves: function () {
      state.dsSuccess = 0;
      state.dsFail = 0;
      renderPool('dsSuccess');
      renderPool('dsFail');
      saveState();
    },
  };

  // Rests restore every pool whose recovery matches, derived from the config.
  function rest(kind) {
    Object.keys(pools).forEach(function (key) {
      var rec = pools[key].recovery;
      if (key.indexOf('ds') === 0) {
        if (kind === 'long') state[key] = 0;
      } else if (rec === 'short' || (kind === 'long' && rec === 'long')) {
        state[key] = pools[key].max;
      }
      renderPool(key);
    });
    if (kind === 'long') {
      state.umUsed = false;
      state.dead = false;
      state.deathCause = null;
      setHP(MAX_HP);
    }
    refreshAbilityButtons();
    saveState();
  }

  document.getElementById('shortRest').addEventListener('click', function () { rest('short'); });
  document.getElementById('longRest').addEventListener('click', function () { rest('long'); });
})();

// --- Collapse/expand, print ---------------------------------------------------
(function () {
  var btn = document.getElementById('toggleAll');
  var ds = Array.prototype.slice.call(document.querySelectorAll('section > details'));
  if (!btn || !ds.length) return;
  btn.addEventListener('click', function () {
    var open = ds.some(function (d) { return !d.open; });
    ds.forEach(function (d) { d.open = open; });
    btn.textContent = open ? 'Collapse all' : 'Expand all';
  });
  window.addEventListener('beforeprint', function () {
    ds.forEach(function (d) { d.open = true; });
  });
})();

(function () {
  var printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
})();

// --- Combat rolls -------------------------------------------------------------
// Attack rolls, checks, saves and feature dice. Everything it needs is derived
// at build time and handed over in SHEET_CONFIG; nothing here knows any rules
// beyond "a natural 20 doubles the damage dice".

(function () {
  var config = window.SHEET_CONFIG || {};
  var log = document.getElementById('rollLog');
  if (!log) return;

  var mode = 'flat'; // 'adv' | 'dis' | 'flat'

  // The settle animation must not touch Math.random: that would consume real
  // dice, break the "manual mode rolls nothing" guarantee, and make scripted
  // tests non-deterministic. These are throwaway display frames, so a plain
  // counter is enough.
  var spinSeed = 1;
  function spinValue(max) {
    spinSeed = (spinSeed * 1103515245 + 12345) & 0x7fffffff;
    return (spinSeed % max) + 1;
  }

  var SPIN = [35, 40, 50, 60, 80, 110, 150, 200];
  var prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Spin an entry's headline before settling on its real total.
   *
   * Skipped when the player typed the number themselves, and when the system
   * asks for reduced motion. `done` always runs, so callers can chain on it.
   */
  function animateTotal(el, finalTotal, sides, modifier, done) {
    var target = el.querySelector('.roll-total');
    if (!target || manual || prefersReducedMotion) {
      if (target) target.textContent = finalTotal;
      done();
      return;
    }
    el.classList.add('is-rolling');
    var step = 0;
    (function tick() {
      if (step >= SPIN.length) {
        target.textContent = finalTotal;
        el.classList.remove('is-rolling');
        done();
        return;
      }
      target.textContent = spinValue(sides) + modifier;
      setTimeout(tick, SPIN[step]);
      step++;
    })();
  }

  // parseDice / rollDice / rollD20 come from src/dice.js, inlined above.
  function rollAttackDamage(expr, crit) { return rollDice(expr, crit); }

  function setMode(next) {
    mode = next;
    Array.prototype.forEach.call(document.querySelectorAll('.adv-btn'), function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-adv') === next);
    });
  }

  /**
   * A d20 test at the current advantage setting.
   *
   * Advantage falls back to normal afterwards: Lucky grants advantage on *the*
   * roll, one Luck Point at a time, so it should never carry silently into the
   * next one.
   */
  function d20(modifier) {
    var r = rollD20(modifier, mode);
    if (mode !== 'flat') setMode('flat');
    return r;
  }

  // --- manual dice -----------------------------------------------------------
  // At a physical table you roll your own dice. In manual mode the sheet stops
  // generating numbers and asks for them instead, but still does all the
  // arithmetic: modifiers, crit rules, damage totals, rider effects.
  var MANUAL_KEY = 'sheet-' + (config.slug || 'character') + '-manual';
  var manual = false;
  try { manual = localStorage.getItem(MANUAL_KEY) === '1'; } catch (e) { /* ignore */ }

  function setManual(on) {
    manual = !!on;
    try { localStorage.setItem(MANUAL_KEY, manual ? '1' : '0'); } catch (e) { /* ignore */ }
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (b) {
      b.classList.toggle('is-on', (b.getAttribute('data-mode') === 'manual') === manual);
    });
    // Advantage is something you handle with your own two dice in manual mode.
    Array.prototype.forEach.call(document.querySelectorAll('.adv-btn'), function (b) {
      b.disabled = manual;
    });
    var hint = document.getElementById('manualHint');
    if (hint) hint.hidden = !manual;
    var diceBlock = document.getElementById('diceBlock');
    if (diceBlock) diceBlock.hidden = manual;
    if (manual) setMode('flat');
  }

  /** Append an input to a log entry and hand the typed number to `cb`. */
  function askForValue(el, promptText, cb) {
    var row = document.createElement('div');
    row.className = 'roll-input';

    var caption = document.createElement('span');
    caption.className = 'ri-label';
    caption.textContent = promptText;

    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'ri-field';
    input.min = '0';

    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'roll-action-btn is-hit';
    ok.textContent = 'Enter';

    function submit() {
      var v = parseInt(input.value, 10);
      if (isNaN(v)) return;
      if (row.parentNode) row.parentNode.removeChild(row);
      cb(v);
    }
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') submit();
    });

    row.appendChild(caption);
    row.appendChild(input);
    row.appendChild(ok);
    el.appendChild(row);
    if (input.focus) input.focus();
    return row;
  }

  /** A d20 test: rolled for you, or typed in from the die on the table. */
  function getD20(el, modifier, cb) {
    if (!manual) { cb(d20(modifier)); return; }
    askForValue(el, 'd20 result', function (raw) {
      var nat = Math.max(1, Math.min(20, raw));
      cb({
        natural: nat,
        pair: null,
        modifier: modifier,
        total: nat + modifier,
        crit: nat === 20,
        fumble: nat === 1,
      });
    });
  }

  /** Damage dice: rolled for you, or typed in as the total of the dice. */
  function getDice(el, expr, double, cb) {
    if (!manual) { cb(rollDice(expr, double)); return; }
    var spec = parseDice(expr);
    if (!spec) { cb(null); return; }
    var count = double ? spec.count * 2 : spec.count;
    askForValue(el, 'total of ' + count + 'd' + spec.sides, function (sum) {
      cb({ rolls: [sum], mod: spec.mod, total: sum + spec.mod, sides: spec.sides });
    });
  }

  // Heroic Inspiration is a reroll, not advantage: you see the die, then decide.
  var INSPIRATION = 'inspiration';

  function canReroll() {
    var api = window.SHEET_API;
    return !!api && api.poolValue(INSPIRATION) > 0;
  }

  /** Spend Heroic Inspiration to discard this entry and roll it again. */
  function rerollItem(redo) {
    return {
      label: 'Reroll',
      tone: 'reroll',
      run: function () {
        var api = window.SHEET_API;
        if (!api || !api.spendPool(INSPIRATION, 1)) return;
        redo();
      },
    };
  }

  function sign(n) { return n < 0 ? String(n) : '+' + n; }

  function entry(label, headline, detail, flag) {
    var el = document.createElement('div');
    el.className = 'roll-entry' + (flag ? ' is-' + flag : '');
    el.innerHTML = '<span class="roll-label">' + label + '</span>'
      + '<span class="roll-total">' + headline + '</span>'
      + '<span class="roll-detail">' + detail + '</span>';
    log.insertBefore(el, log.firstChild);
    while (log.children.length > 12) log.removeChild(log.lastChild);
    return el;
  }

  function describeD20(r) {
    var parts = r.pair
      ? 'd20 [' + r.pair.join(', ') + '] &rarr; ' + r.natural
      : 'd20 ' + r.natural;
    return parts + ' ' + sign(r.modifier);
  }

  function setPart(el, cls, html) {
    var target = el.querySelector('.' + cls);
    // Coerce explicitly: assigning a number to innerHTML is not reliable.
    if (target) target.innerHTML = String(html);
  }

  /** Append a row of buttons to a log entry, and return it. */
  function actionsRow(el, items, onPick) {
    var row = document.createElement('div');
    row.className = 'roll-actions';
    items.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'roll-action-btn' + (item.tone ? ' is-' + item.tone : '');
      b.textContent = item.label;
      b.addEventListener('click', function () { onPick(item, row); });
      row.appendChild(b);
    });
    el.appendChild(row);
    return row;
  }

  /**
   * Offer the rider effects a landed hit can impose (Open Hand, and friends).
   *
   * One effect PER LANDED HIT: "whenever you hit a creature with one of the
   * attacks granted by your Flurry of Blows, you can impose one of the
   * following effects on that target". Each attack resolves separately, so a
   * two-strike Flurry that lands both offers two independent choices.
   */
  function offerEffects(el, effectKey) {
    var list = (config.effects || {})[effectKey];
    if (!list || !list.length) return;

    actionsRow(el, list.map(function (e) {
      return { label: e.name, effect: e };
    }), function (item, row) {
      var e = item.effect;
      var out = document.createElement('div');
      out.className = 'roll-effect';
      out.innerHTML = e.save
        ? e.name + ': DC ' + e.dc + ' ' + e.save + ' save or ' + e.onFail
        : e.name + ': ' + e.onFail;
      row.parentNode.replaceChild(out, row);
    });
  }

  /**
   * One attack. Rolls to hit, then waits for you to say whether it landed
   * before rolling damage — except on a natural 20 or 1, which by the 2024
   * rules always hit and always miss respectively.
   */
  function rollAttack(attack, labelPrefix, effectKey, onSettled) {
    var label = (labelPrefix || '') + attack.name;
    // The entry appears first so manual mode has somewhere to put its input.
    var el = entry(label + (attack.range ? ' (' + attack.range + ')' : ''),
      '&mdash;', manual ? 'Roll your d20' : '', '');
    getD20(el, attack.attack, function (hit) {
      animateTotal(el, hit.total, 20, hit.modifier, function () {
        resolveAttack(el, attack, hit, labelPrefix, effectKey);
        if (onSettled) onSettled();
      });
    });
  }

  function resolveAttack(el, attack, hit, labelPrefix, effectKey) {
    var flag = hit.crit ? 'crit' : (hit.fumble ? 'fumble' : '');
    el.className = 'roll-entry' + (flag ? ' is-' + flag : '');
    setPart(el, 'roll-total', hit.total);
    setPart(el, 'roll-detail', describeD20(hit));

    function land(crit) {
      getDice(el, attack.damage, crit, function (dmg) { showDamage(dmg, crit); });
    }

    function showDamage(dmg, crit) {
      // Keep the to-hit total in place and give damage its own, larger block,
      // so both numbers are readable at a glance instead of one replacing the
      // other.
      var block = document.createElement('div');
      block.className = 'roll-damage' + (crit ? ' is-crit' : '');
      block.innerHTML = '<span class="dmg-value">' + dmg.total + '</span>'
        + '<span class="dmg-type">' + (attack.type || 'damage')
        + (crit ? ' &middot; critical' : '') + '</span>'
        + '<span class="dmg-dice">' + attack.damage
        + ' [' + dmg.rolls.join(', ') + (dmg.mod ? ' ' + sign(dmg.mod) : '') + ']</span>';
      el.appendChild(block);
      setPart(el, 'roll-detail', describeD20(hit) + ' &nbsp;&middot;&nbsp; '
        + (crit ? 'critical hit' : 'hit'));
      if (effectKey) offerEffects(el, effectKey);
    }

    // Rerolling replaces this entry with a fresh attempt. Offered only while
    // the outcome is still open — never once damage has been rolled.
    var redo = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      rollAttack(attack, labelPrefix, effectKey);
    };

    // A natural 20 always hits, so it resolves immediately and is not rerollable.
    if (hit.crit) { land(true); return; }

    if (hit.fumble) {
      setPart(el, 'roll-detail', describeD20(hit) + ' &nbsp;&middot;&nbsp; natural 1, miss');
      el.classList.add('is-miss');
      if (canReroll()) actionsRow(el, [rerollItem(redo)], function (item) { item.run(); });
      return;
    }

    var items = [{ label: 'Hit', tone: 'hit' }, { label: 'Miss', tone: 'miss' }];
    if (canReroll()) items.push(rerollItem(redo));

    actionsRow(el, items, function (item, row) {
      if (item.run) { item.run(); return; }
      row.parentNode.removeChild(row);
      if (item.label === 'Hit') {
        land(false);
      } else {
        el.classList.add('is-miss');
        setPart(el, 'roll-detail', describeD20(hit) + ' &nbsp;&middot;&nbsp; miss');
      }
    });
  }

  // --- dice source toggle ---
  Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (btn) {
    btn.addEventListener('click', function () {
      setManual(btn.getAttribute('data-mode') === 'manual');
    });
  });
  setManual(manual); // restore the saved preference

  // --- advantage toggle ---
  Array.prototype.forEach.call(document.querySelectorAll('.adv-btn'), function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.getAttribute('data-adv');
      Array.prototype.forEach.call(document.querySelectorAll('.adv-btn'), function (b) {
        b.classList.toggle('is-on', b === btn);
      });
    });
  });

  // --- attack buttons ---
  // Some attacks consume something. Throwing a dagger means you no longer have
  // that dagger, so the button spends from its pool and disables at zero.
  function refreshAttackButtons() {
    var api = window.SHEET_API;
    if (!api) return;
    Array.prototype.forEach.call(
      document.querySelectorAll('.attack-btn[data-pool]'),
      function (btn) {
        var pool = btn.getAttribute('data-pool');
        var amount = parseInt(btn.getAttribute('data-amount'), 10) || 1;
        btn.disabled = api.poolValue(pool) < amount;
      }
    );
  }

  Array.prototype.forEach.call(document.querySelectorAll('.attack-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var a = (config.attacks || [])[parseInt(btn.getAttribute('data-attack'), 10)];
      if (!a) return;
      if (a.pool) {
        var api = window.SHEET_API;
        if (!api || !api.spendPool(a.pool, a.amount || 1)) return;
      }
      rollAttack(a);
    });
  });

  if (window.SHEET_API && window.SHEET_API.onPoolChange) {
    window.SHEET_API.onPoolChange(refreshAttackButtons);
  }

  // --- checks, saves, initiative ---
  function bindCheck(selector, attr, lookup, suffix) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      el.addEventListener('click', function () {
        var found = lookup(el.getAttribute(attr));
        if (!found) return;
        rollCheck(found, suffix);
      });
    });
  }

  /** A check or save, with the option to spend Inspiration and roll again. */
  function rollCheck(found, suffix) {
    var row = entry(found.name + suffix, '&mdash;', manual ? 'Roll your d20' : '', '');
    getD20(row, found.value, function (r) {
      animateTotal(row, r.total, 20, r.modifier, function () {
      row.className = 'roll-entry' + (r.crit ? ' is-crit' : (r.fumble ? ' is-fumble' : ''));
      setPart(row, 'roll-total', r.total);
      setPart(row, 'roll-detail', describeD20(r));
      if (!canReroll()) return;
      actionsRow(row, [rerollItem(function () {
        if (row.parentNode) row.parentNode.removeChild(row);
        rollCheck(found, suffix);
      })], function (item) { item.run(); });
      });
    });
  }

  var checks = config.checks || {};
  var byKey = function (list) {
    return function (key) {
      for (var i = 0; i < (list || []).length; i++) {
        if (list[i].key === key) return list[i];
      }
      return null;
    };
  };
  bindCheck('[data-roll-skill]', 'data-roll-skill', byKey(checks.skills), '');
  bindCheck('[data-roll-save]', 'data-roll-save', byKey(checks.saves), ' save');
  // Ability checks use the raw modifier, which is a different number from the
  // save whenever the character is proficient in that save.
  bindCheck('[data-roll-check]', 'data-roll-check', byKey(checks.abilities), ' check');

  var initEl = document.querySelector('[data-roll-init]');
  if (initEl && typeof checks.initiative === 'number') {
    initEl.addEventListener('click', function () {
      var r = d20(checks.initiative);
      entry('Initiative', r.total, describeD20(r), '');
    });
  }

  // --- action rolls (Flurry, Deflect, Uncanny Metabolism) ---
  Array.prototype.forEach.call(
    document.querySelectorAll('.ability-btn[data-action]'),
    function (btn) {
      btn.addEventListener('click', function () {
        var a = (config.actions || [])[parseInt(btn.getAttribute('data-action'), 10)];
        if (!a) return;

        if (a.attacks && config.unarmed) {
          // Each strike resolves separately and carries its own rider effect.
          // They are chained rather than fired at once, so one appears and
          // settles before the next shows up.
          (function next(i) {
            if (i >= a.attacks) return;
            rollAttack(
              config.unarmed,
              (a.logName || a.name) + ' ' + (i + 1) + ' · ',
              a.effects,
              function () { next(i + 1); }
            );
          })(0);
          return;
        }
        if (a.roll) {
          var r = rollDice(a.roll);
          if (!r) return;
          var detail = a.roll + ' [' + r.rolls.join(', ')
            + (r.mod ? ' ' + sign(r.mod) : '') + ']';
          entry(a.name, r.total, detail, '');
          if (a.apply === 'heal' && window.SHEET_HEAL) window.SHEET_HEAL(r.total);
        }
      });
    }
  );

  // --- death saves ------------------------------------------------------------
  // Flat d20, no modifier. 10 or higher succeeds. A natural 20 restores 1 hit
  // point outright; a natural 1 counts as two failures. Three of either ends it.
  var dsBtn = document.getElementById('rollDeathSave');
  if (dsBtn) {
    dsBtn.addEventListener('click', function () { rollDeathSave(); });
  }

  function rollDeathSave() {
      var api = window.SHEET_API;
      if (!api || !api.isDying()) return;
      var pending = entry('Death Save', '&mdash;', manual ? 'Roll your d20' : '', '');
      getD20(pending, 0, function (r) {
        animateTotal(pending, r.natural, 20, 0, function () {
          if (pending.parentNode) pending.parentNode.removeChild(pending);
          resolveDeathSave(api, r);
        });
      });
  }

  function resolveDeathSave(api, r) {
      var el;

      if (r.natural === 20) {
        api.resetDeathSaves();
        api.heal(1);
        entry('Death Save', 20, describeD20(r)
          + ' &nbsp;&middot;&nbsp; natural 20, back up with 1 hit point', 'crit');
        return;
      }

      if (r.natural === 1) {
        var fails = api.addDeathSave('fail', 2);
        el = entry('Death Save', 1, describeD20(r)
          + ' &nbsp;&middot;&nbsp; natural 1, two failures ('
          + fails + '/3)', 'fumble');
      } else if (r.natural >= 10) {
        var wins = api.addDeathSave('success', 1);
        el = entry('Death Save', r.natural, describeD20(r)
          + ' &nbsp;&middot;&nbsp; success (' + wins + '/3)', 'hit');
      } else {
        var lost = api.addDeathSave('fail', 1);
        el = entry('Death Save', r.natural, describeD20(r)
          + ' &nbsp;&middot;&nbsp; failure (' + lost + '/3)', 'fumble');
      }

      var tally = api.deathSaves();
      if (tally.success >= 3) {
        var stable = document.createElement('div');
        stable.className = 'roll-effect is-good';
        stable.textContent = 'Stable — unconscious, but no longer dying.';
        el.appendChild(stable);
      } else if (tally.fail >= 3) {
        var dead = document.createElement('div');
        dead.className = 'roll-effect is-bad';
        dead.textContent = 'Three failures — dead.';
        el.appendChild(dead);
        if (api.markDead) api.markDead('saves');
      }

      // Heroic Inspiration can rescue a failed death save. Undo the tick this
      // roll just applied, then roll again in its place.
      if (canReroll()) {
        // Undo exactly what this roll ticked: one success, one failure, or the
        // two failures a natural 1 costs.
        var undoKind = r.natural >= 10 ? 'success' : 'fail';
        var undoAmount = r.natural === 1 ? -2 : -1;
        actionsRow(el, [rerollItem(function () {
          api.addDeathSave(undoKind, undoAmount);
          if (el.parentNode) el.parentNode.removeChild(el);
          rollDeathSave();
        })], function (item) { item.run(); });
      }
  }

  var clearLog = document.getElementById('clearRollLog');
  if (clearLog) {
    clearLog.addEventListener('click', function () { log.innerHTML = ''; });
  }
})();

// --- Dice roller --------------------------------------------------------------
// Ad-hoc dice now land in the roll log rather than a separate history, so one
// list holds everything that happened this turn.

(function () {
  var log = document.getElementById('rollLog');
  if (!log) return;

  var dieButtons = Array.prototype.slice.call(document.querySelectorAll('.die-btn'));
  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rolling = false;
  var rollToken = 0;
  var settleDelays = [40, 40, 50, 60, 80, 100, 130, 170, 220];

  // Display frames only; see the note on spinValue above.
  var spin = 1;
  function spinValue(max) {
    spin = (spin * 1103515245 + 12345) & 0x7fffffff;
    return (spin % max) + 1;
  }

  function logDie(label, value, sides) {
    var el = document.createElement('div');
    el.className = 'roll-entry is-die';
    el.setAttribute('data-die-value', value);
    el.innerHTML = '<span class="roll-label">' + label + '</span>'
      + '<span class="roll-total">' + value + '</span>'
      + '<span class="roll-detail">d' + sides + '</span>';
    log.insertBefore(el, log.firstChild);
    while (log.children.length > 12) log.removeChild(log.lastChild);
    return el;
  }

  dieButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (rolling) return;
      var sides = parseInt(btn.getAttribute('data-sides'), 10);
      var label = btn.textContent;
      var final = Math.floor(Math.random() * sides) + 1;

      if (reduceMotion) { logDie(label, final, sides); return; }

      rolling = true;
      rollToken++;
      var myToken = rollToken;
      dieButtons.forEach(function (b) { b.disabled = true; });

      var el = logDie(label, spinValue(sides), sides);
      var totalEl = el.querySelector('.roll-total');
      var step = 0;

      (function tick() {
        if (myToken !== rollToken) return;
        if (step >= settleDelays.length) {
          totalEl.textContent = final;
          el.setAttribute('data-die-value', final);
          rolling = false;
          dieButtons.forEach(function (b) { b.disabled = false; });
          return;
        }
        totalEl.textContent = spinValue(sides);
        setTimeout(tick, settleDelays[step]);
        step++;
      })();
    });
  });

  // Total sums the ad-hoc dice showing in the log, ignoring attacks and saves.
  var historyTotal = document.getElementById('historyTotal');
  var totalBtn = document.getElementById('totalHistory');
  if (totalBtn && historyTotal) {
    totalBtn.addEventListener('click', function () {
      var sum = 0;
      var count = 0;
      Array.prototype.forEach.call(log.querySelectorAll('[data-die-value]'), function (el) {
        sum += parseInt(el.getAttribute('data-die-value'), 10) || 0;
        count++;
      });
      historyTotal.textContent = count ? 'Total: ' + sum : 'No dice';
      historyTotal.hidden = false;
    });
  }

  var clearBtn = document.getElementById('clearRollLog');
  if (clearBtn && historyTotal) {
    clearBtn.addEventListener('click', function () {
      rollToken++;
      rolling = false;
      dieButtons.forEach(function (b) { b.disabled = false; });
      historyTotal.hidden = true;
    });
  }
})();

// --- Panel visibility follows the In Play section -----------------------------
(function () {
  var details = document.getElementById('inplayDetails');
  var panel = document.getElementById('playPanel');
  if (!details || !panel) return;

  // Read the attribute rather than the IDL property: browsers reflect `open`
  // onto it, and it is the only one a parsed document is guaranteed to have.
  function sync() {
    panel.classList.toggle('is-hidden', !details.hasAttribute('open'));
  }
  details.addEventListener('toggle', sync);
  sync();
})();
