import { Route, Routes } from 'react-router-dom'
import AppShell from '../../components/AppShell'
import Dashboard from './Dashboard'
import Departments from './Departments'
import ChangeHead from './ChangeHead'
import Users from './Users'
import AddStaff from './AddStaff'
import Settings from './Settings'
import NotFound from '../NotFound'

/** Admin portal routes inside AppShell (ARCHITECTURE F8). */
export default function AdminApp() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="departments" element={<Departments />} />
        <Route path="departments/:id/head" element={<ChangeHead />} />
        <Route path="users" element={<Users />} />
        <Route path="users/new" element={<AddStaff />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
