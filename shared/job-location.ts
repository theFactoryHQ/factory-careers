import { US_STATE_VALUES } from './location-options'

export type UsStateValue = typeof US_STATE_VALUES[number]

export type JobLocationFields = {
  city: string
  state: UsStateValue | ''
}

const US_STATE_SET = new Set<string>(US_STATE_VALUES)

export function parseJobLocation(location: string | null | undefined): JobLocationFields {
  const trimmed = location?.trim() ?? ''
  if (!trimmed) {
    return { city: '', state: '' }
  }

  const stateOnly = trimmed.toUpperCase()
  if (US_STATE_SET.has(stateOnly)) {
    return { city: '', state: stateOnly as UsStateValue }
  }

  const cityStateMatch = trimmed.match(/^(.+?),\s*([a-z]{2})$/i)
  const maybeState = cityStateMatch?.[2]?.toUpperCase() ?? ''
  if (cityStateMatch && US_STATE_SET.has(maybeState)) {
    return {
      city: cityStateMatch[1]?.trim() ?? '',
      state: maybeState as UsStateValue,
    }
  }

  return { city: trimmed, state: '' }
}

export function buildJobLocation({ city, state }: JobLocationFields): string {
  const trimmedCity = city.trim()
  const validState = US_STATE_SET.has(state) ? state : ''

  if (trimmedCity && validState) {
    return `${trimmedCity}, ${validState}`
  }

  return trimmedCity || validState
}
