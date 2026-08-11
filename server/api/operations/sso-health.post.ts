import { and, eq } from 'drizzle-orm'
import {
  ssoProvider,
  ssoProviderCredentialMetadata,
} from '../../database/schema'
import { requireCronSecret } from '../../utils/cronAuth'
import { db } from '../../utils/db'
import { env } from '../../utils/env'
import {
  getCachedMicrosoftSsoHealth,
  isSuccessfulMicrosoftSsoExchange,
  probeMicrosoftSsoCredential,
  type MicrosoftSsoHealthResponse,
} from '../../utils/microsoftSsoHealth'

interface ExecuteSsoHealthRouteOptions {
  providedSecret: string | undefined
  expectedSecret: string | undefined
  probe: () => Promise<MicrosoftSsoHealthResponse>
}

export async function executeSsoHealthRoute({
  providedSecret,
  expectedSecret,
  probe,
}: ExecuteSsoHealthRouteOptions): Promise<MicrosoftSsoHealthResponse> {
  requireCronSecret(providedSecret, expectedSecret)
  return await probe()
}

async function runProductionProbe(): Promise<MicrosoftSsoHealthResponse> {
  const provider = await db.query.ssoProvider.findFirst({
    where: eq(ssoProvider.providerId, env.FACTORY_CAREERS_SSO_PROVIDER_ID),
    columns: {
      id: true,
      organizationId: true,
      oidcConfig: true,
    },
  })
  const metadata = provider
    ? await db.query.ssoProviderCredentialMetadata.findFirst({
        where: and(
          eq(ssoProviderCredentialMetadata.ssoProviderId, provider.id),
          eq(ssoProviderCredentialMetadata.organizationId, provider.organizationId!),
        ),
      })
    : undefined

  const response = await probeMicrosoftSsoCredential({
    provider: provider ?? null,
    metadata: metadata ?? null,
    rootSecret: env.BETTER_AUTH_SECRET,
  })

  if (provider?.organizationId && metadata) {
    const checkedAt = new Date(response.checkedAt)
    await db.update(ssoProviderCredentialMetadata)
      .set({
        lastProbedAt: checkedAt,
        lastProbeStatus: response.code,
        consecutiveTransientFailures: response.code === 'transient_failure'
          ? metadata.consecutiveTransientFailures + 1
          : 0,
        ...(isSuccessfulMicrosoftSsoExchange(response.code)
          ? { lastSuccessfulProbeAt: checkedAt }
          : {}),
        updatedAt: checkedAt,
      })
      .where(and(
        eq(ssoProviderCredentialMetadata.ssoProviderId, provider.id),
        eq(ssoProviderCredentialMetadata.organizationId, provider.organizationId),
      ))
  }

  return response
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const response = await executeSsoHealthRoute({
    providedSecret: getHeader(event, 'x-cron-secret'),
    expectedSecret: env.CRON_SECRET,
    probe: () => getCachedMicrosoftSsoHealth(runProductionProbe),
  })
  setResponseStatus(event, response.ok ? 200 : 503)
  return response
})
