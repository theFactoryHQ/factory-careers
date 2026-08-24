# Factory Careers Production Data Retention

This document captures the minimum retention decisions needed before Factory Careers stores real candidate data. It is an operational baseline, not legal advice.

## Data Classes

| Data Class | Examples | Decision Needed |
| --- | --- | --- |
| Candidate profile data | Name, email, phone, notes, properties | Retention period after job close or last activity. |
| Application data | Job application, status, answers, scores | Retention period by hiring policy and jurisdiction. |
| Candidate documents | Resumes, cover letters, uploaded files | Object retention and backup retention periods. |
| Interview data | Schedules, notes, calendar metadata | Retention period and calendar cleanup expectations. |
| Activity logs | User actions and resource metadata | Retention period and privacy review for metadata. |
| AI analysis data | Scores, generated criteria, provider metadata | Processor approval and retention period. |
| Auth/session data | Users, sessions, accounts, memberships | Session cleanup and inactive-user policy. |
| Telemetry/feedback | Optional analytics and feedback issues | Processor approval and retention period. |

## Current Deletion Expectations

- Document deletes remove the database row and atomically enqueue a durable private-object erasure tombstone.
- Candidate deletes cascade candidate-linked database rows and atomically enqueue linked document tombstones.
- Organization deletes remove organization-linked rows and atomically enqueue organization document tombstones.
- Privacy requests remain `in_review` until every linked tombstone reaches confirmed completion.
- Follow the [document-erasure rollout](DOCUMENT-ERASURE-ROLLOUT.md) before enabling the worker. Treat legacy-object [reconciliation](DOCUMENT-ERASURE-RECONCILIATION.md) as a separately approved operation.
- Job deletes remove job-linked application data, but candidate profiles and documents may remain unless separate retention policy requires purge.
- Removed members lose membership and session access; stale access is covered by e2e checks.
