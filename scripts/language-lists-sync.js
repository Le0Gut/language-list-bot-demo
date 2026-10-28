// Keeps the single APP_ACCOUNTS_LANGUAGELISTS config in each values.yaml in sync with the per-product JSON files.
const fs = require('fs');
const path = require('path');

const ENV_ROOT = 'environments';
const CONFIG_KEY = 'APP_ACCOUNTS_LANGUAGELISTS';

// One country per line so diffs show exactly which country changed; output is still valid JSON.
function formatProduct(p, pad = '') {
  const countries = Object.keys(p.countries).sort();
  const lines = [
    `${pad}{`,
    `${pad}  "product": ${JSON.stringify(p.product)},`,
    `${pad}  "clientIds": ${JSON.stringify(p.clientIds)},`,
    `${pad}  "countries": {`,
    ...countries.map((c, i) => `${pad}    ${JSON.stringify(c)}: ${JSON.stringify(p.countries[c])}${i < countries.length - 1 ? ',' : ''}`),
    `${pad}  }`,
    `${pad}}`,
  ];
  return lines.join('\n');
}

function formatProductFile(p) {
  return `${formatProduct(p)}\n`;
}

function formatConfig(products, pad) {
  const sorted = [...products].sort((a, b) => a.product.localeCompare(b.product));
  return [`${pad}[`, sorted.map((p) => formatProduct(p, `${pad}  `)).join(',\n'), `${pad}]`].join('\n');
}

function loadProducts(root, env, overrides = {}) {
  const dir = path.join(root, ENV_ROOT, env, 'language-lists');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => overrides[f] ?? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// Replaces the "KEY: |" block (all following lines indented deeper than the key) with the rendered config.
function replaceConfigBlock(valuesText, products) {
  const lines = valuesText.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s*${CONFIG_KEY}:\\s*\\|-?\\s*$`).test(l));
  if (start === -1) throw new Error(`${CONFIG_KEY}: | block not found`);
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || lines[end].match(/^\s*/)[0].length > keyIndent)) end++;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  const block = formatConfig(products, ' '.repeat(keyIndent + 2)).split('\n');
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n');
}

function readConfigBlock(valuesText) {
  const lines = valuesText.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s*${CONFIG_KEY}:\\s*\\|-?\\s*$`).test(l));
  if (start === -1) throw new Error(`${CONFIG_KEY}: | block not found`);
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].trim() === '' || lines[i].match(/^\s*/)[0].length > keyIndent); i++) body.push(lines[i]);
  return JSON.parse(body.join('\n'));
}

// Returns the regenerated values.yaml content for an env, using overrides for files changed in memory.
function renderValues(root, env, overrides = {}) {
  const file = path.join(root, ENV_ROOT, env, 'values.yaml');
  return replaceConfigBlock(fs.readFileSync(file, 'utf8'), loadProducts(root, env, overrides));
}

module.exports = { CONFIG_KEY, formatProductFile, renderValues, readConfigBlock, loadProducts };
