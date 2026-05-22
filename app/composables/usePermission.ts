import type { statements } from '~~/shared/permissions'

/**
 * Permission descriptor — same shape as the server-side PermissionRequest.
 * Maps a resource to the actions being checked.
 *
 * Example: `{ job: ['create'] }` or `{ candidate: ['read', 'update'] }`
 */
type PermissionRequest = {
  [K in keyof typeof statements]?: ReadonlyArray<(typeof statements)[K][number]>
}

type RoleName = 'owner' | 'admin' | 'member'

type ActiveOrganizationMember = {
  userId?: string | null
  role?: string | null
  user?: {
    id?: string | null
    email?: string | null
  } | null
}

const roleNames: readonly RoleName[] = ['owner', 'admin', 'member']

function normalizeRole(value: string | null | undefined): RoleName | null {
  if (!value) return null
  return roleNames.includes(value as RoleName) ? value as RoleName : null
}

/**
 * ─────────────────────────────────────────────
 * usePermission — client-side permission gating
 * ─────────────────────────────────────────────
 *
 * Returns reactive `allowed` (boolean ref) indicating whether the
 * current user's role satisfies the given permission set.
 *
 * Uses Better Auth's `checkRolePermission` which runs synchronously
 * on the client against the AC config — no server roundtrip required.
 *
 * **Important:** client-side checks are cosmetic only.  They control
 * UI visibility (hide buttons, disable inputs).  The real enforcement
 * happens on the server via `requirePermission()`.
 *
 * Usage:
 * ```vue
 * <script setup>
 * const { allowed: canCreateJob } = usePermission({ job: ['create'] })
 * </script>
 *
 * <template>
 *   <UButton v-if="canCreateJob" @click="createJob">New Job</UButton>
 * </template>
 * ```
 */
export function usePermission(permissions: PermissionRequest) {
  const sessionState = authClient.useSession()
  const activeOrgState = authClient.useActiveOrganization()

  const role = computed<RoleName | null>(() => {
    const user = sessionState.value.data?.user
    const members = (activeOrgState.value.data?.members ?? []) as ActiveOrganizationMember[]

    const currentMember = members.find((member) => {
      if (member.userId && member.userId === user?.id) return true
      if (member.user?.id && member.user.id === user?.id) return true
      return Boolean(
        user?.email
        && member.user?.email
        && member.user.email.toLowerCase() === user.email.toLowerCase(),
      )
    })

    return normalizeRole(currentMember?.role)
  })

  const isLoading = computed(() =>
    Boolean(sessionState.value.isPending || activeOrgState.value.isPending),
  )

  const allowed = computed(() => {
    if (!role.value) return false

    return authClient.organization.checkRolePermission({
      permissions: permissions as Record<string, string[]>,
      role: role.value,
    })
  })

  return { allowed, role: readonly(role), isLoading: readonly(isLoading) }
}
