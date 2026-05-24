import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('CLI documentation', () => {
  it('documents setup, auth, automation, security, and command coverage', () => {
    expect(existsSync(join(root, 'docs/CLI.md'))).toBe(true)

    const cliDocs = read('docs/CLI.md')
    const readme = read('README.md')

    expect(readme).toContain('[Factory Careers CLI](docs/CLI.md)')

    for (const snippet of [
      'factory-careers auth login',
      'OAuth 2.0 Device Authorization',
      'Authorization: Bearer',
      '--json',
      '--stdin',
      '--yes',
      '--no-input',
      'explicit automation intent',
      'use `--stdin`',
      'Exit Codes',
      'Secrets',
      '0600',
      'Agent Usage',
      'Command Coverage',
      'jobs questions',
      'jobs criteria',
      'candidates',
      'applications',
      'documents',
      'documents preview',
      'documents parse-all',
      'interviews',
      'comments',
      'feedback',
      'system',
      'source-tracking',
      'email-templates',
      'properties',
      'org',
      'org search',
      'org invite-links accept',
      'org join-requests create',
      'org sso-providers',
      'calendar',
      'ai-config',
      'dashboard',
      'chatbot',
      'chatbot upload',
      'public jobs',
      'Not CLI Surfaced',
      'provider callbacks',
      'health and readiness probes',
      'destructive maintenance',
      'public tracking redirects',
      'demo-only auth helpers',
    ]) {
      expect(cliDocs, `docs/CLI.md missing ${snippet}`).toContain(snippet)
    }
  })
})
