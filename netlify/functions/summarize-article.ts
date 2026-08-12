import type { Handler, HandlerEvent } from '@netlify/functions'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    const { title } = JSON.parse(event.body ?? '{}') as { title?: string }
    if (!title) {
      return { statusCode: 400, body: JSON.stringify({ error: 'title required' }) }
    }

    const prompt = `אתה כותב סיכומי מאמרים בעברית עבור ארגון התנדבות בישראל בשם "שכן טוב" שמפעיל סניפי חלוקת מזון ובתי קפה קהילתיים.

כתוב סיכום בעברית למאמר/מסמך הבא:
כותרת: "${title}"

הסיכום צריך לכלול:
1. תיאור קצר של תוכן המסמך (2-3 משפטים)
2. נקודות מרכזיות (3-5 נקודות, מסומנות ב•)
3. טיפים מעשיים לשכן טוב (2-3 טיפים, מסומנים ב•)

כתוב בעברית ישירה ומעשית. אל תוסיף כותרות כמו "סיכום" בראש - התחל ישירות בתיאור.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { statusCode: 502, body: JSON.stringify({ error: 'AI error', detail: errText }) }
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    const summary = data.content.find((c) => c.type === 'text')?.text ?? ''

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) }
  }
}
