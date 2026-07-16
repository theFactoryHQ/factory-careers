# Changelog

Notable Factory Careers product and operator changes are recorded here. The
inherited Reqcore record is preserved separately in
`docs/reference/REQCORE_CHANGELOG.md`.

Entries follow [Keep a Changelog](https://keepachangelog.com) and focus on
outcomes visible to recruiters, administrators, operators, integrators, and
self-hosters.

---

## Unreleased

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

### Changed

- Re-established the changelog as a Factory Careers product record, with future changes collected under Unreleased and versioned when published.
- Corrected the update experience and release links to use Factory-owned GitHub sources.
- Repositioned the product from a branded Reqcore fork to Factory's hiring and applicant-tracking system, with Factory-owned product, security, deployment, and automation decisions.
- Improved dashboard responsiveness and navigation with shared caching, prefetching, keep-alive behavior, and lazy-loaded detail panels.
- Unified Factory branding and transactional email behavior across public, authentication, dashboard, and candidate communication surfaces.

### Fixed

- Distinguished a pending first Factory GitHub release from network or service failures in the Updates experience.
- Hardened public application uploads, authorization boundaries, tenant isolation, dependency security, and production validation gates.
- Bundled the PDF parsing worker required to process candidate resumes reliably in production.
