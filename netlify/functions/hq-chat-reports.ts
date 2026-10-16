interface QuarterlyReportData {
  branchId?: unknown
  quarter?: unknown
  year?: unknown
  data?: unknown
}

function serializeReportValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(serializeReportValue).filter(Boolean).join(', ')
  if (typeof value !== 'object') return String(value)

  const record = value as Record<string, unknown>
  if ('rating' in record || 'notes' in record) {
    const rating = serializeReportValue(record.rating)
    const notes = serializeReportValue(record.notes)
    return [rating && `דירוג: ${rating}`, notes && `הערות: ${notes}`].filter(Boolean).join(', ')
  }

  return Object.entries(record)
    .map(([key, nested]) => {
      const serialized = serializeReportValue(nested)
      return serialized ? `${key}: ${serialized}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

export function serializeQuarterlyReport(report: QuarterlyReportData): string {
  const reportData = report.data
  const answersText = reportData && typeof reportData === 'object' && !Array.isArray(reportData)
    ? Object.entries(reportData as Record<string, unknown>)
      .map(([key, value]) => {
        const serialized = serializeReportValue(value)
        return serialized ? `${key}: ${serialized.slice(0, 400)}` : ''
      })
      .filter(Boolean)
      .join(' | ')
    : ''
  const branch = typeof report.branchId === 'string' ? report.branchId : '?'
  const quarter = typeof report.quarter === 'string' ? report.quarter : ''
  const year = typeof report.year === 'number' ? ` ${report.year}` : ''
  return `— [${branch}] ${quarter}${year}: ${answersText}`
}
