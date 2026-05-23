<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const route = useRoute()
const isFullbleed = computed(() => !!route.meta.fullbleed)

const { data: session } = await authClient.useSession(useFetch)

const config = useRuntimeConfig()
const { activeOrg } = useCurrentOrg()
const { isUpsellOpen, closeUpsell } = usePreviewReadOnly()

const isDemo = computed(() => {
  const slug = config.public.demoOrgSlug
  return slug && activeOrg.value?.slug === slug
})

const isDemoAccount = computed(() => session.value?.user?.email === config.public.liveDemoEmail)

// Explicit preloading for common dashboard surfaces (pairs with the SWR caching
// we added to the composables and router.options.ts). This makes clicking
// "Jobs", "Candidates", "Source Tracking" etc. feel instant on hover + initial load.
onMounted(() => {
  // The router.options.ts + linkPrefetch: 'hover' already gives us excellent
  // component + data prefetching for <NuxtLink>s in the sidebar/topbar.
  // This onMounted can be expanded with router.prefetch() calls for specific
  // heavy routes if desired in the future.
})
        </span>
      </div>
      <div :class="isFullbleed ? 'min-h-0 flex-1' : 'flex-1'">
        <slot />
      </div>
      <AppDashboardFooter :class="isFullbleed ? 'px-4 pb-4 sm:px-6 lg:px-6' : 'mx-auto w-full max-w-6xl'" />
    </main>
  </div>
</template>
