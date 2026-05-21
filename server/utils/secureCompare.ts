import { timingSafeEqual } from 'node:crypto'

/**
 * Compare two secret strings without length-dependent early exits.
 *
 * Node's timingSafeEqual requires equal-length buffers, so compare padded
 * buffers while still requiring the original byte lengths to match. Do not
 * hash first; CodeQL correctly treats generic secret hashing as suspicious
 * because it often hides weak password-storage patterns.
 */
export function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const comparisonLength = Math.max(actualBuffer.length, expectedBuffer.length, 1)
  const actualPadded = Buffer.alloc(comparisonLength)
  const expectedPadded = Buffer.alloc(comparisonLength)

  actualBuffer.copy(actualPadded)
  expectedBuffer.copy(expectedPadded)

  return (
    timingSafeEqual(actualPadded, expectedPadded)
    && actualBuffer.length === expectedBuffer.length
  )
}
