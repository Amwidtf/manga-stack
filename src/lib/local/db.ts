// 本地漫画库的 IndexedDB 极简封装(仅元数据;图片文件在 Filesystem 目录里)。

import { Directory, Filesystem } from '@capacitor/filesystem'
import type { LocalManga } from './model'

const DB_NAME = 'mangastack-local'
const STORE = 'manga'
export const LOCAL_DIR = 'local-library'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        t.oncomplete = () => {
          db.close()
          resolve(req.result)
        }
        t.onerror = () => {
          db.close()
          reject(t.error)
        }
        t.onabort = () => {
          db.close()
          reject(t.error)
        }
      }),
  )
}

export async function listLocalManga(): Promise<LocalManga[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<LocalManga[]>)
  return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

export function getLocalManga(id: string): Promise<LocalManga | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<LocalManga | undefined>)
}

export function putLocalManga(m: LocalManga): Promise<LocalManga> {
  return tx('readwrite', (s) => s.put(m) as IDBRequest<IDBValidKey>).then(() => m)
}

export function deleteLocalMangaMeta(id: string): Promise<void> {
  return tx('readwrite', (s) => s.delete(id)).then(() => undefined)
}

export async function renameLocalManga(id: string, title: string): Promise<LocalManga | undefined> {
  const m = await getLocalManga(id)
  if (!m) return undefined
  m.title = title
  await putLocalManga(m)
  return m
}

/** 删除整部漫画在 Filesystem 中的图片目录。 */
export async function removeMangaFiles(id: string): Promise<void> {
  try {
    await Filesystem.rmdir({
      path: `${LOCAL_DIR}/${id}`,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // 目录不存在等场景忽略
  }
}

/** 清空整个本地库:删 DB + 删文件目录。 */
export async function wipeLocalLibrary(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
  try {
    await Filesystem.rmdir({ path: LOCAL_DIR, directory: Directory.Data, recursive: true })
  } catch {
    // 忽略
  }
}
