import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { useAuth } from '../context/AuthContext'
import { auth } from '../lib/firebase'

type LoginMode = 'hq' | 'coordinator'

export function LoginPage() {
  const { signIn } = useAuth()
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
          <img src="/logo_shachentov.png" alt="שכן טוב" className="h-20 w-20 rounded-full object-cover mb-3" />
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
