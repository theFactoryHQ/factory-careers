import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

export const allowedTypes = [
  'feat',
  'fix',
  'perf',
  'security',
  'docs',
  'refactor',
  'test',
  'build',
  'ci',
  'chore',
]

export function validateConventionalTitle(input) {
  const title = String(input ?? '').split(/\r?\n/, 1)[0].trim()
  const match = /^(?<type>[a-z]+)(?:\([^)]+\))?!?: (?<subject>.+)$/.exec(title)

  if (!match?.groups) {
    return {
      ok: false,
      message: 'Use Conventional Commit format, for example: fix(jobs): handle null salary range',
    }
  }

  if (!allowedTypes.includes(match.groups.type)) {
    return {
      ok: false,
      message: `Unsupported type "${match.groups.type}". Allowed types: ${allowedTypes.join(', ')}`,
    }
  }

  if (!/^[A-Za-z0-9].+$/.test(match.groups.subject)) {
    return {
      ok: false,
      message: 'The subject must start with a letter or number and not be empty.',
    }
  }

  return { ok: true }
}

function readMessageFromArgs(args) {
  const commitMessagePath = args[2]

  if (!commitMessagePath) {
    return ''
  }

  return readFileSync(commitMessagePath, 'utf8')
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  const result = validateConventionalTitle(readMessageFromArgs(argv))

  if (!result.ok) {
    console.error(`Commit message failed title lint: ${result.message}`)
    exit(1)
  }
}
