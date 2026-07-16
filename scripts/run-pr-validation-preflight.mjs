import { spawnSync } from 'node:child_process'
import { argv, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

const productionEnv = {
  DATABASE_URL: 'postgresql://factory_app:database-password-for-ci-prod-check@db.internal:5432/factory_careers',
  BETTER_AUTH_SECRET: 'ci-production-contract-secret-with-40-characters',
  BETTER_AUTH_URL: 'https://careers.thefactory.com',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://careers.thefactory.com',
  NUXT_PUBLIC_SITE_URL: 'https://careers.thefactory.com',
  CRON_SECRET: 'ci-production-contract-cron-secret-32chars',
  S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
  S3_ACCESS_KEY: 'ci-production-access-key',
  S3_SECRET_KEY: 'ci-production-secret-key-material',
  S3_BUCKET: 'factory-careers-documents',
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: 'false',
  SMTP_HOST: 'smtp.mailprovider.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_FROM: 'noreply@thefactory.com',
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...options.env },
    input: options.input,
    shell: options.shell ?? false,
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
  })

  return result.status ?? 1
}

function commandSucceeds(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0
}

export function getFetchArgsForBaseRef(baseRef, fallbackRemote = 'origin') {
  const remoteRef = /^(?<remote>[^/\s]+)\/(?<branch>.+)$/.exec(baseRef)

  if (remoteRef?.groups) {
    const { remote, branch } = remoteRef.groups

    return [
      '--no-tags',
      remote,
      `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
    ]
  }

  if (/^refs\/heads\/.+/.test(baseRef)) {
    const branch = baseRef.replace(/^refs\/heads\//, '')

    return [
      '--no-tags',
      fallbackRemote,
      `+refs/heads/${branch}:refs/remotes/${fallbackRemote}/${branch}`,
    ]
  }

  return ['--no-tags', fallbackRemote, baseRef]
}

function getChangedFiles() {
  const baseRef = process.env.PR_PREFLIGHT_BASE_REF || 'origin/main'
  const remote = process.env.PR_PREFLIGHT_REMOTE || 'origin'

  if (!commandSucceeds('git', ['rev-parse', '--verify', baseRef])) {
    const fetchStatus = run('git', ['fetch', ...getFetchArgsForBaseRef(baseRef, remote)])

    if (fetchStatus !== 0) {
      throw new Error(`Unable to fetch ${baseRef} for CLI parity evidence.`)
    }
  }

  const result = spawnSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(`Unable to compute changed files against ${baseRef}.`)
  }

  return result.stdout
}

function runCliParityEvidence() {
  const changedFiles = getChangedFiles()

  return run('npx', ['tsx', 'scripts/cli-parity-check.ts', '--stdin'], {
    input: changedFiles,
  })
}

function runLint() {
  return run('npm', ['run', 'lint'])
}

function runCliSmokeTests() {
  for (const args of [
    ['--help'],
    ['auth', 'status', '--json'],
    ['jobs', '--help'],
    ['feedback', '--help'],
    ['system', '--help'],
  ]) {
    const status = run('./packages/careers-cli/bin/factory-careers.mjs', args)

    if (status !== 0) {
      return status
    }
  }

  return 0
}

export function getPrPreflightSteps() {
  return [
    { name: 'CLI parity evidence', aliases: ['cli-parity'], run: runCliParityEvidence },
    { name: 'Unit tests', run: () => run('npm', ['run', 'test:unit']) },
    { name: 'Lint', run: runLint },
    { name: 'Typecheck', run: () => run('npm', ['run', 'typecheck']) },
    { name: 'CLI smoke tests', run: runCliSmokeTests },
    {
      name: 'Production environment contract',
      run: () => run('npm', ['run', 'ops:validate-production-env'], { env: productionEnv }),
    },
    { name: 'Build', run: () => run('npm', ['run', 'build']) },
  ]
}

function getStepSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stepArgIndex = argv.indexOf('--step')
  const requestedStep = stepArgIndex >= 0 ? argv[stepArgIndex + 1] : ''

  if (stepArgIndex >= 0 && (!requestedStep || requestedStep.startsWith('-'))) {
    console.error('Missing value for --step. Pass a PR preflight step name or alias.')
    exit(1)
  }

  const steps = requestedStep
    ? getPrPreflightSteps().filter((step) => {
        return getStepSlug(step.name) === requestedStep || step.aliases?.includes(requestedStep)
      })
    : getPrPreflightSteps()

  if (requestedStep && steps.length === 0) {
    console.error(`Unknown PR preflight step: ${requestedStep}`)
    exit(1)
  }

  for (const step of steps) {
    console.log(`\n==> ${step.name}`)

    let status = 1

    try {
      status = step.run()
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      exit(1)
    }

    if (status !== 0) {
      console.error(`PR preflight failed at: ${step.name}`)
      exit(status)
    }
  }
}
