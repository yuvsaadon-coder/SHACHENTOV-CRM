import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

export type UploadProgress = { progress: number; done: false } | { done: true; url: string; fileName: string }

export function uploadFile(
  path: string,
  file: File,
  onProgress: (p: UploadProgress) => void
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
