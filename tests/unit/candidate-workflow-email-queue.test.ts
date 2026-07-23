import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('candidate workflow email queue contracts', () => {
  it('persists workflow sends and removes process-local email timers', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const migration = readProjectFile('server/database/migrations/0062_candidate_workflow_email_queue.sql')
    const email = readProjectFile('server/utils/email.ts')
    const publicApplication = readProjectFile('server/utils/createPublicApplication.ts')
    const applicationPatch = readProjectFile('server/api/applications/[id].patch.ts')

    expect(schema).toContain("pgTable('candidate_workflow_email_queue'")
    expect(migration).toContain('candidate_workflow_email_queue_dedupe_key_idx')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(email).not.toContain('sendCandidateWorkflowEmailWithTiming')
    expect(email).not.toContain('workflowSendDelayMs')
    expect(publicApplication).toContain('enqueueCandidateWorkflowEmail')
    expect(applicationPatch).toContain('enqueueCandidateWorkflowEmail')
  })

  it('uses bounded claims, attempt fencing, safe telemetry, and provider idempotency', () => {
    const queue = readProjectFile('server/utils/candidateWorkflowEmailQueue.ts')

    expect(queue).toContain('FOR UPDATE SKIP LOCKED')
    expect(queue).toContain('CANDIDATE_WORKFLOW_EMAIL_CLAIM_LIMIT')
    expect(queue).toContain('candidateWorkflowEmailQueue.attemptCount')
    expect(queue).toContain('idempotencyKey')
    expect(queue).not.toContain('error_message')
  })
})
