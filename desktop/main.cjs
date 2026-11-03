const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const STORE_FILE = 'vittacore-data.json'
const ALLOWED_KEYS = new Set([
  'vittacore-workspace-v1',
  'vittacore-setup-complete-v1',
  'vittacore-local-access-v1',
  'vittacore-templates',
  'nutrivida-workspace-v1',
  'nutrivida-templates',
])

function getStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function readStore() {
  const filePath = getStorePath()
  if (!fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeStore(store) {
  const filePath = getStorePath()
  const temporaryPath = `${filePath}.tmp`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(temporaryPath, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, filePath)
}

function validateKey(key) {
  if (typeof key !== 'string' || !ALLOWED_KEYS.has(key)) {
    throw new Error('Clave de almacenamiento no permitida.')
  }
}

ipcMain.on('vittacore:storage-get', (event, key) => {
  try {
    validateKey(key)
    event.returnValue = { value: readStore()[key] ?? null }
  } catch (error) {
    event.returnValue = { error: error.message }
  }
})

ipcMain.on('vittacore:storage-set', (event, key, value) => {
  try {
    validateKey(key)
    const store = readStore()
    if (value === null) delete store[key]
    else if (typeof value !== 'string') throw new Error('El valor almacenado debe ser texto.')
    else store[key] = value
    writeStore(store)
    event.returnValue = { ok: true }
  } catch (error) {
    event.returnValue = { error: error.message }
  }
})

function openExternal(url) {
  try {
    const parsedUrl = new URL(url)
    if (!['https:', 'http:', 'mailto:'].includes(parsedUrl.protocol)) return
    shell.openExternal(parsedUrl.href).catch((error) => console.error('No se pudo abrir el enlace externo.', error))
  } catch (error) {
    console.error('Se rechazó un enlace externo no válido.', error)
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 920,
    minHeight: 680,
    title: 'VittaCore',
    backgroundColor: '#f7f8f6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return
    event.preventDefault()
    openExternal(url)
  })
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  app.setAppUserModelId('org.vittacore.desktop')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
