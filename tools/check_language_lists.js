// Checks every environment's language-lists.json: valid array, canonical format, known and unique products,
// unique client IDs, countries/locales supported by values.yaml, and an Argo app that injects the file.
// Run: node tools/check_language_lists.js
const fs = require('fs');
const path = require('path');
const { listPath, readList, formatList } = require('../scripts/language-lists.js');
const { loadServiceConfig } = require('../scripts/language-list-request.js');

const root = path.resolve(__dirname, '..');
const owners = JSON.parse(fs.readFileSync(path.join(root, 'language-lists/owners.json'), 'utf8'));
const problems = [];

for (const env of fs.readdirSync(path.join(root, 'environments')).sort()) {
  const file = listPath(env);
  if (!fs.existsSync(path.join(root, file))) {
    problems.push(`${file}: missing (Argo would fail to render the service)`);
    continue;
  }
  let list;
  try {
    list = readList(root, env);
  } catch (e) {
    problems.push(`${file}: invalid JSON (${e.message})`);
    continue;
  }
  if (!Array.isArray(list)) {
    problems.push(`${file}: must be an array`);
    continue;
  }
  if (fs.readFileSync(path.join(root, file), 'utf8') !== formatList(list)) problems.push(`${file}: not in canonical format`);

  const { countries, regions } = loadServiceConfig(root, env);
  const seenProducts = new Set();
  const seenClients = new Map();
  for (const p of list) {
    if (!owners[p.product]) problems.push(`${file}: product ${p.product} is not in owners.json`);
    if (seenProducts.has(p.product)) problems.push(`${file}: product ${p.product} listed twice`);
    seenProducts.add(p.product);
    for (const id of p.clientIds) {
      if (seenClients.has(id)) problems.push(`${file}: client ${id} in both ${seenClients.get(id)} and ${p.product}`);
      seenClients.set(id, p.product);
    }
    for (const [country, locales] of Object.entries(p.countries)) {
      const region = countries[country];
      if (!region) {
        problems.push(`${file}: ${p.product} ${country} is not in the countries map`);
        continue;
      }
      const supported = new Set((regions[region] || []).map((l) => l.name));
      for (const l of locales) if (!supported.has(l)) problems.push(`${file}: ${p.product} ${country} ${l} not supported in region ${region}`);
    }
  }

  const app = path.join(root, 'argocd', env, 'accounts-service.yaml');
  if (!fs.existsSync(app) || !fs.readFileSync(app, 'utf8').includes('path: language-lists.json')) {
    problems.push(`argocd/${env}/accounts-service.yaml: missing fileParameters for language-lists.json`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
console.log('language lists OK');
