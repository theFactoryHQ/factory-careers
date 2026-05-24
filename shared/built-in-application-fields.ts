const BUILT_IN_LOCATION_LABEL = 'where are you based?'

export function isBuiltInLocationQuestion(question: { label: string; type?: string | null }) {
  return question.label.trim().toLowerCase() === BUILT_IN_LOCATION_LABEL
    && (!question.type || question.type === 'short_text')
}
