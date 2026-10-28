/**
 * planningDate — primitivas de fecha/mes del Módulo de Planeación y Escenarios.
 *
 * Consolidación FASE 1 (split de `planningFormat.js`) de las primitivas
 * temporales que vivían dispersas en tres archivos:
 *  - `MONTH_LABELS`, `monthIndexOf`, `monthBucketIndexOf` y `cfMonthOf`
 *    movidas VERBATIM desde `planningFormat.js`.
 *  - `monthEndOf` y `addDaysISO` movidas VERBATIM desde `cashFlowPivot.js`
 *    (que las conserva re-exportadas por compatibilidad con sus consumidores).
 *  - `monthEndsOfYear` movida VERBATIM desde `executivePivot.js`.
 *
 * Regla de dominio que estas primitivas encarnan (se conserva tal cual): las
 * fechas ISO puras (`YYYY-MM-DD`) se parsean por regex para evitar el
 * corrimiento UTC→local de `new Date(...)`; PROHIBIDO `toISOString()` y las
 * comparaciones de `Date` para buckets y month-ends.
 */

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

/* ─── ENMIENDA A-03 (spec frontend.03_21 §12): buckets fuera de año extendidos ─── */

/**
 * ENMIENDA A-03 (2026-10-21) — Bucket extendido de una fecha efectiva:
 *  -1 = año < N (Antes) · 0..11 = MES del año N · 12 = año > N (Después) ·
 *  -99 = fecha ILEGIBLE (el llamador decide la degradación).
 * Réplica del AÑO de `outOfYearBucketOf` (cashFlowPivot.js — NO se importa:
 * ese módulo importa planningFormat, un import inverso crearía ciclo) y del
 * MES de `monthIndexOf`: año/mes extraídos del string ISO por regex (NUNCA
 * comparación de `Date` para el bucket — corrimiento UTC).
 *
 * Con `scenarioYear` no entero (p. ej. null): misma degradación del resto de
 * los pivotes — `outOfYearBucketOf` devuelve 0 y la fecha entra a su mes si
 * es legible; aquí eso es dev `0..11` directo.
 * @param {string|null|undefined} dateISO fecha cruda (`budget_date`, `payment_date`, …)
 * @param {number|null|undefined} scenarioYear año N del escenario
 * @returns {-1|0|1|2|3|4|5|6|7|8|9|10|11|12|-99}
 */
export function monthBucketIndexOf(dateISO, scenarioYear) {
  if (!dateISO) return -99
  let year = null
  let month = null
  const plain = String(dateISO).match(/^(\d{4})-(\d{2})/)
  if (plain) {
    year = Number(plain[1])
    month = Number(plain[2])
  } else {
    const date = new Date(dateISO)
    if (!Number.isNaN(date.getTime())) {
      year = date.getFullYear()
      month = date.getMonth() + 1
    }
  }
  if (year === null || month === null) return -99
  if (!Number.isFinite(year) || !Number.isInteger(month) || month < 1 || month > 12) return -99
  // scenarioYear null/no entero ⇒ degradación del resto de los pivotes
  // (outOfYearBucketOf ⇒ 0: la fecha entra a su mes si es legible).
  const yearN = Number(scenarioYear)
  if (scenarioYear === null || !Number.isInteger(yearN)) return month - 1
  if (year < yearN) return -1
  if (year > yearN) return 12
  return month - 1
}

/**
 * ENMIENDA A-02 (2026-10-21) — Mes de COBRO/ENTRADA de una línea (fe-12): es
 * el `cfMonth` de la Vista Flujo — `payment_date` con fallback a `budget_date`
 * (R-1). Extraído para que la base de recaudo y los pivotes de cobro usen LA
 * MISMA convención temporal (RF-7.4).
 * @param {object|null|undefined} line
 * @returns {number} índice 0–11 (Ene = 0) o −1 si no es parseable.
 */
export function cfMonthOf(line) {
  return monthIndexOf(line?.payment_date || line?.budget_date)
}

/**
 * Último día calendario del mes de una fecha ISO `YYYY-MM-DD` (ancla de
 * referencia de la tasa de costo — FE-S7 §5). (Movida verbatim.)
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function monthEndOf(value) {
  if (!value) return null
  let year
  let month
  const plain = String(value).match(/^(\d{4})-(\d{2})/)
  if (plain) {
    year = Number(plain[1])
    month = Number(plain[2])
  } else {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    year = date.getFullYear()
    month = date.getMonth() + 1
  }
  if (!Number.isFinite(year) || !Number.isInteger(year) || month < 1 || month > 12) return null
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  const dd = String(last).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${mm}-${dd}`
}

/**
 * Suma `days` (entero; NEGATIVO = antes de la ancla) a una fecha ISO y
 * re-serializa ISO (aritmética `Date.UTC` — jamás `toISOString`).
 * (Movida verbatim de `CashFlowPivotTable.addDaysISO`.)
 * @param {string|null|undefined} value
 * @param {number} days
 * @returns {string|null}
 */
export function addDaysISO(value, days) {
  const offset = Number(days)
  if (!value || !Number.isInteger(offset)) return null
  let year
  let month
  let day
  const plain = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (plain) {
    year = Number(plain[1])
    month = Number(plain[2])
    day = Number(plain[3])
  } else {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    year = date.getFullYear()
    month = date.getMonth() + 1
    day = date.getDate()
  }
  if (!Number.isFinite(year) || !Number.isInteger(year) || month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const shifted = new Date(Date.UTC(year, month - 1, day) + offset * 86400000)
  if (Number.isNaN(shifted.getTime())) return null
  const yyyy = String(shifted.getUTCFullYear()).padStart(4, '0')
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Último día calendario de cada mes 0–11 del año en ISO local `YYYY-MM-DD`
 * (D-3; movida verbatim del computed `monthEndISO`). PROHIBIDO
 * `toISOString()` (corrimiento UTC): `new Date(year, m + 1, 0)` + padding
 * manual de componentes locales.
 * @param {number|string|null|undefined} budgetYear
 * @returns {string[]}
 */
export function monthEndsOfYear(budgetYear) {
  const parsed = Number(budgetYear)
  const year = Number.isFinite(parsed) && parsed > 0 ? parsed : new Date().getFullYear()
  return Array.from({ length: 12 }, (_, month) => {
    const last = new Date(year, month + 1, 0)
    const mm = String(last.getMonth() + 1).padStart(2, '0')
    const dd = String(last.getDate()).padStart(2, '0')
    return `${last.getFullYear()}-${mm}-${dd}`
  })
}
