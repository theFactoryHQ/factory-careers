import { eq, and } from 'drizzle-orm'
import { comment, member } from '../../database/schema'
import { commentIdParamSchema } from '../../utils/schemas/comment'

/**
 * DELETE /api/comments/:id
 * Remove a comment.
 * Requires comment:delete permission.
 * Only admin/owner roles have comment:delete, so members cannot delete even
 * their own comments. Admins and owners can delete any comment in the org.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { comment: ['delete'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, commentIdParamSchema.parse)

  // ── Fetch comment & verify org scope ──
  const existing = await db.query.comment.findFirst({
    where: and(
      eq(comment.id, id),
      eq(comment.organizationId, orgId),
    ),
    columns: { id: true, authorId: true, targetType: true, targetId: true },
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  }

  // Admins/owners can delete any comment.
  if (existing.authorId !== session.user.id) {
    const mem = await db.query.member.findFirst({
      where: and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, orgId),
      ),
      columns: { role: true },
    })
    const isAdminOrOwner = mem?.role === 'admin' || mem?.role === 'owner'
    if (!isAdminOrOwner) {
      throw createError({ statusCode: 403, statusMessage: 'You can only delete your own comments' })
    }
  }

  await db.delete(comment).where(eq(comment.id, id))

  // Record activity (fire-and-forget)
  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'comment',
    resourceId: id,
    metadata: {
      targetType: existing.targetType,
      targetId: existing.targetId,
    },
  })

  setResponseStatus(event, 204)
  return null
})
