import { GuideView } from '../../components/guide/GuideView'
import { COORDINATOR_GUIDE } from '../../content/guides'

export function PortalGuide() {
  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-2 max-w-3xl mx-auto">
        <span className="text-2xl">📘</span>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#141348' }}>מדריך למשתמש</h1>
          <p className="text-xs text-gray-500 mt-0.5">מה יש בפורטל ואיך עושים כל דבר</p>
        </div>
      </div>
      <GuideView guides={[COORDINATOR_GUIDE]} />
    </div>
  )
}
