import { runCli } from './program'

export async function main(argv = process.argv.slice(2)): Promise<number> {
  return runCli(argv)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main()
}
