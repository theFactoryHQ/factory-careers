import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { exit } from 'node:process'

if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.log('Skipping git hook installation in CI.')
  exit(0)
}

if (!existsSync('.git')) {
  console.log('Skipping git hook installation outside a git checkout.')
  exit(0)
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  stdio: 'inherit',
})

if (result.status !== 0) {
  console.error('Failed to configure git hooks path.')
  exit(result.status ?? 1)
}

console.log('Git hooks installed from .githooks.')
