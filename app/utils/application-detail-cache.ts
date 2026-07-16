export type ApplicationDetailCache<T extends { id: string }> = {
  applicationId: string
  data: T
}

export function cacheApplicationDetail<T extends { id: string }>(
  applicationId: string,
  data: T,
): ApplicationDetailCache<T> | null {
  if (data.id !== applicationId) return null
  return { applicationId, data }
}

export function resolveApplicationDetail<T extends { id: string }>(
  requestedApplicationId: string,
  fetchedApplication: T | null | undefined,
  cachedApplication: ApplicationDetailCache<T> | null | undefined,
): T | null {
  if (fetchedApplication?.id === requestedApplicationId) {
    return fetchedApplication
  }

  if (
    cachedApplication?.applicationId === requestedApplicationId
    && cachedApplication.data.id === requestedApplicationId
  ) {
    return cachedApplication.data
  }

  return null
}
