const warningCodes = new Set(['expires_30d', 'expires_14d', 'expires_7d'])
const outageCodes = new Set(['invalid_client', 'transient_failure', 'calendar_access_denied'])

export function monitorIssueChanges(issues, { service, code }) {
  if (code === 'unconfirmed' || code === 'disabled') return []
  const category = warningCodes.has(code) ? 'expiry'
    : outageCodes.has(code) ? 'outage'
    : code === 'monitor_unavailable' ? 'monitor'
    : ['expired', 'metadata_missing'].includes(code) ? 'configuration'
    : undefined

  // A passing exchange with an expiry warning also proves outage recovery.
  const resolved = code === 'healthy' ? ['outage', 'expiry', 'configuration', 'monitor']
    : category === 'expiry' ? ['outage', 'configuration', 'monitor']
    : category === 'configuration' ? ['monitor']
    : category === 'outage' ? ['monitor'] : []
  const current = issues.filter(issue => issue.service === service)
  const changes = current.filter(issue => resolved.includes(issue.category))
    .map(issue => ({ action: 'close', number: issue.number }))
  if (category && !current.some(issue => issue.category === category)) {
    changes.push({ action: 'open', service, category, code })
  }
  return changes
}

const serviceNames = {
  sso: 'Microsoft sign-in',
  calendar: 'Outlook interview calendar',
}

const notices = {
  expiry: ['Expiry warning', 'The credential still works and expires within 30 days.'],
  outage: ['Outage', 'The production Microsoft check failed.'],
  configuration: ['Credential configuration warning', 'The monitor found missing or expired credential metadata.'],
  monitor: ['Monitor unavailable', 'The production check could not be reached or returned an unexpected response.'],
}

const validCodes = new Set([
  'healthy', 'disabled', 'invalid_client', 'transient_failure', 'metadata_missing',
  'expires_30d', 'expires_14d', 'expires_7d', 'expired', 'calendar_access_denied',
])

async function getCode(base, secret, service) {
  try {
    const response = await fetch(new URL('/api/operations/' + service + '-health', base), {
      method: 'POST',
      headers: { 'x-cron-secret': secret, 'x-fresh-probe': '1' },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (![200, 503].includes(response.status)) return 'monitor_unavailable'
    const data = await response.json()
    return validCodes.has(data?.code) ? data.code : 'monitor_unavailable'
  } catch {
    return 'monitor_unavailable'
  }
}

export async function probeMonitorService(base, secret, service, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const first = await getCode(base, secret, service)
  if (first !== 'transient_failure' && first !== 'monitor_unavailable') return first
  await sleep(60_000)
  const second = await getCode(base, secret, service)
  if (second !== first && ['transient_failure', 'monitor_unavailable'].includes(second)) return 'unconfirmed'
  return second
}

export async function reconcileMonitorIssues(github, context, results, { base, secret, warn }) {
  const repo = context.repo
  const label = 'incident:sso'
  const listed = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'open', labels: label, per_page: 100 })
  const issues = listed.flatMap(issue => {
    if (issue.pull_request) return []
    const match = issue.body?.match(/<!-- factory-careers-microsoft:(sso|calendar):(outage|expiry|configuration|monitor) -->/)
    if (match) return [{ service: match[1], category: match[2], number: issue.number, githubIssue: issue }]
    if (issue.body?.includes('<!-- factory-careers-sso-health -->')) {
      return [{ service: 'sso', category: /Stable status: expires_\d+d/.test(issue.body) ? 'expiry' : 'outage', number: issue.number }]
    }
    return []
  })
  const changes = results.flatMap(result => monitorIssueChanges(issues, result))
  if (changes.some(change => change.action === 'open')) {
    try {
      await github.rest.issues.createLabel({ ...repo, name: label, color: 'B60205', description: 'Factory Careers Microsoft integration monitoring' })
    } catch (error) {
      if (error.status !== 422) throw error
    }
  }
  const pending = issues.filter(issue => issue.githubIssue && !issue.githubIssue.body.includes('<!-- notice delivered -->'))
  for (const change of changes) {
    if (change.action === 'close') continue
    const [kind, message] = notices[change.category]
    const { data: githubIssue } = await github.rest.issues.create({
      ...repo,
      title: kind + ' · Factory Careers ' + serviceNames[change.service],
      body: [
        '<!-- factory-careers-microsoft:' + change.service + ':' + change.category + ' -->',
        message, 'Status: ' + change.code,
        'Run: ' + context.serverUrl + '/' + repo.owner + '/' + repo.repo + '/actions/runs/' + context.runId,
      ].join('\n\n'),
      labels: [label],
    })
    pending.push({ ...change, githubIssue })
  }
  const failed = new Set()
  for (const { githubIssue: issue, service, category } of pending) {
    const age = Date.now() - Date.parse(issue.created_at)
    if (!Number.isFinite(age) || age >= 23 * 3_600_000) {
      failed.add(issue.number)
      warn('Notice delivery needs review for incident #' + issue.number)
      continue
    }
    try {
      const response = await fetch(new URL('/api/operations/microsoft-notice', base), {
        method: 'POST',
        headers: { 'x-cron-secret': secret, 'content-type': 'application/json' },
        body: JSON.stringify({ issue: issue.number, service, category, checkedAt: issue.created_at }),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok || !(await response.json())?.ok) throw Error('Notice was not accepted')
      await github.rest.issues.update({ ...repo, issue_number: issue.number, body: issue.body + '\n\n<!-- notice delivered -->' })
    } catch {
      failed.add(issue.number)
      warn('Notice delivery incomplete for incident #' + issue.number)
    }
  }
  for (const change of changes.filter(item => item.action === 'close')) {
    if (!failed.has(change.number)) {
      await github.rest.issues.update({ ...repo, issue_number: change.number, state: 'closed' })
    }
  }
  if (failed.size) throw Error('Some Microsoft notices still require delivery')
}
