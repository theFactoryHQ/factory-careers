import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('Docker app health checks', () => {
  it('wires the image and compose app service to the readiness endpoint', () => {
    const dockerfile = read('Dockerfile')
    const compose = read('docker-compose.yml')
    const productionCompose = read('docker-compose.production.yml')
    const workflow = read('.github/workflows/docker-readme-validation.yml')

    expect(dockerfile).toContain('HEALTHCHECK')
    expect(dockerfile).toContain('/api/readyz')
    expect(dockerfile).toContain('FROM node:22.22.0-alpine AS builder')
    expect(dockerfile).toContain('FROM node:22.22.0-alpine AS runner')

    for (const source of [compose, productionCompose]) {
      expect(source).toContain('container_name: reqcore_app')
      expect(source).toContain('healthcheck:')
      expect(source).toContain('/api/readyz')
      expect(source).toContain('start_period: 60s')
    }

    expect(workflow).toContain('App container is healthy via /api/readyz')
    expect(workflow).toContain("health=\"$(docker inspect")
  })
})
