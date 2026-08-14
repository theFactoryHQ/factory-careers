let ssoStorageReady = false

export function resetSsoStorageReadiness(): void {
  ssoStorageReady = false
}

export function markSsoStorageReady(): void {
  ssoStorageReady = true
}

export function markSsoStorageFailed(_error?: unknown): void {
  ssoStorageReady = false
}

export function getSsoStorageReadiness(): { ready: boolean } {
  return { ready: ssoStorageReady }
}
