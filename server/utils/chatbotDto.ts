import type { ChatbotAgent, ChatbotFolder } from '../../shared/chatbot'
import type { chatbotAgent, chatbotFolder } from '../database/schema'

type ChatbotFolderRow = typeof chatbotFolder.$inferSelect
type ChatbotAgentRow = typeof chatbotAgent.$inferSelect

/** Map a persisted chatbot folder row to the shared API DTO. */
export function toChatbotFolder(row: ChatbotFolderRow): ChatbotFolder {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    position: row.position,
    createdAt: row.createdAt.getTime(),
  }
}

/** Map a persisted chatbot agent row to the shared API DTO. */
export function toChatbotAgent(row: ChatbotAgentRow): ChatbotAgent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    systemPrompt: row.systemPrompt,
    temperature: row.temperature ? Number(row.temperature) : null,
    isDefault: row.isDefault,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}