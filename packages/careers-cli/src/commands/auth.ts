import type { Command } from 'commander'
import { requestJson } from '../api'
import type { CliRuntime, GlobalOptions } from '../cliRuntime'
import { removeProfileToken, saveProfile } from '../config'
import { normalizeCliError } from '../errors'

const CLI_CLIENT_ID = 'factory-careers-cli'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

type DeviceTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

type SessionResponse = {
  user?: {
    id?: string
    email?: string
    name?: string
  }
  session?: {
    activeOrganizationId?: string
  }
}

export function registerAuthCommands(program: Command, runtime: CliRuntime): Command {
  const auth = program
    .command('auth')
    .description('Authenticate and inspect CLI session state')

  runtime.addGlobalOptions(
    auth
      .command('status')
      .description('Show active CLI authentication status'),
  ).action((options: GlobalOptions, command) => {
    const { globals, profile } = runtime.getContext(command, options)
    const result = {
      authenticated: Boolean(profile.token),
      profile: profile.profileName,
      baseUrl: profile.baseUrl,
    }

    if (globals.json) {
      runtime.writeJson(runtime.io, result)
      return
    }

    runtime.io.stdout?.(
      result.authenticated
        ? `Authenticated as profile ${result.profile} (${result.baseUrl})`
        : `Not authenticated for profile ${result.profile} (${result.baseUrl})`,
    )
  })

  runtime.addGlobalOptions(
    auth
      .command('login')
      .description('Sign in with OAuth device authorization'),
  ).action(async (options: GlobalOptions, command) => {
    const { globals, configPath, profile } = runtime.getContext(command, options)
    const fetchImpl = runtime.getFetch(runtime.io)
    const sleep = runtime.getSleep(runtime.io)
    const device = await requestJson<DeviceCodeResponse>({
      fetch: fetchImpl,
      url: `${profile.baseUrl}/api/auth/device/code`,
      body: {
        client_id: CLI_CLIENT_ID,
        scope: 'openid profile email',
      },
    })

    if (globals.json) {
      runtime.writeJson(runtime.io, {
        status: 'authorization_pending',
        profile: profile.profileName,
        verificationUri: device.verification_uri,
        verificationUriComplete: device.verification_uri_complete,
        userCode: device.user_code,
        expiresIn: device.expires_in,
        interval: device.interval,
      })
    } else {
      runtime.io.stdout?.(`Open ${device.verification_uri_complete}`)
      runtime.io.stdout?.(`Enter code ${device.user_code}`)
    }

    let intervalMs = Math.max(1, device.interval || 5) * 1000
    const expiresAt = Date.now() + (device.expires_in * 1000)

    while (Date.now() < expiresAt) {
      try {
        const token = await requestJson<DeviceTokenResponse>({
          fetch: fetchImpl,
          url: `${profile.baseUrl}/api/auth/device/token`,
          body: {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
            client_id: CLI_CLIENT_ID,
          },
        })

        saveProfile({
          configPath,
          profileName: profile.profileName,
          baseUrl: profile.baseUrl,
          token: token.access_token,
        })

        const result = {
          authenticated: true,
          profile: profile.profileName,
          baseUrl: profile.baseUrl,
        }

        if (globals.json) runtime.writeJson(runtime.io, result)
        else runtime.io.stdout?.(`Authenticated as profile ${result.profile} (${result.baseUrl})`)
        return
      } catch (err) {
        const normalized = normalizeCliError(err)
        if (normalized.code === 'authorization_pending') {
          await sleep(intervalMs)
          continue
        }
        if (normalized.code === 'slow_down') {
          intervalMs += 5000
          await sleep(intervalMs)
          continue
        }
        throw normalized
      }
    }

    throw {
      status: 408,
      code: 'DEVICE_AUTH_TIMEOUT',
      message: 'Device authorization expired before approval.',
    }
  })

  runtime.addGlobalOptions(
    auth
      .command('logout')
      .description('Remove the stored token for the active profile'),
  ).action((options: GlobalOptions, command) => {
    const { globals, configPath, profile } = runtime.getContext(command, options)
    removeProfileToken({
      configPath,
      profileName: profile.profileName,
      baseUrl: profile.baseUrl,
    })

    const result = {
      authenticated: false,
      profile: profile.profileName,
      baseUrl: profile.baseUrl,
    }

    if (globals.json) runtime.writeJson(runtime.io, result)
    else runtime.io.stdout?.(`Logged out of profile ${result.profile}`)
  })

  runtime.addGlobalOptions(
    auth
      .command('whoami')
      .description('Show the authenticated Factory Careers user'),
  ).action(async (options: GlobalOptions, command) => {
    const { globals, profile } = runtime.getContext(command, options)
    if (!profile.token) {
      throw {
        status: 401,
        code: 'NOT_AUTHENTICATED',
        message: 'Run factory-careers auth login first.',
      }
    }

    const session = await requestJson<SessionResponse>({
      fetch: runtime.getFetch(runtime.io),
      url: `${profile.baseUrl}/api/auth/get-session`,
      token: profile.token,
    })
    const result = {
      profile: profile.profileName,
      baseUrl: profile.baseUrl,
      user: session.user,
      activeOrganizationId: session.session?.activeOrganizationId,
    }

    if (globals.json) runtime.writeJson(runtime.io, result)
    else runtime.io.stdout?.(`${session.user?.name || session.user?.email || session.user?.id || 'Authenticated user'} (${profile.baseUrl})`)
  })

  return auth
}