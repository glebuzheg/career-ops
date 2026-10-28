# Russian job sources

The user requested a personal fork with HeadHunter, Habr Career, SuperJob and
Hirify discovery, and authorized the recommended implementation without further
design approvals. Keep the existing evaluation and human submission workflow.

## Approach

Use the existing provider registry for public, zero-key sources (hh and
habr-career). Use opt-in provider plugins for SuperJob (registered application
key) and Hirify (remote MCP). An alternative of separate CLI scanners would
duplicate pipeline writing and filtering; routing authenticated calls through
core providers would violate the existing zero-key contract.

Each adapter returns the existing Job shape. Search terms, regions and page
budgets are explicit config, not this user's CV. Preserve Cyrillic and decode
HTML; omit unavailable salary/date data instead of inventing it. Salaries in
monthly source data become annual figures for the existing salary filter.

Habr reads the public /vacancies HTML's data-ssr-state JSON, not the disallowed
/v1 API. HH uses its documented /vacancies search API (403 from this executor).
SuperJob uses only its official registered application API with X-Api-App-Id;
its robots exclusions mean it is not shipped as a public crawler. Hirify's MCP
URL is supplied by the user, pinned to Hirify HTTPS hosts; initialize, list tools,
and invoke a single read-only vacancy search tool. Do not call reveal/read/apply,
which have separate account allowances. Support JSON and SSE MCP responses.

All network calls go through the existing guarded contexts. Page walks are
bounded, paced, deduplicated, respect health probes, and report truncation or
errors honestly. Plugins are disabled by default and secrets stay in .env.

## Delivery and constraints

Tests use deterministic source-shaped fixtures and transport doubles; Habr
also gets a live smoke check. No new runtime dependencies. Document setup in
Russian. The local feature branch is deliverable even if remote fork creation
remains blocked: GitHub's integration returned 403 on POST /forks.
