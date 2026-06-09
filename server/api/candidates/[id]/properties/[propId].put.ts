import { entityPropertyParamsSchema } from '../../../../utils/schemas/common'
import { setPropertyValueSchema } from '../../../../utils/schemas/property'
import { setEntityPropertyValue } from '../../../../utils/properties'

/**
 * PUT /api/candidates/:id/properties/:propId
 * Set a property value for a candidate. Body: { value: any }. Passing null clears.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id, propId } = await getValidatedRouterParams(event, entityPropertyParamsSchema.parse)
  const { value } = await readValidatedBody(event, setPropertyValueSchema.parse)

  const result = await setEntityPropertyValue({
    organizationId: orgId,
    entityType: 'candidate',
    entityId: id,
    propId,
    value,
  })

  await invalidateOrgScopedDashboardCache(event)

  return result
})