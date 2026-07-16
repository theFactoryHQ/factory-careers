#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getReleaseNotes } from './changelog-format.mjs'

const usage = 'usage: npm run changelog:extract -- <MAJOR.MINOR.PATCH>'

function getVersion(args) {
  if (args.length !== 1 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(args[0]))
    throw new Error(usage)

  return args[0]
}

export async function main(args = process.argv.slice(2)) {
  const version = getVersion(args)
  const changelog = await readFile(join(process.cwd(), 'CHANGELOG.md'), 'utf8')
  process.stdout.write(`${getReleaseNotes(changelog, version)}\n`)
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`changelog:extract: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
