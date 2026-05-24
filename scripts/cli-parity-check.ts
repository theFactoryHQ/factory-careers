import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PARITY_SENSITIVE_PATTERNS = [
  /^server\/api\//,
  /^app\/pages\/dashboard\//,
  /^app\/components\//,
  /^app\/composables\//,
  /^shared\/(?!cli-contract|cli-schemas)/,
]

const CLI_EVIDENCE_PATTERNS = [
  /^packages\/careers-cli\//,
  /^tests\/unit\/cli-/,
  /^docs\/CLI\.md$/,
  /^shared\/cli-contract\.ts$/,
  /^shared\/cli-schemas\.ts$/,
  /^scripts\/cli-parity-check\.ts$/,
  /^\.github\/pull_request_template\.md$/,
]

export type CliParityEvaluation = {
  ok: boolean
  message: string
  paritySensitiveFiles: string[]
  evidenceFiles: string[]
}

export function evaluateCliParityEvidence(
  files: string[],
  options: { override?: boolean } = {},
): CliParityEvaluation {
  const normalizedFiles = files.map((file) => file.trim()).filter(Boolean)
  const paritySensitiveFiles = normalizedFiles.filter((file) =>
    PARITY_SENSITIVE_PATTERNS.some((pattern) => pattern.test(file)),
  )
  const evidenceFiles = normalizedFiles.filter((file) =>
    CLI_EVIDENCE_PATTERNS.some((pattern) => pattern.test(file)),
  )

  if (paritySensitiveFiles.length === 0) {
    return {
      ok: true,
      message: 'No CLI parity-sensitive files changed.',
      paritySensitiveFiles,
      evidenceFiles,
    }
  }

  if (options.override) {
    return {
      ok: true,
      message: 'CLI parity check skipped by explicit override.',
      paritySensitiveFiles,
      evidenceFiles,
    }
  }

  if (evidenceFiles.length > 0) {
    return {
      ok: true,
      message: 'CLI parity evidence found.',
      paritySensitiveFiles,
      evidenceFiles,
    }
  }

  return {
    ok: false,
    message: 'CLI parity evidence is required when portal, API, or shared workflow contracts change.',
    paritySensitiveFiles,
    evidenceFiles,
  }
}

function main(): void {
  const input = process.argv.includes('--stdin') ? readFileSync(0, 'utf8') : ''
  const override = process.env.CLI_PARITY_OVERRIDE === 'true'
  const result = evaluateCliParityEvidence(input.split(/\r?\n/), { override })

  if (!result.ok) {
    console.error(result.message)
    for (const file of result.paritySensitiveFiles) {
      console.error(`- ${file}`)
    }
    process.exit(1)
  }

  console.log(result.message)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
