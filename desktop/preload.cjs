const { contextBridge, ipcRenderer } = require('electron')

function getValue(key) {
  const result = ipcRenderer.sendSync('vittacore:storage-get', key)
  if (result?.error) throw new Error(result.error)
  return result?.value ?? null
}

function setValue(key, value) {
  const result = ipcRenderer.sendSync('vittacore:storage-set', key, value)
  if (result?.error) throw new Error(result.error)
}

contextBridge.exposeInMainWorld('vittacoreStorage', {
  getItem: getValue,
  setItem: (key, value) => setValue(key, String(value)),
  removeItem: (key) => setValue(key, null),
})
