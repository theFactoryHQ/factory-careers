import { and, eq } from 'drizzle-orm'
import {
  ssoProvider,
  ssoProviderCredentialMetadata,
} from '../../database/schema'
import { requireCronSecret } from '../../utils/cronAuth'
import { db } from '../../utils/db'
import { sendSsoOperationalAlertEmail } from '../../utils/email'
import { env } from '../../utils/env'
import {
  deriveSsoHealthPersistence,
  getCachedMicrosoftSsoHealth,
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
    const persistence = deriveSsoHealthPersistence({
      previousStatus: metadata.lastProbeStatus,
      previousAlertedAt: metadata.lastAlertedAt,
      consecutiveTransientFailures: metadata.consecutiveTransientFailures,
      result: response,
      now: checkedAt,
    })
    await db.update(ssoProviderCredentialMetadata)
      .set({
        lastProbedAt: persistence.lastProbedAt,
        lastProbeStatus: persistence.lastProbeStatus,
        consecutiveTransientFailures: persistence.consecutiveTransientFailures,
        ...(persistence.lastSuccessfulProbeAt
          ? { lastSuccessfulProbeAt: persistence.lastSuccessfulProbeAt }
          : {}),
        updatedAt: checkedAt,
      })
      .where(and(
        eq(ssoProviderCredentialMetadata.ssoProviderId, provider.id),
        eq(ssoProviderCredentialMetadata.organizationId, provider.organizationId),
      ))

    if (persistence.shouldAlert && env.FACTORY_CAREERS_OPERATIONS_INBOX) {
      const sent = await sendSsoOperationalAlertEmail({
        to: env.FACTORY_CAREERS_OPERATIONS_INBOX,
        code: response.code,
        checkedAt: response.checkedAt,
      })
      if (sent) {
        await db.update(ssoProviderCredentialMetadata)
          .set({ lastAlertedAt: checkedAt, updatedAt: checkedAt })
          .where(and(
            eq(ssoProviderCredentialMetadata.ssoProviderId, provider.id),
            eq(ssoProviderCredentialMetadata.organizationId, provider.organizationId),
          ))
      }
    }
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
