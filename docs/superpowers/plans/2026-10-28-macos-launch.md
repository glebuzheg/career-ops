# macOS local launch

User chose local macOS execution and previously waived further design approvals.
Add an executable root-level `Start Career Ops.command` that checks Node/npm,
installs missing root and web dependencies, then invokes the existing UI launcher
to open the loopback app. No new server, CV, credentials or source configuration.

- [x] Test first-install, repeated launch and failed-install behavior in an isolated
  path containing spaces/Cyrillic, with only npm/network replaced.
- [x] Implement the Bash 3.2-compatible launcher and register its updater path.
- [x] Update the Russian guide with ZIP/double-click and Terminal alternatives.
- [x] Run launcher tests, shell syntax, appropriate updater checks and the full
  project suite. Preserve/report known baseline failures instead of hiding them.
- [x] Commit, push to the existing fork branch, and export a current ZIP.

Verification: 3 launcher tests passed, shell syntax and updater checks passed;
ZIP preserves the executable bit. Independent review found no Important defects.
Full quick suite: 18,814 checks passed, four baseline failures, 22 warnings;
native macOS Finder launch remains untested in this Linux environment.
