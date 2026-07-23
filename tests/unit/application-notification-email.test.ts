import React from 'react'
import { render } from '@react-email/render'
import { describe, expect, it, vi } from 'vitest'
import { ApplicationDigestEmail } from '../../server/lib/email/templates'

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://localhost/test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    BETTER_AUTH_URL: 'http://localhost:3000',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    S3_BUCKET: 'test',
  })
})

describe('application digest email', () => {
  it('renders grouped application details, totals, overflow, and dashboard links', async () => {
    const html = await render(React.createElement(ApplicationDigestEmail, {
      cadence: 'weekly',
      organizationName: 'Factory',
      totalApplications: 102,
      overflowCount: 2,
      dashboardUrl: 'https://careers.example.com/dashboard/applications',
      groups: [{
        jobTitle: 'Chief of Staff',
        applications: [{
          candidateName: 'Ada Lovelace',
          receivedAt: 'Jul 22, 2026 at 10:00 AM',
          status: 'Screening',
          score: 92,
          dashboardUrl: 'https://careers.example.com/dashboard/applications/app-1',
        }],
      }],
    }))

    expect(html).toContain('Weekly application summary')
    expect(html).toContain('102 applications')
    expect(html).toContain('Chief of Staff')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Screening')
    expect(html).toContain('92')
    expect(html).toContain('2 additional applications')
    expect(html).toContain('https://careers.example.com/dashboard/applications/app-1')
  })
})
