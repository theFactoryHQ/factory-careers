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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/documents/doc_1/parse')
      expect(init?.method).toBe('POST')
      return Response.json({ id: 'doc_1', parsed: true, wordCount: 250, sectionCount: 4 })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'parse', 'doc_1', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'doc_1', parsed: true, wordCount: 250, sectionCount: 4 })
  })

  it('re-parses all unparsed organization documents with confirmation', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/documents/parse-all')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ total: 2, parsed: 1, failed: 1, failures: [{ id: 'doc_2', error: 'No text' }] })
    })
    const stdout: string[] = []

    const exitCode = await runCli(
      ['documents', 'parse-all', '--yes', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {}, fetch: fetchMock as typeof fetch },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({
      total: 2,
      parsed: 1,
      failed: 1,
      failures: [{ id: 'doc_2', error: 'No text' }],
    })
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
