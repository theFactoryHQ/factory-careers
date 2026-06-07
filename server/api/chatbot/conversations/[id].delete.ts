import { and, eq } from 'drizzle-orm'
import { uuidParamSchema } from '../../../utils/schemas/common'
import { chatbotConversation } from '../../../database/schema'
import { requireChatbotAccess } from '../../../utils/chatbotAccess'

/**
 * DELETE /api/chatbot/conversations/[id] — cascades to messages.
 */
export default defineEventHandler(async (event) => {
  const session = await requireChatbotAccess(event)
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  const { id } = await getValidatedRouterParams(event, uuidParamSchema.parse)

  const result = await db.delete(chatbotConversation)
    .where(and(
      eq(chatbotConversation.id, id),
      eq(chatbotConversation.organizationId, orgId),
      eq(chatbotConversation.userId, userId),
    ))
    .returning({ id: chatbotConversation.id })

  if (result.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found.' })
  }

  return { success: true }
})
