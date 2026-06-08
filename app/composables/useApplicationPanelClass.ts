import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

export type ApplicationPanelSurface = 'sidebar' | 'drawer' | 'page'

export const APPLICATION_PANEL_PAGE_CLASS = 'ui-panel ui-dashboard-panel'
export const APPLICATION_PANEL_DRAWER_CLASS = 'border border-white/12 bg-white/[0.025]'
export const APPLICATION_PANEL_SIDEBAR_CLASS = 'ui-panel'

export function getApplicationPanelClass(surface: ApplicationPanelSurface = 'page') {
  switch (surface) {
    case 'sidebar':
      return APPLICATION_PANEL_SIDEBAR_CLASS
    case 'drawer':
      return APPLICATION_PANEL_DRAWER_CLASS
    default:
      return APPLICATION_PANEL_PAGE_CLASS
  }
}

export function useApplicationPanelClass(surface: MaybeRefOrGetter<ApplicationPanelSurface | undefined>) {
  return computed(() => getApplicationPanelClass(toValue(surface) ?? 'page'))
}