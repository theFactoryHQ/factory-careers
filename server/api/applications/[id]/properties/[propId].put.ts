import { entityPropertyParamsSchema } from '../../../../utils/schemas/common'
import { setPropertyValueSchema } from '../../../../utils/schemas/property'
import { setEntityPropertyValue } from '../../../../utils/properties'

/**
 * PUT /api/applications/:id/properties/:propId
 * Set a property value for an application. Body: { value: any }.
 * Pass `null` to clear the value (the `value` key is required).
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id, propId } = await getValidatedRouterParams(event, entityPropertyParamsSchema.parse)
  const { value } = await readValidatedBody(event, setPropertyValueSchema.parse)

  const result = await setEntityPropertyValue({
    organizationId: orgId,
    entityType: 'application',
    entityId: id,
    propId,
    value,
  })

  await invalidateOrgScopedDashboardCache(event)

  return result
})