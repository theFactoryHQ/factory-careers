# Plan 002: Require bounded multipart uploads before buffering

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 277bca7..HEAD -- server/utils/uploadLimits.ts tests/unit/upload-limits.test.ts 'server/api/public/jobs/[slug]/apply.post.ts' 'server/api/candidates/[id]/documents/index.post.ts' server/api/chatbot/upload.post.ts`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `277bca7`, 2026-06-15

## Why this matters

The upload routes call `assertUploadContentLength` before `readMultipartFormData`
so oversized multipart bodies can be rejected before buffering. The helper
currently returns early when `Content-Length` is absent, and the unit test
explicitly allows that path. That leaves public and authenticated multipart
endpoints dependent on lower-level server or proxy limits that are not evident
in this repo.

The goal is to make upload bounds explicit at the application edge: either a
request declares a valid, acceptable `Content-Length`, or the route rejects it
before multipart parsing.

## Current state

Relevant files:

- `server/utils/uploadLimits.ts` - shared upload request-size guard.
- `tests/unit/upload-limits.test.ts` - unit tests for the guard.
- `server/api/public/jobs/[slug]/apply.post.ts` - unauthenticated public
  application multipart upload path.
- `server/api/candidates/[id]/documents/index.post.ts` - authenticated
  candidate document upload path.
- `server/api/chatbot/upload.post.ts` - chatbot document upload path.

Current helper:

```ts
// server/utils/uploadLimits.ts:3
export function assertUploadContentLength(event: H3Event, maxBytes: number): void {
  const rawContentLength = getHeader(event, 'content-length')
  if (!rawContentLength) return

  const contentLength = Number(rawContentLength)
  ...
}
```

Current test blesses missing `Content-Length`:

```ts
// tests/unit/upload-limits.test.ts:32
it('ignores missing content-length so chunked uploads still reach per-file validation', () => {
  expect(() => assertUploadContentLength(makeEvent() as any, 10 * 1024 * 1024))
    .not.toThrow()
})
```

Upload routes call the guard before multipart buffering:

```ts
// server/api/public/jobs/[slug]/apply.post.ts:81
if (isMultipart) {
  assertUploadContentLength(event, MAX_PUBLIC_APPLICATION_MULTIPART_BYTES)
}

// server/api/public/jobs/[slug]/apply.post.ts:111
const formData = await readMultipartFormData(event)
```

```ts
// server/api/candidates/[id]/documents/index.post.ts:60
assertUploadContentLength(event, MAX_DOCUMENT_UPLOAD_BODY_BYTES)

// server/api/candidates/[id]/documents/index.post.ts:62
const formData = await readMultipartFormData(event)
```

```ts
// server/api/chatbot/upload.post.ts:40
assertUploadContentLength(event, MAX_CHATBOT_UPLOAD_BODY_BYTES)

// server/api/chatbot/upload.post.ts:42
const form = await readMultipartFormData(event)
```

Repo search did not find a Nuxt/Nitro body limit configured in `nuxt.config.ts`;
`rg -n "bodyLimit|maxBody|maxRequest|readMultipartFormData|assertUploadContentLength" nuxt.config.ts server app tests`
found only the helper and call sites above.

Repo conventions to follow:

- Shared server behavior belongs under `server/utils`.
- Expected validation failures should use structured `createError` with a clear
  status code and message.
- Use focused Vitest unit tests for small server utilities.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift check | `git diff --stat 277bca7..HEAD -- server/utils/uploadLimits.ts tests/unit/upload-limits.test.ts 'server/api/public/jobs/[slug]/apply.post.ts' 'server/api/candidates/[id]/documents/index.post.ts' server/api/chatbot/upload.post.ts` | no in-scope drift, or reviewed drift with matching current state |
| Focused tests | `npm run test:unit -- tests/unit/upload-limits.test.ts` | exit 0 |
| Upload e2e, if local services are available | `npm run test:e2e:uploads` | exit 0 |
| Unit suite | `npm run test:unit` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:

- `server/utils/uploadLimits.ts`
- `tests/unit/upload-limits.test.ts`
- Upload route call sites only if an explicit option must be passed:
  - `server/api/public/jobs/[slug]/apply.post.ts`
  - `server/api/candidates/[id]/documents/index.post.ts`
  - `server/api/chatbot/upload.post.ts`

**Out of scope**:

- Rewriting upload handling to a streaming parser.
- Changing per-file limits such as `MAX_FILE_SIZE`,
  `MAX_DOCUMENTS_PER_CANDIDATE`, or `CHATBOT_MAX_UPLOAD_BYTES`.
- Changing storage, parsing, MIME detection, or S3 behavior.
- Adding proxy or deployment config unless the helper-based approach cannot be
  made safe.

## Git workflow

- Branch: `codex/002-require-content-length-for-multipart-uploads`
- Commit message: `fix: require bounded multipart upload requests`
- Do not push or open a PR unless the operator instructs you to.

## Steps

### Step 1: Change the missing-header test to expect rejection

In `tests/unit/upload-limits.test.ts`, replace the current "ignores missing
content-length" test with a rejection test. Use HTTP `411 Length Required`
unless the project already has a more specific convention by the time you run
this plan.

Target assertion:

```ts
it('rejects missing content-length before multipart buffering', () => {
  expect(() => assertUploadContentLength(makeEvent() as any, 10 * 1024 * 1024))
    .toThrow(expect.objectContaining({ statusCode: 411 }))
})
```

**Verify**: `npm run test:unit -- tests/unit/upload-limits.test.ts` -> fails before the helper change.

### Step 2: Make the helper reject missing content length

In `server/utils/uploadLimits.ts`, change the early return into a structured
error:

```ts
if (!rawContentLength) {
  throw createError({
    statusCode: 411,
    statusMessage: 'Content-Length header required for file uploads',
  })
}
```

Keep the existing malformed-header `400` and oversized-body `413` behavior.

If a legitimate caller needs to allow chunked uploads, do not silently preserve
the old default. Instead, add an explicit third options argument such as
`{ requireContentLength?: boolean }`, keep the secure default as requiring the
header, and update that caller with a comment explaining the exception. At the
time this plan was written, all callers were upload endpoints and should keep
the secure default.

**Verify**: `npm run test:unit -- tests/unit/upload-limits.test.ts` -> exit 0.

### Step 3: Confirm upload call sites still guard before parsing

Check all call sites and keep `assertUploadContentLength(...)` before
`readMultipartFormData(...)`. Do not move guard calls below parsing.

Command:

```bash
rg -n "assertUploadContentLength|readMultipartFormData" server/api
```

Expected result: each upload route still shows the guard before multipart
parsing.

**Verify**: `rg -n "assertUploadContentLength|readMultipartFormData" server/api` -> public application, candidate document, and chatbot upload routes each guard before parsing.

### Step 4: Run broader checks

Run the focused and broad checks.

**Verify**:

- `npm run test:unit -- tests/unit/upload-limits.test.ts` -> exit 0.
- `npm run test:unit` -> exit 0.
- `npm run typecheck` -> exit 0.
- If the local Playwright upload environment is available: `npm run test:e2e:uploads` -> exit 0. If it is unavailable because local Postgres/MinIO/browser setup is missing, record that exact blocker in the handoff instead of changing the plan.

## Test plan

- Update `tests/unit/upload-limits.test.ts` to cover:
  - missing `Content-Length` -> `411`
  - malformed `Content-Length` -> `400`
  - oversized body -> `413`
  - exact-limit body -> allowed
- Keep the existing route call-site coverage through the `rg` verification.
- Run upload e2e when the local services required by the repo are available.

## Done criteria

All must hold:

- [ ] `assertUploadContentLength` rejects missing `Content-Length` before any
      multipart parser runs.
- [ ] `tests/unit/upload-limits.test.ts` expects `411` for missing length.
- [ ] Public application, candidate document, and chatbot uploads still call
      the helper before `readMultipartFormData`.
- [ ] `npm run test:unit -- tests/unit/upload-limits.test.ts` exits 0.
- [ ] `npm run test:unit` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:e2e:uploads` either exits 0 or the exact local-environment
      blocker is documented in the handoff.
- [ ] No files outside the in-scope list are modified, except `plans/README.md`
      status if you were asked to update it.

## STOP conditions

Stop and report back if:

- Product requirements say chunked multipart uploads without `Content-Length`
  must remain supported. That requires a streaming/body-limit design, not this
  simple guard.
- You find a Nitro/h3 body-limit configuration already added after commit
  `277bca7`; reconcile the new mechanism before editing the helper.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

If the app later adopts streaming uploads, this helper may move from "required
boundary" to "fast preflight." Until then, reviewers should treat any upload
route that calls `readMultipartFormData` without a prior bounded-body guard as a
security regression.
