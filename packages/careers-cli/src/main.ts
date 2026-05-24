import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runCli } from './program'

export async function main(argv = process.argv.slice(2)): Promise<number> {
  return runCli(argv)
}

function isDirectRun(metaUrl: string, entrypoint?: string): boolean {
  return Boolean(entrypoint) && metaUrl === pathToFileURL(resolve(entrypoint)).href
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  process.exitCode = await main()
}
