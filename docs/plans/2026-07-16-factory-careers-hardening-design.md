# Factory Careers Hardening Design

## Objective

Resolve every accepted finding from the July 16 audit without combining unrelated risk into one unreviewable release. Delivery is split into five dependency-ordered pull requests. Each PR starts from the then-current `main`, uses test-first changes, receives spec and code-quality review, passes `npm run preflight:pr`, and is merged before the next PR is finalized.

## Delivery shape

1. **Security boundaries** — keep authorization outside caches; org-scope calendar renewal; suppress small compliance cohorts; bound the public analytics proxy; remove connection-string logging.
2. **Application integrity** — associate documents with applications; make the core submission transaction conflict-aware; enforce listing expiry consistently.
3. **Scoring and processing** — reconcile model output against the stored rubric; treat applicant content as untrusted; persist resumable parsing/scoring work; align browser and CLI batch behavior.
4. **Pipeline correctness and scale** — prevent cross-candidate stale state and replace the 100-record client slice with a server-paginated pipeline contract.
5. **Reliability and maintainability** — repair migration locking, parser cleanup and corpus coverage, score-run display, property-filter query shape, job request types, lint enforcement, and setup documentation.

## Architecture decisions

Authenticated event handlers always execute `requirePermission` before consulting a cache. Cached functions receive an already-authorized `organizationId` and normalized query input; they never receive `H3Event` or session state. This preserves organization-level reuse while making membership revocation effective on every request.

Documents gain a nullable `applicationId` for historical compatibility. New public submissions always populate it. Scoring prefers the application association and uses an explicit newest-resume legacy fallback only for pre-migration records. The core candidate/application/compliance/response writes use one database transaction; S3 remains a compensating saga.

Processing uses durable database records rather than request-local loops. Workers atomically claim bounded batches, record attempts and failure details, and can resume pending work after interruption. Automatic scoring, bulk scoring, and reparsing all use this same contract. Browser and CLI surfaces report persisted progress rather than inferring success from returned IDs.

The pipeline endpoint owns stage/search/filter/sort pagination and returns independent stage counts. The page preserves selection by application ID, never by stale array position, and renders no previous candidate’s interactive detail while a new selection loads.

## Failure and privacy behavior

Known uniqueness conflicts become stable 409 responses. Failed processing items remain inspectable and retryable without duplicating completed work. Protected-trait summaries require elevated organization permission and suppress small totals/cells. Applicant text is delimited as untrusted data, and model-provided criterion keys or maxima never determine stored scores.

## Verification

Every behavior change follows red-green-refactor. Focused unit/integration tests run per task; each PR finishes with unit tests, conventions, CLI parity where applicable, typecheck, build, production-env validation, and browser QA for visible workflows. Migrations are reviewed against the latest journal before merge. The final merged `main` receives a fresh full preflight and smoke pass.
