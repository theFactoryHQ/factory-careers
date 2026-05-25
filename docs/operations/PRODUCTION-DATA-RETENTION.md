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

- Document deletes remove the database row and attempt object deletion.
- Candidate deletes cascade candidate-linked database rows and attempt linked document object cleanup.
- Organization deletes remove organization-linked rows and attempt organization document cleanup.
- Job deletes remove job-linked application data, but candidate profiles and documents may remain unless separate retention policy requires purge.
- Removed members lose membership and session access; stale access is covered by e2e checks.

