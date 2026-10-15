import { Route, Routes } from 'react-router-dom'
import AppShell from '../../components/AppShell'
import Dashboard from './Dashboard'
import Classes from './Classes'
import ClassDetail from './ClassDetail'
import Materials from './Materials'
import CreateExam from './CreateExam'
import Exams from './Exams'
import ExamEditor from './ExamEditor'
import Results from './Results'
import AttemptReview from './AttemptReview'
import Flags from './Flags'
import NotFound from '../NotFound'

/** Teacher portal routes inside AppShell (ARCHITECTURE F4 + F8). */
export default function TeacherApp() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail />} />
        <Route path="materials" element={<Materials />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/new" element={<CreateExam />} />
        <Route path="exams/:id" element={<ExamEditor />} />
        <Route path="exams/:id/results" element={<Results />} />
        <Route path="attempts/:id" element={<AttemptReview />} />
        <Route path="flags" element={<Flags />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
