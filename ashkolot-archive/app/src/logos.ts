// לוגואים לפי תבנית הלו"ז של אשכולות: משרד הפנים מימין, אשכולות באמצע, הג'וינט משמאל.
// כדי להוסיף לוגו: שומרים את הקובץ ב-src/assets/logos בשם interior / ashkolot / joint (png או jpg).
// לוגו שחסר פשוט לא מוצג - לא ממציאים לוגואים.
const files = import.meta.glob('./assets/logos/*.{png,jpg,jpeg,svg}', { eager: true, import: 'default' }) as Record<string, string>

function pick(name: string): string | undefined {
  const key = Object.keys(files).find((k) => k.split('/').pop()?.replace(/\.[^.]+$/, '') === name)
  return key ? files[key] : undefined
}

export const LOGOS = { interior: pick('interior'), ashkolot: pick('ashkolot'), joint: pick('joint') }
