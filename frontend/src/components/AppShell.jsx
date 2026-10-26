import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as api from '../api'
import { ROLE_HOME, useAuth } from '../auth/AuthContext'
import useCounts from '../hooks/useCounts'
import useNotifications from '../hooks/useNotifications'
import { formatShortDate, initials } from '../utils/format'
import { ROLE, activeNavPage, notificationPath } from '../utils/roleNav'
import Logo from './Logo'
import ThemeButton from './ThemeButton'
import { Icon } from './IconSprite'
import { useToast } from './Toast'
import Spinner from './Spinner'
import EmptyState from './EmptyState'

function NotificationDrawer({ open, items, unread, loading, error, onMarkAll, onNote }) {
  if (!open) return null
  return (
    <div className="popover" role="region" aria-label="Notifications">
      <div className="dh">
        <b>Notifications</b>
        {unread ? (
          <button type="button" className="btn ghost small" onClick={onMarkAll}>
            Mark all read
          </button>
        ) : null}
      </div>
      <div className="scroll">
        {loading && !items.length ? (
          <div className="empty">Loading…</div>
        ) : error && !items.length ? (
          <div className="empty">Could not load notifications.</div>
        ) : items.length ? (
          items.slice(0, 25).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`note ${n.read ? '' : 'unread'}`}
              onClick={() => onNote(n)}
            >
              <span className="ud" aria-hidden="true" />
              <span>
                {n.read ? null : <span className="sr-only">Unread: </span>}
                {n.text}
                <span className="t">{formatShortDate(n.created_at)}</span>
              </span>
            </button>
          ))
        ) : (
          <div className="empty">No notifications yet</div>
        )}
      </div>
    </div>
  )
}

/**
 * Authenticated app chrome matching v7 `render()` shell:
 * sidebar, optional admin LLM warning, topnav (bell + account), main, mobile scrim.
 */
export default function AppShell({ children }) {
  const { user, logout, switchRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const role = user?.role
  const R = ROLE[role] || ROLE.admin
  const { counts, refresh: refreshCounts } = useCounts(role)
  const notes = useNotifications(!!user)
  const otherPortals = (user?.roles || []).filter((r) => r && r !== role)

  const [navOpen, setNavOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [llmStatus, setLlmStatus] = useState(null)
  const [switching, setSwitching] = useState(false)

  const bellWrap = useRef(null)
  const menuWrap = useRef(null)

  const active = activeNavPage(location.pathname, location.search) || R.homePage
  const unread = notes.unreadCount

  const footPlace = user?.dept_name || user?.institution_name || 'Institution'
  const footTerm = user?.current_term || ''

  useEffect(() => {
    setNavOpen(false)
    setBellOpen(false)
    setMenuOpen(false)
    document.body.classList.remove('nav-open')
    refreshCounts()
  }, [location.pathname, refreshCounts])

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen)
    return () => document.body.classList.remove('nav-open')
  }, [navOpen])

  useEffect(() => {
    if (!bellOpen && !menuOpen) return undefined
    const onDown = (e) => {
      const t = e.target
      if (bellOpen && bellWrap.current && !bellWrap.current.contains(t)) setBellOpen(false)
      if (menuOpen && menuWrap.current && !menuWrap.current.contains(t)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setBellOpen(false)
        setMenuOpen(false)
        setNavOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [bellOpen, menuOpen])

  useEffect(() => {
    if (role !== 'admin') {
      setLlmStatus(null)
      return undefined
    }
    let cancelled = false
    api
      .getAdminLlmStatus()
      .then((s) => {
        if (!cancelled) setLlmStatus(s)
      })
      .catch(() => {
        if (!cancelled) setLlmStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [role])

  useEffect(() => {
    const cur = R.nav.find((n) => n.page === active)
    document.title = `${cur ? `${cur.label} · ` : ''}Cogni.ai`
  }, [active, R.nav])

  if (!user) return null

  const badgeFor = (key) => {
    if (!key) return 0
    const n = counts[key]
    return typeof n === 'number' && n > 0 ? n : 0
  }

  const onNav = (to) => {
    setNavOpen(false)
    setBellOpen(false)
    setMenuOpen(false)
    navigate(to)
  }

  const onSignOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const onNote = async (n) => {
    try {
      if (!n.read) await notes.markRead(n.id)
    } catch {
      /* still navigate */
    }
    setBellOpen(false)
    const path = notificationPath(n.link)
    if (path) navigate(path)
    else toast('Marked as read')
  }

  const onMarkAll = async () => {
    try {
      await notes.markAllRead()
      toast('All notifications marked as read')
    } catch (err) {
      toast(err?.message || 'Could not mark notifications read', { type: 'error' })
    }
  }

  const showMockLlmBanner = llmStatus?.provider === 'mock'

  return (
    <div id="v-app">
      <div className="app">
        <aside className="sidebar" id="sidebar" aria-label="Portal navigation">
          <div className="sb-head">
            <Logo
              to={R.home}
              onClick={(e) => {
                e.preventDefault()
                onNav(R.home)
              }}
              aria-label="cogni.ai, go to dashboard"
            />
            <button
              type="button"
              className="btn ghost icon sb-close"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
            >
              <Icon name="x" />
            </button>
          </div>
          <div className={`portal r-${role}`}>{R.label}</div>
          <nav aria-label={`${R.name} navigation`}>
            {R.nav.map((item) => {
              const on = item.page === active
              const c = badgeFor(item.badge)
              return (
                <button
                  key={item.page}
                  type="button"
                  className={on ? 'on' : ''}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => onNav(item.to)}
                >
                  <span className="lab">{item.label}</span>
                  {c ? (
                    <span className="cnt">
                      {c}
                      <span className="sr-only"> need attention</span>
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
          <div className="foot">
            {footPlace}
            {footTerm ? ` · ${footTerm}` : ''}
          </div>
        </aside>

        <div className="col">
          {showMockLlmBanner ? (
            <div className="demo-banner" id="llm-banner" role="status">
              <Icon name="warn" className="sm" />
              <span>
                <b>LLM provider is mock.</b> Exam generation uses canned responses until you configure
                a real provider in the server environment.
              </span>
            </div>
          ) : null}

          <header className="topnav" id="topnav">
            <button
              type="button"
              className="btn ghost icon menu-btn"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              aria-controls="sidebar"
              onClick={() => {
                setNavOpen(true)
                setBellOpen(false)
                setMenuOpen(false)
              }}
            >
              <Icon name="menu" />
            </button>
            <Logo
              className="tlogo"
              to={R.home}
              onClick={(e) => {
                e.preventDefault()
                onNav(R.home)
              }}
              aria-label="cogni.ai, go to dashboard"
            />
            <span className="sp" />
            <ThemeButton />
            <div className="pop-wrap" id="bell-wrap" ref={bellWrap}>
              <button
                type="button"
                className="btn ghost icon bellbtn"
                title="Notifications"
                aria-haspopup="true"
                aria-expanded={bellOpen}
                aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                onClick={() => {
                  setBellOpen((v) => !v)
                  setMenuOpen(false)
                }}
              >
                <Icon name="bell" />
                {unread ? (
                  <span className="dotc" aria-hidden="true">
                    {unread}
                  </span>
                ) : null}
              </button>
              <NotificationDrawer
                open={bellOpen}
                items={notes.items}
                unread={unread}
                loading={notes.loading}
                error={notes.error}
                onMarkAll={onMarkAll}
                onNote={onNote}
              />
            </div>

            <div className="pop-wrap" id="menu-wrap" ref={menuWrap}>
              <button
                type="button"
                className="me-btn"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label={`Account menu for ${user.name}`}
                onClick={() => {
                  setMenuOpen((v) => !v)
                  setBellOpen(false)
                }}
              >
                <span className="av" aria-hidden="true">
                  {initials(user.name)}
                </span>
                <span className="txt">
                  <b>{user.name}</b>
                </span>
                <Icon name="chev" className="sm chev" />
              </button>
              {menuOpen ? (
                <div
                  className="popover"
                  style={{ width: 'min(320px, calc(100vw - 24px))' }}
                  role="region"
                  aria-label="Account"
                >
                  <div className="sec">
                    <b>{user.name}</b>
                    <div className="small">{user.email}</div>
                    <div className="small">
                      {R.name}
                      {user.dept_name ? ` · ${user.dept_name}` : ''}
                    </div>
                  </div>
                  {otherPortals.length ? (
                    <div className="sec" aria-label="Switch portal">
                      <div className="small" style={{ marginBottom: 6 }}>
                        Switch portal
                      </div>
                      {otherPortals.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="menu-item"
                          disabled={switching}
                          onClick={async () => {
                            setSwitching(true)
                            try {
                              const u = await switchRole(r)
                              setMenuOpen(false)
                              navigate(ROLE_HOME[u.role] || ROLE_HOME[r] || '/', {
                                replace: true,
                              })
                            } catch (err) {
                              toast(err?.message || 'Could not switch portal.', {
                                type: 'error',
                              })
                            } finally {
                              setSwitching(false)
                            }
                          }}
                        >
                          <Icon name="swap" />
                          {ROLE[r]?.name || r}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className="menu-item danger" onClick={onSignOut}>
                    <Icon name="out" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <main className="main page-enter" id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      <div
        className="scrim"
        id="scrim"
        hidden={!navOpen}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
    </div>
  )
}

/** Shared loading / error / empty helpers for shell children. */
export function ShellLoading({ label = 'Loading…' }) {
  return <Spinner label={label} />
}

export function ShellError({ message, onRetry }) {
  return (
    <div className="callout red">
      <Icon name="alert" />
      <div>
        {message || 'Something went wrong.'}
        {onRetry ? (
          <>
            {' '}
            <button type="button" className="btn small" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function ShellEmpty({ children }) {
  return <EmptyState>{children}</EmptyState>
}
