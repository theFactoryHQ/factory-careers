import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir, platform as currentPlatform } from 'node:os'

export type CliProfile = {
  baseUrl?: string
  token?: string
}

export type CliConfig = {
  activeProfile?: string
  profiles?: Record<string, CliProfile>
}

export type ResolvedProfile = {
  profileName: string
  baseUrl: string
  token?: string
}

const DEFAULT_BASE_URL = 'https://careers.thefactoryhq.com'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export function resolveConfigPath(options: {
  explicitConfig?: string
  home?: string
  platform?: NodeJS.Platform
} = {}): string {
  if (options.explicitConfig) return options.explicitConfig

  const home = options.home ?? homedir()
  const platform = options.platform ?? currentPlatform()

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'factory-careers', 'config.json')
  }

  if (platform === 'win32') {
    return join(home, 'AppData', 'Roaming', 'factory-careers', 'config.json')
  }

  return join(home, '.config', 'factory-careers', 'config.json')
}

export function readCliConfig(configPath: string): CliConfig {
  if (!existsSync(configPath)) return {}

  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as CliConfig
  return {
    activeProfile: parsed.activeProfile,
    profiles: parsed.profiles ?? {},
  }
}

export function resolveActiveProfile(options: {
  configPath: string
  profile?: string
  baseUrl?: string
}): ResolvedProfile {
  const config = readCliConfig(options.configPath)
  const profileName = options.profile || config.activeProfile || 'default'
  const profile = config.profiles?.[profileName] ?? {}

  return {
    profileName,
    baseUrl: normalizeBaseUrl(options.baseUrl || profile.baseUrl || DEFAULT_BASE_URL),
    token: profile.token,
  }
}

export function writeCliConfig(configPath: string, config: CliConfig): void {
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
}

export function saveProfile(options: {
  configPath: string
  profileName: string
  baseUrl: string
  token: string
}): CliConfig {
  const config = readCliConfig(options.configPath)
  const profiles = config.profiles ?? {}
  profiles[options.profileName] = {
    ...profiles[options.profileName],
    baseUrl: normalizeBaseUrl(options.baseUrl),
    token: options.token,
  }

  const updated: CliConfig = {
    ...config,
    activeProfile: options.profileName,
    profiles,
  }
  writeCliConfig(options.configPath, updated)
  return updated
}

export function removeProfileToken(options: {
  configPath: string
  profileName: string
  baseUrl: string
}): CliConfig {
  const config = readCliConfig(options.configPath)
  const profiles = config.profiles ?? {}
  const profile = profiles[options.profileName] ?? {}
  profiles[options.profileName] = {
    ...profile,
    baseUrl: profile.baseUrl ? normalizeBaseUrl(profile.baseUrl) : normalizeBaseUrl(options.baseUrl),
  }
  delete profiles[options.profileName].token

  const updated: CliConfig = {
    ...config,
    activeProfile: config.activeProfile || options.profileName,
    profiles,
  }
  writeCliConfig(options.configPath, updated)
  return updated
}
