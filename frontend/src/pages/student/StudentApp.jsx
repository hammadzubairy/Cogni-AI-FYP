import { Route, Routes } from 'react-router-dom'
import AppShell from '../../components/AppShell'
import NotFound from '../NotFound'
import Dashboard from './Dashboard'
import Classes from './Classes'
import ClassDetail from './ClassDetail'
import Exams from './Exams'
import TakeExam from './TakeExam'
import ExamDone from './ExamDone'
import Results from './Results'
import Feedback from './Feedback'
import StudyAssistant from './StudyAssistant'

/** Student portal routes inside AppShell (ARCHITECTURE F7). */
export default function StudentApp() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/:id/take" element={<TakeExam />} />
        <Route path="attempts/:id/done" element={<ExamDone />} />
        <Route path="results" element={<Results />} />
        <Route path="attempts/:id/feedback" element={<Feedback />} />
        <Route path="study" element={<StudyAssistant />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
