import { and, eq } from 'drizzle-orm'
import {
  organization,
  ssoProvider,
  ssoProviderCredentialMetadata,
} from '../../database/schema'
import { requireCronSecret } from '../../utils/cronAuth'
import { db } from '../../utils/db'
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
  const targetOrganization = await db.query.organization.findFirst({
    where: eq(organization.slug, env.FACTORY_ORG_SLUG),
    columns: { id: true },
  })
  const provider = targetOrganization
    ? await db.query.ssoProvider.findFirst({
        where: and(
          eq(ssoProvider.providerId, env.FACTORY_CAREERS_SSO_PROVIDER_ID),
          eq(ssoProvider.organizationId, targetOrganization.id),
        ),
        columns: {
          id: true,
          organizationId: true,
          oidcConfig: true,
        },
      })
    : undefined
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
    const organizationId = provider.organizationId
    await db.transaction(async (tx) => {
      const [currentMetadata] = await tx.select()
        .from(ssoProviderCredentialMetadata)
        .where(and(
          eq(ssoProviderCredentialMetadata.ssoProviderId, provider.id),
          eq(ssoProviderCredentialMetadata.organizationId, organizationId),
        ))
        .for('update')
        .limit(1)
      if (!currentMetadata || currentMetadata.credentialKeyId !== metadata.credentialKeyId
        || (currentMetadata.lastProbedAt && currentMetadata.lastProbedAt >= checkedAt)) return

      const persistence = deriveSsoHealthPersistence({
        consecutiveTransientFailures: currentMetadata.consecutiveTransientFailures,
        result: response,
        now: checkedAt,
      })
      const metadataWhere = and(
        eq(ssoProviderCredentialMetadata.ssoProviderId, provider.id),
        eq(ssoProviderCredentialMetadata.organizationId, organizationId),
      )
      await tx.update(ssoProviderCredentialMetadata)
        .set({
          lastProbedAt: persistence.lastProbedAt,
          lastProbeStatus: persistence.lastProbeStatus,
          consecutiveTransientFailures: persistence.consecutiveTransientFailures,
          ...(persistence.lastSuccessfulProbeAt
            ? { lastSuccessfulProbeAt: persistence.lastSuccessfulProbeAt }
            : {}),
          updatedAt: checkedAt,
        })
        .where(metadataWhere)
    })
  }

  return response
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const response = await executeSsoHealthRoute({
    providedSecret: getHeader(event, 'x-cron-secret'),
    expectedSecret: env.CRON_SECRET,
    probe: () => getHeader(event, 'x-fresh-probe') === '1'
      ? runProductionProbe()
      : getCachedMicrosoftSsoHealth(runProductionProbe),
  })
  setResponseStatus(event, response.ok ? 200 : 503)
  return response
})
