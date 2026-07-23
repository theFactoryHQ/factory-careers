import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHATBOT_CONTEXT_MESSAGE_LIMIT,
  selectChatbotContextMessages,
} from '../../shared/chatbot'

describe('chatbot model context window', () => {
  it('selects the latest messages without mutating persisted history', () => {
    const messages = Array.from(
      { length: CHATBOT_CONTEXT_MESSAGE_LIMIT + 1 },
      (_, index) => ({
        role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `message-${index}`,
        ...(index === CHATBOT_CONTEXT_MESSAGE_LIMIT
          ? { attachmentIds: ['attachment-latest'] }
          : {}),
      }),
    )
    const originalMessages = [...messages]

    const context = selectChatbotContextMessages(messages)

    expect(context).toHaveLength(CHATBOT_CONTEXT_MESSAGE_LIMIT)
    expect(context).not.toBe(messages)
    expect(context[0]?.content).toBe('message-1')
    expect(context.map(message => message.content)).toEqual(
      messages.slice(1).map(message => message.content),
    )
    expect(context.at(-1)).toEqual({
      role: 'user',
      content: `message-${CHATBOT_CONTEXT_MESSAGE_LIMIT}`,
      attachmentIds: ['attachment-latest'],
    })
    expect(messages).toEqual(originalMessages)
    expect(messages).toHaveLength(CHATBOT_CONTEXT_MESSAGE_LIMIT + 1)
  })

  it('returns a fresh array when the full history fits in the context window', () => {
    const messages = [
      { role: 'user' as const, content: 'message-0' },
      { role: 'assistant' as const, content: 'message-1' },
    ]

    const context = selectChatbotContextMessages(messages)

    expect(context).toEqual(messages)
    expect(context).not.toBe(messages)
  })

  it('applies the context selector after excluding the streaming placeholder', () => {
    const source = readFileSync(
      new URL('../../app/composables/useChatbot.ts', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(
      /selectChatbotContextMessages\(\s*messages\.value\s*\.slice\(0, -1\)[\s\S]+?\.map\(/,
    )
  })
})
