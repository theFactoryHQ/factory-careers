<script setup lang="ts">
import {
  ShieldCheck, Plus, Trash2, Loader2, Check, X, AlertTriangle,
  ExternalLink, Copy, Globe, KeyRound, Lock, CircleHelp,
} from 'lucide-vue-next'
import {
  normalizeSignupDomain,
  SIGNUP_ALLOWED_DOMAINS_MAX,
} from '~~/shared/signup-domains'

definePageMeta({})

useSeoMeta({
  title: 'Single Sign-On — Factory Careers',
  description: 'Configure enterprise SSO for your organization',
})

const { allowed: canManageSso, role: currentOrgRole } = usePermission({ organization: ['update'] })
const { track } = useTrack()
const { signupAllowedDomains, updateSettings } = useOrgSettings()
const toast = useToast()
const canManageSignupDomains = computed(() => currentOrgRole.value === 'owner')
const config = useRuntimeConfig()
const requestUrl = useRequestURL()

// ─────────────────────────────────────────────
// Fetch existing SSO providers
// ─────────────────────────────────────────────
const {
  data: providers,
  status: fetchStatus,
  refresh: refreshProviders,
} = useFetch<Array<{
  id: string
  providerId: string
  issuer: string
  domain: string
  organizationId: string
}>>('/api/sso/providers', {
  default: () => [],
})

const hasProvider = computed(() => (providers.value?.length ?? 0) > 0)

// ─────────────────────────────────────────────
// Registration form
// ─────────────────────────────────────────────
const showForm = ref(false)
const isRegistering = ref(false)
const formError = ref('')

const form = reactive({
  providerId: '',
  issuer: '',
  domain: '',
  clientId: '',
  clientSecret: '',
})

// ─────────────────────────────────────────────
// Signup domain allowlist
// ─────────────────────────────────────────────
const localSignupAllowedDomains = ref<string[]>([])
const newSignupDomain = ref('')
const isSavingDomains = ref(false)
const domainSaveError = ref('')
const signupDomainPolicyTooltip = 'Domains must match a configured SSO provider or an organization-level calendar integration. Only owners can save changes.'

watch(signupAllowedDomains, (domains) => {
  localSignupAllowedDomains.value = [...domains].sort((a, b) => a.localeCompare(b))
}, { immediate: true })

const parsedSignupAllowedDomains = computed(() => {
  const domains = localSignupAllowedDomains.value.map(normalizeSignupDomain).filter((domain): domain is string => !!domain)

  return Array.from(new Set(domains)).sort((a, b) => a.localeCompare(b))
})

const normalizedNewSignupDomain = computed(() => normalizeSignupDomain(newSignupDomain.value))

const invalidSignupDomains = computed(() =>
  localSignupAllowedDomains.value.filter(domain => !normalizeSignupDomain(domain)),
)

const hasTooManySignupDomains = computed(() =>
  localSignupAllowedDomains.value.length > SIGNUP_ALLOWED_DOMAINS_MAX,
)

const addSignupDomainError = computed(() => {
  const candidate = newSignupDomain.value.trim()
  if (!candidate) return ''
  if (!normalizedNewSignupDomain.value) return `Invalid domain: ${candidate}`
  if (parsedSignupAllowedDomains.value.includes(normalizedNewSignupDomain.value)) return 'Domain already added'
  if (parsedSignupAllowedDomains.value.length >= SIGNUP_ALLOWED_DOMAINS_MAX) return `Add ${SIGNUP_ALLOWED_DOMAINS_MAX} or fewer domains.`
  return ''
})

const canAddSignupDomain = computed(() =>
  canManageSignupDomains.value && !!normalizedNewSignupDomain.value && !addSignupDomainError.value,
)

function handleAddSignupDomain() {
  domainSaveError.value = ''

  if (!canAddSignupDomain.value || !normalizedNewSignupDomain.value) return

  localSignupAllowedDomains.value = [...parsedSignupAllowedDomains.value, normalizedNewSignupDomain.value]
  newSignupDomain.value = ''
}

function handleRemoveSignupDomain(domain: string) {
  domainSaveError.value = ''
  localSignupAllowedDomains.value = parsedSignupAllowedDomains.value.filter(item => item !== domain)
}

async function handleSaveSignupDomains() {
  if (!canManageSignupDomains.value) return

  domainSaveError.value = ''

  if (invalidSignupDomains.value.length > 0) {
    domainSaveError.value = `Invalid domain: ${invalidSignupDomains.value[0]}`
    return
  }

  if (hasTooManySignupDomains.value) {
    domainSaveError.value = `Add ${SIGNUP_ALLOWED_DOMAINS_MAX} or fewer domains.`
    return
  }

  isSavingDomains.value = true

  try {
    await updateSettings({
      signupAllowedDomains: parsedSignupAllowedDomains.value,
    })
    track('signup_domain_allowlist_saved', { domain_count: parsedSignupAllowedDomains.value.length })
    toast.success('Signup domain allowlist saved')
  }
  catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string }
    domainSaveError.value = fetchErr.data?.statusMessage ?? fetchErr.message ?? 'Failed to save signup domain allowlist'
  }
  finally {
    isSavingDomains.value = false
  }
}

function getOriginFromUrl(value: unknown) {
  const url = String(value ?? '').trim()
  if (!url) return ''

  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

const siteOrigin = computed(() =>
  requestUrl.origin || getOriginFromUrl(config.public.factoryCareersUrl) || getOriginFromUrl(config.public.siteUrl),
)

function resetForm() {
  form.providerId = ''
  form.issuer = ''
  form.domain = ''
  form.clientId = ''
  form.clientSecret = ''
  formError.value = ''
}

/**
 * Auto-suggest providerId from the domain entered.
 * e.g. "acme.com" → "acme-sso"
 */
watch(() => form.domain, (domain) => {
  if (!form.providerId && domain) {
    const slug = domain.split('.')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''
    if (slug) form.providerId = `${slug}-sso`
  }
})

async function handleRegister() {
  if (!canManageSso.value) return

  formError.value = ''
  isRegistering.value = true

  try {
    await $fetch('/api/sso/providers', {
      method: 'POST',
      body: {
        providerId: form.providerId.trim().toLowerCase(),
        issuer: form.issuer.trim(),
        domain: form.domain.trim().toLowerCase(),
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret.trim(),
      },
    })

    track('sso_provider_registered')
    toast.success('SSO provider registered', 'Your team can now sign in with their corporate credentials.')
    resetForm()
    showForm.value = false
    await refreshProviders()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string }
    formError.value = fetchErr.data?.statusMessage ?? fetchErr.message ?? 'Failed to register SSO provider'
  } finally {
    isRegistering.value = false
  }
}

// ─────────────────────────────────────────────
// Delete provider
// ─────────────────────────────────────────────
const deletingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)

async function handleDelete(id: string) {
  if (!canManageSso.value) return

  deletingId.value = id
  try {
    await $fetch(`/api/sso/providers/${id}`, { method: 'DELETE' })
    track('sso_provider_deleted')
    toast.success('SSO provider removed')
    confirmDeleteId.value = null
    await refreshProviders()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string }; message?: string }
    formError.value = fetchErr.data?.statusMessage ?? fetchErr.message ?? 'Failed to remove SSO provider'
  } finally {
    deletingId.value = null
  }
}

// ─────────────────────────────────────────────
// Copy callback URL
// ─────────────────────────────────────────────
const copiedProviderId = ref<string | null>(null)

function getCallbackUrl(providerId: string) {
  return `${siteOrigin.value}/api/auth/sso/callback/${providerId}`
}

async function copyCallbackUrl(providerId: string) {
  try {
    await navigator.clipboard.writeText(getCallbackUrl(providerId))
    copiedProviderId.value = providerId
    setTimeout(() => { copiedProviderId.value = null }, 2000)
  } catch {
    // Fallback for non-HTTPS environments
  }
}
</script>

<template>
  <div class="ui-settings-page">
    <div class="ui-settings-page-header">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-100">
        Single Sign-On
      </h1>
      <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
        Manage trusted identity domains, SSO providers, and work-account access.
      </p>
    </div>

    <Transition name="fade">
      <div
        v-if="formError"
        class="ui-alert ui-alert-danger mb-4 flex items-center gap-3"
      >
        <AlertTriangle class="size-4 shrink-0" />
        <p class="flex-1">
          {{ formError }}
        </p>
        <button class="text-danger-400 hover:text-danger-600 dark:hover:text-danger-200" @click="formError = ''">
          <X class="size-4" />
        </button>
      </div>
    </Transition>

    <!-- Loading state -->
    <div v-if="fetchStatus === 'pending'" class="flex items-center gap-3 py-12 justify-center">
      <Loader2 class="size-5 animate-spin text-surface-400" />
      <span class="text-sm text-surface-400">Loading SSO configuration…</span>
    </div>

    <template v-else>
      <!-- Signup domain allowlist -->
      <section class="ui-panel ui-settings-panel mb-6">
        <div class="ui-panel-header ui-settings-panel-header">
          <div class="flex items-center gap-3">
            <ShieldCheck class="size-5 text-brand-400 shrink-0" />
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  Signup domain allowlist
                </h2>
                <button
                  type="button"
                  class="inline-flex size-6 items-center justify-center rounded-full text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200"
                  :title="signupDomainPolicyTooltip"
                  :aria-label="signupDomainPolicyTooltip"
                >
                  <CircleHelp class="size-4" />
                </button>
              </div>
              <p class="text-xs text-surface-500 dark:text-surface-400">
                Allow known work email domains to create user accounts after the domain is proven by SSO or calendar.
              </p>
            </div>
          </div>
        </div>

        <div class="ui-settings-panel-body space-y-3">
          <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="handleAddSignupDomain">
            <label for="signup-allowed-domain-input" class="sr-only">Add signup domain</label>
            <input
              id="signup-allowed-domain-input"
              v-model="newSignupDomain"
              :disabled="!canManageSignupDomains"
              class="ui-field h-10 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="example.com"
              inputmode="url"
              autocomplete="off"
              aria-label="Add signup domain"
            >
            <button
              type="submit"
              :disabled="!canAddSignupDomain"
              class="ui-button ui-button-secondary h-10 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus class="size-4" />
              Add domain
            </button>
          </form>
          <p v-if="addSignupDomainError" class="text-xs text-danger-500 dark:text-danger-400">
            {{ addSignupDomainError }}
          </p>
          <div
            class="min-h-11 rounded-lg border border-surface-200 bg-surface-50/70 p-2 dark:border-surface-800 dark:bg-surface-900/50"
            aria-label="Signup domain allowlist"
          >
            <div v-if="parsedSignupAllowedDomains.length" class="flex flex-wrap gap-2">
              <span
                v-for="domain in parsedSignupAllowedDomains"
                :key="domain"
                class="inline-flex h-7 items-center gap-1.5 rounded-full border border-surface-200 bg-white px-2.5 text-xs font-medium text-surface-700 shadow-sm dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200"
              >
                <Lock class="size-3 text-surface-400" />
                <span>{{ domain }}</span>
                <button
                  v-if="canManageSignupDomains"
                  type="button"
                  class="-mr-1 inline-flex size-5 items-center justify-center rounded-full text-surface-400 transition-colors hover:bg-surface-100 hover:text-danger-500 dark:hover:bg-surface-700"
                  :aria-label="`Remove ${domain}`"
                  @click="handleRemoveSignupDomain(domain)"
                >
                  <X class="size-3" />
                </button>
              </span>
            </div>
            <p v-else class="px-1 py-1.5 text-sm text-surface-400 dark:text-surface-500">
              No domains added
            </p>
          </div>
          <p class="text-xs text-surface-400 dark:text-surface-500">
            Matching email domains can create a user account, but organization access still requires SSO provisioning, an invitation, or approval.
          </p>
          <p v-if="invalidSignupDomains.length" class="text-xs text-danger-500 dark:text-danger-400">
            Invalid domain: {{ invalidSignupDomains[0] }}
          </p>
          <p v-if="hasTooManySignupDomains" class="text-xs text-danger-500 dark:text-danger-400">
            Add {{ SIGNUP_ALLOWED_DOMAINS_MAX }} or fewer domains.
          </p>
          <div class="flex items-center gap-3 pt-1">
            <button
              type="button"
              :disabled="!canManageSignupDomains || isSavingDomains || invalidSignupDomains.length > 0 || hasTooManySignupDomains"
              class="ui-button ui-button-primary disabled:opacity-60 disabled:cursor-not-allowed"
              @click="handleSaveSignupDomains"
            >
              <Loader2 v-if="isSavingDomains" class="size-4 animate-spin" />
              <Check v-else class="size-4" />
              {{ isSavingDomains ? 'Saving…' : 'Save domains' }}
            </button>
          </div>
          <div v-if="domainSaveError" class="ui-alert ui-alert-danger">
            {{ domainSaveError }}
          </div>
          <div v-if="!canManageSignupDomains" class="ui-alert ui-alert-info">
            Only organization owners can manage signup domain allowlists.
          </div>
        </div>
      </section>

      <!-- Existing providers -->
      <div v-if="hasProvider" class="space-y-3 mb-6">
        <div
          v-for="provider in providers"
          :key="provider.id"
          class="ui-panel ui-settings-panel"
        >
          <div class="ui-settings-panel-body flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <ShieldCheck class="size-4 text-emerald-500 shrink-0" />
                <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                  {{ provider.providerId }}
                </h3>
                <span class="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Active
                </span>
              </div>
              <div class="space-y-1 text-xs text-surface-500 dark:text-surface-400">
                <p class="flex items-center gap-1.5">
                  <Globe class="size-3" />
                  <span>Domain: <span class="font-medium text-surface-700 dark:text-surface-300">{{ provider.domain }}</span></span>
                </p>
                <p class="flex items-center gap-1.5">
                  <KeyRound class="size-3" />
                  <span>Issuer: <span class="font-mono text-surface-600 dark:text-surface-400">{{ provider.issuer }}</span></span>
                </p>
              </div>

              <!-- Callback URL helper -->
              <div class="ui-panel-muted mt-3 px-3 py-2">
                <p class="text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">
                  Redirect URI (add this in your IdP):
                </p>
                <div class="flex items-center gap-2">
                  <code class="text-xs font-mono text-surface-500 dark:text-surface-400 break-all flex-1">
                    {{ getCallbackUrl(provider.providerId) }}
                  </code>
                  <button
                    class="ui-button ui-button-ghost shrink-0 p-1"
                    title="Copy callback URL"
                    @click="copyCallbackUrl(provider.providerId)"
                  >
                    <Check v-if="copiedProviderId === provider.providerId" class="size-3.5 text-emerald-500" />
                    <Copy v-else class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Delete button -->
            <div v-if="canManageSso" class="shrink-0">
              <template v-if="confirmDeleteId === provider.id">
                <div class="flex items-center gap-1">
                  <button
                    class="ui-button ui-button-danger-outline px-2 py-1 text-xs disabled:opacity-50"
                    :disabled="deletingId === provider.id"
                    @click="handleDelete(provider.id)"
                  >
                    <Loader2 v-if="deletingId === provider.id" class="size-3 animate-spin" />
                    <span v-else>Confirm</span>
                  </button>
                  <button
                    class="ui-button ui-button-secondary px-2 py-1 text-xs"
                    @click="confirmDeleteId = null"
                  >
                    Cancel
                  </button>
                </div>
              </template>
              <button
                v-else
                class="ui-button ui-button-ghost p-1.5 hover:text-danger-500"
                title="Remove SSO provider"
                @click="confirmDeleteId = provider.id"
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!showForm"
        class="ui-empty-panel ui-empty-panel-dashed p-8"
      >
        <div class="ui-icon-state ui-icon-state-brand ui-icon-tile mx-auto size-12 mb-3">
          <ShieldCheck class="size-6" />
        </div>
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-1">
          No SSO provider configured
        </h3>
        <p class="text-xs text-surface-500 dark:text-surface-400 mb-4 max-w-sm mx-auto">
          Connect your corporate identity provider so your team can sign in with their work accounts — no separate passwords needed.
        </p>
        <button
          v-if="canManageSso"
          class="ui-button ui-button-primary px-3.5 py-2"
          @click="showForm = true"
        >
          <Plus class="size-4" />
          Add SSO Provider
        </button>
      </div>

      <!-- Add another provider (when one already exists) -->
      <div v-if="hasProvider && !showForm && canManageSso" class="mb-6">
        <button
          class="ui-button ui-button-secondary px-3.5 py-2"
          @click="showForm = true"
        >
          <Plus class="size-4" />
          Add another provider
        </button>
      </div>

      <!-- Registration form -->
      <Transition name="fade">
        <div v-if="showForm" class="ui-panel ui-settings-panel">
          <div class="ui-panel-header ui-settings-panel-header">
            <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
              Register OIDC SSO Provider
            </h3>
          </div>

          <form class="ui-settings-panel-body space-y-4" @submit.prevent="handleRegister">
            <!-- Domain -->
            <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
              <span>Email domain <span class="text-danger-500">*</span></span>
              <input
                v-model="form.domain"
                type="text"
                placeholder="company.com"
                required
                class="ui-field"
              />
              <span class="text-xs text-surface-400">Users with this email domain will be routed to this SSO provider.</span>
            </label>

            <!-- Issuer URL -->
            <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
              <span>Issuer URL <span class="text-danger-500">*</span></span>
              <input
                v-model="form.issuer"
                type="url"
                placeholder="https://your-org.okta.com"
                required
                class="ui-field font-mono text-xs"
              />
              <span class="text-xs text-surface-400">
                The OIDC issuer URL. Factory Careers will auto-discover endpoints from
                <code class="text-xs">/.well-known/openid-configuration</code>.
              </span>
            </label>

            <!-- Provider ID -->
            <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
              <span>Provider ID <span class="text-danger-500">*</span></span>
              <input
                v-model="form.providerId"
                type="text"
                placeholder="company-sso"
                required
                pattern="^[a-z0-9-]+$"
                class="ui-field"
              />
              <span class="text-xs text-surface-400">A unique slug for this provider. Lowercase letters, numbers, and hyphens only.</span>
            </label>

            <!-- Client ID -->
            <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
              <span>Client ID <span class="text-danger-500">*</span></span>
              <input
                v-model="form.clientId"
                type="text"
                placeholder="Paste from your IdP"
                required
                autocomplete="off"
                class="ui-field font-mono text-xs"
              />
            </label>

            <!-- Client Secret -->
            <label class="flex flex-col gap-1 text-sm font-medium text-surface-700 dark:text-surface-300">
              <span>Client Secret <span class="text-danger-500">*</span></span>
              <input
                v-model="form.clientSecret"
                type="password"
                placeholder="Paste from your IdP"
                required
                autocomplete="off"
                class="ui-field"
              />
              <span class="text-xs text-surface-400">Stored encrypted. Never exposed in the UI after saving.</span>
            </label>

            <!-- Actions -->
            <div class="flex items-center gap-3 pt-2">
              <button
                type="submit"
                :disabled="isRegistering"
                class="ui-button ui-button-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Loader2 v-if="isRegistering" class="size-4 animate-spin" />
                <ShieldCheck v-else class="size-4" />
                {{ isRegistering ? 'Verifying & registering…' : 'Register SSO Provider' }}
              </button>
              <button
                type="button"
                class="ui-button ui-button-secondary"
                @click="showForm = false; resetForm()"
              >
                Cancel
              </button>
            </div>
          </form>

          <!-- Setup guide -->
          <div class="mx-4 mb-4 border border-white/10 bg-white/[0.025] p-4 sm:mx-6 sm:mb-6 sm:p-5">
            <div class="mb-4 flex items-start justify-between gap-4">
              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wide text-white/72">
                  Quick setup guide
                </h4>
                <p class="mt-1 text-xs text-white/42">
                  Configure the matching OIDC app in your identity provider before registering this provider.
                </p>
              </div>
            </div>

            <ol class="grid gap-3 text-xs text-white/62">
              <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
                <span class="flex size-6 items-center justify-center border border-white/12 bg-black text-[10px] font-semibold text-white/58">1</span>
                <span class="pt-0.5">Create an OIDC application in your identity provider.</span>
              </li>
              <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
                <span class="flex size-6 items-center justify-center border border-white/12 bg-black text-[10px] font-semibold text-white/58">2</span>
                <span class="min-w-0">
                  Set the <strong class="font-semibold text-white/78">Redirect URI</strong> to
                  <code class="mt-1 block overflow-x-auto border border-white/10 bg-black px-2 py-1.5 font-mono text-[11px] text-white/72">{{ `${siteOrigin}/api/auth/sso/callback/{provider-id}` }}</code>
                </span>
              </li>
              <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
                <span class="flex size-6 items-center justify-center border border-white/12 bg-black text-[10px] font-semibold text-white/58">3</span>
                <span class="pt-0.5">Copy the <strong class="font-semibold text-white/78">Client ID</strong> and <strong class="font-semibold text-white/78">Client Secret</strong> into the form above.</span>
              </li>
              <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
                <span class="flex size-6 items-center justify-center border border-white/12 bg-black text-[10px] font-semibold text-white/58">4</span>
                <span class="pt-0.5">Enter the <strong class="font-semibold text-white/78">Issuer URL</strong>; Factory Careers will auto-discover the OIDC endpoints.</span>
              </li>
            </ol>

            <div class="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <a
                href="https://developer.okta.com/docs/guides/sign-into-web-app-redirect/node-express/main/"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-8 items-center gap-1.5 border border-white/10 px-2.5 text-xs font-medium text-brand-300 no-underline transition-colors hover:border-brand-500/45 hover:bg-brand-500/12 hover:text-white"
              >
                Okta guide <ExternalLink class="size-3" />
              </a>
              <a
                href="https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-8 items-center gap-1.5 border border-white/10 px-2.5 text-xs font-medium text-brand-300 no-underline transition-colors hover:border-brand-500/45 hover:bg-brand-500/12 hover:text-white"
              >
                Azure AD guide <ExternalLink class="size-3" />
              </a>
              <a
                href="https://support.google.com/a/answer/60224"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-8 items-center gap-1.5 border border-white/10 px-2.5 text-xs font-medium text-brand-300 no-underline transition-colors hover:border-brand-500/45 hover:bg-brand-500/12 hover:text-white"
              >
                Google Workspace guide <ExternalLink class="size-3" />
              </a>
            </div>
          </div>
        </div>
      </Transition>

      <!-- How it works -->
      <div v-if="!hasProvider" class="ui-panel-muted mt-8 p-5">
        <h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3">
          How Enterprise SSO works
        </h3>
        <div class="space-y-3 text-xs text-surface-500 dark:text-surface-400">
          <div class="flex gap-3">
            <div class="flex items-center justify-center size-6 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0">1</div>
            <p>You register your company's identity provider (IdP) — Okta, Azure AD, Google Workspace, or any OIDC-compliant provider.</p>
          </div>
          <div class="flex gap-3">
            <div class="flex items-center justify-center size-6 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0">2</div>
            <p>Team members visit the sign-in page and enter their work email. Factory Careers detects the email domain and redirects to your IdP.</p>
          </div>
          <div class="flex gap-3">
            <div class="flex items-center justify-center size-6 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0">3</div>
            <p>After authenticating with the IdP, users are automatically provisioned into your organization as members — no invitation needed.</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
