/**
 * Role portal config mirroring v7 `ROLE` + `PARENT`.
 * Nav badges are filled by useCounts(); paths follow docs/ARCHITECTURE.md.
 */

export const ROLE = {
  admin: {
    label: 'ADMIN CONSOLE',
    name: 'Admin',
    home: '/app/admin',
    homePage: 'a-dash',
    pre: 'a-',
    nav: [
      { page: 'a-dash', to: '/app/admin', label: 'Home' },
      { page: 'a-depts', to: '/app/admin/departments', label: 'Departments' },
      { page: 'a-users', to: '/app/admin/users', label: 'Users' },
      { page: 'a-settings', to: '/app/admin/settings', label: 'Settings' },
    ],
  },
  hod: {
    label: 'HOD PORTAL',
    name: 'Head of Department',
    home: '/app/hod',
    homePage: 'h-dash',
    pre: 'h-',
    nav: [
      { page: 'h-dash', to: '/app/hod', label: 'Home' },
      { page: 'h-assign', to: '/app/hod/requests', label: 'Requests' },
      { page: 'h-approvals', to: '/app/hod/approvals', label: 'Approvals', badge: 'approvals' },
      { page: 'h-analytics', to: '/app/hod/analytics', label: 'Department' },
    ],
  },
  teacher: {
    label: 'TEACHER PORTAL',
    name: 'Teacher',
    home: '/app/teacher',
    homePage: 't-dash',
    pre: 't-',
    nav: [
      { page: 't-dash', to: '/app/teacher', label: 'Home' },
      { page: 't-flags', to: '/app/teacher/flags', label: 'Review', badge: 'review' },
    ],
  },
  student: {
    label: 'STUDENT PORTAL',
    name: 'Student',
    home: '/app/student',
    homePage: 's-dash',
    pre: 's-',
    nav: [
      { page: 's-dash', to: '/app/student', label: 'Home', badge: 'live' },
      { page: 's-study', to: '/app/student/study', label: 'Study assistant' },
    ],
  },
}

/** Detail pages highlight their parent section in the nav (v7 `PARENT`). */
export const PARENT = {
  'a-add': 'a-users',
  'a-hod': 'a-depts',
  'a-classes': 'a-depts',
  'a-audit': 'a-settings',
  't-classes': 't-dash',
  't-class': 't-dash',
  't-exam': 't-dash',
  't-exams': 't-dash',
  't-results': 't-dash',
  't-attempt': 't-dash',
  't-create': 't-dash',
  't-materials': 't-dash',
  'h-review': 'h-approvals',
  'h-policy': 'h-analytics',
  's-classes': 's-dash',
  's-class': 's-dash',
  's-exams': 's-dash',
  's-results': 's-dash',
  's-take': 's-dash',
  's-done': 's-dash',
  's-feedback': 's-dash',
}

/** Map v7 page id (+ optional id) to a React Router path. */
export function pageToPath(page, id) {
  if (!page) return null
  const map = {
    'a-dash': '/app/admin',
    'a-depts': '/app/admin/departments',
    'a-classes': '/app/admin/departments?tab=classes',
    'a-hod': id ? `/app/admin/departments/${id}/head` : '/app/admin/departments',
    'a-users': '/app/admin/users',
    'a-add': '/app/admin/users/new',
    'a-settings': '/app/admin/settings',
    'a-audit': '/app/admin/settings?tab=activity',
    'h-dash': '/app/hod',
    'h-assign': '/app/hod/requests',
    'h-approvals': '/app/hod/approvals',
    'h-review': id ? `/app/hod/approvals/${id}` : '/app/hod/approvals',
    'h-analytics': '/app/hod/analytics',
    'h-policy': '/app/hod/policy',
    't-dash': '/app/teacher',
    't-classes': '/app/teacher/classes',
    't-class': id ? `/app/teacher/classes/${id}` : '/app/teacher/classes',
    't-materials': '/app/teacher/materials',
    't-create': id ? `/app/teacher/exams/new?req=${encodeURIComponent(id)}` : '/app/teacher/exams/new',
    't-exams': '/app/teacher/exams',
    't-exam': id ? `/app/teacher/exams/${id}` : '/app/teacher/exams',
    't-results': id ? `/app/teacher/exams/${id}/results` : '/app/teacher/exams',
    't-attempt': id ? `/app/teacher/attempts/${id}` : '/app/teacher',
    't-flags': '/app/teacher/flags',
    's-dash': '/app/student',
    's-classes': '/app/student/classes',
    's-class': id ? `/app/student/classes/${id}` : '/app/student/classes',
    's-exams': '/app/student/exams',
    's-take': id ? `/app/student/exams/${id}/take` : '/app/student/exams',
    's-done': id ? `/app/student/attempts/${id}/done` : '/app/student',
    's-results': '/app/student/results',
    's-feedback': id ? `/app/student/attempts/${id}/feedback` : '/app/student/results',
    's-study': '/app/student/study',
  }
  return map[page] || null
}

/** Resolve notification `link: { page, id }` to a path. */
export function notificationPath(link) {
  if (!link || !link.page) return null
  return pageToPath(link.page, link.id)
}

/** Best-effort v7 page id from the current pathname (+ optional search). */
export function pathToPage(pathname, search = '') {
  const p = pathname.replace(/\/$/, '') || '/'
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (p === '/app/admin/departments' && params.get('tab') === 'classes') {
    return 'a-classes'
  }
  if (p === '/app/admin/settings' && params.get('tab') === 'activity') {
    return 'a-audit'
  }
  const rules = [
    [/^\/app\/admin\/departments\/[^/]+\/head$/, 'a-hod'],
    [/^\/app\/admin\/departments$/, 'a-depts'],
    [/^\/app\/admin\/users\/new$/, 'a-add'],
    [/^\/app\/admin\/users$/, 'a-users'],
    [/^\/app\/admin\/settings$/, 'a-settings'],
    [/^\/app\/admin$/, 'a-dash'],
    [/^\/app\/hod\/approvals\/[^/]+$/, 'h-review'],
    [/^\/app\/hod\/approvals$/, 'h-approvals'],
    [/^\/app\/hod\/requests$/, 'h-assign'],
    [/^\/app\/hod\/analytics$/, 'h-analytics'],
    [/^\/app\/hod\/policy$/, 'h-policy'],
    [/^\/app\/hod$/, 'h-dash'],
    [/^\/app\/teacher\/flags$/, 't-flags'],
    [/^\/app\/teacher\/attempts\/[^/]+$/, 't-attempt'],
    [/^\/app\/teacher\/exams\/[^/]+\/results$/, 't-results'],
    [/^\/app\/teacher\/exams\/new$/, 't-create'],
    [/^\/app\/teacher\/exams\/[^/]+$/, 't-exam'],
    [/^\/app\/teacher\/exams$/, 't-exams'],
    [/^\/app\/teacher\/materials$/, 't-materials'],
    [/^\/app\/teacher\/classes\/[^/]+$/, 't-class'],
    [/^\/app\/teacher\/classes$/, 't-classes'],
    [/^\/app\/teacher$/, 't-dash'],
    [/^\/app\/student\/study$/, 's-study'],
    [/^\/app\/student\/attempts\/[^/]+\/feedback$/, 's-feedback'],
    [/^\/app\/student\/attempts\/[^/]+\/done$/, 's-done'],
    [/^\/app\/student\/exams\/[^/]+\/take$/, 's-take'],
    [/^\/app\/student\/exams$/, 's-exams'],
    [/^\/app\/student\/results$/, 's-results'],
    [/^\/app\/student\/classes\/[^/]+$/, 's-class'],
    [/^\/app\/student\/classes$/, 's-classes'],
    [/^\/app\/student$/, 's-dash'],
  ]
  for (const [re, page] of rules) {
    if (re.test(p)) return page
  }
  return null
}

export function activeNavPage(pathname, search = '') {
  const page = pathToPage(pathname, search)
  if (!page) return null
  return PARENT[page] || page
}
