# Factory Careers CLI

`factory-careers` is the authenticated terminal interface for Factory Careers. It is designed for humans and external agents that need deterministic access to ATS workflows without browser cookies or direct database access.

## Install And Run

The package exposes a `factory-careers` binary:

```bash
npm install -g @thefactory/careers-cli
factory-careers --help
```

During local development you can also run:

```bash
./packages/careers-cli/bin/factory-careers.mjs --help
```

Package maintainers can verify and publish the dedicated npm package from the repo root:

```bash
npm run cli:pack
npm run cli:publish
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

Durable scoring and document-processing commands also support:

- `--no-wait` returns the newly created batch immediately so another process can resume it.
- `--timeout <seconds>` sets a finite wait deadline (15 minutes by default).
- `--poll-interval <ms>` sets the minimum delay between bounded drain attempts.

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
- `1`: command failed with an HTTP or CLI error, a batch finished as `failed` or `cancelled`, or the wait timed out.
- Non-JSON mode prints errors to stderr.
- JSON mode prints structured errors to stdout for agent parsing.

Failed and cancelled batches are still printed once using the same sanitized
batch shape as successful work. Once a batch has been created, a wait timeout
returns `PROCESSING_TIMEOUT` with the `batchId` in `details`; the server-side
work continues and can be resumed. If the initial create request itself times
out, no batch identifier is available to the CLI.

## Durable Processing Batches

`jobs analyze-all`, `applications analyze-missing`, `documents parse`, and
`documents parse-all` create durable batches. By default the CLI performs
bounded drain requests and waits for a terminal status, so the workflow also
works when the background worker is disabled. Responses always include
`batchId`, `status`, task `counts`, sanitized `errorsByCode`, timestamps, and
`retryAfterMs`.

Return immediately and resume later:

```bash
factory-careers applications analyze-missing --yes --no-wait --json
factory-careers processing get batch_123 --json
factory-careers processing drain batch_123 --yes --timeout 900 --poll-interval 1000 --json
```

These bulk analysis commands select only applications whose score is missing;
they do not enumerate a paginated application list or overwrite existing
scores.

## Job Pipeline Pages

`jobs pipeline` reads one bounded server-filtered pipeline page (25 rows by
default, 50 maximum). The response includes `data`, `total`, `page`, `limit`,
and stage counts calculated with every active filter except the selected stage.

```bash
factory-careers jobs pipeline JOB_ID \
  --stage interview --score high --interviews has-interview \
  --sort score-desc --limit 25 --json
```

Use `--search` for application-wide content, `--candidate-search` for candidate
name or email, and `--property-filters` for a JSON-encoded property-filter
array. Increment `--page` while `page * limit < total`; the command never
downloads the entire pipeline implicitly.

## Secrets

Commands never print stored bearer tokens. The CLI writes its config file with owner-only permissions (`0600`) when it stores an auth token. AI provider API keys can be sent to the server in `ai-config create` or `ai-config update` request bodies, but API responses expose only `hasApiKey`. Avoid shell history leaks by piping JSON from a protected file or secret manager instead of typing secrets inline.

## Compatibility Contract

The server exposes its CLI/API contract through the authenticated capabilities endpoint:

```bash
factory-careers system capabilities --json
```

That response includes `CLI_API_CONTRACT_VERSION`, `MINIMUM_SUPPORTED_CLI_VERSION`, resource groups, and the route coverage manifest used by tests. Portal/API changes that affect workflow payloads, response shapes, auth requirements, or resource coverage must update the CLI package, `packages/careers-cli/src/routeCoverage.ts`, shared schemas, docs, or tests in the same PR.

### Release Status

`factory-careers system version --json` returns the running `currentVersion`, the latest published Factory release metadata when available, and a `releaseStatus` with one of these meanings:

- `current`: the running version is at least as recent as the latest published release.
- `update-available`: a newer Factory Careers release is published.
- `unpublished`: GitHub returned no Factory Careers release yet, such as before the first `v1.0.0` baseline is published.
- `unavailable`: the release lookup failed, returned an unexpected response, or contained invalid release data.

`latestVersion`, `releaseUrl`, `releaseNotes`, and `publishedAt` are `null` for `unpublished` and `unavailable`. In those states, `updateAvailable` is `false` because no comparison can be made; callers must use `releaseStatus` rather than treating that boolean as proof that the installation is current.

## Command Coverage

Core commands:

- `auth login`, `auth logout`, `auth status`, `auth whoami`
- `jobs list`, `jobs get`, `jobs pipeline`, `jobs create`, `jobs update`, `jobs open`, `jobs close`, `jobs archive`, `jobs delete`, `jobs analyze-all`
- `jobs questions list`, `jobs questions create`, `jobs questions update`, `jobs questions delete`, `jobs questions reorder`
- `jobs criteria list`, `jobs criteria replace`, `jobs criteria update-weights`, `jobs criteria generate`
- `candidates list`, `candidates get`, `candidates create`, `candidates update`, `candidates delete`, `candidates set-property`
- `documents list`, `documents upload`, `documents download`, `documents preview`, `documents delete`, `documents parse`, `documents parse-all`
- `applications list`, `applications get`, `applications create`, `applications update`, `applications status`, `applications analyze`, `applications analyze-missing`, `applications scores`, `applications set-property`
- `processing get`, `processing drain`
- `interviews list`, `interviews get`, `interviews schedule`, `interviews update`, `interviews cancel`, `interviews send-invitation`
- `comments list`, `comments create`, `comments update`, `comments delete`
- `feedback status`, `feedback submit`
- `system info`, `system version`, `system changelog`, `system capabilities`
- `source-tracking list`, `source-tracking get`, `source-tracking create`, `source-tracking update`, `source-tracking delete`, `source-tracking link-stats`, `source-tracking stats`
- `email-templates list`, `email-templates create`, `email-templates update`, `email-templates delete`
- `notifications personal get`, `notifications personal set`, `notifications inbox get`, `notifications inbox set`
- `properties list`, `properties create`, `properties update`, `properties delete`, `properties reorder`
- `org search`, `org settings`, `org update-settings`, `org invite-links info`, `org invite-links list`, `org invite-links create`, `org invite-links accept`, `org invite-links revoke`, `org join-requests create`, `org join-requests list`, `org join-requests approve`, `org join-requests reject`, `org sso-providers list`, `org sso-providers register`, `org sso-providers delete`
- `calendar status`, `calendar connect`, `calendar disconnect`, `calendar renew-webhooks`
- `ai-config list`, `ai-config get`, `ai-config create`, `ai-config update`, `ai-config delete`, `ai-config set-default`, `ai-config test-connection`, `ai-config providers`, `ai-config refresh-providers`, `ai-config generate-criteria`
- `dashboard summary`, `dashboard activity`, `dashboard timeline`, `dashboard candidate-timeline`, `dashboard ai-stats`
- `chatbot upload`, `chatbot conversations list`, `chatbot conversations get`, `chatbot conversations create`, `chatbot conversations update`, `chatbot conversations delete`, `chatbot folders list`, `chatbot folders create`, `chatbot folders update`, `chatbot folders delete`, `chatbot agents list`, `chatbot agents create`, `chatbot agents update`, `chatbot agents delete`, `chatbot chat`
- `public jobs list`, `public jobs get`, `public jobs apply`

## Not CLI Surfaced

Some routes intentionally remain outside the deterministic CLI surface:

- Auth provider callbacks, the browser-only Microsoft SSO launcher, session callback endpoints, and provider callbacks are browser-auth internals handled by Better Auth or external identity providers. Use `auth login`, `auth status`, `auth whoami`, and `auth logout`.
- Calendar OAuth callbacks and webhook receivers are provider callbacks, not user commands. Use `calendar connect`, `calendar status`, `calendar disconnect`, and `calendar renew-webhooks`.
- The health and readiness probes are platform checks for hosting and monitoring, not authenticated ATS workflows.
- The public tracking redirects exist to preserve attribution and redirect candidates; use `source-tracking link-stats` and `source-tracking stats` for agent-readable reporting.
- Public interview-response links are candidate-facing email workflows rather than staff or agent ATS management commands.
- Update apply/backup endpoints are destructive maintenance operations and are not exposed to agents. Use read-only `system info`, `system version`, and `system changelog`.
- The demo-only auth helpers remain development and demo UI helpers, not supported automation APIs.

## Portal Parity

Server API coverage is tracked in `packages/careers-cli/src/routeCoverage.ts`. The unit test `tests/unit/cli-route-coverage-manifest.test.ts` walks `server/api` and fails if a route is missing from the manifest, if a supported route lacks a CLI command, or if an excluded/internal route lacks a reason. When adding or changing a portal/API workflow, update the CLI command surface or record the explicit exclusion in that manifest.

`email-templates create --stdin --yes` and `email-templates update --stdin --yes` accept the same workflow template payloads as `/api/email-templates`, including `purpose` values such as `application_acknowledgement`, `application_rejection`, and `interview_invitation`.

`notifications personal set --stdin --yes` and `notifications inbox set --stdin --yes` accept a normalized schedule with `cadence`, `timeZone`, `deliveryTime`, `weeklyDay`, and `monthlyDay`. Inbox settings additionally accept `recipientEmail`; use `null` to restore `FACTORY_CAREERS_HIRING_INBOX` as the fallback. Cadence is one of `immediate`, `daily`, `weekly`, `monthly`, or `off`.

`org update-settings --stdin --yes` accepts the same JSON payload as `/api/org-settings`, including `signupAllowedDomains` for owner-managed signup domain allowlists and workflow email settings such as `sendApplicationAcknowledgement`, `applicationAcknowledgementTemplateId`, `sendApplicationRejection`, `applicationRejectionTemplateId`, and `interviewInvitationTemplateId`. The server still enforces owner-only updates and requires each signup domain to match a configured SSO provider or organization-level calendar integration.

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
factory-careers applications analyze-missing --yes --json
factory-careers applications scores app_123 --json
```

Use the chatbot from an agent:

```bash
factory-careers chatbot upload --file context.txt --yes --json
factory-careers chatbot chat --stdin --yes --json < chat-request.json
```

The chat command returns accumulated streamed events plus the concatenated text response.
