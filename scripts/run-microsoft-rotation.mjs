import { execFileSync, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import postgres from 'postgres'
import { advanceRotation, RotationError } from './microsoft-rotation.mjs'
import { protectSsoProviderRecord, revealSsoProviderRecord } from '../server/utils/ssoProviderSecrets.ts'

const origin = 'https://careers.thefactoryhq.com'
const renderOrigin = 'https://api.render.com/v1'
const graphOrigin = 'https://graph.microsoft.com/v1.0'
const upstream = 'https://github.com/theFactoryHQ/factory-careers'
const terminalDeployStatuses = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'])
const pendingDeployStatuses = new Set(['created', 'queued', 'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress'])
const authority = 'https://login.microsoftonline.com'
const audience = 'api://AzureADTokenExchange'
const calendarKey = 'MICROSOFT_CALENDAR_CLIENT_SECRET'
const expiryKey = 'MICROSOFT_CALENDAR_CREDENTIAL_EXPIRES_AT'
const credentialScope = 'https://graph.microsoft.com/.default'
const service = process.argv[2]
const apply = process.argv[3] === '--apply'
const guid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i

function requireValue(value, reason) {
  if (!value) throw new RotationError(reason)
  return value
}

function setting(name, pattern) {
  const value = process.env[name]
  requireValue(value && (!pattern || pattern.test(value)), 'Missing or invalid ' + name)
  return value
}

async function request(url, { method = 'GET', token, headers, body, label }) {
  const response = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(24_000),
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body instanceof URLSearchParams ? {} : body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body instanceof URLSearchParams ? body : body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new RotationError(label + ' returned HTTP ' + response.status)
  if (response.status === 204) return null
  return await response.json()
}

function vaultItem(id, write) {
  const vault = setting('CAREERS_ROTATION_VAULT_ID', /^[a-z0-9]{26}$/)
  const env = {
    PATH: process.env.PATH,
    OP_SERVICE_ACCOUNT_TOKEN: setting('CAREERS_ROTATION_OP_TOKEN'),
  }
  if (write) {
    // The CLI consumes a piped template. Capture both streams so credential
    // fields cannot reach the workflow log, including on a failed save.
    const result = spawnSync('sh', ['-c', 'cat | op item edit "$@"', 'op', id, '--vault', vault, '--format', 'json'], {
      input: JSON.stringify(write), encoding: 'utf8', env, timeout: 30_000,
    })
    requireValue(result.status === 0, '1Password edit failed')
  }
  try {
    return JSON.parse(execFileSync('op', ['item', 'get', id, '--vault', vault, '--format', 'json'], {
      encoding: 'utf8', env, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch {
    throw new RotationError('1Password read failed')
  }
}

function credentialField(item, label, type) {
  const fields = item.fields.filter(field => field.label === label && field.type === type)
  requireValue(fields.length === 1, 'Unexpected 1Password rotation item structure')
  return fields[0]
}

async function microsoftToken(tenant, params) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: credentialScope, ...params })
  const result = await request(authority + '/' + tenant + '/oauth2/v2.0/token', {
    method: 'POST', body, label: 'Microsoft token exchange',
  })
  return requireValue(typeof result?.access_token === 'string' && result.access_token, 'Microsoft did not return an access token')
}

async function graphAuthority(tenant) {
  const idEndpoint = new URL(setting('ACTIONS_ID_TOKEN_REQUEST_URL'))
  requireValue(idEndpoint.protocol === 'https:' && idEndpoint.hostname.endsWith('.actions.githubusercontent.com'), 'Unexpected workload identity endpoint')
  idEndpoint.searchParams.set('audience', audience)
  const assertion = await request(idEndpoint, {
    token: setting('ACTIONS_ID_TOKEN_REQUEST_TOKEN'), label: 'GitHub workload identity',
  })
  return microsoftToken(tenant, {
    client_id: setting('CAREERS_ROTATION_CLIENT_ID', guid),
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: requireValue(assertion?.value, 'GitHub workload assertion missing'),
  })
}

function envValue(data) {
  return requireValue((data.envVar ?? data).value, 'Render environment field missing')
}

async function retryProof(probe, attempts = 6) {
  for (let i = 0; ; i++) {
    try { return await probe() } catch (error) {
      if (i + 1 >= attempts) throw error
      await delay(Math.min((i + 1) * 2_000, 10_000))
    }
  }
}

async function waitForDeploy(render, id, sha) {
  for (let i = 0; i < 42; i++) {
    const result = await render('/deploys/' + id)
    const deployment = result.deploy ?? result
    if (deployment.status === 'live') {
      requireValue(deployment.commit?.id === sha, 'Unexpected Render revision became live')
      return
    }
    requireValue(!terminalDeployStatuses.has(deployment.status), 'Calendar deploy failed')
    await delay(7_000)
  }
  throw new RotationError('Calendar deploy timed out')
}

async function run() {
  requireValue(['sso', 'calendar'].includes(service) && (!process.argv[3] || apply), 'Use sso or calendar and optionally --apply')
  const tenant = setting('CAREERS_MICROSOFT_TENANT_ID', guid)
  const clientId = setting('CAREERS_MICROSOFT_CLIENT_ID', guid)
  const objectId = setting('CAREERS_MICROSOFT_APPLICATION_OBJECT_ID', guid)
  const itemId = setting('CAREERS_ROTATION_ITEM_ID', /^[a-z0-9]{26}$/)
  const lockId = 1_731_941_023
  const renderId = setting('CAREERS_ROTATION_RENDER_SERVICE_ID', /^srv-[a-z0-9]+$/)
  const renderApiKey = setting('CAREERS_ROTATION_RENDER_API_KEY')
  const render = (path, options = {}) => request(renderOrigin + '/services/' + renderId + path, {
    ...options, token: renderApiKey, label: 'Render API',
  })
  const getEnv = async name => envValue(await render('/env-vars/' + name))
  const setEnv = (name, value) => render('/env-vars/' + name, { method: 'PUT', body: { value } })
  const serviceInfo = await render('')
  requireValue(serviceInfo.repo === upstream && serviceInfo.name === 'factory-careers' && serviceInfo.branch === 'main'
    && serviceInfo.serviceDetails?.url && (await getEnv('BETTER_AUTH_URL')) === origin, 'Render production identity did not match')
  const databaseUrl = await getEnv('DATABASE_URL')
  requireValue(new URL(databaseUrl).port !== '6543', 'Rotation requires a session database connection')
  const db = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 })
  let reserved
  try {
    reserved = await db.reserve()
    const [lock] = await reserved`SELECT pg_try_advisory_lock(${lockId}) AS held`
    requireValue(lock.held, 'Another Careers credential rotation is running')
    const graphToken = await graphAuthority(tenant)
    const graph = (path, options = {}) => request(graphOrigin + '/applications/' + objectId + path, {
      ...options, token: graphToken, label: 'Entra application',
    })
    const getApplication = async () => {
      const data = await graph('?$select=id,appId,passwordCredentials')
      requireValue(data.id === objectId && data.appId === clientId, 'Entra application did not match')
      return data
    }
    const application = await getApplication()
    const rootSecret = service === 'sso' ? await getEnv('BETTER_AUTH_SECRET') : null
    if (service === 'sso') requireValue(await getEnv('SSO_PROVIDER_SECRET_STORAGE_MODE') === 'encrypted', 'SSO encrypted storage is required')
    let item = vaultItem(itemId)
    const readState = () => JSON.parse(credentialField(item, 'rotation state', 'STRING').value)
    async function saveState(state, { active, staged, previous } = {}) {
      const draft = structuredClone(item)
      credentialField(draft, 'rotation state', 'STRING').value = JSON.stringify(state)
      if (active !== undefined) {
        credentialField(draft, 'credential', 'CONCEALED').value = active
        credentialField(draft, 'secret key ID', 'STRING').value = state.current.keyId
        credentialField(draft, 'valid from', 'DATE').value = state.current.activatedAt.slice(0, 10).replaceAll('-', '')
        credentialField(draft, 'expires', 'DATE').value = state.current.expiresAt.slice(0, 10).replaceAll('-', '')
      }
      if (staged !== undefined) credentialField(draft, 'staged credential', 'CONCEALED').value = staged
      if (previous !== undefined) credentialField(draft, 'previous credential', 'CONCEALED').value = previous
      item = vaultItem(itemId, draft)
      requireValue(item.id === itemId, '1Password returned a different rotation item')
      requireValue(JSON.stringify(readState()) === JSON.stringify(state), '1Password rotation state readback failed')
      if (active !== undefined) requireValue(credentialField(item, 'credential', 'CONCEALED').value === active, '1Password active readback failed')
      if (staged !== undefined) requireValue((credentialField(item, 'staged credential', 'CONCEALED').value ?? '') === staged, '1Password staged readback failed')
      if (previous !== undefined) requireValue((credentialField(item, 'previous credential', 'CONCEALED').value ?? '') === previous, '1Password previous readback failed')
    }
    let state = readState()
    requireValue(item.id === itemId, '1Password returned a different rotation item')
    requireValue(state.service === service && state.appId === clientId && guid.test(state.current?.keyId)
      && (!state.pending?.keyId || guid.test(state.pending.keyId))
      && (!state.previous || guid.test(state.previous.keyId)), '1Password item identity did not match')
    requireValue(!(state.pending && state.previous) && state.previous?.keyId !== state.current.keyId
      && state.pending?.keyId !== state.current.keyId, 'Rotation state has conflicting keys')
    const listed = application.passwordCredentials.find(key => key.keyId === state.current.keyId)
    requireValue(listed && Date.parse(listed.endDateTime) === Date.parse(state.current.expiresAt), 'Current credential does not match Entra')
    const otherService = service === 'sso' ? 'calendar' : 'sso'
    const otherItem = vaultItem(setting('CAREERS_ROTATION_OTHER_ITEM_ID', /^[a-z0-9]{26}$/))
    const otherState = JSON.parse(credentialField(otherItem, 'rotation state', 'STRING').value)
    requireValue(otherState.service === otherService && otherState.appId === clientId && guid.test(otherState.current?.keyId),
      'Other Careers credential item did not match')
    const otherKeys = new Set([otherState.current.keyId, otherState.pending?.keyId, otherState.previous?.keyId])
    requireValue(![state.current, state.pending, state.previous].some(key => key?.keyId && otherKeys.has(key.keyId)),
      'Sign-in and calendar credentials must use separate Entra keys')
    const previousSecret = credentialField(item, 'previous credential', 'CONCEALED').value
    requireValue(Boolean(previousSecret) === Boolean(state.previous), '1Password previous credential state differs')
    const currentSecret = () => credentialField(item, 'credential', 'CONCEALED').value
    const runtimeSecret = info => info.keyId === state.current.keyId
      ? currentSecret() : credentialField(item, 'staged credential', 'CONCEALED').value

    async function readProvider(sql, lock = false) {
      const data = await sql`
        SELECT p.id, p.organization_id, p.oidc_config, m.credential_key_id
        FROM public.sso_provider p
        JOIN public.organization o ON o.id = p.organization_id
        JOIN public.sso_provider_credential_metadata m
          ON m.sso_provider_id = p.id AND m.organization_id = o.id
        WHERE o.slug = 'factory' AND p.provider_id = 'thefactoryhq-sso'
        ${lock ? sql`FOR UPDATE OF p, m` : sql``}
      `
      requireValue(data.length === 1, 'Production SSO provider did not resolve uniquely')
      const row = data[0]
      requireValue(JSON.parse(row.oidc_config)._factoryCareersClientSecretEncryption === 'v1', 'Expected encrypted OIDC record')
      const config = JSON.parse(revealSsoProviderRecord({ oidcConfig: row.oidc_config }, rootSecret).oidcConfig)
      requireValue(config.clientId === clientId
        && config.tokenEndpoint === authority + '/' + tenant + '/oauth2/v2.0/token', 'Production provider OIDC binding differed')
      return { row, config }
    }

    const matchingKeys = new Set([state.current.keyId, state.pending?.keyId])
    if (service === 'sso') {
      const { row, config } = await readProvider(reserved)
      requireValue(matchingKeys.has(row.credential_key_id) &&
        config.clientSecret === runtimeSecret({ keyId: row.credential_key_id }), 'Production SSO and 1Password do not match')
    } else {
      requireValue(await getEnv('MICROSOFT_CALENDAR_CLIENT_ID') === clientId
        && await getEnv('MICROSOFT_CALENDAR_TENANT_ID') === tenant
        && await getEnv('MICROSOFT_CALENDAR_AUTH_MODE') === 'application', 'Production calendar identity did not match')
      const configured = await getEnv(calendarKey)
      requireValue(configured === currentSecret() || (state.pending?.keyId && configured === runtimeSecret(state.pending)), 'Production calendar and 1Password do not match')
    }

    async function checkCredential(info) {
      const latest = await getApplication()
      const key = latest.passwordCredentials.find(value => value.keyId === info.keyId)
      requireValue(key && Date.parse(key.endDateTime) === Date.parse(info.expiresAt), 'Replacement metadata does not match Entra')
      const secret = requireValue(runtimeSecret(info), 'Replacement credential is missing from 1Password')
      const access = await retryProof(() => microsoftToken(tenant, { client_id: clientId, client_secret: secret }))
      if (service === 'calendar') {
        const mailbox = await getEnv('FACTORY_CAREERS_CALENDAR_EMAIL')
        requireValue(mailbox === 'interviews@thefactoryhq.com', 'Production calendar mailbox did not match')
        const calendar = await request(graphOrigin + '/users/' + encodeURIComponent(mailbox) + '/calendar?$select=canEdit', {
          token: access, label: 'Outlook mailbox check',
        })
        requireValue(calendar.canEdit === true, 'Outlook mailbox is unavailable for scheduling')
      }
      return secret
    }

    if (!apply) {
      await checkCredential(state.pending?.keyId ? state.pending : state.current)
      if (!state.pending) await proveProduction(state.current)
    }

    async function proveProduction(info) {
      const cron = await getEnv('CRON_SECRET')
      const result = await request(origin + '/api/operations/' + service + '-health', {
        method: 'POST', headers: { 'x-cron-secret': cron, 'x-fresh-probe': '1' }, label: 'Production health check',
      })
      requireValue(result.ok && (result.code === 'healthy' || /^expires_(30|14|7)d$/.test(result.code))
        && Date.parse(result.checkedAt) >= Date.parse(info.activatedAt), 'Production probe did not confirm the active credential')
    }
    const verdict = await advanceRotation(state, {
      async begin() {
        state = { ...state, pending: { startedAt: new Date().toISOString() } }
        await saveState(state)
      },
      async issue(expiresAt) {
        const result = await graph('/addPassword', {
          method: 'POST',
          body: { passwordCredential: { displayName: 'Factory Careers ' + service + ' ' + state.pending.startedAt, endDateTime: expiresAt } },
        })
        requireValue(guid.test(result.keyId) && result.secretText && result.startDateTime && result.endDateTime, 'Entra replacement receipt was incomplete')
        return { keyId: result.keyId, activatedAt: result.startDateTime, expiresAt: result.endDateTime, secret: result.secretText }
      },
      async save({ secret, ...replacement }) {
        state = { ...state, pending: replacement }
        await saveState(state, { staged: secret })
      },
      async activate(info) {
        // Reload only the metadata from the saved item. The issuance response contains the secret.
        const replacement = state.pending
        requireValue(info.keyId === replacement.keyId, 'Staged credential identity differs')
        const secret = await checkCredential(replacement)
        if (service === 'sso') {
          await reserved`BEGIN`
          try {
            const sql = reserved
            const { row, config } = await readProvider(sql, true)
            if (row.credential_key_id === replacement.keyId && config.clientSecret === secret) {
              await sql`COMMIT`
              return
            }
            requireValue(row.credential_key_id === state.current.keyId && config.clientSecret === currentSecret(), 'SSO provider changed during rotation')
            const updated = protectSsoProviderRecord({ oidcConfig: JSON.stringify({ ...config, clientSecret: secret }) }, rootSecret)
            await sql`UPDATE public.sso_provider SET oidc_config = ${updated.oidcConfig} WHERE id = ${row.id} AND organization_id = ${row.organization_id}`
            await sql`
              UPDATE public.sso_provider_credential_metadata
              SET credential_key_id = ${replacement.keyId}, expires_at = ${replacement.expiresAt},
                activated_at = ${replacement.activatedAt}, last_probed_at = NULL, last_probe_status = NULL,
                last_successful_probe_at = NULL, consecutive_transient_failures = 0, updated_at = now()
              WHERE sso_provider_id = ${row.id} AND organization_id = ${row.organization_id}
            `
            await sql`COMMIT`
          } catch (error) {
            await reserved`ROLLBACK`
            throw error
          }
          return
        }
        const configured = await getEnv(calendarKey)
        requireValue(configured === currentSecret() || configured === secret, 'Render calendar configuration changed during rotation')
        if (replacement.deployId) {
          const prior = await render('/deploys/' + replacement.deployId)
          if (!terminalDeployStatuses.has((prior.deploy ?? prior).status)) {
            await waitForDeploy(render, replacement.deployId, replacement.commit)
            return
          }
        }
        const deployments = (await render('/deploys?limit=10')).map(entry => entry.deploy)
        requireValue(!deployments.some(dep => pendingDeployStatuses.has(dep.status)), 'A Render deployment is already running')
        const live = requireValue(deployments.find(dep => dep.status === 'live'), 'No current Render build found')
        const sha = requireValue(live.commit?.id, 'Current Render commit is unknown')
        await setEnv(calendarKey, secret)
        await setEnv(expiryKey, new Date(replacement.expiresAt).toISOString())
        requireValue(await getEnv(calendarKey) === secret && Date.parse(await getEnv(expiryKey)) === Date.parse(replacement.expiresAt), 'Render calendar readback failed')
        const deploy = await render('/deploys', { method: 'POST', body: { deployMode: 'deploy_only' } })
        const deployId = requireValue((deploy.deploy ?? deploy).id, 'Render returned no deploy reference')
        state = { ...state, pending: { ...replacement, deployId, commit: sha } }
        await saveState(state)
        await waitForDeploy(render, deployId, sha)
      },
      async prove(info) {
        const secret = await checkCredential(info)
        if (service === 'sso') {
          const { row, config } = await readProvider(reserved)
          requireValue(row.credential_key_id === info.keyId && config.clientSecret === secret, 'Live SSO storage differs')
        } else {
          requireValue(await getEnv(calendarKey) === secret && Date.parse(await getEnv(expiryKey)) === Date.parse(info.expiresAt), 'Live Render calendar configuration differs')
        }
        await proveProduction(info)
      },
      async finish(replacement, retireAfter) {
        const active = runtimeSecret(replacement)
        const previous = requireValue(currentSecret(), '1Password active credential is missing')
        const { keyId, activatedAt, expiresAt } = state.pending
        state = {
          ...state, current: { keyId, activatedAt, expiresAt }, pending: null,
          previous: { ...state.current, retireAfter },
        }
        await saveState(state, { active, staged: '', previous })
      },
      async retire(old) {
        requireValue(old.keyId !== state.current.keyId && !otherKeys.has(old.keyId), 'Refusing to retire the active credential')
        const latest = await getApplication()
        if (latest.passwordCredentials.some(key => key.keyId === old.keyId)) {
          await graph('/removePassword', { method: 'POST', body: { keyId: old.keyId } })
        }
        await retryProof(async () => {
          const confirmed = await getApplication()
          requireValue(!confirmed.passwordCredentials.some(key => key.keyId === old.keyId), 'Entra retirement is not visible yet')
        })
        state = { ...state, previous: null }
        await saveState(state, { previous: '' })
      },
    }, { apply })
    console.log(service + ': ' + verdict)
  } finally {
    try { if (reserved) await reserved`SELECT pg_advisory_unlock(${lockId})` } finally {
      reserved?.release()
      await db.end({ timeout: 5 })
    }
  }
}

run().catch((error) => {
  // Only locally defined labels can be emitted. Connector exceptions can contain credentials.
  const message = error instanceof RotationError ? error.message : 'Connector request failed'
  console.error(service + ' rotation stopped. ' + message)
  process.exitCode = 1
})
