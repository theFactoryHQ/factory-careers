# Plan 003: Remove the public demo passcode runtime config

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 277bca7..HEAD -- nuxt.config.ts tests/unit/demo-config-security.test.ts app server docs`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `277bca7`, 2026-06-15

## Why this matters

Nuxt public runtime config is visible to browser clients. The current config
places values named `LIVE_DEMO_SECRET` and `DEMO_PASSWORD` into
`runtimeConfig.public.liveDemoPasscode` if those environment variables are set.
Search showed no current app usage of `liveDemoPasscode`, so the safer fix is
to remove this stale public config surface rather than keep a secret-shaped
value in browser-visible state.

## Current state

Relevant files:

- `nuxt.config.ts` - declares public runtime config.
- `tests/unit/demo-config-security.test.ts` - current security regression for
  demo passcode fallback.
- `server/scripts/seed.ts` - server-side demo seeding still uses
  `DEMO_PASSWORD`; this is out of scope and should not be removed by this plan.

Current public config:

```ts
// nuxt.config.ts:216
demoOrgSlug:
  process.env.DEMO_ORG_SLUG || (isRailwayPreview ? "reqcore-demo" : ""),

// nuxt.config.ts:219
liveDemoEmail: (() => {
  ...
})(),

// nuxt.config.ts:233
/** Public live-demo passcode used to prefill sign-in */
liveDemoPasscode:
  process.env.LIVE_DEMO_SECRET || process.env.DEMO_PASSWORD || "",
```

Current test only blocks the old hardcoded fallback:

```ts
// tests/unit/demo-config-security.test.ts:5
it('does not expose demo1234 as the public live demo passcode fallback', () => {
  const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  const liveDemoPasscodeBlock = config.match(/liveDemoPasscode:[\s\S]*?\/\*\*/)?.[0] ?? ''

  expect(liveDemoPasscodeBlock).not.toContain('demo1234')
})
```

Search at commit `277bca7` found `liveDemoPasscode` only in
`nuxt.config.ts` and this test. Other demo runtime config currently uses
`demoOrgSlug` and `liveDemoEmail`:

```text
app/layouts/dashboard.vue uses config.public.demoOrgSlug and config.public.liveDemoEmail
app/layouts/settings.vue uses config.public.demoOrgSlug and config.public.liveDemoEmail
server/api/auth/demo-check.get.ts uses public.liveDemoEmail
server/api/auth/demo-fresh-signup.get.ts uses public.liveDemoEmail
app/composables/usePostHogIdentity.ts uses public.liveDemoEmail and public.demoOrgSlug
```

Repo conventions to follow:

- Environment-backed business behavior belongs in server config or organization
  settings unless the value is intentionally public.
- Never reproduce actual secret values. Reference variable names only.
- Keep demo account email/slug behavior intact; this plan only removes the
  passcode/secret from public runtime config.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift check | `git diff --stat 277bca7..HEAD -- nuxt.config.ts tests/unit/demo-config-security.test.ts app server docs` | no in-scope drift, or reviewed drift with matching current state |
| Search current usage | `rg -n "liveDemoPasscode|LIVE_DEMO_SECRET|DEMO_PASSWORD" nuxt.config.ts app server tests docs` | only allowed server-side seed uses of `DEMO_PASSWORD`, plus the security test if it checks forbidden strings |
| Focused test | `npm run test:unit -- tests/unit/demo-config-security.test.ts` | exit 0 |
| Unit suite | `npm run test:unit` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:

- `nuxt.config.ts`
- `tests/unit/demo-config-security.test.ts`
- Documentation only if a doc currently instructs operators to set
  `LIVE_DEMO_SECRET` for client-side use.

**Out of scope**:

- `server/scripts/seed.ts` server-side demo password behavior.
- Demo email and demo org slug behavior.
- Auth provider behavior, SSO, or dashboard demo banners.

## Git workflow

- Branch: `codex/003-remove-public-demo-passcode-config`
- Commit message: `fix: remove public demo passcode config`
- Do not push or open a PR unless the operator instructs you to.

## Steps

### Step 1: Confirm there is no live consumer

Run:

```bash
rg -n "liveDemoPasscode|LIVE_DEMO_SECRET|DEMO_PASSWORD" nuxt.config.ts app server tests docs
```

Expected at commit `277bca7`: `liveDemoPasscode` appears only in
`nuxt.config.ts` and `tests/unit/demo-config-security.test.ts`. `DEMO_PASSWORD`
also appears in `server/scripts/seed.ts`; that server-side seed usage is not
the problem.

**Verify**: the search output matches the expected shape. If an app or server
route now reads `config.public.liveDemoPasscode`, stop and report.

### Step 2: Remove the public runtime config field

In `nuxt.config.ts`, delete the comment and `liveDemoPasscode` property from
`runtimeConfig.public`.

Keep these neighboring public fields unchanged:

- `demoOrgSlug`
- `liveDemoEmail`
- `feedbackEnabled`
- SSO flags and other existing public config values

Do not move `LIVE_DEMO_SECRET` to another public field.

**Verify**: `rg -n "liveDemoPasscode|LIVE_DEMO_SECRET" nuxt.config.ts` -> no matches.

### Step 3: Strengthen the security regression

Update `tests/unit/demo-config-security.test.ts` so it fails if the public
runtime config reintroduces a passcode/secret. A suitable test is:

```ts
it('does not expose a demo passcode in public runtime config', () => {
  const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
  const publicRuntimeBlock = config.match(/public:\s*\{[\s\S]*?\n\s*\},\n\s*\}/)?.[0] ?? ''

  expect(publicRuntimeBlock).not.toContain('liveDemoPasscode')
  expect(publicRuntimeBlock).not.toContain('LIVE_DEMO_SECRET')
  expect(publicRuntimeBlock).not.toContain('DEMO_PASSWORD')
})
```

If the regex is brittle against the live formatting, use a simpler test that
checks all of `nuxt.config.ts` for absence of `liveDemoPasscode` and
`LIVE_DEMO_SECRET`, while allowing `DEMO_PASSWORD` elsewhere in server-side seed
code.

**Verify**: `npm run test:unit -- tests/unit/demo-config-security.test.ts` -> exit 0.

### Step 4: Run broader checks

**Verify**:

- `npm run test:unit -- tests/unit/demo-config-security.test.ts` -> exit 0.
- `npm run test:unit` -> exit 0.
- `npm run typecheck` -> exit 0.
- `rg -n "liveDemoPasscode|LIVE_DEMO_SECRET" nuxt.config.ts app server docs` -> no matches.

## Test plan

- Update `tests/unit/demo-config-security.test.ts` to assert that public Nuxt
  config does not expose `liveDemoPasscode`, `LIVE_DEMO_SECRET`, or
  `DEMO_PASSWORD`.
- Run the focused test, full unit suite, and typecheck.

## Done criteria

All must hold:

- [ ] `runtimeConfig.public` in `nuxt.config.ts` no longer contains
      `liveDemoPasscode`.
- [ ] `LIVE_DEMO_SECRET` is not read by `nuxt.config.ts`.
- [ ] Demo email and demo org slug behavior remain untouched.
- [ ] `npm run test:unit -- tests/unit/demo-config-security.test.ts` exits 0.
- [ ] `npm run test:unit` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] No files outside the in-scope list are modified, except `plans/README.md`
      status if you were asked to update it.

## STOP conditions

Stop and report back if:

- A current sign-in, demo route, or dashboard flow consumes
  `config.public.liveDemoPasscode`.
- Removing the field requires changing authentication behavior.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

Reviewers should keep the distinction clear: `DEMO_PASSWORD` may still be a
server-side seed input, but a password or secret must not be placed in Nuxt
public runtime config. If a future live-demo flow needs a passcode, validate it
server-side.
