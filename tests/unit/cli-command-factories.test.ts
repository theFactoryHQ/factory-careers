import { afterEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerJsonCommand } from '../../packages/careers-cli/src/commandFactories'
import { createCliRuntime } from '../../packages/careers-cli/src/cliRuntime'
import { runCli } from '../../packages/careers-cli/src/program'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'factory-careers-cli-factories-'))
  tempDirs.push(dir)
  return dir
}

function writeAuthedConfig(configPath: string) {
  writeFileSync(configPath, JSON.stringify({
    activeProfile: 'prod',
    profiles: {
      prod: { baseUrl: 'https://careers.example.com', token: 'secret-token' },
    },
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CLI command factories', () => {
  it('registerJsonCommand requires confirmation for mutating commands', async () => {
    const program = new Command()
    const runtime = createCliRuntime({})
    registerJsonCommand(runtime, program, {
      name: 'delete-item',
      description: 'Delete an item',
      method: 'DELETE',
      path: (id) => `/api/items/${encodeURIComponent(id)}`,
      args: [{ name: 'id', description: 'Item ID' }],
      mutation: true,
      deleteAck: true,
    })

    await expect(program.parseAsync(
      ['delete-item', 'item_1', '--json'],
      { from: 'user' },
    )).rejects.toMatchObject({
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    })
  })

  it('preserves comments delete confirmation behavior through migrated commands', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const stdout: string[] = []

    const exitCode = await runCli(
      ['comments', 'delete', 'comment_1', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toMatchObject({
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    })
  })

  it('preserves email-templates delete confirmation behavior through migrated commands', async () => {
    const dir = tempDir()
    const configPath = join(dir, 'config.json')
    writeAuthedConfig(configPath)
    const stdout: string[] = []

    const exitCode = await runCli(
      ['email-templates', 'delete', 'tmpl_1', '--config', configPath, '--json'],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
    )

    expect(exitCode).toBe(1)
    expect(JSON.parse(stdout[0])).toMatchObject({
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    })
  })
})