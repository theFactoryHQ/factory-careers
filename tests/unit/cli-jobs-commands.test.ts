import { describe, expect, it } from 'vitest'
import { createCliTestHarness } from '../helpers/cli-test-harness'

describe('CLI jobs commands', () => {
  it('lists jobs with the active bearer token', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-jobs-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      return Response.json({ data: [{ id: 'job_1', title: 'Engineer' }] })
    })

    const exitCode = await run(['jobs', 'list', '--json'])

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ data: [{ id: 'job_1', title: 'Engineer' }] })
  })

  it('gets a job by ID', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-jobs-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs/job_1')
      expect(init?.method).toBe('GET')
      return Response.json({ id: 'job_1', title: 'Engineer' })
    })

    const exitCode = await run(['jobs', 'get', 'job_1', '--json'])

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer' })
  })

  it('creates a job from stdin JSON when --yes is provided', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-jobs-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ title: 'Engineer', status: 'draft' })
      return Response.json({ id: 'job_1', title: 'Engineer', status: 'draft' })
    })

    const exitCode = await run(
      ['jobs', 'create', '--stdin', '--yes', '--json'],
      JSON.stringify({ title: 'Engineer', status: 'draft' }),
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer', status: 'draft' })
  })

  it('treats stdin JSON as automation confirmation for mutating commands', async () => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-jobs-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ title: 'Engineer', status: 'draft' })
      return Response.json({ id: 'job_1', title: 'Engineer', status: 'draft' })
    })

    const exitCode = await run(
      ['jobs', 'create', '--stdin', '--no-input', '--json'],
      JSON.stringify({ title: 'Engineer', status: 'draft' }),
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer', status: 'draft' })
  })

  it('refuses mutating job commands without --yes in no-input mode', async () => {
    const { run, stdout } = createCliTestHarness('factory-careers-cli-jobs-')

    const exitCode = await run(['jobs', 'delete', 'job_1', '--no-input', '--json'])

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toEqual({
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
      message: 'Pass --yes to confirm this mutating command.',
    })
  })

  it.each([
    ['open', 'open'],
    ['close', 'closed'],
    ['archive', 'archived'],
  ])('%s updates a job lifecycle status with confirmation', async (commandName, status) => {
    const { fetchMock, run, stdout } = createCliTestHarness('factory-careers-cli-jobs-')
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://careers.example.com/api/jobs/job_1')
      expect(init?.method).toBe('PATCH')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
      expect(JSON.parse(String(init?.body))).toEqual({ status })
      return Response.json({ id: 'job_1', title: 'Engineer', status })
    })

    const exitCode = await run(['jobs', commandName, 'job_1', '--yes', '--json'])

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout[0])).toEqual({ id: 'job_1', title: 'Engineer', status })
  })
})