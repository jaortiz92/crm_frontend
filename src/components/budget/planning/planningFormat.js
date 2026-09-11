/**
 * Utilidades de formato del Módulo de Planeación y Escenarios
 * (FE-S4-BUDGET-PLANNING §6.1/§8.2/NFR-F5).
 *
 * Mismos formateadores `Intl` del repo (patrón de `UploadFeedbackModal`):
 * moneda COP `es-CO` sin decimales visibles (los montos SIIGO son enteros;
 * desviación menor y documentada frente al `Intl.NumberFormat('es-CO',
 * {style:'currency', currency:'COP'})` literal de la spec para no mostrar
 * ",00" en celdas y totales). La EDICIÓN siempre ocurre en número crudo.
 */

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
})

const intFormatter = new Intl.NumberFormat('es-CO')

/**
 * @param {number|string|null|undefined} value
 * @returns {string} `$ 1.234.567` o '—' si no es número finito.
 */
export function formatMoney(value) {
  const num = Number(value)
  return Number.isFinite(num) ? copFormatter.format(num) : '—'
}

/**
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatCount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? intFormatter.format(num) : '—'
}

/**
 * Fecha `dd/mm/aaaa`. Los `date` puros ISO ('YYYY-MM-DD') se parsean por
 * regex para evitar el corrimiento UTC→local de `new Date('2027-01-31')`
 * (patrón verificado en `RatesDataTable.formatDate`).
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatDateEs(value) {
  if (!value) return '—'
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

/** Etiquetas de columna Ene–Dic de la Vista Ejecutiva (§8.2 tab 1). */
export const MONTH_LABELS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic'
]

/**
 * Índice de mes 0–11 de un `budget_date`. La spec sugiere
 * `new Date(v).getMonth()`; para fechas ISO puras se extrae del string
 * (mismo resultado, sin riesgo de zona) y se cae a `Date` en otro formato.
 * @param {string|null|undefined} value
 * @returns {number} -1 si no es parseable.
 */
export function monthIndexOf(value) {
  if (!value) return -1
  const plain = String(value).match(/^\d{4}-(\d{2})/)
  if (plain) {
    const month = Number(plain[1]) - 1
    return month >= 0 && month <= 11 ? month : -1
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? -1 : date.getMonth()
}

/**
 * Validación pre-red de la celda del grid (§8.2, ASM-12): numérico, finito y
 * `>= 0`. Acepta el separador decimal de la coma `es-CO` ("12,5" → 12.5).
 * @param {string|number} raw
 * @returns {{ valid: boolean, value: number }}
 */
export function parseCellAmount(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0
      ? { valid: true, value: raw }
      : { valid: false, value: 0 }
  }
  const text = String(raw ?? '').trim()
  if (!text) return { valid: false, value: 0 }
  const num = Number(text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text)
  return Number.isFinite(num) && num >= 0 ? { valid: true, value: num } : { valid: false, value: 0 }
}

/** Etiquetas legibles de `behavior_type` (esquema `BehaviorTypeEnum`). */
export const BEHAVIOR_LABELS = {
  fixed: 'Fijo',
  variable_sales: 'Variable por Facturación',
  variable_receivables: 'Variable por Recaudo'
}

/** Etiquetas legibles de `line_type`. */
export const LINE_TYPE_LABELS = {
  income: 'Ingreso',
  expense: 'Gasto'
}

/**
 * Tasa variable cruda (0–1, esquema `variable_rate`) a porcentaje legible.
 * @param {number|null|undefined} rate
 * @returns {string} p. ej. `8 %` o '—'.
 */
export function formatVariableRate(rate) {
  const num = Number(rate)
  if (!Number.isFinite(num)) return '—'
  return `${Number((num * 100).toFixed(2))} %`
}

/**
 * Opciones de año para los selectores de filtro/creación (FE-S4 §6.1/§7):
 * rango añoActual−2 .. añoActual+5.
 * @param {number} [baseYear] inyectable para pruebas locales.
 * @returns {number[]}
 */
export function buildYearOptions(baseYear = new Date().getFullYear()) {
  const years = []
  for (let year = baseYear - 2; year <= baseYear + 5; year += 1) years.push(year)
  return years
}

/** Etiquetas de chip de estado de escenario (§6.1). */
export const STATUS_LABELS = {
  active: '🎯 Meta Activa',
  draft: 'Borrador',
  closed: 'Cerrado'
}

/**
 * @param {string} status
 * @returns {{ label: string, tone: string }}
 */
export function statusChipOf(status) {
  if (status === 'active') return { label: STATUS_LABELS.active, tone: 'active' }
  if (status === 'closed') return { label: STATUS_LABELS.closed, tone: 'closed' }
  return { label: STATUS_LABELS.draft, tone: 'draft' }
}
