import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('processing batch dashboard adoption', () => {
  it('scores only missing job applications through one durable batch', () => {
    const source = read('app/components/JobSubNavActions.vue')

    expect(source).toContain("createAndDrain({")
    expect(source).toContain('`/api/jobs/${jobId}/analyze-all`')
    expect(source).toContain('Score Unscored Candidates')
    expect(source).toContain('scoringBatch.batchId')
    expect(source).toContain('scoringBatch.counts.succeeded')
    expect(source).toContain('activeScoringRun')
    expect(source).toContain('run !== activeScoringRun')
    expect(source).toContain('if (run === activeScoringRun)')
    expect(source).not.toContain('applicationIds')
    expect(source).not.toContain('`/api/applications/${appId}/analyze`')
  })

  it('waits for manual document parsing to terminate before refreshing', () => {
    const source = read('app/composables/useApplicationDocumentActions.ts')

    expect(source).toContain('const result = await parseBatch.createAndDrain({')
    expect(source).toContain("path: `/api/documents/${docId}/parse`")
    expect(source).toContain('activeReparseRun')
    expect(source).toContain('run !== activeReparseRun')
    expect(source).toContain('run === activeReparseRun')
    expect(source).toContain('documentProcessingBatchNotice(result, documentState)')
    expect(source).toContain('if (isProcessingObservationAbort(err)) return')
    expect(source).not.toContain('Resume parsed successfully')
    expect(source).not.toContain("await $fetch(`/api/documents/${docId}/parse`")
  })

  it('reruns analysis only after a successful reparse for the same application', () => {
    const source = read('app/components/ScoreBreakdown.vue')

    expect(source).toContain('const result = await parseBatch.createAndDrain({')
    expect(source).toContain("result.status !== 'completed'")
    expect(source).toContain('if (applicationId !== props.applicationId) return')
    expect(source).toContain('activeRetryRun')
    expect(source).toContain('run !== activeRetryRun')
    expect(source).toContain('loadApplicationDocumentParseState(applicationId, documentId)')
    expect(source).toContain("documentState?.parseStatus !== 'parsed'")
    expect(source).toContain('await runAnalysis()')
    expect(source).toContain('if (isProcessingObservationAbort(err)) return')
    expect(source).not.toContain("await $fetch(`/api/documents/${documentId}/parse`")
  })

  it('exposes sanitized parse state through tenant-scoped authenticated detail routes', () => {
    const applicationRoute = read('server/api/applications/[id].get.ts')
    const candidateRoute = read('server/api/candidates/[id].get.ts')
    const applicationClient = read('app/composables/useApplication.ts')

    for (const source of [applicationRoute, candidateRoute]) {
      expect(source).toContain('parseStatus: true')
      expect(source).toContain('parseResultCode: true')
    }
    expect(applicationRoute).toContain('eq(associatedDocument.organizationId, orgId)')
    expect(applicationRoute).toContain('eq(legacyDocument.organizationId, orgId)')
    expect(applicationRoute).toContain('Promise<ApplicationDetailResponse<Date>>')
    expect(applicationClient).toContain('useFetch<ApplicationDetailResponse>')
    expect(candidateRoute).toContain('eq(candidateDocument.organizationId, orgId)')
  })
})
