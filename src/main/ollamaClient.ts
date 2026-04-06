import * as http from 'http'

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamHandle {
  cancel: () => void
}

export function streamChat(
  model: string,
  messages: Message[],
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void
): StreamHandle {
  let cancelled = false
  let req: http.ClientRequest | null = null
  let fullText = ''

  const body = JSON.stringify({ model, messages, stream: true })

  req = http.request(
    { hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
    (res) => {
      let buffer = ''
      res.on('data', (chunk: Buffer) => {
        if (cancelled) return
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line)
            if (obj.message?.content) {
              fullText += obj.message.content
              onToken(obj.message.content)
            }
            if (obj.done) onDone(fullText)
          } catch {
            // skip malformed line
          }
        }
      })
      res.on('end', () => {
        if (!cancelled && buffer.trim()) {
          try {
            const obj = JSON.parse(buffer)
            if (obj.message?.content) {
              fullText += obj.message.content
              onToken(obj.message.content)
            }
          } catch { /* ignore */ }
        }
      })
    }
  )

  req.on('error', (err) => { if (!cancelled) onError(err) })
  req.write(body)
  req.end()

  return {
    cancel: () => {
      cancelled = true
      req?.destroy()
    }
  }
}

export async function checkOllama(model: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const tags = JSON.parse(data)
          const found = tags.models?.some((m: { name: string }) => m.name === model)
          resolve(found ? { ok: true } : { ok: false, error: `Model "${model}" not found` })
        } catch {
          resolve({ ok: false, error: 'Could not parse Ollama response' })
        }
      })
    })
    req.on('error', () => resolve({ ok: false, error: 'Ollama not running' }))
    req.setTimeout(2000, () => { req.destroy(); resolve({ ok: false, error: 'Ollama timed out' }) })
  })
}
