# Language list bot (demo)

Demo of a self-service flow for per-product language lists. All data in this repo is fictional.

People request a change with an issue form. A bot checks that they own the product, validates the request and opens a pull request that only changes that product's entry in `language-lists.json`. A maintainer reviews and merges it.

## How the config is built

Each environment has one file, `environments/<env>/language-lists.json`: a JSON array with one entry per product (`product`, `clientIds`, `countries`), one country per line so diffs stay small.

The service reads it as one config, `APP_ACCOUNTS_LANGUAGELISTS`. Argo CD injects the file into the first ConfigMap of `values.yaml` with Helm `fileParameters` (see `argocd/<env>/accounts-service.yaml`), the same as `helm template -f values.yaml --set-file ...`. The file is the only copy of the lists; `values.yaml` does not repeat them.

## Try it

1. Open an issue with the **Language list change** form.
2. Pick a product, environments, the change, a country and locales.
3. If you are listed for that product in `language-lists/owners.json`, the bot opens a PR. Otherwise it explains why and closes the issue.

## How access is controlled

| Rule | Where |
|---|---|
| Who can request changes for which product (and environments) | `language-lists/owners.json`, edited only by maintainers |
| Which part of the file a request can change | Only the requester's product entry in `environments/<env>/language-lists.json`. The bot compares the array before and after and refuses the change if any other entry differs |
| Who can merge | Ruleset on `main`: pull request with 1 approval from someone with write access |
| Who can re-run a request | Maintainers, by adding the `language-list-retry` label |

## Files

| Path | Purpose |
|---|---|
| `.github/ISSUE_TEMPLATE/language-list-change.yml` | Request form, generated from `owners.json` and the values files: `node tools/generate_issue_form.js` |
| `.github/workflows/language-list-request.yml` | Runs the bot on new requests |
| `.github/workflows/language-lists-check.yml` | On PRs: every `language-lists.json` is valid and injected by its Argo app, plus the local tests |
| `scripts/language-list-request.js` | Parsing, ownership check, validation, PR creation |
| `scripts/language-lists.js` | Reads and formats `language-lists.json`; guard that only one product entry changed |
| `environments/<env>/values.yaml` | Service config per environment: `APP_ACCOUNTS_COUNTRIESMAP` (country -> region) and `APP_ACCOUNTS_REGIONLANGUAGEMAP` (region -> supported languages). Requested locales must be supported in the country's region |
| `environments/<env>/language-lists.json` | All product lists for the environment: client IDs + country -> locales |
| `argocd/<env>/accounts-service.yaml` | Argo CD Application with the `fileParameters` entry that injects `language-lists.json` |
| `tools/check_language_lists.js` | Validates the lists: format, unique products and client IDs, countries and locales supported, Argo wiring |
| `tools/local_test.js` | Local checks: `node tools/local_test.js` |
