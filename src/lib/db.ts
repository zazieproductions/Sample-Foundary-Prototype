import type { Workspace } from './types'
const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('sample-foundry', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('workspace')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export async function loadWorkspace(): Promise<Workspace | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspace', 'readonly')
    const request = tx.objectStore('workspace').get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}
export async function saveWorkspace(workspace: Workspace) {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite')
    tx.objectStore('workspace').put(workspace, 'current')
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
