import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

export type UploadProgress = { progress: number; done: false } | { done: true; url: string; fileName: string }

export function uploadFile(
  path: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  onError?: (err: unknown) => void
): () => void {
  const storageRef = ref(storage, path)
  const task = uploadBytesResumable(storageRef, file)

  task.on(
    'state_changed',
    (snap) => {
      const pct = (snap.bytesTransferred / snap.totalBytes) * 100
      onProgress({ progress: Math.round(pct), done: false })
    },
    (err) => {
      console.error('upload error', err)
      onError?.(err)
    },
    async () => {
      const url = await getDownloadURL(task.snapshot.ref)
      onProgress({ done: true, url, fileName: file.name })
    }
  )

  return () => task.cancel()
}

export function storagePath(collection: string, uid: string, fileName: string): string {
  const ts = Date.now()
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${collection}/${uid}/${ts}_${safe}`
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const MAX_UPLOAD_ERROR = 'הקובץ גדול מדי — מקסימום 25 MB'

export function isHttpsUrl(value: string): boolean {
  try { return new URL(value.trim()).protocol === 'https:' } catch { return false }
}

export function uploadFileAsync(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; fileName: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return Promise.reject(new Error(MAX_UPLOAD_ERROR))
  return new Promise((resolve, reject) => {
    uploadFile(path, file, (p) => {
      if (!p.done) onProgress?.(p.progress)
      else resolve({ url: p.url, fileName: p.fileName })
    }, reject)
  })
}
