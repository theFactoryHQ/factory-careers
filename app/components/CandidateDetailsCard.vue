<script setup lang="ts">
import { Calendar, Clock, Phone } from 'lucide-vue-next'
import { formatPhoneNumber } from '~/utils/phone-format'

const props = withDefaults(defineProps<{
  candidate: any
  candidateId: string
  surface?: 'drawer' | 'page'
}>(), {
  surface: 'page',
})

const emit = defineEmits<{
  refresh: []
}>()

const { formatCandidateName, formatDate } = useOrgSettings()

const panelClass = useCandidatePanelClass(() => props.surface)
const headingTag = computed(() => props.surface === 'drawer' ? 'h2' : 'h1')

const genderLabels: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}
</script>

<template>
  <div class="space-y-4">
    <div :class="[panelClass, 'p-5']">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="mb-2 text-xs font-medium uppercase tracking-wide text-white/38">
            Candidate profile
          </p>
          <component :is="headingTag" class="mb-1 truncate text-2xl font-bold text-white">
            {{ formatCandidateName(candidate) }}
          </component>
          <div class="flex flex-col gap-1 text-sm text-white/58 sm:flex-row sm:items-center sm:gap-4">
            <CopyEmailButton :email="candidate.email" class="text-white/68" />
            <span v-if="candidate.phone" class="inline-flex items-center gap-1 text-white/58">
              <Phone class="size-3.5" />
              {{ formatPhoneNumber(candidate.phone) }}
            </span>
          </div>
        </div>

        <slot name="actions" />
      </div>
    </div>

    <div :class="[panelClass, 'p-5']">
      <h2 class="mb-3 text-sm font-semibold text-white">Details</h2>
      <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-white/38">Email</dt>
          <dd class="font-medium text-white/82">
            <CopyEmailButton :email="candidate.email" :show-icon="false" class="text-white/82" />
          </dd>
        </div>
        <div>
          <dt class="text-white/38">Phone</dt>
          <dd class="font-medium text-white/82">{{ formatPhoneNumber(candidate.phone) || '—' }}</dd>
        </div>
        <div v-if="candidate.gender">
          <dt class="text-white/38">Gender</dt>
          <dd class="font-medium text-white/82">
            {{ genderLabels[candidate.gender] ?? candidate.gender }}
          </dd>
        </div>
        <div v-if="candidate.dateOfBirth">
          <dt class="text-white/38">Date of Birth</dt>
          <dd class="font-medium text-white/82">
            {{ formatDate(candidate.dateOfBirth) }}
          </dd>
        </div>
        <div v-if="candidate.displayName">
          <dt class="text-white/38">Display Name</dt>
          <dd class="font-medium text-white/82">{{ candidate.displayName }}</dd>
        </div>
        <div>
          <dt class="inline-flex items-center gap-1 text-white/38">
            <Calendar class="size-3.5" />
            Created
          </dt>
          <dd class="font-medium text-white/82">
            <TimelineDateLink :date="candidate.createdAt">{{ new Date(candidate.createdAt).toLocaleDateString() }}</TimelineDateLink>
          </dd>
        </div>
        <div>
          <dt class="inline-flex items-center gap-1 text-white/38">
            <Clock class="size-3.5" />
            Updated
          </dt>
          <dd class="font-medium text-white/82">
            <TimelineDateLink :date="candidate.updatedAt">{{ new Date(candidate.updatedAt).toLocaleDateString() }}</TimelineDateLink>
          </dd>
        </div>
      </dl>
    </div>

    <div :class="[panelClass, 'p-4']">
      <h2 class="mb-2 px-2 text-sm font-semibold text-white">Properties</h2>
      <PropertyBlock
        entity-type="candidate"
        :entity-id="candidateId"
        :entries="(candidate.properties ?? []) as import('~~/shared/properties').PropertyEntry[]"
        @refresh="emit('refresh')"
      />
    </div>
  </div>
</template>
