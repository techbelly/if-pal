import { ContextManager } from './contextManager'
import { streamChat } from './ollamaClient'
import { streamClaude } from './claudeClient'
import { loadSettings } from './settings'
import type { BrowserWindow } from 'electron'

export interface Turn {
  input: string
  output: string
}

export class AIPipeline {
  private context = new ContextManager()
  private win: BrowserWindow
  private pendingTurns: Turn[] = []
  private queuedTurns: Turn[] = []
  private isGenerating = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private settings = loadSettings()

  constructor(win: BrowserWindow) {
    this.win = win
  }

  sendIntro(text: string): void {
    this.context.addIntroText(text)
    this.generate(true)
  }

  addTurn(turn: Turn): void {
    if (this.isGenerating) {
      this.queuedTurns.push(turn)
      return
    }
    this.pendingTurns.push(turn)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.flushPending(), this.settings.debounceMs)
  }

  sendPlayerMessage(message: string): void {
    // Player messages bypass debounce and always get a response
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.context.addPlayerMessage(message)
    this.generate(true)
  }

  private flushPending(): void {
    if (this.pendingTurns.length === 0) return
    const batch = this.pendingTurns.splice(0)
    this.context.addGameTurns(batch)
    this.generate(false)
  }

  private generate(alwaysRespond: boolean): void {
    this.isGenerating = true
    this.win.webContents.send('grue:typing:start')

    let fullText = ''

    const streamFn = this.settings.provider === 'claude' ? streamClaude : streamChat
    streamFn(
      this.settings.model,
      this.context.getMessages(),
      (token) => {
        fullText += token
        this.win.webContents.send('grue:token', token)
      },
      (response) => {
        const trimmed = response.trim()
        if (!alwaysRespond && trimmed.toUpperCase() === '[NOTHING]') {
          this.win.webContents.send('grue:typing:end')
        } else {
          this.context.addGrueResponse(trimmed)
          this.win.webContents.send('grue:response:done', trimmed)
        }
        this.onGenerationComplete()
      },
      (err) => {
        console.error('[grue] generation error:', err)
        this.win.webContents.send('grue:typing:end')
        this.onGenerationComplete()
      }
    )
  }

  private onGenerationComplete(): void {
    this.isGenerating = false
    if (this.queuedTurns.length > 0) {
      this.pendingTurns = this.queuedTurns.splice(0)
      this.flushPending()
    }
  }

  getContext(): ContextManager {
    return this.context
  }
}
