/**
 * componentLabels — ÚNICO espejo de literales del dominio de colaboradores
 * (FE-S15-COLLAB D-FE15-1: "constante espejo permitida … — cosmética, NO
 * aritmética"). Aquí viven:
 *  - las 4 etiquetas ESPEJO EXACTO del enum `contract_type` del BE-S11 §6
 *    (tabla de mapeo de la plantilla) para que UI y Excel nunca diverjan
 *    (regla §7.5);
 *  - tipos de documento (CC/CE/NIT, §4.1 BE);
 *  - etiquetas del catálogo `cost_components` (solo FALLBACK cosmético: el
 *    desglose SIEMPRE prioriza el `name` que envía el BE);
 *  - textos de capa CAJA/PROVISION (§7.2) y estados del maestro (§7.3);
 *  - clases de riesgo ARL I–V;
 *  - definiciones de claves de `labor_cost_parameters` (§4.3 BE) para el grid
 *    editable del tab "Parámetros laborales" (etiqueta + tipo de entrada).
 *
 * CERO fórmulas de nómina, cero tasas: los importes, prorrateos y fechas
 * vienen SIEMPRE del motor (D-FE15-1). Las "próximas fechas legales" de las
 * cards de provisiones se muestran como texto informativo del calendario
 * legal (espejo de §5.3 BE), no como cálculo monetario.
 */

/* ───────────────────────────── maestro (collaborators) ───────────────────────────── */

/** Tipos de documento (§4.1 BE: `doc_type String(4)`). */
export const DOC_TYPE_OPTIONS = [
  { value: 'CC', label: 'CC — Cédula de ciudadanía' },
  { value: 'CE', label: 'CE — Cédula de extranjería' },
  { value: 'NIT', label: 'NIT' }
]

/**
 * Contratos: ESPEJO EXACTO de la tabla de mapeo de la plantilla (BE-S11 §6).
 * `label` = cadena literal del Excel/plantilla; `value` = enum BE. La regla
 * §7.5 exige que la UI use ESTAS etiquetas para que ambos lados nunca diverjan.
 */
export const CONTRACT_TYPE_OPTIONS = [
  { value: 'open_ended', label: 'Término indefinido' },
  { value: 'fixed_term', label: 'Término fijo' },
  { value: 'work_or_service', label: 'Obra o labor' },
  { value: 'service_provision', label: 'Prestación de servicios' }
]

/** @param {string} value @returns {string} etiqueta es o el valor crudo. */
export function contractTypeLabel(value) {
  const found = CONTRACT_TYPE_OPTIONS.find((option) => option.value === value)
  return found ? found.label : String(value ?? '—')
}

/** Estados del maestro (§7.3: active verde / terminated gris). */
export const COLLAB_STATUS_LABELS = {
  active: { label: 'ACTIVO', tone: 'active' },
  terminated: { label: 'TERMINADO', tone: 'terminated' }
}

/** @param {string} status @returns {{ label: string, tone: string }} */
export function collabStatusBadge(status) {
  return COLLAB_STATUS_LABELS[status] || { label: String(status ?? '—'), tone: 'terminated' }
}

/** Clases de riesgo ARL I–V (§4.1/§4.4 BE). */
export const RISK_CLASS_OPTIONS = ['I', 'II', 'III', 'IV', 'V']

/* ───────────────────────────── desglose (breakdown) ───────────────────────────── */

/**
 * Capas del motor (§7.2): CAJA azul "paga este mes"; PROVISION ámbar "paga
 * {fecha_legal}" con tooltip canónico "causada hoy, pagada en fecha legal".
 * Badge con TEXTO además del color (NFR-FE-3).
 */
export const LAYER_META = {
  CAJA: {
    label: 'CAJA',
    tone: 'caja',
    caption: 'Pagos que salen de caja este mes',
    tooltip: 'Capa CAJA: se paga este mes (fecha de pago proyectada en la fila)'
  },
  PROVISION: {
    label: 'PROVISIÓN',
    tone: 'provision',
    caption: 'Causada hoy, pagada en fecha legal',
    tooltip: 'Capa PROVISIÓN: causada hoy, pagada en fecha legal (ver columna de pago)'
  }
}

/** @param {string} layer @returns {{ label: string, tone: string, tooltip: string }} */
export function layerMeta(layer) {
  const key = String(layer ?? '').toUpperCase()
  return LAYER_META[key] || { label: key || '—', tone: 'provision', tooltip: '' }
}

/**
 * FALLBACK cosmético de nombres de componente (el BE ya envía `name` en el
 * desglose y en el catálogo: esto solo cubre un `code` sin nombre, p. ej.
 * respuestas parciales). NO es aritmética — D-FE15-1.
 */
export const COMPONENT_LABELS = {
  SAL: 'Salario + asignaciones',
  C1S: 'Honorarios',
  TRA: 'Auxilio de transporte',
  SALUD: 'Seguridad social – Salud (patronal)',
  PENSION: 'Seguridad social – Pensión (patronal)',
  ARL: 'Seguridad social – ARL',
  CAJA: 'Caja de compensación',
  SENA: 'SENA',
  ICBF: 'ICBF',
  PRIMA: 'Prima de servicios',
  CESANTIAS: 'Cesantías',
  INTERESES: 'Intereses sobre cesantías',
  LIQ: 'Liquidación por término',
  PRE_EXTRALEGAL: 'Prima extralegal',
  VAC_COMPENSATORIO: 'Vacaciones compensatorias'
}

/** @param {string} code @returns {string} nombre del catálogo o fallback. */
export function componentLabel(code, fallbackName = '') {
  const clean = String(code ?? '').toUpperCase()
  return fallbackName || COMPONENT_LABELS[clean] || clean || '—'
}

/**
 * Componentes de provisión con su calendario LEGAL de pago (espejo textual
 * de BE §5.3; la fecha exacta la fija el BE en cada asiento — esto solo
 * etiqueta la card). `mmdd` alimenta el helper `nextLegalDateText`.
 */
export const PROVISION_CARDS = [
  {
    code: 'PRIMA',
    title: 'Prima de servicios',
    schedule: '30/06 y 20/12',
    mmdd: ['06-30', '12-20']
  },
  {
    code: 'CESANTIAS',
    title: 'Cesantías',
    schedule: 'a más tardar el 14/02 del año siguiente',
    mmdd: ['02-14']
  },
  {
    code: 'INTERESES',
    title: 'Intereses sobre cesantías',
    schedule: 'a más tardar el 31/01 del año siguiente',
    mmdd: ['01-31']
  }
]

/**
 * Texto INFORMATIVO de la próxima fecha legal (calendario, no dinero):
 * primera ocurrencia ≥ hoy entre los MM-DD dados. Se usa SOLO como etiqueta
 * de la card; el asiento real con su `payment_date` lo muestra el desglose.
 * @param {string[]} mmddList p. ej. ['06-30','12-20']
 * @param {Date} [reference] inyectable para pruebas locales
 * @returns {string} `dd/mm/aaaa`
 */
export function nextLegalDateText(mmddList, reference = new Date()) {
  const year = reference.getFullYear()
  let best = null
  for (const mmdd of Array.isArray(mmddList) ? mmddList : []) {
    const match = String(mmdd).match(/^(\d{2})-(\d{2})$/)
    if (!match) continue
    const month = Number(match[1])
    const day = Number(match[2])
    for (const candidateYear of [year, year + 1]) {
      const candidate = new Date(candidateYear, month - 1, day)
      if (candidate < reference) continue
      if (!best || candidate < best) best = candidate
    }
  }
  if (!best) return '—'
  const day = String(best.getDate()).padStart(2, '0')
  const month = String(best.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${best.getFullYear()}`
}

/* ───────────────────────────── parámetros laborales (§4.3 BE) ───────────────────────────── */

/**
 * Definiciones del grid editable del tab "Parámetros laborales" (espejo de
 * la tabla §4.3 de backend.02_21). Tipos de entrada:
 *  - `money`     → monto COP (se serializa como número crudo string)
 *  - `percent`   → fracción 0–1 en el BE; la UI muestra/edita PORCENTAJE
 *                  (escala %↔fracción solo presentacional, precedente FE-S5
 *                  FD5-3; NO es cálculo de nómina)
 *  - `int`       → entero (topes en SMLV)
 *  - `mmdd`      → fecha de calendario "MM-DD"
 *  - `enum`      → select con `options`
 * CERO valores default en UI: el grid se hidrata SOLO con lo que responde el
 * BE (D-FE15-1: la fuente tarifaria es única; no inventamos tasas).
 */
export const LABOR_PARAM_DEFS = [
  { key: 'smlv', label: 'SMLV (COP/mes)', type: 'money', group: 'Bases' },
  {
    key: 'aux_transporte_valor',
    label: 'Auxilio de transporte (COP/mes)',
    type: 'money',
    group: 'Bases'
  },
  {
    key: 'aux_transporte_tope_smlv',
    label: 'Tope salario para auxilio (× SMLV)',
    type: 'int',
    group: 'Bases'
  },
  {
    key: 'salud_patronal_pct',
    label: 'Salud patronal (EPS)',
    type: 'percent',
    group: 'Seguridad social'
  },
  { key: 'pension_pct', label: 'Pensión patronal', type: 'percent', group: 'Seguridad social' },
  {
    key: 'arl_default_class',
    label: 'Clase ARL por defecto',
    type: 'enum',
    options: RISK_CLASS_OPTIONS,
    group: 'Seguridad social'
  },
  { key: 'caja_pct', label: 'Caja de compensación', type: 'percent', group: 'Parafiscales' },
  { key: 'caja_tope_smlv', label: 'Base caja ≤ N × SMLV', type: 'int', group: 'Parafiscales' },
  { key: 'sena_pct', label: 'SENA', type: 'percent', group: 'Parafiscales' },
  { key: 'icbf_pct', label: 'ICBF', type: 'percent', group: 'Parafiscales' },
  {
    key: 'aplicacion_parafiscales',
    label: 'Aplicación de parafiscales',
    type: 'enum',
    options: [
      { value: 'all', label: 'Todos (sin exoneración)' },
      { value: 'exonerated_lt100', label: 'Exonerados < 100 empleados' },
      { value: 'custom', label: 'Custom' }
    ],
    group: 'Parafiscales'
  },
  {
    key: 'prima_tasa',
    label: 'Tasa de causación mensual prima',
    type: 'percent',
    group: 'Prestaciones'
  },
  {
    key: 'prima_tope_smlv_base',
    label: 'Base prima ≤ N × SMLV',
    type: 'int',
    group: 'Prestaciones'
  },
  {
    key: 'cesantias_tasa',
    label: 'Tasa de causación mensual cesantías',
    type: 'percent',
    group: 'Prestaciones'
  },
  {
    key: 'intereses_cesantias_anual',
    label: 'Intereses cesantías (anual)',
    type: 'percent',
    group: 'Prestaciones'
  },
  {
    key: 'integral_ibc_factor',
    label: 'Factor IBC salario integral',
    type: 'percent',
    group: 'Salario integral'
  },
  {
    key: 'integral_tope_smlv',
    label: 'Tope IBC integral (× SMLV)',
    type: 'int',
    group: 'Salario integral'
  },
  {
    key: 'dia_pago_salario',
    label: 'Día de pago del salario',
    type: 'enum',
    options: [
      { value: 'last_business_day', label: 'Último día hábil' },
      { value: 'day', label: 'Día del mes (escribir número)' }
    ],
    freeEntry: true,
    group: 'Fechas de pago'
  },
  {
    key: 'dia_pago_servicios',
    label: 'Día de pago de honorarios',
    type: 'enum',
    options: [
      { value: 'last_business_day', label: 'Último día hábil' },
      { value: 'day', label: 'Día del mes (escribir número)' }
    ],
    freeEntry: true,
    group: 'Fechas de pago'
  },
  { key: 'fecha_prima_1', label: 'Fecha prima 1 (MM-DD)', type: 'mmdd', group: 'Fechas de pago' },
  { key: 'fecha_prima_2', label: 'Fecha prima 2 (MM-DD)', type: 'mmdd', group: 'Fechas de pago' },
  {
    key: 'fecha_intereses',
    label: 'Fecha intereses cesantías (MM-DD)',
    type: 'mmdd',
    group: 'Fechas de pago'
  },
  {
    key: 'fecha_cesantias',
    label: 'Fecha cesantías (MM-DD)',
    type: 'mmdd',
    group: 'Fechas de pago'
  }
]

/**
 * Modo del selector `dia_pago_*`: `last_business_day` literal o un número
 * (día del mes) como texto. La UI lo modela como enum + entrada libre.
 */
export const DIA_PAGO_LAST_BUSINESS = 'last_business_day'

/** @param {string} value @returns {boolean} */
export function isDiaPagoMode(value) {
  return String(value ?? '') === DIA_PAGO_LAST_BUSINESS
}

/** Opciones del modal "Recalcular…" (D-FE15-9: el usuario controla meses). */
export const RECALC_SCOPES = [
  { value: 'all', label: 'Todos los colaboradores' },
  { value: 'cost_center', label: 'Por centro de costo (CECO)' },
  { value: 'collaborator', label: 'Un colaborador' }
]
