import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readJsonlCapture } from '../../e2e/helpers/captured-jsonl'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('E2E captured JSONL helpers', () => {
  it('exports shared JSONL capture helpers', () => {
    const source = readProjectFile('e2e/helpers/captured-jsonl.ts')

    for (const exportName of ['readJsonlCapture', 'setupCaptureFile']) {
      expect(source, exportName).toContain(exportName)
    }
  })

  it('reads typed JSONL entries and tolerates a trailing partial line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'factory-careers-jsonl-'))
    const capturePath = join(dir, 'capture.jsonl')

    try {
      await writeFile(capturePath, [
        JSON.stringify({ schemaName: 'CandidateScoring', model: 'factory-e2e' }),
        '{"schemaName":"ChatbotChat","model":"factory-e2e-chatbot"',
      ].join('\n'), 'utf8')

      const entries = await readJsonlCapture<{ schemaName: string, model: string }>(
        capturePath,
        entry => entry.schemaName === 'CandidateScoring',
      )

      expect(entries).toEqual([{ schemaName: 'CandidateScoring', model: 'factory-e2e' }])
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns an empty array when the capture file does not exist', async () => {
    const entries = await readJsonlCapture(join(tmpdir(), 'missing-capture.jsonl'))
    expect(entries).toEqual([])
  })

  it('is adopted by email, AI, and chatbot specs', () => {
    const migratedSpecs = [
      'e2e/helpers/captured-emails.ts',
      'e2e/critical-flows/ai-candidate-review.spec.ts',
      'e2e/critical-flows/chatbot-conversations.spec.ts',
    ]

    for (const spec of migratedSpecs) {
      const source = readProjectFile(spec)
      expect(source, spec).toContain('captured-jsonl')
      expect(source, spec).not.toContain('readFile(capturePath')
    }

    const capturedEmails = readProjectFile('e2e/helpers/captured-emails.ts')
    expect(capturedEmails).toContain('readJsonlCapture<CapturedEmail>')
  })
})