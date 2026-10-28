// Local checks for the language-list bot logic. Run: node tools/local_test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseIssueForm, validate, applyChange } = require('../scripts/language-list-request.js');
const { buildForm, FORM } = require('./generate_issue_form.js');
const { assertOnlyProductChanged, readList } = require('../scripts/language-lists.js');

const root = path.resolve(__dirname, '..');
const owners = {
  aurora: { users: ['owner-a'] },
  nimbus: { users: ['owner-n'], environments: ['dev'] },
};
const envs = fs.readdirSync(path.join(root, 'environments'));

const form = (o) => `### Product\n\n${o.product}\n\n### Environments\n\n${['dev', 'staging'].map((e) => `- [${o.envs.includes(e) ? 'X' : ' '}] ${e}`).join('\n')}\n\n### Change\n\n${o.change}\n\n### Country\n\n${o.country}\n\n### Locales\n\n${o.locales || '_No response_'}\n\n### Reason\n\n_No response_`;

// Copy of the repo data so applyChange never edits the real files.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'langlist-'));
fs.cpSync(path.join(root, 'environments'), path.join(tmp, 'environments'), { recursive: true });

const cases = [];
const t = (name, fn) => cases.push([name, fn]);

t('parses dropdown labels into codes', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev', 'staging'], change: 'Set languages for a country', country: 'US (region NA)', locales: 'en-US - English (United States), es-US - Spanish (United States)' }));
  assert.deepStrictEqual(r.environments, ['dev', 'staging']);
  assert.strictEqual(r.country, 'US');
  assert.deepStrictEqual(r.locales, ['en-US', 'es-US']);
});

t('country missing from an env countries map rejected', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['staging'], change: 'Set languages for a country', country: 'NL (region EU)', locales: 'nl-NL - Dutch (Netherlands)' }));
  assert.ok(applyChange(r, tmp).errors[0].includes('not in the countries map'));
});

t('locale from another region rejected', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev'], change: 'Set languages for a country', country: 'US (region NA)', locales: 'de-DE - German (Germany)' }));
  assert.ok(applyChange(r, tmp).errors[0].includes('not supported in region `NA`'));
});

t('committed issue form matches the catalog', () => {
  assert.strictEqual(fs.readFileSync(FORM, 'utf8'), buildForm(), 'run: node tools/generate_issue_form.js');
});

t('owner can request their product', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev'], change: 'Set languages for a country', country: 'US', locales: 'en-US, es-US' }));
  assert.deepStrictEqual(validate(r, 'owner-a', owners, envs), []);
});

t('aurora owner cannot request nimbus', () => {
  const r = parseIssueForm(form({ product: 'nimbus', envs: ['dev'], change: 'Set languages for a country', country: 'US', locales: 'en-US' }));
  assert.ok(validate(r, 'owner-a', owners, envs)[0].includes('not allowed'));
});

t('nimbus owner limited to dev', () => {
  const r = parseIssueForm(form({ product: 'nimbus', envs: ['staging'], change: 'Set languages for a country', country: 'US', locales: 'en-US' }));
  assert.ok(validate(r, 'owner-n', owners, envs).some((x) => x.includes('in `staging`')));
});

t('bad country and locale formats rejected', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev'], change: 'Set languages for a country', country: 'usa', locales: 'english' }));
  assert.strictEqual(validate(r, 'owner-a', owners, envs).length, 2);
});

t('locale outside the region catalog rejected', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev'], change: 'Set languages for a country', country: 'US', locales: 'xx-XX' }));
  assert.ok(applyChange(r, tmp).errors[0].includes('not supported in region'));
});

t('set changes only the product entry in each env file', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev', 'staging'], change: 'Set languages for a country', country: 'US', locales: 'en-US, es-US' }));
  const { updates, errors } = applyChange(r, tmp);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(updates.map((u) => u.file), [
    'environments/dev/language-lists.json',
    'environments/staging/language-lists.json',
  ]);
  const before = readList(tmp, 'dev');
  const after = JSON.parse(updates[0].content);
  assert.deepStrictEqual(after.find((p) => p.product === 'aurora').countries.US, ['en-US', 'es-US']);
  assert.deepStrictEqual(after.find((p) => p.product === 'nimbus'), before.find((p) => p.product === 'nimbus'));
  assert.ok(updates[0].content.includes('      "US": ["en-US","es-US"]'), 'one country per line');
});

t('guard rejects changes to other products', () => {
  const before = readList(tmp, 'dev');
  const after = JSON.parse(JSON.stringify(before));
  after.find((p) => p.product === 'nimbus').countries.US = ['en-US'];
  assert.throws(() => assertOnlyProductChanged(before, after, 'aurora'), /other than aurora/);
  assert.throws(() => assertOnlyProductChanged(before, after.filter((p) => p.product !== 'nimbus'), 'aurora'), /other than aurora/);
});

t('remove a missing country rejected', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev'], change: 'Remove a country', country: 'ZZ' }));
  assert.ok(applyChange(r, tmp).errors[0].includes('is not in the aurora list'));
});

t('no-op request yields no updates', () => {
  const r = parseIssueForm(form({ product: 'aurora', envs: ['dev'], change: 'Set languages for a country', country: 'US', locales: 'en-US' }));
  assert.strictEqual(applyChange(r, tmp).updates.length, 0);
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
