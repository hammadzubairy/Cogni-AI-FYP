import { Route, Routes } from 'react-router-dom'
import AppShell from '../../components/AppShell'
import Dashboard from './Dashboard'
import Approvals from './Approvals'
import Review from './Review'
import Requests from './Requests'
import Analytics from './Analytics'
import Policy from './Policy'
import NotFound from '../NotFound'

/** HOD portal routes inside AppShell (ARCHITECTURE F6). */
export default function HodApp() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="requests" element={<Requests />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="approvals/:id" element={<Review />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="policy" element={<Policy />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
