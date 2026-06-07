import { afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../packages/careers-cli/src/program'

type CliIo = {
  stdout: (value: string) => void
  stderr: (value: string) => void
}

export type CliTestHarness = {
  configPath: string
  stdout: string[]
  stderr: string[]
  fetchMock: ReturnType<typeof vi.fn>
  run: (argv: string[], stdin?: string) => Promise<number>
}

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

export function writeAuthedConfig(configPath: string, baseUrl = 'https://careers.example.com') {
  writeFileSync(configPath, JSON.stringify({
    activeProfile: 'prod',
    profiles: {
      prod: { baseUrl, token: 'secret-token' },
    },
  }))
}

export function createCliTestHarness(prefix = 'factory-careers-cli-'): CliTestHarness {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  const configPath = join(dir, 'config.json')
  writeAuthedConfig(configPath)

  const stdout: string[] = []
  const stderr: string[] = []
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()

  const io: CliIo = {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  }

  return {
    configPath,
    stdout,
    stderr,
    fetchMock,
    run: (argv, stdin) => runCli(
      [...argv, '--config', configPath],
      {
        ...io,
        fetch: fetchMock as typeof fetch,
        ...(stdin ? { stdin: async () => stdin } : {}),
      },
    ),
  }
}