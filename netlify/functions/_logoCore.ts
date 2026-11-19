/** Pure helpers for fetch-logo: URL safety, finding the icon in a page, recognising image bytes. */

export const MAX_HTML_BYTES = 500 * 1024
export const MAX_IMAGE_BYTES = 1024 * 1024

export const COLLECTIONS = ['hq_partners', 'hq_suppliers'] as const
export type LogoCollection = (typeof COLLECTIONS)[number]

export const isLogoCollection = (v: unknown): v is LogoCollection => COLLECTIONS.includes(v as LogoCollection)
export const isValidDocId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v)

function ipv4Private(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** True for loopback, private, link-local, metadata, multicast and otherwise non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const parts = v4.slice(1).map(Number)
    if (parts.some((n) => n > 255)) return true
    return ipv4Private(parts[0], parts[1])
  }
  if (!addr.includes(':')) return true
  if (addr === '::' || addr === '::1') return true
  const mappedDotted = addr.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (mappedDotted) return ipv4Private(Number(mappedDotted[1]), Number(mappedDotted[2]))
  const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) return ipv4Private(parseInt(mappedHex[1], 16) >> 8, parseInt(mappedHex[1], 16) & 255)
  const first = addr.split(':')[0]
  if (first === '') return true
  const head = parseInt(first, 16)
  if (Number.isNaN(head)) return true
  return (
    (head & 0xfe00) === 0xfc00 ||
    (head & 0xffc0) === 0xfe80 ||
    (head & 0xff00) === 0xff00 ||
    (head & 0xffc0) === 0xfec0
  )
}

/** The URL if it may be fetched: https, default port, no credentials, no internal host name or private IP literal. */
export function validateFetchUrl(raw: string): URL | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.port && url.port !== '443') return null
  const host = url.hostname.toLowerCase()
  if (!host) return null
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null
  const literal = host.replace(/^\[|\]$/g, '')
  if ((/^[\d.]+$/.test(literal) || literal.includes(':')) && isPrivateIp(literal)) return null
  return url
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim()
  return attrs
}

function sizeScore(sizes: string | undefined, href: string): number {
  if (/\.svg(\?|#|$)/i.test(href)) return 100000
  if (!sizes) return /\.ico(\?|#|$)/i.test(href) ? -1 : 0
  if (sizes.toLowerCase().includes('any')) return 100000
  const best = sizes.split(/\s+/).map((s) => {
    const m = s.match(/^(\d+)x(\d+)$/i)
    return m ? Number(m[1]) * Number(m[2]) / 100 : 0
  })
  return Math.max(0, ...best)
}

/** Absolute https URLs of possible logos, best first: apple-touch-icon, icons by size, og:image, /favicon.ico. */
export function findIconCandidates(html: string, baseUrl: string): string[] {
  const head = html.slice(0, MAX_HTML_BYTES)
  const apple: { url: string; score: number }[] = []
  const icons: { url: string; score: number }[] = []
  const social: string[] = []

  const resolve = (href: string | undefined): string | null => {
    if (!href) return null
    try {
      const u = new URL(href, baseUrl)
      return u.protocol === 'https:' ? u.href : null
    } catch { return null }
  }

  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const a = parseAttrs(tag)
    const rels = (a.rel ?? '').toLowerCase().split(/\s+/)
    const url = resolve(a.href)
    if (!url) continue
    if (rels.some((r) => r.startsWith('apple-touch-icon'))) apple.push({ url, score: sizeScore(a.sizes, url) })
    else if (rels.includes('icon')) icons.push({ url, score: sizeScore(a.sizes, url) })
  }
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = parseAttrs(tag)
    const key = (a.property ?? a.name ?? '').toLowerCase()
    if (key === 'og:image' || key === 'og:image:secure_url' || key === 'twitter:image') {
      const url = resolve(a.content)
      if (url) social.push(url)
    }
  }

  const byScore = <T extends { score: number }>(x: T[]): T[] => [...x].sort((p, q) => q.score - p.score)
  const fallback = resolve('/favicon.ico')
  const ordered = [
    ...byScore(apple).map((x) => x.url),
    ...byScore(icons).map((x) => x.url),
    ...social,
    ...(fallback ? [fallback] : []),
  ]
  return [...new Set(ordered)]
}

export const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/gif',
] as const

export function isAllowedContentType(contentType: string | null | undefined): boolean {
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase()
  return (ALLOWED_MIME as readonly string[]).includes(mime)
}

export function extForMime(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    case 'image/svg+xml': return 'svg'
    default: return 'ico'
  }
}

export function isSafeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text) && !/<script/i.test(text) && !/javascript:/i.test(text)
}

/** What the bytes really are, regardless of what the server claimed. SVG must also pass isSafeSvg. */
export function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number) => bytes[i]
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  let mime: string | null = null
  if (bytes.length >= 8 && at(0) === 0x89 && ascii(1, 4) === 'PNG') mime = 'image/png'
  else if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) mime = 'image/jpeg'
  else if (bytes.length >= 6 && ascii(0, 4) === 'GIF8') mime = 'image/gif'
  else if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') mime = 'image/webp'
  else if (bytes.length >= 4 && at(0) === 0 && at(1) === 0 && at(2) === 1 && at(3) === 0) mime = 'image/x-icon'
  else {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, MAX_IMAGE_BYTES)))
    const trimmed = text.replace(/^﻿/, '').trimStart()
    if ((trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || trimmed.startsWith('<!--') || trimmed.startsWith('<!DOCTYPE svg')) && isSafeSvg(text)) {
      mime = 'image/svg+xml'
    }
  }
  return mime ? { mime, ext: extForMime(mime) } : null
}

export const logoStoragePath = (collection: LogoCollection, id: string, ext: string) => `org-logos/${collection}-${id}.${ext}`

export const logoDownloadUrl = (bucket: string, path: string, token: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
