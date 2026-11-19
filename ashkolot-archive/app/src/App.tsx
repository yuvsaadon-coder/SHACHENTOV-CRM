import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth, devSignIn, isConfigured, logout, microsoftEnabled, signInGoogle, signInMicrosoft, useEmulators } from './lib/firebase.ts'
import { firstRunSetup, isSetUp, loadMyUser, subscribeDocs, subscribeTaxonomy } from './lib/db.ts'
import seedTaxonomy from '../../taxonomy/taxonomy.json'
import seedCatalog from '../../seed/catalog.json'
import { canEdit, type AppUser, type ArchiveDoc } from './lib/model.ts'
import type { Taxonomy } from './lib/taxonomy.ts'
import { AppCtx, errMsg, useRoute } from './context.ts'
import { LOGOS } from './logos.ts'
import ArchivePage from './pages/ArchivePage.tsx'
import DocPage from './pages/DocPage.tsx'
import UploadPage from './pages/UploadPage.tsx'
import EditPage from './pages/EditPage.tsx'
import AdminPage from './pages/AdminPage.tsx'

type Phase =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'no-access'; email: string }
  | { kind: 'first-run'; email: string }
  | { kind: 'ready'; user: AppUser }

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isConfigured) return
    return onAuthStateChanged(auth, async (u: User | null) => {
      setError('')
      if (!u?.email) return setPhase({ kind: 'signed-out' })
      try {
        const me = await loadMyUser(u.email)
        if (me && me.active) return setPhase({ kind: 'ready', user: me })
        // מערכת שעוד לא הוגדרה: הכניסה הראשונה מציעה הגדרה ראשונית
        if (!(await isSetUp().catch(() => true))) return setPhase({ kind: 'first-run', email: u.email })
        setPhase({ kind: 'no-access', email: u.email })
      } catch (e) {
        setPhase({ kind: 'no-access', email: u.email })
        console.warn(e)
      }
    })
  }, [])

  if (!isConfigured)
    return (
      <div className="center">
        <div className="card login">
          <h1>ארכיון אשכולות</h1>
          <p>האפליקציה עדיין לא מחוברת לפרויקט Firebase. יש להגדיר את קובץ <code>.env.local</code> לפי ההוראות ב-README.</p>
        </div>
      </div>
    )

  if (phase.kind === 'loading') return <div className="center muted">טוען…</div>

  if (phase.kind === 'first-run')
    return (
      <div className="center">
        <div className="card login">
          {LOGOS.ashkolot && <img src={LOGOS.ashkolot} alt="אשכולות העשור הבא" />}
          <h1>הגדרה ראשונית</h1>
          <p>הארכיון עדיין ריק. אם זה הפרויקט שלך, לחיצה על הכפתור תיצור את מבנה התיוק ותגדיר את <b dir="ltr">{phase.email}</b> כמנהל/ת.</p>
          <p className="hint">האפשרות הזו קיימת רק פעם אחת, כשהמערכת ריקה. אחר כך מוסיפים משתמשים ממסך הניהול.</p>
          {error && <div className="alert error">{error}</div>}
          <button
            className="primary"
            onClick={async () => {
              try {
                await firstRunSetup(phase.email, seedTaxonomy as unknown as Taxonomy, seedCatalog.nextSeq)
                const me = await loadMyUser(phase.email)
                if (me) setPhase({ kind: 'ready', user: me })
              } catch (e) {
                setError(errMsg(e))
              }
            }}
          >
            הגדרת הארכיון ואני המנהל/ת
          </button>
          <button onClick={() => logout()}>יציאה</button>
        </div>
      </div>
    )

  if (phase.kind === 'signed-out' || phase.kind === 'no-access')
    return (
      <div className="center">
        <div className="card login">
          {LOGOS.ashkolot && <img src={LOGOS.ashkolot} alt="אשכולות העשור הבא" />}
          <h1>אשכולות העשור הבא | <span className="suffix">ארכיון הידע</span></h1>
          <p className="muted">מערכת פנימית לתיוק החומרים המקצועיים של התוכנית.</p>
          {error && <div className="alert error">{error}</div>}
          {phase.kind === 'no-access' ? (
            <>
              <div className="alert warn">
                החשבון {phase.email} אינו מורשה לגשת לארכיון. בקשו ממנהל/ת הארכיון להוסיף אתכם, או התחברו עם חשבון אחר.
              </div>
              <button onClick={() => logout()}>התנתקות</button>
            </>
          ) : (
            <>
              <button className="primary" onClick={() => signInGoogle().catch((e) => setError(errMsg(e)))}>כניסה עם Google</button>
              {microsoftEnabled && <button onClick={() => signInMicrosoft().catch((e) => setError(errMsg(e)))}>כניסה עם Microsoft</button>}
              {useEmulators && <DevLogin onError={setError} />}
            </>
          )}
        </div>
      </div>
    )

  return <Ready user={phase.user} />
}

function Ready({ user }: { user: AppUser }) {
  const [tax, setTax] = useState<Taxonomy | null | undefined>(undefined)
  const [docs, setDocs] = useState<ArchiveDoc[] | null>(null)
  const [error, setError] = useState('')
  const route = useRoute()

  useEffect(() => subscribeTaxonomy(setTax, (e) => setError(errMsg(e))), [])
  useEffect(() => subscribeDocs(user.role, setDocs, (e) => setError(errMsg(e))), [user.role])

  if (error) return <div className="center"><div className="alert error">{error}</div></div>
  if (tax === undefined || docs === null) return <div className="center muted">טוען את הארכיון…</div>
  if (tax === null)
    return <div className="center"><div className="alert warn">מבנה התיוק עדיין לא נזרע. יש להריץ את סקריפט ההתקנה (README).</div></div>

  const [page, arg] = route.path
  let content
  if (page === 'doc' && arg) content = <DocPage id={arg} />
  else if (page === 'upload' && canEdit(user.role)) content = <UploadPage versionOfId={route.params.get('versionOf')} />
  else if (page === 'edit' && arg && canEdit(user.role)) content = <EditPage id={arg} />
  else if (page === 'admin' && user.role === 'admin') content = <AdminPage />
  else content = <ArchivePage />

  const nav = (hash: string, label: string, active: boolean) => (
    <a href={hash} className={active ? 'active' : ''}>{label}</a>
  )

  return (
    <AppCtx.Provider value={{ user, tax, docs }}>
      <div className="logo-row">
        <span className="slot-start">{LOGOS.interior && <img src={LOGOS.interior} alt="משרד הפנים" />}</span>
        <span className="slot-center">{LOGOS.ashkolot && <img src={LOGOS.ashkolot} alt="אשכולות העשור הבא" />}</span>
        <span className="slot-end">{LOGOS.joint && <img src={LOGOS.joint} alt="ג'וינט" />}</span>
      </div>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="ארכיון אשכולות העשור הבא - דף הבית">
          אשכולות העשור הבא | <span className="title-suffix">ארכיון הידע</span>
        </a>
        <nav>
          {nav('#/', 'ארכיון', !page || page === 'doc')}
          {canEdit(user.role) && nav('#/upload', 'העלאה', page === 'upload')}
          {user.role === 'admin' && nav('#/admin', 'ניהול', page === 'admin')}
        </nav>
        <span className="who">
          {user.email} · {user.role === 'admin' ? 'מנהל/ת' : user.role === 'editor' ? 'עורך/ת' : 'צפייה'}
          <button onClick={() => logout()}>יציאה</button>
        </span>
      </header>
      <main>{content}</main>
    </AppCtx.Provider>
  )
}

function DevLogin({ onError }: { onError: (m: string) => void }) {
  const [email, setEmail] = useState('admin@x.org')
  return (
    <div className="alert warn" style={{ marginTop: '1em' }}>
      מצב פיתוח (אמולטור)
      <div className="row" style={{ marginTop: '.4em' }}>
        <input dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="dev email" />
        <button onClick={() => devSignIn(email).catch((e) => onError(errMsg(e)))}>כניסת פיתוח</button>
      </div>
    </div>
  )
}
