import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('application notification worker plugin', () => {
  it('is disabled by default, enabled in production, and stops cleanly', () => {
    const envSource = read('server/utils/env.ts')
    const plugin = read('server/plugins/application-notification-worker.ts')
    const render = read('render.yaml')

    expect(envSource).toContain('APPLICATION_NOTIFICATION_WORKER_ENABLED: envFlag(false)')
    expect(plugin).toContain('env.APPLICATION_NOTIFICATION_WORKER_ENABLED')
    expect(plugin).toContain("nitroApp.hooks.hookOnce('close'")
    expect(render).toMatch(/key: APPLICATION_NOTIFICATION_WORKER_ENABLED\s+value: "true"/)
  })

  it('claims event and message work using skip-locked leases', () => {
    const queue = read('server/utils/applicationNotificationQueue.ts')
    expect(queue.match(/for\('update', \{ skipLocked: true \}\)/g)).toHaveLength(2)
    expect(queue).toContain('application-notification-message:${message.id}')
    expect(queue).toContain('DETAIL_LIMIT = 100')
    expect(queue).toContain("'empty_digest'")
    expect(queue).toContain("'subscription_inactive'")
  })
})
