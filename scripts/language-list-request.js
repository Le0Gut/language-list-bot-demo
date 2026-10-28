// Handles a "Language list change" issue: validate, check ownership, open a PR that only touches
// environments/<env>/language-lists/<product>.json. Runs via actions/github-script.
const fs = require('fs');
const path = require('path');

const ENV_ROOT = 'environments';
const CHANGE_SET = 'Set languages for a country';
const CHANGE_REMOVE = 'Remove a country';
const COUNTRY_RE = /^[A-Z]{2}$/;
const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listFilePath(env, product) {
  return `${ENV_ROOT}/${env}/language-lists/${product}.json`;
}

// Dropdown options look like "US - United States"; keep only the code.
const code = (label) => label.split(' - ')[0].trim();

// Issue forms render as "### <Label>\n\n<value>" sections.
function parseIssueForm(body) {
  const sections = {};
  const parts = (body || '').split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = part.slice(0, nl).trim();
    const value = part.slice(nl + 1).trim();
    sections[label] = value === '_No response_' ? '' : value;
  }
  const environments = (sections['Environments'] || '')
    .split('\n')
    .map((l) => l.match(/^- \[[xX]\] (.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
  const locales = (sections['Locales'] || '')
    .split(',')
    .map((l) => code(l))
    .filter(Boolean);
  return {
    product: (sections['Product'] || '').trim(),
    environments,
    change: (sections['Change'] || '').trim(),
    country: code(sections['Country'] || ''),
    locales,
    reason: (sections['Reason'] || '').trim(),
  };
}

function validate(req, author, owners, knownEnvs, knownCountries = null) {
  const errors = [];
  const owner = owners[req.product];
  if (!owner) {
    errors.push(`Unknown product \`${req.product}\`.`);
    return errors;
  }
  if (!owner.users.includes(author)) {
    errors.push(`@${author} is not allowed to change \`${req.product}\`. Ask a maintainer to add you to \`language-lists/owners.json\`.`);
    return errors;
  }
  if (req.environments.length === 0) errors.push('Select at least one environment.');
  for (const env of req.environments) {
    if (!knownEnvs.includes(env)) errors.push(`Unknown environment \`${env}\`.`);
    else if (owner.environments && !owner.environments.includes(env)) errors.push(`@${author} is not allowed to change \`${req.product}\` in \`${env}\`.`);
  }
  if (![CHANGE_SET, CHANGE_REMOVE].includes(req.change)) errors.push(`Unknown change type \`${req.change}\`.`);
  if (!COUNTRY_RE.test(req.country)) errors.push(`Country \`${req.country}\` must be a 2-letter uppercase ISO code.`);
  else if (knownCountries && !knownCountries.includes(req.country)) errors.push(`Country \`${req.country}\` is not in the catalog.`);
  if (req.change === CHANGE_SET) {
    if (req.locales.length === 0) errors.push('Add at least one locale.');
    for (const l of req.locales) if (!LOCALE_RE.test(l)) errors.push(`Locale \`${l}\` must look like \`en-US\`.`);
  }
  return errors;
}

// Applies the change to each env file; returns updated contents, per-env diffs, and content errors.
function applyChange(req, root) {
  const updates = [];
  const errors = [];
  for (const env of req.environments) {
    const file = listFilePath(env, req.product);
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      errors.push(`\`${file}\` does not exist.`);
      continue;
    }
    const data = readJson(full);
    const before = data.countries[req.country];
    if (req.change === CHANGE_SET) {
      const catalog = readJson(path.join(root, ENV_ROOT, env, 'region-languages.json'));
      const known = new Set(Object.values(catalog).flat());
      const unknown = req.locales.filter((l) => !known.has(l));
      if (unknown.length) {
        errors.push(`\`${env}\`: ${unknown.map((l) => `\`${l}\``).join(', ')} not in the region catalog.`);
        continue;
      }
      data.countries[req.country] = [...new Set(req.locales)];
    } else {
      if (!before) {
        errors.push(`\`${env}\`: \`${req.country}\` is not in the ${req.product} list.`);
        continue;
      }
      delete data.countries[req.country];
    }
    data.countries = Object.fromEntries(Object.entries(data.countries).sort(([a], [b]) => a.localeCompare(b)));
    const after = data.countries[req.country];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    updates.push({ env, file, content: JSON.stringify(data, null, 2) + '\n', before, after });
  }
  return { updates, errors };
}

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const author = issue.user.login;
  const root = process.env.GITHUB_WORKSPACE;

  const comment = (body) => github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body });
  const reject = async (errors) => {
    await comment(`Request rejected:\n\n${errors.map((e) => `- ${e}`).join('\n')}`);
    await github.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: ['language-list-rejected'] });
    await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: 'closed', state_reason: 'not_planned' });
    core.notice(`Rejected issue #${issue.number}`);
  };

  if (context.payload.action === 'labeled') {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: issue.number, name: 'language-list-retry' }).catch(() => {});
  }

  const owners = readJson(path.join(root, 'language-lists', 'owners.json'));
  const catalog = readJson(path.join(root, 'language-lists', 'catalog.json'));
  const knownEnvs = fs.readdirSync(path.join(root, ENV_ROOT));
  const req = parseIssueForm(issue.body);

  const errors = validate(req, author, owners, knownEnvs, catalog.countries.map((c) => c.code));
  if (errors.length) return reject(errors);

  const { updates, errors: contentErrors } = applyChange(req, root);
  if (contentErrors.length) return reject(contentErrors);
  if (updates.length === 0) return reject(['Nothing to change: the lists already match the request.']);

  // One commit with every env file, built with the Git Data API (no shell, no user input in commands).
  const base = await github.rest.repos.get({ owner, repo });
  const branch = `language-list/issue-${issue.number}`;
  const headRef = await github.rest.git.getRef({ owner, repo, ref: `heads/${base.data.default_branch}` });
  const baseSha = headRef.data.object.sha;
  const baseCommit = await github.rest.git.getCommit({ owner, repo, commit_sha: baseSha });
  const tree = await github.rest.git.createTree({
    owner, repo, base_tree: baseCommit.data.tree.sha,
    tree: updates.map((u) => ({ path: u.file, mode: '100644', type: 'blob', content: u.content })),
  });
  const summary = req.change === CHANGE_SET
    ? `set ${req.country} to ${req.locales.join(', ')}`
    : `remove ${req.country}`;
  const commit = await github.rest.git.createCommit({
    owner, repo, tree: tree.data.sha, parents: [baseSha],
    message: `update(language-lists): ${req.product} ${summary}\n\nRequested by @${author} in #${issue.number}`,
  });
  try {
    await github.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.data.sha });
  } catch {
    await github.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.data.sha, force: true });
  }

  await github.rest.repos.createCommitStatus({
    owner, repo, sha: commit.data.sha, state: 'success', context: 'language-list/validation',
    description: `Owner @${author} verified for ${req.product}; only language-list files changed`,
  });

  const rows = updates.map((u) => `| \`${u.env}\` | \`${JSON.stringify(u.before ?? null)}\` | \`${JSON.stringify(u.after ?? null)}\` |`).join('\n');
  const prBody = [
    `Requested by @${author} in #${issue.number}.`,
    '',
    `**Product:** \`${req.product}\`  **Change:** ${req.change}  **Country:** \`${req.country}\``,
    '',
    '| Env | Before | After |',
    '|---|---|---|',
    rows,
    '',
    req.reason ? `**Reason:** ${req.reason}` : '',
    '',
    'Opened by the language-list bot. A maintainer must review and merge.',
  ].join('\n');

  const existing = await github.rest.pulls.list({ owner, repo, head: `${owner}:${branch}`, state: 'open' });
  const pr = existing.data[0]
    ? (await github.rest.pulls.update({ owner, repo, pull_number: existing.data[0].number, body: prBody })).data
    : (await github.rest.pulls.create({
        owner, repo, head: branch, base: base.data.default_branch,
        title: `[language-list] ${req.product}: ${summary}`, body: prBody,
      })).data;

  await github.rest.issues.addLabels({ owner, repo, issue_number: pr.number, labels: ['language-list-pr'] });
  await comment(`PR opened: #${pr.number}. A maintainer will review it.`);
  core.notice(`Opened PR #${pr.number} for issue #${issue.number}`);
};

module.exports.parseIssueForm = parseIssueForm;
module.exports.validate = validate;
module.exports.applyChange = applyChange;
