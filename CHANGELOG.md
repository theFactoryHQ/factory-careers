# Changelog

Notable Factory Careers product and operator changes are recorded here. The
inherited Reqcore record is preserved separately in
[`docs/reference/REQCORE_CHANGELOG.md`](docs/reference/REQCORE_CHANGELOG.md).

Entries follow [Keep a Changelog](https://keepachangelog.com) and focus on
outcomes visible to recruiters, administrators, operators, integrators, and
self-hosters.

---

## Unreleased

### Added

- Added CLI batch inspection and resumption plus organization-wide missing-only scoring, finite wait controls, and stable nonzero outcomes for failed, cancelled, or timed-out processing.
- Added independent application email preferences for each member and the shared careers inbox, with immediate, daily, weekly, monthly, and off cadences in dashboard settings and the authenticated CLI.
- Added a durable application notification worker with database-triggered event capture, grouped digest emails, tenant isolation, leases, bounded retries, and provider idempotency.

### Changed

- Made shareable invite links a one-time reveal and stored only one-way token hashes, while preserving previously distributed links through migration.
- Kept pre-made scoring rubrics consistent across job creation, job editing, API, and CLI paths.
- Made CI compare ordinary changelog additions with the pull request merge base, preserve its existing Unreleased entries, and reject stale or unfinalized release PRs before publishing and validating the exact versioned GitHub Release body.
- Shared typed job create and update contracts across the dashboard and API while preserving deliberate null-versus-omitted field behavior.
- Made the generated Nuxt ESLint configuration a required local and pull-request gate, and clarified that host development runs on port 3001 while the full Docker stack remains on port 3000.

### Fixed

- Prevented expired application notification workers from overwriting delivery state owned by a newer queue attempt.
- Kept member application notifications from disappearing when application and database time zones differ.
- Gave Render-hosted users independent client-IP rate-limit buckets behind the managed ingress.
- Kept source, release, and issue-report links consistently pointed at the Factory-owned repository.
- Kept the application status filter synchronized with filtered and unfiltered dashboard navigation.
- Removed the verbose search-scope helper from the job pipeline.
- Made AI usage charts render a true rolling 30-day window with readable scales, quiet-day gaps, compact bars, period totals, and accessible daily details.
- Pinned recruiter-search database functions to trusted schemas, protected device authorization with row-level security, and indexed durable-processing relationships used during cleanup.
- Protected internal recruiter-search and durable-processing tables with the same server-role-only row-level security boundary used by existing production data.
- Kept large job pipelines stable with bounded server pagination, accurate filtered stage counts, identity-safe selection, and application-scoped interview history.
- Kept ordinary application and job-pipeline lists available while the optional application search index is being migrated during a deployment.
- Bound score details and reviewer feedback to the exact persisted analysis run, kept the last successful result visible after a failed re-score, and isolated candidate and scoring state when switching applications.
- Preserved pending upload reconciliation work across restarts and retained cancelled processing history when documents or parent records are removed.
- Classified parsed, text-free, retryable, and permanently failed PDF, DOCX, and DOC parsing outcomes with stable result codes.
- Made bulk missing-score analysis and document reprocessing resumable through tenant-scoped batches with bounded retries, sanitized status, and an opt-in background worker.
- Kept recruiter scoring and document-reparse actions accurate while durable work is running, with visible progress, safe application/job switching, and terminal-only refreshes.
- Restored `is empty` property filtering and applied property filters within the active organization and job at the database layer.

## [1.0.0](https://github.com/theFactoryHQ/factory-careers/releases/tag/v1.0.0) (2026-07-16)

This is the first independent Factory Careers release after the Reqcore fork.
Earlier inherited history remains available in the archive.

### Added

- Factory-branded public job board and application experience with configurable forms, private document uploads, source attribution, structured job descriptions, divisions, and salary visibility controls.
- Organization access controls for invitations, join requests, signup-domain allowlists, Microsoft SSO, role-based permissions, and tenant-scoped administration.
- Authenticated Factory Careers CLI with structured JSON output and agent-friendly automation for supported recruiting and system workflows.
- AI-assisted recruiting workflows for resume parsing, candidate analysis, scoring criteria, provider configuration, model discovery, and recruiter chatbot experiences.
- Microsoft and Google calendar integration paths for interview scheduling, invitations, responses, and synchronization.
- Operational validation for Render, Supabase Postgres, S3-compatible private storage, backups, release verification, and production environment contracts.
- Cluster 8 career-page guidance covering conversion, search optimization, Google for Jobs structured data, ATS selection, and self-hosted deployment.

### Changed

- Re-established the changelog as a Factory Careers product record, with future changes collected under Unreleased and versioned when published.
- Kept the curated changelog independent from release-please generation, with an explicit finalization command for future release pull requests.
- Corrected the update experience and release links to use Factory-owned GitHub sources.
- Repositioned the product from a branded Reqcore fork to Factory's hiring and applicant-tracking system, with Factory-owned product, security, deployment, and automation decisions.
- Improved dashboard responsiveness and navigation with shared caching, prefetching, keep-alive behavior, and lazy-loaded detail panels.
- Unified Factory branding and transactional email behavior across public, authentication, dashboard, and candidate communication surfaces.

### Fixed

- Distinguished a pending first Factory GitHub release from network or service failures in the Updates experience.
- Kept the Updates status icon synchronized with manual release checks.
- Hardened public application uploads, authorization boundaries, tenant isolation, dependency security, and production validation gates.
- Bundled the PDF parsing worker required to process candidate resumes reliably in production.
- Restricted the PostHog browser proxy to required SDK routes with bounded streaming, safe headers, and separate ingestion and asset rate limits.
- Bound delegated calendar integrations to organizations, enforced administrator-only shared-calendar changes, protected reconnect races, and retried pending Google webhook setup.
- Required organization settings permission for compliance reporting and suppressed protected-dimension results for cohorts smaller than five.
- Kept database connection credentials out of Drizzle configuration diagnostics.
- Enforced inclusive public job closing dates with a legacy deadline backfill, atomic submissions, application-bound uploads, and serialized document-cap reservations.
- Scored each application from its submitted resume, with a deterministic fallback for legacy uploads.
