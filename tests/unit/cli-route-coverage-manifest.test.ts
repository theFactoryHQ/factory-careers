import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { cliRouteCoverage } from '../../packages/careers-cli/src/routeCoverage'

const root = process.cwd()

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : []
  })
}

function normalize(path: string): string {
  return path.split('\\').join('/')
}

describe('CLI route coverage manifest', () => {
  it('requires every server API route to have an explicit CLI parity decision', () => {
    const apiRoutes = walk(join(root, 'server/api'))
      .map((path) => normalize(relative(root, path)))
      .sort()
    const manifestRoutes = cliRouteCoverage.map((entry) => entry.route).sort()

    expect(manifestRoutes.filter((route) => !apiRoutes.includes(route))).toEqual([])
    expect(apiRoutes.filter((route) => !manifestRoutes.includes(route))).toEqual([])
  })

  it('documents a command for supported routes and a reason for excluded routes', () => {
    const docs = readFileSync(join(root, 'docs/CLI.md'), 'utf8')

    for (const entry of cliRouteCoverage) {
      if (entry.status === 'supported') {
        expect(entry.command, `${entry.route} missing command`).toBeTruthy()
        expect(docs, `docs/CLI.md missing ${entry.command}`).toContain(entry.command)
      }
      else {
        expect(entry.reason, `${entry.route} missing exclusion reason`).toBeTruthy()
      }
    }
  })
})
