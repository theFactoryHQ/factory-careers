import type { PropertyEntry } from '~~/shared/properties'

type EntityWithProperties = {
  properties?: PropertyEntry[] | null
}

/** Read a custom property value from a list/detail entity payload. */
export function getPropertyValue(
  entity: EntityWithProperties,
  definitionId: string,
): unknown {
  return entity.properties?.find((p) => p.definition.id === definitionId)?.value ?? null
}