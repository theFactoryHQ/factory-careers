import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAttributionSummary,
  buildChannelFunnel,
  buildStatusFunnel,
  computeTrackingLinkCvr,
} from '../../server/utils/sourceAnalytics'
import { toChatbotAgent, toChatbotFolder } from '../../server/utils/chatbotDto'
import {
  getAppVersion,
  isNewerVersion,
  resetAppVersionCacheForTests,
} from '../../server/utils/appVersion'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('sourceAnalytics helpers', () => {
  it('builds channel funnels with zeroed pipeline defaults', () => {
    expect(buildChannelFunnel([
      { channel: 'linkedin', status: 'new', count: 3 },
      { channel: 'linkedin', status: 'hired', count: 1 },
      { channel: 'referral', status: 'screening', count: 2 },
    ])).toEqual({
      linkedin: { new: 3, screening: 0, interview: 0, offer: 0, hired: 1, rejected: 0 },
      referral: { new: 0, screening: 2, interview: 0, offer: 0, hired: 0, rejected: 0 },
    })
  })

  it('builds single-link status funnels', () => {
    expect(buildStatusFunnel([
      { status: 'new', count: 4 },
      { status: 'rejected', count: 2 },
    ])).toEqual({
      new: 4,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 2,
    })
  })

  it('computes attribution summary and tracking-link CVR', () => {
    expect(buildAttributionSummary(75, 25)).toEqual({
      totalTracked: 75,
      totalUntracked: 25,
      attributionRate: 75,
    })
    expect(computeTrackingLinkCvr(200, 40)).toBe(20)
    expect(computeTrackingLinkCvr(0, 10)).toBe(0)
  })
})

describe('chatbot DTO mappers', () => {
  const now = new Date('2026-06-07T12:00:00.000Z')

  it('maps folder rows to shared DTOs', () => {
    expect(toChatbotFolder({
      id: 'folder_1',
      organizationId: 'org_1',
      userId: 'user_1',
      name: 'Hiring',
      icon: 'Folder',
      position: 2,
      createdAt: now,
      updatedAt: now,
    })).toEqual({
      id: 'folder_1',
      name: 'Hiring',
      icon: 'Folder',
      position: 2,
      createdAt: now.getTime(),
    })
  })

  it('maps agent rows to shared DTOs', () => {
    expect(toChatbotAgent({
      id: 'agent_1',
      organizationId: 'org_1',
      userId: 'user_1',
      name: 'Sourcer',
      description: 'Finds candidates',
      icon: 'Sparkles',
      systemPrompt: 'You are a sourcer.',
      temperature: '0.75',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })).toEqual({
      id: 'agent_1',
      name: 'Sourcer',
      description: 'Finds candidates',
      icon: 'Sparkles',
      systemPrompt: 'You are a sourcer.',
      temperature: 0.75,
      isDefault: true,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    })
  })
})

describe('appVersion helpers', () => {
  it('reads the current app version from package.json', async () => {
    resetAppVersionCacheForTests()
    const version = await getAppVersion()
    const pkg = JSON.parse(readProjectFile('package.json'))

    expect(version).toBe(pkg.version)
    expect(await getAppVersion()).toBe(version)
  })

  it('compares semver strings', () => {
    expect(isNewerVersion('1.2.3', '1.2.4')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false)
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
  })
})

describe('epic 7 PR2 route migrations', () => {
  it('routes source analytics through shared helpers', () => {
    for (const path of [
      'server/api/source-tracking/stats.get.ts',
      'server/api/tracking-links/[id]/stats.get.ts',
    ]) {
      const source = readProjectFile(path)
      expect(source, path).toContain('sourceAnalytics')
      expect(source, path).not.toContain('emptyPipelineCounts')
    }
  })

  it('routes calendar OAuth through shared helpers', () => {
    for (const path of [
      'server/api/calendar/google/connect.get.ts',
      'server/api/calendar/google/callback.get.ts',
      'server/api/calendar/microsoft/connect.get.ts',
      'server/api/calendar/microsoft/callback.get.ts',
    ]) {
      const source = readProjectFile(path)
      expect(source, path).toContain('calendarOAuth')
    }
  })

  it('routes chatbot folder and agent handlers through DTO mappers', () => {
    for (const path of [
      'server/api/chatbot/folders/index.get.ts',
      'server/api/chatbot/folders/index.post.ts',
      'server/api/chatbot/folders/[id].patch.ts',
      'server/api/chatbot/agents/index.get.ts',
      'server/api/chatbot/agents/index.post.ts',
      'server/api/chatbot/agents/[id].patch.ts',
    ]) {
      const source = readProjectFile(path)
      expect(source, path).toContain('chatbotDto')
      expect(source, path).toContain('toChatbot')
    }
  })

  it('routes activity-log list handler through fetchActivityLogEntries', () => {
    const source = readProjectFile('server/api/activity-log/index.get.ts')
    expect(source).toContain('fetchActivityLogEntries')
    expect(source).not.toContain('paginationOffset')
  })

  it('routes updates handlers through getAppVersion', () => {
    for (const path of [
      'server/api/updates/version.get.ts',
      'server/api/updates/changelog.get.ts',
      'server/api/updates/system.get.ts',
      'server/api/updates/apply.post.ts',
    ]) {
      const source = readProjectFile(path)
      expect(source, path).toContain('getAppVersion')
      expect(source, path).not.toMatch(/readFile\([\s\S]*package\.json/)
    }
  })
})