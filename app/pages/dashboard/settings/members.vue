<script setup lang="ts">
import type { Component } from 'vue'
import {
  Users, UserPlus, Shield, ShieldCheck, Crown,
  MoreHorizontal, Trash2, Loader2,
  Mail, Clock, X, Check, AlertTriangle, RefreshCw,
  Link2, Copy, Eye, EyeOff, UserCheck, UserX, MessageSquare,
} from 'lucide-vue-next'

definePageMeta({})

useSeoMeta({
  title: 'Team Members — Factory Careers',
  description: 'Manage your team members and invitations',
})

const { activeOrg } = useCurrentOrg()
const { data: session } = await authClient.useSession(useFetch)
const toast = useToast()
const { allowed: canManageMembers, isLoading: isManageMembersPermissionLoading } = usePermission({ member: ['create'] })
const { allowed: canInvite } = usePermission({ invitation: ['create'] })
const { track } = useTrack()
const { allowed: canCancelInvite } = usePermission({ invitation: ['cancel'] })
const {
  listInviteLinks: fetchInviteLinksApi,
  createInviteLink: createInviteLinkApi,
  revokeInviteLink: revokeInviteLinkApi,
} = useInviteLinks()

// ─────────────────────────────────────────────
// Members list
// ─────────────────────────────────────────────
const members = ref<Array<{
  id: string
  userId: string
  role: string
  user: { name: string; email: string; image?: string }
  createdAt: Date
}>>([])
const isLoadingMembers = ref(true)
const membersError = ref('')

async function fetchMembers() {
  isLoadingMembers.value = true
  membersError.value = ''
  try {
    const result = await authClient.organization.listMembers()
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to load members'))
    members.value = (result.data?.members ?? []) as typeof members.value
  }
  catch (err: unknown) {
    membersError.value = err instanceof Error ? err.message : 'Failed to load members'
  }
  finally {
    isLoadingMembers.value = false
  }
}

onMounted(fetchMembers)

// ─────────────────────────────────────────────
// Members search & pagination
// ─────────────────────────────────────────────
const memberSearch = ref('')
const membersPerPage = 20
const visibleCount = ref(membersPerPage)

const filteredMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter(m =>
    m.user.name?.toLowerCase().includes(q)
    || m.user.email?.toLowerCase().includes(q)
    || m.role.toLowerCase().includes(q),
  )
})

const visibleMembers = computed(() => filteredMembers.value.slice(0, visibleCount.value))
const hasMoreMembers = computed(() => visibleCount.value < filteredMembers.value.length)

function showMoreMembers() {
  visibleCount.value += membersPerPage
}

// Reset visible count when search changes
watch(memberSearch, () => {
  visibleCount.value = membersPerPage
})

// ─────────────────────────────────────────────
// Invite member
// ─────────────────────────────────────────────
const showInviteForm = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<'admin' | 'member'>('member')
const isInviting = ref(false)

function resetInviteForm() {
  inviteEmail.value = ''
  inviteRole.value = 'member'
}

async function handleInvite() {
  if (!canInvite.value || !inviteEmail.value.trim()) return
  isInviting.value = true

  try {
    const email = inviteEmail.value.trim()
    const result = await authClient.organization.inviteMember({
      email: email.toLowerCase(),
      role: inviteRole.value,
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to send invitation'))
    toast.success('Invitation sent', email)
    track('member_invited')
    inviteEmail.value = ''
    inviteRole.value = 'member'
    await fetchInvitations()
  }
  catch (err: unknown) {
    toast.error('Failed to send invitation', { message: err instanceof Error ? err.message : undefined })
  }
  finally {
    isInviting.value = false
  }
}

// ─────────────────────────────────────────────
// Pending invitations
// ─────────────────────────────────────────────
const pendingInvitations = ref<Array<{
  id: string
  email: string
  role: string
  status: string
  expiresAt: Date
  inviterId: string
}>>([])
const isLoadingInvitations = ref(true)
const invitationsError = ref('')
const resendingInvitation = ref<string | null>(null)
const cancellingInvitation = ref<string | null>(null)

async function fetchInvitations() {
  isLoadingInvitations.value = true
  invitationsError.value = ''
  try {
    const result = await authClient.organization.listInvitations({
      query: {},
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to load invitations'))
    const allInvitations = (result.data ?? []) as typeof pendingInvitations.value
    pendingInvitations.value = allInvitations.filter(inv => inv.status === 'pending')
  }
  catch (err: unknown) {
    invitationsError.value = err instanceof Error ? err.message : 'Failed to load invitations'
  }
  finally {
    isLoadingInvitations.value = false
  }
}

onMounted(fetchInvitations)

async function handleResendInvitation(invitation: { id: string; email: string; role: string }) {
  resendingInvitation.value = invitation.id

  try {
    const result = await authClient.organization.inviteMember({
      email: invitation.email,
      role: invitation.role as 'admin' | 'member',
      resend: true,
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to resend invitation'))
    toast.success('Invitation resent', invitation.email)
    await fetchInvitations()
  }
  catch (err: unknown) {
    toast.error('Failed to resend invitation', { message: err instanceof Error ? err.message : undefined })
  }
  finally {
    resendingInvitation.value = null
  }
}

async function handleCancelInvitation(invitationId: string) {
  cancellingInvitation.value = invitationId

  try {
    const result = await authClient.organization.cancelInvitation({
      invitationId,
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to cancel invitation'))
    await fetchInvitations()
  }
  catch (err: unknown) {
    toast.error('Failed to cancel invitation', { message: err instanceof Error ? err.message : undefined })
  }
  finally {
    cancellingInvitation.value = null
  }
}

function isExpired(expiresAt: Date | string): boolean {
  return new Date(expiresAt) < new Date()
}

function formatExpiresAt(expiresAt: Date | string): string {
  const date = new Date(expiresAt)
  if (date < new Date()) return 'Expired'
  const diffMs = date.getTime() - Date.now()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    return `Expires in ${diffMinutes}m`
  }
  if (diffHours < 24) return `Expires in ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `Expires in ${diffDays}d`
}

// ─────────────────────────────────────────────
// Invite links (shareable)
// ─────────────────────────────────────────────
const inviteLinks = ref<InviteLink[]>([])
const isLoadingLinks = ref(true)
const linksError = ref('')
const showCreateLinkForm = ref(false)
const newLinkRole = ref<'admin' | 'member'>('member')
const newLinkMaxUses = ref<string | number>('')
const newLinkExpiresInHours = ref(168) // 7 days default
const isCreatingLink = ref(false)
const createLinkError = ref('')
const copiedLinkId = ref<string | null>(null)
const revokingLinkId = ref<string | null>(null)

async function fetchInviteLinks() {
  isLoadingLinks.value = true
  linksError.value = ''
  try {
    inviteLinks.value = await fetchInviteLinksApi()
  }
  catch (err: unknown) {
    linksError.value = err instanceof Error ? err.message : 'Failed to load invite links'
  }
  finally {
    isLoadingLinks.value = false
  }
}

onMounted(fetchInviteLinks)

async function handleCreateLink() {
  isCreatingLink.value = true
  createLinkError.value = ''

  try {
    // Vue 3 auto-coerces type="number" input values to numbers (even without .number
    // modifier), so newLinkMaxUses.value can be a number or an empty string.
    const rawMaxUses = newLinkMaxUses.value
    const maxUses = (rawMaxUses !== '' && rawMaxUses !== null)
      ? parseInt(String(rawMaxUses), 10)
      : null
    if (maxUses !== null && (isNaN(maxUses) || maxUses < 1)) {
      createLinkError.value = 'Max uses must be a positive number'
      return
    }

    await createInviteLinkApi({
      role: newLinkRole.value,
      maxUses,
      expiresInHours: newLinkExpiresInHours.value,
    })

    toast.success('Invite link created')
    showCreateLinkForm.value = false
    newLinkRole.value = 'member'
    newLinkMaxUses.value = ''
    newLinkExpiresInHours.value = 168
    await fetchInviteLinks()
  }
  catch (err: any) {
    toast.error('Failed to create invite link', { message: err?.data?.statusMessage })
  }
  finally {
    isCreatingLink.value = false
  }
}

function getInviteLinkUrl(token: string): string {
  return `${window.location.origin}/join/${token}`
}

async function copyLinkToClipboard(link: { id: string; token: string }) {
  try {
    await navigator.clipboard.writeText(getInviteLinkUrl(link.token))
    copiedLinkId.value = link.id
    setTimeout(() => { copiedLinkId.value = null }, 2000)
  }
  catch {
    // Fallback for non-secure contexts
    const textArea = document.createElement('textarea')
    textArea.value = getInviteLinkUrl(link.token)
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    copiedLinkId.value = link.id
    setTimeout(() => { copiedLinkId.value = null }, 2000)
  }
}

async function handleRevokeLink(linkId: string) {
  revokingLinkId.value = linkId

  try {
    await revokeInviteLinkApi(linkId)
    await fetchInviteLinks()
  }
  catch (err: any) {
    toast.error('Failed to revoke invite link', { message: err?.data?.statusMessage })
  }
  finally {
    revokingLinkId.value = null
  }
}

function isLinkActive(link: { expiresAt: string; maxUses: number | null; useCount: number }): boolean {
  const notExpired = new Date(link.expiresAt) > new Date()
  const notExhausted = link.maxUses === null || link.useCount < link.maxUses
  return notExpired && notExhausted
}

const expiryOptions = [
  { label: '1 hour', value: 1 },
  { label: '6 hours', value: 6 },
  { label: '24 hours', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
  { label: '14 days', value: 336 },
  { label: '30 days', value: 720 },
]

// ─────────────────────────────────────────────
// Join requests
// ─────────────────────────────────────────────
const joinRequests = ref<Array<{
  id: string
  message: string | null
  status: string
  createdAt: string
  userName: string
  userEmail: string
  userImage: string | null
}>>([])
const isLoadingJoinRequests = ref(true)
const joinRequestsError = ref('')
const approvingRequestId = ref<string | null>(null)
const rejectingRequestId = ref<string | null>(null)

async function fetchJoinRequests() {
  isLoadingJoinRequests.value = true
  joinRequestsError.value = ''
  try {
    const data = await $fetch('/api/join-requests')
    joinRequests.value = data as typeof joinRequests.value
  }
  catch (err: unknown) {
    joinRequestsError.value = err instanceof Error ? err.message : 'Failed to load join requests'
  }
  finally {
    isLoadingJoinRequests.value = false
  }
}

onMounted(fetchJoinRequests)

async function handleApproveRequest(requestId: string) {
  approvingRequestId.value = requestId

  try {
    await $fetch(`/api/join-requests/${requestId}/approve`, { method: 'POST' })
    await Promise.all([fetchJoinRequests(), fetchMembers()])
  }
  catch (err: any) {
    toast.error('Failed to approve request', { message: err?.data?.statusMessage })
  }
  finally {
    approvingRequestId.value = null
  }
}

async function handleRejectRequest(requestId: string) {
  rejectingRequestId.value = requestId

  try {
    await $fetch(`/api/join-requests/${requestId}/reject`, { method: 'POST' })
    await fetchJoinRequests()
  }
  catch (err: any) {
    toast.error('Failed to reject request', { message: err?.data?.statusMessage })
  }
  finally {
    rejectingRequestId.value = null
  }
}

// ─────────────────────────────────────────────
// Role management
// ─────────────────────────────────────────────
const activeDropdown = ref<string | null>(null)
const activeDropdownTrigger = ref<HTMLElement | null>(null)
const isUpdatingRole = ref<string | null>(null)
const isRoleMenuOpen = computed(() => activeDropdown.value !== null)
const {
  floatingStyle: roleMenuStyle,
  updateFloatingPosition: updateRoleMenuPosition,
} = useFloatingMenu({
  open: isRoleMenuOpen,
  triggerRef: activeDropdownTrigger,
  placement: 'bottom-end',
  width: 192,
  estimatedHeight: 160,
  zIndex: 90,
})

function toggleDropdown(memberId: string, event: MouseEvent) {
  if (activeDropdown.value === memberId) {
    closeDropdown()
    return
  }

  activeDropdownTrigger.value = event.currentTarget as HTMLElement
  activeDropdown.value = memberId
  nextTick(updateRoleMenuPosition)
}

function closeDropdown() {
  activeDropdown.value = null
  activeDropdownTrigger.value = null
}

async function handleUpdateRole(memberId: string, newRole: 'admin' | 'member') {
  isUpdatingRole.value = memberId

  try {
    const result = await authClient.organization.updateMemberRole({
      memberId,
      role: newRole,
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to update role'))
    await fetchMembers()
  }
  catch (err: unknown) {
    toast.error('Failed to update role', { message: err instanceof Error ? err.message : undefined })
  }
  finally {
    isUpdatingRole.value = null
    closeDropdown()
  }
}

// ─────────────────────────────────────────────
// Remove member
// ─────────────────────────────────────────────
const memberToRemove = ref<{ id: string; name: string } | null>(null)
const isRemoving = ref(false)

async function handleRemoveMember() {
  if (!memberToRemove.value) return

  // Guard: prevent removing yourself even if called programmatically
  const currentUserId = session.value?.user?.id
  const targetMember = members.value.find(m => m.id === memberToRemove.value?.id)
  if (targetMember && currentUserId && targetMember.userId === currentUserId) {
    toast.error('Cannot remove yourself', { message: 'You cannot remove yourself from the organization.' })
    return
  }

  isRemoving.value = true

  try {
    const result = await authClient.organization.removeMember({
      memberIdOrEmail: memberToRemove.value.id,
    })
    if (result.error) throw new Error(String(result.error.message ?? 'Failed to remove member'))
    memberToRemove.value = null
    await fetchMembers()
  }
  catch (err: unknown) {
    toast.error('Failed to remove member', { message: err instanceof Error ? err.message : undefined })
  }
  finally {
    isRemoving.value = false
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const roleConfig: Record<string, { label: string; color: string; bg: string; icon: Component }> = {
  owner: { label: 'Owner', color: 'text-warning-700 dark:text-warning-400', bg: 'bg-warning-50 dark:bg-warning-950', icon: Crown },
  admin: { label: 'Admin', color: 'text-brand-700 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-950', icon: ShieldCheck },
  member: { label: 'Member', color: 'text-surface-700 dark:text-surface-300', bg: 'bg-surface-100 dark:bg-surface-800', icon: Shield },
}

function getRoleConfig(role: string) {
  return roleConfig[role] ?? roleConfig.member!
}

function isCurrentUser(userId: string) {
  return session.value?.user?.id === userId
}

function getInitials(name: string | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

// Close dropdown on click outside — store reference for cleanup
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-member-actions]') && !target.closest('[data-member-role-menu]')) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="ui-settings-page">
    <!-- Page title -->
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
        Members
      </h1>
      <p class="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
        Manage your team members and invitations.
      </p>
    </div>

    <!-- Invite member section -->
    <section v-if="canInvite" class="mb-6">
      <button
        v-if="!showInviteForm"
        class="ui-button ui-button-primary py-2.5"
        @click="showInviteForm = true"
      >
        <UserPlus class="size-4" />
        Invite team member
      </button>

      <Transition
        enter-active-class="transition-all duration-200"
        leave-active-class="transition-all duration-200"
        enter-from-class="opacity-0 -translate-y-2"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="showInviteForm" class="ui-panel ui-settings-panel ui-settings-panel-body">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <UserPlus class="ui-icon-brand size-5" />
              <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Invite a team member</h3>
            </div>
            <button
              class="ui-button ui-button-ghost p-1"
              @click="showInviteForm = false; resetInviteForm()"
            >
              <X class="size-4" />
            </button>
          </div>

          <div class="flex flex-col sm:flex-row gap-3">
            <div class="flex-1">
              <label for="invite-email" class="sr-only">Email address</label>
              <input
                id="invite-email"
                v-model="inviteEmail"
                type="email"
                placeholder="colleague@company.com"
                class="ui-field"
                @keydown.enter="handleInvite"
              />
            </div>

            <FactorySelect
              v-model="inviteRole"
              class="w-36"
              :options="[
                { value: 'member', label: 'Member' },
                { value: 'admin', label: 'Admin' },
              ]"
            />

            <button
              :disabled="isInviting || !inviteEmail.trim()"
              class="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              @click="handleInvite"
            >
              <Loader2 v-if="isInviting" class="size-4 animate-spin" />
              <Mail v-else class="size-4" />
              {{ isInviting ? 'Sending…' : 'Send invite' }}
            </button>
          </div>

        </div>
      </Transition>
    </section>

    <!-- Pending invitations -->
    <section v-if="canInvite && (isLoadingInvitations || pendingInvitations.length > 0)" class="ui-panel ui-settings-panel mb-6">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-warning ui-icon-tile size-8">
            <Clock class="size-4" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Pending invitations</h2>
            <p class="text-xs text-surface-500 dark:text-surface-400">
              {{ isLoadingInvitations ? 'Loading…' : `${pendingInvitations.length} pending` }}
            </p>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isLoadingInvitations" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        <Loader2 class="size-4 animate-spin mx-auto mb-1.5" />
        Loading invitations…
      </div>

      <!-- Error state -->
      <div v-else-if="invitationsError" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        <AlertTriangle class="ui-icon-danger size-5 mx-auto mb-1.5" />
        <p class="ui-feedback-danger mx-auto">{{ invitationsError }}</p>
        <button class="ui-inline-link ui-inline-link-brand mt-1.5 text-sm" @click="fetchInvitations">
          Retry
        </button>
      </div>

      <!-- Invitations list -->
      <div v-else class="ui-list-divider">
        <div
          v-for="inv in pendingInvitations"
          :key="inv.id"
          class="ui-list-row px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
        >
          <!-- Email icon + Info -->
          <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <div class="size-9 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 dark:text-surface-500">
                <Mail class="size-4" />
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                <a
                  :href="`mailto:${inv.email}`"
                  target="_blank"
                  class="ui-inline-link ui-inline-link-brand"
                >{{ inv.email }}</a>
              </div>
              <div class="flex items-center gap-2 text-xs text-surface-400 dark:text-surface-500">
                <span
                  :class="[getRoleConfig(inv.role).bg, getRoleConfig(inv.role).color]"
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                >
                  <component :is="getRoleConfig(inv.role).icon" class="size-2.5" />
                  {{ getRoleConfig(inv.role).label }}
                </span>
                <span :class="isExpired(inv.expiresAt) ? 'ui-feedback-danger' : ''">
                  {{ formatExpiresAt(inv.expiresAt) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div v-if="canCancelInvite" class="flex items-center gap-1.5 flex-shrink-0 pl-12 sm:pl-0">
            <button
              :disabled="resendingInvitation === inv.id"
              class="ui-button ui-button-secondary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Resend invitation email"
              @click="handleResendInvitation(inv)"
            >
              <Loader2 v-if="resendingInvitation === inv.id" class="size-3 animate-spin" />
              <RefreshCw v-else class="size-3" />
              Resend
            </button>
            <button
              :disabled="cancellingInvitation === inv.id"
              class="ui-button ui-button-danger-outline px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cancel invitation"
              @click="handleCancelInvitation(inv.id)"
            >
              <Loader2 v-if="cancellingInvitation === inv.id" class="size-3 animate-spin" />
              <X v-else class="size-3" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Invite links section -->
    <section v-if="canInvite" class="ui-panel ui-settings-panel mb-6">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-8 shrink-0">
              <Link2 class="size-4" />
            </div>
            <div class="min-w-0">
              <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Invite links</h2>
              <p class="text-xs text-surface-500 dark:text-surface-400">
                Shareable links to join your organization
              </p>
            </div>
          </div>
          <button
            v-if="!showCreateLinkForm"
            class="ui-button ui-button-primary px-3 py-1.5 text-xs"
            @click="showCreateLinkForm = true"
          >
            <Link2 class="size-3.5" />
            Create link
          </button>
        </div>
      </div>

      <!-- Create link form -->
      <Transition
        enter-active-class="transition-all duration-200"
        leave-active-class="transition-all duration-200"
        enter-from-class="opacity-0 -translate-y-2"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="showCreateLinkForm" class="ui-panel-muted rounded-none border-x-0 border-t-0 px-4 sm:px-6 py-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-surface-900 dark:text-surface-100">New invite link</h3>
            <button
              class="ui-button ui-button-ghost p-1"
              @click="showCreateLinkForm = false; createLinkError = ''"
            >
              <X class="size-4" />
            </button>
          </div>

          <div class="flex flex-wrap gap-3 items-end">
            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Role</label>
              <FactorySelect
                v-model="newLinkRole"
                class="w-36"
                :options="[
                  { value: 'member', label: 'Member' },
                  { value: 'admin', label: 'Admin' },
                ]"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Expires in</label>
              <FactorySelect
                v-model="newLinkExpiresInHours"
                class="w-36"
                :options="expiryOptions.map(opt => ({ value: opt.value, label: opt.label }))"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Max uses (optional)</label>
              <input
                v-model="newLinkMaxUses"
                type="number"
                min="1"
                placeholder="Unlimited"
                class="ui-field w-28 py-1.5"
              />
            </div>

            <button
              :disabled="isCreatingLink"
              class="ui-button ui-button-primary px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              @click="handleCreateLink"
            >
              <Loader2 v-if="isCreatingLink" class="size-3.5 animate-spin" />
              Create
            </button>
          </div>

          <div v-if="createLinkError" class="ui-feedback-danger mt-2 text-xs">
            {{ createLinkError }}
          </div>
        </div>
      </Transition>

      <!-- Loading state -->
      <div v-if="isLoadingLinks" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        <Loader2 class="size-4 animate-spin mx-auto mb-1.5" />
        Loading invite links…
      </div>

      <!-- Error state -->
      <div v-else-if="linksError" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        <AlertTriangle class="ui-icon-danger size-5 mx-auto mb-1.5" />
        <p class="ui-feedback-danger mx-auto">{{ linksError }}</p>
        <button class="ui-inline-link ui-inline-link-brand mt-1.5 text-sm" @click="fetchInviteLinks">
          Retry
        </button>
      </div>

      <!-- Empty state -->
      <div v-else-if="inviteLinks.length === 0 && !showCreateLinkForm" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        No active invite links. Create one to share with your team.
      </div>

      <!-- Links list -->
      <div v-else-if="inviteLinks.length > 0" class="ui-list-divider">
        <div
          v-for="link in inviteLinks"
          :key="link.id"
          class="ui-list-row px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
          :class="{ 'opacity-50': !isLinkActive(link) }"
        >
          <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <div class="size-9 rounded-full flex items-center justify-center"
                :class="isLinkActive(link) ? 'bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'bg-surface-100 dark:bg-surface-800 text-surface-400'"
              >
                <Link2 class="size-4" />
              </div>
            </div>

            <div class="min-w-0">
              <div class="flex items-center gap-2 text-sm font-medium text-surface-900 dark:text-surface-100">
                <span
                  :class="[getRoleConfig(link.role).bg, getRoleConfig(link.role).color]"
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                >
                  <component :is="getRoleConfig(link.role).icon" class="size-2.5" />
                  {{ getRoleConfig(link.role).label }}
                </span>
                <span v-if="!isLinkActive(link)" class="ui-feedback-danger text-xs">Inactive</span>
              </div>
              <div class="flex items-center gap-3 text-xs text-surface-400 dark:text-surface-500 mt-0.5">
                <span>{{ link.useCount }}{{ link.maxUses ? `/${link.maxUses}` : '' }} uses</span>
                <span :class="isExpired(link.expiresAt) ? 'ui-feedback-danger' : ''">
                  {{ formatExpiresAt(link.expiresAt) }}
                </span>
                <span v-if="link.createdByName">by {{ link.createdByName }}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0 pl-12 sm:pl-0">
            <button
              v-if="isLinkActive(link)"
              class="ui-button ui-button-secondary px-3 py-1.5 text-xs"
              :title="copiedLinkId === link.id ? 'Copied!' : 'Copy invite link'"
              @click="copyLinkToClipboard(link)"
            >
              <Check v-if="copiedLinkId === link.id" class="ui-icon-success size-3" />
              <Copy v-else class="size-3" />
              {{ copiedLinkId === link.id ? 'Copied' : 'Copy' }}
            </button>
            <button
              :disabled="revokingLinkId === link.id"
              class="ui-button ui-button-danger-outline px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Revoke invite link"
              @click="handleRevokeLink(link.id)"
            >
              <Loader2 v-if="revokingLinkId === link.id" class="size-3 animate-spin" />
              <Trash2 v-else class="size-3" />
              Revoke
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Join requests section -->
    <section v-if="canInvite && (isLoadingJoinRequests || joinRequests.length > 0)" class="ui-panel ui-settings-panel mb-6">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex items-center gap-3">
          <div class="ui-icon-state ui-icon-state-warning ui-icon-tile size-8">
            <UserCheck class="size-4" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Join requests</h2>
            <p class="text-xs text-surface-500 dark:text-surface-400">
              {{ isLoadingJoinRequests ? 'Loading…' : `${joinRequests.length} pending request${joinRequests.length !== 1 ? 's' : ''}` }}
            </p>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isLoadingJoinRequests" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        <Loader2 class="size-4 animate-spin mx-auto mb-1.5" />
        Loading join requests…
      </div>

      <!-- Error state -->
      <div v-else-if="joinRequestsError" class="ui-empty-state px-4 sm:px-6 py-6 text-sm">
        <AlertTriangle class="ui-icon-danger size-5 mx-auto mb-1.5" />
        <p class="ui-feedback-danger mx-auto">{{ joinRequestsError }}</p>
        <button class="ui-inline-link ui-inline-link-brand mt-1.5 text-sm" @click="fetchJoinRequests">
          Retry
        </button>
      </div>

      <!-- Requests list -->
      <div v-else class="ui-list-divider">
        <div
          v-for="req in joinRequests"
          :key="req.id"
          class="ui-list-row px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
        >
          <!-- Avatar + Info -->
          <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <img
                v-if="req.userImage"
                :src="req.userImage"
                :alt="req.userName"
                class="ui-avatar size-9 object-cover"
              />
              <div v-else class="ui-avatar ui-avatar-brand size-9 text-xs">
                {{ req.userName?.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || '?' }}
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                {{ req.userName }}
              </div>
              <div class="text-xs text-surface-500 dark:text-surface-400 truncate">
                {{ req.userEmail }}
              </div>
              <div v-if="req.message" class="mt-1 text-xs text-surface-500 dark:text-surface-400 italic flex items-start gap-1">
                <MessageSquare class="size-3 mt-0.5 flex-shrink-0" />
                <span class="truncate">"{{ req.message }}"</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1.5 flex-shrink-0 pl-12 sm:pl-0">
            <button
              :disabled="approvingRequestId === req.id"
              class="ui-button ui-button-success px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Approve — adds as Member"
              @click="handleApproveRequest(req.id)"
            >
              <Loader2 v-if="approvingRequestId === req.id" class="size-3 animate-spin" />
              <UserCheck v-else class="size-3" />
              Approve
            </button>
            <button
              :disabled="rejectingRequestId === req.id"
              class="ui-button ui-button-danger-outline px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reject join request"
              @click="handleRejectRequest(req.id)"
            >
              <Loader2 v-if="rejectingRequestId === req.id" class="size-3 animate-spin" />
              <UserX v-else class="size-3" />
              Reject
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Members list -->
    <section class="ui-panel ui-settings-panel">
      <div class="ui-panel-header ui-settings-panel-header">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="ui-icon-state ui-icon-state-brand ui-icon-tile size-10 shrink-0">
              <Users class="size-5" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">Team members</h2>
              <p class="text-sm text-surface-500 dark:text-surface-400">
                {{ isLoadingMembers ? 'Loading…' : `${members.length} member${members.length !== 1 ? 's' : ''}` }}
              </p>
            </div>
          </div>
          <div v-if="!isLoadingMembers && members.length > 5" class="flex-shrink-0">
            <GooeySearchInput
              v-model="memberSearch"
              aria-label="Search members"
              placeholder="Search members…"
              reserve-expanded-space
              size="sm"
            />
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isLoadingMembers" class="ui-empty-state px-4 sm:px-6 py-8 text-sm">
        <Loader2 class="size-5 animate-spin mx-auto mb-2" />
        Loading members…
      </div>

      <!-- Error state -->
      <div v-else-if="membersError" class="ui-empty-state px-4 sm:px-6 py-8 text-sm">
        <AlertTriangle class="ui-icon-danger size-6 mx-auto mb-2" />
        <p class="ui-feedback-danger mx-auto">{{ membersError }}</p>
        <button class="ui-inline-link ui-inline-link-brand mt-2 text-sm" @click="fetchMembers">
          Retry
        </button>
      </div>

      <!-- Members list -->
      <div v-else class="ui-list-divider">
        <div
          v-for="m in visibleMembers"
          :key="m.id"
          class="ui-list-row px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
        >
          <!-- Avatar + Info row -->
          <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <img
                v-if="m.user.image"
                :src="m.user.image"
                :alt="m.user.name"
                class="ui-avatar size-10 object-cover"
              />
              <div v-else class="ui-avatar ui-avatar-brand size-10 text-sm">
                {{ getInitials(m.user.name) }}
              </div>
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                  {{ m.user.name }}
                </span>
                <span v-if="isCurrentUser(m.userId)" class="text-xs text-surface-400 dark:text-surface-500">(you)</span>
              </div>
              <div class="text-sm text-surface-500 dark:text-surface-400 truncate">
                <a
                  :href="`mailto:${m.user.email}`"
                  target="_blank"
                  class="ui-inline-link ui-inline-link-brand"
                >{{ m.user.email }}</a>
              </div>
            </div>
          </div>

          <!-- Role badge + Actions -->
          <div class="flex items-center gap-2 pl-[3.25rem] sm:pl-0 flex-shrink-0">
            <span
              :class="[getRoleConfig(m.role).bg, getRoleConfig(m.role).color]"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              <component :is="getRoleConfig(m.role).icon" class="size-3" />
              {{ getRoleConfig(m.role).label }}
            </span>

          <!-- Actions dropdown -->
          <div v-if="canManageMembers && !isCurrentUser(m.userId) && m.role !== 'owner'" class="relative" data-member-actions>
            <button
              class="ui-button ui-button-ghost p-1.5"
              @click.stop="toggleDropdown(m.id, $event)"
            >
              <MoreHorizontal class="size-4" />
            </button>

            <Teleport to="body">
              <Transition
                enter-active-class="transition-all duration-150"
                leave-active-class="transition-all duration-100"
                enter-from-class="opacity-0 scale-95"
                leave-to-class="opacity-0 scale-95"
              >
                <div
                  v-if="activeDropdown === m.id"
                  data-member-role-menu
                  class="ui-panel factory-dashboard-portal shadow-lg overflow-hidden"
                  :style="roleMenuStyle"
                >
                  <!-- Role options -->
                  <div class="py-1 border-b border-surface-100 dark:border-surface-800">
                    <div class="px-3 py-1.5 text-xs font-medium text-surface-400 dark:text-surface-500 uppercase tracking-wider">
                      Change role
                    </div>
                    <button
                      v-if="m.role !== 'admin'"
                      :disabled="isUpdatingRole === m.id"
                      class="ui-menu-action px-3 py-2 text-sm"
                      @click="handleUpdateRole(m.id, 'admin')"
                    >
                      <ShieldCheck class="ui-icon-brand size-3.5" />
                      Make admin
                    </button>
                    <button
                      v-if="m.role !== 'member'"
                      :disabled="isUpdatingRole === m.id"
                      class="ui-menu-action px-3 py-2 text-sm"
                      @click="handleUpdateRole(m.id, 'member')"
                    >
                      <Shield class="size-3.5" />
                      Make member
                    </button>
                  </div>

                  <!-- Remove -->
                  <div class="py-1">
                    <button
                      class="ui-menu-action ui-menu-action-danger px-3 py-2 text-sm"
                      @click="memberToRemove = { id: m.id, name: m.user.name }; closeDropdown()"
                    >
                      <Trash2 class="size-3.5" />
                      Remove member
                    </button>
                  </div>
                </div>
              </Transition>
            </Teleport>
          </div>

          <!-- Loading indicator for role update -->
          <div v-if="isUpdatingRole === m.id" class="flex-shrink-0">
            <Loader2 class="ui-icon-brand size-4 animate-spin" />
          </div>
          </div>
        </div>

        <!-- Show more button -->
        <div v-if="hasMoreMembers" class="px-4 sm:px-6 py-3 text-center border-t border-surface-100 dark:border-surface-800">
          <button
            class="ui-inline-link ui-inline-link-brand text-sm font-medium"
            @click="showMoreMembers"
          >
            Show {{ Math.min(membersPerPage, filteredMembers.length - visibleCount) }} more
            ({{ filteredMembers.length - visibleCount }} remaining)
          </button>
        </div>
      </div>
    </section>

    <!-- Remove member confirmation modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div v-if="memberToRemove" class="factory-dashboard-portal ui-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center" @click.self="memberToRemove = null">
          <Transition
            enter-active-class="transition-all duration-200"
            leave-active-class="transition-all duration-150"
            enter-from-class="opacity-0 scale-95"
            leave-to-class="opacity-0 scale-95"
          >
            <div v-if="memberToRemove" class="ui-modal-panel w-full max-w-md p-6">
              <div class="flex items-center gap-3 mb-4">
                <div class="ui-icon-state ui-icon-state-danger flex items-center justify-center size-10">
                  <AlertTriangle class="size-5" />
                </div>
                <div>
                  <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Remove member</h3>
                  <p class="text-sm text-surface-500 dark:text-surface-400">This action can be undone by re-inviting.</p>
                </div>
              </div>

              <p class="text-sm text-surface-600 dark:text-surface-400 mb-5">
                Are you sure you want to remove <strong class="text-surface-900 dark:text-surface-100">{{ memberToRemove.name }}</strong> from
                <strong class="text-surface-900 dark:text-surface-100">{{ activeOrg?.name }}</strong>?
                They will lose access to all organization data immediately.
              </p>

              <div class="flex items-center gap-3 justify-end">
                <button
                  class="ui-button ui-button-secondary"
                  @click="memberToRemove = null"
                >
                  Cancel
                </button>
                <button
                  :disabled="isRemoving"
                  class="ui-button ui-button-danger disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="handleRemoveMember"
                >
                  <Loader2 v-if="isRemoving" class="size-4 animate-spin" />
                  <Trash2 v-else class="size-4" />
                  {{ isRemoving ? 'Removing…' : 'Remove' }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- Permissions notice for members -->
    <div v-if="!isManageMembersPermissionLoading && !canManageMembers" class="ui-alert ui-alert-info mt-6">
      You don't have permission to manage team members. Contact an admin or owner to invite new members or change roles.
    </div>
  </div>
</template>
