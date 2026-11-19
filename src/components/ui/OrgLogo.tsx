import { useEffect, useState } from 'react'

function domainOf(url?: string): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

const PALETTE = ['#141348', '#189A9F', '#6a39d6', '#0d9e88', '#b45309', '#1f4e8c', '#9d174d']

/** The organisation's logo: the stored one, else its site's icon, else coloured initials. */
export function OrgLogo({ name, logoUrl, websiteUrl, size = 40 }: { name: string; logoUrl?: string; websiteUrl?: string; size?: number }) {
  const domain = domainOf(websiteUrl)
  const sources = [logoUrl, domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : undefined].filter((s): s is string => !!s)
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [logoUrl, websiteUrl])

  const box = { width: size, height: size, borderRadius: Math.round(size / 4) }
  const src = sources[index]

  if (src) {
    return (
      <div className="shrink-0 bg-white border border-gray-100 flex items-center justify-center overflow-hidden" style={box}>
        <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setIndex((i) => i + 1)} className="max-w-full max-h-full object-contain" style={{ padding: Math.round(size / 10) }} />
      </div>
    )
  }
  const color = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]
  return (
    <div className="shrink-0 flex items-center justify-center font-bold text-white" style={{ ...box, backgroundColor: color, fontSize: Math.round(size * 0.36) }}>
      {name.trim().slice(0, 2)}
    </div>
  )
}
