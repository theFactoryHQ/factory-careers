## Summary

- What does this PR change?
- Why is this needed?

> **PR title must follow [Conventional Commits](https://www.conventionalcommits.org/)** — e.g. `feat(jobs): add bulk import` or `fix: handle null salary`. The squash-merged title is what release-please uses to generate the changelog and pick the next version. PRs with non-conventional titles are blocked by CI.

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

## CLI parity

- [ ] I checked whether this changes portal/API workflow payload shapes changed, response shapes, auth requirements, or resource coverage
- [ ] I updated `packages/careers-cli/src/routeCoverage.ts` when API routes were added, removed, renamed, or intentionally excluded
- [ ] I updated `docs/CLI.md`, CLI commands, shared schemas, or CLI tests when the portal/API workflow should be agent-accessible
- [ ] I documented the reason when a changed portal/API workflow should not be exposed through the CLI

## DCO

- [ ] All commits in this PR are signed off (`Signed-off-by`) via `git commit -s`
