# Language list bot (demo)

Demo of a self-service flow for per-product language lists. All data in this repo is fictional.

People request a change with an issue form. A bot checks that they own the product, validates the request and opens a pull request that only touches that product's file and the generated config in `values.yaml`. A maintainer reviews and merges it.

## How the config is built

The service reads one config per environment, `APP_ACCOUNTS_LANGUAGELISTS` in `environments/<env>/values.yaml`: a multi-line JSON array with one entry per product (`product`, `clientIds`, `countries`).

The per-product files in `environments/<env>/language-lists/` are the source of truth. `node tools/sync_values.js` regenerates the `values.yaml` block from them (one country per line, so diffs stay small). The bot does the same in every PR, and the **Language lists check** workflow fails a PR when the two drift.

## Try it

1. Open an issue with the **Language list change** form.
2. Pick a product, environments, the change, a country and locales.
3. If you are listed for that product in `language-lists/owners.json`, the bot opens a PR. Otherwise it explains why and closes the issue.

## How access is controlled

| Rule | Where |
|---|---|
| Who can request changes for which product (and environments) | `language-lists/owners.json`, edited only by maintainers |
| Which files a request can change | Built by the bot from the product and environment: `environments/<env>/language-lists/<product>.json`, plus the generated block in `environments/<env>/values.yaml` |
| Who can merge | Ruleset on `main`: pull request with 1 approval from someone with write access |
| Who can re-run a request | Maintainers, by adding the `language-list-retry` label |

## Files

| Path | Purpose |
|---|---|
| `.github/ISSUE_TEMPLATE/language-list-change.yml` | Request form, generated from `owners.json` and the values files: `node tools/generate_issue_form.js` |
| `.github/workflows/language-list-request.yml` | Runs the bot on new requests |
| `.github/workflows/language-lists-check.yml` | On PRs: values.yaml blocks match the product files, plus the local tests |
| `scripts/language-list-request.js` | Parsing, ownership check, validation, PR creation |
| `scripts/language-lists-sync.js` | Formats product JSON and renders the `APP_ACCOUNTS_LANGUAGELISTS` block |
| `environments/<env>/values.yaml` | Service config per environment: `APP_ACCOUNTS_COUNTRIESMAP` (country -> region), `APP_ACCOUNTS_REGIONLANGUAGEMAP` (region -> supported languages) and the generated `APP_ACCOUNTS_LANGUAGELISTS`. Requested locales must be supported in the country's region |
| `environments/<env>/language-lists/<product>.json` | Per-product list (source of truth): client IDs + country -> locales |
| `tools/sync_values.js` | Regenerates the values.yaml blocks; `--check` fails on drift |
| `tools/local_test.js` | Local checks: `node tools/local_test.js` |
