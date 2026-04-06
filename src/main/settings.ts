import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface Settings {
  provider: 'ollama' | 'claude'
  model: string
  ollamaPort: number
  debounceMs: number
  anthropicApiKey?: string
}

const DEFAULTS: Settings = {
  provider: 'ollama',
  model: 'qwen2.5:3b',
  ollamaPort: 11434,
  debounceMs: 1500
}

function settingsPath(): string {
  // Use settings.json at the project root (two levels up from out/main/)
  return join(__dirname, '../../settings.json')
}

export function loadSettings(): Settings {
  try {
    const path = settingsPath()
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      return { ...DEFAULTS, ...data }
    }
  } catch (err) {
    console.warn('[settings] failed to load, using defaults:', err)
  }
  return { ...DEFAULTS }
}

export function saveSettings(settings: Settings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[settings] failed to save:', err)
  }
}
