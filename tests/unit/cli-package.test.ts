import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readJson(path: string): any {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

describe('CLI package distribution', () => {
  it('publishes the CLI from a dedicated @thefactory/careers-cli workspace package', () => {
    const rootPackage = readJson('package.json')
    const cliPackage = readJson('packages/careers-cli/package.json')

    expect(rootPackage.private).toBe(true)
    expect(rootPackage.workspaces).toContain('packages/careers-cli')
    expect(rootPackage.bin).toBeUndefined()

    expect(cliPackage.name).toBe('@thefactory/careers-cli')
    expect(cliPackage.private).not.toBe(true)
    expect(cliPackage.publishConfig).toMatchObject({ access: 'public' })
    expect(cliPackage.bin).toEqual({
      'factory-careers': 'bin/factory-careers.mjs',
    })
    expect(cliPackage.files).toEqual(expect.arrayContaining([
      'bin',
      'src',
      'README.md',
    ]))
    expect(cliPackage.dependencies).toMatchObject({
      commander: expect.any(String),
      tsx: expect.any(String),
    })
    expect(rootPackage.scripts['cli:pack']).toBe('npm pack --workspace @thefactory/careers-cli --dry-run')
    expect(rootPackage.scripts['cli:publish']).toBe('npm publish --workspace @thefactory/careers-cli')
    expect(existsSync(join(root, 'packages/careers-cli/bin/factory-careers.mjs'))).toBe(true)
    expect(existsSync(join(root, 'packages/careers-cli/src/program.ts'))).toBe(true)
  })

  it('documents npm install and publish commands for the dedicated CLI package', () => {
    const cliDocs = readFileSync(join(root, 'docs/CLI.md'), 'utf8')
    const packageReadme = readFileSync(join(root, 'packages/careers-cli/README.md'), 'utf8')

    for (const snippet of [
      'npm install -g @thefactory/careers-cli',
      'npm run cli:pack',
      'npm run cli:publish',
    ]) {
      expect(cliDocs, `docs/CLI.md missing ${snippet}`).toContain(snippet)
    }

    expect(packageReadme).toContain('npm install -g @thefactory/careers-cli')
  })
})
