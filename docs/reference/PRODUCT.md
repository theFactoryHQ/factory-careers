# Factory Careers Product Brief

Factory Careers is Factory's hiring and applicant-tracking system for `careers.thefactoryhq.com`. It began as an AGPL-compatible fork of Reqcore, but current decisions should be evaluated against Factory's recruiting workflow, access model, deployment shape, and agent automation needs.

## Primary Users

| User | Main Needs |
| --- | --- |
| Candidates | Clear public roles, low-friction applications, trustworthy receipt emails. |
| Recruiters | Fast candidate review, pipeline visibility, notes, source tracking, and communication context. |
| Hiring managers | Focused candidate and application views with interview context and scoring evidence. |
| Operators and agents | Authenticated CLI workflows, JSON output, safe confirmations, and route parity. |

## Current Capabilities

- Factory-branded public job board and application flow.
- Microsoft SSO and invite or approval-gated dashboard access.
- Jobs, candidates, applications, pipeline status, notes, comments, documents, and source tracking.
- Interview scheduling with Microsoft and Google integration paths.
- AI configuration, criteria generation, application analysis, and chatbot workflows.
- Operational validation for production envs, backups, object storage, security routes, and e2e tenant isolation.
- Authenticated CLI for browserless operations.

## Product Direction

Factory Careers should stay focused on real Factory recruiting operations:

- Keep candidate data private and auditable.
- Prefer explicit organization and role controls over broad public access.
- Keep browser workflows and CLI workflows behaviorally aligned.
- Make deployment, backup, and incident response boring enough to run under pressure.

