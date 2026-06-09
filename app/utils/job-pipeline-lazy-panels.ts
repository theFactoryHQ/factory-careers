import { defineAsyncComponent, type Component } from 'vue'

/** Async job pipeline detail panels — split from the route page to shrink the initial chunk. */
export const jobPipelineLazyPanels = {
  timeline: defineAsyncComponent(
    () => import('~/components/job-pipeline/JobPipelineTimelinePanel.vue'),
  ),
  aiScore: defineAsyncComponent(
    () => import('~/components/job-pipeline/JobPipelineAiScorePanel.vue'),
  ),
  documents: defineAsyncComponent(
    () => import('~/components/job-pipeline/JobPipelineDocumentsPanel.vue'),
  ),
  responses: defineAsyncComponent(
    () => import('~/components/job-pipeline/JobPipelineResponsesPanel.vue'),
  ),
} satisfies Record<string, Component>