import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen bg-brand-teal flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo_shachentov.png" alt="שכן טוב" className="h-20 w-20 rounded-full object-cover mb-3" />
          <h1 className="text-xl font-bold text-brand-navy">שכן טוב</h1>
          <p className="text-sm text-brand-navy2">מערכת ניהול תפעולי</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="your@email.com"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-teal hover:bg-brand-tealDark text-white font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
          >
            {loading ? 'מתחבר...' : 'כניסה למערכת'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          סיסמה זמנית: Shachen2027! — שנה אחרי כניסה ראשונה
        </p>
      </div>
    </div>
  )
}
