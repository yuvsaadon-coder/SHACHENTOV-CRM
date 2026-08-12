import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TasksPage } from './pages/TasksPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { ContactsPage } from './pages/ContactsPage'
import { RolesPage } from './pages/RolesPage'
import { OrgChartPage } from './pages/OrgChartPage'
import { HierarchySetupPage } from './pages/HierarchySetupPage'
import { CoordinatorPortal } from './pages/portal/CoordinatorPortal'
import { PortalHome } from './pages/portal/PortalHome'
import { PortalReport } from './pages/portal/PortalReport'
import { PortalKnowledge } from './pages/portal/PortalKnowledge'
import { PortalChat } from './pages/portal/PortalChat'
import { BranchesAdminPage } from './pages/admin/BranchesAdminPage'
import { SeedPage } from './pages/admin/SeedPage'
import { KnowledgeAdminPage } from './pages/admin/KnowledgeAdminPage'
import { BranchesPage } from './pages/BranchesPage'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { HQKnowledgePage } from './pages/HQKnowledgePage'
import { HQChatPage } from './pages/HQChatPage'
import { Spinner } from './components/ui/Spinner'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, loading } = useAuth()
  if (loading) return <Spinner size="lg" />
  if (!firebaseUser) return <Navigate to="/login" replace />
  if (appUser?.role === 'coordinator') return <Navigate to="/portal/home" replace />
  return <>{children}</>
}

function RequireCoordinator({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, loading } = useAuth()
  if (loading) return <Spinner size="lg" />
  if (!firebaseUser) return <Navigate to="/login" replace />
  if (appUser && appUser.role !== 'coordinator') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function SmartRedirect() {
  const { appUser, loading } = useAuth()
  if (loading) return <Spinner size="lg" />
  if (appUser?.role === 'coordinator') return <Navigate to="/portal/home" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal/login" element={<Navigate to="/login" replace />} />

          {/* Coordinator portal */}
          <Route
            path="/portal"
            element={
              <RequireCoordinator>
                <CoordinatorPortal />
              </RequireCoordinator>
            }
          >
            <Route index element={<Navigate to="/portal/home" replace />} />
            <Route path="home" element={<PortalHome />} />
            <Route path="report" element={<PortalReport />} />
            <Route path="knowledge" element={<PortalKnowledge />} />
            <Route path="chat" element={<PortalChat />} />
          </Route>

          {/* Admin / CRM */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:id" element={<TaskDetailPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="orgchart" element={<OrgChartPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="knowledge" element={<KnowledgeLibraryPage />} />
            <Route path="hq-knowledge" element={<HQKnowledgePage />} />
            <Route path="hq-chat" element={<HQChatPage />} />
            <Route path="admin/hierarchy" element={<HierarchySetupPage />} />
            <Route path="admin/branches" element={<BranchesAdminPage />} />
            <Route path="admin/seed" element={<SeedPage />} />
            <Route path="admin/knowledge" element={<KnowledgeAdminPage />} />
          </Route>

          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
