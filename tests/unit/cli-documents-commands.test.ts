import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-documents-'))
  tempDirs.push(dir)
  return dir
}

function writeAuthedConfig(configPath: string) {
  writeFileSync(configPath, JSON.stringify({
    activeProfile: 'prod',
    profiles: {
      prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' },
    },
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI document commands', () => {
  it('lists documents attached to a candidate', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/candidates/cand_1')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ id: 'cand_1', documents: [{ id: 'doc_1', type: 'resume' }] })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'list', 'cand_1', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({
      candidateId: 'cand_1',
      documents: [{ id: 'doc_1', type: 'resume' }],
    })
  })

  it('uploads a candidate document as multipart form data', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const resumePath = join(dir, 'resume.pdf')
    writeAuthedConfig(configPath)
    writeFileSync(resumePath, Buffer.from('%PDF-1.7 test resume'))
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/candidates/cand_1/documents')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(init?.headers).not.toHaveProperty('content-type')
      expect(init?.body).toBeInstanceOf(FormData)

      const form = init?.body as FormData
      expect(form.get('type')).toBe('resume')
      const file = form.get('file')
      expect(file).toBeInstanceOf(Blob)
      expect((file as Blob & { name?: string }).name).toBe('resume.pdf')

      return Response.json({ id: 'doc_1', type: 'resume', originalFilename: 'resume.pdf' })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'upload', 'cand_1', '--file', resumePath, '--type', 'resume', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'doc_1', type: 'resume', originalFilename: 'resume.pdf' })
  })

  it('surfaces server-side document MIME validation failures during upload', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const resumePath = join(dir, 'resume.xls')
    writeAuthedConfig(configPath)
    writeFileSync(resumePath, Buffer.from('not a supported document'))
    const fetchMock = vi.fn(async () => {
      return Response.json(
        { statusCode: 400, code: 'INVALID_FILE_TYPE', message: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.' },
        { status: 400 },
      )
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'upload', 'cand_1', '--file', resumePath, '--type', 'resume', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toMatchObject({
      status: 400,
      code: 'INVALID_FILE_TYPE',
      message: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.',
    })
  })

  it('downloads a document to an output path', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const outputPath = join(dir, 'downloaded.pdf')
    writeAuthedConfig(configPath)
    const bytes = new Uint8Array([37, 80, 68, 70])
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/documents/doc_1/download')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return new Response(bytes, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="resume.pdf"',
        },
      })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'download', 'doc_1', '--output', outputPath, '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(readFileSync(outputPath)).toEqual(Buffer.from(bytes))
    expect(JSON.parse(stdout[0])).toEqual({
      id: 'doc_1',
      output: outputPath,
      bytes: 4,
      contentType: 'application/pdf',
    })
  })

  it('writes a PDF preview stream to an output path', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const outputPath = join(dir, 'preview.pdf')
    writeAuthedConfig(configPath)
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49])
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/documents/doc_1/preview')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return new Response(bytes, {
        headers: {
          'content-type': 'application/pdf',
        },
      })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'preview', 'doc_1', '--output', outputPath, '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(readFileSync(outputPath)).toEqual(Buffer.from(bytes))
    expect(JSON.parse(stdout[0])).toEqual({
      id: 'doc_1',
      output: outputPath,
      bytes: 6,
      contentType: 'application/pdf',
    })
  })

  it('deletes a document with confirmation', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/documents/doc_1')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'delete', 'doc_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ deleted: true, id: 'doc_1' })
  })

  it('re-parses a document with confirmation', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const completed = {
      batchId: 'batch_doc_1',
      type: 'document_parse',
      status: 'completed',
      counts: { pending: 0, processing: 0, succeeded: 1, failed: 0, cancelled: 0, attempted: 1, total: 1 },
      errorsByCode: {},
      createdAt: '2026-07-16T12:00:00.000Z',
      startedAt: '2026-07-16T12:00:01.000Z',
      completedAt: '2026-07-16T12:00:02.000Z',
      retryAfterMs: null,
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/documents/doc_1/parse')
      expect(init?.method).toBe('POST')
      return Response.json(completed, { status: 202 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'parse', 'doc_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual(completed)
  })

  it('returns nonzero when some organization document reparses fail', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const pending = {
      batchId: 'batch_docs',
      type: 'document_parse',
      status: 'pending',
      counts: { pending: 2, processing: 0, succeeded: 0, failed: 0, cancelled: 0, attempted: 0, total: 2 },
      errorsByCode: {},
      createdAt: '2026-07-16T12:00:00.000Z',
      startedAt: null,
      completedAt: null,
      retryAfterMs: 1_000,
    }
    const failed = {
      ...pending,
      status: 'failed',
      counts: { pending: 0, processing: 0, succeeded: 1, failed: 1, cancelled: 0, attempted: 2, total: 2 },
      errorsByCode: { no_text: 1 },
      startedAt: '2026-07-16T12:00:01.000Z',
      completedAt: '2026-07-16T12:00:02.000Z',
      retryAfterMs: null,
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/documents/parse-all') {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
        return Response.json(pending, { status: 202 })
      }
      if (url === 'https://careers.example.com/api/processing/batch_docs/drain') {
        expect(init?.method).toBe('POST')
        return Response.json(failed)
      }
      throw new Error(`Unexpected request ${init?.method} ${url}`)
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'parse-all', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch, sleep: async () => {} },
    )

    expect(exitCode).toBe(1)
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0])).toEqual(failed)
  })

  it('does not create an output file when download fails', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    const outputPath = join(dir, 'missing.pdf')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async () => Response.json(
      { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
      { status: 404 },
    ))
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'download', 'missing_doc', '--output', outputPath, '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(1)
    expect(existsSync(outputPath)).toBe(false)
    expect(JSON.parse(stdout[0])).toEqual({
      status: 404,
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Document not found',
    })
  })
})
