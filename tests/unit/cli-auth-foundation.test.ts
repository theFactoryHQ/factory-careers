import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_FACTORY_CAREERS_CLI_CLIENT_ID,
  isFactoryCareersCliClient,
} from '../../server/utils/cliDeviceClient'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('CLI auth foundation', () => {
  it('validates only the configured Factory Careers CLI device-flow client ID', () => {
    expect(DEFAULT_FACTORY_CAREERS_CLI_CLIENT_ID).toBe('factory-careers-cli')
    expect(isFactoryCareersCliClient('factory-careers-cli')).toBe(true)
    expect(isFactoryCareersCliClient('other-client')).toBe(false)
    expect(isFactoryCareersCliClient('factory-careers-cli ')).toBe(false)
    expect(isFactoryCareersCliClient('', 'custom-cli')).toBe(false)
    expect(isFactoryCareersCliClient('custom-cli', 'custom-cli')).toBe(true)
  })

  it('enables Better Auth device authorization and bearer-token plugins', () => {
    const source = read('server/utils/auth.ts')

    expect(source).toContain('deviceAuthorization')
    expect(source).toContain('bearer')
    expect(source).toContain('verificationUri: "/device"')
    expect(source).toContain('validateFactoryCareersCliClient')
    expect(source).toContain('isFactoryCareersCliClient')
    expect(source).toContain('FACTORY_CAREERS_CLI_CLIENT_ID')
  })

  it('defines the Better Auth deviceCode table for Drizzle migrations', () => {
    const source = read('server/database/schema/auth.ts')

    for (const column of [
      'deviceCode',
      'userCode',
      'userId',
      'clientId',
      'scope',
      'status',
      'expiresAt',
      'lastPolledAt',
      'pollingInterval',
    ]) {
      expect(source, `missing deviceCode.${column}`).toContain(column)
    }

    expect(source).toContain("pgTable('device_code'")
    expect(source).toContain('device_code_device_code_idx')
    expect(source).toContain('device_code_user_code_idx')
  })

  it('adds the device authorization client plugin to the Vue auth client', () => {
    const source = read('app/utils/auth-client.ts')

    expect(source).toContain('deviceAuthorizationClient')
    expect(source).toContain('deviceAuthorizationClient()')
  })

  it('provides a user-facing device verification page', () => {
    const path = 'app/pages/device.vue'
    const source = read(path)

    expect(existsSync(join(root, path))).toBe(true)
    expect(source).toContain('authClient.device')
    expect(source).toContain('authClient.device.approve')
    expect(source).toContain('authClient.device.deny')
    expect(source).toContain('/auth/sign-in')
  })
})
