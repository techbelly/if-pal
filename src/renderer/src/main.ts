import './style.css'

const api = (window as any).electronAPI

const openBtn = document.getElementById('open-btn') as HTMLButtonElement
const emptyState = document.getElementById('empty-state') as HTMLDivElement
const gameOutput = document.getElementById('game-output') as HTMLDivElement
const gameInputRow = document.getElementById('game-input-row') as HTMLDivElement
const gameInput = document.getElementById('game-input') as HTMLInputElement
const chatMessages = document.getElementById('chat-messages') as HTMLDivElement
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement
const typingIndicator = document.getElementById('typing-indicator') as HTMLDivElement
const ollamaBanner = document.getElementById('ollama-banner') as HTMLDivElement
const modelLabel = document.getElementById('model-label') as HTMLSpanElement

// Turn capture state
let titleSet = false
let inputBuffer = ''
let outputBuffer = ''
let waitingForOutput = false
let outputTimer: ReturnType<typeof setTimeout> | null = null
let suppressEcho = ''  // command text to suppress when dfrotz echoes it back
let introBuffer = ''
let introTimer: ReturnType<typeof setTimeout> | null = null
let introSent = false
const META = new Set(['SAVE', 'RESTORE', 'LOAD', 'QUIT', 'VERBOSE', 'BRIEF', 'SUPERBRIEF', 'SCRIPT'])

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}

function appendGameText(text: string): void {
  if (!text) return
  const node = document.createTextNode(text)
  gameOutput.appendChild(node)
  gameOutput.scrollTop = gameOutput.scrollHeight
}

function appendCommand(text: string): void {
  const span = document.createElement('span')
  span.className = 'game-command'
  span.textContent = `\n> ${text}\n`
  gameOutput.appendChild(span)
  gameOutput.scrollTop = gameOutput.scrollHeight
}

// --- Game setup ---

openBtn.addEventListener('click', () => api.openGameDialog())

api.onGameStarted(() => {
  emptyState.style.display = 'none'
  gameOutput.style.display = 'block'
  gameOutput.textContent = ''
  gameInputRow.style.display = 'flex'
  titleSet = false
  introBuffer = ''
  introSent = false
  if (introTimer) { clearTimeout(introTimer); introTimer = null }
  setTimeout(() => gameInput.focus(), 100)
})

api.onGameData((data: string) => {
  let stripped = stripAnsi(data).replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Suppress dfrotz echoing our command back
  if (suppressEcho && stripped.includes(suppressEcho)) {
    stripped = stripped.replace(suppressEcho, '')
    suppressEcho = ''
  }

  // Filter status-bar lines, dfrotz prompts, and collapse excess blank lines
  const displayText = stripped
    .split('\n')
    .filter(line => !/Score:\s*\d+\s+Moves:\s*\d+/.test(line))
    .join('\n')
    .replace(/^>\s?/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/^\n+/, '')
  if (displayText) {
    if (!titleSet) {
      const firstLine = stripped.split('\n').find(l => l.trim())
      if (firstLine) {
        api.setWindowTitle(firstLine.trim())
        titleSet = true
      }
    }
    appendGameText(displayText)
  }

  // Capture intro text before the player has typed anything
  if (!introSent && !waitingForOutput) {
    introBuffer += stripped
    if (introTimer) clearTimeout(introTimer)
    introTimer = setTimeout(() => {
      const cleanIntro = introBuffer
        .split('\n')
        .filter(line => !/Score:\s*\d+\s+Moves:\s*\d+/.test(line))
        .join('\n')
        .trim()
      if (cleanIntro) api.sendIntro(cleanIntro)
      introSent = true
      introTimer = null
    }, 500)
  }

  if (waitingForOutput) {
    outputBuffer += stripped
    if (outputTimer) clearTimeout(outputTimer)
    outputTimer = setTimeout(() => {
      const input = inputBuffer.trim()
      if (input && !META.has(input.toUpperCase())) {
        const cleanOutput = outputBuffer
          .split('\n')
          .filter(line => !/Score:\s*\d+\s+Moves:\s*\d+/.test(line))
          .join('\n')
          .trim()
        api.sendTurn({ input, output: cleanOutput })
      }
      inputBuffer = ''
      outputBuffer = ''
      waitingForOutput = false
      outputTimer = null
    }, 150)
  }
})

api.onGameExit(() => {
  appendGameText('\n\n[Game over]\n')
  gameInputRow.style.display = 'none'
})

api.onGameError((msg: string) => {
  emptyState.style.display = 'flex'
  gameOutput.style.display = 'none'
  gameInputRow.style.display = 'none'
  const errEl = document.getElementById('empty-state-error') ?? (() => {
    const el = document.createElement('p')
    el.id = 'empty-state-error'
    el.style.cssText = 'color:#c0392b;margin-top:1rem;font-size:14px;'
    emptyState.appendChild(el)
    return el
  })()
  errEl.textContent = msg
})

api.onModelInfo(({ model }: { model: string }) => {
  modelLabel.textContent = model
})

gameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = gameInput.value
    inputBuffer = text
    suppressEcho = text
    appendCommand(text)
    api.sendInput(text + '\r')
    gameInput.value = ''
    waitingForOutput = true
    outputBuffer = ''
  }
})

// Keep focus on game input when clicking the game pane
gameOutput.addEventListener('click', () => gameInput.focus())

// --- Ollama status ---

api.onOllamaStatus(({ ok, error }: { ok: boolean; error?: string }) => {
  if (!ok) {
    ollamaBanner.textContent = `Grue is unavailable — ${error ?? 'is Ollama running?'}`
    ollamaBanner.style.display = 'block'
  }
})

// --- Grue chat UI ---

function appendMessage(role: 'grue' | 'player', text: string): HTMLDivElement {
  const div = document.createElement('div')
  div.className = `message message-${role}`
  div.textContent = text
  if (role === 'grue') {
    const label = document.createElement('span')
    label.className = 'message-label'
    label.textContent = 'Grue '
    div.prepend(label)
  }
  chatMessages.appendChild(div)
  chatMessages.scrollTop = chatMessages.scrollHeight
  return div
}

let pendingGrueDiv: HTMLDivElement | null = null
let pendingGrueText = ''

api.onGrueTypingStart(() => {
  typingIndicator.style.display = 'flex'
  pendingGrueDiv = null
  pendingGrueText = ''
})

api.onGrueToken((token: string) => {
  typingIndicator.style.display = 'none'
  if (!pendingGrueDiv) {
    pendingGrueDiv = appendMessage('grue', '')
  }
  pendingGrueText += token
  const display = pendingGrueText.replace(/\[nothing\]/i, '').trim()
  const label = pendingGrueDiv.querySelector('.message-label')
  pendingGrueDiv.textContent = display
  if (label) pendingGrueDiv.prepend(label)
  chatMessages.scrollTop = chatMessages.scrollHeight
})

api.onGrueTypingEnd(() => {
  typingIndicator.style.display = 'none'
  if (pendingGrueDiv) {
    pendingGrueDiv.remove()
    pendingGrueDiv = null
  }
})

api.onGrueResponseDone((_response: string) => {
  typingIndicator.style.display = 'none'
  pendingGrueDiv = null
})

// --- Player chat input ---

function submitMessage(): void {
  const text = chatInput.value.trim()
  if (!text) return
  appendMessage('player', text)
  api.sendPlayerMessage(text)
  chatInput.value = ''
}

sendBtn.addEventListener('click', submitMessage)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitMessage()
  }
})
