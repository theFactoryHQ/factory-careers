import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

export type CandidatePanelSurface = 'drawer' | 'page'

export const CANDIDATE_PANEL_PAGE_CLASS = 'ui-panel ui-dashboard-panel'
export const CANDIDATE_PANEL_DRAWER_CLASS = 'border border-white/12 bg-white/[0.025]'

export function getCandidatePanelClass(surface: CandidatePanelSurface = 'page') {
  return surface === 'drawer'
    ? CANDIDATE_PANEL_DRAWER_CLASS
    : CANDIDATE_PANEL_PAGE_CLASS
}

export function useCandidatePanelClass(surface: MaybeRefOrGetter<CandidatePanelSurface | undefined>) {
  return computed(() => getCandidatePanelClass(toValue(surface) ?? 'page'))
}
