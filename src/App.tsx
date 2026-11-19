import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useInitialPassword } from './hooks/useInitialPassword'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { DashboardPage } from './pages/DashboardPage'
import { TasksPage } from './pages/TasksPage'
import { PersonalTasksPage } from './pages/PersonalTasksPage'
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
import { PortalVolunteers } from './pages/portal/PortalVolunteers'
import { PortalBranch } from './pages/portal/PortalBranch'
import { VolunteerPage } from './pages/VolunteerPage'
import { BranchesAdminPage } from './pages/admin/BranchesAdminPage'
import { KnowledgeAdminPage } from './pages/admin/KnowledgeAdminPage'
import { ReportQuestionsAdminPage } from './pages/admin/ReportQuestionsAdminPage'
import { UsersAdminPage } from './pages/admin/UsersAdminPage'
import { AccountPage } from './pages/AccountPage'
import { BranchesPage } from './pages/BranchesPage'
import { ReportsPage } from './pages/ReportsPage'
import { KnowledgeLibraryPage } from './pages/KnowledgeLibraryPage'
import { HQKnowledgeShell } from './pages/HQKnowledgeShell'
import { PartnersSuppliersShell } from './pages/PartnersSuppliersShell'
import { HQChatPage } from './pages/HQChatPage'
import { Spinner } from './components/ui/Spinner'
import { ToastProvider } from './context/ToastContext'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, access, loading } = useAuth()
  const mustChangePassword = useInitialPassword()
  const { pathname } = useLocation()
  if (loading) return <Spinner size="lg" />
  if (!firebaseUser || !appUser) return <Navigate to="/login" replace />
  if (access === 'coordinator') return <Navigate to="/portal/home" replace />
  if (mustChangePassword && pathname !== '/account') return <Navigate to="/account" replace state={{ mustChangePassword: true }} />
  return <>{children}</>
}

function RequireCoordinator({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, access, loading } = useAuth()
  if (loading) return <Spinner size="lg" />
  if (!firebaseUser || !appUser) return <Navigate to="/login" replace />
  if (access !== 'coordinator') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function SmartRedirect() {
  const { appUser, access, loading } = useAuth()
  if (loading) return <Spinner size="lg" />
  if (!appUser) return <Navigate to="/login" replace />
  if (access === 'coordinator') return <Navigate to="/portal/home" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal/login" element={<Navigate to="/login" replace />} />

          {/* Public volunteer self-service page — no auth required */}
          <Route path="/v/:token" element={<VolunteerPage />} />

          {/* Home screen — no sidebar */}
          <Route path="/dashboard" element={<RequireAuth><HomePage /></RequireAuth>} />

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
            <Route path="volunteers" element={<PortalVolunteers />} />
            <Route path="branch" element={<PortalBranch />} />
          </Route>

          {/* HQ — with sidebar */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="overview" element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:id" element={<TaskDetailPage />} />
            <Route path="my-tasks" element={<PersonalTasksPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="orgchart" element={<OrgChartPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="knowledge" element={<KnowledgeLibraryPage />} />
            <Route path="hq-knowledge" element={<HQKnowledgeShell />} />
            <Route path="partners-suppliers" element={<PartnersSuppliersShell />} />
            <Route path="hq-chat" element={<HQChatPage />} />
            <Route path="admin/hierarchy" element={<HierarchySetupPage />} />
            <Route path="admin/branches" element={<BranchesAdminPage />} />
            <Route path="admin/knowledge" element={<KnowledgeAdminPage />} />
            <Route path="admin/report-questions" element={<ReportQuestionsAdminPage />} />
            <Route path="admin/users" element={<UsersAdminPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>

          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
