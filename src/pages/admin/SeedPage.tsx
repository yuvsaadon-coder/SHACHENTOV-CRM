import { useState } from 'react'

export function SeedPage() {
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; log: string[] } | null>(null)

  const handleSeed = async () => {
    if (!secret.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/.netlify/functions/seed-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; seeded?: string[] }
      if (res.ok && data.ok) {
        setResult({ ok: true, log: data.seeded ?? [] })
      } else {
        setResult({ ok: false, log: [data.error ?? 'Unknown error'] })
      }
    } catch {
      setResult({ ok: false, log: ['Network error — check Netlify function logs'] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4" dir="rtl">
      <h1 className="text-2xl font-bold text-brand-navy">סידינג מסד נתונים</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        <strong>לפני הפעלה:</strong>
        <ol className="list-decimal list-inside mt-1 space-y-1">
          <li>Netlify → Environment Variables → הוסף <code className="bg-yellow-100 px-1 rounded">SEED_SECRET</code> עם ערך סודי</li>
          <li>הכנס כאן את אותו ערך</li>
          <li>לחץ הפעל — ייצרו כל הסניפים, הרכזים ונתוני התפעול</li>
        </ol>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-brand-navy mb-1">מפתח סודי (SEED_SECRET)</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="הזן את ה-SEED_SECRET שהגדרת ב-Netlify"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            dir="ltr"
          />
        </div>

        <button
          onClick={handleSeed}
          disabled={loading || !secret.trim()}
          className="w-full py-2.5 rounded-xl text-white font-medium text-sm transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#141348' }}
        >
          {loading ? 'מריץ סידינג...' : '🌱 הפעל סידינג'}
        </button>
      </div>

      {result && (
        <div
          className={`bg-white rounded-xl border p-4 space-y-2 ${result.ok ? 'border-green-200' : 'border-red-200'}`}
        >
          <div className={`font-bold text-sm ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
            {result.ok ? '✅ הסידינג הסתיים בהצלחה' : '❌ שגיאה בסידינג'}
          </div>
          <div className="space-y-0.5 text-xs font-mono">
            {result.log.map((line, i) => (
              <div key={i} className="text-gray-700">{line}</div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <div className="font-medium text-gray-700 mb-2">מה הסידינג יוצר:</div>
        <div>• 13 סניפים עם נתוני תפעול (זמני חלוקה, סלים, תדירות)</div>
        <div>• 23 רכזים בFirebase Auth ובFirestore users</div>
        <div>• נתוני Excel לסניפי ירושלים (גילה, רמות, בקעה, נחלאות, קרית יובל, קטמון, נווה יעקב)</div>
        <div>• הסידינג idempotent — בטוח להריץ מספר פעמים</div>
      </div>
    </div>
  )
}
