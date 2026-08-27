import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { v4 as uuidv4 } from 'uuid'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate prefixed IDs matching the plan's ID strategy
export function generateProfileId(): string {
  const suffix = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `USR-${suffix}`
}

export function generateOrgId(): string {
  const suffix = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `ORG-${suffix}`
}

export function generateToken(): string {
  return uuidv4()
}

// Format a Hebrew date string
export function formatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Engagement score → 0-100% display
export function formatEngagementScore(score: number | undefined): string {
  if (score === undefined || score === null) return '—'
  return `${Math.round(score * 100)}%`
}

// Replace template merge tags with profile values
export function applyMergeTags(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key) => vars[key] ?? match)
}

// Truncate long text for table cells
export function truncate(str: string, maxLength = 40): string {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return `${str.substring(0, maxLength)}...`
}

// Normalize phone number (strip non-digits, ensure leading 0)
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return `0${digits.slice(3)}`
  return digits
}

// Deep clone a plain object
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
