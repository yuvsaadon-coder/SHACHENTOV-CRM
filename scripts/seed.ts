/**
 * Seed script: populates Firestore with taxonomy, demo programs/cohorts,
 * 30 demo profiles + enrollments, and 2 demo Firebase Auth users.
 *
 * Run: npx ts-node --project tsconfig.json scripts/seed.ts
 * Requires: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
 *           FIREBASE_ADMIN_PRIVATE_KEY in environment (or .env.local loaded manually)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const app = getAdminApp()
const db = getFirestore(app)
const auth = getAuth(app)

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

const SETTLEMENTS_MAP: Record<string, string> = {
  'ירושלים': 'ירושלים', 'בית שמש': 'ירושלים', 'מעלה אדומים': 'ירושלים',
  'תל אביב': 'מרכז', 'ראשון לציון': 'מרכז', 'פתח תקווה': 'מרכז',
  'חיפה': 'צפון', 'נצרת': 'צפון', 'עפולה': 'צפון', 'כרמיאל': 'צפון',
  'באר שבע': 'דרום', 'אילת': 'דרום', 'אשקלון': 'דרום', 'נתיבות': 'דרום',
  'רמת גן': 'מרכז', 'נס ציונה': 'מרכז', 'רחובות': 'מרכז', 'הרצליה': 'מרכז',
  'נתניה': 'מרכז', 'רעננה': 'מרכז', 'כפר סבא': 'מרכז', 'הוד השרון': 'מרכז',
  'רמלה': 'מרכז', 'לוד': 'מרכז', 'מודיעין': 'מרכז', 'אשדוד': 'מרכז',
  'טבריה': 'צפון', 'עכו': 'צפון', 'נהריה': 'צפון', 'קריית שמונה': 'צפון',
  'בני ברק': 'מרכז', 'חולון': 'מרכז', 'בת ים': 'מרכז', 'אור יהודה': 'מרכז',
}

const ORGANIZATIONS_LIST = [
  'משרד האוצר', 'משרד החינוך', 'משרד הבריאות', 'משרד הפנים',
  'עיריית תל אביב-יפו', 'עיריית ירושלים', 'עיריית חיפה', 'עיריית ראשון לציון',
  'עיריית באר שבע', 'עיריית נתניה', 'עיריית פתח תקווה', 'עיריית בני ברק',
  'עיריית רמת גן', 'עיריית הרצליה', 'עיריית רעננה', 'עיריית כפר סבא',
  'עיריית אשדוד', 'עיריית אשקלון', 'עיריית חולון', 'עיריית בת ים',
  'ביטוח לאומי', 'רשות המים', 'רשות החשמל', 'רשות מקרקעי ישראל',
  'בנק ישראל', 'חברת החשמל', 'מקורות', 'נתיבי ישראל',
  'קרן רש"י', 'קרן פרוייקטים', 'מרכז השלטון המקומי', 'מפא"ל',
]

const EXPERTISE_LIST = {
  professional: [
    'מדיניות ציבורית', 'ניהול שינוי', 'טרנספורמציה דיגיטלית', 'כלכלה',
    'משאבי אנוש', 'תקשורת ויחסי ציבור', 'משפט', 'כספים ותקציב',
    'תכנון עירוני', 'בריאות הציבור', 'חינוך', 'אבטחת מידע',
    'מחקר ופיתוח', 'סטטיסטיקה ונתונים', 'פרוייקטים ותכנון אסטרטגי',
  ],
  content: [
    'פינטק', 'בינה מלאכותית', 'קיימות וסביבה', 'ממשל פתוח',
    'אתגרי ערים', 'חינוך טכנולוגי', 'בריאות דיגיטלית', 'ביטחון לאומי',
    'חברה אזרחית', 'כלכלה חברתית', 'שיתוף ציבור', 'חדשנות ממשלתית',
  ],
}

const HIERARCHY_LEVELS = [
  'מנכ"ל / מנהל כללי', 'סמנכ"ל', 'מנהל אגף', 'מנהל מחלקה',
  'רכז בכיר', 'רכז', 'יועץ / מומחה', 'מנהל פרויקט',
]

// ─── Programs & Cohorts ───────────────────────────────────────────────────────

const PROGRAMS = [
  { id: 'prog-gov', name: 'ממשלתי' as const, managerIds: ['uid-manager'] },
  { id: 'prog-mun', name: 'מוניציפלי' as const, managerIds: [] },
  { id: 'prog-law', name: 'אכיפת החוק' as const, managerIds: [] },
]

const COHORTS = [
  { id: 'cohort-gov-a', programId: 'prog-gov', label: 'א' as const, year: 2022, startDate: '2022-01-01', endDate: '2022-06-30' },
  { id: 'cohort-gov-b', programId: 'prog-gov', label: 'ב' as const, year: 2023, startDate: '2023-01-01', endDate: '2023-06-30' },
  { id: 'cohort-gov-c', programId: 'prog-gov', label: 'ג' as const, year: 2024, startDate: '2024-01-01', endDate: '2024-06-30' },
  { id: 'cohort-mun-a', programId: 'prog-mun', label: 'א' as const, year: 2022, startDate: '2022-03-01', endDate: '2022-09-30' },
  { id: 'cohort-mun-b', programId: 'prog-mun', label: 'ב' as const, year: 2023, startDate: '2023-03-01', endDate: '2023-09-30' },
  { id: 'cohort-mun-c', programId: 'prog-mun', label: 'ג' as const, year: 2024, startDate: '2024-03-01', endDate: '2024-09-30' },
  { id: 'cohort-law-a', programId: 'prog-law', label: 'א' as const, year: 2023, startDate: '2023-06-01', endDate: '2023-12-31' },
  { id: 'cohort-law-b', programId: 'prog-law', label: 'ב' as const, year: 2024, startDate: '2024-06-01', endDate: '2024-12-31' },
  { id: 'cohort-law-c', programId: 'prog-law', label: 'ג' as const, year: 2025, startDate: '2025-06-01', endDate: '2025-12-31' },
]

// ─── Demo Profiles ────────────────────────────────────────────────────────────

type DemoProfile = {
  id: string; firstName: string; lastName: string; email: string; phone: string;
  organizationName: string; role: string; hierarchyLevel: string;
  currentSector: string; city: string; district: string;
  communityStatus: string; engagementScore: number;
  professionalExpertise: string[]; contentExpertise: string[];
  cohortId: string; programId: string; enrollmentStatus: string;
}

const DEMO_PROFILES: DemoProfile[] = [
  { id: 'USR-00001', firstName: 'אורן', lastName: 'לוי', email: 'oren.levi@example.gov.il', phone: '0521234567', organizationName: 'משרד האוצר', role: 'מנהל תחום', hierarchyLevel: 'מנהל אגף', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'בוגר לא פעיל', engagementScore: 0.72, professionalExpertise: ['מדיניות ציבורית', 'כלכלה'], contentExpertise: ['ממשל פתוח'], cohortId: 'cohort-gov-a', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00002', firstName: 'מיכל', lastName: 'כהן', email: 'michal.cohen@tlv.gov.il', phone: '0522234568', organizationName: 'עיריית תל אביב-יפו', role: 'ראש מחלקה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'תל אביב', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.91, professionalExpertise: ['ניהול שינוי', 'תקשורת ויחסי ציבור'], contentExpertise: ['אתגרי ערים', 'שיתוף ציבור'], cohortId: 'cohort-mun-a', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00003', firstName: 'יוסי', lastName: 'ברכה', email: 'yossi.bracha@example.gov.il', phone: '0523234569', organizationName: 'משרד החינוך', role: 'סמנכ"ל', hierarchyLevel: 'סמנכ"ל', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.85, professionalExpertise: ['מדיניות ציבורית', 'חינוך'], contentExpertise: ['חינוך טכנולוגי'], cohortId: 'cohort-gov-b', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00004', firstName: 'שירה', lastName: 'אברהם', email: 'shira.avraham@haifa.gov.il', phone: '0524234570', organizationName: 'עיריית חיפה', role: 'מנהלת יחידה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'חיפה', district: 'צפון', communityStatus: 'משתתף', engagementScore: 0.60, professionalExpertise: ['ניהול שינוי'], contentExpertise: ['קיימות וסביבה'], cohortId: 'cohort-mun-b', programId: 'prog-mun', enrollmentStatus: 'פעיל' },
  { id: 'USR-00005', firstName: 'דני', lastName: 'שפיר', email: 'danny.shapir@police.gov.il', phone: '0525234571', organizationName: 'משטרת ישראל', role: 'קצין בכיר', hierarchyLevel: 'מנהל אגף', currentSector: 'ממשל מרכזי', city: 'תל אביב', district: 'מרכז', communityStatus: 'בוגר לא פעיל', engagementScore: 0.45, professionalExpertise: ['ניהול שינוי', 'מחקר ופיתוח'], contentExpertise: ['ביטחון לאומי'], cohortId: 'cohort-law-a', programId: 'prog-law', enrollmentStatus: 'בוגר' },
  { id: 'USR-00006', firstName: 'נועה', lastName: 'גולן', email: 'noa.golan@rishon.gov.il', phone: '0526234572', organizationName: 'עיריית ראשון לציון', role: 'מנהלת אגף', hierarchyLevel: 'מנהל אגף', currentSector: 'שלטון מקומי', city: 'ראשון לציון', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.78, professionalExpertise: ['תכנון עירוני', 'כספים ותקציב'], contentExpertise: ['אתגרי ערים', 'ממשל פתוח'], cohortId: 'cohort-mun-a', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00007', firstName: 'עמית', lastName: 'רוזן', email: 'amit.rosen@mof.gov.il', phone: '0527234573', organizationName: 'משרד האוצר', role: 'יועץ כלכלי', hierarchyLevel: 'יועץ / מומחה', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.88, professionalExpertise: ['כלכלה', 'מדיניות ציבורית', 'סטטיסטיקה ונתונים'], contentExpertise: ['פינטק', 'כלכלה חברתית'], cohortId: 'cohort-gov-a', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00008', firstName: 'לימור', lastName: 'בן-דוד', email: 'limor.bendavid@beersheva.gov.il', phone: '0528234574', organizationName: 'עיריית באר שבע', role: 'מנהלת ענף', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'באר שבע', district: 'דרום', communityStatus: 'משתתף', engagementScore: 0.55, professionalExpertise: ['תכנון עירוני'], contentExpertise: ['קיימות וסביבה', 'שיתוף ציבור'], cohortId: 'cohort-mun-c', programId: 'prog-mun', enrollmentStatus: 'פעיל' },
  { id: 'USR-00009', firstName: 'רון', lastName: 'מזרחי', email: 'ron.mizrahi@health.gov.il', phone: '0529234575', organizationName: 'משרד הבריאות', role: 'מנהל מחלקה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'בוגר לא פעיל', engagementScore: 0.38, professionalExpertise: ['בריאות הציבור', 'מדיניות ציבורית'], contentExpertise: ['בריאות דיגיטלית'], cohortId: 'cohort-gov-b', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00010', firstName: 'הדס', lastName: 'פרץ', email: 'hadas.peretz@netanya.gov.il', phone: '0530234576', organizationName: 'עיריית נתניה', role: 'רכזת תחום', hierarchyLevel: 'רכז בכיר', currentSector: 'שלטון מקומי', city: 'נתניה', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.82, professionalExpertise: ['ניהול שינוי', 'תכנון עירוני'], contentExpertise: ['חדשנות ממשלתית', 'שיתוף ציבור'], cohortId: 'cohort-mun-b', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00011', firstName: 'אייל', lastName: 'כץ', email: 'eyal.katz@border.gov.il', phone: '0531234577', organizationName: 'משמר הגבול', role: 'מפקד יחידה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'משתתף', engagementScore: 0.65, professionalExpertise: ['ניהול שינוי'], contentExpertise: ['ביטחון לאומי'], cohortId: 'cohort-law-b', programId: 'prog-law', enrollmentStatus: 'פעיל' },
  { id: 'USR-00012', firstName: 'תמר', lastName: 'שמש', email: 'tamar.shemesh@moin.gov.il', phone: '0532234578', organizationName: 'משרד הפנים', role: 'סגנית מנכ"ל', hierarchyLevel: 'סמנכ"ל', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.94, professionalExpertise: ['מדיניות ציבורית', 'משאבי אנוש', 'משפט'], contentExpertise: ['ממשל פתוח', 'שיתוף ציבור'], cohortId: 'cohort-gov-c', programId: 'prog-gov', enrollmentStatus: 'פעיל' },
  { id: 'USR-00013', firstName: 'גל', lastName: 'ורד', email: 'gal.vered@ptv.gov.il', phone: '0533234579', organizationName: 'עיריית פתח תקווה', role: 'מנהל תשתיות', hierarchyLevel: 'מנהל אגף', currentSector: 'שלטון מקומי', city: 'פתח תקווה', district: 'מרכז', communityStatus: 'בוגר לא פעיל', engagementScore: 0.42, professionalExpertise: ['תכנון עירוני', 'כספים ותקציב'], contentExpertise: ['קיימות וסביבה'], cohortId: 'cohort-mun-a', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00014', firstName: 'ספיר', lastName: 'אלון', email: 'sapir.alon@prison.gov.il', phone: '0534234580', organizationName: 'שב"ס', role: 'קצינת תכנון', hierarchyLevel: 'רכז בכיר', currentSector: 'ממשל מרכזי', city: 'רמלה', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.79, professionalExpertise: ['ניהול שינוי', 'מחקר ופיתוח'], contentExpertise: ['ביטחון לאומי', 'חדשנות ממשלתית'], cohortId: 'cohort-law-a', programId: 'prog-law', enrollmentStatus: 'בוגר' },
  { id: 'USR-00015', firstName: 'ניר', lastName: 'אוחיון', email: 'nir.uchion@herzliya.gov.il', phone: '0535234581', organizationName: 'עיריית הרצליה', role: 'מנהל חינוך', hierarchyLevel: 'מנהל אגף', currentSector: 'שלטון מקומי', city: 'הרצליה', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.76, professionalExpertise: ['חינוך', 'ניהול שינוי'], contentExpertise: ['חינוך טכנולוגי', 'בינה מלאכותית'], cohortId: 'cohort-mun-c', programId: 'prog-mun', enrollmentStatus: 'פעיל' },
  { id: 'USR-00016', firstName: 'ורד', lastName: 'שניר', email: 'vered.shnir@mol.gov.il', phone: '0536234582', organizationName: 'משרד העבודה', role: 'מנהלת תחום', hierarchyLevel: 'מנהל מחלקה', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'משתתף', engagementScore: 0.58, professionalExpertise: ['מדיניות ציבורית', 'משאבי אנוש'], contentExpertise: ['כלכלה חברתית', 'שיתוף ציבור'], cohortId: 'cohort-gov-c', programId: 'prog-gov', enrollmentStatus: 'פעיל' },
  { id: 'USR-00017', firstName: 'עידן', lastName: 'ביטון', email: 'idan.biton@raanana.gov.il', phone: '0537234583', organizationName: 'עיריית רעננה', role: 'מנהל כספים', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'רעננה', district: 'מרכז', communityStatus: 'בוגר לא פעיל', engagementScore: 0.35, professionalExpertise: ['כספים ותקציב'], contentExpertise: ['פינטק'], cohortId: 'cohort-mun-a', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00018', firstName: 'ענת', lastName: 'גבאי', email: 'anat.gabai@fire.gov.il', phone: '0538234584', organizationName: 'כיבוי אש', role: 'מנהלת הכשרות', hierarchyLevel: 'מנהל מחלקה', currentSector: 'ממשל מרכזי', city: 'תל אביב', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.83, professionalExpertise: ['ניהול שינוי', 'משאבי אנוש'], contentExpertise: ['ביטחון לאומי', 'חדשנות ממשלתית'], cohortId: 'cohort-law-b', programId: 'prog-law', enrollmentStatus: 'בוגר' },
  { id: 'USR-00019', firstName: 'אלרואי', lastName: 'טסה', email: 'alroyi.tessa@bnei.gov.il', phone: '0539234585', organizationName: 'עיריית בני ברק', role: 'מנהל שירותים', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'בני ברק', district: 'מרכז', communityStatus: 'משתתף', engagementScore: 0.61, professionalExpertise: ['ניהול שינוי', 'תכנון עירוני'], contentExpertise: ['אתגרי ערים'], cohortId: 'cohort-mun-b', programId: 'prog-mun', enrollmentStatus: 'פעיל' },
  { id: 'USR-00020', firstName: 'יעל', lastName: 'מנדל', email: 'yael.mandel@soc.gov.il', phone: '0540234586', organizationName: 'משרד הרווחה', role: 'סמנכ"לית', hierarchyLevel: 'סמנכ"ל', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.90, professionalExpertise: ['מדיניות ציבורית', 'משאבי אנוש', 'חינוך'], contentExpertise: ['חברה אזרחית', 'כלכלה חברתית'], cohortId: 'cohort-gov-a', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00021', firstName: 'בועז', lastName: 'אדרי', email: 'boaz.adri@holon.gov.il', phone: '0541234587', organizationName: 'עיריית חולון', role: 'מנהל הנדסה', hierarchyLevel: 'מנהל אגף', currentSector: 'שלטון מקומי', city: 'חולון', district: 'מרכז', communityStatus: 'בוגר לא פעיל', engagementScore: 0.47, professionalExpertise: ['תכנון עירוני', 'כספים ותקציב'], contentExpertise: ['קיימות וסביבה'], cohortId: 'cohort-mun-b', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00022', firstName: 'טל', lastName: 'חמו', email: 'tal.hamo@customs.gov.il', phone: '0542234588', organizationName: 'המכס', role: 'ממונה אכיפה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'ממשל מרכזי', city: 'אשדוד', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.74, professionalExpertise: ['ניהול שינוי', 'אבטחת מידע'], contentExpertise: ['ביטחון לאומי', 'פינטק'], cohortId: 'cohort-law-c', programId: 'prog-law', enrollmentStatus: 'פעיל' },
  { id: 'USR-00023', firstName: 'אורית', lastName: 'שוחט', email: 'orit.shochat@env.gov.il', phone: '0543234589', organizationName: 'משרד איכות הסביבה', role: 'מנהלת מחקר', hierarchyLevel: 'יועץ / מומחה', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.87, professionalExpertise: ['מחקר ופיתוח', 'מדיניות ציבורית', 'סטטיסטיקה ונתונים'], contentExpertise: ['קיימות וסביבה', 'ממשל פתוח'], cohortId: 'cohort-gov-b', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00024', firstName: 'שמוליק', lastName: 'דהן', email: 'shmuelik.dahan@kfarsaba.gov.il', phone: '0544234590', organizationName: 'עיריית כפר סבא', role: 'ראש מחלקה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'כפר סבא', district: 'מרכז', communityStatus: 'משתתף', engagementScore: 0.63, professionalExpertise: ['ניהול שינוי', 'תקשורת ויחסי ציבור'], contentExpertise: ['שיתוף ציבור', 'חדשנות ממשלתית'], cohortId: 'cohort-mun-c', programId: 'prog-mun', enrollmentStatus: 'פעיל' },
  { id: 'USR-00025', firstName: 'ריטה', lastName: 'פלד', email: 'rita.peled@ramla.gov.il', phone: '0545234591', organizationName: 'עיריית רמלה', role: 'מנהלת רווחה', hierarchyLevel: 'מנהל מחלקה', currentSector: 'שלטון מקומי', city: 'רמלה', district: 'מרכז', communityStatus: 'בוגר לא פעיל', engagementScore: 0.40, professionalExpertise: ['ניהול שינוי'], contentExpertise: ['חברה אזרחית'], cohortId: 'cohort-mun-a', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00026', firstName: 'שי', lastName: 'ניסים', email: 'shai.nisim@ims.gov.il', phone: '0546234592', organizationName: 'השירות המטאורולוגי', role: 'ראש תחום', hierarchyLevel: 'רכז בכיר', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.71, professionalExpertise: ['מחקר ופיתוח', 'סטטיסטיקה ונתונים'], contentExpertise: ['קיימות וסביבה', 'בינה מלאכותית'], cohortId: 'cohort-gov-c', programId: 'prog-gov', enrollmentStatus: 'פעיל' },
  { id: 'USR-00027', firstName: 'מורן', lastName: 'פרידמן', email: 'moran.fridman@ashdod.gov.il', phone: '0547234593', organizationName: 'עיריית אשדוד', role: 'מנהלת חינוך', hierarchyLevel: 'מנהל אגף', currentSector: 'שלטון מקומי', city: 'אשדוד', district: 'מרכז', communityStatus: 'חבר קהילה', engagementScore: 0.80, professionalExpertise: ['חינוך', 'ניהול שינוי', 'תקשורת ויחסי ציבור'], contentExpertise: ['חינוך טכנולוגי', 'אתגרי ערים'], cohortId: 'cohort-mun-b', programId: 'prog-mun', enrollmentStatus: 'בוגר' },
  { id: 'USR-00028', firstName: 'אמיר', lastName: 'יצחקי', email: 'amir.itzchaki@police.gov.il', phone: '0548234594', organizationName: 'משטרת ישראל', role: 'רב-פקד', hierarchyLevel: 'מנהל אגף', currentSector: 'ממשל מרכזי', city: 'תל אביב', district: 'מרכז', communityStatus: 'משתתף', engagementScore: 0.67, professionalExpertise: ['ניהול שינוי', 'אבטחת מידע'], contentExpertise: ['ביטחון לאומי'], cohortId: 'cohort-law-b', programId: 'prog-law', enrollmentStatus: 'פעיל' },
  { id: 'USR-00029', firstName: 'יפית', lastName: 'אסולין', email: 'yafit.asulin@moed.gov.il', phone: '0549234595', organizationName: 'משרד המדע', role: 'יועצת בכירה', hierarchyLevel: 'יועץ / מומחה', currentSector: 'ממשל מרכזי', city: 'ירושלים', district: 'ירושלים', communityStatus: 'חבר קהילה', engagementScore: 0.93, professionalExpertise: ['מחקר ופיתוח', 'מדיניות ציבורית', 'טרנספורמציה דיגיטלית'], contentExpertise: ['בינה מלאכותית', 'חדשנות ממשלתית', 'ממשל פתוח'], cohortId: 'cohort-gov-a', programId: 'prog-gov', enrollmentStatus: 'בוגר' },
  { id: 'USR-00030', firstName: 'אלעד', lastName: 'מוסרי', email: 'elad.mosri@prison.gov.il', phone: '0550234596', organizationName: 'שב"ס', role: 'מנהל כוח אדם', hierarchyLevel: 'מנהל מחלקה', currentSector: 'ממשל מרכזי', city: 'רמלה', district: 'מרכז', communityStatus: 'בוגר לא פעיל', engagementScore: 0.50, professionalExpertise: ['משאבי אנוש', 'ניהול שינוי'], contentExpertise: ['ביטחון לאומי', 'כלכלה חברתית'], cohortId: 'cohort-law-a', programId: 'prog-law', enrollmentStatus: 'בוגר' },
]

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedTaxonomy() {
  console.log('Seeding taxonomy...')
  const batch = db.batch()

  batch.set(db.collection('taxonomy').doc('settlements'), {
    settlements: SETTLEMENTS_MAP,
    updatedAt: FieldValue.serverTimestamp(),
  })

  batch.set(db.collection('taxonomy').doc('expertise'), {
    professional: EXPERTISE_LIST.professional,
    content: EXPERTISE_LIST.content,
    updatedAt: FieldValue.serverTimestamp(),
  })

  batch.set(db.collection('taxonomy').doc('hierarchyLevels'), {
    levels: HIERARCHY_LEVELS,
    updatedAt: FieldValue.serverTimestamp(),
  })

  batch.set(db.collection('taxonomy').doc('organizations'), {
    organizations: ORGANIZATIONS_LIST,
    updatedAt: FieldValue.serverTimestamp(),
  })

  await batch.commit()
  console.log('✓ Taxonomy seeded')
}

async function seedPrograms() {
  console.log('Seeding programs and cohorts...')

  for (const program of PROGRAMS) {
    await db.collection('programs').doc(program.id).set({
      ...program,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  for (const cohort of COHORTS) {
    await db.collection('programs').doc(cohort.programId)
      .collection('cohorts').doc(cohort.id).set({
        ...cohort,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
  }

  console.log(`✓ ${PROGRAMS.length} programs and ${COHORTS.length} cohorts seeded`)
}

async function seedProfiles() {
  console.log('Seeding profiles and enrollments...')

  const engagementLevel = (score: number) => {
    if (score >= 0.75) return 'גבוהה'
    if (score >= 0.5) return 'בינונית'
    if (score >= 0.25) return 'נמוכה'
    return 'ללא מעורבות'
  }

  const profileBatch = db.batch()
  const enrollmentBatch = db.batch()

  for (const p of DEMO_PROFILES) {
    const profileRef = db.collection('profiles').doc(p.id)
    profileBatch.set(profileRef, {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      organizationName: p.organizationName,
      role: p.role,
      hierarchyLevel: p.hierarchyLevel,
      currentSector: p.currentSector,
      city: p.city,
      district: p.district,
      communityStatus: p.communityStatus,
      engagementScore: p.engagementScore,
      engagementLevel: engagementLevel(p.engagementScore),
      professionalExpertise: p.professionalExpertise,
      contentExpertise: p.contentExpertise,
      inPublicSector: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const enrollmentId = `ENR-${p.id.replace('USR-', '')}`
    const enrollmentRef = db.collection('enrollments').doc(enrollmentId)
    enrollmentBatch.set(enrollmentRef, {
      id: enrollmentId,
      profileId: p.id,
      programId: p.programId,
      cohortId: p.cohortId,
      status: p.enrollmentStatus,
      statusHistory: [
        {
          status: 'מועמד',
          changedAt: new Date('2022-01-01').toISOString(),
          changedBy: 'system',
          notes: 'הצטרפות ראשונית',
        },
        {
          status: p.enrollmentStatus,
          changedAt: new Date().toISOString(),
          changedBy: 'system',
          notes: 'עדכון בייבוא',
        },
      ],
      notes: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  await profileBatch.commit()
  await enrollmentBatch.commit()
  console.log(`✓ ${DEMO_PROFILES.length} profiles and enrollments seeded`)
}

async function seedOrganizations() {
  console.log('Seeding organizations...')
  const batch = db.batch()

  for (let i = 0; i < ORGANIZATIONS_LIST.length; i++) {
    const orgId = `ORG-${String(i + 1).padStart(5, '0')}`
    const ref = db.collection('organizations').doc(orgId)
    batch.set(ref, {
      id: orgId,
      name: ORGANIZATIONS_LIST[i],
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  console.log(`✓ ${ORGANIZATIONS_LIST.length} organizations seeded`)
}

async function seedUsers() {
  console.log('Seeding demo Firebase Auth users...')

  async function createOrUpdateUser(email: string, password: string, displayName: string) {
    try {
      const existing = await auth.getUserByEmail(email)
      console.log(`  User ${email} already exists (uid: ${existing.uid})`)
      return existing.uid
    } catch {
      const user = await auth.createUser({ email, password, displayName })
      console.log(`  Created user ${email} (uid: ${user.uid})`)
      return user.uid
    }
  }

  const adminUid = await createOrUpdateUser('admin@shachentov-crm.demo', 'Demo1234!', 'מנהל מערכת')
  const managerUid = await createOrUpdateUser('manager@shachentov-crm.demo', 'Demo1234!', 'מנהלת תוכנית ממשלתי')

  await auth.setCustomUserClaims(adminUid, { role: 'SuperAdmin' })
  await auth.setCustomUserClaims(managerUid, { role: 'ProgramManager', programIds: ['prog-gov'] })

  const usersBatch = db.batch()

  usersBatch.set(db.collection('users').doc(adminUid), {
    uid: adminUid,
    name: 'מנהל מערכת',
    email: 'admin@shachentov-crm.demo',
    role: 'SuperAdmin',
    assignedProgramIds: [],
    createdAt: FieldValue.serverTimestamp(),
  })

  usersBatch.set(db.collection('users').doc(managerUid), {
    uid: managerUid,
    name: 'מנהלת תוכנית ממשלתי',
    email: 'manager@shachentov-crm.demo',
    role: 'ProgramManager',
    assignedProgramIds: ['prog-gov'],
    createdAt: FieldValue.serverTimestamp(),
  })

  await usersBatch.commit()

  console.log('✓ Demo users seeded:')
  console.log('  SuperAdmin:      admin@shachentov-crm.demo / Demo1234!')
  console.log('  ProgramManager:  manager@shachentov-crm.demo / Demo1234!')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Starting Ecosystem CRM seed...\n')

  try {
    await seedTaxonomy()
    await seedPrograms()
    await seedOrganizations()
    await seedProfiles()
    await seedUsers()
    console.log('\n✅ Seed complete!\n')
  } catch (err) {
    console.error('\n❌ Seed failed:', err)
    process.exit(1)
  }
}

main()
