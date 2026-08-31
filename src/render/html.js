// Small HTML helpers shared by the screen and print renderers.
//
// Character files are local and authored by hand, so feature text is trusted
// and may contain markup (<strong>, <em>). Values that come from data are
// escaped by default via esc().

/** Escape text for safe insertion into markup. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Replace {token} placeholders from the derived token map.
 *
 * Unknown tokens are left visible as {likeThis} rather than silently blanked,
 * and recorded on `fill.misses` so the verifier can fail on typos.
 */
export function fill(text, tokens) {
  if (text == null) return '';
  return String(text).replace(/\{(\w+)\}/g, (match, key) => {
    if (key in tokens) return tokens[key];
    fill.misses.add(key);
    return match;
  });
}
fill.misses = new Set();

/** Join a list of rendered fragments. */
export function join(parts) {
  return parts.filter(Boolean).join('\n');
}

/** Render a list of items with a mapper, joined. */
export function each(items, mapper) {
  return join((items ?? []).map(mapper));
}

/** Conditional fragment. */
export function when(condition, fragment) {
  return condition ? fragment : '';
}
