import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cliRouteCoverage } from '../../packages/careers-cli/src/routeCoverage'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

function sourceFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (/\.(ts|vue)$/.test(entry.name)) files.push(path)
  }

  return files
}

describe('CLI scoring criteria parity', () => {
  const sharedScoring = read('shared/scoring-criteria.ts')
  const serverScoring = read('server/utils/ai/scoring.ts')
  const generateRoute = read('server/api/jobs/[id]/criteria/generate.post.ts')
  const jobsCommands = read('packages/careers-cli/src/commands/jobs.ts')
  const cliWorkflow = read('tests/unit/cli-job-workflow-commands.test.ts')

  it('keeps the pre-made criteria definition in the shared module only', () => {
    const definitions = ['app', 'server', 'shared']
      .flatMap(sourceFiles)
      .filter(path => /export const PREMADE_CRITERIA\s*=/.test(read(path)))

    expect(definitions).toEqual(['shared/scoring-criteria.ts'])
    expect(sharedScoring).toContain('export const PREMADE_CRITERIA =')
  })

  it('imports and re-exports the shared templates from server scoring', () => {
    expect(serverScoring).toContain("import { PREMADE_CRITERIA } from '../../../shared/scoring-criteria'")
    expect(serverScoring).toContain('export { PREMADE_CRITERIA }')
  })

  it('uses the shared templates for criteria generation responses', () => {
    expect(generateRoute).toContain('const template = PREMADE_CRITERIA[body.template]')
    expect(generateRoute).toContain("return { criteria: template, source: 'template' }")
  })

  it('maps the criteria generation route to the supported CLI command', () => {
    expect(cliRouteCoverage).toContainEqual({
      route: 'server/api/jobs/[id]/criteria/generate.post.ts',
      status: 'supported',
      command: 'jobs criteria generate',
    })
  })

  it('registers the exact criteria generation endpoint in the jobs command', () => {
    expect(jobsCommands).toContain("name: 'generate'")
    expect(jobsCommands).toContain('`/api/jobs/${encodeURIComponent(jobId)}/criteria/generate`')
  })

  it('proves the CLI preserves the canonical technical template response', () => {
    expect(cliWorkflow).toContain('PREMADE_CRITERIA.technical')
    expect(cliWorkflow).toContain("template: 'technical'")
  })
})
