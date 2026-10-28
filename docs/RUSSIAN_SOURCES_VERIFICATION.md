# Russian source integration verification

Date: 2026-10-28. Upstream base:
`a6d7526c05861b1df9b70c011f8b1a84c44252ac` (v1.38.0).
Local branch: `feat/russian-job-sources`.

## Feature checks

- 31 focused tests passed across `tests/providers/hh.test.mjs`,
  `tests/providers/habr-career.test.mjs`, `tests/superjob-plugin.test.mjs`,
  `tests/hirify-plugin.test.mjs`, and `tests/plugin-ctx-data-root.test.mjs`.
- `node scripts/check-syntax.mjs`: 1786 .mjs files passed syntax checks.
- Both `templates/portals.example.yml` and `templates/portals.russia.example.yml`:
  `node validate-portals.mjs --file ...` returned 0 errors and 0 warnings.
- `node plugin-audit.mjs plugins/hirify` and `plugins/superjob`: audit clean.
- `node plugins.mjs list` discovers both plugins, disabled by default.
- `git diff --check` and `git diff --cached --check`: no whitespace errors.

## Live behavior

The real Habr provider returned 25 cards for a Python query. A complete
`node scan.mjs --dry-run` in an isolated temporary data root retained 19 offers
after filtering five titles and skipping one duplicate. It did not save offers.
HTTP transport used the executor's configured proxy with
`CAREER_OPS_TRUST_PROXY_EGRESS=1` (deployment choice, not a required local setting).

HH returned HTTP 403 from this executor. SuperJob returned HTTP 403 with an
application-registration message without an API key. Hirify public pages were
intermittently reachable, but its account MCP endpoint/key were not available.
Thus live HH search, authenticated SuperJob search and actual Hirify MCP tool
schema compatibility remain unverified; their adapters have deterministic
contract/protocol tests. See RUSSIAN_SOURCES.md for configuration.

## Independent review

A separate reviewer identified three Important defects; each was reproduced
with a failing regression test and fixed:

1. Company/detail URLs could become global searches. They now fail before HTTP;
   explicit company filters are required.
2. Hirify probe transport errors could reveal server-reflected secrets. Only
   the identified probe sentinel is rethrown; real HTTP errors are sanitized
   while retaining their status.
3. HH remote metadata was dropped. Both legacy `schedule.id=remote` and current
   `work_format[].id=REMOTE` now survive alongside the city.

The Russia example's location filter keys were also corrected to `allow/block`.
The plugin engine preserves its guarded transport while passing health-probe
page budgets and pacing hints to keyed providers (regression test included).

## Whole-project baseline and final run

Before feature implementation, `node test-all.mjs --quick --jobs 4` recorded
18,796 passing checks, six failures and 22 warnings. Baseline failures:

- Inline Gemini evaluator/encoding: network failure wording assertion.
- Browser diagnostics suite: fixture expected different launch-failure wording.
- `tests/generate-pdf-atomic-write.test.mjs`: Node child test protocol could not
  deserialize cloned data.
- Standard pdflatex template: system package `fontawesome.sty` missing.
- `tests/scan-verify-api.test.mjs`: the same Node child test deserialization error.
- `tests/set-status-archives-jd.test.mjs`: detached archive timeout assertion.

Final `node test-all.mjs --jobs 4`: **18,811 passing checks, five failures,
23 warnings; exit 1**. All five failed in the baseline too: Gemini wording,
browser diagnostics, missing `fontawesome.sty`, `scan-verify-api` Node child
deserialization, and `set-status-archives-jd` timeout. The earlier
generate-pdf-atomic-write serialization failure did not recur. All new suites
and the plugin-engine regression suite passed in this full run. The bundled
plugin discovery assertion was updated from four to six integrations.

The whole-project suite is therefore **not green**. No unrelated core/browser/
LaTeX code was changed to conceal these baseline failures. Local changes can be
reviewed/applied from the export, but no upstream merge or remote publication
was performed.

## Remote delivery

GitHub identity is `glebuzheg`. Initially, creating the requested fork with
`gh repo fork career-ops-hq/career-ops --clone=false` returned HTTP 403:
`Resource not accessible by integration`. The user subsequently created
<https://github.com/glebuzheg/career-ops> through GitHub's web page. The fork was
verified (`fork: true`, parent `career-ops-hq/career-ops`, writable by the current
connection). Branch `feat/russian-job-sources` was pushed and the remote commit
was verified as `5724f43437766cc4ce11e79450f855cddb14d221`.

## Web interface launch

`npm ci --ignore-scripts` and `NEXT_TELEMETRY_DISABLED=1 npm run build` in `web/`
both exited 0. `npm start -- -p 3000` started the production server on
`127.0.0.1:3000` in the execution environment. HTTP smoke checks of `/` and
`/pipeline` both returned 200. No source changes, fake CV, user credentials or
public tunnel were needed. This is an environment-local address, not a hosted
public URL or the user's own computer's loopback. The optional `/api/health`
route does not exist (404); readiness was checked on actual application pages.
