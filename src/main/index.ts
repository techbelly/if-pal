import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import { join } from 'path'
import * as pty from 'node-pty'
import { AIPipeline } from './aiPipeline'
import { checkOllama } from './ollamaClient'
import { checkClaude, initClaude } from './claudeClient'
import { loadSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let gamePty: pty.IPty | null = null
let aiPipeline: AIPipeline | null = null

const DFROTZ = 'dfrotz'

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Game', accelerator: 'CmdOrCtrl+O', click: () => openGameDialog() },
        { id: 'save', label: 'Save', accelerator: 'CmdOrCtrl+S', enabled: false, click: () => {} },
        { id: 'load', label: 'Load', enabled: false, click: () => {} },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Developer Tools', accelerator: 'CmdOrCtrl+Alt+I', click: () => mainWindow?.webContents.toggleDevTools() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function openGameDialog(): Promise<void> {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Z-machine Games', extensions: ['z3', 'z5', 'z8'] }],
    properties: ['openFile']
  })
  if (!result.canceled && result.filePaths.length > 0) {
    startGame(result.filePaths[0])
  }
}

function startGame(storyPath: string): void {
  if (!mainWindow) return

  if (gamePty) { gamePty.kill(); gamePty = null }

  aiPipeline = new AIPipeline(mainWindow)

  try {
    gamePty = pty.spawn(DFROTZ, ['-m', '-q', '-r', '\\ch1', storyPath], {
      name: 'xterm-256color',
      cols: 512,
      rows: 24,
      cwd: process.env['HOME'],
      env: process.env as Record<string, string>
    })
  } catch {
    mainWindow.webContents.send('game:error', 'dfrotz not found. Install it with: brew install frotz')
    return
  }



  gamePty.onData((data) => {
    mainWindow?.webContents.send('game:data', data)
  })

  gamePty.onExit(() => {
    mainWindow?.webContents.send('game:exit')
    gamePty = null
  })

  mainWindow.webContents.send('game:started')

  // Check AI provider availability and notify renderer
  const { provider, model, anthropicApiKey } = loadSettings()
  if (provider === 'claude') {
    if (anthropicApiKey) initClaude(anthropicApiKey)
    const { ok, error } = checkClaude(anthropicApiKey)
    mainWindow?.webContents.send('ollama:status', { ok, error })
  } else {
    checkOllama(model).then(({ ok, error }) => {
      mainWindow?.webContents.send('ollama:status', { ok, error })
    })
  }
}

ipcMain.on('window:set-title', (_event, title: string) => { mainWindow?.setTitle(title) })
ipcMain.on('game:input', (_event, data: string) => { gamePty?.write(data) })
ipcMain.on('game:resize', (_event, cols: number, rows: number) => { gamePty?.resize(cols, rows) })
ipcMain.on('game:open-dialog', () => openGameDialog())
ipcMain.on('game:intro', (_event, text: string) => {
  aiPipeline?.sendIntro(text)
})
ipcMain.on('game:turn', (_event, turn: { input: string; output: string }) => {
  aiPipeline?.addTurn(turn)
})
ipcMain.on('player:message', (_event, message: string) => {
  aiPipeline?.sendPlayerMessage(message)
})

app.whenReady().then(() => {
  createWindow()
  buildMenu()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // Send model info once the window is ready to receive it
  mainWindow?.webContents.once('did-finish-load', () => {
    const { provider, model } = loadSettings()
    mainWindow?.webContents.send('model:info', { provider, model })
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
