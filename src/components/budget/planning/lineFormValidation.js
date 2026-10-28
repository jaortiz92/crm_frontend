/**
 * lineFormValidation — reglas de validación PRE-red del `LineFormModal`
 * (AC-FD-8: borde rojo sin request) como funciones PURAS.
 *
 * FASE 3: extraídas VERBATIM de `LineFormModal.vue` (los computeds
 * `yearValid`/`cecoError`/`budgetDateError`/`amountError`/`rateError` y los
 * helpers `ratePctNumber`/`rateDecimal`/`RATE_PREFILL_DRIFT_TOLERANCE`) para
 * poder caracterizarlas sin montar el modal (`tests/lineFormValidation.test.js`).
 * Cero cambios de mensajes ni de semántica: mismas cadenas literales de la
 * spec y mismos umbrales.
 *
 * El "borrador" (`draft`) es el estado del formulario del modal (SIEMPRE
 * strings; se numericen en los payloads): `{ idCostCenter, budgetDate,
 * paymentDate, idCollection, behaviorType, amountText, ratePct, description,
 * hasIva }`. El año del escenario viaja aparte (`scenarioYear`) porque el
 * modal lo toma de `props.scenario?.budget_year`. `isEdit` viaja como boolean
 * (en el modal es el computed `isEdit`).
 */
import { parseCellAmount } from './planningFormat.js'

/**
 * Tolerancia anti-drift del prefill de tasa (hallazgo 4 de auditoría FE):
 * `prefillFromLine` muestra el % con 2 decimales, así que re-guardar la línea
 * SIN tocar el campo recalcularía una fracción truncada (p. ej. 0.0833333 →
 * 0.0833) y el PUT reescribiría la tasa sin intención del usuario. El drift
 * máximo del prefill es medio paso de 0.01 % (⇒ 0.00005 de tasa); un cambio
 * REAL desde el formulario es ≥ 0.0001 (un paso del %) y siempre supera el
 * umbral, así que solo los re-guardados inocuos se suprimen.
 */
export const RATE_PREFILL_DRIFT_TOLERANCE = 0.00005

/**
 * `null` = tasa vacía; si no, número finito (o NaN si el texto no es válido).
 * Acepta la coma decimal es-CO cuando no hay punto ("8,5" → 8.5).
 * @param {string|number} rawRatePct
 * @returns {number|null|NaN}
 */
export function parseRatePct(rawRatePct) {
  const raw = String(rawRatePct).trim()
  if (!raw) return null
  const num = Number(raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw)
  return Number.isFinite(num) ? num : NaN
}

/**
 * Tasa cruda 0–1 para el payload (FD-8: `tasa/100`; redondeo anti float-garbage).
 * @param {number|null|NaN} ratePctNumber
 * @returns {number|null}
 */
export function rateDecimalOf(ratePctNumber) {
  return ratePctNumber === null || Number.isNaN(ratePctNumber)
    ? null
    : Number((ratePctNumber / 100).toFixed(6))
}

/**
 * Año de `budget_date` = año del escenario (espejo de BR-LINE-04, AC-FD-8).
 * `input type=date` entrega ISO puro 'YYYY-MM-DD': se lee el año del string
 * (patrón de `planningFormat.monthIndexOf`, sin corrimiento UTC→local de
 * `new Date(v).getFullYear()`), mismo resultado semántico que pide la spec.
 * @param {string} budgetDate
 * @param {number|undefined} scenarioYear
 * @returns {boolean}
 */
export function isBudgetYearValid(budgetDate, scenarioYear) {
  if (!budgetDate) return false
  return Number(budgetDate.slice(0, 4)) === Number(scenarioYear)
}

/**
 * CECO obligatorio (§3.2). Vacío ⇒ error; cualquier valor truthy pasa (la
 * validación de existencia es server-side, 404 FK).
 * @param {{ idCostCenter: string|number }} draft
 * @returns {string} '' cuando es válido.
 */
export function cecoErrorOf(draft) {
  return draft.idCostCenter ? '' : 'El CECO es obligatorio.'
}

/**
 * Fecha proyectada: obligatoria y del año del escenario (AC-FD-8/BR-LINE-04).
 * @param {{ budgetDate: string }} draft
 * @param {number|undefined} scenarioYear
 * @returns {string} '' cuando es válida.
 */
export function budgetDateErrorOf(draft, scenarioYear) {
  if (!draft.budgetDate) return 'La fecha proyectada es obligatoria.'
  if (!isBudgetYearValid(draft.budgetDate, scenarioYear)) {
    return `La fecha debe ser del año ${scenarioYear ?? '—'} del escenario.`
  }
  return ''
}

/**
 * Monto: obligatorio y válido SOLO en líneas fijas (en variables el monto se
 * deriva de la tasa, BR-LINE-07 — el campo va deshabilitado). Misma
 * normalización es-CO que la celda del grid (`parseCellAmount`, ASM-12).
 * @param {{ behaviorType: string, amountText: string }} draft
 * @returns {string} '' cuando es válido.
 */
export function amountErrorOf(draft) {
  const isVariable = draft.behaviorType !== 'fixed'
  if (isVariable) return ''
  if (!String(draft.amountText).trim()) return 'El monto es obligatorio.'
  if (!parseCellAmount(draft.amountText).valid) return 'Debe ser un número mayor o igual que 0.'
  return ''
}

/**
 * Tasa: SOLO líneas variables. Obligatoria en create; en edit vacía = "sin
 * cambio" (PUT parcial, keep). Rango cerrado 0–100 % (0 y 100 válidos).
 * @param {{ behaviorType: string, ratePct: string }} draft
 * @param {boolean} isEdit
 * @returns {string} '' cuando es válida.
 */
export function rateErrorOf(draft, isEdit) {
  const isVariable = draft.behaviorType !== 'fixed'
  if (!isVariable) return ''
  const ratePctNumber = parseRatePct(draft.ratePct)
  if (ratePctNumber === null) {
    // Obligatoria en create; en edit vacía = "sin cambio" (PUT parcial, keep).
    return isEdit ? '' : 'La tasa es obligatoria para líneas variables.'
  }
  if (Number.isNaN(ratePctNumber) || ratePctNumber < 0 || ratePctNumber > 100) {
    return 'La tasa debe ser un número entre 0 y 100.'
  }
  return ''
}
