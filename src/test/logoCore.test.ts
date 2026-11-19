import { describe, expect, it } from 'vitest'
import {
  extForMime, findIconCandidates, isAllowedContentType, isPrivateIp, isSafeSvg, isValidDocId,
  logoDownloadUrl, logoStoragePath, sniffImage, validateFetchUrl,
} from '../../netlify/functions/_logoCore'

const bytes = (...n: number[]) => new Uint8Array(n)
const text = (s: string) => new TextEncoder().encode(s)

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'ff02::1', 'not-an-ip'])(
    'blocks %s', (ip) => expect(isPrivateIp(ip)).toBe(true))
  it.each(['8.8.8.8', '172.32.0.1', '151.101.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s', (ip) => expect(isPrivateIp(ip)).toBe(false))
})

describe('validateFetchUrl', () => {
  it('accepts a plain https site', () => expect(validateFetchUrl('https://helpi.co.il/about')?.hostname).toBe('helpi.co.il'))
  it.each([
    'http://example.com', 'ftp://example.com', 'https://user:pw@example.com', 'https://example.com:8443',
    'https://localhost', 'https://foo.localhost', 'https://printer.local', 'https://db.internal',
    'https://127.0.0.1', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://10.0.0.5', 'nonsense', '',
  ])('rejects %s', (u) => expect(validateFetchUrl(u)).toBeNull())
})

describe('findIconCandidates', () => {
  const html = `<head>
    <link rel="icon" href="/favicon-32.png" sizes="32x32">
    <link rel="shortcut icon" href="/old.ico">
    <link rel='apple-touch-icon' sizes='180x180' href='/apple.png'>
    <link rel="icon" type="image/svg+xml" href="logo.svg">
    <link rel="apple-touch-icon-precomposed" sizes="57x57" href="/apple-57.png">
    <meta property="og:image" content="https://cdn.example.com/share.jpg">
    <link rel="icon" href="http://insecure.example.com/x.png">
  </head>`
  const list = findIconCandidates(html, 'https://example.com/dir/page')

  it('puts apple-touch-icons first, biggest first', () => expect(list.slice(0, 2)).toEqual(['https://example.com/apple.png', 'https://example.com/apple-57.png']))
  it('then icons by size, svg ahead of small raster, ico last', () => {
    expect(list.indexOf('https://example.com/dir/logo.svg')).toBeLessThan(list.indexOf('https://example.com/favicon-32.png'))
    expect(list.indexOf('https://example.com/favicon-32.png')).toBeLessThan(list.indexOf('https://example.com/old.ico'))
  })
  it('then og:image, and /favicon.ico as the last resort', () => {
    expect(list.indexOf('https://example.com/old.ico')).toBeLessThan(list.indexOf('https://cdn.example.com/share.jpg'))
    expect(list[list.length - 1]).toBe('https://example.com/favicon.ico')
  })
  it('drops non-https and duplicates', () => {
    expect(list.some((u) => u.startsWith('http://'))).toBe(false)
    expect(new Set(list).size).toBe(list.length)
  })
  it('falls back to /favicon.ico for an empty page', () => expect(findIconCandidates('', 'https://a.org/x')).toEqual(['https://a.org/favicon.ico']))
})

describe('sniffImage', () => {
  it('recognises the common formats by their bytes', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png')
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe('jpg')
    expect(sniffImage(text('GIF89a'))?.mime).toBe('image/gif')
    expect(sniffImage(text('RIFF\0\0\0\0WEBPVP8 '))?.mime).toBe('image/webp')
    expect(sniffImage(bytes(0, 0, 1, 0, 1, 0))?.mime).toBe('image/x-icon')
  })
  it('accepts a clean svg, with or without an xml prolog', () => {
    expect(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>'))?.mime).toBe('image/svg+xml')
    expect(sniffImage(text('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"/>'))?.ext).toBe('svg')
  })
  it('rejects html, script-bearing svg and junk', () => {
    expect(sniffImage(text('<!doctype html><html></html>'))).toBeNull()
    expect(sniffImage(text('<svg><script>alert(1)</script></svg>'))).toBeNull()
    expect(sniffImage(text('<svg><a href="javascript:alert(1)"/></svg>'))).toBeNull()
    expect(sniffImage(bytes(1, 2, 3))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe('content types, svg, ids, paths', () => {
  it('allows only image types', () => {
    expect(isAllowedContentType('image/png')).toBe(true)
    expect(isAllowedContentType('image/svg+xml; charset=utf-8')).toBe(true)
    expect(isAllowedContentType('IMAGE/VND.MICROSOFT.ICON')).toBe(true)
    expect(isAllowedContentType('text/html')).toBe(false)
    expect(isAllowedContentType('application/octet-stream')).toBe(false)
    expect(isAllowedContentType(null)).toBe(false)
  })
  it('maps mime to extension', () => {
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('image/vnd.microsoft.icon')).toBe('ico')
  })
  it('isSafeSvg needs an svg element and no script', () => {
    expect(isSafeSvg('<svg></svg>')).toBe(true)
    expect(isSafeSvg('<div></div>')).toBe(false)
    expect(isSafeSvg('<svg><SCRIPT></SCRIPT></svg>')).toBe(false)
  })
  it('validates doc ids', () => {
    expect(isValidDocId('430vjflNSnTp54mDZv3y')).toBe(true)
    expect(isValidDocId('../x')).toBe(false)
    expect(isValidDocId('a/b')).toBe(false)
    expect(isValidDocId('')).toBe(false)
    expect(isValidDocId(5)).toBe(false)
  })
  it('builds storage path and download url', () => {
    expect(logoStoragePath('hq_partners', 'abc', 'png')).toBe('org-logos/hq_partners-abc.png')
    expect(logoDownloadUrl('b.firebasestorage.app', 'org-logos/x.png', 't1')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/b.firebasestorage.app/o/org-logos%2Fx.png?alt=media&token=t1')
  })
})
