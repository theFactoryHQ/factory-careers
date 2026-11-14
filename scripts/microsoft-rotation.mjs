const day = 86_400_000

export class RotationError extends Error {}

export async function advanceRotation(state, io, { now = new Date(), apply = false } = {}) {
  const { current, pending, previous } = state
  if (!current?.keyId || !Number.isFinite(Date.parse(current.expiresAt))) {
    throw new RotationError('active credential metadata is missing')
  }
  if (pending && !pending.keyId) throw new RotationError('issuance needs reconciliation')
  if (previous) {
    if (!Number.isFinite(Date.parse(previous.retireAfter))) throw new RotationError('retirement timestamp is missing')
    if (Date.parse(previous.retireAfter) > now.getTime()) return 'overlap'
    if (!apply) return 'retirement_due'
    await io.prove(current)
    await io.retire(previous)
    return 'retired'
  }
  const due = Date.parse(current.expiresAt) - now.getTime() <= 35 * day
  if (!due && !pending) return 'current'
  if (!apply) return pending ? 'staged' : 'due'

  let replacement = pending
  if (!replacement) {
    const expiresAt = new Date(now.getTime() + 90 * day).toISOString()
    await io.begin()
    replacement = await io.issue(expiresAt)
    await io.save(replacement)
  }
  await io.activate(replacement)
  await io.prove(replacement)
  await io.finish(replacement, new Date(now.getTime() + 7 * day).toISOString())
  return 'rotated'
}
