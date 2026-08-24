#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = 'server/database/migrations/'
const JOURNAL_PATH = `${MIGRATIONS_DIR}meta/_journal.json`
const SNAPSHOT_DIR = `${MIGRATIONS_DIR}meta/`
const SCHEMA_DIR = 'server/database/schema/'
const SNAPSHOT_BASELINE_TAG = '0066_current_schema_snapshot'
const SNAPSHOT_BASELINE_INDEX = 66
const SNAPSHOT_LEGACY_PREDECESSOR_INDEX = 34
const SNAPSHOT_OBJECT_FIELDS = ['tables', 'enums', 'schemas', 'sequences', 'roles', 'policies', 'views', '_meta']

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

function snapshotPath(index) {
  return `${SNAPSHOT_DIR}${String(index).padStart(4, '0')}_snapshot.json`
}

function isSnapshotPath(path) {
  return path.startsWith(SNAPSHOT_DIR) && path.endsWith('_snapshot.json')
}

function snapshotIndex(path) {
  const match = path.match(/\/(\d{4})_snapshot\.json$/)
  return match ? Number.parseInt(match[1], 10) : null
}

function snapshotPathsAtRef(cwd, ref) {
  const output = git(cwd, ['ls-tree', '-r', '--name-only', ref, '--', SNAPSHOT_DIR])
  if (!output) return []
  return output
    .split('\n')
    .filter(isSnapshotPath)
    .map(path => ({ path, index: snapshotIndex(path) }))
    .filter(snapshot => snapshot.index !== null)
    .sort((left, right) => left.index - right.index)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDrizzlePostgresSnapshot(value) {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.prevId === 'string'
    && value.prevId.length > 0
    && value.version === '7'
    && value.dialect === 'postgresql'
    && SNAPSHOT_OBJECT_FIELDS.every(field => isRecord(value[field]))
}

function pathExistsAtRef(cwd, ref, path) {
  try {
    git(cwd, ['cat-file', '-e', `${ref}:${path}`])
    return true
  }
  catch {
    return false
  }
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

  const historicalSnapshotChanges = migrationChanges.filter(({ status, paths }) => {
    return status !== 'A' && paths.some(isSnapshotPath)
  })
  if (historicalSnapshotChanges.length > 0) {
    errors.push(`Migration snapshot history is immutable: ${historicalSnapshotChanges.flatMap(change => change.paths).join(', ')}`)
  }

  const newSqlPaths = migrationChanges
    .filter(({ status, paths }) => status === 'A' && paths[0]?.endsWith('.sql'))
    .map(({ paths }) => paths[0])
    .sort()
  const newSnapshotPaths = migrationChanges
    .filter(({ status, paths }) => status === 'A' && paths[0] && isSnapshotPath(paths[0]))
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

  const baselineEntry = headEntries.find(entry => entry.tag === SNAPSHOT_BASELINE_TAG)
  if (baselineEntry && baselineEntry.idx !== SNAPSHOT_BASELINE_INDEX) {
    errors.push(`Snapshot enforcement baseline ${SNAPSHOT_BASELINE_TAG} must remain at journal index ${SNAPSHOT_BASELINE_INDEX}`)
  }
  if (!baselineEntry && (appendedEntries.length > 0 || newSnapshotPaths.length > 0)) {
    errors.push(`New migrations require the fixed snapshot enforcement baseline ${SNAPSHOT_BASELINE_TAG}`)
  }

  const expectedSnapshotPaths = baselineEntry
    ? appendedEntries
        .filter(entry => entry.idx >= SNAPSHOT_BASELINE_INDEX)
        .map(entry => snapshotPath(entry.idx))
        .sort()
    : []
  if (JSON.stringify(newSnapshotPaths) !== JSON.stringify(expectedSnapshotPaths)) {
    errors.push(`New migration snapshots must exactly match appended journal entries (snapshots: ${newSnapshotPaths.join(', ') || 'none'}; expected: ${expectedSnapshotPaths.join(', ') || 'none'})`)
  }

  const newestEntry = headEntries.at(-1)
  if (baselineEntry && newestEntry?.idx >= SNAPSHOT_BASELINE_INDEX) {
    const newestSnapshotPath = snapshotPath(newestEntry.idx)
    if (!pathExistsAtRef(cwd, headRef, newestSnapshotPath)) {
      errors.push(`Newest migration journal entry ${newestEntry.tag} requires snapshot ${newestSnapshotPath}`)
    }
  }

  const snapshots = []
  for (const { path, index } of snapshotPathsAtRef(cwd, headRef)) {
    let value
    try {
      value = readJsonAtRef(cwd, headRef, path)
    }
    catch {
      errors.push(`Invalid migration snapshot JSON: ${path}`)
      continue
    }
    if (!isDrizzlePostgresSnapshot(value)) {
      errors.push(`Migration snapshot ${path} must be a Drizzle PostgreSQL snapshot with IDs and object maps`)
      continue
    }
    snapshots.push({ path, index, value })
  }

  const snapshotIds = new Map()
  for (const snapshot of snapshots) {
    const duplicatePath = snapshotIds.get(snapshot.value.id)
    if (duplicatePath) {
      errors.push(`Migration snapshot IDs must be unique: ${duplicatePath} and ${snapshot.path}`)
    }
    else {
      snapshotIds.set(snapshot.value.id, snapshot.path)
    }
  }

  const snapshotsByIndex = new Map(snapshots.map(snapshot => [snapshot.index, snapshot]))
  const baselineSnapshot = snapshotsByIndex.get(SNAPSHOT_BASELINE_INDEX)
  const legacyPredecessor = snapshotsByIndex.get(SNAPSHOT_LEGACY_PREDECESSOR_INDEX)
  if (baselineSnapshot) {
    if (!legacyPredecessor) {
      errors.push('Snapshot 0066 must bridge the fixed legacy gap from snapshot 0034')
    }
    else if (baselineSnapshot.value.prevId !== legacyPredecessor.value.id) {
      errors.push(`Migration snapshot ${baselineSnapshot.path} must reference previous snapshot ID ${legacyPredecessor.value.id}`)
    }
  }

  for (const snapshot of snapshots.filter(snapshot => snapshot.index > SNAPSHOT_BASELINE_INDEX)) {
    const previousSnapshot = snapshotsByIndex.get(snapshot.index - 1)
    if (!previousSnapshot) {
      errors.push(`Snapshots after 0066 must be consecutive before ${snapshot.path}`)
    }
    else if (snapshot.value.prevId !== previousSnapshot.value.id) {
      errors.push(`Migration snapshot ${snapshot.path} must reference previous snapshot ID ${previousSnapshot.value.id}`)
    }
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
