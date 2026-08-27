'use client'

import { useState, useEffect } from 'react'
import { createProfile, updateProfile } from '@/lib/firestore'
import type { Profile, SectorType, DistrictType, EngagementLevel, CommunityStatus } from '@/types/crm'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  SECTORS,
  DISTRICTS,
  ENGAGEMENT_LEVELS,
  COMMUNITY_STATUSES,
  CITY_TO_DISTRICT,
  PROFESSIONAL_EXPERTISE_GROUPS,
  CONTENT_EXPERTISE_GROUPS,
  HIERARCHY_GROUPS,
} from '@/lib/taxonomy'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProfileFormProps {
  profile: Profile | null
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  firstName: string
  lastName: string
  email: string
  phone: string
  linkedinUrl: string
  organizationName: string
  role: string
  hierarchyLevel: string
  currentSector: string
  inPublicSector: boolean
  city: string
  district: string
  communityStatus: string
  engagementLevel: string
  professionalExpertise: string[]
  contentExpertise: string[]
  internalNotes: string
}

function emptyForm(): FormState {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    organizationName: '',
    role: '',
    hierarchyLevel: '',
    currentSector: '',
    inPublicSector: false,
    city: '',
    district: '',
    communityStatus: '',
    engagementLevel: '',
    professionalExpertise: [],
    contentExpertise: [],
    internalNotes: '',
  }
}

function profileToForm(p: Profile): FormState {
  return {
    firstName: p.firstName ?? '',
    lastName: p.lastName ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    linkedinUrl: p.linkedinUrl ?? '',
    organizationName: p.organizationName ?? '',
    role: p.role ?? '',
    hierarchyLevel: p.hierarchyLevel ?? '',
    currentSector: p.currentSector ?? '',
    inPublicSector: p.inPublicSector ?? false,
    city: p.city ?? '',
    district: p.district ?? '',
    communityStatus: p.communityStatus ?? '',
    engagementLevel: p.engagementLevel ?? '',
    professionalExpertise: p.professionalExpertise ?? [],
    contentExpertise: p.contentExpertise ?? [],
    internalNotes: p.internalNotes ?? '',
  }
}

export function ProfileForm({ profile, onClose, onSaved }: ProfileFormProps) {
  const [form, setForm] = useState<FormState>(profile ? profileToForm(profile) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [expertiseTab, setExpertiseTab] = useState<'professional' | 'content'>('professional')

  useEffect(() => {
    if (form.city && !form.district) {
      const derived = CITY_TO_DISTRICT[form.city]
      if (derived) setForm(f => ({ ...f, district: derived }))
    }
  }, [form.city])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  function toggleExpertise(list: 'professionalExpertise' | 'contentExpertise', item: string) {
    setForm(f => {
      const current = f[list]
      return {
        ...f,
        [list]: current.includes(item)
          ? current.filter(x => x !== item)
          : [...current, item],
      }
    })
  }

  function validate() {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.firstName.trim()) errs.firstName = 'שם פרטי נדרש'
    if (!form.lastName.trim()) errs.lastName = 'שם משפחה נדרש'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'כתובת אימייל לא תקינה'
    }
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSaving(true)
    try {
      const data = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        organizationName: form.organizationName.trim() || undefined,
        role: form.role.trim() || undefined,
        hierarchyLevel: form.hierarchyLevel || undefined,
        currentSector: (form.currentSector as SectorType) || undefined,
        inPublicSector: form.inPublicSector,
        city: form.city.trim() || undefined,
        district: (form.district as DistrictType) || undefined,
        communityStatus: (form.communityStatus as CommunityStatus) || undefined,
        engagementLevel: (form.engagementLevel as EngagementLevel) || undefined,
        professionalExpertise: form.professionalExpertise.length > 0 ? form.professionalExpertise : undefined,
        contentExpertise: form.contentExpertise.length > 0 ? form.contentExpertise : undefined,
        internalNotes: form.internalNotes.trim() || undefined,
      }

      if (profile) {
        await updateProfile(profile.id, data)
      } else {
        await createProfile(data as Parameters<typeof createProfile>[0])
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">
              {profile ? 'עריכת פרופיל' : 'פרופיל חדש'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <Section title="שם ופרטי קשר">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="שם פרטי *"
                  value={form.firstName}
                  onChange={e => set('firstName', e.target.value)}
                  error={errors.firstName}
                  placeholder="ישראל"
                />
                <Input
                  label="שם משפחה *"
                  value={form.lastName}
                  onChange={e => set('lastName', e.target.value)}
                  error={errors.lastName}
                  placeholder="ישראלי"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="אימייל"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  error={errors.email}
                  placeholder="israel@gov.il"
                />
                <Input
                  label="טלפון"
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="050-0000000"
                />
              </div>
              <Input
                label="פרופיל LinkedIn"
                value={form.linkedinUrl}
                onChange={e => set('linkedinUrl', e.target.value)}
                placeholder="https://linkedin.com/in/..."
              />
            </Section>

            <Section title="ארגון ותפקיד">
              <Input
                label="שם ארגון"
                value={form.organizationName}
                onChange={e => set('organizationName', e.target.value)}
                placeholder="משרד הפנים"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="תפקיד"
                  value={form.role}
                  onChange={e => set('role', e.target.value)}
                  placeholder="מנהל אגף"
                />
                <Select
                  label="דרג"
                  value={form.hierarchyLevel}
                  onChange={e => set('hierarchyLevel', e.target.value)}
                >
                  <option value="">בחר דרג...</option>
                  {Object.entries(HIERARCHY_GROUPS).map(([group, levels]) => (
                    <optgroup key={group} label={group}>
                      {levels.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="מגזר"
                  value={form.currentSector}
                  onChange={e => set('currentSector', e.target.value)}
                >
                  <option value="">בחר מגזר...</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">מגזר ציבורי</label>
                  <label className="flex items-center gap-2 h-9 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.inPublicSector}
                      onChange={e => set('inPublicSector', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">שייך למגזר ציבורי</span>
                  </label>
                </div>
              </div>
            </Section>

            <Section title="מיקום">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="יישוב"
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  placeholder="תל אביב"
                />
                <Select
                  label="מחוז"
                  value={form.district}
                  onChange={e => set('district', e.target.value)}
                >
                  <option value="">בחר מחוז...</option>
                  {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
            </Section>

            <Section title="מומחיות">
              <div className="flex border border-gray-200 rounded-lg overflow-hidden mb-3">
                <button
                  type="button"
                  onClick={() => setExpertiseTab('professional')}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium transition-colors',
                    expertiseTab === 'professional'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  מקצועית ({form.professionalExpertise.length})
                </button>
                <button
                  type="button"
                  onClick={() => setExpertiseTab('content')}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium transition-colors border-s border-gray-200',
                    expertiseTab === 'content'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  תוכן ({form.contentExpertise.length})
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-3">
                {Object.entries(
                  expertiseTab === 'professional'
                    ? PROFESSIONAL_EXPERTISE_GROUPS
                    : CONTENT_EXPERTISE_GROUPS
                ).map(([group, items]) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map(item => {
                        const field = expertiseTab === 'professional' ? 'professionalExpertise' : 'contentExpertise'
                        const selected = form[field].includes(item)
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleExpertise(field, item)}
                            className={cn(
                              'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                              selected
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            )}
                          >
                            {item}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="סטטוס ומעורבות">
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="סטטוס בקהילה"
                  value={form.communityStatus}
                  onChange={e => set('communityStatus', e.target.value)}
                >
                  <option value="">בחר סטטוס...</option>
                  {COMMUNITY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select
                  label="רמת מעורבות"
                  value={form.engagementLevel}
                  onChange={e => set('engagementLevel', e.target.value)}
                >
                  <option value="">בחר רמה...</option>
                  {ENGAGEMENT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </Select>
              </div>
            </Section>

            <Section title="הערות">
              <Textarea
                label="הערות פנימיות"
                value={form.internalNotes}
                onChange={e => set('internalNotes', e.target.value)}
                placeholder="הערות לשימוש פנימי בלבד..."
                rows={3}
              />
            </Section>
          </form>

          <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
            <Button variant="outline" type="button" onClick={onClose} className="flex-1">
              ביטול
            </Button>
            <Button
              type="submit"
              loading={saving}
              className="flex-1"
              onClick={handleSubmit}
            >
              {profile ? 'שמירה' : 'יצירת פרופיל'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
