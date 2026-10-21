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
/* ─────────── FE-S18 RF-4.2: ÚNICA definición de la nota del bloque estimado ─────────── */

/**
 * FE-S18 RF-4.2 — NOTA ÚNICA del bloque "Gastos variables (calculados)",
 * compartida por las Vistas Ejecutiva y Flujo (antes definida DOS veces con
 * variantes: Ejecutiva «tasa × ingresos presupuestados del mes»; Flujo
 * «tasa × ingresos fijos presupuestados del mes de causación»). El texto
 * fusionado conserva la aclaración específica del Flujo (base por causación,
 * ingresos fijos) sin perder la del Ejecutivo. Ambas vistas la consumen como
 * tooltip ⓘ junto al subtítulo del bloque (RF-3.2). No son cifras ni
 * comportamiento: texto de presentación compartido.
 */
/**
 * Fe-S18 RF-4.2 / ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21) — NOTA
 * ÚNICA del bloque "Gastos variables (calculados)", compartida por las Vistas
 * Ejecutiva y Flujo. La base se resuelve POR CECO generador (A-01) y DIFIERE
 * por comportamiento de la línea (A-02):
 *  - variable_sales (facturado): tasa × ingresos fijos (I) del MES DE
 *    CAUSACIÓN (budget_date) del CECO resuelto.
 *  - variable_receivables (recaudo): tasa × ENTRADAS del Flujo (R, cobros por
 *    su MES DE PAGO) del CECO resuelto — base NETA (el modo IVA del Flujo
 *    solo afecta a la PRESENTACIÓN del bloque Entradas, nunca a la base de
 *    comisiones).
 * El monto NO se almacena en las líneas del escenario; se recalcula al ajustar
 * el presupuesto. El drill-down de movimientos por CECO muestra esta MISMA
 * cifra reconciliada por línea (REVISIÓN 5 / frontend.03_21 §5.3 + A-02 §11).
 */
export const VARIABLE_PIVOT_NOTE =
  'Monto estimado según el comportamiento de la línea, con base por CECO ' +
  'resuelto (A-01): facturado = tasa × ingreso presupuestado del MES de ' +
  'causación; recaudo = tasa × ENTRADAS del Flujo del MES de cobro (base ' +
  'neta — specs backend.02_24 §5.2 / frontend.03_21 §4/§11). No se almacena ' +
  'en las líneas del escenario; se recalcula al ajustar el presupuesto. El ' +
  'drill-down de movimientos por CECO muestra esta MISMA cifra reconciliada ' +
  'por línea (REVISIÓN 5 / frontend.03_21 §5.3).'

/* ─────────── REVISIÓN 4 (frontend.03_19 §11): base compartida del variable ─────────── */

/**
 * REVISIÓN 4 (RF-11.3/RF-11.4) — Serie ÚNICA de "Σ ingresos fijos por mes de
 * CAUSACIÓN": cada línea `line_type === 'income'` con
 * `behavior_type === 'fixed'` suma su `projected_amount` (crudo y finito) en
 * `monthIndexOf(budget_date)`; meses sin ingresos o líneas ilegibles aportan
 * 0 / se omiten (`month < 0` ⇒ `continue` — igual que los pivotes).
 *
 * Esta serie ES la celda mensual de la fuente del monto variable:
 *  - Vista Ejecutiva: `incomePivot.columnTotals` de `executivePivot.js`
 *    (`buildFixedPivot(lines, 'income')` — el helper la reproduce EXACTO,
 *    por eso puebla el pivote variable de la Ejecutiva).
 *  - Vista Flujo: reemplaza el bucle inline `baseIngresosCausados` de
 *    `cashFlowPivot.js` (D-5 — misma definición, ahora con única fuente).
 *  - Drill-down de CECO (REVISIÓN 4): la consumen `movementAmountReconciled`
 *    (`cecoMovements.js`), pivot/tabla del detalle y `buildCecoSheets`.
 *
 * Test FE-S20/§11: el cuadre 1:1 entre matriz y detalle depende de que esta
 * función sea la ÚNICA implementación de la base evitando duplicados (RF-7.4).
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas del escenario
 * @returns {number[]} serie de 12 posiciones (índice 0 = Ene).
 */
export function fixedIncomeCausationSeries(lines) {
  const base = Array.from({ length: 12 }, () => 0)
  if (!Array.isArray(lines)) return base
  for (const line of lines) {
    if (line?.line_type !== 'income' || line?.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    const month = monthIndexOf(line.budget_date)
    if (month >= 0) base[month] += amount
  }
  return base
}

/**
 * REVISIÓN 5 (spec `frontend.03_21` §5.1 / espejo `backend.02_24` §5.2) — Map
 * de la MISMA regla de `fixedIncomeCausationSeries` cortada POR CECO:
 * `Map<id_cost_center, number[12]>` — Σ almacenada en
 * `monthIndexOf(budget_date)` de las líneas `income` + `behavior_type ===
 * 'fixed'` de CADA CECO. Consumidores del base per-CECO:
 *  - Vista Flujo: `baseIngresosCausadosPorCeco` de `cashFlowPivot.js`
 *    (D-5 — base B1c del variable).
 *  - Drill-down de CECO: `CecoDetailView.vue` toma la serie del CECO
 *    resuelto (AC-FE21-4/AC-16) y la inyecta en pivot/tabla/exportación.
 * CECO sin ingresos ⇒ sin fila en el Map (`get(c)` → `undefined`) — los
 * llamadores degradan a 0 (BR-FE21-02: sin exclusión, sin NaN).
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas del escenario
 * @returns {Map<number|string, number[]>} `id_cost_center → months[12]`
 */
export function fixedIncomeCausationByCeco(lines) {
  const byCeco = new Map()
  if (!Array.isArray(lines)) return byCeco
  for (const line of lines) {
    if (line?.line_type !== 'income' || line?.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    const month = monthIndexOf(line.budget_date)
    if (month < 0) continue
    const key = line.id_cost_center
    if (!byCeco.has(key))
      byCeco.set(
        key,
        Array.from({ length: 12 }, () => 0)
      )
    byCeco.get(key)[month] += amount
  }
  return byCeco
}

/* ─────────── ENMIENDA A-01 (spec frontend.03_21 §10): resolución por (zona, línea) ─────────── */

/**
 * ENMIENDA A-01 (2026-10-20) — Resolución del CECO GENERADOR de la base de un
 * gasto variable. Hallazgo real: los CECOs de ingreso ("Facturación…",
 * códigos 000xxx) están DESACOPLADOS de los CECOs de gasto variable
 * ("Comisiones…" 210xxx / "Despacho…" 320xxx); la base buscada con el
 * `id_cost_center` de la línea variable salía TODA en 0.
 *
 * Regla de decisión (A-01): la base se resuelve por **(id_zone, id_line)** del
 * CECO de la línea variable contra los CECOs con facturación (o recaudo):
 *  1. Propio CECO primero (compatibilidad): si `cecoId` ∈ `incomeCecoIds`
 *     ⇒ devolver `cecoId` (el CECO/receptor que también factura se sirve a sí).
 *  2. Si no: clave `(id_zone, id_line)` desde el catálogo del propio `cecoId`;
 *     candidatos = CECOs whose `(zone, line)` === clave Y con ingreso.
 *     EXACTAMENTE 1 ⇒ devolver; 0 o múltiples ⇒ `null` (SIN fallback).
 *
 * `null` ⇒ el llamador degrada la base a 0 (AC-FE21-9: zona+línea sin
 * facturación ⇒ 0, jamás al total global).
 * @param {number|string|null|undefined} cecoId `id_cost_center` de la línea variable
 * @param {Iterable<number|string>|Set<number|string>} incomeCecoIds
 *   CECOs que tienen ingreso (claves de `fixedIncomeCausationByCeco` o
 *   `incomePivot.rows.map(r => r.id)`).
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 *   (`id_cost_center`, `id_zone`, `id_line` — schema `CostCenter`).
 * @returns {number|string|null} CECO generador resuelto o `null`.
 */
export function resolveVariableBaseCeco(cecoId, incomeCecoIds, costCenters) {
  const incomeSet = incomeCecoIds instanceof Set ? incomeCecoIds : new Set(incomeCecoIds ?? [])
  if (incomeSet.has(cecoId)) return cecoId
  const catalog = Array.isArray(costCenters) ? costCenters : []
  const self = catalog.find((cc) => cc && cc.id_cost_center === cecoId)
  if (!self) return null
  const zone = self.id_zone
  const line = self.id_line
  if (zone == null || line == null) return null
  const candidates = catalog.filter(
    (cc) => cc && incomeSet.has(cc.id_cost_center) && cc.id_zone === zone && cc.id_line === line
  )
  return candidates.length === 1 ? candidates[0].id_cost_center : null
}

/**
 * ENMIENDA A-01 (spec `frontend.03_21` §10) — Base de ingresos fijos por mes
 * de causación, KEYED POR EL CECO DE GASTO VARIABLE: `Map<id_cost_center de la
 * línea variable, number[12]>`. Por cada CECO variable del escenario se
 * resuelve su CECO generador con `resolveVariableBaseCeco` (propio CECO
 * primero, luego única resolución por (zona, línea); 0 o múltiples candidatos
 * ⇒ sin fila — degradación a 0 en el llamador) y se copia su serie.
 *
 * Consumidor: `baseVariablePorCeco` de `cashFlowPivot.js` (bloque "Gastos
 * variables (calculados)" de la Vista Flujo) y `CecoDetailView.vue`
 * (reconciliación 1:1 del drill-down — AC-FE21-4). Serie idéntica a la de
 * `fixedIncomeCausationByCeco` del CECO generador (cero duplicación de la
 * agregación, RF-7.4).
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas del escenario
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @returns {Map<number|string, number[]>} `cecoVariableLine → months[12]`
 */
export function fixedIncomeCausationByVariableCeco(lines, costCenters) {
  const out = new Map()
  const allLines = Array.isArray(lines) ? lines : []
  const incomeByCeco = fixedIncomeCausationByCeco(allLines)
  const variableCecos = new Set()
  for (const line of allLines) {
    if (line?.line_type === 'expense' && line?.behavior_type !== 'fixed') {
      variableCecos.add(line.id_cost_center)
    }
  }
  for (const ceco of variableCecos) {
    const base = resolveVariableBaseCeco(ceco, incomeByCeco.keys(), costCenters)
    if (base === null) continue
    out.set(ceco, incomeByCeco.get(base))
  }
  return out
}

/* ─────────── ENMIENDA A-02 (spec frontend.03_21 §11): base de recaudo = ENTRADAS del flujo ─────────── */

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
 * ENMIENDA A-02 (spec `frontend.03_21` §11) — Serie de ENTRADAS del Flujo por
 * CECO: `Map<id_cost_center, number[12]>` — Σ de importes NETAOS
 * (`projected_amount` crudo, SIN el gross-up ×1.19 del modo IVA — D-FE14-7:
 * la base de comisiones es neta; el modo ON del bloque Entradas es SOLO
 * presentación) de las líneas `income` + `behavior_type === 'fixed'` en su
 * **MES DE PAGO** (`cfMonthOf`), no en su mes de causación.
 *
 * Es la variante NETA y explícita del pivote "Entradas" de `cashFlowPivot.js`
 * (`buildFlowPivot` con `monthOf: cfMonth` + `amountOf: grossLineAmount` —
 * ese pivote PINTA entrada bruta con el modo ON, esta serie es la BASE de
 * recaudo de `variable_receivables`). Igual que `fixedIncomeCausationByCeco`
 * pero por MES DE PAGO; misma degradación: CECO sin cobros ⇒ sin fila en el
 * Map (BR-FE21-02/AC-FE21-11).
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas del escenario
 * @returns {Map<number|string, number[]>} `id_cost_center → months[12]`
 */
export function entradasCausacionByCeco(lines, scenarioYear = null) {
  const byCeco = new Map()
  if (!Array.isArray(lines)) return byCeco
  for (const line of lines) {
    if (line?.line_type !== 'income' || line?.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    const month = cfMonthOf(line)
    if (month < 0) continue
    // ENMIENDA A-02 - cuadre con el backend: solo cobranza cuyo ANO DE COBRO
    // cae dentro del budget_year del escenario; un cobro de dic-N vencido en
    // ene-N+1 alimenta el presupuesto N+1 (el backend filtra
    // year(coalesce) == budget_year).
    const pays = String(line.payment_date || line.budget_date || '')
    if (scenarioYear != null && Number.isFinite(Number(scenarioYear)) &&
      Number(pays.slice(0, 4)) !== Number(scenarioYear)) {
      continue
    }
    const key = line.id_cost_center
    if (!byCeco.has(key))
      byCeco.set(
        key,
        Array.from({ length: 12 }, () => 0)
      )
    byCeco.get(key)[month] += amount
  }
  return byCeco
}

/**
 * ENMIENDA A-02 (spec `frontend.03_21` §11) — Base de RECAUDO por mes de COBRO
 * KEYED POR EL CECO DE GASTO VARIABLE: mismo patrón de
 * `fixedIncomeCausationByVariableCeco` (A-01: propio CECO primero, luego única
 * resolución por (id_zone, id_line) con `resolveVariableBaseCeco`; 0 o
 * múltiples candidatos ⇒ sin fila ⇒ degradación a 0, SIN fallback) pero sobre
 * la serie de ENTRADAS por mes de pago (`entradasCausacionByCeco`).
 *
 * Consumidores: el bloque variable de la Vista Flujo y de la Vista Ejecutiva
 * (A-02: solo para líneas `behavior_type === 'variable_receivables'`) y la
 * serie de drill-down de `CecoDetailView` (AC-FE21-4/AC-FE21-10). Las series
 * devueltas son NETA (sin gross-up — la base de comisiones nunca lleva IVA;
 * el modo ON de los inflows solo afecta a la presentación del bloque Entradas).
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas del escenario
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @returns {Map<number|string, number[]>} `cecoVariableLine → months[12]`
 */
export function entradasCausacionByVariableCeco(lines, costCenters, scenarioYear = null) {
  const out = new Map()
  const allLines = Array.isArray(lines) ? lines : []
  const entradasByCeco = entradasCausacionByCeco(allLines, scenarioYear)
  const variableCecos = new Set()
  for (const line of allLines) {
    if (line?.line_type === 'expense' && line?.behavior_type !== 'fixed') {
      variableCecos.add(line.id_cost_center)
    }
  }
  for (const ceco of variableCecos) {
    const base = resolveVariableBaseCeco(ceco, entradasByCeco.keys(), costCenters)
    if (base === null) continue
    out.set(ceco, entradasByCeco.get(base))
  }
  return out
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

/* ─────────── FE-S14-IVA §5: ÚNICA fuente local de la fórmula del IVA ─────────── */

/**
 * Tasa espejo del `TAX_RATE` del backend (D-FE14-6): CERO hardcodes de 0.19
 * fuera de este módulo. La liquidación usa `tax_rate_used` de la respuesta
 * del BE cuando existe (auditoría); las derivaciones de presentación usan
 * esta constante.
 */
export const IVA_RATE = 0.19

/**
 * Flag EFECTIVO de una línea (D-FE14-2 / BE D-S10-3): `NULL ≡ True` — sin
 * dato se asume gravado. Solo `false` literal excluye el IVA.
 * @param {boolean|null|undefined} flag `has_iva` crudo de la línea
 * @returns {boolean}
 */
export function ivaFlagEffective(flag) {
  return flag !== false
}

/**
 * Neto → bruto con IVA según el flag efectivo (NULL≡True). NO finitos
 * devuelven 0 (mismo contrato que los acumuladores de los pivotes).
 * @param {number|string|null|undefined} neto
 * @param {boolean|null|undefined} flag `has_iva` (o `true` para ingresos,
 *   que siempre generan IVA — D-S10-5)
 * @returns {number} `neto × (1 + IVA_RATE)` si está gravado; `neto` si no.
 */
export function withIva(neto, flag) {
  const num = Number(neto)
  if (!Number.isFinite(num)) return 0
  return ivaFlagEffective(flag) ? num * (1 + IVA_RATE) : num
}

/**
 * Cuota de IVA de un neto (el monto de la columna `IVA`). NO finitos ⇒ 0.
 * @param {number|string|null|undefined} neto
 * @param {boolean|null|undefined} flag `has_iva` efectivo (NULL≡True)
 * @returns {number} `neto × IVA_RATE` si está gravado; `0` si no.
 */
export function ivaOf(neto, flag) {
  const num = Number(neto)
  if (!Number.isFinite(num)) return 0
  return ivaFlagEffective(flag) ? num * IVA_RATE : 0
}

/**
 * Bandera efectiva de una `BudgetLine` para las derivaciones de caja:
 * INCOME/PURCHASE siempre gravadas (D-S10-5: el flag se ignora); EXPENSE con
 * `has_iva` NULL≡True (D-FE14-2).
 * @param {object|null|undefined} line
 * @returns {boolean}
 */
export function lineChargesIva(line) {
  if (!line || line.line_type === 'expense') return ivaFlagEffective(line?.has_iva)
  return true
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

/** Etiquetas legibles de `behavior_type` (esquema `BehaviorTypeEnum`). */
export const BEHAVIOR_LABELS = {
  fixed: 'Fijo',
  variable_sales: 'Variable por Facturación',
  variable_receivables: 'Variable por Recaudo'
}

/** Etiquetas legibles de `line_type` (FE-S9 §2.1: += `purchase`). */
export const LINE_TYPE_LABELS = {
  income: 'Ingreso',
  expense: 'Gasto',
  purchase: 'Compra'
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

/* ─────────── FE-S7-COGS-PAYFLOW §4: resolvedor compartido de tasa de costo ─────────── */

/**
 * Pool de tasas `line_cost_rates` VIGENTE a una fecha ISO de referencia —
 * extracción VERBATIM del path inline que `ExecutivePivotTable` evaluaba mes
 * a mes (FE-S4C §3.1, réplica del Q6 de `budgetEngine.get_pnl`,
 * `crm_backend/app/services/budgetEngine.py:480-492`): solo
 * `is_active === true`, ventana `[date_from, date_to]` por comparación
 * LEXICOGRÁFICA de ISOs con padding (`date_from <= ref <= date_to`), orden
 * `id_line_cost_rate DESC` (mayor id = definición más reciente = gana).
 * Anti-divergencia: ES el único sitio del FE que construye el pool; la
 * Ejecutiva y la derivación de pagos de la Vista Flujo (FE-S7) comparten
 * SIEMPRE la misma tasa para el mismo mes.
 * @param {Array<object>|null|undefined} rates catálogo crudo (se filtra defensivamente)
 * @param {string} referenceISO p. ej. month-end `'YYYY-MM-DD'`
 * @returns {Array<object>} candidatos ordenados DESC (aún sin escanear)
 */
export function cogsRatePoolForDate(rates, referenceISO) {
  return (Array.isArray(rates) ? rates : [])
    .filter(
      (rate) =>
        rate &&
        rate.is_active === true &&
        typeof rate.date_from === 'string' &&
        typeof rate.date_to === 'string' &&
        rate.date_from <= referenceISO &&
        referenceISO <= rate.date_to
    )
    .sort((a, b) => Number(b.id_line_cost_rate ?? 0) - Number(a.id_line_cost_rate ?? 0))
}

/**
 * Escaneo canónico del pool de `cogsRatePoolForDate` a un month-end: primera
 * coincidencia por línea gana (semántica `setdefault` de `get_pnl` = mayor
 * id) y la PRIMERA coincidencia global (`id_line == null`) es el respaldo
 * (también mayor id). Tasas con `cogs_pct` no finito se ignoran (guard
 * preexistente de la Ejecutiva, conservado).
 * @param {Array<object>|null|undefined} rates
 * @param {string} referenceISO
 * @returns {{ byLine: Map<number, number>, globalPct: number|null }} pct en escala 0–100
 */
export function buildCogsRatePool(rates, referenceISO) {
  const byLine = new Map()
  let globalPct = null
  for (const rate of cogsRatePoolForDate(rates, referenceISO)) {
    const pct = Number(rate.cogs_pct)
    if (!Number.isFinite(pct)) continue
    if (rate.id_line === null || rate.id_line === undefined) {
      if (globalPct === null) globalPct = pct
    } else if (!byLine.has(rate.id_line)) {
      byLine.set(rate.id_line, pct)
    }
  }
  return { byLine, globalPct }
}

/**
 * Cadena D-2/BR-7 de `get_pnl` SOBRE UN POOL ya construido (evita re-filtrar
 * y re-ordenar el catálogo por cada celda cuando el llamador resuelve varios
 * meses/líneas en bucle — `ExecutivePivotTable.costPivot` resuelve las 12
 * celdas de cada fila contra los pools memoizados de `monthlyRates`): línea
 * propia → respaldo global → `null`.
 * @param {{ byLine: Map<number, number>, globalPct: number|null }} pool
 * @param {number|null|undefined} lineId
 * @returns {number|null} pct 0–100 o `null`.
 */
export function resolveCogsPctFromPool(pool, lineId) {
  if (!pool) return null
  if (lineId !== null && lineId !== undefined && pool.byLine.has(lineId)) {
    return pool.byLine.get(lineId)
  }
  return pool.globalPct
}

/**
 * EL resolvedor canónico FE de `cogs_pct` (escala 0–100) de una Línea para
 * un mes: cadena exacta que la Ejecutiva aplicaba inline (línea propia →
 * respaldo global → `null` = sin tasa ⇒ degradación `—`/exclusión, D-8) y
 * que la Vista Flujo (FE-S7) reutiliza con el month-end del `budget_date` de
 * cada ingreso. `lineId == null` (CECO sin línea o catálogo caído) cae
 * directo al respaldo global, espejo de `lineIdForCostCenter` + la regla
 * D-2/BR-7 de `get_pnl`.
 * @param {Array<object>|null|undefined} rates `lineCostRates` del store
 * @param {number|null|undefined} lineId
 * @param {string|null|undefined} monthEndISO referencia del mes; `null`/no
 *   parseable ⇒ pool vacío ⇒ `null` (comparaciones ISO con `null` nunca casan).
 * @returns {number|null} pct 0–100 o `null` si no hay tasa aplicable.
 */
export function resolveCogsPctByLine(rates, lineId, monthEndISO) {
  if (typeof monthEndISO !== 'string') return null
  return resolveCogsPctFromPool(buildCogsRatePool(rates, monthEndISO), lineId)
}
