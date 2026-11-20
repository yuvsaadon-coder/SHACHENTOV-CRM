import { GuideView } from '../components/guide/GuideView'
import { HQ_GUIDE } from '../content/guides'

export function GuidePage() {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-2xl">📘</span>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#141348' }}>מדריך למשתמש</h1>
          <p className="text-sm text-gray-500 mt-0.5">מה יש במערכת, מה כל מסך עושה, והנחיות שלב אחר שלב</p>
        </div>
      </div>
      <GuideView guides={[HQ_GUIDE]} />
    </div>
  )
}
