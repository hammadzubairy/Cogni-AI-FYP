import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import ThemeButton from '../../components/ThemeButton'
import Logo from '../../components/Logo'
import { Icon, Illo } from '../../components/IconSprite'

function smoothScrollTo(id) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export default function Landing() {
  const navigate = useNavigate()
  const { publicConfig } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const signupEnabled = publicConfig?.student_signup_enabled !== false
  const institution = publicConfig?.institution_name

  useEffect(() => {
    document.title = 'Cogni.ai · AI-assisted exam platform'
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (
      !('IntersectionObserver' in window) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      els.forEach((el) => el.classList.add('in'))
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in')
            io.unobserve(en.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const goLogin = () => navigate('/login')

  const onAnchor = (e, id) => {
    e.preventDefault()
    setMenuOpen(false)
    smoothScrollTo(id)
  }

  return (
    <div id="v-landing">
      <header className="lnav-wrap">
        <nav className="lnav" aria-label="Main">
          <Logo to="#top" onClick={(e) => onAnchor(e, 'top')} aria-label="cogni.ai home" />
          <div className="links">
            <a href="#how" onClick={(e) => onAnchor(e, 'how')}>
              How it works
            </a>
            <a href="#roles" onClick={(e) => onAnchor(e, 'roles')}>
              Roles
            </a>
          </div>
          <span className="sp" />
          <ThemeButton />
          <button type="button" className="btn ghost hide-sm" onClick={goLogin}>
            Sign in
          </button>
          {signupEnabled ? (
            <button type="button" className="btn primary hide-sm" onClick={() => navigate('/register')}>
              Create account
            </button>
          ) : null}
          <button
            type="button"
            className="btn icon ghost menu-btn"
            aria-expanded={menuOpen}
            aria-controls="mnav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} />
          </button>
        </nav>
      </header>
      <nav
        className="mnav"
        id="mnav"
        hidden={!menuOpen}
        aria-label="Mobile menu"
      >
        <a href="#how" onClick={(e) => onAnchor(e, 'how')}>
          How it works
        </a>
        <a href="#roles" onClick={(e) => onAnchor(e, 'roles')}>
          Roles
        </a>
        <button type="button" onClick={goLogin}>
          Sign in
        </button>
        {signupEnabled ? (
          <button type="button" onClick={() => navigate('/register')}>
            Create account
          </button>
        ) : null}
      </nav>
      <main id="top">
        <section className="lhero" aria-labelledby="hero-h">
          <div className="lglow" aria-hidden="true" />
          <span className="kick">
            <b aria-hidden="true" />
            {institution ? `${institution} · ` : ''}For teachers, HODs, students and admins
          </span>
          <h1 id="hero-h">
            From notes to <span>graded</span> exams
          </h1>
          <p className="sub">
            Turn course notes into a balanced exam in minutes. AI drafts and grades, and people
            approve every step.
          </p>
          <div className="ctas">
            <button type="button" className="btn primary lg" onClick={goLogin}>
              Sign in <Icon name="arrow" />
            </button>
            {signupEnabled ? (
              <button type="button" className="btn lg" onClick={() => navigate('/register')}>
                Create account
              </button>
            ) : (
              <a className="btn lg" href="#how" onClick={(e) => onAnchor(e, 'how')}>
                See how it works
              </a>
            )}
          </div>
          <figure className="pv" aria-label="Preview of the teacher dashboard">
            <div className="pv-bar" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="pv-app" aria-hidden="true">
              <div className="pv-side">
                <Logo className="sm" />
                <div className="pv-it on">Home</div>
                <div className="pv-it">Classes</div>
                <div className="pv-it">
                  Review <u>3</u>
                </div>
              </div>
              <div className="pv-main">
                <div className="pv-date">Monday, 29 September</div>
                <div className="pv-h">Good morning, Alex</div>
                <div className="pv-focus">
                  <div>
                    <small>Next up</small>
                    <strong>3 answers flagged as possibly AI-written in Quiz 3</strong>
                    <em>Review them before you release results to 6 students.</em>
                  </div>
                  <span className="btn primary sm">Review flags</span>
                </div>
                <div className="pv-cols">
                  <div>
                    <div className="pv-sec">Needs you</div>
                    <div className="pv-row">
                      <span>Midterm requested by your HOD</span>
                      <span className="pill p-grey">Request</span>
                    </div>
                    <div className="pv-row">
                      <span>Release results for Quiz 3</span>
                      <span className="pill p-grey">4 of 6 in</span>
                    </div>
                    <div className="pv-row">
                      <span>Finish draft: CPU scheduling quiz</span>
                      <span className="pill p-ai">AI draft</span>
                    </div>
                  </div>
                  <div>
                    <div className="pv-sec">This week</div>
                    <div className="pv-num">
                      <span>Live exams</span>
                      <b>4</b>
                    </div>
                    <div className="pv-num">
                      <span>Waiting on HOD</span>
                      <b>1</b>
                    </div>
                    <div className="pv-num">
                      <span>Class average</span>
                      <b>72%</b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </figure>
        </section>

        <section className="lsec" id="how" aria-labelledby="how-h">
          <div className="lwrap reveal">
            <span className="eyebrow">How it works</span>
            <h2 id="how-h">Six steps. A person signs off at every gate.</h2>
            <ol className="steps">
              <li>
                <Illo name="upload" />
                <span className="step-n">01 · Teacher</span>
                <h3>Upload material</h3>
                <p>A PDF, notes or a link, split into topics and course outcomes.</p>
              </li>
              <li>
                <Illo name="approve" />
                <span className="step-n">02 · AI</span>
                <h3>Generate a draft</h3>
                <p>
                  MCQ, short and essay questions across Bloom&apos;s levels. The teacher edits it.
                </p>
              </li>
              <li>
                <Illo name="hod" />
                <span className="step-n">03 · HOD</span>
                <h3>Approve the paper</h3>
                <p>
                  Policy checks for outcome coverage and repeats. Approve or return with comments.
                </p>
              </li>
              <li>
                <Illo name="attempt" />
                <span className="step-n">04 · Student</span>
                <h3>Attempt the exam</h3>
                <p>A timed exam with auto-save, from the class page.</p>
              </li>
              <li>
                <Illo name="empty" />
                <span className="step-n">05 · Teacher</span>
                <h3>Grade and review</h3>
                <p>
                  AI scores written answers and flags possible AI writing. Only the teacher changes
                  grades.
                </p>
              </li>
              <li>
                <Illo name="feedback" />
                <span className="step-n">06 · Student</span>
                <h3>Get feedback</h3>
                <p>A topic-by-topic breakdown and a study plan.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="lsec" id="roles" aria-labelledby="roles-h">
          <div className="lwrap reveal">
            <span className="eyebrow">Four roles</span>
            <h2 id="roles-h">Everyone sees only their part.</h2>
            <ul className="roles-grid">
              <li>
                <b>Teacher</b>
                <span>Creates papers, grades and releases feedback.</span>
              </li>
              <li>
                <b>Head of department</b>
                <span>Approves papers and watches quality.</span>
              </li>
              <li>
                <b>Student</b>
                <span>Takes timed exams and learns from the results.</span>
              </li>
              <li>
                <b>Admin</b>
                <span>Sets up users, departments and rules.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="lsec" aria-labelledby="cta-h">
          <div className="lwrap reveal">
            <div className="lcta">
              <h2 id="cta-h">Ready for your institution?</h2>
              <p>Sign in with your work email, or create an account when signup is open.</p>
              <div className="row" style={{ justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn primary lg" onClick={goLogin}>
                  Sign in <Icon name="arrow" />
                </button>
                {signupEnabled ? (
                  <button type="button" className="btn lg" onClick={() => navigate('/register')}>
                    Create account
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="lfoot2" aria-labelledby="foot-h">
        <h2 id="foot-h" className="sr-only">
          About cogni.ai
        </h2>
        <div className="lwrap lf-grid">
          <div className="lf-brand">
            <Logo />
            <p>AI drafts exams and grades answers. People approve every step.</p>
            <button type="button" className="btn primary" onClick={goLogin}>
              Sign in
            </button>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <a href="#how" onClick={(e) => onAnchor(e, 'how')}>
              How it works
            </a>
            <a href="#roles" onClick={(e) => onAnchor(e, 'roles')}>
              Roles
            </a>
            <a href="#top" onClick={(e) => onAnchor(e, 'top')}>
              Back to top
            </a>
          </nav>
          <div>
            <h3>Contact</h3>
            <a href="mailto:hello@cogni.ai">hello@cogni.ai</a>
            <span>Final-year project team</span>
            <span>Department of Computer Science</span>
          </div>
          <div>
            <h3>Project</h3>
            <span>Final-year project · 2026</span>
            <span>Built with React, FastAPI and MongoDB</span>
          </div>
        </div>
        <div className="lwrap lf-bottom">
          <span>© 2026 cogni.ai</span>
          <span>Made for teachers, HODs, students and admins</span>
        </div>
      </footer>
    </div>
  )
}
