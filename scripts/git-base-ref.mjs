import { spawnSync } from 'node:child_process'

function runGit(args, message, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })

  if (result.error)
    throw new Error(`${message}: ${result.error.message}`)

  if (result.status !== 0) {
    const detail = result.stderr.trim()
    throw new Error(detail ? `${message}: ${detail}` : message)
  }

  return result.stdout
}

function hasCommit(ref, cwd) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    cwd,
    encoding: 'utf8',
  })

  if (result.error)
    throw new Error(`Unable to inspect base ref ${ref}: ${result.error.message}`)

  return result.status === 0
}

function getConfiguredRemotes(cwd) {
  return new Set(runGit(['remote'], 'Unable to list configured Git remotes', cwd).split('\n').filter(Boolean))
}

function isFullObjectId(ref) {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(ref)
}

function getFetchPlan(baseRef, fallbackRemote, cwd) {
  if (isFullObjectId(baseRef)) {
    return {
      args: ['--no-tags', fallbackRemote, baseRef],
      candidates: [baseRef, 'FETCH_HEAD'],
    }
  }

  const explicitBranch = /^refs\/heads\/(.+)$/.exec(baseRef)
  if (explicitBranch) {
    const branch = explicitBranch[1]
    return {
      args: [
        '--no-tags',
        fallbackRemote,
        `+refs/heads/${branch}:refs/remotes/${fallbackRemote}/${branch}`,
      ],
      candidates: [`refs/remotes/${fallbackRemote}/${branch}`],
    }
  }

  const configuredRemotes = getConfiguredRemotes(cwd)
  const slashIndex = baseRef.indexOf('/')
  const possibleRemote = slashIndex > 0 ? baseRef.slice(0, slashIndex) : ''
  const qualifiedRemote = configuredRemotes.has(possibleRemote) ? possibleRemote : null
  const remote = qualifiedRemote || fallbackRemote
  const branch = qualifiedRemote ? baseRef.slice(slashIndex + 1) : baseRef

  return {
    args: [
      '--no-tags',
      remote,
      `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
    ],
    candidates: [`refs/remotes/${remote}/${branch}`],
  }
}

export function getFetchArgsForBaseRef(baseRef, fallbackRemote = 'origin', options = {}) {
  return getFetchPlan(baseRef, fallbackRemote, options.cwd).args
}

export function resolveBaseRef(baseRef, fallbackRemote = 'origin', options = {}) {
  if (hasCommit(baseRef, options.cwd))
    return baseRef

  const plan = getFetchPlan(baseRef, fallbackRemote, options.cwd)
  runGit(
    ['fetch', ...plan.args],
    `Unable to fetch ${baseRef}; set PR_PREFLIGHT_BASE_REF to a reachable base ref`,
    options.cwd,
  )

  for (const candidate of plan.candidates) {
    if (hasCommit(candidate, options.cwd))
      return candidate
  }

  throw new Error(`Fetched ${baseRef}, but Git still cannot resolve the fetched commit`)
}
