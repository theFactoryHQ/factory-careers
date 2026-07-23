import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FACTORY_CAREERS_NEW_ISSUE_URL,
  FACTORY_CAREERS_RELEASES_URL,
  FACTORY_CAREERS_REPOSITORY_URL,
} from '../../shared/project-links'

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(path)
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.vue'))) return [path]
    return []
  })
}

describe('Factory Careers project links', () => {
  it('exports the canonical repository, issue, and release URLs', () => {
    expect(FACTORY_CAREERS_REPOSITORY_URL).toBe('https://github.com/theFactoryHQ/factory-careers')
    expect(FACTORY_CAREERS_NEW_ISSUE_URL).toBe('https://github.com/theFactoryHQ/factory-careers/issues/new')
    expect(FACTORY_CAREERS_RELEASES_URL).toBe('https://github.com/theFactoryHQ/factory-careers/releases')
  })

  it('does not reference the stale repository owner in live app source', () => {
    const staleReferences = collectSourceFiles(join(process.cwd(), 'app'))
      .filter(path => readFileSync(path, 'utf8').includes('github.com/caffeinebounce/factory-careers'))
      .map(path => path.slice(process.cwd().length + 1))

    expect(staleReferences).toEqual([])
  })
})
