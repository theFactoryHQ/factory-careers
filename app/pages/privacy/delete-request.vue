<script setup lang="ts">
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-vue-next'

definePageMeta({
  layout: 'public',
  publicWide: true,
  publicPinnedNav: true,
  publicFlushTop: true,
})

useSeoMeta({
  title: 'Request Data Deletion',
  description: 'Submit a CCPA privacy deletion request for Factory Careers applicant data.',
  robots: 'index, follow',
})

const form = reactive({
  requesterName: '',
  requesterEmail: '',
  stateOfResidence: '',
  requestContext: '',
  details: '',
  website: '',
})

const isSubmitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')

const fieldClass = 'h-12 w-full border border-white/16 bg-white/[0.04] px-4 text-sm text-white outline-none transition-colors placeholder:text-white/34 focus:border-brand-500 focus:bg-white/[0.06] focus:ring-1 focus:ring-brand-500/70'
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/58'
const legendClass = 'mb-6 text-lg font-light leading-tight tracking-normal text-white'
const states = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
] as const

async function submitRequest() {
  isSubmitting.value = true
  errorMessage.value = ''

  try {
    await $fetch('/api/privacy-requests', {
      method: 'POST',
      body: { ...form },
    })
    submitted.value = true
  } catch (err: any) {
    errorMessage.value = err?.data?.statusMessage ?? 'We could not submit the request. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="w-full pb-16 pt-10">
    <section class="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,520px)] lg:items-start">
      <div class="pt-4">
        <p class="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand-500">
          Factory Careers
        </p>
        <h1 class="max-w-3xl text-4xl font-light leading-tight tracking-normal text-white sm:text-5xl">
          Request deletion of applicant information
        </h1>
        <p class="mt-5 max-w-2xl text-base leading-8 text-white/62">
          California residents may use this CCPA request form to ask Factory Careers to review and delete personal information associated with an application, subject to verification and applicable legal or operational limits.
        </p>
        <div class="mt-8 grid gap-3 text-sm text-white/68">
          <div class="flex gap-3">
            <ShieldCheck class="mt-0.5 size-5 shrink-0 text-brand-400" />
            <p>We send a verification email before staff review the request.</p>
          </div>
          <div class="flex gap-3">
            <CheckCircle2 class="mt-0.5 size-5 shrink-0 text-brand-400" />
            <p>The public form never reveals whether an email matches our records.</p>
          </div>
        </div>
      </div>

      <section class="pt-2">
        <ol class="mb-8 grid grid-cols-3 gap-6 border-b border-white/10 pb-5 text-xs font-medium uppercase tracking-[0.16em] text-white/42" aria-label="Deletion request steps">
          <li>
            <span class="block text-brand-500">01</span>
            <span>Contact</span>
          </li>
          <li>
            <span class="block text-brand-500">02</span>
            <span>Context</span>
          </li>
          <li>
            <span class="block text-brand-500">03</span>
            <span>Review</span>
          </li>
        </ol>

        <div v-if="submitted" class="border border-white/10 bg-white/[0.03] px-5 py-8">
          <CheckCircle2 class="size-8 text-success-400" />
          <h3 class="mt-4 text-lg font-semibold text-white">Check your email</h3>
          <p class="mt-2 text-sm leading-7 text-white/62">
            If the details match our records, we will send a verification email with next steps.
          </p>
        </div>

        <form v-else class="space-y-8" @submit.prevent="submitRequest">
          <input v-model="form.website" type="text" class="hidden" tabindex="-1" autocomplete="off" aria-hidden="true" />

          <fieldset class="space-y-5">
            <legend :class="legendClass">
              How should we reach you?
            </legend>

            <div>
              <label for="requester-name" :class="labelClass">Name</label>
              <input id="requester-name" v-model="form.requesterName" required maxlength="200" :class="fieldClass" autocomplete="name" />
            </div>

            <div>
              <label for="requester-email" :class="labelClass">Email</label>
              <input id="requester-email" v-model="form.requesterEmail" required type="email" maxlength="254" :class="fieldClass" autocomplete="email" />
            </div>

            <div>
              <label for="state-of-residence" :class="labelClass">State of residence</label>
              <select id="state-of-residence" v-model="form.stateOfResidence" required :class="[fieldClass, 'appearance-none bg-[linear-gradient(45deg,transparent_50%,rgba(255,255,255,0.58)_50%),linear-gradient(135deg,rgba(255,255,255,0.58)_50%,transparent_50%)] bg-[length:5px_5px,5px_5px] bg-[position:calc(100%-20px)_21px,calc(100%-15px)_21px] bg-no-repeat pr-10']" autocomplete="address-level1">
                <option value="" disabled>Select state</option>
                <option v-for="state in states" :key="state" :value="state">
                  {{ state }}
                </option>
              </select>
            </div>
          </fieldset>

          <fieldset class="space-y-5">
            <legend :class="legendClass">
              Help us identify the request
            </legend>

            <div>
              <label for="request-context" :class="labelClass">Role or application context</label>
              <input id="request-context" v-model="form.requestContext" maxlength="500" :class="fieldClass" placeholder="Company, role title, posting URL, or interview context" />
            </div>

            <div>
              <label for="details" :class="labelClass">Details</label>
              <textarea id="details" v-model="form.details" maxlength="2000" rows="5" :class="[fieldClass, 'h-auto min-h-32 resize-y py-3 leading-6']" placeholder="Anything else that helps us identify the relevant application." />
            </div>
          </fieldset>

          <div v-if="errorMessage" class="ui-alert ui-alert-danger">
            {{ errorMessage }}
          </div>

          <button type="submit" class="factory-submit-button relative ml-auto inline-flex h-12 cursor-pointer items-center justify-center overflow-hidden border border-brand-500 bg-brand-500 px-5 text-sm font-normal uppercase tracking-normal text-white disabled:cursor-not-allowed disabled:opacity-55" :disabled="isSubmitting">
            <span class="factory-submit-reveal absolute inset-x-0 bottom-0 h-full bg-white" aria-hidden="true" />
            <span class="factory-submit-label relative z-10 inline-flex items-center gap-2">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin" />
              <ShieldCheck v-else class="size-4" />
              {{ isSubmitting ? 'Submitting...' : 'Submit deletion request' }}
            </span>
          </button>
        </form>
      </section>
    </section>
  </main>
</template>

<style scoped>
.factory-submit-reveal {
  transform: translateY(100%);
  transition: transform 300ms ease-out;
}

.factory-submit-label {
  transition: color 300ms ease-out;
}

.factory-submit-button:hover .factory-submit-reveal,
.factory-submit-button:focus-visible .factory-submit-reveal {
  transform: translateY(0);
}

.factory-submit-button:hover .factory-submit-label,
.factory-submit-button:focus-visible .factory-submit-label {
  color: #050505;
}
</style>
