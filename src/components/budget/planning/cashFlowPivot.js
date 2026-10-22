/**
 * cashFlowPivot — modelo de cómputo de la "Vista Flujo" (FE-S20 / spec
 * `frontend.03_20` §7.2).
 *
 * Extracción VERBATIM de los cómputos que vivían inline en
 * `CashFlowPivotTable.vue` (FE-S4B-BUDGET-FLUJO + FE-S6/S7/S9/S10/S14/S17),
 * para que el botón "Exportar" de `BudgetGridEditor` reuse EXACTAMENTE las
 * mismas funciones de agregación que pintan la pantalla (§5: la matriz
 * exportada es la matriz visible, respetando `ivaMode` — CA-4). El
 * componente consume el modelo vía `createCashFlowPivotModel` y conserva la
 * presentación (celdas `·`/`—`/compactas, notas, toggle fuera-de-año); el
 * comportamiento visual NO cambia (AC-7 de FE-S18).
 *
 * Igual que `executivePivot.js`: builders PUROS + factory reactiva cuyo
 * parámetro `scenario`/`financing*Lines` acepta valor crudo o GETTER
 * (`() => props.x`) para mantener la reactividad del componente; la
 * exportación one-shot pasa valores crudos de la caché del store (cero HTTP).
 */
import { computed } from 'vue'
import {
  formatDateEs,
  entradasBucketByVariableCeco,
  entradasCausacionByVariableCeco,
  fixedIncomeBucketByVariableCeco,
  fixedIncomeCausationByCeco,
  fixedIncomeCausationByVariableCeco,
  ivaOf,
  lineChargesIva,
  monthBucketIndexOf,
  monthIndexOf,
  resolveCogsPctByLine,
  variableCollectionDistribution,
  withIva
} from './planningFormat.js'
import { lineIdForCostCenter } from './cecoMovements.js'

/**
 * Año N del escenario (base de los buckets fuera-de-año; `null` si no es
 * entero). Única definición (el componente la reexportaba inline).
 * @param {object|null|undefined} scenario
 * @returns {number|null}
 */
export function scenarioYearOf(scenario) {
  const year = Number(scenario?.budget_year)
  return Number.isInteger(year) ? year : null
}

/**
 * Bucket fuera-de-año de una fecha efectiva (§6.2): `-1` antes del 01/01/N,
 * `+1` después del 31/12/N, `0` dentro de N o indeterminable. El año se
 * extrae del string ISO con regex (patrón `monthIndexOf`) — NUNCA por
 * comparación de `Date` (corrimiento UTC).
 * (Movida verbatim de `CashFlowPivotTable.outOfYearBucket`, parametrizada.)
 * @param {string|null|undefined} value
 * @param {number|null} yearN
 * @returns {-1|0|1}
 */
export function outOfYearBucketOf(value, yearN) {
  if (!value || yearN === null) return 0
  let year
  const plain = String(value).match(/^(\d{4})-/)
  if (plain) {
    year = Number(plain[1])
  } else {
    const date = new Date(value)
    year = Number.isNaN(date.getTime()) ? null : date.getFullYear()
  }
  if (year === null) return 0
  if (year < yearN) return -1
  if (year > yearN) return 1
  return 0
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
 * Pivote genérico de un bloque del Flujo: filas = CECO (agrupa todas sus
 * líneas, orden `localeCompare(..., 'es')`), columnas Ene–Dic según
 * `monthOf(line)`, celda = Σ del monto presentado; totales por fila/columna/
 * bloque. **ENMIENDA A-05** (spec `frontend.03_21` §14, BR-FE21-16):
 * `total`/`grandTotal` = SOLO la Σ de los 12 meses; el todo-inclusive
 * (meses + Antes + Después) vive en `generalTotal`/`grandGeneralTotal`.
 * Fuera-de-año (FE-S8): los montos con bucket ±1 NUNCA pueblan celdas
 * mensuales ni `columnTotals`; viven en `before`/`after`. (Movido de
 * `CashFlowPivotTable.buildPivot`, con deps como parámetros.)
 * @param {Array<object>} lines `budget_lines` del escenario
 * @param {{
 *   match: (line: object) => boolean,
 *   monthOf: (line: object) => number,
 *   amountOf?: (line: object) => number|null,
 *   costCenterLabel: (id: number|string|null|undefined) => string,
 *   scenarioYear: number|null
 * }} deps
 */
export function buildFlowPivot(
  lines,
  { match, monthOf, amountOf = null, costCenterLabel, scenarioYear }
) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  /**
   * ENMIENDA A-05 (spec `frontend.03_21` §14, 2026-10-21 — BR-FE21-16):
   * `grandTotal` pasa a ser la Σ de SOLO los 12 meses (antes: todo-inclusive
   * con Antes/Después); el todo-inclusive vive en `grandGeneralTotal`
   * (BR-FE21-17) para la columna "Total General".
   */
  let grandTotal = 0
  let grandGeneralTotal = 0
  /** Hallazgo 5 (auditoría FE): Σ de montos con fecha efectiva ILEGIBLE. */
  let undatedTotal = 0

  for (const line of lines) {
    if (!match(line)) continue
    const amount = amountOf ? amountOf(line) : Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        generalTotal: 0,
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthOf(line)
    const bucket = outOfYearBucketOf(line.payment_date || line.budget_date, scenarioYear)
    // FE-S8-FLUJO-OY C-1 (FR-1): el fuera-de-año NUNCA puebla la celda
    // mensual ni `columnTotals`; `bucket === 0` cubre fechas indeterminables.
    // A-05 (BR-FE21-16): el `total` de fila = SOLO los 12 meses; el
    // todo-inclusive (meses + Antes + Después + ilegible) es `generalTotal`.
    if (month >= 0 && bucket === 0) {
      row.months[month] += amount
      columnTotals[month] += amount
      row.total += amount
      grandTotal += amount
    }
    if (bucket === -1) row.before += amount
    else if (bucket === 1) row.after += amount
    // Hallazgo 5 (auditoría FE): fecha efectiva no parseable (month −1 con
    // bucket 0) no puebla celda, bucket ni el total de 12 meses; solo el
    // General (A-05) y el `undatedTotal` del aviso al pie.
    if (month < 0 && bucket === 0) undatedTotal += amount
    row.generalTotal += amount
    grandGeneralTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0
  for (const row of rows) {
    beforeTotal += row.before
    afterTotal += row.after
    if (Math.abs(row.before) + Math.abs(row.after) > 0) beforeAfterRowCount += 1
  }
  return {
    rows,
    columnTotals,
    grandTotal,
    // A-05: 12 meses + Antes + Después (+ ilegible).
    grandGeneralTotal,
    beforeTotal,
    afterTotal,
    beforeAfterRowCount,
    undatedTotal
  }
}

/**
 * Builder HERMANO de `buildFlowPivot` para cuotas derivadas
 * `{ idCostCenter, amount, effectiveDate, rowKey?, label? }` (FE-S7 §5 +
 * FE-S14 D-FE14-3). (Movida verbatim de `CashFlowPivotTable.buildPivotFrom`.)
 * @param {Array<object>} rows cuotas derivadas
 * @param {{ costCenterLabel: (id: number|string|null|undefined) => string, scenarioYear: number|null }} deps
 */
export function buildDerivedPivot(rows, { costCenterLabel, scenarioYear }) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  // A-05 (BR-FE21-16/17): `grandTotal` = solo 12 meses; el todo-inclusive
  // (meses + Antes + Después + ilegible) vive en `grandGeneralTotal`.
  let grandTotal = 0
  let grandGeneralTotal = 0
  /** Hallazgo 5 (auditoría FE): Σ de cuotas con fecha efectiva ILEGIBLE. */
  let undatedTotal = 0

  for (const item of rows) {
    const amount = Number(item.amount)
    if (!Number.isFinite(amount)) continue

    // FE-S14-IVA D-FE14-3: `rowKey`/`label` opcionales → agrupación SINTÉTICA.
    const key = item.rowKey ?? item.idCostCenter
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: item.label ?? costCenterLabel(item.idCostCenter),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        generalTotal: 0,
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(item.effectiveDate)
    const bucket = outOfYearBucketOf(item.effectiveDate, scenarioYear)
    if (month >= 0 && bucket === 0) {
      row.months[month] += amount
      columnTotals[month] += amount
      row.total += amount
      grandTotal += amount
    }
    if (bucket === -1) row.before += amount
    else if (bucket === 1) row.after += amount
    if (month < 0 && bucket === 0) undatedTotal += amount
    row.generalTotal += amount
    grandGeneralTotal += amount
  }

  const out = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0
  for (const row of out) {
    beforeTotal += row.before
    afterTotal += row.after
    if (Math.abs(row.before) + Math.abs(row.after) > 0) beforeAfterRowCount += 1
  }
  return {
    rows: out,
    columnTotals,
    grandTotal,
    grandGeneralTotal,
    beforeTotal,
    afterTotal,
    beforeAfterRowCount,
    undatedTotal
  }
}

/**
 * Pivote ESTIMADO de gastos variables del Flujo (D-5, réplica de la "Opción
 * A") con **BASE POR CECO** (spec `frontend.03_21` §5.2 / espejo
 * `backend.02_24` §5.2): cada línea variable aporta `(tasa || 0) × base(m)`
 * en `m = monthIndexOf(budget_date)` (causación de la comisión).
 *
 * **ENMIENDA A-01 (§10, 2026-10-20)** — la base NO se busca con el propio
 * `id_cost_center` de la línea (desacoplado de los CECOs de facturación
 * 000xxx) sino del CECO generador resuelto por **(id_zone, id_line)**
 * (propio CECO primero, sin fallback).
 *
 * **ENMIENDA A-02 (§11, 2026-10-21)** — CADA línea usa la base de SU
 * comportamiento (espejo del motor backend):
 *  - `variable_sales` ⇒ base de FACTURACIÓN `baseByCecoSales`
 *    (`fixedIncomeCausationByVariableCeco` — I por budget_date del generador).
 *  - `variable_receivables` ⇒ base de RECAUDO `baseByCecoRecaudo`
 *    (`entradasCausacionByVariableCeco` — ENTRADAS del Flujo por MES DE PAGO
 *    del generador, serie NETA sin gross-up ×1.19: el modo IVA del bloque
 *    Entradas es SOLO presentación, no base de comisiones).
 * CECO sin base resuelta o bucket sin base
 * ⇒ aporte 0 (BR-VE-02/BR-FE21-02: sin exclusión, sin NaN). Gross-up × 1.19
 * del monto DERIVADO según el flag efectivo (D-FE14: base neta, monto
 * bruto). `null` si no hay líneas variables o la base es toda cero.
 * Nota frontend.03_21 §5.2/§10: la base B2c del backend (`R_c(m) = I_c(m) +
 * AR_c(m)`) incluiría también el AR vencido del CECO generador resuelto; el
 * frontend compone la componente de COBRO del flujo (A-02) — el AR vencido
 * por CECO sigue sin data en la caché del planning (gap documentado §10).
 *
 * **ENMIENDA A-03 (§12, 2026-10-21)** — los DOS maps de base cambian de
 * `number[12]` a BUCKETS extendidos `{ before: number, months: number[12],
 * after: number }` (`fixedIncomeBucketByVariableCeco` /
 * `entradasBucketByVariableCeco`) y la firma gana el 6º parámetro
 * `scenarioYear`. El monto derivado (tasa × base — MISMA fórmula, D-FE14 +
 * A-02 BR-FE21-06) se posiciona en `row.months[bucket]` / `row.before` /
 * `row.after` con `bucket = monthBucketIndexOf(line.budget_date,
 * scenarioYear)`: `-1` ⇒ Antes, `12` ⇒ Después, `0..11` ⇒ celda del año;
 * `-99` (fecha ilegible) ⇒ no posiciona (aporte 0, misma política del
 * `month < 0` original; el ROW sí existe con montos en 0). `undatedTotal`
 * queda 0 por construcción (el monto es derivado: sin periodo legible no
 * hay base ⇒ aporte 0) — la clave se mantiene por shape homogéneo con
 * `buildFlowPivot`. Las series mensuales contienen SOLO año N ⇒ el P&G de
 * la Ejecutiva y el resumen 12-meses no cambian (BR-FE21-10).
 * @param {Array<object>} source líneas de gasto variables
 * @param {Map<number|string, {before: number, months: number[], after: number}>} baseByCecoSales
 *   base de FACTURACIÓN por CECO de gasto variable en BUCKETS
 *   (A-03: `fixedIncomeBucketByVariableCeco` — I por budget_date del
 *   generador resuelto por (zona, línea), Antes/Después incluidos).
 * @param {Map<number|string, {before: number, months: number[], after: number}>} baseByCecoRecaudo
 *   base de RECAUDO por CECO de gasto variable en BUCKETS
 *   (A-03: `entradasBucketByVariableCeco` — R por cfMonth del generador,
 *   ahora SIN filtro de año: el bucket filtra; neta sin gross-up).
 * @param {(id: number|string|null|undefined) => string} costCenterLabel
 * @param {boolean} ivaActive modo "Con IVA"
 * @param {number|null|undefined} scenarioYear año N del escenario (A-03);
 *   `null`/no entero ⇒ degradación igual que el resto de los pivotes.
 *
 * **ENMIENDA A-04 (§13, 2026-10-21)** — las líneas `variable_receivables`
 * dejan de aportar `tasa × baseC[bucket]` (line-based) y pasan a consumir la
 * DISTRIBUCIÓN DE COBRO `collectionDistribution`
 * (`variableCollectionDistribution`, key = `id_budget_line`): la comisión se
 * posiciona en el bucket donde entra el COBRO que la genera (Antes / Mes /
 * Después) usando la tasa de la línea concepto del MES DE FACTURACIÓN del
 * cobro (§13 puntos 1–4). Los 12 meses cambian de composición: mes `b` =
 * Σ contribuciones de cobros con bucket `b`. Distribución presente sin
 * entrada para la línea ⇒ aporte 0 (Cobros del generador sin línea concepto
 * ⇒ sin comisión — sin fallback). Parámetro omitido (callers legacy/tests)
 * ⇒ se conserva el path line-based A-03 con `baseByCecoRecaudo`. El gross-up
 * del DERIVADO sigue por línea (D-FE14). `variable_sales`, los totales
 * (before/after/months/total, `beforeAfterRowCount`, `undatedTotal` = 0 por
 * construcción) y la degradación con shapes NO cambian.
 * @param {Map<number, {before: number, months: number[], after: number, unplaced: number}>|null} collectionDistribution
 *   distribución de cobro por LÍNEA variable (A-04); `null` ⇒ path legacy.
 */
export function buildVariableFlowPivot(
  source,
  baseByCecoSales,
  baseByCecoRecaudo,
  costCenterLabel,
  ivaActive,
  scenarioYear,
  collectionDistribution = null
) {
  // A-03: cualquier bucket del mapa cuenta como base disponible.
  const anyBase = (map) =>
    [...map.values()].some(
      (buckets) =>
        buckets &&
        (buckets.before !== 0 || buckets.after !== 0 || buckets.months.some((value) => value !== 0))
    )
  // A-04: la distribución de cobro habilita el pivote igual que las bases.
  const anyDistribution = (map) =>
    map instanceof Map &&
    [...map.values()].some(
      (buckets) =>
        buckets &&
        (buckets.before !== 0 || buckets.after !== 0 || buckets.months.some((value) => value !== 0))
    )
  const distribution = collectionDistribution instanceof Map ? collectionDistribution : null
  if (
    !source.length ||
    (!anyBase(baseByCecoSales) && !anyBase(baseByCecoRecaudo) && !anyDistribution(distribution))
  ) {
    return null
  }

  // FE-S14-IVA §4.1: con el modo OFF identidad exacta (cero gross-up).
  const grossDerived = (net, charged = true) => (!ivaActive || !charged ? net : withIva(net, true))

  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  // A-05 (BR-FE21-16/17): `grandTotal` = solo 12 meses; el todo-inclusive
  // (meses + Antes + Después) vive en `grandGeneralTotal`.
  let grandTotal = 0
  let grandGeneralTotal = 0
  let beforeTotal = 0
  let afterTotal = 0
  let beforeAfterRowCount = 0

  /**
   * A-04: suma los buckets de COBRO de una línea derivada al row/columnTotals
   * y a los sumatorios Antes/Después, con el gross-up del flag efectivo de la
   * línea (D-FE14); `unplaced` queda FUERA (contribución omitida, §13).
   * A-05 (BR-FE21-16): los meses suman SOLO al `total` de fila y al
   * `grandTotal` de 12 meses; Antes/Después van al lado General.
   * @returns {number} Σ NETA contribuida (para el bruto del total por línea).
   */
  function addCollectionBuckets(row, buckets, charged) {
    let netSum = 0
    for (let month = 0; month < 12; month += 1) {
      const net = Number(buckets.months[month]) || 0
      if (net === 0) continue
      row.months[month] += grossDerived(net, charged)
      columnTotals[month] += grossDerived(net, charged)
      row.total += grossDerived(net, charged)
      grandTotal += grossDerived(net, charged)
      netSum += net
    }
    const netBefore = Number(buckets.before) || 0
    if (netBefore !== 0) {
      row.before += grossDerived(netBefore, charged)
      beforeTotal += grossDerived(netBefore, charged)
      netSum += netBefore
    }
    const netAfter = Number(buckets.after) || 0
    if (netAfter !== 0) {
      row.after += grossDerived(netAfter, charged)
      afterTotal += grossDerived(netAfter, charged)
      netSum += netAfter
    }
    return netSum
  }

  for (const line of source) {
    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        generalTotal: 0,
        before: 0,
        after: 0
      })
    }
    const row = byCeco.get(key)

    // A-04: variable_receivables consume la DISTRIBUCIÓN DE COBRO (key =
    // id_budget_line): posiciona la comisión donde entra el cobro que la
    // genera. Sin entrada ⇒ aporte 0 (cobros sin línea concepto ⇒ sin
    // comisión, sin fallback). Parámetro ausente ⇒ path legacy A-03.
    if (line.behavior_type === 'variable_receivables' && distribution) {
      const buckets = distribution.get(line.id_budget_line)
      if (buckets) {
        const charged = lineChargesIva(line)
        const netSum = addCollectionBuckets(row, buckets, charged)
        const grossSum = grossDerived(netSum, charged)
        // A-05: total de fila = SOLO meses (ya sumado en addCollectionBuckets
        // y `addCollectionBuckets` también suma `grandTotal`); el bruto del
        // monto contribuido (meses + antes + después) va al lado General.
        row.generalTotal += grossSum
        grandGeneralTotal += grossSum
      }
      continue
    }

    // A-03: bucket extendido de la CAUSACIÓN de la comisión (budget_date de
    // la línea) contra el año N del escenario.
    const bucket = monthBucketIndexOf(line.budget_date, scenarioYear)
    if (bucket === -99) continue
    const rate = Number(line.variable_rate) || 0
    // Base por CECO generador (A-01 + A-02, frontend.03_21 §5.2/§10/§11):
    // la serie ya llega resuelta y keyed por el CECO de la línea; la elección
    // por comportamiento (facturado ⇒ I causado; recaudo ⇒ cobro del mes)
    // vive en el llamador vía los DOS maps. Sin resolución ⇒ 0.
    const baseByCeco =
      line.behavior_type === 'variable_receivables' ? baseByCecoRecaudo : baseByCecoSales
    const baseC = baseByCeco.get(line.id_cost_center)
    // A-03: base del BUCKET (mensual del año / Antes / Después).
    const baseValue =
      bucket === -1
        ? baseC
          ? baseC.before || 0
          : 0
        : bucket === 12
          ? baseC
            ? baseC.after || 0
            : 0
          : baseC
            ? baseC.months[bucket] || 0
            : 0
    const amount = grossDerived(rate * baseValue, lineChargesIva(line))
    if (bucket === -1) {
      row.before += amount
      beforeTotal += amount
    } else if (bucket === 12) {
      row.after += amount
      afterTotal += amount
    } else {
      // bucket 0..11: dentro del año N (o mes legible con año no entero —
      // misma degradación de `buildFlowPivot` con yearN null). A-05: único
      // lugar que suma al `total` de fila y al `grandTotal` de 12 meses.
      row.months[bucket] += amount
      columnTotals[bucket] += amount
      row.total += amount
      grandTotal += amount
    }
    row.generalTotal += amount
    grandGeneralTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  for (const row of rows) {
    if (Math.abs(row.before) + Math.abs(row.after) > 0) beforeAfterRowCount += 1
  }
  // Shape homogéneo con `buildFlowPivot` (hallazgo 5): variables siempre ∈ N.
  // A-03: beforeTotal/afterTotal/beforeAfterRowCount REALES (antes 0 hardcode).
  return {
    rows,
    columnTotals,
    grandTotal,
    grandGeneralTotal,
    beforeTotal,
    afterTotal,
    beforeAfterRowCount,
    undatedTotal: 0
  }
}

/**
 * Pivote del arrastre N−1 (FE-S6 §6.1): MISMA ubicación mensual por fecha
 * efectiva, agrupado por `CECO|origen` con desempate
 * `line < cogs < purchase < internment`. (Movida verbatim de
 * `CashFlowPivotTable.buildCarryPivot`, sin su guard `carryActive` — el
 * llamador decide.)
 * @param {Array<object>} carryLines `store.carryover.lines`
 * @param {(line: object) => boolean} match
 * @param {(id: number|string|null|undefined) => string} costCenterLabel
 * @returns {object|null} `null` cuando no hay arrastre activo.
 */
const CARRY_ORIGIN_RANK = { line: 0, cogs: 1, purchase: 2, internment: 3 }

export function buildCarryPivot(carryLines, match, costCenterLabel, carryActive) {
  if (!carryActive) return null
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of carryLines) {
    if (!match(line)) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const origin = ['cogs', 'purchase', 'internment'].includes(line.origin) ? line.origin : 'line'
    const key = `${line.id_cost_center}|${origin}`
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        key,
        id: line.id_cost_center,
        origin,
        label: costCenterLabel(line.id_cost_center),
        months: Array.from({ length: 12 }, () => 0),
        total: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(line.payment_date || line.budget_date)
    if (month >= 0) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    row.total += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort(
    (a, b) =>
      a.label.localeCompare(b.label, 'es') ||
      CARRY_ORIGIN_RANK[a.origin] - CARRY_ORIGIN_RANK[b.origin]
  )
  return { rows, columnTotals, grandTotal }
}

/**
 * Series "fuera de año" del resumen de liquidez (FE-S8-FLUJO-OY C-2/FR-4) +
 * bandera `any` (¿algún bloque propio tiene montos fuera de año?): derivadas
 * SOLO de los totales ya calculados de los pivotes — cero re-recorridos de
 * líneas. (Movida verbatim de `CashFlowPivotTable.ooyColumns`/`anyOutOfYear`,
 * que antes vivían separadas y ahora comparten esta única pasada.)
 * @param {{
 *   disbursement: object|null, entradas: object, fijos: object,
 *   costes: object|null, internment: object|null, principal: object|null,
 *   liquidation: object|null, taxFlow: object|null, variables: object|null
 * }} pivots
 * @returns {{ entradas: number[], salidas: number[], neto: number[], any: boolean }}
 */
export function buildOoyBucketSeries({
  disbursement,
  entradas,
  fijos,
  costes,
  internment,
  principal,
  liquidation,
  taxFlow,
  variables = null
}) {
  const entradasSeries = [
    entradas.beforeTotal + (disbursement ? disbursement.beforeTotal : 0),
    entradas.afterTotal + (disbursement ? disbursement.afterTotal : 0)
  ]
  // ENMIENDA A-03 (§12): el pivote de variables ya produce buckets reales
  // (Antes/Después) ⇒ entra a la serie de SALIDAS y a la bandera `any`,
  // para que las columnas aparezcan cuando SOLO las variables tienen fuera
  // de año (AC-FE21-14).
  const salidasSeries = [
    fijos.beforeTotal +
      (costes ? costes.beforeTotal : 0) +
      (internment ? internment.beforeTotal : 0) +
      (principal ? principal.beforeTotal : 0) +
      (liquidation ? liquidation.beforeTotal : 0) +
      (taxFlow ? taxFlow.beforeTotal : 0) +
      (variables ? variables.beforeTotal : 0),
    fijos.afterTotal +
      (costes ? costes.afterTotal : 0) +
      (internment ? internment.afterTotal : 0) +
      (principal ? principal.afterTotal : 0) +
      (liquidation ? liquidation.afterTotal : 0) +
      (taxFlow ? taxFlow.afterTotal : 0) +
      (variables ? variables.afterTotal : 0)
  ]
  const any =
    entradas.beforeAfterRowCount +
      fijos.beforeAfterRowCount +
      (costes ? costes.beforeAfterRowCount : 0) +
      (internment ? internment.beforeAfterRowCount : 0) +
      (principal ? principal.beforeAfterRowCount : 0) +
      (disbursement ? disbursement.beforeAfterRowCount : 0) +
      (liquidation ? liquidation.beforeAfterRowCount : 0) +
      (taxFlow ? taxFlow.beforeAfterRowCount : 0) +
      (variables ? variables.beforeAfterRowCount : 0) >
    0
  return {
    entradas: entradasSeries,
    salidas: salidasSeries,
    neto: [entradasSeries[0] - salidasSeries[0], entradasSeries[1] - salidasSeries[1]],
    any
  }
}

/**
 * Resumen de liquidez (D-6, §4.5): construido SOLO de los
 * `columnTotals`/`grandTotal` de los bloques (ningún re-recorrido de
 * líneas). Neto = entradas − salidas por mes; netoTotal = entradasTotal −
 * salidasTotal (FE-S8 C-3); acumulado = corrida desde enero, Total =
 * acumulado[11]. (Movida verbatim de `CashFlowPivotTable.resumen`.)
 * @param {{
 *   disbursement: object|null, cobros: object|null, pagos: object|null,
 *   costes: object|null, internment: object|null, principal: object|null,
 *   liquidation: object|null, taxFlow: object|null,
 *   entradasPivot: object, fijosPivot: object, variablesPivot: object|null
 * }} pivots
 */
export function buildCashFlowResumen({
  disbursement,
  cobros,
  pagos,
  costes,
  internment,
  principal,
  liquidation,
  taxFlow,
  entradasPivot,
  fijosPivot,
  variablesPivot
}) {
  const entradasPropias = entradasPivot.columnTotals
  const fijos = fijosPivot.columnTotals
  const variables = variablesPivot ? variablesPivot.columnTotals : null

  const entradas = entradasPropias.map(
    (value, m) =>
      value +
      (cobros ? cobros.columnTotals[m] : 0) +
      (disbursement ? disbursement.columnTotals[m] : 0)
  )
  const salidas = entradas.map(
    (_, m) =>
      fijos[m] +
      (variables ? variables[m] : 0) +
      (pagos ? pagos.columnTotals[m] : 0) +
      (costes ? costes.columnTotals[m] : 0) +
      (internment ? internment.columnTotals[m] : 0) +
      (principal ? principal.columnTotals[m] : 0) +
      (liquidation ? liquidation.columnTotals[m] : 0) +
      (taxFlow ? taxFlow.columnTotals[m] : 0)
  )
  const neto = entradas.map((value, m) => value - salidas[m])

  let acc = 0
  const acumulado = neto.map((value) => {
    acc += value
    return acc
  })

  const entradasTotal =
    entradasPivot.grandTotal +
    (cobros ? cobros.grandTotal : 0) +
    (disbursement ? disbursement.grandTotal : 0)
  const salidasTotal =
    fijosPivot.grandTotal +
    (variablesPivot ? variablesPivot.grandTotal : 0) +
    (pagos ? pagos.grandTotal : 0) +
    (costes ? costes.grandTotal : 0) +
    (internment ? internment.grandTotal : 0) +
    (principal ? principal.grandTotal : 0) +
    (liquidation ? liquidation.grandTotal : 0) +
    (taxFlow ? taxFlow.grandTotal : 0)
  const netoTotal = entradasTotal - salidasTotal
  const acumuladoTotal = acumulado[11]

  /**
   * ENMIENDA A-05 (spec `frontend.03_21` §14): lado General del resumen
   * (BR-FE21-17) — meses + Antes + Después, espejo de `grandGeneralTotal`
   * de los pivotes. Los `*Total` de arriba quedan SOLO 12 meses.
   */
  const entradasGeneralTotal =
    entradasPivot.grandGeneralTotal +
    (cobros ? cobros.grandGeneralTotal : 0) +
    (disbursement ? disbursement.grandGeneralTotal : 0)
  const salidasGeneralTotal =
    fijosPivot.grandGeneralTotal +
    (variablesPivot ? variablesPivot.grandGeneralTotal : 0) +
    (pagos ? pagos.grandGeneralTotal : 0) +
    (costes ? costes.grandGeneralTotal : 0) +
    (internment ? internment.grandGeneralTotal : 0) +
    (principal ? principal.grandGeneralTotal : 0) +
    (liquidation ? liquidation.grandGeneralTotal : 0) +
    (taxFlow ? taxFlow.grandGeneralTotal : 0)
  const netoGeneralTotal = entradasGeneralTotal - salidasGeneralTotal

  return {
    entradas,
    salidas,
    neto,
    acumulado,
    entradasTotal,
    salidasTotal,
    netoTotal,
    acumuladoTotal,
    entradasGeneralTotal,
    salidasGeneralTotal,
    netoGeneralTotal
  }
}

/**
 * Etiqueta de fila del bloque de arrastre EXACTAMENTE como la pinta la Vista
 * Flujo (material `← label`; cuotas derivadas `⌁ Costo/Compra/Internación
 * {N−1} · label`). (FE-S20: única definición para la exportación; el
 * componente conserva su template literal — comentarios cruzados en ambos.)
 * @param {object|null|undefined} row fila del pivote de arrastre
 * @param {number|string} year año de la fuente (`carryCogsYear`)
 * @returns {string}
 */
export function carryRowLabelOf(row, year) {
  if (!row) return ''
  if (row.origin === 'cogs') return `⌁ Costo ${year} · ${row.label}`
  if (row.origin === 'purchase') return `⌁ Compra ${year} · ${row.label}`
  if (row.origin === 'internment') return `⌁ Internación ${year} · ${row.label}`
  return `← ${row.label}`
}

/**
 * Modelo reactivo de la Vista Flujo (factory, FE-S20 §7.2): TODOS los
 * computeds de datos de `CashFlowPivotTable` sobre los builders puros de
 * arriba, con la MISMA semántica (IV A según `store.ivaMode`, buckets
 * fuera-de-año, derivaciones FE-S7/S9/S10/S14/S17 y arrastre FE-S6).
 *  - Componente: params como GETTERS (`() => props.scenario`, etc.).
 *  - Exportación one-shot: valores crudos de la caché del store.
 * Cero HTTP: todo sale de la caché (ASM-10 / RF-9).
 * @param {{
 *   scenario: object|(() => object),
 *   financingPrincipalLines: Array|(() => Array),
 *   financingDisbursementLines: Array|(() => Array),
 *   store: object
 * }} params
 */
export function createCashFlowPivotModel({
  scenario,
  financingPrincipalLines,
  financingDisbursementLines,
  store
}) {
  const scenarioRef = computed(() => (typeof scenario === 'function' ? scenario() : scenario))
  const principalRef = computed(() => {
    const value =
      typeof financingPrincipalLines === 'function'
        ? financingPrincipalLines()
        : financingPrincipalLines
    return Array.isArray(value) ? value : []
  })
  const disbursementRef = computed(() => {
    const value =
      typeof financingDisbursementLines === 'function'
        ? financingDisbursementLines()
        : financingDisbursementLines
    return Array.isArray(value) ? value : []
  })

  const lines = computed(() => {
    const s = scenarioRef.value
    return s && Array.isArray(s.budget_lines) ? s.budget_lines : []
  })

  const scenarioYear = computed(() => scenarioYearOf(scenarioRef.value))

  /** Bandera viva del interruptor "Neto / Con IVA" (dueño: store). */
  const ivaActive = computed(() => store.ivaMode === true)

  const costCenterLabel = (id) => store.costCenterLabel(id)

  /** Mes de cobro/pago (D-3): `payment_date` con fallback a `budget_date` (R-1). */
  const cfMonth = (line) => monthIndexOf(line.payment_date || line.budget_date)

  /**
   * Monto PRESENTADO de una línea material (fija): neto × 1.19 con el modo ON
   * cuando está gravada — INCOME siempre (D-S10-5), EXPENSE según el flag
   * EFECTIVO (`has_iva`, NULL≡True — D-FE14-2); PURCHASE no aplica.
   */
  function grossLineAmount(line) {
    const net = Number(line.projected_amount)
    if (!Number.isFinite(net)) return net
    if (!ivaActive.value) return net
    return withIva(net, lineChargesIva(line))
  }

  /* ─────────── Bloques propios (FE-S4B §4.2 + FE-S9 §2.4) ─────────── */

  /** "Entradas": ingresos fijos por fecha de pago (modo ON ⇒ bruto, D-S10-5). */
  const entradasPivot = computed(() =>
    buildFlowPivot(lines.value, {
      match: (line) => line.line_type === 'income' && line.behavior_type === 'fixed',
      monthOf: cfMonth,
      amountOf: grossLineAmount,
      costCenterLabel,
      scenarioYear: scenarioYear.value
    })
  )

  /** "Salidas — Gastos fijos" por fecha de pago (× 1.19 según flag, AC-FE14-4). */
  const fijosPivot = computed(() =>
    buildFlowPivot(lines.value, {
      match: (line) => line.line_type === 'expense' && line.behavior_type === 'fixed',
      monthOf: cfMonth,
      amountOf: grossLineAmount,
      costCenterLabel,
      scenarioYear: scenarioYear.value
    })
  )

  /** "Compras del mes (importaciones)": causación `budget_date` ∈ N (§2.4). */
  const comprasPivot = computed(() =>
    buildFlowPivot(lines.value, {
      match: (line) => line.line_type === 'purchase',
      monthOf: (line) => monthIndexOf(line.budget_date),
      costCenterLabel,
      scenarioYear: scenarioYear.value
    })
  )

  /**
   * Base DEL GENERADOR de ingresos fijos por CECO (D-5): Σ ingresos fijos por
   * MES DE CAUSACIÓN cortada POR CECO (helper ÚNICO `fixedIncomeCausationByCeco`,
   * keys = CECOs que facturan). Se conserva para compatibilidad/referencia;
   * el bloque variable NO la consume directo desde la ENMIENDA A-01 (ver
   * `baseVariablePorCeco`).
   */
  const baseIngresosCausadosPorCeco = computed(() => fixedIncomeCausationByCeco(lines.value))

  /**
   * ENMIENDA A-01 (spec `frontend.03_21` §10, 2026-10-20) — base de la
   * componente FACTURACIÓN del bloque variable para `variable_sales`, keyed
   * POR EL CECO DE GASTO: para cada CECO variable ("Comisiones…" 210xxx /
   * "Despacho…" 320xxx) se resuelve el CECO generador de facturación por
   * **(id_zone, id_line)** con `fixedIncomeCausationByVariableCeco` (propio
   * CECO primero; zona+línea sin facturación ⇒ SIN fila ⇒ aporte 0; sin
   * fallback). Una resolución por línea meaningful, 1 lookup O(1) por render
   * en `buildVariableFlowPivot` y cuadre 1:1 con el drill-down de
   * `CecoDetailView` (AC-FE21-4/AC-FE21-8). **A-03 §12**: ya no alimenta el
   * pivote de flujo directamente (eso lo hacen los bucket-maps
   * `baseVariableBucketPorCeco`); se conserva exportado por
   * compatibilidad/referencia (shape 12 meses para la Ejecutiva/drill-down).
   */
  const baseVariablePorCeco = computed(() =>
    fixedIncomeCausationByVariableCeco(lines.value, store.costCenters)
  )

  /**
   * ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21) — base de la
   * componente RECAUDO del bloque variable para `variable_receivables`, KEYED
   * POR EL CECO DE GASTO: `entradasCausacionByVariableCeco` — MISMA resolución
   * A-01 (propio CECO primero, única (zona, línea), sin fallback) sobre la
   * serie de ENTRADAS por **MES DE PAGO** (Σ cobros con
   * `cfMonth = payment_date ?? budget_date`), NETA sin gross-up (D-FE14-7:
   * la base de comisiones no lleva IVA; el modo IVA del bloque Entradas es
   * solo presentación). Espejo exacto de la decisión del usuario: el recaudo
   * se lee de las ENTRADAS del Flujo, que ya tienen CECO.
   */
  const baseVariableRecaudoPorCeco = computed(() =>
    entradasCausacionByVariableCeco(lines.value, store.costCenters, scenarioYear.value)
  )

  /**
   * ENMIENDA A-03 (spec `frontend.03_21` §12, 2026-10-21) — bases por buckets
   * extendidos `{ before, months[12], after }` del MISMO generador A-01/A-02:
   *  - FACTURACIÓN: `fixedIncomeBucketByVariableCeco` (I por budget_date del
   *    generador, Antes/Después incluidos).
   *  - RECAUDO: `entradasBucketByVariableCeco` (ENTRADAS por MES DE PAGO del
   *    generador; aquí SIN filtro de año — el bucket ES el filtro; neta
   *    D-FE14-7). Alimentan EXCLUSIVAMENTE el pivote de flujo
   *    (`variablesPivot`); los maps de 12 meses de arriba se conservan
   *    exportados por compatibilidad (la Ejecutiva y el drill-down siguen
   *    con su shape intacto — A-02 byte-a-byte, BR-FE21-11).
   */
  const baseVariableBucketPorCeco = computed(() =>
    fixedIncomeBucketByVariableCeco(lines.value, store.costCenters, scenarioYear.value)
  )

  const baseVariableRecaudoBucketPorCeco = computed(() =>
    entradasBucketByVariableCeco(lines.value, store.costCenters, scenarioYear.value)
  )

  /** Líneas de gasto variables (origen crudo del bloque estimado). */
  const variableSourceLines = computed(() =>
    lines.value.filter((line) => line.line_type === 'expense' && line.behavior_type !== 'fixed')
  )

  /**
   * ENMIENDA A-04 (spec `frontend.03_21` §13, 2026-10-21) — distribución de
   * COBRO de las líneas `variable_receivables` del escenario, keyed por
   * `id_budget_line`: para cada concepto se aplican los cobros del CECO
   * generador (A-01) facturados en el MES del concepto, y la comisión se
   * posiciona en el bucket de SU cobro (Antes/Mes/Después — criterio de
   * caja). NETA (D-FE14-7); el gross-up lo aplica el pivote por línea.
   * Las otras superficies (Ejecutiva/drill-down) NO lo consumen (devengo —
   * divergencia por diseño §13).
   */
  const variableReceivablesLines = computed(() =>
    variableSourceLines.value.filter((line) => line.behavior_type === 'variable_receivables')
  )

  const variableCollectionDistributionByLine = computed(() =>
    variableCollectionDistribution(
      variableReceivablesLines.value,
      lines.value,
      store.costCenters,
      scenarioYear.value
    )
  )

  /** "Salidas — Gastos variables (calculados)" (D-5, A-01/A-02 + A-03 + A-04). */
  const variablesPivot = computed(() =>
    buildVariableFlowPivot(
      variableSourceLines.value,
      baseVariableBucketPorCeco.value,
      baseVariableRecaudoBucketPorCeco.value,
      costCenterLabel,
      ivaActive.value,
      scenarioYear.value,
      variableCollectionDistributionByLine.value
    )
  )

  /** Ingresos fijos PROPIOS del escenario: la única base de la derivación §5. */
  const cogsIncomeLines = computed(() =>
    lines.value.filter((line) => line.line_type === 'income' && line.behavior_type === 'fixed')
  )

  /* ── FE-S9 §2.5 + A-02 §7.1: switch de fuente D-4' POR LÍNEA (VINCULANTE) ── */

  function sourceKeyForCostCenter(idCostCenter) {
    const lineId = lineIdForCostCenter(store.costCenters, idCostCenter)
    return lineId === null ? `cc:${idCostCenter}` : `line:${lineId}`
  }

  /**
   * @see sourceKeyForCostCenter — una pasada O(L): líneas `purchase` + claves
   * D-4' de las Líneas compradoras.
   */
  const purchaseIndex = computed(() => {
    const purchaseLinesArr = []
    const keySet = new Set()
    for (const line of lines.value) {
      if (line.line_type === 'purchase') {
        purchaseLinesArr.push(line)
        keySet.add(sourceKeyForCostCenter(line.id_cost_center))
      }
    }
    return { lines: purchaseLinesArr, keys: keySet }
  })

  /** @see purchaseIndex — líneas `purchase` crudas (fuente de las cuotas). */
  const purchaseLines = computed(() => purchaseIndex.value.lines)

  /** @see purchaseIndex — claves D-4' de las Líneas con plan de compras. */
  const purchasingKeys = computed(() => purchaseIndex.value.keys)

  /** ¿Dúo de internación disponible? (fail-closed D-FE10-3). */
  const internmentCatalogReady = computed(
    () => store.internmentCatalogLoaded && !store.internmentCatalogError
  )

  /* ─────────── FE-S7 §5 / FE-S9 §2.5 / FE-S10 §2.4: cuotas derivadas ─────────── */

  /** Clave/etiqueta de la fila sintética "IVA de importación" (D-FE14-3). */
  const IMPORT_VAT_ROW_KEY = 'iva-importacion'
  const IMPORT_VAT_ROW_LABEL = 'IVA de importación'

  const costPaymentRows = computed(() => {
    if (!store.payableTermsLoaded || store.payableTermsError) return []
    const incomes = cogsIncomeLines.value
    const purchases = purchaseLines.value
    if (!incomes.length && !purchases.length) return []
    const rates = store.lineCostRates
    const termsByLine = store.payableTermsByLine
    const purchasing = purchasingKeys.value
    const rows = []
    for (const line of incomes) {
      // FE-S9 §2.5-1 + A-02 §7.1 (D-4'): LÍNEA COMPRADORA ⇒ sin cuota cogs.
      if (purchasing.has(sourceKeyForCostCenter(line.id_cost_center))) continue
      const amount = Number(line.projected_amount)
      if (!Number.isFinite(amount) || amount === 0) continue
      const lineId = lineIdForCostCenter(store.costCenters, line.id_cost_center)
      const pct = resolveCogsPctByLine(rates, lineId, monthEndOf(line.budget_date))
      if (pct === null || pct === 0) continue
      const cost = (amount * pct) / 100
      const terms = lineId === null ? undefined : termsByLine.get(lineId)
      if (terms && terms.length) {
        for (const term of terms) {
          const paymentPct = Number(term.payment_pct)
          if (!Number.isFinite(paymentPct)) continue
          rows.push({
            idCostCenter: line.id_cost_center,
            amount: cost * paymentPct,
            effectiveDate:
              addDaysISO(line.budget_date, Number(term.payment_days)) ?? line.budget_date
          })
        }
      } else {
        rows.push({
          idCostCenter: line.id_cost_center,
          amount: cost,
          effectiveDate: line.budget_date
        })
      }
    }
    // FE-S9 §2.5-2 + FE-S10 §2.4: cuotas de compra (stream PROVEEDOR) sobre
    // `provBase`; IVA de importación como fila sintética (D-FE14-3). Sin el
    // dúo de internación NO se puede partir la base (fail-closed D-FE10-3).
    if (!internmentCatalogReady.value) return rows
    const internmentPctsByLine = store.internmentRateByLine
    for (const line of purchases) {
      const amount = Number(line.projected_amount)
      if (!Number.isFinite(amount) || amount === 0) continue
      const lineId = lineIdForCostCenter(store.costCenters, line.id_cost_center)
      const pctIntRaw = Number(internmentPctsByLine.get(lineId) ?? 0)
      const pctInt = !Number.isFinite(pctIntRaw) || pctIntRaw < 0 ? 0 : pctIntRaw
      const provBase = amount / (1 + pctInt)
      // FE-S14-IVA D-FE14-3/AC-FE14-3 (modo ON): fila agregada "IVA de
      // importación" en la fecha de compra (base × IVA_RATE — `ivaOf`).
      if (ivaActive.value) {
        rows.push({
          idCostCenter: line.id_cost_center,
          rowKey: IMPORT_VAT_ROW_KEY,
          label: IMPORT_VAT_ROW_LABEL,
          amount: ivaOf(provBase, true),
          effectiveDate: line.budget_date
        })
      }
      const terms = lineId === null ? undefined : termsByLine.get(lineId)
      if (terms && terms.length) {
        for (const term of terms) {
          const paymentPct = Number(term.payment_pct)
          if (!Number.isFinite(paymentPct)) continue
          rows.push({
            idCostCenter: line.id_cost_center,
            amount: provBase * paymentPct,
            effectiveDate:
              addDaysISO(line.budget_date, Number(term.payment_days)) ?? line.budget_date
          })
        }
      } else {
        rows.push({
          idCostCenter: line.id_cost_center,
          amount: provBase,
          effectiveDate: line.budget_date
        })
      }
    }
    return rows
  })

  /** ¿El bloque derivado tiene filas? (empty ⇒ no se renderiza, §5). */
  const costPaymentsActive = computed(() => costPaymentRows.value.length > 0)

  /* ─────────── FE-S10 §2.4: stream de internación de las compras ─────────── */

  /** Épsilon COP para suprimir filas residuales de float crudo (D-FE10-5). */
  const INTERNMENT_EPSILON_COP = 0.005

  const internmentPaymentRows = computed(() => {
    if (!internmentCatalogReady.value) return []
    const purchases = purchaseLines.value
    if (!purchases.length) return []
    const ratesByLine = store.internmentRateByLine
    const termsByLine = store.internmentTermsByLine
    const rows = []
    for (const line of purchases) {
      const amount = Number(line.projected_amount)
      if (!Number.isFinite(amount) || amount === 0) continue
      const lineId = lineIdForCostCenter(store.costCenters, line.id_cost_center)
      const pctIntRaw = Number(ratesByLine.get(lineId) ?? 0)
      const pctInt = !Number.isFinite(pctIntRaw) || pctIntRaw < 0 ? 0 : pctIntRaw
      if (pctInt === 0) continue // A-5/BR-INT-05: sin tasa ⇒ cero filas
      const intBase = amount - amount / (1 + pctInt) // BR-INT-01
      if (intBase <= INTERNMENT_EPSILON_COP) continue // §2.4-4 (float crudo)
      const terms = lineId === null ? undefined : termsByLine.get(lineId)
      if (terms && terms.length) {
        for (const term of terms) {
          const paymentPct = Number(term.payment_pct)
          if (!Number.isFinite(paymentPct)) continue
          rows.push({
            idCostCenter: line.id_cost_center,
            // FE-S14-IVA: cada cuota de internación ×1.19 (modo OFF ⇒ neto).
            amount: !ivaActive.value ? intBase * paymentPct : withIva(intBase * paymentPct, true),
            effectiveDate:
              addDaysISO(line.budget_date, Number(term.payment_days)) ?? line.budget_date
          })
        }
      } else {
        // BR-INT-04: sin términos ⇒ pago completo el día de la importación.
        rows.push({
          idCostCenter: line.id_cost_center,
          amount: !ivaActive.value ? intBase : withIva(intBase, true),
          effectiveDate: line.budget_date
        })
      }
    }
    return rows
  })

  /** ¿Cuotas de internación ARRASTRADAS del escenario N−1? (§2.5) */
  const carryInternmentActive = computed(() => {
    const carry = store.carryover
    return (
      carry.enabled &&
      Array.isArray(carry.lines) &&
      carry.lines.some((line) => line.origin === 'internment')
    )
  })

  /** Render-condición del bloque de internación (filas propias ∨ arrastre). */
  const internmentPaymentsActive = computed(
    () => internmentPaymentRows.value.length > 0 || carryInternmentActive.value
  )

  /** Pivote del bloque "Pago de internación" (CECO de la compra × mes de
   *  vencimiento de la cuota; cuotas fuera de año → Antes/Después, FE-S8
   *  intacto). `null` ⇒ sin bloque. */
  const internmentPaymentsPivot = computed(() => {
    if (!internmentPaymentsActive.value) return null
    return buildDerivedPivot(internmentPaymentRows.value, {
      costCenterLabel,
      scenarioYear: scenarioYear.value
    })
  })

  /* ─────────── Pivotes de bloques derivados / motor / IVA / impuestos ─────────── */

  /** "Salidas — Pago a proveedores (costo de ventas)" (§5). */
  const costPaymentsPivot = computed(() => {
    if (!costPaymentsActive.value) return null
    return buildDerivedPivot(costPaymentRows.value, {
      costCenterLabel,
      scenarioYear: scenarioYear.value
    })
  })

  /** "Salidas — Capital de financiación" (bucket por fecha de pago del BE). */
  const financingPrincipalPivot = computed(() => {
    const rows = principalRef.value
      .filter((line) => Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0)
      .map((line) => ({
        idCostCenter: line.id_cost_center,
        amount: line.amount,
        effectiveDate: line.payment_date
      }))
    if (!rows.length) return null
    return buildDerivedPivot(rows, { costCenterLabel, scenarioYear: scenarioYear.value })
  })

  /** "Entradas - Desembolso de financiación" (inflow on disbursement date). */
  const financingDisbursementPivot = computed(() => {
    const rows = disbursementRef.value
      .filter((line) => Number.isFinite(Number(line.amount)) && Number(line.amount) !== 0)
      .map((line) => ({
        idCostCenter: line.id_cost_center,
        amount: line.amount,
        effectiveDate: line.payment_date
      }))
    if (!rows.length) return null
    return buildDerivedPivot(rows, { costCenterLabel, scenarioYear: scenarioYear.value })
  })

  /** Caché viva de la liquidación en el store (SOLO lee — SD6-4). */
  const settlement = computed(() => store.settlement)

  /**
   * "Pago de liquidación de IVA" (FE-S14 D-FE14-4): una fila por período con
   * `payment > 0`, en el MES de `payment_due_date`. Solo con el modo Con IVA
   * y con calendario respondido (AC-FE14-5).
   */
  const settlementPaymentsPivot = computed(() => {
    if (!ivaActive.value) return null
    const data = settlement.value.data
    const periods = data && Array.isArray(data.periods) ? data.periods : []
    if (!periods.length) return null
    const rows = []
    const columnTotals = Array.from({ length: 12 }, () => 0)
    // A-05 (BR-FE21-16/17): `grandTotal` = solo 12 meses; todo-inclusive →
    // `grandGeneralTotal`.
    let grandTotal = 0
    let grandGeneralTotal = 0
    let beforeTotal = 0
    let afterTotal = 0
    let beforeAfterRowCount = 0
    /** Hallazgo 5 (auditoría FE): Σ de pagos con vencimiento ilegible. */
    let undatedTotal = 0
    for (const period of periods) {
      const payment = Number(period?.payment)
      if (!Number.isFinite(payment) || payment <= 0) continue
      const dueDate = typeof period.payment_due_date === 'string' ? period.payment_due_date : null
      const month = monthIndexOf(dueDate)
      const bucket = outOfYearBucketOf(dueDate, scenarioYear.value)
      const months = Array.from({ length: 12 }, () => 0)
      let before = 0
      let after = 0
      let total = 0
      if (month >= 0 && bucket === 0) {
        months[month] += payment
        columnTotals[month] += payment
        total = payment
      }
      if (bucket === -1) before = payment
      else if (bucket === 1) after = payment
      if (month < 0 && bucket === 0) undatedTotal += payment
      if (before + after !== 0) beforeAfterRowCount += 1
      beforeTotal += before
      afterTotal += after
      grandTotal += total
      grandGeneralTotal += payment
      const periodNo = Number(period.period_no)
      rows.push({
        id: `iva-liq-${Number.isFinite(periodNo) ? periodNo : rows.length + 1}`,
        label: `Liquidación P${Number.isFinite(periodNo) ? periodNo : '—'} · vence ${formatDateEs(dueDate)}`,
        months,
        total,
        generalTotal: payment,
        before,
        after
      })
    }
    if (!rows.length || grandGeneralTotal <= 0) return null
    return {
      rows,
      columnTotals,
      grandTotal,
      grandGeneralTotal,
      beforeTotal,
      afterTotal,
      beforeAfterRowCount,
      undatedTotal
    }
  })

  /**
   * "Salidas — Impuestos (planeación tributaria)" (FE-S17): buckets
   * server-side de `store.tax.cashFlow` — NUNCA se re-coloca aquí. Sin
   * cálculo ejecutado ⇒ pivote null.
   */
  const taxPaymentsPivot = computed(() => {
    const data = store.tax?.cashFlow
    if (!data || data.calculation_executed !== true) return null
    const yearN = scenarioYear.value
    if (yearN === null) return null
    const buckets = Array.isArray(data.monthly) ? data.monthly : []
    if (!buckets.length) return null
    const rows = []
    const columnTotals = Array.from({ length: 12 }, () => 0)
    // A-05 (BR-FE21-16/17): `grandTotal` = solo 12 meses; todo-inclusive →
    // `grandGeneralTotal`.
    let grandTotal = 0
    let grandGeneralTotal = 0
    let beforeTotal = 0
    let afterTotal = 0
    let beforeAfterRowCount = 0
    let undatedTotal = 0
    for (const bucket of buckets) {
      const amount = Number(bucket?.net_outflow ?? bucket?.cash_outflow)
      if (!Number.isFinite(amount) || amount === 0) continue
      const payYearRaw = Number(bucket.payment_year)
      const payMonthRaw = Number(bucket.payment_month)
      const payYear = Number.isInteger(payYearRaw) ? payYearRaw : null
      const payMonth = Number.isInteger(payMonthRaw) ? payMonthRaw : null
      if (payYear === null) {
        undatedTotal += amount
        continue
      }
      const months = Array.from({ length: 12 }, () => 0)
      let before = 0
      let after = 0
      let total = 0
      if (payYear === yearN && payMonth !== null && payMonth >= 1 && payMonth <= 12) {
        months[payMonth - 1] += amount
        columnTotals[payMonth - 1] += amount
        total = amount
      } else if (payYear < yearN) {
        before = amount
      } else if (payYear > yearN) {
        after = amount
      }
      if (before + after !== 0) beforeAfterRowCount += 1
      beforeTotal += before
      afterTotal += after
      grandTotal += total
      grandGeneralTotal += amount
      rows.push({
        id: `tax-pass-${payYear}-${payMonth ?? 'x'}-${rows.length + 1}`,
        label:
          payMonth !== null
            ? `Impuestos · vence ${payYear}-${String(payMonth).padStart(2, '0')}`
            : `Impuestos · año ${payYear}`,
        months,
        total,
        generalTotal: amount,
        before,
        after
      })
    }
    if (!rows.length) {
      // Solo buckets sin fecha: nada entra al resumen; el aviso vive en el BE.
      return null
    }
    return {
      rows,
      columnTotals,
      grandTotal,
      grandGeneralTotal,
      beforeTotal,
      afterTotal,
      beforeAfterRowCount,
      undatedTotal
    }
  })

  /* ------------------- Arrastre de saldos N−1 (FE-S6 §6.1) ------------------- */

  const carryover = computed(() => store.carryover)

  /** Única puerta del arrastre: OFF o `lines: []` ⇒ cero efecto (AC-S6-FE-6). */
  const carryActive = computed(
    () =>
      carryover.value.enabled &&
      Array.isArray(carryover.value.lines) &&
      carryover.value.lines.length > 0
  )

  /** Cobros de arrastre (ingresos de la fuente N−1 con cobro ∈ N). */
  const cobrosArrastre = computed(() =>
    buildCarryPivot(
      carryover.value.lines,
      (line) => line.line_type === 'income',
      costCenterLabel,
      carryActive.value
    )
  )

  /** Pagos de arrastre (gastos de la fuente N−1 con pago ∈ N). */
  const pagosArrastre = computed(() =>
    buildCarryPivot(
      carryover.value.lines,
      (line) => line.line_type === 'expense',
      costCenterLabel,
      carryActive.value
    )
  )

  /* ------------------- Resumen de liquidez + bodega (§4.5/§2.6) ------------------- */

  const resumen = computed(() =>
    buildCashFlowResumen({
      disbursement: financingDisbursementPivot.value,
      cobros: cobrosArrastre.value,
      pagos: pagosArrastre.value,
      costes: costPaymentsPivot.value,
      internment: internmentPaymentsPivot.value,
      principal: financingPrincipalPivot.value,
      liquidation: settlementPaymentsPivot.value,
      taxFlow: taxPaymentsPivot.value,
      entradasPivot: entradasPivot.value,
      fijosPivot: fijosPivot.value,
      variablesPivot: variablesPivot.value
    })
  )

  /** Compras causadas por mes (`columnTotals` del bloque §2.4). */
  const comprasPorMes = computed(() => comprasPivot.value.columnTotals)

  /**
   * Costo de ventas CAUSADO por mes (§2.6): Σ `monto × pct / 100` sobre los
   * ingresos fijos con el MISMO resolvedor compartido (cero divergencia);
   * INDEPENDIENTE de `payableTermsByLine`. Incluye TAMBIÉN los ingresos de
   * las Líneas compradoras (es causación P&L, no caja).
   */
  const costoCausadoPorMes = computed(() => {
    const out = Array.from({ length: 12 }, () => 0)
    const rates = store.lineCostRates
    for (const line of cogsIncomeLines.value) {
      const amount = Number(line.projected_amount)
      if (!Number.isFinite(amount) || amount === 0) continue
      const month = monthIndexOf(line.budget_date)
      if (month < 0) continue
      const pct = resolveCogsPctByLine(
        rates,
        lineIdForCostCenter(store.costCenters, line.id_cost_center),
        monthEndOf(line.budget_date)
      )
      if (pct === null || !Number.isFinite(pct)) continue
      out[month] += (amount * pct) / 100
    }
    return out
  })

  /** `bodega[m] = bodega[m−1] + compras[m] − costoCausado[m]` (D-FE9-3). */
  const bodegaMes = computed(() => {
    const compras = comprasPorMes.value
    const costos = costoCausadoPorMes.value
    const out = []
    let acc = 0
    for (let month = 0; month < 12; month += 1) {
      acc += compras[month] - costos[month]
      out.push(acc)
    }
    return out
  })

  return {
    lines,
    scenarioYear,
    ivaActive,
    entradasPivot,
    fijosPivot,
    comprasPivot,
    baseIngresosCausadosPorCeco,
    baseVariablePorCeco,
    baseVariableRecaudoPorCeco,
    baseVariableBucketPorCeco,
    baseVariableRecaudoBucketPorCeco,
    variableSourceLines,
    variableReceivablesLines,
    variableCollectionDistributionByLine,
    variablesPivot,
    cogsIncomeLines,
    purchaseIndex,
    purchaseLines,
    purchasingKeys,
    internmentCatalogReady,
    costPaymentRows,
    costPaymentsActive,
    internmentPaymentRows,
    internmentPaymentsActive,
    carryInternmentActive,
    settlement,
    costPaymentsPivot,
    internmentPaymentsPivot,
    financingPrincipalPivot,
    financingDisbursementPivot,
    settlementPaymentsPivot,
    taxPaymentsPivot,
    carryover,
    carryActive,
    cobrosArrastre,
    pagosArrastre,
    resumen,
    comprasPorMes,
    costoCausadoPorMes,
    bodegaMes
  }
}
