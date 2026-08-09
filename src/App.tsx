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
import { CalendarView } from './components/calendar/CalendarView'
import { Spinner } from './components/ui/Spinner'
import { useTasks } from './hooks/useTasks'

function CalendarPage() {
  const { tasks } = useTasks()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-navy">לוח שנה</h1>
      <CalendarView tasks={tasks} />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuth()
  if (loading) return <Spinner size="lg" />
  if (!firebaseUser) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="orgchart" element={<OrgChartPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
