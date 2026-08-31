// Dice evaluation. Pure functions with an injectable RNG so they can be tested.
//
// This module is written as an ES module for the test suite, and inlined into
// the built page as a classic script (build.js strips the `export` keywords).
// Keep it dependency-free and ES5-compatible in its body for that reason.

/** Parse "2d6+4", "1d10-1", "d20" into {count, sides, mod}, or null. */
export function parseDice(expr) {
  var m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/.exec(String(expr || ''));
  if (!m) return null;
  return {
    count: m[1] ? parseInt(m[1], 10) : 1,
    sides: parseInt(m[2], 10),
    mod: m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0,
  };
}

/** Default RNG: a fair die of `sides`. */
export function defaultRng(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll a dice expression.
 *
 * `double` doubles the number of dice but NOT the modifier, which is the 2024
 * critical hit rule.
 */
export function rollDice(expr, double, rng) {
  var roll = rng || defaultRng;
  var spec = parseDice(expr);
  if (!spec) return null;
  var count = double ? spec.count * 2 : spec.count;
  var rolls = [];
  var total = spec.mod;
  for (var i = 0; i < count; i++) {
    var r = roll(spec.sides);
    rolls.push(r);
    total += r;
  }
  return { rolls: rolls, mod: spec.mod, total: total, sides: spec.sides };
}

/**
 * A d20 test. `mode` is 'adv', 'dis' or anything else for a flat roll.
 * Only a natural 20 crits, and only a natural 1 fumbles.
 */
export function rollD20(modifier, mode, rng) {
  var roll = rng || defaultRng;
  var a = roll(20);
  var b = (mode === 'adv' || mode === 'dis') ? roll(20) : null;
  var pick = a;
  if (b !== null) pick = (mode === 'adv') ? Math.max(a, b) : Math.min(a, b);
  return {
    natural: pick,
    pair: b === null ? null : [a, b],
    modifier: modifier,
    total: pick + modifier,
    crit: pick === 20,
    fumble: pick === 1,
  };
}
