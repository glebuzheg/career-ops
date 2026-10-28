# Russian sources implementation plan

> Execute inline with superpowers:executing-plans. User waived further approvals.

**Goal:** discover jobs from four requested Russian-market services.
**Architecture:** two auto-discovered public providers and two opt-in keyed plugins.
**Tech Stack:** existing Node ESM, node:test, guarded HTTP contexts.
**Spec:** docs/superpowers/specs/2026-10-28-russian-sources-design.md

## Global constraints

- No runtime dependencies, automatic applications, or committed credentials.
- Follow providers/ADDING_A_PROVIDER.md and the plugin context/manifest contract.
- Keep failures distinct from an empty search; stop on authentication failures.

## Review focus

- Source errors, malformed rows and malformed envelopes must not produce fake empty searches.
- Default page budgets, probe budgets and repeated pages must bound network activity.
- Mixed Cyrillic, entities, remote locations and monthly compensation must normalize correctly.
- MCP endpoint/tool/schema changes must fail safely, without invoking mutation tools.
- Plugin gating and URL allowlists must prevent surprise authenticated calls.

### Task 1: Public providers

- [x] Write tests/providers/hh.test.mjs and habr-career.test.mjs first; verify missing adapters fail.
- [x] Implement providers/hh.mjs and habr-career.mjs with fetch(entry, ctx), detection,
      normalization, pacing, retry, page bounds and probe cooperation.
- [x] Run both suites and provider registry/URL checks; commit.

### Task 2: Authenticated sources

- [x] Write tests for SuperJob's API key/header/pagination and Hirify's MCP lifecycle,
      tool selection, JSON/SSE, argument/schema checks, errors and normalization; verify RED.
- [x] Implement plugins/superjob and plugins/hirify (provider hooks and manifests).
- [x] Run new suites, manifest validation and plugin audit; commit.

### Task 3: Setup and delivery

- [x] Update portals/plugin/env examples, supported boards, source evidence and Russian setup.
- [x] Verify live Habr discovery and report HH/Hirify/key limitations.
- [x] Run syntax, config validation and full project suite; review whole branch.
- [x] Preserve the reviewed changes in a local commit and export an archive/patch.
- [x] User created the fork in GitHub after API fork creation was denied; verified writable `glebuzheg/career-ops` and pushed `feat/russian-job-sources`.

## Progress and review

Public and authenticated adapters were developed test-first; the focused run now passes 31 tests. Habr returned 25 cards through both its provider and a real scanner dry run (19 after filtering/deduplication).

An independent reviewer found three important issues. Regression tests reproduced all three before fixes: employer/company URLs becoming global searches; unsanitized MCP transport errors during probes; lost HH remote-work metadata. All are corrected and their regression tests pass. The Russia example also now uses the scanner's allow/block location-filter keys.

The upstream baseline quick suite had 18,796 passing checks and six failures unrelated to this work (Gemini network-message assertion, browser diagnostic fixture, two Node serialization failures, missing LaTeX fontawesome, archive timeout). The final full run is recorded in docs/RUSSIAN_SOURCES_VERIFICATION.md. No merge or remote publication is attempted with a red suite.

Final full run: 18,811 passing checks, five baseline failures, 23 warnings (exit 1). All new suites passed. Local commit/export preserves the work; the whole project is not claimed green.

Decisions: use registered API plugins for both authenticated services; restrict company/detail URLs instead of silently scanning all employers; preserve guarded plugin transports while forwarding probe/pacing hints. Remote endpoint and credential availability still determine live operation.
