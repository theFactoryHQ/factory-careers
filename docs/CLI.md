# Factory Careers CLI

`factory-careers` is the authenticated terminal interface for Factory Careers. It is designed for humans and external agents that need deterministic access to ATS workflows without browser cookies or direct database access.

## Install And Run

The package exposes a `factory-careers` binary:

```bash
npm install
npm link
factory-careers --help
```

During local development you can also run:

```bash
./bin/factory-careers.mjs --help
```

Use `--base-url` to point the CLI at a deployment:

```bash
factory-careers --base-url https://careers.thefactoryhq.com auth status
```

## Authentication

The CLI uses OAuth 2.0 Device Authorization. This is the required sign-in flow because it works from SSH sessions, agent terminals, and environments that cannot receive a localhost callback.

```bash
factory-careers auth login
```

The command requests a device code from Better Auth, prints the browser verification URL, polls for approval, and stores the returned access token in the active CLI profile. Authenticated API requests then use `Authorization: Bearer <token>` through Better Auth bearer token authentication.

Useful auth commands:

```bash
factory-careers auth status --json
factory-careers auth whoami --json
factory-careers auth logout --json
```

## Profiles And Config

The CLI stores profile config in the OS config directory by default. Override it for tests, CI-like runs, or isolated agents:

```bash
factory-careers --config ./tmp/factory-careers.json --profile prod auth login
factory-careers --profile staging --base-url https://staging.example.com auth status
```

Global flags:

- `--config <path>` selects a config file.
- `--profile <name>` selects the named profile.
- `--base-url <url>` overrides the profile base URL.
- `--json` emits machine-readable JSON.
- `--yes` confirms mutating commands.
- `--no-input` disables interactive prompting.

## Agent Usage

Every command supports `--json`. Mutating commands require explicit automation intent: pass `--yes`, or use `--stdin` when the command reads a JSON payload from stdin. This is intentional so unattended agents opt in explicitly while still supporting non-interactive payload-driven workflows.

Complex payloads should be sent with `--stdin`:

```bash
printf '%s\n' '{"title":"Frontend Engineer","status":"draft"}' \
  | factory-careers jobs create --stdin --yes --json
```

Errors in JSON mode use:

```json
{
  "status": 400,
  "code": "CONFIRMATION_REQUIRED",
  "message": "Pass --yes to confirm this mutating command."
}
```

## Exit Codes

- `0`: command succeeded.
- `1`: command failed with an HTTP or CLI error.
- Non-JSON mode prints errors to stderr.
- JSON mode prints structured errors to stdout for agent parsing.

## Secrets

Commands never print stored bearer tokens. The CLI writes its config file with owner-only permissions (`0600`) when it stores an auth token. AI provider API keys can be sent to the server in `ai-config create` or `ai-config update` request bodies, but API responses expose only `hasApiKey`. Avoid shell history leaks by piping JSON from a protected file or secret manager instead of typing secrets inline.

## Command Coverage

Core commands:

- `auth login`, `auth logout`, `auth status`, `auth whoami`
- `jobs list`, `jobs get`, `jobs create`, `jobs update`, `jobs open`, `jobs close`, `jobs archive`, `jobs delete`, `jobs analyze-all`
- `jobs questions list`, `jobs questions create`, `jobs questions update`, `jobs questions delete`, `jobs questions reorder`
- `jobs criteria list`, `jobs criteria replace`, `jobs criteria update-weights`, `jobs criteria generate`
- `candidates list`, `candidates get`, `candidates create`, `candidates update`, `candidates delete`, `candidates set-property`
- `documents list`, `documents upload`, `documents download`, `documents preview`, `documents delete`, `documents parse`, `documents parse-all`
- `applications list`, `applications get`, `applications create`, `applications update`, `applications status`, `applications analyze`, `applications scores`, `applications set-property`
- `interviews list`, `interviews get`, `interviews schedule`, `interviews update`, `interviews cancel`, `interviews send-invitation`
- `comments list`, `comments create`, `comments update`, `comments delete`
- `feedback status`, `feedback submit`
- `system info`, `system version`, `system changelog`
- `source-tracking list`, `source-tracking get`, `source-tracking create`, `source-tracking update`, `source-tracking delete`, `source-tracking link-stats`, `source-tracking stats`
- `email-templates list`, `email-templates create`, `email-templates update`, `email-templates delete`
- `properties list`, `properties create`, `properties update`, `properties delete`, `properties reorder`
- `org search`, `org settings`, `org update-settings`, `org invite-links info`, `org invite-links list`, `org invite-links create`, `org invite-links accept`, `org invite-links revoke`, `org join-requests create`, `org join-requests list`, `org join-requests approve`, `org join-requests reject`, `org sso-providers list`, `org sso-providers register`, `org sso-providers delete`
- `calendar status`, `calendar connect`, `calendar disconnect`, `calendar renew-webhooks`
- `ai-config list`, `ai-config get`, `ai-config create`, `ai-config update`, `ai-config delete`, `ai-config set-default`, `ai-config test-connection`, `ai-config providers`, `ai-config refresh-providers`, `ai-config generate-criteria`
- `dashboard summary`, `dashboard activity`, `dashboard timeline`, `dashboard candidate-timeline`, `dashboard ai-stats`
- `chatbot upload`, `chatbot conversations`, `chatbot folders`, `chatbot agents`, `chatbot chat`
- `public jobs list`, `public jobs get`, `public jobs apply`

## Not CLI Surfaced

Some routes intentionally remain outside the deterministic CLI surface:

- Auth provider callbacks, session callback endpoints, and provider callbacks are browser-auth internals handled by Better Auth or external identity providers. Use `auth login`, `auth status`, `auth whoami`, and `auth logout`.
- Calendar OAuth callbacks and webhook receivers are provider callbacks, not user commands. Use `calendar connect`, `calendar status`, `calendar disconnect`, and `calendar renew-webhooks`.
- The health and readiness probes are platform checks for hosting and monitoring, not authenticated ATS workflows.
- The public tracking redirects exist to preserve attribution and redirect candidates; use `source-tracking link-stats` and `source-tracking stats` for agent-readable reporting.
- Public interview-response links are candidate-facing email workflows rather than staff or agent ATS management commands.
- Update apply/backup endpoints are destructive maintenance operations and are not exposed to agents. Use read-only `system info`, `system version`, and `system changelog`.
- The demo-only auth helpers remain development and demo UI helpers, not supported automation APIs.

## Examples

Create a job, add questions, create a candidate, and apply:

```bash
factory-careers jobs create --stdin --yes --json < job.json
factory-careers jobs questions create job_123 --stdin --yes --json < question.json
factory-careers candidates create --stdin --yes --json < candidate.json
factory-careers applications create --stdin --yes --json < application.json
```

Run analysis and inspect scores:

```bash
factory-careers jobs criteria generate job_123 --stdin --yes --json
factory-careers applications analyze app_123 --yes --json
factory-careers applications scores app_123 --json
```

Use the chatbot from an agent:

```bash
factory-careers chatbot upload --file context.txt --yes --json
factory-careers chatbot chat --stdin --yes --json < chat-request.json
```

The chat command returns accumulated streamed events plus the concatenated text response.
