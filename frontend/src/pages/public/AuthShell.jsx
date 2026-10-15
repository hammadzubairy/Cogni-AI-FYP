import { Link } from 'react-router-dom'
import ThemeButton from '../../components/ThemeButton'
import Logo from '../../components/Logo'
import { Icon } from '../../components/IconSprite'

/** Shared layout for public auth pages (login, register, setup, etc.). */
export default function AuthShell({ title, subtitle, children, sideTitle, sideBody }) {
  return (
    <div id="v-login">
      <div className="auth">
        <aside className="side">
          <Logo className="inv" />
          <div>
            <h2>{sideTitle || 'Less time writing papers. More time teaching.'}</h2>
            {sideBody ? <p className="mt">{sideBody}</p> : null}
          </div>
          <div className="row">
            <Link className="btn small" to="/" style={{ width: 'fit-content' }}>
              <Icon name="left" className="sm" /> Back to home
            </Link>
            <ThemeButton className="inv-btn" />
          </div>
        </aside>
        <main className="body" id="login-main">
          <div className="mhead">
            <Logo />
            <span className="row">
              <ThemeButton />
              <Link className="btn small ghost" to="/">
                <Icon name="left" className="sm" /> Home
              </Link>
            </span>
          </div>
          <div>
            <h1>{title}</h1>
            {subtitle ? (
              <p className="small" style={{ margin: '0 0 22px' }}>
                {subtitle}
              </p>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
