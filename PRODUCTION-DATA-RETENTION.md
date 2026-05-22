# Reqcore Production Data Retention

This document defines the minimum retention decisions required before using
Reqcore with real candidate data. It is an operational baseline, not legal
advice.

## Data Classes

| Data Class | Examples | Default Handling | Production Decision Needed |
|---|---|---|---|
| Candidate profile data | Name, email, phone, notes, custom properties | Stored in PostgreSQL until deleted | Retention period after job close or last activity. |
| Application data | Job application, status, notes, scores, question responses | Stored in PostgreSQL until deleted | Retention period by hiring policy and jurisdiction. |
| Candidate documents | Resumes, cover letters, uploaded files | Stored in S3-compatible object storage and referenced from PostgreSQL | Retention period and backup retention period. |
| Interview data | Schedule, notes, candidate responses, calendar metadata | Stored in PostgreSQL; optional Google Calendar integration | Retention period and calendar deletion expectations. |
| Activity logs | User actions, resource ids, metadata | Append-only PostgreSQL audit trail | Retention period and privacy review for metadata. |
| AI analysis data | Scores, generated criteria, model/provider metadata | Stored in PostgreSQL when AI features are enabled | Processor approval and retention period. |
| Auth/session data | Users, sessions, accounts, memberships, invitations | Stored by Better Auth in PostgreSQL | Session and inactive-user cleanup policy. |
| Telemetry/feedback | Optional PostHog events, GitHub feedback issues | Disabled unless configured | Processor approval and retention period. |

## Current Deletion Behavior

| User Action | Database Behavior | Object Storage Behavior | Notes |
|---|---|---|---|
| Delete a document | Deletes the document row | Deletes the referenced object best-effort | S3 failure is logged and DB cleanup still proceeds. |
| Delete a candidate | Deletes candidate-linked database rows by cascade | Deletes candidate document objects best-effort after DB deletion succeeds | Activity log records deleted document count. |
| Delete an organization | Deletes organization-linked database rows through Better Auth cascade | Deletes organization document objects best-effort after DB deletion succeeds | Object keys are collected before the Better Auth deletion hook runs. |
| Delete a job | Deletes job-linked database rows by cascade | Candidate documents remain because candidates remain | Define whether rejected/closed-job candidates should be purged separately. |
| Remove a member | Removes membership/session access | No object storage impact | Stale access is covered by e2e checks. |

Best-effort object deletion means failures are logged for operational follow-up.
Backups may continue to contain deleted data until backup retention expires.

## Required Production Decisions

Complete these before real candidate data:

- Candidate and application retention window after job close.
- Rejected-candidate retention window.
- Hired-candidate retention or handoff policy.
- Candidate document backup retention window.
- Activity-log retention window and metadata minimization review.
- AI analysis retention window and provider approval.
- Calendar metadata deletion expectations when Google Calendar is enabled.
- Export/delete response process for candidate privacy requests.
- Backup purge process when legal/privacy requires accelerated deletion.

## Operational Checks

Before launch:

```bash
npm run ops:backup-restore-rehearsal
npm run ops:object-storage-restore-rehearsal
```

Before approving a deletion-related release, verify:

- Deleting a document removes the database row and the S3 object.
- Deleting a candidate removes candidate-owned documents from object storage.
- Deleting an organization removes organization-owned documents from object storage.
- Restore rehearsals document how deleted data remains in backups until expiry.

## Open Items

These require owner approval, not code changes alone:

- Legal/privacy approval for retention periods.
- Backup retention and purge SLA.
- Processor-specific retention settings for email, AI, analytics, calendar, and feedback tools.
- Monitoring alert for repeated `document.s3_delete_failed`,
  `candidate.document_s3_delete_failed`, or
  `organization.document_s3_delete_failed` log events.
