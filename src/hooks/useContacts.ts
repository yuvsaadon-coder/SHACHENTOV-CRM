import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Contact } from '../types'

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name'))
    return onSnapshot(q, (snap) => {
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contact)))
      setLoading(false)
    })
  }, [])

  const addContact = async (data: Omit<Contact, 'id'>) => {
    await addDoc(collection(db, 'contacts'), { ...data, createdAt: serverTimestamp() })
  }

  const updateContact = async (id: string, data: Partial<Omit<Contact, 'id'>>) => {
    await updateDoc(doc(db, 'contacts', id), { ...data, updatedAt: serverTimestamp() })
  }

  const deleteContact = async (id: string) => {
    await deleteDoc(doc(db, 'contacts', id))
  }

  return { contacts, loading, addContact, updateContact, deleteContact }
}
