const DATABASE_NAME = 'vittacore-local'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'backup-directory'
export const BACKUP_FILE_NAME = 'vittacore_auto_backup.json'
let writeQueue = Promise.resolve()

function openHandleStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'))
  })
}

async function useHandleStore(mode, action) {
  const database = await openHandleStore()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      let result
      action(store, (value) => { result = value }, reject)
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el acceso a la carpeta.'))
      transaction.onabort = () => reject(transaction.error || new Error('Se canceló el almacenamiento del acceso a la carpeta.'))
    })
  } finally {
    database.close()
  }
}

export async function saveDirectoryHandle(handle) {
  return useHandleStore('readwrite', (store) => store.put(handle, HANDLE_KEY))
}

export async function loadDirectoryHandle() {
  return useHandleStore('readonly', (store, setResult, reject) => {
    const request = store.get(HANDLE_KEY)
    request.onsuccess = () => setResult(request.result || null)
    request.onerror = () => reject(request.error || new Error('No se pudo leer la carpeta de respaldo guardada.'))
  })
}

export async function removeDirectoryHandle() {
  return useHandleStore('readwrite', (store) => store.delete(HANDLE_KEY))
}

export function writeAutomaticBackup(handle, data) {
  const write = writeQueue.then(async () => {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted') return 'permission-required'

    const fileHandle = await handle.getFileHandle(BACKUP_FILE_NAME, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(JSON.stringify(data, null, 2))
    } catch (error) {
      try {
        await writable.abort()
      } catch (abortError) {
        console.error('No se pudo cancelar la escritura del respaldo.', abortError)
      }
      throw error
    }
    await writable.close()
    return 'saved'
  })
  writeQueue = write.catch(() => {})
  return write
}

export function supportsDirectoryPicker() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}
