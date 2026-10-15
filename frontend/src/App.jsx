import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import IconSprite from './components/IconSprite'
import { ThemeProvider } from './hooks/useTheme'
import { AuthProvider } from './auth/AuthContext'
import AuthRedirector from './auth/AuthRedirector'
import { ModalProvider } from './components/Modal'
import { ToastProvider } from './components/Toast'
import RoleRoute from './auth/RoleRoute'
import Landing from './pages/public/Landing'
import Login from './pages/public/Login'
import Setup from './pages/public/Setup'
import Register from './pages/public/Register'
import VerifyEmail from './pages/public/VerifyEmail'
import Forgot from './pages/public/Forgot'
import Reset from './pages/public/Reset'
import ChangePassword from './pages/public/ChangePassword'
import AdminApp from './pages/admin/AdminApp'
import TeacherApp from './pages/teacher/TeacherApp'
import HodApp from './pages/hod/HodApp'
import StudentApp from './pages/student/StudentApp'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <ModalProvider>
            <IconSprite />
            <BrowserRouter>
              <AuthRedirector>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/setup" element={<Setup />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/verify/:token" element={<VerifyEmail />} />
                  <Route path="/forgot" element={<Forgot />} />
                  <Route path="/reset/:token" element={<Reset />} />
                  <Route path="/change-password" element={<ChangePassword />} />

                  <Route
                    path="/app/admin/*"
                    element={
                      <RoleRoute roles={['admin']}>
                        <AdminApp />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/app/hod/*"
                    element={
                      <RoleRoute roles={['hod']}>
                        <HodApp />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/app/teacher/*"
                    element={
                      <RoleRoute roles={['teacher']}>
                        <TeacherApp />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/app/student/*"
                    element={
                      <RoleRoute roles={['student']}>
                        <StudentApp />
                      </RoleRoute>
                    }
                  />

                  <Route path="/app" element={<Navigate to="/login" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AuthRedirector>
            </BrowserRouter>
          </ModalProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
