/**
 * Role portal config mirroring v7 `ROLE` + `PARENT`, expanded with grouped
 * sidebar sections and dynamic class sub-navigation.
 */

export const ROLE = {
  admin: {
    label: 'ADMIN CONSOLE',
    name: 'Admin',
    home: '/app/admin',
    homePage: 'a-dash',
    pre: 'a-',
  },
  hod: {
    label: 'HOD PORTAL',
    name: 'Head of Department',
    home: '/app/hod',
    homePage: 'h-dash',
    pre: 'h-',
  },
  teacher: {
    label: 'TEACHER PORTAL',
    name: 'Teacher',
    home: '/app/teacher',
    homePage: 't-dash',
    pre: 't-',
  },
  student: {
    label: 'STUDENT PORTAL',
    name: 'Student',
    home: '/app/student',
    homePage: 's-dash',
    pre: 's-',
  },
}

/** Detail pages highlight their parent section in the nav (v7 `PARENT`). */
export const PARENT = {
  'a-add': 'a-users',
  'a-hod': 'a-depts',
  'a-classes': 'a-depts',
  'a-audit': 'a-settings',
  't-classes': 't-classes',
  't-class': 't-classes',
  't-exam': 't-exams',
  't-exams': 't-exams',
  't-results': 't-exams',
  't-attempt': 't-flags',
  't-create': 't-create',
  't-materials': 't-materials',
  'h-review': 'h-approvals',
  'h-policy': 'h-analytics',
  's-classes': 's-classes',
  's-class': 's-classes',
  's-exams': 's-exams',
  's-results': 's-results',
  's-take': 's-exams',
  's-done': 's-exams',
  's-feedback': 's-results',
}

const TEACHER_CLASS_TABS = [
  { key: 'overview', label: 'Overview', tab: null },
  { key: 'exams', label: 'Exams', tab: 'exams' },
  { key: 'material', label: 'Material', tab: 'material' },
  { key: 'students', label: 'Students', tab: 'students' },
  { key: 'insights', label: 'Insights', tab: 'insights' },
]

const STUDENT_CLASS_TABS = [
  { key: 'overview', label: 'Overview', tab: null },
  { key: 'exams', label: 'Exams', tab: 'exams' },
  { key: 'results', label: 'Results', tab: 'results' },
  { key: 'material', label: 'Material', tab: 'material' },
]

/** Static sidebar blueprint per role (dynamic classes filled by buildNavSections). */
export function navBlueprint(role) {
  if (role === 'admin') {
    return [
      {
        id: 'overview',
        label: 'Overview',
        items: [{ page: 'a-dash', to: '/app/admin', label: 'Home' }],
      },
      {
        id: 'org',
        label: 'Organisation',
        items: [
          { page: 'a-depts', to: '/app/admin/departments', label: 'Departments' },
          { page: 'a-classes', to: '/app/admin/departments?tab=classes', label: 'Classes' },
        ],
      },
      {
        id: 'people',
        label: 'People',
        items: [
          { page: 'a-users', to: '/app/admin/users', label: 'Users' },
          { page: 'a-add', to: '/app/admin/users/new', label: 'Add staff' },
        ],
      },
      {
        id: 'system',
        label: 'System',
        items: [
          { page: 'a-settings', to: '/app/admin/settings', label: 'Settings' },
          { page: 'a-audit', to: '/app/admin/settings?tab=activity', label: 'Activity log' },
          { page: 'x-ocr', to: '/ocr', label: 'OCR Studio' },
        ],
      },
    ]
  }
  if (role === 'hod') {
    return [
      {
        id: 'overview',
        label: 'Overview',
        items: [{ page: 'h-dash', to: '/app/hod', label: 'Home' }],
      },
      {
        id: 'workflow',
        label: 'Workflow',
        items: [
          { page: 'h-assign', to: '/app/hod/requests', label: 'Requests' },
          {
            page: 'h-approvals',
            to: '/app/hod/approvals',
            label: 'Approvals',
            badge: 'approvals',
          },
        ],
      },
      {
        id: 'department',
        label: 'Faculty',
        items: [
          { page: 'h-analytics', to: '/app/hod/analytics', label: 'Department' },
          { page: 'h-policy', to: '/app/hod/policy', label: 'Policy' },
        ],
      },
      {
        id: 'tools',
        label: 'Tools',
        items: [{ page: 'x-ocr', to: '/ocr', label: 'OCR Studio' }],
      },
    ]
  }
  if (role === 'teacher') {
    return [
      {
        id: 'overview',
        label: 'Overview',
        items: [
          { page: 't-dash', to: '/app/teacher', label: 'Home' },
          {
            page: 't-flags',
            to: '/app/teacher/flags',
            label: 'Review',
            badge: 'review',
          },
        ],
      },
      {
        id: 'classes',
        label: 'Classes',
        items: [{ page: 't-classes', to: '/app/teacher/classes', label: 'All classes' }],
        dynamic: 'classes',
        classBase: '/app/teacher/classes',
        classTabs: TEACHER_CLASS_TABS,
      },
      {
        id: 'papers',
        label: 'Papers',
        items: [
          { page: 't-exams', to: '/app/teacher/exams', label: 'All exams' },
          { page: 't-create', to: '/app/teacher/exams/new', label: 'New draft' },
          { page: 't-materials', to: '/app/teacher/materials', label: 'Materials' },
        ],
      },
      {
        id: 'account',
        label: 'Account',
        items: [
          { page: 't-settings', to: '/app/teacher/settings', label: 'Settings' },
          { page: 'x-ocr', to: '/ocr', label: 'OCR Studio' },
        ],
      },
    ]
  }
  if (role === 'student') {
    return [
      {
        id: 'overview',
        label: 'Overview',
        items: [
          { page: 's-dash', to: '/app/student', label: 'Home', badge: 'live' },
          { page: 's-exams', to: '/app/student/exams', label: 'Live exams' },
          { page: 's-results', to: '/app/student/results', label: 'Results' },
        ],
      },
      {
        id: 'classes',
        label: 'Classes',
        items: [{ page: 's-classes', to: '/app/student/classes', label: 'All classes' }],
        dynamic: 'classes',
        classBase: '/app/student/classes',
        classTabs: STUDENT_CLASS_TABS,
      },
      {
        id: 'study',
        label: 'Study',
        items: [
          { page: 's-study', to: '/app/student/study', label: 'Study assistant' },
          { page: 'x-ocr', to: '/ocr', label: 'OCR Studio' },
        ],
      },
    ]
  }
  return []
}

/** Flat list of top-level nav links (for title lookup / legacy). */
export function flatNavItems(role) {
  const out = []
  for (const section of navBlueprint(role)) {
    for (const item of section.items || []) out.push(item)
  }
  return out
}

/** Keep ROLE.nav as a getter-compatible flat list for older callers. */
Object.defineProperty(ROLE.admin, 'nav', { get: () => flatNavItems('admin') })
Object.defineProperty(ROLE.hod, 'nav', { get: () => flatNavItems('hod') })
Object.defineProperty(ROLE.teacher, 'nav', { get: () => flatNavItems('teacher') })
Object.defineProperty(ROLE.student, 'nav', { get: () => flatNavItems('student') })

function classLabel(c) {
  const code = c.code || c.name || 'Class'
  const name = c.name && c.name !== c.code ? c.name : ''
  if (name) {
    const short = name.length > 28 ? `${name.slice(0, 26)}…` : name
    return `${code} · ${short}`
  }
  return code
}

function classPath(base, id, tab) {
  if (!tab) return `${base}/${id}`
  return `${base}/${id}?tab=${encodeURIComponent(tab)}`
}

/**
 * Build the sidebar model for AppShell.
 * @param {string} role
 * @param {{ classes?: array, pathname?: string, search?: string }} ctx
 */
export function buildNavSections(role, ctx = {}) {
  const classes = Array.isArray(ctx.classes) ? ctx.classes : []
  const pathname = ctx.pathname || ''
  const search = ctx.search || ''
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const activeTab = params.get('tab') || 'overview'
  const classMatch = pathname.match(/\/classes\/([^/]+)\/?$/)
  const activeClassId = classMatch ? decodeURIComponent(classMatch[1]) : null

  return navBlueprint(role).map((section) => {
    const items = [...(section.items || [])]
    const children = []
    if (section.dynamic === 'classes') {
      for (const c of classes) {
        const open = activeClassId === c.id
        const tabs = (section.classTabs || []).map((t) => ({
          key: `${c.id}:${t.key}`,
          label: t.label,
          to: classPath(section.classBase, c.id, t.tab),
          on: open && (t.tab ? activeTab === t.tab : activeTab === 'overview' || !params.get('tab')),
        }))
        children.push({
          key: c.id,
          label: classLabel(c),
          to: classPath(section.classBase, c.id, null),
          on: open,
          tabs: open ? tabs : [],
        })
      }
    }
    return {
      id: section.id,
      label: section.label,
      items,
      children,
    }
  })
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
    't-settings': '/app/teacher/settings',
    's-dash': '/app/student',
    's-classes': '/app/student/classes',
    's-class': id ? `/app/student/classes/${id}` : '/app/student/classes',
    's-exams': '/app/student/exams',
    's-take': id ? `/app/student/exams/${id}/take` : '/app/student/exams',
    's-done': id ? `/app/student/attempts/${id}/done` : '/app/student',
    's-results': '/app/student/results',
    's-feedback': id ? `/app/student/attempts/${id}/feedback` : '/app/student/results',
    's-study': '/app/student/study',
    'x-ocr': '/ocr',
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
    [/^\/app\/teacher\/settings$/, 't-settings'],
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
    [/^\/ocr$/, 'x-ocr'],
  ]
  for (const [re, page] of rules) {
    if (re.test(p)) return page
  }
  return null
}

export function activeNavPage(pathname, search = '') {
  const page = pathToPage(pathname, search)
  if (!page) return null
  // Prefer exact page when it is a real sidebar leaf (sub-tabs like a-classes).
  const exactLeaves = new Set([
    'a-dash',
    'a-depts',
    'a-classes',
    'a-users',
    'a-add',
    'a-settings',
    'a-audit',
    'h-dash',
    'h-assign',
    'h-approvals',
    'h-analytics',
    'h-policy',
    't-dash',
    't-flags',
    't-classes',
    't-class',
    't-exams',
    't-create',
    't-materials',
    't-settings',
    's-dash',
    's-exams',
    's-results',
    's-classes',
    's-class',
    's-study',
    'x-ocr',
  ])
  if (exactLeaves.has(page)) return page
  return PARENT[page] || page
}
