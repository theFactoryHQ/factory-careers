# Changelog

Notable Factory Careers product and operator changes are recorded here. The
inherited Reqcore record is preserved separately in
[`docs/reference/REQCORE_CHANGELOG.md`](docs/reference/REQCORE_CHANGELOG.md).

Entries follow [Keep a Changelog](https://keepachangelog.com) and focus on
outcomes visible to recruiters, administrators, operators, integrators, and
self-hosters.

---

## Unreleased

### Fixed

- Kept ordinary application and job-pipeline lists available while the optional application search index is being migrated during a deployment.
- Bound score details and reviewer feedback to the exact persisted analysis run, kept the last successful result visible after a failed re-score, and isolated candidate and scoring state when switching applications.
- Preserved pending upload reconciliation work across restarts and retained cancelled processing history when documents or parent records are removed.
- Classified parsed, text-free, retryable, and permanently failed PDF, DOCX, and DOC parsing outcomes with stable result codes.

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
