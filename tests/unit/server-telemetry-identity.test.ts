import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Factory Careers server telemetry identity', () => {
  const loggerSource = readProjectFile('server/utils/logger.ts')
  const posthogSource = readProjectFile('server/utils/posthog.ts')

  it('uses the Factory Careers service name for OpenTelemetry resources', () => {
    expect(loggerSource).toMatch(/const FACTORY_CAREERS_SERVICE_NAME = ['"]factory-careers['"]/)
    expect(loggerSource).toMatch(/['"]service\.name['"]:\s*FACTORY_CAREERS_SERVICE_NAME/)
    expect(loggerSource).not.toMatch(/['"]service\.name['"]:\s*['"]reqcore['"]/)
  })

  it('uses the Factory Careers service name for the OpenTelemetry logger scope', () => {
    expect(loggerSource).toMatch(/logs\.getLogger\(FACTORY_CAREERS_SERVICE_NAME\)/)
    expect(loggerSource).not.toMatch(/logs\.getLogger\(['"]reqcore['"]\)/)
  })

  it('identifies server PostHog events as Factory Careers', () => {
    expect(posthogSource).toMatch(/\$app_name:\s*['"]factory-careers['"]/)
    expect(posthogSource).not.toMatch(/\$app_name:\s*['"]reqcore['"]/)
  })

  it('preserves the durable PostHog compatibility cookie lookup', () => {
    expect(loggerSource).toContain("getCookie(event, 'ph_reqcore_posthog')")
  })
})
