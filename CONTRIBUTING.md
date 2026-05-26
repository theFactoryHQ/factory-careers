# Contributing to Factory Careers

Thanks for contributing to Factory Careers.

## Before You Start

- Read [AGENTS.md](AGENTS.md) for repo-specific agent context, working rules,
  verification commands, and automation guidance.
- Read [docs/reference/PRODUCT.md](docs/reference/PRODUCT.md), [docs/reference/ARCHITECTURE.md](docs/reference/ARCHITECTURE.md), and [docs/reference/ROADMAP.md](docs/reference/ROADMAP.md) for product and technical context.
- For bug reports and feature ideas, use GitHub Issues.
- For security reports, do **not** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Development Setup

```bash
git clone https://github.com/theFactoryHQ/factory-careers.git
cd factory-careers
cp .env.example .env
docker compose up -d
npm ci
npm run dev
```

## Branch and Commit Workflow

1. Create a topic branch from `main`.
2. Keep commits focused and atomic.
3. Ensure every commit includes a **DCO sign-off**.
4. Open a pull request with a clear summary and testing notes.

Agent-generated commits should use `git commit --no-verify`, then run the
relevant checks manually before pushing.

### Local CI Preflight

`npm install` configures git to use this repo's `.githooks` directory. The hooks catch the two most common PR failures before GitHub Actions spends a run:

- `commit-msg` validates Conventional Commit syntax with the same allowed types as the PR title lint workflow.
- `pre-commit` keeps `AGENTS.md` and `CLAUDE.md` identical for agent/tool compatibility.
- `pre-push` runs `npm run preflight:pr`, which mirrors the required PR validation job: CLI parity evidence, unit tests, optional lint, typecheck, CLI smoke tests, production env contract validation, and build.

Run `npm run prepare` if you need to reinstall the hooks in an existing checkout.

Use `npm run check:conventions` after changing agent instructions,
contributor docs, repo conventions, CLI docs, theme rules, API/shared contracts,
or workflow-sensitive files. It runs the AGENTS/CLAUDE sync hook, focused
convention tests, and the CLI parity guard.

### DCO Sign-off (Required)

Factory Careers uses the Developer Certificate of Origin (DCO) instead of a CLA.

Sign every commit with:

```bash
git commit -s -m "feat: add candidate search"
```

This adds a `Signed-off-by:` line to your commit message. Pull requests fail CI if commits are missing sign-off.

## Pull Request Checklist

- [ ] I scoped changes to one concern.
- [ ] I tested the change locally.
- [ ] I updated docs when behavior or policy changed.
- [ ] I did not introduce tenant-scope or auth regressions.
- [ ] All commits are DCO signed (`git commit -s`).

### Keyboard and accessibility acceptance checks

For UI work, verify the interaction path without a mouse before opening the PR:

- [ ] Visible focus is preserved for every interactive control.
- [ ] No core action is pointer-only; keyboard users can reach and trigger it.
- [ ] `Escape` closes or cancels transient UI only when that behavior is expected.
- [ ] Focus returns to the triggering control after closing a modal, popover, or drawer.
- [ ] Modal dialogs trap focus while open and do not leak tab order behind the overlay.
- [ ] Custom listbox, menu, and combobox patterns support the expected arrow-key and selection behavior.
- [ ] New custom controls ship with keyboard-focused tests, not just pointer-path checks.

## Coding and Product Conventions

- Follow Nuxt 4 `app/` + root `server/` structure.
- Use Tailwind CSS v4 utilities and `lucide-vue-next` icons.
- Use `env` from `server/utils/env.ts` (never `process.env` directly in server code).
- For domain data, always scope server queries by `organizationId` from session.

## Documentation

If your changes affect behavior, architecture, or roadmap status, update:

- [CHANGELOG.md](CHANGELOG.md)
- [docs/reference/ROADMAP.md](docs/reference/ROADMAP.md)
- [docs/reference/ARCHITECTURE.md](docs/reference/ARCHITECTURE.md)
- [docs/reference/PRODUCT.md](docs/reference/PRODUCT.md)

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
