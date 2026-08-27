import * as XLSX from 'xlsx'
import type { Profile } from '@/types/crm'

// Hebrew column headers for profile export
const PROFILE_HEADERS: Record<string, string> = {
  id: 'מזהה',
  firstName: 'שם פרטי',
  lastName: 'שם משפחה',
  phone: 'טלפון',
  email: 'דוא"ל',
  city: 'עיר מגורים',
  district: 'אזור/מחוז',
  organizationName: 'ארגון',
  currentSector: 'מגזר נוכחי',
  role: 'תפקיד',
  hierarchyLevel: 'דרג',
  communityStatus: 'סטטוס קהילתי',
  engagementLevel: 'רמת מעורבות',
  engagementScore: 'ציון מעורבות',
  inPublicSector: 'מכהן במגזר הציבורי',
  influenceLayer: 'שכבת השפעה',
  updatedAt: 'תאריך עדכון',
}

function profileToRow(profile: Profile): Record<string, string | number> {
  return {
    'מזהה': profile.id,
    'שם פרטי': profile.firstName,
    'שם משפחה': profile.lastName,
    'טלפון': profile.phone ?? '',
    'דוא"ל': profile.email ?? '',
    'עיר מגורים': profile.city ?? '',
    'אזור/מחוז': profile.district ?? '',
    'ארגון': profile.organizationName ?? '',
    'מגזר נוכחי': profile.currentSector ?? '',
    'תפקיד': profile.role ?? '',
    'דרג': profile.hierarchyLevel ?? '',
    'מומחיות מקצועית': (profile.professionalExpertise ?? []).join(', '),
    'מומחיות תוכן': (profile.contentExpertise ?? []).join(', '),
    'שכבת השפעה': profile.influenceLayer ?? '',
    'מכהן במגזר הציבורי': profile.inPublicSector ? 'כן' : 'לא',
    'סטטוס קהילתי': profile.communityStatus ?? '',
    'רמת מעורבות': profile.engagementLevel ?? '',
    'ציון מעורבות': profile.engagementScore
      ? `${Math.round(profile.engagementScore * 100)}%`
      : '',
    'הערות': profile.internalNotes ?? '',
  }
}

export function exportProfilesToXlsx(
  profiles: Profile[],
  filename = 'פרופילים_ייצוא'
): void {
  const rows = profiles.map(profileToRow)

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: Object.values(PROFILE_HEADERS),
  })

  // RTL worksheet direction
  if (!ws['!dir']) ws['!dir'] = 'rtl'

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, // מזהה
    { wch: 12 }, // שם פרטי
    { wch: 16 }, // שם משפחה
    { wch: 14 }, // טלפון
    { wch: 24 }, // דוא"ל
    { wch: 14 }, // עיר
    { wch: 10 }, // אזור
    { wch: 28 }, // ארגון
    { wch: 16 }, // מגזר
    { wch: 28 }, // תפקיד
    { wch: 18 }, // דרג
    { wch: 40 }, // מומחיות מקצועית
    { wch: 40 }, // מומחיות תוכן
    { wch: 36 }, // שכבת השפעה
    { wch: 10 }, // מגזר ציבורי
    { wch: 14 }, // סטטוס קהילתי
    { wch: 14 }, // רמת מעורבות
    { wch: 12 }, // ציון מעורבות
    { wch: 30 }, // הערות
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'פרופילים')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportToCsv(profiles: Profile[], filename = 'ייצוא'): void {
  const rows = profiles.map(profileToRow)
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'נתונים')
  XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' })
}
