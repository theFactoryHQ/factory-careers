import { describe, expect, it, vi } from 'vitest'
import { monitorIssueChanges } from '../../scripts/microsoft-monitor-incidents.mjs'

describe('Microsoft monitor incident lifecycle', () => {
  it('opens an expiry warning without opening an outage', () => {
    expect(monitorIssueChanges([], { service: 'sso', code: 'expires_30d' })).toEqual([
      { action: 'open', category: 'expiry', service: 'sso', code: 'expires_30d' },
    ])
  })

  it('keeps the same expiry warning open across thresholds and opens one outage', () => {
    const issues = [{ number: 1, category: 'expiry', service: 'sso' }] as const
    expect(monitorIssueChanges(issues, { service: 'sso', code: 'expires_7d' })).toEqual([])
    expect(monitorIssueChanges(issues, { service: 'sso', code: 'invalid_client' })).toEqual([
      { action: 'open', category: 'outage', service: 'sso', code: 'invalid_client' },
    ])
  })

  it('keeps a confirmed outage open when the failure reason changes', () => {
    const issues = [{ number: 1, category: 'outage', service: 'calendar' }] as const
    expect(monitorIssueChanges(issues, { service: 'calendar', code: 'invalid_client' })).toEqual([])
    expect(monitorIssueChanges(issues, { service: 'calendar', code: 'transient_failure' })).toEqual([])
    expect(monitorIssueChanges(issues, { service: 'calendar', code: 'unconfirmed' })).toEqual([])
  })

  it('closes only the recovered service and allows a later incident to open', () => {
    const issues = [
      { number: 1, category: 'outage', service: 'calendar' },
      { number: 2, category: 'outage', service: 'sso' },
    ] as const
    expect(monitorIssueChanges(issues, { service: 'calendar', code: 'healthy' })).toEqual([
      { action: 'close', number: 1 },
    ])
    expect(monitorIssueChanges([], { service: 'calendar', code: 'transient_failure' })).toEqual([
      { action: 'open', category: 'outage', service: 'calendar', code: 'transient_failure' },
    ])
  })

  it('tracks missing expiry metadata as a configuration warning', () => {
    const issues = [{ number: 1, category: 'expiry', service: 'calendar' }] as const
    expect(monitorIssueChanges(issues, { service: 'calendar', code: 'metadata_missing' })).toEqual([
      { action: 'open', category: 'configuration', service: 'calendar', code: 'metadata_missing' },
    ])
  })
})

describe('incident notification delivery', () => {
  it('sends a single notice for a sustained incident without adding comments', async () => {
    const { reconcileMonitorIssues } = await import('../../scripts/microsoft-monitor-incidents.mjs')
    const issues: Array<{ number: number, body: string, created_at: string, state?: string }> = []
    const issueApi = {
      listForRepo: vi.fn(),
      createLabel: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(async (input: { body: string }) => {
        const data = { ...input, number: 1, created_at: new Date().toISOString() }
        issues.push(data)
        return { data }
      }),
      update: vi.fn(async (input: { issue_number: number, body?: string, state?: string }) => {
        Object.assign(issues.find(issue => issue.number === input.issue_number)!, input)
      }),
    }
    const github = {
      rest: { issues: issueApi },
      paginate: async () => issues.filter(issue => issue.state !== 'closed'),
    }
    const context = { repo: { owner: 'test', repo: 'careers' }, serverUrl: 'https://github.com', runId: 1 }
    const send = vi.fn().mockImplementation(async () => Response.json({ ok: true }))
    const config = { base: 'https://careers.example.com', secret: 'test-only', warn: vi.fn() }
    vi.stubGlobal('fetch', send)
    try {
      for (const code of ['invalid_client', 'transient_failure', 'healthy']) {
        await reconcileMonitorIssues(github, context, [{ service: 'sso', code }], config)
      }
      expect(issueApi.create).toHaveBeenCalledOnce()
      expect(send).toHaveBeenCalledOnce()
      expect(issues[0]?.body).toContain('<!-- notice delivered -->')
      expect(issues[0]?.state).toBe('closed')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('closes a recovered incident while a separate notice needs reconciliation', async () => {
    const { reconcileMonitorIssues } = await import('../../scripts/microsoft-monitor-incidents.mjs')
    const created_at = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const update = vi.fn().mockResolvedValue(undefined)
    const github = {
      rest: { issues: { listForRepo: vi.fn(), update } },
      paginate: async () => [
        { number: 1, body: '<!-- factory-careers-microsoft:sso:outage -->', created_at },
        { number: 2, body: '<!-- factory-careers-microsoft:calendar:outage -->\n<!-- notice delivered -->', created_at },
      ],
    }
    const repo = { owner: 'test', repo: 'careers' }
    const results = [{ service: 'sso', code: 'healthy' }, { service: 'calendar', code: 'healthy' }]
    const config = { base: 'https://careers.example.com', secret: 'test-only', warn: vi.fn() }
    await expect(reconcileMonitorIssues(github, { repo }, results, config)).rejects.toThrow('require delivery')
    expect(update).toHaveBeenCalledExactlyOnceWith({ ...repo, issue_number: 2, state: 'closed' })
  })
})
