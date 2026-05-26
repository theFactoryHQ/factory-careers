export const INVALID_INVITE_LINK_MESSAGE =
  'This invite link is invalid or has expired. Ask an administrator for a new invitation.'

const genericInviteLinkErrorMessages = new Set([
  'bad request',
  'forbidden',
  'invalid invite token',
  'invalid, expired, or revoked invite link',
  'unauthorized',
  'validation error',
])

function readMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null

  const maybeError = error as {
    data?: {
      message?: unknown
      statusMessage?: unknown
    }
    message?: unknown
    statusMessage?: unknown
  }

  return (
    readMessage(maybeError.data?.statusMessage)
    ?? readMessage(maybeError.statusMessage)
    ?? readMessage(maybeError.data?.message)
    ?? readMessage(maybeError.message)
  )
}

export function formatInviteLinkError(
  error: unknown,
  fallback = INVALID_INVITE_LINK_MESSAGE,
) {
  const message = getErrorMessage(error)
  if (!message) return fallback

  const normalized = message.toLowerCase()
  if (genericInviteLinkErrorMessages.has(normalized)) {
    return fallback
  }

  return message
}
