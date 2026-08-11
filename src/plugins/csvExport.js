function escapeCsvValue(value) {
  if (value == null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCSV(data, columns, filename) {
  const header = columns.map((col) => col.label).join(',')
  const rows = data.map((row) => columns.map((col) => escapeCsvValue(row[col.key])).join(','))
  const csvContent = [header, ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
