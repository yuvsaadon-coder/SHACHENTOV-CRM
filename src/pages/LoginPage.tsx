import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { auth } from '../lib/firebase'

type LoginMode = 'hq' | 'coordinator'

export function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<LoginMode>('hq')

  // HQ
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Coordinator
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleHQ = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch {
      setError('אימייל או סיסמה שגויים')
    } finally {
      setLoading(false)
    }
  }

  const handleCoordinator = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/portal-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      })
      const data = await res.json() as { token?: string; error?: string }
      if (!res.ok || !data.token) {
        setError(data.error ?? 'שם או טלפון שגויים')
        return
      }
      await signInWithCustomToken(auth, data.token)
      navigate('/portal/home', { replace: true })
    } catch {
      setError('שגיאת רשת, נסה שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#189A9F' }}
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Logo */}
        <div className="flex flex-col items-center pt-8 pb-5 px-8">
          <div className="h-24 w-24 rounded-full bg-white shadow-md flex items-center justify-center mb-3 p-2 border border-gray-100">
            <img src="/logo_shachentov.png" alt="שכן טוב" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#141348' }}>שכן טוב</h1>
          <p className="text-sm" style={{ color: '#3A3A6B' }}>מערכת ניהול תפעולי</p>
        </div>

        {/* Mode tabs */}
        <div className="flex mx-6 mb-6 rounded-xl border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => { setMode('hq'); setError('') }}
            className="flex-1 py-2 font-medium transition-colors"
            style={{
              backgroundColor: mode === 'hq' ? '#141348' : 'transparent',
              color: mode === 'hq' ? 'white' : '#6B7280',
            }}
          >
            כניסת מטה
          </button>
          <button
            onClick={() => { setMode('coordinator'); setError('') }}
            className="flex-1 py-2 font-medium transition-colors"
            style={{
              backgroundColor: mode === 'coordinator' ? '#141348' : 'transparent',
              color: mode === 'coordinator' ? 'white' : '#6B7280',
            }}
          >
            כניסת רכזים
          </button>
        </div>

        <div className="px-8 pb-8">
          {mode === 'hq' ? (
            <form onSubmit={handleHQ} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>אימייל</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  placeholder="your@email.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>סיסמה</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  dir="ltr"
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                />
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-white font-medium text-sm transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#141348' }}
              >
                {loading ? 'מתחבר...' : 'כניסה'}
              </button>
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">או</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setError('')
                  setLoading(true)
                  try {
                    await signInWithGoogle()
                    navigate('/dashboard')
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'שגיאה בכניסה עם גוגל')
                  } finally {
                    setLoading(false)
                  }
                }}
                className="w-full py-2.5 rounded-xl font-medium text-sm border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
                style={{ color: '#374151' }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                כניסה עם Google
              </button>
            </form>
          ) : (
            <form onSubmit={handleCoordinator} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>שם מלא</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="למשל: שירה גולדברג"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#141348' }}>מספר טלפון</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  dir="ltr"
                  placeholder="052-0000000"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#189A9F]"
                />
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-white font-medium text-sm transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#189A9F' }}
              >
                {loading ? 'מתחבר...' : 'כניסה לפורטל'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
