import { Component, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { signInWithCustomToken, signOut } from 'firebase/auth'
import { AuthProvider, useAuth } from '../../../src/context/AuthContext'
import { ToastProvider } from '../../../src/context/ToastContext'
import { useAllBranches } from '../../../src/hooks/useBranch'
import { useAddHQKnowledge, useDeleteHQKnowledge, useUpdateHQKnowledge } from '../../../src/hooks/useHQKnowledge'
import { useAddKnowledge } from '../../../src/hooks/useKnowledge'
import { HQKnowledgePage } from '../../../src/pages/HQKnowledgePage'
import { KnowledgeLibraryPage } from '../../../src/pages/KnowledgeLibraryPage'
import { KnowledgeAdminPage } from '../../../src/pages/admin/KnowledgeAdminPage'
import { PortalKnowledge } from '../../../src/pages/portal/PortalKnowledge'
import { PortalChat } from '../../../src/pages/portal/PortalChat'
import { PortalReport } from '../../../src/pages/portal/PortalReport'
import { BranchesPage } from '../../../src/pages/BranchesPage'
import { auth } from './browser-firebase'
import '../../../src/index.css'

declare global {
  interface Window {
    knowledgeDriver: {
      signIn: (token: string) => Promise<void>
      signOut: () => Promise<void>
      idToken: () => Promise<string>
      addHQ: ReturnType<typeof useAddHQKnowledge>['addItem']
      updateHQ: ReturnType<typeof useUpdateHQKnowledge>['updateItem']
      deleteHQ: ReturnType<typeof useDeleteHQKnowledge>['deleteItem']
      addLocal: ReturnType<typeof useAddKnowledge>['addItem']
    }
  }
}

class ConsumerBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() {
    return this.state.error
      ? <p data-testid="consumer-error" role="alert">{this.state.error}</p>
      : this.props.children
  }
}

function Driver() {
  const identity = useAuth()
  const add = useAddHQKnowledge()
  const update = useUpdateHQKnowledge()
  const remove = useDeleteHQKnowledge()
  const local = useAddKnowledge()
  useEffect(() => {
    window.knowledgeDriver = {
      signIn: async (token) => { await signInWithCustomToken(auth, token) },
      signOut: () => signOut(auth),
      idToken: async () => {
        if (!auth.currentUser) throw new Error('No authenticated emulator user')
        return auth.currentUser.getIdToken()
      },
      addHQ: add.addItem,
      updateHQ: update.updateItem,
      deleteHQ: remove.deleteItem,
      addLocal: local.addItem,
    }
  })

  return <>
    <output data-testid="identity">{identity.loading ? 'loading' : identity.appUser?.uid ?? 'signed-out'}</output>
    {identity.appUser && <Views />}
  </>
}

function Views() {
  const { branches } = useAllBranches()
  const [branchId, setBranchId] = useState('branch-a')
  const [view, setView] = useState('hooks')
  const branch = branches.find((candidate) => candidate.id === branchId)
  return <>
    <aside>
      <select aria-label="Driver view" value={view} onChange={(event) => setView(event.target.value)}>
        {['hooks', 'hq', 'portal', 'research-admin', 'library', 'report', 'chat', 'branches'].map((name) =>
          <option key={name}>{name}</option>)}
      </select>
      <select aria-label="Driver branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
        {branches.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
    </aside>
    <main>
      <ConsumerBoundary key={view}>
        {view === 'hq' && <HQKnowledgePage />}
        {view === 'research-admin' && <KnowledgeAdminPage />}
        {view === 'library' && <KnowledgeLibraryPage />}
        {view === 'branches' && <BranchesPage />}
        {branch && <Routes>
          <Route element={<Outlet context={{ branch, branches, setBranchId }} />}>
            <Route path="*" element={
              view === 'portal' ? <PortalKnowledge /> :
              view === 'report' ? <PortalReport /> :
              view === 'chat' ? <PortalChat /> : null
            } />
          </Route>
        </Routes>}
      </ConsumerBoundary>
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider><ToastProvider><MemoryRouter><Driver /></MemoryRouter></ToastProvider></AuthProvider>,
)
