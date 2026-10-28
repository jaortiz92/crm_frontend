/**
 * planningCausation — base de causación/entrada del gasto variable y
 * distribución de cobro de la comisión por recaudo.
 *
 * Movido VERBATIM de `planningFormat.js` (FASE 1, split por dominio). Agrupa:
 *  - REVISIÓN 4 (frontend.03_19 §11): base compartida del variable (Σ ingresos
 *    fijos por mes de CAUSACIÓN, global y por CECO).
 *  - ENMIENDA A-01 (frontend.03_21 §10): resolución del CECO GENERADOR por
 *    (id_zone, id_line).
 *  - ENMIENDA A-02 (frontend.03_21 §11): base de recaudo = ENTRADAS del flujo
 *    por MES DE PAGO.
 *  - ENMIENDA A-03 (frontend.03_21 §12): buckets fuera de año extendidos.
 *  - ENMIENDA A-04 (frontend.03_21 §13): la comisión de recaudo sigue AL COBRO
 *    (`variableCollectionDistribution`).
 *
 * Importa sus primitivas temporales directamente de `planningDate.js`
 * (NUNCA del barril `planningFormat.js`, que importa de aquí).
 */
import { cfMonthOf, monthBucketIndexOf, monthIndexOf } from './planningDate.js'

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
    if (
      scenarioYear != null &&
      Number.isFinite(Number(scenarioYear)) &&
      Number(pays.slice(0, 4)) !== Number(scenarioYear)
    ) {
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
 * ENMIENDA A-04 (spec `frontend.03_21` §13, 2026-10-21) — NOTA del criterio
 * "CAJA" del bloque variable en la Vista Flujo: la comisión de
 * `variable_receivables` se posiciona en el BUCKET donde entra el COBRO que
 * la genera (Antes / Mes del año / Después), usando la tasa de la línea
 * concepto del MES DE FACTURACIÓN del cobro. La Ejecutiva sigue devengo
 * (divergencia por diseño — §13). Solo presentación; no toca cifras del P&G.
 */
export const VARIABLE_COLLECTION_DISTRIBUTION_NOTE =
  'Criterio de caja (A-04): la comisión por recaudo se muestra en el MES en ' +
  'que entra el COBRO que la genera. Antes = cobros del año anterior a N; ' +
  'Después = cobros posteriores (p. ej. facturación de nov/dic cobrada en ' +
  'N+1). Los cobros de un mes facturado SIN línea de tasa no generan ' +
  'comisión (sin respaldo). La Vista Ejecutiva mantiene el devengo por ' +
  'línea: sus montos difieren por diseño (frontend.03_21 §13).'

/** Shape de buckets extendidos (A-03), zeroed. Interno. */
function emptyBuckets() {
  return { before: 0, months: Array.from({ length: 12 }, () => 0), after: 0 }
}

/**
 * ENMIENDA A-03 — Serie de "Σ ingresos fijos por MES DE CAUSACIÓN"
 * (`budget_date`) con BUCKETS extendidos: `Map<id_cost_center, { before,
 * months[12], after }>`. Misma regla de `fixedIncomeCausationByCeco`
 * (A-01/A-02: importes crudos NETOS, income + fixed) con el bucket de
 * `monthBucketIndexOf`: facturación/cobro de año < N ⇒ `before`; año > N ⇒
 * `after`; del año ⇒ índice 0..11; ilegible ⇒ excluida (BR-FE21-02).
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas
 * @param {number|null|undefined} scenarioYear año N del escenario
 * @returns {Map<number|string, { before: number, months: number[], after: number }>}
 */
export function fixedIncomeBucketByCeco(lines, scenarioYear) {
  const byCeco = new Map()
  if (!Array.isArray(lines)) return byCeco
  for (const line of lines) {
    if (line?.line_type !== 'income' || line?.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    const bucket = monthBucketIndexOf(line.budget_date, scenarioYear)
    if (bucket === -99) continue
    const key = line.id_cost_center
    if (!byCeco.has(key)) byCeco.set(key, emptyBuckets())
    const buckets = byCeco.get(key)
    if (bucket === -1) buckets.before += amount
    else if (bucket === 12) buckets.after += amount
    else buckets.months[bucket] += amount
  }
  return byCeco
}

/**
 * ENMIENDA A-03 — Serie de ENTRADAS del Flujo por MES DE COBRO
 * (`cfMonthOf`) con BUCKETS extendidos y SIN el filtro de año de
 * `entradasCausacionByCeco`: aquí el bucket ES el filtro (cobros de 2025 ⇒
 * `before`; de 2027 ⇒ `after`; cobros de dic-N vencidos en ene-N+1 ⇒
 * `after`; el resto al mes del año). Misma lectura NETA (D-FE14-7):
 * `projected_amount` crudo de `income` + `fixed`. Fecha de cobro ilegible ⇒
 * excluida.
 * @param {Array<object>|null|undefined} lines `budget_lines` crudas
 * @param {number|null|undefined} scenarioYear año N del escenario
 * @returns {Map<number|string, { before: number, months: number[], after: number }>}
 */
export function entradasBucketByCeco(lines, scenarioYear) {
  const byCeco = new Map()
  if (!Array.isArray(lines)) return byCeco
  for (const line of lines) {
    if (line?.line_type !== 'income' || line?.behavior_type !== 'fixed') continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue
    // A-03: la resolución del bucket ES el filtro de año (sin `continue` de
    // year(payment) !== N — cf. `entradasCausacionByCeco` A-02).
    const bucket = monthBucketIndexOf(line?.payment_date || line?.budget_date, scenarioYear)
    if (bucket === -99) continue
    const key = line.id_cost_center
    if (!byCeco.has(key)) byCeco.set(key, emptyBuckets())
    const buckets = byCeco.get(key)
    if (bucket === -1) buckets.before += amount
    else if (bucket === 12) buckets.after += amount
    else buckets.months[bucket] += amount
  }
  return byCeco
}

/**
 * ENMIENDA A-03 — Base de FACTURACIÓN por buckets KEYED POR EL CECO DE GASTO
 * VARIABLE: mismo patrón de `fixedIncomeCausationByVariableCeco` (resolución
 * A-01: propio CECO primero, luego única (id_zone, id_line), sin fallback; 0
 * o múltiples candidatos ⇒ sin fila ⇒ degradación a 0 en el llamador) sobre
 * `fixedIncomeBucketByCeco`. Shape `{ before, months[12], after }` copiado.
 * @param {Array<object>|null|undefined} lines
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @param {number|null|undefined} scenarioYear año N del escenario
 * @returns {Map<number|string, { before: number, months: number[], after: number }>}
 */
export function fixedIncomeBucketByVariableCeco(lines, costCenters, scenarioYear) {
  const out = new Map()
  const allLines = Array.isArray(lines) ? lines : []
  const bucketsByCeco = fixedIncomeBucketByCeco(allLines, scenarioYear)
  const variableCecos = new Set()
  for (const line of allLines) {
    if (line?.line_type === 'expense' && line?.behavior_type !== 'fixed') {
      variableCecos.add(line.id_cost_center)
    }
  }
  for (const ceco of variableCecos) {
    const base = resolveVariableBaseCeco(ceco, bucketsByCeco.keys(), costCenters)
    if (base === null) continue
    out.set(ceco, bucketsByCeco.get(base))
  }
  return out
}

/**
 * ENMIENDA A-03 — Base de RECAUDO por buckets KEYED POR EL CECO DE GASTO
 * VARIABLE: mismo patrón de `entradasCausacionByVariableCeco` (resolución
 * A-01 intacta) sobre `entradasBucketByCeco` — buckets extendidos por MES DE
 * PAGO, NETA sin gross-up (D-FE14-7), SIN filtro de año (el bucket filtra).
 * @param {Array<object>|null|undefined} lines
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @param {number|null|undefined} scenarioYear año N del escenario
 * @returns {Map<number|string, { before: number, months: number[], after: number }>}
 */
export function entradasBucketByVariableCeco(lines, costCenters, scenarioYear) {
  const out = new Map()
  const allLines = Array.isArray(lines) ? lines : []
  const bucketsByCeco = entradasBucketByCeco(allLines, scenarioYear)
  const variableCecos = new Set()
  for (const line of allLines) {
    if (line?.line_type === 'expense' && line?.behavior_type !== 'fixed') {
      variableCecos.add(line.id_cost_center)
    }
  }
  for (const ceco of variableCecos) {
    const base = resolveVariableBaseCeco(ceco, bucketsByCeco.keys(), costCenters)
    if (base === null) continue
    out.set(ceco, bucketsByCeco.get(base))
  }
  return out
}

/* ─── ENMIENDA A-04 (spec frontend.03_21 §13): la comisión de recaudo sigue AL COBRO ─── */

/**
 * ENMIENDA A-04 (2026-10-21) — Distribución de COBRO de la comisión por
 * recaudo: para cada LÍNEA `variable_receivables` `v` (key = `id_budget_line`)
 * devuelve los buckets extendidos `{ before, months[12], after, unplaced }`
 * donde entra la comisión que sus cobros generan:
 *
 *  1. El concepto `v` fija la TASA de las ventas FACTURADAS en el mes `m`
 *     (`monthIndexOf(v.budget_date)`) del CECO GENERADOR RESUELTO (A-01:
 *     propio CECO primero, única (id_zone, id_line), SIN fallback).
 *  2. Para cada LÍNEA DE INGRESO `k` del generador cuya FACTURACIÓN cae en el
 *     mes `m` — month match por MES (1–12), SIN filtro de año de facturación:
 *     un bill facturado en dic del año N y cobrado en N+1 usa el rate de la
 *     línea dic-N y cae en `after` — v aporta `rate_v × projected_amount(k)`
 *     al bucket `monthBucketIndexOf(cobro de k, scenarioYear)` (-1 Antes,
 *     0..11, 12 Después).
 *  3. Mes de FACTURACIÓN sin línea concepto ⇒ la comisión de esos cobros es 0
 *     (rate ausente ⇒ 0) — SIN fallback (A-04 §13 punto 3).
 *  4. Cobro con fecha ILEGIBLE (bucket −99) ⇒ su contribución (con el rate de
 *     SU mes de facturación si lo tiene) se OMITE de las celdas y se contabiliza
 *     en `unplaced` (telemetría invisible: la hoja nunca lo muestra).
 *
 *  - IMPORTES NETOS: `projected_amount` crudo (D-FE14-7 — misma lectura NETA
 *    de A-02; el gross-up del DERIVADO lo aplica el pivote por línea).
 *  - Bills con mes de facturación ILEGIBLE ⇒ no pueden casar con ninguna
 *    línea concepto ⇒ aporte 0 (no entran ni al `unplaced`).
 *  - Varias líneas concepto del MISMO CECO+mes acumulan (Σ de contribuciones
 *    por línea — punto 2 de la fórmula).
 *  - Deuda documentada: facturaciones del año N−1 COBRADAS dentro de N sí
 *    casan por mes (12) con el rate de la línea dic-N — mismo criterio que
 *    los cobros "Antes" reales del escenario 573.
 *
 * Consumidores: `buildVariableFlowPivot` (cashFlowPivot.js, 7º parámetro) —
 * las líneas `variable_receivables` del Flujo consumen SU entrada idéntica
 * (gross-up ×1.19 según flag efectivo, D-FE14). Ejecutiva y drill-down NO
 * consumen este map (devengo intacto — A-02, divergencia por diseño).
 * @param {Array<object>|null|undefined} varReceivablesLines líneas
 *   `expense` + `variable_receivables` del escenario
 * @param {Array<object>|null|undefined} incomeLines líneas de ingreso fijas
 *   (`income` + `fixed`: la facturación generadora)
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 * @param {number|null|undefined} scenarioYear año N del escenario
 * @returns {Map<number, { before: number, months: number[], after: number, unplaced: number }>}
 *   key = `id_budget_line` de la línea variable
 */
export function variableCollectionDistribution(
  varReceivablesLines,
  incomeLines,
  costCenters,
  scenarioYear
) {
  const out = new Map()
  const concepts = (Array.isArray(varReceivablesLines) ? varReceivablesLines : [])
    .filter(
      (line) =>
        line && line.line_type === 'expense' && line.behavior_type === 'variable_receivables'
    )
    .sort((a, b) => Number(a?.id_budget_line ?? 0) - Number(b?.id_budget_line ?? 0))
  const bills = Array.isArray(incomeLines) ? incomeLines : []
  if (!concepts.length) return out

  // Índice por (CECO, MES de facturación 0..11) de los importes NETOS con su
  // bucket DE COBRO — una sola pasada sobre la facturación.
  const billsByCecoMonth = new Map()
  for (const bill of bills) {
    if (bill?.line_type !== 'income' || bill?.behavior_type !== 'fixed') continue
    const amount = Number(bill.projected_amount)
    if (!Number.isFinite(amount)) continue
    const key = bill.id_cost_center
    if (!billsByCecoMonth.has(key)) billsByCecoMonth.set(key, new Map())
    const cecoBills = billsByCecoMonth.get(key)
    const billingMonth = monthIndexOf(bill.budget_date)
    if (billingMonth < 0) continue // facturación ilegible ⇒ nunca casa con un concepto
    if (!cecoBills.has(billingMonth))
      cecoBills.set(billingMonth, {
        before: 0,
        months: Array.from({ length: 12 }, () => 0),
        after: 0,
        unplaced: 0
      })
    const buckets = cecoBills.get(billingMonth)
    // Bucket por el MES DE COBRO efectivo (mismo criterio de
    // `entradasBucketByCeco`, A-03: sin filtro de año — el bucket ES el filtro).
    const bucket = monthBucketIndexOf(bill?.payment_date || bill?.budget_date, scenarioYear)
    if (bucket === -1) buckets.before += amount
    else if (bucket === 12) buckets.after += amount
    else if (bucket === 0 || (bucket >= 0 && bucket <= 11)) buckets.months[bucket] += amount
    else buckets.unplaced += amount // −99: cobro ilegible ⇒ omitido (telemetría)
  }

  for (const line of concepts) {
    const resolved = resolveVariableBaseCeco(
      line.id_cost_center,
      billsByCecoMonth.keys(),
      costCenters
    )
    if (resolved === null) continue
    const billingMonth = monthIndexOf(line.budget_date)
    if (billingMonth < 0) continue // concepto sin mes legible ⇒ no fija rate para ningún mes
    const rate = Number(line.variable_rate)
    if (!Number.isFinite(rate) || rate === 0) continue // rate ausente ⇒ 0 (sin fallback)
    const cecoBills = billsByCecoMonth.get(resolved)
    const bucketSplit = cecoBills ? cecoBills.get(billingMonth) : null
    if (!bucketSplit) continue // mes facturado sin cobros … aporte 0 (nada que distribuir)
    if (!out.has(line.id_budget_line))
      out.set(line.id_budget_line, {
        before: 0,
        months: Array.from({ length: 12 }, () => 0),
        after: 0,
        unplaced: 0
      })
    const outBuckets = out.get(line.id_budget_line)
    outBuckets.before += rate * bucketSplit.before
    for (let month = 0; month < 12; month += 1) {
      outBuckets.months[month] += rate * bucketSplit.months[month]
    }
    outBuckets.after += rate * bucketSplit.after
    outBuckets.unplaced += rate * bucketSplit.unplaced
  }
  return out
}
