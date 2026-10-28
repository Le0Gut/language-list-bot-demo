// Regenerates the APP_ACCOUNTS_LANGUAGELISTS block in every environments/<env>/values.yaml from the product JSON files,
// and normalizes the JSON formatting. Use --check in CI to fail when they drift.
// Run: node tools/sync_values.js [--check]
const fs = require('fs');
const path = require('path');
const { formatProductFile, renderValues, loadProducts } = require('../scripts/language-lists-sync.js');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const drift = [];

for (const env of fs.readdirSync(path.join(root, 'environments')).sort()) {
  const dir = path.join(root, 'environments', env, 'language-lists');
  for (const p of loadProducts(root, env)) {
    const file = path.join(dir, `${p.product}.json`);
    const want = formatProductFile(p);
    if (fs.readFileSync(file, 'utf8') !== want) {
      drift.push(path.relative(root, file));
      if (!check) fs.writeFileSync(file, want);
    }
  }
  const valuesFile = path.join(root, 'environments', env, 'values.yaml');
  const want = renderValues(root, env);
  if (fs.readFileSync(valuesFile, 'utf8') !== want) {
    drift.push(path.relative(root, valuesFile));
    if (!check) fs.writeFileSync(valuesFile, want);
  }
}

if (check && drift.length) {
  console.error(`Out of sync (run node tools/sync_values.js):\n${drift.map((d) => `- ${d}`).join('\n')}`);
  process.exit(1);
}
console.log(drift.length ? `updated:\n${drift.map((d) => `- ${d}`).join('\n')}` : 'in sync');
