# Language list bot (demo)

Demo of a self-service flow for per-product language lists. All data in this repo is fictional.

People request a change with an issue form. A bot checks that they own the product, validates the request and opens a pull request that only touches that product's file. A maintainer reviews and merges it.

## Try it

1. Open an issue with the **Language list change** form.
2. Pick a product, environments, the change, a country and locales.
3. If you are listed for that product in `language-lists/owners.json`, the bot opens a PR. Otherwise it explains why and closes the issue.

## How access is controlled

| Rule | Where |
|---|---|
| Who can request changes for which product (and environments) | `language-lists/owners.json`, edited only by maintainers |
| Which file a request can change | Built by the bot from the product and environment: `environments/<env>/language-lists/<product>.json` |
| Who can merge | Ruleset on `main`: pull request with 1 approval from someone with write access |
| Who can re-run a request | Maintainers, by adding the `language-list-retry` label |

## Files

| Path | Purpose |
|---|---|
| `.github/ISSUE_TEMPLATE/language-list-change.yml` | Request form, generated from the catalog: `node tools/generate_issue_form.js` |
| `.github/workflows/language-list-request.yml` | Runs the bot on new requests |
| `scripts/language-list-request.js` | Parsing, ownership check, validation, PR creation |
| `language-lists/catalog.json` | Countries and locales offered in the form dropdowns |
| `environments/<env>/language-lists/<product>.json` | Per-product list: client IDs + country -> locales |
| `environments/<env>/region-languages.json` | Locales allowed per region, used for validation |
| `tools/local_test.js` | Local checks: `node tools/local_test.js` |
