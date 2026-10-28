// Shared helpers for environments/<env>/language-lists.json: one JSON array with an entry per product.
// Argo CD injects the file into the service config (helm fileParameters), so it is the only copy.
const fs = require('fs');
const path = require('path');

const ENV_ROOT = 'environments';
const LIST_FILE = 'language-lists.json';

function listPath(env) {
  return `${ENV_ROOT}/${env}/${LIST_FILE}`;
}

function readList(root, env) {
  return JSON.parse(fs.readFileSync(path.join(root, listPath(env)), 'utf8'));
}

// Products sorted, one country per line, so a PR diff shows exactly which country of which product changed.
function formatList(products) {
  const sorted = [...products].sort((a, b) => a.product.localeCompare(b.product));
  const entry = (p) => {
    const countries = Object.keys(p.countries).sort();
    return [
      '  {',
      `    "product": ${JSON.stringify(p.product)},`,
      `    "clientIds": ${JSON.stringify(p.clientIds)},`,
      '    "countries": {',
      ...countries.map((c, i) => `      ${JSON.stringify(c)}: ${JSON.stringify(p.countries[c])}${i < countries.length - 1 ? ',' : ''}`),
      '    }',
      '  }',
    ].join('\n');
  };
  return `[\n${sorted.map(entry).join(',\n')}\n]\n`;
}

// Throws unless every entry other than `product` is unchanged and no entry was added or removed.
function assertOnlyProductChanged(before, after, product) {
  const index = (list) => new Map(list.map((p) => [p.product, JSON.stringify(p)]));
  const b = index(before);
  const a = index(after);
  const names = new Set([...b.keys(), ...a.keys()]);
  for (const name of names) {
    if (name === product) continue;
    if (b.get(name) !== a.get(name)) throw new Error(`Refusing to change entries other than ${product} (touched ${name}).`);
  }
  if (!b.has(product) || !a.has(product)) throw new Error(`Entry ${product} must exist before and after the change.`);
}

module.exports = { ENV_ROOT, LIST_FILE, listPath, readList, formatList, assertOnlyProductChanged };
