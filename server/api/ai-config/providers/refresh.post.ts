import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { aiConfig } from '../../../database/schema'
import { decrypt } from '../../../utils/encryption'
import {
  getCuratedProviderRegistry,
  mergeCuratedWithDiscovered,
  refreshProviderModels,
} from '../../../utils/ai/modelCatalog'
import type { SupportedProvider } from '../../../utils/ai/provider'

const providerSchema = z.enum(['openai', 'anthropic', 'google', 'xai', 'openai_compatible'])
const refreshSchema = z.object({
  provider: providerSchema.optional(),
  force: z.boolean().optional(),
})

/**
 * POST /api/ai-config/providers/refresh
 *
 * Uses the organization's stored provider API keys server-side to refresh
 * dynamic model availability/capabilities. Raw keys never leave the server.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { aiConfig: ['update'] })
  const orgId = session.session.activeOrganizationId
  const body = await readValidatedBody(event, (value) => refreshSchema.parse(value ?? {}))
  const registry = getCuratedProviderRegistry()

  const configs = await db.query.aiConfig.findMany({
    where: eq(aiConfig.organizationId, orgId),
    columns: {
      id: true,
      provider: true,
      name: true,
      baseUrl: true,
      apiKeyEncrypted: true,
      updatedAt: true,
    },
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  })

  const refreshedProviders: Array<{
    provider: SupportedProvider
    baseUrl: string | null
    configName: string
    refreshedAt: string
    modelCount: number
  }> = []
  const errors: Array<{ provider: string, baseUrl: string | null, message: string }> = []
  const seen = new Set<string>()

  for (const config of configs) {
    const provider = config.provider as SupportedProvider
    if (!(provider in registry)) continue
    if (body.provider && body.provider !== provider) continue

    const endpointKey = `${provider}:${config.baseUrl ?? ''}`
    if (seen.has(endpointKey)) continue
    seen.add(endpointKey)

    const apiKey = decrypt(config.apiKeyEncrypted, env.BETTER_AUTH_SECRET)
    if (!apiKey) {
      errors.push({
        provider,
        baseUrl: config.baseUrl,
        message: `Could not decrypt the API key for ${config.name}. Re-enter the key and try again.`,
      })
      continue
    }

    try {
      const discovered = await refreshProviderModels(provider, {
        apiKey,
        baseUrl: config.baseUrl,
        cacheKey: `${orgId}:${endpointKey}`,
        force: body.force === true,
      })
      registry[provider] = mergeCuratedWithDiscovered(registry[provider], discovered)
      refreshedProviders.push({
        provider,
        baseUrl: config.baseUrl,
        configName: config.name,
        refreshedAt: discovered.refreshedAt,
        modelCount: discovered.models.length,
      })
    }
    catch (err: any) {
      errors.push({
        provider,
        baseUrl: config.baseUrl,
        message: err?.message ?? 'Failed to refresh this provider.',
      })
    }
  }

  if (body.provider && refreshedProviders.length === 0 && errors.length === 0) {
    errors.push({
      provider: body.provider,
      baseUrl: null,
      message: 'No saved configuration with an API key exists for this provider.',
    })
  }

  return {
    providers: registry,
    refreshedProviders,
    errors,
  }
})
