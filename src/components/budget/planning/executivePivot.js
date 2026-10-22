/**
 * executivePivot — modelo de cómputo de la "Vista Ejecutiva" (FE-S20 / spec
 * `frontend.03_20` §7.2).
 *
 * Extracción VERBATIM de las funciones de agregación que vivían inline en
 * `ExecutivePivotTable.vue` (FE-S4 §8.2 + FE-S4C §3/§4), para que el botón
 * "Exportar" de `BudgetGridEditor` reuse EXACTAMENTE el mismo cómputo que
 * pinta la pantalla (RF/§5: la matriz exportada es la matriz visible; la
 * agregación no se duplica). El componente consume el modelo vía
 * `createExecutivePivotModel` y conserva SOLO la presentación (celdas
 * `·`/`—`/compactas, filas %, tooltips); el comportamiento visual NO cambia
 * (AC-7 de FE-S18: salidas numéricas idénticas).
 *
/**
 * REVISIÓN 4 (spec `frontend.03_19` §11): el drill-down de movimientos por
 * CECO (`CecoDetailView`/`CecoMovementTable`/`CecoMovementPivot`, vía
 * `cecoMovements.movementAmountReconciled`) reproduce el MISMO monto variable
 * de este pivote — REVISIÓN 5 (spec `frontend.03_21` §5.3): ambos con base
 * POR CECO (`tasa × I_c(m)` del propio CECO), enlazado desde la Vista
 * Ejecutiva (RF-11.1).
 *
 * Funciones PURAS (sin reactividad propia): los llamadores pasan líneas,
 * catálogos y etiquetas ya resueltos. `createExecutivePivotModel` envuelve
 * esas funciones en `computed` — dentro de un componente los parámetros
 * pueden ser GETTERS (`() => props.scenario`) para seguir siendo reactivos,
 * o valores crudos para un consumo one-shot (exportación, cero HTTP).
 */
import { computed } from 'vue'
import {
  buildCogsRatePool,
  entradasCausacionByCeco,
  formatVariableRate,
  monthIndexOf,
  resolveCogsPctFromPool,
  resolveVariableBaseCeco
} from './planningFormat.js'
import { lineIdForCostCenter } from './cecoMovements.js'
import { taxCalculationAvailable, pnlTaxMonthly } from '../taxes/taxPresentation.js'

/**
 * Puro 0–100 → texto con 1 decimal y ceros finales razonables (§4.1).
 * (Movida verbatim de `ExecutivePivotTable`.)
 * @param {number} pct
 * @returns {string}
 */
export function pctText(pct) {
  return String(Number(pct.toFixed(1)))
}

/**
 * Σ de las 12 columnas; `null` (→ `—`) si la fuente no es estimable.
 * @param {Array<number|null>} values
 * @returns {number|null}
 */
export function sumOrNull(values) {
  return values.some((value) => value === null)
    ? null
    : values.reduce((acc, value) => acc + value, 0)
}

/** Corrida acumulada Ene→mes (§4.3). */
export function runningSums(values) {
  let acc = 0
  return values.map((value) => (acc += value))
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

/**
 * Pool de tasas de costo vigente POR MES del año (movida verbatim del
 * computed `monthlyRates`: `buildCogsRatePool` compartido de `planningFormat`
 * contra cada month-end).
 * @param {Array<object>|null|undefined} rates `lineCostRates` del store
 * @param {number|string|null|undefined} budgetYear
 * @returns {Array<{ byLine: Map<number, number>, globalPct: number|null }>}
 */
export function buildMonthlyCogsPools(rates, budgetYear) {
  return monthEndsOfYear(budgetYear).map((monthEnd) => buildCogsRatePool(rates, monthEnd))
}

/**
 * Pivote de un bloque fijo (ingresos o gastos fijos) en una pasada: filas por
 * CECO (agrupa todas sus líneas), columnas Ene–Dic por
 * `monthIndexOf(budget_date)`, totales por fila/columna/bloque. Los montos se
 * suman crudos; el formato COP ocurre al render.
 * (Movida verbatim de `ExecutivePivotTable.buildPivot`; `fixedLines` y el
 * `costCenterLabel` del store llegan como parámetros.)
 * @param {Array<object>} lines líneas `behavior_type === 'fixed'`
 * @param {string} lineType 'income' | 'expense'
 * @param {(id: number|string|null|undefined) => string} costCenterLabel
 */
export function buildFixedPivot(lines, lineType, costCenterLabel) {
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of lines) {
    if (line.line_type !== lineType) continue
    const amount = Number(line.projected_amount)
    if (!Number.isFinite(amount)) continue

    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0
      })
    }
    const row = byCeco.get(key)
    const month = monthIndexOf(line.budget_date)
    if (month >= 0) {
      row.months[month] += amount
      columnTotals[month] += amount
    }
    row.total += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { rows, columnTotals, grandTotal }
}

/**
 * Pivote ESTIMADO de gastos variables (Opción A, réplica client-side de la
 * regla de `budgetEngine.project_cash_flow`) con **BASE POR CECO** (spec
 * `frontend.03_21` §5.1 / espejo `backend.02_24` §5.2): cada línea variable de
 * GASTO `v` aporta `tasa_v × I_b(m)` a la celda `monthIndexOf(v.budget_date)`,
 * donde `I_b(m)` es el ingreso (SIEMPRE neto, D-FE14-7) del MES `m` del CECO
 * generador `b` de la línea `v = v.id_cost_center`.
 *
 * **ENMIENDA A-01 (§10, 2026-10-20)** — resolución del CECO generador `b`:
 * los CECOs de ingreso ("Facturación…" 000xxx) están desacoplados de los de
 * gasto variable ("Comisiones…" 210xxx / "Despacho…" 320xxx), así que `c = v`
 * contra las filas de ingreso daba base ausente ⇒ TODOS los montos en 0. La
 * base se resuelve por **(id_zone, id_line)** con `resolveVariableBaseCeco`
 * (propio CECO primero; única resolución zona+línea; SIN fallback: zona+línea
 * sin facturación ⇒ 0). Resuelto UNA vez por CECO (Map de caché local), no por
 * render de celda.
 * CECO sin fila de ingreso resuelta o mes sin ingreso ⇒ aporte 0
 * (BR-VE-02/BR-FE21-02: sin exclusión, sin NaN). `null` si no hay líneas
 * variables o no hay base en toda la matriz.
 * (Adaptada de `ExecutivePivotTable.buildVariablePivot`; base por CECO A-01.)
 *
 * **ENMIENDA A-02 (§11, 2026-10-21)** — la base se SEPARA por comportamiento
 * (espejo del motor backend):
 *  - `variable_sales`  ⇒ base **I** por `budget_date` (facturación; las filas
 *    `incomeRows` del pivote de Ingresos).
 *  - `variable_receivables` ⇒ base **R** por cobro (ENTRADAS del Flujo; las
 *    filas `entradasRows` — `Map` deducido de `{ id, months[12] }` por CECO,
 *    serie NETA por mes de pago `cfMonth = payment_date ?? budget_date`,
 *    `entradasCausacionByCeco`). La presentación del modo IVA del bloque
 *    Entradas (gross-up ×1.19) NO toca esta base — D-FE14-7.
 *  Ambos se posicionan en el MES de `budget_date` de la LÍNEA (causación de
 *  la comisión): la celda del mes `m` muestra `tasa × base(m)` con `m` el
 *  mes de presupuestación de la línea (para recaudo, `base(m)` son los
 *  cobros cuyo **cfMonth = m**).
 * @param {Array<object>} variableExpenseLines
 * @param {Array<{ id: number|string, months: number[] }>} incomeRows filas del
 *   pivote de Ingresos (`buildFixedPivot(..., 'income', ...)` — `row.id` ES el
 *   `id_cost_center`; se deduce `Map<ceco, months[12]>` internamente).
 * @param {(id: number|string|null|undefined) => string} costCenterLabel
 * @param {Array<object>|null|undefined} costCenters catálogo del store
 *   (`id_cost_center`, `id_zone`, `id_line`) para la resolución A-01.
 * @param {Array<{ id: number|string, months: number[] }>} [entradasRows] filas
 *   del pivote de ENTRADAS por CECO (A-02: serie NETA de cobros por `cfMonth`;
 *   en el composable se deriva de `entradasCausacionByCeco` sobre las propias
 *   líneas del escenario — misma convención temporal que el bloque "Entradas"
 *   de la Vista Flujo, sin gross-up). `[]`/`undefined` ⇒ `variable_receivables`
 *   con base 0 (AC-FE21-11).
 */
export function buildVariableExpensePivot(
  variableExpenseLines,
  incomeRows,
  costCenterLabel,
  costCenters,
  entradasRows = []
) {
  const source = variableExpenseLines
  const hasIncomeBase = incomeRows.some((row) => row.months.some((value) => value !== 0))
  const hasEntradasBase = entradasRows.some((row) => row.months.some((value) => value !== 0))
  if (!source.length || (!hasIncomeBase && !hasEntradasBase)) {
    return null
  }

  const incomeCeco = new Map(incomeRows.map((row) => [row.id, row.months]))
  const entradasCeco = new Map(entradasRows.map((row) => [row.id, row.months]))
  // A-01: resolución UNA vez por CECO variable (lookup O(1) por render).
  // La caché distingue por comportamiento (A-02): el generador puede diferir
  // entre los CECOs con facturación y los con cobros.
  const baseCecoCache = new Map()
  const resolveBaseCeco = (cecoId, baseCecoIds) => {
    // Materializar el iterable UNA vez: expandirlo en el cacheKey OBLIGÓ a
    // materializarlo para resolver (un iterador consumido ⇒ null, bug A-02).
    const keyList = [...baseCecoIds]
    const cacheKey = `${String(cecoId)}|${String(keyList)}`
    if (!baseCecoCache.has(cacheKey)) {
      baseCecoCache.set(cacheKey, resolveVariableBaseCeco(cecoId, keyList, costCenters))
    }
    return baseCecoCache.get(cacheKey)
  }
  const byCeco = new Map()
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  for (const line of source) {
    const key = line.id_cost_center
    if (!byCeco.has(key)) {
      byCeco.set(key, {
        id: key,
        label: costCenterLabel(key),
        months: Array.from({ length: 12 }, () => 0),
        total: 0,
        rates: []
      })
    }
    const row = byCeco.get(key)
    row.rates.push(formatVariableRate(line.variable_rate))

    const month = monthIndexOf(line.budget_date)
    if (month < 0) continue
    const rate = Number(line.variable_rate) || 0
    // Base por CECO generador (A-01 + A-02, frontend.03_21 §5.1/§10/§11):
    // variable_sales ⇒ I por budget_date del CECO con facturación de la
    // MISMA (zona, línea); variable_receivables ⇒ R (entradas por mes de
    // pago, NETA) del CECO con cobros; sin resolución ⇒ 0 (sin NaN, sin
    // exclusión, sin fallback).
    const isReceivables = line.behavior_type === 'variable_receivables'
    const baseCeco = isReceivables
      ? resolveBaseCeco(line.id_cost_center, entradasCeco.keys())
      : resolveBaseCeco(line.id_cost_center, incomeCeco.keys())
    const baseC =
      baseCeco !== null ? (isReceivables ? entradasCeco : incomeCeco).get(baseCeco) : null
    const amount = rate * (baseC ? baseC[month] || 0 : 0)
    row.months[month] += amount
    row.total += amount
    columnTotals[month] += amount
    grandTotal += amount
  }

  const rows = [...byCeco.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    .map((row) => ({ ...row, title: `Tasas: ${row.rates.join(' / ')}` }))
  return { rows, columnTotals, grandTotal }
}

/**
 * Pivote ESTIMADO de costo de ventas (§4.1, D-1/D-2/D-3): filas = mismas del
 * pivote de ingresos (lista completa); celda mes m = `ingreso_m × pct / 100`
 * (⚠️ `cogs_pct` es 0–100) o `null` si ese mes no resolvió tasa; CECO sin
 * NI UN mes resuelto ⇒ exclusión anual (`total = null`, `excludedLabels`).
 * (Movida verbatim de `ExecutivePivotTable.costPivot`, sin sus guards de
 * degradación — el llamador decide con `costDegradation`.)
 * @param {Array<object>} incomeRows filas del pivote de ingresos
 * @param {Array<{ byLine: Map<number, number>, globalPct: number|null }>} monthlyPools
 * @param {(idCostCenter: number|null|undefined) => number|null} lineIdOf
 */
export function buildCostSalesPivot(incomeRows, monthlyPools, lineIdOf) {
  const pools = monthlyPools
  const excludedLabels = []
  const columnTotals = Array.from({ length: 12 }, () => 0)
  let grandTotal = 0

  const rows = incomeRows.map((incomeRow) => {
    const lineId = lineIdOf(incomeRow.id)
    const months = Array.from({ length: 12 }, () => null)
    const pcts = []
    let total = 0
    for (let m = 0; m < 12; m += 1) {
      const pct = resolveCogsPctFromPool(pools[m], lineId)
      if (pct === null) continue
      months[m] = (incomeRow.months[m] * pct) / 100
      total += months[m]
      columnTotals[m] += months[m]
      grandTotal += months[m]
      if (!pcts.includes(pct)) pcts.push(pct)
    }
    if (!pcts.length) excludedLabels.push(incomeRow.label)
    return {
      id: incomeRow.id,
      label: incomeRow.label,
      months,
      total: pcts.length ? total : null,
      title: pcts.length
        ? `Tasa(s): ${pcts.map((pct) => `${pctText(pct)} %`).join(', ')}`
        : 'Sin tasa de costo aplicable'
    }
  })

  return { rows, columnTotals, grandTotal, excludedLabels }
}

/**
 * Base compartida P&G/Acumulado (§3.3): columnas de los pivotes ya
 * computadas, sin re-recorrer líneas. `costo`/`margen`/`resultado` en `null`
 * cuando el costo no es estimable. (Movida verbatim del computed `pnl`.)
 * @param {{
 *   ingresos: number[],
 *   costo: number[]|null,
 *   fijos: number[],
 *   variables: number[]|null,
 *   impuestos: number[]|null
 * }} series
 */
export function buildPnlModel({ ingresos, costo, fijos, variables, impuestos }) {
  const gastos = ingresos.map((_, m) => fijos[m] + (variables ? variables[m] : 0))
  const margen = costo ? ingresos.map((value, m) => value - costo[m]) : null
  const resultado = margen ? margen.map((value, m) => value - gastos[m]) : null
  const resultadoDespuesImpuestos =
    resultado && impuestos ? resultado.map((value, m) => value - impuestos[m]) : null
  return {
    ingresos,
    costo,
    fijos,
    variables,
    impuestos,
    gastos,
    margen,
    resultado,
    resultadoDespuesImpuestos
  }
}

/**
 * Series ACUMULADAS Ene→Mes (§4.3) derivadas del modelo P&G. `null` en las
 * series que dependen del costo o del cálculo tributario no disponible
 * (degradación D-8 — el llamador pinta `—`).
 * @param {ReturnType<typeof buildPnlModel>} pnl
 */
export function buildAcumuladoSeries(pnl) {
  const { ingresos, costo, gastos, margen, impuestos } = pnl
  const nulls = Array.from({ length: 12 }, () => null)
  const ingresosAcc = runningSums(ingresos)
  const costoAcc = costo ? runningSums(costo) : nulls
  const gastosAcc = runningSums(gastos)
  const netoAcc = margen ? ingresosAcc.map((value, m) => value - costoAcc[m] - gastosAcc[m]) : nulls
  // Impuestos por causación (FE-S12/S14): meses de `pnlTaxMonthly`. Sin
  // cálculo tributario ejecutado toda la cola tributaria degrada a `null`.
  const impuestosAcc = impuestos ? runningSums(impuestos) : nulls
  const netoDespuesImpuestosAcc = impuestos
    ? impuestosAcc.map((value, m) => (netoAcc[m] === null ? null : netoAcc[m] - value))
    : nulls
  return { ingresosAcc, costoAcc, gastosAcc, netoAcc, impuestosAcc, netoDespuesImpuestosAcc }
}

/**
 * Modelo reactivo de la Vista Ejecutiva (factory): los computeds del
 * componente original, ahora sobre los builders puros de arriba. Consumo:
 *  - Componente: `createExecutivePivotModel({ scenario: () => props.scenario, store })`.
 *  - Exportación FE-S20 (one-shot): mismos params con valores crudos.
 * Cero HTTP: todo deriva de la caché (ASM-10).
 * @param {{
 *   scenario: object|(() => object),
 *   store: object
 * }} params
 */
export function createExecutivePivotModel({ scenario, store }) {
  const scenarioRef = computed(() => (typeof scenario === 'function' ? scenario() : scenario))

  const lines = computed(() => {
    const s = scenarioRef.value
    return s && Array.isArray(s.budget_lines) ? s.budget_lines : []
  })

  /** Líneas de costo fijo (base de los pivotes): `behavior_type === 'fixed'`. */
  const fixedLines = computed(() => lines.value.filter((line) => line.behavior_type === 'fixed'))

  /** Líneas variables crudas: alimentan la tabla de tasas (§8.2). */
  const variableSourceLines = computed(() =>
    lines.value.filter((line) => line.behavior_type !== 'fixed')
  )

  /** Fuente del pivote estimado: SOLO líneas de GASTO variable. */
  const variableExpenseLines = computed(() =>
    variableSourceLines.value.filter((line) => line.line_type === 'expense')
  )

  const incomePivot = computed(() =>
    buildFixedPivot(fixedLines.value, 'income', store.costCenterLabel)
  )
  const expensePivot = computed(() =>
    buildFixedPivot(fixedLines.value, 'expense', store.costCenterLabel)
  )

  /**
   * ENMIENDA A-02 (spec `frontend.03_21` §11, 2026-10-21) — filas de la base
   * de RECAUDO por CECO para `variable_receivables`: Σ ingresos fijos en su
   * **MES DE PAGO** (`cfMonth`) del escenario en caché, como filas
   * `{ id, months[12] }`.
   *
   * Decisión de diseño (menos invasiva): en la Vista Ejecutiva NO existe el
   * factory de la Vista Flujo (el`entradasPivot` con gross-up vive en
   * `cashFlowPivot.js` y su shape trae buckets fuera-de-año que aquí sobran),
   * así que la base se computa LOCAL con el helper puro compartido
   * `planningFormat.entradasCausacionByCeco` — la MISMA definición de serie
   * (Σ cobros por `cfMonth`, cero duplicación, RF-7.4) y su variante NETA
   * explícita: la base de comisiones NO lleva el gross-up ×1.19 del modo IVA
   * (ese modo en los inflows es SOLO presentación del bloque Entradas del
   * Flujo; D-FE14-7).
   */
  const entradasRows = computed(() =>
    [...entradasCausacionByCeco(lines.value, Number(scenarioRef.value?.budget_year))].map(
      ([id, months]) => ({ id, months })
    )
  )

  /**
   * Pivote estimado — SIEMPRE neto (D-FE14-7). REVISIÓN 5 (spec
   * `frontend.03_21` §5.1): la base es POR CECO — pasan las FILAS del pivote
   * de Ingresos (`incomePivot.value.rows`, `{ id: cecoId, months[12] }`) y el
   * builder deduce `Map<ceco, meses>` internamente (espejo B1c de
   * `backend.02_24` §5.2: `tasa × I_b(m)`).
   * ENMIENDA A-01 (§10): el generador de la base NO es el propio `id_cost_center`
   * de la línea (los CECOs de gasto —Comisiones 210xxx/Despacho 320xxx— están
   * desacoplados de los de facturación 000xxx) sino el CECO resuelto por
   * (id_zone, id_line) — propio CECO primero, sin fallback. Por eso el
   * catálogo `store.costCenters` viaja como 4º parámetro.
   * ENMIENDA A-02 (§11): 5º parámetro `entradasRows` — las líneas
   * `variable_receivables` cambian su base a la serie de ENTRADAS del Flujo
   * (Σ cobros por mes de pago del CECO resuelto, NETA); `variable_sales`
   * conserva la base I por causación. Ambas resoluciones comparten la MISMA
   * regla A-01 (`resolveVariableBaseCeco`).
   * El drill-down del CECO (`CecoDetailView` + series resueltas por
   * comportamiento) reproduce la MISMA regla — byte-cuadre AC-16/AC-FE21-8.
   */
  const variablePivot = computed(() =>
    buildVariableExpensePivot(
      variableExpenseLines.value,
      incomePivot.value.rows,
      store.costCenterLabel,
      store.costCenters,
      entradasRows.value
    )
  )

  /** Guard §5.4: sin CECOs de ingreso no hay nada que estimar ni P&G. */
  const hasIncomeRows = computed(() => incomePivot.value.rows.length > 0)

  /** Catálogo cacheado (§3.2), re-filtrado defensivamente. */
  const activeCostRates = computed(() =>
    (Array.isArray(store.lineCostRates) ? store.lineCostRates : []).filter(
      (rate) => rate && rate.is_active === true
    )
  )

  /** Pools por mes (D-2/D-3) sobre el `budget_year` del escenario. */
  const monthlyRates = computed(() =>
    buildMonthlyCogsPools(activeCostRates.value, Number(scenarioRef.value?.budget_year))
  )

  /** Degradación §5.1/§5.2 (D-8): 'error' | 'empty' | null. */
  const costDegradation = computed(() => {
    if (store.lineCostRatesError) return 'error'
    if (!store.lineCostRatesLoaded) return null
    const covered = monthlyRates.value.some(
      (pool) => pool.globalPct !== null || pool.byLine.size > 0
    )
    return covered ? null : 'empty'
  })

  const costPivot = computed(() => {
    if (costDegradation.value || !hasIncomeRows.value) return null
    return buildCostSalesPivot(incomePivot.value.rows, monthlyRates.value, (idCostCenter) =>
      lineIdForCostCenter(store.costCenters, idCostCenter)
    )
  })

  /**
   * Tax expense leído de la MISMA calculación tributaria cacheada (el P&G
   * solo coloca el resultado del servidor; nunca recalcula tasas).
   */
  const taxPnl = computed(() => {
    const tax = store.tax
    if (
      !taxCalculationAvailable(tax.summary) ||
      tax.stale ||
      tax.budgetId !== scenarioRef.value?.id_budget
    ) {
      return null
    }
    return pnlTaxMonthly(tax.summary, scenarioRef.value?.budget_year)
  })

  const pnl = computed(() =>
    buildPnlModel({
      ingresos: incomePivot.value.columnTotals,
      costo: costPivot.value ? costPivot.value.columnTotals : null,
      fijos: expensePivot.value.columnTotals,
      variables: variablePivot.value ? variablePivot.value.columnTotals : null,
      impuestos: taxPnl.value?.months ?? null
    })
  )

  return {
    lines,
    fixedLines,
    variableSourceLines,
    variableExpenseLines,
    incomePivot,
    expensePivot,
    entradasRows,
    variablePivot,
    hasIncomeRows,
    monthlyRates,
    costDegradation,
    costPivot,
    taxPnl,
    pnl
  }
}
