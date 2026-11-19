const WRONG_CREDENTIALS = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/missing-password']

/** A Hebrew message for a Firebase sign-in failure, saying what really went wrong. */
export function authErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : ''
  if (WRONG_CREDENTIALS.includes(code)) return 'אימייל או סיסמה שגויים'
  switch (code) {
    case 'auth/too-many-requests':
      return 'החשבון ננעל זמנית אחרי ניסיונות כושלים רבים. המתן כמה דקות, או לחץ "שכחתי סיסמה" כדי לבחור סיסמה חדשה.'
    case 'auth/user-disabled':
      return 'החשבון הזה מושבת. פנה למנהל המערכת.'
    case 'auth/network-request-failed':
      return 'בעיית רשת — בדוק את החיבור ונסה שוב.'
    case 'auth/unauthorized-domain':
      return 'כתובת האתר הזו עדיין לא מורשית בהתחברות עם Google (Firebase ← Authentication ← Settings ← Authorized domains).'
    case 'auth/operation-not-allowed':
      return 'שיטת ההתחברות הזו לא מופעלת ב-Firebase.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'החלון נסגר לפני שההתחברות הסתיימה.'
    case 'auth/popup-blocked':
      return 'הדפדפן חסם את חלון ההתחברות. אפשר חלונות קופצים לאתר ונסה שוב.'
    default:
      if (err instanceof Error && !code) return err.message
      return `שגיאת כניסה${code ? ` (${code})` : ''}. נסה שוב, ואם זה חוזר — שלח את הקוד למנהל המערכת.`
  }
}
