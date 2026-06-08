type UseCopyToClipboardOptions = {
  /** Milliseconds before resetting the copied state. */
  resetMs?: number
  /** Fall back to textarea + execCommand when the Clipboard API is unavailable. */
  useFallback?: boolean
}

function copyWithTextarea(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copiedViaFallback = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copiedViaFallback) throw new Error('Clipboard copy failed')
}

export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const { resetMs = 1600, useFallback = false } = options
  const copied = ref(false)
  let resetTimer: ReturnType<typeof setTimeout> | null = null

  function markCopied() {
    copied.value = true
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      copied.value = false
    }, resetMs)
  }

  async function copy(text: string | null | undefined): Promise<boolean> {
    const value = text?.trim()
    if (!value) return false

    try {
      if (useFallback) {
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
          await navigator.clipboard.writeText(value)
        } catch {
          copyWithTextarea(value)
        }
      } else {
        await navigator.clipboard.writeText(value)
      }

      markCopied()
      return true
    } catch {
      return false
    }
  }

  onBeforeUnmount(() => {
    if (resetTimer) clearTimeout(resetTimer)
  })

  return {
    copied,
    copy,
  }
}