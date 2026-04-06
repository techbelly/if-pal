import Anthropic from '@anthropic-ai/sdk'
import type { Message } from './ollamaClient'

let client: Anthropic | null = null

export function initClaude(apiKey: string): void {
  client = new Anthropic({ apiKey })
}

function getClient(): Anthropic {
  if (!client) throw new Error('Claude client not initialised — set anthropicApiKey in settings.json')
  return client
}

export interface StreamHandle {
  cancel: () => void
}

export function streamClaude(
  model: string,
  messages: Message[],
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void
): StreamHandle {
  let cancelled = false
  let abortController: AbortController | null = null
  let fullText = ''

  const systemMessage = messages.find((m) => m.role === 'system')
  const chatMessages = messages.filter((m) => m.role !== 'system') as Array<{
    role: 'user' | 'assistant'
    content: string
  }>

  abortController = new AbortController()

  getClient()
    .messages.stream(
      {
        model,
        max_tokens: 256,
        system: systemMessage?.content,
        messages: chatMessages
      },
      { signal: abortController.signal }
    )
    .on('text', (text) => {
      if (cancelled) return
      fullText += text
      onToken(text)
    })
    .finalMessage()
    .then(() => {
      if (!cancelled) onDone(fullText)
    })
    .catch((err: Error) => {
      if (!cancelled) onError(err)
    })

  return {
    cancel: () => {
      cancelled = true
      abortController?.abort()
    }
  }
}

export function checkClaude(apiKey?: string): { ok: boolean; error?: string } {
  if (!apiKey) {
    return { ok: false, error: 'anthropicApiKey not set in settings.json' }
  }
  return { ok: true }
}
