## Summary

- What does this PR change?
- Why is this needed?

> **PR title must follow [Conventional Commits](https://www.conventionalcommits.org/)** — e.g. `feat(jobs): add bulk import` or `fix: handle null salary`. The squash-merged title is what release-please uses to determine the next version and GitHub release notes. PRs with non-conventional titles are blocked by CI.

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs
- [ ] Chore

## Validation

- [ ] I tested locally
- [ ] I added/updated relevant documentation
- [ ] I verified multi-tenant scoping and auth behavior for affected API paths

## Release/version notes

- [ ] This is not a release PR
- [ ] For a release PR, I ran `npm run changelog:finalize -- <version> <YYYY-MM-DD>` with the intended version and UTC publication date, then committed the result
- [ ] I documented known release risks or explicitly confirmed there are none

## CLI parity

- [ ] I checked whether this changes portal/API workflow payload shapes, response shapes, auth requirements, or resource coverage
- [ ] I updated `packages/careers-cli/src/routeCoverage.ts` when API routes were added, removed, renamed, or intentionally excluded
- [ ] I updated `docs/CLI.md`, CLI commands, shared schemas, or CLI tests when the portal/API workflow should be agent-accessible
- [ ] I documented the reason when a changed portal/API workflow should not be exposed through the CLI

## Keyboard / accessibility acceptance

- [ ] Visible focus is preserved for every interactive control I touched
- [ ] No core action in this change is pointer-only
- [ ] `Escape` behavior is intentional for transient UI I changed
- [ ] Focus restores to the invoking control after closing modals/popovers/drawers
- [ ] Any modal I changed traps focus correctly while open
- [ ] Any custom listbox/menu/combobox behavior still works from the keyboard
- [ ] New custom controls include keyboard-focused tests where applicable

## DCO

- [ ] All commits in this PR are signed off (`Signed-off-by`) via `git commit -s`
