/**
 * Presentación común de resultados tributarios ya calculados por backend.
 * No contiene reglas, tasas ni fechas de vencimiento: solo normaliza nombres
 * de campos y agrupa las filas entregadas por los endpoints.
 */

export const TAX_TYPES = [
  { key: 'simple', label: 'SIMPLE', shortLabel: 'SIMPLE' },
  { key: 'income_ordinary', label: 'Ordinario', shortLabel: 'Ordinario' },
  { key: 'ica', label: 'ICA', shortLabel: 'ICA' },
  { key: 'reteiva', label: 'ReteIVA', shortLabel: 'ReteIVA' },
  { key: 'withholding', label: 'Retención', shortLabel: 'Retención' },
  { key: 'reteica', label: 'ReteICA', shortLabel: 'ReteICA' }
]

const TAX_TYPE_BY_KEY = Object.fromEntries(TAX_TYPES.map((item) => [item.key, item]))

export const TAX_PNL_TYPES = new Set(['simple', 'income_ordinary', 'ica'])

export function taxTypeLabel(type) {
  return TAX_TYPE_BY_KEY[type]?.label ?? type ?? 'Tributo'
}

export function summaryRowsOf(summary) {
  if (Array.isArray(summary?.results)) return summary.results
  if (Array.isArray(summary?.rows)) return summary.rows
  return []
}

/**
 * Distinguishes an executed calculation with no payable result from a tax
 * calculation that has not been executed yet. The API flag is authoritative;
 * the row fallback keeps this compatible with older responses.
 */
export function taxCalculationAvailable(summary) {
  if (!summary) return false
  if (summary.calculation_executed === false) return false
  return summary.calculation_executed === true || summaryRowsOf(summary).length > 0
}

export function cashFlowRowsOf(cashFlow) {
  if (Array.isArray(cashFlow?.monthly)) return cashFlow.monthly
  if (Array.isArray(cashFlow?.rows)) return cashFlow.rows
  if (Array.isArray(cashFlow)) return cashFlow
  return []
}

export function numericValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function monthFromValue(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric - 1
  const match = String(value).match(/(?:^|[^0-9])(?:\d{4}[-/])?(0?[1-9]|1[0-2])(?:[^0-9]|$)/)
  if (match) return Number(match[1]) - 1
  return null
}

function declarationMonthOf(row) {
  const explicit = row.pnl_month ?? row.calculation_trace?.pnl_month
  const explicitMonth = monthFromValue(explicit)
  if (explicitMonth !== null) return explicitMonth
  const declarationDate = row.declaration_date ?? row.calculation_trace?.declaration_date
  if (!declarationDate) return null
  const match = String(declarationDate).match(/^\d{4}-(\d{2})/)
  return match ? Number(match[1]) - 1 : monthFromValue(declarationDate)
}

/**
 * Builds the monthly tax expense used by the executive P&L. This is only a
 * placement/normalisation helper: tax amounts and dates come from the
 * calculated summary endpoint.
 *
 * SIMPLE and ordinary income tax are annual results for P&L presentation and
 * therefore close in December. ICA is recognised in the liquidation month
 * (`pnl_month` when supplied, otherwise `declaration_date`). Credits and
 * retentions are intentionally excluded by TAX_PNL_TYPES.
 */
export function pnlTaxMonthly(summary, budgetYear) {
  if (!taxCalculationAvailable(summary)) return null

  const months = Array.from({ length: 12 }, () => 0)
  const year = Number(budgetYear)
  let hasPnlTax = false

  for (const row of summaryRowsOf(summary)) {
    if (!TAX_PNL_TYPES.has(row.tax_type)) continue
    const amount = numericValue(row.tax_caused)
    let month = 11
    if (row.tax_type === 'ica') month = declarationMonthOf(row)
    if (month === null || month < 0 || month > 11) continue
    // `year` is intentionally not used to shift the result: the P&L rule is
    // monthly placement inside the selected budget year.
    months[month] += amount
    hasPnlTax = true
  }

  return {
    months,
    total: months.reduce((total, value) => total + value, 0),
    hasPnlTax,
    budgetYear: Number.isInteger(year) ? year : null
  }
}

function dateKey(row) {
  const date = row.payment_date || row.date || row.period || null
  if (date) {
    const match = String(date).match(/^(\d{4})-(\d{2})/)
    if (match) return `${match[1]}-${match[2]}`
  }
  if (row.payment_year && row.payment_month) {
    return `${row.payment_year}-${String(row.payment_month).padStart(2, '0')}`
  }
  return `year-${row.payment_year ?? 'unknown'}`
}

function dateParts(key, row) {
  const match = key.match(/^(\d{4})-(\d{2})/)
  if (match) return { year: Number(match[1]), month: Number(match[2]) }
  return {
    year: Number(row.payment_year) || null,
    month: Number(row.payment_month) || null
  }
}

/**
 * Aggregates only the rows returned by the tax cash-flow endpoint by payment
 * month/year. It does not infer or recalculate payment dates.
 */
export function aggregateTaxPayments(cashFlow, scenarioYear) {
  const groups = new Map()
  for (const row of cashFlowRowsOf(cashFlow)) {
    const key = dateKey(row)
    if (!groups.has(key)) {
      const parts = dateParts(key, row)
      groups.set(key, {
        key,
        year: parts.year,
        month: parts.month,
        paymentDate: row.payment_date || row.date || null,
        paymentYear: Number(row.payment_year) || parts.year,
        amounts: Object.fromEntries(TAX_TYPES.map((type) => [type.key, 0])),
        total: 0
      })
    }
    const group = groups.get(key)
    const typedRows = Array.isArray(row.by_type)
      ? row.by_type
      : row.tax_type
        ? [row]
        : []
    if (typedRows.length) {
      for (const typedRow of typedRows) {
        const type = TAX_TYPE_BY_KEY[typedRow.tax_type] ? typedRow.tax_type : null
        const amount = numericValue(
          typedRow.net_outflow ?? typedRow.cash_outflow ?? typedRow.payment ?? typedRow.amount
        )
        if (type) group.amounts[type] += amount
        group.total += amount
      }
    } else {
      group.total += numericValue(row.net_outflow ?? row.cash_outflow ?? row.payment ?? row.amount)
    }
  }

  return [...groups.values()]
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
    .map((row) => ({
      ...row,
      nextYear: Number.isInteger(Number(scenarioYear)) && row.paymentYear > Number(scenarioYear)
    }))
}

export function formatTaxDate(value) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(parsed)
}
