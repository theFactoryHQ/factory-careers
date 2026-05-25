export function formatPhoneNumber(value: string | null | undefined) {
  const original = value?.trim() ?? ''
  if (!original) return ''

  const digits = original.replace(/\D/g, '')
  if (!digits) return original

  const extensionMatch = original.match(/(?:ext\.?|x)\s*(\d+)$/i)
  const extension = extensionMatch?.[1] ? ` x${extensionMatch[1]}` : ''
  const dialDigits = extensionMatch
    ? original.slice(0, extensionMatch.index).replace(/\D/g, '')
    : digits

  if (dialDigits.length === 10) {
    return `(${dialDigits.slice(0, 3)}) ${dialDigits.slice(3, 6)}-${dialDigits.slice(6)}${extension}`
  }

  if (dialDigits.length === 11 && dialDigits.startsWith('1')) {
    return `+1 (${dialDigits.slice(1, 4)}) ${dialDigits.slice(4, 7)}-${dialDigits.slice(7)}${extension}`
  }

  return original
}
