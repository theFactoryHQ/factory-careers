#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = 'server/database/migrations/'
const JOURNAL_PATH = `${MIGRATIONS_DIR}meta/_journal.json`
const SCHEMA_DIR = 'server/database/schema/'

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function parseArgs(argv) {
  const args = { baseRef: process.env.MIGRATION_DISCIPLINE_BASE_REF || 'origin/main', headRef: 'HEAD' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base-ref') args.baseRef = argv[++index]
    else if (argv[index] === '--head-ref') args.headRef = argv[++index]
    else throw new Error(`Unknown argument: ${argv[index]}`)
  }
  if (!args.baseRef || !args.headRef) throw new Error('Both --base-ref and --head-ref require values')
  return args
}

function readJsonAtRef(cwd, ref, path) {
  return JSON.parse(git(cwd, ['show', `${ref}:${path}`]))
}

function changedFiles(cwd, baseRef, headRef, path) {
  const output = git(cwd, ['diff', '--name-status', `${baseRef}..${headRef}`, '--', path])
  if (!output) return []
  return output.split('\n').map((line) => {
    const [status, ...paths] = line.split('\t')
    return { status, paths }
  })
}

function migrationTag(path) {
  return path.slice(MIGRATIONS_DIR.length, -'.sql'.length)
}

export function checkMigrationDiscipline({ cwd = process.cwd(), baseRef, headRef = 'HEAD' }) {
  const mergeBase = git(cwd, ['merge-base', baseRef, headRef])
  const migrationChanges = changedFiles(cwd, mergeBase, headRef, MIGRATIONS_DIR)
  const schemaChanges = changedFiles(cwd, mergeBase, headRef, SCHEMA_DIR)
  const errors = []

  const historicalSqlChanges = migrationChanges.filter(({ status, paths }) => {
    if (status === 'A') return false
    return paths.some(path => path.endsWith('.sql'))
  })
  if (historicalSqlChanges.length > 0) {
    errors.push(`Applied migration SQL is immutable: ${historicalSqlChanges.flatMap(change => change.paths).join(', ')}`)
  }

  const newSqlPaths = migrationChanges
    .filter(({ status, paths }) => status === 'A' && paths[0]?.endsWith('.sql'))
    .map(({ paths }) => paths[0])
    .sort()

  const baseJournal = readJsonAtRef(cwd, mergeBase, JOURNAL_PATH)
  const headJournal = readJsonAtRef(cwd, headRef, JOURNAL_PATH)
  const baseEntries = baseJournal.entries ?? []
  const headEntries = headJournal.entries ?? []

  if (headEntries.length < baseEntries.length
    || baseEntries.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(headEntries[index]))) {
    errors.push('Migration journal history is immutable; existing entries may not be changed, reordered, or removed')
  }

  const appendedEntries = headEntries.slice(baseEntries.length)
  if (schemaChanges.length > 0 && newSqlPaths.length === 0) {
    errors.push('Schema changes require a new migration SQL file and appended journal entry')
  }
  if (newSqlPaths.length > 0 && appendedEntries.length === 0) {
    errors.push('New migration SQL requires an appended journal entry')
  }

  const newTags = newSqlPaths.map(migrationTag)
  const appendedTags = appendedEntries.map(entry => entry.tag)
  if (JSON.stringify(newTags) !== JSON.stringify(appendedTags)) {
    errors.push(`New migration files must exactly match appended journal entries (files: ${newTags.join(', ') || 'none'}; journal: ${appendedTags.join(', ') || 'none'})`)
  }

  let previous = baseEntries.at(-1)
  for (const entry of appendedEntries) {
    const numericTag = Number.parseInt(String(entry.tag).slice(0, 4), 10)
    if (previous && (entry.idx !== previous.idx + 1 || entry.when <= previous.when)) {
      errors.push(`Migration journal entry ${entry.tag} must have the next index and a strictly increasing timestamp`)
    }
    if (!Number.isInteger(numericTag) || numericTag !== entry.idx) {
      errors.push(`Migration journal entry ${entry.tag} must start with its zero-padded index`)
    }
    previous = entry
  }

  return { ok: errors.length === 0, errors, mergeBase, newMigrations: newTags }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = checkMigrationDiscipline({ ...args })
  if (!result.ok) {
    console.error('Factory Careers migration discipline: FAIL')
    for (const error of result.errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`Factory Careers migration discipline: PASS (${result.newMigrations.length} new migration${result.newMigrations.length === 1 ? '' : 's'})`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
