export type CriticalDependency = 'migrations' | 'applicationDatabase' | 'storage'

const readiness: Record<CriticalDependency, boolean> = {
  migrations: false,
  applicationDatabase: false,
  storage: false,
}

export function resetDependencyReadiness(dependency?: CriticalDependency): void {
  if (dependency) {
    readiness[dependency] = false
    return
  }
  for (const key of Object.keys(readiness) as CriticalDependency[]) readiness[key] = false
}

export function markDependencyReady(dependency: CriticalDependency): void {
  readiness[dependency] = true
}

export function markDependencyFailed(dependency: CriticalDependency, _error?: unknown): void {
  readiness[dependency] = false
}

export function getDependencyReadiness(): Readonly<Record<CriticalDependency, boolean>> {
  return { ...readiness }
}
