import { describe, expect, it } from 'vitest'
import { createCliTestHarness } from '../helpers/cli-test-harness'

describe('CLI candidate and application commands', () => {
  it('creates a candidate from stdin JSON', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-core-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/candidates')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      })
      return Response.json({ id: 'cand_1', email: 'ada@example.com' })
    })

    const exitCode = await run(
      ['candidates', 'create', '--stdin', '--yes', '--json'],
      JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      }),
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'cand_1', email: 'ada@example.com' })
  })

  it('updates a candidate custom property value', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-core-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/candidates/cand_1/properties/prop_1')
      expect(init?.method).toBe('PUT')
      expect(JSON.parse(String(init?.body))).toEqual({ value: 'NYC' })
      return Response.json({ id: 'value_1', value: 'NYC' })
    })

    const exitCode = await run(
      ['candidates', 'set-property', 'cand_1', 'prop_1', '--stdin', '--yes', '--json'],
      JSON.stringify({ value: 'NYC' }),
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'value_1', value: 'NYC' })
  })

  it('creates an application from stdin JSON', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-core-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/applications')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        candidateId: 'cand_1',
        jobId: 'job_1',
      })
      return Response.json({ id: 'app_1', candidateId: 'cand_1', jobId: 'job_1', status: 'new' })
    })

    const exitCode = await run(
      ['applications', 'create', '--stdin', '--yes', '--json'],
      JSON.stringify({ candidateId: 'cand_1', jobId: 'job_1' }),
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'app_1', candidateId: 'cand_1', jobId: 'job_1', status: 'new' })
  })

  it('updates an application pipeline status with an explicit command', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-core-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/applications/app_1')
      expect(init?.method).toBe('PATCH')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual({ status: 'interviewing' })
      return Response.json({ id: 'app_1', status: 'interviewing' })
    })

    const exitCode = await run(['applications', 'status', 'app_1', 'interviewing', '--yes', '--json'])

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'app_1', status: 'interviewing' })
  })

  it('runs application analysis and fetches scores', async () => {
    const harness = createCliTestHarness('factory-careers-cli-core-')
    harness.fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === 'https://careers.example.com/api/applications/app_1/analyze') {
        expect(init?.method).toBe('POST')
        return Response.json({ status: 'completed', compositeScore: 88 })
      }
      if (url === 'https://careers.example.com/api/applications/app_1/scores') {
        expect(init?.method).toBe('GET')
        return Response.json({ compositeScore: 88, criteria: [] })
      }
      throw new Error(`Unexpected URL ${url}`)
    })

    const analyzeExit = await harness.run(['applications', 'analyze', 'app_1', '--yes', '--json'])
    const scoresExit = await harness.run(['applications', 'scores', 'app_1', '--json'])

    expect(analyzeExit).toBe(0)
    expect(scoresExit).toBe(0)
    expect(JSON.parse(harness.stdout[0])).toEqual({ status: 'completed', compositeScore: 88 })
    expect(JSON.parse(harness.stdout[1])).toEqual({ compositeScore: 88, criteria: [] })
  })
})