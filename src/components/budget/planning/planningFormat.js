/**
 * Utilidades de formato del Módulo de Planeación y Escenarios
 * (FE-S4-BUDGET-PLANNING §6.1/§8.2/NFR-F5).
 *
 * Mismos formateadores `Intl` del repo (patrón de `UploadFeedbackModal`):
 * moneda COP `es-CO` sin decimales visibles (los montos SIIGO son enteros;
 * desviación menor y documentada frente al `Intl.NumberFormat('es-CO',
 * {style:'currency', currency:'COP'})` literal de la spec para no mostrar
 * ",00" en celdas y totales). La EDICIÓN siempre ocurre en número crudo.
 *
 * ORGANIZACIÓN (FASE 1, split por dominio — comportamiento intacto): este
 * archivo conserva SOLO los formatters/parsers y actúa como BARRIL que
 * re-exporta todo el dominio de planeación para los ~19 consumidores que
 * importan desde aquí:
 *  - `planningDate.js`      — primitivas de fecha/mes (`MONTH_LABELS`,
 *    `monthIndexOf`, `monthBucketIndexOf`, `cfMonthOf`, `monthEndOf`,
 *    `addDaysISO`, `monthEndsOfYear` — las dos últimas consolidadas desde
 *    `cashFlowPivot.js` y `executivePivot.js`).
 *  - `planningIva.js`       — `IVA_RATE`, `ivaFlagEffective`, `withIva`,
 *    `ivaOf`, `lineChargesIva` (FE-S14-IVA §5).
 *  - `planningCogs.js`      — pool/resolvedor de tasa de costo (FE-S7 §4).
 *  - `planningCausation.js` — bases de causación/entrada del variable y
 *    distribución de cobro (REVISIÓN 4/5 + A-01..A-04).
 *  - `planningLabels.js`    — etiquetas y notas de presentación.
 * El barril importa de los módulos de dominio; NUNCA al revés (sin ciclos).
 */

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
})

/**
 * FE-S15-COLLAB §7.1: formato de montos de NÓMINA con DOS decimales visibles
 * (el motor cuantiza a 2 dec. con ROUND_HALF_UP — NFR-04 BE — y el desglose
 * debe mostrar centavos para poder cuadrar contra contabilidad). No reemplaza
 * a `formatMoney` (cero decimales) usado en la cuadrícula SIIGO, donde los
 * montos son enteros y mostrar ",00" ensucia las celdas.
 */
const copDetailedFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

/**
 * @param {number|string|null|undefined} value
 * @returns {string} `$ 1.234.567` o '—' si no es número finito.
 */
export function formatMoney(value) {
  const num = Number(value)
  return Number.isFinite(num) ? copFormatter.format(num) : '—'
}

/**
 * Monto de nómina COP con 2 decimales (`$ 2.750.440,00`).
 * @param {number|string|null|undefined} value
 * @returns {string} `$ …,00` o '—' si no es número finito.
 */
export function formatCOP(value) {
  const num = Number(value)
  return Number.isFinite(num) ? copDetailedFormatter.format(num) : '—'
}

const intFormatter = new Intl.NumberFormat('es-CO')

/**
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatCount(value) {
  const num = Number(value)
  return Number.isFinite(num) ? intFormatter.format(num) : '—'
}

/* ─────────── FE-S18 (spec frontend.03_18) RF-7/RF-2.2: cifras SIN símbolo ni decimales ─────────── */
/**
 * Formateador de las celdas de dinero: SIN decimales visibles
 * (`maximumFractionDigits: 0`). Fuentes con decimales (nómina 2 dec.,
 * intereses financiados, promedios) se muestran redondeadas al peso — el
 * redondeo es SOLO de display; el valor crudo en el dato nunca cambia y la
 * EDICIÓN siempre ocurre en número crudo.
 */
const moneyPlainFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0
})

/**
 * RF-7.1: monto SIN símbolo de moneda y SIN decimales para las tablas pivote de
 * Planificación (moneda declarada UNA vez por pestaña en la intro — RF-7.4;
 * sin decimales por decisión del usuario). Miles con punto es-CO:
 * `1234567 → "1.234.567"`; `2750440.5 → "2.750.441"` (redondeo solo display).
 * NO reemplaza a `formatMoney` (con `$`), que otros módulos del CRM siguen
 * usando — RF-7.6.
 * @param {number|string|null|undefined} value
 * @returns {string} `1.234.567` o '—' si no es número finito.
 */
export function formatMoneyPlain(value) {
  const num = Number(value)
  return Number.isFinite(num) ? moneyPlainFormatter.format(num) : '—'
}

/**
 * RF-2.2: versión COMPACTA sin símbolo y SIN decimales para celdas de `106px`
 * donde el plain no cabe (RF-1.6): `|v| ≥ 10 000 000 → "12 MM"` (millones
 * ENTEROS, sin decimales: `12.340.000 → "12 MM"` · `1.234.567.890 → "1.235 MM"`)
 * · resto delega en `formatMoneyPlain` (redondeo al peso; mismo '—' para no
 * finito). SIEMPRE deberá acompañarse de un `title` con el valor completo en
 * el render (AC-4: ninguna información se pierde). Nunca para cabeceras ni
 * rótulos (RF-2.2).
 * @param {number|string|null|undefined} value
 * @returns {string} `12 MM` / `1.235 MM` / `1.234.567` o '—'.
 */
export function formatMoneyCompact(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  const abs = Math.abs(num)
  if (abs >= 10_000_000) return `${moneyPlainFormatter.format(num / 1_000_000)} MM`
  return formatMoneyPlain(num)
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

/**
 * Normalización de la puntuación `es-CO` de un monto tecleado/pegado a texto
 * `Number`-parseable (hallazgo 3 de auditoría FE): el propio módulo PINTA los
 * montos con puntos de miles (`formatMoneyPlain` → `1.234.567`), así que
 * teclear o pegar el valor mostrado debe ser idempotente:
 *  - Con coma: el ÚLTIMO separador es el decimal y el otro es de miles
 *    ("1.234,5" → "1234.5" es-CO · "1,234.5" → "1234.5" en-US).
 *  - Solo coma: coma decimal ("12,5" → "12.5", comportamiento ASM-12 original).
 *  - Solo puntos: agrupación ESTRICTA de miles es-CO (`\d{1,3}(\.\d{3})+`,
 *    p. ej. "1.234" → "1234", "1.234.567" → "1234567") se colapsa; cualquier
 *    otra forma ("1234.56", "1234.5") conserva el punto decimal estándar.
 * @param {string} text texto ya recortado
 * @returns {string}
 */
function normalizeEsCOAmount(text) {
  const hasComma = text.includes(',')
  const hasDot = text.includes('.')
  if (hasComma && hasDot) {
    return text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(/,/g, '.')
      : text.replace(/,/g, '')
  }
  if (hasComma) return text.replace(/,/g, '.')
  if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(text)) return text.replace(/\./g, '')
  return text
}

/**
 * Validación pre-red de la celda del grid (§8.2, ASM-12): numérico, finito y
 * `>= 0`. Acepta la puntuación `es-CO` que el propio módulo pinta: coma
 * decimal ("12,5" → 12.5) y puntos de miles ("1.234" → 1234,
 * "1.234.567" → 1234567, "1.234,5" → 1234.5 — `normalizeEsCOAmount`).
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
  const num = Number(normalizeEsCOAmount(text))
  return Number.isFinite(num) && num >= 0 ? { valid: true, value: num } : { valid: false, value: 0 }
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

/* ─────────── BARRIL: re-exports del dominio (movidos FASE 1, verbatim) ─────────── */

export {
  MONTH_LABELS,
  monthIndexOf,
  monthBucketIndexOf,
  cfMonthOf,
  monthEndOf,
  addDaysISO,
  monthEndsOfYear
} from './planningDate.js'

export { IVA_RATE, ivaFlagEffective, withIva, ivaOf, lineChargesIva } from './planningIva.js'

export {
  cogsRatePoolForDate,
  buildCogsRatePool,
  resolveCogsPctFromPool,
  resolveCogsPctByLine
} from './planningCogs.js'

export {
  fixedIncomeCausationSeries,
  fixedIncomeCausationByCeco,
  resolveVariableBaseCeco,
  fixedIncomeCausationByVariableCeco,
  entradasCausacionByCeco,
  entradasCausacionByVariableCeco,
  fixedIncomeBucketByCeco,
  entradasBucketByCeco,
  fixedIncomeBucketByVariableCeco,
  entradasBucketByVariableCeco,
  variableCollectionDistribution,
  VARIABLE_COLLECTION_DISTRIBUTION_NOTE
} from './planningCausation.js'

export {
  STATUS_LABELS,
  statusChipOf,
  BEHAVIOR_LABELS,
  LINE_TYPE_LABELS,
  VARIABLE_PIVOT_NOTE
} from './planningLabels.js'
