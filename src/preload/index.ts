import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openGameDialog: () => ipcRenderer.send('game:open-dialog'),
  sendInput: (data: string) => ipcRenderer.send('game:input', data),
  sendResize: (cols: number, rows: number) => ipcRenderer.send('game:resize', cols, rows),
  sendIntro: (text: string) => ipcRenderer.send('game:intro', text),
  sendTurn: (turn: { input: string; output: string }) => ipcRenderer.send('game:turn', turn),
  sendPlayerMessage: (message: string) => ipcRenderer.send('player:message', message),
  onGameData: (cb: (data: string) => void) => ipcRenderer.on('game:data', (_e, d) => cb(d)),
  onGameError: (cb: (msg: string) => void) => ipcRenderer.on('game:error', (_e, m) => cb(m)),
  onGameStarted: (cb: () => void) => ipcRenderer.on('game:started', () => cb()),
  onGameExit: (cb: () => void) => ipcRenderer.on('game:exit', () => cb()),
  onOllamaStatus: (cb: (s: { ok: boolean; error?: string }) => void) => ipcRenderer.on('ollama:status', (_e, s) => cb(s)),
  onGrueToken: (cb: (token: string) => void) => ipcRenderer.on('grue:token', (_e, t) => cb(t)),
  onGrueTypingStart: (cb: () => void) => ipcRenderer.on('grue:typing:start', () => cb()),
  onGrueTypingEnd: (cb: () => void) => ipcRenderer.on('grue:typing:end', () => cb()),
  onGrueResponseDone: (cb: (response: string) => void) => ipcRenderer.on('grue:response:done', (_e, r) => cb(r)),
  onModelInfo: (cb: (info: { provider: string; model: string }) => void) => ipcRenderer.on('model:info', (_e, i) => cb(i)),
  setWindowTitle: (title: string) => ipcRenderer.send('window:set-title', title),
})
