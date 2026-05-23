import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const scanTargets = ['.env.example', 'Dockerfile', 'app', 'server']
const conflictMarkerPattern = /^(<<<<<<<|=======|>>>>>>>)( .*)?$/m

function collectFiles(target: string): string[] {
  const fullPath = join(root, target)
  if (statSync(fullPath).isFile()) return [target]
  const entries = readdirSync(fullPath, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const entryPath = join(fullPath, entry.name)
    if (entry.isDirectory()) {
      return collectFiles(relative(root, entryPath))
    }
    return entry.isFile() ? [relative(root, entryPath)] : []
  })
}

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('source hygiene', () => {
  it('contains no unresolved merge conflict markers in source and config files', () => {
    const files = scanTargets.flatMap((target) => collectFiles(target))

    const offenders = files.filter(path => conflictMarkerPattern.test(read(path)))

    expect(offenders).toEqual([])
  })
})
